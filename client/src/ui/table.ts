/**
 * The felt.
 *
 * Rendering is state-driven: `render()` reconciles the DOM against the latest
 * TableView, and anything that newly appeared is marked "fresh". A separate
 * pass then flies those elements in from the deck, so animation never has to
 * agree with the server about sequencing - it only has to agree about what is
 * on the table right now. Server events are used for the things state cannot
 * express: chips being swept into the pot, and pots being pushed to a winner.
 */

import type { Card } from '@shared/cards.ts';
import type { GameEvent, SeatView, TableView, YouView } from '@shared/protocol.ts';
import { createCardEl, setCardFace, chipStack, chipColorFor, fmtChips } from './cards.ts';
import { avatarSvg } from './avatar.ts';
import { getAvatar } from '@shared/avatars.ts';
import { sfx } from '../sound.ts';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface SeatEl {
  root: HTMLElement;
  cards: HTMLElement;
  plate: HTMLElement;
  avatar: HTMLElement;
  name: HTMLElement;
  stack: HTMLElement;
  badge: HTMLElement;
  handLabel: HTMLElement;
  bubble: HTMLElement;
  timer: HTMLElement;
  sitBtn: HTMLButtonElement;
  bet: HTMLElement;
}

export interface TableCallbacks {
  onSit(seat: number): void;
  onToggleCard(card: Card): void;
  onChangeAvatar(): void;
}

export class TableRenderer {
  readonly root: HTMLElement;
  private felt!: HTMLElement;
  private seatsLayer!: HTMLElement;
  private betsLayer!: HTMLElement;
  private boardEl!: HTMLElement;
  private potsEl!: HTMLElement;
  private streetEl!: HTMLElement;
  private deckEl!: HTMLElement;
  private fx!: HTMLElement;
  private dealerBtn!: HTMLElement;
  private promptEl!: HTMLElement;

  private seatEls = new Map<number, SeatEl>();
  private boardCards: HTMLElement[] = [];
  private lastBets = new Map<number, number>();
  private prevBets = new Map<number, number>();
  private lastHandId = -1;
  private heroSeat: number | null = null;
  private seatCap = 9;
  private timerRaf = 0;
  private view: TableView | null = null;
  private lastCommentKey = new Map<number, string>();

  /** Cards the local player has picked to throw away. */
  selected = new Set<Card>();

  constructor(private cb: TableCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'stage';
    this.root.innerHTML = `
      <div class="table">
        <div class="rail"><div class="rivets"></div></div>
        <div class="felt">
          <div class="felt-logo">
            <span class="star">&starf;</span>
            <span class="fl-name">The Jovi Saloon</span>
            <span class="est">&mdash; Est. 1876 &mdash;</span>
          </div>
          <div class="deck"></div>
          <div class="center">
            <div class="street-line"></div>
            <div class="board"></div>
            <div class="pot-row"></div>
          </div>
          <div class="seats"></div>
          <div class="bets"></div>
          <div class="dealer-btn">D</div>
          <div class="fx"></div>
          <div class="center-prompt" hidden></div>
        </div>
      </div>`;

    const q = <T extends HTMLElement>(sel: string): T => this.root.querySelector(sel) as T;
    this.felt = q('.felt');
    this.seatsLayer = q('.seats');
    this.betsLayer = q('.bets');
    this.boardEl = q('.board');
    this.potsEl = q('.pot-row');
    this.streetEl = q('.street-line');
    this.deckEl = q('.deck');
    this.fx = q('.fx');
    this.dealerBtn = q('.dealer-btn');
    this.promptEl = q('.center-prompt');
    this.buildRivets(q('.rivets'));
  }

  /** Brass tacks around the leather rail, the way a real one is upholstered. */
  private buildRivets(layer: HTMLElement): void {
    const count = 44;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const dot = document.createElement('span');
      dot.className = 'rivet';
      dot.style.left = `${50 + 48.3 * Math.cos(a)}%`;
      dot.style.top = `${50 + 46.6 * Math.sin(a)}%`;
      layer.appendChild(dot);
    }
  }

  /* ---------------------------------------------------------------- */
  /* geometry                                                          */
  /* ---------------------------------------------------------------- */

  /** Rotate the ring so the local player always sits at the bottom. */
  private displayIndex(seat: number): number {
    const hero = this.heroSeat ?? 0;
    return (seat - hero + this.seatCap * 2) % this.seatCap;
  }

  private seatPosition(seat: number): { x: number; y: number } {
    const i = this.displayIndex(seat);
    const angle = (90 + (i * 360) / this.seatCap) * (Math.PI / 180);
    // Reserve room for the action bar. The hero is deliberately pulled up so
    // their cards and nameplate never disappear behind the bottom controls.
    const y = 51 + 41 * Math.sin(angle);
    return { x: 50 + 45 * Math.cos(angle), y: i === 0 ? Math.min(y, 83) : y };
  }

  /** Where a player's committed chips sit: pulled in toward the pot. */
  private betPosition(seat: number): { x: number; y: number } {
    const p = this.seatPosition(seat);
    return { x: 50 + (p.x - 50) * 0.55, y: 48 + (p.y - 51) * 0.52 };
  }

  /* ---------------------------------------------------------------- */
  /* seats                                                             */
  /* ---------------------------------------------------------------- */

  private ensureSeat(seat: number): SeatEl {
    const found = this.seatEls.get(seat);
    if (found) return found;

    const root = document.createElement('div');
    root.className = 'seat';
    root.innerHTML = `
      <div class="seat-cards"></div>
      <div class="plate">
        <div class="badge" hidden></div>
        <div class="avatar"></div>
        <div class="comment-bubble" hidden></div>
        <div class="who"><div class="name"></div><div class="stack"></div></div>
        <div class="timer"></div>
      </div>
      <div class="hand-label" hidden></div>
      <button class="sit-btn" hidden>Sit here</button>`;

    const bet = document.createElement('div');
    bet.className = 'bet';
    bet.hidden = true;
    this.betsLayer.appendChild(bet);

    const el: SeatEl = {
      root,
      cards: root.querySelector('.seat-cards')!,
      plate: root.querySelector('.plate')!,
      avatar: root.querySelector('.avatar')!,
      name: root.querySelector('.name')!,
      stack: root.querySelector('.stack')!,
      badge: root.querySelector('.badge')!,
      handLabel: root.querySelector('.hand-label')!,
      bubble: root.querySelector('.comment-bubble')!,
      timer: root.querySelector('.timer')!,
      sitBtn: root.querySelector('.sit-btn')!,
      bet,
    };
    el.sitBtn.addEventListener('click', () => this.cb.onSit(seat));
    this.seatsLayer.appendChild(root);
    this.seatEls.set(seat, el);
    return el;
  }

  /* ---------------------------------------------------------------- */
  /* render                                                            */
  /* ---------------------------------------------------------------- */

  render(view: TableView, you: YouView): void {
    const newHand = view.handId !== this.lastHandId;
    if (newHand) {
      this.selected.clear();
      this.lastBets.clear();
      this.clearFx();
    }
    this.lastHandId = view.handId;
    this.view = view;

    const heroChanged = this.heroSeat !== you.seat || this.seatCap !== view.seatCap;
    this.heroSeat = you.seat;
    this.seatCap = Math.max(2, view.seatCap);

    const bySeat = new Map(view.seats.map((s) => [s.seat, s]));
    const fresh: HTMLElement[] = [];

    for (let seat = 0; seat < this.seatCap; seat++) {
      const el = this.ensureSeat(seat);
      const pos = this.seatPosition(seat);
      el.root.style.setProperty('--x', `${pos.x}%`);
      el.root.style.setProperty('--y', `${pos.y}%`);
      const bp = this.betPosition(seat);
      el.bet.style.setProperty('--bx', `${bp.x}%`);
      el.bet.style.setProperty('--by', `${bp.y}%`);

      const s = bySeat.get(seat);
      if (!s) {
        el.root.className = 'seat empty';
        el.root.classList.toggle('hero', false);
        el.plate.hidden = true;
        el.sitBtn.hidden = you.seat !== null;
        el.cards.replaceChildren();
        el.bet.hidden = true;
        el.handLabel.hidden = true;
        continue;
      }

      el.plate.hidden = false;
      el.sitBtn.hidden = true;
      this.renderSeat(el, s, seat === you.seat, view, you, fresh, heroChanged);
    }

    this.renderBoard(view, fresh);
    this.renderPots(view);
    this.renderDealerButton(view);
    this.streetEl.textContent = view.state === 'running' || view.state === 'showdown' ? view.streetName : '';

    // Remember bets so the next 'collect' event knows where chips flew from.
    this.prevBets = new Map(this.lastBets);
    this.lastBets = new Map(view.seats.map((s) => [s.seat, s.bet]));

    this.flyIn(fresh);
    this.runTimer();
  }

  private renderSeat(
    el: SeatEl,
    s: SeatView,
    isHero: boolean,
    view: TableView,
    you: YouView,
    fresh: HTMLElement[],
    forceRebuild: boolean,
  ): void {
    const classes = ['seat'];
    if (isHero) classes.push('hero');
    if (s.folded) classes.push('folded');
    if (s.sittingOut) classes.push('sitout');
    if (s.disconnected) classes.push('disconnected');
    if (view.toActSeat === s.seat) classes.push('acting');
    if (s.won > 0) classes.push('winner');
    el.root.className = classes.join(' ');

    if (el.name.textContent !== s.name) el.name.textContent = s.name;
    el.stack.textContent = s.allIn ? 'ALL IN' : fmtChips(s.stack);

    if (el.avatar.dataset.av !== s.avatarId) {
      el.avatar.dataset.av = s.avatarId;
      el.avatar.innerHTML = avatarSvg(s.avatarId);
    }
    // Your own portrait is the way back into the character picker.
    el.avatar.classList.toggle('clickable', isHero);
    el.avatar.title = isHero ? 'Change character' : getAvatar(s.avatarId).name;
    el.avatar.onclick = isHero ? () => this.cb.onChangeAvatar() : null;

    // Action badge
    const label = s.lastDrawCount !== null && view.state === 'running'
      ? s.lastDrawCount === 0
        ? 'Pat'
        : `Drew ${s.lastDrawCount}`
      : s.lastAction;
    if (label) {
      el.badge.hidden = false;
      el.badge.textContent = label;
      el.badge.className = 'badge';
      if (/fold/i.test(label)) el.badge.classList.add('fold');
      else if (/all in/i.test(label)) el.badge.classList.add('allin');
      else if (/bet|raise|bring/i.test(label)) el.badge.classList.add('aggro');
    } else {
      el.badge.hidden = true;
    }
    const commentKey = `${view.handId}:${label ?? ''}`;
    if (label && this.lastCommentKey.get(s.seat) !== commentKey) {
      this.lastCommentKey.set(s.seat, commentKey);
      el.bubble.textContent = commentFor(s.lastAction, s.name);
      el.bubble.hidden = false;
      el.bubble.classList.remove('fresh');
      void el.bubble.offsetWidth;
      el.bubble.classList.add('fresh');
    } else if (!label) {
      el.bubble.hidden = true;
    }

    // Showdown hand description
    const desc = [s.handDesc, s.lowDesc].filter(Boolean).join('  /  ');
    el.handLabel.hidden = !desc;
    el.handLabel.textContent = desc;

    // Cards
    const want = s.cards.length;
    if (forceRebuild) el.cards.replaceChildren();
    while (el.cards.children.length > want) el.cards.lastElementChild!.remove();
    while (el.cards.children.length < want) {
      const c = createCardEl();
      el.cards.appendChild(c);
      c.dataset.fresh = '1';
      c.style.opacity = '0';
      fresh.push(c);
    }
    const best = new Set(s.bestCards ?? []);
    [...el.cards.children].forEach((node, i) => {
      const card = el.cards.children[i] as HTMLElement;
      const value = s.cards[i] ?? null;
      const already = card.dataset.card ? Number(card.dataset.card) : null;
      if (value !== already) setCardFace(card, value);
      card.classList.toggle('best', value !== null && best.has(value));
      card.classList.toggle('dim', !!s.bestCards && value !== null && !best.has(value));

      // Discard selection is only ever offered on your own cards.
      const canPick = isHero && !!you.drawPrompt && value !== null;
      card.classList.toggle('selectable', canPick);
      card.classList.toggle('selected', canPick && this.selected.has(value!));
      card.onclick = canPick ? () => this.cb.onToggleCard(value!) : null;
      void node;
    });

    // Chips in front of the seat
    if (s.bet > 0) {
      el.bet.hidden = false;
      const known = el.bet.dataset.amount;
      if (known !== String(s.bet)) {
        el.bet.dataset.amount = String(s.bet);
        el.bet.replaceChildren(chipStack(s.bet), Object.assign(document.createElement('div'), {
          className: 'amount',
          textContent: fmtChips(s.bet),
        }));
        if (!reduceMotion) {
          el.bet.animate(
            [
              { transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 },
              { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            ],
            { duration: 220, easing: 'cubic-bezier(0.2, 1.4, 0.4, 1)' },
          );
        }
      }
    } else {
      el.bet.hidden = true;
      el.bet.dataset.amount = '';
    }
  }

  private renderBoard(view: TableView, fresh: HTMLElement[]): void {
    while (this.boardCards.length > view.board.length) {
      this.boardCards.pop()!.remove();
    }
    while (this.boardCards.length < view.board.length) {
      const c = createCardEl();
      c.dataset.fresh = '1';
      c.style.opacity = '0';
      this.boardEl.appendChild(c);
      this.boardCards.push(c);
      fresh.push(c);
    }
    const best = new Set(view.seats.flatMap((s) => s.bestCards ?? []));
    const anyBest = best.size > 0;
    view.board.forEach((card, i) => {
      const el = this.boardCards[i];
      if (el.dataset.card !== String(card)) setCardFace(el, card);
      el.classList.toggle('best', anyBest && best.has(card));
      el.classList.toggle('dim', anyBest && !best.has(card));
    });
  }

  private renderPots(view: TableView): void {
    const nodes: HTMLElement[] = [];
    if (view.totalPot > 0) {
      const main = document.createElement('div');
      main.className = 'pot';
      main.innerHTML = `<span class="label">POT</span>${fmtChips(view.totalPot)}`;
      nodes.push(main);
      if (view.pots.length > 1) {
        for (const p of view.pots.slice(1)) {
          const side = document.createElement('div');
          side.className = 'pot side';
          side.textContent = `${p.label} ${fmtChips(p.amount)}`;
          nodes.push(side);
        }
      }
    }
    this.potsEl.replaceChildren(...nodes);
  }

  private renderDealerButton(view: TableView): void {
    if (view.buttonSeat === null || !view.seats.some((s) => s.seat === view.buttonSeat)) {
      this.dealerBtn.style.opacity = '0';
      return;
    }
    const p = this.seatPosition(view.buttonSeat);
    const c = { x: 50, y: 48 };
    // Tuck the button between the seat and the middle of the table.
    this.dealerBtn.style.opacity = '1';
    this.dealerBtn.style.left = `${p.x + (c.x - p.x) * 0.28}%`;
    this.dealerBtn.style.top = `${p.y + (c.y - p.y) * 0.2}%`;
  }

  /** Show a large message in the middle of the felt (waiting, choosing...). */
  setPrompt(html: string | null): void {
    if (!html) {
      this.promptEl.hidden = true;
      this.promptEl.replaceChildren();
      return;
    }
    this.promptEl.hidden = false;
    this.promptEl.innerHTML = html;
  }

  get promptRoot(): HTMLElement {
    return this.promptEl;
  }

  /* ---------------------------------------------------------------- */
  /* animation                                                         */
  /* ---------------------------------------------------------------- */

  private rectIn(el: HTMLElement): { x: number; y: number; w: number; h: number } {
    const c = this.fx.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  }

  /** Fly every freshly added card in from the deck, dealt one at a time. */
  private flyIn(fresh: HTMLElement[]): void {
    if (fresh.length === 0) return;
    if (reduceMotion) {
      for (const el of fresh) {
        el.style.opacity = '1';
        delete el.dataset.fresh;
      }
      return;
    }

    const from = this.rectIn(this.deckEl);
    fresh.forEach((target, i) => {
      const delay = i * 85;
      const to = this.rectIn(target);
      if (to.w === 0) {
        // Not laid out yet (hidden tab); just show it.
        target.style.opacity = '1';
        delete target.dataset.fresh;
        return;
      }
      const flyer = document.createElement('div');
      flyer.className = 'flyer';
      flyer.style.width = `${to.w}px`;
      flyer.style.height = `${to.h}px`;
      flyer.style.left = `${from.x}px`;
      flyer.style.top = `${from.y}px`;
      flyer.style.opacity = '0';
      this.fx.appendChild(flyer);

      const anim = flyer.animate(
        [
          {
            transform: `translate(0px, 0px) rotate(${-25 + Math.random() * 12}deg) scale(0.86)`,
            opacity: 0,
            offset: 0,
          },
          { opacity: 1, offset: 0.08 },
          {
            transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) rotate(0deg) scale(1)`,
            opacity: 1,
            offset: 1,
          },
        ],
        { duration: 330, delay, easing: 'cubic-bezier(0.22, 0.9, 0.28, 1)', fill: 'forwards' },
      );
      anim.onfinish = () => {
        flyer.remove();
        target.style.opacity = '1';
        delete target.dataset.fresh;
        sfx.deal();
      };
    });
  }

  /** Sweep the street's chips into the middle. */
  private sweepToPot(): void {
    if (reduceMotion) return;
    const center = this.rectIn(this.potsEl);
    const cx = center.x + center.w / 2;
    const cy = center.y + center.h / 2;
    let any = false;
    for (const [seat, amount] of this.prevBets) {
      if (!amount) continue;
      const el = this.seatEls.get(seat);
      if (!el) continue;
      const p = this.betPosition(seat);
      const box = this.rectIn(this.felt);
      const sx = (p.x / 100) * box.w + box.x;
      const sy = (p.y / 100) * box.h + box.y;
      const [c1, c2] = chipColorFor(amount);
      for (let i = 0; i < 3; i++) {
        const chip = document.createElement('div');
        chip.className = 'chip-fly';
        chip.style.setProperty('--c1', c1);
        chip.style.setProperty('--c2', c2);
        chip.style.left = `${sx}px`;
        chip.style.top = `${sy}px`;
        this.fx.appendChild(chip);
        const a = chip.animate(
          [
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            {
              transform: `translate(${cx - sx - 10}px, ${cy - sy - 10}px) scale(0.65)`,
              opacity: 0.15,
            },
          ],
          { duration: 380, delay: i * 45, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
        );
        a.onfinish = () => chip.remove();
      }
      any = true;
    }
    if (any) sfx.chips();
  }

  /** Push a pot out to a winner and pop the amount over their seat. */
  private awardTo(seat: number, amount: number): void {
    const el = this.seatEls.get(seat);
    if (!el) return;
    const box = this.rectIn(this.felt);
    const p = this.seatPosition(seat);
    const tx = (p.x / 100) * box.w + box.x;
    const ty = (p.y / 100) * box.h + box.y;
    const center = this.rectIn(this.potsEl);
    const cx = center.x + center.w / 2;
    const cy = center.y + center.h / 2;

    if (!reduceMotion) {
      const [c1, c2] = chipColorFor(amount);
      for (let i = 0; i < 6; i++) {
        const chip = document.createElement('div');
        chip.className = 'chip-fly';
        chip.style.setProperty('--c1', c1);
        chip.style.setProperty('--c2', c2);
        chip.style.left = `${cx}px`;
        chip.style.top = `${cy}px`;
        this.fx.appendChild(chip);
        const a = chip.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0.9 },
            { transform: `translate(${tx - cx}px, ${ty - cy}px) scale(1)`, opacity: 0 },
          ],
          { duration: 520, delay: i * 40, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'forwards' },
        );
        a.onfinish = () => chip.remove();
      }
    }

    const pop = document.createElement('div');
    pop.className = 'pop';
    pop.textContent = `+${fmtChips(amount)}`;
    pop.style.left = `${tx}px`;
    pop.style.top = `${ty}px`;
    this.fx.appendChild(pop);
    const a = pop.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
        { transform: 'translate(-50%, -180%) scale(1.1)', opacity: 1, offset: 0.35 },
        { transform: 'translate(-50%, -320%) scale(1)', opacity: 0 },
      ],
      { duration: 1500, delay: 380, easing: 'ease-out', fill: 'forwards' },
    );
    a.onfinish = () => pop.remove();
    sfx.win();
  }

  private clearFx(): void {
    this.fx.replaceChildren();
  }

  /** Animation cues that pure state cannot express. */
  playEvents(events: GameEvent[]): void {
    for (const ev of events) {
      switch (ev.t) {
        case 'collect':
          this.sweepToPot();
          break;
        case 'award':
          this.awardTo(ev.seat, ev.amount);
          break;
        case 'action':
          if (ev.action === 'fold') sfx.fold();
          else if (ev.action === 'check') sfx.check();
          else sfx.chips();
          break;
        case 'draw':
          if (ev.discarded > 0) sfx.deal();
          break;
        case 'hand-start':
          sfx.shuffle();
          break;
        default:
          break;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* action clock                                                      */
  /* ---------------------------------------------------------------- */

  private runTimer(): void {
    cancelAnimationFrame(this.timerRaf);
    const view = this.view;
    if (!view) return;
    const seat = view.toActSeat;
    const deadline = view.actionDeadline;

    for (const [n, el] of this.seatEls) {
      if (n !== seat) el.timer.style.transform = 'scaleX(0)';
    }
    if (seat === null || deadline === null) return;
    const el = this.seatEls.get(seat);
    if (!el) return;
    const total = Math.max(1000, deadline - Date.now());
    const started = Date.now();

    const tick = (): void => {
      const left = deadline - Date.now();
      const frac = Math.max(0, Math.min(1, left / total));
      el.timer.style.transform = `scaleX(${frac})`;
      el.timer.classList.toggle('urgent', frac < 0.35);
      if (left > 0 && Date.now() - started < 300_000) {
        this.timerRaf = requestAnimationFrame(tick);
      }
    };
    tick();
  }

  destroy(): void {
    cancelAnimationFrame(this.timerRaf);
  }
}

function commentFor(action: string | null, name: string): string {
  const lines = /fold/i.test(action ?? '')
    ? ['Folded like a lawn chair.', 'Saving chips for snacks.', 'Not today, partner.', 'That hand was haunted.']
    : /raise|bet/i.test(action ?? '')
      ? ['Making it interesting!', 'The sheriff raises.', 'Bold as brass.', 'This wagon has wheels!']
      : /all in/i.test(action ?? '')
        ? ['All aboard the tumbleweed!', 'No guts, no glory!', 'Cowboy mode: ON.']
        : /check/i.test(action ?? '')
          ? ['Just passing through.', 'Checking the weather.', 'Quiet as a cactus.']
          : /call/i.test(action ?? '')
            ? ['I reckon I call.', 'Cards, do your thing.', 'Let’s see the river.']
            : /out of chips/i.test(action ?? '')
              ? ['Down, not dusty.', 'The saloon remembers.']
              : [`${name} is thinking…`, 'Trust the cards.', 'Yeehaw.'];
  return lines[Math.floor(Math.random() * lines.length)];
}
