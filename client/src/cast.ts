/**
 * A contact sheet of every character, at a size you can actually judge.
 *
 * Served alongside the game at /cast.html. It exists so the avatars can be
 * reviewed and tweaked without dealing a hand to see them.
 */

import './styles.css';
import { AVATARS } from '@shared/avatars.ts';
import { avatarSvg } from './ui/avatar.ts';

const root = document.getElementById('cast')!;

const cards = AVATARS.map(
  (a) => `
    <figure class="cast-card">
      <div class="cast-portrait">${avatarSvg(a.id)}</div>
      <figcaption>
        <div class="cast-name">${a.name}</div>
        <div class="cast-tag">${a.tagline}</div>
        <div class="cast-meta">${[a.look.hat, a.look.facial, a.look.neck, a.look.accessory]
          .filter((v) => v && v !== 'none')
          .join(' &middot; ')}</div>
      </figcaption>
    </figure>`,
).join('');

root.innerHTML = `
  <div class="cast-wrap">
    <header class="cast-head">
      <div class="star">&starf;</div>
      <h1>The Cast</h1>
      <div class="rule"></div>
      <p>${AVATARS.length} characters &middot; one of each to a room</p>
    </header>
    <div class="cast-grid">${cards}</div>
  </div>`;
