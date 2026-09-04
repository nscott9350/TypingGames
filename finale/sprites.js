// ============================================================
// Sprite sheets for Grand Finale.
//
// Frame boxes are in the coordinates of the sheets as delivered (1448x1086).
// The loader rescales them by whatever the loaded image actually measures, so
// the sheets can be re-exported at another size without a box being
// re-measured.
//
// The boxes were not eyeballed. The sheets arrive with real alpha, so every
// sprite was found by flooding the non-transparent pixels and taking the
// bounding box of each island. That works cleanly for the rockets and the
// crowd strips, which stand apart on the sheet — but the bursts are drawn with
// soft halos that touch, and at a low alpha threshold the whole right-hand
// half of the fireworks sheet floods as one 537x748 blob. Raising the cut to
// alpha > 140 finds the bright core of each burst instead and separates them,
// which is where these boxes come from. A little of a neighbour's halo lands
// inside the box as a result; against a night sky it cannot be seen.
// ============================================================

const SHEETS = {
  bg:        "images/background.png",
  fireworks: "images/fireworks.png",
  crowd:     "images/crowd.png",
  ui:        "images/assets.png",
};

const SHEET_NOMINAL = { fireworks: 1448, crowd: 1448, ui: 1448 };

const FRAMES = {
  // ---- assets.png: the console kit ----
  // The artwork came with a HAPPINESS meter and an ALTITUDE bar already on it,
  // which is lucky, because those are the game's two numbers.
  uiScore:     ["ui",   22,   8, 559, 237],
  uiHappiness: ["ui",  522, 250, 477, 171],
  uiAltitude:  ["ui", 1012, 267, 422, 162],
  uiCombo:     ["ui",   22, 251, 479, 169],
  uiReady:     ["ui",   16, 681, 410, 172],
  uiGameOver:  ["ui", 1065, 677, 348, 179],
};

// Five ranks of audience, from standing about to arms up and flags out. They
// are drawn over the crowd the background already has, so the meter fades
// between them rather than swapping one for another — the painted crowd is
// always there, and this is the layer that shows what they think of the show.
const CROWD_STRIPS = [
  [15,  47, 510,  98],
  [13, 169, 516,  98],
  [14, 294, 511, 117],
  [13, 422, 511, 122],
  [16, 559, 515, 138],
];
CROWD_STRIPS.forEach((b, i) => { FRAMES["crowd" + i] = ["crowd", ...b]; });

// The shells, drawn nose-up on the sheet with their flame beneath. In play
// they fall, so they are turned through half a circle: nose down, flame
// trailing above, which is what something dropping out of the sky looks like.
const SHELLS = [
  [ 69,  72,  35,  92],
  [125,  56,  45, 113],
  [188,  39,  53, 135],
  [253,  26,  50, 162],
  [314,  21,  54, 178],
  [383,  21,  57, 179],
];
SHELLS.forEach((b, i) => { FRAMES["shell" + i] = ["fireworks", ...b]; });

// Bursts in three sizes and two shapes. Which one you get is chosen by how
// high the shell still was, so the reward for being quick is not only that the
// burst is drawn bigger but that it is a different, better firework.
const BURSTS = {
  small: [
    [907, 118,  67,  65], [1013,  30,  65,  61], [898, 213,  73,  71],
    [895, 314,  76,  73], [1092, 412,  73,  73], [1174, 417,  68,  68],
  ],
  medium: [
    [981, 102,  99,  94], [1093, 106,  99,  91], [982, 305,  98,  96],
    [983, 208,  94,  87], [1092, 306, 103,  98], [990, 409,  92,  87],
  ],
  large: [
    [1204,  12, 232, 225], [1208, 243, 226, 213], [1089, 202, 112, 103],
  ],
  palm: [
    [729, 523,  80, 112], [814, 512,  89, 117], [908, 505,  90, 123],
    [1012, 506,  98, 120], [1122, 505, 103, 117],
  ],
  willow: [
    [799, 634,  81,  96], [893, 634,  97, 114], [1001, 634,  98, 103],
    [1114, 633,  97, 113], [1226, 637,  84, 113],
  ],
};
for (const [kind, boxes] of Object.entries(BURSTS)) {
  boxes.forEach((b, i) => { FRAMES[`burst_${kind}_${i}`] = ["fireworks", ...b]; });
}
const BURST_COUNTS = Object.fromEntries(
  Object.entries(BURSTS).map(([k, v]) => [k, v.length])
);

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
        const k = (img && nom) ? img.width / nom : 1;
        this.frames[key] = {
          img,
          x: Math.round(x * k), y: Math.round(y * k),
          w: Math.round(w * k), h: Math.round(h * k),
        };
      }
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

  // Top-left anchored, for console pieces that align to an edge.
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
    return f ? f.w / f.h * h : 0;
  },
};
