/**
 * HTTP + WebSocket entry point.
 *
 * Two jobs: exchange a Discord OAuth code for a token (Discord requires the
 * client secret to stay server-side), and run the realtime game socket.
 */

import { config as loadEnv } from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

import { Room } from './room.ts';
import type { Table } from './table.ts';
import { DEFAULT_CONFIG, type ClientMessage, type Identity, type ServerMessage } from '../../shared/src/protocol.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * npm runs a workspace script with that workspace as the working directory, so
 * plain `dotenv/config` would look for server/.env and quietly find nothing.
 * Load the repo-root file by path instead, then fall back to a local one.
 * Real environment variables always win — dotenv never overwrites them.
 */
const ROOT_ENV = join(__dirname, '../../.env');
const rootEnv = loadEnv({ path: ROOT_ENV });
loadEnv();

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? '';

const app = express();

/**
 * Discord serves the activity from `{client_id}.discordsays.com` and expects
 * runtime calls to be prefixed with `/.proxy`. Depending on how the URL
 * mapping is configured that prefix may or may not be stripped before it
 * reaches us, so accept it either way rather than leaving a 404 to debug.
 */
app.use((req, _res, next) => {
  if (req.url.startsWith('/.proxy/')) req.url = req.url.slice('/.proxy'.length);
  next();
});

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, players: totalPlayers() });
});

/**
 * The client asks for the Discord app id at boot rather than having it baked
 * in at build time. That way a deploy only needs the id as a runtime variable,
 * and changing it never requires rebuilding the bundle. The id is public —
 * it appears in every OAuth URL — unlike the secret, which stays here.
 */
app.get('/api/config', (_req, res) => {
  res.json({ discordClientId: CLIENT_ID });
});

/**
 * Discord Embedded App SDK auth step two: swap the authorization code for an
 * access token. The secret never leaves this process.
 */
app.post('/api/token', async (req, res) => {
  const code = String(req.body?.code ?? '');
  if (!code) return res.status(400).json({ error: 'missing code' });
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'server is missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET' });
  }
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    const data = (await r.json()) as { access_token?: string; error?: string };
    if (!r.ok || !data.access_token) {
      return res.status(400).json({ error: data.error ?? 'token exchange failed' });
    }
    res.json({ access_token: data.access_token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Serve the built client when there is one (production / single-process mode).
const clientDist = join(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Same reasoning as the /.proxy rewrite above: accept the socket on either path.
server.on('upgrade', (req, socket, head) => {
  const path = (req.url ?? '').split('?')[0].replace(/^\/\.proxy/, '');
  if (path !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

/* ------------------------------------------------------------------ */
/* session + room registry                                             */
/* ------------------------------------------------------------------ */

interface Session {
  ws: WebSocket;
  userId: string;
  roomId: string;
  alive: boolean;
}

const rooms = new Map<string, Room>();
const sessions = new Map<WebSocket, Session>();
/** sessionKey -> userId, so a refresh keeps your seat. */
const sessionKeys = new Map<string, { userId: string; roomId: string }>();

function totalPlayers(): number {
  let n = 0;
  for (const r of rooms.values()) n += r.members.size;
  return n;
}

function getRoom(roomId: string, name: string): Room {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Room(roomId, name, { ...DEFAULT_CONFIG, stakes: { ...DEFAULT_CONFIG.stakes } });
    room.onUpdate = () => scheduleBroadcast(room!);
    rooms.set(roomId, room);
  }
  return room;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/* ------------------------------------------------------------------ */
/* broadcasting                                                        */
/* ------------------------------------------------------------------ */

const dirty = new Set<Room>();
let flushQueued = false;

function scheduleBroadcast(room: Room): void {
  dirty.add(room);
  if (flushQueued) return;
  flushQueued = true;
  // Coalesce the burst of updates a single action produces into one frame.
  setTimeout(() => {
    flushQueued = false;
    const todo = [...dirty];
    dirty.clear();
    for (const r of todo) broadcast(r);
  }, 0);
}

function broadcast(room: Room): void {
  const roomView = room.view();
  room.clearNotice();

  // Drain each table's animation events once, then fan them out.
  const eventsByTable = new Map<string, ReturnType<(typeof room.tables)[number]['takeEvents']>>();
  for (const t of room.tables) {
    const evs = t.takeEvents();
    if (evs.length) eventsByTable.set(t.id, evs);
  }

  for (const s of sessions.values()) {
    if (s.roomId !== room.id) continue;
    send(s.ws, { t: 'room', room: roomView });
    const table = room.viewTable(s.userId);
    if (table) {
      send(s.ws, { t: 'table', table: table.view(s.userId), you: table.youView(s.userId) });
      const evs = eventsByTable.get(table.id);
      if (evs?.length) send(s.ws, { t: 'events', tableId: table.id, events: evs });
    }
  }
}

/* ------------------------------------------------------------------ */
/* identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * Trust Discord, not the browser. When the client supplies an access token we
 * ask Discord who it belongs to; without one (local dev outside Discord) we
 * fall back to the claimed name under a clearly-marked local id.
 */
async function resolveIdentity(claimed: Identity, accessToken?: string): Promise<Identity> {
  if (accessToken) {
    try {
      const r = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) {
        const u = (await r.json()) as {
          id: string;
          username: string;
          global_name?: string | null;
          avatar?: string | null;
        };
        return {
          userId: u.id,
          name: u.global_name || u.username,
          avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` : null,
          avatarId: claimed.avatarId,
        };
      }
    } catch {
      // fall through to the local identity
    }
  }
  const safeName = (claimed.name || 'Player').slice(0, 24);
  const id = claimed.userId?.startsWith('local:') ? claimed.userId : `local:${claimed.userId || randomId()}`;
  return { userId: id, name: safeName, avatar: claimed.avatar ?? null, avatarId: claimed.avatarId };
}

function randomId(): string {
  return randomBytes(8).toString('hex');
}

/* ------------------------------------------------------------------ */
/* socket handling                                                     */
/* ------------------------------------------------------------------ */

wss.on('connection', (ws) => {
  let session: Session | null = null;

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return send(ws, { t: 'error', message: 'bad message' });
    }

    if (msg.t === 'ping') return send(ws, { t: 'pong' });

    if (msg.t === 'hello') {
      const roomId = String(msg.roomId || 'lobby').slice(0, 100);
      const resumed = msg.sessionKey ? sessionKeys.get(msg.sessionKey) : undefined;
      const identity =
        resumed && resumed.roomId === roomId
          ? {
              userId: resumed.userId,
              name: msg.identity.name,
              avatar: msg.identity.avatar,
              avatarId: msg.identity.avatarId,
            }
          : await resolveIdentity(msg.identity, msg.accessToken);

      const room = getRoom(roomId, msg.roomName || 'The Jovi Saloon');
      const member = room.join(identity);

      // Drop any previous socket for the same user (refresh, second tab).
      for (const [sock, other] of sessions) {
        if (other.userId === identity.userId && sock !== ws) {
          sessions.delete(sock);
          try {
            sock.close(4000, 'replaced');
          } catch {
            /* already gone */
          }
        }
      }

      session = { ws, userId: identity.userId, roomId, alive: true };
      sessions.set(ws, session);

      const key = msg.sessionKey && resumed ? msg.sessionKey : randomId();
      sessionKeys.set(key, { userId: identity.userId, roomId });

      const table = room.viewTable(member.userId);
      send(ws, {
        t: 'welcome',
        sessionKey: key,
        room: room.view(),
        you: table ? table.youView(member.userId) : { userId: member.userId, seat: null, cards: [], legal: null, drawPrompt: null, choicePrompt: null },
        table: table ? table.view(member.userId) : null,
      });
      scheduleBroadcast(room);
      return;
    }

    if (!session) return send(ws, { t: 'error', message: 'say hello first' });
    const room = rooms.get(session.roomId);
    if (!room) return send(ws, { t: 'error', message: 'room is gone' });
    const userId = session.userId;
    const fail = (m: string | null) => m && send(ws, { t: 'error', message: m });
    /**
     * Run a table command. `null` means success, so this cannot use `??` —
     * that would report every successful action as "you are not seated".
     */
    const atTable = (fn: (t: Table) => string | null): void => {
      const t = room.tableOf(userId);
      fail(t ? fn(t) : 'you are not seated');
    };

    switch (msg.t) {
      case 'sit':
        fail(room.sit(userId, Math.floor(msg.seat), msg.tableId));
        break;
      case 'stand':
        room.stand(userId);
        break;
      case 'watch':
        room.watchTable(userId, msg.tableId);
        break;
      case 'avatar':
        fail(room.setAvatar(userId, String(msg.avatarId)));
        break;
      case 'ready':
        room.setReady(userId, !!msg.on);
        break;
      case 'rebuy':
        atTable((t) => t.rebuy(userId, Number(msg.amount) || 0));
        break;
      case 'act':
        atTable((t) => t.act(userId, msg.action, msg.amount));
        break;
      case 'discard':
        atTable((t) => t.discard(userId, (msg.cards ?? []).map(Number)));
        break;
      case 'choose-game':
        atTable((t) => t.chooseGame(userId, msg.gameId));
        break;
      case 'config':
        if (!room.isHost(userId)) fail('only the host can change the room settings');
        else fail(room.applyConfig(msg.config));
        break;
      case 'start':
        if (!room.isHost(userId)) fail('only the host can deal');
        else for (const t of room.tables) t.forceStart();
        break;
      case 'start-tournament':
        if (!room.isHost(userId)) fail('only the host can start the tournament');
        else fail(room.startTournament());
        break;
      case 'add-bot':
        if (!room.isHost(userId)) fail('only the host can add practice bots');
        else room.addBots(Math.max(1, Math.min(8, Math.floor(msg.count ?? 1))));
        break;
      case 'remove-bots':
        if (!room.isHost(userId)) fail('only the host can remove practice bots');
        else room.removeBots();
        break;
      case 'chat': {
        const member = room.members.get(userId);
        const text = String(msg.text ?? '').slice(0, 300).trim();
        if (!text || !member) break;
        const out: ServerMessage = { t: 'chat', from: userId, name: member.name, text, ts: Date.now() };
        for (const s of sessions.values()) if (s.roomId === room.id) send(s.ws, out);
        break;
      }
      case 'voice-signal': {
        const target = [...sessions.values()].find((s) => s.roomId === room.id && s.userId === msg.to);
        // Voice is table-scoped: spectators and people at another tournament
        // table are never offered an audio connection.
        if (!target) break;
        const mine = room.tableOf(userId);
        const theirs = room.tableOf(target.userId);
        if (!mine || mine !== theirs) break;
        send(target.ws, { t: 'voice-signal', from: userId, data: msg.data });
        break;
      }
    }
  });

  ws.on('close', () => {
    const s = sessions.get(ws);
    sessions.delete(ws);
    if (!s) return;
    const room = rooms.get(s.roomId);
    if (!room) return;
    room.disconnect(s.userId);
    // Give them a couple of minutes to come back before freeing the seat.
    setTimeout(() => {
      const stillGone = ![...sessions.values()].some((x) => x.userId === s.userId);
      if (stillGone) {
        room.leave(s.userId);
        if (room.members.size === 0) {
          room.dispose();
          rooms.delete(room.id);
        }
      }
    }, 120_000);
  });

  ws.on('pong', () => {
    const s = sessions.get(ws);
    if (s) s.alive = true;
  });
});

// Drop sockets that stopped answering so seats do not sit dead.
setInterval(() => {
  for (const [ws, s] of sessions) {
    if (!s.alive) {
      ws.terminate();
      continue;
    }
    s.alive = false;
    try {
      ws.ping();
    } catch {
      /* closing */
    }
  }
}, 30_000);

server.listen(PORT, () => {
  console.log(`the jovi saloon server listening on http://localhost:${PORT}`);
  if (CLIENT_ID && CLIENT_SECRET) {
    console.log(`  Discord auth ready (app ${CLIENT_ID})`);
  } else {
    // Say which file was read and what was missing from it — "auth disabled"
    // on its own sends you looking in the wrong place.
    const found = rootEnv.error ? 'not found' : 'loaded';
    console.log(`  Discord auth DISABLED`);
    console.log(`    .env (${ROOT_ENV}): ${found}`);
    if (!CLIENT_ID) console.log('    missing DISCORD_CLIENT_ID');
    if (!CLIENT_SECRET) console.log('    missing DISCORD_CLIENT_SECRET');
    console.log('    local browser play still works; run `npm run check` for help');
  }
});
