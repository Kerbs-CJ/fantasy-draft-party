// Fantasy Draft Party — app logic. Vanilla JS, no build step.

const APP_EL = document.getElementById("app");
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0, I/1
const MISSING_CLUB_COUNT = 10;
const MISSING_CLUB_POINTS = 20; // flat — no timer, so no speed bonus
const GUESS_PLAYER_COUNT = 7;
const GUESS_CLUE_POINTS = [30, 24, 18, 12, 6]; // indexed by clueIndex (0 = only 1st clue shown)
// Football Golf — a real top-down course, drag-to-shoot. Every player has
// an actual (x, y) position on the hole (percent coordinates, tee near
// the bottom, pin near the top) that's part of shared room state, so a
// shot's outcome is visible to everyone as a ball moving across the
// shared course, not just a final result. The swing itself is a single
// drag gesture on the ball, slingshot-style: pull back opposite of where
// you want to shoot — the aim line follows your hand like a real
// slingshot band (it shows the pull, not the landing spot; the shot only
// reveals itself on release) — and set power (how far you pull, capped at
// GOLF_MAX_DRAG_PERCENT of the course's own size — device-independent
// since it's a percentage of the rendered course, not raw pixels),
// release to shoot. Shots are a real simulated roll (see golfSimulateShot)
// — the ball actually bounces off the course boundary and every one of
// the hole's `obstacles`, losing speed to friction as it goes, not just a
// straight line from A to B. The only skill is judging distance and angle
// by eye and reading the course, same as real mini golf.
//
// Each hole is themed after a club — `club`/`crest`/`colors` drive a small
// badge and a subtle colour wash over the course (see renderGolfCourse) —
// and `obstacles` are real solid geometry loosely shaped around something
// about that club (a cannon barrel, a stand end, a badge ring, etc), laid
// out for the course's current landscape (wider-than-tall) shape. Two
// solid obstacle shapes: a rectangle (axis-aligned only — no rotation, so
// the physics and the CSS box it's rendered as always agree exactly,
// even though the course itself isn't square) `{x, y, w, h}` (center +
// full size), or a circular pillar `{x, y, r, shape: "circle"}` (center +
// radius) — see golfCollideBallObstacle. Three more terrain kinds, same
// rectangle shape but pass-through (no collision, the ball rolls freely
// into them): `slopes` (a directional push, see GOLF_SLOPE_ACCEL), `sand`
// (extra friction, see GOLF_SAND_FRICTION), and `water` (ends the shot on
// contact, ball back to the tee — see golfSimulateShot).
//
// Every hole is built the same deliberate way: tee is point A, pin is
// point B, and a small number of "gate" walls — each one spanning nearly
// the full width/height except for a single gap — divide the course into
// a sequence of legs, forcing an actual zigzag from A to B rather than a
// straight shot. Each leg gets AT MOST one extra pillar (the pass-through
// terrain kinds don't count, since the ball rolls through those, not
// around them) — every pillar is checked against every gate/pillar it
// shares an x-range OR y-range with, for at least a full ball-diameter's
// clearance (solid obstacles have real collision; a gap narrower than the
// ball itself traps it bouncing forever, which is worse than no obstacle
// at all).
const GOLF_HOLES = [
  {
    club: "Arsenal",
    crest: "AFC",
    colors: { primary: "#EF0107", secondary: "#FFFFFF" },
    name: "The Emirates",
    description: "Two gates down the cannon barrel — south, then north.",
    par: 3,
    tee: { x: 12, y: 50 },
    pin: { x: 86, y: 50 },
    obstacles: [
      { x: 35, y: 37.5, w: 6, h: 69 }, // gate 1 — gap south (y 72-97)
      { x: 63, y: 62.5, w: 6, h: 69 }, // gate 2 — gap north (y 3-28)
      { x: 20, y: 85, r: 3.5, shape: "circle" }, // leg 1 — a loose cannonball
      { x: 78, y: 14, r: 3.5, shape: "circle" }, // leg 3 — a loose cannonball
    ],
    slopes: [
      { x: 49, y: 50, w: 12, h: 20, dir: "down" }, // leg 2 — resists the cut through the middle
    ],
    water: [
      { x: 86, y: 62, w: 14, h: 8 }, // just past the green — overcook the approach and it's gone
    ],
  },
  {
    club: "Liverpool",
    crest: "LFC",
    colors: { primary: "#C8102E", secondary: "#F6EB61" },
    name: "Anfield (The Kop)",
    description: "Two gates either side of the Kop — swing wide, then swing back, all the way into the far corner.",
    par: 4,
    // Mirrored horizontally from the original bottom-left tee / top-right
    // pin (a pure reflection, so every clearance already checked for the
    // gates/pillars/slope below still holds exactly), then tee and pin
    // both pushed further into their corners for real extra distance —
    // pin now top-left, tee bottom-right, and noticeably longer than the
    // original diagonal.
    tee: { x: 92, y: 92 },
    pin: { x: 8, y: 8 },
    obstacles: [
      { x: 36.5, y: 58, w: 67, h: 6 }, // gate 1 — gap east (x 70-97)
      { x: 63.5, y: 32, w: 67, h: 6 }, // gate 2 — gap west (x 3-30)
      { x: 80, y: 72, r: 4, shape: "circle" }, // leg 1 — a steward's post
      { x: 24, y: 20, r: 3, shape: "circle" }, // leg 3 — a steward's post
    ],
    slopes: [
      { x: 52, y: 45, w: 18, h: 16, dir: "up" }, // leg 2 — a boost through the long middle stretch
    ],
    water: [
      { x: 22, y: 10, w: 10, h: 8 }, // drift too wide on the final approach and it's gone
    ],
  },
  {
    club: "Leeds United",
    crest: "LUFC",
    colors: { primary: "#1D428A", secondary: "#FFCD00" },
    name: "Elland Road",
    description: "Thread the middle gate, then the cup opens away from the tee — go all the way round.",
    par: 3,
    tee: { x: 50, y: 88 },
    pin: { x: 50, y: 16 },
    obstacles: [
      { x: 21.5, y: 58, w: 37, h: 6 }, // gate — west half
      { x: 79.5, y: 58, w: 35, h: 6 }, // gate — east half (gap x 40-62, dead center)
      { x: 50, y: 42, r: 3, shape: "circle" }, // leg 2 — a lone post before the cup
      // The cup is a U, not an n — walled on the side FACING the tee, open
      // on the far side, so you can't just walk it straight in. Getting to
      // the pin means going wide around the whole cup and coming back in
      // from the top instead.
      { x: 35, y: 20, w: 6, h: 24 }, // cup — west wall
      { x: 65, y: 20, w: 6, h: 24 }, // cup — east wall
      { x: 50, y: 29, w: 24, h: 6 }, // cup — south wall, joins both side walls with zero gap at the corners (north stays open, facing away from the tee)
    ],
    slopes: [
      { x: 50, y: 78, w: 22, h: 14, dir: "down" }, // leg 1 — resists right off the tee
    ],
    water: [
      { x: 50, y: 24, w: 14, h: 4 }, // right at the back of the cup — overshoot the pin and it's gone
    ],
  },
  {
    club: "Manchester United",
    crest: "MUFC",
    colors: { primary: "#DA291C", secondary: "#FBE122" },
    name: "Old Trafford (Theatre of Dreams)",
    description: "A proper triple-bend slalom, wall to wall to wall.",
    par: 4,
    tee: { x: 88, y: 80 },
    pin: { x: 12, y: 18 },
    obstacles: [
      { x: 68, y: 68.5, w: 6, h: 57 }, // gate 1 — gap north (y 3-40)
      { x: 50, y: 31.5, w: 6, h: 57 }, // gate 2 — gap south (y 60-97)
      { x: 32, y: 68.5, w: 6, h: 57 }, // gate 3 — gap north (y 3-40)
    ],
    slopes: [
      { x: 82, y: 65, w: 14, h: 16, dir: "down" }, // leg 1 — resists right off the tee
      { x: 41, y: 50, w: 8, h: 14, dir: "up" }, // leg 2 — a boost through the tightest squeeze
    ],
    water: [
      { x: 12, y: 30, w: 10, h: 8 }, // short-side miss on the final approach — splash
    ],
  },
  {
    club: "Barcelona",
    crest: "FCB",
    colors: { primary: "#A50044", secondary: "#004D98" },
    name: "Camp Nou",
    description: "The grand finale — corner to corner, four gates, water guarding the green, no easy way through.",
    par: 6,
    // Corner to corner — the longest possible line the course allows —
    // through FOUR gates instead of three, with sand bogging down an
    // imprecise entry into two of them and water guarding the final
    // approach to the green. Genuinely the hardest hole on the course, as
    // a grand finale should be.
    tee: { x: 6, y: 94 },
    pin: { x: 94, y: 6 },
    obstacles: [
      { x: 63.5, y: 76, w: 67, h: 6 }, // gate 1 — gap west (x 3-30)
      { x: 36.5, y: 59, w: 67, h: 6 }, // gate 2 — gap east (x 70-97)
      { x: 63.5, y: 41, w: 67, h: 6 }, // gate 3 — gap west (x 3-30)
      { x: 36.5, y: 24, w: 67, h: 6 }, // gate 4 — gap east (x 70-97)
      { x: 50, y: 89, r: 4, shape: "circle" }, // right off the tee
    ],
    sand: [
      { x: 72, y: 52, w: 14, h: 10 }, // the landing zone right after gate 2
      { x: 25, y: 35, w: 14, h: 10 }, // guarding the entry to gate 3
    ],
    water: [
      { x: 82, y: 14, w: 14, h: 10 }, // guarding the final approach to the green
    ],
  },
];
// Dragging GOLF_MAX_DRAG_PERCENT of the course's own rendered
// width/height (whichever axis the drag lies closer to) maxes out power.
// A full-power, completely unobstructed shot rolls GOLF_MAX_SHOT_DISTANCE
// course-percent units before friction stops it — deliberately less than
// any hole's tee-to-pin distance, so even a perfect shot can't 1-putt a
// hole from the tee; you're always judging how much of the remaining
// distance to commit to (and now, with real obstacles, which line to take).
const GOLF_MAX_DRAG_PERCENT = 45;
const GOLF_MAX_SHOT_DISTANCE = 60;
const GOLF_MIN_DRAG_PERCENT = 4; // below this, a release cancels instead of firing a near-zero shot
const GOLF_HOLED_THRESHOLD = 5; // how close (course %) counts as "in the hole"
const GOLF_MAX_STROKES = 12; // holes forcibly finish here, however far short — flat, not per-par, so a tough hole gets real room to work with
// The driving range has no real hole to play, no strokes/par, and no
// score — just somewhere to practice dragging (and bouncing off
// something) before the real round. Otherwise works exactly like a real
// hole: each swing fires from wherever the ball currently rests (see
// practiceMyBall), starting at the tee.
// One of everything the real course throws at you — a wall, a pillar, a
// downhill slope, an uphill slope — spread out and kept clear of the tee
// itself, so a practice swing always has a straight run at the pin
// available as well as something to deliberately try bouncing off.
const GOLF_PRACTICE_HOLE = {
  tee: { x: 50, y: 88 },
  pin: { x: 50, y: 15 },
  obstacles: [
    { x: 65, y: 58, w: 16, h: 8 },
    { x: 30, y: 40, r: 4, shape: "circle" },
  ],
  slopes: [
    { x: 30, y: 72, w: 18, h: 14, dir: "down" },
    { x: 65, y: 25, w: 18, h: 14, dir: "up" },
  ],
};
// ── golf shot physics ───────────────────────────────────────
// A real simulated roll, not a straight line — the ball moves tick by
// tick, losing speed to friction, bouncing off the course boundary and
// any obstacle in the way, until it either drops in the hole or rolls to
// a stop. All in the same 0–100 course-percent coordinate space as
// everything else golf (tee/pin/obstacles/drag math), which is why
// obstacles are axis-aligned only — a rotated shape would need to rotate
// in real on-screen pixel space to look right, but the course itself
// isn't square (it's landscape), so a rotation computed in this percent
// space wouldn't visually line up with the CSS box it's rendered as. An
// axis-aligned rectangle (or circle, rendered via the same
// fixed-aspect-ratio trick as the pin's green circle) has no such
// mismatch — what physics computes and what's on screen always agree.
const GOLF_BALL_RADIUS = 2.2; // collision radius, course-percent units — not tied to the emoji's rendered pixel size
const GOLF_BOUND_MIN = 3;
const GOLF_BOUND_MAX = 97;
const GOLF_SHOT_V0_MAX = GOLF_MAX_SHOT_DISTANCE * 0.035; // per-tick speed at full power — see GOLF_FRICTION for why 0.035
const GOLF_FRICTION = 0.965; // multiplicative speed decay per tick — an unobstructed shot's total roll distance converges to roughly v0 / (1 - GOLF_FRICTION), which is how GOLF_SHOT_V0_MAX above is calibrated back to GOLF_MAX_SHOT_DISTANCE
const GOLF_WALL_RESTITUTION = 0.72; // energy kept on an obstacle bounce
const GOLF_BOUNDARY_RESTITUTION = 0.8; // energy kept bouncing off the course edge
const GOLF_STOP_SPEED = 0.05; // below this speed (percent/tick) the ball is considered stopped
const GOLF_MAX_SIM_TICKS = 240; // hard safety cap — a shot pinballing in a corner can't simulate forever
const GOLF_SIM_SUBSTEPS = 4; // each tick's movement is split into smaller steps so a fast ball can't tunnel straight through a thin obstacle before a collision check sees it
// A hole's `slopes` are rectangular ground zones (same axis-aligned shape
// as a wall, but the ball rolls freely through — no collision, just a
// constant vertical pull the whole time it's inside, like gravity on a
// tilted patch of grass) — "down" pulls toward the bottom of the screen
// (speeds up a ball already heading that way, drags on one heading the
// other), "up" pulls toward the top. Deliberately vertical-only (not an
// arbitrary slope angle) for the same reason obstacles are axis-aligned:
// it's simple enough to always render correctly (a plain ▼/▲, no
// rotation) regardless of the course's own aspect ratio.
const GOLF_SLOPE_ACCEL = 0.05; // percent/tick² added to vy per tick while inside a slope zone — subtle next to a full shot's ~2.1 percent/tick starting speed, but adds up over a few dozen ticks
// Sand and water are the other two terrain kinds a hole can have,
// alongside slopes — same rectangle shape, also pass-through (the ball
// rolls into them freely, no collision), but with a different effect
// instead of a directional pull. Sand bogs the ball down hard (extra
// friction on top of the normal per-tick friction); water ends the shot
// on contact and sends the ball back to the tee — a real stroke-and-a-
// splash penalty, not just decoration.
const GOLF_SAND_FRICTION = 0.94; // extra multiplicative speed decay per substep while in sand — compounds with GOLF_FRICTION, noticeably stronger than normal rolling resistance

// Circle-vs-obstacle collision (the ball is always treated as a circle).
// Returns null for no collision, or the surface normal plus how far to
// push the ball back out along it so it's no longer overlapping —
// standard "closest point" circle-vs-shape test, same idea for both
// obstacle kinds.
function golfCollideBallObstacle(bx, by, r, obstacle) {
  if (obstacle.shape === "circle") {
    const dx = bx - obstacle.x;
    const dy = by - obstacle.y;
    const dist = Math.hypot(dx, dy);
    const minDist = r + obstacle.r;
    if (dist >= minDist) return null;
    if (dist === 0) return { nx: 0, ny: -1, pushX: 0, pushY: -minDist };
    const nx = dx / dist;
    const ny = dy / dist;
    return { nx, ny, pushX: nx * (minDist - dist), pushY: ny * (minDist - dist) };
  }
  const hw = obstacle.w / 2;
  const hh = obstacle.h / 2;
  const dx = bx - obstacle.x;
  const dy = by - obstacle.y;
  const closestX = clamp(dx, -hw, hw);
  const closestY = clamp(dy, -hh, hh);
  const distX = dx - closestX;
  const distY = dy - closestY;
  const distSq = distX * distX + distY * distY;
  if (distSq >= r * r) return null;
  if (distSq > 0) {
    const dist = Math.sqrt(distSq);
    const nx = distX / dist;
    const ny = distY / dist;
    return { nx, ny, pushX: nx * (r - dist), pushY: ny * (r - dist) };
  }
  // Ball's center is already inside the rectangle (deep penetration from
  // a fast-moving shot) — push out along whichever axis has less
  // distance to escape rather than picking an arbitrary direction.
  const penX = hw - Math.abs(dx);
  const penY = hh - Math.abs(dy);
  if (penX < penY) {
    const nx = dx < 0 ? -1 : 1;
    return { nx, ny: 0, pushX: nx * (penX + r), pushY: 0 };
  }
  const ny = dy < 0 ? -1 : 1;
  return { nx: 0, ny, pushX: 0, pushY: ny * (penY + r) };
}

// Simulates an entire shot from the first roll to the final resting spot
// (or the hole). Pure function of the hole + a starting angle/power, so
// it's the single source of truth for both the real round and the
// driving range. Returns the full path (course-percent waypoints, one
// per tick) so the caller can animate the actual roll — bounces and all
// — rather than a straight line from A to B.
function golfSimulateShot(hole, start, angle, power) {
  let vx = Math.cos(angle) * power * GOLF_SHOT_V0_MAX;
  let vy = Math.sin(angle) * power * GOLF_SHOT_V0_MAX;
  let x = start.x;
  let y = start.y;
  const obstacles = hole.obstacles || [];
  const slopes = hole.slopes || [];
  const sand = hole.sand || [];
  const water = hole.water || [];
  const path = [{ x, y }];
  let holed = false;
  let splashed = false;
  for (let tick = 0; tick < GOLF_MAX_SIM_TICKS && !holed && !splashed; tick++) {
    for (let sub = 0; sub < GOLF_SIM_SUBSTEPS; sub++) {
      x += vx / GOLF_SIM_SUBSTEPS;
      y += vy / GOLF_SIM_SUBSTEPS;
      if (x < GOLF_BOUND_MIN) {
        x = GOLF_BOUND_MIN + (GOLF_BOUND_MIN - x);
        vx = -vx * GOLF_BOUNDARY_RESTITUTION;
      } else if (x > GOLF_BOUND_MAX) {
        x = GOLF_BOUND_MAX - (x - GOLF_BOUND_MAX);
        vx = -vx * GOLF_BOUNDARY_RESTITUTION;
      }
      if (y < GOLF_BOUND_MIN) {
        y = GOLF_BOUND_MIN + (GOLF_BOUND_MIN - y);
        vy = -vy * GOLF_BOUNDARY_RESTITUTION;
      } else if (y > GOLF_BOUND_MAX) {
        y = GOLF_BOUND_MAX - (y - GOLF_BOUND_MAX);
        vy = -vy * GOLF_BOUNDARY_RESTITUTION;
      }
      for (const slope of slopes) {
        if (Math.abs(x - slope.x) <= slope.w / 2 && Math.abs(y - slope.y) <= slope.h / 2) {
          vy += ((slope.dir === "down" ? 1 : -1) * GOLF_SLOPE_ACCEL) / GOLF_SIM_SUBSTEPS;
        }
      }
      for (const s of sand) {
        if (Math.abs(x - s.x) <= s.w / 2 && Math.abs(y - s.y) <= s.h / 2) {
          vx *= GOLF_SAND_FRICTION;
          vy *= GOLF_SAND_FRICTION;
        }
      }
      for (const w of water) {
        if (Math.abs(x - w.x) <= w.w / 2 && Math.abs(y - w.y) <= w.h / 2) {
          splashed = true;
          break;
        }
      }
      if (splashed) break;
      for (const obstacle of obstacles) {
        const hit = golfCollideBallObstacle(x, y, GOLF_BALL_RADIUS, obstacle);
        if (!hit) continue;
        x += hit.pushX;
        y += hit.pushY;
        // Only reflect if actually still moving into the surface — skips
        // re-reflecting a ball that's just resting against it.
        const dot = vx * hit.nx + vy * hit.ny;
        if (dot < 0) {
          vx -= (1 + GOLF_WALL_RESTITUTION) * dot * hit.nx;
          vy -= (1 + GOLF_WALL_RESTITUTION) * dot * hit.ny;
        }
      }
      if (Math.hypot(hole.pin.x - x, hole.pin.y - y) <= GOLF_HOLED_THRESHOLD) {
        holed = true;
        x = hole.pin.x;
        y = hole.pin.y;
        break;
      }
    }
    path.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    if (holed || splashed) break;
    vx *= GOLF_FRICTION;
    vy *= GOLF_FRICTION;
    if (Math.hypot(vx, vy) < GOLF_STOP_SPEED) break;
  }
  if (splashed) {
    // Straight "pulled back to the tee" hop for the final leg of the
    // animation — same path-array mechanism as any other roll, just its
    // last stop is the tee instead of wherever it would have settled.
    x = hole.tee.x;
    y = hole.tee.y;
    path.push({ x, y });
  }
  return { path, endX: x, endY: y, holed, splashed };
}
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
  missingClub: { qIndex: null, redoNonce: null, answeredQIndex: null, myChoice: null, pending: null, choices: null },
  guess: { pIndex: null, redoNonce: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null },
  revealStarted: false,
  // Host-only "break glass" panel — see renderHostPanel/hostRedoCurrentItem.
  // Kept collapsed by default so it's out of the way on every screen but
  // one tap away for the entire party, not just while ?dev=1 testing.
  hostPanel: { open: false, showScores: false },
  missingClubBotScheduled: {}, // `${botId}-${qIndex}` -> true, so a bot isn't scheduled twice
  botShooterScheduledFor: null,
  botKeeperScheduledFor: null,
  golfBotScheduled: {}, // `${holeIndex}:${botId}:${strokes}` -> true, so a bot's turn isn't scheduled twice
  shootoutAnim: { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, impactShown: false, finalizing: false },
  golf: {
    holeIndex: null,
    redoNonce: null,
    subPhase: "ready", // "ready" | "dragging" | "recap"
    lastShot: null,
    // Live-drag fields — mutated directly during pointermove WITHOUT going
    // through render() (see the "dragging bypasses render()" note near
    // golfPointerMove). ballPos/courseRect are captured once at drag start.
    dragPointerId: null,
    ballPos: null,
    courseRect: null,
    startClient: null,
    currentClient: null,
  },
  golfBallAnim: {}, // playerId -> {x, y} currently-displayed position, for the animated slide
  golfAnim: { key: null, revealed: false },
  practice: {
    subPhase: "ready", // "ready" | "dragging" | "recap"
    lastShot: null,
    dragPointerId: null,
    ballPos: null,
    courseRect: null,
    startClient: null,
    currentClient: null,
  },
  practiceBallAnim: {}, // separate from golfBallAnim so switching screens can't cross-contaminate the slide animation
  practiceSession: null, // tracks room.game_state.golfPractice.session — see ensurePracticeReady
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
  APP_EL.addEventListener("pointerdown", onPointerDown);
  APP_EL.addEventListener("pointermove", onPointerMove);
  APP_EL.addEventListener("pointerup", onPointerUp);
  APP_EL.addEventListener("pointercancel", onPointerCancel);
}

// ── golf drag-to-shoot: event routing ───────────────────────
// Delegated on APP_EL like click/submit above. Routes by room status
// (real round vs. driving range) on pointerdown, then by which of the two
// screens actually owns the active pointerId for move/up/cancel — at most
// one of golf/practice drag state is ever active at a time.
function onPointerDown(e) {
  const courseEl = e.target.closest(".golf-course");
  if (!courseEl) return;
  if (room?.status === "golf") golfPointerDown(courseEl, e);
  else if (room?.status === "golf-practice") practicePointerDown(courseEl, e);
}
function onPointerMove(e) {
  if (e.pointerId === local.golf.dragPointerId) golfPointerMove(e);
  else if (e.pointerId === local.practice.dragPointerId) practicePointerMove(e);
}
function onPointerUp(e) {
  if (e.pointerId === local.golf.dragPointerId) golfPointerUp();
  else if (e.pointerId === local.practice.dragPointerId) practicePointerUp();
}
function onPointerCancel(e) {
  if (e.pointerId === local.golf.dragPointerId) golfPointerCancel();
  else if (e.pointerId === local.practice.dragPointerId) practicePointerCancel();
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
    // UPDATE/DELETE only ever happen via the host's Edit/Void score panel
    // (see hostEditScore/hostVoidScore) — but every client, not just the
    // host, needs to hear about it: the combined leaderboard and draft
    // order everyone sees depend on these rows.
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "scores", filter: `room_code=eq.${code}` },
      (payload) => {
        const row = scores.find((s) => s.id === payload.new.id);
        if (row) Object.assign(row, payload.new);
        render();
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "scores", filter: `room_code=eq.${code}` },
      (payload) => {
        scores = scores.filter((s) => s.id !== payload.old.id);
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
  if (action === "leave") return leaveRoom();
  if (action === "dev-quickstart") return devQuickStart(btn.dataset.status);
  if (action === "toggle-host-panel") {
    local.hostPanel.open = !local.hostPanel.open;
    return render();
  }

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
  if (action === "show-guess-intro") return updateRoom({ status: "guess-intro" });
  if (action === "show-golf-intro") return updateRoom({ status: "golf-intro" });
  if (action === "show-golf-practice") return showGolfPractice();
  if (action === "start-golf") return startGolf();
  if (action === "golf-next-hole") return golfNextHole();
  if (action === "reveal") return updateRoom({ status: "reveal" });
  if (action === "dev-jump") return devJump(btn.dataset.status);

  // Host recovery controls — see the "host recovery controls" section
  // (above the dev-mode section) for what each of these actually does.
  if (action === "host-redo-item") return hostRedoCurrentItem();
  if (action === "host-force-finish") return forceFinishShootoutMatch(btn.dataset.winner);
  if (action === "host-edit-score") {
    const input = document.getElementById(`score-input-${btn.dataset.id}`);
    const points = Number(input?.value);
    return hostEditScore(btn.dataset.id, points);
  }
  if (action === "host-void-score") return hostVoidScore(btn.dataset.id);
  if (action === "toggle-host-scores") {
    local.hostPanel.showScores = !local.hostPanel.showScores;
    return render();
  }
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
  // redoNonce changes when the host uses "Redo this question" on the SAME
  // qIndex — bumping it forces every client to drop its local "already
  // answered" flag and re-render fresh choices, same as a real qIndex change
  // would. See hostRedoCurrentItem.
  if (local.missingClub.qIndex !== gs.qIndex || local.missingClub.redoNonce !== (gs.redoNonce || 0)) {
    local.missingClub.qIndex = gs.qIndex;
    local.missingClub.redoNonce = gs.redoNonce || 0;
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
  // See the matching comment in ensureMissingClubReady — redoNonce forces a
  // fresh local state even when the host redoes the same pIndex.
  if (local.guess.pIndex !== gs.pIndex || local.guess.redoNonce !== (gs.redoNonce || 0)) {
    local.guess.pIndex = gs.pIndex;
    local.guess.redoNonce = gs.redoNonce || 0;
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

// While solo-testing in dev mode, have any dev bots lock in an answer a
// beat after each question appears — same idea as ensureBotAutoPick for
// the shootout. Bots pick a random choice (not necessarily correct, same
// as a real random guesser would); this only needs a `scores` insert,
// unlike the shootout's picks, since "who's answered" is already derived
// from the scores table via answeredPlayerIds().
function ensureMissingClubBotAnswer() {
  if (!DEV_MODE) return;
  const gs = room.game_state || {};
  if (gs.qIndex === undefined) return;
  const answeredIds = answeredPlayerIds(1, gs.qIndex);
  for (const bot of players.filter((p) => isDevBot(p) && !answeredIds.has(p.id))) {
    scheduleMissingClubBotAnswer(bot, gs.qIndex);
  }
}

function scheduleMissingClubBotAnswer(bot, qIndex) {
  const key = `${bot.id}-${qIndex}`;
  if (local.missingClubBotScheduled[key]) return;
  local.missingClubBotScheduled[key] = true;
  setTimeout(async () => {
    const gs = room.game_state || {};
    if (gs.qIndex !== qIndex) return; // host already moved on
    if (answeredPlayerIds(1, qIndex).has(bot.id)) return; // already answered somehow
    const entry = window.MISSING_CLUB_PLAYERS[gs.order[qIndex]];
    const choices = [entry.clubs[entry.missingIndex], ...entry.decoys];
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const correct = pick === entry.clubs[entry.missingIndex];
    const points = correct ? MISSING_CLUB_POINTS : 0;
    await sb.from("scores").insert({ room_code: room.code, player_id: bot.id, game_index: 1, round_index: qIndex, points });
  }, 900 + Math.random() * 2200);
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
    // Round order: Missing Club -> Penalty Shootout -> Guess the
    // Footballer -> Football Golf (see the "leaderboard"/"final-
    // leaderboard"/"guess-leaderboard" cases in render() for the rest of
    // the chain). "leaderboard" is Missing Club's own checkpoint now, not
    // a combined quiz screen with Guess the Footballer — those two rounds
    // are no longer adjacent.
    await updateRoom({ status: "leaderboard" });
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
    // "guess-leaderboard", not "leaderboard" — that status is Missing
    // Club's own checkpoint now (see missingClubNext). Guess the
    // Footballer gets its own, distinct one, since the two quiz rounds
    // are no longer back to back in the round order.
    await updateRoom({ status: "guess-leaderboard" });
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
// scaled to whatever the actual player count is. The shootout's max swing
// (80, top to bottom) is deliberately gentler than the independently-scored
// rounds' max swings — Guess the Missing Club's 200 (10 rounds at up to
// 20pts each) and Guess the Footballer's 210 (7 rounds at up to 30pts
// each) — since the shootout is one placement rather than several
// separately-scored rounds. rank is 0-indexed (0 = 1st place).
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
// A fixed 5-hole course, each hole themed after a club, played as actual
// stroke play on a real top-down
// layout, swung with a single drag gesture — no timing, no hidden target,
// just judging distance and angle by eye. Every player has an (x, y)
// position on the hole, starting at the tee, that lives in shared room
// state and updates after every shot (not just the final one), so the
// whole group watches every ball move across the course live. Turn-based,
// one stroke at a time (see golfCurrentTurnPlayerId/turnOrder/turnPos) —
// deliberately so everyone watches everyone else's shots rather than
// racing through their own hole in isolation; a player who finishes early
// just gets skipped in the rotation rather than holding it up. A dev bot
// takes its own turn automatically in DEV_MODE (see ensureGolfBotSwing) so
// solo testing doesn't stall on one.
//
// The drag itself is purely local while it's in progress — see the note
// above golfPointerDown for why it deliberately bypasses render(). Only
// the resolved shot (new position, stroke count) gets written to shared
// state, once per swing.

// `courseRect` is the course element's own on-screen size — dividing by
// it turns the raw pixel drag into a percentage of the course, so results
// are the same shot on a phone or a tablet, not just "same number of
// pixels dragged". The shot fires the OPPOSITE way from the drag —
// slingshot convention: pull back south, the ball goes north (see
// golfSimulateShot for what actually happens to it after that; boundary
// bouncing now lives there too, as part of the real roll).
//
// Just the drag geometry — magnitude/power/angle, no physics. Cheap
// enough to run on every pointermove (for the live power readout); the
// actual shot resolution (golfSimulateShot) only runs once, on release,
// since it's a full physics simulation and the outcome deliberately isn't
// previewed while dragging (see golfPullPreview).
function golfDragVector(courseRect, ballPos, startClient, currentClient) {
  const dxPercent = ((currentClient.x - startClient.x) / courseRect.width) * 100;
  const dyPercent = ((currentClient.y - startClient.y) / courseRect.height) * 100;
  const dragMagnitude = Math.hypot(dxPercent, dyPercent);
  const power = clamp(dragMagnitude / GOLF_MAX_DRAG_PERCENT, 0, 1);
  const angle = Math.atan2(-dyPercent, -dxPercent);
  return { dragMagnitude, power, angle };
}

// The visible pull-back — this is deliberately NOT where the ball is
// going (that's golfDragVector's angle, the opposite direction). Like a real
// slingshot band, this indicator follows your hand: drag south and it
// stretches south, so what you SEE while dragging is the pull, and the
// shot direction only reveals itself on release. Magnitude is capped at
// GOLF_MAX_DRAG_PERCENT — the exact same point power maxes out at (see
// golfDragVector) — so the band stops stretching right at 100%, instead
// of visually inviting a much bigger pull that doesn't add anything.
// Capped independently of the course's own 0-100 bounds, not clamped to
// them — pulling back below the map, or off either side, is normal
// (there's often not enough room on a phone screen to pull back while
// staying inside the box), so the line/dot are allowed to draw outside
// the course entirely; see the matching overflow:visible on .golf-course
// and .golf-aim-svg.
function golfPullPreview(courseRect, ballPos, startClient, currentClient) {
  const dxPercent = ((currentClient.x - startClient.x) / courseRect.width) * 100;
  const dyPercent = ((currentClient.y - startClient.y) / courseRect.height) * 100;
  const dragMagnitude = Math.hypot(dxPercent, dyPercent);
  const cappedMag = Math.min(dragMagnitude, GOLF_MAX_DRAG_PERCENT);
  const scale = dragMagnitude > 0 ? cappedMag / dragMagnitude : 0;
  const pullX = ballPos.x + dxPercent * scale;
  const pullY = ballPos.y + dyPercent * scale;
  return { pullX, pullY };
}

// Applies the live aim preview directly via the DOM, not render() — see
// golfPointerDown. Shared by both the real round and the driving range,
// since they use identical `.golf-aim-*` markup.
let dragVisualRafScheduled = false;
function scheduleDragVisualUpdate(state) {
  if (dragVisualRafScheduled) return;
  dragVisualRafScheduled = true;
  requestAnimationFrame(() => {
    dragVisualRafScheduled = false;
    if (state.subPhase !== "dragging") return; // released mid-frame
    const vec = golfDragVector(state.courseRect, state.ballPos, state.startClient, state.currentClient);
    const pull = golfPullPreview(state.courseRect, state.ballPos, state.startClient, state.currentClient);
    const line = document.querySelector(".golf-aim-line");
    const dot = document.querySelector(".golf-aim-dot");
    const readout = document.querySelector(".golf-power-readout");
    if (line) {
      line.setAttribute("x2", pull.pullX);
      line.setAttribute("y2", pull.pullY);
    }
    if (dot) {
      dot.setAttribute("cx", pull.pullX);
      dot.setAttribute("cy", pull.pullY);
    }
    if (readout) readout.textContent = `Power ${Math.round(vec.power * 100)}%`;
  });
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
  await updateRoom({
    status: "golf",
    game_state: { golf: { holeIndex: 0, results: {}, balls: golfBallsAtTee(GOLF_HOLES[0]), turnOrder: players.map((p) => p.id), turnPos: 0 } },
  });
}

function ensureGolfReady() {
  const gs = room.game_state?.golf;
  if (!gs) return;
  // redoNonce lets "Reset this hole" force every client back to a fresh tee
  // shot on the CURRENT holeIndex, not just on an actual hole change.
  if (local.golf.holeIndex !== gs.holeIndex || local.golf.redoNonce !== (gs.redoNonce || 0)) {
    local.golf = {
      holeIndex: gs.holeIndex,
      redoNonce: gs.redoNonce || 0,
      subPhase: "ready",
      lastShot: null,
      dragPointerId: null,
      ballPos: null,
      courseRect: null,
      startClient: null,
      currentClient: null,
    };
    local.golfBallAnim = {}; // fresh hole — don't animate a cross-course jump from the old one
  }
}

function golfAlreadyAnswered(gs) {
  const me = myPlayer();
  if (!me) return true;
  return (gs.results[me.id] || []).length > gs.holeIndex;
}

function golfBallFor(gs, hole, playerId) {
  return (playerId && gs.balls[playerId]) || { x: hole.tee.x, y: hole.tee.y, strokes: 0, holedOut: false };
}
function golfMyBall(gs, hole) {
  return golfBallFor(gs, hole, myPlayer()?.id);
}

// Whose turn it is right now — one stroke at a time, cycling through
// turnOrder (see golfSubmitShot for how turnPos advances after each
// shot), but SKIPPING anyone who's already holed out on this hole. That's
// the whole trick to "a player who finishes early doesn't get waited on
// again": turnPos itself just always moves to the next raw slot after
// whoever shot, and THIS function is what filters that down to someone
// still actually playing — so once P1 holes out, the rotation quietly
// becomes P2-P3-P2-P3-... without P1 ever coming back up, right up until
// the whole hole's done. Returns null once EVERYONE's holed out (nobody
// left to skip to) — the host's "Next hole" button doesn't depend on this
// and is always available regardless, so that's not a dead end.
function golfCurrentTurnPlayerId(gs) {
  const order = gs.turnOrder || [];
  for (let i = 0; i < order.length; i++) {
    const pid = order[(gs.turnPos + i) % order.length];
    const ball = gs.balls[pid];
    if (ball && !ball.holedOut) return pid;
  }
  return null;
}

// Fires on pointerdown anywhere on the shared course, while it's my turn
// to swing. Deliberately does exactly one render() here (to switch the
// UI into "dragging" mode) and then NONE until the drag ends — every
// pointermove during the drag mutates the aim line's DOM attributes
// directly (scheduleDragVisualUpdate). That's necessary, not just an
// optimization: this app replaces the whole #app subtree on every
// render(), which would destroy and recreate the course element on every
// frame — and pointer capture (setPointerCapture, below) doesn't survive
// its element being removed from the DOM. Re-rendering mid-drag would
// silently break the gesture (and flicker badly besides).
function golfPointerDown(courseEl, e) {
  const gs = room.game_state?.golf;
  if (!gs || golfAlreadyAnswered(gs)) return;
  const me = myPlayer();
  if (!me || golfCurrentTurnPlayerId(gs) !== me.id) return; // not your turn
  if (local.golf.subPhase !== "ready" && local.golf.subPhase !== "recap") return;
  const hole = GOLF_HOLES[gs.holeIndex];
  if (!hole) return;
  e.preventDefault();
  local.golf = {
    ...local.golf,
    subPhase: "dragging",
    ballPos: golfMyBall(gs, hole),
    courseRect: courseEl.getBoundingClientRect(),
    startClient: { x: e.clientX, y: e.clientY },
    currentClient: { x: e.clientX, y: e.clientY },
    dragPointerId: e.pointerId,
  };
  render();
  // Capture on the freshly-rendered element — it'll persist for the rest
  // of the gesture since we won't render() again until pointerup/cancel.
  document.querySelector(".golf-course")?.setPointerCapture(e.pointerId);
}

function golfPointerMove(e) {
  if (local.golf.subPhase !== "dragging") return;
  e.preventDefault();
  local.golf.currentClient = { x: e.clientX, y: e.clientY };
  scheduleDragVisualUpdate(local.golf);
}

async function golfPointerUp() {
  if (local.golf.subPhase !== "dragging") return;
  const { ballPos, courseRect, startClient, currentClient } = local.golf;
  const vec = golfDragVector(courseRect, ballPos, startClient, currentClient);
  // A drag too small to call a real swing (a stray tap, or a touch that
  // barely moved) cancels instead of firing a near-zero shot.
  if (vec.dragMagnitude < GOLF_MIN_DRAG_PERCENT) {
    local.golf = { ...local.golf, subPhase: local.golf.lastShot ? "recap" : "ready", dragPointerId: null };
    render();
    return;
  }
  const gs = room.game_state?.golf;
  const hole = gs && GOLF_HOLES[gs.holeIndex];
  if (!hole) return;
  const sim = golfSimulateShot(hole, ballPos, vec.angle, vec.power);
  await golfSubmitShot({ power: vec.power, ...sim });
}

function golfPointerCancel() {
  if (local.golf.subPhase !== "dragging") return;
  local.golf = { ...local.golf, subPhase: local.golf.lastShot ? "recap" : "ready", dragPointerId: null };
  render();
}

// `shot` is { power, path, endX, endY, holed } — path/endX/endY/holed
// come straight from golfSimulateShot, already resolved against the
// hole's real obstacles, so this function just has to record the result
// and pass the turn along. `botPlayerId` is only set when a dev bot's
// shot is being driven from the host's own device (see
// ensureGolfBotSwing) — omit it for a real player's own shot, which
// defaults to myPlayer().
async function golfSubmitShot(shot, botPlayerId) {
  const me = botPlayerId ? players.find((p) => p.id === botPlayerId) : myPlayer();
  const gs = room.game_state?.golf;
  if (!me || !gs) return;
  // Re-check turn ownership here too, not just at drag-start — the actual
  // enforcement (same reasoning as every other per-player action in this
  // app), so this can't be fired for someone else's turn via devtools.
  if (golfCurrentTurnPlayerId(gs) !== me.id) return;
  const hole = GOLF_HOLES[gs.holeIndex];
  if (!hole) return;
  const currentBall = golfBallFor(gs, hole, me.id);
  const holed = shot.holed;
  const strokes = currentBall.strokes + 1;
  const holedOut = holed || strokes >= GOLF_MAX_STROKES;
  const balls = { ...gs.balls, [me.id]: { x: shot.endX, y: shot.endY, strokes, holedOut, holed, path: shot.path } };

  let results = gs.results;
  if (holedOut) {
    const term = golfScoreTerm(strokes, hole.par);
    const result = { strokes, term, points: GOLF_TERM_POINTS[term] };
    results = { ...gs.results, [me.id]: [...(gs.results[me.id] || []), result] };
  }

  // Advance the raw rotation cursor to the next slot after whoever just
  // shot — golfCurrentTurnPlayerId is what skips over anyone already
  // holed out from here, so this doesn't need to know or care who's
  // actually still playing.
  const order = gs.turnOrder || [];
  const myIdx = order.indexOf(me.id);
  const turnPos = myIdx === -1 ? gs.turnPos : (myIdx + 1) % order.length;

  if (!botPlayerId) {
    // Only touch local drag/recap UI state for our OWN shot — a bot's
    // shot is driven from the host's device but isn't the host's ball.
    local.golf = {
      ...local.golf,
      subPhase: "recap",
      lastShot: { power: shot.power, holed, splashed: shot.splashed },
      dragPointerId: null,
      ballPos: null,
      courseRect: null,
      startClient: null,
      currentClient: null,
    };
  }
  await updateRoom({ game_state: { golf: { ...gs, balls, results, turnPos } } });
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
    await updateRoom({
      game_state: { golf: { ...gs, holeIndex: next, balls: golfBallsAtTee(GOLF_HOLES[next]), turnOrder: players.map((p) => p.id), turnPos: 0 } },
    });
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

// While solo-testing in dev mode, have whichever dev bot's turn it
// currently is take its shot a beat after the turn actually reaches them —
// same idea as ensureBotAutoPick for the shootout. Turn-based play means a
// bot's turn genuinely blocks the whole group now (unlike the old
// everyone-at-once golf, where an idle bot was harmless), so this exists
// to keep solo dev testing moving without the host having to manually
// swing on a bot's behalf. Aims roughly at the pin with some jitter and a
// randomized power — a plausible shot, not a solved one, same spirit as
// the shootout bots picking a random zone.
function ensureGolfBotSwing() {
  if (!DEV_MODE) return;
  const gs = room.game_state?.golf;
  if (!gs) return;
  const turnId = golfCurrentTurnPlayerId(gs);
  const bot = players.find((p) => p.id === turnId && isDevBot(p));
  if (!bot) return;
  const hole = GOLF_HOLES[gs.holeIndex];
  if (!hole) return;
  const strokes = golfBallFor(gs, hole, bot.id).strokes;
  const key = `${gs.holeIndex}:${bot.id}:${strokes}`;
  if (local.golfBotScheduled[key]) return;
  local.golfBotScheduled[key] = true;
  setTimeout(async () => {
    const freshGs = room.game_state?.golf;
    if (!freshGs || freshGs.holeIndex !== gs.holeIndex) return; // host already moved on
    if (golfCurrentTurnPlayerId(freshGs) !== bot.id) return; // no longer their turn (reset, etc.)
    const ballPos = golfBallFor(freshGs, hole, bot.id);
    const dx = hole.pin.x - ballPos.x;
    const dy = hole.pin.y - ballPos.y;
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.6; // aimed at the pin, +/- ~17deg jitter
    const power = 0.55 + Math.random() * 0.4;
    const sim = golfSimulateShot(hole, ballPos, angle, power);
    await golfSubmitShot({ power, ...sim }, bot.id);
  }, 900 + Math.random() * 1400);
}

// ── football golf: driving range ────────────────────────────
// A shared, unscored warm-up screen off the golf launcher — everyone's on
// the same room state together (so everyone genuinely sees everyone), but
// each player's swing is their own repeatable loop: same drag mechanic as
// the real round, always shooting from the same fixed practice tee (not
// cumulative — every swing is a fresh attempt, good for calibrating how
// hard to pull), no strokes/par/results. Only the latest swing per player
// is kept (no history), just enough to see roughly how everyone's doing.
async function showGolfPractice() {
  // `session` gives ensurePracticeReady something to key a fresh
  // local.practiceBallAnim off of — without it, a second driving-range
  // visit would carry over stale tracked positions from the last one
  // (shared `swings` resets to {} here, but the animation trackMap is
  // local-only and wouldn't otherwise know to reset alongside it) and
  // could spuriously animate a ball sliding back to the tee on arrival.
  await updateRoom({ status: "golf-practice", game_state: { golfPractice: { swings: {}, session: Date.now() } } });
}

function ensurePracticeReady() {
  const gs = room.game_state?.golfPractice;
  if (!gs) return;
  if (local.practiceSession !== gs.session) {
    local.practiceSession = gs.session;
    // Pre-seed every player's tracked position at the tee — without
    // this, the real round's balls all start life already recorded in
    // shared state (golfBallsAtTee), so a first shot has something to
    // animate FROM, but practice's `swings` starts genuinely empty, so
    // the very first swing would otherwise have no prior position to
    // compare against and would silently skip its roll animation.
    local.practiceBallAnim = {};
    for (const p of players) local.practiceBallAnim[p.id] = { x: GOLF_PRACTICE_HOLE.tee.x, y: GOLF_PRACTICE_HOLE.tee.y };
  }
}

function practicePointerDown(courseEl, e) {
  if (local.practice.subPhase !== "ready" && local.practice.subPhase !== "recap") return;
  e.preventDefault();
  const gs = room.game_state?.golfPractice || { swings: {} };
  local.practice = {
    ...local.practice,
    subPhase: "dragging",
    ballPos: practiceMyBall(gs),
    courseRect: courseEl.getBoundingClientRect(),
    startClient: { x: e.clientX, y: e.clientY },
    currentClient: { x: e.clientX, y: e.clientY },
    dragPointerId: e.pointerId,
  };
  render();
  document.querySelector(".golf-course")?.setPointerCapture(e.pointerId);
}

function practicePointerMove(e) {
  if (local.practice.subPhase !== "dragging") return;
  e.preventDefault();
  local.practice.currentClient = { x: e.clientX, y: e.clientY };
  scheduleDragVisualUpdate(local.practice);
}

// Same fallback shape as golfMyBall — a player's practice ball rests
// wherever their last swing landed, or the tee if they haven't swung yet.
function practiceMyBall(gs) {
  const me = myPlayer();
  return (me && gs.swings[me.id]) || { x: GOLF_PRACTICE_HOLE.tee.x, y: GOLF_PRACTICE_HOLE.tee.y };
}

async function practicePointerUp() {
  if (local.practice.subPhase !== "dragging") return;
  const { ballPos, courseRect, startClient, currentClient } = local.practice;
  const vec = golfDragVector(courseRect, ballPos, startClient, currentClient);
  const me = myPlayer();
  if (vec.dragMagnitude < GOLF_MIN_DRAG_PERCENT || !me) {
    local.practice = { ...local.practice, subPhase: local.practice.lastShot ? "recap" : "ready", dragPointerId: null };
    render();
    return;
  }
  const sim = golfSimulateShot(GOLF_PRACTICE_HOLE, ballPos, vec.angle, vec.power);
  local.practice = {
    ...local.practice,
    subPhase: "recap",
    lastShot: { power: vec.power, holed: sim.holed, splashed: sim.splashed },
    dragPointerId: null,
    ballPos: null,
    courseRect: null,
    startClient: null,
    currentClient: null,
  };
  render();
  const gs = room.game_state?.golfPractice || { swings: {} };
  // `path` is what makes the ball actually roll on screen (see
  // renderGolfCourse) — same real simulated path as the scored round, not
  // a separate "landing dot" system. The ball rests wherever it lands, so
  // the next swing (see practicePointerDown) drags from there, same as
  // real play — no more separate "always fires from the tee" behavior.
  // Spreading `...gs` (not just replacing with a bare {swings}) matters —
  // it preserves `session`, which ensurePracticeReady depends on to know
  // this ISN'T a fresh driving-range visit; losing it here would reset
  // everyone's tracked ball positions on every single shot.
  await updateRoom({ game_state: { golfPractice: { ...gs, swings: { ...gs.swings, [me.id]: { x: sim.endX, y: sim.endY, holed: sim.holed, splashed: sim.splashed, path: sim.path } } } } });
  // Reached the green — after giving the roll animation time to actually
  // play out, send the ball back to the tee as a real second move (its
  // own write, its own path), so anyone can practice forever. This is
  // deliberately NOT baked into the write above: this room is shared and
  // everyone practicing together triggers renders on each other's
  // devices constantly, so if the write above already claimed the ball
  // was back at the tee, an unrelated render arriving before the pin
  // animation had even played would show it at the tee with no roll at
  // all — or, if the animation HAD already finished, snap it back to the
  // tee out of nowhere the next time anything else caused a re-render.
  if (sim.holed) schedulePracticeReset(me.id);
}

function schedulePracticeReset(playerId) {
  setTimeout(async () => {
    const cur = room.game_state?.golfPractice;
    const mine = cur?.swings?.[playerId];
    // Only reset if they haven't already taken (and landed) a newer
    // swing in the meantime — don't clobber it.
    if (!mine || !mine.holed) return;
    const path = [
      { x: mine.x, y: mine.y },
      { x: GOLF_PRACTICE_HOLE.tee.x, y: GOLF_PRACTICE_HOLE.tee.y },
    ];
    await updateRoom({
      game_state: {
        golfPractice: {
          ...cur,
          swings: { ...cur.swings, [playerId]: { x: GOLF_PRACTICE_HOLE.tee.x, y: GOLF_PRACTICE_HOLE.tee.y, holed: false, path } },
        },
      },
    });
  }, 3300); // longer than the roll's own duration cap (2600ms) plus the sink animation (480ms) so both always finish first
}

function practicePointerCancel() {
  if (local.practice.subPhase !== "dragging") return;
  local.practice = { ...local.practice, subPhase: local.practice.lastShot ? "recap" : "ready", dragPointerId: null };
  render();
}

// ── host recovery controls ──────────────────────────────────
// A small "break glass" panel any host can open on any screen (see
// renderHostPanel) — unlike the ?dev=1 dev bar, this is live at the real
// party, for the failure modes a live event actually produces: someone's
// phone dies mid-match, a mis-tap banks the wrong points, a round-robin
// pairing gets stuck with nobody able to finish it. Three levers:
//   1. Redo the current question/player/match/hole in place.
//   2. Force-finish a stuck round-robin match.
//   3. Edit or void any individual score entry.
// All of it requires isMeHost() (enforced in onClick, same as every other
// room-driving action) and, for scores specifically, an update/delete
// policy on the `scores` table — see schema.sql.

// Dispatches "Redo current item" based on room.status, since what "the
// current item" even means is different per round. Rounds with no live
// per-item state (lobby, intros, leaderboards, reveal) just have nothing to
// redo — renderHostPanel hides the button rather than calling this.
async function hostRedoCurrentItem() {
  if (room.status === "missing-club") return resetMissingClubQuestion();
  if (room.status === "guess") return resetGuessPlayer();
  if (room.status === "shootout") return resetCurrentShootoutMatch();
  if (room.status === "golf") return resetCurrentGolfHole();
}

// Wipes any answers already banked for the CURRENT question and re-hides
// the reveal, without moving qIndex — so it's the same journey, replayed.
// redoNonce (see ensureMissingClubReady) is what makes every client notice,
// even players whose local "I already answered" flag would otherwise still
// be pointed at this exact qIndex.
async function resetMissingClubQuestion() {
  const gs = room.game_state || {};
  if (gs.qIndex === undefined) return;
  await sb.from("scores").delete().eq("room_code", room.code).eq("game_index", 1).eq("round_index", gs.qIndex);
  await updateRoom({ game_state: { ...gs, revealed: false, redoNonce: (gs.redoNonce || 0) + 1 } });
}

// Same idea for Guess the Footballer: wipes this player's banked guesses
// and rewinds the clue reveal back to the first clue.
async function resetGuessPlayer() {
  const gs = room.game_state || {};
  if (gs.pIndex === undefined) return;
  await sb.from("scores").delete().eq("room_code", room.code).eq("game_index", 2).eq("round_index", gs.pIndex);
  await updateRoom({ game_state: { ...gs, clueIndex: 0, redoNonce: (gs.redoNonce || 0) + 1 } });
}

// Restarts the CURRENT shootout match at 0-0 with the same two players —
// for when a pick gets stuck or a phone dies mid-match. Placement points
// aren't touched (finishRoundRobin only writes them once every match is
// decided), so this is safe at any point in a match.
async function resetCurrentShootoutMatch() {
  const gs = room.game_state || {};
  const match = gs.match;
  if (!match) return;
  const fresh = {
    p1: match.p1,
    p2: match.p2,
    rrIndex: match.rrIndex,
    roundIndex: 0,
    turn: "p1",
    shooterPick: null,
    keeperPick: null,
    score: { [match.p1]: 0, [match.p2]: 0 },
    kicksTaken: { [match.p1]: 0, [match.p2]: 0 },
    log: [],
    resetNonce: Date.now(),
  };
  await updateRoom({ game_state: { ...gs, match: fresh } });
}

// Ends the CURRENT match right now with a host-declared winner, using
// whatever score the two players had actually reached — a deliberate
// escape hatch for a match that can't continue (a player had to leave, a
// pick keeps clobbering). Bypasses the normal kick-by-kick animation/finalize
// path entirely and writes the round-robin result directly.
async function forceFinishShootoutMatch(winnerId) {
  const { data: freshRoom } = await sb.from("rooms").select("*").eq("code", room.code).single();
  const gs = freshRoom.game_state;
  const match = gs?.match;
  if (!match) return;
  const roundRobin = gs.roundRobin;
  roundRobin.matches[match.rrIndex] = { ...roundRobin.matches[match.rrIndex], winner: winnerId, score: { ...match.score } };
  await updateRoom({ status: "round-robin", game_state: { roundRobin, match: null } });
}

// Sends every player's ball on the CURRENT hole back to the tee and drops
// any results already banked for it (a player who'd already holed out gets
// to replay it too, along with everyone else) — previous holes are
// untouched. Also resets the turn order back to the top (see
// golfCurrentTurnPlayerId) — this is the escape valve if turn-based play
// ever genuinely gets stuck on one player. redoNonce forces every client's
// local drag/recap state to reset even though holeIndex itself hasn't
// changed (see ensureGolfReady).
async function resetCurrentGolfHole() {
  const gs = room.game_state?.golf;
  if (!gs) return;
  const hole = GOLF_HOLES[gs.holeIndex];
  if (!hole) return;
  const results = {};
  for (const [playerId, list] of Object.entries(gs.results || {})) {
    results[playerId] = list.length > gs.holeIndex ? list.slice(0, gs.holeIndex) : list;
  }
  await updateRoom({
    game_state: {
      golf: {
        ...gs,
        results,
        balls: golfBallsAtTee(hole),
        turnOrder: players.map((p) => p.id),
        turnPos: 0,
        redoNonce: (gs.redoNonce || 0) + 1,
      },
    },
  });
}

// Overwrites one scores row's points in place — for a mis-scored answer or
// shot. `points` comes from the host panel's own number input, already
// parsed by the caller in onClick.
async function hostEditScore(id, points) {
  if (!Number.isFinite(points)) return;
  await sb.from("scores").update({ points }).eq("id", id);
  const row = scores.find((s) => s.id === id);
  if (row) row.points = points; // optimistic on this device — every OTHER client picks up the change via the UPDATE listener in subscribeToRoom
  render();
}

// Deletes one scores row outright — e.g. a duplicate bot answer, or a round
// that should never have counted.
async function hostVoidScore(id) {
  await sb.from("scores").delete().eq("id", id);
  scores = scores.filter((s) => s.id !== id);
  render();
}

// ── dev mode: solo-test any screen without a full lobby ────
function resetLocalGameState() {
  local.missingClub = { qIndex: null, answeredQIndex: null, myChoice: null, pending: null, choices: null };
  local.guess = { pIndex: null, answeredPIndex: null, answeredClueIndex: null, myChoice: null, choices: null };
  local.revealStarted = false;
  local.missingClubBotScheduled = {};
  local.botShooterScheduledFor = null;
  local.botKeeperScheduledFor = null;
  local.golfBotScheduled = {};
  local.shootoutAnim = { matchKey: null, lastLogLength: 0, phase: null, entry: null, kickAnimTriggered: false, impactShown: false, finalizing: false };
  local.golf = {
    holeIndex: null,
    subPhase: "ready",
    lastShot: null,
    dragPointerId: null,
    ballPos: null,
    courseRect: null,
    startClient: null,
    currentClient: null,
  };
  local.golfBallAnim = {};
  local.golfAnim = { key: null, revealed: false };
  local.practice = {
    subPhase: "ready",
    lastShot: null,
    dragPointerId: null,
    ballPos: null,
    courseRect: null,
    startClient: null,
    currentClient: null,
  };
  local.practiceBallAnim = {};
  local.practiceSession = null;
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
  if (status === "missing-club-intro") await ensureDevBotIfNeeded();
  if (status === "missing-club") {
    await ensureDevBotIfNeeded();
    game_state = { order: randomMissingClubOrder(), qIndex: 0, revealed: false };
  }
  if (status === "guess") game_state = { order: randomGuessOrder(), pIndex: 0, clueIndex: 0 };
  if (status === "shootout-intro") await ensureDevBotIfNeeded();
  if (status === "round-robin") {
    await ensureDevBotIfNeeded();
    game_state = { roundRobin: { matches: generateRoundRobinMatches(players.map((p) => p.id)) } };
  }
  // Golf is turn-based (see golfCurrentTurnPlayerId) — a dev bot takes its
  // own turn automatically via ensureGolfBotSwing, so jumping straight
  // here still moves on its own without the host manually swinging for it.
  if (status === "golf-intro") await ensureDevBotIfNeeded();
  if (status === "golf-practice") {
    await ensureDevBotIfNeeded();
    game_state = { golfPractice: { swings: {}, session: Date.now() } };
  }
  if (status === "golf") {
    await ensureDevBotIfNeeded();
    // turnOrder/turnPos are required — without them golfCurrentTurnPlayerId
    // has nothing to iterate and nobody (human or bot) is ever "on turn",
    // which would silently soft-lock a dev-jumped-straight-to-golf room.
    game_state = { golf: { holeIndex: 0, results: {}, balls: golfBallsAtTee(GOLF_HOLES[0]), turnOrder: players.map((p) => p.id), turnPos: 0 } };
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
  // resetNonce changes when the host uses "Reset this match" — folding it
  // into the key forces every client's animation/log-tracking state to
  // reinitialize instead of staying stuck on the pre-reset log length (which
  // would otherwise silently stop future kicks from ever animating again).
  const matchKey = `${match.p1}-${match.p2}-${match.rrIndex}-${match.resetNonce || 0}`;
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
      ensureMissingClubBotAnswer();
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
      html += renderLeaderboard("the missing club round", "show-shootout-intro", "⚽ Continue to Penalty Shootout →");
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
      html += renderLeaderboard("the shootout", "show-guess-intro", "🕵️ Continue to Guess the Footballer →");
      break;
    case "guess-leaderboard":
      html += renderLeaderboard("the footballer round", "show-golf-intro", "⛳ Continue to Football Golf →");
      break;
    case "golf-intro":
      html += renderGolfIntro();
      break;
    case "golf-practice":
      ensurePracticeReady();
      html += renderGolfPractice();
      break;
    case "golf":
      ensureGolfReady();
      ensureGolfAnim();
      ensureGolfBotSwing();
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
    ${isMeHost() ? renderHostPanel() : ""}
    ${DEV_MODE && isMeHost() ? renderDevBar() : ""}`;
}

// Host-only "break glass" controls, visible (collapsed) on every screen for
// the whole party, not just while ?dev=1 testing — see the "host recovery
// controls" section (hostRedoCurrentItem / forceFinishShootoutMatch /
// hostEditScore / hostVoidScore) for what each button actually does.
const GAME_LABELS = { 1: "Missing Club", 2: "Guess the Footballer", 3: "Shootout", 4: "Golf" };
function playerName(id) {
  return players.find((p) => p.id === id)?.name || "?";
}
function hostRedoLabel() {
  const gs = room.game_state || {};
  if (room.status === "missing-club" && gs.qIndex !== undefined) return "🔁 Redo this question";
  if (room.status === "guess" && gs.pIndex !== undefined) return "🔁 Redo this player";
  if (room.status === "shootout" && gs.match) return "🔁 Reset this match to 0–0";
  if (room.status === "golf" && gs.golf) return "🔁 Reset this hole";
  return null;
}
function renderHostPanel() {
  const open = local.hostPanel.open;
  return `
    <div class="host-panel-wrap">
      <button class="host-panel-toggle" data-action="toggle-host-panel">🛠️ Host Controls ${open ? "▲" : "▼"}</button>
      ${open ? renderHostPanelBody() : ""}
    </div>`;
}
function renderHostPanelBody() {
  const redoLabel = hostRedoLabel();
  const match = room.status === "shootout" ? room.game_state?.match : null;
  return `
    <div class="host-panel">
      <div class="host-panel-section">
        <h4>Fix the current round</h4>
        ${
          redoLabel
            ? `<button class="btn" data-action="host-redo-item">${redoLabel}</button>`
            : `<p class="host-panel-note">Nothing live to redo on this screen.</p>`
        }
      </div>
      ${
        match
          ? `<div class="host-panel-section">
              <h4>Force-finish this match</h4>
              <p class="host-panel-note">Ends it right now with the score as it stands (${match.score[match.p1] || 0}–${match.score[match.p2] || 0}) — only for a match that genuinely can't continue.</p>
              <button class="btn host-btn-danger" data-action="host-force-finish" data-winner="${match.p1}">${escapeHtml(playerName(match.p1))} wins now</button>
              <button class="btn host-btn-danger" data-action="host-force-finish" data-winner="${match.p2}">${escapeHtml(playerName(match.p2))} wins now</button>
            </div>`
          : ""
      }
      <div class="host-panel-section">
        <h4>Edit or void scores</h4>
        <button class="btn" data-action="toggle-host-scores">${local.hostPanel.showScores ? "Hide" : "Show"} all score entries (${scores.length})</button>
        ${local.hostPanel.showScores ? renderHostScoreList() : ""}
      </div>
    </div>`;
}
function renderHostScoreList() {
  if (!scores.length) return `<p class="host-panel-note">No scores banked yet.</p>`;
  const rows = scores.slice().sort((a, b) => {
    return a.game_index - b.game_index || (a.round_index ?? 0) - (b.round_index ?? 0) || playerName(a.player_id).localeCompare(playerName(b.player_id));
  });
  return `
    <div class="host-score-list">
      ${rows
        .map(
          (s) => `
        <div class="host-score-row">
          <span class="host-score-who">${escapeHtml(playerName(s.player_id))} <span class="host-panel-note">· ${GAME_LABELS[s.game_index] || `game ${s.game_index}`} R${(s.round_index ?? 0) + 1}</span></span>
          <input type="number" class="host-score-input" id="score-input-${s.id}" value="${s.points}">
          <button class="btn small" data-action="host-edit-score" data-id="${s.id}" title="Save">💾</button>
          <button class="btn small host-btn-danger" data-action="host-void-score" data-id="${s.id}" title="Void">🗑️</button>
        </div>`
        )
        .join("")}
    </div>`;
}

function renderDevBar() {
  const stages = [
    ["lobby", "Lobby"],
    ["party-intro", "Party Intro"],
    ["missing-club-intro", "MC Intro"],
    ["missing-club", "Missing Club"],
    ["leaderboard", "MC Leaderboard"],
    ["shootout-intro", "PK Intro"],
    ["round-robin", "Round Robin"],
    ["final-leaderboard", "Final LB"],
    ["guess-intro", "Guess Intro"],
    ["guess", "Guess"],
    ["guess-leaderboard", "Guess Leaderboard"],
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
      <p class="sub">Guess the missing club, penalty kicks, and guess the footballer — rounds to decide who drafts first.</p>
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
        <button class="dev-btn" data-action="dev-quickstart" data-status="round-robin">⚽ PK Round Robin</button>
        <button class="dev-btn" data-action="dev-quickstart" data-status="guess">🕵️ Guess the Footballer</button>
        <button class="dev-btn" data-action="dev-quickstart" data-status="golf">🏌️ Football Golf</button>
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
        <li><b>🥅 Penalty Shootout</b> — a round-robin of 1v1 shootouts, everyone plays everyone once. Blind, simultaneous shot/dive picks; final standing adds placement points to the leaderboard.</li>
        <li><b>🕵️ Guess the Footballer</b> — a mystery player revealed one clue at a time, most obscure clue first. Guess earlier for more points, but guess wrong and you're frozen out for that round.</li>
        <li><b>⛳ Football Golf</b> — real stroke play over a 5-hole course, each hole themed after a club. Tee off, then keep dragging to shoot, slingshot-style, from wherever you land until it's holed — fewer strokes scores more (eagle down to a bogey). Final total placement adds points too.</li>
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
      <p>Tap the club you think is missing, then hit Confirm to lock it in — no rush, answer whenever you're ready. A side panel shows who's still deciding. Once the host reveals, that same panel shows exactly who got it right and who didn't — everyone's answers are out in the open.</p>

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
              ? `<p class="lock-msg ${answered && myCorrect ? "lock-correct" : "lock-wrong"}">The missing club was <b>${escapeHtml(missingClub)}</b> — ${answered ? (myCorrect ? `you got it! ${MISSING_CLUB_POINTS} points.` : "you didn't get it. 0 points.") : "you didn't answer before the reveal. 0 points."}</p>`
              : answered
                ? `<p class="waiting">Answer locked in. ${isHost ? "" : "Waiting for the reveal…"}</p>`
                : ""
          }
        </div>
        <div class="side-roster">
          <h3>${revealed ? `Results (${correctIds.size}/${players.length} correct)` : `Locked in (${answeredIds.size}/${players.length})`}</h3>
          <ul class="player-list compact">
            ${players
              .map((p) => {
                if (!revealed) return `<li>${answeredIds.has(p.id) ? "🔒" : "⏳"} ${escapeHtml(p.name)}</li>`;
                if (!answeredIds.has(p.id)) return `<li>⚠️ ${escapeHtml(p.name)} — no answer</li>`;
                return `<li>${correctIds.has(p.id) ? "✅" : "❌"} ${escapeHtml(p.name)}</li>`;
              })
              .join("")}
          </ul>
        </div>
      </div>
      ${
        isHost
          ? revealed
            ? `<button class="btn primary" data-action="missing-club-next">${qIndex + 1 >= gs.order.length ? "Show leaderboard" : "Next journey"}</button>`
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

function renderGolfIntro() {
  const me = myPlayer();
  const isHost = me?.is_host;
  return `
    <div class="card">
      <h2>⛳ Football Golf</h2>

      <h3>The format</h3>
      <p>${GOLF_HOLES.length} club-themed holes, real stroke play on a shared top-down course. Players take <b>turns, one stroke at a time</b> — everyone watches every shot land. Fewer strokes is better, same as real golf.</p>

      <h3>How a shot works</h3>
      <p>Press and drag your ball like a slingshot — it fires the <b>opposite</b> way you pull. Pull distance sets power, angle sets direction, no timer. Watch for slopes, sand and water as you read the course.</p>

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
      <p>A hole force-finishes after ${GOLF_MAX_STROKES} strokes so nobody's stuck. Total points across all ${GOLF_HOLES.length} holes decide final placement — same points system as the shootout.</p>

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

function practiceSwingLabel(swing) {
  if (!swing) return "⏳ Hasn't swung yet";
  if (swing.holed) return "🎯 Reached the green!";
  if (swing.splashed) return "💦 In the water";
  const dist = Math.hypot(GOLF_PRACTICE_HOLE.pin.x - swing.x, GOLF_PRACTICE_HOLE.pin.y - swing.y);
  if (dist <= 15) return "👍 Close!";
  if (dist <= 30) return "😬 On the fairway";
  return "🫣 Way off";
}

function renderGolfPractice() {
  const isHost = myPlayer()?.is_host;
  const gs = room.game_state.golfPractice || { swings: {} };
  // The ball itself now renders wherever each player's last swing landed
  // (gs.swings, same shape as the real round's gs.balls) and rolls there
  // on screen via the real simulated path, exactly like the scored round
  // — no more separate "always snaps back to the tee" special case, and
  // no more separate landing-dot markers now that the ball itself shows it.

  let instructions;
  if (local.practice.subPhase === "dragging") {
    instructions = "Release to shoot!";
  } else if (local.practice.subPhase === "recap" && local.practice.lastShot) {
    instructions = local.practice.lastShot.holed
      ? "🎯 Nice, reached the green! Drag again for another go."
      : local.practice.lastShot.splashed
        ? "💦 In the water — back to the tee. Drag again."
        : "Drag again for another practice swing.";
  } else {
    instructions = "No pressure — press and drag your ball to aim, release to shoot, as many times as you like.";
  }

  return `
    <div class="card">
      <h2>🏌️ Driving Range</h2>
      <p class="sub">Practice swings only — nothing here counts. Get a feel for the drag before the real round.</p>
      <p class="sub" style="text-align:center">${instructions}</p>
      <div class="golf-course-wrap practice">
        ${renderGolfCourse(GOLF_PRACTICE_HOLE, gs.swings, local.practiceBallAnim, local.practice, true)}
      </div>
      <h3>Lanes</h3>
      <ul class="player-list compact">
        ${players.map((p) => `<li>${escapeHtml(p.name)}: ${practiceSwingLabel(gs.swings[p.id])}</li>`).join("")}
      </ul>
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
  // Turn-based: one stroke each, cycling round — see golfCurrentTurnPlayerId
  // for how it skips anyone already holed out. turnId is null once
  // everyone's finished the hole.
  const turnId = golfCurrentTurnPlayerId(gs);
  const isMyTurn = !!me && turnId === me.id;
  const turnPlayerName = turnId ? players.find((p) => p.id === turnId)?.name || "?" : null;

  const scoreboardRows = players
    .map((p) => ({
      player: p,
      total: (gs.results[p.id] || []).reduce((sum, r) => sum + r.points, 0),
    }))
    .sort((a, b) => b.total - a.total);

  let instructions;
  if (answered) {
    const myResult = gs.results[me?.id]?.[holeIndex];
    instructions = myResult
      ? `You holed out in ${myResult.strokes} — ${GOLF_TERM_LABEL[myResult.term]} (+${myResult.points} points). ${isHost ? "" : "Waiting for host to continue…"}`
      : isHost
        ? ""
        : "Waiting for host to continue…";
  } else if (local.golf.subPhase === "dragging") {
    instructions = "Release to shoot!";
  } else if (local.golf.subPhase === "recap" && local.golf.lastShot) {
    instructions = local.golf.lastShot.holed
      ? "🎯 In the hole!"
      : local.golf.lastShot.splashed
        ? `💦 In the water! Stroke ${myStrokes} down — back to the tee.`
        : `Stroke ${myStrokes} down.`;
  } else if (isMyTurn) {
    instructions = escapeHtml(hole.description);
  } else {
    instructions = ""; // the turn banner below already says whose go it is
  }

  // Shown to everyone, finished or not, whenever someone still has a turn
  // coming — so spectators always know whose shot to watch (the whole
  // point of turns: everyone can see and learn from every shot, not just
  // their own), not just the player whose turn it actually is.
  const turnBanner = isMyTurn
    ? `<div class="role-banner role-shoot">
        <span class="role-icon">⛳</span>
        <span class="role-text">YOUR SHOT<br><small>Drag your ball to aim, release to shoot</small></span>
      </div>`
    : turnPlayerName
      ? `<p class="waiting">⏳ ${escapeHtml(turnPlayerName)}'s turn — watching…</p>`
      : "";

  const badge = hole.colors
    ? `<div class="golf-club-badge" style="--club-primary:${hole.colors.primary}; --club-secondary:${hole.colors.secondary};">
        <span class="golf-club-crest">${escapeHtml(hole.crest)}</span>
        <span class="golf-club-name">${escapeHtml(hole.club)}</span>
      </div>`
    : "";

  return `
    <div class="card">
      <h2>⛳ Football Golf</h2>
      ${badge}
      ${instructions ? `<p class="sub" style="text-align:center">${instructions}</p>` : ""}
      ${turnBanner}
      ${renderGolfCourse(hole, gs.balls, local.golfBallAnim, local.golf, !answered && isMyTurn)}
      <h3>Totals</h3>
      <ul class="player-list compact">
        ${scoreboardRows.map((r) => `<li>${escapeHtml(r.player.name)}: ${r.total}</li>`).join("")}
      </ul>
      ${renderGolfFinishers(gs, holeIndex, finished)}
      ${
        isHost
          ? `<button class="btn primary" data-action="golf-next-hole">${holeIndex + 1 >= GOLF_HOLES.length ? "🏆 Show final standings" : "Next hole"}</button>`
          : ""
      }
    </div>`;
}

// The shared top-down course — reused for both the real round and the
// driving range, so `ballPositions` is always pre-normalized by the
// caller to {playerId: {x, y, holedOut}}, and `trackMap` is whichever of
// local.golfBallAnim/local.practiceBallAnim belongs to the caller (kept
// separate so switching between the two screens can't cause a stray
// cross-context roll animation).
//
// Ball movement is driven directly via JS/rAF (animateGolfBallFlight),
// NOT CSS — the realtime subscription echoes our own writes back to us
// (Supabase broadcasts to the client that made the change too), so a
// SECOND, redundant render() reliably fires a beat after every shot,
// while the first render's animation is still mid-flight. A CSS
// @keyframes animation gets silently destroyed by that (the redundant
// render recreates the ball element fresh, without replaying the
// animation), which looked like stuttering/teleporting. Direct DOM
// mutation from a self-driving rAF loop — the same technique the PK
// shootout's animateBallFlight already uses successfully — doesn't have
// that problem: it looks up the ball element FRESH when it fires and
// then re-asserts the correct in-flight position every single frame, so
// even if a redundant render briefly snaps it to the final spot, the very
// next frame (~16ms later) corrects it right back.
//
// `dragState` (local.golf or local.practice) drives the live aim-line
// preview while `dragState.subPhase === "dragging"` — the preview itself
// is drawn here (for the initial render when a drag begins) but updated
// afterwards via direct DOM mutation, not further render() calls; see
// golfPointerDown for why.
function renderGolfCourse(hole, ballPositions, trackMap, dragState, canDrag, extraContent = "") {
  // Ground first (slopes — tinted grass the ball rolls over, not through),
  // then solid obstacles on top, matching how they behave: a slope is
  // just terrain, a wall/pillar is really there.
  const slopeEls = (hole.slopes || [])
    .map((s) => {
      const arrow = s.dir === "down" ? "▼" : "▲";
      // Arrow count scales with the zone's own area so a small patch
      // isn't crowded and a big one isn't sparse — the CSS grid
      // (repeat(auto-fit, minmax(...))) wraps them evenly either way.
      const count = clamp(Math.round((s.w * s.h) / 70), 2, 8);
      const arrows = Array(count).fill(`<span>${arrow}</span>`).join("");
      return `<div class="golf-slope ${s.dir}" style="left:${s.x}%; top:${s.y}%; width:${s.w}%; height:${s.h}%;">${arrows}</div>`;
    })
    .join("");
  const sandEls = (hole.sand || [])
    .map((s) => `<div class="golf-sand" style="left:${s.x}%; top:${s.y}%; width:${s.w}%; height:${s.h}%;"></div>`)
    .join("");
  const waterEls = (hole.water || [])
    .map((w) => `<div class="golf-water" style="left:${w.x}%; top:${w.y}%; width:${w.w}%; height:${w.h}%;"></div>`)
    .join("");
  const obstacles = (hole.obstacles || [])
    .map((o) =>
      o.shape === "circle"
        ? `<div class="golf-pillar" style="left:${o.x}%; top:${o.y}%; width:${o.r * 2}%;"></div>`
        : `<div class="golf-wall" style="left:${o.x}%; top:${o.y}%; width:${o.w}%; height:${o.h}%;"></div>`
    )
    .join("");
  const balls = players
    .map((p) => {
      const ball = ballPositions[p.id] || hole.tee;
      const track = trackMap[p.id];
      const holedOut = !!ball.holedOut;
      const holed = !!ball.holed;
      let renderX = ball.x;
      let renderY = ball.y;
      let animating = false;
      if (!track) {
        trackMap[p.id] = { x: ball.x, y: ball.y };
      } else if (track.x !== ball.x || track.y !== ball.y) {
        // A genuinely new landing spot — kick off the flight animation
        // exactly once, then immediately record the new position so a
        // redundant re-render of this same shot (see the note above)
        // can't detect it as "new" again and re-trigger or interrupt it.
        // `ball.path` is the real bounced-off-everything roll from
        // golfSimulateShot; fall back to a straight line only if it's
        // missing (e.g. a hole/practice reset that jumps the ball
        // straight to the tee — nothing to replay there).
        animating = true;
        const from = { x: track.x, y: track.y };
        const to = { x: ball.x, y: ball.y };
        const path = Array.isArray(ball.path) && ball.path.length > 1 ? ball.path : [from, to];
        trackMap[p.id] = { x: ball.x, y: ball.y };
        let totalDist = 0;
        for (let i = 1; i < path.length; i++) totalDist += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
        const durationMs = Math.round(clamp(500 + totalDist * 6, 600, 2600));
        const ballId = `golf-ball-${p.id}`;
        // Deferred one frame: renderGolfCourse only returns a string —
        // the element doesn't exist in the live DOM until render()
        // finishes assigning innerHTML, which happens synchronously
        // AFTER this function returns. rAF fires on the next frame,
        // by which point it does.
        requestAnimationFrame(() => animateGolfBallFlight(ballId, path, durationMs, holed));
        // Paint at the START position right away, so there's no flash at
        // the destination before the rAF loop takes over a frame later.
        renderX = path[0].x;
        renderY = path[0].y;
      }
      // Once a genuinely-holed ball has finished its roll AND its sink
      // animation (see animateGolfBallSink/markGolfBallSunk — `sunk` is
      // only set true once that animation's own rAF loop actually
      // completes), it's gone — don't render it at all, rather than
      // leaving a sunk (but technically still-present) element sitting
      // there. Crucially this does NOT fire just because `animating` is
      // false — the realtime echo of our own write reliably fires a
      // redundant render() a beat later, while the sink is still playing;
      // omitting the element then would rip it out of the DOM mid-animation
      // (the rAF loop's next getElementById would find nothing and give
      // up), which is exactly why the ball used to visibly disappear
      // instead of sinking. Keeping it rendered (frozen at its final spot,
      // since `animating` is false so renderX/renderY are unchanged) lets
      // any redundant render recreate an identical-looking node that the
      // still-running rAF loop picks straight back up next frame.
      const sunk = !!trackMap[p.id]?.sunk;
      if (holed && !animating && sunk) return "";
      return `
        <div id="golf-ball-${p.id}" class="golf-course-ball${holedOut ? " holed" : ""}" style="left:${renderX}%; top:${renderY}%;" title="${escapeHtml(p.name)}">
          <span class="golf-ball-emoji">⚽</span>
          <span class="golf-course-ball-label">${escapeHtml(p.name)}</span>
        </div>`;
    })
    .join("");

  let aimOverlay = "";
  if (dragState?.subPhase === "dragging" && dragState.ballPos) {
    const vec = golfDragVector(dragState.courseRect, dragState.ballPos, dragState.startClient, dragState.currentClient);
    const pull = golfPullPreview(dragState.courseRect, dragState.ballPos, dragState.startClient, dragState.currentClient);
    aimOverlay = `
      <svg class="golf-aim-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line class="golf-aim-line" x1="${dragState.ballPos.x}" y1="${dragState.ballPos.y}" x2="${pull.pullX}" y2="${pull.pullY}"></line>
        <circle class="golf-aim-dot" cx="${pull.pullX}" cy="${pull.pullY}" r="2.2"></circle>
      </svg>
      <p class="golf-power-readout">Power ${Math.round(vec.power * 100)}%</p>`;
  }

  const dragging = dragState?.subPhase === "dragging";
  const colorStyle = hole.colors ? `--club-primary:${hole.colors.primary}; --club-secondary:${hole.colors.secondary};` : "";
  const tint = hole.colors ? `<div class="golf-course-tint"></div>` : "";
  return `
    <div class="golf-course${canDrag ? " draggable" : ""}${dragging ? " dragging" : ""}" style="${colorStyle}">
      ${tint}
      ${slopeEls}
      ${sandEls}
      ${waterEls}
      <div class="golf-tee-mat" style="left:${hole.tee.x}%; top:${hole.tee.y}%;"></div>
      ${obstacles}
      <div class="golf-cup" style="left:${hole.pin.x}%; top:${hole.pin.y}%;"></div>
      <div class="golf-tee-marker" style="left:${hole.tee.x}%; top:${hole.tee.y}%;">📍</div>
      ${extraContent}
      ${balls}
      ${aimOverlay}
    </div>`;
}

// Rolls a ball from `from` to `to` (course-percent coordinates) via direct
// DOM mutation on its own requestAnimationFrame loop — see the note above
// renderGolfCourse for why this has to be JS-driven rather than a CSS
// animation. Looks up the element fresh by id rather than holding a
// reference captured earlier, and re-asserts its position on every frame,
// so it's self-correcting against any redundant render() that happens to
// land mid-flight. Mirrors the PK shootout's animateBallFlight.
// `path` is a full polyline (course-percent waypoints) from
// golfSimulateShot — a real roll with every bounce along the way, not
// just a straight line from A to B. Walks it by arc length (total
// distance travelled, not just point count) so the ball moves at a
// roughly steady pace through however many bounces the shot took.
function animateGolfBallFlight(ballId, path, durationMs, holed) {
  const ballEl = document.getElementById(ballId);
  if (!ballEl || path.length < 2) return;
  const emojiEl = ballEl.querySelector(".golf-ball-emoji");
  const last = path[path.length - 1];
  if (prefersReducedMotion()) {
    ballEl.style.left = last.x + "%";
    ballEl.style.top = last.y + "%";
    if (holed) {
      ballEl.style.display = "none"; // straight to "in the cup", no animation to skip
      markGolfBallSunk(ballId);
    }
    return;
  }
  // Cumulative arc length at each waypoint, so "40% of the way through
  // the animation" means 40% of the actual distance rolled, not just the
  // 40th-percentile waypoint (bounces can bunch waypoints close together).
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  }
  const total = cum[cum.length - 1] || 1;
  const spinDeg = 1080;
  const t0 = performance.now();
  function frame(now) {
    // Re-fetch every frame — if a redundant render replaced the element
    // since the last frame, `ballEl` (captured once, above) would be a
    // detached node with no visual effect; querying fresh means this
    // loop keeps controlling whichever element is actually on screen.
    const el = document.getElementById(ballId) || ballEl;
    const raw = Math.min(1, (now - t0) / durationMs);
    const eased = easeOutQuad(raw);
    const targetDist = eased * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < targetDist) i++;
    const segStart = cum[i - 1];
    const segEnd = cum[i];
    const segT = segEnd > segStart ? (targetDist - segStart) / (segEnd - segStart) : 1;
    const a = path[i - 1];
    const b = path[i];
    const x = a.x + (b.x - a.x) * segT;
    const y = a.y + (b.y - a.y) * segT;
    el.style.left = x + "%";
    el.style.top = y + "%";
    const emoji = el.querySelector(".golf-ball-emoji") || emojiEl;
    if (emoji) emoji.style.transform = `translate(-50%, -50%) rotate(${spinDeg * raw}deg)`;
    if (raw < 1) {
      requestAnimationFrame(frame);
    } else if (holed) {
      animateGolfBallSink(ballId);
    }
  }
  requestAnimationFrame(frame);
}

// Marks a ball's local track entry as genuinely finished sinking — this is
// what tells renderGolfCourse's `sunk` check it's now safe to stop
// rendering the element at all (see the comment there). Deliberately a
// separate flag from `holed`/`holedOut` (which come from shared room
// state and go true the instant the shot resolves): `sunk` is purely
// local, per-device animation-completion state, so every device gets to
// finish playing its own sink animation on its own clock regardless of
// what the room state already says.
function markGolfBallSunk(ballId) {
  const playerId = ballId.replace("golf-ball-", "");
  if (local.golfBallAnim[playerId]) local.golfBallAnim[playerId].sunk = true;
  if (local.practiceBallAnim[playerId]) local.practiceBallAnim[playerId].sunk = true;
}

// The roll has finished right on the pin — drop, shrink and fade the ball
// (and its name tag) down into the cup, with a quick glow on the cup
// itself at the moment it goes in, instead of just leaving it sitting
// there (or, worse, snapping straight to invisible — see the `sunk` note
// in renderGolfCourse for why this used to look like the ball just
// disappearing). Its own short rAF loop (same fresh-lookup-every-frame
// pattern as the roll above) so it's independently safe against a
// redundant render landing mid-sink.
function animateGolfBallSink(ballId) {
  if (prefersReducedMotion()) {
    const el = document.getElementById(ballId);
    if (el) el.style.display = "none";
    markGolfBallSunk(ballId);
    return;
  }
  const t0 = performance.now();
  const sinkMs = 480;
  function frame(now) {
    const el = document.getElementById(ballId);
    if (!el) return; // gone from the DOM (redundant render already settled past it) — nothing left to animate
    const emoji = el.querySelector(".golf-ball-emoji");
    const label = el.querySelector(".golf-course-ball-label");
    const cup = document.querySelector(".golf-cup");
    const raw = Math.min(1, (now - t0) / sinkMs);
    const eased = raw * raw; // ease-IN (accelerating) reads as falling in, not just shrinking in place
    if (emoji) {
      const scale = (1 - eased).toFixed(3);
      const dropPx = (eased * 8).toFixed(1); // a small sink toward the cup's center as it shrinks
      emoji.style.transform = `translate(-50%, calc(-50% + ${dropPx}px)) scale(${scale})`;
      emoji.style.opacity = String(1 - eased);
    }
    if (label) label.style.opacity = String(1 - eased);
    if (cup) {
      // A brief brightening ring right as the ball drops, fading back out
      // by the time it's gone — a small "that just went in" cue on the
      // cup itself, not just the ball vanishing.
      const pulse = raw < 0.4 ? raw / 0.4 : Math.max(0, 1 - (raw - 0.4) / 0.6);
      cup.style.boxShadow = `inset 0 2px 4px rgba(0,0,0,0.9), 0 0 0 2px rgba(255,255,255,${(0.25 + pulse * 0.45).toFixed(2)}), 0 0 ${(pulse * 14).toFixed(1)}px ${(pulse * 4).toFixed(1)}px rgba(255,255,255,${(pulse * 0.35).toFixed(2)})`;
    }
    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      el.style.display = "none";
      if (cup) cup.style.boxShadow = ""; // back to the plain CSS cup — see .golf-cup
      markGolfBallSunk(ballId);
    }
  }
  requestAnimationFrame(frame);
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
  // The "Go to draft tracker" link is in the DOM from the start rather
  // than added later, but hidden (opacity:0, see .reveal-tracker-btn) —
  // startRevealAnimation reveals it via a plain class toggle once the
  // countdown actually finishes, not a render() call. A render() here
  // would replace the whole card, including #reveal-list, which only
  // ever gets its content from direct DOM appends during the animation
  // (see showNext below) — re-rendering mid- or post-animation would
  // wipe it back to empty.
  return `
    <div class="card">
      <h2>🏆 Draft Order</h2>
      <div id="reveal-list" class="reveal-list"></div>
      <a id="draft-tracker-link" class="btn primary reveal-tracker-btn" href="draft-tracker.html?room=${encodeURIComponent(room.code)}">📋 Go to Draft Tracker</a>
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
      document.getElementById("draft-tracker-link")?.classList.add("visible");
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
