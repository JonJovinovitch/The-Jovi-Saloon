/** Pick your character. One of each per room, first come first served. */

import { AVATARS } from '@shared/avatars.ts';
import type { RoomView } from '@shared/protocol.ts';
import { avatarSvg } from './avatar.ts';

export function openAvatarPicker(
  room: RoomView,
  myId: string,
  onPick: (avatarId: string) => void,
): void {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `
    <div class="modal wide">
      <h2>Pick your character</h2>
      <p class="sub">One of each to a room &mdash; whoever claims it first, rides with it.</p>
      <div class="avatar-grid"></div>
      <div class="modal-actions"><button class="btn ghost done">Done</button></div>
    </div>`;
  const close = (): void => scrim.remove();
  scrim.addEventListener('click', (e) => {
    if (e.target === scrim) close();
  });
  scrim.querySelector('.done')!.addEventListener('click', close);

  const grid = scrim.querySelector('.avatar-grid') as HTMLElement;
  const mine = room.members.find((m) => m.userId === myId)?.avatarId;
  const takenBy = new Map<string, string>();
  for (const m of room.members) {
    if (m.userId !== myId) takenBy.set(m.avatarId, m.name);
  }

  for (const a of AVATARS) {
    const taken = takenBy.get(a.id);
    const isMine = a.id === mine;
    const card = document.createElement('button');
    card.className = `avatar-card${isMine ? ' mine' : ''}${taken ? ' taken' : ''}`;
    card.disabled = !!taken;
    card.innerHTML = `
      <span class="portrait big">${avatarSvg(a.id)}</span>
      <span class="ac-name">${a.name}</span>
      <span class="ac-tag">${taken ? `Played by ${escapeHtml(taken)}` : a.tagline}</span>
      ${isMine ? '<span class="ac-flag">Yours</span>' : ''}`;
    card.addEventListener('click', () => {
      onPick(a.id);
      close();
    });
    grid.appendChild(card);
  }

  document.body.appendChild(scrim);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
