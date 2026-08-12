# 🏆 Fantasy League Bugaloo — Draft Party

A tiny live multiplayer web app for deciding the Fantasy League Bugaloo draft
order. Everyone joins a room from their own device, plays through four
rounds — Guess the Missing Club from a player's career timeline, Guess the
Footballer from progressive clues, a 1v1 penalty shootout round robin
(everyone plays everyone once, standings by wins/goal difference), then
Football Golf, real stroke play over a 5-hole course themed after Arsenal,
Liverpool, Leeds United, Manchester United and Barcelona — and the combined
leaderboard becomes the draft order, with a dramatic reveal at the end.

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
3. If the `alter publication` lines complain about already being
   added, that's fine — ignore it. Otherwise, double check under
   **Database → Replication** that `rooms`, `players`, `scores`, and
   `draft_picks` are toggled on.

Safe to re-run any time the schema changes (e.g. after pulling an update
that adds a table) — every statement in it is idempotent
(`if not exists` / `drop policy if exists`), so running the whole file
again on a project that already has some of it won't error or duplicate
anything.

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
3. Host clicks **Start the party!**, which lands on an overview screen
   listing every round, how the combined score becomes the draft order,
   and a few fair-play notes worth reading out loud (the content was
   freshly generated so the host isn't playing with advance knowledge
   either, this was built in a few days so bugs are likely, and the host
   has no control over outcomes — just pacing). From there, each round
   also gets its own explainer screen (format + scoring) right before it
   starts — Guess the Missing Club's, then Guess the Footballer's, then
   the penalty shootout's.
4. Guess the Missing Club plays first (10 random player career timelines,
   one club redacted — everyone answers in their own time on their own
   device, tapping a club then confirming to lock it in; a side panel
   shows who's still deciding. Nobody's answer is revealed until the host
   reveals — at which point that same side panel switches to showing
   exactly who got it right and who didn't, by name), then Guess the
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
6. Host clicks through to the Football Golf intro (format + scoring table).
   From there the host can optionally send everyone to the **🏌️ Driving
   Range** first — a shared, unscored warm-up screen where everyone's on
   the same room together and can take as many practice swings as they
   like, to get a feel for the drag before it counts. When ready, host
   clicks **Start Football Golf**. It's real stroke play on 5 holes, each
   one themed after a club — Arsenal's Emirates, Liverpool's Anfield
   (Kop end), Leeds' Elland Road, Manchester United's Old Trafford, and
   Barcelona's Camp Nou as the grand finale — each an actual top-down
   course, a shared birds-eye map with a tee, a green, and a course full of
   solid walls and pillars loosely shaped around that club (a cannon
   barrel, a stand blocking the direct line, a badge-shaped ring, a
   slalom) — plus patches of sloped ground (darker grass marked with ▼
   speeds the ball up heading that way, lighter grass marked with ▲ drags
   on it), sand that bogs it right down, and water that ends the shot on
   contact and sends the ball back to the tee — where every player's ball
   is visible moving live across it as shots land, not just a final
   result. Everyone plays the *same hole at once*, each in their own time
   on their own device, like Guess the Missing Club. Swinging is a single
   drag, like a real slingshot: press down on your ball and pull back — a
   line follows your hand, stretching the way you pull, up to full power
   (past that, more pull doesn't add anything) — then let go and the ball
   fires the *opposite* way (pull south, it flies north). How far you
   pull sets the power, the angle sets the direction, no timer and
   nothing computed for you, so it's purely about judging the pull-back
   by feel — and, now, reading the course. Watch the ball roll, bounce
   off walls and pillars, ride the slopes, bog down in the sand or
   splash back to the tee in the water, and land on the shared map, then
   keep swinging from there until it's holed (up to 12 strokes — after
   that it's forced to wrap up so nobody's stuck forever). Fewer strokes
   scores more, same as real golf (🦅 Eagle down to a bogey). Host moves
   the group to the next hole whenever ready — no need to
   wait on stragglers (a hole that's dragging on also force-finishes a few
   strokes over par). After all 5 holes, host clicks **Show final
   standings** — final placement (highest total first) adds to the
   combined leaderboard.
7. Host clicks **Reveal Draft Order!** for the big reveal. Once it finishes
   counting down, a **📋 Go to Draft Tracker** button appears — see below.

## Draft Tracker

A separate page (`draft-tracker.html`), reached from the button at the end
of the reveal, for tracking the *actual* Fantasy Premier League draft live —
every player picks real footballers in the order the party just decided,
and everyone watching sees picks land instantly on every device.

- The full current-season Premier League player pool (`players.js`, ~580
  players from the official [Fantasy Premier League API](https://fantasy.premierleague.com/en/))
  is searchable and filterable by position (GKP/DEF/MID/FWD) and club.
- Straight pick order every round (same order the reveal showed, repeating
  round after round — not a snake draft), 15 rounds per drafter (a
  standard FPL squad: 2 GKP, 5 DEF, 5 MID, 3 FWD), no timer — whoever's
  turn it is just picks when they're ready.
- A footballer can only be taken once per room; the moment someone drafts
  one, it's greyed out with their name on it for everyone, live.
- This page reuses your existing party session (no separate login) — it
  only works in a browser that already joined that room in the main app,
  since the draft order is computed from that room's actual game results.
- The player pool is a static snapshot fetched at build time (that FPL API
  doesn't allow live requests from a browser on another site), so it'll
  drift from reality as transfers happen — refresh `players.js` from the
  same API each season/window if you want it current.

Heads up: round robin means more matches than a knockout bracket would (10
instead of 4 for a 5-player group) — plan for it to take a while longer,
but every player gets the same number of shootouts and nobody sits out on
a bye.

**Staying anonymous as host:** the shared player list no longer shows who's
hosting — the crown only appears on the host's own screen, never on other
players'. Join with any display name you like (there's no login/identity
check at all) if you also want your name itself to not give you away.

**Driving the room:** only the host can advance stages (start the missing-club
round, reveal clues, start matches, move to the next screen, etc.) — non-host players
just don't get those controls, so nobody but the host can push the group
forward or back. This is enforced in the app logic itself, not just by
hiding buttons, so it holds even against someone poking at devtools. Same
idea for penalty kicks: only the two players actually in a match (the
current shooter and keeper) can submit a pick — everyone else is a pure
spectator for that match. Football Golf works the same way: only the
player whose turn it is can swing; everyone else just watches.

Notes:
- Works best with a decent wifi/data connection for everyone.
- Guess the Missing Club and Guess-the-Footballer answers are graded
  client-side (the content bank and correct answers live in `content.js`,
  which ships to every browser) — fine for a friendly league, not
  tamper-proof against someone digging through devtools.
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

- `index.html` / `style.css` — page shell and styling (shared by both pages)
- `app.js` — all party-game logic and Supabase realtime wiring
- `content.js` — the Guess the Missing Club and Guess the Footballer content
  banks (add/edit entries here)
- `draft-tracker.html` / `draft-tracker.js` — the separate Draft Tracker page
- `players.js` — the static Premier League player pool the tracker drafts from
- `config.js` — your Supabase project URL + anon key
- `schema.sql` — database schema to run once in Supabase
