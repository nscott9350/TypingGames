// ============================================================
// Coconut Coast — a beach that will not stop dropping coconuts.
//
// The shape looks like Grand Finale's — letters come down, you type them —
// but it plays nothing like it, and the crabs are the reason. Typing a letter
// does not remove a coconut. It **dispatches a crab**, and the crab has to run
// out there, pick the thing up and haul it off. You have a small crew, so
// while they are all carrying you can type nothing useful at all: the beach
// keeps filling and you watch it happen.
//
// That turns the game from a reaction test into a question about traffic.
// Being fast still matters — a crab sent early is already standing where the
// coconut is going to land, and catches it clean — but being fast is no longer
// enough on its own, because the crew is the bottleneck rather than your
// fingers. Choosing which coconut is worth a crab is the game.
//
// Nothing here kills you outright. Coconuts that land stay on the sand, and
// crabs can be sent to those too, so a bad patch is diggable rather than
// fatal. What ends a run is the beach filling up: when it does, the beachgoer
// loses patience, the sand is cleared, and she settles a little less
// comfortably than before. Four of those and she packs up and goes home.
//
// Only the coconuts worth worrying about wear a letter, which is the rule
// Gopher vs Ants uses for the same reason: with a beach full of them there are
// not enough letters in the alphabet to go round, and a keypress has to stay
// unambiguous.
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
const STAGE_AR = 1672 / 941;
const LIVES = 4;
const STREAK_PER_MULT = 10;
const MAX_MULT = 5;
const WRONG_FLASH = 0.6;
const ASSIST_MISSES = 3;
const ASSIST_FADE_IN = 0.18;
const ASSIST_FADE_OUT = 0.7;
const MAX_PARTICLES = 400;
const RAMP_TO = 200;          // seconds to work up to the busiest the beach gets

const NEON = {
  sun: "#FFD400", coral: "#FF5A5F", teal: "#00D0FF", lime: "#7CFF3D",
  white: "#FFFFFF", deep: "#0B3B5A",
};

// The console panels arrived with example content painted into them — a score
// of 12,480, three full hearts and an empty one. Handsome, and wrong the moment
// the game has its own numbers, so the inset plate is painted over before
// anything is drawn on it. This brown is the plate's own colour, sampled off
// the sheet, so the patch reads as the plate rather than as a patch. The rects
// are fractions of each panel, which keeps them right at any size.
const PLATE = "#553C14";
const SCORE_PLATE = { x: 0.072, y: 0.50, w: 0.805, h: 0.376 };
const LIVES_PLATE = { x: 0.070, y: 0.48, w: 0.860, h: 0.320 };

// ---- Letter sets ----
// As in Grand Finale: with no vocabulary to filter, the practice set narrows
// the alphabet the beach throws at you, so the setting is the drill itself.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const LETTER_SETS = {
  all:     { label: "All letters", letters: ALPHABET },
  common:  { label: "Common",      letters: "etaoinsrhldcu" },
  homerow: { label: "Home row",    letters: "asdfghjkl" },
  left:    { label: "Left hand",   letters: "qwertasdfgzxcv" },
  right:   { label: "Right hand",  letters: "yuiophjklnm" },
};

// ---- Settings & scores ----
const SETTINGS_KEY = "typecoast-settings";
const SCORES_KEY = "typecoast-scores";
const SETTINGS_VERSION = 1;
const DEFAULT_SETTINGS = {
  v: SETTINGS_VERSION,
  difficulty: "normal", wordSet: "all", musicOn: true, musicVol: 40, sfxVol: 70,
  keyboardGuide: "off",
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
// `crew` is the whole game. Everything else sets how fast the beach fills;
// the crew size sets how much you can do about it, and it is the only number
// here that changes what the player is deciding rather than how hard it is.
// These were swept rather than guessed. What survival turns on is the spawn
// rate against what the crew can physically get through, and the two are close
// enough that small changes flip a run: at a gap of 1.0 every reaction time
// coasts through three minutes, and at 0.75 none of them does. The NORMAL
// numbers are the point where a half-second player holds on with the crew busy
// most of the time and a two-second player loses the beach — which is the game
// working, since being quick means a crab is already standing where the
// coconut is going to land.
const DIFFICULTY_LEVELS = {
  beginner: { label: "BEGINNER", gap: [1.25, 0.80], fall: [150, 205], crew: 5, crab: 640, cap: 16, reach: 6 },
  easy:     { label: "EASY",     gap: [1.05, 0.62], fall: [165, 230], crew: 5, crab: 600, cap: 14, reach: 7 },
  normal:   { label: "NORMAL",   gap: [0.82, 0.44], fall: [185, 265], crew: 4, crab: 560, cap: 12, reach: 8 },
  hard:     { label: "HARD",     gap: [0.76, 0.42], fall: [210, 300], crew: 4, crab: 530, cap: 11, reach: 9 },
  // Master keeps a gentler spawn than Hard because it has one crab fewer, and
  // the crew is what sets the ceiling. At its saturation a quick reaction and
  // an average one come out within seconds of each other: when you are always
  // waiting on a crab, the game stops being about your hands and becomes
  // entirely about which coconut you spend the next free one on.
  master:   { label: "MASTER",   gap: [0.95, 0.62], fall: [235, 340], crew: 3, crab: 500, cap: 10, reach: 10 },
};
const currentLevel = () => DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
const currentLetterSet = () => LETTER_SETS[settings.wordSet] || LETTER_SETS.all;
const GUIDE_MODES = ["off", "assist", "always"];
const guideMode = () =>
  GUIDE_MODES.includes(settings.keyboardGuide) ? settings.keyboardGuide : "off";

function ramp(range) {
  const k = Math.min(1, elapsed / RAMP_TO);
  return range[0] + (range[1] - range[0]) * k;
}

// ---- Stage ----
let W = 0, H = 0, VW = 0, VH = 0, stageX = 0, stageY = 0;
const dpr = () => window.devicePixelRatio || 1;

// Where the sand is. Coconuts land on it, crabs run along it, and the
// beachgoer sits on it — all measured against the painting rather than in
// pixels, so they stay together at any window size.
const sandY = () => H * 0.795;
const consoleY = () => H * 0.875;
const goerX = () => W * 0.5;

function guideVisibility() {
  const m = guideMode();
  if (m === "always") return 1;
  if (m === "assist") return assist ? assist.alpha : 0;
  return 0;
}
function guideBox() {
  if (guideVisibility() <= 0.001) return { on: false, h: 0, w: 0, x: 0, y: H };
  return { on: true, ...keyboardGuideLayout(W, H * 0.8, false) };
}

function resize() {
  const d = dpr();
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
  if (audioCtx) { if (audioCtx.state === "suspended") audioCtx.resume(); return; }
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
  musicGain.gain.value = settings.musicOn ? (settings.musicVol / 100) * 0.35 : 0;
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
  send:   () => blip(660, 0.07, "triangle", 0.04, 180),
  pickup: () => blip(880, 0.06, "sine", 0.045, 200),
  haul:   () => { blip(520, 0.09, "triangle", 0.05); setTimeout(() => blip(780, 0.12, "sine", 0.045), 70); },
  thud:   () => blip(120, 0.16, "sine", 0.06, -50),
  busy:   () => blip(190, 0.09, "square", 0.03),
  error:  () => blip(150, 0.14, "square", 0.05),
  levelUp:() => { blip(660, 0.09, "sine", 0.05); setTimeout(() => blip(990, 0.14, "sine", 0.05), 80); },
  fed:    () => { blip(300, 0.3, "sawtooth", 0.08, -120); setTimeout(() => blip(200, 0.4, "sawtooth", 0.07, -80), 140); },
  over:   () => { blip(280, 0.5, "sawtooth", 0.08, -150); setTimeout(() => blip(170, 0.7, "sawtooth", 0.07, -90), 180); },
};

// ---- Music: an easy major shuffle, steel-drum-ish ----
const MUSIC_TEMPO = 96;
const STEPS = 8;
const PROG = [[57, 64, 69], [50, 57, 62], [52, 59, 64], [57, 64, 69]];
const ARP = [0, 2, 1, 2, 0, 1, 2, 1];
const noteFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const musicState = { timer: null, nextTime: 0, step: 0 };
function tone(freq, t, dur, type, gain, attack = 0.008) {
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
  const bar = Math.floor(step / STEPS) % PROG.length;
  const chord = PROG[bar];
  const i = step % STEPS;
  if (i === 0) tone(noteFreq(chord[0] - 12), t, 0.42, "triangle", 0.055, 0.02);
  tone(noteFreq(chord[ARP[i]] + 12), t, 0.2, "sine", 0.026);
}
function scheduleMusic() {
  if (!audioCtx) return;
  const stepDur = 60 / MUSIC_TEMPO / 2;
  while (musicState.nextTime < audioCtx.currentTime + 0.4) {
    playMusicStep(musicState.step, musicState.nextTime);
    musicState.step = (musicState.step + 1) % (STEPS * PROG.length);
    musicState.nextTime += stepDur;
  }
}
function startMusic() {
  if (!audioCtx || musicState.timer) return;
  musicState.nextTime = audioCtx.currentTime + 0.1;
  musicState.timer = setInterval(scheduleMusic, 120);
}

// ---- Game state ----
let state = "menu";
let nuts, crabs, particles, letters;
let score, elapsed, spawnTimer, lives, patience;
let shake, flash, banner;
let typedCorrect, typedWrong, hauled, landed, clean, streak, bestStreak, multiplier;
let wrongKey, assist;

function resetGame() {
  nuts = [];
  particles = [];
  letters = new Map();      // letter -> nut
  score = 0;
  elapsed = 0;
  spawnTimer = 0.8;
  lives = LIVES;
  patience = 0;             // how full the beach is, 0..cap
  shake = 0;
  flash = 0;
  banner = null;
  typedCorrect = 0;
  typedWrong = 0;
  hauled = 0;
  landed = 0;
  clean = 0;
  streak = 0;
  bestStreak = 0;
  multiplier = 1;
  wrongKey = { key: "", t: 0 };
  assist = { misses: 0, showing: false, alpha: 0 };
  makeCrew();
}

// The crew. Each crab keeps its colour and its home corner for the whole run,
// which is what lets you tell at a glance how many are still free.
function makeCrew() {
  crabs = [];
  const n = currentLevel().crew;
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    crabs.push({
      color: CRAB_COLORS[i % CRAB_COLORS.length],
      homeX: left ? -0.04 : 1.04,          // as a fraction of W, just off stage
      x: (left ? -0.04 : 1.04) * W,
      side: left ? -1 : 1,
      slot: Math.floor(i / 2),
      job: null,                            // the nut it is fetching
      phase: "idle",                        // idle | out | back
      step: Math.random() * 4,
      carrying: null,
    });
  }
}

const freeCrabs = () => crabs.filter(c => c.phase === "idle").length;

// ============================================================
// Coconuts
// ============================================================

// Which coconuts are worth a letter. Airborne ones first, because they are
// about to become a problem; then whatever has been sitting on the sand
// longest. Assignments are sticky — a letter never moves to another coconut
// while you might be reaching for it.
function assignLetters() {
  const pool = currentLetterSet().letters;
  const reach = currentLevel().reach;

  // Drop letters whose coconut is gone or already claimed by a crab.
  for (const [ch, nut] of [...letters]) {
    if (!nuts.includes(nut) || nut.claimed) {
      letters.delete(ch);
      nut.letter = null;
    }
  }
  if (letters.size >= reach) return;

  const wanting = nuts
    .filter(n => !n.letter && !n.claimed)
    .sort((a, b) => (b.airborne ? 1 : 0) - (a.airborne ? 1 : 0) || a.born - b.born);

  for (const nut of wanting) {
    if (letters.size >= reach) break;
    const free = [...pool].filter(c => !letters.has(c));
    if (!free.length) break;
    const ch = free[(Math.random() * free.length) | 0];
    letters.set(ch, nut);
    nut.letter = ch;
  }
}

function spawnNut() {
  const margin = W * 0.08;
  const x = margin + Math.random() * (W - margin * 2);
  nuts.push({
    x,
    y: -H * 0.06,
    landY: sandY() + (Math.random() - 0.5) * H * 0.045,
    vy: ramp(currentLevel().fall) * (0.9 + Math.random() * 0.25),
    airborne: true,
    claimed: false,
    letter: null,
    art: (Math.random() * NUT_LABEL_KEYS.length) | 0,
    plain: (Math.random() * 4) | 0,
    // A wobble rather than a tumble. This used to reach seventy degrees on the
    // way down, which spun the label right out from under a letter that was
    // being drawn bolt upright — most of why they were hard to read.
    spin: (Math.random() - 0.5) * 0.55,
    born: elapsed,
    settle: 0,
    escorted: false,   // a crab got into position before this one landed
  });
}

// ============================================================
// Effects
// ============================================================
function puff(x, y, n, color) {
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const sp = 40 + Math.random() * 120;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.3 + Math.random() * 0.45, maxLife: 0.75,
      r: 2 + Math.random() * 4, color,
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
  nuts = [];
  particles = [];
  letters = new Map();
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

  const ch = e.key.toLowerCase();
  const nut = letters.get(ch);
  if (!nut) { wrongLetter(ch); return; }

  const crab = crabs.find(c => c.phase === "idle");
  if (!crab) {
    // The letter was right and there was simply nobody to send. That is the
    // game working, not the player failing, so it costs no streak — but it
    // says so, because a silent nothing reads as a dropped keypress.
    sfx.busy();
    banner = { text: "", sub: "every crab is out", t: 0.7 };
    shake = Math.max(shake, 2);
    return;
  }
  dispatch(crab, nut, ch);
});

function dispatch(crab, nut, ch) {
  crab.job = nut;
  crab.phase = "out";
  nut.claimed = true;
  letters.delete(ch);
  nut.letter = null;

  typedCorrect++;
  assist.misses = 0;
  assist.showing = false;
  bumpStreak();
  sfx.send();
  assignLetters();
}

function bumpStreak() {
  streak++;
  if (streak > bestStreak) bestStreak = streak;
  const m = Math.min(MAX_MULT, 1 + Math.floor(streak / STREAK_PER_MULT));
  if (m > multiplier) {
    multiplier = m;
    sfx.levelUp();
    banner = { text: `${m}x`, sub: "the crew has a rhythm going", t: 1.0 };
  }
}

function wrongLetter(key) {
  if (key) { wrongKey.key = key; wrongKey.t = WRONG_FLASH; }
  if (++assist.misses >= ASSIST_MISSES) assist.showing = true;
  typedWrong++;
  streak = 0;
  multiplier = 1;
  sfx.error();
}

// ============================================================
// Update
// ============================================================
function update(dt) {
  elapsed += dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
  if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
  if (wrongKey.t > 0) wrongKey.t = Math.max(0, wrongKey.t - dt);
  if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

  const target = assist.showing ? 1 : 0;
  const rate = target > assist.alpha ? dt / ASSIST_FADE_IN : dt / ASSIST_FADE_OUT;
  assist.alpha += Math.max(-rate, Math.min(rate, target - assist.alpha));

  updateNuts(dt);
  updateCrabs(dt);
  updateParticles(dt);
  assignLetters();

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnNut();
    spawnTimer = ramp(currentLevel().gap) * (0.8 + Math.random() * 0.4);
  }

  if (patience >= currentLevel().cap) loseLife();
}

function updateNuts(dt) {
  for (const n of nuts) {
    if (!n.airborne) { n.settle = Math.min(1, n.settle + dt * 6); continue; }
    n.y += n.vy * dt;
    if (n.y >= n.landY) {
      n.y = n.landY;
      n.airborne = false;
      // A coconut with a crab already standing under it is caught, not
      // dropped: it never becomes clutter and never counts against the beach.
      // Without this the beach is charged for it on the very frame it lands
      // and credited back a frame later, which looked identical on the meter
      // and made being early worth exactly nothing.
      if (!n.escorted) {
        landed++;
        patience++;
        puff(n.x, n.y + H * 0.01, 8, "#E8C98A");
        sfx.thud();
        shake = Math.max(shake, 3);
      }
    }
  }
}

function updateCrabs(dt) {
  const speed = currentLevel().crab * (H / 941);
  for (const c of crabs) {
    if (c.phase === "idle") { c.x += ((c.homeX * W) - c.x) * Math.min(1, dt * 6); continue; }
    c.step += dt * 9;

    if (c.phase === "out") {
      const nut = c.job;
      // The nut may have been swept away by a lost life while the crab was on
      // its way. Nothing to fetch, so it turns round.
      if (!nut || !nuts.includes(nut)) { c.job = null; c.phase = "back"; continue; }
      const dx = nut.x - c.x;
      const dir = Math.sign(dx) || 1;
      c.side = dir;
      if (Math.abs(dx) <= speed * dt) {
        c.x = nut.x;
        // Standing on the spot before the coconut lands is the reward for
        // being quick, so the moment a crab is in position the coconut is
        // marked as escorted and the sand is never charged for it.
        if (nut.airborne) { nut.escorted = true; continue; }
        pickUp(c, nut);
      } else {
        c.x += dir * speed * dt;
      }
      continue;
    }

    if (c.phase === "back") {
      // Whichever edge is closer, not the one it came from. A crab that walked
      // across the whole beach should not have to walk back across it, and the
      // round trip is what sets how much the crew can get through.
      const home = (c.carrying
        ? (c.x < W / 2 ? -0.04 : 1.04)
        : c.homeX) * W;
      const dx = home - c.x;
      c.side = Math.sign(dx) || 1;
      if (Math.abs(dx) <= speed * dt) {
        c.x = home;
        c.phase = "idle";
        c.carrying = null;
      } else {
        c.x += Math.sign(dx) * speed * dt;
      }
    }
  }
}

function pickUp(crab, nut) {
  const i = nuts.indexOf(nut);
  if (i >= 0) nuts.splice(i, 1);
  if (nut.letter) { letters.delete(nut.letter); nut.letter = null; }

  // An escorted coconut was never charged to the beach, so there is nothing to
  // give back — it just counts as one caught clean.
  if (nut.escorted) clean++;
  else patience = Math.max(0, patience - 1);

  crab.carrying = nut;
  crab.job = null;
  crab.phase = "back";
  hauled++;
  score += Math.round((nut.escorted ? 25 : 12) * multiplier);
  sfx.pickup();
  puff(nut.x, nut.y, 5, "#FFE9A8");
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy = p.vy * 0.94 + 320 * dt;
  }
}

// The beach filled up. She gets up, shakes out the towel and settles again
// somewhere a little less comfortable — and the sand is cleared, because a run
// that carried its whole backlog into the next life would never recover.
function loseLife() {
  lives--;
  patience = 0;
  streak = 0;
  multiplier = 1;
  flash = 0.5;
  shake = Math.max(shake, 12);
  sfx.fed();
  for (const n of nuts) puff(n.x, n.y, 6, "#E8C98A");
  nuts = [];
  letters = new Map();
  for (const c of crabs) { c.job = null; if (c.phase === "out") c.phase = "back"; }

  if (lives <= 0) { endGame("left"); return; }
  banner = {
    text: "SHE MOVES",
    sub: lives === 1 ? "one more and she is gone" : "the beach is swept",
    t: 1.6,
  };
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
  banner = { text: "COCONUT COAST", sub: "send a crab before it lands", t: 1.8 };
}

function endGame(reason = "left") {
  state = "gameover";
  sfx.over();
  const accuracy = typedCorrect + typedWrong > 0
    ? Math.round((typedCorrect / (typedCorrect + typedWrong)) * 100) : 100;
  const lpm = elapsed > 0 ? Math.round(typedCorrect / (elapsed / 60)) : 0;

  gameoverTitleEl.textContent = reason === "quit" ? "PACKED UP" : "SHE WENT HOME";
  const entry = {
    score, hauled, clean, accuracy, lpm,
    difficulty: settings.difficulty, wordSet: settings.wordSet, date: Date.now(),
  };
  const rank = recordScore(entry);
  newBestEl.classList.toggle("hidden", rank !== 0);

  finalStatsEl.innerHTML = `
    <div class="stat"><span>Score</span><b>${score.toLocaleString()}</b></div>
    <div class="stat"><span>Coconuts hauled</span><b>${hauled}</b></div>
    <div class="stat"><span>Caught before landing</span><b>${clean}</b></div>
    <div class="stat"><span>Let through</span><b>${landed}</b></div>
    <div class="stat"><span>Letters per minute</span><b>${lpm}</b></div>
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
      <span class="meta">${s.hauled} hauled · ${s.clean} clean · ${s.accuracy}%</span>
    </li>`).join("");
  scoreListEl.innerHTML =
    `<div class="score-head">TOP DAYS &mdash; ${currentLevel().label}</div><ol>${body}</ol>`;
}

function refreshMenu() {
  menuDiffEl.textContent =
    `${currentLevel().label} · ${currentLetterSet().label.toUpperCase()} · ${currentLevel().crew} CRABS`;
  const best = scoresFor(settings.difficulty)[0];
  menuBestEl.textContent = best
    ? `Best on ${currentLevel().label}: ${best.score.toLocaleString()} (${best.hauled} hauled)`
    : "";
}

// ============================================================
// Drawing
// ============================================================
function draw() {
  const t = performance.now() / 1000;

  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  ctx.fillStyle = "#0A2438";
  ctx.fillRect(0, 0, VW, VH);
  ctx.translate(stageX, stageY);

  const bg = Sprites.images && Sprites.images.bg;
  if (bg) ctx.drawImage(bg, 0, 0, W, H);

  if (state === "playing" || state === "gameover") drawGuide();

  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawBeachgoer();
  if (state === "playing" || state === "gameover") {
    drawNuts(t);
    drawCrabs(t);
  }
  drawParticles();

  ctx.restore();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 250, 230, ${flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state === "playing" || state === "gameover") {
    drawBanner();
    drawHUD();
  }
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
}

// She is the health bar. Four poses, run from most settled to least: with a
// full complement she is in the deck chair with a drink, and on her last life
// she is sitting bolt upright with a hand planted in the sand.
function drawBeachgoer() {
  const key = GOER_BY_LIVES[Math.max(0, Math.min(LIVES, lives))];
  const h = H * 0.30;
  Sprites.drawOnGround(ctx, key, goerX(), sandY() + H * 0.075, h, 1);
}

function drawNuts(t) {
  const size = H * 0.062;
  for (const n of nuts) {
    // Sitting coconuts squash a little as they settle, so a landing reads even
    // when you were looking somewhere else.
    const squash = n.airborne ? 1 : 1 - 0.18 * Math.sin(n.settle * Math.PI) * (1 - n.settle);
    const key = n.letter ? NUT_LABEL_KEYS[n.art] : "nutPlain" + n.plain;
    const rot = n.airborne ? n.spin * (n.y / H) * 0.9 : 0;
    const drawnH = size * squash;
    Sprites.draw(ctx, key, n.x, n.y, drawnH, 1, false, rot);

    if (n.letter) drawLetter(n, key, drawnH, rot);
  }
}

/**
 * The letter, on the blank disc the artist painted onto the coconut.
 *
 * Three things have to line up for it to be readable, and none of them is the
 * middle of the sprite. It is placed at the disc rather than at the frame's
 * centre, because foliage pushes the disc off-centre by as much as a tenth of
 * the frame. It is sized from the disc rather than from the frame, because the
 * disc is a different fraction of each of the three coconuts. And it turns with
 * the coconut, so it stays on the label instead of sliding off it as the thing
 * rotates on the way down.
 */
function drawLetter(n, key, drawnH, rot) {
  const f = Sprites.frames[key];
  const info = NUT_LABELS[key];
  if (!f || !info) return;
  const drawnW = f.w / f.h * drawnH;
  const discH = info.disc * drawnH;

  ctx.save();
  ctx.translate(n.x, n.y);
  if (rot) ctx.rotate(rot);
  ctx.font = `bold ${Math.round(discH * 0.74)}px ${MONO}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#5A3418";
  ctx.fillText(n.letter.toUpperCase(),
               info.anchor[0] * drawnW,
               info.anchor[1] * drawnH);
  ctx.restore();
}

function drawCrabs(t) {
  const h = H * 0.075;
  for (const c of crabs) {
    const moving = c.phase !== "idle";
    const frame = moving ? Math.floor(c.step) % 3 : 0;
    const key = c.carrying ? `crab_${c.color}_happy`
              : moving ? `crab_${c.color}_walk${frame}`
              : `crab_${c.color}_alarmed`;
    // Crabs rest just off the sand line; the row they stand in keeps two from
    // covering one another when the whole crew is out.
    const y = sandY() + H * 0.018 + c.slot * H * 0.030;
    // A crab walks sideways, so it is flipped to face its direction of travel.
    Sprites.drawOnGround(ctx, key, c.x, y, h, 1, c.side > 0);

    if (c.carrying) {
      Sprites.draw(ctx, "nutPlain" + c.carrying.plain, c.x, y - h * 1.05, h * 0.55, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
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
  // Nothing is locked: every lettered coconut is live at once, so they are all
  // options and none of them is "the next key".
  drawKeyboardGuide(ctx, {
    x: g.x, y: g.y, width: g.w,
    next: null,
    options: [...letters.keys()],
    showSpace: false,
    opacity: 0.09 * vis,
    highlight: 0.8 * vis,
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
  if (banner.text) {
    ctx.font = `bold ${Math.round(Math.min(66, W * 0.062))}px ${MONO}`;
    ctx.fillStyle = NEON.sun;
    ctx.strokeStyle = "rgba(60, 30, 0, 0.85)";
    ctx.lineWidth = 5;
    ctx.strokeText(banner.text, W / 2, H * 0.3);
    ctx.fillText(banner.text, W / 2, H * 0.3);
  }
  ctx.font = `${Math.round(Math.min(20, W * 0.021))}px ${MONO}`;
  ctx.fillStyle = "#FFF6E0";
  ctx.strokeStyle = "rgba(60, 30, 0, 0.8)";
  ctx.lineWidth = 3.5;
  const sy = banner.text ? H * 0.3 + H * 0.05 : H * 0.34;
  ctx.strokeText(banner.sub, W / 2, sy);
  ctx.fillText(banner.sub, W / 2, sy);
  ctx.restore();
  ctx.textAlign = "left";
}

// The HUD sits on the plank painted across the foot of the beach.
function drawHUD() {
  const cy = consoleY();
  const panelH = H * 0.115;

  const scoreW = Sprites.widthFor("uiScore", panelH);
  const sx = W * 0.03, sy = cy - panelH * 0.16;
  Sprites.drawAt(ctx, "uiScore", sx, sy, panelH, 1);
  const sp = {
    x: sx + scoreW * SCORE_PLATE.x, y: sy + panelH * SCORE_PLATE.y,
    w: scoreW * SCORE_PLATE.w, h: panelH * SCORE_PLATE.h,
  };
  ctx.save();
  roundRect(sp.x, sp.y, sp.w, sp.h, sp.h * 0.28);
  ctx.fillStyle = PLATE;
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(sp.h * 0.62)}px ${MONO}`;
  ctx.fillStyle = "#FFF6E0";
  ctx.fillText(score.toLocaleString(), sp.x + sp.w / 2, sp.y + sp.h * 0.54);
  ctx.restore();

  // Lives, as the painted plate of hearts. There are four on the plate and
  // four lives, so a lost one is drawn over rather than counted out in text.
  const livesH = H * 0.105;
  const livesW = Sprites.widthFor("uiLives", livesH);
  const lx = W - livesW - W * 0.03, ly = cy - livesH * 0.12;
  Sprites.drawAt(ctx, "uiLives", lx, ly, livesH, 1);
  const lp = {
    x: lx + livesW * LIVES_PLATE.x, y: ly + livesH * LIVES_PLATE.y,
    w: livesW * LIVES_PLATE.w, h: livesH * LIVES_PLATE.h,
  };
  ctx.save();
  roundRect(lp.x, lp.y, lp.w, lp.h, lp.h * 0.3);
  ctx.fillStyle = PLATE;
  ctx.fill();
  // Four hearts of our own rather than the plate's painted three-and-a-gap.
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(lp.h * 0.78)}px system-ui, "Apple Color Emoji", sans-serif`;
  for (let i = 0; i < LIVES; i++) {
    ctx.fillStyle = i < lives ? "#E8443A" : "rgba(20, 8, 2, 0.55)";
    ctx.fillText("\u2665", lp.x + lp.w * ((i + 0.5) / LIVES), lp.y + lp.h * 0.54);
  }
  ctx.restore();

  // How full the beach is, and how much of the crew is free. These are the two
  // things you actually steer by, so they sit in the middle where the eye
  // already is.
  const cap = currentLevel().cap;
  const barW = W * 0.30, barH = H * 0.026;
  const bx = (W - barW) / 2, by = cy + H * 0.006;
  roundRect(bx, by, barW, barH, barH / 2);
  ctx.fillStyle = "rgba(30, 16, 6, 0.55)";
  ctx.fill();
  const full = Math.max(0, Math.min(1, patience / cap));
  if (full > 0.001) {
    roundRect(bx, by, Math.max(barH, barW * full), barH, barH / 2);
    ctx.fillStyle = full > 0.75 ? NEON.coral : full > 0.45 ? NEON.sun : NEON.lime;
    ctx.fill();
  }
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold ${Math.round(H * 0.022)}px ${MONO}`;
  ctx.fillStyle = "#FFF6E0";
  ctx.strokeStyle = "rgba(60, 30, 0, 0.75)";
  ctx.lineWidth = 3;
  const free = freeCrabs();
  const label = `${free} of ${crabs.length} crabs free`;
  ctx.strokeText(label, W / 2, by - H * 0.008);
  ctx.fillText(label, W / 2, by - H * 0.008);
  if (multiplier > 1) {
    ctx.fillStyle = NEON.lime;
    ctx.strokeText(`${multiplier}x`, W / 2, by + barH + H * 0.028);
    ctx.fillText(`${multiplier}x`, W / 2, by + barH + H * 0.028);
  }
  ctx.restore();
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
