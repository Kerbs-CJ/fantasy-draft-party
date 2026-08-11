// Fantasy Draft Party — app logic. Vanilla JS, no build step.

const APP_EL = document.getElementById("app");
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1
const TRIVIA_QUESTION_COUNT = 5;
const TRIVIA_TIME_MS = 10000;
const GUESS_PLAYER_COUNT = 7;
const GUESS_CLUE_POINTS = [30, 24, 18, 12, 6]; // indexed by clueIndex (0 = only 1st clue shown)
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
  trivia: { qIndex: null, answeredQIndex: null, deadline: null, myChoice: null, timer: null },
  guess: { pIndex: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null },
  revealStarted: false,
  botShooterScheduledFor: null,
  botKeeperScheduledFor: null,
  shootoutAnim: { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, finalizing: false },
};

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
  if (action === "start-trivia") return startTrivia();
  if (action === "trivia-answer") return answerTrivia(Number(btn.dataset.choice));
  if (action === "trivia-next") return triviaNext();
  if (action === "guess-reveal-clue") return guessRevealClue();
  if (action === "guess-answer") return guessAnswer(btn.dataset.name);
  if (action === "guess-next") return guessNext();
  if (action === "show-shootout-intro") return updateRoom({ status: "shootout-intro" });
  if (action === "start-round-robin") return startRoundRobin();
  if (action === "start-rr-match") return startRRMatch(Number(btn.dataset.i));
  if (action === "pick-shooter") return submitPick("shooter", btn.dataset.zone);
  if (action === "pick-keeper") return submitPick("keeper", btn.dataset.zone);
  if (action === "finish-round-robin") return finishRoundRobin();
  if (action === "reveal") return updateRoom({ status: "reveal" });
  if (action === "leave") return leaveRoom();
  if (action === "dev-quickstart") return devQuickStart(btn.dataset.status);
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

// ── trivia ───────────────────────────────────────────────────
function randomTriviaOrder() {
  const pool = window.TRIVIA_QUESTIONS.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, TRIVIA_QUESTION_COUNT);
}

async function startTrivia() {
  await updateRoom({ status: "trivia", game_state: { order: randomTriviaOrder(), qIndex: 0 } });
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
  await sb.from("scores").insert({ room_code: room.code, player_id: me.id, game_index: 1, round_index: qIndex, points });
}

async function triviaNext() {
  const gs = room.game_state || {};
  const next = gs.qIndex + 1;
  if (next >= gs.order.length) {
    await updateRoom({ status: "guess", game_state: { order: randomGuessOrder(), pIndex: 0, clueIndex: 0 } });
  } else {
    await updateRoom({ game_state: { ...gs, qIndex: next } });
  }
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
// shuffled list of every possible pairing (all N*(N-1)/2 of them, one
// match each), no byes or brackets involved at all. That sidesteps the
// bye-fairness problem entirely: with 5 players a knockout bracket always
// has to concentrate byes somewhere (round 1, a later round, or both) —
// round robin just has everyone play everyone, once each, full stop.
function generateRoundRobinMatches(playerIds) {
  const matches = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      matches.push({ p1: playerIds[i], p2: playerIds[j], winner: null, score: null });
    }
  }
  return shuffle(matches);
}

function findNextRRMatch(matches) {
  return matches.findIndex((m) => !m.winner);
}

// Standings: most wins first, then goal difference (kicks scored minus
// kicks conceded across all of a player's matches), then raw kicks scored,
// as the tiebreak — the familiar football-league sort order.
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
  return Object.values(stats)
    .map((s) => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => b.wins - a.wins || b.gd - a.gd || b.gf - a.gf);
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

// Final standings decide placement points: 100/80/60/40/20 for a 5-player
// field (a clean 20-point step per place), scaled to whatever the actual
// player count is. That keeps the shootout's max swing (80, top to bottom)
// in the same ballpark as Trivia Blitz's max swing (100 — 5 questions at
// up to 20pts each), noticeably gentler than Guess the Footballer's (210 —
// 7 rounds at up to 30pts each), since the shootout is one placement
// rather than several independently-scored rounds.
async function finishRoundRobin() {
  const standings = computeStandings(room.game_state.roundRobin.matches, players);
  const n = standings.length;
  const inserts = standings.map((s, i) => ({
    room_code: room.code,
    player_id: s.player.id,
    game_index: 3,
    round_index: 0,
    points: n > 1 ? Math.round(100 - (80 * i) / (n - 1)) : 100,
  }));
  if (inserts.length) await sb.from("scores").insert(inserts);
  await updateRoom({ status: "final-leaderboard" });
}

// ── dev mode: solo-test any screen without a full lobby ────
function resetLocalGameState() {
  clearTimeout(local.trivia.timer);
  local.trivia = { qIndex: null, answeredQIndex: null, deadline: null, myChoice: null, timer: null };
  local.guess = { pIndex: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null };
  local.revealStarted = false;
  local.botShooterScheduledFor = null;
  local.botKeeperScheduledFor = null;
  local.shootoutAnim = { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, finalizing: false };
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
  if (status === "trivia") game_state = { order: randomTriviaOrder(), qIndex: 0 };
  if (status === "guess") game_state = { order: randomGuessOrder(), pIndex: 0, clueIndex: 0 };
  if (status === "shootout-intro") await ensureDevBotIfNeeded();
  if (status === "round-robin") {
    await ensureDevBotIfNeeded();
    game_state = { roundRobin: { matches: generateRoundRobinMatches(players.map((p) => p.id)) } };
  }
  await updateRoom({ status, game_state });
}

// Plays a short animated replay whenever a new kick lands in match.log —
// every connected client (both players and spectators) detects the same
// new log entry via the realtime subscription and plays the same replay
// independently, so the room shares roughly the same moment without
// needing any extra server-side orchestration.
const SHOOTOUT_KICK_MS = 750;
const SHOOTOUT_RESULT_MS = 1300;

function ensureShootoutAnim() {
  const match = room.game_state?.match;
  if (!match) return;
  const matchKey = `${match.p1}-${match.p2}-${match.rrIndex}`;
  if (local.shootoutAnim.matchKey !== matchKey) {
    local.shootoutAnim = { matchKey, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, finalizing: false };
  }
  if (match.log.length > local.shootoutAnim.lastLogLength && !local.shootoutAnim.phase) {
    local.shootoutAnim.lastLogLength = match.log.length;
    local.shootoutAnim.entry = match.log[match.log.length - 1];
    local.shootoutAnim.phase = "kicking";
    local.shootoutAnim.kickAnimTriggered = false;
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

function triggerShotAnimation(entry) {
  const ball = document.getElementById("pk-ball");
  const keeper = document.getElementById("pk-keeper");
  if (!ball || !keeper) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const shooterPos = ZONE_POS[entry.shooterPick];
      const keeperPos = ZONE_POS[entry.keeperPick];
      ball.style.left = shooterPos.x + "%";
      ball.style.top = shooterPos.y + "%";
      keeper.style.left = keeperPos.x + "%";
      keeper.style.top = keeperPos.y + "%";
    });
  });
}

function renderPkGoal(entry, animate) {
  const ballStart = { x: 50, y: 116 };
  const keeperStart = { x: 50, y: 58 };
  const ballPos = animate ? ballStart : ZONE_POS[entry.shooterPick];
  const keeperPos = animate ? keeperStart : ZONE_POS[entry.keeperPick];
  if (animate) setTimeout(() => triggerShotAnimation(entry), 30);
  return `
    <div class="pk-goal">
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
    case "trivia":
      ensureTriviaTimer();
      html += renderTrivia();
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
      html += renderLeaderboard("the shootout", "reveal", "🏆 Reveal Draft Order!");
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
    ${DEV_MODE ? renderDevBar() : ""}`;
}

function renderDevBar() {
  const stages = [
    ["lobby", "Lobby"],
    ["trivia", "Trivia"],
    ["guess", "Guess"],
    ["leaderboard", "Leaderboard"],
    ["shootout-intro", "PK Intro"],
    ["round-robin", "Round Robin"],
    ["final-leaderboard", "Final LB"],
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
      <p class="sub">Trivia, guesswork, and penalty kicks — three rounds to decide who drafts first.</p>
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
        <button class="dev-btn" data-action="dev-quickstart" data-status="trivia">🧠 Trivia Blitz</button>
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
          ? `<button class="btn primary" data-action="start-trivia" ${players.length < 2 && !DEV_MODE ? "disabled" : ""}>
              ${players.length < 2 && !DEV_MODE ? "Need at least 2 players" : "▶️ Start the party!"}
            </button>`
          : `<p class="waiting">Waiting for the host to start…</p>`
      }
    </div>`;
}

function renderTrivia() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const gs = room.game_state || {};
  const qIndex = gs.qIndex ?? 0;
  const question = window.TRIVIA_QUESTIONS[gs.order[qIndex]];
  const answered = local.trivia.answeredQIndex === qIndex;
  const answeredIds = answeredPlayerIds(1, qIndex);
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
      <h3>Answered (${answeredIds.size}/${players.length})</h3>
      <ul class="player-list compact">
        ${players.map((p) => `<li>${answeredIds.has(p.id) ? "✅" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
      </ul>
      ${isHost ? `<button class="btn primary" data-action="trivia-next">${qIndex + 1 >= gs.order.length ? "🕵️ Next: Guess the Footballer" : "Next question"}</button>` : ""}
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
      <h3>Guessed (${answeredIds.size}/${players.length})</h3>
      <ul class="player-list compact">
        ${players.map((p) => `<li>${answeredIds.has(p.id) ? "✅" : "⏳"} ${escapeHtml(p.name)}</li>`).join("")}
      </ul>
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

function renderShootoutIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  const n = players.length;
  const matchCount = (n * (n - 1)) / 2;
  return `
    <div class="card">
      <h2>⚽ Penalty Shootout</h2>
      <p class="sub">The final round. Round robin — every player faces every other player once (${matchCount} matches for ${n} players) — decides the last bit of draft order. Each match is a best-of-5 shootout: shooter picks Left, Center, or Right, keeper picks a dive at the same time, blind. Still level after 5? Sudden death, one kick each, until someone blinks. Standings are ranked by wins, then goal difference, then goals scored.</p>
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
      <h2>🏁 Round Robin Standings</h2>
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
  L: { x: 20, y: 55 },
  C: { x: 50, y: 45 },
  R: { x: 80, y: 55 },
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
    // Only actually kick off the CSS transition once per kick — a redundant
    // re-render mid-flight (e.g. the realtime echo of our own DB write
    // landing a beat later) must not replay it from the start position.
    const doAnimate = anim.phase === "kicking" && !anim.kickAnimTriggered;
    if (doAnimate) anim.kickAnimTriggered = true;
    return `
      <div class="card">
        <h2>⚽ ${escapeHtml(nameOf(match.p1))} vs ${escapeHtml(nameOf(match.p2))}</h2>
        <p class="sub">${roundLabel}</p>
        ${renderPkScoreboard(match)}
        ${renderPkGoal(entry, doAnimate)}
        ${
          anim.phase === "result"
            ? `<p class="kick-result ${entry.scored ? "goal" : "save"}">${entry.scored ? "⚽ GOAL!" : "🧤 SAVED!"} — ${escapeHtml(nameOf(entry.shooter))} shot ${ZONE_LABEL[entry.shooterPick]}, ${escapeHtml(nameOf(entry.keeper))} dove ${ZONE_LABEL[entry.keeperPick]}</p>`
            : `<p class="sub" style="text-align:center">${escapeHtml(nameOf(entry.shooter))} steps up…</p>`
        }
      </div>`;
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

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// keep text inputs from resetting cursor/value across re-renders by tracking them
APP_EL.addEventListener("input", (e) => {
  if (e.target.id === "name-input") local.nameInput = e.target.value;
  if (e.target.id === "code-input") local.joinCodeInput = e.target.value.toUpperCase();
});
