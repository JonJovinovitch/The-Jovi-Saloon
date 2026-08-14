/**
 * Card representation.
 *
 * A card is a single integer 0..51 encoded as `(rankIndex << 2) | suitIndex`.
 * rankIndex 0..12 maps to 2,3,4,5,6,7,8,9,T,J,Q,K,A
 * suitIndex 0..3  maps to clubs, diamonds, hearts, spades
 *
 * Integers keep the evaluator fast and the wire format tiny.
 */

export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Rank index of a card (0 = deuce, 12 = ace). */
export const rankOf = (c: Card): number => c >> 2;
/** Suit index of a card (0 = clubs .. 3 = spades). */
export const suitOf = (c: Card): number => c & 3;
/** Build a card from a rank index and suit index. */
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

/** "As", "Th", "2c" — the canonical short form. */
export function cardToString(c: Card): string {
  return RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
}

/** Parse "As" / "th" / "2C" back into a card. Throws on garbage. */
export function cardFromString(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase());
  const u = SUIT_CHARS.indexOf(s[1].toLowerCase());
  if (r < 0 || u < 0) throw new Error(`bad card: ${s}`);
  return makeCard(r, u);
}

/** Parse a whitespace separated list: "As Kd 7c". */
export function handFromString(s: string): Card[] {
  return s.trim().split(/[\s,]+/).filter(Boolean).map(cardFromString);
}

export function handToString(cards: Card[]): string {
  return cards.map(cardToString).join(' ');
}

/**
 * A fresh 52 card deck, or a 36 card short deck (sixes and up) when
 * `shortDeck` is set — used by 6+ Hold'em.
 */
export function makeDeck(shortDeck = false): Card[] {
  const deck: Card[] = [];
  const lowest = shortDeck ? 4 : 0; // rank index 4 === the six
  for (let r = lowest; r < 13; r++) {
    for (let s = 0; s < 4; s++) deck.push(makeCard(r, s));
  }
  return deck;
}

/**
 * Cryptographically seeded randomness where available. Node and browsers both
 * expose `crypto.getRandomValues`; we fall back to Math.random only if some
 * exotic runtime lacks it, which never happens on our server.
 */
function randomInt(maxExclusive: number): number {
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === 'function') {
    // Rejection sampling keeps the distribution flat.
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    let v: number;
    do {
      g.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

/** In-place Fisher-Yates using a CSPRNG. Returns the same array for chaining. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/**
 * A shoe that deals off the top and can burn cards. Every deal in the game
 * goes through one of these so the deck order is decided exactly once, at
 * shuffle time, and never re-derived.
 */
export class Deck {
  private cards: Card[];
  private index = 0;
  readonly burned: Card[] = [];

  constructor(shortDeck = false) {
    this.cards = shuffle(makeDeck(shortDeck));
  }

  get remaining(): number {
    return this.cards.length - this.index;
  }

  draw(): Card {
    if (this.index >= this.cards.length) throw new Error('deck exhausted');
    return this.cards[this.index++];
  }

  drawMany(n: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) out.push(this.draw());
    return out;
  }

  burn(): void {
    if (this.remaining > 0) this.burned.push(this.draw());
  }

  /**
   * Draw games can run the deck dry with a full table. Real card rooms
   * reshuffle the discards; we do the same rather than aborting the hand.
   */
  reshuffleFrom(discards: Card[]): void {
    if (discards.length === 0) return;
    const fresh = shuffle(discards.slice());
    this.cards = this.cards.slice(this.index).concat(fresh);
    this.index = 0;
  }
}
