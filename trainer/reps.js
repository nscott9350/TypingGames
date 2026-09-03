// ============================================================
// Reps — letter drills, repeated.
//
// The drill feeds you words chosen for your weak keys and never shows you
// the same one twice in a row, which is right for measuring and wrong for
// building a habit. A reach becomes automatic by being made over and over
// with nothing else in the way, which is what typing courses have always
// done and what neither the drill nor a book will ever do for you.
//
// So a drill here is one short line built around a single key, and you type
// that same line several times. Three phrases, in the order the reach is
// actually learned:
//
//   zzz aza zaz    the stroke on its own, out of and back to home position
//   zpzp pzpz      alternated with the other hand, so it is a reach and not
//                  a key you are leaning on
//   zap zip zoo    the reach inside real words, which is where it has to work
//
// Which key you get is the model's call: the ladder is ordered weakest-key
// first, and falls back to the classical home-row-outward course when there
// is not enough evidence yet to have an opinion.
//
// What this deliberately does *not* do is feed timings back into the model.
// A line you have typed four times is a line you have memorised, and what it
// measures after that is recall, not reach — count it and the drill would be
// told you had fixed a key you had only just learned to anticipate. Misses
// still count, because missing a key on the fifth pass is a real signal.
//
// Everything under the text belongs to trainer.js and is shared with the
// drill; this file only decides what is on the page.
// ============================================================

const REPS_KEY = "tippitype.trainer.reps.v1";

// Home-row outward, the order typing courses have used for a century: the
// keys your fingers already rest on, then the reaches up and down from them.
// Only used until the model has an opinion of its own.
const REPS_COURSE = [
  "f", "j", "d", "k", "s", "l", "a", "g", "h",
  "r", "u", "e", "i", "t", "y", "w", "o", "q", "p",
  "v", "n", "c", "m", "b", "x", "z",
];

// The home key each finger returns to, which is what the first phrase drills
// the reach out of and back to. The right pinky's home is `;`, which is not
// a letter and not in the model, so `p` — the one letter that finger owns —
// anchors against `l` instead.
const REPS_HOME = {
  lp: "a", lr: "s", lm: "d", li: "f", ri: "j", rm: "k", rr: "l", rpk: "p",
};

// A home key has no reach to drill against itself, so it pairs with the next
// home key along instead.
const REPS_NEIGHBOR = { a: "s", s: "d", d: "f", f: "d", j: "k", k: "j", l: "k", p: "l" };

// What the second phrase alternates against: the key in the same place on the
// other hand, so both hands are working and the drill is a reach rather than
// a finger held down. Four columns have no letter opposite them — a, z and x
// mirror onto `;`, `/` and `.` — so those fall back to the home key of the
// finger that would have made the stroke.
const REPS_MIRROR = {
  q: "p", w: "o", e: "i", r: "u", t: "y", y: "t", u: "r", i: "e", o: "w", p: "q",
  a: "p", s: "l", d: "k", f: "j", g: "h", h: "g", j: "f", k: "d", l: "s",
  z: "p", x: "l", c: "k", v: "n", b: "n", n: "v", m: "c",
};

const REPS_WORDS = 4;      // real words on the end of each line
const REPS_DEFAULT = 3;

let repsLadder = [];       // the keys to work through, weakest first
let repsAt = 0;            // where in it we are
let repsCount = REPS_DEFAULT;   // passes per drill; 0 is endless
let repsGroups = [];       // the current line, split into typed groups
let repsGen = { rep: 0, i: 0 }; // the generator's cursor, well ahead of the caret

// What the summary reports. Counted at the caret rather than at generation,
// so it is what you actually typed.
let repsSeen = null;
let repsTally = { reps: 0, keys: new Set() };

let repsHint = "";

// ============================================================
// Building a line
// ============================================================

// Short words are better reps: the point is to make the one reach repeatedly,
// and a seven-letter word buries it among six others.
function repsWordsFor(k) {
  let src = pool.filter((w) => w.includes(k) && w.length >= 3 && w.length <= 5);
  if (src.length < REPS_WORDS) src = pool.filter((w) => w.includes(k));
  const out = [];
  const used = new Set();
  while (out.length < REPS_WORDS && used.size < src.length) {
    const i = (Math.random() * src.length) | 0;
    if (used.has(i)) continue;
    used.add(i);
    out.push(src[i]);
  }
  return out;
}

// The line is built once per drill and then repeated verbatim. Re-rolling the
// words each pass would make it a different exercise every time, which is the
// one thing a repetition drill cannot be.
function repsBuild(k) {
  const home = REPS_HOME[KEY_FINGER[k]];
  const anchor = home === k ? REPS_NEIGHBOR[k] : home;
  const mirror = REPS_MIRROR[k];
  return [
    k + k + k,
    anchor + k + anchor,
    k + anchor + k,
    k + mirror + k + mirror,
    mirror + k + mirror + k,
    ...repsWordsFor(k),
  ];
}

// Weakest first, then everything else in course order. The whole alphabet is
// always on the ladder — you can walk to any key with the arrows — but the
// keys costing you the most are the ones you meet without walking anywhere.
function repsLadderFor() {
  const weak = weakestKeys(8);
  return [...weak, ...REPS_COURSE.filter((k) => !weak.includes(k))];
}

function repsKeyNow() {
  return repsLadder[repsAt];
}

function repsSetDrill(i) {
  repsAt = ((i % repsLadder.length) + repsLadder.length) % repsLadder.length;
  repsGroups = repsBuild(repsKeyNow());
  repsGen = { rep: 0, i: 0 };
}

// ============================================================
// Feeding the page
// ============================================================

/**
 * The next group, for trainer.js to turn into a word.
 *
 * The generator runs a long way ahead of the caret, so the drill and the rep
 * number are carried on the word itself rather than read from here — what the
 * status line says is then about the group you are typing, not the one being
 * built thirty groups away.
 */
function repsNext() {
  const entry = {
    text: repsGroups[repsGen.i],
    at: repsAt,
    key: repsKeyNow(),
    rep: repsGen.rep,
    reps: repsCount,
    tail: repsGen.i === repsGroups.length - 1,
  };

  repsGen.i++;
  if (repsGen.i >= repsGroups.length) {
    repsGen.i = 0;
    repsGen.rep++;
    if (repsCount > 0 && repsGen.rep >= repsCount) repsSetDrill(repsAt + 1);
  }
  return entry;
}

function repsReset() {
  repsLadder = repsLadderFor();
  repsSeen = null;
  repsTally = { reps: 0, keys: new Set() };
  repsSetDrill(0);
}

/**
 * Throw away everything past the caret and generate it again.
 *
 * Changing key or rep count has to take effect where you are, not thirty
 * groups later when the lookahead runs out. What is behind the caret is
 * history and stays on screen; the run itself — the clock, the stats, the
 * model — is untouched, which is what separates this from a restart.
 */
function repsReflow() {
  for (let i = wi; i < words.length; i++) {
    words[i].node.remove();
    if (words[i].brk) words[i].brk.remove();
  }
  words.length = wi;
  ci = 0;
  fill();
  moveCaret();
  updateFocus();
}

// Where the ladder is *for you*, which is not where the generator is: with
// three passes a line, the lookahead is already a whole drill further on. An
// arrow that moved relative to the generator would skip a key, so anything
// you can steer moves relative to the drill under the caret.
function repsCaretAt() {
  const w = words[wi];
  return w && w.at != null ? w.at : repsAt;
}

function repsJump(by) {
  repsSetDrill(repsCaretAt() + by);
  repsSeen = null;
  repsReflow();
}

// ============================================================
// The status line
// ============================================================

function repsPips(rep, total) {
  el.repsPips.textContent = "";
  if (!total) {
    const s = document.createElement("span");
    s.className = "pip-endless";
    s.textContent = `∞ · ${rep + 1}`;
    el.repsPips.appendChild(s);
    return;
  }
  for (let i = 0; i < total; i++) {
    const s = document.createElement("span");
    s.className = "pip" + (i < rep ? " done" : i === rep ? " now" : "");
    el.repsPips.appendChild(s);
  }
}

function repsStatus() {
  const w = words[wi];
  if (!w || !w.key) return;

  // A pass is banked when the caret leaves it, so what is counted is what you
  // typed rather than what was put in front of you. Jumping to another key
  // clears the mark rather than moving it, which is what stops a half-typed
  // line you walked away from counting as one you did.
  if (!repsSeen || repsSeen.key !== w.key || repsSeen.rep !== w.rep) {
    if (repsSeen) {
      repsTally.reps++;
      repsTally.keys.add(repsSeen.key);
    }
    repsSeen = { key: w.key, rep: w.rep };
  }

  el.repsKey.textContent = w.key;
  el.repsKey.style.color = fingerColorFor(w.key);
  el.repsFinger.textContent = fingerProse(w.key);
  repsPips(w.rep, w.reps);

  for (const b of el.repsCount.children) {
    b.classList.toggle("on", Number(b.dataset.reps) === repsCount);
  }
}

function repsNote() {
  if (mode !== "reps") {
    el.repsDone.hidden = true;
    return;
  }
  el.repsDone.hidden = false;
  const keys = [...repsTally.keys];
  const n = repsTally.reps;
  if (!keys.length) {
    el.repsDone.textContent = "No full pass through a drill yet.";
    return;
  }
  const named =
    keys.length === 1
      ? keys[0]
      : `${keys.slice(0, -1).join(", ")} and ${keys[keys.length - 1]}`;
  el.repsDone.textContent =
    `${n} ${n === 1 ? "pass" : "passes"} through the ${named} ` +
    `${keys.length === 1 ? "drill" : "drills"}.`;
}

// ============================================================
// Prefs and wiring
// ============================================================

function repsLoadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(REPS_KEY));
    if (p && [0, 3, 5, 8].includes(p.count)) repsCount = p.count;
  } catch (e) {}
}

function repsSavePrefs() {
  try {
    localStorage.setItem(REPS_KEY, JSON.stringify({ count: repsCount }));
  } catch (e) {}
}

// Called by trainer.js when the source switch moves in or out of reps mode.
function enterReps(on) {
  el.repsbar.hidden = !on;
  if (on) {
    if (!repsHint) repsHint = el.hint.innerHTML;
    el.hint.innerHTML =
      "Same line, again — <kbd>&larr;</kbd> <kbd>&rarr;</kbd> change key, " +
      "<kbd>tab</kbd> restarts, <kbd>esc</kbd> ends the run";
  } else if (repsHint) {
    el.hint.innerHTML = repsHint;
  }
}

// Arrows walk the ladder. They are the only way to reach a key the model has
// not put near the front, and stepping off a key you have got is as useful as
// staying on one you have not.
function repsKeyDown(e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return false;
  e.preventDefault();
  if (!done) repsJump(e.key === "ArrowRight" ? 1 : -1);
  return true;
}

el.repsCount.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  repsCount = Number(b.dataset.reps);
  repsSavePrefs();
  // The count you just chose applies to the drill you are on, which starts
  // again from its first pass: everything ahead of the caret is regenerated,
  // so there is no half-counted pass left to reconcile.
  repsSetDrill(repsCaretAt());
  repsSeen = null;
  repsReflow();
});

repsLoadPrefs();
