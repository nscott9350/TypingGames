// ============================================================
// Sentinel — a city defence shooter for touch typists
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

// ---- Tuning ----
const CITY_COUNT = 6;
const GROUND_H = 64;          // height of the ground strip
const INTERCEPTOR_SPEED = 780;
const BLAST_MAX = 78;         // radius a kill's fireball reaches
const BLAST_TIME = 0.55;
const MAX_PARTICLES = 700;
const MAX_MISSILES = 14;
const STREAK_PER_MULT = 20;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;
const ASSIST_MISSES = 3;
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;

// ---- Palette ----
const SKY = { hot: "#FF4D2E", warm: "#FFB020", cool: "#4DC4FF", mint: "#35E0C0", white: "#FFFFFF" };
const FIRE = ["#FFFFFF", "#FFE9A8", "#FFB020", "#FF4D2E"];

// ---- Settings & scores ----
const SETTINGS_KEY = "typesentinel-settings";
const SCORES_KEY = "typesentinel-scores";
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
    if (saved.v < 3 && typeof saved.keyboardGuide === "boolean") {
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
  return loadScores().filter(s => s.difficulty === difficulty).sort((a, b) => b.score - a.score);
}

function recordScore(entry) {
  const all = loadScores();
  all.push(entry);
  const kept = [];
  for (const key of Object.keys(DIFFICULTY_LEVELS)) {
    kept.push(...all.filter(s => s.difficulty === key)
                    .sort((a, b) => b.score - a.score).slice(0, 10));
  }
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(kept)); } catch (e) {}
  return scoresFor(entry.difficulty)
    .findIndex(s => s.date === entry.date && s.score === entry.score);
}

// ---- Difficulty ----
// Ranges run from wave 1 to wave 10. `salvo` is how many warheads a wave sends,
// `gap` the seconds between launches, `speed` their descent in px/s.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", speed: [26, 46],  salvo: [5, 10], gap: [2.6, 1.7], split: 0,    splitWave: 99, med: [0.05, 0.2] },
  easy:     { label: "EASY",     speed: [32, 58],  salvo: [6, 13], gap: [2.2, 1.4], split: 0.10, splitWave: 4,  med: [0.15, 0.35] },
  normal:   { label: "NORMAL",   speed: [40, 74],  salvo: [7, 16], gap: [1.8, 1.1], split: 0.16, splitWave: 3,  med: [0.25, 0.5] },
  hard:     { label: "HARD",     speed: [50, 92],  salvo: [9, 19], gap: [1.5, 0.85], split: 0.24, splitWave: 2, med: [0.3, 0.55] },
  master:   { label: "MASTER",   speed: [60, 110], salvo: [11, 22], gap: [1.2, 0.65], split: 0.32, splitWave: 2, med: [0.35, 0.6] },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentWordSet = () => WORD_SETS[settings.wordSet] || WORD_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

let W = 0, H = 0;
const groundY = () => H - GROUND_H;

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

// ---- Glow sprites ----
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

// ---- Background ----
let bgCanvas = null;
let stars = [];

function buildBackground() {
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = Math.max(1, W);
  bgCanvas.height = Math.max(1, H);
  const g = bgCanvas.getContext("2d");

  // Night sky deepening toward the horizon, where a faint glow sits over the
  // cities being defended.
  const sky = g.createLinearGradient(0, 0, 0, groundY());
  sky.addColorStop(0, "#05060F");
  sky.addColorStop(0.55, "#0A0F26");
  sky.addColorStop(1, "#141B3D");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, groundY());

  const horizon = g.createRadialGradient(W / 2, groundY(), 0, W / 2, groundY(), W * 0.7);
  horizon.addColorStop(0, "rgba(77, 196, 255, 0.16)");
  horizon.addColorStop(0.5, "rgba(53, 224, 192, 0.06)");
  horizon.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = horizon;
  g.fillRect(0, 0, W, groundY());

  // Ground
  const ground = g.createLinearGradient(0, groundY(), 0, H);
  ground.addColorStop(0, "#1A2145");
  ground.addColorStop(1, "#080B1C");
  g.fillStyle = ground;
  g.fillRect(0, groundY(), W, GROUND_H);
  g.strokeStyle = "rgba(77, 196, 255, 0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, groundY());
  g.lineTo(W, groundY());
  g.stroke();
}

function makeStars() {
  stars = [];
  const count = Math.floor((W * groundY()) / 7000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * groundY() * 0.92,
      r: 0.4 + Math.random() * 1.3,
      a: 0.25 + Math.random() * 0.6,
      tw: Math.random() * Math.PI * 2,
    });
  }
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
  if (cities && cities.length) layoutCities();
}
window.addEventListener("resize", resize);

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
  launch: (step = 0) => blip(420 + step * 22, 0.09, "triangle", 0.035, 520),
  hit: () => blip(260, 0.1, "square", 0.04, -100),
  blast: () => blip(90, 0.45, "sawtooth", 0.09, -60),
  chain: () => blip(520, 0.14, "triangle", 0.05, 260),
  error: () => blip(150, 0.14, "square", 0.055),
  lock: () => blip(880, 0.06, "sine", 0.045),
  cityLost: () => { blip(70, 0.8, "sawtooth", 0.13, -40); setTimeout(() => blip(52, 0.7, "sawtooth", 0.1, -25), 120); },
  split: () => blip(300, 0.16, "square", 0.04, 180),
  levelUp: () => { blip(600, 0.09, "sine", 0.05); setTimeout(() => blip(900, 0.15, "sine", 0.05), 80); },
  wave: () => [0, 110, 220].forEach((d, i) => setTimeout(() => blip([392, 523, 659][i], 0.2, "triangle", 0.055), d)),
};

// ---- Music: slow, tense, minor. A watch being kept. ----
const MUSIC_TEMPO = 84;
const STEPS_PER_BAR = 8;
const PROGRESSION = [
  { bass: 38, chord: [50, 53, 57] },  // D minor
  { bass: 36, chord: [48, 52, 55] },  // C
  { bass: 34, chord: [46, 50, 53] },  // B flat
  { bass: 33, chord: [45, 48, 52] },  // A minor
];
const ARP = [0, 2, 1, 2, 0, 1, 2, 1];
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
  if (sub === 0) {
    tone(noteFreq(bass), t, 1.1, "triangle", 0.07, 0.03);
    for (const m of chord) tone(noteFreq(m), t, secPerStep * 7.5, "sine", 0.032, 0.6);
  }
  if (sub % 2 === 0) tone(noteFreq(chord[ARP[sub]] + 12), t, 0.3, "sine", 0.016, 0.02);
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
let state = "menu";
let cities, missiles, interceptors, blasts, particles, lockTarget;
let score, elapsed, wave, waveTime, pending, spawnTimer, waveClearTimer;
let shake, flash, banner;
let typedCorrect, typedWrong, kills, chainKills, streak, bestStreak, multiplier;
let wrongKey, assist;

function layoutCities() {
  const usable = W * 0.86;
  const left = (W - usable) / 2;
  const step = usable / CITY_COUNT;
  for (let i = 0; i < cities.length; i++) {
    cities[i].x = left + step * (i + 0.5);
    cities[i].w = Math.min(58, step * 0.62);
  }
}

function resetGame() {
  cities = [];
  for (let i = 0; i < CITY_COUNT; i++) {
    cities.push({ x: 0, w: 50, alive: true, seed: Math.random() });
  }
  layoutCities();
  missiles = [];
  interceptors = [];
  blasts = [];
  particles = [];
  lockTarget = null;
  score = 0;
  elapsed = 0;
  wave = 0;
  waveTime = 0;
  pending = 0;
  spawnTimer = 0;
  waveClearTimer = 0;
  shake = 0;
  flash = 0;
  banner = null;
  typedCorrect = 0;
  typedWrong = 0;
  kills = 0;
  chainKills = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
  wrongKey = { key: null, t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
}

const aliveCities = () => cities.filter(c => c.alive);

// ---- Words ----
function distinctFirstLetters() {
  const pools = currentWordSet().pools;
  const s = new Set();
  for (const key of ["short", "medium", "long"]) {
    for (const w of pools[key] || []) s.add(w[0]);
  }
  return s.size;
}

function pickWord(short) {
  const pools = currentWordSet().pools;
  const L = currentLevel();
  const k = Math.min(1, (wave - 1) / 9);
  const medChance = L.med[0] + (L.med[1] - L.med[0]) * k;
  const order = short ? ["short", "medium", "long"]
              : Math.random() < medChance ? ["medium", "short", "long"]
                                          : ["short", "medium", "long"];
  const used = new Set(missiles.map(m => m.word[0]));
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

// ---- Missiles ----
function spawnMissile(opts = {}) {
  const L = currentLevel();
  const k = Math.min(1, (wave - 1) / 9);
  const speed = (L.speed[0] + (L.speed[1] - L.speed[0]) * k) * (0.85 + Math.random() * 0.3);

  const x = opts.x !== undefined ? opts.x : 30 + Math.random() * (W - 60);
  const y = opts.y !== undefined ? opts.y : -18;

  // Aim at a surviving city where possible; once they are all gone anything
  // still falling just hits the ground.
  const targets = aliveCities();
  const city = targets.length ? targets[(Math.random() * targets.length) | 0] : null;
  const tx = city ? city.x + (Math.random() - 0.5) * 24 : Math.random() * W;
  const ty = groundY();
  const dx = tx - x, dy = ty - y;
  const len = Math.hypot(dx, dy) || 1;

  const canSplit = !opts.fromSplit && wave >= L.splitWave && Math.random() < L.split;
  const word = pickWord(!!opts.fromSplit);

  missiles.push({
    x, y,
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    word, typed: 0, hitsLanded: 0,
    trail: [],
    dying: false,
    doomed: false,           // caught in a blast, awaiting removal
    fromSplit: !!opts.fromSplit,
    willSplit: canSplit,
    splitY: canSplit ? groundY() * (0.32 + Math.random() * 0.2) : -1,
    targetCity: city,
  });
}

function splitMissile(m) {
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    if (missiles.length >= MAX_MISSILES) break;
    spawnMissile({ x: m.x, y: m.y, fromSplit: true });
  }
  sfx.split();
}

// ---- Effects ----
function addParticle(p) {
  if (particles.length >= MAX_PARTICLES) return;
  particles.push(p);
}

function burst(x, y, count, palette, speedScale = 1) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (40 + Math.random() * 190) * speedScale;
    addParticle({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.6, maxLife: 1,
      r: 1.4 + Math.random() * 2.6,
      color: palette[(Math.random() * palette.length) | 0],
      drag: 1.7,
    });
  }
}

// A blast is both the visual and the hitbox: anything inside it dies, which is
// what makes firing into a cluster the right move.
function addBlast(x, y, maxR = BLAST_MAX) {
  blasts.push({ x, y, r: 0, maxR, life: BLAST_TIME, maxLife: BLAST_TIME });
  burst(x, y, 20, FIRE);
  flash = Math.min(0.4, flash + 0.12);
}

// ---- Settings overlay / quit ----
let settingsOpen = false, settingsFrom = "menu";
let quitArmed = false, quitTimer = null;

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

function disarmQuit() {
  quitArmed = false;
  clearTimeout(quitTimer);
  quitBtn.textContent = "Quit run (Q)";
  quitBtn.classList.remove("armed");
}

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
  missiles = [];
  interceptors = [];
  blasts = [];
  particles = [];
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
  if (!/^[a-z]$/i.test(e.key)) return;

  const letter = e.key.toLowerCase();
  if (lockTarget) {
    if (lockTarget.word[lockTarget.typed] === letter) correctLetter(lockTarget);
    else wrongLetter(letter);
  } else {
    // Lowest warhead first: the one nearest the ground is the urgent one.
    let best = null, bestY = -Infinity;
    for (const m of missiles) {
      if (!targetable(m) || m.word[0] !== letter) continue;
      if (m.y > bestY) { bestY = m.y; best = m; }
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

const targetable = (m) => !m.dying && !m.doomed && m.y > -10;

function noteCorrectKey() {
  assist.misses = 0;
  assist.showing = false;
}

function bumpStreak() {
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  const m = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (m > multiplier) { multiplier = m; sfx.levelUp(); }
}

function correctLetter(target) {
  target.typed++;
  typedCorrect++;
  noteCorrectKey();
  bumpStreak();
  score += 10 * multiplier;
  fireInterceptor(target);
  sfx.launch(Math.min(12, streak % STREAK_PER_MULT));
  if (target.typed >= target.word.length) {
    target.dying = true;
    lockTarget = null;
  }
}

function wrongLetter(key) {
  if (key) { wrongKey.key = key; wrongKey.t = WRONG_FLASH; }
  if (++assist.misses >= ASSIST_MISSES) assist.showing = true;
  typedWrong++;
  streak = 0;
  multiplier = 1;
  score = Math.max(0, score - 5);
  shake = Math.max(shake, 4);
  sfx.error();
}

// Interceptors rise from the nearest surviving city, so the defence visibly
// comes from the thing being defended.
function batteryFor(x) {
  const alive = aliveCities();
  if (!alive.length) return { x: W / 2, y: groundY() - 6 };
  let best = alive[0];
  for (const c of alive) if (Math.abs(c.x - x) < Math.abs(best.x - x)) best = c;
  return { x: best.x, y: groundY() - 18 };
}

function fireInterceptor(target) {
  const from = batteryFor(target.x);
  interceptors.push({ x: from.x, y: from.y, target, life: 4, trail: [] });
}

// ---- Waves ----
function startWave(n) {
  const L = currentLevel();
  const k = Math.min(1, (n - 1) / 9);
  wave = n;
  waveTime = 0;
  pending = Math.round(L.salvo[0] + (L.salvo[1] - L.salvo[0]) * k);
  spawnTimer = 0.8;
  banner = { text: `WAVE ${n}`, sub: `${pending} INBOUND`, life: 2.0, maxLife: 2.0 };
  sfx.wave();
}

function waveGap() {
  const L = currentLevel();
  const k = Math.min(1, (wave - 1) / 9);
  return (L.gap[0] + (L.gap[1] - L.gap[0]) * k) * (0.75 + Math.random() * 0.5);
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  waveTime += dt;

  if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  if (wrongKey.t > 0) wrongKey.t -= dt;

  const assistTarget = assist.showing ? 1 : 0;
  const assistRate = dt / (assist.showing ? ASSIST_FADE_IN : ASSIST_FADE_OUT);
  assist.alpha += Math.sign(assistTarget - assist.alpha) *
                  Math.min(assistRate, Math.abs(assistTarget - assist.alpha));

  // Launching
  const cap = Math.min(MAX_MISSILES, distinctFirstLetters());
  if (pending > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0 && missiles.length < cap) {
      spawnMissile();
      pending--;
      spawnTimer = waveGap();
    }
  }

  updateMissiles(dt);
  updateInterceptors(dt);
  updateBlasts(dt);
  updateParticles(dt);

  // Wave flow
  if (state === "playing" && pending === 0 && missiles.length === 0) {
    if (waveClearTimer <= 0) {
      waveClearTimer = 2.4;
      const standing = aliveCities().length;
      const bonus = (150 * wave + 200 * standing) * multiplier;
      score += bonus;
      banner = { text: `WAVE ${wave} HELD`, sub: `${standing} CITIES STANDING  +${bonus}`, life: 2.2, maxLife: 2.2 };
      sfx.wave();
    } else {
      waveClearTimer -= dt;
      if (waveClearTimer <= 0) startWave(wave + 1);
    }
  }
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    m.trail.push({ x: m.x, y: m.y });
    if (m.trail.length > 90) m.trail.shift();

    if (m.willSplit && m.y >= m.splitY) {
      m.willSplit = false;
      splitMissile(m);
    }

    // Impact
    if (m.y >= groundY()) {
      const hit = cities.find(c => c.alive && Math.abs(c.x - m.x) < c.w * 0.75);
      if (lockTarget === m) lockTarget = null;
      missiles.splice(i, 1);
      addBlast(m.x, groundY() - 6, 92);
      if (hit) {
        hit.alive = false;
        shake = 20;
        flash = 0.55;
        burst(hit.x, groundY() - 14, 40, FIRE, 1.3);
        sfx.cityLost();
        streak = 0;
        multiplier = 1;
        if (!aliveCities().length) { endGame("dead"); return; }
      } else {
        shake = Math.max(shake, 9);
        sfx.blast();
      }
      continue;
    }
  }
}

function updateInterceptors(dt) {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    const b = interceptors[i];
    b.life -= dt;
    const t = b.target;
    if (!t || b.life <= 0 || !missiles.includes(t)) { interceptors.splice(i, 1); continue; }
    b.trail.push({ x: b.x, y: b.y });
    if (b.trail.length > 8) b.trail.shift();

    const dx = t.x - b.x, dy = t.y - b.y;
    const dist = Math.hypot(dx, dy);
    const step = INTERCEPTOR_SPEED * dt;
    if (dist <= step + 8) {
      interceptors.splice(i, 1);
      t.hitsLanded++;
      burst(b.x, b.y, 6, [SKY.cool, SKY.white], 0.5);
      sfx.hit();
      if (t.dying && t.hitsLanded >= t.word.length) {
        const idx = missiles.indexOf(t);
        if (idx !== -1) missiles.splice(idx, 1);
        addBlast(t.x, t.y);
        score += (60 + t.word.length * 12) * multiplier;
        kills++;
        sfx.blast();
      }
    } else {
      b.x += (dx / dist) * step;
      b.y += (dy / dist) * step;
    }
  }
}

function updateBlasts(dt) {
  for (let i = blasts.length - 1; i >= 0; i--) {
    const s = blasts[i];
    s.life -= dt;
    if (s.life <= 0) { blasts.splice(i, 1); continue; }
    const k = 1 - s.life / s.maxLife;
    // Grows fast then holds, so the kill window is generous enough to aim for
    s.r = s.maxR * Math.min(1, Math.sqrt(k) * 1.25);

    // Anything caught inside goes up with it, which is the whole strategy
    for (let j = missiles.length - 1; j >= 0; j--) {
      const m = missiles[j];
      if (m.doomed) continue;
      if (Math.hypot(m.x - s.x, m.y - s.y) > s.r) continue;
      m.doomed = true;
      if (lockTarget === m) lockTarget = null;
      missiles.splice(j, 1);
      addBlast(m.x, m.y, BLAST_MAX * 0.82);
      score += 90 * multiplier;
      kills++;
      chainKills++;
      sfx.chain();
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
}

// ---- Flow ----
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
    score, wpm, acc, kills, chains: chainKills,
    wave, streak: bestStreak, cities: aliveCities().length,
    time: Math.floor(elapsed),
    difficulty: settings.difficulty, wordSet: settings.wordSet, date: Date.now(),
  };
  const worthRecording = typedCorrect > 0;
  const rank = worthRecording ? recordScore(entry) : -1;

  gameoverTitleEl.textContent = reason === "quit" ? "RUN ENDED" : "CITIES LOST";
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Wave reached</span><span class="value">${wave}</span>
    <span class="label">Warheads stopped</span><span class="value">${kills}</span>
    <span class="label">Caught in blasts</span><span class="value">${chainKills}</span>
    <span class="label">WPM</span><span class="value">${wpm}</span>
    <span class="label">Accuracy</span><span class="value">${acc}%</span>
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
function draw() {
  const t = performance.now() / 1000;
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawStars(t);

  if (state === "playing" || state === "paused") drawGuide();

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  if (state !== "menu") {
    drawCities(t);
    drawMissiles(t);
    drawInterceptors();
    drawBlasts();
    drawParticles();
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 220, 190, ${flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
  drawVignette();
  if (state !== "menu") { drawBanner(); drawHUD(); }
}

function drawStars(t) {
  for (const s of stars) {
    const tw = 0.7 + 0.3 * Math.sin(t * 1.4 + s.tw);
    ctx.fillStyle = `rgba(210, 226, 255, ${s.a * tw})`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
}

function drawVignette() {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0, 0, 0, 0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCities(t) {
  const gy = groundY();
  for (const c of cities) {
    if (!c.alive) {
      // Rubble: a low broken silhouette, so the loss stays visible
      ctx.fillStyle = "rgba(90, 100, 130, 0.5)";
      const w = c.w;
      ctx.beginPath();
      ctx.moveTo(c.x - w / 2, gy);
      ctx.lineTo(c.x - w * 0.3, gy - 7);
      ctx.lineTo(c.x - w * 0.1, gy - 3);
      ctx.lineTo(c.x + w * 0.15, gy - 9);
      ctx.lineTo(c.x + w * 0.34, gy - 4);
      ctx.lineTo(c.x + w / 2, gy);
      ctx.closePath();
      ctx.fill();
      continue;
    }

    const w = c.w, h = 30 + c.seed * 12;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawGlow(c.x, gy - h * 0.4, w * 1.1, SKY.cool, 0.16);
    ctx.restore();

    // Blocky skyline
    const grad = ctx.createLinearGradient(0, gy - h, 0, gy);
    grad.addColorStop(0, "#2E4A7A");
    grad.addColorStop(1, "#16203E");
    ctx.fillStyle = grad;
    const towers = 4;
    for (let i = 0; i < towers; i++) {
      const tw = w / towers;
      const th = h * (0.55 + ((Math.sin(c.seed * 20 + i * 2.1) + 1) / 2) * 0.45);
      ctx.fillRect(c.x - w / 2 + i * tw, gy - th, tw - 2, th);
    }
    // Lit windows, blinking slowly so the cities feel inhabited
    ctx.fillStyle = SKY.warm;
    for (let i = 0; i < 7; i++) {
      const wx = c.x - w / 2 + 3 + ((i * 7.3 + c.seed * 40) % (w - 8));
      const wy = gy - 6 - ((i * 9.1 + c.seed * 30) % (h - 10));
      ctx.globalAlpha = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.7 + i + c.seed * 9));
      ctx.fillRect(wx, wy, 2.5, 3);
    }
    ctx.globalAlpha = 1;
  }
}

function drawMissiles(t) {
  for (const m of missiles) {
    // Trail
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexA(SKY.hot, 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < m.trail.length; i++) {
      const p = m.trail[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
    drawGlow(m.x, m.y, m.willSplit ? 16 : 12, m.willSplit ? SKY.warm : SKY.hot, 0.9);
    ctx.restore();

    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // A warhead that will split is worth spotting early
    if (m.willSplit) {
      ctx.strokeStyle = hexA(SKY.warm, 0.6 + 0.3 * Math.sin(t * 8));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (!m.dying) drawWordLabel(m, m === lockTarget);
  }
}

function drawWordLabel(m, locked) {
  const fs = locked ? 19 : 15;
  ctx.font = `bold ${fs}px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  const totalW = ctx.measureText(m.word).width;

  const padX = 8, padY = 5;
  const bw = totalW + padX * 2, bh = fs + padY * 2;
  // Label rides beside the warhead and stays inside the viewport, so anything
  // targetable is always readable.
  const bx = Math.max(6, Math.min(W - bw - 6, m.x + 14));
  const by = Math.max(6, Math.min(H - bh - 6, m.y - bh / 2));

  ctx.fillStyle = locked ? "rgba(20, 8, 4, 0.9)" : "rgba(6, 9, 22, 0.82)";
  roundRect(bx, by, bw, bh, 5);
  ctx.fill();
  ctx.strokeStyle = locked ? SKY.warm : hexA(SKY.hot, 0.5);
  ctx.lineWidth = locked ? 1.6 : 1;
  roundRect(bx, by, bw, bh, 5);
  ctx.stroke();

  ctx.textAlign = "left";
  let x = bx + padX;
  const ly = by + fs + padY - 3;
  const done = m.word.slice(0, m.typed);
  const next = m.word.slice(m.typed, m.typed + 1);
  const rest = m.word.slice(m.typed + 1);
  if (done) { ctx.fillStyle = SKY.mint; ctx.fillText(done, x, ly); x += ctx.measureText(done).width; }
  if (next) {
    const nw = ctx.measureText(next).width;
    if (locked) {
      ctx.fillStyle = hexA(SKY.warm, 0.35);
      roundRect(x - 2, ly - fs + 1, nw + 4, fs + 4, 3);
      ctx.fill();
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(next, x, ly);
    x += nw;
  }
  if (rest) { ctx.fillStyle = locked ? "rgba(255,255,255,0.85)" : "#CFDBF5"; ctx.fillText(rest, x, ly); }
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

function drawInterceptors() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of interceptors) {
    ctx.strokeStyle = hexA(SKY.cool, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < b.trail.length; i++) {
      const p = b.trail[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    drawGlow(b.x, b.y, 10, SKY.cool, 0.9);
  }
  ctx.restore();
}

function drawBlasts() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const s of blasts) {
    const k = s.life / s.maxLife;
    drawGlow(s.x, s.y, s.r * 1.15, SKY.warm, 0.5 * k);
    ctx.strokeStyle = hexA(SKY.white, 0.8 * k);
    ctx.lineWidth = 2.5 * k + 0.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = hexA(SKY.hot, 0.22 * k);
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.86, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const k = Math.max(0, p.life / p.maxLife);
    drawGlow(p.x, p.y, p.r * 3, p.color, k * 0.8);
  }
  ctx.restore();
}

function drawGuide() {
  const g = guideBox();
  if (!g.on) return;
  const vis = guideVisibility();
  const opts = { next: null, options: [] };
  if (lockTarget) opts.next = lockTarget.word[lockTarget.typed] || null;
  else for (const m of missiles) if (targetable(m)) opts.options.push(m.word[0]);

  drawKeyboardGuide(ctx, {
    x: g.x, y: g.y, width: g.w,
    next: opts.next, options: opts.options,
    showSpace: false,
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: Math.max(0, wrongKey.t / WRONG_FLASH) * vis,
    opacity: 0.13 * vis,
    highlight: 0.85 * vis,
    mono: MONO,
  });
}

function drawBanner() {
  if (!banner) return;
  const k = banner.life / banner.maxLife;
  const alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.35);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = "center";
  ctx.font = `bold 42px ${MONO}`;
  const g = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
  g.addColorStop(0, SKY.cool);
  g.addColorStop(0.5, SKY.warm);
  g.addColorStop(1, SKY.hot);
  ctx.fillStyle = g;
  ctx.fillText(banner.text, W / 2, H * 0.36);
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = "rgba(234, 240, 255, 0.75)";
  ctx.fillText(banner.sub, W / 2, H * 0.36 + 26);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawHUD() {
  const pad = 20;
  ctx.font = `600 12px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(154, 168, 204, 0.9)";
  ctx.fillText("SCORE", pad, 26);
  ctx.font = `bold 30px ${MONO}`;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(String(score), pad, 54);

  if (multiplier > 1 || streak > 0) {
    const my = 68;
    ctx.font = `bold 14px ${MONO}`;
    ctx.fillStyle = multiplier > 1 ? SKY.mint : "rgba(154, 168, 204, 0.9)";
    ctx.fillText(`x${multiplier}`, pad, my + 12);
    const bx = pad + 34, bw = 96, bh = 6, by = my + 4;
    const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
    ctx.fillStyle = "rgba(154, 168, 204, 0.25)";
    roundRect(bx, by, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = multiplier > 1 ? SKY.mint : SKY.cool;
    roundRect(bx, by, Math.max(2, bw * into), bh, 3);
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = "rgba(154, 168, 204, 0.9)";
  ctx.fillText("WAVE", W / 2, 26);
  ctx.font = `bold 22px ${MONO}`;
  ctx.fillStyle = SKY.warm;
  ctx.fillText(String(Math.max(1, wave)), W / 2, 50);

  // Cities standing, as little skyline marks
  for (let i = 0; i < cities.length; i++) {
    const c = cities[i];
    const x = W - pad - 12 - (cities.length - 1 - i) * 18;
    ctx.fillStyle = c.alive ? SKY.cool : "rgba(154, 168, 204, 0.25)";
    ctx.fillRect(x - 5, 20, 3, 12);
    ctx.fillRect(x - 1, 16, 3, 16);
    ctx.fillRect(x + 3, 23, 3, 9);
  }

  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.textAlign = "left";
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = "rgba(200, 214, 245, 0.85)";
  ctx.fillText(
    `WPM ${wpm}    ACC ${acc}%    ${currentLevel().label}    ${currentWordSet().label.toUpperCase()}`,
    pad, H - 20
  );
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(154, 168, 204, 0.6)";
  ctx.fillText("ESC  pause / settings", W - pad, H - 20);
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

for (const b of diffButtons) b.addEventListener("click", () => {
  settings.difficulty = b.dataset.diff; saveSettings(); syncSettingsUI();
});
for (const b of setButtons) b.addEventListener("click", () => {
  settings.wordSet = b.dataset.set; saveSettings(); syncSettingsUI();
});
for (const b of kbdButtons) b.addEventListener("click", () => {
  settings.keyboardGuide = b.dataset.kbd; saveSettings(); syncSettingsUI();
});

musicToggleEl.addEventListener("click", () => {
  settings.musicOn = !settings.musicOn;
  saveSettings();
  syncSettingsUI();
  if (settings.musicOn) { ensureAudio(); startMusic(); } else stopMusic();
});
musicVolEl.addEventListener("input", () => {
  settings.musicVol = Number(musicVolEl.value);
  saveSettings(); applyVolumes();
  musicVolNumEl.textContent = settings.musicVol;
});
sfxVolEl.addEventListener("input", () => {
  settings.sfxVol = Number(sfxVolEl.value);
  saveSettings(); applyVolumes();
  sfxVolNumEl.textContent = settings.sfxVol;
  sfx.launch();
});

document.getElementById("settings-back").addEventListener("click", closeSettings);
document.getElementById("menu-settings").addEventListener("click", () => openSettings("menu"));
document.getElementById("gameover-settings").addEventListener("click", () => openSettings("gameover"));
document.getElementById("gameover-menu").addEventListener("click", returnToMenu);
quitBtn.addEventListener("click", requestQuit);
window.addEventListener("pointerdown", () => { ensureAudio(); startMusic(); });

resize();
resetGame();
syncSettingsUI();

// ---- Main loop ----
// Hybrid scheduler: requestAnimationFrame when it's firing, with a setTimeout
// fallback so the game keeps running in occluded views where rAF is throttled.
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
