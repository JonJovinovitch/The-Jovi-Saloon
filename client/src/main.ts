/**
 * App shell: boots Discord (or local) auth, opens the socket, and wires the
 * table, action bar and rules drawer to the server's view of the world.
 */

import './styles.css';
import { boot, wsUrl } from './discord.ts';
import { Net } from './net.ts';
import { TableRenderer } from './ui/table.ts';
import { Controls } from './ui/controls.ts';
import { HowToDrawer } from './ui/howto.ts';
import { openGamePicker, openRoster, openSettings } from './ui/lobby.ts';
import { openAvatarPicker } from './ui/avatarPicker.ts';
import { avatarSvg } from './ui/avatar.ts';
import { textPrompt } from './ui/prompt.ts';
import { fmtChips } from './ui/cards.ts';
import { sfx, setSoundEnabled, soundEnabled, unlockAudio } from './sound.ts';
import { getAvatar } from '@shared/avatars.ts';
import type { Card } from '@shared/cards.ts';
import type { ClientMessage, RoomView, ServerMessage, TableView, YouView } from '@shared/protocol.ts';

const app = document.getElementById('app')!;

/* ------------------------------------------------------------------ */
/* splash while we authenticate                                        */
/* ------------------------------------------------------------------ */

const splash = document.createElement('div');
splash.className = 'splash';
splash.innerHTML = `
  <div class="inner">
    <div class="suits">&spades; &hearts; &diams; &clubs;</div>
    <h1>The Jovi Saloon</h1>
    <div class="rule"></div>
    <p>Dealer's choice &middot; est. 1876</p>
    <div class="spinner"></div>
  </div>`;
document.body.appendChild(splash);

const toasts = document.createElement('div');
toasts.className = 'toasts';
document.body.appendChild(toasts);

function toast(text: string, kind: '' | 'err' | 'good' = ''): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  toasts.appendChild(el);
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).onfinish = () => el.remove();
  }, 3200);
}

/**
 * Turn a stuck splash into a visible, actionable failure. Without this, any
 * exception between the splash appearing and the 'welcome' message arriving
 * is invisible — the spinner just runs forever, because splash.remove() only
 * ever happens on 'welcome'.
 */
function showSplashError(message: string): void {
  const inner = splash.querySelector('.inner');
  if (!inner) return;
  inner.querySelector('.spinner')?.remove();
  let box = inner.querySelector<HTMLElement>('.splash-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'splash-error';
    box.innerHTML = `<p class="splash-error-msg"></p><button class="btn gold">Try again</button>`;
    box.querySelector('button')!.addEventListener('click', () => location.reload());
    inner.appendChild(box);
  }
  box.querySelector('.splash-error-msg')!.textContent = message;
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

let room: RoomView | null = null;
let table: TableView | null = null;
let you: YouView | null = null;
let myId = '';
let net!: Net;
let closeGamePicker: (() => void) | null = null;
let hadTurn = false;
let welcomeTimer = 0;
let tournamentTimer = 0;

const howto = new HowToDrawer();
document.body.appendChild(howto.root);

const renderer = new TableRenderer({
  onSit: (seat) => send({ t: 'sit', seat, tableId: table?.id }),
  onToggleCard: (card: Card) => {
    if (renderer.selected.has(card)) renderer.selected.delete(card);
    else renderer.selected.add(card);
    paint();
  },
  onChangeAvatar: () => pickCharacter(),
});

function pickCharacter(): void {
  if (!room) return;
  openAvatarPicker(room, myId, (avatarId) => {
    localStorage.setItem('poker.avatar', avatarId);
    send({ t: 'avatar', avatarId });
  });
}

const controls = new Controls({
  onAct: (action, amount) => send({ t: 'act', action, amount }),
  onDiscard: (cards) => {
    send({ t: 'discard', cards });
    renderer.selected.clear();
  },
  onReady: (on) => send({ t: 'ready', on }),
  onStand: () => send({ t: 'stand' }),
  onRebuy: () => {
    const suggested = room?.config.startingStack ?? 1000;
    void textPrompt({
      title: 'Rebuy',
      label: 'Chips',
      value: String(suggested),
      kind: 'number',
      min: 1,
      confirmText: 'Buy in',
    }).then((answer) => {
      const amount = Number(answer ?? 0);
      if (amount > 0) send({ t: 'rebuy', amount });
    });
  },
  onSitPrompt: () => toast('Click an open seat at the table to sit down.'),
});

/* ------------------------------------------------------------------ */
/* chrome                                                              */
/* ------------------------------------------------------------------ */

const topbar = document.createElement('div');
topbar.className = 'topbar';
topbar.innerHTML = `
  <div class="brand"><span class="pip">&starf;</span><span>The Jovi Saloon</span></div>
  <div class="chip-tag game" id="game-tag">—</div>
  <div class="chip-tag" id="stakes-tag"></div>
  <div class="chip-tag tournament-clock" id="tournament-clock" hidden></div>
  <div class="tablepicker" id="tables"></div>
  <div class="spacer"></div>
  <div class="chip-tag" id="conn">saddling up…</div>
  <button class="btn char" id="character" title="Change character"><span class="portrait sm" id="my-portrait"></span><span class="char-name">Character</span></button>
  <button class="btn gold" id="rules">How to play</button>
  <button class="btn" id="people">Players</button>
  <button class="btn" id="invite">Invite</button>
  <button class="btn" id="bots" hidden>+ Bot</button>
  <button class="btn" id="settings" hidden>Settings</button>
  <button class="btn ghost" id="sound" title="Sound">&#128266;</button>`;

app.append(topbar, renderer.root, controls.root);

const $ = <T extends HTMLElement>(id: string): T => topbar.querySelector(`#${id}`) as T;

$('character').addEventListener('click', () => pickCharacter());
$('rules').addEventListener('click', () => howto.toggle(table?.gameId));
$('people').addEventListener('click', () => room && openRoster(room));
$('invite').addEventListener('click', async () => {
  if (!room) return;
  const url = new URL(location.href);
  url.searchParams.set('room', room.inviteCode);
  try { await navigator.clipboard.writeText(url.toString()); toast(`Invite link copied — code: ${room.inviteCode}`, 'good'); }
  catch { toast(`Room code: ${room.inviteCode}. Share this page's link.`, 'good'); }
});
$('settings').addEventListener('click', () => room && openSettings(room, (patch) => send({ t: 'config', config: patch })));
$('bots').addEventListener('click', () => send({ t: 'add-bot', count: 1 }));
$('sound').addEventListener('click', () => {
  setSoundEnabled(!soundEnabled());
  $('sound').textContent = soundEnabled() ? '\u{1F50A}' : '\u{1F507}';
  if (soundEnabled()) sfx.check();
});
$('sound').textContent = soundEnabled() ? '\u{1F50A}' : '\u{1F507}';
document.addEventListener('pointerdown', unlockAudio, { once: true });

/* ------------------------------------------------------------------ */
/* painting                                                            */
/* ------------------------------------------------------------------ */

function send(msg: ClientMessage): void {
  net?.send(msg);
}

function paint(): void {
  if (!table || !you) return;

  renderer.render(table, you);
  controls.render(table, you, renderer.selected, room?.hostId === myId, room?.config.format === 'tournament');

  $('game-tag').textContent = table.gameName;
  const s = table.stakes;
  $('stakes-tag').textContent =
    table.limit === 'fl'
      ? `${fmtChips(s.smallBet)} / ${fmtChips(s.bigBet)} limit`
      : `${fmtChips(s.smallBlind)} / ${fmtChips(s.bigBlind)}${s.bigBlindAnte ? ` • BBA ${fmtChips(s.bigBlindAnte)}` : ''}`;
  renderTournamentClock();

  // Table tabs only earn their space once the room has more than one.
  const tabs = $('tables');
  if (room && room.tables.length > 1) {
    tabs.replaceChildren(
      ...room.tables.map((t) => {
        const b = document.createElement('button');
        b.className = `tab${t.id === table!.id ? ' active' : ''}`;
        b.textContent = `Table ${t.index + 1} (${t.seated})`;
        b.addEventListener('click', () => send({ t: 'watch', tableId: t.id }));
        return b;
      }),
    );
  } else {
    tabs.replaceChildren();
  }

  renderer.setPrompt(centerPrompt());
  wirePrompt();

  if (you.choicePrompt && !closeGamePicker) {
    closeGamePicker = openGamePicker(
      you.choicePrompt.options,
      (gameId) => {
        send({ t: 'choose-game', gameId });
        closeGamePicker = null;
      },
      (gameId) => howto.open(gameId),
    );
  } else if (!you.choicePrompt && closeGamePicker) {
    closeGamePicker();
    closeGamePicker = null;
  }

  const myTurn = !!you.legal || !!you.drawPrompt;
  if (myTurn && !hadTurn) sfx.turn();
  hadTurn = myTurn;
}

function renderTournamentClock(): void {
  window.clearTimeout(tournamentTimer);
  const el = $('tournament-clock');
  const t = room?.tournament;
  if (!t) { el.hidden = true; return; }
  el.hidden = false;
  if (t.state === 'setup') {
    el.textContent = `Tournament setup: ${t.entries}/${t.maxPlayers}`;
    return;
  }
  if (t.state === 'complete') { el.textContent = `${t.winnerName ?? 'Tournament'} wins`; return; }
  const left = Math.max(0, (t.nextLevelAt ?? Date.now()) - Date.now());
  const min = Math.floor(left / 60000); const sec = Math.floor(left / 1000) % 60;
  el.textContent = `Level ${t.level} • blinds in ${min}:${String(sec).padStart(2, '0')}`;
  tournamentTimer = window.setTimeout(renderTournamentClock, 1000);
}

function centerPrompt(): string | null {
  if (!table || !you) return null;
  if (table.state === 'choosing' && you.seat !== table.choosingSeat) {
    const chooser = table.seats.find((s) => s.seat === table!.choosingSeat);
    return `<h3>Dealer's choice</h3><p>${chooser?.name ?? 'The dealer'} is picking the next game.</p>`;
  }
  if (table.state === 'waiting') {
    const seated = table.seats.length;
    if (you.seat === null) {
      return `<h3>Pull up a chair</h3><p>Click an open seat to join. ${seated} seated so far.</p>
        <p><button class="btn gold" data-act="rules">Learn a game first</button></p>`;
    }
    const tournament = room?.tournament;
    if (tournament?.state === 'setup') {
      const prizes = tournament.payouts.length ? ` Chip awards: ${tournament.payouts.map((p) => `${p.place}${p.place === 1 ? 'st' : p.place === 2 ? 'nd' : p.place === 3 ? 'rd' : 'th'} ${p.amount.toLocaleString()}`).join(' • ')}.` : '';
      return `<h3>Tournament setup — ${tournament.entries}/${tournament.maxPlayers} seated</h3><p>1. Set blinds and buy-in in Settings. 2. Tap Invite and share the code. 3. Start when everyone has a seat.${prizes}</p>${
        room?.hostId === myId ? '<p><button class="btn gold" data-act="start-tournament">Start tournament</button></p>' : '<p>Waiting for the host to start the tournament.</p>'}`;
    }
    return `<h3>${table.message}</h3><p>${you.seat === null ? 'Take a seat, then select Ready to play.' : 'Select Ready to play. A cash hand starts automatically once two or more players are ready.'}</p>${
      room?.hostId === myId ? '<p><button class="btn" data-act="bot">Add a practice bot</button></p>' : ''
    }`;
  }
  return null;
}

function wirePrompt(): void {
  for (const btn of renderer.promptRoot.querySelectorAll<HTMLElement>('[data-act]')) {
    btn.onclick = () => {
      if (btn.dataset.act === 'bot') send({ t: 'add-bot', count: 1 });
      if (btn.dataset.act === 'start-tournament') send({ t: 'start-tournament' });
      if (btn.dataset.act === 'rules') howto.open();
    };
  }
}

/* ------------------------------------------------------------------ */
/* connect                                                             */
/* ------------------------------------------------------------------ */

void (async () => {
  let info;
  try {
    // boot() already bounds every machine-to-machine step internally (the
    // config fetch, the Discord SDK calls) and falls back to asking for a
    // name if any of them fail. This catch is only the last-resort net for
    // something genuinely unexpected — it must not impose its own deadline,
    // because the local-mode fallback legitimately waits on a human typing.
    info = await boot();
  } catch (err) {
    console.error('boot failed', err);
    showSplashError('Could not sign in. Tap Try Again — if it keeps happening, ask whoever set this up to check the server.');
    return;
  }

  myId = info.identity.userId;

  const helloMsg = (): ClientMessage => ({
    t: 'hello',
    roomId: info.roomId,
    roomName: info.roomName,
    identity: info.identity,
    accessToken: info.accessToken,
    sessionKey: sessionStorage.getItem('poker.session') ?? undefined,
  });

  net = new Net(
    wsUrl(info.base),
    helloMsg,
    onMessage,
    (connected) => {
      const el = $('conn');
      el.textContent = connected ? 'live' : 'reconnecting…';
      el.style.color = connected ? 'var(--good)' : 'var(--warn)';
    },
  );
  net.connect();

  window.clearTimeout(welcomeTimer);
  welcomeTimer = window.setTimeout(() => {
    showSplashError('Connected, but never heard back from the table. Tap Try Again.');
  }, 20_000);
})();

function onMessage(msg: ServerMessage): void {
  switch (msg.t) {
    case 'welcome':
      window.clearTimeout(welcomeTimer);
      sessionStorage.setItem('poker.session', msg.sessionKey);
      myId = msg.you.userId;
      room = msg.room;
      you = msg.you;
      table = msg.table;
      splash.remove();
      applyRoom();
      paint();
      break;
    case 'room':
      room = msg.room;
      applyRoom();
      if (msg.room.notice) toast(msg.room.notice, 'good');
      paint();
      break;
    case 'table': {
      const switchedGame = table?.gameId !== msg.table.gameId;
      table = msg.table;
      you = msg.you;
      paint();
      if (switchedGame) howto.syncGame(msg.table.gameId);
      break;
    }
    case 'events':
      if (table && msg.tableId === table.id) renderer.playEvents(msg.events);
      break;
    case 'chat':
      toast(`${msg.name}: ${msg.text}`);
      break;
    case 'error':
      toast(msg.message, 'err');
      break;
    default:
      break;
  }
}

function applyRoom(): void {
  if (!room) return;
  const host = room.hostId === myId;
  $('settings').hidden = !host;
  $('bots').hidden = !host;

  const me = room.members.find((m) => m.userId === myId);
  if (me) {
    // Keep the local preference in step, so you ride back in as the same
    // character next time — including after the room reassigned it.
    localStorage.setItem('poker.avatar', me.avatarId);
    const slot = $('my-portrait');
    if (slot.dataset.av !== me.avatarId) {
      slot.dataset.av = me.avatarId;
      slot.innerHTML = avatarSvg(me.avatarId);
      const label = topbar.querySelector('.char-name');
      if (label) label.textContent = getAvatar(me.avatarId).name.replace(/^The /, '');
    }
  }
}
