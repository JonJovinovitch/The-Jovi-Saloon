/**
 * A room is one Discord server's poker game. It owns the member list, the
 * shared config, and — the interesting part — automatic table scaling.
 *
 * Past the seat cap the room opens a second table and balances players across
 * both, the way a card room breaks and balances tournament tables: nobody is
 * ever moved out of a hand they are playing, and table sizes never differ by
 * more than one seat.
 */

import { Table, type Seat } from './table.ts';
import { nextBotName } from './bots.ts';
import { getGame } from '../../shared/src/games.ts';
import { isAvatarId, pickFreeAvatar } from '../../shared/src/avatars.ts';
import type { Identity, RoomConfig, RoomMember, RoomView, TournamentView } from '../../shared/src/protocol.ts';

export interface Member {
  userId: string;
  name: string;
  avatar: string | null;
  /** The western character they play as; unique within the room. */
  avatarId: string;
  connected: boolean;
  isBot: boolean;
  /** Which table this member is looking at while not seated. */
  viewTableId: string | null;
}

let tableSeq = 0;

export class Room {
  readonly id: string;
  name: string;
  hostId: string | null = null;
  config: RoomConfig;
  members = new Map<string, Member>();
  tables: Table[] = [];
  notice: string | null = null;
  private tournament: TournamentView | null = null;
  private tournamentTimer: ReturnType<typeof setTimeout> | null = null;
  private tournamentEntries: string[] = [];
  private eliminated: string[] = [];
  private pruningTournament = false;

  /** Fired when anything the clients can see changed. */
  onUpdate: (room: Room) => void = () => {};

  private rebalancing = false;
  private rebalancePending = false;

  constructor(id: string, name: string, config: RoomConfig) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.addTable();
  }

  /* -------------------------------------------------------------- */
  /* membership                                                      */
  /* -------------------------------------------------------------- */

  join(identity: Identity): Member {
    let m = this.members.get(identity.userId);
    if (m) {
      m.connected = true;
      m.name = identity.name || m.name;
      m.avatar = identity.avatar ?? m.avatar;
    } else {
      // Honour the character they arrived with unless someone already has it.
      const wanted = identity.avatarId;
      const taken = this.takenAvatars();
      m = {
        userId: identity.userId,
        name: identity.name || 'Player',
        avatar: identity.avatar,
        avatarId:
          wanted && isAvatarId(wanted) && !taken.has(wanted)
            ? wanted
            : pickFreeAvatar(identity.userId, taken),
        connected: true,
        isBot: false,
        viewTableId: this.tables[0]?.id ?? null,
      };
      this.members.set(m.userId, m);
    }
    if (!this.hostId) this.hostId = m.userId;
    for (const t of this.tables) t.setConnected(m.userId, true);
    this.touch();
    return m;
  }

  disconnect(userId: string): void {
    const m = this.members.get(userId);
    if (!m) return;
    m.connected = false;
    for (const t of this.tables) t.setConnected(userId, false);
    this.touch();
  }

  /** Fully remove someone — they closed the activity and stood up. */
  leave(userId: string): void {
    for (const t of this.tables) t.stand(userId);
    this.members.delete(userId);
    if (this.hostId === userId) {
      this.hostId = [...this.members.values()].find((m) => !m.isBot)?.userId ?? null;
    }
    this.rebalance();
    this.touch();
  }

  isHost(userId: string): boolean {
    return this.hostId === userId;
  }

  /** Characters currently spoken for, so two people are never the Sheriff. */
  takenAvatars(exceptUserId?: string): Set<string> {
    const out = new Set<string>();
    for (const m of this.members.values()) {
      if (m.userId !== exceptUserId) out.add(m.avatarId);
    }
    return out;
  }

  setAvatar(userId: string, avatarId: string): string | null {
    const m = this.members.get(userId);
    if (!m) return 'unknown player';
    if (!isAvatarId(avatarId)) return 'no such character';
    if (m.avatarId === avatarId) return null;
    if (this.takenAvatars(userId).has(avatarId)) return 'someone else is already playing that character';
    m.avatarId = avatarId;
    const seat = this.tableOf(userId)?.findSeatOf(userId);
    if (seat) seat.avatarId = avatarId;
    this.touch();
    return null;
  }

  /* -------------------------------------------------------------- */
  /* tables                                                          */
  /* -------------------------------------------------------------- */

  private addTable(): Table {
    const t = new Table(`t${++tableSeq}`, this.tables.length, this.config);
    t.onUpdate = () => this.handleTableUpdate(t);
    this.tables.push(t);
    return t;
  }

  private handleTableUpdate(t: Table): void {
    this.pruneTournamentBusted();
    if (this.rebalancePending && this.tableIsIdle(t)) {
      // Retry a move that was blocked by a hand in progress.
      queueMicrotask(() => this.rebalance());
    }
    this.touch();
  }

  tableById(id: string | null): Table | null {
    if (!id) return null;
    return this.tables.find((t) => t.id === id) ?? null;
  }

  tableOf(userId: string): Table | null {
    return this.tables.find((t) => t.findSeatOf(userId)) ?? null;
  }

  /** The table a given client should be rendering. */
  viewTable(userId: string): Table | null {
    const seated = this.tableOf(userId);
    if (seated) return seated;
    const m = this.members.get(userId);
    return this.tableById(m?.viewTableId ?? null) ?? this.tables[0] ?? null;
  }

  watchTable(userId: string, tableId: string): void {
    const m = this.members.get(userId);
    if (!m || !this.tableById(tableId)) return;
    m.viewTableId = tableId;
    this.touch();
  }

  seatedCount(): number {
    return this.tables.reduce((n, t) => n + t.seatCount(), 0);
  }

  private tableIsIdle(t: Table): boolean {
    return !t.engine || t.engine.finished;
  }

  /* -------------------------------------------------------------- */
  /* sitting down                                                    */
  /* -------------------------------------------------------------- */

  sit(userId: string, seat: number, tableId?: string): string | null {
    const m = this.members.get(userId);
    if (!m) return 'unknown player';
    if (this.tableOf(userId)) return 'you are already seated';
    if (this.config.format === 'tournament' && this.tournament?.state !== 'setup') return 'this tournament has already started';
    if (this.config.format === 'tournament' && this.seatedCount() >= this.config.tournament.maxPlayers) return 'this tournament is full';

    let table = this.tableById(tableId ?? m.viewTableId ?? null);
    if (!table || table.firstOpenSeat() === null) {
      table = this.emptiestTableWithRoom();
    }
    if (!table) {
      if (!this.config.autoScale) return 'every seat is taken';
      table = this.addTable();
    }

    const target = table.seats[seat] === null && seat >= 0 && seat < table.seats.length
      ? seat
      : table.firstOpenSeat();
    if (target === null) return 'every seat is taken';

    const err = table.sit(target, {
      userId,
      name: m.name,
      avatar: m.avatar,
      avatarId: m.avatarId,
      stack: this.config.startingStack,
      sittingOut: false,
      ready: this.config.format === 'tournament' || m.isBot,
      autoFold: false,
      disconnected: !m.connected,
      isBot: m.isBot,
    });
    if (err) return err;
    m.viewTableId = table.id;
    this.rebalance();
    this.touch();
    return null;
  }

  stand(userId: string): void {
    const t = this.tableOf(userId);
    if (!t) return;
    if (this.config.format === 'tournament') {
      t.autoFoldOut(userId);
      this.touch();
      return;
    }
    t.stand(userId);
    this.rebalance();
    this.touch();
  }

  setReady(userId: string, on: boolean): void {
    this.tableOf(userId)?.setReady(userId, on);
    this.touch();
  }

  private emptiestTableWithRoom(): Table | null {
    const open = this.tables.filter((t) => t.firstOpenSeat() !== null);
    if (open.length === 0) return null;
    return open.reduce((a, b) => (b.seatCount() < a.seatCount() ? b : a));
  }

  /* -------------------------------------------------------------- */
  /* auto-scaling                                                    */
  /* -------------------------------------------------------------- */

  private desiredTableCount(): number {
    if (!this.config.autoScale) return 1;
    const n = this.seatedCount();
    if (n === 0) return 1;
    return Math.max(1, Math.ceil(n / this.config.seatCap));
  }

  /**
   * Open or close tables and even out the seat counts. Anyone currently in a
   * hand stays put; the move is retried when their table goes idle.
   */
  rebalance(): void {
    if (this.rebalancing) return;
    this.rebalancing = true;
    this.rebalancePending = false;
    try {
      const before = this.tables.length;
      const desired = this.desiredTableCount();

      while (this.tables.length < desired) this.addTable();

      // Even out seat counts.
      for (let guard = 0; guard < 64; guard++) {
        const sorted = this.tables.slice().sort((a, b) => a.seatCount() - b.seatCount());
        const small = sorted[0];
        const big = sorted[sorted.length - 1];
        if (!small || !big || big === small) break;
        if (big.seatCount() - small.seatCount() <= 1) break;
        if (small.firstOpenSeat() === null) break;
        const mover = this.pickMovable(big);
        if (!mover) {
          this.rebalancePending = true;
          break;
        }
        this.movePlayer(mover, big, small);
      }

      // Close surplus tables by emptying the smallest ones.
      while (this.tables.length > desired) {
        const sorted = this.tables.slice().sort((a, b) => a.seatCount() - b.seatCount());
        const victim = sorted[0];
        const others = this.tables.filter((t) => t !== victim);
        const capacity = others.reduce((n, t) => n + (t.seats.length - t.seatCount()), 0);
        if (capacity < victim.seatCount()) break;
        let stuck = false;
        while (victim.seatCount() > 0) {
          const mover = this.pickMovable(victim);
          if (!mover) {
            stuck = true;
            break;
          }
          const dest = others
            .filter((t) => t.firstOpenSeat() !== null)
            .reduce<Table | null>((a, b) => (!a || b.seatCount() < a.seatCount() ? b : a), null);
          if (!dest) {
            stuck = true;
            break;
          }
          this.movePlayer(mover, victim, dest);
        }
        if (stuck) {
          this.rebalancePending = true;
          break;
        }
        victim.dispose();
        this.tables = this.tables.filter((t) => t !== victim);
      }

      this.tables.forEach((t, i) => (t.index = i));

      if (this.tables.length !== before) {
        this.notice =
          this.tables.length > before
            ? `Table ${this.tables.length} opened — ${this.seatedCount()} players across ${this.tables.length} tables`
            : `Tables consolidated — now playing ${this.tables.length === 1 ? 'one table' : `${this.tables.length} tables`}`;
      }
      for (const t of this.tables) t.maybeStartHand();
    } finally {
      this.rebalancing = false;
    }
  }

  /** A seated player who is not currently involved in a live hand. */
  private pickMovable(t: Table): Seat | null {
    const idle = this.tableIsIdle(t);
    for (const s of t.occupied()) {
      const inHand = !idle && t.engine?.player(s.seat)?.inHand && !t.engine.player(s.seat)!.folded;
      if (!inHand) return s;
    }
    return null;
  }

  private movePlayer(seat: Seat, from: Table, to: Table): void {
    const target = to.firstOpenSeat();
    if (target === null) return;
    from.seats[seat.seat] = null;
    to.seats[target] = { ...seat, seat: target };
    const m = this.members.get(seat.userId);
    if (m) m.viewTableId = to.id;
  }

  /* -------------------------------------------------------------- */
  /* config and bots                                                 */
  /* -------------------------------------------------------------- */

  applyConfig(patch: Partial<RoomConfig>): string | null {
    const next: RoomConfig = { ...this.config, ...patch, stakes: { ...this.config.stakes, ...patch.stakes } };
    next.format = next.format === 'tournament' ? 'tournament' : 'cash';
    next.tournament = { ...this.config.tournament, ...patch.tournament };
    next.seatCap = Math.max(2, Math.min(10, Math.floor(next.seatCap)));
    next.startingStack = Math.max(1, Math.floor(next.startingStack));
    next.actionTimeSec = Math.max(8, Math.min(120, Math.floor(next.actionTimeSec)));
    next.stakes.bigBlind = Math.max(2, Math.floor(next.stakes.bigBlind));
    next.stakes.smallBlind = Math.max(1, Math.min(next.stakes.bigBlind - 1, Math.floor(next.stakes.smallBlind)));
    next.tournament.buyIn = Math.max(0, Math.floor(next.tournament.buyIn));
    next.tournament.blindIntervalMin = Math.max(1, Math.min(60, Math.floor(next.tournament.blindIntervalMin)));
    next.tournament.blindPace = ['turbo', 'standard', 'deep'].includes(next.tournament.blindPace) ? next.tournament.blindPace : 'standard';
    next.tournament.blindScalePercent = Math.max(10, Math.min(200, Math.floor(next.tournament.blindScalePercent)));
    next.tournament.maxPlayers = Math.max(2, Math.min(36, Math.floor(next.tournament.maxPlayers)));
    if (next.format === 'tournament') {
      next.mode = 'fixed'; next.gameId = 'nlhe'; next.allowRebuy = false; next.autoScale = true; next.autoDeal = false; next.seatCap = Math.min(9, next.seatCap);
    } else {
      // Cash hands begin when two seated players have explicitly marked ready.
      next.autoDeal = true;
    }
    if (next.mode === 'fixed') {
      try {
        getGame(next.gameId);
      } catch {
        return 'unknown game';
      }
    }
    this.config = next;
    for (const t of this.tables) t.applyConfig(next);
    this.rebalance();
    this.touch();
    return null;
  }

  startTournament(): string | null {
    if (this.config.format !== 'tournament') return 'switch the room to Tournament first';
    if (this.tournament?.state === 'running') return 'the tournament is already running';
    const entries = this.tables.flatMap((t) => t.occupied()).filter((s) => !s.isBot);
    if (entries.length < 2) return 'at least two players must take a seat before starting';
    const pool = entries.length * this.config.tournament.buyIn;
    this.applyTournamentLevel(1);
    this.config.autoDeal = true;
    for (const table of this.tables) table.applyConfig(this.config);
    this.tournament = { state: 'running', level: 1, nextLevelAt: Date.now() + this.config.tournament.blindIntervalMin * 60_000,
      entries: entries.length, maxPlayers: this.config.tournament.maxPlayers, prizePool: pool, payouts: tournamentPayouts(entries.length, pool), winnerName: null };
    this.tournamentEntries = entries.map((s) => s.userId);
    this.eliminated = [];
    this.notice = `Tournament started — Level 1: ${this.config.stakes.smallBlind}/${this.config.stakes.bigBlind}`;
    this.armTournamentClock();
    for (const t of this.tables) t.forceStart();
    this.touch();
    return null;
  }

  private armTournamentClock(): void {
    if (this.tournamentTimer) clearTimeout(this.tournamentTimer);
    const next = this.tournament?.nextLevelAt;
    if (!next) return;
    this.tournamentTimer = setTimeout(() => {
      if (!this.tournament || this.tournament.state !== 'running') return;
      this.tournament.level++;
      this.applyTournamentLevel(this.tournament.level);
      this.tournament.nextLevelAt = Date.now() + this.config.tournament.blindIntervalMin * 60_000;
      for (const t of this.tables) t.applyConfig(this.config);
      this.notice = `Blinds are up — Level ${this.tournament.level}: ${this.config.stakes.smallBlind}/${this.config.stakes.bigBlind}`;
      this.armTournamentClock(); this.touch();
    }, Math.max(0, next - Date.now()));
  }

  /** A rounded live-tournament ladder: 100BB to start, with 1.5x / 2x steps. */
  private applyTournamentLevel(level: number): void {
    const pace = this.config.tournament.blindPace;
    const ladder = pace === 'turbo'
      ? [1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120]
      : pace === 'deep'
        ? [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30]
        : [1, 1.5, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40];
    const baseBigBlind = niceChip(Math.max(2, this.config.startingStack / 100));
    const bigBlind = niceChip(baseBigBlind * (ladder[Math.min(level - 1, ladder.length - 1)] ?? 1));
    this.config.stakes.bigBlind = bigBlind;
    this.config.stakes.smallBlind = Math.max(1, niceChip(bigBlind / 2));
    this.config.stakes.smallBet = bigBlind;
    this.config.stakes.bigBet = bigBlind * 2;
    this.config.stakes.bigBlindAnte = level >= 5 ? bigBlind : 0;
  }

  private pruneTournamentBusted(): void {
    if (this.pruningTournament || this.config.format !== 'tournament' || this.tournament?.state !== 'running') return;
    this.pruningTournament = true;
    let changed = false;
    try {
      for (const table of this.tables) {
        if (!this.tableIsIdle(table)) continue;
        for (const seat of table.occupied().filter((s) => s.busted || s.stack <= 0)) {
          if (!this.eliminated.includes(seat.userId)) this.eliminated.unshift(seat.userId);
          table.stand(seat.userId);
          changed = true;
        }
      }
      const live = this.tables.flatMap((table) => table.occupied()).filter((seat) => !seat.isBot);
      if (live.length === 1 && this.tournamentEntries.length > 1) {
        this.tournament.state = 'complete';
        this.tournament.nextLevelAt = null;
        this.tournament.winnerName = live[0].name;
        this.notice = `${live[0].name} wins the tournament!`;
        if (this.tournamentTimer) clearTimeout(this.tournamentTimer);
        this.tournamentTimer = null;
        changed = true;
      }
    } finally {
      this.pruningTournament = false;
    }
    if (changed) queueMicrotask(() => this.rebalance());
  }

  addBots(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `bot:${Math.random().toString(36).slice(2, 10)}`;
      const name = nextBotName();
      this.members.set(id, {
        userId: id,
        name,
        avatar: null,
        avatarId: pickFreeAvatar(id, this.takenAvatars()),
        connected: true,
        isBot: true,
        viewTableId: null,
      });
      const err = this.sit(id, -1);
      if (err) {
        this.members.delete(id);
        break;
      }
    }
    this.touch();
  }

  removeBots(): void {
    for (const m of [...this.members.values()]) {
      if (m.isBot) this.leave(m.userId);
    }
    this.touch();
  }

  /* -------------------------------------------------------------- */
  /* view                                                            */
  /* -------------------------------------------------------------- */

  view(): RoomView {
    const members: RoomMember[] = [];
    for (const m of this.members.values()) {
      const t = this.tableOf(m.userId);
      members.push({
        userId: m.userId,
        name: m.name,
        avatar: m.avatar,
        avatarId: m.avatarId,
        tableId: t?.id ?? null,
        seat: t?.findSeatOf(m.userId)?.seat ?? null,
        connected: m.connected,
        isHost: this.hostId === m.userId,
        isBot: m.isBot,
      });
    }
    const view: RoomView = {
      id: this.id,
      name: this.name,
      hostId: this.hostId ?? '',
      config: this.config,
      members,
      tables: this.tables.map((t) => ({
        id: t.id,
        index: t.index,
        seated: t.seatCount(),
        gameName: t.spec.name,
        handId: t.handId,
      })),
      notice: this.notice,
      inviteCode: this.id.replace(/^(?:local|room):/, ''),
      tournament: this.tournament ?? (this.config.format === 'tournament' ? {
        state: 'setup', level: 1, nextLevelAt: null, entries: this.seatedCount(), maxPlayers: this.config.tournament.maxPlayers,
        prizePool: this.seatedCount() * this.config.tournament.buyIn,
        payouts: tournamentPayouts(this.seatedCount(), this.seatedCount() * this.config.tournament.buyIn), winnerName: null,
      } : null),
    };
    return view;
  }

  /** The caller broadcasts one RoomView to everyone, then clears the toast. */
  clearNotice(): void {
    this.notice = null;
  }

  private touch(): void {
    this.onUpdate(this);
  }

  dispose(): void {
    if (this.tournamentTimer) clearTimeout(this.tournamentTimer);
    for (const t of this.tables) t.dispose();
    this.tables = [];
  }
}

function tournamentPayouts(entries: number, pool: number): { place: number; amount: number }[] {
  if (entries < 2 || pool <= 0) return [];
  const shares = entries === 2 ? [1] : entries <= 5 ? [0.65, 0.35] : entries <= 18 ? [0.5, 0.3, 0.2] : entries <= 27 ? [0.45, 0.27, 0.17, 0.11] : [0.4, 0.25, 0.16, 0.11, 0.08];
  return shares.map((share, i) => ({ place: i + 1, amount: Math.round(pool * share * 100) / 100 }));
}

function niceChip(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const unit = value / power;
  return Math.max(1, (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power);
}
