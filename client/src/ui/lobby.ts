/** Modals: room settings, the dealer's-choice game picker, and the roster. */

import { GAMES, MIXES } from '@shared/games.ts';
import { HOW_TO } from '@shared/howto.ts';
import { getAvatar } from '@shared/avatars.ts';
import { avatarSvg } from './avatar.ts';
import type { RoomConfig, RoomView } from '@shared/protocol.ts';

function modal(title: string): { scrim: HTMLElement; body: HTMLElement; close: () => void } {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal"><h2></h2><div class="mbody"></div></div>`;
  scrim.querySelector('h2')!.textContent = title;
  const close = (): void => scrim.remove();
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  document.body.appendChild(scrim);
  return { scrim, body: scrim.querySelector('.mbody')!, close };
}

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  row.append(l, control);
  if (hint) {
    const h = document.createElement('div');
    h.className = 'hint';
    h.textContent = hint;
    row.appendChild(h);
  }
  return row;
}

function select(options: [string, string][], value: string): HTMLSelectElement {
  const s = document.createElement('select');
  for (const [v, label] of options) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    s.appendChild(o);
  }
  s.value = value;
  return s;
}

function numberInput(value: number, min = 1): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'number';
  i.value = String(value);
  i.min = String(min);
  return i;
}

function checkbox(value: boolean): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = value;
  i.style.flex = '0 0 auto';
  i.style.width = '2.4vmin';
  i.style.height = '2.4vmin';
  return i;
}

export function openSettings(room: RoomView, onSave: (patch: Partial<RoomConfig>) => void): void {
  const c = room.config;
  const { body, close } = modal('Room settings');

  const mode = select(
    [
      ['dealers-choice', "Dealer's choice"],
      ['fixed', 'One game all night'],
      ['mix', 'Mixed rotation'],
    ],
    c.mode,
  );
  const game = select(GAMES.map((g) => [g.id, g.name] as [string, string]), c.gameId);
  const mix = select(MIXES.map((m) => [m.id, m.name] as [string, string]), c.mixId);
  const sb = numberInput(c.stakes.smallBlind);
  const bb = numberInput(c.stakes.bigBlind);
  const stack = numberInput(c.startingStack);
  const cap = numberInput(c.seatCap, 2);
  cap.max = '10';
  const clock = numberInput(c.actionTimeSec, 8);
  const autoScale = checkbox(c.autoScale);
  const autoDeal = checkbox(c.autoDeal);
  const rebuy = checkbox(c.allowRebuy);

  const gameRow = field('Game', game);
  const mixRow = field('Rotation', mix, 'The game changes every orbit.');
  const syncMode = (): void => {
    gameRow.hidden = mode.value !== 'fixed';
    mixRow.hidden = mode.value !== 'mix';
  };
  mode.addEventListener('change', syncMode);

  body.append(
    field('Format', mode, "Dealer's choice lets whoever has the button pick the next game."),
    gameRow,
    mixRow,
    field('Small blind', sb),
    field('Big blind', bb),
    field('Starting stack', stack),
    field('Seats per table', cap, 'The room opens another table when more players than this sit down.'),
    field('Seconds to act', clock),
    field('Auto-scale tables', autoScale),
    field('Deal automatically', autoDeal),
    field('Allow rebuys', rebuy),
  );
  syncMode();

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);
  const save = document.createElement('button');
  save.className = 'btn primary';
  save.textContent = 'Save';
  save.addEventListener('click', () => {
    onSave({
      mode: mode.value as RoomConfig['mode'],
      gameId: game.value,
      mixId: mix.value,
      stakes: {
        ...c.stakes,
        smallBlind: Number(sb.value),
        bigBlind: Number(bb.value),
        smallBet: Number(bb.value),
        bigBet: Number(bb.value) * 2,
      },
      startingStack: Number(stack.value),
      seatCap: Number(cap.value),
      actionTimeSec: Number(clock.value),
      autoScale: autoScale.checked,
      autoDeal: autoDeal.checked,
      allowRebuy: rebuy.checked,
    });
    close();
  });
  actions.append(cancel, save);
  body.appendChild(actions);
}

/** Dealer's choice: pick the next game, with a shortcut into its rules. */
export function openGamePicker(
  options: string[],
  onPick: (gameId: string) => void,
  onLearn: (gameId: string) => void,
): () => void {
  const { body, close } = modal('Your deal — pick the game');
  const list = document.createElement('div');
  list.className = 'game-list';

  for (const id of options) {
    const spec = GAMES.find((g) => g.id === id);
    if (!spec) continue;
    const how = HOW_TO[id];
    const card = document.createElement('button');
    card.className = 'game-card';
    card.innerHTML = `
      <span class="badge-short">${spec.short}</span>
      <span class="gc-body">
        <span class="gc-name">${spec.name}</span>
        <span class="gc-tag">${how?.tagline ?? ''}</span>
      </span>
      <span class="learn" data-learn="1">Rules</span>`;
    card.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).dataset.learn) {
        onLearn(id);
        return;
      }
      onPick(id);
      close();
    });
    list.appendChild(card);
  }
  body.appendChild(list);
  return close;
}

export function openRoster(room: RoomView): void {
  const { body } = modal(`${room.name} — ${room.members.length} in the room`);
  const wrap = document.createElement('div');
  wrap.className = 'roster';
  for (const m of room.members) {
    const row = document.createElement('div');
    row.className = `who-chip${m.seat !== null ? ' seated' : ''}`;
    const table = room.tables.find((t) => t.id === m.tableId);
    const where = table ? `Table ${table.index + 1}, seat ${(m.seat ?? 0) + 1}` : 'watching';
    row.innerHTML = `
      <span class="portrait sm">${avatarSvg(m.avatarId)}</span>
      <span class="wc-body">
        <span class="wc-name">${m.name}${m.isHost ? ' <em>host</em>' : ''}${m.isBot ? ' <em>bot</em>' : ''}</span>
        <span class="wc-sub">${getAvatar(m.avatarId).name} &middot; ${where}</span>
      </span>`;
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
}
