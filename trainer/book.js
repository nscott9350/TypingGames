// ============================================================
// Library — typing whole books.
//
// The drill picks words to work on your weak keys. This does the opposite:
// the text is fixed, it is somebody else's, and you take it in the order it
// was written. What it gives you that a word list cannot is everything
// between the words — capitals, commas, quotation marks, the apostrophes and
// full stops that make up a fifth of real typing and appear in no drill.
//
// It is also long, which is the point. A book is somewhere to be rather than
// a score to beat, so the only thing kept between sessions is your place in
// it, and picking the book back up puts the caret exactly where you left off.
//
// Everything below the text — the caret, the clock, the per-key model, the
// summary — belongs to trainer.js and is shared with the drill. This file
// only decides what is on the page and what a keystroke means against it.
// ============================================================

const LIB = "../library/";
const MARK_KEY = "tippitype.trainer.book.";      // + book id
const LAST_BOOK_KEY = "tippitype.trainer.lastbook.v1";

// How much text is in the DOM at once. A book is a million characters and a
// span each would be a million spans, so only a window around the caret is
// built, and it is rebuilt when the caret gets close to running out of it.
const WIN_BACK = 320;
const WIN_AHEAD = 1600;
const RESLIDE = 600;

// Bookmarks are written on a timer rather than on every keystroke, since the
// only thing lost to a crash is a few seconds of a book you still have.
const SAVE_EVERY = 4000;

let shelf = null;          // index.json, once fetched
let book = null;           // the open book's entry in it
let chunkSize = 32768;
const chunks = new Map();  // chunk index -> its text

let pos = 0;               // where the caret is, as a character offset
let held = false;          // ...and whether it is currently stopped there
const fumbled = new Set(); // offsets corrected after a miss, for the window
let winStart = 0;
let spans = [];
let lastTop = -1;
let savedAt = 0;

// ============================================================
// The text
// ============================================================

function charAt(i) {
  const c = chunks.get(Math.floor(i / chunkSize));
  return c ? c[i % chunkSize] : null;
}

async function loadChunk(n) {
  if (chunks.has(n) || n < 0 || n >= book.chunks) return;
  chunks.set(n, null);  // claim it, so a second call does not fetch it again
  const pad = String(n).padStart(3, "0");
  const r = await fetch(`${LIB}${book.id}.${pad}.txt`);
  if (!r.ok) throw new Error(`${book.id} chunk ${pad}: ${r.status}`);
  chunks.set(n, await r.text());
}

// The two or three chunks the window can reach into. Fetching the next one
// before it is needed is what stops the text stopping mid-sentence on a slow
// connection.
function around(i) {
  const first = Math.floor(Math.max(0, i - WIN_BACK) / chunkSize);
  const last = Math.floor((i + WIN_AHEAD + RESLIDE) / chunkSize);
  const want = [];
  for (let n = first; n <= last; n++) want.push(loadChunk(n));
  return Promise.all(want);
}

// ============================================================
// Rendering
// ============================================================

function bookRender() {
  winStart = Math.max(0, pos - WIN_BACK);
  const end = Math.min(book.chars, pos + WIN_AHEAD);
  const frag = document.createDocumentFragment();
  spans = [];

  for (let i = winStart; i < end; i++) {
    const ch = charAt(i);
    if (ch === null) break;   // chunk still in flight; redrawn when it lands
    const s = document.createElement("span");
    // A paragraph break is a keystroke like any other, so it gets a glyph of
    // its own rather than being an invisible thing you are expected to guess.
    s.className = ch === "\n" ? "char para" : "char";
    s.textContent = ch;
    frag.appendChild(s);
    spans.push(s);
  }

  el.words.textContent = "";
  el.words.appendChild(frag);
  for (let i = winStart; i < winStart + spans.length; i++) paintAt(i);
  lastTop = -1;
  bookScroll();
}

function paintAt(i) {
  const s = spans[i - winStart];
  if (!s) return;
  const para = charAt(i) === "\n" ? " para" : "";
  let cls = "char" + para;
  if (i < pos) cls += fumbled.has(i) ? " ok fixed" : " ok";
  else if (i === pos) cls += (held ? " bad" : "") + " cur";
  s.className = cls;
}

/**
 * Hold the caret's line one row down from the top of the window.
 *
 * Measured the same way the drill measures it — from the offset of a span on
 * the line above rather than from a line height — so it survives a resize, a
 * zoom or a late font load. The scan back is bounded by the fact that it
 * stops at the first span on a different line, and it only runs when the
 * caret has actually changed line, which is once every sixty-odd keystrokes.
 */
function bookScroll() {
  const cur = spans[pos - winStart];
  if (!cur) return;
  const top = cur.offsetTop;
  if (top === lastTop) return;
  lastTop = top;

  let prev = spans[0].offsetTop;
  for (let i = pos - winStart - 1; i >= 0; i--) {
    const t = spans[i].offsetTop;
    if (t < top) {
      prev = t;
      break;
    }
  }
  el.words.style.transform = `translateY(${-(prev - spans[0].offsetTop)}px)`;
}

// The caret's line has moved for a reason that has nothing to do with typing
// — a resize, a zoom, a font arriving late — so the remembered offset is now
// about the old layout and has to be thrown away before measuring again.
function bookReflow() {
  if (!book) return;
  lastTop = -1;
  bookScroll();
}

function bookProgress() {
  const pct = book.chars ? (pos / book.chars) * 100 : 0;
  el.bookTitle.textContent = book.title;
  el.bookMeta.textContent = `${book.author} · ${pct.toFixed(1)}%`;
  el.bookFill.style.width = `${pct}%`;
}

// ============================================================
// Typing
// ============================================================

function bookType(ch) {
  if (done || !book) return;
  if (pos >= book.chars) return;
  if (!running) start();

  const target = charAt(pos);
  if (target === null) return;   // still loading; the keystroke is not yours to lose
  const ok = ch === target;

  const now = performance.now();
  const dt = lastKeyAt ? now - lastKeyAt : null;
  // A capital is the same reach as its letter with a shift on the end of it,
  // so both feed the one entry. Punctuation is not on the model's keyboard
  // and recordKey drops it.
  recordKey(target.toLowerCase(), ok, skipNextLatency ? null : dt);
  skipNextLatency = !ok;
  lastKeyAt = now;

  keystrokes++;
  if (!ok) {
    // The same stop the drill makes: the character you missed stays under the
    // caret until you type it. In a book it matters more, because running on
    // would put you a character out of step with the text for a whole page.
    held = true;
    fumbled.add(pos);
    paintAt(pos);
    return;
  }

  hits++;
  correctChars++;
  held = false;
  pos++;
  markDirty();
  // Both ends of the move: the character behind is settled now, and the one
  // ahead has the caret.
  paintAt(pos - 1);

  if (pos >= book.chars) {
    finish();
    return;
  }
  paintAt(pos);
  bookScroll();
  bookProgress();

  // Slide the window on before the text under it runs out.
  if (pos > winStart + spans.length - RESLIDE) {
    around(pos).then(() => {
      if (mode === "book") bookRender();
    });
  }
}

function bookBackspace() {
  if (!book || done) return;
  // There is never anything behind the caret to fix — nothing wrong can get
  // past it — so backspace has exactly one job: clear the stop you are on.
  if (!held) return;
  held = false;
  paintAt(pos);
}

function bookKey(e) {
  if (e.key === "Backspace") {
    e.preventDefault();
    bookBackspace();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    bookType("\n");
    return;
  }
  if (e.key.length === 1) {
    e.preventDefault();
    bookType(e.key);
  }
}

// ============================================================
// Your place in the book
// ============================================================

function markOf(id) {
  try {
    const m = JSON.parse(localStorage.getItem(MARK_KEY + id));
    return m && typeof m.pos === "number" ? m : null;
  } catch (e) {
    return null;
  }
}

function bookSave() {
  if (!book) return;
  try {
    localStorage.setItem(MARK_KEY + book.id, JSON.stringify({ pos, at: Date.now() }));
    localStorage.setItem(LAST_BOOK_KEY, book.id);
  } catch (e) {}
  savedAt = performance.now();
}

function markDirty() {
  if (performance.now() - savedAt > SAVE_EVERY) bookSave();
}

// ============================================================
// The shelf
// ============================================================

async function loadShelf() {
  if (shelf) return shelf;
  const r = await fetch(`${LIB}index.json`);
  if (!r.ok) throw new Error(`library index: ${r.status}`);
  shelf = await r.json();
  chunkSize = shelf.chunk || chunkSize;
  return shelf;
}

function buildShelf() {
  el.shelfList.textContent = "";
  for (const b of shelf.books) {
    const mark = markOf(b.id);
    const pct = mark ? (mark.pos / b.chars) * 100 : 0;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "bookcard";
    card.dataset.book = b.id;

    const t = document.createElement("b");
    t.textContent = b.title;
    const by = document.createElement("i");
    by.textContent = `${b.author} · ${b.year}`;

    const bar = document.createElement("span");
    bar.className = "bar";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const note = document.createElement("small");
    note.textContent = mark
      ? `${pct.toFixed(1)}% · ${mark.pos.toLocaleString()} of ${b.chars.toLocaleString()} characters`
      : `${b.chars.toLocaleString()} characters · public domain`;

    card.append(t, by, bar, note);
    el.shelfList.appendChild(card);
  }
}

async function showShelf() {
  mode = "shelf";
  if (running) finish();
  document.body.classList.add("showing-shelf");
  // A summary left over from the last run would otherwise sit under the shelf.
  document.body.classList.remove("showing-results");
  el.results.hidden = true;
  el.shelf.hidden = false;
  el.shelfError.hidden = true;
  try {
    await loadShelf();
    buildShelf();
  } catch (e) {
    el.shelfError.hidden = false;
  }
}

async function openBook(id) {
  const entry = shelf.books.find((b) => b.id === id);
  if (!entry) return;
  book = entry;
  chunks.clear();
  fumbled.clear();
  held = false;
  const mark = markOf(id);
  // A bookmark past the end is a book you finished; open it at the start.
  pos = mark && mark.pos < entry.chars ? mark.pos : 0;

  mode = "book";
  document.body.classList.remove("showing-shelf");
  el.shelf.hidden = true;
  el.bookbar.hidden = false;
  el.words.classList.add("prose");
  el.typer.classList.add("prose");

  el.words.textContent = "Fetching the text…";
  await around(pos);
  restart();
  bookProgress();
}

function leaveBook() {
  bookSave();
  book = null;
  el.bookbar.hidden = true;
  el.words.classList.remove("prose");
  el.typer.classList.remove("prose");
}

// What the summary says instead of naming weak keys, since a book run is
// about how far you got as much as how fast.
function bookNote() {
  if (mode !== "book" || !book) {
    el.bookDone.hidden = true;
    return;
  }
  el.bookDone.hidden = false;
  const pct = (pos / book.chars) * 100;
  el.bookDone.textContent =
    pos >= book.chars
      ? `That is the end of ${book.title}. All ${book.chars.toLocaleString()} characters of it.`
      : `${pct.toFixed(1)}% of the way through ${book.title}. Your place is kept.`;
}

// ============================================================
// Wiring
// ============================================================

el.sources.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  for (const other of el.sources.children) {
    other.classList.toggle("on", other === b);
  }
  if (b.dataset.source === "library") {
    showShelf();
  } else {
    if (book) leaveBook();
    mode = "drill";
    document.body.classList.remove("showing-shelf");
    el.shelf.hidden = true;
    restart();
  }
});

el.shelfList.addEventListener("click", (e) => {
  const card = e.target.closest(".bookcard");
  if (card) openBook(card.dataset.book);
});

window.addEventListener("beforeunload", bookSave);
// A phone locking or a tab going to the background is the most likely way a
// session ends, and neither of them fires beforeunload reliably.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") bookSave();
});
