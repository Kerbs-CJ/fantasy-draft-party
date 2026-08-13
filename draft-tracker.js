// Fantasy League Bugaloo — Draft Tracker. A separate page from the party
// app, reached from the "Go to draft tracker" button on the reveal
// screen once the draft ORDER is decided. Reuses the same Supabase
// project/room/players/scores as the party (a drafter is just an
// existing `players` row — see config.js) plus the static Premier
// League player pool (players.js) — only `draft_picks` is new to this
// page. Straight order every round (same pick order repeats every
// round — see currentPickInfo), no timer: whoever's turn it is just
// picks when they're ready, same "never auto-advance on its own"
// philosophy as the rest of the app.
//
// Identity: this page has no join flow of its own — it reads the same
// `draftPartySession` from localStorage the main app already wrote when
// you joined the room there, so it only works in a browser that already
// played the party in this room. That's deliberate; a separate identity
// system here would fragment the player list the draft order depends on.

const APP_EL = document.getElementById("app");
const ROUNDS = 15; // standard FPL squad size
const POSITIONS = ["GKP", "DEF", "MID", "FWD"];
const SQUAD_SHAPE = { GKP: 2, DEF: 5, MID: 5, FWD: 3 }; // informational only — not enforced pick by pick
// The player list is grouped into one collapsible section per position
// (see renderPlayerList) instead of a single flat list with a position
// filter — FWD first, GKP last, per Craig: forwards/midfielders get
// checked far more often during a live draft than goalkeepers, so that's
// the order worth seeing without scrolling.
const POSITION_SECTIONS = [
  { pos: "FWD", label: "Forwards", icon: "⚡" },
  { pos: "MID", label: "Midfielders", icon: "🎯" },
  { pos: "DEF", label: "Defenders", icon: "🛡️" },
  { pos: "GKP", label: "Goalkeepers", icon: "🥅" },
];
const RENDER_CAP_PER_SECTION = 40; // keep each position section's DOM bounded on an unfiltered browse; search/club-filter to see more

// A real budget, not just a squad-size limit — £100m, same convention FPL
// itself uses, spent down by each player's price (see players.js) as a
// drafter picks. A pick is only allowed if there's enough LEFT OVER after
// it to still afford the cheapest player in the pool for every remaining
// empty slot (see maxAffordableForPick) — without that guard, someone
// could spend big early and get mathematically stuck later, unable to
// afford anyone for a mandatory remaining pick.
const BUDGET = 100;
const MIN_PRICE = Math.min(...window.PL_PLAYERS.map((p) => p.price));

// Bots are the same 🤖-prefixed dev-mode test players the main party app
// uses (see DEV_BOT_PREFIX/isDevBot in app.js) — if one's still sitting in
// the room's player list when the real draft happens, it needs someone to
// actually take its turns. See ensureBotAutoPick.
const DEV_BOT_PREFIX = "🤖 ";
function isDevBot(player) {
  return !!player && player.name.startsWith(DEV_BOT_PREFIX);
}

let sb = null;
let session = null; // {roomCode, playerId, name, isHost} — from the main app's localStorage
let room = null;
let players = []; // party players (the drafters)
let scores = [];
let picks = []; // draft_picks rows, kept sorted by pick_number
let channel = null;

const local = {
  search: "",
  teamFilter: "All",
  error: "",
  submitting: false,
  // Per-position section open/closed state — defaults to all open so
  // nothing's hidden without the player doing it themselves. Kept in
  // `local` (not just the <details> element's own state) because every
  // render() replaces the whole #app subtree, which would otherwise reset
  // every section back to its default open/closed state on every pick —
  // see the "toggle" listener in init() for how this stays in sync.
  dtSectionOpen: { FWD: true, MID: true, DEF: true, GKP: true },
  botScheduledForPick: null, // pick_number a bot pick's already been scheduled for on this device, so a later render doesn't double-schedule it
  // Drafter id currently being viewed full-screen (see renderSquadView), or
  // null for the normal board. A full takeover rather than an overlay —
  // simpler than managing a backdrop/z-index, and "hit hide, check someone
  // else's" (one squad at a time) doesn't need the board underneath to
  // stay visible anyway. The live draft keeps progressing underneath
  // regardless — render() still calls ensureBotAutoPick() either way.
  viewingSquadFor: null,
};

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const roomCode = (params.get("room") || "").toUpperCase();
  session = loadSession();

  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_URL.startsWith("YOUR_")) {
    APP_EL.innerHTML = `
      <div class="card">
        <h2>⚙️ Almost there</h2>
        <p class="sub">This page needs the same Supabase setup as the main app — see <code>config.js</code> / README.</p>
      </div>`;
    return;
  }
  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  if (!roomCode) {
    APP_EL.innerHTML = renderNoRoom();
    return;
  }
  if (!session || session.roomCode !== roomCode) {
    APP_EL.innerHTML = renderNotJoined(roomCode);
    return;
  }

  const { data: r } = await sb.from("rooms").select("*").eq("code", roomCode).maybeSingle();
  if (!r) {
    APP_EL.innerHTML = renderNoRoom();
    return;
  }
  room = r;
  await Promise.all([loadPlayers(), loadScores(), loadPicks()]);
  subscribe();
  render();

  APP_EL.addEventListener("click", onClick);
  APP_EL.addEventListener("input", onInput);
  APP_EL.addEventListener("change", onChange);
  // "toggle" fires on a <details> when it's opened/closed (click or
  // keyboard) but — unlike click/input/change — doesn't bubble, so a
  // normal delegated listener on APP_EL would never see it; the capture
  // phase (true, below) does fire top-down regardless of bubbling, which
  // is what makes delegation work here. Keeps local.dtSectionOpen in sync
  // with whichever position sections the player's actually opened/closed
  // — see the comment on dtSectionOpen for why that has to be tracked at
  // all instead of just trusting each <details>'s own state.
  APP_EL.addEventListener(
    "toggle",
    (e) => {
      const pos = e.target?.dataset?.pos;
      if (pos) local.dtSectionOpen[pos] = e.target.open;
    },
    true
  );
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem("draftPartySession"));
  } catch {
    return null;
  }
}

async function loadPlayers() {
  const { data } = await sb.from("players").select("*").eq("room_code", room.code).order("joined_at", { ascending: true });
  players = data || [];
}
async function loadScores() {
  const { data } = await sb.from("scores").select("*").eq("room_code", room.code);
  scores = data || [];
}
async function loadPicks() {
  const { data } = await sb.from("draft_picks").select("*").eq("room_code", room.code).order("pick_number", { ascending: true });
  picks = data || [];
}

function subscribe() {
  channel = sb
    .channel("draft-" + room.code)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "draft_picks", filter: `room_code=eq.${room.code}` },
      (payload) => {
        if (!picks.find((p) => p.id === payload.new.id)) picks.push(payload.new);
        picks.sort((a, b) => a.pick_number - b.pick_number);
        render();
      }
    )
    .subscribe();
}

function myPlayer() {
  return players.find((p) => p.id === session?.playerId);
}

// Draft order — the SAME computation the reveal screen uses
// (totalsByPlayer in app.js): highest combined score picks first. Not
// re-derived from anything new; scores are frozen by the time anyone
// reaches this page.
function draftOrder() {
  const totals = {};
  for (const p of players) totals[p.id] = 0;
  for (const s of scores) totals[s.player_id] = (totals[s.player_id] || 0) + Number(s.points);
  return players
    .map((p) => ({ player: p, total: totals[p.id] || 0 }))
    .sort((a, b) => b.total - a.total)
    .map((e) => e.player);
}

// Straight order every round — pick N's drafter is just (N-1) mod
// (number of drafters), repeating unchanged every round, no snake
// reversal.
function currentPickInfo() {
  const order = draftOrder();
  const n = order.length;
  const pickIndex = picks.length; // 0-indexed — how many picks have happened so far
  const totalPicks = n * ROUNDS;
  const done = n === 0 || pickIndex >= totalPicks;
  const round = n === 0 ? 0 : Math.floor(pickIndex / n) + 1;
  const drafter = done ? null : order[pickIndex % n];
  return { order, n, pickIndex, pickNumber: pickIndex + 1, totalPicks, done, round, drafter };
}

function pickedPlayerIds() {
  return new Set(picks.map((p) => p.pl_player_id));
}

function rosterFor(drafterId) {
  return picks
    .filter((p) => p.drafter_id === drafterId)
    .map((p) => window.PL_PLAYERS.find((pl) => pl.id === p.pl_player_id))
    .filter(Boolean);
}

function teamsList() {
  return Array.from(new Set(window.PL_PLAYERS.map((p) => p.team))).sort();
}

// How much a drafter has spent / has left of their £100m.
function spentBy(drafterId) {
  return rosterFor(drafterId).reduce((sum, pl) => sum + pl.price, 0);
}
function budgetRemaining(drafterId) {
  return BUDGET - spentBy(drafterId);
}
// The most a drafter can spend on THIS pick specifically — their full
// remaining budget, minus enough to still afford the cheapest player in
// the whole pool for every slot that'll still be empty after this pick.
function maxAffordableForPick(drafterId) {
  const roster = rosterFor(drafterId);
  const slotsLeftAfterThisPick = ROUNDS - roster.length - 1;
  const reserve = MIN_PRICE * Math.max(0, slotsLeftAfterThisPick);
  return budgetRemaining(drafterId) - reserve;
}

// The one place an actual draft_picks row gets written — used by both a
// human's own click (draftPlayer) and a bot's auto-pick
// (ensureBotAutoPick), so there's exactly one insert/error-handling path
// regardless of who's picking.
async function submitPick(plPlayerId, drafterId) {
  const info = currentPickInfo();
  if (info.done || local.submitting) return;
  if (!info.drafter || info.drafter.id !== drafterId) return;
  if (pickedPlayerIds().has(plPlayerId)) return;
  local.submitting = true;
  local.error = "";
  render();
  const { error } = await sb.from("draft_picks").insert({
    room_code: room.code,
    pick_number: info.pickNumber,
    pl_player_id: plPlayerId,
    drafter_id: drafterId,
  });
  local.submitting = false;
  if (error) {
    console.error("draft_picks insert failed:", error);
    // Postgres unique_violation is the ONLY case that genuinely means
    // "someone beat you to this pick slot or this footballer" — anything
    // else (missing table, RLS rejection, a bad foreign key, a network
    // hiccup) is a real problem and claiming it was "just taken" would be
    // actively misleading, so show the actual error instead of guessing.
    local.error =
      error.code === "23505"
        ? "That pick just got taken — refreshed the board."
        : `Couldn't save that pick: ${error.message || error.code || "unknown error"}. Check the browser console for details.`;
  }
  await loadPicks();
  render();
}

async function draftPlayer(plPlayerId) {
  const me = myPlayer();
  if (!me) return;
  const info = currentPickInfo();
  if (info.done || !info.drafter || info.drafter.id !== me.id) return; // not your turn — the button shouldn't even be visible, but double-check
  const pl = window.PL_PLAYERS.find((p) => p.id === plPlayerId);
  if (pl && pl.price > maxAffordableForPick(me.id)) return; // over budget — the button shouldn't be visible for this either, but double-check
  await submitPick(plPlayerId, me.id);
}

// If it's a bot's turn, have this browser pick for it after a short,
// human-feeling pause — but only ONE browser should actually do this
// (whoever's viewing as host), not every device watching the board at
// once; the unique constraints on draft_picks would stop an actual
// double-pick either way, but there's no reason to have every viewer's
// browser racing to submit the same insert.
function ensureBotAutoPick() {
  const info = currentPickInfo();
  if (info.done || !info.drafter || !isDevBot(info.drafter)) return;
  if (!myPlayer()?.is_host) return;
  if (local.botScheduledForPick === info.pickNumber) return;
  local.botScheduledForPick = info.pickNumber;
  const drafterId = info.drafter.id;
  const pickNumber = info.pickNumber;
  setTimeout(async () => {
    // Re-check nothing moved on while this was waiting (a human elsewhere
    // could have taken over, or someone else's browser already covered
    // this exact pick).
    const fresh = currentPickInfo();
    if (fresh.done || !fresh.drafter || fresh.drafter.id !== drafterId || fresh.pickNumber !== pickNumber) return;
    const choice = randomAffordablePlayer(drafterId);
    if (!choice) return; // shouldn't happen given the budget reserve, but don't crash if it somehow does
    await submitPick(choice.id, drafterId);
  }, 1200 + Math.random() * 900);
}

function randomAffordablePlayer(drafterId) {
  const taken = pickedPlayerIds();
  const maxPrice = maxAffordableForPick(drafterId);
  const pool = window.PL_PLAYERS.filter((p) => !taken.has(p.id) && p.price <= maxPrice);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function onClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "draft") draftPlayer(Number(btn.dataset.id));
  if (btn.dataset.action === "see-squad") {
    local.viewingSquadFor = btn.dataset.id;
    render();
  }
  if (btn.dataset.action === "hide-squad") {
    local.viewingSquadFor = null;
    render();
  }
}

// Live-filters as you type without losing your place in the search box —
// a full render() rebuilds the whole subtree (same architecture as the
// main app), which would otherwise reset the input's cursor to the end
// on every keystroke, so the cursor position is captured and restored
// around the render.
function onInput(e) {
  if (e.target.id !== "dt-search") return;
  local.search = e.target.value;
  const cursor = e.target.selectionStart;
  render();
  const el = document.getElementById("dt-search");
  if (el) {
    el.focus();
    el.setSelectionRange(cursor, cursor);
  }
}

function onChange(e) {
  if (e.target.id === "dt-team-filter") {
    local.teamFilter = e.target.value;
    render();
  }
}

function render() {
  if (!room) {
    APP_EL.innerHTML = renderNoRoom();
    return;
  }
  APP_EL.innerHTML = renderTopBar() + renderBoard();
  ensureBotAutoPick();
}

function renderTopBar() {
  return `
    <div class="topbar">
      <span class="room-pill">Room <b>${escapeHtml(room.code)}</b></span>
      <a class="link-btn" href="index.html">Back to party</a>
    </div>`;
}

function renderNoRoom() {
  return `
    <div class="topbar"><span class="room-pill">Draft Tracker</span></div>
    <div class="card">
      <h2>⚽ Draft Tracker</h2>
      <p class="sub">This page needs a room code — open it from the "Go to draft tracker" button at the end of a Fantasy League Bugaloo party.</p>
      <a class="btn primary" href="index.html">Back to the party</a>
    </div>`;
}

function renderNotJoined(roomCode) {
  return `
    <div class="topbar"><span class="room-pill">Room <b>${escapeHtml(roomCode)}</b></span></div>
    <div class="card">
      <h2>⚽ Draft Tracker</h2>
      <p class="sub">This browser isn't recognized as a player in room <b>${escapeHtml(roomCode)}</b>. Join (or rejoin) the party here first, then come back to this page from the reveal screen.</p>
      <a class="btn primary" href="index.html?room=${encodeURIComponent(roomCode)}">Go join the party</a>
    </div>`;
}

function renderBoard() {
  if (local.viewingSquadFor) return renderSquadView(local.viewingSquadFor);
  const info = currentPickInfo();
  const me = myPlayer();
  return `
    ${renderTurnBanner(info, me)}
    ${renderRosters(info)}
    ${renderFilters()}
    ${renderPlayerList(info, me)}
  `;
}

function renderTurnBanner(info, me) {
  if (info.done) {
    return `
      <div class="card dt-banner dt-banner-done">
        <h2>🎉 Draft complete!</h2>
        <p class="sub">All ${info.totalPicks} picks are in across ${ROUNDS} rounds.</p>
      </div>`;
  }
  const isMine = !!me && info.drafter.id === me.id;
  const left = budgetRemaining(info.drafter.id);
  return `
    <div class="card dt-banner${isMine ? " mine" : ""}">
      <p class="sub" style="margin-bottom:4px">Round ${info.round} of ${ROUNDS} · Pick ${info.pickNumber} of ${info.totalPicks}</p>
      <h2>${isMine ? "🟢 You're on the clock!" : `⏳ ${escapeHtml(info.drafter.name)}'s pick`}</h2>
      <p class="sub" style="margin:6px 0 0">${fmtMoney(left)} left of ${fmtMoney(BUDGET)}</p>
    </div>`;
}

function fmtMoney(n) {
  return `£${n.toFixed(1)}m`;
}

function renderRosters(info) {
  return `
    <div class="card">
      <h3>Rosters</h3>
      <div class="dt-rosters">
        ${info.order
          .map((p) => {
            const roster = rosterFor(p.id);
            const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
            for (const pl of roster) counts[pl.pos]++;
            const onClock = !info.done && info.drafter.id === p.id;
            const left = budgetRemaining(p.id);
            return `
              <div class="dt-roster${onClock ? " on-clock" : ""}">
                <div class="dt-roster-head">
                  <b>${escapeHtml(p.name)}</b>
                  <span class="sub">${roster.length}/${ROUNDS}</span>
                </div>
                <p class="sub dt-roster-budget${left < MIN_PRICE * 2 ? " tight" : ""}" style="margin:2px 0 0">${fmtMoney(left)} left</p>
                <div class="dt-roster-counts">
                  ${POSITIONS.map((pos) => `<span class="dt-pos-count${counts[pos] >= SQUAD_SHAPE[pos] ? " full" : ""}">${pos} ${counts[pos]}/${SQUAD_SHAPE[pos]}</span>`).join("")}
                </div>
                ${renderRosterLastPick(p.id, roster)}
              </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

// Full-screen "See full team" view for one drafter — a real formation
// reading order (GKP top, then the back line, midfield, attack), NOT the
// FWD-first order POSITION_SECTIONS uses for browsing the draft pool
// (those are different questions: "what do I need right now" vs. "what
// does this squad look like"). Each row renders SQUAD_SHAPE[pos] slots
// regardless of how many are actually filled yet, so an unfinished squad
// still visually shows its target shape (e.g. both GKP slots, one empty)
// instead of just trailing off.
const SQUAD_FORMATION_ORDER = ["GKP", "DEF", "MID", "FWD"];
function renderSquadView(drafterId) {
  const drafter = players.find((p) => p.id === drafterId);
  if (!drafter) {
    local.viewingSquadFor = null; // stale reference (e.g. the room reset) — bail back to the board rather than show a broken screen
    return renderBoard();
  }
  const roster = rosterFor(drafterId);
  return `
    <div class="card dt-squad-view">
      <button class="link-btn dt-squad-back" data-action="hide-squad">← Back to draft</button>
      <h2 style="margin-top:10px">${escapeHtml(drafter.name)}'s Squad</h2>
      <p class="sub" style="margin:2px 0 0">${roster.length}/${ROUNDS} picked · ${fmtMoney(budgetRemaining(drafterId))} left of ${fmtMoney(BUDGET)}</p>
      <div class="dt-squad-pitch">
        ${SQUAD_FORMATION_ORDER.map((pos) => renderSquadRow(pos, roster)).join("")}
      </div>
    </div>`;
}

function renderSquadRow(pos, roster) {
  const section = POSITION_SECTIONS.find((s) => s.pos === pos);
  const picked = roster.filter((pl) => pl.pos === pos).sort((a, b) => b.price - a.price);
  const slots = SQUAD_SHAPE[pos];
  const cards = Array.from({ length: slots }, (_, i) => {
    const pl = picked[i];
    return pl
      ? `<div class="dt-squad-card">
          <span class="dt-squad-card-name">${escapeHtml(pl.name)}</span>
          <span class="dt-squad-card-meta">${escapeHtml(pl.teamShort)} · ${fmtMoney(pl.price)}</span>
        </div>`
      : `<div class="dt-squad-card empty"><span class="dt-squad-card-name">—</span></div>`;
  }).join("");
  return `
    <div class="dt-squad-row dt-squad-row-${pos.toLowerCase()}">
      <h4 class="dt-squad-row-label">${section.icon} ${section.label.toUpperCase()}</h4>
      <div class="dt-squad-row-cards">${cards}</div>
    </div>`;
}

// Just the most recent pick (roster is already oldest-first — see
// rosterFor) — 5 rosters each growing to 15 picks would otherwise push the
// actual player list off the top of the screen by the back half of the
// draft. The position-count badges above this already give a compact read
// on squad shape, so nothing informational is lost by not listing every
// name here; "See full team" opens the full formation view
// (renderSquadView) for just this drafter instead of expanding inline.
function renderRosterLastPick(drafterId, roster) {
  if (!roster.length) return `<p class="sub" style="margin:6px 0 0">No picks yet</p>`;
  const last = roster[roster.length - 1];
  return `
    <p style="margin:6px 0 0">Last pick: ${escapeHtml(last.name)} <span class="sub">(${last.pos} · ${escapeHtml(last.teamShort)} · ${fmtMoney(last.price)})</span></p>
    <button class="link-btn dt-roster-toggle" data-action="see-squad" data-id="${drafterId}">See full team</button>`;
}

function renderFilters() {
  const teams = teamsList();
  return `
    <div class="card dt-filters">
      <input type="text" id="dt-search" placeholder="Search players or clubs…" value="${escapeHtml(local.search)}" autocomplete="off" />
      <div class="dt-filter-row">
        <select id="dt-team-filter">
          <option value="All"${local.teamFilter === "All" ? " selected" : ""}>All clubs</option>
          ${teams.map((t) => `<option value="${escapeHtml(t)}"${local.teamFilter === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}
        </select>
      </div>
      ${local.error ? `<p class="error" style="margin-top:10px">${escapeHtml(local.error)}</p>` : ""}
    </div>`;
}

// One collapsible section per position (FWD/MID/DEF/GKP — see
// POSITION_SECTIONS for the order and why), each independently sorted and
// capped, instead of one flat list with a position dropdown. `filtered` is
// already narrowed by search/club — this just splits it further by
// position and hands each slice to its own section.
function renderPlayerList(info, me) {
  const taken = pickedPlayerIds();
  const q = local.search.trim().toLowerCase();
  const filtered = window.PL_PLAYERS.filter((p) => {
    if (local.teamFilter !== "All" && p.team !== local.teamFilter) return false;
    if (q && !p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
    return true;
  });
  const myTurn = !local.submitting && !info.done && !!me && info.drafter.id === me.id;
  const maxPrice = myTurn ? maxAffordableForPick(me.id) : -1;

  return `
    <div class="card">
      <h3>Players${filtered.length ? ` (${filtered.length})` : ""}</h3>
      ${POSITION_SECTIONS.map((section) => renderPositionSection(section, filtered, taken, myTurn, maxPrice)).join("")}
    </div>`;
}

function renderPositionSection(section, filtered, taken, myTurn, maxPrice) {
  const positionPlayers = filtered
    .filter((p) => p.pos === section.pos)
    .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name)); // most expensive first, alphabetical as the tiebreak for same-priced players
  const total = positionPlayers.length;
  const remaining = positionPlayers.filter((p) => !taken.has(p.id)).length;
  const shown = positionPlayers.slice(0, RENDER_CAP_PER_SECTION);
  // `open` reflects local.dtSectionOpen, kept in sync by the "toggle"
  // listener in init() — see the comment on dtSectionOpen for why that's
  // necessary rather than just letting <details> track its own state.
  return `
    <details class="dt-pos-section dt-pos-section-${section.pos.toLowerCase()}" data-pos="${section.pos}"${local.dtSectionOpen[section.pos] ? " open" : ""}>
      <summary>
        <span class="dt-pos-section-label">${section.icon} ${section.label.toUpperCase()}</span>
        <span class="dt-pos-section-count">${remaining} left</span>
      </summary>
      <div class="dt-player-list">
        ${shown.length ? shown.map((p) => renderPlayerRow(p, taken, myTurn, maxPrice)).join("") : `<p class="sub" style="padding:10px 12px">No players match.</p>`}
      </div>
      ${total > RENDER_CAP_PER_SECTION ? `<p class="sub" style="padding:8px 12px 0">+${total - RENDER_CAP_PER_SECTION} more — narrow your search to see them.</p>` : ""}
    </details>`;
}

function renderPlayerRow(p, taken, myTurn, maxPrice) {
  const takenPick = taken.has(p.id) ? picks.find((pk) => pk.pl_player_id === p.id) : null;
  const takenBy = takenPick ? players.find((pl) => pl.id === takenPick.drafter_id) : null;
  const affordable = p.price <= maxPrice;
  const canDraft = myTurn && affordable;
  return `
    <div class="dt-player-row${takenPick ? " taken" : ""}${!takenPick && myTurn && !affordable ? " unaffordable" : ""}">
      <span class="dt-player-name">${escapeHtml(p.name)}</span>
      <span class="dt-player-team sub">${escapeHtml(p.teamShort)}</span>
      <span class="dt-player-price">${fmtMoney(p.price)}</span>
      ${
        takenPick
          ? `<span class="dt-taken-by">${escapeHtml(takenBy?.name || "someone")}</span>`
          : canDraft
            ? `<button class="dt-draft-btn" data-action="draft" data-id="${p.id}">Draft</button>`
            : myTurn && !affordable
              ? `<span class="dt-taken-by sub">Over budget</span>`
              : `<span class="dt-taken-by sub">—</span>`
      }
    </div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
