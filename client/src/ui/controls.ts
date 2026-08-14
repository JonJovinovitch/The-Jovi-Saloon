/**
 * The action bar.
 *
 * It has three faces: betting (fold / check / call / raise with a sizing
 * slider), drawing (pick cards to pitch), and idle (sit out, rebuy, stand).
 * Which one you get is decided entirely by what the server says is legal, so
 * the UI can never offer an action the engine would reject.
 */

import type { Card } from '@shared/cards.ts';
import type { ActionType, TableView, YouView } from '@shared/protocol.ts';
import { fmtChips } from './cards.ts';

export interface ControlCallbacks {
  onAct(action: ActionType, amount?: number): void;
  onDiscard(cards: Card[]): void;
  onSitOut(on: boolean): void;
  onStand(): void;
  onRebuy(): void;
  onDeal(): void;
  onSitPrompt(): void;
}

export class Controls {
  readonly root: HTMLElement;
  private statusEl: HTMLElement;
  private actionsEl: HTMLElement;
  private raiseTo = 0;

  constructor(private cb: ControlCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'actionbar';
    this.root.innerHTML = `<div class="status"></div><div class="actions"></div>`;
    this.statusEl = this.root.querySelector('.status')!;
    this.actionsEl = this.root.querySelector('.actions')!;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private lastLegal: YouView['legal'] = null;

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const legal = this.lastLegal;
    if (!legal) return;
    const k = e.key.toLowerCase();
    if (k === 'f' && legal.canFold) this.cb.onAct('fold');
    else if ((k === 'c' || k === ' ') && legal.canCheck) this.cb.onAct('check');
    else if (k === 'c' && legal.canCall) this.cb.onAct('call');
    else if (k === 'r' && (legal.canBet || legal.canRaise)) this.cb.onAct(legal.canBet ? 'bet' : 'raise', this.raiseTo);
    else return;
    e.preventDefault();
  }

  render(view: TableView, you: YouView, selected: Set<Card>, isHost: boolean): void {
    this.lastLegal = you.legal;
    this.statusEl.innerHTML = this.status(view, you);

    if (you.drawPrompt) return this.renderDraw(you, selected);
    if (you.legal) return this.renderBetting(view, you);
    // A player who is waiting on someone else must not see an action bar that
    // resembles their turn. Between-hand controls return when the table is idle.
    if (view.state === 'running' || view.state === 'showdown' || view.state === 'choosing') {
      this.actionsEl.replaceChildren();
      return;
    }
    return this.renderIdle(view, you, isHost);
  }

  private status(view: TableView, you: YouView): string {
    if (you.drawPrompt) {
      const n = you.drawPrompt.exact;
      return n !== null
        ? `<b>Discard exactly ${n}</b> — tap your cards to choose.`
        : `<b>Your draw.</b> Tap the cards you want to throw away, then draw.`;
    }
    if (you.legal) {
      const call = you.legal.callAmount;
      return call > 0
        ? `<b>Your turn</b> — ${fmtChips(call)} to call into a ${fmtChips(view.totalPot)} pot.`
        : `<b>Your turn</b> — checked to you, ${fmtChips(view.totalPot)} in the pot.`;
    }
    return view.message;
  }

  private button(cls: string, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `act ${cls}`;
    b.innerHTML = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  private renderBetting(view: TableView, you: YouView): void {
    const legal = you.legal!;
    const nodes: HTMLElement[] = [];

    nodes.push(this.button('fold', 'Fold <small>(F)</small>', () => this.cb.onAct('fold'), !legal.canFold));

    if (legal.canCheck) {
      nodes.push(this.button('check', 'Check <small>(C)</small>', () => this.cb.onAct('check')));
    } else if (legal.canCall) {
      const allIn = legal.callAmount >= (view.seats.find((s) => s.seat === you.seat)?.stack ?? 0);
      nodes.push(
        this.button(
          'call',
          `${allIn ? 'Call All In' : 'Call'} ${fmtChips(legal.callAmount)} <small>(C)</small>`,
          () => this.cb.onAct('call'),
        ),
      );
    }

    if (legal.canBet || legal.canRaise) {
      const verb = legal.canBet ? 'Bet' : 'Raise to';
      if (legal.fixedAmount !== null) {
        nodes.push(
          this.button('raise', `${verb} ${fmtChips(legal.fixedAmount)} <small>(R)</small>`, () =>
            this.cb.onAct(legal.canBet ? 'bet' : 'raise', legal.fixedAmount!),
          ),
        );
        this.raiseTo = legal.fixedAmount;
      } else {
        this.raiseTo = clamp(this.raiseTo || legal.minRaiseTo, legal.minRaiseTo, legal.maxRaiseTo);
        nodes.push(
          this.button('raise', `${verb} <span class="amt">${fmtChips(this.raiseTo)}</span> <small>(R)</small>`, () =>
            this.cb.onAct(legal.canBet ? 'bet' : 'raise', this.raiseTo),
          ),
        );
      }
    }

    this.actionsEl.replaceChildren(...nodes);

    if ((legal.canBet || legal.canRaise) && legal.fixedAmount === null && legal.maxRaiseTo > legal.minRaiseTo) {
      this.actionsEl.appendChild(this.sizingRow(view, you));
    }
  }

  /** Slider plus the usual pot-fraction shortcuts. */
  private sizingRow(view: TableView, you: YouView): HTMLElement {
    const legal = you.legal!;
    const row = document.createElement('div');
    row.className = 'raise-row';

    const potAfterCall = view.totalPot + legal.callAmount;
    const currentBet = legal.potRaiseTo - potAfterCall;
    const fracTo = (f: number): number =>
      clamp(Math.round(currentBet + potAfterCall * f), legal.minRaiseTo, legal.maxRaiseTo);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(legal.minRaiseTo);
    slider.max = String(legal.maxRaiseTo);
    slider.step = '1';
    slider.value = String(this.raiseTo);

    const box = document.createElement('input');
    box.type = 'number';
    box.min = String(legal.minRaiseTo);
    box.max = String(legal.maxRaiseTo);
    box.value = String(this.raiseTo);

    const setValue = (v: number): void => {
      this.raiseTo = clamp(Math.round(v), legal.minRaiseTo, legal.maxRaiseTo);
      slider.value = String(this.raiseTo);
      box.value = String(this.raiseTo);
      const amt = this.actionsEl.querySelector('.amt');
      if (amt) amt.textContent = fmtChips(this.raiseTo);
    };

    slider.addEventListener('input', () => setValue(Number(slider.value)));
    box.addEventListener('input', () => setValue(Number(box.value)));

    const quick = document.createElement('div');
    quick.className = 'quick';
    const shortcuts: [string, number][] = [
      ['½ pot', 0.5],
      ['¾ pot', 0.75],
      ['Pot', 1],
    ];
    for (const [label, f] of shortcuts) {
      const target = fracTo(f);
      if (target <= legal.minRaiseTo && f < 1) continue;
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => setValue(target));
      quick.appendChild(b);
    }
    const allIn = document.createElement('button');
    allIn.textContent = 'All in';
    allIn.addEventListener('click', () => setValue(legal.maxRaiseTo));
    quick.appendChild(allIn);

    row.append(slider, box, quick);
    return row;
  }

  private renderDraw(you: YouView, selected: Set<Card>): void {
    const prompt = you.drawPrompt!;
    const n = selected.size;
    const exact = prompt.exact;
    const ok = exact === null ? n <= prompt.maxDiscards : n === exact;
    const nodes: HTMLElement[] = [];

    if (exact === null) {
      nodes.push(this.button('check', 'Stand Pat', () => this.cb.onDiscard([]), false));
    }
    nodes.push(
      this.button(
        'raise',
        exact === null
          ? n === 0
            ? 'Draw'
            : `Draw ${n} card${n === 1 ? '' : 's'}`
          : `Discard ${n}/${exact}`,
        () => this.cb.onDiscard([...selected]),
        !ok || (exact === null && n === 0),
      ),
    );
    this.actionsEl.replaceChildren(...nodes);
  }

  private renderIdle(view: TableView, you: YouView, isHost: boolean): void {
    const nodes: HTMLElement[] = [];
    const me = view.seats.find((s) => s.seat === you.seat);

    if (you.seat === null) {
      nodes.push(this.button('check', 'Take a seat', () => this.cb.onSitPrompt()));
    } else {
      if (me && me.stack <= 0) {
        nodes.push(this.button('raise', 'Rebuy', () => this.cb.onRebuy()));
      }
      const out = !!me?.sittingOut;
      nodes.push(
        this.button('check', out ? "I'm back" : 'Sit out next hand', () => this.cb.onSitOut(!out)),
      );
      nodes.push(this.button('fold', 'Stand up', () => this.cb.onStand()));
    }
    if (isHost && view.state === 'waiting') {
      nodes.push(this.button('raise', 'Deal', () => this.cb.onDeal()));
    }
    this.actionsEl.replaceChildren(...nodes);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
