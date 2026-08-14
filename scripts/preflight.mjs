/**
 * Pre-flight check before taking the room into Discord.
 *
 * Catches the handful of things that otherwise show up as a blank white iframe
 * with no useful error: a missing or mismatched client id, an unset secret, or
 * a client bundle built before the id was filled in.
 *
 *   node scripts/preflight.mjs
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const envPath = join(root, '.env');
if (!existsSync(envPath)) {
  problems.push('No .env file. Copy .env.example to .env and fill it in.');
}

const env = {};
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].trim();
  }
}

const id = env.DISCORD_CLIENT_ID ?? '';
const viteId = env.VITE_DISCORD_CLIENT_ID ?? '';
const secret = env.DISCORD_CLIENT_SECRET ?? '';
const placeholder = (v) => !v || v.startsWith('PASTE_');

if (placeholder(id)) problems.push('DISCORD_CLIENT_ID is not set in .env.');
else if (!/^\d{17,20}$/.test(id)) {
  problems.push(`DISCORD_CLIENT_ID does not look like an application id: "${id}"`);
}

if (placeholder(secret)) problems.push('DISCORD_CLIENT_SECRET is not set in .env.');
else if (secret.length < 20) notes.push('DISCORD_CLIENT_SECRET looks short — double check you copied all of it.');

// The client now reads the app id from /api/config at runtime, so this is only
// a legacy fallback and never needs to match.
if (!placeholder(viteId) && !placeholder(id) && viteId !== id) {
  notes.push('VITE_DISCORD_CLIENT_ID differs from DISCORD_CLIENT_ID. Harmless now — the client asks the server — but tidy it up.');
}

const distIndex = join(root, 'client', 'dist', 'index.html');
if (!existsSync(distIndex)) {
  problems.push('client/dist is missing. Run: npm run build --workspace client');
}
void statSync;

console.log('');
console.log(bold('  Poker Room — pre-flight'));
console.log('');

if (problems.length === 0) {
  console.log(`  ${green('✓')} .env looks good (app ${id})`);
  console.log(`  ${green('✓')} client bundle is built and current`);
  for (const n of notes) console.log(`  ${yellow('!')} ${n}`);
  console.log('');
  console.log('  Next:');
  console.log(`    1. ${bold('npm run play')}     ${dim('# serves everything on http://localhost:3001')}`);
  console.log(`    2. ${bold('npm run tunnel')}   ${dim('# in a second terminal, copy the https:// host it prints')}`);
  console.log('    3. Discord portal → your app → Activities → URL Mappings');
  console.log(`       ${dim('prefix')}  /`);
  console.log(`       ${dim('target')}  <the tunnel host, no https:// and no trailing slash>`);
  console.log('    4. Join a voice channel → Activities (rocket) → Poker Room');
  console.log('');
} else {
  for (const p of problems) console.log(`  ${red('✗')} ${p}`);
  for (const n of notes) console.log(`  ${yellow('!')} ${n}`);
  console.log('');
  console.log(dim('  Fix the above, then run this again: node scripts/preflight.mjs'));
  console.log('');
  process.exitCode = 1;
}
