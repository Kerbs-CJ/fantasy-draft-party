# 🏆 Fantasy League Bugaloo — Draft Party

A tiny live multiplayer web app for deciding the Fantasy League Bugaloo draft
order. Everyone joins a room from their own device, plays through three
rounds — hard football Trivia Blitz, Guess the Footballer from progressive
clues, then a 1v1 penalty shootout round robin (everyone plays everyone once,
standings by wins/goal difference) — and the combined leaderboard becomes the
draft order, with a dramatic reveal at the end.

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
   fewer clues scores more), with a leaderboard at the end of each.
5. Host clicks through to the shootout intro screen (full explainer: format,
   how a match works, how standings/tiebreaks are decided, and a table of
   exactly how many points each final placement is worth), then **Start
   Round Robin**. This generates every possible pairing once each (10
   matches for 5 players — no byes, no bracket, no elimination), ordered so
   no one plays three matches in a row back-to-back. Host starts each match
   one at a time
   from the standings screen; the two players in it pick shot/dive zones
   blind and simultaneous, best-of-5 then sudden death. Everyone else
   spectates live. Each finished match updates a live standings table
   (Wins / Losses / Kicks For / Kicks Against / Goal Difference). Once every
   match is played, host clicks **Show final leaderboard** — final placement
   (ranked by wins, then goal difference, then head-to-head result) adds to the
   same combined leaderboard.
6. Host clicks **Reveal Draft Order!** for the big reveal.

Heads up: round robin means more matches than a knockout bracket would (10
instead of 4 for a 5-player group) — plan for it to take a while longer,
but every player gets the same number of shootouts and nobody sits out on
a bye.

**Staying anonymous as host:** the shared player list no longer shows who's
hosting — the crown only appears on the host's own screen, never on other
players'. Join with any display name you like (there's no login/identity
check at all) if you also want your name itself to not give you away.

Notes:
- Works best with a decent wifi/data connection for everyone.
- Trivia and Guess-the-Footballer answers are graded client-side (the
  question bank and correct answers live in `trivia.js`, which ships to
  every browser) — fine for a friendly league, not tamper-proof against
  someone digging through devtools.
- The shootout's two simultaneous picks (shooter + keeper) are written to
  the same shared room state; in the rare case both taps land within the
  same instant, one write can clobber the other and the affected player
  will just see their pick reset — a re-tap fixes it. Not built with a
  lower-latency broadcast channel yet, since it's a mild, self-recovering
  edge case rather than a broken one.
- Room codes are a light gate, not real security — anyone with the link and
  code can join. Don't put sensitive info in it.

## Backlog / future ideas

- **Volleyball-style 1v1 mini-game** — real-time WASD movement and live ball
  physics, as an alternative/addition to the penalty shootout. Bigger build
  (needs an actual real-time physics sync layer), not started yet.

## Local development

No build step — just open `index.html` in a browser, or serve the folder
with any static file server (`npx serve .`, VS Code Live Server, etc).

## Files

- `index.html` / `style.css` — page shell and styling
- `app.js` — all game logic and Supabase realtime wiring
- `trivia.js` — the trivia question bank (add/edit questions here)
- `config.js` — your Supabase project URL + anon key
- `schema.sql` — database schema to run once in Supabase
