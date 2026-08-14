/**
 * Practice bots.
 *
 * Deliberately simple: enough to fill seats so you can learn a variant or test
 * a change without rounding up eight friends. They estimate hand strength from
 * whatever cards they can see, compare it to the pot odds, and mix in a little
 * randomness so they are not perfectly readable.
 */

import { rankOf, suitOf, type Card } from '../../shared/src/cards.ts';
import {
  bestHigh,
  bestA5Low,
  best27Low,
  bestBadugi,
  unpack,
} from '../../shared/src/evaluator.ts';
import type { LegalActions, ActionType } from '../../shared/src/protocol.ts';
import type { HandEngine, EnginePlayer } from './engine.ts';

const BOT_NAMES = [
  'Doyle', 'Stu', 'Chip', 'Barbara', 'Vanessa', 'Phil', 'Jennifer',
  'Amarillo', 'Puggy', 'Johnny', 'Annie', 'Maria', 'Scotty', 'Huck',
];

let botCounter = 0;

export function nextBotName(): string {
  const base = BOT_NAMES[botCounter % BOT_NAMES.length];
  const round = Math.floor(botCounter / BOT_NAMES.length);
  botCounter++;
  return round === 0 ? base : `${base} ${round + 1}`;
}

/** Rough 0..1 estimate of how good this hand looks right now. */
function strength(e: HandEngine, p: EnginePlayer): number {
  const cards = e.spec.category === 'community' ? p.hole.concat(e.board) : p.hole;

  if (cards.length < 5) {
    // Pre-board: rank quality plus a pair / suited / connected bonus.
    const ranks = p.hole.map(rankOf).sort((a, b) => b - a);
    const suits = new Set(p.hole.map(suitOf));
    let s = (ranks[0] + (ranks[1] ?? 0)) / 26;
    const paired = new Set(ranks).size < ranks.length;
    if (paired) s += 0.28;
    if (suits.size < p.hole.length) s += 0.05;
    if (ranks.length > 1 && ranks[0] - ranks[1] === 1) s += 0.04;
    if (e.spec.hi !== 'high') s = 1 - s; // lowball: small cards are good
    return Math.max(0.02, Math.min(0.97, s));
  }

  switch (e.spec.hi) {
    case 'high': {
      const v = bestHigh(cards, !!e.spec.shortDeck);
      const { cat, kickers } = unpack(v.score);
      return Math.min(0.99, cat / 8.5 + kickers[0] / 260);
    }
    case 'a5low': {
      const v = bestA5Low(cards);
      const { cat, kickers } = unpack(v.score);
      if (cat > 0) return 0.15;
      return Math.max(0.05, 1 - kickers[0] / 12);
    }
    case '27low': {
      const v = best27Low(cards);
      const { cat, kickers } = unpack(v.score);
      if (cat > 0) return 0.15;
      return Math.max(0.05, 1 - kickers[0] / 12);
    }
    case 'badugi': {
      const v = bestBadugi(cards);
      return v.cards.length === 4 ? 0.75 : v.cards.length === 3 ? 0.35 : 0.12;
    }
  }
}

export function chooseBotAction(
  e: HandEngine,
  p: EnginePlayer,
  legal: LegalActions,
): { action: ActionType; amount?: number } {
  const s = strength(e, p);
  const roll = Math.random();
  const pot = Math.max(1, e.totalPot());

  const sizeBet = (fraction: number): number => {
    if (legal.fixedAmount !== null) return legal.fixedAmount;
    const want = Math.round(clamp(pot * fraction, legal.minRaiseTo, legal.maxRaiseTo));
    return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, want));
  };

  if (legal.canCheck) {
    if (legal.canBet && (s > 0.58 ? roll < 0.65 : roll < 0.09)) {
      return { action: 'bet', amount: sizeBet(s > 0.8 ? 0.75 : 0.5) };
    }
    return { action: 'check' };
  }

  const callCost = legal.callAmount;
  const odds = callCost / (pot + callCost);

  if (legal.canRaise && s > 0.78 && roll < 0.42) {
    return { action: 'raise', amount: sizeBet(0.8) };
  }
  if (s + 0.06 < odds && roll < 0.9) return { action: 'fold' };
  if (callCost >= p.stack && s < 0.6) return { action: 'fold' };
  return { action: 'call' };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Which cards to pitch. `exact` forces a count (Crazy Pineapple), otherwise it
 * is an upper bound.
 */
export function chooseBotDiscards(
  e: HandEngine,
  p: EnginePlayer,
  max: number,
  exact: number | null = null,
): Card[] {
  const hole = p.hole.slice();

  if (e.spec.category === 'community') {
    // Pineapple: throw the card least connected to the other two.
    const scores = hole.map((c, i) => {
      const others = hole.filter((_, j) => j !== i);
      let sc = rankOf(c);
      if (others.some((o) => rankOf(o) === rankOf(c))) sc += 30;
      if (others.some((o) => suitOf(o) === suitOf(c))) sc += 8;
      if (others.some((o) => Math.abs(rankOf(o) - rankOf(c)) <= 2)) sc += 5;
      return { c, sc };
    });
    scores.sort((a, b) => a.sc - b.sc);
    return scores.slice(0, exact ?? 1).map((x) => x.c);
  }

  if (e.spec.hi === 'badugi') {
    // Keep one card per suit, lowest first; pitch the duplicates.
    const sorted = hole
      .slice()
      .sort((a, b) => lowVal(a) - lowVal(b));
    const keepSuits = new Set<number>();
    const keepRanks = new Set<number>();
    const keep: Card[] = [];
    for (const c of sorted) {
      if (!keepSuits.has(suitOf(c)) && !keepRanks.has(lowVal(c))) {
        keepSuits.add(suitOf(c));
        keepRanks.add(lowVal(c));
        keep.push(c);
      }
    }
    return hole.filter((c) => !keep.includes(c)).slice(0, max);
  }

  if (e.spec.hi === '27low' || e.spec.hi === 'a5low') {
    const aceHigh = e.spec.hi === '27low';
    const val = (c: Card) => (aceHigh ? rankOf(c) : lowVal(c));
    // Anything above an eight is not low material in either ranking.
    const cap = aceHigh ? 6 : 7;
    const sorted = hole.slice().sort((a, b) => val(a) - val(b));
    const keep = new Set<Card>();
    for (const c of sorted) {
      if (keep.size >= 5) break;
      if ([...keep].some((k) => val(k) === val(c))) continue; // never keep a pair
      if (val(c) > cap) continue;
      keep.add(c);
    }
    const toss = hole.filter((c) => !keep.has(c));
    return toss.slice(0, max);
  }

  // Five card draw, high: keep pairs and better, plus the top kickers.
  const counts = new Map<number, Card[]>();
  for (const c of hole) {
    const list = counts.get(rankOf(c)) ?? [];
    list.push(c);
    counts.set(rankOf(c), list);
  }
  const groups = [...counts.values()].sort((a, b) => b.length - a.length || rankOf(b[0]) - rankOf(a[0]));
  const suitCount = new Map<number, number>();
  for (const c of hole) suitCount.set(suitOf(c), (suitCount.get(suitOf(c)) ?? 0) + 1);
  const flushSuit = [...suitCount.entries()].find(([, n]) => n >= 4)?.[0];

  let keep: Card[];
  if (flushSuit !== undefined) {
    keep = hole.filter((c) => suitOf(c) === flushSuit);
  } else if (groups[0].length >= 2) {
    keep = groups.filter((g) => g.length >= 2).flat();
    if (keep.length === 2) {
      const kickers = hole
        .filter((c) => !keep.includes(c))
        .sort((a, b) => rankOf(b) - rankOf(a))
        .slice(0, 1);
      keep = keep.concat(kickers);
    }
  } else {
    keep = hole.sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 2);
  }
  return hole.filter((c) => !keep.includes(c)).slice(0, max);
}

const lowVal = (c: Card): number => (rankOf(c) === 12 ? 0 : rankOf(c) + 1);
