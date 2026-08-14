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

// ── side-panel filler for the long stretches waiting on your turn ──
// Two purely cosmetic panels flanking the board (see render()) — neither
// touches picks/scores/anything real, both are just something to look at.
// Left: a fake "breaking news" headline generated for every actual pick
// as it happens (see headlineForPick) — right: a random dad joke on a
// loop (see ensureJokeRotation), completely unrelated to the draft.

// {player}/{drafter}/{team}/{price} get swapped for the real pick's
// details in headlineForPick. Deliberately silly tabloid parody, not
// anything resembling real transfer news.
const FAKE_HEADLINE_TEMPLATES = [
  "BREAKING: {drafter} stuns the football world by prising {player} away from {team} — sources describe the move as 'inevitable'.",
  "{player} spotted browsing houses near {drafter}'s fantasy team after shock £{price}m switch.",
  "EXCLUSIVE: {team} dressing room 'devastated' as {player} completes controversial move to {drafter}'s XI.",
  "{drafter} breaks the bank for {player} — pundits call it 'the transfer nobody saw coming, mainly because it isn't real.'",
  "{player}'s agent seen entering secret talks with {drafter} moments before deadline chaos.",
  "SHOCK: {team} fans launch petition after {player} 'defects' to {drafter}'s fantasy empire.",
  "{drafter} confirms {player} signing with a single cryptic tweet: '👀'.",
  "Transfer deadline drama! {player} completes medical, undergoes immediate name change to '{drafter}'s Player'.",
  "{player} spotted training alone after {team} boss reportedly 'furious' about the {drafter} deal.",
  "OFFICIAL: {drafter} completes sensational £{price}m raid for {player}, sparking chaos on social media.",
  "{team} legends left speechless as {player} trades boots for a spot on {drafter}'s bench.",
  "'It's a statement signing,' says nobody, about {drafter}'s decision to draft {player}.",
  "{player} thanks {team} for the memories in emotional statement — 'time for a new chapter with {drafter}.'",
  "PANIC at {team}! Rivals circle as {drafter} snaps up {player} in a move branded 'ruthless'.",
  "{drafter}'s bold £{price}m gamble on {player} already trending — is this the pick of the century?",
  "Sources close to {player} confirm he 'always dreamed' of playing fantasy football for {drafter}.",
  "{team} chairman spotted staring wistfully at an empty {player} shirt display after the {drafter} deal.",
  "BOMBSHELL: {player} unveiled in {drafter}'s squad, holding a scarf nobody asked him to hold.",
  "{drafter} insists the {player} pick was 'always the plan,' despite audibly panicking thirty seconds earlier.",
  "Breaking: local {team} pub falls silent as {player} confirmed for {drafter}'s fantasy side.",
  "{player} pens heartfelt open letter to {team} fans, then immediately goes live on {drafter}'s bench.",
  "ANALYSIS: is {drafter}'s swoop for {player} genius, madness, or just the only name left on the list?",
  "{team} 'considering their options' after watching {player} walk out the door for {drafter}, apparently.",
  "£{price}m well spent? {drafter} defends the {player} pick as 'a long-term project'.",
  "LOCAL PSYCHIC PREDICTED IT: '{player} to {drafter}' was written on a napkin in 2019 and nobody believed her.",
  "{player} wakes up in {drafter}'s squad with no memory of signing anything, blames 'a very convincing dream'.",
  "UFO sighting over {team}'s training ground turns out to just be {drafter} circling in a helicopter, waiting to pounce on {player}.",
  "{drafter} spends {price}m of the family's actual grocery budget on {player}, insists 'this was always food money'.",
  "SCIENTISTS BAFFLED: {player} now legally recognized as {drafter}'s emotional support footballer.",
  "{team} issue statement clarifying {player} was NOT abducted, merely 'fantasy-drafted', which is somehow worse.",
  "{drafter} builds a small shrine to {player} out of leftover pizza boxes, calls it 'a tribute, not a cry for help'.",
  "Time traveler returns from 2031 with one message: '{drafter} was right about {player} all along.'",
  "{player} spotted wearing a disguise to avoid {drafter}, disguise is just a different {team} shirt.",
  "BREAKING: local goat wanders onto pitch, is somehow more tactically aware than {drafter}'s decision to draft {player}.",
  "{drafter} livestreams the {player} pick to absolutely nobody, later claims it 'broke the internet'.",
  "{team} fans start a conspiracy theory that {player} was replaced by a robot the moment {drafter} drafted him.",
  "£{price}m {player} deal reportedly negotiated entirely via interpretive dance, {drafter} unavailable for comment.",
  "{player} seen googling '{drafter} fantasy team good or bad' at 3am, results inconclusive.",
  "ALIEN INTELLIGENCE ANALYSIS: {drafter}'s pick of {player} rated 'surprisingly competent for a human'.",
  "{drafter} insists the {player} signing came to them 'in a vision', doctors recommend more sleep.",
  "{team} training ground evacuated after {drafter} shows up uninvited to 'get a feel' for {player}.",
  "Small child correctly predicts {drafter} would draft {player}, is immediately hired as a scout.",
  "{player}'s horoscope reportedly said 'beware a bold £{price}m offer', {drafter} sent it anyway.",
  "{drafter} spotted practicing a victory speech for the {player} pick in the bathroom mirror, alone, for twenty minutes.",
  "Council considers renaming a roundabout after the {drafter}-{player} deal, cites 'unprecedented local chaos'.",
  "{team} legend, reached for comment on the {player}-to-{drafter} move, simply said 'no comment' for eleven straight minutes.",
  "{drafter} claims the {player} pick was 'basically free' despite it costing exactly £{price}m, maths department disagrees.",
  "Weather forecasters link unexplained storm directly to {drafter} finally deciding on {player}.",
  "{player} to headline a Netflix documentary titled 'How I Ended Up At {drafter}'s: A Cautionary Tale'.",
  "BREAKING: {drafter}'s neighbours confirm hearing 'incoherent shouting' the exact moment {player} was drafted.",
];

// A deliberately large, generic bank — every joke here is standalone,
// nothing football-specific (that's what the headlines panel is for).
const DAD_JOKES = [
  "Why don't skeletons fight each other? They don't have the guts.",
  "I used to hate facial hair, but then it grew on me.",
  "Why did the scarecrow win an award? He was outstanding in his field.",
  "I'm reading a book about anti-gravity. It's impossible to put down.",
  "Why don't eggs tell jokes? They'd crack each other up.",
  "What do you call a fish with no eyes? A fsh.",
  "I used to be a banker, but I lost interest.",
  "Why did the bicycle fall over? It was two tired.",
  "What do you call a bear with no teeth? A gummy bear.",
  "I'm on a seafood diet. I see food and I eat it.",
  "Why don't scientists trust atoms? Because they make up everything.",
  "What do you call a fake noodle? An impasta.",
  "I would tell you a joke about construction, but I'm still working on it.",
  "Why did the golfer bring two pairs of trousers? In case he got a hole in one.",
  "I only know 25 letters of the alphabet. I don't know y.",
  "What did the ocean say to the beach? Nothing, it just waved.",
  "Why can't you give Elsa a balloon? Because she'll let it go.",
  "I told my wife she was drawing her eyebrows too high. She looked surprised.",
  "What do you call a factory that makes okay products? A satisfactory.",
  "Why did the coffee file a police report? It got mugged.",
  "I'm terrified of elevators, so I'm going to start taking steps to avoid them.",
  "What's brown and sticky? A stick.",
  "Why did the invisible man turn down the job offer? He couldn't see himself doing it.",
  "I used to play piano by ear, but now I use my hands.",
  "What do you call a dinosaur that crashes his car? Tyrannosaurus wrecks.",
  "Why did the math book look sad? It had too many problems.",
  "I've started telling everyone about the benefits of eating dried grapes. It's all about raisin awareness.",
  "What do you call a can opener that doesn't work? A can't opener.",
  "Why don't oysters share their pearls? Because they're shellfish.",
  "I'm reading a horror story in Braille. Something bad is about to happen, I can feel it.",
  "What do you call a group of disorganized cats? A cat-astrophe.",
  "Why did the stadium get hot after the game? All the fans left.",
  "I bought some shoes from a drug dealer. I don't know what he laced them with, but I've been tripping all day.",
  "What do you call cheese that isn't yours? Nacho cheese.",
  "Why did the tomato turn red? Because it saw the salad dressing.",
  "I'm friends with 25 letters of the alphabet. I don't know y.",
  "What do you call a sleeping dinosaur? A dino-snore.",
  "Why did the students eat their homework? Because the teacher said it was a piece of cake.",
  "I have a joke about chemistry, but I don't think it'll get a reaction.",
  "What do you call an alligator in a vest? An investigator.",
  "Why don't skeletons ever go trick or treating? Because they have no body to go with.",
  "I used to hate maths, but I've come to realize decimals have a point.",
  "What did one wall say to the other wall? I'll meet you at the corner.",
  "Why did the picture go to jail? Because it was framed.",
  "I'm on a whiskey diet. I've lost three days already.",
  "What do you call a boomerang that doesn't come back? A stick.",
  "Why did the cookie go to the doctor? Because it felt crummy.",
  "I told a chemistry joke. There was no reaction.",
  "What do you call a pig that does karate? A pork chop.",
  "Why did the belt get arrested? For holding up a pair of trousers.",
  "I only did a partial family tree because I don't have much stamina.",
  "What do you call a snowman with a six-pack? An abdominal snowman.",
  "Why did the man put his money in the freezer? He wanted cold, hard cash.",
  "I'm afraid for the calendar. Its days are numbered.",
  "What do you call a fish wearing a bowtie? Sofishticated.",
  "Why did the cow win an award? Because it was outstanding in its field, moo-ving on.",
  "I have a fear of speed bumps, but I'm slowly getting over it.",
  "What do you call a nervous javelin thrower? Shakespeare.",
  "Why did the barber win the race? He knew a shortcut.",
  "I used to be addicted to soap, but I'm clean now.",
  "What do you call a lazy kangaroo? A pouch potato.",
  "Why did the smartphone go to the optician? It lost its contacts.",
  "I couldn't figure out why the baseball kept getting bigger. Then it hit me.",
  "What do you call a droid that takes the long way round? R2-Detour.",
  "Why do seagulls fly over the sea? Because if they flew over the bay, they'd be bagels.",
  "I bought a pair of shoes for my dog. He wears them all the time and hasn't noticed they're loafers.",
  "What did the janitor say when he jumped out of the closet? Supplies!",
  "Why did the football coach go to the bank? To get his quarterback.",
  "I'm reading a book on the history of glue. Can't seem to put it down.",
  "What do you call a very small mother? A minimum.",
  "Why did the man go on a date with a prune? Because he couldn't find a date.",
  "I asked the librarian if the library had books on paranoia. She whispered, 'they're right behind you.'",
  "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
  "Why do scuba divers fall backwards out of the boat? If they fell forward, they'd still be in the boat.",
  "I got a job at a bakery because I kneaded dough.",
  "What do you call a computer floating in the ocean? A Dell rolling in the deep.",
  "Why did the golf ball wear a jumper? Because it was a little birdie.",
  "I used to be a personal trainer. Then I gave my one week's notice.",
  "What do you call a can crusher in Germany? A Kan-Krusher, obviously.",
  "Why don't melons get married? Because they cantaloupe.",
  "I was going to tell a time-travel joke, but you guys didn't like it.",
  "What do you call a dog magician? A labracadabrador.",
  "Why did the orange stop rolling down the hill? It ran out of juice.",
  "I have a stepladder because my real ladder left when I was a kid.",
  "What do you call a bee that can't make up its mind? A maybe.",
  "Why did the mushroom get invited to all the parties? Because he was a fungi.",
  "I'm not a fan of stairs. They're always up to something.",
  "What did the buffalo say to his kid when he dropped him off at school? Bison.",
  "Why do bees have sticky hair? Because they use honeycombs.",
  "I told my suitcase there'd be no vacation this year. Now I'm dealing with emotional baggage.",
  "What do you call a parade of rabbits hopping backwards? A receding hare-line.",
  "Why did the scarecrow become a successful motivational speaker? He was outstanding in his field, and great at making people scared straight.",
  "I used to work at a shoe recycling shop. It was sole destroying.",
  "What do you call an elephant that doesn't matter? An irrelephant.",
  "Why don't calendars ever get invited to parties? Because their days are numbered.",
  "I have a joke about pizza, but it's too cheesy.",
  "What do you call a fish that needs help with his vocals? Auto-tuna.",
  "Why did the traffic light turn red? You would too if you had to change in the middle of the street.",
  "I ordered a chicken and an egg online. I'll let you know which comes first.",
  "What do you call an amazing pencil drawing of a shrimp? A doodle prawn.",
  "Why don't programmers like nature? It has too many bugs.",
  "I used to be a baker, but I couldn't make enough dough.",
  "What do you call a pony with a sore throat? A little hoarse.",
  "Why did the hipster burn his mouth? He drank his coffee before it was cool.",
  "I'm on a roll this week. It's a bread joke, but I kneaded it.",
  "What did the buffalo say when his son left for college? Bison.",
  "Why do bicycles fall over easily? Because they're two-tired.",
  "I burnt 2000 calories today. I left my pizza in the oven.",
  "What do you call a factory worker who makes okay products? Satisfactory.",
  "Why did the tomato blush? Because it saw the salad dressing change.",
  "I've been to the dentist many times, so I know the drill.",
  "What do you call a sad cup of coffee? A depresso.",
  "Why did the astronaut break up with his girlfriend? He needed space.",
  "I don't trust stairs. They're always up to something.",
  "What do you call a boomerang that won't come back? A stick, and a bit of a disappointment.",
  "Why did the karate teacher run away from her lessons? She wasn't ready for a black belt in cowardice.",
  "I'm reading a book about Stockholm syndrome. It's starting to grow on me.",
  "What did one hat say to the other? Stay here, I'm going on ahead.",
  "Why did the gym close down? It just didn't work out.",
  "I like to tell dad jokes. Sometimes he laughs.",
  "What do you call a can opener that doesn't open cans? A can't opener, and a bit useless.",
  "Why don't skeletons watch scary movies? They don't have the stomach for it.",
  "I got my daughter a fridge for her birthday. I can't wait to see her face light up when she opens it.",
  "What do you call a group of musical whales? An orca-stra.",
  "Why did the belt go to prison? Because it held up a pair of trousers.",
  "I bought some batteries, but they weren't included.",
  "What's a pirate's favorite letter? You'd think it's R, but his true love is the C.",
  "Why did the cookie cry? Because its mother had been away for so long.",
  "I told my wife she should embrace her mistakes. She gave me a hug.",
  "What do you call a nosy pepper? Jalapeño business.",
  "Why did the man run around his bed? Because he was trying to catch up on his sleep.",
  "I've been trying to write a joke about my time management. Never seem to find the time.",
  "What do you call an old snowman? Water.",
  "Why did the golfer bring extra socks? In case he got a hole in one.",
  "I'm friends with all electricians. We have great current relationships.",
  "What do you call a magician's dog? A labracadabrador, and yes, I know I already told this one.",
  "Why did the scientist install a knocker on his door? He wanted to win the No-bell prize.",
  "I used to be indecisive. Now I'm not so sure.",
  "What do you call a very rude mountain? Mount Fuji-erk.",
  "Why did the man name his dogs Rolex and Timex? Because they were watchdogs.",
  "I've decided to sell my vacuum cleaner. It was just collecting dust.",
  "What do you call a poor Santa Claus? St. Nickel-less.",
  "Why did the beach blush? Because the sea weed.",
  "I told my doctor I broke my arm in two places. He told me to stop going to those places.",
  "What do you call a dog that does magic tricks? A labracadabrador. (Really, that's my favorite one.)",
  "Why did the two 4's skip lunch? Because they already 8.",
  "I've just written a song about tortillas. Actually, it's more of a wrap.",
  "What do you call a fish with two knees? A tuna-fin, and I'm sorry.",
  "Why did the man bring a ladder to the bar? He heard the drinks were on the house.",
  "I asked my dog what's two minus two. He said nothing.",
  "What do you call a droid that goes around in circles? R2 detour, again, but it's a classic.",
  "Why don't ants ever get sick? Because they have tiny anti-bodies.",
  "I got fired from the calendar factory. All I did was take a day off.",
  "What do you call a cow with no legs? Ground beef.",
  "Why did the man put his car in the oven? He wanted a hot rod.",
  "I'm on a new diet. It's called 'seafood.' I see food, and I eat it.",
  "What do you call a snowman party? A snowball.",
  "Why did the baker stop making donuts? He was tired of the hole business.",
  "I told my computer I needed a break, and now it won't stop sending me Kit-Kat ads.",
  "What do you call a fake stone in Ireland? A sham rock.",
  "Why did the light bulb fail its exam? It wasn't that bright.",
  "I'm not saying my wife is bossy, but her favorite Spice Girl is Bossy Spice.",
  "What do you call a group of unorganized cows? A moo-ving mess.",
  "Why did the man bring string to the party? So he could tie one on.",
  "I'm so good at sleeping, I can do it with my eyes closed.",
  "What did the drummer call his twin daughters? Anna one, Anna two.",
  "Why did the football team go to the bakery? Because they needed a good roll.",
  "I've just been on a once-in-a-lifetime holiday. Never again.",
  "What do you call a can of soup that doesn't work? Souper broken.",
  "Why did the man get cold looking at his mail? Because it had a lot of static in it.",
  "I quit my job at the helium factory. I refuse to be spoken to in that tone.",
  "What do you call a nervous wreck at a spelling bee? A ner-vous.",
  "Why did the cheese go to the party alone? Because it was grate on its own.",
  "I told my kids I was named after Thomas Jefferson. They said, 'but Dad, your name is Steve.'",
  "What do you call a Frenchman wearing sandals? Philippe Flop.",
  "Why did the melon jump into the lake? It wanted to be a watermelon.",
  "I made a pencil with two erasers. It was pointless.",
  "What do you call an owl who does magic tricks? Hoo-dini.",
  "Why do vegetarians give great presents? Because they're good with the whole grain.",
  "I asked the gym instructor if he could teach me to do the splits. He said, 'how flexible are you?' I said, 'I can't make Tuesdays.'",
  "What do you call a duck that gets all A's? A wise quacker.",
  "Why did the man stare at the frozen orange juice can? Because it said concentrate.",
  "I have a joke about trains, but I think it might derail.",
  "What do you call a bear caught in the rain? A drizzly bear.",
  "Why did the woman put her money in the blender? She wanted to make liquid assets.",
  "I bought the world's worst thesaurus yesterday. Not only is it terrible, it's terrible.",
  "What do you call a fish that plays the guitar? A bass player, obviously.",
  "Why did the man's watch go to jail? It was stealing time.",
  "I was wondering why the ball kept getting bigger. Then it hit me.",
  "What do you call a peanut in a spacesuit? An astro-nut.",
  "Why don't opticians ever finish their sentences? Because they're always making spectacles of themselves.",
  "I got a job at the local gym, but I quit after one day. It just wasn't working out.",
  "What do you call a boat full of friendly people? A friend-ship.",
  "Why did the gardener plant a lightbulb? He wanted to grow a power plant.",
  "I made a belt out of watches once. It was a waist of time.",
  "What do you call a fairy that hasn't had a bath? Stinker Bell.",
  "Why did the man take a pencil to bed? To draw the curtains.",
  "What do you call a super sad strawberry? A blueberry.",
  "Why did the man get a job at the orange juice factory? He heard it was a good squeeze.",
  "I told my friend 10 jokes to make him laugh. Sadly, no pun in ten did.",
];

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
  // Rotates through DAD_JOKES on a timer while waiting for a turn — see
  // ensureJokeRotation. Starts null so the first render can pick an
  // opening joke; jokeTimerStarted guards against setInterval being
  // created again on every render() (this file replaces the whole #app
  // subtree each time, same pattern as the main party app).
  currentJoke: null,
  jokeTimerStarted: false,
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

// Merges into room.game_state rather than replacing it — this page never
// owned that column (the party app does, for its own rounds), so writing
// here has to not clobber whatever's already sitting in it from the
// reveal stage. Only ever used for the headlines/dad-jokes start toggles.
async function updateRoomGameState(patch) {
  const game_state = { ...(room.game_state || {}), ...patch };
  const { data } = await sb.from("rooms").update({ game_state }).eq("code", room.code).select().maybeSingle();
  if (data) room = data;
  render();
}

async function startHeadlines() {
  if (!myPlayer()?.is_host) return;
  await updateRoomGameState({ draftWidgets: { ...(room.game_state?.draftWidgets || {}), headlines: true } });
}
async function startJokes() {
  if (!myPlayer()?.is_host) return;
  await updateRoomGameState({ draftWidgets: { ...(room.game_state?.draftWidgets || {}), jokes: true } });
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
    // Only ever fires from the host's "Undo last pick" (see undoLastPick)
    // — every device, not just the host's, needs to hear about it since
    // whose turn it is and everyone's rosters depend on this table.
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "draft_picks", filter: `room_code=eq.${room.code}` },
      (payload) => {
        picks = picks.filter((p) => p.id !== payload.old.id);
        render();
      }
    )
    // Only used for the headlines/dad-jokes "start" toggles right now (see
    // updateRoom/renderHeadlinesPanel/renderJokesPanel) — the draft itself
    // doesn't touch room.status or game_state at all, that's all still
    // owned by the party app. Every device needs to hear this, not just
    // the host's, since the whole point is the OTHER players' panels
    // switching on together the moment the host starts them.
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${room.code}` },
      (payload) => {
        room = payload.new;
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

// How many of a drafter's roster are at each position — used both to
// render the "X/Y" badges and to actually enforce SQUAD_SHAPE (see
// positionFull), which nothing did before this: a drafter (or a bot) could
// take a 4th FWD or a 6th MID with nothing stopping them, well past what a
// real FPL squad allows.
function positionCounts(roster) {
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pl of roster) counts[pl.pos]++;
  return counts;
}
function positionFull(drafterId, pos) {
  return positionCounts(rosterFor(drafterId))[pos] >= SQUAD_SHAPE[pos];
}

// The one place an actual draft_picks row gets written — used by both a
// human's own click (draftPlayer) and a bot's auto-pick
// (ensureBotAutoPick), so there's exactly one insert/error-handling path
// regardless of who's picking. This is the actual enforcement point for
// "already taken" / "over budget" / "position already full" — draftPlayer
// and randomAffordablePlayer both pre-filter for the same things, but this
// is the real gate, same reasoning as every enforced-not-just-hidden check
// elsewhere in this app.
async function submitPick(plPlayerId, drafterId) {
  const info = currentPickInfo();
  if (info.done || local.submitting) return;
  if (!info.drafter || info.drafter.id !== drafterId) return;
  if (pickedPlayerIds().has(plPlayerId)) return;
  const pl = window.PL_PLAYERS.find((p) => p.id === plPlayerId);
  if (!pl || pl.price > maxAffordableForPick(drafterId) || positionFull(drafterId, pl.pos)) return;
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
  if (pl && positionFull(me.id, pl.pos)) return; // that position's already at SQUAD_SHAPE's cap — same double-check
  await submitPick(plPlayerId, me.id);
}

// Host-only "undo" for a mis-click — deliberately only ever removes the
// MOST RECENT pick, never an arbitrary one. draft_picks.pick_number is
// unique per room, and currentPickInfo() derives whose turn is next purely
// from picks.length, not by inspecting actual pick_number values — voiding
// anything other than the last pick would leave a gap, and the next
// insert's computed pick_number would then collide with a later pick that
// was never deleted (a real unique_violation, not a cosmetic issue).
// Removing the last one instead just cleanly decrements the count, which
// is also exactly the case this exists for: undo immediately after a
// mistake, not rewrite history.
async function undoLastPick() {
  if (!myPlayer()?.is_host) return;
  if (!picks.length) return;
  const last = picks[picks.length - 1];
  const { error } = await sb.from("draft_picks").delete().eq("id", last.id);
  if (error) {
    local.error = `Couldn't undo that pick: ${error.message || error.code || "unknown error"}.`;
  }
  // The bot-scheduling guard is keyed by pick number (see
  // ensureBotAutoPick) — after undo, the CURRENT pick number goes right
  // back to the one that was just undone, which local.botScheduledForPick
  // may already be marked as "handled" for. Clearing it lets a bot's turn
  // get rescheduled properly instead of silently never re-picking.
  local.botScheduledForPick = null;
  await loadPicks();
  render();
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
  const counts = positionCounts(rosterFor(drafterId));
  const openPositions = POSITIONS.filter((pos) => counts[pos] < SQUAD_SHAPE[pos]);
  const pool = window.PL_PLAYERS.filter((p) => !taken.has(p.id) && p.price <= maxPrice && openPositions.includes(p.pos));
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
  if (btn.dataset.action === "undo-last-pick") undoLastPick();
  if (btn.dataset.action === "start-headlines") startHeadlines();
  if (btn.dataset.action === "start-jokes") startJokes();
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

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Deterministic per pick — seeded off pick_number + the actual player id
// (both already on the row), so every device shows the EXACT same
// headline for the exact same pick without needing a new column to store
// it in. Re-derived fresh each render, not cached, since it's cheap and
// pick_number/pl_player_id never change once a row exists.
function headlineForPick(pick) {
  const pl = window.PL_PLAYERS.find((p) => p.id === pick.pl_player_id);
  const drafter = players.find((p) => p.id === pick.drafter_id);
  if (!pl || !drafter) return null;
  const seed = hashSeed(`${pick.pick_number}-${pick.pl_player_id}`);
  const template = FAKE_HEADLINE_TEMPLATES[seed % FAKE_HEADLINE_TEMPLATES.length];
  return template
    .replaceAll("{player}", pl.name)
    .replaceAll("{drafter}", drafter.name)
    .replaceAll("{team}", pl.team)
    .replaceAll("{price}", pl.price);
}

// Both panels stay off (host-only "Start" button, non-host sees a waiting
// message) until the host explicitly switches them on — added so Craig
// can walk everyone through the actual draft first without a headline or
// a random joke landing mid-explanation. game_state.draftWidgets is
// shared room state (see updateRoomGameState/subscribe's rooms UPDATE
// listener), so one host click turns it on for every device at once, not
// just the host's own.
const HEADLINES_SHOWN = 12; // most recent picks only — a full 75-pick draft doesn't need every headline ever generated sitting in the DOM
function renderHeadlinesPanel() {
  const isHost = !!myPlayer()?.is_host;
  if (!room.game_state?.draftWidgets?.headlines) {
    return `
      <div class="card draft-side-card">
        <h3>📰 Breaking News</h3>
        ${
          isHost
            ? `<p class="sub">Off for now — start it whenever you're ready.</p><button class="btn" data-action="start-headlines">▶️ Start Breaking News</button>`
            : `<p class="waiting">Waiting for the host to start this…</p>`
        }
      </div>`;
  }
  const recent = picks
    .slice()
    .reverse()
    .slice(0, HEADLINES_SHOWN)
    .map(headlineForPick)
    .filter(Boolean);
  return `
    <div class="card draft-side-card">
      <h3>📰 Breaking News</h3>
      <p class="sub">Made up, every word.</p>
      ${
        recent.length
          ? `<ul class="draft-headline-list">${recent.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
          : `<p class="waiting">Headlines roll in as picks happen…</p>`
      }
    </div>`;
}

function renderJokesPanel() {
  const isHost = !!myPlayer()?.is_host;
  if (!room.game_state?.draftWidgets?.jokes) {
    return `
      <div class="card draft-side-card">
        <h3>😂 Dad Jokes</h3>
        ${
          isHost
            ? `<p class="sub">Off for now — start it whenever you're ready.</p><button class="btn" data-action="start-jokes">▶️ Start Dad Jokes</button>`
            : `<p class="waiting">Waiting for the host to start this…</p>`
        }
      </div>`;
  }
  if (!local.currentJoke) local.currentJoke = DAD_JOKES[Math.floor(Math.random() * DAD_JOKES.length)];
  return `
    <div class="card draft-side-card">
      <h3>😂 Dad Jokes</h3>
      <p id="dad-joke-text" class="draft-joke-text">${escapeHtml(local.currentJoke)}</p>
    </div>`;
}

const DAD_JOKE_INTERVAL_MS = 15000;
// Rotates the joke on a timer via direct DOM mutation, not a full
// render() — a plain text swap doesn't need the whole board torn down and
// rebuilt every 9 seconds (that would reset scroll position, interrupt
// typing in the search box, etc. — same "don't re-render for a cosmetic
// loop" reasoning as the party app's ball-flight animations).
// jokeTimerStarted guards this so it only ever creates ONE interval for
// the page's whole lifetime, no matter how many times render() itself
// runs afterward.
function ensureJokeRotation() {
  if (local.jokeTimerStarted) return;
  local.jokeTimerStarted = true;
  setInterval(() => {
    const el = document.getElementById("dad-joke-text");
    if (!el) return;
    let next = local.currentJoke;
    while (next === local.currentJoke && DAD_JOKES.length > 1) {
      next = DAD_JOKES[Math.floor(Math.random() * DAD_JOKES.length)];
    }
    local.currentJoke = next;
    el.classList.remove("joke-fade-in");
    void el.offsetWidth; // restart the CSS fade-in animation from scratch
    el.textContent = next;
    el.classList.add("joke-fade-in");
  }, DAD_JOKE_INTERVAL_MS);
}

function render() {
  if (!room) {
    APP_EL.innerHTML = renderNoRoom();
    return;
  }
  APP_EL.innerHTML = renderTopBar() + `
    <div class="draft-layout">
      <aside class="draft-side draft-side-left">${renderHeadlinesPanel()}</aside>
      <div class="draft-main">${renderBoard()}</div>
      <aside class="draft-side draft-side-right">${renderJokesPanel()}</aside>
    </div>`;
  ensureBotAutoPick();
  ensureJokeRotation();
}

function renderTopBar() {
  const isHost = !!myPlayer()?.is_host;
  return `
    <div class="topbar">
      <span class="room-pill">Room <b>${escapeHtml(room.code)}</b></span>
      ${isHost ? `<a class="link-btn" href="index.html">Back to party</a>` : ""}
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
    ${renderMyTeamButton(me)}
    ${renderRosters(info)}
    ${renderFilters()}
    ${renderPlayerList(info, me)}
    ${renderHostUndo(me)}
  `;
}

// A shortcut straight into renderSquadView for THIS device's own drafter —
// same "see-squad" action every roster card's "See full team" button
// already uses, just pre-aimed at `me` instead of needing to find your own
// card in the Rosters list first. Each device sees only its own player
// here (myPlayer() is derived from this browser's stored session), so
// Player 2's device shows Player 2's team, Player 3's shows Player 3's.
function renderMyTeamButton(me) {
  if (!me) return "";
  return `<button class="btn primary" data-action="see-squad" data-id="${me.id}">👕 My Team</button>`;
}

// Host-only "undo last pick" — see undoLastPick for why this is scoped to
// only the most recent pick. Kept at the very bottom of the board,
// deliberately out of the way of the normal picking flow (it was up by
// the turn banner originally — too jarring to see on every render).
function renderHostUndo(me) {
  if (!me?.is_host || !picks.length) return "";
  const last = picks[picks.length - 1];
  const pl = window.PL_PLAYERS.find((p) => p.id === last.pl_player_id);
  const drafter = players.find((p) => p.id === last.drafter_id);
  return `
    <div class="card dt-host-undo">
      <p class="sub" style="margin:0 0 8px">Last pick: <b>${escapeHtml(pl?.name || "?")}</b> by ${escapeHtml(drafter?.name || "someone")}</p>
      <button class="btn host-btn-danger" data-action="undo-last-pick">↩️ Undo last pick</button>
    </div>`;
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
            const counts = positionCounts(roster);
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
  const myCounts = myTurn ? positionCounts(rosterFor(me.id)) : null;

  return `
    <div class="card">
      <h3>Players${filtered.length ? ` (${filtered.length})` : ""}</h3>
      ${POSITION_SECTIONS.map((section) => {
        const posFull = !!myCounts && myCounts[section.pos] >= SQUAD_SHAPE[section.pos];
        return renderPositionSection(section, filtered, taken, myTurn, maxPrice, posFull);
      }).join("")}
    </div>`;
}

function renderPositionSection(section, filtered, taken, myTurn, maxPrice, posFull) {
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
        <span class="dt-pos-section-count">${myTurn && posFull ? "Full" : `${remaining} left`}</span>
      </summary>
      <div class="dt-player-list">
        ${shown.length ? shown.map((p) => renderPlayerRow(p, taken, myTurn, maxPrice, posFull)).join("") : `<p class="sub" style="padding:10px 12px">No players match.</p>`}
      </div>
      ${total > RENDER_CAP_PER_SECTION ? `<p class="sub" style="padding:8px 12px 0">+${total - RENDER_CAP_PER_SECTION} more — narrow your search to see them.</p>` : ""}
    </details>`;
}

function renderPlayerRow(p, taken, myTurn, maxPrice, posFull) {
  const takenPick = taken.has(p.id) ? picks.find((pk) => pk.pl_player_id === p.id) : null;
  const takenBy = takenPick ? players.find((pl) => pl.id === takenPick.drafter_id) : null;
  const affordable = p.price <= maxPrice;
  const canDraft = myTurn && !posFull && affordable;
  return `
    <div class="dt-player-row${takenPick ? " taken" : ""}${!takenPick && myTurn && !canDraft ? " unaffordable" : ""}">
      <span class="dt-player-name">${escapeHtml(p.name)}</span>
      <span class="dt-player-team sub">${escapeHtml(p.teamShort)}</span>
      <span class="dt-player-price">${fmtMoney(p.price)}</span>
      ${
        takenPick
          ? `<span class="dt-taken-by">${escapeHtml(takenBy?.name || "someone")}</span>`
          : canDraft
            ? `<button class="dt-draft-btn" data-action="draft" data-id="${p.id}">Draft</button>`
            : myTurn && posFull
              ? `<span class="dt-taken-by sub">Position full</span>`
              : myTurn && !affordable
                ? `<span class="dt-taken-by sub">Over budget</span>`
                : `<span class="dt-taken-by sub">—</span>`
      }
    </div>`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
