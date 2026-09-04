// ============================================================
// Grand Finale — a fireworks show for touch typists.
//
// Every other game here is built on words. This one is built on single
// letters, which makes it a different exercise: not "can you spell this
// under pressure" but "where does this key live, right now, without
// looking". It is the reach drill the trainer does standing still, put in
// front of an audience.
//
// Shells drift down out of the dark, each wearing one letter. Type it and the
// shell goes off where it is — and the higher it still is, the wider and
// brighter the burst and the more the crowd likes it. That is the whole
// design in one line: **altitude is the reward**. Speed is not a deadline you
// either beat or miss, it is a dial, and every fraction of a second you save
// is literally a taller firework. Dawdle and you still get your burst, but it
// is a damp little pop at head height and the crowd notices.
//
// Let one reach the ground and it is a dud, which is the only real punishment
// in the game. There are no lives and nothing to defend — the crowd's
// interest is the whole health bar, and it ebbs on its own, so a show that
// stops being a show ends even if you never miss a letter.
//
// Every shell in the air wears a different letter, as everywhere else on this
// site, so a keypress is never ambiguous. With single letters that matters
// more than it does in the word games: there is no second character to
// disambiguate with, so the promise has to be kept at spawn time.
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
const GROUND_H = 96;          // the crowd and the field they are standing in
const MAX_PARTICLES = 900;
const STREAK_PER_MULT = 12;   // shorter than the word games: one letter is one hit
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;
const ASSIST_MISSES = 3;
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;

const METER_START = 0.6;
const METER_GAIN = 0.055;     // at full altitude; scaled down as a shell falls
const METER_WRONG = 0.012;    // a key nothing wanted
const RAMP_TO = 180;          // seconds over which the show works up to its top speed

// How often the show throws a barrage, and how many shells it is worth. The
// name of the game, so it had better turn up.
const FINALE_EVERY = 48;
const FINALE_SHELLS = 7;

// ---- Palette ----
// The arcade's pure hues. A firework picks one and keeps it, because a burst
// that is every color at once reads as a smudge rather than as a firework.
const NEON = {
  cyan: "#00D0FF", lime: "#7CFF3D", yellow: "#FFD400",
  orange: "#FF6A00", magenta: "#FF0090", purple: "#9D00FF",
  white: "#FFFFFF", blue: "#1E5BFF",
};
const SHELL_COLORS = [NEON.cyan, NEON.lime, NEON.yellow, NEON.orange, NEON.magenta, NEON.purple];
const DUD = ["#6B6480", "#4A4560", "#8A82A6"];

// ---- Letter sets ----
// The other games use the shared word sets; a game made of single letters
// wants the letters themselves. Same five names, so the setting means the same
// thing it does everywhere else — except that here it is not a filter on the
// vocabulary, it *is* the drill. Choose Home row and only the home row falls.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const LETTER_SETS = {
  all:     { label: "All letters", letters: ALPHABET },
  common:  { label: "Common",      letters: "etaoinsrhldcu" },
  homerow: { label: "Home row",    letters: "asdfghjkl" },
  left:    { label: "Left hand",   letters: "qwertasdfgzxcv" },
  right:   { label: "Right hand",  letters: "yuiophjklnm" },
};

// ---- Settings & scores ----
const SETTINGS_KEY = "typefinale-settings";
const SCORES_KEY = "typefinale-scores";
const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  difficulty: "normal", wordSet: "all", musicOn: true, musicVol: 45, sfxVol: 70,
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
// Ranges run from the opening of the show to RAMP_TO seconds in. `drain` is
// how fast the crowd's interest ebbs with nothing happening, which is what
// makes standing still cost something; `dud` is what one shell hitting the
// grass takes off the meter.
// Speeds are set by how long a shell takes to cross the sky rather than by
// how they look, and that turned out to be the whole balance. Slow shells
// make altitude meaningless: if the fall takes fifteen seconds then even a
// dawdling reaction lights everything near the top, every burst pays out the
// same, and the one idea in the game quietly stops existing. A fall of about
// four seconds at the start of a NORMAL show is what puts a real gap between
// a quick answer and a slow one.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", speed: [95, 150],  gap: [1.60, 1.00], air: 4, drain: 0.026, dud: 0.09 },
  easy:     { label: "EASY",     speed: [115, 185], gap: [1.35, 0.80], air: 5, drain: 0.036, dud: 0.12 },
  normal:   { label: "NORMAL",   speed: [140, 230], gap: [1.10, 0.60], air: 6, drain: 0.048, dud: 0.16 },
  hard:     { label: "HARD",     speed: [175, 290], gap: [0.90, 0.46], air: 8, drain: 0.062, dud: 0.20 },
  master:   { label: "MASTER",   speed: [210, 350], gap: [0.74, 0.36], air: 9, drain: 0.076, dud: 0.24 },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentLetterSet = () => LETTER_SETS[settings.wordSet] || LETTER_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

// How far into the show we are, 0 to 1, for interpolating the ranges above.
function ramp(range) {
  const k = Math.min(1, elapsed / RAMP_TO);
  return range[0] + (range[1] - range[0]) * k;
}

// The painting is the stage. Everything is laid out in its coordinates and
// letterboxed into whatever window it is given, exactly as the other painted
// games are, so the tubes, the crowd and the console stay where the artist put
// them at every window size.
const STAGE_AR = 1672 / 941;
let W = 0, H = 0, VW = 0, VH = 0, stageX = 0, stageY = 0;

// Where the sky stops. Set against the painting rather than by a pixel count:
// this is the line the painted crowd's heads reach and the mouths of the
// mortar tubes sit on, so a shell that gets this far really has come down
// among the audience.
const groundY = () => H * 0.755;

// The band the audience occupies, and the console printed across the foot.
const crowdY = () => H * 0.80;
const consoleY = () => H * 0.865;

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
// A radial gradient per frame per spark is too much; each color is baked once
// into a small canvas and stamped.
const glowCache = new Map();
function glowSprite(color) {
  if (glowCache.has(color)) return glowCache.get(color);
  const size = 96;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, hexA(color, 0.95));
  grad.addColorStop(0.35, hexA(color, 0.35));
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

// ---- Background ----
// The starfield, the fairground, the speaker towers and the audience are all
// in the painting now, so there is nothing here to generate. What is left is
// the one thing a painting cannot do, which is react: the crowd's excitement
// is drawn as a strip over the painted audience, and which strip it is comes
// from the meter.

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
}
window.addEventListener("resize", resize);

// ---- Audio ----
let audioCtx = null, sfxGain = null, musicGain = null;

function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === "suspended") audioCtx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  sfxGain = audioCtx.createGain();
  musicGain = audioCtx.createGain();
  sfxGain.connect(audioCtx.destination);
  musicGain.connect(audioCtx.destination);
  applyVolumes();
}

function applyVolumes() {
  if (!audioCtx) return;
  sfxGain.gain.value = settings.sfxVol / 100;
  musicGain.gain.value = settings.musicOn ? (settings.musicVol / 100) * 0.4 : 0;
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

// A burst is a crack and a tail. The crack is pitched by altitude — high
// shells ring, low ones thud — so you can hear whether you were quick without
// taking your eyes off the sky.
function boom(alt) {
  if (!audioCtx) return;
  blip(120 + alt * 260, 0.06, "square", 0.05, -80);
  const t = audioCtx.currentTime;
  const noise = audioCtx.createBufferSource();
  const len = Math.floor(audioCtx.sampleRate * 0.5);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  noise.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.05 + alt * 0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(700 + alt * 2200, t);
  noise.connect(filter).connect(g).connect(sfxGain);
  noise.start(t);
  noise.stop(t + 0.5);
}

const sfx = {
  boom,
  fizzle: () => blip(180, 0.3, "sawtooth", 0.05, -120),
  error: () => blip(150, 0.14, "square", 0.055),
  levelUp: () => { blip(600, 0.09, "sine", 0.05); setTimeout(() => blip(900, 0.15, "sine", 0.05), 80); },
  finale: () => [0, 90, 180, 270].forEach((d, i) =>
    setTimeout(() => blip([523, 659, 784, 1047][i], 0.22, "triangle", 0.06), d)),
  over: () => { blip(300, 0.5, "sawtooth", 0.09, -180); setTimeout(() => blip(180, 0.7, "sawtooth", 0.08, -100), 160); },
};

// ---- Music: bright and major, a bandstand before the show ----
const MUSIC_TEMPO = 104;
const STEPS_PER_BAR = 8;
const PROGRESSION = [
  [55, 62, 67],   // G
  [57, 64, 69],   // A
  [50, 57, 62],   // D
  [52, 59, 64],   // E
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const noteFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const musicState = { timer: null, nextTime: 0, step: 0 };

function tone(freq, t, dur, type, gain, attack = 0.01) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(musicGain);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playMusicStep(step, t) {
  const bar = Math.floor(step / STEPS_PER_BAR) % PROGRESSION.length;
  const chord = PROGRESSION[bar];
  const i = step % STEPS_PER_BAR;
  if (i === 0) tone(noteFreq(chord[0] - 12), t, 0.5, "triangle", 0.06, 0.02);
  tone(noteFreq(chord[ARP[i]] + 12), t, 0.22, "sine", 0.028);
}

function scheduleMusic() {
  if (!audioCtx) return;
  const stepDur = 60 / MUSIC_TEMPO / 2;
  while (musicState.nextTime < audioCtx.currentTime + 0.4) {
    playMusicStep(musicState.step, musicState.nextTime);
    musicState.step = (musicState.step + 1) % (STEPS_PER_BAR * PROGRESSION.length);
    musicState.nextTime += stepDur;
  }
}

function startMusic() {
  if (!audioCtx || musicState.timer) return;
  musicState.nextTime = audioCtx.currentTime + 0.1;
  musicState.timer = setInterval(scheduleMusic, 120);
}

function stopMusic() {
  clearInterval(musicState.timer);
  musicState.timer = null;
}

// ---- Game state ----
let state = "menu";
let shells, sparks, blooms;
let score, elapsed, spawnTimer, meter, nextFinale, finaleFlash;
let shake, flash, banner;
let typedCorrect, typedWrong, lit, duds, streak, bestStreak, multiplier, bestAlt;
let wrongKey, assist;
// How loud the crowd is right now, as opposed to how interested they are.
// A burst spikes it and it decays, so the audience answers the last firework
// rather than tracking the meter — which is what a crowd actually does.
let cheer = 0;
// The altitude of the shell most recently lit, held so the painted ALTITUDE
// bay has something to show. It sags back rather than snapping to zero, so the
// bay reads as "how high you have been lighting them" rather than flickering
// once per burst.
let lastAlt = 0;

function resetGame() {
  shells = [];
  sparks = [];
  blooms = [];
  score = 0;
  elapsed = 0;
  spawnTimer = 0.6;
  meter = METER_START;
  nextFinale = FINALE_EVERY;
  finaleFlash = 0;
  shake = 0;
  flash = 0;
  banner = null;
  typedCorrect = 0;
  typedWrong = 0;
  lit = 0;
  duds = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
  bestAlt = 0;
  lastAlt = 0;
  wrongKey = { key: "", t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  cheer = 0;
}

// ============================================================
// Shells
// ============================================================

// Altitude, 1 at the top of the sky and 0 on the grass. Everything the game
// pays out is a function of this: the size of the burst, the score, the pitch
// of the bang and what the crowd makes of it.
function altitudeOf(s) {
  const g = groundY();
  return Math.max(0, Math.min(1, (g - s.y) / (g * 0.92)));
}

// A letter nothing in the air is already wearing. That promise is the reason
// a keypress is never ambiguous, and with one letter per shell there is no
// second character to fall back on, so it has to hold at spawn time.
function freeLetter() {
  const pool = currentLetterSet().letters;
  const taken = new Set(shells.filter(s => !s.dying).map(s => s.letter));
  const free = [...pool].filter(c => !taken.has(c));
  if (!free.length) return null;
  return free[(Math.random() * free.length) | 0];
}

function spawnShell(opts = {}) {
  const letter = freeLetter();
  if (letter === null) return false;
  const margin = Math.max(48, W * 0.06);
  shells.push({
    letter,
    x: opts.x != null ? opts.x : margin + Math.random() * Math.max(1, W - margin * 2),
    y: opts.y != null ? opts.y : -30 - Math.random() * 40,
    vy: (opts.speed != null ? opts.speed : ramp(currentLevel().speed)) * (0.85 + Math.random() * 0.3),
    drift: (Math.random() - 0.5) * 14,
    color: SHELL_COLORS[(Math.random() * SHELL_COLORS.length) | 0],
    art: (Math.random() * SHELLS.length) | 0,
    spin: Math.random() * Math.PI * 2,
    dying: false,
    trail: [],
  });
  return true;
}

const targetable = (s) => !s.dying;

// ============================================================
// Effects
// ============================================================

function addSpark(p) {
  if (sparks.length >= MAX_PARTICLES) return;
  sparks.push(p);
}

// The burst itself. Bigger and faster the higher it goes off, which is the
// whole reward loop made visible — you can see that you were quick.
// Which painted burst a shell becomes. Being quick does not just scale the
// same picture up — it buys a better firework, so the sky visibly changes as
// you get faster rather than merely getting bigger.
function burstFrameFor(alt) {
  const kind = alt > 0.72 ? (Math.random() < 0.35 ? "palm" : "large")
             : alt > 0.4  ? (Math.random() < 0.25 ? "willow" : "medium")
             : "small";
  const n = BURST_COUNTS[kind];
  return `burst_${kind}_${(Math.random() * n) | 0}`;
}

function fireworkAt(x, y, color, alt) {
  // The painted burst is the firework; the sparks below are the shower it
  // throws off, and they are what keeps it moving after the picture has faded.
  blooms.push({
    key: burstFrameFor(alt),
    x, y,
    size: (H * 0.10) + alt * (H * 0.30),
    life: 0.85 + alt * 0.5,
    maxLife: 0.85 + alt * 0.5,
    spin: (Math.random() - 0.5) * 0.5,
  });

  // Far fewer and finer than when these *were* the firework. The painted
  // burst is the picture; these only have to keep it moving after it fades,
  // and a thick spray of squares next to painted art just looks like squares.
  const count = Math.round(10 + alt * 26);
  const speed = 80 + alt * 260;
  for (let i = 0; i < count; i++) {
    // Spread evenly around the circle rather than at random angles: a real
    // shell throws a shell-shaped sphere, and pure randomness clumps.
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.14;
    const sp = speed * (0.55 + Math.random() * 0.55);
    addSpark({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.55 + Math.random() * (0.5 + alt * 0.7), maxLife: 1,
      r: 0.9 + Math.random() * 1.3,
      color: Math.random() < 0.16 ? NEON.white : color,
      drag: 1.25,
      gravity: 92,
      twinkle: Math.random() < 0.3,
    });
  }
  flash = Math.min(0.5, flash + 0.06 + alt * 0.12);
}

// A shell that made it down. Grey, low, and it drops on the grass rather than
// blooming — the one thing in the game that looks like a failure.
function dudAt(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = 30 + Math.random() * 70;
    addSpark({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.4, maxLife: 1,
      r: 1 + Math.random() * 2,
      color: DUD[(Math.random() * DUD.length) | 0],
      drag: 2.4, gravity: 240, twinkle: false,
    });
  }
}

// ============================================================
// Settings overlay / quit
// ============================================================
let settingsOpen = false, settingsFrom = "menu";
let quitArmed = false, quitTimer = null;

function openSettings(from) {
  settingsFrom = from;
  settingsOpen = true;
  settingsTitleEl.textContent = "SETTINGS";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  settingsEl.classList.remove("hidden");
  quitBtn.classList.toggle("hidden", from !== "playing");
  disarmQuit();
  syncSettingsUI();
}

function closeSettings() {
  settingsOpen = false;
  settingsEl.classList.add("hidden");
  disarmQuit();
  if (settingsFrom === "menu") { menuEl.classList.remove("hidden"); refreshMenu(); }
  else if (settingsFrom === "gameover") gameoverEl.classList.remove("hidden");
}

function disarmQuit() {
  clearTimeout(quitTimer);
  quitTimer = null;
  quitArmed = false;
  quitBtn.textContent = "Quit run (Q)";
  quitBtn.classList.remove("armed");
}

function requestQuit() {
  if (!quitArmed) {
    quitArmed = true;
    quitBtn.textContent = "Press again to quit";
    quitBtn.classList.add("armed");
    quitTimer = setTimeout(disarmQuit, 2500);
    return;
  }
  disarmQuit();
  settingsOpen = false;
  settingsEl.classList.add("hidden");
  endGame("quit");
}

function returnToMenu() {
  state = "menu";
  shells = [];
  sparks = [];
  blooms = [];
  settingsOpen = false;
  disarmQuit();
  settingsEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  menuEl.classList.remove("hidden");
  refreshMenu();
}

// ============================================================
// Input
// ============================================================
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
  // Every airborne shell wears a different letter, so at most one can match.
  // The lowest wins anyway, as a defence against any moment where that has not
  // yet settled — and because the lowest is the one about to be lost.
  let best = null;
  for (const s of shells) {
    if (!targetable(s) || s.letter !== letter) continue;
    if (!best || s.y > best.y) best = s;
  }
  if (best) light(best);
  else wrongLetter(letter);
});

function bumpStreak() {
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  const m = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (m > multiplier) {
    multiplier = m;
    sfx.levelUp();
    banner = { text: `${m}x`, sub: "the crowd is warming up", t: 1.1 };
  }
}

// Setting a shell off. Everything paid out here is scaled by how high it still
// was, which is the game's one idea.
function light(s) {
  const alt = altitudeOf(s);
  s.dying = true;
  typedCorrect++;
  lit++;
  if (alt > bestAlt) bestAlt = alt;
  lastAlt = Math.max(lastAlt, alt);
  assist.misses = 0;
  assist.showing = false;
  bumpStreak();

  score += Math.round(10 * (1 + 2 * alt) * multiplier);
  meter = Math.min(1, meter + METER_GAIN * (0.3 + 0.7 * alt));

  fireworkAt(s.x, s.y, s.color, alt);
  sfx.boom(alt);

  // The crowd answers the one that just went off, and the higher it was the
  // louder they are about it.
  cheer = Math.min(1, cheer + 0.3 + alt * 0.5);
}

function wrongLetter(key) {
  if (key) { wrongKey.key = key; wrongKey.t = WRONG_FLASH; }
  if (++assist.misses >= ASSIST_MISSES) assist.showing = true;
  typedWrong++;
  streak = 0;
  multiplier = 1;
  meter = Math.max(0, meter - METER_WRONG);
  sfx.error();
}

// A shell that reached the grass.
function dud(s) {
  duds++;
  streak = 0;
  multiplier = 1;
  meter = Math.max(0, meter - currentLevel().dud);
  dudAt(s.x, groundY() + 6);
  sfx.fizzle();
  shake = Math.max(shake, 7);
  cheer = Math.max(0, cheer - 0.45);
}

// ============================================================
// Update
// ============================================================
function update(dt) {
  elapsed += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.4);
  if (finaleFlash > 0) finaleFlash = Math.max(0, finaleFlash - dt);
  if (wrongKey.t > 0) wrongKey.t = Math.max(0, wrongKey.t - dt);
  cheer = Math.max(0, cheer - dt * 0.55);
  lastAlt = Math.max(0, lastAlt - dt * 0.28);
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

  const target = assist.showing ? 1 : 0;
  const rate = target > assist.alpha ? dt / ASSIST_FADE_IN : dt / ASSIST_FADE_OUT;
  assist.alpha += Math.max(-rate, Math.min(rate, target - assist.alpha));

  // The crowd's interest ebbs on its own. This is the whole reason the game
  // has a clock at all: a show that stops being a show ends, even if nothing
  // has actually gone wrong.
  meter = Math.max(0, meter - currentLevel().drain * dt);
  if (meter <= 0) { endGame("bored"); return; }

  updateShells(dt);
  updateSparks(dt);
  updateBlooms(dt);

  // The barrage the game is named for.
  if (elapsed >= nextFinale) {
    nextFinale += FINALE_EVERY;
    let sent = 0;
    for (let i = 0; i < FINALE_SHELLS; i++) {
      if (spawnShell({ y: -40 - i * 34, speed: ramp(currentLevel().speed) * 0.82 })) sent++;
    }
    if (sent) {
      banner = { text: "FINALE", sub: "everything at once", t: 1.6 };
      finaleFlash = 0.6;
      sfx.finale();
    }
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const air = shells.filter(s => !s.dying).length;
    if (air < currentLevel().air) spawnShell();
    spawnTimer = ramp(currentLevel().gap) * (0.75 + Math.random() * 0.5);
  }
}

function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    if (s.dying) { shells.splice(i, 1); continue; }

    s.y += s.vy * dt;
    s.x += s.drift * dt;
    s.spin += dt * 3;

    s.trail.push({ x: s.x, y: s.y });
    if (s.trail.length > 9) s.trail.shift();

    if (s.y >= groundY()) {
      dud(s);
      shells.splice(i, 1);
    }
  }
}

function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.life -= dt;
    if (p.life <= 0) { sparks.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d;
    p.vy = p.vy * d + p.gravity * dt;
  }
}

function updateBlooms(dt) {
  for (let i = blooms.length - 1; i >= 0; i--) {
    blooms[i].life -= dt;
    if (blooms[i].life <= 0) blooms.splice(i, 1);
  }
}

// ============================================================
// Flow
// ============================================================
function startGame() {
  resetGame();
  state = "playing";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
  settingsEl.classList.add("hidden");
  banner = { text: "SHOW TIME", sub: "the higher you light them, the better", t: 1.8 };
}

function endGame(reason = "bored") {
  state = "gameover";
  sfx.over();
  const accuracy = typedCorrect + typedWrong > 0
    ? Math.round((typedCorrect / (typedCorrect + typedWrong)) * 100) : 100;
  const wpm = elapsed > 0 ? Math.round(typedCorrect / (elapsed / 60) / 5) : 0;

  gameoverTitleEl.textContent = reason === "quit" ? "SHOW ENDED" : "THE CROWD WENT HOME";
  const entry = {
    score, lit, duds, accuracy, wpm,
    difficulty: settings.difficulty, wordSet: settings.wordSet, date: Date.now(),
  };
  const rank = recordScore(entry);
  newBestEl.classList.toggle("hidden", rank !== 0);

  finalStatsEl.innerHTML = `
    <div class="stat"><span>Score</span><b>${score.toLocaleString()}</b></div>
    <div class="stat"><span>Fireworks lit</span><b>${lit}</b></div>
    <div class="stat"><span>Duds</span><b>${duds}</b></div>
    <div class="stat"><span>Highest burst</span><b>${Math.round(bestAlt * 100)}%</b></div>
    <div class="stat"><span>Letters per minute</span><b>${wpm * 5}</b></div>
    <div class="stat"><span>Accuracy</span><b>${accuracy}%</b></div>
    <div class="stat"><span>Best streak</span><b>${bestStreak}</b></div>`;
  renderScoreList(rank);

  gameoverEl.classList.remove("hidden");
}

function renderScoreList(highlight) {
  const rows = scoresFor(settings.difficulty).slice(0, 10);
  if (!rows.length) { scoreListEl.innerHTML = ""; return; }
  const body = rows.map((s, i) => `
    <li${i === highlight ? ' class="me"' : ""}>
      <span class="rank">${i + 1}</span>
      <span class="sc">${s.score.toLocaleString()}</span>
      <span class="meta">${s.lit} lit · ${s.duds} duds · ${s.accuracy}%</span>
    </li>`).join("");
  scoreListEl.innerHTML =
    `<div class="score-head">TOP SHOWS &mdash; ${currentLevel().label}</div><ol>${body}</ol>`;
}

function refreshMenu() {
  menuDiffEl.textContent =
    `${currentLevel().label} · ${currentLetterSet().label.toUpperCase()}`;
  const best = scoresFor(settings.difficulty)[0];
  menuBestEl.textContent = best
    ? `Best on ${currentLevel().label}: ${best.score.toLocaleString()} (${best.lit} lit)`
    : "";
}

// ============================================================
// Drawing
// ============================================================
function draw() {
  const t = performance.now() / 1000;

  // Letterboxed to the painting, so nothing on it drifts away from where it
  // was painted. Everything after the translate is in stage coordinates.
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  ctx.fillStyle = "#05030F";
  ctx.fillRect(0, 0, VW, VH);
  ctx.translate(stageX, stageY);

  const bg = Sprites.images && Sprites.images.bg;
  if (bg) ctx.drawImage(bg, 0, 0, W, H);

  // The guide is a watermark over the sky and outside the shake, so it stays
  // a steady thing to read while the rest of the stage is being knocked about.
  if (state === "playing" || state === "gameover") drawGuide();

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawBlooms();
  drawSparks();
  if (state === "playing") drawShells(t);
  drawCrowd(t);

  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 244, 220, ${flash * 0.30})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === "playing" || state === "gameover") {
    drawBanner();
    drawHUD();
  }
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
}

function dpr() { return window.devicePixelRatio || 1; }

// The audience already exists in the painting. This is the layer on top of
// them that shows what they make of the show: five ranks of enthusiasm, from
// standing about to arms up and flags out, crossfaded so the crowd swells and
// settles rather than snapping between poses.
function drawCrowd(t) {
  const excitement = Math.max(0, Math.min(1, meter * 0.65 + cheer * 0.35));
  const level = excitement * (CROWD_STRIPS.length - 1);
  const lo = Math.floor(level), hi = Math.min(CROWD_STRIPS.length - 1, lo + 1);
  const mix = level - lo;

  const h = H * 0.135;
  const tileW = Sprites.widthFor("crowd0", h) || W;
  const y = crowdY() - h * 0.5;
  // A slow sway, so a still crowd does not look like a photograph of one.
  const sway = Math.sin(t * 0.8) * H * 0.004 * (0.3 + excitement);

  for (const [idx, a] of [[lo, 1 - mix], [hi, mix]]) {
    if (a <= 0.01) continue;
    // Fade the whole layer in with excitement too: at a dead show the painted
    // crowd is left to speak for itself.
    const alpha = a * (0.25 + excitement * 0.75);
    for (let x = -tileW * 0.3; x < W + tileW; x += tileW * 0.98) {
      Sprites.drawAt(ctx, "crowd" + idx, x, y + sway, h, alpha);
    }
  }
}

function drawShells(t) {
  for (const s of shells) {
    const alt = altitudeOf(s);
    const size = H * 0.075;

    for (let i = 0; i < s.trail.length; i++) {
      const p = s.trail[i];
      const k = i / s.trail.length;
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = s.color;
      const r = 1 + k * 2.6;
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
    }
    ctx.globalAlpha = 1;

    drawGlow(s.x, s.y, size * 0.55 + alt * size * 0.3, s.color, 0.35 + alt * 0.3);
    // Turned through half a circle: the sheet draws them climbing, and these
    // are coming down, so the nose leads and the flame trails above.
    Sprites.draw(ctx, "shell" + s.art, s.x, s.y, size, 1, false, Math.PI);

    drawLetterChip(s, alt);
  }
}

// The letter, on a chip below the shell — below rather than above so the thing
// you are reading is never what the burst is about to cover.
function drawLetterChip(s, alt) {
  const fs = Math.round(H * 0.030 + alt * H * 0.008);
  ctx.font = `bold ${fs}px ${MONO}`;
  const w = ctx.measureText(s.letter.toUpperCase()).width;
  const padX = fs * 0.52, h = fs * 1.45;
  const cx = s.x, cy = s.y + H * 0.055;

  roundRect(cx - w / 2 - padX, cy - h / 2, w + padX * 2, h, h * 0.32);
  ctx.fillStyle = "rgba(4, 2, 12, 0.86)";
  ctx.fill();
  ctx.lineWidth = 1.6 + alt * 1.4;
  ctx.strokeStyle = hexA(s.color, 0.45 + alt * 0.5);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = NEON.white;
  ctx.fillText(s.letter.toUpperCase(), cx, cy + 1);
  ctx.textAlign = "left";
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

// The painted burst, opening quickly and then fading where it stands.
function drawBlooms() {
  for (const b of blooms) {
    const k = 1 - b.life / b.maxLife;
    const open = 1 - Math.pow(1 - Math.min(1, k * 3.2), 2);   // snaps open, then holds
    const fade = Math.min(1, b.life / (b.maxLife * 0.55));
    Sprites.draw(ctx, b.key, b.x, b.y, b.size * (0.35 + open * 0.65), fade, false, b.spin * k);
  }
}

function drawSparks() {
  for (const p of sparks) {
    const k = Math.max(0, p.life / (p.maxLife || 1));
    let a = Math.min(1, k * 1.6);
    if (p.twinkle) a *= 0.45 + 0.55 * Math.abs(Math.sin(p.life * 34));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGuide() {
  const g = guideBox();
  if (!g.on) return;
  const vis = guideVisibility();
  // Nothing is ever locked here — every letter in the air is live at once, so
  // they are all options and none of them is "the next key".
  const options = shells.filter(targetable).map(s => s.letter);
  drawKeyboardGuide(ctx, {
    x: g.x, y: g.y, width: g.w,
    next: null,
    options,
    showSpace: false,
    opacity: 0.1 * vis,
    highlight: 0.85 * vis,
    optAlpha: 0.5 * vis,
    wrong: wrongKey.t > 0 ? wrongKey.key : null,
    wrongAlpha: wrongKey.t / WRONG_FLASH,
    mono: MONO,
  });
}

function drawBanner() {
  if (!banner) return;
  const k = Math.min(1, banner.t / 0.4);
  ctx.save();
  ctx.globalAlpha = k;
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.round(Math.min(74, W * 0.075))}px ${MONO}`;
  ctx.fillStyle = NEON.yellow;
  ctx.shadowColor = hexA(NEON.orange, 0.8);
  ctx.shadowBlur = 26;
  ctx.fillText(banner.text, W / 2, H * 0.3);
  ctx.shadowBlur = 0;
  ctx.font = `${Math.round(Math.min(20, W * 0.022))}px ${MONO}`;
  ctx.fillStyle = "rgba(240, 233, 255, 0.85)";
  ctx.fillText(banner.sub, W / 2, H * 0.3 + H * 0.045);
  ctx.restore();
  ctx.textAlign = "left";
}

// The HUD docks into the console printed across the foot of the painting,
// which is what leaves the whole sky free to play in.
function drawHUD() {
  const cy = consoleY();
  const panelH = H * 0.105;

  // ---- score, into the left bay ----
  const scoreW = Sprites.widthFor("uiScore", panelH);
  const sx = W * 0.055;
  Sprites.drawAt(ctx, "uiScore", sx, cy, panelH, 0.96);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(panelH * 0.36)}px ${MONO}`;
  ctx.fillStyle = NEON.white;
  ctx.fillText(score.toLocaleString(), sx + scoreW * 0.5, cy + panelH * 0.62);
  ctx.restore();

  // ---- the crowd, into the middle bay ----
  // The artwork arrived with a HAPPINESS meter on it, five hearts wide, which
  // is precisely the number this game wanted to show. The hearts are painted,
  // so the meter is drawn by masking them off from the right rather than by
  // filling a bar.
  const hapH = H * 0.10;
  const hapW = Sprites.widthFor("uiHappiness", hapH);
  const hx = (W - hapW) / 2, hy = cy - H * 0.004;
  Sprites.drawAt(ctx, "uiHappiness", hx, hy, hapH, 0.96);
  // The hearts sit in the right-hand two thirds of that panel.
  const heartsX = hx + hapW * 0.33, heartsW = hapW * 0.60;
  const lost = 1 - meter;
  if (lost > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(6, 3, 16, 0.78)";
    ctx.fillRect(heartsX + heartsW * (1 - lost), hy, heartsW * lost + 2, hapH);
    ctx.restore();
  }

  // ---- altitude of the last shell lit, into the right bay ----
  const altH = H * 0.10;
  const altW = Sprites.widthFor("uiAltitude", altH);
  const ax = W - altW - W * 0.055;
  Sprites.drawAt(ctx, "uiAltitude", ax, cy - H * 0.004, altH, 0.96);
  const barX = ax + altW * 0.30, barW = altW * 0.52;
  const missing = 1 - lastAlt;
  if (missing > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(6, 3, 16, 0.8)";
    ctx.fillRect(barX + barW * (1 - missing), cy - H * 0.004, barW * missing + 2, altH);
    ctx.restore();
  }

  // ---- multiplier and duds, small, above the console ----
  ctx.save();
  ctx.textAlign = "left";
  if (multiplier > 1) {
    ctx.font = `bold ${Math.round(H * 0.032)}px ${MONO}`;
    ctx.fillStyle = NEON.lime;
    ctx.shadowColor = hexA(NEON.lime, 0.8);
    ctx.shadowBlur = 12;
    ctx.fillText(`${multiplier}x`, W * 0.055, cy - H * 0.015);
    ctx.shadowBlur = 0;
  }
  ctx.textAlign = "right";
  ctx.font = `${Math.round(H * 0.022)}px ${MONO}`;
  ctx.fillStyle = "rgba(242, 236, 255, 0.75)";
  ctx.fillText(`${lit} lit`, W - W * 0.055, cy - H * 0.015);
  if (duds > 0) {
    ctx.fillStyle = hexA(NEON.magenta, 0.9);
    ctx.fillText(`${duds} dud${duds === 1 ? "" : "s"}`, W - W * 0.055, cy - H * 0.042);
  }
  ctx.restore();
  ctx.textAlign = "left";
}

// ============================================================
// Settings UI
// ============================================================
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
  musicToggleEl.classList.toggle("on", settings.musicOn);
  musicVolEl.value = settings.musicVol;
  musicVolNumEl.textContent = settings.musicVol;
  sfxVolEl.value = settings.sfxVol;
  sfxVolNumEl.textContent = settings.sfxVol;
}

for (const b of diffButtons) {
  b.addEventListener("click", () => {
    settings.difficulty = b.dataset.diff;
    saveSettings(); syncSettingsUI(); refreshMenu();
  });
}
for (const b of setButtons) {
  b.addEventListener("click", () => {
    settings.wordSet = b.dataset.set;
    saveSettings(); syncSettingsUI(); refreshMenu();
  });
}
for (const b of kbdButtons) {
  b.addEventListener("click", () => {
    settings.keyboardGuide = b.dataset.kbd;
    saveSettings(); syncSettingsUI();
  });
}
musicToggleEl.addEventListener("click", () => {
  settings.musicOn = !settings.musicOn;
  saveSettings(); applyVolumes(); syncSettingsUI();
});
musicVolEl.addEventListener("input", () => {
  settings.musicVol = Number(musicVolEl.value);
  musicVolNumEl.textContent = settings.musicVol;
  applyVolumes(); saveSettings();
});
sfxVolEl.addEventListener("input", () => {
  settings.sfxVol = Number(sfxVolEl.value);
  sfxVolNumEl.textContent = settings.sfxVol;
  applyVolumes(); saveSettings();
});

document.getElementById("menu-settings").addEventListener("click", () => openSettings("menu"));
document.getElementById("gameover-settings").addEventListener("click", () => openSettings("gameover"));
document.getElementById("gameover-menu").addEventListener("click", returnToMenu);
document.getElementById("settings-back").addEventListener("click", closeSettings);
quitBtn.addEventListener("click", requestQuit);

// ============================================================
// Main loop
// ============================================================
// Hybrid scheduler: requestAnimationFrame when it is firing, with a setTimeout
// fallback so the show keeps running in occluded views where rAF is throttled.
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
  resetGame();
  syncSettingsUI();
  refreshMenu();
  frame(performance.now());
});
