/** Card DOM: a flippable element with a printed face and a patterned back. */

import { RANK_CHARS, SUIT_SYMBOLS, rankOf, suitOf, type Card } from '@shared/cards.ts';

export function createCardEl(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="back"></div>
    <div class="face">
      <div class="corner tl"><span class="r"></span><span class="s"></span></div>
      <div class="pip"></div>
      <div class="corner br"><span class="r"></span><span class="s"></span></div>
    </div>`;
  return el;
}

/** Paint a card, or `null` to leave it face down. */
export function setCardFace(el: HTMLElement, card: Card | null): void {
  if (card === null || card === undefined) {
    el.classList.remove('faceup', 'red');
    el.dataset.card = '';
    return;
  }
  const r = RANK_CHARS[rankOf(card)];
  // "T" is a useful compact notation for code and hand histories, but real
  // playing cards print the rank as 10.
  const displayRank = r === 'T' ? '10' : r;
  const s = SUIT_SYMBOLS[suitOf(card)];
  const red = suitOf(card) === 1 || suitOf(card) === 2;
  el.classList.toggle('red', red);
  for (const node of el.querySelectorAll<HTMLElement>('.corner .r')) node.textContent = displayRank;
  for (const node of el.querySelectorAll<HTMLElement>('.corner .s')) node.textContent = s;
  const pip = el.querySelector<HTMLElement>('.pip');
  if (pip) pip.textContent = s;
  el.dataset.card = String(card);
  el.dataset.rank = displayRank;
  el.classList.add('faceup');
}

const CHIP_COLORS: [number, string, string][] = [
  [1000, '#e0c169', '#8a6d24'],
  [500, '#9a63d8', '#5b3184'],
  [100, '#1c222c', '#5a6272'],
  [25, '#2f9e63', '#186a3d'],
  [5, '#cf3b46', '#8a1f28'],
  [1, '#e9edf2', '#9aa5b4'],
];

/** A small stack of chips whose colours read as the amount, casino-style. */
export function chipStack(amount: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chip-stack';
  let left = amount;
  const picks: [string, string][] = [];
  for (const [denom, c1, c2] of CHIP_COLORS) {
    while (left >= denom && picks.length < 4) {
      picks.push([c1, c2]);
      left -= denom;
    }
    if (picks.length >= 4) break;
  }
  if (picks.length === 0) picks.push(['#e9edf2', '#9aa5b4']);
  picks.forEach(([c1, c2], i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.style.setProperty('--c1', c1);
    chip.style.setProperty('--c2', c2);
    chip.style.bottom = `${i * 0.35}vmin`;
    chip.style.zIndex = String(i);
    wrap.appendChild(chip);
  });
  wrap.style.height = `calc(2.1vmin + ${(picks.length - 1) * 0.35}vmin)`;
  return wrap;
}

export function chipColorFor(amount: number): [string, string] {
  for (const [denom, c1, c2] of CHIP_COLORS) if (amount >= denom) return [c1, c2];
  return ['#e9edf2', '#9aa5b4'];
}

/** 1234 -> "1,234"; 1500000 -> "1.5M" */
export function fmtChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  return n.toLocaleString('en-US');
}
