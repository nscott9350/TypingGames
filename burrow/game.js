// ============================================================
// Burrow — Gopher vs. Ants
//
// A column of ants marches down a garden path toward the gopher's burrow.
// Typing an ant's word sends a berry after it, and the column closes the gap —
// if that brings three of a colour together they go too, which can cascade.
// So the fastest ant to type is rarely the right one: the game is read before
// it is reflex.
//
// All art is drawn from the supplied sheets; see sprites.js for how they are
// keyed to transparency at load.
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
const SPACING_MUL = 1.62;     // ant spacing as a multiple of body radius
const SETTLE_TIME = 0.2;      // pause after a pop so the gap visibly closes
const MAX_PARTICLES = 600;
// How many ants nearest the burrow carry word tags. This is the game's real
// choice dial: a cascade needs a gap that joins a pair to a single, and at a
// window of 4 one is on offer only 31% of the time, so most turns collapse to
// "take the front ant". Measured at a learner's pace, widening the window
// raises that to 38% at 5, 44% at 6 and 49% at 7, flattening out after that.
// It is capped by the word set — every visible word needs its own first letter,
// and the home row only offers eight — but letteredCount() clamps for that.
const CASCADE_SEED = 0.5;     // chance a new ant is placed to set up a cascade
const STAGE_AR = 1672 / 941;  // the background painting's aspect ratio
const MAX_WORD = 7;           // longest practice word a bloomed tag will carry
const LIVES_START = 3;
// After the last life goes, the column is allowed to finish its march into the
// burrow before the summary appears. Losing is the ants' moment; cutting
// straight to a stats panel throws it away.
// They set off at a walk and build to a stampede: a full column at a flat
// multiple of the crawl would take a quarter of a minute to file in, which
// stops being a flourish and starts being a wait.
const OVERRUN_RUSH = 2.6;     // multiple of the crawl the moment the last life goes
const OVERRUN_RAMP = 1.6;     // added multiple per second after that
const OVERRUN_HOLD = 0.8;     // beat after the final ant is in
const OVERRUN_MAX = 7;        // cap, so a very long column cannot stall the screen
const STREAK_PER_MULT = 20;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;
const ASSIST_MISSES = 3;
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;

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
// `crawl` is path pixels per second, `load` the ants in a level, `hues` how many
// colours are in play (fewer colours means easier cascades), `hole` how many
// ants the burrow absorbs before it gives out and costs a life, and `words` how
// many ants carry a tag at once. Beginners get fewer to scan; the harder levels
// get more, which is more to read but more room to hunt a cascade in.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", crawl: [13, 24], load: [22, 34], hues: 4, hole: 6, words: 8 },
  easy:     { label: "EASY",     crawl: [17, 31], load: [26, 42], hues: 4, hole: 5, words: 9 },
  normal:   { label: "NORMAL",   crawl: [22, 41], load: [30, 50], hues: 5, hole: 4, words: 10 },
  hard:     { label: "HARD",     crawl: [28, 52], load: [36, 58], hues: 5, hole: 3, words: 11 },
  master:   { label: "MASTER",   crawl: [35, 64], load: [42, 66], hues: 6, hole: 3, words: 12 },
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

// ---- Stage and path -------------------------------------------------------
// The background is a finished painting, so the whole playfield is letterboxed
// to its aspect ratio and everything is positioned in fractions of it. Cropping
// to fill would cut off part of the route the ants have to walk.
let stage = { x: 0, y: 0, w: 0, h: 0 };
let hud = null;

function layoutStage() {
  const winAR = W / H;
  if (winAR > STAGE_AR) {
    stage.h = H; stage.w = H * STAGE_AR;
  } else {
    stage.w = W; stage.h = W / STAGE_AR;
  }
  stage.x = (W - stage.w) / 2;
  stage.y = (H - stage.h) / 2;
}

// Traced from background.png by sampling the painting for trail pixels — dirt
// reads green/red ~0.68 against grass at ~0.93, which separates them cleanly.
// The march starts at the painted anthill in the top-left corner and ends at
// the mouth of the burrow, so the ants are always walking somewhere the
// picture says they can walk.
const ROUTE = [
  [0.118, 0.176], [0.170, 0.180], [0.227, 0.181], [0.290, 0.172], [0.352, 0.164],
  [0.415, 0.161], [0.477, 0.164], [0.530, 0.170], [0.570, 0.181], [0.607, 0.208],
  [0.625, 0.236], [0.630, 0.272], [0.633, 0.306], [0.650, 0.340], [0.672, 0.364],
  [0.715, 0.366], [0.758, 0.367], [0.805, 0.371], [0.852, 0.375], [0.882, 0.393],
  [0.898, 0.417], [0.900, 0.452], [0.898, 0.486], [0.885, 0.516], [0.867, 0.542],
  [0.842, 0.568], [0.820, 0.597], [0.814, 0.637], [0.813, 0.675], [0.788, 0.693],
  [0.758, 0.697], [0.726, 0.684], [0.695, 0.667], [0.671, 0.646], [0.648, 0.625],
  [0.617, 0.612], [0.586, 0.603], [0.543, 0.599], [0.500, 0.597], [0.460, 0.601],
  [0.420, 0.606], [0.386, 0.610], [0.352, 0.614], [0.332, 0.578], [0.313, 0.542],
  [0.293, 0.514], [0.273, 0.486], [0.234, 0.468], [0.195, 0.453], [0.156, 0.454],
  [0.117, 0.458], [0.096, 0.478], [0.078, 0.500], [0.072, 0.535], [0.070, 0.569],
  [0.084, 0.600], [0.102, 0.625], [0.137, 0.633], [0.172, 0.642], [0.200, 0.660],
  [0.227, 0.681], [0.243, 0.708], [0.258, 0.736], [0.270, 0.768], [0.281, 0.800],
  [0.308, 0.808], [0.336, 0.814], [0.375, 0.828], [0.414, 0.842], [0.453, 0.851],
  [0.500, 0.855],
];

let pathPts = [], pathLen = 0;

function buildPath() {
  const P = ROUTE.map(([fx, fy]) => [stage.x + fx * stage.w, stage.y + fy * stage.h]);
  // Catmull-Rom so the ants ride a smooth curve rather than hinge at each point
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
    const steps = 22;
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
      ]);
    }
  }
  pts.push(P[P.length - 1]);

  pathPts = [];
  let acc = 0;
  pathPts.push({ x: pts[0][0], y: pts[0][1], d: 0 });
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
    pathPts.push({ x: pts[i][0], y: pts[i][1], d: acc });
  }
  pathLen = acc;
}

function pointAtDist(d) {
  if (d <= 0) return { ...pathPts[0] };
  if (d >= pathLen) return { ...pathPts[pathPts.length - 1] };
  let lo = 0, hi = pathPts.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (pathPts[mid].d < d) lo = mid; else hi = mid;
  }
  const a = pathPts[lo], b = pathPts[hi];
  const f = (d - a.d) / Math.max(1e-6, b.d - a.d);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function headingAtDist(d) {
  const a = pointAtDist(Math.max(0, d - 8));
  const b = pointAtDist(Math.min(pathLen, d + 8));
  return { x: b.x - a.x, y: b.y - a.y };
}

function normalAtDist(d) {
  const h = headingAtDist(d);
  const len = Math.hypot(h.x, h.y) || 1;
  return { x: -h.y / len, y: h.x / len };
}

function resize() {
  const prevW = stage.w;
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const prevX = stage.x, prevY = stage.y;
  layoutStage();
  LW = Math.max(2, stage.h * 0.005);
  R = Math.max(11, stage.h * 0.038);      // ant body radius, tuned to the art
  SPACING = R * SPACING_MUL;
  buildPath();
  layoutHud();
  carryAcrossResize(prevW, prevX, prevY);
}

// Everything in flight is stored in pixels — the column as distance along the
// path, berries and debris as screen coordinates — and resize rebuilds the path
// at the new size. Left alone, the stored numbers mean something different
// afterwards: an ant a third of the way along a 3000px path is suddenly half
// way along a 2000px one, so the whole column jumps up the trail as the window
// is dragged. Carrying the state across keeps every ant where it was, which is
// what the player sees.
//
// One factor does for all of it. The stage is letterboxed to a fixed aspect
// ratio and the route is expressed in fractions of it, so the path length
// scales exactly with the stage width.
function carryAcrossResize(prevW, prevX, prevY) {
  if (!prevW || !stage.w || !chain) return;
  const k = stage.w / prevW;
  if (k === 1) return;

  headDist *= k;
  for (const m of chain) m.d *= k;

  // Loose objects hold screen coordinates, so they travel with the stage as
  // well as scale with it.
  const move = (o) => {
    o.x = stage.x + (o.x - prevX) * k;
    o.y = stage.y + (o.y - prevY) * k;
    if (o.dx !== undefined) { o.dx *= k; o.dy *= k; }
    if (o.vx !== undefined) { o.vx *= k; o.vy *= k; }
    if (o.r !== undefined) o.r *= k;
  };
  shots.forEach(move);
  pops.forEach(move);
  particles.forEach(move);
  bursts.forEach(move);
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
let headDist, remaining, settleTimer, cascadeDepth, bursts, antSeq;
let score, elapsed, wave, waveClearTimer, holeFill, lives;
let shake, flash, banner, overrun;
let typedCorrect, typedWrong, popped, cascaded, streak, bestStreak, multiplier;
let wrongKey, assist, gopherThrow;

function resetGame() {
  chain = [];
  shots = [];
  pops = [];
  particles = [];
  bursts = [];
  antSeq = 0;
  overrun = null;
  lockTarget = null;
  headDist = 0;
  remaining = 0;
  settleTimer = 0;
  cascadeDepth = 0;
  score = 0;
  elapsed = 0;
  wave = 0;
  waveClearTimer = 0;
  holeFill = 0;
  lives = LIVES_START;
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
// Only the ants nearest the burrow carry words, and each is given one as it
// enters that window. Colour is fixed from birth, so a cascade can be planned
// on the whole line while targeting stays unambiguous among the few that count.
function distinctFirstLetters() {
  const pools = currentWordSet().pools;
  const s = new Set();
  for (const w of pools.short || []) s.add(w[0]);
  for (const w of pools.medium || []) s.add(w[0]);
  return s.size;
}
const letteredCount = () => Math.min(currentLevel().words, distinctFirstLetters());

function pickWord(used) {
  const pools = currentWordSet().pools;
  // Only the locked ant spells itself out now, so a word no longer has to fit
  // in the gap between two ants and the five-letter cap can go. Short and
  // medium are drawn from one pool rather than short-first, or nearly every
  // target comes out three letters long and there is little to practise.
  const pool = (pools.short || []).concat(pools.medium || [])
                 .filter(w => w.length <= MAX_WORD);
  const cands = pool.filter(w => !used.has(w[0]));
  if (!cands.length) {
    // Out of unused first letters: better to label fewer ants than to put two
    // words starting with the same key on the board.
    return null;
  }
  // Weighted by length, because the sets hold far more short words than long
  // ones and sampling them flat leaves seven targets in ten at three or four
  // letters — barely practice, and a waste of the room the badges just freed.
  let total = 0;
  for (const w of cands) total += w.length * w.length;
  let r = Math.random() * total;
  for (const w of cands) { r -= w.length * w.length; if (r <= 0) return w; }
  return cands[cands.length - 1];
}

function refreshLabels() {
  const n = letteredCount();
  const used = new Set();
  let assigned = 0;
  for (let i = 0; i < chain.length && assigned < n; i++) {
    const m = chain[i];
    if (m.dead || m.d < 0) continue;
    if (!m.word) m.word = pickWord(used);
    if (!m.word) break;
    used.add(m.word[0]);
    m.lettered = true;
    assigned++;
  }
  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    if (!used.has(m.word ? m.word[0] : "") || m.d < 0) {
      // ants beyond the window keep their colour but lose their label
      if (m.lettered && !(m.word && used.has(m.word[0]))) m.lettered = false;
    }
  }
}

// ---- Chain ----
function targetDist(i) { return headDist - i * SPACING; }

function newAnt(hues) {
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
    // Which side of the trail this ant's badge sits on. Fixed when it spawns:
    // taking it from the chain index instead made every badge hop across the
    // path each time an ant ahead of it was taken.
    tagSide: (antSeq++ % 2) ? 1 : -1,
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
  banner = { text: `LEVEL ${n}`, sub: `${remaining} ANTS MARCHING`, life: 2.0, maxLife: 2.0 };
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
        pops.push({ x: p.x, y: p.y, r: R, life: 0.4, maxLife: 0.4, hue: m.hue, variant: (Math.random()*4)|0 });
        burstAt(p.x, p.y, ANT_TINT[m.hue], 10);
        score += 100 * cascadeDepth * multiplier;
        popped++;
        cascaded++;
      }
      removed += run;
      const mid = pointAtDist(gone[(gone.length / 2) | 0].d);
      bursts.push({ x: mid.x, y: mid.y, life: 0.8, maxLife: 0.8, depth: cascadeDepth });
      sfx.cascade(cascadeDepth);
      setMood("gopherCheer", 0.9);
      shake = Math.max(shake, 5 + cascadeDepth * 2);
      if (lockTarget && gone.includes(lockTarget)) lockTarget = null;
      i = Math.max(0, i - 2);
    } else {
      i = j + 1;
    }
  }
  return removed;
}

function popAnt(m) {
  const idx = chain.indexOf(m);
  if (idx === -1) return;
  const p = pointAtDist(m.d);
  chain.splice(idx, 1);
  pops.push({ x: p.x, y: p.y, r: R, life: 0.4, maxLife: 0.4, hue: m.hue, variant: (Math.random()*4)|0 });
  burstAt(p.x, p.y, ANT_TINT[m.hue], 12);
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

// Stationed on the far side of the burrow from the ants, so the hole he is
// defending sits between him and the column rather than behind him. At 0.40 he
// stood on the final approach itself, with his back to everything coming.
function gopherPos() {
  return { x: stage.x + stage.w * 0.605, y: stage.y + stage.h * 0.818 };
}

// He faces whatever he is aiming at, which is almost always up the trail to his
// left; early in a wave, when the column is still coming around the far side,
// he turns to watch it. The sprite is drawn facing right, so facing left is a
// mirror.
function gopherFacing() {
  const t = lockTarget || chain[0];
  if (!t) return true;
  return pointAtDist(t.d).x < gopherPos().x;
}

// Where the peashooter's mouth sits inside the gopherShoot frame, measured off
// the sheet. Berries leave from here rather than from a fixed offset beside
// him, so the shot comes out of the barrel whichever way he is turned.
const MUZZLE = { fx: 0.95, fy: 0.433 };

function muzzlePos() {
  const g = gopherPos();
  const h = gopherDrawH("gopherShoot");
  const w = h * Sprites.frameAspect("gopherShoot");
  const fx = gopherFacing() ? 1 - MUZZLE.fx : MUZZLE.fx;
  return { x: g.x - w / 2 + fx * w, y: g.y - h + MUZZLE.fy * h };
}

function fireShot(target) {
  const m = muzzlePos();
  gopherThrow = 0.16;
  setMood("gopherShoot", 0.32);
  shots.push({ x: m.x, y: m.y, target,
               life: 3, spin: 0, hue: target.hue, dx: 0, dy: 0 });
}

// The last life is gone, but the ants still on the trail have not arrived yet.
// Hand the level over to them: stop the spawns, stop taking input, and let the
// column walk itself into the burrow before the summary comes up.
function beginOverrun() {
  if (state === "overrun") return;
  state = "overrun";
  overrun = { t: 0, hold: OVERRUN_HOLD };
  remaining = 0;
  lockTarget = null;
  settleTimer = 0;
  // Nothing left to type: drop the keys so the trail stops offering a move
  // that no longer exists.
  for (const m of chain) m.lettered = false;
  banner = { text: "OVERRUN", sub: "THE BURROW IS LOST", life: 2.6, maxLife: 2.6 };
  setMood("gopherAlert", OVERRUN_MAX);
}

// ---- Update ----
function update(dt) {
  elapsed += dt;
  if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
  for (let i = bursts.length - 1; i >= 0; i--) {
    bursts[i].life -= dt;
    if (bursts[i].life <= 0) bursts.splice(i, 1);
  }
  if (shake > 0) shake = Math.max(0, shake - dt * 20);
  if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
  if (wrongKey.t > 0) wrongKey.t -= dt;
  if (gopherThrow > 0) gopherThrow -= dt;
  if (gopherMood.t > 0) {
    gopherMood.t -= dt;
    if (gopherMood.t <= 0) gopherMood.pose = "gopherIdle";
  } else {
    // Wide-eyed once the leading ant is close to getting in
    const lead = chain.length ? chain[0].d / pathLen : 0;
    gopherMood.pose = lead > 0.86 ? "gopherAlert" : "gopherIdle";
  }

  const at = assist.showing ? 1 : 0;
  const ar = dt / (assist.showing ? ASSIST_FADE_IN : ASSIST_FADE_OUT);
  assist.alpha += Math.sign(at - assist.alpha) * Math.min(ar, Math.abs(at - assist.alpha));

  const L = currentLevel();

  if (state === "overrun") {
    overrun.t += dt;
    // Empty trail, or taking too long: let the summary come up.
    if (!chain.length || overrun.t > OVERRUN_MAX) {
      overrun.hold -= dt;
      if (overrun.hold <= 0) { endGame("dead"); return; }
    }
  }

  // Feed the column in from the anthill while the wave still has ants to send
  while (state === "playing" && remaining > 0 &&
         (chain.length === 0 || targetDist(chain.length - 1) > -SPACING * 1.5)) {
    chain.push(newAnt(L.hues));
    remaining--;
  }

  // The line only creeps while nothing is settling, so cascades read clearly
  if (settleTimer > 0) {
    settleTimer -= dt;
    if (settleTimer <= 0 && resolveMatches() > 0) settleTimer = SETTLE_TIME;
  } else {
    headDist += crawlSpeed() * dt;
  }

  if (state === "overrun") {
    // There are no slots to close up to any more, so the column simply walks
    // in keeping the spacing it had. Easing toward index-based slots would
    // collapse the whole queue forward the moment the front ant dropped in and
    // thirty ants would vanish inside a second, which is not them getting in —
    // it is them disappearing.
    const v = crawlSpeed() * OVERRUN_RUSH * (1 + overrun.t * OVERRUN_RAMP);
    for (const m of chain) {
      m.d += v * dt;
      m.spin += dt * 3.2;                     // scurrying, not strolling
      if (m.squash > 0) m.squash = Math.max(0, m.squash - dt * 4);
    }
  } else {
    // Ease each ant toward its slot; this is what makes the gap visibly close
    for (let i = 0; i < chain.length; i++) {
      const m = chain[i];
      const want = targetDist(i);
      m.d += (want - m.d) * Math.min(1, dt * 14);
      m.spin += dt * 1.6;
      if (m.squash > 0) m.squash = Math.max(0, m.squash - dt * 4);
    }
  }

  // Anything that reaches the end drops in
  while (chain.length && chain[0].d >= pathLen) {
    const m = chain.shift();
    if (lockTarget === m) lockTarget = null;
    holeFill++;
    shake = 12;
    flash = 0.35;
    const p = pointAtDist(pathLen);
    burstAt(p.x, p.y, "#B8813F", 14);
    sfx.drop();
    streak = 0;
    multiplier = 1;
    // The burrow absorbs a few before it gives out, and that costs a life.
    // During the overrun there is nothing left to lose, so the arrivals are
    // just arrivals.
    if (state === "overrun") continue;
    if (holeFill >= L.hole) {
      holeFill = 0;
      lives--;
      shake = 22;
      flash = 0.6;
      sfx.overrun();
      if (lives <= 0) { beginOverrun(); return; }
    }
  }

  if (state === "playing") refreshLabels();
  updateShots(dt);
  updatePops(dt);
  updateParticles(dt);

  if (state === "playing" && remaining === 0 && chain.length === 0) {
    if (waveClearTimer <= 0) {
      waveClearTimer = 2.4;
      const spare = Math.max(0, L.hole - holeFill);
      const bonus = (200 * wave + 120 * spare) * multiplier;
      score += bonus;
      banner = { text: `LEVEL ${wave} HELD`, sub: `+${bonus}`, life: 2.2, maxLife: 2.2 };
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
      if (t.dead) popAnt(t);
    } else {
      s.dx = (dx / dist) * step;
      s.dy = (dy / dist) * step;
      s.x += s.dx;
      s.y += s.dy;
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
    p.vy += 420 * dt;          // debris falls; this is a cartoon, gravity is loud
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
    score, wpm, acc, popped, cascaded, wave, streak: bestStreak, lives,
    time: Math.floor(elapsed),
    difficulty: settings.difficulty, wordSet: settings.wordSet, date: Date.now(),
  };
  const worth = typedCorrect > 0;
  const rank = worth ? recordScore(entry) : -1;
  gameoverTitleEl.textContent = reason === "quit" ? "RUN ENDED" : "THE ANTS GOT IN";
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Wave reached</span><span class="value">${wave}</span>
    <span class="label">Ants stopped</span><span class="value">${popped}</span>
    <span class="label">Caught in cascades</span><span class="value">${cascaded}</span>
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
const UI_CREAM = "#F6E7C3";
// Plate colours sampled from assets.png, used to blank the specimen values the
// panels ship with before the live figures are drawn over them.
const SCORE_PLATE = "#FBDCAA";
const LEVEL_PLATE = "#FADCAC";
const COMBO_BADGE = "#301405";
const UI_INK = "#5C4326";

let gopherMood = { pose: "gopherIdle", t: 0 };
function setMood(pose, secs) {
  // Cheering outranks everything; nothing should interrupt a cascade grin
  if (gopherMood.t > 0 && gopherMood.pose === "gopherCheer" && pose !== "gopherCheer") return;
  gopherMood.pose = pose;
  gopherMood.t = secs;
}

function draw(dt) {
  ctx.fillStyle = "#20361C";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  // The painting is the playfield; everything else sits on top of it
  const bg = Sprites.images.bg;
  if (bg) ctx.drawImage(bg, stage.x, stage.y, stage.w, stage.h);
  else { ctx.fillStyle = "#8CC63F"; ctx.fillRect(stage.x, stage.y, stage.w, stage.h); }

  if (state === "playing" || state === "paused") drawGuide();

  if (state !== "menu") {
    drawColumn();
    drawBerries();
    drawGopher();
    drawPops();
    drawParticles();
    drawBursts();
  }
  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 246, 214, ${flash * 0.45})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (state !== "menu") { drawHUD(); drawBanner(); }
}

// Ants walk the painted route, facing the way they are going
function drawColumn() {
  const antH = R * 2.5;
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (m.d < -R * 2) continue;
    const p = pointAtDist(m.d);
    const head = headingAtDist(m.d);
    // Sheet art faces left, so mirror when the route runs right
    const flip = head.x > 0;
    const bob = Math.sin(m.spin * 6) * antH * 0.03;
    const squash = 1 + m.squash * 0.18;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.scale(1, squash);
    ctx.translate(-p.x, -(p.y + bob));
    Sprites.draw(ctx, "ant" + (m.hue % 6), p.x, p.y + bob, antH, flip);
    ctx.restore();
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const m = chain[i];
    if (targetable(m) && m !== lockTarget) drawLetterBadge(m);
  }
  // The locked word goes last so it sits over everything, and it is the only
  // full word on the trail.
  if (lockTarget && targetable(lockTarget)) drawWordTag(lockTarget);
}

// One letter per addressable ant — the key that locks it.
//
// A word beside every ant needed about 53px against the 26px of trail the ants
// leave between them, so the tags overlapped their neighbours and only six
// could be shown at all. A single glyph fits that gap, which is what lets ten
// or twelve ants be addressable at once and lets the words themselves get long
// enough to be worth typing.
function drawLetterBadge(m) {
  const p = pointAtDist(m.d);
  const n = normalAtDist(m.d);
  const r = R * 0.6;
  const off = R * 1.5;
  // Prefer the ant's own side, but flip to the other if the panels are in the
  // way there — the top of the trail runs beneath the score and combo.
  const at = (side) => ({ x: p.x + n.x * side * off - r, y: p.y + n.y * side * off - r,
                          w: r * 2, h: r * 2 });
  let box = at(m.tagSide);
  if (hitsHud(box)) {
    const other = at(-m.tagSide);
    box = hitsHud(other) ? pushClearOfHud(box) : other;
  }
  const cx = Math.max(stage.x + r, Math.min(stage.x + stage.w - r, box.x + r));
  const cy = Math.max(stage.y + r, Math.min(stage.y + stage.h - r, box.y + r));

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetY = r * 0.16;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = UI_CREAM;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#B99A63";
  ctx.lineWidth = Math.max(1.3, r * 0.14);
  ctx.stroke();

  ctx.font = `bold ${Math.round(r * 1.3)}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = UI_INK;
  ctx.fillText(m.word[0].toUpperCase(), cx, cy + r * 0.06);
}

// A speech bubble drawn to match the sheet's tag, but sized to the word.
// Lays down a rounded-rect path; the caller decides whether to fill or stroke.
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// The sheet's tag has "ant" baked into it, so it cannot be reused directly.
function drawWordTag(m) {
  const locked = true;
  const p = pointAtDist(m.d);
  const n = normalAtDist(m.d);
  const side = m.tagSide;
  // Alone on the trail now, so it can be read at a glance from wherever the
  // eye already is rather than sized to avoid its neighbours.
  const fs = Math.max(15, R * 0.86);
  ctx.font = `bold ${fs}px ${MONO}`;
  const tw = ctx.measureText(m.word).width;
  const padX = fs * 0.55, padY = fs * 0.38;
  const bw = tw + padX * 2, bh = fs + padY * 2;
  const off = R * 1.7 + bh * 0.5;
  // Same dodge as the badges, and it matters more here: this is the word the
  // player is actually typing, so it must never end up behind a panel.
  const at = (sd) => ({ x: p.x + n.x * sd * off - bw / 2, y: p.y + n.y * sd * off - bh / 2,
                        w: bw, h: bh });
  let box = at(side);
  if (hitsHud(box)) {
    const other = at(-side);
    box = hitsHud(other) ? pushClearOfHud(box) : other;
  }
  let bx = Math.max(stage.x + 4, Math.min(stage.x + stage.w - bw - 4, box.x));
  let by = Math.max(stage.y + 4, Math.min(stage.y + stage.h - bh - 4, box.y));

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)";
  ctx.shadowBlur = fs * 0.35;
  ctx.shadowOffsetY = fs * 0.12;
  roundRect(bx, by, bw, bh, bh * 0.32);
  ctx.fillStyle = locked ? "#FFF0BC" : UI_CREAM;
  ctx.fill();
  ctx.restore();

  // Tail pointing back at the ant it belongs to
  const cx = bx + bw / 2, cy = by + bh / 2;
  const a = Math.atan2(p.y - cy, p.x - cx);
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a - 0.42) * bh * 0.44, cy + Math.sin(a - 0.42) * bh * 0.44);
  ctx.lineTo(p.x - Math.cos(a) * R * 0.7, p.y - Math.sin(a) * R * 0.7);
  ctx.lineTo(cx + Math.cos(a + 0.42) * bh * 0.44, cy + Math.sin(a + 0.42) * bh * 0.44);
  ctx.closePath();
  ctx.fillStyle = locked ? "#FFF0BC" : UI_CREAM;
  ctx.fill();

  roundRect(bx, by, bw, bh, bh * 0.32);
  ctx.strokeStyle = locked ? "#C8912B" : "#B99A63";
  ctx.lineWidth = Math.max(1.6, fs * 0.11);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let x = bx + padX;
  const ly = by + fs + padY - fs * 0.2;
  const done = m.word.slice(0, m.typed);
  const next = m.word.slice(m.typed, m.typed + 1);
  const rest = m.word.slice(m.typed + 1);
  if (done) { ctx.fillStyle = "#4C9A2A"; ctx.fillText(done, x, ly); x += ctx.measureText(done).width; }
  if (next) {
    const nw = ctx.measureText(next).width;
    if (locked) {
      ctx.fillStyle = "rgba(216,53,42,0.22)";
      roundRect(x - 2, ly - fs + 2, nw + 4, fs + 2, 3);
      ctx.fill();
    }
    ctx.fillStyle = UI_INK; ctx.fillText(next, x, ly); x += nw;
  }
  if (rest) { ctx.fillStyle = "rgba(92,67,38,0.72)"; ctx.fillText(rest, x, ly); }
}

function drawBerries() {
  for (const b of shots) {
    // A little spark trail so the shot reads at speed
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#FFE9A8";
    ctx.lineWidth = R * 0.14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(b.x - (b.dx || 0) * 0.05, b.y - (b.dy || 0) * 0.05);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
    Sprites.draw(ctx, "berry" + ((b.hue ?? 0) % 6), b.x, b.y, R * 1.15);
  }
}

// gopherIdle's frame height. All four poses are drawn at one scale on the
// sheet and cropped tight, so their frame heights differ by how tall the pose
// itself is — crouched to aim is shorter, jumping to cheer is taller. Scaling
// every pose to the same target height would make him swell and shrink as he
// changed pose; scaling relative to this keeps him one size.
const GOPHER_REF_H = 329;

function gopherDrawH(pose) {
  const f = Sprites.frames[pose];
  const base = stage.h * 0.23;
  return f ? base * (f.h / GOPHER_REF_H) : base;
}

function drawGopher() {
  const g = gopherPos();
  const h = gopherDrawH(gopherMood.pose);
  Sprites.draw(ctx, gopherMood.pose, g.x, g.y - h * 0.5, h, gopherFacing());
}

function drawPops() {
  for (const p of pops) {
    const k = 1 - p.life / p.maxLife;
    const puff = ["puffA", "puffB", "puffC", "puffStars"][p.variant % 4];
    Sprites.draw(ctx, puff, p.x, p.y, R * (2.2 + k * 1.9), false, Math.max(0, 1 - k));
  }
}

// The sheet's starburst, fired over the middle of a run that just cleared.
// It pops up quickly and drifts as it fades, so a cascade is visible where it
// happened rather than only as a number in the corner.
function drawBursts() {
  for (const b of bursts) {
    const k = 1 - b.life / b.maxLife;
    const rise = k * R * 1.6;
    const scale = 0.7 + Math.min(1, k * 4) * 0.45 + Math.min(1, b.depth / 4) * 0.3;
    const h = R * 3.2 * scale;
    const w = h * Sprites.frameAspect("comboBurst");
    // A cascade near the anthill or the burrow would otherwise fire half
    // off-stage, which is exactly when the player most wants to see it.
    const x = Math.max(stage.x + w / 2, Math.min(stage.x + stage.w - w / 2, b.x));
    const y = Math.max(stage.y + h / 2, Math.min(stage.y + stage.h - h / 2, b.y - rise));
    Sprites.draw(ctx, "comboBurst", x, y, h, false,
                 Math.min(1, b.life / (b.maxLife * 0.45)));
  }
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (const p of particles) {
    const k = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.colour;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
    // The other three games lay the guide over near-black space, where a faint
    // white reads cleanly. Here it sits over a sunlit painting, so it is drawn
    // in dark ink and carried a little heavier — white at 16% simply vanishes
    // into the grass, and a busy background swallows a light touch besides.
    ink: "36,24,10",
    opacity: 0.26 * vis, highlight: 0.95 * vis, mono: MONO,
  });
}

// ---- HUD ----
// Panels come from the sheet, but each ships with a value painted into it, so
// the live figure is drawn over a patch of the panel's own cream.
function panelText(text, x, y, size, colour, align = "center") {
  ctx.font = `bold ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(60,40,20,0.55)";
  ctx.lineWidth = size * 0.16;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function heart(x, y, s, filled) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.34);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.5, x - s * 0.28, y - s * 0.98, x, y - s * 0.36);
  ctx.bezierCurveTo(x + s * 0.28, y - s * 0.98, x + s * 1.1, y - s * 0.5, x, y + s * 0.34);
  ctx.closePath();
  ctx.fillStyle = filled ? "#E23B33" : "rgba(90,70,50,0.35)";
  ctx.fill();
  ctx.strokeStyle = "rgba(70,45,25,0.8)";
  ctx.lineWidth = Math.max(1.4, s * 0.14);
  ctx.stroke();
}

function segmentBar(x, y, w, h, frac, colour) {
  roundRect(x, y, w, h, h * 0.34);
  ctx.fillStyle = "rgba(60,44,26,0.55)";
  ctx.fill();
  const segs = 9;
  const gap = w * 0.012;
  const sw = (w - gap * (segs + 1)) / segs;
  const lit = Math.round(frac * segs);
  for (let i = 0; i < segs; i++) {
    roundRect(x + gap + i * (sw + gap), y + h * 0.16, sw, h * 0.68, h * 0.16);
    ctx.fillStyle = i < lit ? colour : "rgba(255,255,255,0.10)";
    ctx.fill();
  }
}

// The panels' geometry, worked out once per resize. Both the HUD that draws
// them and the trail labels that have to keep out of them read from here, so
// the two cannot drift apart.
function layoutHud() {
  const wOf = (key, h) => {
    const f = Sprites.frames[key];
    return f ? f.w / f.h * h : 0;
  };
  const top = stage.y + stage.h * 0.012;
  const panelH = stage.h * 0.105;

  const spX = stage.x + stage.w * 0.012, spW = wOf("scorePanel", panelH);
  const cX = spX + spW + stage.w * 0.012, cW = wOf("comboPanel", panelH * 0.92);

  const lvW = stage.w * 0.075;
  const lvX = stage.x + stage.w - lvW - stage.w * 0.012;
  const lvH = panelH * 1.05, lvBW = wOf("levelBadge", lvH);
  const lh = panelH * 0.82, lw = wOf("livesPanel", lh);
  const lx = lvX - lw - stage.w * 0.012;

  const hh = stage.h * 0.11, hw = wOf("holePanel", hh);
  const hx = stage.x + stage.w - hw - stage.w * 0.015;
  const hy = stage.y + stage.h - hh - stage.h * 0.02;

  const th = stage.h * 0.13, tw = wOf("typePanel", th);
  const tx = stage.x + stage.w * 0.015;
  const ty = stage.y + stage.h - th - stage.h * 0.02;

  hud = {
    top, panelH, spX, spW, cX, cW, lvX, lvW, lvH, lvBW, lx, lw, lh,
    hx, hy, hw, hh, tx, ty, tw, th,
    boxes: [
      { x: spX, y: top, w: (cX + cW) - spX, h: panelH },
      { x: lx, y: top, w: (lvX + Math.max(lvW, lvBW)) - lx, h: lvH },
      { x: tx, y: ty, w: tw, h: th },
      { x: hx, y: hy, w: hw, h: hh },
    ],
  };
}

// Nudge a box clear of the panels along whichever axis costs least. The trail
// passes beneath the score and combo at the top and behind the readout at the
// bottom, so without this the keys on those stretches are simply buried and
// the ants there cannot be aimed at.
function pushClearOfHud(r) {
  if (!hud) return r;
  for (const b of hud.boxes) {
    if (r.x + r.w <= b.x || r.x >= b.x + b.w) continue;
    if (r.y + r.h <= b.y || r.y >= b.y + b.h) continue;
    const opts = [b.y - (r.y + r.h), (b.y + b.h) - r.y,
                  b.x - (r.x + r.w), (b.x + b.w) - r.x];
    const best = opts.reduce((a, v) => Math.abs(v) < Math.abs(a) ? v : a);
    if (best === opts[0] || best === opts[1]) r.y += best; else r.x += best;
  }
  return r;
}

function hitsHud(r) {
  if (!hud) return false;
  return hud.boxes.some(b => r.x + r.w > b.x && r.x < b.x + b.w &&
                             r.y + r.h > b.y && r.y < b.y + b.h);
}

function drawHUD() {
  if (!hud) return;
  const L = currentLevel();
  const { top, panelH } = hud;

  // Score, top left
  const spX = hud.spX;
  const sp = { w: hud.spW };
  Sprites.drawAt(ctx, "scorePanel", spX, top, panelH);
  // The sheet ships a specimen figure printed on the plate; blank it in the
  // plate's own cream before the live score goes down, leaving the star.
  ctx.fillStyle = SCORE_PLATE;
  ctx.fillRect(spX + sp.w * 0.20, top + panelH * 0.32, sp.w * 0.75, panelH * 0.58);
  panelText(score.toLocaleString(), spX + sp.w * 0.58,
            top + panelH * 0.62, panelH * 0.30, "#5C4326");

  // Combo, beside it
  const cx0 = hud.cX;
  const cp = { w: hud.cW };
  Sprites.drawAt(ctx, "comboPanel", cx0, top, panelH * 0.92);
  const into = multiplier >= MAX_MULT ? 1 : (streak % STREAK_PER_MULT) / STREAK_PER_MULT;
  segmentBar(cx0 + cp.w * 0.06, top + panelH * 0.46, cp.w * 0.64, panelH * 0.26, into, "#7FD13B");
  ctx.fillStyle = COMBO_BADGE;
  ctx.fillRect(cx0 + cp.w * 0.735, top + panelH * 0.40 * 0.92,
               cp.w * 0.205, panelH * 0.92 * 0.38);
  panelText("x" + multiplier, cx0 + cp.w * 0.85, top + panelH * 0.585, panelH * 0.28, "#FFF3D6");

  // Lives and level, top right
  const lvX = hud.lvX, lvH = hud.lvH;
  const lvBadge = { w: hud.lvBW };
  Sprites.drawAt(ctx, "levelBadge", lvX, top, lvH);
  ctx.fillStyle = LEVEL_PLATE;
  ctx.beginPath();
  ctx.ellipse(lvX + lvBadge.w * 0.503, top + lvH * 0.64,
              lvBadge.w * 0.30, lvH * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  panelText(String(Math.max(1, wave)), lvX + lvBadge.w * 0.503,
            top + lvH * 0.645, panelH * 0.34, "#5C4326");

  const lp = Sprites.frames.livesPanel;
  if (lp) {
    const lh = hud.lh, lw = hud.lw, lx = hud.lx;
    Sprites.drawAt(ctx, "livesPanel", lx, top + panelH * 0.08, lh);
    // Cover the painted hearts, then draw the live count
    ctx.fillStyle = UI_CREAM;
    roundRect(lx + lw * 0.1, top + panelH * 0.42, lw * 0.8, lh * 0.42, lh * 0.14);
    ctx.fill();
    for (let i = 0; i < LIVES_START; i++) {
      heart(lx + lw * (0.26 + i * 0.24), top + panelH * 0.64, lh * 0.19, i < lives);
    }
  }

  // Burrow health, bottom right — how much the hole can still take
  const hp = Sprites.frames.holePanel;
  if (hp) {
    const hh = hud.hh, hw = hud.hw, hx = hud.hx, hy = hud.hy;
    Sprites.drawAt(ctx, "holePanel", hx, hy, hh);
    const left = state === "overrun" ? 0
               : Math.max(0, Math.min(1, 1 - holeFill / L.hole));
    segmentBar(hx + hw * 0.14, hy + hh * 0.52, hw * 0.72, hh * 0.2, left, "#7FD13B");
  }

  // Bottom left. With ten or twelve ants addressable there is no listing them
  // all, and no need: each one wears its key out on the trail. So the panel
  // answers the question the trail cannot — which keys are live right now —
  // and hands over to the word itself once something is locked.
  const tp = Sprites.frames.typePanel;
  if (tp) {
    const th = hud.th, tw = hud.tw, tx = hud.tx, ty = hud.ty;
    Sprites.drawAt(ctx, "typePanel", tx, ty, th);
    ctx.fillStyle = UI_CREAM;
    roundRect(tx + tw * 0.045, ty + th * 0.42, tw * 0.91, th * 0.44, th * 0.1);
    ctx.fill();

    const inner = tw * 0.88;
    const cx = tx + tw / 2;
    const y = ty + th * 0.65;
    ctx.textBaseline = "middle";

    if (lockTarget && targetable(lockTarget)) {
      // Mirrors the bloomed tag, for anyone who prefers to read down here.
      const w = lockTarget.word;
      let fs = th * 0.34;
      ctx.font = `bold ${fs}px ${MONO}`;
      if (ctx.measureText(w).width > inner) {
        fs *= inner / ctx.measureText(w).width;
        ctx.font = `bold ${fs}px ${MONO}`;
      }
      const done = w.slice(0, lockTarget.typed);
      const rest = w.slice(lockTarget.typed);
      ctx.textAlign = "left";
      let x = cx - ctx.measureText(w).width / 2;
      if (done) { ctx.fillStyle = "#4C9A2A"; ctx.fillText(done, x, y); x += ctx.measureText(done).width; }
      ctx.fillStyle = UI_INK;
      ctx.fillText(rest, x, y);
    } else {
      // The live keys, in the order they stand on the trail — front ant first,
      // so the row doubles as a picture of the column.
      const keys = chain.filter(m => targetable(m)).map(m => m.word[0].toUpperCase());
      let fs = th * 0.3;
      let gap;
      for (let pass = 0; pass < 12; pass++) {
        ctx.font = `bold ${fs}px ${MONO}`;
        gap = fs * 0.5;
        const total = keys.length * ctx.measureText("W").width + (keys.length - 1) * gap;
        if (total <= inner || fs <= th * 0.12) break;
        fs *= Math.max(0.84, inner / total);
      }
      const cw = ctx.measureText("W").width;
      const total = keys.length * cw + Math.max(0, keys.length - 1) * gap;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(92,67,38,0.78)";
      let x = cx - total / 2 + cw / 2;
      for (const k of keys) { ctx.fillText(k, x, y); x += cw + gap; }
    }
  }

  // Typing stats, centre bottom edge
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const tot = typedCorrect + typedWrong;
  const acc = tot ? Math.round((typedCorrect / tot) * 100) : 100;
  panelText(`WPM ${wpm}   ACC ${acc}%   ${L.label}   ${currentWordSet().label.toUpperCase()}`,
            stage.x + stage.w / 2, stage.y + stage.h - stage.h * 0.012,
            stage.h * 0.022, "rgba(255,246,214,0.92)");
  panelText("ESC  pause / settings", stage.x + stage.w - stage.w * 0.012,
            stage.y + stage.h * 0.012, stage.h * 0.02, "rgba(255,246,214,0.7)", "right");
}

function drawBanner() {
  if (!banner) return;
  const k = banner.life / banner.maxLife;
  const alpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.35);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  panelText(banner.text, stage.x + stage.w / 2, stage.y + stage.h * 0.36, stage.h * 0.075, "#FFD34D");
  panelText(banner.sub, stage.x + stage.w / 2, stage.y + stage.h * 0.43, stage.h * 0.028, "#FFF3D6");
  ctx.restore();
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

// Nothing can be drawn until the sheets are keyed, so the loop waits on them
Sprites.load().then(() => { resize(); });

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
  if (state === "playing" || state === "overrun") update(dt);
  draw();
  rafId = requestAnimationFrame(loop);
  fallbackId = setTimeout(() => loop(performance.now()), 50);
}
loop(performance.now());
