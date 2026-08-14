/**
 * The How To Play drawer.
 *
 * It slides over the table rather than replacing it, so you can read the rules
 * for the game you are sitting in while the hand carries on behind it.
 */

import { GAMES, getGame } from '@shared/games.ts';
import { BASICS, HOW_TO, type HowToSection } from '@shared/howto.ts';

function renderSections(sections: HowToSection[]): string {
  return sections
    .map((sec) => {
      const bullets: string[] = [];
      const paras: string[] = [];
      let buffer: string[] = [];
      const flush = (): void => {
        if (buffer.length) {
          paras.push(`<ul>${buffer.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`);
          buffer = [];
        }
      };
      for (const line of sec.body) {
        if (line.startsWith('- ')) buffer.push(line.slice(2));
        else {
          flush();
          paras.push(`<p>${escapeHtml(line)}</p>`);
        }
      }
      flush();
      void bullets;
      return `<h3>${escapeHtml(sec.title)}</h3>${paras.join('')}`;
    })
    .join('');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const DIFFICULTY = ['', 'Easy', 'Medium', 'Advanced'];

export class HowToDrawer {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private backBtn: HTMLButtonElement;
  private currentGame: string | null = null;

  constructor() {
    this.root = document.createElement('aside');
    this.root.className = 'drawer';
    this.root.innerHTML = `
      <header>
        <button class="btn ghost back" hidden>&larr;</button>
        <h2>How To Play</h2>
        <button class="btn ghost close">&times;</button>
      </header>
      <div class="body"></div>`;
    this.titleEl = this.root.querySelector('h2')!;
    this.bodyEl = this.root.querySelector('.body')!;
    this.backBtn = this.root.querySelector('.back')!;
    this.backBtn.addEventListener('click', () => this.showIndex());
    this.root.querySelector('.close')!.addEventListener('click', () => this.close());
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  open(gameId?: string): void {
    this.root.classList.add('open');
    if (gameId) this.showGame(gameId);
    else if (!this.bodyEl.childElementCount) this.showIndex();
  }

  close(): void {
    this.root.classList.remove('open');
  }

  toggle(gameId?: string): void {
    if (this.isOpen && (!gameId || gameId === this.currentGame)) this.close();
    else this.open(gameId);
  }

  showIndex(): void {
    this.currentGame = null;
    this.titleEl.textContent = 'How To Play';
    this.backBtn.hidden = true;
    const list = GAMES.map((g) => {
      const h = HOW_TO[g.id];
      return `<button class="game-card" data-game="${g.id}">
          <span class="badge-short">${escapeHtml(g.short)}</span>
          <span class="gc-body">
            <span class="gc-name">${escapeHtml(g.name)}</span>
            <span class="gc-tag">${escapeHtml(h?.tagline ?? '')}</span>
          </span>
          <span class="learn">${h ? escapeHtml(h.learnIn) : ''}</span>
        </button>`;
    }).join('');

    this.bodyEl.innerHTML = `
      <div class="tagline">New to a game? Open its page while you play &mdash; the table keeps running behind this panel.</div>
      <h3>The games</h3>
      <div class="game-list">${list}</div>
      <h3 style="margin-top:2.4vmin">Poker basics</h3>
      ${renderSections(BASICS)}`;

    for (const btn of this.bodyEl.querySelectorAll<HTMLElement>('[data-game]')) {
      btn.addEventListener('click', () => this.showGame(btn.dataset.game!));
    }
    this.bodyEl.scrollTop = 0;
  }

  showGame(gameId: string): void {
    const spec = GAMES.find((g) => g.id === gameId);
    const how = HOW_TO[gameId];
    if (!spec || !how) return this.showIndex();

    this.currentGame = gameId;
    this.titleEl.textContent = spec.name;
    this.backBtn.hidden = false;

    const limitName = { nl: 'No Limit', pl: 'Pot Limit', fl: 'Fixed Limit' }[spec.limit];
    const meta = [
      `${DIFFICULTY[how.difficulty]}`,
      `Learn in ${how.learnIn}`,
      limitName,
      `Up to ${spec.maxSeats} players`,
      spec.splitLow ? 'Split pot' : null,
    ]
      .filter(Boolean)
      .map((t) => `<span class="chip-tag">${escapeHtml(String(t))}</span>`)
      .join('');

    this.bodyEl.innerHTML = `
      <div class="tagline">${escapeHtml(how.tagline)}</div>
      <div class="meta-row">${meta}</div>
      ${spec.rankingNote ? `<p><b>Note:</b> ${escapeHtml(spec.rankingNote)}</p>` : ''}
      ${renderSections(how.sections)}
      <div class="tips">
        <h3>Quick tips</h3>
        <ul>${how.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      </div>
      <h3 style="margin-top:2.4vmin">Reminders</h3>
      ${renderSections(BASICS.filter((s) => s.title !== 'The goal'))}`;
    this.bodyEl.scrollTop = 0;
  }

  /** Keep the header in step with whatever game the table just switched to. */
  syncGame(gameId: string): void {
    if (this.isOpen && this.currentGame && this.currentGame !== gameId) return;
    if (this.isOpen && this.currentGame === null) return;
    if (this.currentGame && this.currentGame !== gameId) {
      try {
        getGame(gameId);
        this.showGame(gameId);
      } catch {
        /* unknown game, leave the panel alone */
      }
    }
  }
}
