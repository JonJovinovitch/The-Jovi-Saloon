# The Jovi Saloon

A Discord Activity poker room for you and your friends, set in a saloon back
room in 1876. Dealer's choice across 14 real poker variants, a
server-authoritative engine, animated dealing, sixteen western characters to
play as, and a built-in **How To Play** panel you can read while a hand is
running.

It also runs as a plain web app in any browser, which is how you develop it and
how anyone without Discord can join.

```
you ──► Discord Activity iframe ──► /.proxy/ ──► this server ──► authoritative engine
```

---

## What's in it

**Games** — every one includes a rules page in the app.

| | Community | Stud | Draw |
|---|---|---|---|
| | No-Limit Hold'em | Seven Card Stud | Five Card Draw |
| | Limit Hold'em | Stud Hi-Lo (8 or better) | 2-7 Triple Draw |
| | Pot-Limit Omaha | Razz | A-5 Triple Draw |
| | Omaha Hi-Lo (8 or better) | | Badugi |
| | Big O (5-card Omaha Hi-Lo) | | |
| | Crazy Pineapple | | |
| | Short Deck (6+) Hold'em | | |

**Room formats**

- **Dealer's choice** — whoever has the button picks the next game from the full
  list, with a *Rules* shortcut on every option.
- **One game all night** — pick a variant and stay there.
- **Mixed rotation** — H.O.R.S.E., Hold'em/Omaha, a draw mix, or everything;
  the game changes every orbit.

**Automatic table scaling** — the room opens a second table the moment more than
`seatCap` (default 9) players sit down, and keeps every table within one seat of
the others. Nobody is ever moved out of a hand they are playing: a pending move
waits until their table goes idle, exactly like a live card room breaking and
balancing tables.

**Characters** — everyone picks who they are at the table: the Sheriff, the
Outlaw, the Card Sharp, the Prospector, the Songbird, the Marshal, the Bounty
Hunter, the Preacher, the Doc, the Rancher, the Rustler, the Banker, the
Barkeep, the Trail Scout, the Blacksmith, the Undertaker.

Only one of each per room — first to claim it rides with it — and your choice
follows you back in next time. Click your own portrait at the table (or the
button in the top bar) to change. Practice bots get their own characters too.

The portraits are not image files. Each is a set of parameters (hat, hair,
facial hair, neckwear, accessory, palette) in
[`shared/src/avatars.ts`](shared/src/avatars.ts) that
[`client/src/ui/avatar.ts`](client/src/ui/avatar.ts) draws as inline SVG — so
they scale to any seat size and there is nothing to load through Discord's
proxy. Open **`/cast.html`** to see the whole cast at full size.

**Everything else you'd expect** — blinds, antes and stud bring-ins; No Limit,
Pot Limit and Fixed Limit betting with proper minimum raises, the four-raise cap
and the incomplete-all-in rule; layered side pots; split pots with an
eight-or-better low qualifier and odd-chip rules; action clocks; sit out, rebuy,
reconnect; practice bots to fill seats.

---

## Quick start (no Discord needed)

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:3000>. Enter a name, click a seat, and press **+ Bot** a
few times to get a game going. Share `http://localhost:3000/?room=kitchen` (or a
tunnelled URL) and anyone who opens the same `room` value lands at the same table.

To run the built client from the game server on a single port instead:

```bash
npm run build && npm start
```

That serves everything from <http://localhost:3001>.

---

## Running it as a Discord Activity

Discord loads activities in a sandboxed iframe over HTTPS, so you need a public
URL and an app registration.

**1. Create the app**

Go to the [Discord Developer Portal](https://discord.com/developers/applications)
and create an application. From **OAuth2**, copy the Client ID and Client Secret.

**2. Configure this repo**

```bash
cp .env.example .env
```

Fill in `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and set
`VITE_DISCORD_CLIENT_ID` to the same client id.

**3. Privacy Policy and Terms of Service URLs**

The portal's **General Information** tab has fields for these. The app ships
both pages already, served at `/privacy.html` and `/terms.html` on whatever
host you deploy to — for example:

```
https://the-jovi-saloon-production.up.railway.app/privacy.html
https://the-jovi-saloon-production.up.railway.app/terms.html
```

Paste those into the matching fields and save. Edit the contact email at the
bottom of [`client/privacy.html`](client/privacy.html) and
[`client/terms.html`](client/terms.html) if you want a different one.

**4. Expose the server**

For a permanent setup, skip the tunnel and [deploy to Railway](#hosting-it-on-railway)
instead — you get a fixed URL and never touch the URL mapping again.

For a quick local test:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

Copy the `https://….trycloudflare.com` hostname it prints.

**5. Turn on Activities and map the URL**

In the Developer Portal:

- **Activities → Settings** — enable Activities.
- **Activities → URL Mappings** — map the root prefix `/` to your tunnel
  hostname (no scheme, e.g. `abc-def.trycloudflare.com`).
- **OAuth2** — make sure the `identify` scope is available.

**6. Install and launch**

Install the app to your server, join a voice channel, open the activity
launcher (the rocket icon), and pick The Jovi Saloon.

Each voice channel gets its own room, so two channels can run separate games.

> **Why the `/.proxy` prefix?** Inside Discord every network request has to be
> same-origin and routed through Discord's proxy. The client detects that it is
> embedded and prefixes its API and WebSocket calls automatically — see
> [`client/src/discord.ts`](client/src/discord.ts).

---

## Hosting it on Railway

A tunnel gets a new random hostname every restart, which means re-editing the
Discord URL mapping every session. Hosting the server gives you one permanent
URL: set the mapping once and forget it.

The repo is already configured — [`railway.json`](railway.json) sets the build,
start command, health check and replica count.

**1. Get the code to Railway.** Either connect a GitHub repo (Railway then
redeploys on every push), or push straight from this folder with the CLI:

```bash
npm i -g @railway/cli && railway login && railway init && railway up
```

**2. Set two variables** in the Railway dashboard → your service → **Variables**:

| Variable | Value |
|---|---|
| `DISCORD_CLIENT_ID` | your application id |
| `DISCORD_CLIENT_SECRET` | your client secret |

Do **not** set `PORT` — Railway injects it, and the server already reads it.
(`.env` is gitignored and never deployed; even if it were, dotenv does not
override real environment variables, so Railway's `PORT` still wins.)

**3. Generate a domain** under **Settings → Networking**. You get something
like `the-jovi-saloon-production.up.railway.app`.

**4. Point Discord at it** — Activities → URL Mappings, prefix `/`, target that
hostname (no `https://`, no trailing slash). This is the last time you touch it.

Then no local server and no tunnel: the activity works whenever Discord loads it.

**Worth knowing**

- Keep it at **one replica**. Rooms live in memory, so a second instance would
  be a second, separate card room.
- A redeploy or restart clears every room and resets stacks. Deploy between
  sessions, not during one.
- Turn **off** app sleeping if your plan offers it, so the first player through
  the door does not wait for a cold start.
- It is a small always-on Node service; check Railway's current pricing for what
  that costs.

Local development is unchanged — `npm run dev` still works exactly as before.

## How it is put together

```
shared/src/
  cards.ts        card encoding, CSPRNG shuffle, the shoe
  evaluator.ts    four rank orders: high, ace-to-five, deuce-to-seven, badugi
  games.ts        the game catalog — every variant is data, not code
  howto.ts        the rules content the app teaches from
  avatars.ts      the cast — every character is data, not an image
  protocol.ts     the wire format

server/src/
  engine.ts       one hand of one game: betting, draws, side pots, showdown
  table.ts        seats, clocks, dealer's choice, per-viewer redaction
  room.ts         membership and automatic table scaling
  bots.ts         practice opponents
  index.ts        HTTP + WebSocket + the Discord token exchange

client/
  cast.html, privacy.html, terms.html   static pages built alongside index.html

client/src/
  main.ts         app shell
  cast.ts         the /cast.html contact sheet
  ui/table.ts     the felt: seats, cards, chips, animation
  ui/avatar.ts    draws a character from its parameters
  ui/controls.ts  the action bar
  ui/howto.ts     the rules drawer
  ui/lobby.ts     settings, game picker, roster
```

Two properties are worth knowing about:

**The server is the only thing that sees the deck.** A `TableView` is built
separately for every viewer, and cards you are not entitled to see arrive as
`null` — never as a real value the client is trusted to hide. Face-up stud cards
are the only hole cards that leave the server before showdown.

**Games are data.** A `GameSpec` describes the streets, the forced bets, the
betting structure and the ranking rule; the engine reads it and runs it. Adding
a variant means adding a catalog entry and a rules page, not touching the state
machine.

---

## Adding a game

1. Add a `GameSpec` to `shared/src/games.ts`.
2. Add a matching `HowTo` entry to `shared/src/howto.ts` (the app links them by id).
3. Run the tests — the fuzz test automatically picks up every game in the
   catalog and plays hundreds of random hands of it.

## Adding or changing a character

1. Add an `AvatarDef` to `shared/src/avatars.ts`. Everything visual comes from
   its `look`: `hat`, `hairStyle`, `facial`, `neck`, `accessory` and the colours.
2. If you need a shape that does not exist yet — a new hat, say — add a case to
   the matching function in `client/src/ui/avatar.ts`.
3. Open `/cast.html` to see the result at full size next to the rest of the cast.

Nothing else needs touching: the picker, the seats and the roster all read the
catalog, and the server validates ids against it.

---

## Testing

```bash
npm test
```

Covers hand ranking in all four orders (including the short-deck reordering and
the Omaha exactly-two-hole-cards rule), then fuzzes every game in the catalog at
several table sizes, asserting on each hand that chips are conserved, no stack
goes negative, side pots pay out exactly, and no card is ever dealt twice.

Type-check everything with:

```bash
npm run typecheck
```

---

## Notes

- Chips are play money. There is no cashier, no ledger, and nothing here is
  built to handle real stakes.
- Wild-card home games (Follow the Queen, Baseball, deuces wild) are not in the
  catalog. They need five-of-a-kind support and a substitution search in the
  evaluator, which is the natural next addition.
- Rooms live in memory. Restarting the server clears them; players keep their
  seats across a refresh or a dropped connection for two minutes.
