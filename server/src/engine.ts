/**
 * The authoritative hand engine.
 *
 * One instance runs exactly one hand of exactly one game. It is a synchronous
 * state machine: you push input in (`act`, `discard`, `timeout`) and it runs
 * forward until it needs the next decision or the hand is over. Timers,
 * sockets and bots all live outside — this file only knows poker.
 *
 * Nothing here reads the clock or the network, which makes the whole ruleset
 * unit-testable by feeding it a script of actions.
 */

import { Deck, type Card, rankOf, suitOf } from '../../shared/src/cards.ts';
import {
  bestHigh,
  bestHighExact,
  bestA5Low,
  best27Low,
  bestBadugi,
  bestQualifiedLow,
  bestQualifiedLowExact,
  describeHigh,
  describeLow,
  describeBadugi,
  type HandValue,
} from '../../shared/src/evaluator.ts';
import type { GameSpec, StreetSpec } from '../../shared/src/games.ts';
import type { ActionType, GameEvent, LegalActions, Stakes } from '../../shared/src/protocol.ts';

export interface SeatInput {
  seat: number;
  stack: number;
  sittingOut: boolean;
}

export interface EnginePlayer {
  seat: number;
  stack: number;
  sittingOut: boolean;
  hole: Card[];
  /** Parallel to `hole`: true when everyone can see the card (stud). */
  faceUp: boolean[];
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** Chips in front of the seat on the current street. */
  bet: number;
  /** Chips put in across the whole hand. */
  committed: number;
  hasActed: boolean;
  /** Facing a short all-in they cannot legally re-raise. */
  capped: boolean;
  lastAction: string | null;
  lastDrawCount: number | null;
  won: number;
  hi: HandValue | null;
  lo: HandValue | null;
  hiDesc: string | null;
  loDesc: string | null;
}

export interface PotSlice {
  amount: number;
  eligible: number[];
  label: string;
}

export type Waiting =
  | null
  | { kind: 'act'; seat: number }
  | { kind: 'draw'; seat: number }
  | { kind: 'discard'; seats: number[]; count: number };

type Stage = 'deal' | 'draw' | 'bet' | 'postdiscard' | 'endstreet' | 'showdown' | 'done';

/**
 * Fill in the derived numbers a game needs but a room does not configure:
 * fixed-limit bet sizes and the stud ante / bring-in.
 */
export function resolveStakes(spec: GameSpec, stakes: Stakes): Stakes {
  const bb = stakes.bigBlind;
  const smallBet = stakes.smallBet > 0 ? stakes.smallBet : bb;
  const bigBet = stakes.bigBet > 0 ? stakes.bigBet : bb * 2;
  if (spec.forced === 'antes-bringin') {
    return {
      ...stakes,
      smallBet,
      bigBet,
      ante: stakes.ante > 0 ? stakes.ante : Math.max(1, Math.floor(smallBet / 5)),
      bringIn: stakes.bringIn > 0 ? stakes.bringIn : Math.max(1, Math.floor(smallBet / 2)),
    };
  }
  return { ...stakes, smallBet, bigBet };
}

export class HandEngine {
  readonly spec: GameSpec;
  readonly stakes: Stakes;
  readonly players: EnginePlayer[];
  readonly buttonSeat: number | null;
  readonly handId: number;

  board: Card[] = [];
  events: GameEvent[] = [];
  waiting: Waiting = null;
  finished = false;
  /** Set once the hand is fully paid out. */
  summary = '';

  private deck: Deck;
  private discards: Card[] = [];
  private streetIdx = 0;
  private stage: Stage = 'deal';
  private bettingStarted = false;
  private drawStarted = false;
  private drawQueue: number[] = [];
  private pineStarted = false;
  private pineAwaiting: number[] = [];

  /** Highest total bet on the current street. */
  private currentBet = 0;
  private lastRaiseSize = 0;
  private raiseCount = 0;
  private actionCursor = 0;
  private lastAggressor: number | null = null;

  constructor(opts: {
    spec: GameSpec;
    stakes: Stakes;
    seats: SeatInput[];
    buttonSeat: number | null;
    handId: number;
  }) {
    this.spec = opts.spec;
    this.stakes = resolveStakes(opts.spec, opts.stakes);
    this.handId = opts.handId;
    this.buttonSeat = opts.buttonSeat;
    this.deck = new Deck(opts.spec.shortDeck);
    this.players = opts.seats
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((s) => ({
        seat: s.seat,
        stack: s.stack,
        sittingOut: s.sittingOut,
        hole: [],
        faceUp: [],
        inHand: !s.sittingOut && s.stack > 0,
        folded: false,
        allIn: false,
        bet: 0,
        committed: 0,
        hasActed: false,
        capped: false,
        lastAction: null,
        lastDrawCount: null,
        won: 0,
        hi: null,
        lo: null,
        hiDesc: null,
        loDesc: null,
      }));
  }

  /* -------------------------------------------------------------- */
  /* accessors                                                       */
  /* -------------------------------------------------------------- */

  get street(): StreetSpec {
    return this.spec.streets[Math.min(this.streetIdx, this.spec.streets.length - 1)];
  }

  get streetId(): string {
    return this.finished ? 'showdown' : this.street.id;
  }

  get streetName(): string {
    return this.finished ? 'Showdown' : this.street.name;
  }

  player(seat: number): EnginePlayer | undefined {
    return this.players.find((p) => p.seat === seat);
  }

  /** Players still contesting the pot. */
  live(): EnginePlayer[] {
    return this.players.filter((p) => p.inHand && !p.folded);
  }

  private dealt(): EnginePlayer[] {
    return this.players.filter((p) => p.inHand);
  }

  totalPot(): number {
    return this.players.reduce((n, p) => n + p.committed, 0);
  }

  /** Seat order starting just left of `from` (exclusive), wrapping once. */
  private orderFrom(from: number | null, includeStart = false): EnginePlayer[] {
    const list = this.players;
    if (list.length === 0) return [];
    let startIdx = 0;
    if (from !== null) {
      const i = list.findIndex((p) => p.seat === from);
      startIdx = i < 0 ? 0 : includeStart ? i : i + 1;
    }
    const out: EnginePlayer[] = [];
    for (let k = 0; k < list.length; k++) out.push(list[(startIdx + k) % list.length]);
    return out;
  }

  /* -------------------------------------------------------------- */
  /* lifecycle                                                       */
  /* -------------------------------------------------------------- */

  start(): void {
    this.emit({
      t: 'hand-start',
      handId: this.handId,
      gameId: this.spec.id,
      buttonSeat: this.buttonSeat,
    });
    this.postAntes();
    if (this.spec.forced === 'blinds') this.postBlinds();
    this.resetStreetBetting(true);
    this.pump();
  }

  private postAntes(): void {
    if (this.stakes.ante <= 0) return;
    for (const p of this.dealt()) {
      const amt = Math.min(this.stakes.ante, p.stack);
      if (amt <= 0) continue;
      this.commit(p, amt);
      this.emit({ t: 'post', seat: p.seat, amount: amt, kind: 'ante' });
    }
    // Antes belong to the pot, not to the street's bet line.
    for (const p of this.players) p.bet = 0;
  }

  private postBlinds(): void {
    const dealt = this.dealt();
    if (dealt.length < 2) return;
    const heads = dealt.length === 2;
    const ring = this.orderFrom(this.buttonSeat).filter((p) => p.inHand);
    const sbPlayer = heads ? this.player(this.buttonSeat!) ?? ring[0] : ring[0];
    const bbPlayer = heads ? ring[0] : ring[1];
    if (!sbPlayer || !bbPlayer || sbPlayer === bbPlayer) return;

    const sb = Math.min(this.stakes.smallBlind, sbPlayer.stack);
    this.commit(sbPlayer, sb);
    this.emit({ t: 'post', seat: sbPlayer.seat, amount: sb, kind: 'sb' });

    const bb = Math.min(this.stakes.bigBlind, bbPlayer.stack);
    this.commit(bbPlayer, bb);
    this.emit({ t: 'post', seat: bbPlayer.seat, amount: bb, kind: 'bb' });

    // Modern live tournament structures commonly introduce a big-blind ante
    // in later levels. It is a separate forced contribution, not a raise.
    if (this.stakes.bigBlindAnte > 0) {
      const ante = Math.min(this.stakes.bigBlindAnte, bbPlayer.stack);
      if (ante > 0) {
        this.commit(bbPlayer, ante);
        this.emit({ t: 'post', seat: bbPlayer.seat, amount: ante, kind: 'ante' });
        bbPlayer.bet -= ante;
      }
    }

    // A blind that went all-in for less does not lower the price; the
    // uncalled remainder comes back out of the side pot at showdown.
    this.currentBet = Math.max(this.stakes.bigBlind, sb, bb);
    this.lastRaiseSize = this.stakes.bigBlind;
  }

  private commit(p: EnginePlayer, amount: number): number {
    const amt = Math.max(0, Math.min(amount, p.stack));
    p.stack -= amt;
    p.bet += amt;
    p.committed += amt;
    if (p.stack === 0) p.allIn = true;
    return amt;
  }

  private emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  /** Drain queued animation events. */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /* -------------------------------------------------------------- */
  /* the pump                                                        */
  /* -------------------------------------------------------------- */

  private pump(): void {
    // Bounded to keep any future rule bug from spinning the server.
    for (let guard = 0; guard < 2000; guard++) {
      if (this.waiting || this.finished) return;
      // Everyone folded out: nothing left to deal or bet, just pay the winner.
      if (this.stage !== 'showdown' && this.stage !== 'done' && this.live().length <= 1) {
        this.stage = 'showdown';
      }
      switch (this.stage) {
        case 'deal':
          this.dealStreet();
          this.stage = this.street.draw ? 'draw' : 'bet';
          break;
        case 'draw':
          if (!this.pumpDraw()) return;
          this.stage = 'bet';
          break;
        case 'bet':
          if (!this.pumpBetting()) return;
          this.stage = 'postdiscard';
          break;
        case 'postdiscard':
          if (!this.pumpPineapple()) return;
          this.stage = 'endstreet';
          break;
        case 'endstreet':
          this.endStreet();
          break;
        case 'showdown':
          this.doShowdown();
          this.stage = 'done';
          break;
        case 'done':
          return;
      }
    }
    throw new Error('hand engine failed to make progress');
  }

  /* -------------------------------------------------------------- */
  /* dealing                                                         */
  /* -------------------------------------------------------------- */

  private dealStreet(): void {
    const st = this.street;
    const live = this.live();

    if (st.burn && (st.dealBoard ?? 0) > 0) {
      this.deck.burn();
      this.emit({ t: 'burn' });
    }

    const down = st.dealToEach ?? 0;
    const up = st.dealUpToEach ?? 0;
    if (down > 0 || up > 0) {
      const ring = this.orderFrom(this.buttonSeat).filter((p) => p.inHand && !p.folded);
      const order: { seat: number; faceUp: boolean }[] = [];
      // One card at a time around the table, exactly like a live deal.
      for (let i = 0; i < down; i++) {
        for (const p of ring) {
          this.ensureCards(1);
          p.hole.push(this.deck.draw());
          p.faceUp.push(false);
          order.push({ seat: p.seat, faceUp: false });
        }
      }
      for (let i = 0; i < up; i++) {
        for (const p of ring) {
          this.ensureCards(1);
          const c = this.deck.draw();
          p.hole.push(c);
          p.faceUp.push(true);
          order.push({ seat: p.seat, faceUp: true });
        }
      }
      // The client animates from `order` and reads the real values, where it
      // is entitled to them, out of the table view that follows.
      this.emit({ t: 'deal-hole', order });
    }

    if ((st.dealBoard ?? 0) > 0) {
      const cards = this.deck.drawMany(st.dealBoard!);
      this.board.push(...cards);
      this.emit({ t: 'deal-board', cards, street: st.id });
    }

    // Third street in stud: the bring-in is a forced bet, posted on the deal.
    if (this.streetIdx === 0 && this.spec.forced === 'antes-bringin' && live.length > 1) {
      this.postBringIn();
    }
  }

  private ensureCards(n: number): void {
    if (this.deck.remaining < n && this.discards.length > 0) {
      this.deck.reshuffleFrom(this.discards);
      this.discards = [];
    }
  }

  private postBringIn(): void {
    const contenders = this.live().filter((p) => p.stack > 0);
    if (contenders.length === 0) return;
    // High games: lowest up-card brings it in. Razz: highest.
    const lowGame = this.spec.hi !== 'high';
    let chosen = contenders[0];
    for (const p of contenders) {
      const a = this.upCardKey(p);
      const b = this.upCardKey(chosen);
      if (lowGame ? a > b : a < b) chosen = p;
    }
    const amt = Math.min(this.stakes.bringIn, chosen.stack);
    this.commit(chosen, amt);
    chosen.hasActed = true;
    chosen.lastAction = 'bring-in';
    this.currentBet = amt;
    this.lastRaiseSize = this.stakes.smallBet;
    this.actionCursor = chosen.seat;
    this.emit({ t: 'post', seat: chosen.seat, amount: amt, kind: 'bringin' });
  }

  /** Sort key for a single exposed card, suit breaking ties (clubs lowest). */
  private upCardKey(p: EnginePlayer): number {
    const idx = p.faceUp.findIndex((f) => f);
    if (idx < 0) return -1;
    const c = p.hole[idx];
    return rankOf(c) * 4 + suitOf(c);
  }

  /** Comparable strength of a player's exposed cards, for stud act order. */
  private exposedStrength(p: EnginePlayer): number {
    const up = p.hole.filter((_, i) => p.faceUp[i]);
    if (up.length === 0) return -1;
    const lowGame = this.spec.hi !== 'high';
    const counts = new Map<number, number>();
    for (const c of up) {
      const r = lowGame ? (rankOf(c) === 12 ? 0 : rankOf(c) + 1) : rankOf(c);
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const groups = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || (lowGame ? a[0] - b[0] : b[0] - a[0]),
    );
    let key = 0;
    for (const [rank, count] of groups) key = key * 256 + count * 16 + rank;
    // Pad so hands with fewer groups still compare sensibly.
    for (let i = groups.length; i < 4; i++) key = key * 256;
    return key;
  }

  /* -------------------------------------------------------------- */
  /* betting                                                         */
  /* -------------------------------------------------------------- */

  private resetStreetBetting(first: boolean): void {
    if (!first) {
      this.currentBet = 0;
      this.lastRaiseSize = this.betSize();
    }
    this.raiseCount = 0;
    this.bettingStarted = false;
    this.drawStarted = false;
    this.pineStarted = false;
    this.lastAggressor = null;
    for (const p of this.players) {
      p.capped = false;
      if (!first) {
        p.hasActed = false;
        p.lastAction = null;
      }
    }
  }

  /** The wager unit for the current street in fixed limit. */
  private betSize(): number {
    if (this.spec.limit !== 'fl') return this.stakes.bigBlind;
    return this.street.bigBet ? this.stakes.bigBet : this.stakes.smallBet;
  }

  private firstToAct(): number {
    const live = this.live();
    if (live.length === 0) return this.players[0]?.seat ?? 0;

    if (this.spec.forced === 'antes-bringin') {
      if (this.streetIdx === 0) {
        // Just left of the bring-in.
        const after = this.orderFrom(this.actionCursor).filter((p) => p.inHand && !p.folded);
        return (after[0] ?? live[0]).seat;
      }
      let best = live[0];
      for (const p of live) if (this.exposedStrength(p) > this.exposedStrength(best)) best = p;
      return best.seat;
    }

    const ring = this.orderFrom(this.buttonSeat).filter((p) => p.inHand && !p.folded);
    if (ring.length === 0) return live[0].seat;
    const heads = this.dealt().length === 2;
    if (this.streetIdx === 0) {
      // Heads-up the button is the small blind and acts first before the flop.
      if (heads) {
        const btn = this.buttonSeat === null ? undefined : this.player(this.buttonSeat);
        if (btn && btn.inHand && !btn.folded) return btn.seat;
        return ring[0].seat;
      }
      return (ring[2] ?? ring[0]).seat; // left of the big blind
    }
    return ring[0].seat;
  }

  private needsAction(p: EnginePlayer): boolean {
    if (!p.inHand || p.folded || p.allIn || p.stack <= 0) return false;
    return !p.hasActed || p.bet < this.currentBet;
  }

  private pumpBetting(): boolean {
    const st = this.street;
    if (!st.betting) return true;

    if (!this.bettingStarted) {
      this.bettingStarted = true;
      this.actionCursor = this.firstToAct();
      const p = this.player(this.actionCursor);
      if (p && !this.needsAction(p)) {
        const next = this.findNextActor(this.actionCursor, true);
        if (next === null) return true;
        this.actionCursor = next;
      }
    } else {
      const next = this.findNextActor(this.actionCursor, false);
      if (next === null) return true;
      this.actionCursor = next;
    }

    const target = this.player(this.actionCursor);
    if (!target || !this.needsAction(target)) return true;
    this.waiting = { kind: 'act', seat: this.actionCursor };
    return false;
  }

  private findNextActor(from: number, includeStart: boolean): number | null {
    const ring = this.orderFrom(from, includeStart);
    for (const p of ring) if (this.needsAction(p)) return p.seat;
    return null;
  }

  legalFor(seat: number): LegalActions | null {
    if (!this.waiting || this.waiting.kind !== 'act' || this.waiting.seat !== seat) return null;
    const p = this.player(seat);
    if (!p) return null;

    const toCall = Math.max(0, this.currentBet - p.bet);
    const canCheck = toCall === 0;
    const callAmount = Math.min(toCall, p.stack);
    const potAfterCall = this.totalPot() + callAmount;
    const unit = this.betSize();

    const flCapped =
      this.spec.limit === 'fl' &&
      this.raiseCount >= 4 &&
      this.players.filter((x) => x.inHand && !x.folded && !x.allIn).length > 2;

    let minRaiseTo: number;
    let maxRaiseTo: number;
    let fixedAmount: number | null = null;

    if (this.spec.limit === 'fl') {
      fixedAmount = this.currentBet === 0 ? unit : this.currentBet + unit;
      maxRaiseTo = Math.min(fixedAmount, p.bet + p.stack);
      minRaiseTo = maxRaiseTo;
    } else {
      minRaiseTo = this.currentBet === 0 ? unit : this.currentBet + Math.max(this.lastRaiseSize, unit);
      maxRaiseTo = p.bet + p.stack;
      if (this.spec.limit === 'pl') {
        maxRaiseTo = Math.min(maxRaiseTo, this.currentBet + potAfterCall);
      }
      minRaiseTo = Math.min(minRaiseTo, maxRaiseTo);
    }

    const hasChipsToRaise = p.stack > toCall;
    const allowAggression = !p.capped && !flCapped && hasChipsToRaise;

    return {
      canFold: true,
      canCheck,
      canCall: toCall > 0 && p.stack > 0,
      callAmount,
      canBet: allowAggression && this.currentBet === 0,
      canRaise: allowAggression && this.currentBet > 0,
      minRaiseTo,
      maxRaiseTo,
      potRaiseTo: Math.min(this.currentBet + potAfterCall, p.bet + p.stack),
      fixedAmount,
    };
  }

  /**
   * Apply a player action. Returns an error string when the action is not
   * legal — callers surface it and leave the turn where it was.
   */
  act(seat: number, action: ActionType, amountTo?: number): string | null {
    if (!this.waiting || this.waiting.kind !== 'act') return 'not a betting turn';
    if (this.waiting.seat !== seat) return 'not your turn';
    const p = this.player(seat)!;
    const legal = this.legalFor(seat)!;
    const toCall = Math.max(0, this.currentBet - p.bet);

    switch (action) {
      case 'fold': {
        p.folded = true;
        p.hasActed = true;
        p.lastAction = 'Fold';
        this.discards.push(...p.hole);
        this.emit({ t: 'action', seat, action: 'fold', amount: 0, allIn: false });
        break;
      }
      case 'check': {
        if (!legal.canCheck) return 'cannot check facing a bet';
        p.hasActed = true;
        p.lastAction = 'Check';
        this.emit({ t: 'action', seat, action: 'check', amount: 0, allIn: false });
        break;
      }
      case 'call': {
        if (toCall <= 0) return 'nothing to call';
        const paid = this.commit(p, toCall);
        p.hasActed = true;
        p.lastAction = p.allIn ? 'All in' : 'Call';
        this.emit({ t: 'action', seat, action: 'call', amount: paid, allIn: p.allIn });
        break;
      }
      case 'allin':
      case 'bet':
      case 'raise': {
        let target = action === 'allin' ? p.bet + p.stack : Math.floor(amountTo ?? 0);
        const shove = p.bet + p.stack;
        if (action !== 'allin') {
          if (this.currentBet === 0 && !legal.canBet) return 'cannot bet';
          if (this.currentBet > 0 && !legal.canRaise) return 'cannot raise';
          if (target > legal.maxRaiseTo) return `maximum is ${legal.maxRaiseTo}`;
          if (target < legal.minRaiseTo && target < shove) return `minimum is ${legal.minRaiseTo}`;
        }
        target = Math.min(target, shove);
        if (target <= this.currentBet && target < shove) return 'raise must increase the bet';

        const opening = this.currentBet === 0;
        const raiseSize = target - this.currentBet;
        const fullRaise = opening || raiseSize >= Math.max(this.lastRaiseSize, this.betSize());
        const paid = this.commit(p, target - p.bet);

        if (raiseSize > 0) {
          for (const other of this.players) {
            if (other === p || other.folded || !other.inHand) continue;
            if (fullRaise) {
              other.hasActed = false;
              other.capped = false;
            } else {
              // A short all-in does not reopen the betting for players who
              // already matched the previous bet — they may only call or fold.
              if (other.hasActed && other.bet >= this.currentBet) other.capped = true;
              other.hasActed = false;
            }
          }
          if (fullRaise) this.lastRaiseSize = raiseSize;
          this.currentBet = target;
          this.raiseCount++;
          this.lastAggressor = seat;
        }

        p.hasActed = true;
        const kind: ActionType = raiseSize <= 0 ? 'call' : opening ? 'bet' : 'raise';
        p.lastAction = p.allIn ? 'All in' : kind === 'bet' ? 'Bet' : kind === 'raise' ? 'Raise' : 'Call';
        this.emit({ t: 'action', seat, action: p.allIn ? 'allin' : kind, amount: paid, allIn: p.allIn });
        break;
      }
      default:
        return 'unknown action';
    }

    this.waiting = null;
    this.pump();
    return null;
  }

  /* -------------------------------------------------------------- */
  /* draws                                                           */
  /* -------------------------------------------------------------- */

  private pumpDraw(): boolean {
    if (!this.drawStarted) {
      this.drawStarted = true;
      this.drawQueue = this.orderFrom(this.buttonSeat)
        .filter((p) => p.inHand && !p.folded)
        .map((p) => p.seat);
      for (const p of this.players) p.lastDrawCount = null;
    }
    while (this.drawQueue.length > 0) {
      const seat = this.drawQueue[0];
      const p = this.player(seat);
      if (!p || p.folded || !p.inHand) {
        this.drawQueue.shift();
        continue;
      }
      this.waiting = { kind: 'draw', seat };
      return false;
    }
    return true;
  }

  /** Discard and replace. `cards` may be empty (standing pat). */
  discard(seat: number, cards: Card[]): string | null {
    if (!this.waiting) return 'nothing to discard';

    if (this.waiting.kind === 'draw') {
      if (this.waiting.seat !== seat) return 'not your draw';
      const p = this.player(seat)!;
      const max = this.street.maxDiscards ?? p.hole.length;
      if (cards.length > max) return `you may discard at most ${max}`;
      if (!this.holds(p, cards)) return 'you do not hold those cards';

      for (const c of cards) {
        const i = p.hole.indexOf(c);
        p.hole.splice(i, 1);
        p.faceUp.splice(i, 1);
        this.discards.push(c);
      }
      this.ensureCards(cards.length);
      for (let i = 0; i < cards.length; i++) {
        p.hole.push(this.deck.draw());
        p.faceUp.push(false);
      }
      p.lastDrawCount = cards.length;
      this.emit({ t: 'draw', seat, discarded: cards.length });
      this.drawQueue.shift();
      this.waiting = null;
      this.pump();
      return null;
    }

    if (this.waiting.kind === 'discard') {
      const need = this.waiting.count;
      if (!this.waiting.seats.includes(seat)) return 'you have already discarded';
      if (cards.length !== need) return `discard exactly ${need}`;
      const p = this.player(seat)!;
      if (!this.holds(p, cards)) return 'you do not hold those cards';
      for (const c of cards) {
        const i = p.hole.indexOf(c);
        p.hole.splice(i, 1);
        p.faceUp.splice(i, 1);
        this.discards.push(c);
      }
      this.pineAwaiting = this.pineAwaiting.filter((s) => s !== seat);
      this.waiting = this.pineAwaiting.length
        ? { kind: 'discard', seats: this.pineAwaiting.slice(), count: need }
        : null;
      if (!this.waiting) {
        this.emit({ t: 'discard-flop', seats: this.live().map((x) => x.seat) });
        this.pump();
      }
      return null;
    }

    return 'nothing to discard';
  }

  private holds(p: EnginePlayer, cards: Card[]): boolean {
    const pool = p.hole.slice();
    for (const c of cards) {
      const i = pool.indexOf(c);
      if (i < 0) return false;
      pool.splice(i, 1);
    }
    return true;
  }

  private pumpPineapple(): boolean {
    const n = this.street.discardAfterBetting ?? 0;
    if (n <= 0) return true;
    if (this.live().length <= 1) return true;
    if (!this.pineStarted) {
      this.pineStarted = true;
      this.pineAwaiting = this.live()
        .filter((p) => p.hole.length > this.spec.holeCards - n)
        .map((p) => p.seat);
    }
    if (this.pineAwaiting.length > 0) {
      this.waiting = { kind: 'discard', seats: this.pineAwaiting.slice(), count: n };
      return false;
    }
    return true;
  }

  /* -------------------------------------------------------------- */
  /* street transitions                                              */
  /* -------------------------------------------------------------- */

  private endStreet(): void {
    const moved = this.players.reduce((n, p) => n + p.bet, 0);
    if (moved > 0) {
      for (const p of this.players) p.bet = 0;
      this.emit({ t: 'collect', total: this.totalPot() });
    }

    if (this.live().length <= 1) {
      this.stage = 'showdown';
      return;
    }
    if (this.streetIdx >= this.spec.streets.length - 1) {
      this.stage = 'showdown';
      return;
    }
    this.streetIdx++;
    this.resetStreetBetting(false);
    this.stage = 'deal';
  }

  /* -------------------------------------------------------------- */
  /* pots and showdown                                               */
  /* -------------------------------------------------------------- */

  computePots(): PotSlice[] {
    const contributors = this.players.filter((p) => p.committed > 0);
    if (contributors.length === 0) return [];
    const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
    const slices: PotSlice[] = [];
    let prev = 0;
    for (const level of levels) {
      let amount = 0;
      for (const p of contributors) amount += Math.min(p.committed, level) - Math.min(p.committed, prev);
      const eligible = this.players
        .filter((p) => p.inHand && !p.folded && p.committed >= level)
        .map((p) => p.seat)
        .sort((a, b) => a - b);
      if (amount > 0 && eligible.length > 0) {
        const key = eligible.join(',');
        const last = slices[slices.length - 1];
        if (last && last.eligible.join(',') === key) last.amount += amount;
        else slices.push({ amount, eligible, label: '' });
      } else if (amount > 0 && slices.length > 0) {
        slices[slices.length - 1].amount += amount;
      }
      prev = level;
    }
    slices.forEach((s, i) => {
      s.label = i === 0 ? 'Main pot' : `Side pot ${i}`;
    });
    return slices;
  }

  /** All the cards a player can build a hand from. */
  private playerCards(p: EnginePlayer): Card[] {
    return this.spec.category === 'community' ? p.hole.concat(this.board) : p.hole.slice();
  }

  /** Higher always wins, regardless of the game's underlying rank order. */
  private hiKey(v: HandValue | null): number {
    if (!v) return -Infinity;
    return this.spec.hi === 'high' ? v.score : -v.score;
  }

  private evaluate(p: EnginePlayer): void {
    const spec = this.spec;
    if (spec.category === 'community' && spec.useExactly) {
      p.hi = bestHighExact(p.hole, this.board, spec.useExactly.hole, spec.useExactly.board, !!spec.shortDeck);
      p.hiDesc = describeHigh(p.hi.score, !!spec.shortDeck);
      if (spec.splitLow) {
        p.lo = bestQualifiedLowExact(
          p.hole,
          this.board,
          spec.useExactly.hole,
          spec.useExactly.board,
          spec.lowMaxRank ?? 7,
        );
        p.loDesc = p.lo ? describeLow(p.lo.score) : null;
      }
      return;
    }

    const cards = this.playerCards(p);
    switch (spec.hi) {
      case 'high':
        p.hi = bestHigh(cards, !!spec.shortDeck);
        p.hiDesc = describeHigh(p.hi.score, !!spec.shortDeck);
        break;
      case 'a5low':
        p.hi = bestA5Low(cards);
        p.hiDesc = describeLow(p.hi.score);
        break;
      case '27low':
        p.hi = best27Low(cards);
        p.hiDesc = `${describeHigh(p.hi.score)} (low)`;
        break;
      case 'badugi':
        p.hi = bestBadugi(cards);
        p.hiDesc = describeBadugi(p.hi.score);
        break;
    }
    if (spec.splitLow) {
      p.lo = bestQualifiedLow(cards, spec.lowMaxRank ?? 7);
      p.loDesc = p.lo ? describeLow(p.lo.score) : null;
    }
  }

  private doShowdown(): void {
    const live = this.live();
    const pots = this.computePots();

    if (live.length <= 1) {
      const winner = live[0];
      if (winner) {
        const total = this.totalPot();
        winner.stack += total;
        winner.won = total;
        this.emit({ t: 'award', seat: winner.seat, amount: total, potLabel: 'Pot', half: 'whole' });
        this.summary = `Seat ${winner.seat} wins ${total} uncontested`;
      }
      this.finish();
      return;
    }

    for (const p of live) this.evaluate(p);

    // Reveal in the standard order: last aggressor first, then clockwise.
    const revealOrder = this.orderFrom(this.lastAggressor ?? this.buttonSeat, this.lastAggressor !== null).filter(
      (p) => live.includes(p),
    );
    for (const p of revealOrder) {
      this.emit({ t: 'reveal', seat: p.seat, cards: p.hole.slice() });
    }

    const parts: string[] = [];
    for (const pot of pots) {
      const contenders = live.filter((p) => pot.eligible.includes(p.seat));
      if (contenders.length === 0) continue;

      const bestHi = Math.max(...contenders.map((p) => this.hiKey(p.hi)));
      const hiWinners = contenders.filter((p) => this.hiKey(p.hi) === bestHi);

      let loWinners: EnginePlayer[] = [];
      if (this.spec.splitLow) {
        const withLow = contenders.filter((p) => p.lo);
        if (withLow.length > 0) {
          const bestLo = Math.min(...withLow.map((p) => p.lo!.score));
          loWinners = withLow.filter((p) => p.lo!.score === bestLo);
        }
      }

      if (loWinners.length > 0) {
        const loShare = Math.floor(pot.amount / 2);
        const hiShare = pot.amount - loShare;
        this.payout(hiShare, hiWinners, pot.label, 'high');
        this.payout(loShare, loWinners, pot.label, 'low');
        parts.push(
          `${pot.label}: ${hiWinners.map((p) => `seat ${p.seat}`).join(', ')} high` +
            ` / ${loWinners.map((p) => `seat ${p.seat}`).join(', ')} low`,
        );
      } else {
        this.payout(pot.amount, hiWinners, pot.label, 'whole');
        const desc = hiWinners[0]?.hiDesc ? ` with ${hiWinners[0].hiDesc}` : '';
        parts.push(`${pot.label}: ${hiWinners.map((p) => `seat ${p.seat}`).join(', ')}${desc}`);
      }
    }

    this.summary = parts.join(' · ');
    this.finish();
  }

  private payout(amount: number, winners: EnginePlayer[], label: string, half: 'high' | 'low' | 'whole'): void {
    if (winners.length === 0 || amount <= 0) return;
    const base = Math.floor(amount / winners.length);
    let remainder = amount - base * winners.length;
    // Odd chips go to the first winner clockwise from the button.
    const ordered = this.orderFrom(this.buttonSeat).filter((p) => winners.includes(p));
    for (const w of ordered) {
      let take = base;
      if (remainder > 0) {
        take += 1;
        remainder -= 1;
      }
      w.stack += take;
      w.won += take;
      this.emit({ t: 'award', seat: w.seat, amount: take, potLabel: label, half });
    }
  }

  private finish(): void {
    this.waiting = null;
    this.finished = true;
    this.emit({ t: 'hand-end' });
  }

  /* -------------------------------------------------------------- */
  /* timeouts                                                        */
  /* -------------------------------------------------------------- */

  /** The clock ran out. Check when free, otherwise fold; stand pat on draws. */
  timeout(): void {
    if (!this.waiting) return;
    if (this.waiting.kind === 'act') {
      const seat = this.waiting.seat;
      const legal = this.legalFor(seat);
      this.act(seat, legal?.canCheck ? 'check' : 'fold');
      return;
    }
    if (this.waiting.kind === 'draw') {
      this.discard(this.waiting.seat, []);
      return;
    }
    if (this.waiting.kind === 'discard') {
      const seats = this.waiting.seats.slice();
      const count = this.waiting.count;
      for (const seat of seats) {
        const p = this.player(seat);
        if (!p) continue;
        this.discard(seat, p.hole.slice(-count));
        if (!this.waiting) break;
      }
    }
  }

  /** A player left. Treat it as a fold at the first opportunity. */
  forfeit(seat: number): void {
    const p = this.player(seat);
    if (!p || !p.inHand || p.folded) return;
    if (this.waiting?.kind === 'act' && this.waiting.seat === seat) {
      this.act(seat, 'fold');
      return;
    }
    p.folded = true;
    p.lastAction = 'Fold';
    if (this.waiting?.kind === 'draw' && this.waiting.seat === seat) {
      this.drawQueue.shift();
      this.waiting = null;
      this.pump();
    } else if (this.waiting?.kind === 'discard' && this.waiting.seats.includes(seat)) {
      const count = this.waiting.count;
      this.pineAwaiting = this.pineAwaiting.filter((s) => s !== seat);
      this.waiting = this.pineAwaiting.length
        ? { kind: 'discard', seats: this.pineAwaiting.slice(), count }
        : null;
      if (!this.waiting) this.pump();
    } else if (this.live().length <= 1) {
      this.stage = 'showdown';
      this.waiting = null;
      this.pump();
    }
  }
}
