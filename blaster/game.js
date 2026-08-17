// ============================================================
// Blaster — a multidirectional shooter for touch typists
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const menuEl = document.getElementById("menu");
const gameoverEl = document.getElementById("gameover");
const finalStatsEl = document.getElementById("final-stats");
const settingsEl = document.getElementById("settings");
const settingsTitleEl = document.getElementById("settings-title");
const menuDiffEl = document.getElementById("menu-diff");
const menuBestEl = document.getElementById("menu-best");
const scoreListEl = document.getElementById("score-list");
const newBestEl = document.getElementById("new-best");
const gameoverTitleEl = document.getElementById("gameover-title");
const quitBtn = document.getElementById("quit-btn");

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace";

// ---- Tuning constants ----
const COLLIDE_CHANCE = 0.25;      // fraction of asteroids on a true collision course
const SHIP_RADIUS = 16;
const BULLET_SPEED = 950;         // px/s
const INVULN_TIME = 2.0;          // seconds of grace after being hit
const STARTING_LIVES = 3;
const MAX_PARTICLES = 700;
const STREAK_PER_MULT = 20;       // correct letters needed per multiplier step
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;     // seconds the struck-out key stays on the guide
const ASSIST_MISSES = 3;     // consecutive misses before the guide steps in
const ASSIST_FADE_IN = 0.18; // appears quickly, so it is there when wanted
const ASSIST_FADE_OUT = 0.7; // leaves slowly, so it is not snatched away

// ---- Settings (persisted to localStorage) ----
const SETTINGS_KEY = "typeblaster-settings";
const SCORES_KEY = "typeblaster-scores";
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

// ---- High scores ----
function loadScores() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) { return []; }
}

// Keeps the table to a sane size while preserving each difficulty's own top
// runs, so one strong Master streak can't push every Beginner entry out.
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

function scoresFor(difficulty) {
  return loadScores()
    .filter(s => s.difficulty === difficulty)
    .sort((a, b) => b.score - a.score);
}

// ---- Difficulty levels ----
// Each parameter ramps linearly from its first value to its second over
// rampTime seconds of play. speed is px/s, spawn is seconds between spawns,
// med/long are the chance a new word comes from the medium/long pool.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", rampTime: 150, speed: [28, 50],  spawn: [3.5, 2.2],  maxAst: [2, 4],  med: [0.05, 0.25], long: [0, 0] },
  easy:     { label: "EASY",     rampTime: 140, speed: [38, 75],  spawn: [3.0, 1.8],  maxAst: [3, 5],  med: [0.2, 0.45],  long: [0, 0.1] },
  normal:   { label: "NORMAL",   rampTime: 130, speed: [45, 105], spawn: [2.6, 1.2],  maxAst: [3, 7],  med: [0.25, 0.6],  long: [0.05, 0.25] },
  hard:     { label: "HARD",     rampTime: 120, speed: [60, 140], spawn: [2.2, 0.95], maxAst: [4, 9],  med: [0.3, 0.6],   long: [0.1, 0.4] },
  master:   { label: "MASTER",   rampTime: 100, speed: [75, 175], spawn: [1.8, 0.7],  maxAst: [5, 11], med: [0.3, 0.55],  long: [0.2, 0.55] },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentWordSet = () => WORD_SETS[settings.wordSet] || WORD_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

let W = 0, H = 0;

// The guide is a watermark drawn behind the action, so it reserves nothing.
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
  return { on: true, ...keyboardGuideLayout(W, H, false) };
}

// ---- Glow sprite cache ----
// Pre-rendering the radial falloff once per color is far cheaper than
// building a gradient (or setting shadowBlur) for every particle each frame.
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
  grad.addColorStop(0.4, hexA(color, 0.45));
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
  const s = glowSprite(color);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

// ---- Background (nebula baked once, parallax stars) ----
let bgCanvas = null;
let starLayers = [];

function buildBackground() {
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.max(1, W);
  bgCanvas.height = Math.max(1, H);
  const g = bgCanvas.getContext("2d");

  const base = g.createLinearGradient(0, 0, W * 0.4, H);
  base.addColorStop(0, "#070a18");
  base.addColorStop(0.55, "#05060f");
  base.addColorStop(1, "#0a0714");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  // Soft nebula clouds in a few hues
  const clouds = [
    { c: "56, 92, 200", n: 4 },
    { c: "150, 60, 190", n: 3 },
    { c: "30, 150, 170", n: 3 },
  ];
  for (const { c, n } of clouds) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = (140 + Math.random() * 320) * (Math.max(W, H) / 1200);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${c}, 0.14)`);
      grad.addColorStop(0.5, `rgba(${c}, 0.05)`);
      grad.addColorStop(1, `rgba(${c}, 0)`);
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}

function makeStars() {
  // Three depths: far stars are dim, small and slow; near stars drift faster.
  const specs = [
    { count: (W * H) / 9000, size: [0.4, 1.0], alpha: [0.25, 0.5], drift: 2 },
    { count: (W * H) / 16000, size: [0.8, 1.7], alpha: [0.4, 0.75], drift: 6 },
    { count: (W * H) / 34000, size: [1.3, 2.6], alpha: [0.6, 1.0], drift: 13 },
  ];
  starLayers = specs.map(s => {
    const arr = [];
    for (let i = 0; i < Math.floor(s.count); i++) {
      arr.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: s.size[0] + Math.random() * (s.size[1] - s.size[0]),
        a: s.alpha[0] + Math.random() * (s.alpha[1] - s.alpha[0]),
        tw: Math.random() * Math.PI * 2,
      });
    }
    return { stars: arr, drift: s.drift };
  });
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildBackground();
  makeStars();
}
window.addEventListener("resize", resize);
resize();

// ---- Audio (all WebAudio, created lazily on first user gesture) ----
let audioCtx = null;
let sfxGain = null;
let musicGain = null;

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
  musicGain.gain.value = (settings.musicVol / 100) * 0.6;
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
  // Pitch rises with the streak so a clean run audibly climbs.
  shoot: (step = 0) => blip(780 + step * 28, 0.07, "square", 0.035, -380),
  hit: () => blip(220, 0.12, "sawtooth", 0.05, -80),
  explode: () => blip(120, 0.4, "sawtooth", 0.09, -90),
  error: () => blip(140, 0.15, "square", 0.06),
  lock: () => blip(1320, 0.07, "sine", 0.05),
  shipHit: () => blip(70, 0.6, "sawtooth", 0.12, -40),
  lost: () => blip(400, 0.18, "sine", 0.05, -250),
  levelUp: () => { blip(660, 0.1, "sine", 0.05); setTimeout(() => blip(990, 0.16, "sine", 0.05), 90); },
};

// ---- Music: a generated ambient loop, no audio files needed ----
// Four bars (Am, F, C, G) of soft pad chords, a pulsing bass, and a quiet
// arpeggio, scheduled a little over a second ahead so playback survives
// background-tab timer throttling.
const MUSIC_TEMPO = 96; // bpm
const STEPS_PER_BAR = 8; // eighth notes
const PROGRESSION = [
  { bass: 45, chord: [57, 60, 64] }, // A minor
  { bass: 41, chord: [57, 60, 65] }, // F major
  { bass: 48, chord: [55, 60, 64] }, // C major
  { bass: 43, chord: [55, 59, 62] }, // G major
];
const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
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
  const barLen = secPerStep * STEPS_PER_BAR;
  const bar = Math.floor(step / STEPS_PER_BAR);
  const sub = step % STEPS_PER_BAR;
  const { bass, chord } = PROGRESSION[bar];

  if (sub === 0) {
    for (const m of chord) tone(noteFreq(m), t, barLen * 0.95, "sine", 0.04, 0.5);
  }
  if (sub % 4 === 0) {
    tone(noteFreq(bass), t, 0.5, "triangle", 0.07, 0.02);
  }
  tone(noteFreq(chord[ARP_PATTERN[sub]] + 12), t, 0.2, "sine", 0.022, 0.01);
}

function scheduleMusic() {
  const secPerStep = (60 / MUSIC_TEMPO) / 2;
  const totalSteps = STEPS_PER_BAR * PROGRESSION.length;
  while (musicState.nextTime < audioCtx.currentTime + 1.2) {
    playMusicStep(musicState.step, musicState.nextTime);
    musicState.nextTime += secPerStep;
    musicState.step = (musicState.step + 1) % totalSteps;
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
  if (musicState.timer) {
    clearInterval(musicState.timer);
    musicState.timer = null;
  }
}

// ---- Game state ----
let state = "menu"; // menu | playing | paused | gameover
let ship, asteroids, bullets, particles, shockwaves, lockTarget;
let score, lives, elapsed, spawnTimer, invuln, shake, flash;
let wrongKey, assist;
let typedCorrect, typedWrong, wordsDestroyed, streak, bestStreak, multiplier;

function resetGame() {
  ship = { x: W / 2, y: H / 2, angle: -Math.PI / 2, muzzle: 0, thrust: 0 };
  asteroids = [];
  bullets = [];
  particles = [];
  shockwaves = [];
  lockTarget = null;
  score = 0;
  lives = STARTING_LIVES;
  elapsed = 0;
  spawnTimer = 0.5;
  invuln = 0;
  wrongKey = { key: null, t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  shake = 0;
  flash = 0;
  typedCorrect = 0;
  typedWrong = 0;
  wordsDestroyed = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
}

// ---- Difficulty scaling: current level's params, ramped over play time ----
function difficulty() {
  const L = currentLevel();
  const k = Math.min(1, elapsed / L.rampTime);
  const lerp = (range) => range[0] + (range[1] - range[0]) * k;
  return {
    spawnInterval: lerp(L.spawn),
    speed: lerp(L.speed),
    maxAsteroids: Math.round(lerp(L.maxAst)),
    mediumWordChance: lerp(L.med),
    longWordChance: lerp(L.long),
  };
}

function pickWord() {
  const d = difficulty();
  const pools = currentWordSet().pools;
  const roll = Math.random();

  // Drill sets may have no long (or even medium) words at all; fall back to
  // whichever bucket actually has entries rather than spawning nothing.
  let order;
  if (roll < d.longWordChance) order = ["long", "medium", "short"];
  else if (roll < d.longWordChance + d.mediumWordChance) order = ["medium", "short", "long"];
  else order = ["short", "medium", "long"];
  let pool = [];
  for (const key of order) {
    if (pools[key] && pools[key].length) { pool = pools[key]; break; }
  }
  if (!pool.length) return "type";

  const inUse = new Set(asteroids.map(a => a.word));
  // Avoid duplicate words and (when possible) duplicate unlocked first letters
  const firstLetters = new Set(
    asteroids.filter(a => a !== lockTarget).map(a => a.word[0])
  );
  let candidates = pool.filter(w => !inUse.has(w) && !firstLetters.has(w[0]));
  if (candidates.length === 0) candidates = pool.filter(w => !inUse.has(w));
  if (candidates.length === 0) candidates = pool;
  return candidates[(Math.random() * candidates.length) | 0];
}

// Build the rock's silhouette once; the shape never changes in local space,
// so the Path2D can be reused for fill, clip and stroke every frame.
function buildAsteroidPath(verts, radius) {
  const n = verts.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const r = radius * verts[i];
    pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
  }
  const path = new Path2D();
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let m = mid(pts[n - 1], pts[0]);
  path.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const cur = pts[i], next = pts[(i + 1) % n];
    const mn = mid(cur, next);
    path.quadraticCurveTo(cur[0], cur[1], mn[0], mn[1]);
  }
  path.closePath();
  return path;
}

function spawnAsteroid() {
  const d = difficulty();
  const word = pickWord();
  const radius = 22 + word.length * 2.2;

  // Spawn just outside a random edge
  const edge = (Math.random() * 4) | 0;
  let x, y;
  const m = radius + 20;
  if (edge === 0) { x = Math.random() * W; y = -m; }
  else if (edge === 1) { x = W + m; y = Math.random() * H; }
  else if (edge === 2) { x = Math.random() * W; y = H + m; }
  else { x = -m; y = Math.random() * H; }

  // Aim at the ship; 25% dead-on, otherwise offset far enough to guarantee a flyby
  let tx = ship.x, ty = ship.y;
  const willCollide = Math.random() < COLLIDE_CHANCE;
  if (!willCollide) {
    const dx = ship.x - x, dy = ship.y - y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len; // perpendicular
    const miss = (SHIP_RADIUS + radius + 70 + Math.random() * 180) * (Math.random() < 0.5 ? 1 : -1);
    tx += px * miss;
    ty += py * miss;
  }
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = d.speed * (0.85 + Math.random() * 0.3);

  // Irregular rock outline
  const verts = [];
  const n = 10 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) verts.push(0.74 + Math.random() * 0.32);

  // Surface detail: craters sit inside the body, cracks light up as letters land
  const craters = [];
  const craterCount = 3 + ((Math.random() * 4) | 0);
  for (let i = 0; i < craterCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const dd = Math.random() * radius * 0.55;
    craters.push({
      x: Math.cos(a) * dd,
      y: Math.sin(a) * dd,
      r: radius * (0.09 + Math.random() * 0.14),
      rot: Math.random() * Math.PI,
    });
  }
  const cracks = [];
  for (let i = 0; i < word.length; i++) {
    const a = Math.random() * Math.PI * 2;
    const seg = [];
    let px = 0, py = 0, ang = a;
    const steps = 3 + ((Math.random() * 3) | 0);
    for (let s = 0; s < steps; s++) {
      ang += (Math.random() - 0.5) * 1.1;
      const stepLen = radius * (0.2 + Math.random() * 0.2);
      px += Math.cos(ang) * stepLen;
      py += Math.sin(ang) * stepLen;
      seg.push([px, py]);
    }
    cracks.push(seg);
  }

  const hue = 200 + Math.random() * 40 - 20; // cool gray-blue rocks with variation

  asteroids.push({
    x, y, radius, word,
    typed: 0,             // letters typed so far
    hitsLanded: 0,        // bullets that have arrived
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.9,
    verts, craters, cracks, hue,
    path: buildAsteroidPath(verts, radius),
    entered: false,       // has it come on screen yet?
    dying: false,         // word finished, waiting for last bullet
    age: 0,
    hitFlash: 0,
  });
}

// ---- Effects ----
function addParticle(p) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push(p);
}

function burst(x, y, radius, palette, count, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (40 + Math.random() * 200) * speedScale;
    addParticle({
      kind: "spark",
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.65,
      maxLife: 1,
      r: 1.5 + Math.random() * (radius > 20 ? 4 : 2),
      color: palette[(Math.random() * palette.length) | 0],
      drag: 1.6,
    });
  }
}

function smoke(x, y, radius, count) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 10 + Math.random() * 45;
    addParticle({
      kind: "smoke",
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.7 + Math.random() * 0.9,
      maxLife: 1.6,
      r: radius * (0.22 + Math.random() * 0.3),
      grow: 26,
      color: "#2a3550",
      drag: 0.7,
    });
  }
}

function shockwave(x, y, maxR, color, width = 3) {
  shockwaves.push({ x, y, r: maxR * 0.12, maxR, life: 0.5, maxLife: 0.5, color, width });
}

const FIRE_PALETTE = ["#fff3c4", "#ffd97a", "#ff9b4d", "#ff6b3d"];
const ICE_PALETTE = ["#e6f7ff", "#7fd4ff", "#3ba9ff", "#7f9cff"];

function explodeAsteroid(a) {
  shockwave(a.x, a.y, a.radius * 3.4, "#ffb36b");
  burst(a.x, a.y, a.radius, FIRE_PALETTE, 26 + ((a.radius / 2) | 0));
  smoke(a.x, a.y, a.radius, 7);
  flash = Math.min(0.5, flash + 0.16);
}

// ---- Settings overlay ----
let settingsOpen = false;
let settingsFrom = "menu"; // which screen to return to on close

function openSettings(from) {
  settingsFrom = from;
  settingsOpen = true;
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  if (from === "playing") state = "paused";
  settingsTitleEl.textContent = from === "playing" ? "PAUSED" : "SETTINGS";
  // Quitting only means something while a run is in progress
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

// ---- Quitting a run ----
let quitArmed = false;
let quitTimer = null;

function disarmQuit() {
  quitArmed = false;
  clearTimeout(quitTimer);
  quitBtn.textContent = "Quit run (Q)";
  quitBtn.classList.remove("armed");
}

// First press arms, second confirms. A stray keypress shouldn't end a run
// the player has been building for minutes.
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
  asteroids = [];
  bullets = [];
  particles = [];
  shockwaves = [];
  lockTarget = null;
  settingsOpen = false;
  disarmQuit();
  settingsEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
  syncSettingsUI(); // refresh the best-score line with anything just recorded
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  ensureAudio();
  startMusic();

  if (settingsOpen) {
    if (e.key === "Escape") closeSettings();
    // Q only quits from the pause screen, where a run is actually running.
    // It is never a gameplay key here, so it cannot collide with typing.
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

  if (!/^[a-z]$/i.test(e.key)) return;
  const letter = e.key.toLowerCase();

  if (lockTarget) {
    // Must finish the locked word
    if (lockTarget.word[lockTarget.typed] === letter) correctLetter(lockTarget);
    else wrongLetter(letter);
  } else {
    // Try to acquire a lock: nearest on-screen asteroid whose word starts with this letter
    let best = null, bestDist = Infinity;
    for (const a of asteroids) {
      if (a.dying || !a.entered) continue;
      if (a.word[0] !== letter) continue;
      const d = Math.hypot(a.x - ship.x, a.y - ship.y);
      if (d < bestDist) { bestDist = d; best = a; }
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

function correctLetter(target) {
  target.typed++;
  typedCorrect++;
  noteCorrectKey();
  streak++;
  if (streak > bestStreak) bestStreak = streak;

  const newMult = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (newMult > multiplier) {
    multiplier = newMult;
    sfx.levelUp();
    shockwave(ship.x, ship.y, 90, "#7fffb2", 2);
  }

  score += 10 * multiplier;
  fireBullet(target);
  sfx.shoot(Math.min(12, streak % STREAK_PER_MULT));
  if (target.typed >= target.word.length) {
    target.dying = true;           // no longer collidable or lockable
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
  const nose = {
    x: ship.x + Math.cos(ship.angle) * SHIP_RADIUS,
    y: ship.y + Math.sin(ship.angle) * SHIP_RADIUS,
  };
  bullets.push({ x: nose.x, y: nose.y, target, life: 3, trail: [] });
  ship.muzzle = 0.12;
  ship.thrust = 1;
}

// Is anything close enough to hit us the moment we become vulnerable again?
function shipIsOverlapped() {
  for (const a of asteroids) {
    if (a.dying) continue;
    if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius * 0.85 + SHIP_RADIUS + 8) return true;
  }
  return false;
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  const d = difficulty();

  // Spawning
  spawnTimer -= dt;
  if (spawnTimer <= 0 && asteroids.length < d.maxAsteroids) {
    spawnAsteroid();
    spawnTimer = d.spawnInterval;
  }

  // Ship aims at lock target (or holds its heading)
  const desired = lockTarget
    ? Math.atan2(lockTarget.y - ship.y, lockTarget.x - ship.x)
    : ship.angle;
  let da = desired - ship.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ship.angle += da * Math.min(1, dt * 14);

  if (invuln > 0) {
    invuln -= dt;
    // Never let the shield lapse while a rock is still sitting on us. Rocks
    // pass straight through during invulnerability, so one that is overlapping
    // when the shield drops lands a hit on the very next frame — and this ship
    // cannot move, so there is nothing the player could have done. Hold the
    // grace open until we are actually clear.
    if (invuln <= 0 && shipIsOverlapped()) invuln = 0.12;
  }
  if (wrongKey.t > 0) wrongKey.t -= dt;
  // Assist mode eases the guide in when the player is stuck and back out once
  // they are moving again, rather than snapping it on and off.
  const assistTarget = assist.showing ? 1 : 0;
  const assistRate = dt / (assist.showing ? ASSIST_FADE_IN : ASSIST_FADE_OUT);
  assist.alpha += Math.sign(assistTarget - assist.alpha) *
                  Math.min(assistRate, Math.abs(assistTarget - assist.alpha));
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  if (ship.muzzle > 0) ship.muzzle = Math.max(0, ship.muzzle - dt);
  ship.thrust = Math.max(0.25, ship.thrust - dt * 2.5);

  // Engine exhaust
  if (Math.random() < 0.7) {
    const back = ship.angle + Math.PI;
    const spread = (Math.random() - 0.5) * 0.5;
    const sp = 60 + Math.random() * 90 * ship.thrust;
    addParticle({
      kind: "spark",
      x: ship.x + Math.cos(back) * SHIP_RADIUS * 0.7,
      y: ship.y + Math.sin(back) * SHIP_RADIUS * 0.7,
      vx: Math.cos(back + spread) * sp,
      vy: Math.sin(back + spread) * sp,
      life: 0.18 + Math.random() * 0.22,
      maxLife: 0.4,
      r: 1.2 + Math.random() * 2,
      color: ICE_PALETTE[(Math.random() * ICE_PALETTE.length) | 0],
      drag: 2.5,
    });
  }

  // Asteroids
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.rotSpeed * dt;
    a.age += dt;
    if (a.hitFlash > 0) a.hitFlash = Math.max(0, a.hitFlash - dt * 5);

    const onScreen = a.x > -a.radius && a.x < W + a.radius &&
                     a.y > -a.radius && a.y < H + a.radius;
    if (onScreen) a.entered = true;

    // A flyby moves in a straight line, so once it has fully left the screen
    // it can never return — drop it immediately and free the lock so the
    // player can retarget without waiting.
    if (a.entered && !onScreen) {
      if (lockTarget === a) {
        lockTarget = null;
        sfx.lost();
      }
      asteroids.splice(i, 1);
      continue;
    }

    // Safety net: an offset flyby aimed wide of a small window may never
    // cross the viewport at all; don't let it drift forever.
    if (!a.entered && a.age > 30) {
      asteroids.splice(i, 1);
      continue;
    }

    // While the post-hit shield is up, a rock that reaches the ship burns up
    // against it rather than drifting through. Otherwise it can sit on the
    // ship for the whole grace period and land a hit the moment the shield
    // drops — and this ship cannot move aside. Deliberately no score and no
    // streak credit: this is mercy, not a reward.
    if (invuln > 0 && !a.dying &&
        Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius * 0.85 + SHIP_RADIUS) {
      if (lockTarget === a) lockTarget = null;
      explodeAsteroid(a);
      asteroids.splice(i, 1);
      continue;
    }

    // Ship collision
    if (!a.dying && invuln <= 0 &&
        Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius * 0.85 + SHIP_RADIUS) {
      if (lockTarget === a) lockTarget = null;
      explodeAsteroid(a);
      burst(ship.x, ship.y, 20, ICE_PALETTE, 30);
      shockwave(ship.x, ship.y, 160, "#7fd4ff", 4);
      asteroids.splice(i, 1);
      lives--;
      streak = 0;
      multiplier = 1;
      invuln = INVULN_TIME;
      shake = 16;
      flash = 0.55;
      sfx.shipHit();
      if (lives <= 0) { endGame(); return; }
    }
  }

  // Bullets (homing so they always land on their moving target)
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.life -= dt;
    const t = b.target;
    if (!t || b.life <= 0 || !asteroids.includes(t)) {
      bullets.splice(i, 1);
      continue;
    }
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 7) b.trail.shift();

    const dx = t.x - b.x, dy = t.y - b.y;
    const dist = Math.hypot(dx, dy);
    const step = BULLET_SPEED * dt;
    if (dist <= step + t.radius * 0.55) {
      // Impact
      bullets.splice(i, 1);
      t.hitsLanded++;
      t.hitFlash = 1;
      burst(b.x, b.y, 6, FIRE_PALETTE, 8, 0.55);
      shockwave(b.x, b.y, 34, "#ffd97a", 2);
      sfx.hit();
      if (t.dying && t.hitsLanded >= t.word.length) {
        // Final shot landed: destroy
        const idx = asteroids.indexOf(t);
        if (idx !== -1) asteroids.splice(idx, 1);
        explodeAsteroid(t);
        score += (t.word.length * 20 + 50) * multiplier;
        wordsDestroyed++;
        sfx.explode();
      }
    } else {
      b.x += (dx / dist) * step;
      b.y += (dy / dist) * step;
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = 1 - dt * (p.drag || 1.5);
    p.vx *= drag;
    p.vy *= drag;
    if (p.grow) p.r += p.grow * dt;
  }

  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.life -= dt;
    if (s.life <= 0) { shockwaves.splice(i, 1); continue; }
    const k = 1 - s.life / s.maxLife;
    s.r = s.maxR * (0.12 + 0.88 * Math.sqrt(k));
  }
}

function startGame() {
  resetGame();
  state = "playing";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
}

function endGame(reason = "dead") {
  state = "gameover";
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;

  const entry = {
    score, wpm, acc,
    words: wordsDestroyed,
    time: Math.floor(elapsed),
    streak: bestStreak,
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
    <span class="label">Words destroyed</span><span class="value">${wordsDestroyed}</span>
    <span class="label">WPM</span><span class="value">${wpm}</span>
    <span class="label">Accuracy</span><span class="value">${acc}%</span>
    <span class="label">Best streak</span><span class="value">${bestStreak}</span>
    <span class="label">Time survived</span><span class="value">${Math.floor(elapsed)}s</span>
  `;

  newBestEl.classList.toggle("hidden", rank !== 0);
  renderScoreList(worthRecording ? entry : null);
  gameoverEl.classList.remove("hidden");
}

function renderScoreList(highlight) {
  const rows = scoresFor(settings.difficulty).slice(0, 5);
  const label = currentLevel().label;
  if (!rows.length) {
    scoreListEl.innerHTML = "";
    return;
  }
  const body = rows.map((s, i) => {
    const setLabel = (WORD_SETS[s.wordSet] || WORD_SETS.all).label;
    const me = highlight && s.date === highlight.date && s.score === highlight.score;
    return `<li class="${me ? "me" : ""}">
      <span class="rank">${i + 1}</span>
      <span class="sc">${s.score}</span>
      <span class="meta">${s.wpm} wpm &middot; ${s.acc}% &middot; ${setLabel}</span>
    </li>`;
  }).join("");
  scoreListEl.innerHTML = `<div class="score-head">TOP RUNS &mdash; ${label}</div><ol>${body}</ol>`;
}

// ---- Drawing ----
function draw() {
  const t = performance.now() / 1000;

  // Background never shakes: keeps the starfield stable while the action jolts
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawStars(t);

  // Watermark sits above the starfield but under everything that matters,
  // and outside the shake so it stays a steady reference point.
  if (state === "playing" || state === "paused") drawGuide();

  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  if (state === "playing" || state === "paused" || state === "gameover") {
    drawShockwaves();
    drawAsteroids(t);
    drawParticles();
    drawBullets();
    if (state !== "gameover") drawShip(t);
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(200, 230, 255, ${flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawVignette();

  if (state === "playing" || state === "paused" || state === "gameover") drawHUD();
}

function drawStars(t) {
  for (let li = 0; li < starLayers.length; li++) {
    const layer = starLayers[li];
    const off = (t * layer.drift) % (W + 40);
    for (const s of layer.stars) {
      const tw = 0.65 + 0.35 * Math.sin(t * 1.6 + s.tw);
      let x = s.x - off;
      if (x < -20) x += W + 40;
      ctx.fillStyle = `rgba(210, 228, 255, ${s.a * tw})`;
      ctx.fillRect(x, s.y, s.r, s.r);
    }
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawShockwaves() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of shockwaves) {
    const k = s.life / s.maxLife;
    ctx.strokeStyle = hexA(s.color, 0.55 * k);
    ctx.lineWidth = s.width * k;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShip(t) {
  const blink = invuln > 0 && Math.floor(invuln * 10) % 2 === 0;
  if (blink) return;

  // Engine glow and muzzle flash sit under the hull, additively
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const back = ship.angle + Math.PI;
  drawGlow(
    ship.x + Math.cos(back) * SHIP_RADIUS * 0.8,
    ship.y + Math.sin(back) * SHIP_RADIUS * 0.8,
    14 + 6 * ship.thrust + Math.random() * 3, "#3ba9ff", 0.55
  );
  if (ship.muzzle > 0) {
    const k = ship.muzzle / 0.12;
    drawGlow(
      ship.x + Math.cos(ship.angle) * SHIP_RADIUS * 1.1,
      ship.y + Math.sin(ship.angle) * SHIP_RADIUS * 1.1,
      22 * k, "#ffd97a", 0.9 * k
    );
  }
  ctx.restore();

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  const hull = new Path2D();
  hull.moveTo(SHIP_RADIUS * 1.15, 0);
  hull.lineTo(-SHIP_RADIUS * 0.72, SHIP_RADIUS * 0.68);
  hull.lineTo(-SHIP_RADIUS * 0.34, 0);
  hull.lineTo(-SHIP_RADIUS * 0.72, -SHIP_RADIUS * 0.68);
  hull.closePath();

  const grad = ctx.createLinearGradient(-SHIP_RADIUS, -SHIP_RADIUS, SHIP_RADIUS, SHIP_RADIUS);
  grad.addColorStop(0, "#16324d");
  grad.addColorStop(0.5, "#2f6f9e");
  grad.addColorStop(1, "#0d1f33");
  ctx.fillStyle = grad;
  ctx.fill(hull);

  ctx.strokeStyle = "#9fe4ff";
  ctx.lineWidth = 1.8;
  ctx.stroke(hull);

  // Cockpit
  ctx.fillStyle = "rgba(190, 240, 255, 0.9)";
  ctx.beginPath();
  ctx.ellipse(SHIP_RADIUS * 0.18, 0, SHIP_RADIUS * 0.26, SHIP_RADIUS * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Shield bubble during the post-hit grace period
  if (invuln > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);
    ctx.strokeStyle = `rgba(127, 212, 255, ${0.25 + 0.25 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, SHIP_RADIUS * 1.9 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawAsteroids(t) {
  for (const a of asteroids) {
    const locked = a === lockTarget;
    const prog = a.word.length ? a.typed / a.word.length : 0;

    // Rim glow (additive) reads as heat building up as the word is typed
    if (locked || prog > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pulse = locked ? 0.6 + 0.4 * Math.sin(t * 6) : 0.35;
      drawGlow(a.x, a.y, a.radius * 2.1, locked ? "#ffd97a" : "#ff8a4d",
               (locked ? 0.28 : 0.16) * pulse + prog * 0.18);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);

    // Body: lit from the upper-left, darker toward the lower-right limb
    const lit = `hsl(${a.hue}, 18%, 46%)`;
    const mid = `hsl(${a.hue}, 20%, 28%)`;
    const dark = `hsl(${a.hue}, 24%, 13%)`;
    const g = ctx.createRadialGradient(
      -a.radius * 0.4, -a.radius * 0.45, a.radius * 0.1,
      0, 0, a.radius * 1.1
    );
    g.addColorStop(0, lit);
    g.addColorStop(0.55, mid);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill(a.path);

    // Craters, clipped to the silhouette
    ctx.save();
    ctx.clip(a.path);
    for (const c of a.craters) {
      ctx.fillStyle = `hsla(${a.hue}, 22%, 10%, 0.5)`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.r, c.r * 0.72, c.rot, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `hsla(${a.hue}, 20%, 62%, 0.18)`;
      ctx.beginPath();
      ctx.ellipse(c.x - c.r * 0.15, c.y - c.r * 0.18, c.r * 0.72, c.r * 0.5, c.rot, 0, Math.PI * 2);
      ctx.fill();
    }

    // Damage cracks: one lights up per letter landed
    const shown = Math.min(a.cracks.length, a.typed);
    if (shown > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (let i = 0; i < shown; i++) {
        const seg = a.cracks[i];
        ctx.strokeStyle = `rgba(255, 150, 60, ${0.55 + 0.3 * Math.sin(t * 5 + i)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (const [px, py] of seg) ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();

    // Impact flash
    if (a.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 230, 180, ${a.hitFlash * 0.45})`;
      ctx.fill(a.path);
    }

    // Rim light
    ctx.strokeStyle = locked ? "#ffd97a" : `hsla(${a.hue}, 30%, 72%, 0.65)`;
    ctx.lineWidth = locked ? 2.4 : 1.4;
    ctx.stroke(a.path);
    ctx.restore();

    if (locked) drawReticle(a, t);
    // Only label rocks that have fully entered the view. A label whose
    // asteroid is still off-screen can't be locked yet, so showing it would
    // invite a keystroke that scores as a miss.
    if (!a.dying && a.entered) drawWordLabel(a, locked);
  }
}

function drawReticle(a, t) {
  const r = a.radius + 14;
  const spin = t * 0.9;
  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(spin);
  ctx.strokeStyle = "rgba(255, 217, 122, 0.9)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let q = 0; q < 4; q++) {
    const base = q * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.arc(0, 0, r, base - 0.32, base + 0.32);
    ctx.stroke();
  }
  // Corner ticks
  ctx.strokeStyle = "rgba(255, 217, 122, 0.55)";
  ctx.lineWidth = 1.2;
  for (let q = 0; q < 4; q++) {
    const ang = q * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * (r + 4), Math.sin(ang) * (r + 4));
    ctx.lineTo(Math.cos(ang) * (r + 11), Math.sin(ang) * (r + 11));
    ctx.stroke();
  }
  ctx.restore();
}

function drawWordLabel(a, locked) {
  const fs = locked ? 21 : 17;
  ctx.font = `bold ${fs}px ${MONO}`;
  ctx.textBaseline = "alphabetic";

  const done = a.word.slice(0, a.typed);
  const next = a.word.slice(a.typed, a.typed + 1);
  const rest = a.word.slice(a.typed + 1);
  const totalW = ctx.measureText(a.word).width;

  // Backing plate keeps words readable over bright nebula and explosions.
  // It is also kept inside the viewport: a rock hugging an edge is still
  // targetable, so its word has to be readable or the player sees something
  // they cannot shoot and it looks stuck there.
  const padX = 9, padY = 6;
  const bw = totalW + padX * 2, bh = fs + padY * 2;
  const bx = Math.max(6, Math.min(W - bw - 6, a.x - bw / 2));
  const by = Math.max(6, Math.min(H - bh - 6, a.y + a.radius + 12));
  const startX = bx + padX;
  const ly = by + fs + padY - 4;
  ctx.fillStyle = locked ? "rgba(12, 10, 4, 0.82)" : "rgba(5, 8, 16, 0.72)";
  roundRect(bx, by, bw, bh, 6);
  ctx.fill();
  ctx.strokeStyle = locked ? "rgba(255, 217, 122, 0.75)" : "rgba(140, 170, 205, 0.28)";
  ctx.lineWidth = 1;
  roundRect(bx, by, bw, bh, 6);
  ctx.stroke();

  ctx.textAlign = "left";
  let x = startX;

  if (done) {
    ctx.fillStyle = "#57d98a";
    ctx.fillText(done, x, ly);
    x += ctx.measureText(done).width;
  }
  if (next) {
    const nw = ctx.measureText(next).width;
    // Highlight the letter to press next — the main learning cue
    if (locked) {
      ctx.fillStyle = "rgba(255, 217, 122, 0.28)";
      roundRect(x - 2, ly - fs + 1, nw + 4, fs + 4, 3);
      ctx.fill();
    }
    ctx.fillStyle = locked ? "#fff6d5" : "#dceaff";
    ctx.fillText(next, x, ly);
    x += nw;
  }
  if (rest) {
    ctx.fillStyle = locked ? "rgba(255, 255, 255, 0.78)" : "#a8c4e2";
    ctx.fillText(rest, x, ly);
  }
  ctx.textAlign = "left";
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

function drawBullets() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of bullets) {
    // Motion trail
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i];
      const k = (i + 1) / b.trail.length;
      drawGlow(p.x, p.y, 5 * k, "#ffb84d", 0.22 * k);
    }
    drawGlow(b.x, b.y, 11, "#ffd97a", 0.85);
    ctx.fillStyle = "#fffdf2";
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  // Smoke first (normal blending), then sparks additively on top
  ctx.save();
  for (const p of particles) {
    if (p.kind !== "smoke") continue;
    const k = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = k * 0.32;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    if (p.kind === "smoke") continue;
    const k = Math.max(0, p.life / p.maxLife);
    drawGlow(p.x, p.y, p.r * 3.2, p.color, k * 0.85);
  }
  ctx.restore();
}

// The key to press now, plus every key that would start a valid lock.
function guideKeys() {
  if (lockTarget) return { next: lockTarget.word[lockTarget.typed] || null, options: [] };
  const opts = [];
  for (const a of asteroids) if (a.entered && !a.dying) opts.push(a.word[0]);
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
    showSpace: false,          // Blaster has no space action
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: Math.max(0, wrongKey.t / WRONG_FLASH) * vis,
    opacity: 0.13 * vis,             // barely there until a key lights up
    highlight: 0.85 * vis,
    mono: MONO,
  });
}

function drawHUD() {
  const pad = 20;

  // Score
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(138, 168, 200, 0.85)";
  ctx.fillText("SCORE", pad, 26);
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillStyle = "#eaf6ff";
  ctx.fillText(String(score), pad, 54);

  // Multiplier + streak meter
  if (multiplier > 1 || streak > 0) {
    const mx = pad, my = 68;
    ctx.font = `bold 14px ${MONO}`;
    ctx.fillStyle = multiplier > 1 ? "#7fffb2" : "rgba(138, 168, 200, 0.85)";
    ctx.fillText(`x${multiplier}`, mx, my + 12);
    const barX = mx + 34, barW = 96, barH = 6, barY = my + 4;
    const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
    ctx.fillStyle = "rgba(138, 168, 200, 0.22)";
    roundRect(barX, barY, barW, barH, 3);
    ctx.fill();
    ctx.fillStyle = multiplier > 1 ? "#7fffb2" : "#7fd4ff";
    roundRect(barX, barY, Math.max(2, barW * into), barH, 3);
    ctx.fill();
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = "rgba(138, 168, 200, 0.75)";
    ctx.fillText(`${streak} streak`, barX + barW + 10, my + 11);
  }

  // Lives as filled ship icons
  for (let i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(W - pad - 12 - i * 30, 30);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(127, 212, 255, 0.9)";
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-7, 7);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Bottom bar
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.font = `13px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(160, 190, 220, 0.8)";
  const infoY = H - 20;
  ctx.fillText(
    `WPM ${wpm}    ACC ${acc}%    ${currentLevel().label}    ${currentWordSet().label.toUpperCase()}`,
    pad, infoY
  );
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(138, 168, 200, 0.55)";
  ctx.fillText("ESC  pause / settings", W - pad, infoY);
  ctx.textAlign = "left";
}

// ---- Settings UI wiring ----
const diffButtons = Array.from(document.querySelectorAll(".diff-btn"));
const setButtons = Array.from(document.querySelectorAll(".set-btn"));
const kbdButtons = Array.from(document.querySelectorAll(".kbd-btn"));
const musicToggleEl = document.getElementById("music-toggle");
const musicVolEl = document.getElementById("music-vol");
const musicVolNumEl = document.getElementById("music-vol-num");
const sfxVolEl = document.getElementById("sfx-vol");
const sfxVolNumEl = document.getElementById("sfx-vol-num");

function syncSettingsUI() {
  for (const b of diffButtons) {
    b.classList.toggle("selected", b.dataset.diff === settings.difficulty);
  }
  for (const b of setButtons) {
    b.classList.toggle("selected", b.dataset.set === settings.wordSet);
  }
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
    ? `Best on ${currentLevel().label}: ${best.score}  (${best.wpm} wpm, ${best.acc}%)`
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
  if (settings.musicOn) { ensureAudio(); startMusic(); }
  else stopMusic();
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
  sfx.shoot(); // preview the new level
});

document.getElementById("settings-back").addEventListener("click", closeSettings);
document.getElementById("menu-settings").addEventListener("click", () => openSettings("menu"));
document.getElementById("gameover-settings").addEventListener("click", () => openSettings("gameover"));
document.getElementById("gameover-menu").addEventListener("click", returnToMenu);
quitBtn.addEventListener("click", requestQuit);

// Browsers only allow audio after a user gesture; clicks count too.
window.addEventListener("pointerdown", () => {
  ensureAudio();
  startMusic();
});

resetGame();
syncSettingsUI();

// ---- Main loop ----
// Hybrid scheduler: pure requestAnimationFrame when it's firing, with a
// setTimeout fallback so the game keeps running in occluded/embedded views
// where rAF is throttled. The dt clamp keeps time from jumping after stalls.
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
frame(performance.now());
