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
const RENDER_CAP = 150; // keep the DOM bounded on an unfiltered browse of 580+ players; search/filter to see more

let sb = null;
let session = null; // {roomCode, playerId, name, isHost} — from the main app's localStorage
let room = null;
let players = []; // party players (the drafters)
let scores = [];
let picks = []; // draft_picks rows, kept sorted by pick_number
let channel = null;

const local = {
  search: "",
  posFilter: "All",
  teamFilter: "All",
  error: "",
  submitting: false,
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

async function draftPlayer(plPlayerId) {
  const info = currentPickInfo();
  if (info.done || local.submitting) return;
  const me = myPlayer();
  if (!me || !info.drafter || info.drafter.id !== me.id) return; // not your turn — the button shouldn't even be visible, but double-check
  if (pickedPlayerIds().has(plPlayerId)) return;
  local.submitting = true;
  local.error = "";
  render();
  const { error } = await sb.from("draft_picks").insert({
    room_code: room.code,
    pick_number: info.pickNumber,
    pl_player_id: plPlayerId,
    drafter_id: me.id,
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

function onClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "draft") draftPlayer(Number(btn.dataset.id));
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
  if (e.target.id === "dt-pos-filter") {
    local.posFilter = e.target.value;
    render();
  }
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
  return `
    <div class="card dt-banner${isMine ? " mine" : ""}">
      <p class="sub" style="margin-bottom:4px">Round ${info.round} of ${ROUNDS} · Pick ${info.pickNumber} of ${info.totalPicks}</p>
      <h2>${isMine ? "🟢 You're on the clock!" : `⏳ ${escapeHtml(info.drafter.name)}'s pick`}</h2>
    </div>`;
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
            return `
              <div class="dt-roster${onClock ? " on-clock" : ""}">
                <div class="dt-roster-head">
                  <b>${escapeHtml(p.name)}</b>
                  <span class="sub">${roster.length}/${ROUNDS}</span>
                </div>
                <div class="dt-roster-counts">
                  ${POSITIONS.map((pos) => `<span class="dt-pos-count${counts[pos] >= SQUAD_SHAPE[pos] ? " full" : ""}">${pos} ${counts[pos]}/${SQUAD_SHAPE[pos]}</span>`).join("")}
                </div>
                ${
                  roster.length
                    ? `<ul class="player-list compact">${roster.map((pl) => `<li>${escapeHtml(pl.name)} <span class="sub">(${pl.pos} · ${escapeHtml(pl.teamShort)})</span></li>`).join("")}</ul>`
                    : `<p class="sub" style="margin:6px 0 0">No picks yet</p>`
                }
              </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function renderFilters() {
  const teams = teamsList();
  return `
    <div class="card dt-filters">
      <input type="text" id="dt-search" placeholder="Search players or clubs…" value="${escapeHtml(local.search)}" autocomplete="off" />
      <div class="dt-filter-row">
        <select id="dt-pos-filter">
          <option value="All"${local.posFilter === "All" ? " selected" : ""}>All positions</option>
          ${POSITIONS.map((p) => `<option value="${p}"${local.posFilter === p ? " selected" : ""}>${p}</option>`).join("")}
        </select>
        <select id="dt-team-filter">
          <option value="All"${local.teamFilter === "All" ? " selected" : ""}>All clubs</option>
          ${teams.map((t) => `<option value="${escapeHtml(t)}"${local.teamFilter === t ? " selected" : ""}>${escapeHtml(t)}</option>`).join("")}
        </select>
      </div>
      ${local.error ? `<p class="error" style="margin-top:10px">${escapeHtml(local.error)}</p>` : ""}
    </div>`;
}

function renderPlayerList(info, me) {
  const taken = pickedPlayerIds();
  const q = local.search.trim().toLowerCase();
  const filtered = window.PL_PLAYERS.filter((p) => {
    if (local.posFilter !== "All" && p.pos !== local.posFilter) return false;
    if (local.teamFilter !== "All" && p.team !== local.teamFilter) return false;
    if (q && !p.name.toLowerCase().includes(q) && !p.team.toLowerCase().includes(q)) return false;
    return true;
  });
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  const total = filtered.length;
  const shown = filtered.slice(0, RENDER_CAP);
  const canDraft = !local.submitting && !info.done && !!me && info.drafter.id === me.id;

  return `
    <div class="card">
      <h3>Players${total ? ` (${total})` : ""}</h3>
      <div class="dt-player-list">
        ${shown.length ? shown.map((p) => renderPlayerRow(p, taken, canDraft)).join("") : `<p class="sub">No players match.</p>`}
      </div>
      ${total > RENDER_CAP ? `<p class="sub" style="margin-top:10px">+${total - RENDER_CAP} more — narrow your search to see them.</p>` : ""}
    </div>`;
}

function renderPlayerRow(p, taken, canDraft) {
  const takenPick = taken.has(p.id) ? picks.find((pk) => pk.pl_player_id === p.id) : null;
  const takenBy = takenPick ? players.find((pl) => pl.id === takenPick.drafter_id) : null;
  return `
    <div class="dt-player-row${takenPick ? " taken" : ""}">
      <span class="dt-player-pos dt-pos-${p.pos.toLowerCase()}">${p.pos}</span>
      <span class="dt-player-name">${escapeHtml(p.name)}</span>
      <span class="dt-player-team sub">${escapeHtml(p.teamShort)}</span>
      ${
        takenPick
          ? `<span class="dt-taken-by">${escapeHtml(takenBy?.name || "someone")}</span>`
          : canDraft
            ? `<button class="dt-draft-btn" data-action="draft" data-id="${p.id}">Draft</button>`
            : `<span class="dt-taken-by sub">—</span>`
      }
    </div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
