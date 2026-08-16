// ============================================================
// Type Squadron — a formation shooter for touch typists
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const menuEl = document.getElementById("menu");
const gameoverEl = document.getElementById("gameover");
const gameoverTitleEl = document.getElementById("gameover-title");
const finalStatsEl = document.getElementById("final-stats");
const settingsEl = document.getElementById("settings");
const settingsTitleEl = document.getElementById("settings-title");
const menuDiffEl = document.getElementById("menu-diff");
const menuBestEl = document.getElementById("menu-best");
const scoreListEl = document.getElementById("score-list");
const newBestEl = document.getElementById("new-best");
const quitBtn = document.getElementById("quit-btn");

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

// ---- Tuning constants ----
const PLAYER_R = 14;
// The background is a painting with a console printed across its foot, so the
// playfield is letterboxed to its shape. W and H are then set to the stage's
// own size and everything is drawn translated into it — which means every
// formation, entry path and lane in this file keeps working in the
// coordinates it was already written in.
const STAGE_AR = 1672 / 941;
const CONSOLE_H = 0.185;        // fraction of the stage the painted console owns
const PLAYER_BOTTOM_F = 0.235;  // player lane, as a fraction above the stage foot
const BULLET_SPEED = 900;
const INVULN_TIME = 2.2;
const STARTING_LIVES = 3;
const MAX_PARTICLES = 700;
const MAX_ENEMIES = 20;
const STREAK_PER_MULT = 20;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;     // seconds the struck-out key stays on the guide
const ASSIST_MISSES = 3;     // consecutive misses before the guide steps in
const ASSIST_FADE_IN = 0.18; // appears quickly, so it is there when wanted
const ASSIST_FADE_OUT = 0.7; // leaves slowly, so it is not snatched away
const JUKE_TIME = 0.16;      // how long the sideways burst lasts
const JUKE_DIST = 140;       // px covered by one juke
const JUKE_IFRAMES = 0.5;    // untouchable window it buys
const JUKE_CHARGES = 2;      // an attack run is usually two threats: the diver
                             // and the shot trailing it about a second behind,
                             // so one dodge can never cover both
const JUKE_REFILL = 2.6;     // seconds to regain one charge (default)
const JUKE_HOLD = 0.8;       // hold the dodged position instead of drifting
                             // straight back into the shot that is still coming
const ENTRY_GROUP = 4;          // ships per entry flight
const BEAM_CHARGE = 1.7;        // seconds before a tractor beam catches

// ---- Settings & scores (own keys so Blaster's data is untouched) ----
const SETTINGS_KEY = "typesentinel3030-settings";
const SCORES_KEY = "typesentinel3030-scores";
const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  difficulty: "normal", wordSet: "all", musicOn: true, musicVol: 50, sfxVol: 70,
  keyboardGuide: "off",   // "off" | "assist" | "always"
};
let settings = { ...DEFAULT_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (saved && typeof saved === "object") {
    // The keyboard guide briefly shipped defaulting to on, so pre-v2 saves may
    // carry `true` that the player never chose — drop it and let the default
    // apply. From v2 to v3 the setting became a mode rather than a flag.
    if (saved.v === undefined) delete saved.keyboardGuide;
    else if (saved.v < 3 && typeof saved.keyboardGuide === "boolean") {
      saved.keyboardGuide = saved.keyboardGuide ? "always" : "off";
    }
    settings = { ...DEFAULT_SETTINGS, ...saved, v: SETTINGS_VERSION };
  }
} catch (e) { /* corrupted or unavailable storage: fall back to defaults */ }

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

function scoresFor(difficulty) {
  return loadScores()
    .filter(s => s.difficulty === difficulty)
    .sort((a, b) => b.score - a.score);
}

// Keeps each difficulty's own top runs, so one strong Master streak can't
// push every Beginner entry out of the table.
function recordScore(entry) {
  const all = loadScores();
  all.push(entry);
  const kept = [];
  for (const key of Object.keys(DIFFICULTY_LEVELS)) {
    kept.push(...all.filter(s => s.difficulty === key)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 10));
  }
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(kept)); } catch (e) {}
  // Re-read rather than reusing `entry`: storage round-trips through JSON, so
  // the stored row is a different object. Match on the timestamp instead.
  return scoresFor(entry.difficulty)
    .findIndex(s => s.date === entry.date && s.score === entry.score);
}

// ---- Difficulty ----
// Ranges run from wave 1 to wave 8; `beamWave` is the first wave on which a
// boss may fire a tractor beam, and `rescue` is how long you get to escape it.
// Two defensive assists, both scaled by difficulty:
//   `autoEvade` — the ship steers itself around shots and divers
//   `grace`     — a correct keystroke buys this many seconds of immunity
// The lower levels hand both to the player. The top levels withdraw them, so
// staying alive there means using the space-bar juke yourself.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", cols: [4, 5], rows: [2, 2], entry: 2.0, dive: [7.0, 5.0], bullet: 120, fire: 0.25, beamWave: 99, rescue: 6.0, grace: 0.80, autoEvade: true },
  easy:     { label: "EASY",     cols: [4, 6], rows: [2, 3], entry: 1.8, dive: [6.0, 4.0], bullet: 145, fire: 0.40, beamWave: 5,  rescue: 5.5, grace: 0.55, autoEvade: true },
  normal:   { label: "NORMAL",   cols: [5, 7], rows: [2, 3], entry: 1.6, dive: [5.0, 3.0], bullet: 175, fire: 0.55, beamWave: 3,  rescue: 5.0, grace: 0.30, autoEvade: true },
  hard:     { label: "HARD",     cols: [6, 7], rows: [3, 3], entry: 1.4, dive: [4.0, 2.2], bullet: 205, fire: 0.70, beamWave: 2,  rescue: 4.5, grace: 0, autoEvade: false, jukeRefill: 2.2 },
  master:   { label: "MASTER",   cols: [6, 8], rows: [3, 3], entry: 1.2, dive: [3.0, 1.6], bullet: 240, fire: 0.85, beamWave: 2,  rescue: 4.0, grace: 0, autoEvade: false, jukeRefill: 2.0 },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentWordSet = () => WORD_SETS[settings.wordSet] || WORD_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

// ---- Palette ----
// Fully saturated neon against a near-black ground. Electric colour is a
// contrast effect as much as a hue one: the darker and less tinted the
// background, the more these read as emitting light rather than reflecting it.
// Each entry sits squarely on its own hue rather than between two, so blue
// reads as blue instead of drifting into cyan, and purple as purple instead
// of into magenta.
const NEON = {
  blue: "#1E5BFF",
  cyan: "#00D0FF",
  purple: "#9D00FF",
  magenta: "#FF0090",
  orange: "#FF6A00",
  yellow: "#FFD400",
  lime: "#7CFF3D",
  white: "#FFFFFF",
};

// ---- Enemy types ----
// Every ship is built from two neighbouring pure hues — body and wings — and
// `hot` is a LIGHT TINT OF ITS OWN HUE, never a near-white. Grading a highlight
// toward white pulls the saturation out of the top of the shape, which is what
// stops a yellow from looking properly yellow.
// The three roles are unchanged — same radii, same points, same behaviour —
// but each now wears one of the sheet's designs. A wave picks one design per
// role and holds it, so the types stay tellable apart within a wave while the
// whole roster of thirteen gets an outing across a run.
const TYPES = {
  bee:       { r: 15, pts: 60,  glow: "#FFA800", body: "#FFD400", accent: "#FF6A00", scale: 2.5 },
  butterfly: { r: 17, pts: 100, glow: "#FF2DB0", body: "#FF0090", accent: "#9D00FF", scale: 2.6 },
  boss:      { r: 22, pts: 250, glow: "#00A8FF", body: "#00D0FF", accent: "#1E5BFF", scale: 3.1 },
};

// Which sprite each role is wearing this wave.
let design = { bee: "drone", butterfly: "manta", boss: "widow" };

function pickDesign(n) {
  design = {
    bee:       ROSTER.bee[(n - 1) % ROSTER.bee.length],
    butterfly: ROSTER.butterfly[(n - 1) % ROSTER.butterfly.length],
    boss:      ROSTER.boss[(n - 1) % ROSTER.boss.length],
  };
}

let W = 0, H = 0, VW = 0, VH = 0, stageX = 0, stageY = 0;

// The guide is a watermark drawn behind the action, so it reserves nothing
// and nothing has to lay out around it.
// How present the guide should be right now: always-on shows at full weight,
// assist mode rides its fade, off is nothing.
function guideVisibility() {
  const m = guideMode();
  if (m === "always") return 1;
  if (m === "assist") return assist ? assist.alpha : 0;
  return 0;
}

function guideBox() {
  if (guideVisibility() <= 0.001) return { on: false, h: 0, w: 0, x: 0, y: H };
  return { on: true, ...keyboardGuideLayout(W, H, true) };
}

// ---- Glow sprite cache ----
// Pre-rendering the radial falloff once per color is far cheaper than building
// a gradient (or setting shadowBlur) for every particle each frame.
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const size = 64;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  // A tight, bright core with a fast falloff reads as an LED. A wide, gentle
  // falloff reads as fog, which is what made everything look washed out.
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.16, hexA(color, 0.9));
  grad.addColorStop(0.42, hexA(color, 0.28));
  grad.addColorStop(1, hexA(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(color, c);
  return c;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function drawGlow(x, y, radius, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(glowSprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

// ---- Background ----
let starLayers = [];

// The console strip's boxes, worked out once per resize so the panels that
// draw into it and anything that must keep clear of it read the same numbers.
let con = null;

function layoutConsole() {
  const top = H * (1 - CONSOLE_H);
  const ch = H * CONSOLE_H;
  const pad = W * 0.012;
  con = { top, h: ch, pad };
}


// Stars scroll downward: a vertical shooter reads better with vertical drift.
function makeStars() {
  const specs = [
    { count: (W * H) / 9000,  size: [0.4, 1.0], alpha: [0.35, 0.65], speed: 12, tint: "200, 190, 255" },
    { count: (W * H) / 16000, size: [0.8, 1.7], alpha: [0.55, 0.95], speed: 34, tint: "255, 190, 235" },
    { count: (W * H) / 34000, size: [1.3, 2.6], alpha: [0.8, 1.0],   speed: 68, tint: "120, 240, 255" },
  ];
  starLayers = specs.map(s => {
    const arr = [];
    for (let i = 0; i < Math.floor(s.count); i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: s.size[0] + Math.random() * (s.size[1] - s.size[0]),
        a: s.alpha[0] + Math.random() * (s.alpha[1] - s.alpha[0]),
      });
    }
    return { stars: arr, speed: s.speed, tint: s.tint };
  });
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.width = VW * dpr;
  canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (VW / VH > STAGE_AR) { H = VH; W = VH * STAGE_AR; }
  else { W = VW; H = VW / STAGE_AR; }
  stageX = Math.round((VW - W) / 2);
  stageY = Math.round((VH - H) / 2);
  makeStars();
  layoutConsole();
}

// Entity fixup after the stage changes size. Kept out of resize() because that
// runs once while the module is still being evaluated, before these bindings
// exist — touching them there puts the whole file in the temporal dead zone.
function relayout() {
  if (!player) return;
  player.y = playerBaseY();
  player.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, player.x));
  player.targetX = Math.max(PLAYER_R, Math.min(W - PLAYER_R, player.targetX));
  // The formation's spacing is worked out when a wave starts, so without this
  // it keeps the old stage's geometry and the ranks drift off-centre for the
  // rest of the wave.
  if (formation && formation.cols) {
    formation.colSpacing = Math.min(150, (W - 120) / Math.max(1, formation.cols));
    formation.rowSpacing = Math.min(78, H * 0.1);
    formation.originX = W / 2;
    formation.originY = Math.max(90, H * 0.16);
  }
}
window.addEventListener("resize", () => { resize(); relayout(); });
resize();

// ---- Audio ----
let audioCtx = null, sfxGain = null, musicGain = null;

function ensureAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = audioCtx.createGain();
    musicGain = audioCtx.createGain();
    sfxGain.connect(audioCtx.destination);
    musicGain.connect(audioCtx.destination);
    applyVolumes();
  } catch (e) { audioCtx = null; }
}

function applyVolumes() {
  if (!audioCtx) return;
  sfxGain.gain.value = settings.sfxVol / 100;
  musicGain.gain.value = (settings.musicVol / 100) * 0.55;
}

function blip(freq, dur, type = "square", gain = 0.05, slide = 0) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(sfxGain);
  osc.start(t);
  osc.stop(t + dur);
}

const sfx = {
  shoot: (step = 0) => blip(760 + step * 30, 0.06, "square", 0.032, -300),
  hit: () => blip(300, 0.1, "square", 0.045, -120),
  explode: () => blip(150, 0.35, "sawtooth", 0.08, -110),
  error: () => blip(150, 0.14, "square", 0.055),
  lock: () => blip(1180, 0.06, "triangle", 0.05),
  dive: () => blip(520, 0.22, "sawtooth", 0.04, -300),
  enemyShot: () => blip(240, 0.09, "square", 0.025, -90),
  playerHit: () => blip(90, 0.55, "sawtooth", 0.11, -50),
  beam: () => blip(300, 0.5, "sine", 0.05, 420),
  captured: () => blip(180, 0.7, "sawtooth", 0.1, -110),
  rescue: () => { blip(600, 0.1, "triangle", 0.06); setTimeout(() => blip(900, 0.1, "triangle", 0.06), 90); setTimeout(() => blip(1350, 0.2, "triangle", 0.06), 180); },
  juke: () => blip(520, 0.16, "sine", 0.05, 620),
  jukeBlocked: () => blip(180, 0.06, "square", 0.025),
  levelUp: () => { blip(720, 0.09, "triangle", 0.05); setTimeout(() => blip(1080, 0.15, "triangle", 0.05), 80); },
  wave: () => { [0, 100, 200, 320].forEach((d, i) => setTimeout(() => blip([523, 659, 784, 1047][i], 0.18, "triangle", 0.06), d)); },
};

// ---- Music: a bright arcade loop, generated (no audio files to host) ----
const MUSIC_TEMPO = 132;
const STEPS_PER_BAR = 8;
const PROGRESSION = [
  { bass: 36, chord: [60, 64, 67] }, // C
  { bass: 43, chord: [59, 62, 67] }, // G
  { bass: 33, chord: [57, 60, 64] }, // Am
  { bass: 41, chord: [57, 60, 65] }, // F
];
const ARP = [0, 2, 1, 2, 0, 1, 2, 1];
const LEAD = [12, null, 7, null, 12, 16, null, 14];
const noteFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const musicState = { timer: null, nextTime: 0, step: 0 };

function tone(freq, t, dur, type, gain, attack) {
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(musicGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playMusicStep(step, t) {
  const secPerStep = (60 / MUSIC_TEMPO) / 2;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const sub = step % STEPS_PER_BAR;
  const { bass, chord } = PROGRESSION[bar];

  if (sub % 2 === 0) tone(noteFreq(bass), t, 0.22, "triangle", 0.075, 0.01);
  if (sub === 0) for (const m of chord) tone(noteFreq(m), t, secPerStep * 7, "sine", 0.028, 0.25);
  tone(noteFreq(chord[ARP[sub]]), t, 0.14, "square", 0.016, 0.005);
  const lead = LEAD[sub];
  if (lead !== null) tone(noteFreq(chord[0] + lead), t, 0.2, "triangle", 0.03, 0.01);
}

function scheduleMusic() {
  const secPerStep = (60 / MUSIC_TEMPO) / 2;
  const total = STEPS_PER_BAR * PROGRESSION.length;
  while (musicState.nextTime < audioCtx.currentTime + 1.2) {
    playMusicStep(musicState.step, musicState.nextTime);
    musicState.nextTime += secPerStep;
    musicState.step = (musicState.step + 1) % total;
  }
}

function startMusic() {
  if (!audioCtx || !settings.musicOn || musicState.timer) return;
  musicState.nextTime = audioCtx.currentTime + 0.05;
  musicState.step = 0;
  scheduleMusic();
  musicState.timer = setInterval(scheduleMusic, 100);
}

function stopMusic() {
  if (musicState.timer) { clearInterval(musicState.timer); musicState.timer = null; }
}

// ---- Game state ----
let state = "menu"; // menu | playing | paused | gameover
let player, enemies, bullets, enemyBullets, particles, shockwaves, lockTarget;
let formation, capture, banner;
let score, lives, elapsed, wave, waveTime, waveClearTimer, diveTimer, beamCooldown;
let invuln, grace, shake, flash, juke, wrongKey, assist;
let typedCorrect, typedWrong, kills, streak, bestStreak, multiplier;

function playerBaseY() {
  // Above the console, not behind it.
  return H * (1 - PLAYER_BOTTOM_F);
}

function resetGame() {
  player = { x: W / 2, y: playerBaseY(), targetX: W / 2, muzzle: 0, captured: false, spin: 0 };
  enemies = [];
  bullets = [];
  enemyBullets = [];
  particles = [];
  shockwaves = [];
  lockTarget = null;
  formation = { originX: W / 2, originY: 0, colSpacing: 0, rowSpacing: 0, cols: 0, sway: 0 };
  capture = null;
  banner = null;
  score = 0;
  lives = STARTING_LIVES;
  elapsed = 0;
  wave = 0;
  waveTime = 0;
  waveClearTimer = 0;
  diveTimer = 3;
  beamCooldown = 14;
  invuln = 0;
  grace = 0;
  juke = { t: 0, dir: 0, charges: JUKE_CHARGES, refill: 0, iframes: 0, hold: 0 };
  wrongKey = { key: null, t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  shake = 0;
  flash = 0;
  typedCorrect = 0;
  typedWrong = 0;
  kills = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
}

// ---- Words ----
// Every ship on screen gets a distinct first letter so a keypress is never
// ambiguous. That caps squadron size for narrow sets like the home row.
function distinctFirstLetters() {
  const pools = currentWordSet().pools;
  const s = new Set();
  for (const key of ["short", "medium", "long"]) {
    for (const w of pools[key] || []) s.add(w[0]);
  }
  return s.size;
}

function pickWordFor(type, used) {
  const pools = currentWordSet().pools;
  const order = type === "boss" ? ["long", "medium", "short"]
              : type === "butterfly" ? ["medium", "short", "long"]
              : ["short", "medium", "long"];
  for (const key of order) {
    const pool = pools[key];
    if (!pool || !pool.length) continue;
    const cands = pool.filter(w => !used.has(w[0]));
    if (cands.length) return cands[(Math.random() * cands.length) | 0];
  }
  for (const key of order) {
    const pool = pools[key];
    if (pool && pool.length) return pool[(Math.random() * pool.length) | 0];
  }
  return "type";
}

// ---- Paths ----
function bez(p, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return {
    x: a * p.p0.x + b * p.p1.x + c * p.p2.x + d * p.p3.x,
    y: a * p.p0.y + b * p.p1.y + c * p.p2.y + d * p.p3.y,
  };
}

function setPath(e, p0, p1, p2, p3, dur, next) {
  e.path = { p0, p1, p2, p3, dur, t: 0, next };
}

function slotPos(e) {
  return {
    x: formation.originX + formation.sway + (e.col - (formation.cols - 1) / 2) * formation.colSpacing,
    y: formation.originY + e.row * formation.rowSpacing,
  };
}

// Three entry archetypes, so a squadron doesn't arrive the same way twice.
// The swoops deliberately stop short of the player's row: the ship steers
// itself, so an arrival the player cannot dodge must never be lethal.
function entryPath(e, archetype) {
  const slot = slotPos(e);
  if (archetype === 0) {
    return [{ x: -70, y: H * 0.52 }, { x: W * 0.32, y: H * 0.76 }, { x: W * 0.12, y: H * 0.08 }, slot];
  }
  if (archetype === 1) {
    return [{ x: W + 70, y: H * 0.52 }, { x: W * 0.68, y: H * 0.76 }, { x: W * 0.88, y: H * 0.08 }, slot];
  }
  return [{ x: W * 0.5, y: -80 }, { x: W * 0.05, y: H * 0.4 }, { x: W * 0.95, y: H * 0.4 }, slot];
}

// ---- Waves ----
function startWave(n) {
  pickDesign(n);
  const L = currentLevel();
  const k = Math.min(1, (n - 1) / 7);
  let cols = Math.round(L.cols[0] + (L.cols[1] - L.cols[0]) * k);
  const rows = Math.round(L.rows[0] + (L.rows[1] - L.rows[0]) * k);
  const capacity = Math.min(cols * rows, distinctFirstLetters(), MAX_ENEMIES);
  // Narrow word sets (the home row offers only 8 starting letters) cap the
  // squadron. Narrow the grid to match so those waves form a compact block
  // instead of one long thin row with the lower ranks left empty.
  cols = Math.max(1, Math.min(cols, Math.ceil(capacity / rows)));

  formation.cols = cols;
  formation.colSpacing = Math.min(150, (W - 120) / Math.max(1, cols));
  formation.rowSpacing = Math.min(78, H * 0.1);
  formation.originX = W / 2;
  formation.originY = Math.max(90, H * 0.16);
  formation.sway = 0;

  const used = new Set();
  let made = 0;
  let bossesLeft = n >= 2 ? 2 : 0;

  for (let row = 0; row < rows && made < capacity; row++) {
    for (let col = 0; col < cols && made < capacity; col++) {
      // Bosses take the two most central slots of the top row
      const central = Math.abs(col - (cols - 1) / 2) < 1;
      let type;
      if (row === 0 && bossesLeft > 0 && central) { type = "boss"; bossesLeft--; }
      else if (row === 0) type = "butterfly";
      else if (row === 1 && rows > 2) type = "butterfly";
      else type = "bee";

      const word = pickWordFor(type, used);
      used.add(word[0]);
      const T = TYPES[type];
      const group = Math.floor(made / ENTRY_GROUP);

      enemies.push({
        type, word, typed: 0, hitsLanded: 0,
        row, col, r: T.r,
        x: -200, y: -200, angle: Math.PI / 2,
        state: "waiting",
        entryDelay: group * 0.62 + (made % ENTRY_GROUP) * 0.13,
        archetype: group % 3,
        path: null,
        wing: Math.random() * Math.PI * 2,
        entered: false, dying: false, hitFlash: 0,
        fireCooldown: 0.6 + Math.random(),
      });
      made++;
    }
  }

  wave = n;
  waveTime = 0;
  diveTimer = 3.2;
  banner = { text: `WAVE ${n}`, sub: `${made} SHIPS INBOUND`, life: 2.0, maxLife: 2.0 };
  sfx.wave();
}

function launchDive() {
  const candidates = enemies.filter(e => e.state === "formation" && !e.dying);
  if (!candidates.length) return;
  const count = wave >= 4 && candidates.length > 3 && Math.random() < 0.45 ? 2 : 1;
  for (let i = 0; i < count && candidates.length; i++) {
    const idx = (Math.random() * candidates.length) | 0;
    const e = candidates.splice(idx, 1)[0];
    const from = { x: e.x, y: e.y };
    const side = Math.random() < 0.5 ? -1 : 1;
    setPath(e,
      from,
      { x: from.x + side * W * 0.28, y: H * 0.42 },
      { x: player.x - side * W * 0.16, y: H * 0.72 },
      { x: player.x + side * 80, y: H + 90 },
      2.1 + Math.random() * 0.5,
      "returning"
    );
    e.state = "diving";
    e.fireCooldown = 0.35 + Math.random() * 0.4;
  }
  sfx.dive();
}

function beginReturn(e) {
  const slot = slotPos(e);
  const startX = slot.x + (Math.random() - 0.5) * 120;
  setPath(e,
    { x: startX, y: -80 },
    { x: startX, y: H * 0.12 },
    { x: slot.x, y: H * 0.18 },
    slot,
    1.5,
    "formation"
  );
  e.state = "returning";
}

// ---- Effects ----
function addParticle(p) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push(p);
}

function burst(x, y, radius, palette, count, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (50 + Math.random() * 210) * speedScale;
    addParticle({
      kind: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.32 + Math.random() * 0.6, maxLife: 1,
      r: 1.5 + Math.random() * (radius > 18 ? 3.5 : 2),
      color: palette[(Math.random() * palette.length) | 0],
      drag: 1.7,
    });
  }
}

function shockwave(x, y, maxR, color, width = 3) {
  shockwaves.push({ x, y, r: maxR * 0.12, maxR, life: 0.45, maxLife: 0.45, color, width });
}

function explodeEnemy(e) {
  const T = TYPES[e.type];
  shockwave(e.x, e.y, e.r * 4, T.glow);
  burst(e.x, e.y, e.r, [T.body, T.accent, T.glow, "#ffffff"], 22 + e.r);
  flash = Math.min(0.4, flash + 0.1);
}

// ---- Settings overlay ----
let settingsOpen = false;
let settingsFrom = "menu";

function openSettings(from) {
  settingsFrom = from;
  settingsOpen = true;
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  if (from === "playing") state = "paused";
  settingsTitleEl.textContent = from === "playing" ? "PAUSED" : "SETTINGS";
  quitBtn.classList.toggle("hidden", from !== "playing");
  disarmQuit();
  syncSettingsUI();
  settingsEl.classList.remove("hidden");
}

function closeSettings() {
  settingsOpen = false;
  settingsEl.classList.add("hidden");
  disarmQuit();
  if (document.activeElement) document.activeElement.blur();
  if (settingsFrom === "playing") state = "playing";
  else if (settingsFrom === "menu") menuEl.classList.remove("hidden");
  else if (settingsFrom === "gameover") gameoverEl.classList.remove("hidden");
}

let quitArmed = false, quitTimer = null;

function disarmQuit() {
  quitArmed = false;
  clearTimeout(quitTimer);
  quitBtn.textContent = "Quit run (Q)";
  quitBtn.classList.remove("armed");
}

// First press arms, second confirms — a stray key shouldn't end a long run.
function requestQuit() {
  if (!quitArmed) {
    quitArmed = true;
    quitBtn.textContent = "Press again to confirm";
    quitBtn.classList.add("armed");
    quitTimer = setTimeout(disarmQuit, 4000);
    return;
  }
  disarmQuit();
  settingsOpen = false;
  settingsEl.classList.add("hidden");
  if (document.activeElement) document.activeElement.blur();
  endGame("quit");
}

function returnToMenu() {
  state = "menu";
  enemies = [];
  bullets = [];
  enemyBullets = [];
  particles = [];
  shockwaves = [];
  lockTarget = null;
  capture = null;
  settingsOpen = false;
  disarmQuit();
  settingsEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
  syncSettingsUI();
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  ensureAudio();
  startMusic();

  if (settingsOpen) {
    if (e.key === "Escape") closeSettings();
    else if (settingsFrom === "playing" && e.key.toLowerCase() === "q") requestQuit();
    return;
  }
  if (state === "menu") {
    if (e.key === "Escape") openSettings("menu");
    else if (/^[a-z]$/i.test(e.key)) startGame();
    return;
  }
  if (state === "gameover") {
    if (e.key === "Enter") startGame();
    else if (e.key === "Escape") openSettings("gameover");
    else if (e.key.toLowerCase() === "m") returnToMenu();
    return;
  }
  if (state === "playing" && e.key === "Escape") { openSettings("playing"); return; }
  if (state !== "playing") return;

  // Space is a juke. It is deliberately the one non-letter control: hitting
  // space with a thumb, without looking, is itself a touch-typing skill.
  // Checked every way a space arrives: `key` is " " on modern browsers,
  // "Spacebar" on some older ones, and `code`/`keyCode` cover layouts where
  // `key` is unreliable.
  if (e.key === " " || e.code === "Space" || e.key === "Spacebar" || e.keyCode === 32) {
    e.preventDefault();
    tryJuke();
    return;
  }
  if (!/^[a-z]$/i.test(e.key)) return;

  const letter = e.key.toLowerCase();

  // While held in a tractor beam the rescue word is the only valid input
  if (capture && capture.phase === "held") {
    if (capture.word[capture.typed] === letter) {
      capture.typed++;
      typedCorrect++;
      noteCorrectKey();
      bumpStreak();
      score += 15 * multiplier;
      sfx.shoot(Math.min(12, capture.typed));
      if (capture.typed >= capture.word.length) freeFromCapture();
    } else {
      wrongLetter(letter);
    }
    return;
  }

  if (lockTarget) {
    if (lockTarget.word[lockTarget.typed] === letter) correctLetter(lockTarget);
    else wrongLetter(letter);
  } else {
    let best = null, bestDist = Infinity;
    for (const e2 of enemies) {
      if (!targetable(e2) || e2.word[0] !== letter) continue;
      // Closest to the player wins, which naturally prioritises divers
      const d = Math.hypot(e2.x - player.x, e2.y - player.y);
      if (d < bestDist) { bestDist = d; best = e2; }
    }
    if (best) {
      lockTarget = best;
      sfx.lock();
      correctLetter(best);
    } else {
      wrongLetter(letter);
    }
  }
});

function targetable(e) {
  return e.state !== "waiting" && !e.dying && e.entered;
}

function bumpStreak() {
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  const m = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (m > multiplier) {
    multiplier = m;
    sfx.levelUp();
    shockwave(player.x, player.y, 100, NEON.lime, 2);
  }
}

function correctLetter(target) {
  target.typed++;
  typedCorrect++;
  noteCorrectKey();
  bumpStreak();
  score += 10 * multiplier;
  // Landing a shot buys a moment of safety on the gentler difficulties
  const g = currentLevel().grace;
  if (g > 0) grace = Math.max(grace, g);
  fireBullet(target);
  sfx.shoot(Math.min(12, streak % STREAK_PER_MULT));
  if (target.typed >= target.word.length) {
    target.dying = true;
    lockTarget = null;
  }
}

function noteCorrectKey() {
  assist.misses = 0;
  assist.showing = false;
}

function wrongLetter(key) {
  if (key) { wrongKey.key = key; wrongKey.t = WRONG_FLASH; }
  if (++assist.misses >= ASSIST_MISSES) assist.showing = true;
  typedWrong++;
  streak = 0;
  multiplier = 1;
  score = Math.max(0, score - 5);
  shake = Math.max(shake, 5);
  sfx.error();
}

function fireBullet(target) {
  bullets.push({ x: player.x, y: player.y - PLAYER_R * 1.6, px: player.x,
                 py: player.y, target, life: 3, trail: [] });
  player.muzzle = 0.1;
}

// ---- Capture ----
function startBeam(boss) {
  capture = { phase: "charging", boss, t: 0, word: "", typed: 0, timer: 0 };
  sfx.beam();
}

function completeCapture() {
  const L = currentLevel();
  const pools = currentWordSet().pools;
  const pool = (pools.medium && pools.medium.length) ? pools.medium
             : (pools.short && pools.short.length) ? pools.short : pools.long;
  capture.phase = "held";
  capture.word = pool && pool.length ? pool[(Math.random() * pool.length) | 0] : "escape";
  capture.typed = 0;
  capture.timer = L.rescue;
  player.captured = true;
  lockTarget = null;
  sfx.captured();
  shake = 10;
}

function freeFromCapture() {
  score += 500 * multiplier;
  invuln = INVULN_TIME;
  player.captured = false;
  player.spin = 0;
  capture = null;
  sfx.rescue();
  shockwave(player.x, player.y, 180, NEON.lime, 4);
  burst(player.x, player.y, 20, [NEON.lime, NEON.yellow, "#ffffff"], 34);
}

function loseLife() {
  lives--;
  streak = 0;
  multiplier = 1;
  invuln = INVULN_TIME;
  grace = 0;
  shake = 16;
  flash = 0.5;
  burst(player.x, player.y, 20, [NEON.orange, "#ffffff", "#FF3355"], 32);
  shockwave(player.x, player.y, 170, NEON.orange, 4);
  sfx.playerHit();
  if (lives <= 0) endGame("dead");
}

// Is anything close enough to hit us the moment we become vulnerable again?
function playerIsOverlapped() {
  for (const e of enemies) {
    if (e.state !== "diving" || e.dying) continue;
    if (Math.hypot(e.x - player.x, e.y - player.y) < e.r + PLAYER_R + 8) return true;
  }
  for (const b of enemyBullets) {
    if (Math.hypot(b.x - player.x, b.y - player.y) < PLAYER_R + 10) return true;
  }
  return false;
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  waveTime += dt;
  const L = currentLevel();

  if (banner) {
    banner.life -= dt;
    if (banner.life <= 0) banner = null;
  }
  if (invuln > 0) {
    invuln -= dt;
    // Same guard as Blaster: a diver or shot still overlapping us when the
    // shield lapses would hit on the next frame with no chance to react.
    if (invuln <= 0 && playerIsOverlapped()) invuln = 0.12;
  }
  if (grace > 0) grace -= dt;
  if (wrongKey.t > 0) wrongKey.t -= dt;
  // Assist mode eases the guide in when the player is stuck and back out once
  // they are moving again, rather than snapping it on and off.
  const assistTarget = assist.showing ? 1 : 0;
  const assistRate = dt / (assist.showing ? ASSIST_FADE_IN : ASSIST_FADE_OUT);
  assist.alpha += Math.sign(assistTarget - assist.alpha) *
                  Math.min(assistRate, Math.abs(assistTarget - assist.alpha));
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  if (player.muzzle > 0) player.muzzle = Math.max(0, player.muzzle - dt);

  // Formation breathes side to side
  formation.sway = Math.sin(elapsed * 0.55) * Math.min(46, W * 0.05);

  // Player movement. Shots home to their target, so the ship's horizontal
  // position is cosmetic for aiming — it can duck aside freely and never miss.
  // That is what makes automatic evasion possible without weakening the
  // shooting, and the player has no dodge key of their own.
  if (juke.charges < JUKE_CHARGES) {
    juke.refill += dt;
    if (juke.refill >= (currentLevel().jukeRefill || JUKE_REFILL)) {
      juke.charges++;
      juke.refill = 0;
    }
  }
  if (juke.iframes > 0) juke.iframes -= dt;
  if (juke.hold > 0) juke.hold -= dt;

  if (!player.captured) {
    const margin = 40;
    if (juke.t > 0) {
      // A juke overrides the usual tracking outright: the whole point is to
      // break away from where the ship was heading.
      juke.t -= dt;
      player.x += juke.dir * (JUKE_DIST / JUKE_TIME) * dt;
      player.x = Math.max(margin, Math.min(W - margin, player.x));
      player.targetX = player.x;
      addParticle({
        kind: "spark", x: player.x, y: player.y,
        vx: -juke.dir * 40, vy: 0,
        life: 0.16, maxLife: 0.3, r: 3, color: NEON.lime, drag: 3,
      });
      // The roll burns off any fire it passes through. Without this the juke
      // is redundant with the automatic evasion, which already handles simple
      // dodging — this gives it a job of its own: clearing a crowded screen.
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (Math.hypot(b.x - player.x, b.y - player.y) < PLAYER_R + 26) {
          enemyBullets.splice(i, 1);
          burst(b.x, b.y, 5, [NEON.lime, "#FFFFFF"], 6, 0.5);
          score += 5 * multiplier;
        }
      }
    } else {
      // The ship only ever moves for a reason. Anything it does on its own
      // between words is movement the player did not ask for and cannot see
      // coming, so the default is to hold station.
      let aim = player.x;
      let agility = 6.5;

      if (juke.hold > 0) {
        // Straight after a juke, stay where the dodge put us. Sliding back to
        // the target's column walks right back into the shot that is still
        // inbound, which made the dodge self-defeating.
        aim = player.x;
      } else if (lockTarget) {
        // Never chase a target that is diving at us. Tracking a diver's column
        // means following it into the ram, and the "closest target" lock rule
        // actively steers players onto divers.
        aim = (lockTarget.state === "diving" && lockTarget.y > H * 0.42)
          ? player.x
          : lockTarget.x;
      } else {
        // No target. Recentring here is what made finishing a word dangerous:
        // the middle is where the formation sits and where divers and their
        // shots converge, so the ship was driving itself into the busiest part
        // of the screen every time a word was completed. Only ease back toward
        // the middle once nothing is near, and slowly.
        const { dist } = nearestThreat();
        if (dist > 300) {
          aim = W / 2;
          agility = 1.6;
        }
      }

      // From Hard up the ship stops dodging for you: that is what space is for
      const evade = currentLevel().autoEvade ? evasionOffset() : 0;
      player.targetX = Math.max(margin, Math.min(W - margin, aim + evade));
      // Snap harder the more urgent the threat
      agility += Math.min(10, Math.abs(evade) / 18);
      player.x += (player.targetX - player.x) * Math.min(1, dt * agility);
    }
    player.y += (playerBaseY() - player.y) * Math.min(1, dt * 5);
  }

  // Engine trail
  if (Math.random() < 0.8 && !player.captured) {
    addParticle({
      kind: "spark",
      x: player.x + (Math.random() - 0.5) * 8, y: player.y + PLAYER_R * 0.6,
      vx: (Math.random() - 0.5) * 30, vy: 90 + Math.random() * 70,
      life: 0.16 + Math.random() * 0.2, maxLife: 0.36,
      r: 1.2 + Math.random() * 1.8,
      color: Math.random() < 0.5 ? NEON.lime : "#D6FFA8",
      drag: 2.4,
    });
  }

  updateCapture(dt, L);
  updateEnemies(dt, L);
  updateBullets(dt);
  updateParticles(dt);

  // Wave flow
  if (state === "playing" && enemies.length === 0) {
    if (waveClearTimer <= 0) {
      waveClearTimer = 2.4;
      const bonus = 200 * wave * multiplier;
      score += bonus;
      banner = { text: `WAVE ${wave} CLEAR`, sub: `+${bonus}`, life: 2.2, maxLife: 2.2 };
      sfx.wave();
    } else {
      waveClearTimer -= dt;
      if (waveClearTimer <= 0) startWave(wave + 1);
    }
  }

  // Dive scheduling
  if (!capture && enemies.some(e => e.state === "formation")) {
    diveTimer -= dt;
    if (diveTimer <= 0) {
      launchDive();
      const k = Math.min(1, (wave - 1) / 7);
      const base = L.dive[0] + (L.dive[1] - L.dive[0]) * k;
      diveTimer = base * (0.75 + Math.random() * 0.5);
    }
  }

  // Tractor beam scheduling
  beamCooldown -= dt;
  if (!capture && wave >= L.beamWave && beamCooldown <= 0) {
    const boss = enemies.find(e => e.type === "boss" && e.state === "formation" && !e.dying);
    if (boss) {
      startBeam(boss);
      beamCooldown = 24 + Math.random() * 12;
    } else {
      beamCooldown = 5;
    }
  }
}

// ---- Juke ----
// The player supplies the timing; the game supplies the direction, since
// there is no way to aim a dodge from the keyboard without a second key.
function nearestThreat() {
  let best = null, bestD = Infinity;
  for (const b of enemyBullets) {
    const d = Math.hypot(b.x - player.x, b.y - player.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  for (const e of enemies) {
    if (e.state !== "diving" || e.dying) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return { threat: best, dist: bestD };
}

function jukeDirection() {
  const { threat, dist } = nearestThreat();
  let dir = threat && dist < 340
    ? (threat.x > player.x ? -1 : 1)   // away from what is coming
    : (player.x > W / 2 ? -1 : 1);     // nothing close: head for open space
  // Never juke into a wall — a dodge that pins you is worse than none
  if (player.x + dir * JUKE_DIST < 46) dir = 1;
  if (player.x + dir * JUKE_DIST > W - 46) dir = -1;
  return dir;
}

function tryJuke() {
  if (player.captured) return;
  if (juke.charges <= 0) { sfx.jukeBlocked(); return; }
  juke.charges--;
  juke.dir = jukeDirection();
  juke.t = JUKE_TIME;
  juke.iframes = JUKE_IFRAMES;
  juke.hold = JUKE_HOLD;
  sfx.juke();
  shockwave(player.x, player.y, 90, NEON.lime, 2);
  for (let i = 0; i < 12; i++) {
    addParticle({
      kind: "spark",
      x: player.x, y: player.y + (Math.random() - 0.5) * 16,
      vx: -juke.dir * (60 + Math.random() * 160), vy: (Math.random() - 0.5) * 50,
      life: 0.18 + Math.random() * 0.22, maxLife: 0.4,
      r: 1.4 + Math.random() * 2,
      color: Math.random() < 0.5 ? NEON.lime : "#D6FFA8",
      drag: 2.2,
    });
  }
}

// How far sideways the ship wants to be from whatever is about to hit it.
// Returns a signed pixel offset: closer and more overhead threats push harder.
function evasionOffset() {
  const REACT_Y = 190;   // only threats this far above the ship matter
  let push = 0;

  for (const b of enemyBullets) {
    const dy = player.y - b.y;
    if (dy < 0 || dy > REACT_Y) continue;      // already past us, or too far
    if (b.vy <= 0) continue;                   // not coming down
    const dx = player.x - b.x;
    const span = 95;
    if (Math.abs(dx) > span) continue;
    const urgency = 1 - dy / REACT_Y;
    const dir = dx === 0 ? 1 : Math.sign(dx);  // dead overhead: pick a side
    push += dir * (span - Math.abs(dx)) * urgency * 1.7;
  }

  for (const e of enemies) {
    if (e.state !== "diving" || e.dying) continue;
    const dy = player.y - e.y;
    if (dy < -60 || dy > REACT_Y) continue;
    const dx = player.x - e.x;
    // Wide enough that the ship clears a diver by a real margin rather than
    // grazing the edge of its collision radius.
    const span = 165;
    if (Math.abs(dx) > span) continue;
    const urgency = 1 - Math.max(0, dy) / REACT_Y;
    const dir = dx === 0 ? 1 : Math.sign(dx);
    push += dir * (span - Math.abs(dx)) * urgency * 2.6;
  }
  return push;
}

function updateCapture(dt, L) {
  if (!capture) return;

  // The beam dies with its boss, whether shot down or already removed
  if (!enemies.includes(capture.boss) || capture.boss.dying) {
    if (capture.phase === "held") {
      player.captured = false;
      player.spin = 0;
      invuln = Math.max(invuln, 1.2);
    }
    capture = null;
    return;
  }

  if (capture.phase === "charging") {
    capture.t += dt;
    if (capture.t >= BEAM_CHARGE) completeCapture();
  } else {
    capture.timer -= dt;
    player.spin += dt * 2.4;
    // Ship is dragged up toward the boss while held
    const pullY = capture.boss.y + 70;
    player.x += (capture.boss.x - player.x) * Math.min(1, dt * 1.6);
    player.y += (pullY - player.y) * Math.min(1, dt * 0.9);
    if (capture.timer <= 0) {
      player.captured = false;
      player.spin = 0;
      capture = null;
      loseLife();
    }
  }
}

function updateEnemies(dt, L) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.wing += dt;
    if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);

    if (e.state === "waiting") {
      if (waveTime >= e.entryDelay) {
        const [p0, p1, p2, p3] = entryPath(e, e.archetype);
        setPath(e, p0, p1, p2, p3, L.entry, "formation");
        e.state = "entering";
        e.x = p0.x; e.y = p0.y;
      }
      continue;
    }

    if (e.state === "formation") {
      const slot = slotPos(e);
      e.x = slot.x;
      e.y = slot.y;
      e.angle = Math.PI / 2;
    } else if (e.path) {
      e.path.t += dt / e.path.dur;
      const tt = Math.min(1, e.path.t);
      const pos = bez(e.path, tt);
      const ahead = bez(e.path, Math.min(1, tt + 0.02));
      e.angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x);
      e.x = pos.x;
      e.y = pos.y;
      if (e.path.t >= 1) {
        if (e.path.next === "returning") beginReturn(e);
        else { e.state = "formation"; e.path = null; }
      }
    }

    if (e.x > -e.r && e.x < W + e.r && e.y > -e.r && e.y < H + e.r) e.entered = true;

    // Divers shoot at the player
    if (e.state === "diving" && !e.dying && !capture) {
      e.fireCooldown -= dt;
      if (e.fireCooldown <= 0 && e.y < H - 120 && e.y > 0) {
        e.fireCooldown = 1.1 + Math.random();
        if (Math.random() < L.fire) {
          const dx = player.x - e.x, dy = player.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          enemyBullets.push({
            x: e.x, y: e.y,
            vx: (dx / len) * L.bullet,
            vy: (dy / len) * L.bullet,
            color: TYPES[e.type].accent,
          });
          sfx.enemyShot();
        }
      }
    }

    // Same shield rule as Blaster: a diver that reaches us while the post-hit
    // shield is up burns against it instead of lingering to hit the moment it
    // lapses. No score or streak credit.
    if (invuln > 0 && e.state === "diving" && !e.dying && !player.captured &&
        Math.hypot(e.x - player.x, e.y - player.y) < e.r + PLAYER_R) {
      if (lockTarget === e) lockTarget = null;
      explodeEnemy(e);
      enemies.splice(i, 1);
      continue;
    }

    // Only ships committed to a dive can ram the player. Arrivals and returns
    // are scripted flight paths the player has no way to dodge, so letting
    // them collide would cost lives through no fault of the typist.
    if (e.state === "diving" && !e.dying && !player.captured && invuln <= 0 && grace <= 0 && juke.iframes <= 0 &&
        Math.hypot(e.x - player.x, e.y - player.y) < e.r + PLAYER_R) {
      explodeEnemy(e);
      if (lockTarget === e) lockTarget = null;
      enemies.splice(i, 1);
      loseLife();
      if (state !== "playing") return;
    }
  }
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    const t = b.target;
    if (!t || b.life <= 0 || !enemies.includes(t)) { bullets.splice(i, 1); continue; }
    // Kept so the bolt sprite can be pointed along its own travel.
    b.px = b.x; b.py = b.y;

    const dx = t.x - b.x, dy = t.y - b.y;
    const dist = Math.hypot(dx, dy);
    const step = BULLET_SPEED * dt;
    if (dist <= step + t.r * 0.6) {
      bullets.splice(i, 1);
      t.hitsLanded++;
      t.hitFlash = 1;
      burst(b.x, b.y, 6, ["#ffffff", NEON.lime], 7, 0.5);
      sfx.hit();
      if (t.dying && t.hitsLanded >= t.word.length) {
        const idx = enemies.indexOf(t);
        if (idx !== -1) enemies.splice(idx, 1);
        explodeEnemy(t);
        const diveBonus = t.state === "diving" ? 2 : 1;
        score += TYPES[t.type].pts * diveBonus * multiplier;
        kills++;
        sfx.explode();
      }
    } else {
      b.x += (dx / dist) * step;
      b.y += (dy / dist) * step;
    }
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y > H + 20 || b.y < -20 || b.x < -20 || b.x > W + 20) {
      enemyBullets.splice(i, 1);
      continue;
    }
    // Shots burn against the post-hit shield too, for the same reason
    if (invuln > 0 && !player.captured &&
        Math.hypot(b.x - player.x, b.y - player.y) < PLAYER_R + 6) {
      enemyBullets.splice(i, 1);
      burst(b.x, b.y, 5, [NEON.cyan, "#FFFFFF"], 5, 0.5);
      continue;
    }
    if (!player.captured && invuln <= 0 && grace <= 0 && juke.iframes <= 0 &&
        Math.hypot(b.x - player.x, b.y - player.y) < PLAYER_R + 4) {
      enemyBullets.splice(i, 1);
      loseLife();
      if (state !== "playing") return;
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = 1 - dt * (p.drag || 1.5);
    p.vx *= drag;
    p.vy *= drag;
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    if (s.life <= 0) { shockwaves.splice(i, 1); continue; }
    s.r = s.maxR * (0.12 + 0.88 * Math.sqrt(1 - s.life / s.maxLife));
  }
}

// ---- Game flow ----
function startGame() {
  resetGame();
  state = "playing";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  startWave(1);
}

function endGame(reason = "dead") {
  state = "gameover";
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;

  const entry = {
    score, wpm, acc, kills,
    wave, streak: bestStreak,
    time: Math.floor(elapsed),
    difficulty: settings.difficulty,
    wordSet: settings.wordSet,
    date: Date.now(),
  };
  // A run where nothing was typed is not a result worth keeping in the table
  const worthRecording = typedCorrect > 0;
  const rank = worthRecording ? recordScore(entry) : -1;

  gameoverTitleEl.textContent = reason === "quit" ? "RUN ENDED" : "GAME OVER";
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Wave reached</span><span class="value">${wave}</span>
    <span class="label">Ships destroyed</span><span class="value">${kills}</span>
    <span class="label">WPM</span><span class="value">${wpm}</span>
    <span class="label">Accuracy</span><span class="value">${acc}%</span>
    <span class="label">Best streak</span><span class="value">${bestStreak}</span>
  `;
  newBestEl.classList.toggle("hidden", rank !== 0);
  renderScoreList(worthRecording ? entry : null);
  gameoverEl.classList.remove("hidden");
}

function renderScoreList(highlight) {
  const rows = scoresFor(settings.difficulty).slice(0, 5);
  if (!rows.length) { scoreListEl.innerHTML = ""; return; }
  const body = rows.map((s, i) => {
    const setLabel = (WORD_SETS[s.wordSet] || WORD_SETS.all).label;
    const me = highlight && s.date === highlight.date && s.score === highlight.score;
    return `<li class="${me ? "me" : ""}">
      <span class="rank">${i + 1}</span>
      <span class="sc">${s.score}</span>
      <span class="meta">wave ${s.wave || 1} &middot; ${s.wpm} wpm &middot; ${s.acc}% &middot; ${setLabel}</span>
    </li>`;
  }).join("");
  scoreListEl.innerHTML = `<div class="score-head">TOP RUNS &mdash; ${currentLevel().label}</div><ol>${body}</ol>`;
}

// ---- Drawing ----
let starScroll = 0;

function draw(dt) {
  const t = performance.now() / 1000;
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  ctx.fillStyle = "#05030a";
  ctx.fillRect(0, 0, VW, VH);
  // Everything below is drawn in stage coordinates.
  ctx.translate(stageX, stageY);
  const bg = Sprites.images && Sprites.images.bg;
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  drawStars(dt);

  // Watermark sits above the starfield but under everything that matters,
  // and outside the shake so it stays a steady reference point.
  if (state === "playing" || state === "paused") drawGuide();

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  if (state === "playing" || state === "paused" || state === "gameover") {
    drawShockwaves();
    drawBeam(t);
    drawEnemies(t);
    drawEnemyBullets();
    drawParticles();
    drawBullets();
    if (state !== "gameover") drawPlayer(t);
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 220, 255, ${flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawVignette();

  if (state === "playing" || state === "paused" || state === "gameover") {
    if (capture && capture.phase === "held") drawRescuePrompt(t);
    drawBanner();
    drawHUD();
  }
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
}

function dpr() { return window.devicePixelRatio || 1; }

function drawStars(dt) {
  starScroll += dt;
  for (const layer of starLayers) {
    for (const s of layer.stars) {
      let y = (s.y + starScroll * layer.speed) % (H + 8);
      if (y < -8) y += H + 8;
      ctx.fillStyle = `rgba(${layer.tint}, ${s.a})`;
      ctx.fillRect(s.x, y, s.r, s.r * 2.2);
    }
  }
}

function drawVignette() {
  // Lighter than before, and neutral black rather than purple: a tinted
  // vignette dulls the saturated colours it falls across.
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawShockwaves() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of shockwaves) {
    const k = s.life / s.maxLife;
    ctx.strokeStyle = hexA(s.color, 0.6 * k);
    ctx.lineWidth = s.width * k;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBeam(t) {
  if (!capture) return;
  const b = capture.boss;
  const charging = capture.phase === "charging";
  const k = charging ? capture.t / BEAM_CHARGE : 1;
  const topW = b.r * 0.7;
  const botW = b.r * 0.7 + 90 * k;
  const endY = charging ? b.y + (player.y - b.y) * k : player.y + 30;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // Cyan into blue: the beam belongs to the boss, so it stays in its hues.
  const g = ctx.createLinearGradient(0, b.y, 0, endY);
  g.addColorStop(0, "rgba(0, 208, 255, 0.75)");
  g.addColorStop(0.6, "rgba(30, 91, 255, 0.36)");
  g.addColorStop(1, "rgba(30, 91, 255, 0.08)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(b.x - topW, b.y);
  ctx.lineTo(b.x + topW, b.y);
  ctx.lineTo(b.x + botW, endY);
  ctx.lineTo(b.x - botW, endY);
  ctx.closePath();
  ctx.fill();

  // Scanning bands travelling down the cone
  ctx.strokeStyle = "rgba(230, 255, 250, 0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const f = ((t * 0.9 + i / 5) % 1);
    const y = b.y + (endY - b.y) * f;
    const w = topW + (botW - topW) * f;
    ctx.globalAlpha = (1 - f) * 0.7;
    ctx.beginPath();
    ctx.moveTo(b.x - w, y);
    ctx.lineTo(b.x + w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawEnemies(t) {
  for (const e of enemies) {
    if (e.state === "waiting") continue;
    const T = TYPES[e.type];
    const locked = e === lockTarget;

    // The sprites carry their own glow in the alpha, so the only additive
    // pass left is the one that marks the locked target.
    if (locked) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawGlow(e.x, e.y, e.r * 3.1, T.glow, 0.38);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(Math.max(-0.5, Math.min(0.5, (e.angle - Math.PI / 2) * 0.35)));
    drawShip(e, T, t);
    ctx.restore();

    if (locked) drawReticle(e, t);
    // Only label ships that are actually on screen, so a visible word is
    // always one the player can lock onto.
    if (!e.dying && e.entered) drawWordLabel(e, locked, T);
  }
}

// One sprite, bobbing slightly and banking into its drift. The sheet's art
// already carries its own glow in the alpha, so nothing is composited
// additively on top of it — that would only wash the colour out.
function drawShip(e, T, t) {
  const key = design[e.type] || "drone";
  const h = T.r * T.scale;
  const bob = Math.sin(t * 2.2 + e.x * 0.01) * h * 0.03;
  Sprites.draw(ctx, key, 0, bob, h);
}


function drawReticle(e, t) {
  const r = e.r + 13;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(t * 1.1);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let q = 0; q < 4; q++) {
    const base = q * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, base - 0.3, base + 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

// The word rides the enemy's own name plate. Each plate on the sheet is
// colour-matched to the creature drawn above it, so the tag says which enemy
// it belongs to before the word itself has been read — which is exactly what
// Burrow needed a procedural bubble to fake, and this does better.
function drawWordLabel(e, locked, T) {
  const key = (design[e.type] || "drone") + "Plate";
  const ph = Math.max(17, e.r * 1.35) * (locked ? 1.16 : 1);
  const pw = Sprites.widthFor(key, ph);
  // A ship at the edge is still targetable, so its word has to stay readable.
  const cx = Math.max(pw / 2 + 4, Math.min(W - pw / 2 - 4, e.x));
  const cy = Math.max(ph / 2 + 4, Math.min(H - ph / 2 - 4, e.y + e.r * 1.5 + ph * 0.5));
  Sprites.draw(ctx, key, cx, cy, ph, locked ? 1 : 0.9);

  const fs = ph * 0.5;
  ctx.font = `bold ${fs}px ${MONO}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const done = e.word.slice(0, e.typed);
  const next = e.word.slice(e.typed, e.typed + 1);
  const rest = e.word.slice(e.typed + 1);
  let x = cx - ctx.measureText(e.word).width / 2;
  const ly = cy + ph * 0.02;

  if (done) {
    ctx.fillStyle = NEON.lime;
    ctx.fillText(done, x, ly);
    x += ctx.measureText(done).width;
  }
  if (next) {
    const nw = ctx.measureText(next).width;
    if (locked) {
      ctx.fillStyle = "rgba(255, 230, 0, 0.35)";
      roundRect(x - 2, ly - fs * 0.58, nw + 4, fs * 1.16, 3);
      ctx.fill();
    }
    ctx.fillStyle = locked ? "#FFF3D0" : "#FFFFFF";
    ctx.fillText(next, x, ly);
    x += nw;
  }
  if (rest) {
    ctx.fillStyle = locked ? "#FFFFFF" : "#CFE6FF";
    ctx.fillText(rest, x, ly);
  }
}


function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The hero ship, banking into its slide. The sheet gives three poses, so the
// bank is a change of sprite rather than a rotation — which is what the art
// was drawn for, and reads far better than tilting a single frame.
function drawPlayer(t) {
  const blink = invuln > 0 && !player.captured && Math.floor(invuln * 10) % 2 === 0;
  if (blink) return;

  const h = PLAYER_R * 4.4;
  const drift = player.targetX - player.x;
  const pose = drift < -6 ? "shipLeft" : drift > 6 ? "shipRight" : "shipMid";

  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.captured) ctx.rotate(player.spin);

  // Thrust, flickering, behind the hull
  const flick = 0.82 + Math.random() * 0.18;
  Sprites.draw(ctx, "plume", 0, h * 0.52, h * 0.5 * flick, 0.9);
  Sprites.draw(ctx, pose, 0, 0, h);
  if (player.muzzle > 0) {
    Sprites.draw(ctx, "spark", 0, -h * 0.45, h * 0.5 * (player.muzzle / 0.1), 0.9);
  }
  ctx.restore();

  // The two rings are unchanged in meaning: cyan pulse is hit-recovery
  // invulnerability, steady lime is the typing shield.
  if (invuln > 0 && !player.captured) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);
    Sprites.draw(ctx, "shieldRing", player.x, player.y, h * (1.5 + pulse * 0.1),
                 0.3 + 0.25 * pulse);
  } else if (grace > 0 && !player.captured) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const k = Math.min(1, grace / 0.25);
    ctx.strokeStyle = `rgba(124, 255, 61, ${0.5 * k})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_R * 1.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}


function drawBullets() {
  for (const b of bullets) {
    const ang = Math.atan2(b.y - (b.py ?? b.y + 1), b.x - (b.px ?? b.x));
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang + Math.PI / 2);
    Sprites.draw(ctx, "boltThin", 0, 0, PLAYER_R * 2.6);
    ctx.restore();
  }
}


function drawEnemyBullets() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of enemyBullets) {
    drawGlow(b.x, b.y, 15, b.color, 1);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const k = Math.max(0, p.life / p.maxLife);
    drawGlow(p.x, p.y, p.r * 3.2, p.color, k * 0.85);
  }
  ctx.restore();
}

function drawRescuePrompt(t) {
  const L = currentLevel();
  const cx = W / 2, cy = H * 0.62;
  const urgency = 1 - capture.timer / L.rescue;

  ctx.font = `bold 13px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillStyle = `rgba(255, 31, 143, ${0.7 + 0.3 * Math.sin(t * 10)})`;
  ctx.fillText("CAPTURED — TYPE TO BREAK FREE", cx, cy - 48);

  const fs = 34;
  ctx.font = `bold ${fs}px ${MONO}`;
  const word = capture.word;
  const totalW = ctx.measureText(word).width;
  const startX = cx - totalW / 2;

  ctx.fillStyle = "rgba(18, 6, 34, 0.9)";
  roundRect(startX - 18, cy - fs - 4, totalW + 36, fs + 22, 10);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 230, 0, ${0.5 + 0.5 * Math.sin(t * 8)})`;
  ctx.lineWidth = 2;
  roundRect(startX - 18, cy - fs - 4, totalW + 36, fs + 22, 10);
  ctx.stroke();

  ctx.textAlign = "left";
  let x = startX;
  const done = word.slice(0, capture.typed);
  const next = word.slice(capture.typed, capture.typed + 1);
  const rest = word.slice(capture.typed + 1);
  if (done) { ctx.fillStyle = NEON.lime; ctx.fillText(done, x, cy); x += ctx.measureText(done).width; }
  if (next) {
    const nw = ctx.measureText(next).width;
    ctx.fillStyle = "rgba(255, 230, 0, 0.35)";
    roundRect(x - 3, cy - fs + 2, nw + 6, fs + 6, 4);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(next, x, cy);
    x += nw;
  }
  if (rest) { ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fillText(rest, x, cy); }

  // Timer bar
  const barW = Math.max(totalW + 36, 240), barH = 7;
  const bx = cx - barW / 2, by = cy + 20;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(bx, by, barW, barH, 4);
  ctx.fill();
  const left = Math.max(0, capture.timer / L.rescue);
  ctx.fillStyle = urgency > 0.7 ? "#FF3355" : urgency > 0.4 ? NEON.yellow : NEON.lime;
  roundRect(bx, by, Math.max(3, barW * left), barH, 4);
  ctx.fill();
  ctx.textAlign = "left";
}

function drawBanner() {
  if (!banner) return;
  const k = banner.life / banner.maxLife;
  const alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.35);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = "center";
  ctx.font = `bold 46px ${MONO}`;
  const g = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
  g.addColorStop(0, NEON.yellow);
  g.addColorStop(0.5, NEON.magenta);
  g.addColorStop(1, NEON.cyan);
  ctx.fillStyle = g;
  ctx.fillText(banner.text, W / 2, H * 0.42);
  ctx.font = `14px ${MONO}`;
  ctx.fillStyle = "rgba(240, 233, 255, 0.75)";
  ctx.fillText(banner.sub, W / 2, H * 0.42 + 28);
  ctx.restore();
  ctx.textAlign = "left";
}

// The key the player must press now, plus every other key that would start a
// valid lock. Showing the options while unlocked is half the teaching value:
// it turns "what can I even do" into a visible choice.
function guideKeys() {
  if (capture && capture.phase === "held") {
    return { next: capture.word[capture.typed] || null, options: [] };
  }
  if (lockTarget) return { next: lockTarget.word[lockTarget.typed] || null, options: [] };
  const opts = [];
  for (const e of enemies) if (targetable(e)) opts.push(e.word[0]);
  return { next: null, options: opts };
}

function drawGuide() {
  const g = guideBox();
  if (!g.on) return;
  const { next, options } = state === "playing" || state === "paused"
    ? guideKeys() : { next: null, options: [] };
  const vis = guideVisibility();
  drawKeyboardGuide(ctx, {
    x: g.x, y: g.y, width: g.w,
    next, options,
    spaceReady: juke.charges > 0,
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: Math.max(0, wrongKey.t / WRONG_FLASH) * vis,
    opacity: 0.13 * vis,     // barely there until a key lights up
    highlight: 0.85 * vis,
    mono: MONO,
  });
}

// The HUD docks into the console painted across the foot of the background.
// Its dark slots are already panel-shaped, so the live panels drop into them
// and the whole strip reads as one instrument cluster — which leaves the
// entire starfield above as uninterrupted playfield.
//
// Each panel ships with a specimen value printed on it (000000, x5, three
// hearts). Those are blanked in the slot's own ground colour, sampled off the
// sheet, before the live figure goes down. An earlier pass used
// destination-out for this, which does not clear the slot — it punches a hole
// straight through the painting to the page behind it.
const SLOT = {
  score:  "#000028",
  wave:   "#00003D",
  lives:  "#030233",
  combo:  "#030019",
  target: "#000021",
};

// Value areas within each panel, as fractions of the frame.
const VAL = {
  score:  [0.245, 0.42, 0.925, 0.87],
  wave:   [0.765, 0.33, 0.965, 0.87],
  lives:  [0.300, 0.48, 0.900, 0.86],
  combo:  [0.305, 0.24, 0.822, 0.78],
  comboX: [0.845, 0.20, 1.000, 0.82],
  target: [0.060, 0.34, 0.940, 0.86],
};

function panelSlot(key, x, y, h, region) {
  const w = Sprites.widthFor(key, h);
  const r = VAL[region || key];
  return { x: x + r[0] * w, y: y + r[1] * h,
           w: (r[2] - r[0]) * w, h: (r[3] - r[1]) * h, pw: w };
}

function fitText(text, box, colour, weight = "bold", shrink = 0.78) {
  let fs = box.h * shrink;
  ctx.font = `${weight} ${fs}px ${MONO}`;
  const tw = ctx.measureText(text).width;
  if (tw > box.w) { fs *= box.w / tw; ctx.font = `${weight} ${fs}px ${MONO}`; }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);
  return fs;
}

function drawHUD() {
  if (!con) layoutConsole();
  const { top, h: ch, pad } = con;

  // ---- score, left ----
  const scH = ch * 0.44, scY = top + ch * 0.13;
  Sprites.drawAt(ctx, "score", pad, scY, scH);
  const scBox = panelSlot("score", pad, scY, scH);
  ctx.fillStyle = SLOT.score;
  ctx.fillRect(scBox.x, scBox.y, scBox.w, scBox.h);
  fitText(String(Math.min(999999, score)).padStart(6, "0"), scBox, "#7FEFFF");

  // ---- combo, under it ----
  const cbH = ch * 0.30, cbY = top + ch * 0.62;
  Sprites.drawAt(ctx, "combo", pad, cbY, cbH);
  const bar = panelSlot("combo", pad, cbY, cbH);
  const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
  ctx.fillStyle = SLOT.combo;
  ctx.fillRect(bar.x + bar.w * into, bar.y, bar.w * (1 - into) + 1, bar.h);
  const xb = panelSlot("combo", pad, cbY, cbH, "comboX");
  ctx.fillStyle = SLOT.combo;
  ctx.fillRect(xb.x, xb.y, xb.w, xb.h);
  fitText("x" + multiplier, xb, multiplier > 1 ? "#FFE96B" : "#9FB6D8", "bold", 0.68);

  // ---- wave, right ----
  const wvH = ch * 0.46, wvY = top + ch * 0.12;
  const wvW = Sprites.widthFor("wave", wvH);
  const wvX = W - wvW - pad;
  Sprites.drawAt(ctx, "wave", wvX, wvY, wvH);
  const wvBox = panelSlot("wave", wvX, wvY, wvH);
  ctx.fillStyle = SLOT.wave;
  ctx.fillRect(wvBox.x, wvBox.y, wvBox.w, wvBox.h);
  fitText(String(Math.max(1, wave)), wvBox, "#FFFFFF", "bold", 0.74);

  // ---- lives, under it ----
  const lvH = ch * 0.32, lvY = top + ch * 0.64;
  const lvW = Sprites.widthFor("lives", lvH);
  const lvX = W - lvW - pad;
  Sprites.drawAt(ctx, "lives", lvX, lvY, lvH);
  const lvBox = panelSlot("lives", lvX, lvY, lvH);
  ctx.fillStyle = SLOT.lives;
  ctx.fillRect(lvBox.x, lvBox.y, lvBox.w, lvBox.h);
  const step = lvBox.w / 3;
  for (let i = 0; i < Math.min(lives, 3); i++) {
    Sprites.draw(ctx, "lifeIcon", lvBox.x + step * (i + 0.5), lvBox.y + lvBox.h * 0.5,
                 lvBox.h * 0.92);
  }

  // ---- the target readout, in the central podium ----
  const tgH = ch * 0.66, tgY = top + ch * 0.15;
  const tgW = Sprites.widthFor("target", tgH);
  const tgX = (W - tgW) / 2;
  Sprites.drawAt(ctx, "target", tgX, tgY, tgH);
  const tg = panelSlot("target", tgX, tgY, tgH);

  if (lockTarget && !lockTarget.dying) {
    const w = lockTarget.word;
    let fs = tg.h * 0.62;
    ctx.font = `bold ${fs}px ${MONO}`;
    if (ctx.measureText(w).width > tg.w * 0.8) {
      fs *= (tg.w * 0.8) / ctx.measureText(w).width;
      ctx.font = `bold ${fs}px ${MONO}`;
    }
    const done = w.slice(0, lockTarget.typed);
    const rest = w.slice(lockTarget.typed);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const cy = tg.y + tg.h * 0.5;
    let x = tg.x + tg.w / 2 - ctx.measureText(w).width / 2;
    if (done) { ctx.fillStyle = NEON.lime; ctx.fillText(done, x, cy); x += ctx.measureText(done).width; }
    ctx.fillStyle = "#EAF6FF";
    ctx.fillText(rest, x, cy);
  } else {
    // Nothing locked: the panel shows the juke charges, which is the decision
    // actually in front of the player at that moment.
    const per = currentLevel().jukeRefill || JUKE_REFILL;
    const pipH = tg.h * 0.30, gap = tg.w * 0.022;
    const pipW = (tg.w * 0.52 - gap * (JUKE_CHARGES - 1)) / JUKE_CHARGES;
    const totalW = JUKE_CHARGES * pipW + (JUKE_CHARGES - 1) * gap;
    const cy = tg.y + tg.h * 0.5;
    ctx.font = `bold ${tg.h * 0.34}px ${MONO}`;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(170, 210, 255, 0.8)";
    ctx.fillText("SPACE", tg.x + tg.w / 2 - totalW / 2 - gap * 2, cy);
    for (let i = 0; i < JUKE_CHARGES; i++) {
      const px = tg.x + tg.w / 2 - totalW / 2 + i * (pipW + gap);
      const fill = i < juke.charges ? 1
                 : i === juke.charges ? Math.min(1, juke.refill / per) : 0;
      ctx.fillStyle = "rgba(150, 200, 255, 0.20)";
      roundRect(px, cy - pipH / 2, pipW, pipH, pipH * 0.35); ctx.fill();
      if (fill > 0) {
        ctx.fillStyle = fill >= 1 ? NEON.lime : "rgba(124, 255, 61, 0.5)";
        roundRect(px, cy - pipH / 2, Math.max(2, pipW * fill), pipH, pipH * 0.35); ctx.fill();
      }
    }
  }

  // ---- run stats, along the very foot ----
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.font = `${Math.max(10, ch * 0.105)}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(190, 220, 255, 0.72)";
  ctx.fillText(
    `WPM ${wpm}    ACC ${acc}%    ${currentLevel().label}    ${currentWordSet().label.toUpperCase()}    ESC MENU`,
    W / 2, H - ch * 0.05
  );
  ctx.textAlign = "left";
}



// ---- Settings UI ----
const diffButtons = Array.from(document.querySelectorAll(".diff-btn"));
const setButtons = Array.from(document.querySelectorAll(".set-btn"));
const kbdButtons = Array.from(document.querySelectorAll(".kbd-btn"));
const musicToggleEl = document.getElementById("music-toggle");
const musicVolEl = document.getElementById("music-vol");
const musicVolNumEl = document.getElementById("music-vol-num");
const sfxVolEl = document.getElementById("sfx-vol");
const sfxVolNumEl = document.getElementById("sfx-vol-num");

function syncSettingsUI() {
  for (const b of diffButtons) b.classList.toggle("selected", b.dataset.diff === settings.difficulty);
  for (const b of setButtons) b.classList.toggle("selected", b.dataset.set === settings.wordSet);
  for (const b of kbdButtons) b.classList.toggle("selected", b.dataset.kbd === guideMode());
  musicToggleEl.textContent = settings.musicOn ? "ON" : "OFF";
  musicToggleEl.classList.toggle("off", !settings.musicOn);
  musicVolEl.value = settings.musicVol;
  musicVolNumEl.textContent = settings.musicVol;
  sfxVolEl.value = settings.sfxVol;
  sfxVolNumEl.textContent = settings.sfxVol;
  menuDiffEl.textContent = `${currentLevel().label}  ·  ${currentWordSet().label}`;
  const best = scoresFor(settings.difficulty)[0];
  menuBestEl.textContent = best
    ? `Best on ${currentLevel().label}: ${best.score}  (wave ${best.wave || 1}, ${best.wpm} wpm)`
    : "";
}

for (const b of diffButtons) {
  b.addEventListener("click", () => {
    settings.difficulty = b.dataset.diff;
    saveSettings();
    syncSettingsUI();
  });
}
for (const b of setButtons) {
  b.addEventListener("click", () => {
    settings.wordSet = b.dataset.set;
    saveSettings();
    syncSettingsUI();
  });
}

for (const b of kbdButtons) {
  b.addEventListener("click", () => {
    settings.keyboardGuide = b.dataset.kbd;
    saveSettings();
    syncSettingsUI();
  });
}

musicToggleEl.addEventListener("click", () => {
  settings.musicOn = !settings.musicOn;
  saveSettings();
  syncSettingsUI();
  if (settings.musicOn) { ensureAudio(); startMusic(); } else stopMusic();
});

musicVolEl.addEventListener("input", () => {
  settings.musicVol = Number(musicVolEl.value);
  saveSettings();
  applyVolumes();
  musicVolNumEl.textContent = settings.musicVol;
});

sfxVolEl.addEventListener("input", () => {
  settings.sfxVol = Number(sfxVolEl.value);
  saveSettings();
  applyVolumes();
  sfxVolNumEl.textContent = settings.sfxVol;
  sfx.shoot();
});

document.getElementById("settings-back").addEventListener("click", closeSettings);
document.getElementById("menu-settings").addEventListener("click", () => openSettings("menu"));
document.getElementById("gameover-settings").addEventListener("click", () => openSettings("gameover"));
document.getElementById("gameover-menu").addEventListener("click", returnToMenu);
quitBtn.addEventListener("click", requestQuit);

window.addEventListener("pointerdown", () => { ensureAudio(); startMusic(); });

resetGame();
syncSettingsUI();

// ---- Main loop ----
// Hybrid scheduler: requestAnimationFrame when it's firing, with a setTimeout
// fallback so the game keeps running in occluded/embedded views where rAF is
// throttled. The dt clamp keeps time from jumping after a stall.
let lastTime = performance.now();
let rafId = 0, fallbackId = 0;
function frame(now) {
  cancelAnimationFrame(rafId);
  clearTimeout(fallbackId);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state === "playing") update(dt);
  draw(dt);
  rafId = requestAnimationFrame(frame);
  fallbackId = setTimeout(() => frame(performance.now()), 50);
}
Sprites.load().then(() => {
  resize();
  relayout();
  frame(performance.now());
});
