// ============================================================
// Sprite sheets for Type Squadron 3030.
//
// Unlike Burrow's art, these sheets arrive with real alpha — including the
// soft falloff on every neon glow — so there is no keying step at all. They
// are simply sliced and drawn.
//
// Frame boxes are in the coordinates of the sheets as delivered (1448x1086).
// The loader rescales them by whatever the loaded image actually measures, so
// the sheets can be re-exported at any size without a single box being
// re-measured. They currently ship at 65%.
// ============================================================

const SHEETS = {
  bg:      "images/background.jpg",
  ship:    "images/ship.png",
  enemies: "images/enemies.png",
  ui:      "images/assets.png",
};

const SHEET_NOMINAL = { ship: 1448, enemies: 1448, ui: 1448 };

const FRAMES = {
  // ---- ship.png: the player, its shots and its effects ----
  shipMid:    ["ship",   62,  29, 359, 331],
  shipLeft:   ["ship",  443,  70, 295, 271],
  shipRight:  ["ship",  822,  79, 278, 260],
  boltBig:    ["ship", 1280,  41, 136, 326],
  boltThin:   ["ship", 1141, 139,  19, 182],
  blastS:     ["ship",   59, 530,  87,  93],
  blastM:     ["ship",  193, 487, 145, 139],
  blastL:     ["ship",  371, 447, 202, 210],
  blastXL:    ["ship",  596, 369, 337, 320],
  puShield:   ["ship",  951, 455, 146, 171],
  puAmmo:     ["ship", 1115, 456, 144, 169],
  puDouble:   ["ship", 1279, 455, 146, 172],
  shieldRing: ["ship",   44, 680, 368, 358],
  spark:      ["ship",  458, 704, 267, 286],
  plume:      ["ship",  777, 722, 146, 289],
  lifeIcon:   ["ship",  966, 788, 139, 153],

  // ---- assets.png: the console kit ----
  score:    ["ui",   22,  31, 492, 156],
  hiscore:  ["ui",  531,  31, 464, 156],
  wave:     ["ui", 1025,  21, 407, 170],
  combo:    ["ui",   28, 219, 885, 112],
  lives:    ["ui",  944, 212, 470, 137],
  target:   ["ui",   32, 338,1084, 285],
  ready:    ["ui",   37, 639,1055, 154],
  pause:    ["ui",   33, 821, 360, 144],
  start:    ["ui",  429, 809, 458, 158],
  gameover: ["ui",  917, 763, 508, 210],
  power:    ["ui",   22, 978,1399,  95],
};

// The thirteen creatures, each with the empty name plate drawn beneath it on
// the sheet. The plates are colour-matched to their own creature, which is
// what lets a word tag say which enemy it belongs to before it is read.
const CREATURES = [
  { key: "crab",     box: [  25,  46, 269, 214], plate: [  54, 262, 213, 55] },
  { key: "jelly",    box: [ 335,  32, 177, 229], plate: [ 335, 265, 202, 52] },
  { key: "drone",    box: [ 600,  44, 247, 219], plate: [ 610, 259, 227, 57] },
  { key: "beetle",   box: [ 892,  32, 224, 229], plate: [ 900, 265, 211, 51] },
  { key: "manta",    box: [1148,  26, 289, 239], plate: [1177, 261, 239, 59] },
  { key: "mine",     box: [  43, 347, 200, 203], plate: [  37, 565, 218, 54] },
  { key: "saucer",   box: [ 334, 362, 213, 185], plate: [ 338, 565, 198, 54] },
  { key: "gar",      box: [ 596, 354, 248, 190], plate: [ 618, 565, 213, 54] },
  { key: "squid",    box: [ 892, 337, 235, 225], plate: [ 902, 569, 202, 50] },
  { key: "wasp",     box: [1173, 348, 249, 214], plate: [1192, 566, 218, 54] },
  { key: "widow",    box: [  31, 650, 409, 333], plate: [  22, 981, 428, 78] },
  { key: "cosmoth",  box: [ 473, 647, 502, 325], plate: [ 508, 960, 432, 101] },
  { key: "kraken",   box: [ 992, 644, 434, 417], plate: [ 508, 960, 432, 101] },
];
for (const c of CREATURES) {
  FRAMES[c.key] = ["enemies", ...c.box];
  FRAMES[c.key + "Plate"] = ["enemies", ...c.plate];
}

// Which designs stand in for each of the three roles. A wave picks one design
// per role and holds it, so within a wave the types stay tellable apart, and
// across waves the whole roster gets an outing.
const ROSTER = {
  bee:       ["drone", "beetle", "mine", "wasp", "jelly"],
  butterfly: ["manta", "squid", "crab", "saucer", "gar"],
  boss:      ["widow", "cosmoth", "kraken"],
};

const Sprites = {
  ready: false,
  images: {},
  frames: {},

  load() {
    const t0 = performance.now();
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
      this.loadMs = Math.round(performance.now() - t0);
    });
  },

  // Centred on (cx, cy), scaled so the frame's height is `h`.
  draw(ctx, key, cx, cy, h, alpha = 1, flip = false) {
    const f = this.frames[key];
    if (!f || !f.img) return { w: 0, h: 0 };
    const s = h / f.h, w = f.w * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
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
