/**
 * Hand evaluation for every game in the room.
 *
 * Four independent rank orders are needed:
 *   - high        : normal poker, best hand wins            (higher score wins)
 *   - ace-to-five : razz / the low half of hi-lo split      (lower score wins)
 *   - deuce-to-7  : 2-7 triple draw, straights+flushes hurt (lower score wins)
 *   - badugi      : distinct suits and ranks                (lower score wins)
 *
 * Every function returns a packed integer plus the five (or four) cards that
 * made the hand, so the table can highlight exactly what won.
 */

import { type Card, rankOf, suitOf, RANK_CHARS } from './cards.ts';

export interface HandValue {
  /** Packed comparison key. See each function for which direction wins. */
  score: number;
  /** The specific cards that formed the hand, best first. */
  cards: Card[];
}

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

const BASE = 15;
const P1 = BASE;
const P2 = BASE * BASE;
const P3 = P2 * BASE;
const P4 = P3 * BASE;
const P5 = P4 * BASE;

function pack(cat: number, k0 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0): number {
  return cat * P5 + k0 * P4 + k1 * P3 + k2 * P2 + k3 * P1 + k4;
}

export function unpack(score: number): { cat: number; kickers: number[] } {
  const cat = Math.floor(score / P5);
  let rest = score - cat * P5;
  const kickers: number[] = [];
  for (const p of [P4, P3, P2, P1, 1]) {
    const v = Math.floor(rest / p);
    rest -= v * p;
    kickers.push(v);
  }
  return { cat, kickers };
}

/* ------------------------------------------------------------------ */
/* combinations                                                        */
/* ------------------------------------------------------------------ */

const comboCache = new Map<string, number[][]>();

/** All k-sized index combinations of [0..n). Cached — the sets are tiny. */
export function combinations(n: number, k: number): number[][] {
  const key = `${n}:${k}`;
  const hit = comboCache.get(key);
  if (hit) return hit;
  const out: number[][] = [];
  const idx: number[] = [];
  (function rec(start: number): void {
    if (idx.length === k) {
      out.push(idx.slice());
      return;
    }
    for (let i = start; i < n; i++) {
      idx.push(i);
      rec(i + 1);
      idx.pop();
    }
  })(0);
  comboCache.set(key, out);
  return out;
}

function pick(cards: Card[], idx: number[]): Card[] {
  const out: Card[] = new Array(idx.length);
  for (let i = 0; i < idx.length; i++) out[i] = cards[idx[i]];
  return out;
}

/* ------------------------------------------------------------------ */
/* high hands                                                          */
/* ------------------------------------------------------------------ */

/**
 * Score exactly five cards for high. Higher wins.
 *
 * `shortDeck` applies the 6+ Hold'em ranking where a flush beats a full house
 * (there are fewer flush combinations in a 36 card deck) and the wheel runs
 * A-6-7-8-9 instead of A-2-3-4-5.
 */
export function evalHigh5(cards: Card[], shortDeck = false): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const suits = cards.map(suitOf);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2] && suits[2] === suits[3] && suits[3] === suits[4];

  // Rank multiplicities, ordered by count first then rank — this is the
  // ordering every paired category wants for its kickers.
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const lowest = shortDeck ? 4 : 0;
  let straightHigh = -1;
  if (groups.length === 5) {
    const set = new Set(ranks);
    for (let hi = 12; hi >= lowest + 4; hi--) {
      if (set.has(hi) && set.has(hi - 1) && set.has(hi - 2) && set.has(hi - 3) && set.has(hi - 4)) {
        straightHigh = hi;
        break;
      }
    }
    // The wheel: ace plays below the lowest card in the deck.
    if (straightHigh < 0) {
      if (set.has(12) && set.has(lowest) && set.has(lowest + 1) && set.has(lowest + 2) && set.has(lowest + 3)) {
        straightHigh = lowest + 3;
      }
    }
  }

  const FLUSH_CAT = shortDeck ? CATEGORY.FULL_HOUSE : CATEGORY.FLUSH;
  const BOAT_CAT = shortDeck ? CATEGORY.FLUSH : CATEGORY.FULL_HOUSE;

  if (straightHigh >= 0 && isFlush) return pack(CATEGORY.STRAIGHT_FLUSH, straightHigh);
  if (groups[0][1] === 4) return pack(CATEGORY.QUADS, groups[0][0], groups[1][0]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(BOAT_CAT, groups[0][0], groups[1][0]);
  if (isFlush) return pack(FLUSH_CAT, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]);
  if (straightHigh >= 0) return pack(CATEGORY.STRAIGHT, straightHigh);
  if (groups[0][1] === 3) return pack(CATEGORY.TRIPS, groups[0][0], groups[1][0], groups[2][0]);
  if (groups[0][1] === 2 && groups[1][1] === 2) return pack(CATEGORY.TWO_PAIR, groups[0][0], groups[1][0], groups[2][0]);
  if (groups[0][1] === 2) return pack(CATEGORY.PAIR, groups[0][0], groups[1][0], groups[2][0], groups[3][0]);
  return pack(CATEGORY.HIGH_CARD, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]);
}

/** Best five-card high hand out of any number of cards (>= 5). Higher wins. */
export function bestHigh(cards: Card[], shortDeck = false): HandValue {
  if (cards.length < 5) return { score: -1, cards: [] };
  if (cards.length === 5) return { score: evalHigh5(cards, shortDeck), cards: cards.slice() };
  let best = -1;
  let bestCards: Card[] = [];
  for (const idx of combinations(cards.length, 5)) {
    const five = pick(cards, idx);
    const s = evalHigh5(five, shortDeck);
    if (s > best) {
      best = s;
      bestCards = five;
    }
  }
  return { score: best, cards: sortForDisplay(bestCards) };
}

/**
 * Omaha-family rule: exactly `useHole` hole cards and exactly `useBoard`
 * board cards. Hold'em's "play the board" freedom does not apply.
 */
export function bestHighExact(
  hole: Card[],
  board: Card[],
  useHole: number,
  useBoard: number,
  shortDeck = false,
): HandValue {
  if (hole.length < useHole || board.length < useBoard) return { score: -1, cards: [] };
  let best = -1;
  let bestCards: Card[] = [];
  for (const hIdx of combinations(hole.length, useHole)) {
    const h = pick(hole, hIdx);
    for (const bIdx of combinations(board.length, useBoard)) {
      const five = h.concat(pick(board, bIdx));
      const s = evalHigh5(five, shortDeck);
      if (s > best) {
        best = s;
        bestCards = five;
      }
    }
  }
  return { score: best, cards: sortForDisplay(bestCards) };
}

/* ------------------------------------------------------------------ */
/* ace-to-five low (razz, the low half of hi-lo)                        */
/* ------------------------------------------------------------------ */

/** Ace is the lowest card: A=0, 2=1, ... K=12. */
const lowRank = (c: Card): number => (rankOf(c) === 12 ? 0 : rankOf(c) + 1);

const LOW_CAT = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, BOAT: 4, QUADS: 5 };

/**
 * Score five cards for ace-to-five low. LOWER wins. Straights and flushes are
 * ignored, so 5-4-3-2-A ("the wheel") is the nuts.
 */
export function evalA5Low5(cards: Card[]): number {
  const ranks = cards.map(lowRank).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // Ordered by count, then by rank ascending: in lowball the *smallest* pair
  // is the best pair, so ties break toward low ranks.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);

  if (groups[0][1] === 4) return pack(LOW_CAT.QUADS, groups[0][0], groups[1][0]);
  if (groups[0][1] === 3 && groups[1][1] === 2) return pack(LOW_CAT.BOAT, groups[0][0], groups[1][0]);
  if (groups[0][1] === 3) return pack(LOW_CAT.TRIPS, groups[0][0], groups[1][0], groups[2][0]);
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const [lo, hi] = [groups[0][0], groups[1][0]].sort((a, b) => a - b);
    return pack(LOW_CAT.TWO_PAIR, lo, hi, groups[2][0]);
  }
  if (groups[0][1] === 2) return pack(LOW_CAT.PAIR, groups[0][0], groups[1][0], groups[2][0], groups[3][0]);
  return pack(LOW_CAT.HIGH, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]);
}

/** Best ace-to-five low out of n cards. LOWER wins. Used by Razz. */
export function bestA5Low(cards: Card[]): HandValue {
  if (cards.length < 5) return { score: Infinity, cards: [] };
  let best = Infinity;
  let bestCards: Card[] = [];
  for (const idx of combinations(cards.length, 5)) {
    const five = pick(cards, idx);
    const s = evalA5Low5(five);
    if (s < best) {
      best = s;
      bestCards = five;
    }
  }
  return { score: best, cards: sortLowForDisplay(bestCards) };
}

/**
 * The qualifying low half of a split-pot game: five unpaired cards, all
 * eight-or-better. Returns null when no low is possible.
 */
export function bestQualifiedLow(cards: Card[], maxLowRank = 7): HandValue | null {
  // maxLowRank 7 === the eight (A=0, so 8 is index 7).
  const byRank = new Map<number, Card>();
  for (const c of cards) {
    const lr = lowRank(c);
    if (lr <= maxLowRank && !byRank.has(lr)) byRank.set(lr, c);
  }
  if (byRank.size < 5) return null;
  const chosen = [...byRank.entries()].sort((a, b) => a[0] - b[0]).slice(0, 5);
  const five = chosen.map((e) => e[1]);
  return { score: evalA5Low5(five), cards: sortLowForDisplay(five) };
}

/** Omaha-style exact selection for the low half. */
export function bestQualifiedLowExact(
  hole: Card[],
  board: Card[],
  useHole: number,
  useBoard: number,
  maxLowRank = 7,
): HandValue | null {
  let best: HandValue | null = null;
  for (const hIdx of combinations(hole.length, useHole)) {
    const h = pick(hole, hIdx);
    for (const bIdx of combinations(board.length, useBoard)) {
      const five = h.concat(pick(board, bIdx));
      if (five.some((c) => lowRank(c) > maxLowRank)) continue;
      if (new Set(five.map(lowRank)).size !== 5) continue;
      const score = evalA5Low5(five);
      if (!best || score < best.score) best = { score, cards: sortLowForDisplay(five) };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* deuce-to-seven low                                                  */
/* ------------------------------------------------------------------ */

/**
 * 2-7 ("Kansas City") lowball. Ace is always high, straights and flushes
 * count against you — so it is literally the high evaluator, minimised.
 * LOWER wins; 7-5-4-3-2 offsuit is the nuts.
 */
export function best27Low(cards: Card[]): HandValue {
  if (cards.length < 5) return { score: Infinity, cards: [] };
  let best = Infinity;
  let bestCards: Card[] = [];
  const sets = cards.length === 5 ? [[0, 1, 2, 3, 4]] : combinations(cards.length, 5);
  for (const idx of sets) {
    const five = pick(cards, idx);
    const s = evalHigh5(five, false);
    if (s < best) {
      best = s;
      bestCards = five;
    }
  }
  return { score: best, cards: sortForDisplay(bestCards) };
}

/* ------------------------------------------------------------------ */
/* badugi                                                              */
/* ------------------------------------------------------------------ */

/**
 * Badugi: take the largest subset with all-different suits and all-different
 * ranks, then the lowest ranks. LOWER wins. A four-card badugi always beats
 * any three-card hand.
 */
export function bestBadugi(cards: Card[]): HandValue {
  let bestSize = 0;
  let bestKey = Infinity;
  let bestCards: Card[] = [];
  for (let size = 4; size >= 1; size--) {
    if (size > cards.length) continue;
    for (const idx of combinations(cards.length, size)) {
      const sel = pick(cards, idx);
      const suits = new Set(sel.map(suitOf));
      const ranks = new Set(sel.map(lowRank));
      if (suits.size !== size || ranks.size !== size) continue;
      const desc = sel.map(lowRank).sort((a, b) => b - a);
      let key = 0;
      for (let i = 0; i < 4; i++) key = key * BASE + (desc[i] ?? 0);
      if (size > bestSize || (size === bestSize && key < bestKey)) {
        bestSize = size;
        bestKey = key;
        bestCards = sel;
      }
    }
    if (bestSize === size) break; // no smaller subset can beat a bigger badugi
  }
  const score = (4 - bestSize) * P4 * BASE + bestKey;
  return { score, cards: sortLowForDisplay(bestCards) };
}

/* ------------------------------------------------------------------ */
/* display helpers                                                     */
/* ------------------------------------------------------------------ */

/** Order a made hand so the meaningful cards read left to right. */
function sortForDisplay(cards: Card[]): Card[] {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  return cards
    .slice()
    .sort((a, b) => (counts.get(rankOf(b))! - counts.get(rankOf(a))!) || rankOf(b) - rankOf(a));
}

function sortLowForDisplay(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => lowRank(b) - lowRank(a));
}

const SINGULAR = ['Deuce', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const PLURAL = ['Deuces', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

/** "Full House, Kings full of Threes" — for the showdown banner. */
export function describeHigh(score: number, shortDeck = false): string {
  if (score < 0) return '';
  const { cat, kickers } = unpack(score);
  const flushCat = shortDeck ? CATEGORY.FULL_HOUSE : CATEGORY.FLUSH;
  const boatCat = shortDeck ? CATEGORY.FLUSH : CATEGORY.FULL_HOUSE;
  switch (cat) {
    case CATEGORY.STRAIGHT_FLUSH:
      return kickers[0] === 12 ? 'Royal Flush' : `Straight Flush, ${SINGULAR[kickers[0]]} high`;
    case CATEGORY.QUADS:
      return `Four of a Kind, ${PLURAL[kickers[0]]}`;
    case boatCat:
      return `Full House, ${PLURAL[kickers[0]]} full of ${PLURAL[kickers[1]]}`;
    case flushCat:
      return `Flush, ${SINGULAR[kickers[0]]} high`;
    case CATEGORY.STRAIGHT:
      return `Straight, ${SINGULAR[kickers[0]]} high`;
    case CATEGORY.TRIPS:
      return `Three of a Kind, ${PLURAL[kickers[0]]}`;
    case CATEGORY.TWO_PAIR:
      return `Two Pair, ${PLURAL[kickers[0]]} and ${PLURAL[kickers[1]]}`;
    case CATEGORY.PAIR:
      return `Pair of ${PLURAL[kickers[0]]}`;
    default:
      return `${SINGULAR[kickers[0]]} high`;
  }
}

const LOW_CHARS = 'A23456789TJQK';

/** "7-6-4-3-A low" */
export function describeLow(score: number): string {
  if (!isFinite(score)) return '';
  const { cat, kickers } = unpack(score);
  if (cat === LOW_CAT.HIGH) {
    return kickers.map((k) => LOW_CHARS[k]).join('-') + ' low';
  }
  const names = ['', 'Pair', 'Two Pair', 'Trips', 'Full House', 'Quads'];
  return `${names[cat]} (low)`;
}

export function describeBadugi(score: number): string {
  const size = 4 - Math.floor(score / (P4 * BASE));
  let rest = score % (P4 * BASE);
  const digits: number[] = [];
  for (const p of [P3, P2, P1, 1]) {
    digits.push(Math.floor(rest / p));
    rest %= p;
  }
  const shown = digits.slice(4 - size);
  const label = size === 4 ? 'Badugi' : `${size}-card`;
  return `${shown.map((d) => LOW_CHARS[d]).join('-')} ${label}`;
}

/** Rank char for logs and tests. */
export const rankChar = (c: Card): string => RANK_CHARS[rankOf(c)];
