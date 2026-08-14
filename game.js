// ============================================================
// Type Blaster — an asteroids-style touch typing trainer
// ============================================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const menuEl = document.getElementById("menu");
const gameoverEl = document.getElementById("gameover");
const finalStatsEl = document.getElementById("final-stats");
const settingsEl = document.getElementById("settings");
const settingsTitleEl = document.getElementById("settings-title");
const menuDiffEl = document.getElementById("menu-diff");

// ---- Tuning constants ----
const COLLIDE_CHANCE = 0.25;      // fraction of asteroids on a true collision course
const SHIP_RADIUS = 16;
const BULLET_SPEED = 950;         // px/s
const INVULN_TIME = 2.0;          // seconds of grace after being hit
const STARTING_LIVES = 3;

// ---- Settings (persisted to localStorage) ----
const SETTINGS_KEY = "typeblaster-settings";
const DEFAULT_SETTINGS = { difficulty: "normal", musicOn: true, musicVol: 50, sfxVol: 70 };
let settings = { ...DEFAULT_SETTINGS };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
  if (saved && typeof saved === "object") settings = { ...DEFAULT_SETTINGS, ...saved };
} catch (e) { /* corrupted or unavailable storage: fall back to defaults */ }

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
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
function currentLevel() {
  return DIFFICULTY_LEVELS[settings.difficulty] || DIFFICULTY_LEVELS.normal;
}

let W = 0, H = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
  shoot: () => blip(880, 0.08, "square", 0.04, -400),
  hit: () => blip(220, 0.12, "sawtooth", 0.05, -80),
  explode: () => blip(120, 0.4, "sawtooth", 0.09, -90),
  error: () => blip(140, 0.15, "square", 0.06),
  lock: () => blip(1320, 0.07, "sine", 0.05),
  shipHit: () => blip(70, 0.6, "sawtooth", 0.12, -40),
  lost: () => blip(400, 0.18, "sine", 0.05, -250),
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
let ship, asteroids, bullets, particles, lockTarget;
let score, lives, elapsed, spawnTimer, invuln, shake;
let typedCorrect, typedWrong, wordsDestroyed;
let stars = [];

function makeStars() {
  stars = [];
  const count = Math.floor((W * H) / 6000);
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      tw: Math.random() * Math.PI * 2,
    });
  }
}
makeStars();
window.addEventListener("resize", makeStars);

function resetGame() {
  ship = { x: W / 2, y: H / 2, angle: -Math.PI / 2 };
  asteroids = [];
  bullets = [];
  particles = [];
  lockTarget = null;
  score = 0;
  lives = STARTING_LIVES;
  elapsed = 0;
  spawnTimer = 0.5;
  invuln = 0;
  shake = 0;
  typedCorrect = 0;
  typedWrong = 0;
  wordsDestroyed = 0;
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
  const roll = Math.random();
  let pool;
  if (roll < d.longWordChance) pool = WORDS.long;
  else if (roll < d.longWordChance + d.mediumWordChance) pool = WORDS.medium;
  else pool = WORDS.short;

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
  const n = 9 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    verts.push(0.72 + Math.random() * 0.36);
  }

  asteroids.push({
    x, y, radius, word,
    typed: 0,             // letters typed so far
    hitsLanded: 0,        // bullets that have arrived
    vx: (dx / len) * speed,
    vy: (dy / len) * speed,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.9,
    verts,
    entered: false,       // has it come on screen yet?
    dying: false,         // word finished, waiting for last bullet
    age: 0,
  });
}

// ---- Effects ----
function explode(x, y, radius, color) {
  const n = 14 + ((radius / 2) | 0);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 180;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.6,
      maxLife: 1,
      r: 1 + Math.random() * 3,
      color,
    });
  }
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
  syncSettingsUI();
  settingsEl.classList.remove("hidden");
}

function closeSettings() {
  settingsOpen = false;
  settingsEl.classList.add("hidden");
  if (document.activeElement) document.activeElement.blur();
  if (settingsFrom === "playing") state = "playing";
  else if (settingsFrom === "menu") menuEl.classList.remove("hidden");
  else if (settingsFrom === "gameover") gameoverEl.classList.remove("hidden");
}

// ---- Input ----
window.addEventListener("keydown", (e) => {
  ensureAudio();
  startMusic();

  if (settingsOpen) {
    if (e.key === "Escape") closeSettings();
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
    return;
  }
  if (state === "playing" && e.key === "Escape") { openSettings("playing"); return; }
  if (state !== "playing") return;

  if (!/^[a-z]$/i.test(e.key)) return;
  const letter = e.key.toLowerCase();

  if (lockTarget) {
    // Must finish the locked word
    if (lockTarget.word[lockTarget.typed] === letter) {
      correctLetter(lockTarget);
    } else {
      wrongLetter();
    }
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
      wrongLetter();
    }
  }
});

function correctLetter(target) {
  target.typed++;
  typedCorrect++;
  score += 10;
  fireBullet(target);
  sfx.shoot();
  if (target.typed >= target.word.length) {
    target.dying = true;           // no longer collidable or lockable
    lockTarget = null;
  }
}

function wrongLetter() {
  typedWrong++;
  score = Math.max(0, score - 5);
  shake = Math.max(shake, 4);
  sfx.error();
}

function fireBullet(target) {
  const nose = {
    x: ship.x + Math.cos(ship.angle) * SHIP_RADIUS,
    y: ship.y + Math.sin(ship.angle) * SHIP_RADIUS,
  };
  bullets.push({ x: nose.x, y: nose.y, target, life: 3 });
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

  // Ship aims at lock target (or drifts back to "up")
  const desired = lockTarget
    ? Math.atan2(lockTarget.y - ship.y, lockTarget.x - ship.x)
    : ship.angle;
  let da = desired - ship.angle;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ship.angle += da * Math.min(1, dt * 14);

  if (invuln > 0) invuln -= dt;
  if (shake > 0) shake = Math.max(0, shake - dt * 20);

  // Asteroids
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.rotSpeed * dt;
    a.age += dt;

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

    // Ship collision
    if (!a.dying && invuln <= 0 &&
        Math.hypot(a.x - ship.x, a.y - ship.y) < a.radius * 0.85 + SHIP_RADIUS) {
      if (lockTarget === a) lockTarget = null;
      explode(a.x, a.y, a.radius, "#ff9b6b");
      explode(ship.x, ship.y, 20, "#7fd4ff");
      asteroids.splice(i, 1);
      lives--;
      invuln = INVULN_TIME;
      shake = 14;
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
    const dx = t.x - b.x, dy = t.y - b.y;
    const dist = Math.hypot(dx, dy);
    const step = BULLET_SPEED * dt;
    if (dist <= step + t.radius * 0.55) {
      // Impact
      bullets.splice(i, 1);
      t.hitsLanded++;
      explode(b.x, b.y, 6, "#ffd97a");
      sfx.hit();
      if (t.dying && t.hitsLanded >= t.word.length) {
        // Final shot landed: destroy
        const idx = asteroids.indexOf(t);
        if (idx !== -1) asteroids.splice(idx, 1);
        explode(t.x, t.y, t.radius, "#ffb36b");
        score += t.word.length * 20 + 50;
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
    p.vx *= 1 - dt * 1.5;
    p.vy *= 1 - dt * 1.5;
  }
}

function startGame() {
  resetGame();
  state = "playing";
  menuEl.classList.add("hidden");
  gameoverEl.classList.add("hidden");
}

function endGame() {
  state = "gameover";
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  finalStatsEl.innerHTML = `
    <span class="label">Score</span><span class="value">${score}</span>
    <span class="label">Words destroyed</span><span class="value">${wordsDestroyed}</span>
    <span class="label">WPM</span><span class="value">${wpm}</span>
    <span class="label">Accuracy</span><span class="value">${acc}%</span>
    <span class="label">Time survived</span><span class="value">${Math.floor(elapsed)}s</span>
  `;
  gameoverEl.classList.remove("hidden");
}

// ---- Drawing ----
function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  // Background
  ctx.fillStyle = "#05070f";
  ctx.fillRect(-20, -20, W + 40, H + 40);
  const t = performance.now() / 1000;
  for (const s of stars) {
    const a = 0.35 + 0.35 * Math.sin(t * 1.5 + s.tw);
    ctx.fillStyle = `rgba(200, 220, 255, ${a})`;
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }

  if (state === "playing" || state === "paused" || state === "gameover") {
    drawAsteroids();
    drawBullets();
    drawParticles();
    if (state !== "gameover") drawShip();
    drawHUD();
  }

  ctx.restore();
}

function drawShip() {
  const blink = invuln > 0 && Math.floor(invuln * 10) % 2 === 0;
  if (blink) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = "#7fd4ff";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#3ba9ff";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(SHIP_RADIUS, 0);
  ctx.lineTo(-SHIP_RADIUS * 0.7, SHIP_RADIUS * 0.66);
  ctx.lineTo(-SHIP_RADIUS * 0.35, 0);
  ctx.lineTo(-SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.66);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawAsteroids() {
  ctx.textAlign = "center";
  for (const a of asteroids) {
    // Rock body
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.strokeStyle = a === lockTarget ? "#ffd97a" : "#9fb4cc";
    ctx.lineWidth = a === lockTarget ? 2.5 : 1.5;
    if (a === lockTarget) {
      ctx.shadowColor = "#ffd97a";
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    const n = a.verts.length;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const r = a.radius * a.verts[i];
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Lock reticle
    if (a === lockTarget) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 217, 122, 0.8)";
      ctx.lineWidth = 1.5;
      const r = a.radius + 12;
      const g = 8;
      for (let q = 0; q < 4; q++) {
        const base = q * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, base - 0.4, base + 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Word label: typed part dim/green, rest bright
    if (!a.dying) {
      const fs = a === lockTarget ? 20 : 17;
      ctx.font = `bold ${fs}px 'Courier New', monospace`;
      const done = a.word.slice(0, a.typed);
      const rest = a.word.slice(a.typed);
      const totalW = ctx.measureText(a.word).width;
      const ly = a.y + a.radius + fs + 8;
      let lx = a.x - totalW / 2;

      // Backing pill for readability
      ctx.fillStyle = "rgba(5, 7, 15, 0.65)";
      ctx.fillRect(lx - 6, ly - fs, totalW + 12, fs + 8);

      ctx.textAlign = "left";
      if (done) {
        ctx.fillStyle = "#57d98a";
        ctx.fillText(done, lx, ly);
        lx += ctx.measureText(done).width;
      }
      ctx.fillStyle = a === lockTarget ? "#ffffff" : "#b8d4ee";
      ctx.fillText(rest, lx, ly);
      ctx.textAlign = "center";
    }
  }
}

function drawBullets() {
  ctx.fillStyle = "#ffd97a";
  ctx.shadowColor = "#ffb84d";
  ctx.shadowBlur = 8;
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  ctx.font = "bold 20px 'Courier New', monospace";
  ctx.fillStyle = "#cfe8ff";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${score}`, 18, 32);

  // Lives as little ships
  for (let i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(W - 30 - i * 30, 26);
    ctx.rotate(-Math.PI / 2);
    ctx.strokeStyle = "#7fd4ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(-7, 6);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, -6);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // Live WPM / accuracy
  const minutes = Math.max(elapsed / 60, 1 / 60);
  const wpm = Math.round((typedCorrect / 5) / minutes);
  const total = typedCorrect + typedWrong;
  const acc = total ? Math.round((typedCorrect / total) * 100) : 100;
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillStyle = "#8aa8c8";
  ctx.fillText(`WPM ${wpm}   ACC ${acc}%   ${currentLevel().label}`, 18, H - 18);
  ctx.textAlign = "right";
  ctx.fillText("Esc: pause / settings", W - 18, H - 18);
  ctx.textAlign = "left";
}

// ---- Settings UI wiring ----
const diffButtons = Array.from(document.querySelectorAll(".diff-btn"));
const musicToggleEl = document.getElementById("music-toggle");
const musicVolEl = document.getElementById("music-vol");
const musicVolNumEl = document.getElementById("music-vol-num");
const sfxVolEl = document.getElementById("sfx-vol");
const sfxVolNumEl = document.getElementById("sfx-vol-num");

function syncSettingsUI() {
  for (const b of diffButtons) {
    b.classList.toggle("selected", b.dataset.diff === settings.difficulty);
  }
  musicToggleEl.textContent = settings.musicOn ? "ON" : "OFF";
  musicToggleEl.classList.toggle("off", !settings.musicOn);
  musicVolEl.value = settings.musicVol;
  musicVolNumEl.textContent = settings.musicVol;
  sfxVolEl.value = settings.sfxVol;
  sfxVolNumEl.textContent = settings.sfxVol;
  menuDiffEl.textContent = `Difficulty: ${currentLevel().label}`;
}

for (const b of diffButtons) {
  b.addEventListener("click", () => {
    settings.difficulty = b.dataset.diff;
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

// Browsers only allow audio after a user gesture; clicks count too.
window.addEventListener("pointerdown", () => {
  ensureAudio();
  startMusic();
});

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
