# 🏆 Fantasy Draft Party

A tiny live multiplayer web app for deciding your fantasy football draft order.
Everyone joins a room from their own phone, plays a two-part quiz
(hard football Trivia Blitz, then Guess the Footballer from progressive
clues), and the final leaderboard becomes the draft order — with a dramatic
reveal at the end.

No app install needed — it's just a web page. It's a plain static site (no
build step, no server to maintain) that uses [Supabase](https://supabase.com)
for the free real-time backend that syncs players/scores across devices.

## One-time setup (~10 minutes)

### 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) → sign up (free) → **New project**.
2. Pick any name/region, set a database password (you won't need it again), and wait ~2 min for it to provision.

### 2. Create the database tables
1. In your new project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql) and click **Run**.
3. If the last three `alter publication` lines complain about already being
   added, that's fine — ignore it. Otherwise, double check under
   **Database → Replication** that `rooms`, `players`, and `scores` are toggled on.

### 3. Get your API keys
1. Go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.

### 4. Wire them into the app
Open `config.js` in this repo and paste in your values:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJ....";
```

Commit and push. The site is already live via GitHub Pages, so once you push,
it updates automatically within a minute or two.

> The anon key is meant to be public — it's the key browsers use, and it's
> safe to commit as long as Row Level Security is enabled (the schema above
> does this). It's not a secret admin key.

## Playing it

1. Open the site link. Whoever's the host clicks **Create a new room** and
   shares the 4-letter code (or the "Copy invite link" button) with the group.
2. Everyone else opens the link, types their name, and joins.
3. Host clicks **Start the party!** when everyone's in.
4. Trivia Blitz plays first (5 random hard questions), then Guess the
   Footballer (host reveals clues one at a time per round; guessing on
   fewer clues scores more), with a leaderboard at the end.
5. Host clicks **Reveal Draft Order!** for the big reveal.

**Staying anonymous as host:** the shared player list no longer shows who's
hosting — the crown only appears on the host's own screen, never on other
players'. Join with any display name you like (there's no login/identity
check at all) if you also want your name itself to not give you away.

Notes:
- Works best with everyone's phone screen brightness up and a decent wifi/data connection.
- Trivia and Guess-the-Footballer answers are graded client-side (the
  question bank and correct answers live in `trivia.js`, which ships to
  every browser) — fine for a friendly league, not tamper-proof against
  someone digging through devtools.
- Room codes are a light gate, not real security — anyone with the link and
  code can join. Don't put sensitive info in it.

## Backlog / future ideas

- **1v1 head-to-head mini-game** (e.g. a simple WASD-controlled volleyball-
  style game), run as a single-elimination bracket — winners play winners —
  as another section of the draft party. Not started yet.

## Local development

No build step — just open `index.html` in a browser, or serve the folder
with any static file server (`npx serve .`, VS Code Live Server, etc).

## Files

- `index.html` / `style.css` — page shell and styling
- `app.js` — all game logic and Supabase realtime wiring
- `trivia.js` — the trivia question bank (add/edit questions here)
- `config.js` — your Supabase project URL + anon key
- `schema.sql` — database schema to run once in Supabase
