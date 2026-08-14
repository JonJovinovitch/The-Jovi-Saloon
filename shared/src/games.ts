/**
 * The game catalog.
 *
 * Every game in the room is described by data, not code: the engine reads a
 * GameSpec and runs it. Adding a variant means adding an entry here (plus a
 * How To Play page in howto.ts) - not touching the state machine.
 */

export type GameCategory = 'community' | 'stud' | 'draw';
export type LimitType = 'nl' | 'pl' | 'fl';
/** Which rank order decides the main (or only) pot. */
export type HiRule = 'high' | 'a5low' | '27low' | 'badugi';

export interface StreetSpec {
  id: string;
  /** Shown on the table: "Flop", "Fourth Street", "Second Draw". */
  name: string;
  /** Face-down cards dealt to each live player. */
  dealToEach?: number;
  /** Face-up cards dealt to each live player (stud). */
  dealUpToEach?: number;
  /** Community cards added to the board. */
  dealBoard?: number;
  /** Burn a card before dealing, as a live dealer would. */
  burn?: boolean;
  /** Players discard and replace before this street's betting round. */
  draw?: boolean;
  maxDiscards?: number;
  /** Crazy Pineapple: every live player pitches exactly n cards after betting. */
  discardAfterBetting?: number;
  /** Is there a betting round on this street? (Always true today, kept explicit.) */
  betting: boolean;
  /** Fixed limit: this street uses the big bet. */
  bigBet?: boolean;
}

export interface GameSpec {
  id: string;
  name: string;
  /** Two-to-five character badge for the table header. */
  short: string;
  category: GameCategory;
  limit: LimitType;
  holeCards: number;
  maxSeats: number;
  forced: 'blinds' | 'antes-bringin';
  hi: HiRule;
  /** True for the "8 or better" split games. */
  splitLow: boolean;
  /** Low qualifier as an ace-low index: 7 === eight-or-better. */
  lowMaxRank?: number;
  /** Omaha rule: use exactly this many hole and board cards. */
  useExactly?: { hole: number; board: number };
  shortDeck?: boolean;
  streets: StreetSpec[];
  /** Anything unusual about hand ranking, surfaced in the UI. */
  rankingNote?: string;
  /** Included in dealer's-choice rotations by default. */
  popular: boolean;
}

const flopStreets = (holeCards: number, bigBetFrom = 2): StreetSpec[] => [
  { id: 'preflop', name: 'Preflop', dealToEach: holeCards, betting: true },
  { id: 'flop', name: 'Flop', dealBoard: 3, burn: true, betting: true, bigBet: bigBetFrom <= 1 },
  { id: 'turn', name: 'Turn', dealBoard: 1, burn: true, betting: true, bigBet: bigBetFrom <= 2 },
  { id: 'river', name: 'River', dealBoard: 1, burn: true, betting: true, bigBet: bigBetFrom <= 3 },
];

const studStreets: StreetSpec[] = [
  { id: 'third', name: 'Third Street', dealToEach: 2, dealUpToEach: 1, betting: true },
  { id: 'fourth', name: 'Fourth Street', dealUpToEach: 1, betting: true },
  { id: 'fifth', name: 'Fifth Street', dealUpToEach: 1, betting: true, bigBet: true },
  { id: 'sixth', name: 'Sixth Street', dealUpToEach: 1, betting: true, bigBet: true },
  { id: 'seventh', name: 'Seventh Street', dealToEach: 1, betting: true, bigBet: true },
];

const tripleDrawStreets = (holeCount: number): StreetSpec[] => [
  { id: 'predraw', name: 'Predraw', dealToEach: holeCount, betting: true },
  { id: 'draw1', name: 'First Draw', draw: true, maxDiscards: holeCount, betting: true },
  { id: 'draw2', name: 'Second Draw', draw: true, maxDiscards: holeCount, betting: true, bigBet: true },
  { id: 'draw3', name: 'Third Draw', draw: true, maxDiscards: holeCount, betting: true, bigBet: true },
];

export const GAMES: GameSpec[] = [
  {
    id: 'nlhe',
    name: "No-Limit Texas Hold'em",
    short: 'NLHE',
    category: 'community',
    limit: 'nl',
    holeCards: 2,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    streets: flopStreets(2),
    popular: true,
  },
  {
    id: 'lhe',
    name: "Limit Texas Hold'em",
    short: 'LHE',
    category: 'community',
    limit: 'fl',
    holeCards: 2,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    streets: flopStreets(2, 2),
    popular: true,
  },
  {
    id: 'plo',
    name: 'Pot-Limit Omaha',
    short: 'PLO',
    category: 'community',
    limit: 'pl',
    holeCards: 4,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    useExactly: { hole: 2, board: 3 },
    streets: flopStreets(4),
    rankingNote: 'You must play exactly two hole cards and exactly three board cards.',
    popular: true,
  },
  {
    id: 'plo8',
    name: 'Omaha Hi-Lo (8 or Better)',
    short: 'PLO8',
    category: 'community',
    limit: 'pl',
    holeCards: 4,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: true,
    lowMaxRank: 7,
    useExactly: { hole: 2, board: 3 },
    streets: flopStreets(4),
    rankingNote: 'Exactly two hole cards each way, and you may use a different pair for the low.',
    popular: true,
  },
  {
    id: 'bigo',
    name: 'Big O (5-Card Omaha Hi-Lo)',
    short: 'BIG O',
    category: 'community',
    limit: 'pl',
    holeCards: 5,
    maxSeats: 8,
    forced: 'blinds',
    hi: 'high',
    splitLow: true,
    lowMaxRank: 7,
    useExactly: { hole: 2, board: 3 },
    streets: flopStreets(5),
    rankingNote: 'Five hole cards, still exactly two of them in your final hand.',
    popular: false,
  },
  {
    id: 'pineapple',
    name: 'Crazy Pineapple',
    short: 'PINE',
    category: 'community',
    limit: 'pl',
    holeCards: 3,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    streets: [
      { id: 'preflop', name: 'Preflop', dealToEach: 3, betting: true },
      { id: 'flop', name: 'Flop', dealBoard: 3, burn: true, betting: true, discardAfterBetting: 1 },
      { id: 'turn', name: 'Turn', dealBoard: 1, burn: true, betting: true },
      { id: 'river', name: 'River', dealBoard: 1, burn: true, betting: true },
    ],
    rankingNote: "Hold'em rules after the flop discard: use any combination of your two cards and the board.",
    popular: true,
  },
  {
    id: 'shortdeck',
    name: "Short Deck (6+) Hold'em",
    short: '6+',
    category: 'community',
    limit: 'nl',
    holeCards: 2,
    maxSeats: 9,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    shortDeck: true,
    streets: flopStreets(2),
    rankingNote: 'Deuces through fives are removed. A flush beats a full house, and A-6-7-8-9 is the low straight.',
    popular: true,
  },
  {
    id: 'stud',
    name: 'Seven Card Stud',
    short: 'STUD',
    category: 'stud',
    limit: 'fl',
    holeCards: 0,
    maxSeats: 8,
    forced: 'antes-bringin',
    hi: 'high',
    splitLow: false,
    streets: studStreets,
    popular: true,
  },
  {
    id: 'stud8',
    name: 'Seven Card Stud Hi-Lo (8 or Better)',
    short: 'STUD8',
    category: 'stud',
    limit: 'fl',
    holeCards: 0,
    maxSeats: 8,
    forced: 'antes-bringin',
    hi: 'high',
    splitLow: true,
    lowMaxRank: 7,
    streets: studStreets,
    popular: true,
  },
  {
    id: 'razz',
    name: 'Razz',
    short: 'RAZZ',
    category: 'stud',
    limit: 'fl',
    holeCards: 0,
    maxSeats: 8,
    forced: 'antes-bringin',
    hi: 'a5low',
    splitLow: false,
    streets: studStreets,
    rankingNote: 'Lowest hand wins. Straights and flushes are ignored; the ace is always low.',
    popular: true,
  },
  {
    id: 'draw5',
    name: 'Five Card Draw',
    short: 'DRAW',
    category: 'draw',
    limit: 'nl',
    holeCards: 5,
    maxSeats: 6,
    forced: 'blinds',
    hi: 'high',
    splitLow: false,
    streets: [
      { id: 'predraw', name: 'Predraw', dealToEach: 5, betting: true },
      { id: 'draw', name: 'The Draw', draw: true, maxDiscards: 5, betting: true, bigBet: true },
    ],
    popular: true,
  },
  {
    id: 'td27',
    name: '2-7 Triple Draw',
    short: '2-7',
    category: 'draw',
    limit: 'fl',
    holeCards: 5,
    maxSeats: 6,
    forced: 'blinds',
    hi: '27low',
    splitLow: false,
    streets: tripleDrawStreets(5),
    rankingNote: 'Lowest hand wins, aces are HIGH, and straights and flushes count against you. 7-5-4-3-2 is the nuts.',
    popular: true,
  },
  {
    id: 'a5td',
    name: 'A-5 Triple Draw',
    short: 'A-5',
    category: 'draw',
    limit: 'fl',
    holeCards: 5,
    maxSeats: 6,
    forced: 'blinds',
    hi: 'a5low',
    splitLow: false,
    streets: tripleDrawStreets(5),
    rankingNote: 'Lowest hand wins, aces are LOW, straights and flushes are ignored. 5-4-3-2-A is the nuts.',
    popular: false,
  },
  {
    id: 'badugi',
    name: 'Badugi',
    short: 'BDG',
    category: 'draw',
    limit: 'fl',
    holeCards: 4,
    maxSeats: 6,
    forced: 'blinds',
    hi: 'badugi',
    splitLow: false,
    streets: tripleDrawStreets(4),
    rankingNote: 'Four cards, all different suits and all different ranks, as low as possible.',
    popular: true,
  },
];

export const GAME_BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id: string): GameSpec {
  const g = GAME_BY_ID.get(id);
  if (!g) throw new Error(`unknown game: ${id}`);
  return g;
}

/** Classic mixed rotations. The game changes every orbit. */
export const MIXES: { id: string; name: string; games: string[] }[] = [
  { id: 'horse', name: 'H.O.R.S.E.', games: ['lhe', 'plo8', 'razz', 'stud', 'stud8'] },
  { id: 'he-plo', name: "Hold'em / Omaha", games: ['nlhe', 'plo'] },
  { id: 'draws', name: 'Draw Mix', games: ['draw5', 'td27', 'badugi'] },
  { id: 'all', name: 'Everything', games: GAMES.filter((g) => g.popular).map((g) => g.id) },
];

/** How many betting rounds a street list contains, used for pacing. */
export function bettingStreetCount(spec: GameSpec): number {
  return spec.streets.filter((s) => s.betting).length;
}

/** Cards a full table consumes, so we know when the muck must be recycled. */
export function maxCardsNeeded(spec: GameSpec, players: number): number {
  let n = 0;
  for (const s of spec.streets) {
    n += (s.dealToEach ?? 0) * players;
    n += (s.dealUpToEach ?? 0) * players;
    n += s.dealBoard ?? 0;
    if (s.burn) n += 1;
    if (s.draw) n += (s.maxDiscards ?? 0) * players;
  }
  return n;
}
