// Fantasy Draft Party — app logic. Vanilla JS, no build step.

const APP_EL = document.getElementById("app");
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1
const REACTION_MIN_DELAY = 2000;
const REACTION_MAX_DELAY = 5000;
const TRIVIA_QUESTION_COUNT = 5;
const TRIVIA_TIME_MS = 10000;
const BAR_TARGET_MIN = 30;
const BAR_TARGET_MAX = 70;

let sb = null; // supabase client
let session = loadSession(); // {roomCode, playerId, name, isHost}
let room = null; // current row from `rooms`
let players = []; // rows from `players`
let scores = []; // rows from `scores`
let channel = null;

// local, per-device, per-mini-game UI state (not synced — each device tracks its own)
let local = {
  view: "home", // 'home' | ... derived mostly from room.status
  joinCodeInput: "",
  nameInput: "",
  error: "",
  reaction: { phase: "idle", goAt: null, myPoints: null, myMs: null, timer: null },
  trivia: { qIndex: null, answeredQIndex: null, deadline: null, myChoice: null, timer: null },
  bar: { phase: "idle", pos: 50, target: 50, raf: null, myPoints: null },
  revealStarted: false,
};

init();

function init() {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl) local.joinCodeInput = roomFromUrl.toUpperCase();

  if (
    !window.SUPABASE_URL ||
    !window.SUPABASE_ANON_KEY ||
    window.SUPABASE_URL.startsWith("YOUR_")
  ) {
    render();
    return;
  }

  sb = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  if (session && session.roomCode) {
    rejoinSession();
  } else {
    render();
  }

  APP_EL.addEventListener("click", onClick);
  APP_EL.addEventListener("submit", onSubmit);
}

// ── session persistence ─────────────────────────────────────
function loadSession() {
  try {
    return JSON.parse(localStorage.getItem("draftPartySession"));
  } catch {
    return null;
  }
}
function saveSession() {
  localStorage.setItem("draftPartySession", JSON.stringify(session));
}
function clearSession() {
  session = null;
  localStorage.removeItem("draftPartySession");
}

async function rejoinSession() {
  const { data: r } = await sb
    .from("rooms")
    .select("*")
    .eq("code", session.roomCode)
    .maybeSingle();
  if (!r) {
    clearSession();
    render();
    return;
  }
  room = r;
  await Promise.all([loadPlayers(), loadScores()]);
  subscribeToRoom(session.roomCode);
  render();
}

// ── data loading ────────────────────────────────────────────
async function loadPlayers() {
  const { data } = await sb
    .from("players")
    .select("*")
    .eq("room_code", room.code)
    .order("joined_at", { ascending: true });
  players = data || [];
}
async function loadScores() {
  const { data } = await sb.from("scores").select("*").eq("room_code", room.code);
  scores = data || [];
}

function subscribeToRoom(code) {
  if (channel) sb.removeChannel(channel);
  channel = sb
    .channel("room-" + code)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${code}` },
      (payload) => {
        room = payload.new;
        resetLocalGamePhaseIfNeeded();
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "players", filter: `room_code=eq.${code}` },
      (payload) => {
        if (!players.find((p) => p.id === payload.new.id)) players.push(payload.new);
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "scores", filter: `room_code=eq.${code}` },
      (payload) => {
        if (!scores.find((s) => s.id === payload.new.id)) scores.push(payload.new);
        render();
      }
    )
    .subscribe();
}

function resetLocalGamePhaseIfNeeded() {
  // when the room moves to a new stage, reset the relevant local mini-game state
  if (room.status === "game1" && local.reaction.phase !== "idle-reset") {
    // handled inside renderGame1 via game_state watch
  }
}

// ── helpers ──────────────────────────────────────────────────
function genRoomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return out;
}
function myPlayer() {
  return players.find((p) => p.id === session?.playerId);
}
function totalsByPlayer() {
  const totals = {};
  for (const p of players) totals[p.id] = 0;
  for (const s of scores) totals[s.player_id] = (totals[s.player_id] || 0) + Number(s.points);
  return players
    .map((p) => ({ player: p, total: totals[p.id] || 0 }))
    .sort((a, b) => b.total - a.total);
}
function scoresFor(gameIndex) {
  return scores.filter((s) => s.game_index === gameIndex);
}
async function updateRoom(patch) {
  const { data } = await sb.from("rooms").update(patch).eq("code", room.code).select().maybeSingle();
  if (data) room = data;
  render();
}

// ── event delegation ────────────────────────────────────────
function onSubmit(e) {
  e.preventDefault();
}

async function onClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  local.error = "";

  if (action === "create-room") return createRoom();
  if (action === "join-room") return joinRoom();
  if (action === "copy-link") return copyInviteLink();
  if (action === "start-game1") return updateRoom({ status: "game1", game_state: {} });
  if (action === "reaction-arm") return armReaction();
  if (action === "reaction-tap") return tapReaction();
  if (action === "show-leaderboard1") return updateRoom({ status: "leaderboard1" });
  if (action === "start-game2") return startTrivia();
  if (action === "trivia-answer") return answerTrivia(Number(btn.dataset.choice));
  if (action === "trivia-next") return triviaNext();
  if (action === "show-leaderboard2") return updateRoom({ status: "leaderboard2" });
  if (action === "start-game3") return startBar();
  if (action === "bar-tap") return tapBar();
  if (action === "show-leaderboard3") return updateRoom({ status: "leaderboard3" });
  if (action === "reveal") return updateRoom({ status: "reveal" });
  if (action === "leave") return leaveRoom();
}

// ── home / lobby ────────────────────────────────────────────
async function createRoom() {
  const name = (document.getElementById("name-input")?.value || "").trim();
  if (!name) return setError("Enter your name first.");
  let code, existing;
  do {
    code = genRoomCode();
    const { data } = await sb.from("rooms").select("code").eq("code", code).maybeSingle();
    existing = data;
  } while (existing);

  const { data: newRoom, error: roomErr } = await sb
    .from("rooms")
    .insert({ code, status: "lobby", game_state: {} })
    .select()
    .single();
  if (roomErr) return setError(roomErr.message);

  const playerId = crypto.randomUUID();
  const { error: playerErr } = await sb
    .from("players")
    .insert({ id: playerId, room_code: code, name, is_host: true });
  if (playerErr) return setError(playerErr.message);

  room = newRoom;
  session = { roomCode: code, playerId, name, isHost: true };
  saveSession();
  await Promise.all([loadPlayers(), loadScores()]);
  subscribeToRoom(code);
  render();
}

async function joinRoom() {
  const name = (document.getElementById("name-input")?.value || "").trim();
  const code = (document.getElementById("code-input")?.value || "").trim().toUpperCase();
  if (!name) return setError("Enter your name first.");
  if (!code) return setError("Enter the room code.");

  const { data: r } = await sb.from("rooms").select("*").eq("code", code).maybeSingle();
  if (!r) return setError("No room with that code. Double-check it with your host.");
  if (r.status !== "lobby") return setError("That draft party has already started.");

  const playerId = crypto.randomUUID();
  const { error: playerErr } = await sb
    .from("players")
    .insert({ id: playerId, room_code: code, name, is_host: false });
  if (playerErr) return setError(playerErr.message);

  room = r;
  session = { roomCode: code, playerId, name, isHost: false };
  saveSession();
  await Promise.all([loadPlayers(), loadScores()]);
  subscribeToRoom(code);
  render();
}

function copyInviteLink() {
  const url = `${location.origin}${location.pathname}?room=${room.code}`;
  navigator.clipboard?.writeText(url);
  const el = document.getElementById("copy-feedback");
  if (el) {
    el.textContent = "Link copied!";
    setTimeout(() => {
      if (el) el.textContent = "";
    }, 2000);
  }
}

function leaveRoom() {
  clearSession();
  room = null;
  players = [];
  scores = [];
  if (channel) sb.removeChannel(channel);
  local.view = "home";
  render();
}

function setError(msg) {
  local.error = msg;
  render();
}

// ── game 1: reaction tap ───────────────────────────────────
async function armReaction() {
  const goAt = Date.now() + REACTION_MIN_DELAY + Math.random() * (REACTION_MAX_DELAY - REACTION_MIN_DELAY);
  await updateRoom({ game_state: { ...room.game_state, phase: "armed", goAt } });
}

function scheduleReactionGoIfNeeded() {
  const gs = room.game_state || {};
  if (gs.phase === "armed" && local.reaction.goAt !== gs.goAt) {
    local.reaction.goAt = gs.goAt;
    local.reaction.phase = "waiting";
    local.reaction.myPoints = null;
    local.reaction.myMs = null;
    clearTimeout(local.reaction.timer);
    const delay = gs.goAt - Date.now();
    local.reaction.timer = setTimeout(() => {
      local.reaction.phase = "go";
      render();
    }, Math.max(0, delay));
  }
  if (gs.phase !== "armed" && local.reaction.goAt !== null) {
    local.reaction.goAt = null;
    local.reaction.phase = "idle";
  }
}

async function tapReaction() {
  const me = myPlayer();
  if (!me || local.reaction.myPoints !== null) return;
  if (local.reaction.phase === "waiting") {
    // false start
    local.reaction.phase = "falseStart";
    local.reaction.myPoints = 0;
    render();
    await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 1, points: 0 });
    return;
  }
  if (local.reaction.phase === "go") {
    const ms = Date.now() - local.reaction.goAt;
    const points = Math.max(0, Math.round(100 - ms / 10));
    local.reaction.myMs = ms;
    local.reaction.myPoints = points;
    local.reaction.phase = "done";
    render();
    await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 1, points });
  }
}

// ── game 2: trivia ─────────────────────────────────────────
async function startTrivia() {
  const pool = window.TRIVIA_QUESTIONS.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const order = pool.slice(0, TRIVIA_QUESTION_COUNT);
  await updateRoom({ status: "game2", game_state: { order, qIndex: 0 } });
}

function ensureTriviaTimer() {
  const gs = room.game_state || {};
  if (gs.qIndex === undefined) return;
  if (local.trivia.qIndex !== gs.qIndex) {
    local.trivia.qIndex = gs.qIndex;
    local.trivia.answeredQIndex = null;
    local.trivia.myChoice = null;
    local.trivia.deadline = Date.now() + TRIVIA_TIME_MS;
    clearTimeout(local.trivia.timer);
    local.trivia.timer = setTimeout(() => {
      if (local.trivia.answeredQIndex !== gs.qIndex) submitTriviaAnswer(-1, gs.qIndex);
    }, TRIVIA_TIME_MS + 50);
  }
}

async function answerTrivia(choice) {
  if (local.trivia.answeredQIndex === local.trivia.qIndex) return;
  await submitTriviaAnswer(choice, local.trivia.qIndex);
}

async function submitTriviaAnswer(choice, qIndex) {
  const me = myPlayer();
  if (!me) return;
  local.trivia.answeredQIndex = qIndex;
  local.trivia.myChoice = choice;
  const gs = room.game_state || {};
  const question = window.TRIVIA_QUESTIONS[gs.order[qIndex]];
  const correct = choice === question.correct;
  const remaining = Math.max(0, local.trivia.deadline - Date.now());
  const timeFraction = remaining / TRIVIA_TIME_MS;
  const points = correct ? Math.round(12 + 8 * timeFraction) : 0;
  render();
  await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 2, points });
}

async function triviaNext() {
  const gs = room.game_state || {};
  const next = gs.qIndex + 1;
  if (next >= gs.order.length) {
    await updateRoom({ status: "leaderboard2" });
  } else {
    await updateRoom({ game_state: { ...gs, qIndex: next } });
  }
}

// ── game 3: stop the bar ───────────────────────────────────
async function startBar() {
  const target = BAR_TARGET_MIN + Math.random() * (BAR_TARGET_MAX - BAR_TARGET_MIN);
  await updateRoom({ status: "game3", game_state: { phase: "playing", target } });
}

function ensureBarLoop() {
  const gs = room.game_state || {};
  if (gs.phase === "playing" && local.bar.phase !== "playing") {
    local.bar.phase = "playing";
    local.bar.target = gs.target;
    local.bar.myPoints = null;
    const cycleMs = 1600;
    const start = Date.now();
    const step = () => {
      if (local.bar.phase !== "playing") return;
      const t = (Date.now() - start) % cycleMs;
      const frac = t / cycleMs; // 0..1
      local.bar.pos = 50 + 50 * Math.sin(frac * Math.PI * 2);
      const track = document.getElementById("bar-marker");
      if (track) track.style.left = local.bar.pos + "%";
      local.bar.raf = requestAnimationFrame(step);
    };
    local.bar.raf = requestAnimationFrame(step);
  }
}

async function tapBar() {
  const me = myPlayer();
  if (!me || local.bar.myPoints !== null) return;
  cancelAnimationFrame(local.bar.raf);
  local.bar.phase = "stopped";
  const distance = Math.abs(local.bar.pos - local.bar.target);
  const points = Math.max(0, Math.round(100 - distance * 4));
  local.bar.myPoints = points;
  render();
  await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 3, points });
}

// ── render ──────────────────────────────────────────────────
function render() {
  if (!sb) {
    APP_EL.innerHTML = renderSetupNeeded();
    return;
  }
  if (!room) {
    APP_EL.innerHTML = renderHome();
    return;
  }

  let html = renderTopBar();
  switch (room.status) {
    case "lobby":
      html += renderLobby();
      break;
    case "game1":
      scheduleReactionGoIfNeeded();
      html += renderGame1();
      break;
    case "leaderboard1":
      html += renderLeaderboard(1, "Reaction Tap", "start-game2", "🧠 Start Trivia Blitz");
      break;
    case "game2":
      ensureTriviaTimer();
      html += renderGame2();
      break;
    case "leaderboard2":
      html += renderLeaderboard(2, "Trivia Blitz", "start-game3", "🎯 Start Stop-the-Bar");
      break;
    case "game3":
      ensureBarLoop();
      html += renderGame3();
      break;
    case "leaderboard3":
      html += renderLeaderboard(3, "Stop-the-Bar", "reveal", "🏆 Reveal Draft Order!");
      break;
    case "reveal":
      html += renderReveal();
      break;
    default:
      html += `<p>Unknown state.</p>`;
  }
  APP_EL.innerHTML = html;

  if (room.status === "game3" && (room.game_state || {}).phase === "playing") {
    ensureBarLoop();
  }
}

function renderSetupNeeded() {
  return `
    <div class="card">
      <h1>⚙️ Almost there</h1>
      <p>This app needs a Supabase project connected before it can run.
      Edit <code>config.js</code> with your project URL and anon key, then reload.</p>
      <p>See <code>README.md</code> for step-by-step setup.</p>
    </div>`;
}

function renderTopBar() {
  const code = room?.code || "";
  return `
    <div class="topbar">
      <span class="room-pill">Room <b>${code}</b></span>
      <button class="link-btn" data-action="leave">Leave</button>
    </div>`;
}

function renderHome() {
  return `
    <div class="card hero">
      <h1>🏆 Fantasy Draft Party</h1>
      <p class="sub">Play a few quick games. Whoever wins goes first in the draft.</p>
      ${local.error ? `<p class="error">${escapeHtml(local.error)}</p>` : ""}
      <label class="field">
        <span>Your name</span>
        <input id="name-input" type="text" placeholder="e.g. Craig" maxlength="24" value="${escapeHtml(local.nameInput)}" />
      </label>

      <div class="join-row">
        <input id="code-input" type="text" placeholder="ROOM CODE" maxlength="4" value="${escapeHtml(local.joinCodeInput)}" style="text-transform:uppercase" />
        <button class="btn" data-action="join-room">Join</button>
      </div>

      <div class="divider">or</div>
      <button class="btn primary" data-action="create-room">Create a new room</button>
    </div>`;
}

function renderLobby() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>Lobby</h2>
      <p class="sub">Share this code (or link) with your league:</p>
      <div class="code-display">${room.code}</div>
      <button class="btn" data-action="copy-link">Copy invite link</button>
      <span id="copy-feedback" class="feedback"></span>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${p.is_host ? "👑 " : ""}${escapeHtml(p.name)}</li>`).join("")}
      </ul>

      ${
        isHost
          ? `<button class="btn primary" data-action="start-game1" ${players.length < 2 ? "disabled" : ""}>
              ${players.length < 2 ? "Need at least 2 players" : "▶️ Start the party!"}
            </button>`
          : `<p class="waiting">Waiting for the host to start…</p>`
      }
    </div>`;
}

function renderGame1() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const submitted = scoresFor(1);
  const submittedIds = new Set(submitted.map((s) => s.player_id));

  let stage;
  if (gs.phase !== "armed") {
    stage = `<p class="sub">Reflexes time. Tap as fast as you can once the screen turns green — but don't jump the gun.</p>`;
  } else if (local.reaction.phase === "waiting") {
    stage = `<div class="reaction-box waiting">Wait for it…</div>`;
  } else if (local.reaction.phase === "go") {
    stage = `<button class="reaction-box go" data-action="reaction-tap">TAP!</button>`;
  } else if (local.reaction.phase === "falseStart") {
    stage = `<div class="reaction-box fail">Too soon! 0 points.</div>`;
  } else if (local.reaction.phase === "done") {
    stage = `<div class="reaction-box done">${local.reaction.myMs}ms — ${local.reaction.myPoints} points!</div>`;
  }

  return `
    <div class="card">
      <h2>⚡ Reaction Tap</h2>
      ${stage}
      ${isHost && gs.phase !== "armed" ? `<button class="btn primary" data-action="reaction-arm">Start round</button>` : ""}
      <h3>Submitted (${submittedIds.size}/${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${submittedIds.has(p.id) ? "✅" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${isHost ? `<button class="btn" data-action="show-leaderboard1">Show leaderboard</button>` : ""}
    </div>`;
}

function renderGame2() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const qIndex = gs.qIndex ?? 0;
  const question = window.TRIVIA_QUESTIONS[gs.order[qIndex]];
  const answered = local.trivia.answeredQIndex === qIndex;
  const submitted = scoresFor(2).filter((s) => true);
  // count distinct players who've answered THIS question is hard without a q-index column;
  // approximate using count of score rows for game 2 modulo — instead just show total answers so far this round.
  return `
    <div class="card">
      <h2>🧠 Trivia Blitz</h2>
      <p class="sub">Question ${qIndex + 1} of ${gs.order.length}</p>
      <p class="question">${escapeHtml(question.q)}</p>
      <div class="choices">
        ${question.choices
          .map((c, i) => {
            let cls = "choice";
            if (answered) {
              if (i === question.correct) cls += " correct";
              else if (i === local.trivia.myChoice) cls += " wrong";
            }
            return `<button class="${cls}" data-action="trivia-answer" data-choice="${i}" ${answered ? "disabled" : ""}>${escapeHtml(c)}</button>`;
          })
          .join("")}
      </div>
      ${answered ? `<p class="waiting">Answer locked in. ${isHost ? "" : "Waiting for host to continue…"}</p>` : ""}
      ${isHost ? `<button class="btn primary" data-action="trivia-next">${qIndex + 1 >= gs.order.length ? "Show leaderboard" : "Next question"}</button>` : ""}
    </div>`;
}

function renderGame3() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const submitted = scoresFor(3);
  const submittedIds = new Set(submitted.map((s) => s.player_id));

  return `
    <div class="card">
      <h2>🎯 Stop the Bar</h2>
      <p class="sub">Tap STOP when the marker hits the golden zone.</p>
      <div class="bar-track">
        <div class="bar-target" style="left:${(room.game_state?.target ?? 50) - 5}%; width:10%"></div>
        <div id="bar-marker" class="bar-marker" style="left:${local.bar.pos}%"></div>
      </div>
      ${
        local.bar.myPoints !== null
          ? `<div class="reaction-box done">${local.bar.myPoints} points!</div>`
          : `<button class="btn primary big" data-action="bar-tap">STOP</button>`
      }
      <h3>Submitted (${submittedIds.size}/${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${submittedIds.has(p.id) ? "✅" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${isHost ? `<button class="btn" data-action="show-leaderboard3">Show leaderboard</button>` : ""}
    </div>`;
}

function renderLeaderboard(gameIndex, gameName, nextAction, nextLabel) {
  const me = myPlayer();
  const isHost = me?.is_host;
  const totals = totalsByPlayer();
  return `
    <div class="card">
      <h2>📊 Leaderboard</h2>
      <p class="sub">After ${gameName}</p>
      <ol class="leaderboard">
        ${totals.map((t) => `<li><span>${escapeHtml(t.player.name)}</span><b>${t.total}</b></li>`).join("")}
      </ol>
      ${isHost ? `<button class="btn primary" data-action="${nextAction}">${nextLabel}</button>` : `<p class="waiting">Waiting for host…</p>`}
    </div>`;
}

function renderReveal() {
  const totals = totalsByPlayer();
  const order = totals.slice().reverse(); // reveal last pick first, building to #1
  setTimeout(startRevealAnimation, 50);
  return `
    <div class="card">
      <h2>🏆 Draft Order</h2>
      <div id="reveal-list" class="reveal-list"></div>
    </div>`;
}

function startRevealAnimation() {
  if (local.revealStarted) return;
  local.revealStarted = true;
  const totals = totalsByPlayer();
  const order = totals.slice().reverse();
  const list = document.getElementById("reveal-list");
  if (!list) return;
  let i = 0;
  const showNext = () => {
    if (i >= order.length) {
      spawnConfetti();
      return;
    }
    const pickNumber = order.length - i;
    const entry = order[i];
    const div = document.createElement("div");
    div.className = "reveal-item" + (pickNumber === 1 ? " first-pick" : "");
    div.innerHTML = `<span class="pick-num">Pick #${pickNumber}</span><span class="pick-name">${escapeHtml(entry.player.name)}</span><span class="pick-pts">${entry.total} pts</span>`;
    list.prepend(div);
    i++;
    setTimeout(showNext, pickNumber === 1 ? 200 : 900);
  };
  showNext();
}

function spawnConfetti() {
  const colors = ["#ffd166", "#06d6a0", "#ef476f", "#118ab2", "#ffffff"];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = Math.random() * 100 + "vw";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.animationDelay = Math.random() * 0.8 + "s";
    el.style.animationDuration = 2.5 + Math.random() * 1.5 + "s";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// keep text inputs from resetting cursor/value across re-renders by tracking them
APP_EL.addEventListener("input", (e) => {
  if (e.target.id === "name-input") local.nameInput = e.target.value;
  if (e.target.id === "code-input") local.joinCodeInput = e.target.value.toUpperCase();
});
