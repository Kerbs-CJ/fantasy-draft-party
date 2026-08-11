// Fantasy Draft Party — app logic. Vanilla JS, no build step.

const APP_EL = document.getElementById("app");
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1
const MISSING_CLUB_COUNT = 5;
const MISSING_CLUB_POINTS = 20; // flat — no timer, so no speed bonus
const GUESS_PLAYER_COUNT = 7;
const GUESS_CLUE_POINTS = [30, 24, 18, 12, 6]; // indexed by clueIndex (0 = only 1st clue shown)
// Football Golf — a real top-down course, not an abstract scalar. Every
// player has an actual (x, y) position on the hole (percent coordinates,
// tee near the bottom, pin near the top) that's part of shared room
// state, so a shot's outcome is visible to everyone as a ball moving
// across the shared course, not just a final result. Every swing is the
// same power+aim tap-timing pair — a marker sweeps a track and bounces
// back (matches sweepValue()'s triangle wave below), tap to lock it in as
// close to dead-center as you can. Both meters are always centered on 50;
// `radius` is how far off that center still counts for something — a
// tighter radius means even good timing yields lower shot quality, which
// feeds both how far the shot travels and (via aim) how much it curves
// off the direct line to the pin. `bunkers` are decorative only (visual
// variety per hole), not a gameplay penalty yet.
const GOLF_HOLES = [
  {
    name: "The Approach",
    description: "A short, forgiving hole to warm up on.",
    par: 3,
    radius: 30,
    tee: { x: 50, y: 90 },
    pin: { x: 50, y: 12 },
    bunkers: [
      { x: 30, y: 45, w: 16, h: 9 },
      { x: 68, y: 60, w: 12, h: 7 },
    ],
  },
  {
    name: "The Dogleg",
    description: "Bends away from the tee — line matters as much as power.",
    par: 4,
    radius: 22,
    tee: { x: 18, y: 90 },
    pin: { x: 80, y: 14 },
    bunkers: [
      { x: 55, y: 48, w: 16, h: 9 },
      { x: 30, y: 65, w: 10, h: 6 },
      { x: 70, y: 30, w: 12, h: 7 },
    ],
  },
  {
    name: "The Long Drive",
    description: "A proper test — small margin for error.",
    par: 5,
    radius: 16,
    tee: { x: 50, y: 94 },
    pin: { x: 50, y: 8 },
    bunkers: [
      { x: 35, y: 35, w: 12, h: 7 },
      { x: 65, y: 55, w: 12, h: 7 },
      { x: 30, y: 72, w: 10, h: 6 },
      { x: 70, y: 20, w: 10, h: 6 },
    ],
  },
];
const GOLF_SWEEP_PERIOD_MS = 1400; // one-way sweep duration — must match the .golf-sweep CSS animation-duration
// A shot's `advance` distance is GOLF_ADVANCE_FLOOR (a total mishit still
// crawls forward) up to 1.0 (dead-center on both taps) times the hole's
// per-shot "unit distance" (tee-to-pin distance / par) — see
// computeShotResult. Playing every shot perfectly finishes exactly at par
// (par shots x 1.0 unit = the full tee-to-pin distance); worse timing
// needs extra strokes. Aim deviates the shot's direction left/right of
// the straight line to the pin, up to GOLF_MAX_AIM_DEVIATION_DEG.
const GOLF_ADVANCE_FLOOR = 0.4;
const GOLF_MAX_AIM_DEVIATION_DEG = 28;
const GOLF_HOLED_THRESHOLD = 5; // how close (course %) counts as "in the hole"
const GOLF_MERCY_STROKES = 3; // holes forcibly finish at par + this, however far short
const GOLF_PRACTICE_RADIUS = 25; // medium difficulty — just for getting a feel for the timing
const GOLF_TERM_POINTS = { eagle: 50, birdie: 35, par: 25, bogey: 15, "double-bogey": 8, "triple-plus": 3 };
const GOLF_TERM_LABEL = {
  eagle: "🦅 Eagle!",
  birdie: "🐦 Birdie!",
  par: "⛳ Par",
  bogey: "😬 Bogey",
  "double-bogey": "😵 Double Bogey",
  "triple-plus": "🐌 Picked up",
};
const DEV_BOT_PREFIX = "🤖 ";
const DEV_TARGET_PLAYER_COUNT = 5; // matches the real draft-night group size
function isDevBot(player) {
  return !!player && player.name.startsWith(DEV_BOT_PREFIX);
}

let sb = null; // supabase client
let DEV_MODE = false; // ?dev=1 in the URL — shows solo game-testing shortcuts
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
  missingClub: { qIndex: null, answeredQIndex: null, myChoice: null, pending: null, choices: null },
  guess: { pIndex: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null },
  revealStarted: false,
  botShooterScheduledFor: null,
  botKeeperScheduledFor: null,
  shootoutAnim: { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, impactShown: false, finalizing: false },
  golf: { holeIndex: null, subPhase: "ready", phaseStart: null, power: null, lastShot: null },
  golfBallAnim: {}, // playerId -> {x, y} currently-displayed position, for the animated slide
  golfAnim: { key: null, revealed: false },
  practice: { subPhase: "ready", phaseStart: null, power: null, lastQuality: null },
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

init();

function init() {
  const params = new URLSearchParams(location.search);
  const roomFromUrl = params.get("room");
  if (roomFromUrl) local.joinCodeInput = roomFromUrl.toUpperCase();
  DEV_MODE = params.get("dev") === "1";

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

// ── helpers ──────────────────────────────────────────────────
function genRoomCode() {
  let out = "";
  for (let i = 0; i < 4; i++) out += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  return out;
}
function myPlayer() {
  return players.find((p) => p.id === session?.playerId);
}
function isMeHost() {
  return !!myPlayer()?.is_host;
}
function totalsByPlayer() {
  const totals = {};
  for (const p of players) totals[p.id] = 0;
  for (const s of scores) totals[s.player_id] = (totals[s.player_id] || 0) + Number(s.points);
  return players
    .map((p) => ({ player: p, total: totals[p.id] || 0 }))
    .sort((a, b) => b.total - a.total);
}
function answeredPlayerIds(gameIndex, roundIndex) {
  return new Set(
    scores
      .filter((s) => s.game_index === gameIndex && s.round_index === roundIndex)
      .map((s) => s.player_id)
  );
}
function correctPlayerIds(gameIndex, roundIndex) {
  return new Set(
    scores
      .filter((s) => s.game_index === gameIndex && s.round_index === roundIndex && s.points > 0)
      .map((s) => s.player_id)
  );
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
  if (action === "missing-club-select") return selectMissingClub(btn.dataset.club);
  if (action === "missing-club-confirm") return confirmMissingClub();
  if (action === "guess-answer") return guessAnswer(btn.dataset.name);
  if (action === "pick-shooter") return submitPick("shooter", btn.dataset.zone);
  if (action === "pick-keeper") return submitPick("keeper", btn.dataset.zone);
  if (action === "golf-begin-swing") return golfBeginSwing();
  if (action === "golf-lock-power") return golfLockPower();
  if (action === "golf-lock-aim") return golfLockAim();
  if (action === "practice-begin-swing") return practiceBeginSwing();
  if (action === "practice-lock-power") return practiceLockPower();
  if (action === "practice-lock-aim") return practiceLockAim();
  if (action === "leave") return leaveRoom();
  if (action === "dev-quickstart") return devQuickStart(btn.dataset.status);

  // Everything below drives the shared room state for the whole group —
  // only the host may trigger it. The corresponding buttons are already
  // hidden from non-hosts in the UI, but that alone only stops normal
  // clicking; this is the actual enforcement (e.g. against someone firing
  // the action straight from devtools).
  if (!isMeHost()) return;
  if (action === "show-party-intro") return updateRoom({ status: "party-intro" });
  if (action === "show-missing-club-intro") return updateRoom({ status: "missing-club-intro" });
  if (action === "start-missing-club") return startMissingClub();
  if (action === "reveal-missing-club") return revealMissingClub();
  if (action === "missing-club-next") return missingClubNext();
  if (action === "start-guess-round") return startGuessRound();
  if (action === "guess-reveal-clue") return guessRevealClue();
  if (action === "guess-next") return guessNext();
  if (action === "show-shootout-intro") return updateRoom({ status: "shootout-intro" });
  if (action === "start-round-robin") return startRoundRobin();
  if (action === "start-rr-match") return startRRMatch(Number(btn.dataset.i));
  if (action === "finish-round-robin") return finishRoundRobin();
  if (action === "show-golf-intro") return updateRoom({ status: "golf-intro" });
  if (action === "show-golf-practice") return showGolfPractice();
  if (action === "start-golf") return startGolf();
  if (action === "golf-next-hole") return golfNextHole();
  if (action === "reveal") return updateRoom({ status: "reveal" });
  if (action === "dev-jump") return devJump(btn.dataset.status);
}

// ── home / lobby ────────────────────────────────────────────
async function createRoom() {
  const name = (document.getElementById("name-input")?.value || "").trim();
  if (!name) return setError("Enter your name first.");
  await createRoomAs(name);
}

async function createRoomAs(name) {
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

// ── guess the missing club ──────────────────────────────────
function randomMissingClubOrder() {
  const pool = window.MISSING_CLUB_PLAYERS.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MISSING_CLUB_COUNT);
}

async function startMissingClub() {
  await updateRoom({ status: "missing-club", game_state: { order: randomMissingClubOrder(), qIndex: 0, revealed: false } });
}

function ensureMissingClubReady() {
  const gs = room.game_state || {};
  if (gs.qIndex === undefined) return;
  if (local.missingClub.qIndex !== gs.qIndex) {
    local.missingClub.qIndex = gs.qIndex;
    local.missingClub.answeredQIndex = null;
    local.missingClub.myChoice = null;
    local.missingClub.pending = null;
    const entry = window.MISSING_CLUB_PLAYERS[gs.order[gs.qIndex]];
    local.missingClub.choices = shuffle([entry.clubs[entry.missingIndex], ...entry.decoys]);
  }
}

function ensureGuessReady() {
  const gs = room.game_state || {};
  if (gs.pIndex === undefined) return;
  if (local.guess.pIndex !== gs.pIndex) {
    local.guess.pIndex = gs.pIndex;
    local.guess.answeredPIndex = null;
    local.guess.answeredClueIndex = null;
    local.guess.myChoice = null;
    const entry = window.GUESS_PLAYERS[gs.order[gs.pIndex]];
    local.guess.choices = shuffle([entry.name, ...entry.decoys]);
  }
}

// Clicking a choice just stages it locally — nothing is written or locked
// in until the player hits Confirm, so a stray/misclick doesn't cost them
// their answer.
function selectMissingClub(club) {
  if (local.missingClub.answeredQIndex === local.missingClub.qIndex) return;
  local.missingClub.pending = club;
  render();
}

async function confirmMissingClub() {
  if (local.missingClub.answeredQIndex === local.missingClub.qIndex) return;
  if (!local.missingClub.pending) return;
  await submitMissingClubAnswer(local.missingClub.pending, local.missingClub.qIndex);
}

async function submitMissingClubAnswer(club, qIndex) {
  const me = myPlayer();
  if (!me) return;
  local.missingClub.answeredQIndex = qIndex;
  local.missingClub.myChoice = club;
  const gs = room.game_state || {};
  const entry = window.MISSING_CLUB_PLAYERS[gs.order[qIndex]];
  const correct = club === entry.clubs[entry.missingIndex];
  const points = correct ? MISSING_CLUB_POINTS : 0;
  render();
  await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 1, round_index: qIndex, points });
}

// Host-triggered — shows the correct club and the "X/Y got it right" tally
// to everyone at once, instead of each player finding out the instant they
// answer. Players can keep taking their own time beforehand; nothing is
// revealed until the host calls it for the whole room.
async function revealMissingClub() {
  const gs = room.game_state || {};
  await updateRoom({ game_state: { ...gs, revealed: true } });
}

async function missingClubNext() {
  const gs = room.game_state || {};
  const next = gs.qIndex + 1;
  if (next >= gs.order.length) {
    await updateRoom({ status: "guess-intro" });
  } else {
    await updateRoom({ game_state: { ...gs, qIndex: next, revealed: false } });
  }
}

async function startGuessRound() {
  await updateRoom({ status: "guess", game_state: { order: randomGuessOrder(), pIndex: 0, clueIndex: 0 } });
}

// ── guess the footballer ────────────────────────────────────
function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomGuessOrder() {
  const pool = window.GUESS_PLAYERS.map((_, i) => i);
  return shuffle(pool).slice(0, GUESS_PLAYER_COUNT);
}

async function guessRevealClue() {
  const gs = room.game_state || {};
  const entry = window.GUESS_PLAYERS[gs.order[gs.pIndex]];
  const next = Math.min(entry.clues.length - 1, gs.clueIndex + 1);
  await updateRoom({ game_state: { ...gs, clueIndex: next } });
}

async function guessAnswer(name) {
  if (local.guess.answeredPIndex === local.guess.pIndex) return;
  const me = myPlayer();
  if (!me) return;
  const gs = room.game_state || {};
  const entry = window.GUESS_PLAYERS[gs.order[gs.pIndex]];
  const correct = name === entry.name;
  const points = correct ? GUESS_CLUE_POINTS[gs.clueIndex] : 0;
  local.guess.answeredPIndex = local.guess.pIndex;
  local.guess.answeredClueIndex = gs.clueIndex;
  local.guess.myChoice = name;
  render();
  await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 2, round_index: gs.pIndex, points });
}

async function guessNext() {
  const gs = room.game_state || {};
  const next = gs.pIndex + 1;
  if (next >= gs.order.length) {
    await updateRoom({ status: "leaderboard" });
  } else {
    await updateRoom({ game_state: { ...gs, pIndex: next, clueIndex: 0 } });
  }
}

// ── penalty shootout round robin ────────────────────────────
// The whole mini-tournament lives in room.game_state.roundRobin — a flat,
// ordered list of every possible pairing (all N*(N-1)/2 of them, one
// match each), no byes or brackets involved at all. That sidesteps the
// bye-fairness problem entirely: with 5 players a knockout bracket always
// has to concentrate byes somewhere (round 1, a later round, or both) —
// round robin just has everyone play everyone, once each, full stop.
function generateRoundRobinMatches(playerIds) {
  const pairs = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      pairs.push({ p1: playerIds[i], p2: playerIds[j], winner: null, score: null });
    }
  }
  return orderRoundRobinMatches(pairs);
}

// A plain shuffle of every pairing can easily land the same player in 3+
// matches back to back (they just have to stand around and shoot again).
// This orders the matches with a simple "least recently played" scheduler
// instead: at each step, it picks whichever remaining pairing's most-
// recently-active player has rested longest since their last match — and
// it hard-forbids any pick that would give a player a 3rd straight
// appearance, unless literally every remaining option would do that (which
// only happens right at the tail end, if ever).
function orderRoundRobinMatches(pairs) {
  const remaining = shuffle(pairs.slice());
  const ordered = [];

  function lastPlayedIndex(pid) {
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (ordered[i].p1 === pid || ordered[i].p2 === pid) return i;
    }
    return -1;
  }
  function restGap(pid) {
    const idx = lastPlayedIndex(pid);
    return idx === -1 ? Infinity : ordered.length - 1 - idx;
  }
  function inMatch(pid, match) {
    return match.p1 === pid || match.p2 === pid;
  }
  function wouldMakeThreeInARow(m) {
    if (ordered.length < 2) return false;
    const last = ordered[ordered.length - 1];
    const prev = ordered[ordered.length - 2];
    return (inMatch(m.p1, last) && inMatch(m.p1, prev)) || (inMatch(m.p2, last) && inMatch(m.p2, prev));
  }

  while (remaining.length) {
    let candidates = remaining.filter((m) => !wouldMakeThreeInARow(m));
    if (candidates.length === 0) candidates = remaining; // forced — no safe option left

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const m of candidates) {
      const score = Math.min(restGap(m.p1), restGap(m.p2));
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    ordered.push(best);
    remaining.splice(remaining.indexOf(best), 1);
  }
  return ordered;
}

function findNextRRMatch(matches) {
  return matches.findIndex((m) => !m.winner);
}

// Standings: most wins first, then goal difference (kicks scored minus
// kicks conceded across all of a player's matches). Anyone still tied
// after that is resolved by head-to-head — see resolveHeadToHead below.
function computeStandings(matches, playerList) {
  const stats = {};
  playerList.forEach((p) => {
    stats[p.id] = { player: p, wins: 0, losses: 0, gf: 0, ga: 0 };
  });
  matches.forEach((m) => {
    if (!m.winner || !m.score) return;
    const s1 = stats[m.p1];
    const s2 = stats[m.p2];
    if (!s1 || !s2) return;
    const p1Score = m.score[m.p1] || 0;
    const p2Score = m.score[m.p2] || 0;
    s1.gf += p1Score;
    s1.ga += p2Score;
    s2.gf += p2Score;
    s2.ga += p1Score;
    if (m.winner === m.p1) {
      s1.wins++;
      s2.losses++;
    } else {
      s2.wins++;
      s1.losses++;
    }
  });

  const all = Object.values(stats).map((s) => ({ ...s, gd: s.gf - s.ga }));
  all.sort((a, b) => b.wins - a.wins || b.gd - a.gd);

  // Anyone sharing the same (wins, gd) after that sort is a tied block —
  // resolve each block using only the matches played between its members.
  // For a 2-way tie that's a single decisive match (someone always wins a
  // shootout, so it can never itself be a tie). For a 3+ way tie it's a
  // mini table of just those players' results against each other.
  const result = [];
  let i = 0;
  while (i < all.length) {
    let j = i + 1;
    while (j < all.length && all[j].wins === all[i].wins && all[j].gd === all[i].gd) j++;
    const group = all.slice(i, j);
    if (group.length > 1) resolveHeadToHead(group, matches);
    result.push(...group);
    i = j;
  }
  return result;
}

function resolveHeadToHead(group, matches) {
  const ids = new Set(group.map((s) => s.player.id));
  const h2h = {};
  group.forEach((s) => (h2h[s.player.id] = { wins: 0, gf: 0, ga: 0 }));
  matches.forEach((m) => {
    if (!m.winner || !m.score) return;
    if (!ids.has(m.p1) || !ids.has(m.p2)) return; // only matches between the tied players count
    const p1Score = m.score[m.p1] || 0;
    const p2Score = m.score[m.p2] || 0;
    h2h[m.p1].gf += p1Score;
    h2h[m.p1].ga += p2Score;
    h2h[m.p2].gf += p2Score;
    h2h[m.p2].ga += p1Score;
    if (m.winner === m.p1) h2h[m.p1].wins++;
    else h2h[m.p2].wins++;
  });
  // Head-to-head wins, then head-to-head goal difference. In the
  // vanishingly rare case a 3+ way tie survives even that (e.g. everyone
  // splits their head-to-heads 1-1 with identical scores), the group just
  // keeps its existing order — not worth a further tiebreak on top of a
  // goal-difference-flavored one.
  group.sort((a, b) => {
    const ha = h2h[a.player.id];
    const hb = h2h[b.player.id];
    return hb.wins - ha.wins || (hb.gf - hb.ga) - (ha.gf - ha.ga);
  });
}

// 100/80/60/40/20 for a 5-player field (a clean 20-point step per place),
// scaled to whatever the actual player count is. That keeps the shootout's
// max swing (80, top to bottom) in the same ballpark as Guess the Missing
// Club's max swing (100 — 5 rounds at up to 20pts each), noticeably gentler than
// Guess the Footballer's (210 — 7 rounds at up to 30pts each), since the
// shootout is one placement rather than several independently-scored
// rounds. rank is 0-indexed (0 = 1st place).
function placementPoints(rank, n) {
  return n > 1 ? Math.round(100 - (80 * rank) / (n - 1)) : 100;
}

async function startRoundRobin() {
  const matches = generateRoundRobinMatches(players.map((p) => p.id));
  await updateRoom({ status: "round-robin", game_state: { roundRobin: { matches } } });
}

async function startRRMatch(i) {
  const gs = room.game_state;
  const match = gs.roundRobin.matches[i];
  const newMatch = {
    p1: match.p1,
    p2: match.p2,
    rrIndex: i,
    roundIndex: 0,
    turn: "p1",
    shooterPick: null,
    keeperPick: null,
    score: { [match.p1]: 0, [match.p2]: 0 },
    kicksTaken: { [match.p1]: 0, [match.p2]: 0 },
    log: [],
  };
  await updateRoom({ status: "shootout", game_state: { ...gs, match: newMatch } });
}

function resolveKick(match) {
  const shooterId = match.turn === "p1" ? match.p1 : match.p2;
  const keeperId = match.turn === "p1" ? match.p2 : match.p1;
  const scored = match.shooterPick !== match.keeperPick;
  if (scored) match.score[shooterId] = (match.score[shooterId] || 0) + 1;
  match.kicksTaken[shooterId] = (match.kicksTaken[shooterId] || 0) + 1;
  match.log.push({ shooter: shooterId, keeper: keeperId, shooterPick: match.shooterPick, keeperPick: match.keeperPick, scored });
  match.shooterPick = null;
  match.keeperPick = null;

  // This kick belonged to the initial best-of-5 phase if the round hadn't
  // reached 5 yet (rounds 5+ are sudden death, one kick each, no cap).
  const wasNormalPhase = match.roundIndex < 5;

  if (match.turn === "p1") {
    match.turn = "p2";
  } else {
    match.turn = "p1";
    match.roundIndex += 1;
  }

  // Real shootouts end the instant the result is mathematically certain —
  // if the trailing player can't catch up even by scoring every kick they
  // have left in the initial 5, there's no need to take the rest.
  if (wasNormalPhase) {
    const maxFinal = (pid) => match.score[pid] + Math.max(0, 5 - match.kicksTaken[pid]);
    if (match.score[match.p1] > maxFinal(match.p2)) match.winnerId = match.p1;
    else if (match.score[match.p2] > maxFinal(match.p1)) match.winnerId = match.p2;
  }

  // Otherwise, once both have taken an equal number of kicks and the
  // initial 5 rounds are done (or we're in sudden death, which is always
  // one-kick-each), a score difference decides it.
  if (!match.winnerId) {
    const equalKicks = match.kicksTaken[match.p1] === match.kicksTaken[match.p2];
    const minRoundsDone = match.kicksTaken[match.p1] >= 5 && match.kicksTaken[match.p2] >= 5;
    if (equalKicks && minRoundsDone && match.score[match.p1] !== match.score[match.p2]) {
      match.winnerId = match.score[match.p1] > match.score[match.p2] ? match.p1 : match.p2;
    }
  }
  return match;
}

async function submitPick(role, zone) {
  const { data: freshRoom } = await sb.from("rooms").select("*").eq("code", room.code).single();
  const gs = freshRoom.game_state;
  const match = gs.match;
  if (!match) return;
  // Only the actual shooter/keeper for this turn may submit their pick —
  // spectators (and anyone poking at the console) can't hijack a kick that
  // isn't theirs. The one exception is dev mode, where a solo tester
  // deliberately plays bot roles on their own device; see
  // ensureBotAutoPick/scheduleBotPick.
  const targetId = role === "shooter" ? (match.turn === "p1" ? match.p1 : match.p2) : match.turn === "p1" ? match.p2 : match.p1;
  const targetIsBot = isDevBot(players.find((p) => p.id === targetId));
  if (myPlayer()?.id !== targetId && !(DEV_MODE && targetIsBot)) return;
  const key = role === "shooter" ? "shooterPick" : "keeperPick";
  if (match[key] !== null) return;
  const updated = { ...match, [key]: zone };
  if (updated.shooterPick !== null && updated.keeperPick !== null) {
    resolveKick(updated);
  }
  // Even a decisive kick just writes the match as normal — the winner flag
  // rides along inside it. The round robin standings only get updated once every
  // client has had a chance to play that final kick's animation; see
  // finalizeMatchIfDecided(), called from ensureShootoutAnim().
  await updateRoom({ game_state: { ...gs, match: updated } });
}

async function finalizeMatchIfDecided() {
  const match = room.game_state?.match;
  if (!match || !match.winnerId) return;
  if (local.shootoutAnim.finalizing) return;
  local.shootoutAnim.finalizing = true;
  const { data: freshRoom } = await sb.from("rooms").select("*").eq("code", room.code).single();
  if (freshRoom.status !== "shootout") return; // someone else already finalized it
  const gs = freshRoom.game_state;
  const m = gs.match;
  if (!m || !m.winnerId) return;
  const roundRobin = gs.roundRobin;
  roundRobin.matches[m.rrIndex].winner = m.winnerId;
  roundRobin.matches[m.rrIndex].score = { ...m.score };
  await updateRoom({ status: "round-robin", game_state: { roundRobin, match: null } });
}

async function finishRoundRobin() {
  const standings = computeStandings(room.game_state.roundRobin.matches, players);
  const n = standings.length;
  const inserts = standings.map((s, i) => ({
    room_code: room.code,
    player_id: s.player.id,
    game_index: 3,
    round_index: 0,
    points: placementPoints(i, n),
  }));
  if (inserts.length) await sb.from("scores").insert(inserts);
  await updateRoom({ status: "final-leaderboard" });
}

// ── football golf ───────────────────────────────────────────
// A fixed 3-hole course, played as actual stroke play on a real top-down
// layout — every player has an (x, y) position on the hole, starting at
// the tee, that lives in shared room state and updates after every shot
// (not just the final one), so the whole group watches every ball move
// across the course live, not just a final result. Everyone plays the
// SAME hole at once, each on their own device and own time (like Guess
// the Missing Club) — no bracket, no turn order, so nobody's ever stuck
// waiting on one slow (or unresponsive, e.g. a dev bot) player. The
// sweeping power/aim meters themselves are still purely local to each
// player's own device — only the resolved shot (new position, stroke
// count) gets written to shared state.

// Maps an elapsed time to where a linear-alternate CSS sweep animation
// would currently sit — a triangle wave from 0 to 100 and back, matching
// `.golf-sweep`'s `animation: golf-sweep <period>ms linear infinite
// alternate` exactly (period here must match GOLF_SWEEP_PERIOD_MS).
function sweepValue(elapsedMs, periodMs) {
  const t = (elapsedMs % (periodMs * 2)) / periodMs; // 0..2
  const pos = t <= 1 ? t : 2 - t; // 0..1..0 triangle
  return Math.round(pos * 100);
}

// Both meters are always centered on 50 — how well you time each tap is
// the whole skill test, not guessing a hidden target. Power drives
// distance (a total mishit still crawls forward GOLF_ADVANCE_FLOOR of a
// "par unit", up to a full unit on a dead-center tap); aim drives
// direction, deviating up to GOLF_MAX_AIM_DEVIATION_DEG off the straight
// line to the pin. A flawless run of `par` shots — each covering exactly
// one unit dead straight — lands exactly on the pin; worse timing costs
// extra strokes and/or sends the ball off-line.
function computeShotResult(hole, pos, power, aim) {
  const dx = hole.pin.x - pos.x;
  const dy = hole.pin.y - pos.y;
  const distToPin = Math.sqrt(dx * dx + dy * dy);
  const idealAngle = Math.atan2(dy, dx);

  const powerAcc = clamp(1 - Math.abs(power - 50) / hole.radius, 0, 1);
  const aimAcc = clamp(1 - Math.abs(aim - 50) / hole.radius, 0, 1);
  const quality = (powerAcc + aimAcc) / 2;

  const maxDeviationRad = (GOLF_MAX_AIM_DEVIATION_DEG * Math.PI) / 180;
  const aimOffset = ((aim - 50) / 50) * maxDeviationRad;
  const shotAngle = idealAngle + aimOffset;

  const totalDist = Math.hypot(hole.pin.x - hole.tee.x, hole.pin.y - hole.tee.y);
  const unitDistance = totalDist / hole.par;
  const advance = unitDistance * (GOLF_ADVANCE_FLOOR + (1 - GOLF_ADVANCE_FLOOR) * quality);
  const travel = Math.min(advance, distToPin + 3); // don't wildly overshoot past the pin

  const x = clamp(pos.x + Math.cos(shotAngle) * travel, 3, 97);
  const y = clamp(pos.y + Math.sin(shotAngle) * travel, 3, 97);
  const newDistToPin = Math.hypot(hole.pin.x - x, hole.pin.y - y);
  const holed = newDistToPin <= GOLF_HOLED_THRESHOLD;

  return { x, y, powerAcc, aimAcc, quality, holed };
}

function golfScoreTerm(strokes, par) {
  const diff = strokes - par;
  if (diff <= -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double-bogey";
  return "triple-plus";
}

// How many players have holed out on the current hole yet.
function golfFinishedPlayers(gs) {
  return players.filter((p) => (gs.results[p.id] || []).length > gs.holeIndex);
}

// Everyone's ball starts bunched up at the tee, visible to the whole
// group from the first render of the hole — not just appearing once
// someone's taken a shot.
function golfBallsAtTee(hole) {
  const balls = {};
  for (const p of players) balls[p.id] = { x: hole.tee.x, y: hole.tee.y, strokes: 0, holedOut: false };
  return balls;
}

async function startGolf() {
  await updateRoom({ status: "golf", game_state: { golf: { holeIndex: 0, results: {}, balls: golfBallsAtTee(GOLF_HOLES[0]) } } });
}

function ensureGolfReady() {
  const gs = room.game_state?.golf;
  if (!gs) return;
  if (local.golf.holeIndex !== gs.holeIndex) {
    local.golf = { holeIndex: gs.holeIndex, subPhase: "ready", phaseStart: null, power: null, lastShot: null };
    local.golfBallAnim = {}; // fresh hole — don't animate a cross-course jump from the old one
  }
}

function golfAlreadyAnswered(gs) {
  const me = myPlayer();
  if (!me) return true;
  return (gs.results[me.id] || []).length > gs.holeIndex;
}

function golfMyBall(gs, hole) {
  const me = myPlayer();
  return (me && gs.balls[me.id]) || { x: hole.tee.x, y: hole.tee.y, strokes: 0, holedOut: false };
}

// Used both to tee off (subPhase "ready") and to line up every
// subsequent approach shot (subPhase "recap", after seeing the last
// shot's outcome) — same swing, just repeated until the hole's done.
function golfBeginSwing() {
  const gs = room.game_state?.golf;
  if (!gs || golfAlreadyAnswered(gs)) return;
  if (local.golf.subPhase !== "ready" && local.golf.subPhase !== "recap") return;
  local.golf = { ...local.golf, subPhase: "power", phaseStart: Date.now(), power: null };
  render();
}

function golfLockPower() {
  const gs = room.game_state?.golf;
  if (!gs || golfAlreadyAnswered(gs)) return;
  if (local.golf.subPhase !== "power") return;
  const power = sweepValue(Date.now() - local.golf.phaseStart, GOLF_SWEEP_PERIOD_MS);
  local.golf = { ...local.golf, subPhase: "aim", phaseStart: Date.now(), power };
  render();
}

async function golfLockAim() {
  const me = myPlayer();
  const gs = room.game_state?.golf;
  if (!me || !gs || golfAlreadyAnswered(gs)) return;
  if (local.golf.subPhase !== "aim") return;
  const aim = sweepValue(Date.now() - local.golf.phaseStart, GOLF_SWEEP_PERIOD_MS);
  const hole = GOLF_HOLES[gs.holeIndex];
  if (!hole) return;

  const currentBall = golfMyBall(gs, hole);
  const shot = computeShotResult(hole, currentBall, local.golf.power, aim);
  const strokes = currentBall.strokes + 1;
  const holedOut = shot.holed || strokes >= hole.par + GOLF_MERCY_STROKES;
  const balls = { ...gs.balls, [me.id]: { x: shot.x, y: shot.y, strokes, holedOut } };

  let results = gs.results;
  if (holedOut) {
    const term = golfScoreTerm(strokes, hole.par);
    const result = { strokes, term, points: GOLF_TERM_POINTS[term] };
    results = { ...gs.results, [me.id]: [...(gs.results[me.id] || []), result] };
  }

  local.golf = { ...local.golf, subPhase: "recap", phaseStart: null, power: null, lastShot: shot };
  await updateRoom({ game_state: { golf: { ...gs, balls, results } } });
}

// Host-triggered, same as Missing Club's reveal/next — doesn't require
// every player to have finished, so a stuck or bot player never blocks
// the group from moving on.
async function golfNextHole() {
  const gs = room.game_state?.golf;
  if (!gs) return;
  const next = gs.holeIndex + 1;
  if (next >= GOLF_HOLES.length) {
    await finishGolf(gs);
  } else {
    await updateRoom({ game_state: { golf: { ...gs, holeIndex: next, balls: golfBallsAtTee(GOLF_HOLES[next]) } } });
  }
}

async function finishGolf(gs) {
  const totals = players.map((p) => ({
    player: p,
    total: (gs.results[p.id] || []).reduce((sum, r) => sum + r.points, 0),
  }));
  totals.sort((a, b) => b.total - a.total);
  const n = totals.length;
  const inserts = totals.map((t, i) => ({
    room_code: room.code,
    player_id: t.player.id,
    game_index: 4,
    round_index: 0,
    points: placementPoints(i, n),
  }));
  if (inserts.length) await sb.from("scores").insert(inserts);
  await updateRoom({ status: "golf-leaderboard" });
}

// Drives the pop-in reveal for the finishers list, same shape as before.
function ensureGolfAnim() {
  const gs = room.game_state?.golf;
  if (!gs) return;
  const key = `${gs.holeIndex}-${golfFinishedPlayers(gs).length}`;
  if (local.golfAnim.key !== key) {
    local.golfAnim.key = key;
    local.golfAnim.revealed = false;
    setTimeout(() => {
      if (local.golfAnim.key === key) {
        local.golfAnim.revealed = true;
        render();
      }
    }, 60);
  }
}


// ── football golf: driving range ────────────────────────────
// A shared, unscored warm-up screen off the golf launcher — everyone's
// on the same room state together (so everyone genuinely sees everyone),
// but each player's swing is their own repeatable loop, same mechanic as
// the real round, minus strokes/par/results. Only the latest swing per
// player is kept (no history), just enough to show "here's roughly how
// I'm doing" in each player's own lane.
async function showGolfPractice() {
  await updateRoom({ status: "golf-practice", game_state: { golfPractice: { swings: {} } } });
}

function practiceBeginSwing() {
  if (local.practice.subPhase !== "ready" && local.practice.subPhase !== "recap") return;
  local.practice = { ...local.practice, subPhase: "power", phaseStart: Date.now(), power: null };
  render();
}

function practiceLockPower() {
  if (local.practice.subPhase !== "power") return;
  const power = sweepValue(Date.now() - local.practice.phaseStart, GOLF_SWEEP_PERIOD_MS);
  local.practice = { ...local.practice, subPhase: "aim", phaseStart: Date.now(), power };
  render();
}

// The driving range has no real course to aim at (no tee/pin), just a
// timing test — this is the same power/aim accuracy math computeShotResult
// uses internally, without the 2D position side of it.
function computeSwingQuality(radius, power, aim) {
  const powerAcc = clamp(1 - Math.abs(power - 50) / radius, 0, 1);
  const aimAcc = clamp(1 - Math.abs(aim - 50) / radius, 0, 1);
  return (powerAcc + aimAcc) / 2;
}

async function practiceLockAim() {
  const me = myPlayer();
  if (!me || local.practice.subPhase !== "aim") return;
  const aim = sweepValue(Date.now() - local.practice.phaseStart, GOLF_SWEEP_PERIOD_MS);
  const quality = computeSwingQuality(GOLF_PRACTICE_RADIUS, local.practice.power, aim);
  local.practice = { ...local.practice, subPhase: "recap", phaseStart: null, power: null, lastQuality: quality };
  render();
  const gs = room.game_state?.golfPractice || { swings: {} };
  await updateRoom({ game_state: { golfPractice: { swings: { ...gs.swings, [me.id]: quality } } } });
}

function practiceQualityLabel(quality) {
  if (quality == null) return "⏳ Hasn't swung yet";
  if (quality >= 0.85) return "🔥 Great strike!";
  if (quality >= 0.55) return "👍 Solid contact";
  if (quality >= 0.25) return "😬 Mishit";
  return "🫣 Total shank!";
}

// ── dev mode: solo-test any screen without a full lobby ────
function resetLocalGameState() {
  local.missingClub = { qIndex: null, answeredQIndex: null, myChoice: null, pending: null, choices: null };
  local.guess = { pIndex: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null };
  local.revealStarted = false;
  local.botShooterScheduledFor = null;
  local.botKeeperScheduledFor = null;
  local.shootoutAnim = { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, impactShown: false, finalizing: false };
  local.golf = { holeIndex: null, subPhase: "ready", phaseStart: null, power: null, lastShot: null };
  local.golfBallAnim = {};
  local.golfAnim = { key: null, revealed: false };
  local.practice = { subPhase: "ready", phaseStart: null, power: null, lastQuality: null };
}

async function ensureDevBotIfNeeded() {
  const needed = DEV_TARGET_PLAYER_COUNT - players.length;
  if (needed <= 0) return;
  const existingBotCount = players.filter((p) => isDevBot(p)).length;
  const inserts = [];
  for (let i = 0; i < needed; i++) {
    inserts.push({ id: crypto.randomUUID(), room_code: room.code, name: `${DEV_BOT_PREFIX}Bot ${existingBotCount + i + 1}`, is_host: false });
  }
  await sb.from("players").insert(inserts);
  await loadPlayers();
}

async function devJump(status) {
  resetLocalGameState();
  let game_state = {};
  if (status === "missing-club") game_state = { order: randomMissingClubOrder(), qIndex: 0, revealed: false };
  if (status === "guess") game_state = { order: randomGuessOrder(), pIndex: 0, clueIndex: 0 };
  if (status === "shootout-intro") await ensureDevBotIfNeeded();
  if (status === "round-robin") {
    await ensureDevBotIfNeeded();
    game_state = { roundRobin: { matches: generateRoundRobinMatches(players.map((p) => p.id)) } };
  }
  // Dev bots are safe here (unlike the old turn-based design) — they just
  // never submit a shot, which no longer blocks anyone since the host can
  // advance holes without waiting on every player.
  if (status === "golf-intro") await ensureDevBotIfNeeded();
  if (status === "golf-practice") {
    await ensureDevBotIfNeeded();
    game_state = { golfPractice: { swings: {} } };
  }
  if (status === "golf") {
    await ensureDevBotIfNeeded();
    game_state = { golf: { holeIndex: 0, results: {}, balls: golfBallsAtTee(GOLF_HOLES[0]) } };
  }
  await updateRoom({ status, game_state });
}

// Plays a short animated replay whenever a new kick lands in match.log —
// every connected client (both players and spectators) detects the same
// new log entry via the realtime subscription and plays the same replay
// independently, so the room shares roughly the same moment without
// needing any extra server-side orchestration.
const SHOOTOUT_KICK_MS = 1200;
const SHOOTOUT_RESULT_MS = 1700;

function ensureShootoutAnim() {
  const match = room.game_state?.match;
  if (!match) return;
  const matchKey = `${match.p1}-${match.p2}-${match.rrIndex}`;
  if (local.shootoutAnim.matchKey !== matchKey) {
    local.shootoutAnim = { matchKey, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, impactShown: false, finalizing: false };
  }
  if (match.log.length > local.shootoutAnim.lastLogLength && !local.shootoutAnim.phase) {
    local.shootoutAnim.lastLogLength = match.log.length;
    local.shootoutAnim.entry = match.log[match.log.length - 1];
    local.shootoutAnim.phase = "kicking";
    local.shootoutAnim.kickAnimTriggered = false;
    local.shootoutAnim.impactShown = false;
    setTimeout(() => {
      local.shootoutAnim.phase = "result";
      render();
      setTimeout(() => {
        local.shootoutAnim.phase = null;
        render();
        if (match.winnerId) finalizeMatchIfDecided();
      }, SHOOTOUT_RESULT_MS);
    }, SHOOTOUT_KICK_MS);
  }
}

const PK_BALL_START = { x: 50, y: 126 };
const PK_KEEPER_START = { x: 50, y: 69 };

function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

// Flies the ball along a quadratic bezier arc (instead of a straight CSS
// slide) — a control point lifted above the midpoint gives it a proper
// curved trajectory, plus a shrink (depth) and a full-blooded spin as it
// travels. Driven by requestAnimationFrame rather than a CSS transition so
// the curve and spin can be computed per-kick.
function animateBallFlight(ball, start, end, durationMs) {
  const control = { x: (start.x + end.x) / 2 + (Math.random() * 14 - 7), y: Math.min(start.y, end.y) - 36 };
  const spinDeg = (Math.random() < 0.5 ? -1 : 1) * (600 + Math.random() * 260);
  const t0 = performance.now();
  function frame(now) {
    const raw = Math.min(1, (now - t0) / durationMs);
    const t = easeOutQuad(raw);
    const u = 1 - t;
    const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
    const y = u * u * start.y + 2 * u * t * control.y + t * t * end.y;
    const scale = 1 - 0.3 * t;
    ball.style.left = x + "%";
    ball.style.top = y + "%";
    ball.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${spinDeg * t}deg)`;
    if (raw < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// The keeper dives in a straight line (real keepers don't arc), but leans
// into the direction of the dive for a bit of weight — no lean for a
// straight-down center save.
function animateKeeperDive(keeper, start, end, durationMs) {
  const dir = end.x - start.x;
  const tiltMax = dir === 0 ? 0 : dir > 0 ? 24 : -24;
  const t0 = performance.now();
  function frame(now) {
    const raw = Math.min(1, (now - t0) / durationMs);
    const t = easeOutQuad(raw);
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    keeper.style.left = x + "%";
    keeper.style.top = y + "%";
    keeper.style.transform = `translate(-50%, -50%) rotate(${tiltMax * t}deg)`;
    if (raw < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function triggerShotAnimation(entry) {
  const ball = document.getElementById("pk-ball");
  const keeper = document.getElementById("pk-keeper");
  if (!ball || !keeper) return;
  const shooterPos = ZONE_POS[entry.shooterPick];
  const keeperPos = ZONE_POS[entry.keeperPick];
  if (prefersReducedMotion()) {
    ball.style.left = shooterPos.x + "%";
    ball.style.top = shooterPos.y + "%";
    keeper.style.left = keeperPos.x + "%";
    keeper.style.top = keeperPos.y + "%";
    return;
  }
  requestAnimationFrame(() => {
    animateBallFlight(ball, PK_BALL_START, shooterPos, SHOOTOUT_KICK_MS);
    animateKeeperDive(keeper, PK_KEEPER_START, keeperPos, SHOOTOUT_KICK_MS);
  });
}

const PK_AD_TEXT = "Fantasy League Bugaloo";

// A scatter of individually-colored "heads" reads as an actual crowd —
// a repeating CSS pattern is too mechanically regular and just looks like
// static/lines. Generated once at load (not per-render, or it'd visibly
// reshuffle on every re-render) and reused as a fixed HTML string.
function generateCrowdDots() {
  // Two rival ends, red vs blue — a couple of shades of each for a little
  // depth without muddying the two-team read.
  const colors = ["#ef476f", "#c94f4f", "#4b8bf0", "#2f5fc4"];
  const rows = 8;
  const perRow = 25;
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < perRow; i++) {
      const left = Math.min(99, Math.max(1, (i / perRow) * 100 + (Math.random() - 0.5) * (100 / perRow) * 0.9)).toFixed(1);
      const top = Math.min(96, Math.max(4, (r / rows) * 100 + (Math.random() - 0.5) * (100 / rows) * 0.85)).toFixed(1);
      const size = (2.6 + Math.random() * 2.2).toFixed(1);
      const color = colors[Math.floor(Math.random() * colors.length)];
      out += `<span style="left:${left}%;top:${top}%;width:${size}px;height:${size}px;background:${color};"></span>`;
    }
  }
  return out;
}
const PK_CROWD_HTML = generateCrowdDots();

function renderPkGoal(entry, animate) {
  const ballPos = animate ? PK_BALL_START : ZONE_POS[entry.shooterPick];
  const keeperPos = animate ? PK_KEEPER_START : ZONE_POS[entry.keeperPick];
  if (animate) setTimeout(() => triggerShotAnimation(entry), 180);
  return `
    <div class="pk-goal">
      <div class="pk-crowd">${PK_CROWD_HTML}</div>
      <div class="pk-adboard">${Array(3).fill(`<span>${escapeHtml(PK_AD_TEXT)}</span>`).join("")}</div>
      <div class="pk-goal-frame"></div>
      <div id="pk-keeper" class="pk-keeper" style="left:${keeperPos.x}%; top:${keeperPos.y}%;">🧤</div>
      <div id="pk-ball" class="pk-ball" style="left:${ballPos.x}%; top:${ballPos.y}%;">⚽</div>
    </div>`;
}

// While solo-testing in dev mode, auto-play any bot's turn a beat after
// it comes up. With multiple bots (a full-size test group), a given
// match might be bot-vs-bot with no human in it at all — so shooter and
// keeper are checked and scheduled independently, not either/or.
function ensureBotAutoPick() {
  if (!DEV_MODE) return;
  const match = room.game_state?.match;
  if (!match || match.winnerId) return;
  const shooterId = match.turn === "p1" ? match.p1 : match.p2;
  const keeperId = match.turn === "p1" ? match.p2 : match.p1;
  const shooterIsBot = isDevBot(players.find((p) => p.id === shooterId));
  const keeperIsBot = isDevBot(players.find((p) => p.id === keeperId));
  // A bot-vs-bot match has no human actively playing it — slow those picks
  // down more so it still reads as a real contest to spectate, not a
  // instant-resolving formality.
  const slowMode = shooterIsBot && keeperIsBot;
  scheduleBotPick(match, "shooter", shooterIsBot && match.shooterPick === null, slowMode);
  scheduleBotPick(match, "keeper", keeperIsBot && match.keeperPick === null, slowMode);
}

function scheduleBotPick(match, role, shouldPick, slowMode) {
  const flagKey = role === "shooter" ? "botShooterScheduledFor" : "botKeeperScheduledFor";
  if (!shouldPick) {
    local[flagKey] = null;
    return;
  }
  const pickKey = `${match.roundIndex}-${match.turn}-${role}`;
  if (local[flagKey] === pickKey) return;
  local[flagKey] = pickKey;
  const [min, range] = slowMode ? [1400, 1800] : [900, 1000];
  setTimeout(() => {
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)];
    submitPick(role, zone);
  }, min + Math.random() * range);
}

async function devQuickStart(status) {
  if (!room) {
    const name = (document.getElementById("name-input")?.value || "").trim() || "Dev Tester";
    await createRoomAs(name);
  }
  await devJump(status);
}

// ── render ──────────────────────────────────────────────────
// Wraps the real render logic so a bad/stale room state (e.g. a
// game_state shape left over from a previous version of the app, or any
// other unexpected render-time error) can never leave the page stuck on
// the static "Loading…" placeholder forever with no way out — instead it
// falls back to a recovery screen that clears the broken session.
function render() {
  try {
    renderInner();
  } catch (err) {
    console.error("Render failed — resetting session.", err);
    clearSession();
    room = null;
    players = [];
    scores = [];
    if (channel) {
      sb?.removeChannel(channel);
      channel = null;
    }
    APP_EL.innerHTML = `${renderHome()}<p class="error" style="margin-top:12px">Something went wrong loading your last session, so it's been reset — sorry! Try creating or joining a room again.</p>`;
  }
}

function renderInner() {
  if (!sb) {
    APP_EL.innerHTML = renderSetupNeeded();
    return;
  }
  if (!room) {
    APP_EL.innerHTML = renderHome();
    return;
  }

  // Confetti pieces are appended straight to <body> (see spawnConfetti),
  // outside the #app subtree this function replaces on every render — so
  // navigating away from the reveal screen (e.g. jumping back to Missing
  // Club mid-testing) wouldn't otherwise clear ones still mid-fall.
  if (room.status !== "reveal") clearConfetti();

  let html = renderTopBar();
  switch (room.status) {
    case "lobby":
      html += renderLobby();
      break;
    case "party-intro":
      html += renderPartyIntro();
      break;
    case "missing-club-intro":
      html += renderMissingClubIntro();
      break;
    case "missing-club":
      ensureMissingClubReady();
      html += renderMissingClub();
      break;
    case "guess-intro":
      html += renderGuessIntro();
      break;
    case "guess":
      ensureGuessReady();
      html += renderGuess();
      break;
    case "leaderboard":
      html += renderLeaderboard("the quiz", "show-shootout-intro", "⚽ Continue to Penalty Shootout →");
      break;
    case "shootout-intro":
      html += renderShootoutIntro();
      break;
    case "round-robin":
      html += renderRoundRobin();
      break;
    case "shootout":
      ensureShootoutAnim();
      ensureBotAutoPick();
      html += renderShootout();
      break;
    case "final-leaderboard":
      html += renderLeaderboard("the shootout", "show-golf-intro", "⛳ Continue to Football Golf →");
      break;
    case "golf-intro":
      html += renderGolfIntro();
      break;
    case "golf-practice":
      html += renderGolfPractice();
      break;
    case "golf":
      ensureGolfReady();
      ensureGolfAnim();
      html += renderGolf();
      break;
    case "golf-leaderboard":
      html += renderLeaderboard("the golf course", "reveal", "🏆 Reveal Draft Order!");
      break;
    case "reveal":
      html += renderReveal();
      break;
    default:
      html += `<p>Unknown state.</p>`;
  }
  APP_EL.innerHTML = html;
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
    </div>
    ${DEV_MODE && isMeHost() ? renderDevBar() : ""}`;
}

function renderDevBar() {
  const stages = [
    ["lobby", "Lobby"],
    ["party-intro", "Party Intro"],
    ["missing-club-intro", "MC Intro"],
    ["missing-club", "Missing Club"],
    ["guess-intro", "Guess Intro"],
    ["guess", "Guess"],
    ["leaderboard", "Leaderboard"],
    ["shootout-intro", "PK Intro"],
    ["round-robin", "Round Robin"],
    ["final-leaderboard", "Final LB"],
    ["golf-intro", "Golf Intro"],
    ["golf-practice", "Golf Practice"],
    ["golf", "Golf"],
    ["golf-leaderboard", "Golf LB"],
    ["reveal", "Reveal"],
  ];
  return `
    <div class="dev-bar">
      <span class="dev-label">🔧 dev</span>
      ${stages
        .map(
          ([status, label]) =>
            `<button class="dev-chip${room?.status === status ? " active" : ""}" data-action="dev-jump" data-status="${status}">${label}</button>`
        )
        .join("")}
    </div>`;
}

function renderHome() {
  return `
    <div class="card hero">
      <h1>🏆 Fantasy League Bugaloo</h1>
      <p class="sub">Guess the missing club, guess the footballer, and penalty kicks — rounds to decide who drafts first.</p>
      ${local.error ? `<p class="error">${escapeHtml(local.error)}</p>` : ""}
      <label class="field">
        <span>Your name</span>
        <input id="name-input" type="text" placeholder="e.g. Craig" maxlength="24" value="${escapeHtml(local.nameInput)}" />
      </label>

      <label class="field">
        <span>Room code</span>
        <input id="code-input" class="code-input" type="text" placeholder="e.g. QK7T" maxlength="4"
          value="${escapeHtml(local.joinCodeInput)}" autocapitalize="characters" autocomplete="off"
          autocorrect="off" spellcheck="false" inputmode="text" />
      </label>
      <button class="btn" data-action="join-room">Join room</button>

      <div class="divider">or</div>
      <button class="btn primary" data-action="create-room">Create a new room</button>
    </div>
    ${DEV_MODE ? renderDevQuickStart() : ""}`;
}

function renderDevQuickStart() {
  return `
    <div class="dev-panel">
      <p class="dev-label">🔧 Dev preview — only visible with ?dev=1 in the URL</p>
      <p class="sub">Jump straight into a game to test it solo. Creates a throwaway room if you don't have one open yet.</p>
      <div class="dev-grid">
        <button class="dev-btn" data-action="dev-quickstart" data-status="missing-club">⚽ Guess the Missing Club</button>
        <button class="dev-btn" data-action="dev-quickstart" data-status="guess">🕵️ Guess the Footballer</button>
        <button class="dev-btn" data-action="dev-quickstart" data-status="round-robin">⚽ PK Round Robin</button>
        <button class="dev-btn" data-action="dev-quickstart" data-status="reveal">🏆 Reveal</button>
      </div>
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
        ${players.map((p) => `<li>${p.id === me?.id && p.is_host ? "👑 " : ""}${escapeHtml(p.name)}</li>`).join("")}
      </ul>

      ${
        isHost
          ? `<button class="btn primary" data-action="show-party-intro" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>
              ${players.length < 2 && !DEV_MODE ? "Need at least 2 players" : "▶️ Start the party!"}
            </button>`
          : `<p class="waiting">Waiting for the host to start…</p>`
      }
    </div>`;
}

function renderPartyIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>🏆 Fantasy League Bugaloo</h2>
      <p class="sub">Here's how tonight decides the draft order.</p>

      <h3>The idea</h3>
      <p>Everyone plays through the same rounds. Every round scores points, and your <b>combined score across all of them</b> becomes your draft position — most points drafts first. Each round gets its own quick explainer screen right before it starts, so you'll never be thrown in blind.</p>

      <h3>The rounds</h3>
      <ol class="party-round-list">
        <li><b>⚽ Guess the Missing Club</b> — a real footballer's club career shown as a timeline with one club redacted. Answer in your own time; the host reveals the correct club (and how many got it) to everyone at once.</li>
        <li><b>🕵️ Guess the Footballer</b> — a mystery player revealed one clue at a time, most obscure clue first. Guess earlier for more points, but guess wrong and you're frozen out for that round.</li>
        <li><b>🥅 Penalty Shootout</b> — a round-robin of 1v1 shootouts, everyone plays everyone once. Blind, simultaneous shot/dive picks; final standing adds placement points to the leaderboard.</li>
        <li><b>⛳ Football Golf</b> — real stroke play over a 3-hole course. Tee off, then keep swinging (power + aim taps) from wherever you land until it's holed — fewer strokes scores more (eagle down to a bogey). Final total placement adds points too.</li>
      </ol>
      <p>You'll see a running leaderboard after each round, and the big reveal at the very end turns the final combined score into the draft order.</p>

      <h3>🎤 A couple of things worth saying out loud</h3>
      <ul>
        <li><b>Fairness:</b> the host didn't write tonight's Missing Club and Guess the Footballer content from memory — it was freshly generated for tonight, with nothing carried over from anything the host had already seen. The host is guessing blind right along with everyone else.</li>
        <li><b>It's a new build:</b> this whole app came together in just a few days, so there'll probably be a bug or two — bear with it, and just flag anything weird.</li>
        <li><b>Host has no special powers:</b> starting rounds, revealing answers, and moving things along is all the host does — the actual questions, clue order, and shootout/golf outcomes aren't something the host controls or has advance knowledge of.</li>
        <li>At the end of the day it's just deciding draft order — have fun with it.</li>
      </ul>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${
        isHost
          ? `<button class="btn primary" data-action="show-missing-club-intro">▶️ Continue</button>`
          : `<p class="waiting">Waiting for host to continue…</p>`
      }
    </div>`;
}

function renderMissingClubIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>⚽ Guess the Missing Club</h2>

      <h3>The format</h3>
      <p>${MISSING_CLUB_COUNT} rounds, each a real footballer's club career shown as a timeline — with one club blanked out.</p>

      <h3>How it works</h3>
      <p>Tap the club you think is missing, then hit Confirm to lock it in — no rush, answer whenever you're ready. A side panel shows who's still deciding. Once everyone's locked in, the host reveals the correct club and how many people got it right, to everyone at once.</p>

      <h3>Scoring</h3>
      <p>Guess right and you score a flat <b>${MISSING_CLUB_POINTS} points</b> — get it wrong, or don't answer before the reveal, and it's 0. No bonus for speed, no penalty for taking your time.</p>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${
        isHost
          ? `<button class="btn primary" data-action="start-missing-club" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>▶️ Start Guess the Missing Club</button>`
          : `<p class="waiting">Waiting for host to start…</p>`
      }
    </div>`;
}

function renderMissingClub() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const qIndex = gs.qIndex ?? 0;
  const entry = window.MISSING_CLUB_PLAYERS[gs.order[qIndex]];
  const missingClub = entry.clubs[entry.missingIndex];
  const answered = local.missingClub.answeredQIndex === qIndex;
  const pending = local.missingClub.pending;
  const revealed = !!gs.revealed;
  const myCorrect = local.missingClub.myChoice === missingClub;
  const answeredIds = answeredPlayerIds(1, qIndex);
  const correctIds = revealed ? correctPlayerIds(1, qIndex) : null;
  return `
    <div class="card">
      <h2>⚽ Guess the Missing Club</h2>
      <p class="sub">Journey ${qIndex + 1} of ${gs.order.length} — answer in your own time, the reveal happens once the host calls it</p>
      <div class="side-layout">
        <div class="side-main">
          <p class="question">${escapeHtml(entry.name)}'s career:</p>
          <ol class="club-timeline">
            ${entry.clubs
              .map((c, i) => (i === entry.missingIndex ? `<li class="missing-slot">❓ ???</li>` : `<li>${escapeHtml(c)}</li>`))
              .join("")}
          </ol>
          <div class="choices">
            ${(local.missingClub.choices || [])
              .map((c) => {
                let cls = "choice";
                if (revealed) {
                  if (c === missingClub) cls += " correct";
                  else if (c === local.missingClub.myChoice) cls += " wrong";
                } else if (answered) {
                  if (c === local.missingClub.myChoice) cls += " selected";
                } else if (c === pending) {
                  cls += " pending";
                }
                return `<button class="${cls}" data-action="missing-club-select" data-club="${escapeHtml(c)}" ${answered ? "disabled" : ""}>${escapeHtml(c)}</button>`;
              })
              .join("")}
          </div>
          ${
            !revealed && !answered
              ? `<button class="btn primary" data-action="missing-club-confirm" ${pending ? "" : "disabled"}>✅ Confirm answer</button>`
              : ""
          }
          ${
            revealed
              ? `<p class="lock-msg ${answered && myCorrect ? "lock-correct" : "lock-wrong"}">The missing club was <b>${escapeHtml(missingClub)}</b> — ${answered ? (myCorrect ? `you got it! ${MISSING_CLUB_POINTS} points.` : "you didn't get it. 0 points.") : "you didn't answer before the reveal. 0 points."} ${correctIds.size}/${players.length} got it right.</p>`
              : answered
                ? `<p class="waiting">Answer locked in. ${isHost ? "" : "Waiting for the reveal…"}</p>`
                : ""
          }
        </div>
        <div class="side-roster">
          <h3>Locked in (${answeredIds.size}/${players.length})</h3>
          <ul class="player-list compact">
            ${players.map((p) => `<li>${answeredIds.has(p.id) ? "🔒" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${
        isHost
          ? revealed
            ? `<button class="btn primary" data-action="missing-club-next">${qIndex + 1 >= gs.order.length ? "🕵️ Next: Guess the Footballer" : "Next journey"}</button>`
            : `<button class="btn primary" data-action="reveal-missing-club">🔍 Reveal answer</button>`
          : ""
      }
    </div>`;
}

function renderGuessIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>🕵️ Guess the Footballer</h2>

      <h3>The format</h3>
      <p>${GUESS_PLAYER_COUNT} rounds, each a mystery footballer revealed one clue at a time — clues run from most obscure to most obvious.</p>

      <h3>How it works</h3>
      <p>Host reveals clues one at a time. Guess whenever you like — you don't have to wait for the last clue. Get it right and you're locked in for the round; get it wrong and you're frozen out (0 points), so only guess when you're confident.</p>

      <h3>Scoring — guess earlier for more points</h3>
      <div class="standings-wrap">
        <table class="standings-table">
          <thead><tr><th>Guessed on clue</th><th>Points</th></tr></thead>
          <tbody>
            ${GUESS_CLUE_POINTS.map((pts, i) => `<tr><td>${i + 1}</td><td>${pts}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${
        isHost
          ? `<button class="btn primary" data-action="start-guess-round" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>▶️ Start Guess the Footballer</button>`
          : `<p class="waiting">Waiting for host to start…</p>`
      }
    </div>`;
}

function renderGuess() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const pIndex = gs.pIndex ?? 0;
  const clueIndex = gs.clueIndex ?? 0;
  const entry = window.GUESS_PLAYERS[gs.order[pIndex]];
  const answered = local.guess.answeredPIndex === pIndex;
  const myCorrect = answered && local.guess.myChoice === entry.name;
  const cluesShown = entry.clues.slice(0, clueIndex + 1);
  const isLastClue = clueIndex >= entry.clues.length - 1;
  const isLastPlayer = pIndex + 1 >= gs.order.length;
  const answeredIds = answeredPlayerIds(2, pIndex);
  return `
    <div class="card">
      <h2>🕵️ Guess the Footballer</h2>
      <p class="sub">Player ${pIndex + 1} of ${gs.order.length} — guess earlier for more points</p>
      <div class="side-layout">
        <div class="side-main">
          <ol class="clue-list">
            ${cluesShown.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}
          </ol>
          <div class="choices">
            ${local.guess.choices
              .map((name) => {
                let cls = "choice";
                if (answered) {
                  if (name === entry.name) cls += " correct";
                  else if (name === local.guess.myChoice) cls += " wrong";
                }
                return `<button class="${cls}" data-action="guess-answer" data-name="${escapeHtml(name)}" ${answered ? "disabled" : ""}>${escapeHtml(name)}</button>`;
              })
              .join("")}
          </div>
          ${
            answered
              ? myCorrect
                ? `<p class="lock-msg lock-correct">🔒 Locked in — correct! ${GUESS_CLUE_POINTS[local.guess.answeredClueIndex]} points.</p>`
                : `<p class="lock-msg lock-wrong">🥶 Wrong — you're frozen out for this one. 0 points.</p>`
              : ""
          }
          ${answered && !isHost ? `<p class="waiting">Waiting for host to continue…</p>` : ""}
        </div>
        <div class="side-roster">
          <h3>Guessed (${answeredIds.size}/${players.length})</h3>
          <ul class="player-list compact">
            ${players.map((p) => `<li>${answeredIds.has(p.id) ? "✅" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${
        isHost
          ? `<div class="guess-host-controls">
              ${!isLastClue ? `<button class="btn" data-action="guess-reveal-clue">Reveal next clue</button>` : ""}
              <button class="btn primary" data-action="guess-next">${isLastPlayer ? "Show leaderboard" : "Next player"}</button>
            </div>`
          : ""
      }
    </div>`;
}

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${suffix}`;
}

function renderShootoutIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const n = players.length;
  const matchCount = (n * (n - 1)) / 2;
  const pointsRows = Array.from({ length: n }, (_, i) => ({ place: i + 1, points: placementPoints(i, n) }));
  return `
    <div class="card">
      <h2>⚽ Penalty Shootout</h2>

      <h3>The format</h3>
      <p>Round robin: every player faces every other player exactly once — ${matchCount} matches for ${n} players. No brackets, no eliminations, no one sits out.</p>

      <h3>How a match works</h3>
      <p>Best-of-5 shootout: shooter picks a side, keeper picks a side to dive, both blind. Guess wrong and it's a goal. Still level after 5? Sudden death until someone blinks.</p>

      <h3>How standings are decided</h3>
      <p>After every match, players are ranked by:</p>
      <ol>
        <li><b>Most wins</b></li>
        <li>Tied on wins? <b>Best goal difference</b> (kicks scored minus kicks conceded, across all their matches)</li>
        <li>Still tied? <b>Head-to-head results</b></li>
      </ol>

      <h3>Points on offer</h3>
      <div class="standings-wrap">
        <table class="standings-table">
          <thead><tr><th>Place</th><th>Points</th></tr></thead>
          <tbody>
            ${pointsRows.map((r) => `<tr><td>${ordinal(r.place)}</td><td>${r.points}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${
        isHost
          ? `<button class="btn primary" data-action="start-round-robin" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>🏁 Start Round Robin</button>`
          : `<p class="waiting">Waiting for host to start the round robin…</p>`
      }
    </div>`;
}

function renderStandingsTable(standings) {
  return `
    <div class="standings-wrap">
      <table class="standings-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>W</th><th>L</th><th>GF</th><th>GA</th><th>GD</th></tr>
        </thead>
        <tbody>
          ${standings
            .map(
              (s, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(s.player.name)}</td>
              <td>${s.wins}</td>
              <td>${s.losses}</td>
              <td>${s.gf}</td>
              <td>${s.ga}</td>
              <td>${s.gd > 0 ? "+" : ""}${s.gd}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderRoundRobin() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const matches = room.game_state.roundRobin.matches;
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const standings = computeStandings(matches, players);
  const played = matches.filter((m) => m.winner).length;
  const nextIndex = findNextRRMatch(matches);
  return `
    <div class="card">
      <h2>🏁 Standings</h2>
      <p class="sub">${played} of ${matches.length} matches played</p>
      ${renderStandingsTable(standings)}
      <h3>Matches</h3>
      <ul class="rr-match-list">
        ${matches
          .map((m, i) => {
            const decided = !!m.winner;
            const isNext = i === nextIndex;
            const scoreText = decided ? `${m.score[m.p1]}–${m.score[m.p2]}` : "vs";
            return `
            <li class="rr-match${decided ? " decided" : ""}${isNext ? " next" : ""}">
              <span class="rr-match-p ${decided && m.winner === m.p1 ? "winner" : ""}">${escapeHtml(nameOf(m.p1))}</span>
              <span class="rr-match-score">${scoreText}</span>
              <span class="rr-match-p ${decided && m.winner === m.p2 ? "winner" : ""}">${escapeHtml(nameOf(m.p2))}</span>
            </li>`;
          })
          .join("")}
      </ul>
      ${
        isHost
          ? nextIndex >= 0
            ? `<button class="btn primary" data-action="start-rr-match" data-i="${nextIndex}">▶️ ${escapeHtml(nameOf(matches[nextIndex].p1))} vs ${escapeHtml(nameOf(matches[nextIndex].p2))}</button>`
            : `<button class="btn primary" data-action="finish-round-robin">🏆 Show final leaderboard</button>`
          : `<p class="waiting">Waiting for host…</p>`
      }
    </div>`;
}

const ZONES = ["L", "C", "R"];
const ZONE_LABEL = { L: "⬅ Left", C: "⬆ Center", R: "➡ Right" };
const ZONE_POS = {
  L: { x: 20, y: 66 },
  C: { x: 50, y: 58 },
  R: { x: 80, y: 66 },
};

function renderPkScoreboard(match) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const row = (playerId) => {
    const kicks = match.log.filter((k) => k.shooter === playerId);
    const slots = Math.max(5, kicks.length);
    let circles = "";
    for (let i = 0; i < slots; i++) {
      const kick = kicks[i];
      const cls = kick ? (kick.scored ? "scored" : "missed") : "pending";
      circles += `<span class="pk-circle ${cls}"></span>`;
    }
    return `
      <div class="pk-team">
        <div class="pk-team-row">
          <span class="pk-team-name">${escapeHtml(nameOf(playerId))}</span>
          <span class="pk-team-score">${match.score[playerId] || 0}</span>
        </div>
        <div class="pk-circles">${circles}</div>
      </div>`;
  };
  return `<div class="pk-scoreboard">${row(match.p1)}${row(match.p2)}</div>`;
}

function renderShootout() {
  const me = myPlayer();
  const match = room.game_state.match;
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const roundLabel = match.roundIndex >= 5 ? "Sudden death" : `Round ${match.roundIndex + 1} of 5`;
  const anim = local.shootoutAnim;

  // A kick just landed — play the animated replay instead of the normal
  // controls, regardless of whose turn it already is underneath.
  if (anim.phase) {
    const entry = anim.entry;
    // Only actually kick off the flight animation once per kick — a
    // redundant re-render mid-flight (e.g. the realtime echo of our own DB
    // write landing a beat later) must not replay it from the start position.
    const doAnimate = anim.phase === "kicking" && !anim.kickAnimTriggered;
    if (doAnimate) anim.kickAnimTriggered = true;
    // Same idea for the goal/save impact effects (shake, flash, confetti) —
    // they should fire exactly once when the result first appears, not on
    // every redundant re-render during the ~1.3s the result stays on screen.
    const showImpact = anim.phase === "result" && !anim.impactShown;
    if (anim.phase === "result") anim.impactShown = true;
    const impactClass = showImpact ? (entry.scored ? " pk-impact-goal" : " pk-impact-save") : "";
    return `
      <div class="card${impactClass}">
        <h2>⚽ ${escapeHtml(nameOf(match.p1))} vs ${escapeHtml(nameOf(match.p2))}</h2>
        <p class="sub">${roundLabel}</p>
        ${renderPkScoreboard(match)}
        ${renderPkGoal(entry, doAnimate)}
        ${
          anim.phase === "result"
            ? `<p class="kick-result ${entry.scored ? "goal" : "save"}${showImpact ? " pk-result-pop" : ""}">${entry.scored ? "⚽ GOAL!" : "🧤 SAVED!"} — ${escapeHtml(nameOf(entry.shooter))} shot ${ZONE_LABEL[entry.shooterPick]}, ${escapeHtml(nameOf(entry.keeper))} dove ${ZONE_LABEL[entry.keeperPick]}</p>`
            : `<p class="sub" style="text-align:center">${escapeHtml(nameOf(entry.shooter))} steps up…</p>`
        }
      </div>
      ${showImpact && entry.scored ? `<div class="pk-flash"></div>` : ""}`;
  }

  // Decided but not yet finalized into the standings (a brief gap right
  // after the last kick's replay finishes) — avoid flashing the next
  // shooter/keeper prompt for a match that's already over.
  if (match.winnerId) {
    return `
      <div class="card">
        <h2>⚽ ${escapeHtml(nameOf(match.p1))} vs ${escapeHtml(nameOf(match.p2))}</h2>
        ${renderPkScoreboard(match)}
        <p class="waiting">Match complete — updating standings…</p>
      </div>`;
  }

  const shooterId = match.turn === "p1" ? match.p1 : match.p2;
  const keeperId = match.turn === "p1" ? match.p2 : match.p1;
  const iAmShooter = me?.id === shooterId;
  const iAmKeeper = me?.id === keeperId;

  let actionArea;
  if (iAmShooter && match.shooterPick === null) {
    actionArea = `
      <div class="role-banner role-shoot">
        <span class="role-icon">🎯</span>
        <span class="role-text">YOUR SHOT<br><small>Pick your target</small></span>
      </div>
      <div class="zone-grid zone-shoot">${ZONES.map((z) => `<button class="zone-btn shoot" data-action="pick-shooter" data-zone="${z}">${ZONE_LABEL[z]}</button>`).join("")}</div>`;
  } else if (iAmKeeper && match.keeperPick === null) {
    actionArea = `
      <div class="role-banner role-keep">
        <span class="role-icon">🧤</span>
        <span class="role-text">YOU'RE IN GOAL<br><small>Pick where to dive</small></span>
      </div>
      <div class="zone-grid zone-keep">${ZONES.map((z) => `<button class="zone-btn keep" data-action="pick-keeper" data-zone="${z}">${ZONE_LABEL[z]}</button>`).join("")}</div>`;
  } else if (iAmShooter || iAmKeeper) {
    actionArea = `
      <div class="role-banner ${iAmShooter ? "role-shoot" : "role-keep"} locked">
        <span class="role-icon">${iAmShooter ? "🎯" : "🧤"}</span>
        <span class="role-text">LOCKED IN<br><small>Waiting on ${escapeHtml(iAmShooter ? nameOf(keeperId) : nameOf(shooterId))}…</small></span>
      </div>`;
  } else {
    actionArea = `<p class="waiting">${escapeHtml(nameOf(shooterId))} is shooting, ${escapeHtml(nameOf(keeperId))} is in goal…</p>`;
  }

  return `
    <div class="card">
      <h2>⚽ ${escapeHtml(nameOf(match.p1))} vs ${escapeHtml(nameOf(match.p2))}</h2>
      <p class="sub">${roundLabel}</p>
      ${renderPkScoreboard(match)}
      ${actionArea}
    </div>`;
}

function renderGolfIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>⛳ Football Golf</h2>

      <h3>The format</h3>
      <p>A fixed ${GOLF_HOLES.length}-hole course, played as real stroke play on an actual top-down course — everyone's ball is visible on a shared map, moving as each shot lands. Everyone plays the <b>same hole at the same time</b>, each on their own device, own pace — like Guess the Missing Club. Tee off, watch where it lands, then keep swinging from there until the ball's holed. Fewer strokes is better, same as real golf.</p>

      <h3>How a shot works</h3>
      <p>Two taps per swing. First, a power meter sweeps back and forth — tap to lock it wherever it's sitting, which controls distance. Then an aim meter does the same, controlling direction — dead-center flies straight at the pin, off-center curves the shot left or right. Both meters are always centered on the same spot each time — the closer to dead-center, the better the shot. A mishit still crawls forward a bit off-line, so you're never fully stuck, just taking more strokes to get there.</p>

      <h3>Scoring — strokes vs. par</h3>
      <div class="standings-wrap">
        <table class="standings-table">
          <thead><tr><th>Result</th><th>Points</th></tr></thead>
          <tbody>
            <tr><td>${GOLF_TERM_LABEL.eagle}</td><td>${GOLF_TERM_POINTS.eagle}</td></tr>
            <tr><td>${GOLF_TERM_LABEL.birdie}</td><td>${GOLF_TERM_POINTS.birdie}</td></tr>
            <tr><td>${GOLF_TERM_LABEL.par}</td><td>${GOLF_TERM_POINTS.par}</td></tr>
            <tr><td>${GOLF_TERM_LABEL.bogey}</td><td>${GOLF_TERM_POINTS.bogey}</td></tr>
            <tr><td>${GOLF_TERM_LABEL["double-bogey"]}</td><td>${GOLF_TERM_POINTS["double-bogey"]}</td></tr>
            <tr><td>${GOLF_TERM_LABEL["triple-plus"]}</td><td>${GOLF_TERM_POINTS["triple-plus"]}</td></tr>
          </tbody>
        </table>
      </div>
      <p>Each hole has a par (${GOLF_HOLES.map((h) => `${escapeHtml(h.name)}: Par ${h.par}`).join(", ")}) — a hole that's dragging on forcibly wraps up after ${GOLF_MERCY_STROKES} strokes over par, so nobody's stuck forever. Host moves the group to the next hole whenever ready — no need to wait for stragglers. Once all ${GOLF_HOLES.length} holes are done, total points decide final standing, which adds placement points to the combined leaderboard — same system as the penalty shootout.</p>

      <h3>Players (${players.length})</h3>
      <ul class="player-list">
        ${players.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${
        isHost
          ? `<div class="guess-host-controls">
              <button class="btn" data-action="show-golf-practice">🏌️ Practice Range first</button>
              <button class="btn primary" data-action="start-golf" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>⛳ Start Football Golf</button>
            </div>`
          : `<p class="waiting">Waiting for host to start…</p>`
      }
    </div>`;
}

function renderGolfPractice() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state.golfPractice || { swings: {} };

  let swingUi;
  if (local.practice.subPhase === "power" || local.practice.subPhase === "aim") {
    const label = local.practice.subPhase === "power" ? "Tap when the power looks right." : "Now tap to set your aim.";
    const action = local.practice.subPhase === "power" ? "practice-lock-power" : "practice-lock-aim";
    const btnLabel = local.practice.subPhase === "power" ? "🏌️ Swing!" : "🎯 Strike!";
    swingUi = `
      <div class="golf-hole-card">
        <p class="sub">${label}</p>
        <div class="golf-meter">
          <div class="golf-meter-track"><div class="golf-meter-marker golf-sweep"></div></div>
        </div>
        <button class="btn primary" data-action="${action}">${btnLabel}</button>
      </div>`;
  } else {
    swingUi = `
      <div class="golf-hole-card">
        ${
          local.practice.subPhase === "recap"
            ? `<p class="sub">${practiceQualityLabel(local.practice.lastQuality)}</p>`
            : `<p class="sub">No pressure — swing as many times as you like.</p>`
        }
        <button class="btn primary" data-action="practice-begin-swing">🏌️ ${local.practice.subPhase === "recap" ? "Swing again" : "Take a swing"}</button>
      </div>`;
  }

  return `
    <div class="card">
      <h2>🏌️ Driving Range</h2>
      <p class="sub">Practice swings only — nothing here counts. Get a feel for the timing before the real round.</p>
      <div class="side-layout">
        <div class="side-main">${swingUi}</div>
        <div class="side-roster">
          <h3>Lanes</h3>
          <ul class="player-list compact">
            ${players.map((p) => `<li>${escapeHtml(p.name)}: ${practiceQualityLabel(gs.swings[p.id])}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${
        isHost
          ? `<div class="guess-host-controls">
              <button class="btn" data-action="show-golf-intro">⬅️ Back</button>
              <button class="btn primary" data-action="start-golf" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>⛳ Start Football Golf</button>
            </div>`
          : ""
      }
    </div>`;
}

function renderGolf() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state.golf;
  const holeIndex = gs.holeIndex;
  const hole = GOLF_HOLES[holeIndex];
  const answered = golfAlreadyAnswered(gs);
  const finished = golfFinishedPlayers(gs);
  const myStrokes = golfMyBall(gs, hole).strokes;

  const scoreboardRows = players
    .map((p) => ({
      player: p,
      total: (gs.results[p.id] || []).reduce((sum, r) => sum + r.points, 0),
    }))
    .sort((a, b) => b.total - a.total);

  let swingUi;
  if (answered) {
    const myResult = gs.results[me?.id]?.[holeIndex];
    swingUi = myResult
      ? `<p class="waiting">You holed out in ${myResult.strokes} — ${GOLF_TERM_LABEL[myResult.term]} (+${myResult.points} points). ${isHost ? "" : "Waiting for host to continue…"}</p>`
      : `<p class="waiting">${isHost ? "" : "Waiting for host to continue…"}</p>`;
  } else if (local.golf.subPhase === "power" || local.golf.subPhase === "aim") {
    const label = local.golf.subPhase === "power" ? "Tap when the power looks right." : "Now tap to set your aim.";
    const action = local.golf.subPhase === "power" ? "golf-lock-power" : "golf-lock-aim";
    const btnLabel = local.golf.subPhase === "power" ? "🏌️ Swing!" : "🎯 Strike!";
    swingUi = `
      <div class="golf-hole-card">
        <h3>Stroke ${myStrokes + 1} — ${escapeHtml(hole.name)}</h3>
        <p class="sub">${label}</p>
        <div class="golf-meter">
          <div class="golf-meter-track"><div class="golf-meter-marker golf-sweep"></div></div>
        </div>
        <button class="btn primary" data-action="${action}">${btnLabel}</button>
      </div>`;
  } else if (local.golf.subPhase === "recap" && local.golf.lastShot) {
    const s = local.golf.lastShot;
    const shotLabel =
      s.quality >= 0.85 ? "🔥 Great strike!" : s.quality >= 0.55 ? "👍 Solid contact" : s.quality >= 0.25 ? "😬 Mishit" : "🫣 Total shank!";
    swingUi = `
      <div class="golf-hole-card">
        <h3>${shotLabel}</h3>
        <p class="sub">Stroke ${myStrokes} down — check the course below to see where it landed.</p>
        <button class="btn primary" data-action="golf-begin-swing">🏌️ Next shot</button>
      </div>`;
  } else {
    // "ready" — the very first shot of the hole
    swingUi = `
      <div class="golf-hole-card">
        <h3>${escapeHtml(hole.name)} — Par ${hole.par}</h3>
        <p class="sub">${escapeHtml(hole.description)}</p>
        <button class="btn primary" data-action="golf-begin-swing">⚡ Tee off!</button>
      </div>`;
  }

  return `
    <div class="card">
      <h2>⛳ Football Golf</h2>
      <p class="sub">Hole ${holeIndex + 1} of ${GOLF_HOLES.length}: ${escapeHtml(hole.name)} — Par ${hole.par}</p>
      <div class="side-layout">
        <div class="side-main">
          ${swingUi}
          ${renderGolfCourse(hole, gs)}
        </div>
        <div class="side-roster">
          <h3>Totals</h3>
          <ul class="player-list compact">
            ${scoreboardRows.map((r) => `<li>${escapeHtml(r.player.name)}: ${r.total}</li>`).join("")}
          </ul>
        </div>
      </div>
      ${renderGolfFinishers(gs, holeIndex, finished)}
      ${
        isHost
          ? `<button class="btn primary" data-action="golf-next-hole">${holeIndex + 1 >= GOLF_HOLES.length ? "🏆 Show final standings" : "Next hole"}</button>`
          : ""
      }
    </div>`;
}

// The shared top-down course. Since render() fully replaces the DOM on
// every call (no persisting elements), a CSS `transition` on left/top
// would have nothing to animate FROM — freshly-inserted elements just
// snap to their final style. `@keyframes` don't have that problem (they
// auto-play from their own `from` state on insertion), so each ball that
// moved since the last render gets an inline `--from-x/--from-y` ->
// `--to-x/--to-y` pair and a `flying` class that runs a keyframe
// animation between them; balls that haven't moved just render statically
// at rest. local.golfBallAnim remembers each ball's last-rendered spot so
// we can tell which is which.
function renderGolfCourse(hole, gs) {
  const bunkers = (hole.bunkers || [])
    .map((b) => `<div class="golf-bunker" style="left:${b.x}%; top:${b.y}%; width:${b.w}%; height:${b.h}%;"></div>`)
    .join("");
  const balls = players
    .map((p) => {
      const ball = gs.balls[p.id] || hole.tee;
      const prev = local.golfBallAnim[p.id];
      const moved = prev && (prev.x !== ball.x || prev.y !== ball.y);
      local.golfBallAnim[p.id] = { x: ball.x, y: ball.y };
      const holedOut = !!gs.balls[p.id]?.holedOut;
      const style = moved
        ? `--from-x:${prev.x}%; --from-y:${prev.y}%; --to-x:${ball.x}%; --to-y:${ball.y}%;`
        : `left:${ball.x}%; top:${ball.y}%;`;
      return `
        <div class="golf-course-ball${moved ? " flying" : ""}${holedOut ? " holed" : ""}" style="${style}" title="${escapeHtml(p.name)}">
          <span>⚽</span>
          <span class="golf-course-ball-label">${escapeHtml(p.name)}</span>
        </div>`;
    })
    .join("");
  return `
    <div class="golf-course">
      ${bunkers}
      <div class="golf-green-circle" style="left:${hole.pin.x}%; top:${hole.pin.y}%;"></div>
      <div class="golf-pin" style="left:${hole.pin.x}%; top:${hole.pin.y}%;">⛳</div>
      <div class="golf-tee-marker" style="left:${hole.tee.x}%; top:${hole.tee.y}%;">📍</div>
      ${balls}
    </div>`;
}

// Who's holed out on the current hole so far, and in how many strokes —
// this is the actual source of truth for scoring; there's no spatial
// "landing spot" to show since a shot's outcome is a stroke count, not a
// single throw.
function renderGolfFinishers(gs, holeIndex, finished) {
  const revealedClass = local.golfAnim.revealed ? " revealed" : "";
  const rows = finished
    .map((p) => {
      const r = gs.results[p.id][holeIndex];
      return `<li>${GOLF_TERM_LABEL[r.term]} — ${escapeHtml(p.name)} (${r.strokes} strokes, +${r.points})</li>`;
    })
    .join("");
  return `
    <div class="golf-finishers${revealedClass}">
      <h3>This hole so far</h3>
      ${finished.length ? `<ul class="golf-shot-list">${rows}</ul>` : `<p class="waiting">Nobody's holed out yet…</p>`}
    </div>`;
}

function renderLeaderboard(gameName, nextAction, nextLabel) {
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

function clearConfetti() {
  document.querySelectorAll(".confetti").forEach((el) => el.remove());
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// keep text inputs from resetting cursor/value across re-renders by tracking them
APP_EL.addEventListener("input", (e) => {
  if (e.target.id === "name-input") local.nameInput = e.target.value;
  if (e.target.id === "code-input") local.joinCodeInput = e.target.value.toUpperCase();
});
