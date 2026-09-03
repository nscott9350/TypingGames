// ============================================================
// Bug Parade — a centipede for touch typists.
//
// A centipede is a word. Its head carries the first letter, the segment behind
// it the second, and so on down to the tail. Typing the head's letter bursts
// the head; the segment behind it becomes the new head and the next letter is
// now the one to press. So the key you need is always on the front of the bug,
// and a word is read left to right along a thing that is crawling towards you.
//
// Everything else follows the genre as it was first cut: a burst segment leaves
// a mushroom where it died, mushrooms are what turn the parade down a row, and
// the garden therefore gets more tangled the better you play.
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

// ---- Stage ----
// The background is a painting with a console printed across its foot, so the
// playfield is letterboxed to its shape and everything is drawn translated into
// the stage's own coordinates.
const STAGE_AR = 1672 / 941;
const CONSOLE_H = 0.155;     // fraction of the stage the painted console owns
const FIELD_TOP_F = 0.10;    // clear of the leaves hanging over the top edge
const FIELD_BOT_F = 0.838;   // the garden ledge the console sits under
const GRID_COLS = 28;
const BAND_ROWS = 3;         // rows the beetle patrols, and the bugs invade

// ---- Tuning ----
const INVULN_TIME = 2.2;
const STARTING_LIVES = 3;
const MAX_PARTICLES = 700;
const STREAK_PER_MULT = 20;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;     // seconds the struck-out key stays on the guide
const ASSIST_MISSES = 3;     // consecutive misses before the guide steps in
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;
const JUKE_TIME = 0.16;
const JUKE_DIST_CELLS = 3.1;   // one dart, in grid cells
const JUKE_IFRAMES = 0.5;
const JUKE_CHARGES = 2;
const JUKE_REFILL = 2.6;
const JUKE_HOLD = 0.7;
const SEG_GAP = 0.84;        // segment spacing, in grid cells
const TRACER_LIFE = 0.14;    // the shot is a streak, not a travelling pellet
const BLOOM_RADIUS = 2.6;    // cells cleared when a whole word is finished

// ---- Settings & scores (own keys, so no other game's data is touched) ----
const SETTINGS_KEY = "bugparade-settings";
const SCORES_KEY = "bugparade-scores";
const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  difficulty: "normal", wordSet: "all", musicOn: true, musicVol: 50, sfxVol: 70,
  keyboardGuide: "off",   // "off" | "assist" | "always"
};
let settings = { ...DEFAULT_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (saved && typeof saved === "object") settings = { ...DEFAULT_SETTINGS, ...saved, v: SETTINGS_VERSION };
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
  return scoresFor(entry.difficulty)
    .findIndex(s => s.date === entry.date && s.score === entry.score);
}

// ---- Difficulty ----
// `march` is how many cells a centipede covers per second on wave 1; every
// later wave adds 6%. `spider`/`flea` are the gaps between visits, in seconds,
// on wave 1 and on wave 8 — they close as the run goes on.
// Two assists, both withdrawn at the top:
//   `autoEvade` — the beetle sidesteps whatever is bearing down on it
//   `grace`     — a correct keystroke buys this many seconds of immunity
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", march: 3.0, chains: [2, 4], spider: [11, 8], flea: [14, 10], scorpWave: 99, grace: 0.80, autoEvade: true },
  easy:     { label: "EASY",     march: 3.8, chains: [2, 4], spider: [10, 7], flea: [12, 9],  scorpWave: 6,  grace: 0.55, autoEvade: true },
  normal:   { label: "NORMAL",   march: 4.6, chains: [3, 5], spider: [8, 5.5], flea: [10, 7], scorpWave: 4,  grace: 0.30, autoEvade: true },
  hard:     { label: "HARD",     march: 5.6, chains: [3, 6], spider: [7, 4.5], flea: [9, 6],  scorpWave: 3,  grace: 0, autoEvade: false, jukeRefill: 2.2 },
  master:   { label: "MASTER",   march: 6.6, chains: [4, 7], spider: [6, 3.5], flea: [8, 5],  scorpWave: 2,  grace: 0, autoEvade: false, jukeRefill: 2.0 },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentWordSet = () => WORD_SETS[settings.wordSet] || WORD_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

// Interpolate a per-wave figure between its wave-1 and wave-8 ends.
function ramp(range, n) {
  const k = Math.min(1, (n - 1) / 7);
  return range[0] + (range[1] - range[0]) * k;
}

// ---- Palette ----
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

// ---- Glow sprite cache ----
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const size = 64;
  c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
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

// ---- Layout ----
let W = 0, H = 0, VW = 0, VH = 0, stageX = 0, stageY = 0;
let grid = null, con = null;

function layout() {
  const cell = W / GRID_COLS;
  const top = H * FIELD_TOP_F, bottom = H * FIELD_BOT_F;
  const rows = Math.max(6, Math.floor((bottom - top) / cell));
  // Bottom-aligned: the last row must sit on the ledge the console is built
  // into, or the beetle ends up patrolling in mid-air.
  grid = { cols: GRID_COLS, rows, cell, y0: bottom - rows * cell, bottom };
  con = { top: H * (1 - CONSOLE_H), h: H * CONSOLE_H, pad: W * 0.012 };
}

const cellX = (col) => (col + 0.5) * grid.cell;
const cellY = (row) => grid.y0 + (row + 0.5) * grid.cell;
const colAt = (x) => Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cell)));
const rowAt = (y) => Math.max(0, Math.min(grid.rows - 1, Math.floor((y - grid.y0) / grid.cell)));
const bandTopRow = () => grid.rows - BAND_ROWS;

function playerBaseY() { return cellY(grid.rows - 1); }

// The beetle and its dart are sized off the grid, so the whole game keeps its
// proportions on a phone-shaped window and on a wide one alike.
const playerR = () => grid.cell * 0.55;
const jukeDist = () => grid.cell * JUKE_DIST_CELLS;

function resize() {
  const d = window.devicePixelRatio || 1;
  VW = window.innerWidth;
  VH = window.innerHeight;
  canvas.width = VW * d;
  canvas.height = VH * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  if (VW / VH > STAGE_AR) { H = VH; W = VH * STAGE_AR; }
  else { W = VW; H = VW / STAGE_AR; }
  stageX = Math.round((VW - W) / 2);
  stageY = Math.round((VH - H) / 2);
  layout();
}

// Entity fixup after the stage changes size. Kept out of resize() because that
// runs once while the module is still being evaluated, before these bindings
// exist — touching them there puts the whole file in the temporal dead zone.
function relayout() {
  if (!player) return;
  player.y = playerBaseY();
  player.x = Math.max(playerR(), Math.min(W - playerR(), player.x));
  // Enemies hold grid coordinates, so their pixel positions are simply
  // recomputed; a centipede's trail is dropped and regrown from the head.
  for (const e of enemies) {
    if (e.kind === "chain") {
      e.wx = cellX(e.col); e.wy = cellY(e.row);
      e.tx = e.wx; e.ty = e.wy;
      e.sLead = 0;
      e.path = [{ x: e.wx, y: e.wy, s: 0 }];
      seedTrail(e);
    } else {
      e.x = Math.max(0, Math.min(W, e.x));
      e.y = Math.max(0, Math.min(grid.bottom, e.y));
    }
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
  shoot: (step = 0) => blip(700 + step * 34, 0.06, "square", 0.032, -280),
  pop: () => blip(420, 0.09, "triangle", 0.05, -180),
  explode: () => blip(140, 0.34, "sawtooth", 0.08, -100),
  error: () => blip(150, 0.14, "square", 0.055),
  lock: () => blip(1180, 0.06, "triangle", 0.05),
  bloom: () => { [0, 80, 170].forEach((d, i) => setTimeout(() => blip([660, 880, 1320][i], 0.16, "sine", 0.05), d)); },
  spider: () => blip(230, 0.3, "sawtooth", 0.035, 160),
  flea: () => blip(900, 0.3, "sawtooth", 0.035, -600),
  scorpion: () => blip(120, 0.5, "square", 0.04, 60),
  playerHit: () => blip(90, 0.55, "sawtooth", 0.11, -50),
  juke: () => blip(520, 0.16, "sine", 0.05, 620),
  jukeBlocked: () => blip(180, 0.06, "square", 0.025),
  levelUp: () => { blip(720, 0.09, "triangle", 0.05); setTimeout(() => blip(1080, 0.15, "triangle", 0.05), 80); },
  wave: () => { [0, 100, 200, 320].forEach((d, i) => setTimeout(() => blip([523, 659, 784, 1047][i], 0.18, "triangle", 0.06), d)); },
};

// ---- Music: a bright garden loop, generated (no audio files to host) ----
const MUSIC_TEMPO = 124;
const STEPS_PER_BAR = 8;
const PROGRESSION = [
  { bass: 33, chord: [57, 60, 64] }, // Am
  { bass: 41, chord: [57, 60, 65] }, // F
  { bass: 36, chord: [60, 64, 67] }, // C
  { bass: 43, chord: [59, 62, 67] }, // G
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
let player, enemies, mushrooms, tracers, particles, shockwaves, blooms, lockTarget;
let banner, spawnQueue, spawnTimer, spiderTimer, fleaTimer, scorpionTimer, waveClearTimer;
let score, lives, elapsed, wave;
let invuln, grace, shake, flash, juke, wrongKey, assist;
let typedCorrect, typedWrong, kills, streak, bestStreak, multiplier;

function guideVisibility() {
  const m = guideMode();
  if (m === "always") return 1;
  if (m === "assist") return assist ? assist.alpha : 0;
  return 0;
}

function guideBox() {
  if (guideVisibility() <= 0.001) return { on: false, h: 0, w: 0, x: 0, y: H };
  return { on: true, ...keyboardGuideLayout(W, H * 0.86, true) };
}

function resetGame() {
  player = { x: W / 2, y: playerBaseY(), wing: 0, muzzle: 0, tilt: 0 };
  enemies = [];
  mushrooms = new Map();
  tracers = [];
  particles = [];
  shockwaves = [];
  blooms = [];
  lockTarget = null;
  banner = null;
  spawnQueue = [];
  spawnTimer = 0;
  spiderTimer = 0;
  fleaTimer = 0;
  scorpionTimer = 0;
  waveClearTimer = 0;
  score = 0;
  lives = STARTING_LIVES;
  elapsed = 0;
  wave = 1;
  invuln = 0;
  grace = 0;
  shake = 0;
  flash = 0;
  juke = { charges: JUKE_CHARGES, refill: 0, t: 0, dir: 0, hold: 0 };
  wrongKey = { key: null, t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  typedCorrect = 0;
  typedWrong = 0;
  kills = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
  seedGarden();
}

// ---- The garden ----
const cellKey = (col, row) => col + "," + row;

function mushroomAt(col, row) { return mushrooms.get(cellKey(col, row)); }

function plantMushroom(col, row, poison = false) {
  if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
  // The beetle's own row stays clear; a mushroom there would wall it in.
  if (row >= grid.rows - 1) return null;
  const existing = mushroomAt(col, row);
  if (existing) { if (poison) existing.poison = true; return existing; }
  // A garden that silts up completely stops being a maze and becomes a chute:
  // every centipede would drop a row on each step and arrive at once.
  if (mushrooms.size >= grid.cols * grid.rows * 0.3) return null;
  const m = { col, row, poison, grow: 0, dying: 0, art: (Math.random() * MUSHROOM_ART) | 0 };
  mushrooms.set(cellKey(col, row), m);
  return m;
}

function clearMushroom(m) {
  if (!m || m.dying) return;
  m.dying = 0.35;
}

// A garden that already has cover in it, so the first centipede has something
// to wind around. Kept off the beetle's band so wave one opens clean.
function seedGarden() {
  const want = Math.round(grid.cols * grid.rows * 0.055);
  let tries = 0;
  while (mushrooms.size < want && tries++ < want * 20) {
    const col = (Math.random() * grid.cols) | 0;
    const row = 1 + ((Math.random() * (bandTopRow() - 2)) | 0);
    plantMushroom(col, row);
  }
  for (const m of mushrooms.values()) m.grow = 1;
}

function bloomAt(x, y) {
  blooms.push({ x, y, t: 0, life: 0.75 });
  const c0 = colAt(x), r0 = rowAt(y);
  const span = Math.ceil(BLOOM_RADIUS);
  for (let dc = -span; dc <= span; dc++) {
    for (let dr = -span; dr <= span; dr++) {
      if (dc * dc + dr * dr > BLOOM_RADIUS * BLOOM_RADIUS) continue;
      clearMushroom(mushroomAt(c0 + dc, r0 + dr));
    }
  }
  shockwave(x, y, grid.cell * BLOOM_RADIUS, NEON.lime, 4);
  sfx.bloom();
}

// ---- Words ----
function lettersInPlay() {
  const used = new Set();
  for (const e of enemies) if (!e.dying) used.add(nextLetter(e));
  return used;
}

// Longer words later on, and a floor of three so a centipede is always a
// centipede rather than a single bug with a hat.
function wordLengthFor(n) {
  const lo = 3 + Math.min(3, Math.floor((n - 1) / 3));
  const hi = 5 + Math.min(4, Math.floor((n - 1) / 2));
  return [lo, Math.max(lo + 1, hi)];
}

function pickWord(minLen, maxLen, used) {
  const pools = currentWordSet().pools;
  const all = [...(pools.short || []), ...(pools.medium || []), ...(pools.long || [])];
  const fits = all.filter(w => w.length >= minLen && w.length <= maxLen);
  const pool = fits.length ? fits : all;
  // A first letter nothing else is wearing keeps the lock unambiguous. If the
  // set is too small for that — home row on a busy wave — fall back and let
  // the nearest-target rule sort it out.
  const free = pool.filter(w => !used.has(w[0]));
  const from = free.length ? free : pool;
  return from[(Math.random() * from.length) | 0] || "bug";
}

// ---- Enemies ----
// Every enemy exposes the same two things to the typing layer: the letter it
// currently wants, and where on screen that letter is.
function nextLetter(e) { return e.word[e.typed] || ""; }

function enemyHead(e) {
  return e.kind === "chain" ? segPos(e, 0) : { x: e.x, y: e.y };
}

function targetable(e) { return !e.dying; }

const segSpacing = () => grid.cell * SEG_GAP;
const liveSegments = (e) => e.word.length - e.typed;

// A centipede's body is a trail of points the head has walked through, indexed
// by how far the head had travelled when each was laid down. Segments simply
// read off that trail at fixed distances behind the head, which is what makes
// the body follow the head around corners instead of chasing it in a straight
// line.
function segPos(e, i) {
  return posAt(e, e.sLead - i * segSpacing());
}

function posAt(e, s) {
  const path = e.path;
  if (s >= path[0].s) return { x: path[0].x, y: path[0].y };
  for (let i = 1; i < path.length; i++) {
    if (path[i].s <= s) {
      const a = path[i], b = path[i - 1];
      const span = b.s - a.s;
      const k = span > 0.0001 ? (s - a.s) / span : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const last = path[path.length - 1];
  return { x: last.x, y: last.y };
}

// Lay a straight tail off the edge of the stage so a new centipede streams in
// rather than appearing whole.
function seedTrail(e) {
  const back = liveSegments(e) * segSpacing() + segSpacing();
  e.path.push({ x: e.wx - e.dir * back, y: e.wy, s: -back });
}

// Colourways cycle rather than being drawn at random, so two centipedes on
// screen together are never the same colour.
let nextColorway = 0;

function spawnChain(word, col, dir) {
  const e = {
    kind: "chain",
    word, typed: 0,
    color: nextColorway++ % COLORWAYS.length,
    col, row: 0, dir, vdir: 1,
    wx: cellX(col), wy: cellY(0),
    tx: cellX(col), ty: cellY(0),
    sLead: 0, path: null,
    plunge: 0,
    ceil: 0,
    dying: false,
  };
  e.path = [{ x: e.wx, y: e.wy, s: 0 }];
  seedTrail(e);
  enemies.push(e);
  return e;
}

function marchSpeed() {
  return currentLevel().march * grid.cell * (1 + 0.06 * (wave - 1));
}

function retarget(e) {
  const nextRow = () => {
    let r = e.row + e.vdir;
    if (r > grid.rows - 1 || r < e.ceil) { e.vdir = -e.vdir; r = e.row + e.vdir; }
    return Math.max(e.ceil, Math.min(grid.rows - 1, r));
  };

  if (e.plunge > 0) {
    if (e.row >= grid.rows - 1) { e.plunge = 0; }
    else {
      e.plunge--;
      e.row += 1;
      e.tx = cellX(e.col); e.ty = cellY(e.row);
      return;
    }
  }

  const nc = e.col + e.dir;
  const blocker = (nc < 0 || nc >= grid.cols) ? null : mushroomAt(nc, e.row);
  if (nc < 0 || nc >= grid.cols || (blocker && !blocker.dying)) {
    if (blocker && blocker.poison) {
      // Poisoned cover sends the parade straight at you.
      e.plunge = grid.rows;
      e.row = Math.min(grid.rows - 1, e.row + 1);
      e.tx = cellX(e.col); e.ty = cellY(e.row);
      return;
    }
    e.dir = -e.dir;
    e.row = nextRow();
  } else {
    e.col = nc;
  }
  e.tx = cellX(e.col); e.ty = cellY(e.row);
}

function updateChain(e, dt, speed) {
  let move = speed * dt;
  let guard = 0;
  while (move > 0 && guard++ < 8) {
    const dx = e.tx - e.wx, dy = e.ty - e.wy;
    const d = Math.hypot(dx, dy);
    if (d <= move) {
      e.wx = e.tx; e.wy = e.ty;
      e.sLead += d;
      move -= d;
      retarget(e);
    } else {
      e.wx += dx / d * move;
      e.wy += dy / d * move;
      e.sLead += move;
      move = 0;
    }
  }
  // Once a centipede is down among the mushrooms it patrols there rather than
  // marching off the bottom of the world — including one that got there by
  // plunging down a poisoned column rather than by working its way down.
  if (e.row >= bandTopRow() - 1) e.ceil = bandTopRow() - 1;
  // path[0] is the live head and is rewritten every frame; the points behind it
  // are frozen snapshots. Moving the head by editing path[0] in place — rather
  // than freezing a copy first — leaves the trail with nothing but the head in
  // it, and the whole body then strings out towards wherever the tail was laid.
  const anchor = e.path[1];
  if (!anchor || Math.hypot(e.wx - anchor.x, e.wy - anchor.y) > 3) {
    e.path.splice(1, 0, { ...e.path[0] });
  }
  e.path[0] = { x: e.wx, y: e.wy, s: e.sLead };

  // Drop the oldest point only once the one in front of it already reaches
  // back past the tail; anything beyond that is trail nobody can see.
  const keep = e.sLead - (liveSegments(e) + 1) * segSpacing();
  while (e.path.length > 2 && e.path[e.path.length - 2].s <= keep) e.path.pop();
}

// Burst the front segment. The chain does not shuffle forward to fill the gap;
// the body stays exactly where it is and the segment behind inherits the lead,
// which is what makes a long centipede feel like it is being eaten from the
// front rather than sliding backwards.
function popSegment(e) {
  const p = segPos(e, 0);
  const T = COLORWAYS[e.color];
  burst(p.x, p.y, grid.cell * 0.45, [T.glow, NEON.white, NEON.yellow], 16);
  shockwave(p.x, p.y, grid.cell * 1.1, T.glow, 2);
  const m = plantMushroom(colAt(p.x), rowAt(p.y));
  if (m) m.grow = 0;
  sfx.pop();

  e.typed++;
  if (liveSegments(e) <= 0) {
    e.dying = true;
    kills++;
    score += 40 * multiplier;
    bloomAt(p.x, p.y);
    return;
  }
  const lead = e.sLead - segSpacing();
  const q = posAt(e, lead);
  e.sLead = lead;
  while (e.path.length > 1 && e.path[0].s > lead) e.path.shift();
  e.path.unshift({ x: q.x, y: q.y, s: lead });
  e.wx = q.x; e.wy = q.y;
  e.col = colAt(q.x); e.row = rowAt(q.y);
  e.tx = cellX(e.col); e.ty = cellY(e.row);
}

function spawnSpider() {
  const fromLeft = Math.random() < 0.5;
  const word = pickWord(3, 5, lettersInPlay());
  enemies.push({
    kind: "spider", word, typed: 0,
    x: fromLeft ? -40 : W + 40,
    y: cellY(bandTopRow() + 1),
    vx: (fromLeft ? 1 : -1) * grid.cell * 2.4,
    vy: grid.cell * 2.0 * (Math.random() < 0.5 ? 1 : -1),
    turn: 0.5 + Math.random(),
    r: grid.cell * 0.55,
    art: Math.random() < 0.5 ? "spider" : "spider2",
    dying: false,
  });
  sfx.spider();
}

function spawnFlea() {
  const word = pickWord(3, 4, lettersInPlay());
  enemies.push({
    kind: "flea", word, typed: 0,
    x: cellX((Math.random() * grid.cols) | 0),
    y: -grid.cell,
    vy: grid.cell * 4.2,
    lastRow: -1,
    r: grid.cell * 0.42,
    art: "flea" + ((Math.random() * 3) | 0),
    dying: false,
  });
  sfx.flea();
}

function spawnScorpion() {
  const fromLeft = Math.random() < 0.5;
  const word = pickWord(6, 9, lettersInPlay());
  const row = 1 + ((Math.random() * Math.max(1, bandTopRow() - 3)) | 0);
  enemies.push({
    kind: "scorpion", word, typed: 0,
    x: fromLeft ? -60 : W + 60,
    y: cellY(row),
    vx: (fromLeft ? 1 : -1) * grid.cell * 2.0,
    row,
    r: grid.cell * 0.55,
    art: Math.random() < 0.5 ? "scorpion" : "scorpion2",
    dying: false,
  });
  sfx.scorpion();
}

// ---- Particles ----
function addParticle(p) {
  if (particles.length < MAX_PARTICLES) particles.push(p);
}

function burst(x, y, radius, palette, count, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (60 + Math.random() * 260) * speedScale;
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.5, maxLife: 0.85,
      r: 1.6 + Math.random() * (radius * 0.14),
      color: palette[(Math.random() * palette.length) | 0],
    });
  }
}

function shockwave(x, y, maxR, color, width = 3) {
  shockwaves.push({ x, y, r: 0, maxR, color, width, life: 0.45, maxLife: 0.45 });
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
  tracers = [];
  particles = [];
  shockwaves = [];
  blooms = [];
  lockTarget = null;
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

  // Space is a dart aside. It is deliberately the one non-letter control:
  // hitting space with a thumb, without looking, is itself a typing skill.
  if (e.key === " " || e.code === "Space" || e.key === "Spacebar" || e.keyCode === 32) {
    e.preventDefault();
    tryJuke();
    return;
  }
  if (!/^[a-z]$/i.test(e.key)) return;

  const letter = e.key.toLowerCase();
  if (lockTarget && lockTarget.dying) lockTarget = null;

  // The letter you are on always belongs to the thing you are already typing.
  // Only once it cannot be that does the key get offered to anything else, so
  // a word can always be finished even when something else on screen wants the
  // same letter.
  if (lockTarget) {
    if (nextLetter(lockTarget) === letter) {
      correctLetter(lockTarget);
      return;
    }
    const other = findTarget(letter, lockTarget);
    if (!other) {
      wrongLetter(letter);
      return;
    }
    // Pivoting away is free and what you typed is kept: the tag over an
    // abandoned bug still shows how far in you were, and coming back to it
    // means pressing the letter it is waiting on rather than starting again.
    // Spiders are the reason. They cross the beetle's own strip in a couple of
    // seconds, so a rule that made you finish a nine-letter centipede first
    // meant you could never answer one.
    lockTarget = other;
    sfx.lock();
    correctLetter(other);
    return;
  }

  const best = findTarget(letter, null);
  if (best) {
    lockTarget = best;
    sfx.lock();
    correctLetter(best);
  } else {
    wrongLetter(letter);
  }
});

// Whatever is waiting on this letter and is nearest the beetle, which
// naturally prioritises the thing about to reach it. `except` keeps a target
// from being offered its own key twice over.
function findTarget(letter, except) {
  let best = null, bestDist = Infinity;
  for (const e of enemies) {
    if (e === except || !targetable(e) || nextLetter(e) !== letter) continue;
    const p = enemyHead(e);
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function bumpStreak() {
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  const m = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (m > multiplier) {
    multiplier = m;
    sfx.levelUp();
    shockwave(player.x, player.y, grid.cell * 2.4, NEON.lime, 2);
  }
}

function correctLetter(e) {
  const p = enemyHead(e);
  typedCorrect++;
  assist.misses = 0;
  assist.showing = false;
  bumpStreak();
  score += 10 * multiplier;
  const g = currentLevel().grace;
  if (g > 0) grace = Math.max(grace, g);
  fireAt(p.x, p.y);
  sfx.shoot(Math.min(12, streak % STREAK_PER_MULT));

  if (e.kind === "chain") {
    popSegment(e);
    if (e.dying) lockTarget = null;
    return;
  }

  e.typed++;
  if (e.typed >= e.word.length) {
    killLoose(e);
    lockTarget = null;
  } else {
    burst(p.x, p.y, e.r, [NEON.white, NEON.yellow], 6);
  }
}

function killLoose(e) {
  e.dying = true;
  kills++;
  const pts = { spider: 300, flea: 150, scorpion: 750 }[e.kind] || 100;
  score += pts * multiplier;
  burst(e.x, e.y, e.r * 1.4, [NEON.orange, NEON.yellow, NEON.white, NEON.magenta], 30);
  shockwave(e.x, e.y, e.r * 4, NEON.orange, 3);
  sfx.explode();
  if (e.kind === "scorpion") {
    // Killing the scorpion undoes what it came to do.
    for (const m of mushrooms.values()) m.poison = false;
  }
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

function fireAt(x, y) {
  tracers.push({ x0: player.x, y0: player.y - playerR(), x1: x, y1: y, t: TRACER_LIFE });
  player.muzzle = 0.1;
}

function loseLife() {
  lives--;
  streak = 0;
  multiplier = 1;
  invuln = INVULN_TIME;
  grace = 0;
  shake = 16;
  flash = 0.5;
  burst(player.x, player.y, playerR() * 1.4, [NEON.orange, NEON.white, "#FF3355"], 32);
  shockwave(player.x, player.y, grid.cell * 3.6, NEON.orange, 4);
  sfx.playerHit();
  if (lives <= 0) endGame("dead");
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 34);
  flash = Math.max(0, flash - dt * 2);
  invuln = Math.max(0, invuln - dt);
  grace = Math.max(0, grace - dt);
  wrongKey.t = Math.max(0, wrongKey.t - dt);
  player.muzzle = Math.max(0, player.muzzle - dt);
  player.wing += dt * 14;

  const target = assist.showing ? 1 : 0;
  const rate = target > assist.alpha ? dt / ASSIST_FADE_IN : dt / ASSIST_FADE_OUT;
  assist.alpha += Math.max(-rate, Math.min(rate, target - assist.alpha));

  if (lockTarget && (lockTarget.dying || !enemies.includes(lockTarget))) lockTarget = null;

  updatePlayer(dt);
  updateWave(dt);
  updateEnemies(dt);
  updateTracers(dt);
  updateParticles(dt);
  updateGarden(dt);

  if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
  for (let i = blooms.length - 1; i >= 0; i--) {
    blooms[i].t += dt;
    if (blooms[i].t >= blooms[i].life) blooms.splice(i, 1);
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    if (s.life <= 0) { shockwaves.splice(i, 1); continue; }
    s.r = s.maxR * (0.12 + 0.88 * Math.sqrt(1 - s.life / s.maxLife));
  }

  if (invuln <= 0 && grace <= 0) checkCollisions();
  else if (invuln > 0 && invuln < 0.05 && playerIsOverlapped()) invuln = 0.6;
}

function updateGarden(dt) {
  for (const [key, m] of mushrooms) {
    if (m.grow < 1) m.grow = Math.min(1, m.grow + dt * 4);
    if (m.dying > 0) {
      m.dying -= dt;
      if (m.dying <= 0) mushrooms.delete(key);
    }
  }
}

// ---- Waves ----
function startWave(n) {
  wave = n;
  const L = currentLevel();
  // The beetle's own patrol strip is swept between waves, so a run never opens
  // with it already boxed in by last wave's leavings.
  for (const m of mushrooms.values()) {
    if (m.row >= bandTopRow() - 1) clearMushroom(m);
    m.poison = false;
  }
  const count = Math.round(ramp(L.chains, n)) + (n > 6 ? 1 : 0);
  const [lo, hi] = wordLengthFor(n);
  const used = lettersInPlay();
  spawnQueue = [];
  for (let i = 0; i < count; i++) {
    const word = pickWord(lo, hi, used);
    used.add(word[0]);
    spawnQueue.push(word);
  }
  spawnTimer = 0.3;
  spiderTimer = ramp(L.spider, n) * 0.6;
  fleaTimer = ramp(L.flea, n);
  scorpionTimer = n >= L.scorpWave ? 6 + Math.random() * 6 : Infinity;
  waveClearTimer = 0;
  banner = { text: "WAVE " + n, sub: `${count} centipede${count > 1 ? "s" : ""}`, life: 2, maxLife: 2 };
  sfx.wave();
}

function updateWave(dt) {
  const L = currentLevel();

  if (spawnQueue.length) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      const word = spawnQueue.shift();
      const dir = Math.random() < 0.5 ? 1 : -1;
      const col = dir > 0 ? 0 : grid.cols - 1;
      spawnChain(word, col, dir);
      spawnTimer = 1.6;
    }
  }

  spiderTimer -= dt;
  if (spiderTimer <= 0) {
    spawnSpider();
    spiderTimer = ramp(L.spider, wave) * (0.7 + Math.random() * 0.6);
  }

  fleaTimer -= dt;
  if (fleaTimer <= 0) {
    spawnFlea();
    fleaTimer = ramp(L.flea, wave) * (0.7 + Math.random() * 0.6);
  }

  scorpionTimer -= dt;
  if (scorpionTimer <= 0) {
    spawnScorpion();
    scorpionTimer = 14 + Math.random() * 12;
  }

  const chainsLeft = enemies.some(e => e.kind === "chain" && !e.dying);
  if (!chainsLeft && !spawnQueue.length) {
    waveClearTimer += dt;
    if (waveClearTimer > 1.6) {
      score += 200 * wave;
      startWave(wave + 1);
    }
  } else {
    waveClearTimer = 0;
  }
}

// ---- Enemies ----
function updateEnemies(dt) {
  const speed = marchSpeed();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dying) { enemies.splice(i, 1); continue; }

    if (e.kind === "chain") {
      updateChain(e, dt, speed);
      continue;
    }

    if (e.kind === "spider") {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const top = cellY(bandTopRow()) - grid.cell * 0.4;
      const bot = cellY(grid.rows - 1) + grid.cell * 0.15;
      if (e.y < top) { e.y = top; e.vy = Math.abs(e.vy); }
      if (e.y > bot) { e.y = bot; e.vy = -Math.abs(e.vy); }
      e.turn -= dt;
      if (e.turn <= 0) { e.vy = -e.vy; e.turn = 0.5 + Math.random(); }
      // Spiders clear the cover they walk over, which is the only thing
      // reliably opening the band back up once it silts over.
      clearMushroom(mushroomAt(colAt(e.x), rowAt(e.y)));
      if (e.x < -grid.cell * 2 || e.x > W + grid.cell * 2) enemies.splice(i, 1);
      continue;
    }

    if (e.kind === "flea") {
      e.y += e.vy * dt;
      const r = rowAt(e.y);
      if (r !== e.lastRow && r % 2 === 0 && Math.random() < 0.75) {
        const m = plantMushroom(colAt(e.x), r);
        if (m) m.grow = 0;
      }
      e.lastRow = r;
      if (e.y > grid.bottom + grid.cell) enemies.splice(i, 1);
      continue;
    }

    if (e.kind === "scorpion") {
      e.x += e.vx * dt;
      const m = mushroomAt(colAt(e.x), e.row);
      if (m) m.poison = true;
      if (e.x < -grid.cell * 3 || e.x > W + grid.cell * 3) enemies.splice(i, 1);
    }
  }
}

// ---- Player ----
// The closest thing that can actually touch the beetle. Every segment counts,
// not just the head: a centipede down in the patrol strip is a wall of them,
// and flinching away from the head alone walks straight into its middle.
function nearestThreat() {
  let best = null, bestD = Infinity;
  const reach = player.y - grid.cell * 4;
  const consider = (p) => {
    if (p.y < reach) return;
    const d = Math.hypot(p.x - player.x, p.y - player.y);
    if (d < bestD) { bestD = d; best = p; }
  };
  for (const e of enemies) {
    if (e.dying) continue;
    if (e.kind === "chain") {
      const n = liveSegments(e);
      for (let i = 0; i < n; i++) consider(segPos(e, i));
    } else if (e.kind !== "scorpion") {
      consider({ x: e.x, y: e.y });
    }
  }
  return best ? { p: best, d: bestD } : null;
}

function jukeDirection() {
  const t = nearestThreat();
  if (!t) return player.x < W / 2 ? 1 : -1;
  const away = player.x < t.p.x ? -1 : 1;
  if (player.x + away * jukeDist() < playerR()) return 1;
  if (player.x + away * jukeDist() > W - playerR()) return -1;
  return away;
}

function tryJuke() {
  if (juke.charges <= 0) { sfx.jukeBlocked(); return; }
  juke.charges--;
  juke.t = JUKE_TIME;
  juke.hold = JUKE_HOLD;
  juke.dir = jukeDirection();
  invuln = Math.max(invuln, JUKE_IFRAMES);
  sfx.juke();
  shockwave(player.x, player.y, grid.cell * 1.9, NEON.lime, 2);
}

function updatePlayer(dt) {
  const L = currentLevel();
  const per = L.jukeRefill || JUKE_REFILL;
  if (juke.charges < JUKE_CHARGES) {
    juke.refill += dt;
    if (juke.refill >= per) { juke.refill = 0; juke.charges++; }
  } else {
    juke.refill = 0;
  }
  juke.hold = Math.max(0, juke.hold - dt);

  // Where the beetle wants to be: lined up under whatever it is shooting, so
  // its shot is short and the player can see what they are typing at. It only
  // chases things that are still above its own patrol strip — following the x
  // of a centipede that has already reached the strip means walking into it.
  const bandY = cellY(bandTopRow()) - grid.cell * 0.5;
  const lockPos = lockTarget && !lockTarget.dying ? enemyHead(lockTarget) : null;
  let want = player.x;
  if (lockPos) {
    if (lockPos.y < bandY) want = lockPos.x;
  } else {
    const t = nearestThreat();
    want = (t && t.p.y < bandY) ? t.p.x : W / 2;
  }

  // Backing away from something about to touch it is not the assist — the
  // beetle steers itself and would otherwise happily walk into a centipede it
  // is shooting at. What difficulty buys is how early it starts to flinch.
  const t = nearestThreat();
  const avoid = grid.cell * (L.autoEvade ? 2.6 : 1.35);
  if (t && t.d < avoid) want = player.x + (player.x < t.p.x ? -1 : 1) * grid.cell * 2.5;

  if (juke.t > 0) {
    juke.t -= dt;
    player.x += juke.dir * (jukeDist() / JUKE_TIME) * dt;
  } else if (juke.hold <= 0) {
    player.x += (want - player.x) * Math.min(1, dt * 7);
  }
  player.x = Math.max(playerR(), Math.min(W - playerR(), player.x));
  player.tilt = Math.max(-1, Math.min(1, (want - player.x) / (grid.cell * 2)));
  player.y = playerBaseY();
}

function playerIsOverlapped() {
  return collidingThing() !== null;
}

function collidingThing() {
  for (const e of enemies) {
    if (e.dying) continue;
    if (e.kind === "chain") {
      const n = liveSegments(e);
      for (let i = 0; i < n; i++) {
        const p = segPos(e, i);
        if (p.y < player.y - grid.cell * 1.5) continue;
        if (Math.hypot(p.x - player.x, p.y - player.y) < playerR() + grid.cell * 0.42) return e;
      }
    } else if (e.kind !== "scorpion") {
      if (Math.hypot(e.x - player.x, e.y - player.y) < playerR() + e.r * 0.75) return e;
    }
  }
  return null;
}

function checkCollisions() {
  if (collidingThing()) loseLife();
}

function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    if (tracers[i].t <= 0) tracers.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy = p.vy * 0.94 + 200 * dt;
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
  const worthRecording = typedCorrect > 0;
  const rank = worthRecording ? recordScore(entry) : -1;

  gameoverTitleEl.textContent = reason === "quit" ? "RUN ENDED" : "GAME OVER";
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Wave reached</span><span class="value">${wave}</span>
    <span class="label">Bugs cleared</span><span class="value">${kills}</span>
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
function dpr() { return window.devicePixelRatio || 1; }

function draw() {
  const t = performance.now() / 1000;
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  ctx.fillStyle = "#05030a";
  ctx.fillRect(0, 0, VW, VH);
  ctx.translate(stageX, stageY);
  const bg = Sprites.images && Sprites.images.bg;
  if (bg) ctx.drawImage(bg, 0, 0, W, H);

  // Watermark sits above the painting but under everything that matters, and
  // outside the shake so it stays a steady reference point.
  if (state === "playing" || state === "paused") drawGuide();

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  if (state === "playing" || state === "paused" || state === "gameover") {
    drawMushrooms();
    drawShockwaves();
    drawEnemies(t);
    drawBlooms();
    drawParticles();
    drawTracers();
    if (state !== "gameover") drawPlayer(t);
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 240, 200, ${flash * 0.4})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === "playing" || state === "paused" || state === "gameover") {
    drawBanner();
    drawHUD();
  }
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
}

function drawMushrooms() {
  const size = grid.cell * 1.15;
  for (const m of mushrooms.values()) {
    const x = cellX(m.col), y = cellY(m.row);
    const k = m.dying > 0 ? m.dying / 0.35 : m.grow;
    const h = size * (0.35 + 0.65 * k);
    if (m.poison) drawGlow(x, y, size * 0.7, NEON.purple, 0.55);
    Sprites.draw(ctx, (m.poison ? "mushHurt" : "mush") + m.art, x, y - h * 0.06, h, k);
  }
}

function drawEnemies(t) {
  for (const e of enemies) {
    if (e.kind === "chain") drawChain(e, t);
    else drawLoose(e, t);
  }
  // Letters go on last, so a head drawn over the segment behind it never hides
  // the letter that segment is carrying.
  for (const e of enemies) {
    if (e.kind === "chain") drawChainLetters(e);
    else drawWordTag(e, { x: e.x, y: e.y - e.r * 1.15 });
  }
}

// The art is drawn facing left, so every piece is flipped when the parade is
// marching right.
function drawChain(e, t) {
  const T = COLORWAYS[e.color];
  const n = liveSegments(e);
  const size = grid.cell * 0.92;
  const right = e.dir > 0;
  // Back to front, so each bead overlaps the one behind it.
  for (let i = n - 1; i >= 1; i--) {
    const p = segPos(e, i);
    if (i === n - 1) Sprites.draw(ctx, T.key + "Tail", p.x, p.y, size, 1, right);
    else Sprites.draw(ctx, T.key + "Body", p.x, p.y, size, 1);
  }
  const head = segPos(e, 0);
  drawGlow(head.x, head.y, size * 0.9, T.glow, 0.35 + 0.15 * Math.sin(t * 6));
  Sprites.draw(ctx, T.key + "Head", head.x, head.y, size * 1.18, 1, right);
}

function drawChainLetters(e) {
  const T = COLORWAYS[e.color];
  const n = liveSegments(e);
  const locked = lockTarget === e;
  for (let i = 0; i < n; i++) {
    const p = segPos(e, i);
    letterChip(p.x, p.y, e.word[e.typed + i], i === 0, locked, T.glow);
  }
}

// The head's letter is the one being typed, so it gets a dark disc to sit in
// and can be read at a glance. The letters behind it are only there to show
// what is coming, and putting each of those in a disc too buries the artwork
// under a column of black lozenges — they are knocked out over the bead
// instead, with an outline to hold them against the neon.
function letterChip(x, y, ch, isHead, locked, glow) {
  const r = grid.cell * 0.28;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (isHead) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(4, 2, 12, 0.85)";
    ctx.fill();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = locked ? NEON.lime : glow;
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 1.5)}px ${MONO}`;
    ctx.fillStyle = locked ? NEON.lime : "#FFFFFF";
    ctx.fillText(ch.toUpperCase(), x, y + 1);
  } else {
    ctx.font = `bold ${Math.round(r * 1.3)}px ${MONO}`;
    ctx.lineWidth = Math.max(2.5, r * 0.42);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(4, 2, 12, 0.85)";
    ctx.strokeText(ch.toUpperCase(), x, y + 1);
    ctx.fillStyle = "rgba(255, 253, 245, 0.92)";
    ctx.fillText(ch.toUpperCase(), x, y + 1);
  }
  ctx.restore();
}

function drawLoose(e, t) {
  const h = e.r * 2.4;
  if (e.kind === "flea") {
    Sprites.draw(ctx, e.art, e.x, e.y, h * 1.2, 1, false, Math.PI * 0.25);
  } else if (e.kind === "scorpion") {
    drawGlow(e.x, e.y, e.r * 1.4, NEON.purple, 0.35);
    Sprites.draw(ctx, e.art, e.x, e.y, h, 1, e.vx > 0);
  } else {
    Sprites.draw(ctx, e.art, e.x, e.y, h, 1, e.vx > 0);
  }
}

// Loose bugs carry their whole word above them: they are not a column of
// beads, so there is nowhere to put one letter per segment.
function drawWordTag(e, at) {
  const locked = lockTarget === e;
  const done = e.word.slice(0, e.typed);
  const rest = e.word.slice(e.typed);
  const fs = Math.round(grid.cell * (locked ? 0.46 : 0.4));
  ctx.save();
  ctx.font = `bold ${fs}px ${MONO}`;
  const w = ctx.measureText(e.word).width;
  const padX = fs * 0.45, h = fs * 1.5;
  roundRect(at.x - w / 2 - padX, at.y - h / 2, w + padX * 2, h, h * 0.35);
  ctx.fillStyle = locked ? "rgba(6, 2, 16, 0.92)" : "rgba(6, 2, 16, 0.78)";
  ctx.fill();
  ctx.lineWidth = locked ? 2.4 : 1.4;
  ctx.strokeStyle = locked ? NEON.lime : "rgba(190, 160, 255, 0.55)";
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let x = at.x - w / 2;
  if (done) {
    ctx.fillStyle = NEON.lime;
    ctx.fillText(done, x, at.y + 1);
    x += ctx.measureText(done).width;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(rest, x, at.y + 1);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
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

function drawPlayer(t) {
  if (invuln > 0 && Math.floor(t * 14) % 2 === 0 && juke.t <= 0) return;
  const h = playerR() * 3.4;
  const key = player.tilt < -0.35 ? "shipLeft"
            : player.tilt > 0.35 ? "shipRight"
            : (Math.floor(player.wing) % 2 ? "shipB" : "shipA");
  // The garden floor the beetle patrols is the busiest part of the painting,
  // so it carries its own pool of light to stay findable.
  drawGlow(player.x, player.y, playerR() * 2.6, NEON.cyan, 0.6);
  Sprites.draw(ctx, key, player.x, player.y, h);
  if (player.muzzle > 0) {
    Sprites.draw(ctx, "muzzle", player.x, player.y - h * 0.42, playerR() * 2.2,
                 player.muzzle / 0.1);
  }
  if (grace > 0 || invuln > 0) {
    Sprites.draw(ctx, "shieldRing", player.x, player.y, h * 1.25,
                 0.35 + 0.2 * Math.sin(t * 9));
  }
}

function drawTracers() {
  ctx.save();
  ctx.lineCap = "round";
  for (const s of tracers) {
    const k = s.t / TRACER_LIFE;
    ctx.globalAlpha = k;
    ctx.strokeStyle = NEON.cyan;
    ctx.lineWidth = 5 * k;
    ctx.beginPath();
    ctx.moveTo(s.x0, s.y0);
    ctx.lineTo(s.x1, s.y1);
    ctx.stroke();
    ctx.globalAlpha = k * 0.9;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2 * k;
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    const a = Math.max(0, p.life / p.maxLife);
    drawGlow(p.x, p.y, p.r * 3.2, p.color, a * 0.8);
  }
}

function drawShockwaves() {
  ctx.save();
  for (const s of shockwaves) {
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.7;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlooms() {
  for (const b of blooms) {
    const k = b.t / b.life;
    Sprites.draw(ctx, "bloom", b.x, b.y - grid.cell * k * 0.6,
                 grid.cell * (2 + k * 3), 1 - k * k);
  }
}

function drawBanner() {
  if (!banner) return;
  const k = banner.life / banner.maxLife;
  const alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.35);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.round(H * 0.055)}px ${MONO}`;
  const g = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
  g.addColorStop(0, NEON.lime);
  g.addColorStop(0.5, NEON.yellow);
  g.addColorStop(1, NEON.magenta);
  ctx.fillStyle = g;
  ctx.fillText(banner.text, W / 2, H * 0.4);
  ctx.font = `${Math.round(H * 0.018)}px ${MONO}`;
  ctx.fillStyle = "rgba(240, 233, 255, 0.75)";
  ctx.fillText(banner.sub, W / 2, H * 0.4 + H * 0.035);
  ctx.restore();
  ctx.textAlign = "left";
}

// The key the player must press now, plus every other key that would take a
// lock. Showing the options is half the teaching value: it turns "what can I
// even do" into a visible choice — and now that a lock can be broken mid-word
// that choice is a live one while locked too, so the other targets stay lit
// behind the letter you are on rather than going dark until you finish.
function guideKeys() {
  const opts = [];
  for (const e of enemies) {
    if (targetable(e) && e !== lockTarget) opts.push(nextLetter(e));
  }
  if (lockTarget && !lockTarget.dying) {
    return { next: nextLetter(lockTarget), options: opts };
  }
  return { next: null, options: opts };
}

function drawGuide() {
  const g = guideBox();
  if (!g.on) return;
  const { next, options } = guideKeys();
  const vis = guideVisibility();
  drawKeyboardGuide(ctx, {
    x: g.x, y: g.y, width: g.w,
    next, options,
    spaceReady: juke.charges > 0,
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: Math.max(0, wrongKey.t / WRONG_FLASH) * vis,
    opacity: 0.13 * vis,
    highlight: 0.85 * vis,
    mono: MONO,
  });
}

// ---- HUD ----
// The console painted across the foot of the background already has panel-shaped
// slots in it, so the live panels drop into those and the whole strip reads as
// one instrument cluster.
//
// Some panels ship with a specimen value printed on them (three hearts, a full
// combo bar, x5). Those are blanked in the slot's own ground colour, sampled
// off the sheet, before the live figure goes down. Using destination-out here
// would not clear the slot — it punches a hole through the painting to the page
// behind it.
const SLOT = {
  lives:  "#010A2B",
  combo:  "#000A27",
  comboX: "#000616",
};

// Value areas within each panel, as fractions of the frame.
const VAL = {
  score:  [0.310, 0.545, 0.905, 0.845],
  wave:   [0.270, 0.500, 0.650, 0.870],
  lives:  [0.315, 0.340, 0.815, 0.820],
  combo:  [0.115, 0.530, 0.775, 0.800],
  comboX: [0.803, 0.360, 0.902, 0.860],
  target: [0.110, 0.510, 0.840, 0.890],
};

function panelSlot(key, x, y, h, region) {
  const w = Sprites.widthFor(key, h);
  const r = VAL[region || key];
  return { x: x + r[0] * w, y: y + r[1] * h,
           w: (r[2] - r[0]) * w, h: (r[3] - r[1]) * h, pw: w };
}

function fitText(text, box, color, weight = "bold", shrink = 0.78) {
  let fs = box.h * shrink;
  ctx.font = `${weight} ${fs}px ${MONO}`;
  const tw = ctx.measureText(text).width;
  if (tw > box.w) { fs *= box.w / tw; ctx.font = `${weight} ${fs}px ${MONO}`; }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  return fs;
}

function drawHUD() {
  if (!con) layout();
  const { top, h: ch, pad } = con;

  // ---- score, left ----
  const scH = ch * 0.52, scY = top + ch * 0.06;
  Sprites.drawAt(ctx, "score", pad, scY, scH);
  fitText(String(Math.min(999999, score)).padStart(6, "0"),
          panelSlot("score", pad, scY, scH), "#7FEFFF");

  // ---- combo, under it ----
  const cbH = ch * 0.36, cbY = top + ch * 0.60;
  Sprites.drawAt(ctx, "combo", pad, cbY, cbH);
  const bar = panelSlot("combo", pad, cbY, cbH);
  const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
  ctx.fillStyle = SLOT.combo;
  ctx.fillRect(bar.x + bar.w * into, bar.y, bar.w * (1 - into) + 1, bar.h);
  const xb = panelSlot("combo", pad, cbY, cbH, "comboX");
  ctx.fillStyle = SLOT.comboX;
  ctx.fillRect(xb.x, xb.y, xb.w, xb.h);
  fitText("x" + multiplier, xb, multiplier > 1 ? "#FFE96B" : "#9FB6D8", "bold", 0.68);

  // ---- wave, right ----
  const wvH = ch * 0.56, wvY = top + ch * 0.04;
  const wvW = Sprites.widthFor("wave", wvH);
  const wvX = W - wvW - pad;
  Sprites.drawAt(ctx, "wave", wvX, wvY, wvH);
  fitText(String(Math.max(1, wave)), panelSlot("wave", wvX, wvY, wvH), "#FFFFFF", "bold", 0.72);

  // ---- lives, under it ----
  const lvH = ch * 0.36, lvY = top + ch * 0.60;
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
  const tgH = ch * 0.86, tgY = top + ch * 0.07;
  const tgW = Sprites.widthFor("target", tgH);
  const tgX = (W - tgW) / 2;
  Sprites.drawAt(ctx, "target", tgX, tgY, tgH);
  const tg = panelSlot("target", tgX, tgY, tgH);

  if (lockTarget && !lockTarget.dying) {
    const w = lockTarget.word;
    let fs = tg.h * 0.62;
    ctx.font = `bold ${fs}px ${MONO}`;
    if (ctx.measureText(w).width > tg.w * 0.85) {
      fs *= (tg.w * 0.85) / ctx.measureText(w).width;
      ctx.font = `bold ${fs}px ${MONO}`;
    }
    const done = w.slice(0, lockTarget.typed);
    const rest = w.slice(lockTarget.typed);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const cy = tg.y + tg.h * 0.5;
    let x = tg.x + tg.w / 2 - ctx.measureText(w).width / 2;
    if (done) {
      ctx.fillStyle = "rgba(124, 255, 61, 0.45)";
      ctx.fillText(done, x, cy);
      x += ctx.measureText(done).width;
    }
    ctx.fillStyle = "#EAF6FF";
    ctx.fillText(rest, x, cy);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  } else {
    // Nothing locked: the panel shows the dart charges, which is the decision
    // actually in front of the player at that moment.
    const per = currentLevel().jukeRefill || JUKE_REFILL;
    const pipH = tg.h * 0.30, gap = tg.w * 0.022;
    const pipW = (tg.w * 0.46 - gap * (JUKE_CHARGES - 1)) / JUKE_CHARGES;
    const totalW = JUKE_CHARGES * pipW + (JUKE_CHARGES - 1) * gap;
    const cy = tg.y + tg.h * 0.5;
    ctx.font = `bold ${tg.h * 0.32}px ${MONO}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(190, 220, 255, 0.8)";
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
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  // ---- run stats, along the very foot ----
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.font = `${Math.max(10, ch * 0.105)}px ${MONO}`;
  ctx.textAlign = "center";
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
  draw();
  rafId = requestAnimationFrame(frame);
  fallbackId = setTimeout(() => frame(performance.now()), 50);
}
Sprites.load().then(() => {
  resize();
  relayout();
  frame(performance.now());
});
