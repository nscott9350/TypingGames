// ============================================================
// Type Burrow — a marble popper for touch typists
//
// A line of marbles creeps down a garden path toward a gopher's hole. Typing a
// marble's word pops it and the line closes the gap — and if that brings three
// of a colour together they go too, which can cascade. So the fastest marble to
// type is rarely the right one: the game is read before it is reflex.
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
const SPACING_MUL = 2.12;     // marble spacing as a multiple of radius
const SETTLE_TIME = 0.2;      // pause after a pop so the gap visibly closes
const MAX_PARTICLES = 600;
const LABEL_WINDOW = 12;      // how many marbles nearest the hole carry words
const CASCADE_SEED = 0.5;     // chance a new marble is placed to set up a cascade
const STREAK_PER_MULT = 20;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;
const ASSIST_MISSES = 3;
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;

// ---- Cartoon palette (early Technicolor: bright but chalky) ----
const INK = "#2E2018";
const PAL = {
  skyTop: "#7FC8DE", skyLow: "#CFEAF0",
  sun: "#FFD65C",
  hillFar: "#8FBF63", hillMid: "#6FA84B", hillNear: "#5A9040",
  dirt: "#C08A4E", dirtDark: "#9C6A38",
  fur: "#D2985A", furDark: "#B87C42", belly: "#F4DDAE",
  cream: "#FFF3D6", white: "#FFFDF2", red: "#D6453C",
};
const MARBLE_COLOURS = [
  { fill: "#D6453C", name: "red" },
  { fill: "#3C7FD6", name: "blue" },
  { fill: "#4FB050", name: "green" },
  { fill: "#F0A62E", name: "amber" },
  { fill: "#9B59B6", name: "grape" },
  { fill: "#28B7C6", name: "teal" },
];

// ---- Settings & scores ----
const SETTINGS_KEY = "typeburrow-settings";
const SCORES_KEY = "typeburrow-scores";
const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  difficulty: "normal", wordSet: "all", musicOn: true, musicVol: 50, sfxVol: 70,
  keyboardGuide: "off",
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
function scoresFor(d) {
  return loadScores().filter(s => s.difficulty === d).sort((a, b) => b.score - a.score);
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
// `crawl` is path pixels per second, `load` the marbles in a wave, `hues` how
// many colours are in play (fewer colours means easier cascades), and `burrow`
// how many marbles may drop in before the gopher is overrun.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", crawl: [13, 24], load: [22, 34], hues: 4, burrow: 8 },
  easy:     { label: "EASY",     crawl: [17, 31], load: [26, 42], hues: 4, burrow: 7 },
  normal:   { label: "NORMAL",   crawl: [22, 41], load: [30, 50], hues: 5, burrow: 6 },
  hard:     { label: "HARD",     crawl: [28, 52], load: [36, 58], hues: 5, burrow: 5 },
  master:   { label: "MASTER",   crawl: [35, 64], load: [42, 66], hues: 6, burrow: 4 },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentWordSet = () => WORD_SETS[settings.wordSet] || WORD_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

let W = 0, H = 0, LW = 4, R = 20, SPACING = 42;

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

// ---- Cartoon drawing helpers ----
function ink(fill, lw = LW) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ellipse(x, y, rx, ry, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
function hose(x1, y1, cx, cy, x2, y2, w, colour) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.strokeStyle = INK; ctx.lineWidth = w + LW * 1.5; ctx.lineCap = "round"; ctx.stroke();
  ctx.strokeStyle = colour; ctx.lineWidth = w; ctx.stroke();
}
// Pie-cut eye: a white disc with a wedge bitten out, pupil riding on top
function pieEye(x, y, r, lookX, lookY, blink) {
  if (blink) {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.quadraticCurveTo(x, y + r * 0.5, x + r, y);
    ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineCap = "round"; ctx.stroke();
    return;
  }
  const cut = -Math.PI * 0.62;
  ctx.beginPath();
  ctx.arc(x, y, r, cut + 0.55, cut + Math.PI * 2 - 0.55);
  ctx.closePath();
  ink(PAL.white);
  circle(x + lookX * r * 0.3, y + lookY * r * 0.3, r * 0.42);
  ctx.fillStyle = INK; ctx.fill();
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

// ---- Film treatment ----
let grainTiles = [];
function buildGrain() {
  grainTiles = [];
  for (let n = 0; n < 4; n++) {
    const size = 160;
    const t = document.createElement("canvas");
    t.width = t.height = size;
    const g = t.getContext("2d");
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 88;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 24;
    }
    g.putImageData(img, 0, 0);
    grainTiles.push(t);
  }
}
function filmGrain(frame) {
  const t = grainTiles[frame % grainTiles.length];
  if (!t) return;
  ctx.save();
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(t, "repeat");
  ctx.translate((frame * 7) % 160 - 160, (frame * 11) % 160 - 160);
  ctx.fillRect(0, 0, W + 320, H + 320);
  ctx.restore();
}
function filmLook() {
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(255, 226, 178, 0.18)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                     W / 2, H / 2, Math.max(W, H) * 0.78);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(40, 26, 14, 0.4)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---- The garden path -----------------------------------------------------
// Sampled once into an arc-length table so marbles can be spaced evenly along
// it no matter how the curve bunches up.
let pathPts = [], pathLen = 0;

function pathAt(u) {
  const x = W * 0.5 + Math.sin(u * Math.PI * 3 - Math.PI / 2) * W * 0.37;
  const y = H * 0.13 + u * H * 0.64;
  return { x, y };
}

function buildPath() {
  pathPts = [];
  const N = 600;
  let acc = 0, prev = pathAt(0);
  pathPts.push({ ...prev, d: 0 });
  for (let i = 1; i <= N; i++) {
    const p = pathAt(i / N);
    acc += Math.hypot(p.x - prev.x, p.y - prev.y);
    pathPts.push({ ...p, d: acc });
    prev = p;
  }
  pathLen = acc;
}

function pointAtDist(d) {
  if (d <= 0) return { ...pathPts[0], t: 0 };
  if (d >= pathLen) return { ...pathPts[pathPts.length - 1], t: 1 };
  let lo = 0, hi = pathPts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pathPts[mid].d < d) lo = mid; else hi = mid;
  }
  const a = pathPts[lo], b = pathPts[hi];
  const f = (d - a.d) / Math.max(1e-6, b.d - a.d);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: lo / (pathPts.length - 1) };
}

function normalAtDist(d) {
  const a = pointAtDist(Math.max(0, d - 6));
  const b = pointAtDist(Math.min(pathLen, d + 6));
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  LW = Math.max(2.4, Math.min(W, H) * 0.005);
  R = Math.max(13, Math.min(W, H) * 0.026);
  SPACING = R * SPACING_MUL;
  buildPath();
  buildGrain();
  makeStars();
}
window.addEventListener("resize", resize);

let clouds = [];
function makeStars() {
  clouds = [
    { x: W * 0.24, y: H * 0.12, s: Math.min(W, H) * 0.07, ph: 0 },
    { x: W * 0.68, y: H * 0.08, s: Math.min(W, H) * 0.055, ph: 2.1 },
    { x: W * 0.88, y: H * 0.2, s: Math.min(W, H) * 0.045, ph: 4.0 },
  ];
}

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
  musicGain.gain.value = (settings.musicVol / 100) * 0.5;
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
  osc.start(t); osc.stop(t + dur);
}
const sfx = {
  flick: (s = 0) => blip(520 + s * 24, 0.07, "triangle", 0.035, 380),
  pop: () => blip(660, 0.09, "sine", 0.05, -220),
  // Cascades climb in pitch, so a long chain sounds like a run up the keyboard
  cascade: (n) => blip(520 + Math.min(8, n) * 90, 0.13, "triangle", 0.06, 200),
  error: () => blip(150, 0.14, "square", 0.055),
  lock: () => blip(900, 0.06, "sine", 0.045),
  drop: () => { blip(240, 0.3, "sine", 0.08, -170); setTimeout(() => blip(150, 0.35, "sine", 0.06, -90), 90); },
  overrun: () => { blip(200, 0.7, "sawtooth", 0.12, -140); setTimeout(() => blip(120, 0.8, "sawtooth", 0.1, -70), 160); },
  levelUp: () => { blip(660, 0.09, "triangle", 0.05); setTimeout(() => blip(990, 0.14, "triangle", 0.05), 80); },
  wave: () => [0, 100, 200, 320].forEach((d, i) =>
    setTimeout(() => blip([523, 659, 784, 1047][i], 0.17, "triangle", 0.055), d)),
};

// ---- Music: oom-pah, because it is 1932 ----
const MUSIC_TEMPO = 138;
const STEPS_PER_BAR = 8;
const PROGRESSION = [
  { bass: 48, chord: [64, 67, 72] },   // C
  { bass: 43, chord: [62, 67, 71] },   // G
  { bass: 45, chord: [64, 69, 72] },   // Am
  { bass: 41, chord: [65, 69, 72] },   // F
];
const MELODY = [0, null, 4, 7, null, 4, 2, null];
const noteFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
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
  osc.start(t); osc.stop(t + dur + 0.05);
}
function playMusicStep(step, t) {
  const bar = Math.floor(step / STEPS_PER_BAR);
  const sub = step % STEPS_PER_BAR;
  const { bass, chord } = PROGRESSION[bar];
  // Tuba on the beat, banjo chord on the off-beat: the oom and the pah
  if (sub % 4 === 0) tone(noteFreq(bass), t, 0.2, "triangle", 0.08, 0.01);
  if (sub % 4 === 2) for (const m of chord) tone(noteFreq(m), t, 0.13, "square", 0.014, 0.005);
  const mel = MELODY[sub];
  if (mel !== null) tone(noteFreq(chord[0] + mel), t, 0.22, "triangle", 0.03, 0.01);
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
let chain, shots, pops, particles, lockTarget;
let headDist, remaining, settleTimer, cascadeDepth;
let score, elapsed, wave, waveClearTimer, burrowFill;
let shake, flash, banner;
let typedCorrect, typedWrong, popped, cascaded, streak, bestStreak, multiplier;
let wrongKey, assist, gopherThrow;

function resetGame() {
  chain = [];
  shots = [];
  pops = [];
  particles = [];
  lockTarget = null;
  headDist = 0;
  remaining = 0;
  settleTimer = 0;
  cascadeDepth = 0;
  score = 0;
  elapsed = 0;
  wave = 0;
  waveClearTimer = 0;
  burrowFill = 0;
  shake = 0;
  flash = 0;
  banner = null;
  typedCorrect = 0;
  typedWrong = 0;
  popped = 0;
  cascaded = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
  wrongKey = { key: null, t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  gopherThrow = 0;
}

// ---- Words ----
// Only the marbles nearest the hole carry words, and each is given one as it
// enters that window. Colour is fixed from birth, so a cascade can be planned
// on the whole line while targeting stays unambiguous among the few that count.
function distinctFirstLetters() {
  const pools = currentWordSet().pools;
  const s = new Set();
  for (const w of pools.short || []) s.add(w[0]);
  for (const w of pools.medium || []) s.add(w[0]);
  return s.size;
}
const letteredCount = () => Math.min(LABEL_WINDOW, distinctFirstLetters());

function pickWord(used) {
  const pools = currentWordSet().pools;
  // Short words only: they have to sit under a marble without colliding
  for (const key of ["short", "medium"]) {
    const pool = (pools[key] || []).filter(w => w.length <= 5);
    const cands = pool.filter(w => !used.has(w[0]));
    if (cands.length) return cands[(Math.random() * cands.length) | 0];
  }
  const any = (pools.short || []).concat(pools.medium || []);
  return any.length ? any[(Math.random() * any.length) | 0] : "pop";
}

function refreshLabels() {
  const n = letteredCount();
  const used = new Set();
  let assigned = 0;
  for (let i = 0; i < chain.length && assigned < n; i++) {
    const m = chain[i];
    if (m.dead || m.d < 0) continue;
    if (!m.word) m.word = pickWord(used);
    used.add(m.word[0]);
    m.lettered = true;
    assigned++;
  }
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    if (!used.has(m.word ? m.word[0] : "") || m.d < 0) {
      // marbles beyond the window keep their colour but lose their label
      if (m.lettered && !(m.word && used.has(m.word[0]))) m.lettered = false;
    }
  }
}

// ---- Chain ----
function targetDist(i) { return headDist - i * SPACING; }

function newMarble(hues) {
  const n = chain.length;
  const back = (k) => (chain[n - k] ? chain[n - k].hue : -1);
  let hue = null;

  // Deliberately plant cascade setups. Left to chance, the pattern the cascade
  // needs — A A X A, where popping X joins the pair to the single — turns up
  // roughly once per line, so the mechanic never fires and the player never
  // learns it exists. Completing the pattern on purpose keeps opportunities on
  // the board without ever spawning a ready-made match.
  if (n >= 3 && back(3) === back(2) && back(1) !== back(2) && Math.random() < CASCADE_SEED) {
    hue = back(2);
  }

  // Otherwise random, but never a run of three: every match should be one the
  // player made, not one that arrived pre-built.
  while (hue === null) {
    const pick = (Math.random() * hues) | 0;
    if (n >= 2 && back(1) === back(2) && back(1) === pick) continue;
    hue = pick;
  }
  return {
    hue, word: null, typed: 0, lettered: false,
    d: -SPACING * (chain.length ? 1 : 0), dead: false, spin: Math.random() * 6,
    squash: 0,
  };
}

function startWave(n) {
  const L = currentLevel();
  const k = Math.min(1, (n - 1) / 9);
  wave = n;
  remaining = Math.round(L.load[0] + (L.load[1] - L.load[0]) * k);
  headDist = 0;
  chain = [];
  lockTarget = null;
  banner = { text: `WAVE ${n}`, sub: `${remaining} MARBLES`, life: 2.0, maxLife: 2.0 };
  sfx.wave();
}

function crawlSpeed() {
  const L = currentLevel();
  const k = Math.min(1, (wave - 1) / 9);
  return L.crawl[0] + (L.crawl[1] - L.crawl[0]) * k;
}

// ---- Matching ----
// Scan for runs of three or more of a colour and pop them. Returns how many
// went. Because spawning never creates a triple, every run found here is one
// the player produced by clearing something between them.
function resolveMatches() {
  let i = 0, removed = 0;
  while (i < chain.length) {
    let j = i;
    while (j + 1 < chain.length && chain[j + 1].hue === chain[i].hue) j++;
    const run = j - i + 1;
    if (run >= 3) {
      cascadeDepth++;
      const gone = chain.splice(i, run);
      for (const m of gone) {
        const p = pointAtDist(m.d);
        pops.push({ x: p.x, y: p.y, r: R, life: 0.34, maxLife: 0.34, hue: m.hue });
        burstAt(p.x, p.y, MARBLE_COLOURS[m.hue].fill, 10);
        score += 100 * cascadeDepth * multiplier;
        popped++;
        cascaded++;
      }
      removed += run;
      sfx.cascade(cascadeDepth);
      shake = Math.max(shake, 5 + cascadeDepth * 2);
      if (lockTarget && gone.includes(lockTarget)) lockTarget = null;
      i = Math.max(0, i - 2);
    } else {
      i = j + 1;
    }
  }
  return removed;
}

function popMarble(m) {
  const idx = chain.indexOf(m);
  if (idx === -1) return;
  const p = pointAtDist(m.d);
  chain.splice(idx, 1);
  pops.push({ x: p.x, y: p.y, r: R, life: 0.34, maxLife: 0.34, hue: m.hue });
  burstAt(p.x, p.y, MARBLE_COLOURS[m.hue].fill, 12);
  score += 50 * multiplier;
  popped++;
  sfx.pop();
  if (lockTarget === m) lockTarget = null;
  cascadeDepth = 0;
  settleTimer = SETTLE_TIME;
}

// ---- Effects ----
function burstAt(x, y, colour, n) {
  for (let i = 0; i < n; i++) {
    if (particles.length >= MAX_PARTICLES) return;
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 160;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 0.3 + Math.random() * 0.4, maxLife: 0.7,
      r: 2 + Math.random() * 3, colour,
    });
  }
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
  chain = []; shots = []; pops = []; particles = [];
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
    let best = null;
    for (const m of chain) {
      if (!targetable(m) || m.word[0] !== letter) continue;
      if (!best) best = m;      // chain is ordered front-first, so this is nearest the hole
    }
    if (best) { lockTarget = best; sfx.lock(); correctLetter(best); }
    else wrongLetter(letter);
  }
});

const targetable = (m) => m.lettered && m.word && !m.dead && m.d >= 0;

function noteCorrectKey() { assist.misses = 0; assist.showing = false; }

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
  fireShot(target);
  sfx.flick(Math.min(12, streak % STREAK_PER_MULT));
  if (target.typed >= target.word.length) {
    target.dead = true;              // stops further targeting; the shot finishes it
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

function gopherPos() {
  const end = pointAtDist(pathLen);
  return { x: end.x - R * 4.2, y: end.y + R * 0.4 };
}

function fireShot(target) {
  const g = gopherPos();
  gopherThrow = 0.16;
  shots.push({ x: g.x, y: g.y - R * 1.4, target, life: 3, spin: 0 });
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  if (wrongKey.t > 0) wrongKey.t -= dt;
  if (gopherThrow > 0) gopherThrow -= dt;

  const at = assist.showing ? 1 : 0;
  const ar = dt / (assist.showing ? ASSIST_FADE_IN : ASSIST_FADE_OUT);
  assist.alpha += Math.sign(at - assist.alpha) * Math.min(ar, Math.abs(at - assist.alpha));

  const L = currentLevel();

  // Feed the line in from the top while the wave still has marbles to send
  while (remaining > 0 && (chain.length === 0 || targetDist(chain.length - 1) > -SPACING * 1.5)) {
    chain.push(newMarble(L.hues));
    remaining--;
  }

  // The line only creeps while nothing is settling, so cascades read clearly
  if (settleTimer > 0) {
    settleTimer -= dt;
    if (settleTimer <= 0 && resolveMatches() > 0) settleTimer = SETTLE_TIME;
  } else {
    headDist += crawlSpeed() * dt;
  }

  // Ease each marble toward its slot; this is what makes the gap visibly close
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const want = targetDist(i);
    m.d += (want - m.d) * Math.min(1, dt * 14);
    m.spin += dt * 1.6;
    if (m.squash > 0) m.squash = Math.max(0, m.squash - dt * 4);
  }

  // Anything that reaches the end drops in
  while (chain.length && chain[0].d >= pathLen) {
    const m = chain.shift();
    if (lockTarget === m) lockTarget = null;
    burrowFill++;
    shake = 14;
    flash = 0.4;
    const p = pointAtDist(pathLen);
    burstAt(p.x, p.y, PAL.dirt, 14);
    sfx.drop();
    streak = 0;
    multiplier = 1;
    if (burrowFill >= L.burrow) { endGame("dead"); return; }
  }

  refreshLabels();
  updateShots(dt);
  updatePops(dt);
  updateParticles(dt);

  if (state === "playing" && remaining === 0 && chain.length === 0) {
    if (waveClearTimer <= 0) {
      waveClearTimer = 2.4;
      const spare = Math.max(0, L.burrow - burrowFill);
      const bonus = (200 * wave + 120 * spare) * multiplier;
      score += bonus;
      banner = { text: `WAVE ${wave} CLEARED`, sub: `+${bonus}`, life: 2.2, maxLife: 2.2 };
      sfx.wave();
    } else {
      waveClearTimer -= dt;
      if (waveClearTimer <= 0) startWave(wave + 1);
    }
  }
}

function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.life -= dt;
    s.spin += dt * 12;
    const t = s.target;
    if (!t || s.life <= 0 || !chain.includes(t)) { shots.splice(i, 1); continue; }
    const p = pointAtDist(t.d);
    const dx = p.x - s.x, dy = p.y - s.y;
    const dist = Math.hypot(dx, dy);
    const step = 900 * dt;
    if (dist <= step + R) {
      shots.splice(i, 1);
      t.squash = 1;
      if (t.dead) popMarble(t);
    } else {
      s.x += (dx / dist) * step;
      s.y += (dy / dist) * step;
    }
  }
}
function updatePops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt;
    if (p.life <= 0) pops.splice(i, 1);
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 420 * dt;          // marbles fall; this is a cartoon, gravity is loud
    p.vx *= 1 - dt * 1.2;
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
    score, wpm, acc, popped, cascaded, wave, streak: bestStreak,
    time: Math.floor(elapsed),
    difficulty: settings.difficulty, wordSet: settings.wordSet, date: Date.now(),
  };
  const worth = typedCorrect > 0;
  const rank = worth ? recordScore(entry) : -1;
  gameoverTitleEl.textContent = reason === "quit" ? "RUN ENDED" : "BURROW OVERRUN";
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Wave reached</span><span class="value">${wave}</span>
    <span class="label">Marbles popped</span><span class="value">${popped}</span>
    <span class="label">Popped by cascade</span><span class="value">${cascaded}</span>
    <span class="label">WPM</span><span class="value">${wpm}</span>
    <span class="label">Accuracy</span><span class="value">${acc}%</span>
  `;
  newBestEl.classList.toggle("hidden", rank !== 0);
  renderScoreList(worth ? entry : null);
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
let frame = 0;
function draw() {
  const t = performance.now() / 1000;
  frame++;

  // Gate weave: the frame never sat perfectly still in the projector
  const wx = (frame % 3 === 0) ? (Math.random() - 0.5) * 2 : 0;
  const wy = (frame % 3 === 0) ? (Math.random() - 0.5) * 2 : 0;
  ctx.save();
  ctx.translate(wx, wy);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawSky();
  drawSun(t);
  for (const c of clouds) drawCloud(c.x, c.y, c.s, t, c.ph);
  drawHills();
  drawTrack();
  drawHole(t);

  if (state === "playing" || state === "paused") drawGuide();

  if (state !== "menu") {
    drawChain(t);
    drawShots();
    drawPops();
    drawParticles();
    drawGopher(t);
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 240, 210, ${flash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  filmGrain(frame);
  filmLook();
  if (state !== "menu") { drawBanner(); drawHUD(); }
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  g.addColorStop(0, PAL.skyTop);
  g.addColorStop(1, PAL.skyLow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSun(t) {
  const x = W * 0.085, y = H * 0.27, r = Math.min(W, H) * 0.055;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.12);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI * 2 / 12);
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.24);
    ctx.lineTo(r * 0.16, -r * 1.62);
    ctx.lineTo(-r * 0.16, -r * 1.62);
    ctx.closePath();
    ink(PAL.sun, LW * 0.8);
  }
  ctx.restore();
  circle(x, y, r); ink(PAL.sun);
  pieEye(x - r * 0.33, y - r * 0.15, r * 0.19, 0.2, 0.1, false);
  pieEye(x + r * 0.33, y - r * 0.15, r * 0.19, 0.2, 0.1, false);
  ctx.beginPath();
  ctx.arc(x, y + r * 0.12, r * 0.4, 0.25, Math.PI - 0.25);
  ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineCap = "round"; ctx.stroke();
}

const CLOUD_BUMPS = [
  { dx: -0.62, dy: 0, r: 0.44 }, { dx: -0.16, dy: -0.24, r: 0.56 },
  { dx: 0.42, dy: -0.06, r: 0.46 }, { dx: 0.86, dy: 0.1, r: 0.34 },
];
function cloudPath(s, sq, inset) {
  ctx.beginPath();
  for (const b of CLOUD_BUMPS) {
    ctx.moveTo(b.dx * s + b.r * s * sq - inset, b.dy * s);
    ctx.arc(b.dx * s, b.dy * s, Math.max(0.5, b.r * s * sq - inset), 0, Math.PI * 2);
  }
  ctx.rect(-s * 0.62, -s * 0.02, s * 1.5, s * 0.42 - inset);
}
// Outline by filling twice: stroking the union would draw every buried arc
function drawCloud(x, y, s, t, phase) {
  const bob = Math.sin(t * 0.9 + phase) * s * 0.05;
  const sq = 1 + Math.sin(t * 1.3 + phase) * 0.04;
  ctx.save();
  ctx.translate(x, y + bob);
  cloudPath(s, sq, 0); ctx.fillStyle = INK; ctx.fill();
  cloudPath(s, sq, LW * 1.7); ctx.fillStyle = PAL.cream; ctx.fill();
  ctx.restore();
}

function drawHills() {
  const base = H * 0.7;
  for (const L of [
    { y: base - H * 0.1, c: PAL.hillFar, amp: H * 0.05, n: 3, off: 0 },
    { y: base + H * 0.02, c: PAL.hillMid, amp: H * 0.065, n: 2, off: 1.4 },
  ]) {
    ctx.beginPath();
    ctx.moveTo(-10, H + 10);
    ctx.lineTo(-10, L.y);
    const seg = (W + 20) / L.n;
    for (let i = 0; i < L.n; i++) {
      const x0 = -10 + i * seg;
      ctx.quadraticCurveTo(x0 + seg * 0.5, L.y - L.amp * (1 + 0.25 * Math.sin(i + L.off)), x0 + seg, L.y);
    }
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ink(L.c);
  }
  ctx.beginPath();
  ctx.moveTo(-10, H + 10);
  ctx.lineTo(-10, base + H * 0.11);
  ctx.quadraticCurveTo(W * 0.5, base + H * 0.05, W + 10, base + H * 0.11);
  ctx.lineTo(W + 10, H + 10);
  ctx.closePath();
  ink(PAL.hillNear);
}

function drawTrack() {
  ctx.beginPath();
  for (let i = 0; i < pathPts.length; i += 6) {
    const p = pathPts[i];
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  const last = pathPts[pathPts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.strokeStyle = INK; ctx.lineWidth = R * 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.stroke();
  ctx.strokeStyle = PAL.dirt; ctx.lineWidth = R * 2.2; ctx.stroke();
  ctx.strokeStyle = "rgba(156,106,56,0.4)"; ctx.lineWidth = R * 0.7; ctx.stroke();
}

function drawHole(t) {
  const p = pointAtDist(pathLen);
  ellipse(p.x, p.y + R * 0.3, R * 2.1, R * 1.05); ink(PAL.dirtDark);
  ellipse(p.x, p.y, R * 1.45, R * 0.78); ink("#20150E");
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, R * 1.1, R * 0.56, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.strokeStyle = "rgba(255,243,214,0.25)"; ctx.lineWidth = LW; ctx.stroke();
}

function drawMarble(x, y, r, colour, spin, squash) {
  const sx = 1 + squash * 0.22, sy = 1 - squash * 0.22;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  circle(0, 0, r); ink(colour);
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, r - LW * 0.4, 0, Math.PI * 2); ctx.clip();
  ctx.rotate(spin);
  ellipse(0, 0, r * 0.72, r * 0.3); ctx.fillStyle = PAL.cream; ctx.fill();
  ellipse(0, 0, r * 0.4, r * 0.16); ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
  ctx.restore();
  ellipse(-r * 0.34, -r * 0.38, r * 0.24, r * 0.16, -0.5);
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
  ctx.restore();
}

function drawChain(t) {
  // Back to front, so nearer marbles overlap the ones behind them
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (m.d < -R) continue;
    const p = pointAtDist(m.d);
    drawMarble(p.x, p.y, R, MARBLE_COLOURS[m.hue].fill, m.spin, m.squash);
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (!targetable(m)) continue;
    drawLabel(m, i, m === lockTarget);
  }
}

function drawLabel(m, index, locked) {
  const p = pointAtDist(m.d);
  const n = normalAtDist(m.d);
  // Alternate which side of the track the tag sits on, or they collide
  const side = index % 2 === 0 ? 1 : -1;
  const fs = Math.max(11, R * 0.62);
  ctx.font = `bold ${fs}px ${MONO}`;
  const totalW = ctx.measureText(m.word).width;
  const padX = 6, padY = 4;
  const bw = totalW + padX * 2, bh = fs + padY * 2;
  let bx = p.x + n.x * side * (R + bh * 0.75) - bw / 2;
  let by = p.y + n.y * side * (R + bh * 0.75) - bh / 2;
  bx = Math.max(4, Math.min(W - bw - 4, bx));
  by = Math.max(4, Math.min(H - bh - 4, by));

  roundRect(bx, by, bw, bh, 5);
  ink(locked ? PAL.sun : PAL.cream, LW * 0.8);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let x = bx + padX;
  const ly = by + fs + padY - 3;
  const done = m.word.slice(0, m.typed);
  const next = m.word.slice(m.typed, m.typed + 1);
  const rest = m.word.slice(m.typed + 1);
  if (done) { ctx.fillStyle = "#3E8B3E"; ctx.fillText(done, x, ly); x += ctx.measureText(done).width; }
  if (next) {
    const nw = ctx.measureText(next).width;
    if (locked) {
      ctx.fillStyle = "rgba(214,69,60,0.28)";
      roundRect(x - 2, ly - fs + 2, nw + 4, fs + 2, 3);
      ctx.fill();
    }
    ctx.fillStyle = INK; ctx.fillText(next, x, ly); x += nw;
  }
  if (rest) { ctx.fillStyle = "rgba(46,32,24,0.72)"; ctx.fillText(rest, x, ly); }
}

function drawShots() {
  for (const s of shots) drawMarble(s.x, s.y, R * 0.42, PAL.cream, s.spin, 0);
}

function drawPops() {
  for (const p of pops) {
    const k = 1 - p.life / p.maxLife;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (0.9 + k * 1.5), 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 243, 214, ${(1 - k) * 0.9})`;
    ctx.lineWidth = LW * 1.6 * (1 - k) + 0.5;
    ctx.stroke();
  }
}

function drawParticles() {
  for (const p of particles) {
    const k = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = k;
    circle(p.x, p.y, p.r);
    ctx.fillStyle = p.colour; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = LW * 0.5; ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGopher(t) {
  const g = gopherPos();
  const s = R * 2.5;
  const bob = Math.sin(t * 2.4) * s * 0.05;
  const squash = 1 + Math.sin(t * 2.4) * 0.05;
  const blink = (t % 3.4) > 3.16;
  const throwing = gopherThrow > 0;

  // Mound of fresh dirt he is standing in
  ctx.beginPath();
  ctx.moveTo(g.x - s * 1.4, g.y + s * 0.34);
  ctx.quadraticCurveTo(g.x - s, g.y - s * 0.16, g.x, g.y - s * 0.18);
  ctx.quadraticCurveTo(g.x + s, g.y - s * 0.16, g.x + s * 1.4, g.y + s * 0.34);
  ctx.closePath();
  ink(PAL.dirt);

  ctx.save();
  ctx.translate(g.x, g.y - s * 0.3 + bob);
  ellipse(0, s * 0.12, s * 0.6 * squash, s * 0.56 / squash); ink(PAL.fur);
  ellipse(0, s * 0.2, s * 0.36, s * 0.36); ink(PAL.belly, LW * 0.7);

  // Throwing arm snaps forward when a marble is flicked
  const arm = throwing ? -0.55 : Math.sin(t * 3.1) * 0.16;
  hose(s * 0.46, -s * 0.05, s * 0.95, s * 0.2 + arm * s, s * 1.0, s * 0.28 + arm * s * 1.4, s * 0.16, PAL.fur);
  hose(-s * 0.46, -s * 0.05, -s * 0.92, s * 0.28, -s * 0.86, s * 0.36, s * 0.16, PAL.fur);
  circle(s * 1.02, s * 0.32 + arm * s * 1.4, s * 0.19); ink(PAL.white, LW * 0.85);
  circle(-s * 0.88, s * 0.4, s * 0.19); ink(PAL.white, LW * 0.85);

  ellipse(0, -s * 0.62, s * 0.6 / squash, s * 0.55 * squash); ink(PAL.fur);
  circle(-s * 0.5, -s * 1.0, s * 0.18); ink(PAL.furDark, LW * 0.85);
  circle(s * 0.5, -s * 1.0, s * 0.18); ink(PAL.furDark, LW * 0.85);
  const look = Math.sin(t * 0.7);
  pieEye(-s * 0.23, -s * 0.74, s * 0.18, look, -0.1, blink);
  pieEye(s * 0.23, -s * 0.74, s * 0.18, look, -0.1, blink);
  ellipse(0, -s * 0.4, s * 0.33, s * 0.24); ink(PAL.belly, LW * 0.85);
  ellipse(0, -s * 0.5, s * 0.1, s * 0.08); ink(INK, LW * 0.6);
  roundRect(-s * 0.13, -s * 0.38, s * 0.11, s * 0.19, s * 0.03); ink(PAL.white, LW * 0.7);
  roundRect(s * 0.02, -s * 0.38, s * 0.11, s * 0.19, s * 0.03); ink(PAL.white, LW * 0.7);
  ctx.strokeStyle = INK; ctx.lineWidth = LW * 0.55; ctx.lineCap = "round";
  for (let i = -1; i <= 1; i++) for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * s * 0.27, -s * 0.44 + i * s * 0.08);
    ctx.quadraticCurveTo(dir * s * 0.52, -s * 0.48 + i * s * 0.12, dir * s * 0.68, -s * 0.44 + i * s * 0.15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuide() {
  const b = guideBox();
  if (!b.on) return;
  const vis = guideVisibility();
  const opts = { next: null, options: [] };
  if (lockTarget) opts.next = lockTarget.word[lockTarget.typed] || null;
  else for (const m of chain) if (targetable(m)) opts.options.push(m.word[0]);
  drawKeyboardGuide(ctx, {
    x: b.x, y: b.y, width: b.w,
    next: opts.next, options: opts.options,
    showSpace: false,
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: Math.max(0, wrongKey.t / WRONG_FLASH) * vis,
    opacity: 0.15 * vis, highlight: 0.8 * vis, mono: MONO,
  });
}

// Cartoon title cards: cream lettering with a heavy ink shadow
function cardText(text, x, y, size, fill) {
  ctx.font = `bold ${size}px ${MONO}`;
  ctx.lineJoin = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * 0.22;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawBanner() {
  if (!banner) return;
  const k = banner.life / banner.maxLife;
  const alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.35);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textAlign = "center";
  cardText(banner.text, W / 2, H * 0.34, Math.min(46, W * 0.06), PAL.sun);
  cardText(banner.sub, W / 2, H * 0.34 + 30, Math.min(16, W * 0.022), PAL.cream);
  ctx.restore();
  ctx.textAlign = "left";
}

function drawHUD() {
  const pad = 20;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  cardText(String(score), pad, 44, 30, PAL.sun);
  ctx.font = `600 12px ${MONO}`;
  ctx.fillStyle = "rgba(46,32,24,0.75)";
  ctx.fillText("SCORE", pad + 2, 58);

  if (multiplier > 1 || streak > 0) {
    cardText(`x${multiplier}`, pad, 84, 16, multiplier > 1 ? PAL.red : PAL.cream);
    const bx = pad + 40, bw = 90, bh = 6, by = 74;
    const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
    roundRect(bx, by, bw, bh, 3); ink("rgba(255,243,214,0.35)", LW * 0.5);
    roundRect(bx, by, Math.max(2, bw * into), bh, 3); ink(PAL.red, LW * 0.5);
  }

  ctx.textAlign = "center";
  cardText(`WAVE ${Math.max(1, wave)}`, W / 2, 40, 20, PAL.cream);

  // How full the burrow is: marbles the gopher has already let through
  const L = currentLevel();
  ctx.textAlign = "right";
  cardText("BURROW", W - pad, 30, 13, PAL.cream);
  const cw = 15, gap = 5;
  for (let i = 0; i < L.burrow; i++) {
    const x = W - pad - (L.burrow - 1 - i) * (cw + gap) - cw / 2;
    circle(x, 48, cw * 0.45);
    ink(i < burrowFill ? PAL.red : "rgba(255,243,214,0.28)", LW * 0.7);
  }

  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.textAlign = "left";
  cardText(`WPM ${wpm}   ACC ${acc}%   ${currentLevel().label}   ${currentWordSet().label.toUpperCase()}`,
           pad, H - 18, 13, PAL.cream);
  ctx.textAlign = "right";
  cardText("ESC  pause / settings", W - pad, H - 18, 13, "rgba(255,243,214,0.7)");
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
    ? `Best on ${currentLevel().label}: ${best.score}  (wave ${best.wave || 1}, ${best.wpm} wpm)` : "";
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
  saveSettings(); syncSettingsUI();
  if (settings.musicOn) { ensureAudio(); startMusic(); } else stopMusic();
});
musicVolEl.addEventListener("input", () => {
  settings.musicVol = Number(musicVolEl.value);
  saveSettings(); applyVolumes(); musicVolNumEl.textContent = settings.musicVol;
});
sfxVolEl.addEventListener("input", () => {
  settings.sfxVol = Number(sfxVolEl.value);
  saveSettings(); applyVolumes(); sfxVolNumEl.textContent = settings.sfxVol;
  sfx.flick();
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
// Hybrid scheduler: rAF when it's firing, setTimeout fallback for occluded
// views where rAF is throttled. The dt clamp keeps time from jumping.
let lastTime = performance.now();
let rafId = 0, fallbackId = 0;
function loop(now) {
  cancelAnimationFrame(rafId);
  clearTimeout(fallbackId);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (state === "playing") update(dt);
  draw();
  rafId = requestAnimationFrame(loop);
  fallbackId = setTimeout(() => loop(performance.now()), 50);
}
loop(performance.now());
