// ============================================================
// Sprite sheets for Bug Parade.
//
// Frame boxes are in the coordinates of the sheets as delivered (1448x1086).
// The loader rescales them by whatever the loaded image actually measures, so
// the sheets can be re-exported at any size without a box being re-measured.
// They currently ship at 65%.
// ============================================================

const SHEETS = {
  bg:      "images/background.jpg",
  ship:    "images/ships.png",
  enemies: "images/enemies.png",
  ui:      "images/assets.png",
};

const SHEET_NOMINAL = { ship: 1448, enemies: 1448, ui: 1448 };

const FRAMES = {
  // ---- ships.png ----
  shipA:      ["ship",   36,  68, 100, 158],
  shipB:      ["ship",  178,  68, 104, 158],
  shipLeft:   ["ship",  722,  72,  92, 132],
  shipRight:  ["ship", 1000,  68,  98, 126],
  lifeIcon:   ["ship", 1156,  22,  50,  62],
  muzzle:     ["ship", 1056, 272,  66,  72],
  bloom:      ["ship", 1164, 480, 254, 408],
  shieldRing: ["ship",  268, 716, 120, 122],

  // ---- assets.png: the console kit ----
  score:  ["ui",   36,  18, 588, 230],
  wave:   ["ui", 1204,  24, 222, 242],
  lives:  ["ui",   34, 278, 384, 152],
  combo:  ["ui",  482, 274, 760, 164],
  target: ["ui",   26, 446, 584, 174],

  // ---- enemies.png: the loose bugs ----
  spider:   ["enemies",   10, 894, 294, 180],
  spider2:  ["enemies",  324, 918, 232, 156],
  scorpion: ["enemies", 1008, 892, 212, 182],
  scorpion2:["enemies", 1230, 886, 206, 188],
};

// Four colourways of centipede, each with a head, a body bead and a tail fan.
// The head boxes are the exact rects the heads were re-laid into: the delivered
// sheet drew the four heads overlapping one another's rows, so a plain box
// slice would have carried a neighbour's antennae along with it.
const COLORWAYS = [
  { key: "green", head: [ 36,   0, 159, 106], body: [327,  22, 88, 86], tail: [811,  14, 149, 97], glow: "#7CFF3D" },
  { key: "blue",  head: [ 39, 109, 153, 106], body: [327, 122, 88, 90], tail: [811, 121, 149, 95], glow: "#00D0FF" },
  { key: "pink",  head: [ 34, 218, 164, 106], body: [327, 225, 88, 90], tail: [811, 228, 149, 95], glow: "#FF0090" },
  { key: "gold",  head: [ 34, 327, 164, 106], body: [327, 331, 88, 89], tail: [811, 331, 149, 94], glow: "#FFD400" },
];
for (const c of COLORWAYS) {
  FRAMES[c.key + "Head"] = ["enemies", ...c.head];
  FRAMES[c.key + "Body"] = ["enemies", ...c.body];
  FRAMES[c.key + "Tail"] = ["enemies", ...c.tail];
}

// Fleas were re-laid for the same reason as the heads — their jet trails cross
// behind each other on the delivered sheet.
const FLEAS = [[560, 903, 144, 163], [706, 929, 144, 111], [852, 930, 144, 109]];
FLEAS.forEach((box, i) => { FRAMES["flea" + i] = ["enemies", ...box]; });

// Mushrooms come in eight colourways, each with a battered twin that stands in
// for one the scorpion has poisoned.
const MUSHROOMS = [
  [  12, 440, 258, 256], [ 296, 442, 262, 256], [ 584, 482, 200, 216], [ 796, 508, 168, 190],
  [ 982, 532, 126, 166], [1132, 564, 106, 134], [1262, 604,  72,  94], [1356, 608,  74,  90],
];
const MUSHROOMS_HURT = [
  [  12, 698, 244, 188], [ 310, 706, 214, 180], [ 582, 718, 162, 168], [ 800, 728, 144, 158],
  [ 978, 744, 116, 138], [1126, 764,  94, 114], [1246, 788,  78,  88], [1348, 794,  78,  82],
];
MUSHROOMS.forEach((box, i) => { FRAMES["mush" + i] = ["enemies", ...box]; });
MUSHROOMS_HURT.forEach((box, i) => { FRAMES["mushHurt" + i] = ["enemies", ...box]; });

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

// The eight mushrooms are eight different colourways as much as eight sizes,
// and every one of them ends up drawn at the same height on the grid — so the
// field picks among them for variety rather than for fit. The last two are
// left out: they are drawn small enough on the sheet to look soft once the
// grid scales them back up.
const MUSHROOM_ART = 6;
