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
import { GAMES } from '@shared/games.ts';
import { HOW_TO } from '@shared/howto.ts';
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

function addChatMessage(name: string, text: string, mine: boolean): void {
  const list = chatPanel.querySelector<HTMLElement>('.chat-messages');
  if (!list) return;
  const row = document.createElement('article');
  row.className = `chat-message${mine ? ' mine' : ''}`;
  const who = document.createElement('strong');
  who.textContent = mine ? 'You' : name;
  const body = document.createElement('p');
  body.textContent = text;
  row.append(who, body);
  list.appendChild(row);
  while (list.children.length > 80) list.firstElementChild?.remove();
  list.scrollTop = list.scrollHeight;
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
  <button class="room-code" id="room-code" title="Copy room invite" hidden></button>
  <button class="btn char" id="character" title="Change character"><span class="portrait sm" id="my-portrait"></span><span class="char-name">Character</span></button>
  <button class="btn gold" id="rules">How to play</button>
  <button class="btn" id="people">Players</button>
  <button class="btn" id="chat">Table chat</button>
  <button class="btn invite-btn" id="invite">Invite &amp; copy</button>
  <button class="btn" id="voice" title="Use Discord's voice channel">Discord voice</button>
  <button class="btn" id="bots" hidden>+ Bot</button>
  <button class="btn" id="settings" hidden>Settings</button>
  <button class="btn ghost" id="sound" title="Sound">&#128266;</button>`;

app.append(topbar, renderer.root, controls.root);

const chatPanel = document.createElement('aside');
chatPanel.className = 'chat-panel';
chatPanel.hidden = true;
chatPanel.innerHTML = `<header><div><span class="chat-kicker">THE BACK ROOM</span><h2>Table chat</h2></div><button class="btn ghost" data-chat-close aria-label="Close chat">×</button></header><div class="chat-messages" aria-live="polite"></div><form class="chat-compose"><input maxlength="300" placeholder="Say something to the table…" aria-label="Table message"><button class="btn gold" type="submit">Send</button></form>`;
app.appendChild(chatPanel);

const $ = <T extends HTMLElement>(id: string): T => topbar.querySelector(`#${id}`) as T;

$('character').addEventListener('click', () => pickCharacter());
$('rules').addEventListener('click', () => howto.toggle(table?.gameId));
$('people').addEventListener('click', () => room && openRoster(room));
$('chat').addEventListener('click', () => {
  chatPanel.hidden = !chatPanel.hidden;
  if (!chatPanel.hidden) chatPanel.querySelector<HTMLInputElement>('input')!.focus();
});
chatPanel.querySelector<HTMLElement>('[data-chat-close]')!.onclick = () => { chatPanel.hidden = true; };
chatPanel.querySelector<HTMLFormElement>('.chat-compose')!.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = chatPanel.querySelector<HTMLInputElement>('input')!;
  const text = input.value.trim();
  if (!text) return;
  send({ t: 'chat', text });
  input.value = '';
});
async function copyInvite(): Promise<void> {
  if (!room) return;
  if (!new URLSearchParams(location.search).has('room')) {
    openHomeMenu();
    return;
  }
  const url = new URL(location.href);
  url.searchParams.set('room', room.inviteCode);
  const copied = await copyText(url.toString());
  if (copied) toast(`Invite copied — room code ${room.inviteCode}`, 'good');
  // Always reveal the invite after copying. This makes the short code obvious
  // and provides a second, user-gesture copy attempt in Discord's iframe.
  openInviteSheet(room.inviteCode, url.toString(), copied);
}

/** Discord's embedded iframe may deny Clipboard API permission. Use the
 * traditional selection path as a second attempt before asking the player to copy. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* denied */ }
    area.remove();
    return copied;
  }
}

function openInviteSheet(code: string, link: string, copied: boolean): void {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal invite-sheet"><h2>Invite your crew</h2><p class="sub">${copied ? 'Invite link copied. Share it anywhere, or use the short room code below.' : 'Copy the link below, or tell friends the short room code.'}</p><label>Share link</label><input readonly value=""><label>Room code</label><input readonly value=""><div class="modal-actions"><button class="btn ghost" data-close>Close</button><button class="btn gold" data-copy>Copy link</button></div></div>`;
  const inputs = scrim.querySelectorAll<HTMLInputElement>('input');
  inputs[0].value = link; inputs[1].value = code;
  const selectLink = (): void => { inputs[0].focus(); inputs[0].select(); };
  scrim.querySelector<HTMLElement>('[data-close]')!.onclick = () => scrim.remove();
  scrim.querySelector<HTMLElement>('[data-copy]')!.onclick = () => { selectLink(); void copyText(link).then((ok) => { if (ok) { toast('Invite copied.', 'good'); scrim.remove(); } }); };
  inputs.forEach((input) => input.addEventListener('focus', () => input.select()));
  document.body.appendChild(scrim);
  selectLink();
}
$('invite').addEventListener('click', () => void copyInvite());
$('room-code').addEventListener('click', () => void copyInvite());
$('voice').addEventListener('click', () => openVoiceHelp());
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

function openVoiceHelp(): void {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="modal voice-help"><h2>Table voice runs through Discord</h2><p class="sub">Join the same Discord voice channel as your tablemates, then use Discord’s microphone controls. This Activity does not request a second microphone permission.</p><div class="modal-actions"><button class="btn gold">Got it</button></div></div>`;
  scrim.querySelector('button')!.onclick = () => scrim.remove();
  document.body.appendChild(scrim);
}

function openHomeMenu(): void {
  const scrim = document.createElement('div');
  scrim.className = 'scrim home-menu';
  scrim.innerHTML = `<div class="modal wide home-modal"><div class="home-hero"><div class="home-star">★</div><div><p class="eyebrow">PRIVATE TABLES · FREE PLAY · EST. 1876</p><h2>Welcome to The Jovi Saloon</h2><p class="sub">Choose your game, bring your crew, and make the back room your own.</p></div></div>
    <div class="home-grid">
      <section class="home-action join"><span class="home-icon">♠</span><h3>Join a room</h3><p>Enter a host’s code to join their single-table game or tournament from any authorized Discord server.</p><button class="btn gold" data-home="join">Enter room code</button></section>
      <section class="home-action"><span class="home-icon">♣</span><h3>Host single table</h3><p>Start a free-play table. Friends take a seat, mark Ready, and play starts automatically.</p><button class="btn primary" data-home="single">Create single table</button></section>
      <section class="home-action"><span class="home-icon">♦</span><h3>Host tournament</h3><p>Run a 2–36 player event with structured blinds, chip awards, and private invites.</p><button class="btn primary" data-home="tournament">Create tournament</button></section>
      <section class="host-steps"><h3>Invite friends in three steps</h3><ol><li>Create a single-table game or tournament.</li><li>Use <strong>Invite &amp; copy</strong> in the top bar.</li><li>Friends open the Activity and choose <strong>Enter room code</strong>.</li></ol></section>
      <section class="rules"><h3>Game guide — every game</h3><div class="menu-games">${GAMES.map((g) => `<button class="btn" data-game="${g.id}" title="${HOW_TO[g.id]?.tagline ?? ''}">${g.name}</button>`).join('')}</div><p>Select any game for its complete walkthrough and rules.</p></section>
      <section><h3>Table voice</h3><p>Join your Discord voice channel and use Discord’s own microphone controls while you play.</p></section>
    </div></div>`;
  document.body.appendChild(scrim);
  const go = (code: string, create?: string): void => {
    const url = new URL(location.href); url.searchParams.set('room', code); if (create) url.searchParams.set('create', create); else url.searchParams.delete('create'); location.assign(url.toString());
  };
  scrim.querySelectorAll<HTMLElement>('[data-home]').forEach((b) => b.onclick = () => {
    const action = b.dataset.home;
    if (action === 'join') void textPrompt({ title: 'Join a room', label: 'Room code', value: '', required: true, confirmText: 'Join' }).then((code) => { if (code?.trim()) go(code.trim()); });
    if (action === 'single' || action === 'tournament') {
      void requestRoomCode().then((code) => go(code, action)).catch(() => toast('Could not create a room code. Please try again.', 'err'));
    }
  });
  scrim.querySelectorAll<HTMLElement>('[data-game]').forEach((b) => b.onclick = () => { scrim.remove(); howto.open(b.dataset.game); });
}

async function requestRoomCode(): Promise<string> {
  const embedded = new URLSearchParams(location.search).has('frame_id');
  const response = await fetch(`${embedded ? '/.proxy' : ''}/api/room-code`);
  const data = (await response.json()) as { code?: string };
  if (!response.ok || !data.code) throw new Error('room code unavailable');
  return data.code;
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
    return `<h3>${table.message}</h3><p>${you.seat === null ? 'Take a seat, then select Ready to play.' : 'Select Ready to play. A hand starts automatically once two or more players are ready.'}</p>${
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
      const p = new URLSearchParams(location.search);
      const create = p.get('create');
      if (create === 'single' || create === 'tournament') send({ t: 'config', config: { format: create, autoDeal: create === 'single' } });
      else if (!p.get('room')) openHomeMenu();
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
      addChatMessage(msg.name, msg.text, msg.from === myId);
      if (chatPanel.hidden) toast(`${msg.name}: ${msg.text}`);
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
  const roomCode = $('room-code');
  const hasShareableCode = new URLSearchParams(location.search).has('room');
  roomCode.hidden = !hasShareableCode;
  roomCode.textContent = hasShareableCode ? `ROOM CODE · ${room.inviteCode}` : '';
  $('invite').textContent = hasShareableCode ? 'Invite & copy' : 'Create room to invite';

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
