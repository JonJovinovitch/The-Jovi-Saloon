/**
 * Wire protocol.
 *
 * The server is authoritative for every card. A `TableView` is built
 * per-viewer: cards a player is not entitled to see arrive as `null`, never as
 * a real value the client is trusted to hide. Face-up stud cards are the only
 * hole cards that appear in another player's view before showdown.
 */

import type { Card } from './cards.ts';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface Stakes {
  smallBlind: number;
  bigBlind: number;
  ante: number;
  bringIn: number;
  /** Fixed limit only. */
  smallBet: number;
  bigBet: number;
}

export type GameMode = 'fixed' | 'dealers-choice' | 'mix';
export type RoomFormat = 'cash' | 'tournament';

export interface TournamentConfig {
  buyIn: number;
  blindIntervalMin: number;
  /** Percentage increase applied to every blind level (for example 50 = 1.5x). */
  blindScalePercent: number;
  maxPlayers: number;
}

export interface TournamentView {
  state: 'setup' | 'running' | 'complete';
  level: number;
  nextLevelAt: number | null;
  entries: number;
  maxPlayers: number;
  prizePool: number;
  payouts: { place: number; amount: number }[];
  winnerName: string | null;
}

export interface RoomConfig {
  format: RoomFormat;
  mode: GameMode;
  /** mode: 'fixed' */
  gameId: string;
  /** mode: 'mix' */
  mixId: string;
  stakes: Stakes;
  startingStack: number;
  /** Hard seat cap per table; the room splits into more tables past this. */
  seatCap: number;
  actionTimeSec: number;
  /** Automatically split and balance into extra tables as people join. */
  autoScale: boolean;
  allowRebuy: boolean;
  /** Deal the next hand automatically instead of waiting for a ready check. */
  autoDeal: boolean;
  tournament: TournamentConfig;
}

export const DEFAULT_STAKES: Stakes = {
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  bringIn: 5,
  smallBet: 10,
  bigBet: 20,
};

export const DEFAULT_CONFIG: RoomConfig = {
  format: 'cash',
  mode: 'dealers-choice',
  gameId: 'nlhe',
  mixId: 'horse',
  stakes: DEFAULT_STAKES,
  startingStack: 1000,
  seatCap: 9,
  actionTimeSec: 30,
  autoScale: true,
  allowRebuy: true,
  autoDeal: true,
  tournament: { buyIn: 10, blindIntervalMin: 10, blindScalePercent: 50, maxPlayers: 36 },
};

/* ------------------------------------------------------------------ */
/* views                                                               */
/* ------------------------------------------------------------------ */

export interface SeatView {
  seat: number;
  userId: string;
  name: string;
  avatar: string | null;
  /** Which western character this player chose. See shared/src/avatars.ts. */
  avatarId: string;
  stack: number;
  /** Chips committed on the current street, sitting in front of the seat. */
  bet: number;
  /** Total committed this hand — drives the chip-to-pot animation. */
  committed: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  disconnected: boolean;
  isBot: boolean;
  /** null entries are face-down cards this viewer may not see. */
  cards: (Card | null)[];
  /** How many cards this seat drew on the last draw round, for the UI note. */
  lastDrawCount: number | null;
  lastAction: string | null;
  /** Filled at showdown. */
  handDesc: string | null;
  lowDesc: string | null;
  /** Cards to highlight at showdown. */
  bestCards: Card[] | null;
  won: number;
}

export interface PotView {
  amount: number;
  /** Seat numbers still eligible for this pot. */
  eligible: number[];
  label: string;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  /** Chips needed to call. 0 when checking is free. */
  callAmount: number;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  /** Total bet-to amounts, not increments. */
  minRaiseTo: number;
  maxRaiseTo: number;
  /** Pot-sized raise target; equals maxRaiseTo in pot limit when capped. */
  potRaiseTo: number;
  /** Fixed limit locks the amount. */
  fixedAmount: number | null;
}

export interface YouView {
  userId: string;
  seat: number | null;
  cards: Card[];
  legal: LegalActions | null;
  /** Set while a draw round is waiting on you. */
  drawPrompt: { maxDiscards: number; exact: number | null } | null;
  /** Set when it is your turn to pick the game. */
  choicePrompt: { options: string[] } | null;
}

export type TableState = 'waiting' | 'choosing' | 'running' | 'showdown';

export interface TableView {
  id: string;
  index: number;
  gameId: string;
  gameName: string;
  gameShort: string;
  limit: string;
  rankingNote: string | null;
  stakes: Stakes;
  seatCap: number;
  handId: number;
  state: TableState;
  street: string;
  streetName: string;
  board: Card[];
  pots: PotView[];
  totalPot: number;
  buttonSeat: number | null;
  toActSeat: number | null;
  actionDeadline: number | null;
  seats: SeatView[];
  /** Human readable status line under the table. */
  message: string;
  /** Seats still to act in the current draw/discard round. */
  awaitingDiscard: number[];
  /** Who is picking the next game, when the room is on dealer's choice. */
  choosingSeat: number | null;
}

export interface RoomMember {
  userId: string;
  name: string;
  avatar: string | null;
  avatarId: string;
  tableId: string | null;
  seat: number | null;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface RoomView {
  id: string;
  name: string;
  hostId: string;
  config: RoomConfig;
  members: RoomMember[];
  tables: { id: string; index: number; seated: number; gameName: string; handId: number }[];
  /** Set when auto-scaling just changed the table count, for a toast. */
  notice: string | null;
  inviteCode: string;
  tournament: TournamentView | null;
}

/* ------------------------------------------------------------------ */
/* animation events                                                    */
/* ------------------------------------------------------------------ */

export type GameEvent =
  | { t: 'hand-start'; handId: number; gameId: string; buttonSeat: number | null }
  | { t: 'post'; seat: number; amount: number; kind: 'sb' | 'bb' | 'ante' | 'bringin' }
  | { t: 'deal-hole'; order: { seat: number; faceUp: boolean }[] }
  | { t: 'deal-up'; seat: number; card: Card }
  | { t: 'burn' }
  | { t: 'deal-board'; cards: Card[]; street: string }
  | { t: 'action'; seat: number; action: ActionType; amount: number; allIn: boolean }
  | { t: 'draw'; seat: number; discarded: number; }
  | { t: 'discard-flop'; seats: number[] }
  | { t: 'collect'; total: number }
  | { t: 'reveal'; seat: number; cards: Card[] }
  | { t: 'muck'; seats: number[] }
  | { t: 'award'; seat: number; amount: number; potLabel: string; half: 'high' | 'low' | 'whole' }
  | { t: 'hand-end' }
  | { t: 'say'; text: string };

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

export interface Identity {
  userId: string;
  name: string;
  avatar: string | null;
  /** Preferred western character; the room reassigns it if already taken. */
  avatarId?: string;
}

export type ClientMessage =
  | {
      t: 'hello';
      roomId: string;
      roomName?: string;
      identity: Identity;
      sessionKey?: string;
      /** Discord OAuth token; when present the server derives identity from it. */
      accessToken?: string;
    }
  | { t: 'watch'; tableId: string }
  | { t: 'avatar'; avatarId: string }
  | { t: 'sit'; seat: number; tableId?: string }
  | { t: 'stand' }
  | { t: 'sitout'; on: boolean }
  | { t: 'rebuy'; amount: number }
  | { t: 'act'; action: ActionType; amount?: number }
  | { t: 'discard'; cards: Card[] }
  | { t: 'choose-game'; gameId: string }
  | { t: 'config'; config: Partial<RoomConfig> }
  | { t: 'start' }
  | { t: 'add-bot'; count?: number }
  | { t: 'remove-bots' }
  | { t: 'start-tournament' }
  | { t: 'chat'; text: string }
  | { t: 'ping' };

export type ServerMessage =
  | { t: 'welcome'; sessionKey: string; room: RoomView; you: YouView; table: TableView | null }
  | { t: 'room'; room: RoomView }
  | { t: 'table'; table: TableView; you: YouView }
  | { t: 'events'; tableId: string; events: GameEvent[] }
  | { t: 'chat'; from: string; name: string; text: string; ts: number }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export const PROTOCOL_VERSION = 1;
