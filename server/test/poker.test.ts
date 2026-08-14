import test from 'node:test';
import assert from 'node:assert/strict';

import { handFromString, cardToString } from '../../shared/src/cards.ts';
import {
  evalHigh5,
  bestHigh,
  bestHighExact,
  bestA5Low,
  best27Low,
  bestBadugi,
  bestQualifiedLow,
  describeHigh,
} from '../../shared/src/evaluator.ts';
import { GAMES, getGame } from '../../shared/src/games.ts';
import { HandEngine } from '../src/engine.ts';
import { DEFAULT_STAKES } from '../../shared/src/protocol.ts';

const h = handFromString;

/* ------------------------------------------------------------------ */
/* high hands                                                          */
/* ------------------------------------------------------------------ */

test('high hand categories rank in the right order', () => {
  const ordered = [
    'As Ks Qs Js Ts', // royal
    '9h 8h 7h 6h 5h', // straight flush
    '7c 7d 7h 7s 2c', // quads
    'Kc Kd Kh 3s 3c', // full house
    'Ac Jc 8c 5c 2c', // flush
    '9c 8d 7h 6s 5c', // straight
    'Qc Qd Qh 4s 2c', // trips
    'Jc Jd 5h 5s 9c', // two pair
    'Tc Td 8h 4s 2c', // pair
    'Ac Qd 9h 5s 3c', // high card
  ].map(h);
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.ok(
      evalHigh5(ordered[i]) > evalHigh5(ordered[i + 1]),
      `${i} should beat ${i + 1}`,
    );
  }
});

test('the wheel is a five-high straight', () => {
  assert.equal(describeHigh(evalHigh5(h('5c 4d 3h 2s Ac'))), 'Straight, Five high');
  assert.ok(evalHigh5(h('6c 5d 4h 3s 2c')) > evalHigh5(h('5c 4d 3h 2s Ac')));
});

test('kickers break ties', () => {
  assert.ok(evalHigh5(h('Ac Ad Kh 7s 4c')) > evalHigh5(h('Ac Ad Qh 7s 4c')));
  assert.equal(evalHigh5(h('Ac Ad Kh 7s 4c')), evalHigh5(h('Ah As Kd 7c 4d')));
});

test('best five out of seven', () => {
  const v = bestHigh(h('As Ah Ad 7c 7d 2s 3h'));
  assert.equal(describeHigh(v.score), 'Full House, Aces full of Sevens');
  assert.equal(v.cards.length, 5);
});

test('short deck ranks a flush above a full house', () => {
  const flush = h('Ah Jh 9h 8h 6h');
  const boat = h('Kc Kd Kh 7s 7c');
  assert.ok(evalHigh5(flush, true) > evalHigh5(boat, true));
  assert.ok(evalHigh5(flush, false) < evalHigh5(boat, false));
});

test('short deck low straight is A-6-7-8-9', () => {
  assert.equal(describeHigh(evalHigh5(h('9c 8d 7h 6s Ac'), true), true), 'Straight, Nine high');
});

/* ------------------------------------------------------------------ */
/* omaha                                                               */
/* ------------------------------------------------------------------ */

test('omaha forces exactly two hole cards and three board cards', () => {
  // Four hearts in hand but only two on the board: no flush, because three
  // board cards must play. Hold'em would call this a flush.
  const hole = h('Ah Kh Qh Jh');
  const twoHearts = h('2h 5h 9c 3s 4d');
  const v = bestHighExact(hole, twoHearts, 2, 3);
  assert.notEqual(describeHigh(v.score).slice(0, 5), 'Flush');
  assert.equal(describeHigh(bestHigh(hole.concat(twoHearts)).score).slice(0, 5), 'Flush');

  // Two hearts in hand and three on the board is a flush.
  const threeHearts = h('2h 5h 9h 3c 4d');
  assert.equal(describeHigh(bestHighExact(h('Ah Kh 7c 8d'), threeHearts, 2, 3).score), 'Flush, Ace high');
});

/* ------------------------------------------------------------------ */
/* lowball                                                             */
/* ------------------------------------------------------------------ */

test('ace-to-five: the wheel is the nuts and straights do not matter', () => {
  const wheel = bestA5Low(h('5c 4d 3h 2s Ac'));
  const sixLow = bestA5Low(h('6c 4d 3h 2s Ac'));
  assert.ok(wheel.score < sixLow.score);
  const paired = bestA5Low(h('2c 2d 3h 4s 5c'));
  assert.ok(sixLow.score < paired.score, 'any no-pair low beats a pair');
});

test('ace-to-five picks the best five of seven', () => {
  const v = bestA5Low(h('Ac 2d 3h 4s 5c Kd Kh'));
  assert.equal(v.cards.length, 5);
  assert.equal(v.score, bestA5Low(h('5c 4s 3h 2d Ac')).score);
});

test('eight-or-better qualifier', () => {
  assert.equal(bestQualifiedLow(h('9c Td Jh Qs Kc 2d 3h')), null, 'no five cards under nine');
  const ok = bestQualifiedLow(h('8c 7d 6h 5s 4c Kd Kh'));
  assert.ok(ok && ok.cards.length === 5);
  const better = bestQualifiedLow(h('8c 7d 6h 5s Ac Kd Kh'));
  assert.ok(better && ok && better.score < ok.score);
});

test('deuce-to-seven: straights and flushes count against you', () => {
  const nuts = best27Low(h('7c 5d 4h 3s 2c'));
  const straight = best27Low(h('6c 5d 4h 3s 2c'));
  const wheelWithAce = best27Low(h('5c 4d 3h 2s Ac'));
  assert.ok(nuts.score < straight.score, 'a straight is a bad 2-7 hand');
  assert.ok(nuts.score < wheelWithAce.score, 'the ace plays high in 2-7');
  const flush = best27Low(h('7c 5c 4c 3c 2c'));
  assert.ok(nuts.score < flush.score, 'a flush is a bad 2-7 hand');
});

test('badugi counts distinct suits and ranks', () => {
  const four = bestBadugi(h('Ac 2d 3h 4s'));
  const three = bestBadugi(h('Ac 2c 3h 4s'));
  assert.equal(four.cards.length, 4);
  assert.equal(three.cards.length, 3);
  assert.ok(four.score < three.score, 'any badugi beats a three-card hand');
  const better = bestBadugi(h('Ac 2d 3h 4s'));
  const worse = bestBadugi(h('Ac 2d 3h 5s'));
  assert.ok(better.score < worse.score);
});

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

function seats(n: number, stack = 1000) {
  return Array.from({ length: n }, (_, i) => ({ seat: i, stack, sittingOut: false }));
}

/** Drive a whole hand with random legal choices. */
function playRandomHand(gameId: string, playerCount: number, stack = 1000): HandEngine {
  const spec = getGame(gameId);
  const e = new HandEngine({
    spec,
    stakes: { ...DEFAULT_STAKES },
    seats: seats(playerCount, stack),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  for (let guard = 0; guard < 5000 && !e.finished; guard++) {
    const w = e.waiting;
    if (!w) break;
    if (w.kind === 'act') {
      const legal = e.legalFor(w.seat)!;
      const p = e.player(w.seat)!;
      const roll = Math.random();
      if (legal.canRaise || legal.canBet) {
        if (roll < 0.25) {
          const span = legal.maxRaiseTo - legal.minRaiseTo;
          const to = Math.floor(legal.minRaiseTo + Math.random() * (span + 1));
          const err = e.act(w.seat, legal.canBet ? 'bet' : 'raise', to);
          assert.equal(err, null, `raise rejected: ${err} (${gameId})`);
          continue;
        }
      }
      if (roll < 0.45 && legal.canCheck) e.act(w.seat, 'check');
      else if (roll < 0.62 && !legal.canCheck) e.act(w.seat, 'fold');
      else if (legal.canCall) e.act(w.seat, 'call');
      else if (legal.canCheck) e.act(w.seat, 'check');
      else e.act(w.seat, 'fold');
      assert.ok(p.stack >= 0, 'stack went negative');
    } else if (w.kind === 'draw') {
      const p = e.player(w.seat)!;
      const max = Math.min(e.street.maxDiscards ?? 0, p.hole.length);
      const n = Math.floor(Math.random() * (max + 1));
      const err = e.discard(w.seat, p.hole.slice(0, n));
      assert.equal(err, null, `draw rejected: ${err} (${gameId})`);
    } else {
      const seat = w.seats[0];
      const p = e.player(seat)!;
      const err = e.discard(seat, p.hole.slice(0, w.count));
      assert.equal(err, null, `discard rejected: ${err} (${gameId})`);
    }
  }
  return e;
}

test('every game plays to completion and conserves chips', () => {
  for (const spec of GAMES) {
    for (const count of [2, 3, Math.min(6, spec.maxSeats), spec.maxSeats]) {
      for (let i = 0; i < 12; i++) {
        const e = playRandomHand(spec.id, count);
        assert.ok(e.finished, `${spec.id} with ${count} players did not finish`);
        const total = e.players.reduce((n, p) => n + p.stack, 0);
        assert.equal(total, count * 1000, `${spec.id}: chips changed (${total} vs ${count * 1000})`);
        for (const p of e.players) assert.ok(p.stack >= 0, `${spec.id}: negative stack`);
      }
    }
  }
});

test('short stacks produce side pots that pay out exactly', () => {
  for (let i = 0; i < 200; i++) {
    const spec = getGame('nlhe');
    const stacks = [120, 400, 1000, 55];
    const e = new HandEngine({
      spec,
      stakes: { ...DEFAULT_STAKES },
      seats: stacks.map((stack, seat) => ({ seat, stack, sittingOut: false })),
      buttonSeat: 0,
      handId: 1,
    });
    e.start();
    for (let guard = 0; guard < 500 && !e.finished; guard++) {
      const w = e.waiting;
      if (!w || w.kind !== 'act') break;
      // Everyone jams or calls — the fastest route to layered side pots.
      const legal = e.legalFor(w.seat)!;
      if (Math.random() < 0.6 && (legal.canBet || legal.canRaise)) e.act(w.seat, 'allin');
      else if (legal.canCall) e.act(w.seat, 'call');
      else e.act(w.seat, 'check');
    }
    const total = e.players.reduce((n, p) => n + p.stack, 0);
    assert.equal(total, 1575, 'side pot payout lost or created chips');
  }
});

test('a folded-around hand pays the last player standing', () => {
  const e = new HandEngine({
    spec: getGame('nlhe'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(4),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  while (e.waiting?.kind === 'act' && e.live().length > 1) {
    e.act(e.waiting.seat, 'fold');
  }
  assert.ok(e.finished);
  const winner = e.players.find((p) => p.won > 0)!;
  assert.equal(winner.stack, 1000 + DEFAULT_STAKES.smallBlind);
});

test('a player cannot act out of turn or bet more than the maximum', () => {
  const e = new HandEngine({
    spec: getGame('nlhe'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(3),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  const turn = (e.waiting as { seat: number }).seat;
  const other = e.players.find((p) => p.seat !== turn)!.seat;
  assert.equal(e.act(other, 'call'), 'not your turn');
  assert.match(e.act(turn, 'raise', 999_999) ?? '', /maximum/);
  assert.match(e.act(turn, 'raise', 11) ?? '', /minimum/);
  assert.equal(e.act(turn, 'call'), null);
});

test('pot limit caps the raise at the size of the pot', () => {
  const e = new HandEngine({
    spec: getGame('plo'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(3),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  const seat = (e.waiting as { seat: number }).seat;
  const legal = e.legalFor(seat)!;
  // Pot is 15 (SB 5 + BB 10); calling 10 makes it 25, so the max raise is 35.
  assert.equal(legal.maxRaiseTo, 35);
  assert.equal(legal.minRaiseTo, 20);
});

test('fixed limit locks the bet size and caps the raises', () => {
  const e = new HandEngine({
    spec: getGame('lhe'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(5),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  let bets = 0;
  while (e.waiting?.kind === 'act') {
    const legal = e.legalFor(e.waiting.seat)!;
    if (legal.canRaise) {
      assert.equal(legal.fixedAmount, legal.maxRaiseTo);
      e.act(e.waiting.seat, 'raise', legal.fixedAmount!);
      bets++;
    } else {
      assert.ok(bets >= 4, 'raising should only close after the cap');
      break;
    }
    if (bets > 6) break;
  }
  assert.equal(bets, 4, 'a bet and three raises');
});

test('stud deals up-cards everyone can see and posts a bring-in', () => {
  const e = new HandEngine({
    spec: getGame('stud'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(5),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  for (const p of e.players) {
    assert.equal(p.hole.length, 3);
    assert.deepEqual(p.faceUp, [false, false, true]);
  }
  assert.ok(e.totalPot() > 0, 'antes and bring-in are in the pot');
  const bringIn = e.players.find((p) => p.lastAction === 'bring-in');
  assert.ok(bringIn, 'someone brought it in');
});

test('crazy pineapple takes a card away after the flop', () => {
  const e = new HandEngine({
    spec: getGame('pineapple'),
    stakes: { ...DEFAULT_STAKES },
    seats: seats(4),
    buttonSeat: 0,
    handId: 1,
  });
  e.start();
  for (const p of e.players) assert.equal(p.hole.length, 3);
  let saw = false;
  for (let guard = 0; guard < 200 && !e.finished; guard++) {
    const w = e.waiting;
    if (!w) break;
    if (w.kind === 'act') {
      const legal = e.legalFor(w.seat)!;
      e.act(w.seat, legal.canCheck ? 'check' : 'call');
    } else if (w.kind === 'discard') {
      saw = true;
      const seat = w.seats[0];
      e.discard(seat, e.player(seat)!.hole.slice(0, 1));
    } else {
      e.discard(w.seat, []);
    }
  }
  assert.ok(saw, 'the flop discard happened');
  for (const p of e.live()) assert.equal(p.hole.length, 2);
});

test('the same card is never dealt twice in a hand', () => {
  for (const id of ['nlhe', 'plo', 'stud', 'draw5', 'badugi']) {
    const e = playRandomHand(id, Math.min(6, getGame(id).maxSeats));
    const seen = new Set<number>();
    for (const p of e.players) {
      for (const c of p.hole) {
        // Draw games recycle the muck, so only live hands must be unique.
        if (!p.folded) {
          assert.ok(!seen.has(c), `${id}: duplicate card ${cardToString(c)}`);
          seen.add(c);
        }
      }
    }
    for (const c of e.board) {
      assert.ok(!seen.has(c), `${id}: board card also in a hand`);
      seen.add(c);
    }
  }
});
