/**
 * Draws a western character as inline SVG.
 *
 * Everything is one 100x100 viewBox built from the AvatarLook parameters, so
 * sixteen distinct characters cost one function instead of sixteen image
 * files - which also means nothing to load through Discord's proxy.
 */

import { getAvatar, type AvatarLook, type AvatarDef } from '@shared/avatars.ts';

/* ------------------------------------------------------------------ */
/* colour helpers                                                      */
/* ------------------------------------------------------------------ */

function mix(hex: string, target: [number, number, number], amount: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const c = (a: number, t: number): string =>
    Math.round(a + (t - a) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${c(r, target[0])}${c(g, target[1])}${c(b, target[2])}`;
}

const darken = (hex: string, amt = 0.22): string => mix(hex, [0, 0, 0], amt);
const lighten = (hex: string, amt = 0.22): string => mix(hex, [255, 255, 255], amt);

/** Path data for a five-pointed sheriff's star. */
function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/* ------------------------------------------------------------------ */
/* parts                                                               */
/* ------------------------------------------------------------------ */

function body(look: AvatarLook): string {
  const shirtDark = darken(look.shirt, 0.3);
  let out = `
    <path d="M4,100 C8,79 25,69 50,69 C75,69 92,79 96,100 Z" fill="${look.shirt}"/>
    <path d="M50,69 C60,69 68,71 74,74 L70,100 L50,100 Z" fill="${shirtDark}" opacity="0.35"/>`;
  if (look.vest) {
    const vd = darken(look.vest, 0.28);
    out += `
      <path d="M33,71.5 C27,74 21,79 17,88 L14,100 L38,100 L41,73 Z" fill="${look.vest}"/>
      <path d="M67,71.5 C73,74 79,79 83,88 L86,100 L62,100 L59,73 Z" fill="${look.vest}"/>
      <path d="M41,73 L38,100 L41,100 L44,74 Z" fill="${vd}"/>
      <path d="M59,73 L62,100 L59,100 L56,74 Z" fill="${vd}"/>`;
  }
  return out;
}

function backHair(look: AvatarLook): string {
  const h = look.hair;
  switch (look.hairStyle) {
    case 'long':
      return `<path d="M27,40 C25,60 26,72 29,80 L71,80 C74,72 75,60 73,40 Z" fill="${darken(h, 0.15)}"/>`;
    case 'wavy':
      return `<path d="M25,40 C22,62 24,74 27,84 C33,80 36,84 40,82 L60,82 C64,84 67,80 73,84 C76,74 78,62 75,40 Z" fill="${darken(h, 0.12)}"/>`;
    case 'braids':
      return `
        <path d="M28,40 C26,58 27,68 29,74 L71,74 C73,68 74,58 72,40 Z" fill="${darken(h, 0.15)}"/>
        <path d="M27,54 C22,64 22,78 25,90 L33,90 C30,78 30,64 33,56 Z" fill="${h}"/>
        <path d="M73,54 C78,64 78,78 75,90 L67,90 C70,78 70,64 67,56 Z" fill="${h}"/>`;
    case 'bun':
      return `<circle cx="50" cy="22" r="10" fill="${darken(h, 0.12)}"/>`;
    default:
      return '';
  }
}

function head(look: AvatarLook): string {
  const s = look.skin;
  return `
    <ellipse cx="50" cy="58" rx="8.5" ry="9" fill="${darken(s, 0.18)}"/>
    <ellipse cx="31.5" cy="48" rx="3.6" ry="5" fill="${s}"/>
    <ellipse cx="68.5" cy="48" rx="3.6" ry="5" fill="${s}"/>
    <ellipse cx="50" cy="45" rx="18.5" ry="21" fill="${s}"/>
    <path d="M31.5,45 C31.5,58 39,66 50,66 C61,66 68.5,58 68.5,45 C68.5,58 61,64 50,64 C39,64 31.5,58 31.5,45 Z" fill="${darken(s, 0.12)}" opacity="0.5"/>`;
}

function frontHair(look: AvatarLook): string {
  const h = look.hair;
  // A hat hides most of the hairline, so keep the front simple and low.
  switch (look.hairStyle) {
    case 'bald':
      return '';
    case 'slick':
      return `<path d="M31.6,44 C31,32 38,25 50,25 C62,25 69,32 68.4,44 C66,36 60,32 50,32 C42,32 35,35 31.6,44 Z" fill="${h}"/>`;
    case 'bun':
      return `<path d="M31.6,45 C31,31 38,24 50,24 C62,24 69,31 68.4,45 C66,34 59,30 50,30 C41,30 34,34 31.6,45 Z" fill="${h}"/>`;
    default:
      return `<path d="M31.6,46 C31,30 38,24 50,24 C62,24 69,30 68.4,46 C65,33 59,29 50,29 C41,29 35,33 31.6,46 Z" fill="${h}"/>`;
  }
}

function face(look: AvatarLook): string {
  const browColor = darken(look.hair === '#d6d2cb' ? '#8e8a84' : look.hair, 0.1);
  const noseShade = darken(look.skin, 0.16);
  return `
    <path d="M36,40.5 Q42.5,37.5 48,40" stroke="${browColor}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M52,40 Q57.5,37.5 64,40.5" stroke="${browColor}" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="42.5" cy="46" rx="4.2" ry="3.1" fill="#f6f2ea"/>
    <ellipse cx="57.5" cy="46" rx="4.2" ry="3.1" fill="#f6f2ea"/>
    <circle cx="42.9" cy="46.2" r="2" fill="#2a1d16"/>
    <circle cx="57.9" cy="46.2" r="2" fill="#2a1d16"/>
    <circle cx="43.6" cy="45.4" r="0.7" fill="#ffffff"/>
    <circle cx="58.6" cy="45.4" r="0.7" fill="#ffffff"/>
    <path d="M50,45 L47.2,53.5 Q50,55.2 52.8,53.5" fill="none" stroke="${noseShade}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function mouth(look: AvatarLook): string {
  const lip = darken(look.skin, 0.42);
  return `<path d="M44.5,59.5 Q50,63 55.5,59.5" stroke="${lip}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
}

function facialHair(look: AvatarLook): string {
  const h = look.hair;
  const d = darken(h, 0.1);
  switch (look.facial) {
    case 'stubble':
      return `<path d="M32,48 C33,62 40,68 50,68 C60,68 67,62 68,48 C66,60 59,65 50,65 C41,65 34,60 32,48 Z" fill="${d}" opacity="0.34"/>`;
    case 'mustache':
      return `<path d="M41.5,56.5 Q50,53 58.5,56.5 Q50,60 41.5,56.5 Z" fill="${d}"/>`;
    case 'handlebar':
      return `<path d="M38,57.5 Q41,53.5 45,55.5 Q50,53 55,55.5 Q59,53.5 62,57.5 Q57,57 55,58.5 Q50,60.5 45,58.5 Q43,57 38,57.5 Z" fill="${d}"/>`;
    case 'goatee':
      return `
        <path d="M43,56.5 Q50,54 57,56.5 Q50,59 43,56.5 Z" fill="${d}"/>
        <path d="M45.5,62 Q50,61 54.5,62 C54.5,68 52.5,71.5 50,71.5 C47.5,71.5 45.5,68 45.5,62 Z" fill="${d}"/>`;
    case 'chops':
      return `<path d="M31.8,42 C31,54 34,62 38,64 L41,58 C38,54 36,48 36,42 Z M68.2,42 C69,54 66,62 62,64 L59,58 C62,54 64,48 64,42 Z" fill="${d}"/>`;
    case 'beard':
      return `
        <path d="M31.6,44 C31.6,60 38,70 50,70 C62,70 68.4,60 68.4,44 C68.4,56 63,58 50,58 C37,58 31.6,56 31.6,44 Z" fill="${d}"/>
        <path d="M41.5,55.5 Q50,52 58.5,55.5 Q50,59 41.5,55.5 Z" fill="${darken(h, 0.24)}"/>`;
    case 'bigbeard':
      return `
        <path d="M30,42 C29,62 34,80 50,80 C66,80 71,62 70,42 C70,56 64,58 50,58 C36,58 30,56 30,42 Z" fill="${d}"/>
        <path d="M40.5,55 Q50,51 59.5,55 Q50,59.5 40.5,55 Z" fill="${darken(h, 0.26)}"/>`;
    default:
      return '';
  }
}

function neckwear(look: AvatarLook): string {
  const c = look.neckColor;
  switch (look.neck) {
    case 'kerchief':
      return `
        <path d="M35,69 C41,73 59,73 65,69 C64,66 58,64 50,64 C42,64 36,66 35,69 Z" fill="${darken(c, 0.2)}"/>
        <path d="M38,71 L62,71 L50,89 Z" fill="${c}"/>
        <path d="M50,89 L44,79 L56,79 Z" fill="${darken(c, 0.18)}"/>`;
    case 'bandana':
      return `
        <path d="M34,68 C40,73 60,73 66,68 C65,65 58,63 50,63 C42,63 35,65 34,68 Z" fill="${c}"/>
        <path d="M40,72 L60,72 L55,84 L45,84 Z" fill="${darken(c, 0.12)}"/>
        <circle cx="62" cy="70" r="3.4" fill="${lighten(c, 0.12)}"/>`;
    case 'bolo':
      return `
        <path d="M40,70 C44,80 46,88 46,100" stroke="${c}" stroke-width="2" fill="none"/>
        <path d="M60,70 C56,80 54,88 54,100" stroke="${c}" stroke-width="2" fill="none"/>
        <ellipse cx="50" cy="78" rx="5" ry="6" fill="${lighten(c, 0.25)}" stroke="${darken(c, 0.3)}" stroke-width="1.2"/>
        <ellipse cx="50" cy="78" rx="2" ry="2.6" fill="${darken(c, 0.35)}"/>`;
    case 'ribbon':
      return `
        <path d="M38,68 C42,72 58,72 62,68 L62,72 C58,76 42,76 38,72 Z" fill="${c}"/>
        <path d="M46,70 L50,74 L54,70 L52,78 L48,78 Z" fill="${lighten(c, 0.3)}"/>`;
    case 'collar':
      return `
        <path d="M37,69 C42,74 58,74 63,69 L66,76 C58,82 42,82 34,76 Z" fill="${c}"/>
        <rect x="45" y="72" width="10" height="6" rx="1.5" fill="${darken(c, 0.55)}"/>`;
    default:
      return '';
  }
}

function hat(look: AvatarLook): string {
  const c = look.hatColor;
  const under = darken(c, 0.36);
  const top = lighten(c, 0.1);
  const band = look.hatBand
    ? `<path d="M33,26 C38,30 62,30 67,26 L67,30 C62,34 38,34 33,30 Z" fill="${look.hatBand}"/>`
    : '';

  switch (look.hat) {
    case 'tengallon':
      return `
        <path d="M32,30 C32,11 38,6 50,6 C62,6 68,11 68,30 Z" fill="${c}"/>
        <path d="M44,7 C46,14 46,22 45,30 L55,30 C54,22 54,14 56,7 C54,6.2 52,6 50,6 C48,6 46,6.2 44,7 Z" fill="${darken(c, 0.16)}"/>
        ${band}
        <ellipse cx="50" cy="30" rx="34" ry="8" fill="${c}"/>
        <path d="M16,30 C16,35 30,39 50,39 C70,39 84,35 84,30 C84,34 70,37 50,37 C30,37 16,34 16,30 Z" fill="${under}"/>
        <ellipse cx="50" cy="29" rx="34" ry="7" fill="${top}" opacity="0.25"/>`;
    case 'wide':
      return `
        <path d="M33,31 C33,15 39,11 50,11 C61,11 67,15 67,31 Z" fill="${c}"/>
        <path d="M43,12.5 C45,19 45,25 44,31 L56,31 C55,25 55,19 57,12.5 C55,11.4 52.5,11 50,11 C47.5,11 45,11.4 43,12.5 Z" fill="${darken(c, 0.16)}"/>
        ${band}
        <path d="M11,31 C11,25 30,22 50,22 C70,22 89,25 89,31 C89,37 70,40 50,40 C30,40 11,37 11,31 Z" fill="${c}"/>
        <path d="M11,31 C11,37 30,40 50,40 C70,40 89,37 89,31 C89,35 70,38 50,38 C30,38 11,35 11,31 Z" fill="${under}"/>`;
    case 'bowler':
      return `
        <path d="M34,30 C34,14 40,9.5 50,9.5 C60,9.5 66,14 66,30 Z" fill="${c}"/>
        <ellipse cx="50" cy="13.5" rx="15.5" ry="5" fill="${top}" opacity="0.3"/>
        ${band}
        <path d="M24,30 C24,26 36,24 50,24 C64,24 76,26 76,30 C76,34 64,36.5 50,36.5 C36,36.5 24,34 24,30 Z" fill="${c}"/>
        <path d="M24,30 C24,34 36,36.5 50,36.5 C64,36.5 76,34 76,30 C76,33 64,35 50,35 C36,35 24,33 24,30 Z" fill="${under}"/>`;
    case 'flat':
      return `
        <path d="M35,30 L35,8 C35,6.4 36.4,5 38,5 L62,5 C63.6,5 65,6.4 65,8 L65,30 Z" fill="${c}"/>
        ${band}
        <path d="M19,30 C19,26.6 33,24.6 50,24.6 C67,24.6 81,26.6 81,30 C81,33.4 67,35.4 50,35.4 C33,35.4 19,33.4 19,30 Z" fill="${c}"/>
        <path d="M19,30 C19,33.4 33,35.4 50,35.4 C67,35.4 81,33.4 81,30 C81,32.6 67,34.2 50,34.2 C33,34.2 19,32.6 19,30 Z" fill="${under}"/>`;
    case 'cavalry':
      return `
        <path d="M33,30 C33,13 39,8.5 50,8.5 C61,8.5 67,13 67,30 Z" fill="${c}"/>
        <path d="M44,9.5 C46,16 46,24 45,30 L55,30 C54,24 54,16 56,9.5 C54,8.8 52,8.5 50,8.5 C48,8.5 46,8.8 44,9.5 Z" fill="${darken(c, 0.16)}"/>
        ${band}
        <ellipse cx="50" cy="30" rx="32" ry="7.5" fill="${c}"/>
        <path d="M18,30 C18,34.5 32,38 50,38 C68,38 82,34.5 82,30 C82,33.5 68,36 50,36 C32,36 18,33.5 18,30 Z" fill="${under}"/>
        <path d="M18,30 C14,24 16,17 22,15 C24,21 24,26 26,30 Z" fill="${lighten(c, 0.08)}"/>
        <circle cx="22" cy="19" r="2.4" fill="${look.hatBand ?? under}"/>`;
    case 'plumed':
      return `
        <g transform="rotate(-11 50 26)">
          <path d="M36,27 C36,16 42,12 51,12 C60,12 65,16 65,27 Z" fill="${c}"/>
          ${look.hatBand ? `<path d="M36,23 C41,26 60,26 65,23 L65,27 L36,27 Z" fill="${look.hatBand}"/>` : ''}
          <ellipse cx="50" cy="27" rx="25" ry="5.5" fill="${c}"/>
          <path d="M25,27 C25,31 36,34 50,34 C64,34 75,31 75,27 C75,30 64,32.5 50,32.5 C36,32.5 25,30 25,27 Z" fill="${under}"/>
        </g>`;
    case 'headscarf':
      return `
        <path d="M31,44 C30,28 38,22 50,22 C62,22 70,28 69,44 C67,34 60,30 50,30 C40,30 33,34 31,44 Z" fill="${c}"/>
        <path d="M31,42 C31,32 39,26 50,26 C61,26 69,32 69,42 C69,36 61,32 50,32 C39,32 31,36 31,42 Z" fill="${lighten(c, 0.14)}"/>
        <path d="M68,40 C74,40 78,44 76,50 C73,47 70,45 67,45 Z" fill="${darken(c, 0.16)}"/>`;
    case 'headband':
      return `
        <path d="M31.5,38 C36,33 64,33 68.5,38 L68.5,43 C64,38.5 36,38.5 31.5,43 Z" fill="${c}"/>
        <path d="M67,40 C72,41 74,45 72,49 C70,46 68,44 66,43.5 Z" fill="${darken(c, 0.2)}"/>`;
    default:
      return '';
  }
}

function accessory(look: AvatarLook): string {
  switch (look.accessory) {
    case 'badge':
      return `
        <path d="${starPath(28, 84, 8)}" fill="#d9ae4b" stroke="#8a6b23" stroke-width="1"/>
        <circle cx="28" cy="84" r="2.6" fill="#8a6b23"/>`;
    case 'specs':
      return `
        <g fill="none" stroke="#2b2620" stroke-width="1.5" opacity="0.92">
          <circle cx="42.5" cy="46" r="6.4"/>
          <circle cx="57.5" cy="46" r="6.4"/>
          <path d="M48.9,46 L51.1,46"/>
          <path d="M36.1,45 L31,44"/>
          <path d="M63.9,45 L69,44"/>
        </g>
        <circle cx="40.5" cy="44" r="2.2" fill="#ffffff" opacity="0.3"/>
        <circle cx="55.5" cy="44" r="2.2" fill="#ffffff" opacity="0.3"/>`;
    case 'monocle':
      return `
        <circle cx="57.5" cy="46" r="7" fill="#cfe4ef" opacity="0.18" stroke="#c9a24a" stroke-width="1.6"/>
        <path d="M62,51 C64,58 63,64 60,68" stroke="#c9a24a" stroke-width="1" fill="none"/>
        <circle cx="55.5" cy="43.5" r="2.2" fill="#ffffff" opacity="0.35"/>`;
    case 'eyepatch':
      return `
        <path d="M33,40 L68,37" stroke="#1a1519" stroke-width="2.2"/>
        <path d="M35.5,41.5 C40,39.5 47,39.5 50,42 C50,49 46,52.5 41,52.5 C37,52.5 35,48 35.5,41.5 Z" fill="#1a1519"/>`;
    case 'cigar':
      return `
        <g transform="rotate(-16 56 60)">
          <rect x="55" y="57.6" width="19" height="4.6" rx="1.6" fill="#6b4526"/>
          <rect x="55" y="57.6" width="5" height="4.6" rx="1.6" fill="#4a2f19"/>
          <rect x="73" y="57.6" width="3" height="4.6" rx="1.4" fill="#d8642f"/>
        </g>
        <path d="M79,52 C82,48 78,45 81,41" stroke="#cfd3d8" stroke-width="1.2" fill="none" opacity="0.45"/>`;
    case 'toothpick':
      return `<path d="M56,60.5 L67,57" stroke="#d8c79a" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'feather':
      return `
        <g transform="rotate(18 66 18)">
          <path d="M66,20 C72,10 80,6 86,5 C84,13 79,20 70,23 Z" fill="#e4dccb"/>
          <path d="M67,21 C73,14 80,9 85,6" stroke="#b9ae95" stroke-width="1" fill="none"/>
        </g>`;
    case 'scar':
      return `<path d="M64,38 L61,50" stroke="#9c5a44" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`;
    default:
      return '';
  }
}

/** The outlaw's bandana, pulled up over the nose. Drawn over the face. */
function mask(look: AvatarLook): string {
  if (look.accessory !== 'maskUp') return '';
  const c = '#8a2f28';
  return `
    <path d="M32,50 C38,47 62,47 68,50 C68,62 61,69 50,69 C39,69 32,62 32,50 Z" fill="${c}"/>
    <path d="M32,50 C38,47 62,47 68,50 C68,53 65,54 50,54 C35,54 32,53 32,50 Z" fill="${darken(c, 0.2)}"/>
    <path d="M31,49 L26,45 L28,53 Z" fill="${darken(c, 0.3)}"/>`;
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */
/* ------------------------------------------------------------------ */

const cache = new Map<string, string>();

/** Full SVG markup for a character, cached by id. */
export function avatarSvg(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;

  const def: AvatarDef = getAvatar(id);
  const look = def.look;
  const clip = `clip-${id}`;
  const grad = `bg-${id}`;
  const masked = look.accessory === 'maskUp';

  const svg = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${def.name}">
  <defs>
    <clipPath id="${clip}"><circle cx="50" cy="50" r="50"/></clipPath>
    <radialGradient id="${grad}" cx="50%" cy="34%" r="72%">
      <stop offset="0%" stop-color="${lighten(look.bg, 0.26)}"/>
      <stop offset="100%" stop-color="${darken(look.bg, 0.3)}"/>
    </radialGradient>
  </defs>
  <g clip-path="url(#${clip})">
    <rect width="100" height="100" fill="url(#${grad})"/>
    <circle cx="50" cy="88" r="42" fill="${darken(look.bg, 0.45)}" opacity="0.35"/>
    ${backHair(look)}
    ${body(look)}
    ${look.accessory === 'badge' ? accessory(look) : ''}
    ${head(look)}
    ${frontHair(look)}
    ${face(look)}
    ${masked ? '' : mouth(look)}
    ${masked ? '' : facialHair(look)}
    ${mask(look)}
    ${neckwear(look)}
    ${look.accessory === 'badge' || look.accessory === 'feather' ? '' : accessory(look)}
    ${hat(look)}
    ${look.accessory === 'feather' ? accessory(look) : ''}
  </g>
</svg>`.trim();

  cache.set(id, svg);
  return svg;
}

/** Convenience wrapper for places that want a node rather than a string. */
export function avatarNode(id: string, className = 'portrait'): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = avatarSvg(id);
  return el;
}
