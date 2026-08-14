/**
 * A single poker table: seats, the hand loop, clocks, and the per-viewer
 * redaction that turns engine state into something safe to send.
 *
 * The engine knows poker; this file knows *time* — whose clock is running,
 * when the next hand starts, when a dealer's choice prompt expires.
 */

import { HandEngine, resolveStakes, type EnginePlayer } from './engine.ts';
import { chooseBotAction, chooseBotDiscards } from './bots.ts';
import { GAMES, MIXES, getGame, type GameSpec } from '../../shared/src/games.ts';
import type { Card } from '../../shared/src/cards.ts';
import type {
  ActionType,
  GameEvent,
  PotView,
  RoomConfig,
  SeatView,
  TableState,
  TableView,
  YouView,
} from '../../shared/src/protocol.ts';

export interface Seat {
  seat: number;
  userId: string;
  name: string;
  avatar: string | null;
  avatarId: string;
  stack: number;
  sittingOut: boolean;
  disconnected: boolean;
  isBot: boolean;
  /** Set while the player is out of chips and has not rebought. */
  busted: boolean;
}

const SHOWDOWN_PAUSE_MS = 4500;
const QUICK_PAUSE_MS = 1800;
const CHOICE_TIME_MS = 25_000;
const BOT_MIN_MS = 700;
const BOT_MAX_MS = 1900;

export class Table {
  readonly id: string;
  index: number;
  config: RoomConfig;

  seats: (Seat | null)[];
  buttonSeat: number | null = null;
  handId = 0;
  engine: HandEngine | null = null;
  state: TableState = 'waiting';
  message = 'Waiting for players';

  /** Current game — may differ from config while on dealer's choice. */
  gameId: string;
  choosingSeat: number | null = null;
  private chosenGameId: string | null = null;
  private handPrepared = false;
  private mixIndex = 0;
  private handsThisRotation = 0;

  private actionTimer: ReturnType<typeof setTimeout> | null = null;
  private nextHandTimer: ReturnType<typeof setTimeout> | null = null;
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private pendingEvents: GameEvent[] = [];

  /** Called whenever anything observable changed. */
  onUpdate: (table: Table) => void = () => {};

  constructor(id: string, index: number, config: RoomConfig) {
    this.id = id;
    this.index = index;
    this.config = config;
    this.seats = new Array(config.seatCap).fill(null);
    this.gameId = config.mode === 'mix' ? this.mixGames()[0] : config.gameId;
  }

  /* -------------------------------------------------------------- */
  /* seating                                                         */
  /* -------------------------------------------------------------- */

  get spec(): GameSpec {
    return getGame(this.gameId);
  }

  seatCount(): number {
    return this.seats.filter(Boolean).length;
  }

  occupied(): Seat[] {
    return this.seats.filter((s): s is Seat => s !== null);
  }

  findSeatOf(userId: string): Seat | null {
    return this.occupied().find((s) => s.userId === userId) ?? null;
  }

  firstOpenSeat(): number | null {
    for (let i = 0; i < this.seats.length; i++) if (!this.seats[i]) return i;
    return null;
  }

  /** Seats that will be dealt in on the next hand. */
  private readySeats(): Seat[] {
    return this.occupied().filter((s) => !s.sittingOut && s.stack > 0);
  }

  sit(seat: number, player: Omit<Seat, 'seat' | 'busted'>): string | null {
    if (seat < 0 || seat >= this.seats.length) return 'no such seat';
    if (this.seats[seat]) return 'seat taken';
    if (this.findSeatOf(player.userId)) return 'you are already seated';
    this.seats[seat] = { ...player, seat, busted: false };
    this.scheduleNextHand(QUICK_PAUSE_MS);
    this.onUpdate(this);
    return null;
  }

  stand(userId: string): void {
    const s = this.findSeatOf(userId);
    if (!s) return;
    if (this.engine && !this.engine.finished) {
      this.engine.forfeit(s.seat);
      this.flush();
    }
    this.seats[s.seat] = null;
    this.onUpdate(this);
  }

  setSittingOut(userId: string, on: boolean): void {
    const s = this.findSeatOf(userId);
    if (!s) return;
    s.sittingOut = on;
    if (on && this.engine && !this.engine.finished) this.engine.forfeit(s.seat);
    this.flush();
    if (!on) this.scheduleNextHand(QUICK_PAUSE_MS);
    this.onUpdate(this);
  }

  setConnected(userId: string, connected: boolean): void {
    const s = this.findSeatOf(userId);
    if (!s) return;
    s.disconnected = !connected;
    this.onUpdate(this);
  }

  rebuy(userId: string, amount: number): string | null {
    if (!this.config.allowRebuy) return 'rebuys are off in this room';
    const s = this.findSeatOf(userId);
    if (!s) return 'you are not seated';
    const inHand = this.engine && !this.engine.finished && this.engine.player(s.seat)?.inHand;
    if (inHand) return 'you can rebuy between hands';
    const amt = Math.max(1, Math.floor(amount));
    s.stack += amt;
    s.busted = false;
    this.scheduleNextHand(QUICK_PAUSE_MS);
    this.onUpdate(this);
    return null;
  }

  /* -------------------------------------------------------------- */
  /* hand loop                                                       */
  /* -------------------------------------------------------------- */

  private mixGames(): string[] {
    const mix = MIXES.find((m) => m.id === this.config.mixId) ?? MIXES[0];
    return mix.games;
  }

  applyConfig(config: RoomConfig): void {
    const modeChanged = config.mode !== this.config.mode || config.mixId !== this.config.mixId;
    this.config = config;
    if (this.seats.length !== config.seatCap) {
      const next: (Seat | null)[] = new Array(config.seatCap).fill(null);
      for (const s of this.occupied()) if (s.seat < config.seatCap) next[s.seat] = s;
      this.seats = next;
    }
    if (modeChanged || config.mode === 'fixed') {
      this.mixIndex = 0;
      this.handsThisRotation = 0;
      if (config.mode === 'fixed') this.gameId = config.gameId;
      if (config.mode === 'mix') this.gameId = this.mixGames()[0];
    }
    this.scheduleNextHand(QUICK_PAUSE_MS);
    this.onUpdate(this);
  }

  /** Kick the loop. Safe to call at any time. */
  maybeStartHand(): void {
    if (this.engine && !this.engine.finished) return;
    if (this.nextHandTimer) return;

    const ready = this.readySeats();
    if (ready.length < 2) {
      this.state = 'waiting';
      this.choosingSeat = null;
      this.message =
        this.occupied().length < 2 ? 'Waiting for players to sit down' : 'Waiting for players to be ready';
      this.onUpdate(this);
      return;
    }

    if (!this.handPrepared) {
      this.advanceButton(ready);
      this.pickRotationGame(ready.length);
      this.handPrepared = true;
    }

    if (this.config.mode === 'dealers-choice' && this.chosenGameId === null) {
      this.promptChoice();
      return;
    }

    this.deal();
  }

  private advanceButton(ready: Seat[]): void {
    const seats = ready.map((s) => s.seat).sort((a, b) => a - b);
    if (this.buttonSeat === null) {
      this.buttonSeat = seats[0];
      return;
    }
    const next = seats.find((s) => s > this.buttonSeat!);
    this.buttonSeat = next !== undefined ? next : seats[0];
  }

  private pickRotationGame(playerCount: number): void {
    if (this.config.mode === 'fixed') {
      this.gameId = this.config.gameId;
      return;
    }
    if (this.config.mode === 'mix') {
      const games = this.mixGames();
      if (this.handsThisRotation >= Math.max(playerCount, 4)) {
        this.handsThisRotation = 0;
        this.mixIndex = (this.mixIndex + 1) % games.length;
      }
      this.gameId = games[this.mixIndex];
      this.handsThisRotation++;
    }
  }

  private promptChoice(): void {
    this.state = 'choosing';
    this.choosingSeat = this.buttonSeat;
    const chooser = this.buttonSeat === null ? null : this.seats[this.buttonSeat];
    this.message = chooser ? `${chooser.name} is choosing the game` : 'Choosing the game';
    this.deadline = Date.now() + CHOICE_TIME_MS;
    this.clearActionTimer();
    this.actionTimer = setTimeout(() => {
      this.actionTimer = null;
      // Nobody picked — stick with whatever we played last.
      this.chosenGameId = this.gameId;
      this.maybeStartHand();
    }, CHOICE_TIME_MS);

    if (chooser?.isBot) {
      const pool = GAMES.filter((g) => g.popular);
      const pickId = pool[Math.floor(Math.random() * pool.length)].id;
      this.botTimer = setTimeout(() => this.chooseGame(chooser.userId, pickId), 1200);
    }
    this.onUpdate(this);
  }

  chooseGame(userId: string, gameId: string): string | null {
    if (this.state !== 'choosing') return 'not choosing right now';
    const chooser = this.choosingSeat === null ? null : this.seats[this.choosingSeat];
    if (!chooser || chooser.userId !== userId) return 'it is not your choice';
    if (!GAMES.some((g) => g.id === gameId)) return 'unknown game';
    const spec = getGame(gameId);
    if (this.readySeats().length > spec.maxSeats) {
      return `${spec.name} seats at most ${spec.maxSeats} players`;
    }
    this.clearActionTimer();
    this.chosenGameId = gameId;
    this.gameId = gameId;
    this.choosingSeat = null;
    this.maybeStartHand();
    return null;
  }

  private deal(): void {
    const ready = this.readySeats();
    const spec = this.spec;
    // A game that seats fewer players than are ready cannot be dealt; fall
    // back rather than silently dropping someone from the hand.
    if (ready.length > spec.maxSeats) {
      this.gameId = 'nlhe';
    }

    this.handId++;
    this.handPrepared = false;
    this.chosenGameId = null;
    this.state = 'running';
    this.choosingSeat = null;

    this.engine = new HandEngine({
      spec: this.spec,
      stakes: this.config.stakes,
      seats: ready.map((s) => ({ seat: s.seat, stack: s.stack, sittingOut: false })),
      buttonSeat: this.buttonSeat,
      handId: this.handId,
    });
    this.engine.start();
    this.flush();
  }

  /**
   * Push engine progress outward: sync stacks, drain animation events, arm
   * the right timer, and notify listeners.
   */
  private flush(): void {
    const e = this.engine;
    if (!e) return;
    for (const p of e.players) {
      const s = this.seats[p.seat];
      if (s) s.stack = p.stack;
    }
    this.pendingEvents.push(...e.drainEvents());

    this.clearActionTimer();
    if (e.finished) {
      this.state = 'showdown';
      this.message = e.summary || 'Hand complete';
      for (const s of this.occupied()) if (s.stack <= 0) s.busted = true;
      this.deadline = null;
      this.scheduleNextHand(SHOWDOWN_PAUSE_MS);
    } else if (e.waiting) {
      this.state = 'running';
      this.message = this.describeWaiting();
      this.deadline = Date.now() + this.config.actionTimeSec * 1000;
      const at = this.deadline;
      this.actionTimer = setTimeout(() => {
        this.actionTimer = null;
        if (this.engine && !this.engine.finished && this.deadline === at) {
          this.engine.timeout();
          this.flush();
        }
      }, this.config.actionTimeSec * 1000);
      this.armBots();
    }
    this.onUpdate(this);
  }

  private describeWaiting(): string {
    const e = this.engine;
    if (!e || !e.waiting) return '';
    if (e.waiting.kind === 'act') {
      const s = this.seats[e.waiting.seat];
      return `${e.streetName} — action on ${s?.name ?? `seat ${e.waiting.seat}`}`;
    }
    if (e.waiting.kind === 'draw') {
      const s = this.seats[e.waiting.seat];
      return `${e.streetName} — ${s?.name ?? 'player'} is drawing`;
    }
    return `${e.streetName} — everyone discards`;
  }

  private armBots(): void {
    const e = this.engine;
    if (!e || !e.waiting) return;
    const seats = e.waiting.kind === 'discard' ? e.waiting.seats : [e.waiting.seat];
    const botSeats = seats.filter((n) => this.seats[n]?.isBot);
    if (botSeats.length === 0) return;
    const delay = BOT_MIN_MS + Math.random() * (BOT_MAX_MS - BOT_MIN_MS);
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.runBots();
    }, delay);
  }

  private runBots(): void {
    const e = this.engine;
    if (!e || e.finished || !e.waiting) return;
    if (e.waiting.kind === 'act') {
      const seat = e.waiting.seat;
      if (!this.seats[seat]?.isBot) return;
      const legal = e.legalFor(seat);
      const p = e.player(seat);
      if (!legal || !p) return;
      const move = chooseBotAction(e, p, legal);
      e.act(seat, move.action, move.amount);
      this.flush();
    } else if (e.waiting.kind === 'draw') {
      const seat = e.waiting.seat;
      if (!this.seats[seat]?.isBot) return;
      const p = e.player(seat);
      if (!p) return;
      e.discard(seat, chooseBotDiscards(e, p, e.street.maxDiscards ?? p.hole.length));
      this.flush();
    } else {
      const count = e.waiting.count;
      for (const seat of e.waiting.seats.slice()) {
        if (!this.seats[seat]?.isBot) continue;
        const p = e.player(seat);
        if (!p) continue;
        e.discard(seat, chooseBotDiscards(e, p, count, count));
        if (!e.waiting || e.waiting.kind !== 'discard') break;
      }
      this.flush();
    }
  }

  private scheduleNextHand(delay: number): void {
    if (this.nextHandTimer) return;
    if (this.engine && !this.engine.finished) return;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      if (!this.config.autoDeal && this.handId > 0) {
        this.state = 'waiting';
        this.message = 'Press Deal to start the next hand';
        this.onUpdate(this);
        return;
      }
      this.maybeStartHand();
    }, delay);
  }

  /** Host pressed Deal. */
  forceStart(): void {
    if (this.nextHandTimer) {
      clearTimeout(this.nextHandTimer);
      this.nextHandTimer = null;
    }
    this.maybeStartHand();
  }

  private clearActionTimer(): void {
    if (this.actionTimer) {
      clearTimeout(this.actionTimer);
      this.actionTimer = null;
    }
    if (this.botTimer) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  dispose(): void {
    this.clearActionTimer();
    if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
  }

  /* -------------------------------------------------------------- */
  /* player input                                                    */
  /* -------------------------------------------------------------- */

  act(userId: string, action: ActionType, amount?: number): string | null {
    const s = this.findSeatOf(userId);
    if (!s) return 'you are not seated';
    const e = this.engine;
    if (!e || e.finished) return 'no hand in progress';
    const err = e.act(s.seat, action, amount);
    if (err) return err;
    this.flush();
    return null;
  }

  discard(userId: string, cards: Card[]): string | null {
    const s = this.findSeatOf(userId);
    if (!s) return 'you are not seated';
    const e = this.engine;
    if (!e || e.finished) return 'no hand in progress';
    const err = e.discard(s.seat, cards);
    if (err) return err;
    this.flush();
    return null;
  }

  /** Drain queued animation events for broadcast. */
  takeEvents(): GameEvent[] {
    const out = this.pendingEvents;
    this.pendingEvents = [];
    return out;
  }

  /* -------------------------------------------------------------- */
  /* views                                                           */
  /* -------------------------------------------------------------- */

  private cardsFor(p: EnginePlayer, viewerSeat: number | null, revealAll: boolean): (Card | null)[] {
    if (p.folded) return [];
    const mine = viewerSeat === p.seat;
    return p.hole.map((c, i) => (mine || p.faceUp[i] || revealAll ? c : null));
  }

  view(viewerId: string): TableView {
    const e = this.engine;
    const spec = this.spec;
    const stakes = resolveStakes(spec, this.config.stakes);
    const viewer = this.findSeatOf(viewerId);
    const viewerSeat = viewer?.seat ?? null;
    // Cards only come out of the server once the hand is genuinely over and
    // more than one player reached showdown.
    const showdownReveal = !!e && e.finished && this.state === 'showdown' && e.live().length > 1;

    const seats: SeatView[] = [];
    for (const s of this.occupied()) {
      const p = e?.player(s.seat);
      const inHand = !!p && p.inHand;
      seats.push({
        seat: s.seat,
        userId: s.userId,
        name: s.name,
        avatar: s.avatar,
        avatarId: s.avatarId,
        stack: s.stack,
        bet: p?.bet ?? 0,
        committed: p?.committed ?? 0,
        inHand,
        folded: p?.folded ?? false,
        allIn: p?.allIn ?? false,
        sittingOut: s.sittingOut,
        disconnected: s.disconnected,
        isBot: s.isBot,
        cards: p ? this.cardsFor(p, viewerSeat, showdownReveal) : [],
        lastDrawCount: p?.lastDrawCount ?? null,
        lastAction: p?.lastAction ?? (s.sittingOut ? 'Sitting out' : s.busted ? 'Out of chips' : null),
        handDesc: showdownReveal ? p?.hiDesc ?? null : null,
        lowDesc: showdownReveal ? p?.loDesc ?? null : null,
        bestCards: showdownReveal ? p?.hi?.cards ?? null : null,
        won: p?.won ?? 0,
      });
    }

    const pots: PotView[] = e
      ? e.computePots().map((p) => ({ amount: p.amount, eligible: p.eligible, label: p.label }))
      : [];

    return {
      id: this.id,
      index: this.index,
      gameId: spec.id,
      gameName: spec.name,
      gameShort: spec.short,
      limit: spec.limit,
      rankingNote: spec.rankingNote ?? null,
      stakes,
      seatCap: this.seats.length,
      handId: this.handId,
      state: this.state,
      street: e ? e.streetId : 'idle',
      streetName: e ? e.streetName : '',
      board: e ? e.board.slice() : [],
      pots,
      totalPot: e ? e.totalPot() : 0,
      buttonSeat: this.buttonSeat,
      toActSeat: e && e.waiting?.kind === 'act' ? e.waiting.seat : null,
      actionDeadline: this.deadline,
      seats,
      message: this.message,
      awaitingDiscard:
        e && e.waiting?.kind === 'discard'
          ? e.waiting.seats.slice()
          : e && e.waiting?.kind === 'draw'
            ? [e.waiting.seat]
            : [],
      choosingSeat: this.choosingSeat,
    };
  }

  youView(viewerId: string): YouView {
    const s = this.findSeatOf(viewerId);
    const e = this.engine;
    const p = s && e ? e.player(s.seat) : undefined;
    let drawPrompt: YouView['drawPrompt'] = null;
    if (s && e && e.waiting) {
      if (e.waiting.kind === 'draw' && e.waiting.seat === s.seat) {
        drawPrompt = { maxDiscards: e.street.maxDiscards ?? (p?.hole.length ?? 0), exact: null };
      } else if (e.waiting.kind === 'discard' && e.waiting.seats.includes(s.seat)) {
        drawPrompt = { maxDiscards: e.waiting.count, exact: e.waiting.count };
      }
    }
    return {
      userId: viewerId,
      seat: s?.seat ?? null,
      cards: p && !p.folded ? p.hole.slice() : [],
      legal: s && e ? e.legalFor(s.seat) : null,
      drawPrompt,
      choicePrompt:
        this.state === 'choosing' && s && this.choosingSeat === s.seat
          ? { options: GAMES.filter((g) => this.readySeats().length <= g.maxSeats).map((g) => g.id) }
          : null,
    };
  }
}
