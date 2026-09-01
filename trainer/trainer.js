// ============================================================
// Trainer — adaptive drilling.
//
// The games teach you to type under pressure. This does the opposite job:
// it watches which keys you are actually bad at and quietly rewrites what
// you are asked to type so those keys keep coming back.
//
// Two signals, because either one alone lies. Accuracy alone rewards typing
// slowly and carefully, which is the habit that keeps people at 40wpm. Speed
// alone rewards hammering. A key is weak here if it is slow *relative to the
// rest of your own keyboard* or if you miss it, and both are measured against
// you rather than against some target, so the drill stays honest whether you
// are at 30wpm or 90.
//
// Everything is a recency-weighted average, so "your weak keys" means the
// last few minutes rather than a lifetime record. That is deliberate — which
// keys are failing changes with fatigue and warm-up, and the point is to
// drill what is wrong now.
// ============================================================

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const MODEL_KEY = "tippitype.trainer.model.v1";
const PREFS_KEY = "tippitype.trainer.prefs.v1";

// ---- Tuning ----
// The floor on how much a single press can move an average. 0.08 puts the
// half-life around eight presses of that key, so a letter you are currently
// fumbling climbs the list within a line or two rather than a session or two.
const ALPHA_FLOOR = 0.08;

// Intervals outside this are thrown away rather than clamped. Under 30ms is a
// rollover artifact from two keys held at once; over a second is you pausing
// to think or read ahead, and averaging that in would frame every word you
// hesitated before as a weak reach.
const LAT_MIN = 30;
const LAT_MAX = 1000;

const ERR_WEIGHT = 5;    // a 10% miss rate reads as ~50% slower than average
const SHRINK_K = 10;     // presses before a key's score is trusted at face value
const MIN_N = 4;         // ...and before it counts toward the baseline at all
const PEAK = 0.6;        // how much a word's worst letter counts against its mean
const GAMMA = 4;         // sharpens the weighting; ~4x over-representation
const EXPLORE = 0.3;     // fraction of words picked at random regardless
const RECENT = 12;       // words that cannot repeat
const AHEAD = 32;        // words generated past the caret
const PRUNE_AT = 150;    // drop scrolled-off words once this many are behind

// ============================================================
// The model
// ============================================================

function blankModel() {
  const m = {};
  for (const c of LETTERS) m[c] = { n: 0, err: 0, ln: 0, lat: 0 };
  return m;
}

function loadModel() {
  const m = blankModel();
  try {
    const saved = JSON.parse(localStorage.getItem(MODEL_KEY));
    if (!saved) return m;
    for (const c of LETTERS) {
      const s = saved[c];
      if (!s || typeof s.n !== "number") continue;
      m[c] = {
        n: s.n | 0,
        err: Number(s.err) || 0,
        ln: s.ln | 0,
        lat: Number(s.lat) || 0,
      };
    }
  } catch (e) {}
  return m;
}

function saveModel() {
  try { localStorage.setItem(MODEL_KEY, JSON.stringify(model)); } catch (e) {}
}

let model = loadModel();

/**
 * One press of one key. `dt` is the gap since the previous keystroke and may
 * be null, which is how the caller says "this one is not worth timing".
 *
 * Latency is only taken from correct presses. The interval around a mistake
 * measures the mistake, not the reach, and counting it would score a key by
 * how badly you recover from missing it.
 */
function recordKey(ch, correct, dt) {
  const s = model[ch];
  if (!s) return;

  s.n++;
  s.err += Math.max(1 / s.n, ALPHA_FLOOR) * ((correct ? 0 : 1) - s.err);

  if (correct && dt != null && dt >= LAT_MIN && dt <= LAT_MAX) {
    s.ln++;
    if (s.ln === 1) s.lat = dt;
    else s.lat += Math.max(1 / s.ln, ALPHA_FLOOR) * (dt - s.lat);
  }
}

// Your own middling key, which is what every other key is judged against.
// The median rather than the mean so that one genuinely terrible key does not
// drag the baseline up and make the rest of the keyboard look fine.
function baselineLatency() {
  const v = [];
  for (const c of LETTERS) if (model[c].ln >= MIN_N) v.push(model[c].lat);
  if (!v.length) return 0;
  v.sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

/**
 * Weakness per letter. 1 is "average for you", above 1 is worse.
 *
 * Scores are shrunk toward 1 by how much evidence there is, so a key you have
 * hit twice cannot dominate the drill on the strength of one unlucky miss.
 * With no data at all every letter sits at exactly 1 and selection is uniform,
 * which is the right cold start.
 */
function weaknessTable() {
  const base = baselineLatency();
  const t = {};
  for (const c of LETTERS) {
    const s = model[c];
    let raw = 1;
    if (base > 0 && s.ln > 0) raw = s.lat / base;
    raw += ERR_WEIGHT * s.err;
    const conf = s.n / (s.n + SHRINK_K);
    t[c] = Math.min(6, Math.max(0.2, 1 + conf * (raw - 1)));
  }
  return t;
}

// The letters currently worth naming, worst first. Keys with too little
// evidence are left out rather than guessed at.
function weakestKeys(limit) {
  const t = weaknessTable();
  return LETTERS.split("")
    .filter((c) => model[c].n >= MIN_N)
    .sort((a, b) => t[b] - t[a])
    .slice(0, limit)
    .filter((c) => t[c] > 1.05);
}

// ============================================================
// Word selection
// ============================================================

const pool = trainerWordPool();
const recentWords = [];

// A word is worth setting in front of you for its weakest letter as much as
// for its average, or every pick would be a long word full of easy letters
// with one hard one buried in it.
function wordScore(word, t) {
  let sum = 0;
  let max = 0;
  for (const ch of word) {
    const v = t[ch] || 1;
    sum += v;
    if (v > max) max = v;
  }
  return (sum / word.length + PEAK * max) / (1 + PEAK);
}

function notRecent(word) {
  return !recentWords.includes(word);
}

function remember(word) {
  recentWords.push(word);
  if (recentWords.length > RECENT) recentWords.shift();
  return word;
}

/**
 * The next word.
 *
 * Three in ten are picked at random no matter what the model says. That is
 * not a concession to variety — it is what keeps the model true. Drill only
 * the keys you are currently bad at and the rest of the keyboard stops being
 * measured, its averages go stale, and the trainer ends up chasing whatever
 * it happened to believe ten minutes ago.
 */
function nextWord() {
  if (Math.random() < EXPLORE) {
    for (let i = 0; i < 5; i++) {
      const w = pool[(Math.random() * pool.length) | 0];
      if (notRecent(w)) return remember(w);
    }
    return remember(pool[(Math.random() * pool.length) | 0]);
  }

  const t = weaknessTable();
  const weights = new Array(pool.length);
  let total = 0;
  for (let i = 0; i < pool.length; i++) {
    const x = Math.pow(wordScore(pool[i], t), GAMMA);
    weights[i] = x;
    total += x;
  }

  let chosen = pool[0];
  for (let tries = 0; tries < 5; tries++) {
    let r = Math.random() * total;
    let i = 0;
    while (i < pool.length - 1 && r > weights[i]) {
      r -= weights[i];
      i++;
    }
    chosen = pool[i];
    if (notRecent(chosen)) break;
  }
  return remember(chosen);
}

// ============================================================
// Session state
// ============================================================

const el = {
  modes: document.getElementById("modes"),
  words: document.getElementById("words"),
  typer: document.getElementById("typer"),
  hint: document.getElementById("hint"),
  focus: document.getElementById("focus"),
  focusKeys: document.getElementById("focusKeys"),
  statWpm: document.getElementById("statWpm"),
  statAcc: document.getElementById("statAcc"),
  statClock: document.getElementById("statClock"),
  statClockLabel: document.getElementById("statClockLabel"),
  results: document.getElementById("results"),
  rWpm: document.getElementById("rWpm"),
  rAcc: document.getElementById("rAcc"),
  rChars: document.getElementById("rChars"),
  rLede: document.getElementById("rLede"),
  kb: document.getElementById("kb"),
  weakTable: document.getElementById("weakTable"),
  again: document.getElementById("again"),
  forget: document.getElementById("forget"),
};

let seconds = 60;         // 0 means endless
let words = [];
let wi = 0;
let ci = 0;
let running = false;
let done = false;
let startedAt = 0;
let lastKeyAt = 0;
let skipNextLatency = false;
let keystrokes = 0;
let hits = 0;
let correctChars = 0;
let ticker = null;

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && [0, 30, 60, 120].includes(p.seconds)) seconds = p.seconds;
  } catch (e) {}
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ seconds })); } catch (e) {}
}

// ============================================================
// Rendering
// ============================================================

function appendWord() {
  const text = nextWord();
  const node = document.createElement("span");
  node.className = "word";
  for (const ch of text) {
    const c = document.createElement("span");
    c.className = "char";
    c.textContent = ch;
    node.appendChild(c);
  }
  el.words.appendChild(node);
  // `missed` outlives `typed`: a letter you got wrong and then corrected reads
  // as typed correctly, but the word should still be marked as one you fumbled.
  words.push({
    text,
    node,
    typed: new Array(text.length).fill(null),
    missed: new Array(text.length).fill(false),
  });
}

function fill() {
  while (words.length - wi < AHEAD) appendWord();
}

// Words that have scrolled out of sight are removed so an endless run does
// not accumulate an unbounded number of spans. Safe to do mid-run because the
// scroll offset is recomputed from live layout rather than accumulated.
function prune() {
  if (wi < PRUNE_AT) return;
  const drop = wi - 50;
  for (let i = 0; i < drop; i++) words[i].node.remove();
  words = words.slice(drop);
  wi -= drop;
}

function paintChar(w, i) {
  const c = w.node.children[i];
  const state = w.typed[i];
  c.className = "char" + (state === true ? " ok" : state === false ? " bad" : "");
}

function moveCaret() {
  const prev = el.words.querySelector(".char.cur");
  if (prev) prev.classList.remove("cur");
  const prevW = el.words.querySelector(".word.cur");
  if (prevW) prevW.classList.remove("cur");

  const w = words[wi];
  if (!w) return;
  w.node.classList.add("cur");
  // Past the last letter the caret sits on the trailing edge of the word.
  const target = w.node.children[Math.min(ci, w.text.length - 1)];
  target.classList.add("cur");
  target.classList.toggle("cur-after", ci >= w.text.length);
  scrollToCaret();
}

/**
 * Hold the active line on the second of the three visible rows, so there is
 * always a line of context above it and a line of lookahead below.
 *
 * This works off the offset of the line actually above the caret rather than
 * off a line height, deliberately. A cached height goes stale on a resize, a
 * browser zoom or a late font load and there is no event that reliably covers
 * all three; the row above is measured from whatever the page is doing right
 * now, so it cannot drift. It is also what makes pruning safe — the offsets
 * shift when scrolled-off words are dropped, and this simply re-reads them.
 */
function scrollToCaret() {
  const first = words[0].node.offsetTop;
  const top = words[wi].node.offsetTop;

  let prev = first;
  for (let i = wi - 1; i >= 0; i--) {
    const t = words[i].node.offsetTop;
    if (t < top) {
      prev = t;
      break;
    }
  }

  el.words.style.transform = `translateY(${-(prev - first)}px)`;
}

function updateFocus() {
  const keys = weakestKeys(4);
  el.focus.hidden = keys.length === 0;
  if (!keys.length) return;
  el.focusKeys.textContent = "";
  for (const k of keys) {
    const s = document.createElement("span");
    s.className = "fkey";
    s.textContent = k;
    s.style.color = fingerColorFor(k);
    el.focusKeys.appendChild(s);
  }
}

// ============================================================
// Stats
// ============================================================

function elapsed() {
  return running || done ? (performance.now() - startedAt) / 1000 : 0;
}

function wpm() {
  const mins = elapsed() / 60;
  return mins > 0 ? Math.round(correctChars / 5 / mins) : 0;
}

function accuracy() {
  return keystrokes ? Math.round((hits / keystrokes) * 100) : 100;
}

function updateHud() {
  el.statWpm.textContent = wpm();
  el.statAcc.textContent = accuracy();
  // Endless has nothing to count down to, so the same slot counts up instead.
  if (seconds === 0) {
    el.statClock.textContent = Math.floor(elapsed());
    el.statClockLabel.textContent = "elapsed";
  } else {
    el.statClock.textContent = Math.max(0, Math.ceil(seconds - elapsed()));
    el.statClockLabel.textContent = "left";
  }
}

// ============================================================
// Input
// ============================================================

function start() {
  running = true;
  startedAt = performance.now();
  el.hint.classList.add("faded");
  ticker = setInterval(() => {
    updateHud();
    if (seconds > 0 && elapsed() >= seconds) finish();
  }, 200);
}

function letter(ch) {
  if (done) return;
  if (!running) start();

  const w = words[wi];
  // Keystrokes past the end of a word are dropped rather than appended as
  // overflow. You cannot fix an inserted letter by typing more of them, and a
  // word that grows while you are typing it is a distraction, not feedback.
  if (ci >= w.text.length) return;

  const now = performance.now();
  const dt = lastKeyAt ? now - lastKeyAt : null;
  const target = w.text[ci];
  const ok = ch === target;

  // Every wrong press is a miss on the key you were reaching for, including
  // the second and third one in a row. Hunting for a key is exactly the thing
  // the drill is meant to find, and the alternative — counting only the first
  // fumble — would score a reach you cannot make the same as one you slipped on.
  recordKey(target, ok, skipNextLatency ? null : dt);
  skipNextLatency = !ok;
  lastKeyAt = now;

  keystrokes++;
  if (ok) {
    hits++;
    correctChars++;
    w.typed[ci] = true;
    paintChar(w, ci);
    ci++;
  } else {
    // Hold on the letter you missed rather than carrying the mistake forward.
    // The letter you needed turns red and the caret stays on it, so the next
    // attempt is made against the key you actually got wrong — which is the
    // reach worth practising, and the one the model wants timed.
    w.typed[ci] = false;
    w.missed[ci] = true;
    paintChar(w, ci);
  }
  moveCaret();
}

function space() {
  if (!running || done) return;

  const w = words[wi];
  // Nothing wrong can be left on screen any more, so a word is clean when it
  // was finished and nothing in it ever had to be corrected.
  const clean = ci === w.text.length && !w.missed.some((v) => v);

  keystrokes++;
  if (clean) {
    hits++;
    correctChars++;
  }
  // Letters you skipped by hitting space early are misses on those keys. The
  // one under the caret is passed over if it is already showing red, since
  // holding there has recorded that miss once already.
  for (let i = ci; i < w.text.length; i++) {
    if (w.typed[i] === false) continue;
    recordKey(w.text[i], false, null);
  }

  w.node.classList.add(clean ? "clean" : "flawed");
  lastKeyAt = performance.now();
  skipNextLatency = false;

  wi++;
  ci = 0;
  fill();
  prune();
  moveCaret();
  updateFocus();
}

function backspace() {
  if (!running || done) return;

  const w = words[wi];
  // A held mistake is rubbed out where it stands. The caret never moved past
  // it, so backspace clears the red rather than stepping back over a letter
  // you got right.
  if (ci < w.text.length && w.typed[ci] === false) {
    w.typed[ci] = null;
    paintChar(w, ci);
    return;
  }

  if (ci === 0) return;
  ci--;
  w.typed[ci] = null;
  paintChar(w, ci);
  // Rubbing out the letter does not rub out the miss. The mistake happened,
  // and the model is a record of what your hands did, not of what you left
  // on screen.
  moveCaret();
}

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === "Tab") {
    e.preventDefault();
    restart();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if (running) finish();
    return;
  }
  if (done) return;

  if (e.key === "Backspace") {
    e.preventDefault();
    backspace();
    return;
  }
  if (e.key === " ") {
    e.preventDefault();
    space();
    return;
  }
  if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    e.preventDefault();
    letter(e.key.toLowerCase());
  }
}

// ============================================================
// Run lifecycle
// ============================================================

function restart() {
  clearInterval(ticker);
  ticker = null;
  running = false;
  done = false;
  words = [];
  wi = 0;
  ci = 0;
  keystrokes = 0;
  hits = 0;
  correctChars = 0;
  lastKeyAt = 0;
  skipNextLatency = false;
  recentWords.length = 0;

  el.words.textContent = "";
  el.words.style.transform = "translateY(0)";
  el.results.hidden = true;
  el.typer.hidden = false;
  el.hint.classList.remove("faded");
  document.body.classList.remove("showing-results");

  fill();
  moveCaret();
  updateFocus();
  updateHud();
}

function finish() {
  clearInterval(ticker);
  ticker = null;
  running = false;
  done = true;
  saveModel();
  updateHud();
  showResults();
  document.body.classList.add("showing-results");
  el.typer.hidden = true;
  el.results.hidden = false;
}

// ============================================================
// Results
// ============================================================

function heatClass(c, t) {
  if (model[c].n < MIN_N) return "none";
  if (t[c] > 1.4) return "hot";
  if (t[c] > 1.15) return "warm";
  if (t[c] < 0.9) return "cold";
  return "mid";
}

function buildKeyboard() {
  const t = weaknessTable();
  el.kb.textContent = "";
  for (const row of KEY_ROWS) {
    const r = document.createElement("div");
    r.className = "kbrow";
    for (const c of row) {
      const k = document.createElement("span");
      k.className = "kbkey " + heatClass(c, t);
      k.textContent = c;
      r.appendChild(k);
    }
    el.kb.appendChild(r);
  }
}

function buildWeakTable() {
  const keys = weakestKeys(6);
  el.weakTable.textContent = "";

  if (!keys.length) {
    const row = el.weakTable.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.className = "empty";
    cell.textContent =
      "Nothing stands out yet — a few more runs and the slow keys will separate out.";
    return;
  }

  const base = baselineLatency();
  const head = el.weakTable.insertRow();
  for (const label of ["key", "finger", "speed", "missed"]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.appendChild(th);
  }

  for (const c of keys) {
    const s = model[c];
    const row = el.weakTable.insertRow();

    const key = row.insertCell();
    key.className = "k";
    key.textContent = c;

    const finger = row.insertCell();
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = fingerColorFor(c);
    finger.appendChild(dot);
    finger.appendChild(document.createTextNode(fingerLabelFor(c)));

    const speed = row.insertCell();
    speed.textContent =
      s.ln >= MIN_N && base > 0
        ? `${Math.round(s.lat)}ms · ${Math.round((s.lat / base - 1) * 100)}% slower`
        : "—";

    const missed = row.insertCell();
    missed.textContent = `${Math.round(s.err * 100)}%`;
  }
}

// The shared labels are built for a cramped on-screen key ("L middle"), which
// does not survive being dropped into a sentence.
function fingerProse(key) {
  return fingerLabelFor(key)
    .replace(/^L /, "left ")
    .replace(/^R /, "right ")
    + " finger";
}

function buildLede() {
  const keys = weakestKeys(2);
  if (!keys.length) {
    el.rLede.textContent =
      "Still learning your hands. Keep going — the map fills in as you type.";
    return;
  }
  const fingers = [...new Set(keys.map(fingerProse))];
  const one = keys.length === 1;
  el.rLede.textContent =
    `${one ? `${keys[0]} is` : `${keys[0]} and ${keys[1]} are`} costing you the most ` +
    `right now — your ${fingers.join(" and ")}. Words using ${one ? "it" : "them"} ` +
    `are coming up about four times as often as chance.`;
}

function showResults() {
  el.rWpm.textContent = wpm();
  el.rAcc.textContent = accuracy() + "%";
  el.rChars.textContent = correctChars;
  buildLede();
  buildKeyboard();
  buildWeakTable();
}

// ============================================================
// Wiring
// ============================================================

function setMode(s) {
  seconds = s;
  savePrefs();
  for (const b of el.modes.children) {
    b.classList.toggle("on", Number(b.dataset.seconds) === seconds);
  }
  restart();
}

el.modes.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) setMode(Number(b.dataset.seconds));
});

el.again.addEventListener("click", restart);

el.forget.addEventListener("click", () => {
  model = blankModel();
  saveModel();
  restart();
});

// Buttons keep focus after a click, which would make the next space bar press
// re-trigger them instead of advancing a word.
document.addEventListener("click", () => {
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
});

document.addEventListener("keydown", onKey);
window.addEventListener("resize", scrollToCaret);
window.addEventListener("beforeunload", saveModel);

loadPrefs();
setMode(seconds);
