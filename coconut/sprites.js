// ============================================================
// Sprite sheets for Coconut Coast.
//
// Frame boxes are in the coordinates of the sheets as delivered (1448x1086,
// and 1672x941 for the background). The loader rescales them by whatever the
// loaded image actually measures, so the sheets can be re-exported at another
// size without a box being re-measured.
//
// The boxes were found rather than eyeballed: the sheets carry real alpha, so
// each sprite is the bounding box of an island of non-transparent pixels.
// Unlike Grand Finale's fireworks, nothing here needed a raised alpha cut —
// the crabs and coconuts are drawn well clear of one another, so every sprite
// separates at the first attempt.
// ============================================================

const SHEETS = {
  bg:    "images/background.png",
  props: "images/crabscoconuts.png",
  ui:    "images/assets.png",
  moods: "images/beachgoeranoyed.png",
};
// beachgoer1..4.png are not loaded. They are four poses of the same person and
// all four are content, which made them a ladder only if you read them
// backwards; the moods sheet is a real one — deck chair, on her feet, cross,
// then shouting — so it does the job on its own and saves six megabytes of
// portraits nobody would see.

const SHEET_NOMINAL = { props: 1448, ui: 1448 };

const FRAMES = {
  // ---- assets.png: the console kit ----
  uiScore:    ["ui",   12,  21, 391, 193],
  uiLives:    ["ui", 1053, 387, 372, 186],
  uiCombo:    ["ui", 1125,  30, 309, 194],
  uiGameOver: ["ui",   15, 787, 481, 280],

  // ---- crabscoconuts.png ----
  // The plain ones are for coconuts nobody is being asked to deal with yet.
  // The lettered ones are built below, because a box is not enough for them.
  nutPlain0: ["props",  77,  38,  59,  63],
  nutPlain1: ["props", 155,  23,  79,  80],
  nutPlain2: ["props", 276,  13, 106, 107],
  nutPlain3: ["props", 401,  16, 104, 103],
};

// Four colours of crab, each with three walking frames, an alarmed pose and a
// pleased one. A crew member keeps its colour for the whole run, so you come
// to know them apart — which matters when the crew is small enough to count.
// The coconuts wearing a blank disc are the ones that carry a letter — the
// disc is a label the artist left empty, and that is where the letter goes.
//
// A bounding box alone will not put it there. Some of these coconuts have a
// leaf or a flower attached, which stretches the box to one side, so the disc
// is nowhere near the middle of the frame: on the third one it sits a tenth of
// the frame's width to the left and a twelfth of its height down. And the disc
// is a different fraction of each sprite, so a letter sized off the frame is
// too big on some and too small on others.
//
// `anchor` is where the disc's centre is, as a fraction of the frame from its
// middle, and `disc` is the disc's height as a fraction of the frame's. Both
// were measured off the sheet by finding the largest cream-coloured blob
// inside each frame rather than by eye.
const NUT_LABELS = {
  nutLabel0: { box: [ 10, 930, 137, 136], anchor: [-0.0255, -0.0404], disc: 0.544 },
  nutLabel1: { box: [146, 934, 144, 132], anchor: [-0.0451,  0.0530], disc: 0.477 },
  nutLabel2: { box: [287, 953, 108, 113], anchor: [-0.1065,  0.0841], disc: 0.469 },
};
for (const [key, v] of Object.entries(NUT_LABELS)) FRAMES[key] = ["props", ...v.box];
const NUT_LABEL_KEYS = Object.keys(NUT_LABELS);

const CRAB_ROWS = {
  red:    { walk: [[14, 289, 134, 98], [180, 293, 169, 89], [368, 288, 182, 97]],
            alarmed: [780, 295, 122, 92], happy: [1304, 299, 127, 95] },
  orange: { walk: [[14, 396, 136, 90], [179, 394, 162, 92], [371, 395, 185, 93]],
            alarmed: [766, 395, 137, 94], happy: [1304, 406, 129, 91] },
  pink:   { walk: [[15, 495, 135, 89], [180, 494, 163, 89], [378, 498, 174, 87]],
            alarmed: [771, 496, 134, 88], happy: [1309, 502, 122, 86] },
  blue:   { walk: [[13, 592, 139, 94], [181, 592, 167, 90], [372, 592, 190, 92]],
            alarmed: [773, 591, 136, 92], happy: [1305, 593, 128, 100] },
};
const CRAB_COLORS = Object.keys(CRAB_ROWS);
for (const [c, r] of Object.entries(CRAB_ROWS)) {
  r.walk.forEach((b, i) => { FRAMES[`crab_${c}_walk${i}`] = ["props", ...b]; });
  FRAMES[`crab_${c}_alarmed`] = ["props", ...r.alarmed];
  FRAMES[`crab_${c}_happy`] = ["props", ...r.happy];
}

// Her mood, indexed by lives remaining. Four poses that genuinely escalate:
// reclining with a cocktail while the beach is clear, up on her feet, then
// cross, then shouting with her hands in the air on the last life. She is the
// health bar, and this is the only part of the screen that says so without a
// number.
const GOER_BY_LIVES = ["goerMad3", "goerMad3", "goerMad2", "goerMad1", "goerMad0"];

// The moods sheet is the one piece of art here that did not arrive with alpha:
// it is fully opaque on a black ground. So it is keyed at load — a flood fill
// inward from the sheet edge, which clears only background connected to the
// edge and therefore leaves the black *inside* her alone, her pupils and the
// shadow under the hat included.
//
// Slicing it by rectangle afterwards would not do. The four figures lean into
// one another and their bounding boxes overlap by a hundred pixels, so a plain
// box would carry a neighbour's hair or foot along with it. Each figure is
// therefore cut out by its own connected component and rendered into a canvas
// of its own, which is the same treatment Bug Parade's overlapping heads
// needed.
const KEY_CUTOFF = 44;      // what counts as the black ground
const GOER_MIN_PX = 15000;  // ignore specks; the figures are enormous

function keyAndSplit(img) {
  const W = img.width, H = img.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;

  const dark = (i) => {
    const p = i * 4;
    return d[p] < KEY_CUTOFF && d[p + 1] < KEY_CUTOFF && d[p + 2] < KEY_CUTOFF;
  };
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let sp = 0;
  const push = (i) => { if (!seen[i] && dark(i)) { seen[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const q = stack[--sp];
    d[q * 4 + 3] = 0;
    const qx = q % W, qy = (q / W) | 0;
    if (qx > 0) push(q - 1);
    if (qx < W - 1) push(q + 1);
    if (qy > 0) push(q - W);
    if (qy < H - 1) push(q + W);
  }

  // Label what is left and keep the big islands: one per figure.
  const on = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (d[i * 4 + 3] > 24) on[i] = 1;
  const lab = new Int32Array(W * H).fill(-1);
  const boxes = [];
  for (let i = 0; i < W * H; i++) {
    if (!on[i] || lab[i] >= 0) continue;
    const id2 = boxes.length;
    let p = 0;
    stack[p++] = i; lab[i] = id2;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
    while (p) {
      const q = stack[--p], qx = q % W, qy = (q / W) | 0;
      n++;
      if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = qx + dx, ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (on[k] && lab[k] < 0) { lab[k] = id2; stack[p++] = k; }
      }
    }
    boxes.push({ id: id2, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n });
  }

  const figures = boxes.filter(b => b.n >= GOER_MIN_PX).sort((a, b) => a.x - b.x);
  return figures.map((b) => {
    const out = document.createElement("canvas");
    out.width = b.w; out.height = b.h;
    const og = out.getContext("2d");
    const sub = og.createImageData(b.w, b.h);
    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        const src = (y + b.y) * W + (x + b.x);
        if (lab[src] !== b.id) continue;   // a neighbour's pixels stay behind
        const s4 = src * 4, o4 = (y * b.w + x) * 4;
        sub.data[o4] = d[s4];
        sub.data[o4 + 1] = d[s4 + 1];
        sub.data[o4 + 2] = d[s4 + 2];
        sub.data[o4 + 3] = d[s4 + 3];
      }
    }
    og.putImageData(sub, 0, 0);
    return out;
  });
}

const Sprites = {
  ready: false,
  images: {},
  frames: {},

  load() {
    return Promise.all(Object.entries(SHEETS).map(([name, src]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { this.images[name] = img; res(); };
      img.onerror = () => { this.images[name] = null; res(); };
      img.src = src;
    }))).then(() => {
      for (const [key, [sheet, x, y, w, h]] of Object.entries(FRAMES)) {
        const img = this.images[sheet];
        const nom = SHEET_NOMINAL[sheet];
        // A whole-image frame is written as a zero box and takes the image's
        // own size, so the beachgoers need no measuring at all.
        if (!w || !h) {
          this.frames[key] = img
            ? { img, x: 0, y: 0, w: img.width, h: img.height }
            : { img: null, x: 0, y: 0, w: 0, h: 0 };
          continue;
        }
        const k = (img && nom) ? img.width / nom : 1;
        this.frames[key] = {
          img,
          x: Math.round(x * k), y: Math.round(y * k),
          w: Math.round(w * k), h: Math.round(h * k),
        };
      }
      // The moods sheet is cut up here rather than being listed as boxes,
      // because the cutting needs the pixels rather than a rectangle.
      const moods = this.images.moods ? keyAndSplit(this.images.moods) : [];
      moods.forEach((cv, i) => {
        this.frames["goerMad" + i] = { img: cv, x: 0, y: 0, w: cv.width, h: cv.height };
      });
      this.moodCount = moods.length;
      this.ready = true;
    });
  },

  // Centered on (cx, cy), scaled so the frame's height is `h`.
  draw(ctx, key, cx, cy, h, alpha = 1, flip = false, rot = 0) {
    const f = this.frames[key];
    if (!f || !f.img) return { w: 0, h: 0 };
    const s = h / f.h, w = f.w * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h);
    ctx.restore();
    return { w, h };
  },

  // Anchored by the bottom edge, which is how anything standing on sand wants
  // to be placed: give it the ground line and it sits on it.
  drawOnGround(ctx, key, cx, groundLine, h, alpha = 1, flip = false) {
    return this.draw(ctx, key, cx, groundLine - h / 2, h, alpha, flip, 0);
  },

  drawAt(ctx, key, x, y, h, alpha = 1) {
    const f = this.frames[key];
    if (!f || !f.img) return { w: 0, h: 0 };
    const s = h / f.h, w = f.w * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x, y, w, h);
    ctx.restore();
    return { w, h };
  },

  widthFor(key, h) {
    const f = this.frames[key];
    return f && f.h ? f.w / f.h * h : 0;
  },
};
