/**
 * Discord Activity bootstrap.
 *
 * Inside Discord the app runs in a sandboxed iframe: every network call has to
 * be same-origin and go through Discord's `/.proxy/` path, and the user's
 * identity comes from the Embedded App SDK rather than from us. Outside
 * Discord (plain browser, local dev) we fall back to a name prompt so the same
 * build is playable either way.
 */

import { DiscordSDK } from '@discord/embedded-app-sdk';
import type { Identity } from '@shared/protocol.ts';
import { textPrompt } from './ui/prompt.ts';

export interface Boot {
  embedded: boolean;
  roomId: string;
  roomName: string;
  identity: Identity;
  accessToken?: string;
  /** Prefix for same-origin calls: '' locally, '/.proxy' inside Discord. */
  base: string;
}

/**
 * Race a promise against a deadline. Used only around machine-to-machine
 * steps (network calls, the Discord SDK) — never around anything waiting on
 * a human, where "slow" and "stuck" look identical from the outside.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Ask the server which Discord app we belong to. Falls back to a build-time
 * value so a bundle built the old way still works.
 */
async function fetchClientId(base: string): Promise<string> {
  try {
    const r = await fetch(`${base}/api/config`);
    if (r.ok) {
      const j = (await r.json()) as { discordClientId?: string };
      if (j.discordClientId) return j.discordClientId;
    }
  } catch {
    // server unreachable; fall through
  }
  return import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';
}

/** Discord appends these to the iframe URL; their presence is the giveaway. */
export function isEmbedded(): boolean {
  const p = new URLSearchParams(location.search);
  return p.has('frame_id') && p.has('instance_id');
}

export function wsUrl(base: string): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}${base}/ws`;
}

export async function boot(): Promise<Boot> {
  const embedded = isEmbedded();

  let clientId = '';
  try {
    // A hung fetch (not just a failed one) would otherwise block everything
    // that follows, including the local-mode fallback below.
    clientId = await withTimeout(fetchClientId(embedded ? '/.proxy' : ''), 8_000, 'Config fetch');
  } catch {
    clientId = import.meta.env.VITE_DISCORD_CLIENT_ID ?? '';
  }
  if (!embedded || !clientId) return bootLocal();

  try {
    // Bounded because this is pure SDK/network back-and-forth with Discord —
    // nothing here should ever legitimately take 20 seconds. bootLocal()
    // below, by contrast, waits on a human and must stay unbounded.
    return await withTimeout(bootDiscord(clientId), 20_000, 'Discord sign-in');
  } catch (err) {
    console.warn('Discord auth failed, falling back to local mode', err);
    return bootLocal();
  }
}

async function bootDiscord(clientId: string): Promise<Boot> {
  const base = '/.proxy';
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  // `identify` is all we need — a name and an avatar. Asking for more would
  // put an extra consent prompt in front of every friend for nothing.
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const { access_token: accessToken } = (await res.json()) as { access_token?: string };
  if (!accessToken) throw new Error('token exchange failed');

  const auth = await sdk.commands.authenticate({ access_token: accessToken });
  const user = auth.user;

  // A shared code creates a private room inside the same Discord channel;
  // without one, retain the convenient one-room-per-channel default.
  const roomCode = new URLSearchParams(location.search).get('room')?.replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  // A code is global to this deployment, so friends can join from any server
  // where the Activity is authorized. Without one, keep a private channel lobby.
  const roomId = roomCode ? `room:${roomCode.toLowerCase()}` : `lobby:${sdk.guildId ?? 'dm'}:${sdk.channelId ?? sdk.instanceId}`;

  return {
    embedded: true,
    roomId,
    roomName: 'The Jovi Saloon',
    accessToken,
    base,
    identity: {
      userId: user.id,
      name: user.global_name || user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
      avatarId: savedAvatarId(),
    },
  };
}

async function bootLocal(): Promise<Boot> {
  const params = new URLSearchParams(location.search);
  const roomId = params.get('room') || location.hash.slice(1) || 'local';

  let name = localStorage.getItem('poker.name') ?? '';
  if (!name) {
    const answer = await textPrompt({
      title: 'Welcome to the room',
      label: 'Your name',
      value: `Player ${Math.floor(Math.random() * 900 + 100)}`,
      confirmText: 'Sit down',
      required: true,
    });
    name = (answer ?? '').trim().slice(0, 24) || `Player ${Math.floor(Math.random() * 900 + 100)}`;
    localStorage.setItem('poker.name', name);
  }
  let userId = localStorage.getItem('poker.uid');
  if (!userId) {
    userId = `local:${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem('poker.uid', userId);
  }

  return {
    embedded: false,
    roomId: `local:${roomId}`,
    roomName: 'The Jovi Saloon',
    base: '',
    identity: { userId, name, avatar: null, avatarId: savedAvatarId() },
  };
}

/** The character you rode in with last time, if it is still free. */
function savedAvatarId(): string | undefined {
  return localStorage.getItem('poker.avatar') ?? undefined;
}
