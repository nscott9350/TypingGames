// ============================================================
// Sprite sheets for Gopher vs Ants.
//
// The art arrives as contact sheets on a cream ground rather than as cut
// sprites with transparency. Rather than ask for a re-export, the sheets are
// keyed at load: a flood fill runs inward from every border pixel, so only
// background that is *connected to the edge* is removed. Cream that sits
// inside a sprite — the gopher's belly, a speech bubble's fill — is untouched,
// which a naive color key would have punched holes through.
// ============================================================

const SHEETS = {
  bg:    "images/background.jpg",
  chars: "images/characters.png",
  ui:    "images/assets.png",
};

// Frame boxes below are in the coordinates of the sheets as delivered. The
// loader rescales them by whatever the loaded image actually measures, so the
// sheets can be re-exported at a smaller size for download weight without
// anyone having to re-measure a single sprite.
const SHEET_NOMINAL = { chars: [1448, 1086], ui: [1448, 1086] };

// Boxes measured from the sheets by connected-component analysis.
const FRAMES = {
  // characters.png
  gopherIdle:  ["chars", 60, 100, 249, 329],
  gopherAlert: ["chars", 373, 106, 253, 321],
  gopherShoot: ["chars", 677, 128, 336, 298],
  gopherCheer: ["chars", 1101, 89, 283, 339],
  comboBurst:  ["chars", 1131, 892, 234, 157],

  // assets.png
  logo:       ["ui", 35, 40, 648, 372],
  levelBadge: ["ui", 1153, 65, 216, 187],
  scorePanel: ["ui", 697, 252, 317, 163],
  comboPanel: ["ui", 1033, 259, 359, 149],
  typePanel:  ["ui", 36, 438, 676, 174],
  holePanel:  ["ui", 1125, 447, 289, 161],
  livesPanel: ["ui", 878, 461, 227, 128],
  pauseBtn:   ["ui", 739, 462, 120, 128],
  puffA:      ["ui", 36, 888, 142, 133],
  puffB:      ["ui", 207, 882, 133, 139],
  puffC:      ["ui", 370, 901, 124, 103],
  puffStars:  ["ui", 522, 921, 178, 102],
};

// The six ants and their berries share an index, so an ant's color and the
// berry fired at it always match.
const ANT_X = [37, 259, 487, 717, 951, 1185];
const BERRY_X = [82, 207, 333, 456, 580, 707];
for (let i = 0; i < 6; i++) {
  FRAMES["ant" + i] = ["chars", ANT_X[i], 598, 200, 195];
  FRAMES["berry" + i] = ["chars", BERRY_X[i], 916, 82, 118];
}

const ANT_TINT = ["#D8352A", "#2E6FD0", "#4E9E32", "#E8B31C", "#8B4FB0", "#E8752A"];

const Sprites = {
  ready: false,
  images: {},
  frames: {},

  // Knock the sheet's own background out to transparency.
  //
  // `softShadow` runs a second pass afterwards for sheets where the artist
  // painted a drop shadow onto the cream. Those pixels are not the background
  // color, so the first fill leaves them, and over grass they read as a pale
  // smudge under each sprite. The pass floods in from the now-transparent
  // background through light, weakly-colored pixels and rewrites them as a
  // translucent dark shadow — so the sprite sits on the ground instead of
  // floating. Connectivity is what makes the loose color test safe: eyes,
  // teeth and bellies are all fenced in by dark outlines, so the fill can
  // never reach them however close their color is to the shadow's.
  key(img, softShadow = false) {
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const id = g.getImageData(0, 0, W, H);
    const d = id.data;
    const bg = [d[0], d[1], d[2]];
    const TOL = 26;
    const near = (i) => Math.abs(d[i] - bg[0]) < TOL &&
                        Math.abs(d[i + 1] - bg[1]) < TOL &&
                        Math.abs(d[i + 2] - bg[2]) < TOL;
    // Typed-array stack of pixel indices, marking each pixel before it is
    // pushed. Pushing neighbors unconditionally lets the same pixel queue up
    // to four times, which on a sheet this size runs to tens of millions of
    // entries and takes seconds.
    const seen = new Uint8Array(W * H);
    const st = new Int32Array(W * H);
    let sp = 0;
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const q = y * W + x;
      if (seen[q] || !near(q * 4)) return;
      seen[q] = 1;
      st[sp++] = q;
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
    while (sp > 0) {
      const q = st[--sp];
      d[q * 4 + 3] = 0;
      const x = q % W, y = (q / W) | 0;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    if (softShadow) {
      const SHADOW = [58, 42, 26];
      const lit = (i) => {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const lum = 0.30 * r + 0.59 * gg + 0.11 * b;
        const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
        return lum > 175 && sat < 90 ? lum : -1;
      };
      sp = 0;
      const push2 = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const q = y * W + x;
        if (seen[q]) return;
        if (lit(q * 4) < 0) return;
        seen[q] = 1;
        st[sp++] = q;
      };
      // Seed from every transparent pixel that borders something still opaque.
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (d[(y * W + x) * 4 + 3] !== 0) continue;
          push2(x + 1, y); push2(x - 1, y); push2(x, y + 1); push2(x, y - 1);
        }
      }
      while (sp > 0) {
        const q = st[--sp], i = q * 4;
        // Darker shadow pixels keep more of their weight; the pale outer
        // fringe fades away to nothing.
        const lum = lit(i);
        const a = Math.max(0, Math.min(120, Math.round((250 - lum) * 2.6)));
        d[i] = SHADOW[0]; d[i + 1] = SHADOW[1]; d[i + 2] = SHADOW[2]; d[i + 3] = a;
        const x = q % W, y = (q / W) | 0;
        push2(x + 1, y); push2(x - 1, y); push2(x, y + 1); push2(x, y - 1);
      }
    }

    g.putImageData(id, 0, 0);
    return c;
  },

  load() {
    const t0 = performance.now();
    const names = Object.keys(SHEETS);
    return Promise.all(names.map(name => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        // The background is a finished painting and needs no keying. Only the
        // character sheet gets the shadow pass — the UI sheet's puffs and
        // panels are light shapes that reach the sheet edge, and would be
        // read as shadow and dissolved.
        this.images[name] = (name === "bg") ? img : this.key(img, name === "chars");
        res();
      };
      img.onerror = () => { this.images[name] = null; res(); };
      img.src = SHEETS[name];
    }))).then(() => {
      for (const [key, [sheet, x, y, w, h]] of Object.entries(FRAMES)) {
        const img = this.images[sheet];
        const nom = SHEET_NOMINAL[sheet];
        const k = (img && nom) ? img.width / nom[0] : 1;
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

  // Draw a frame centered on (cx, cy), scaled so its height is `targetH`.
  // `flip` mirrors it, which is how an ant faces the way it is walking.
  draw(ctx, key, cx, cy, targetH, flip = false, alpha = 1) {
    const f = this.frames[key];
    if (!f || !f.img) return;
    const s = targetH / f.h;
    const w = f.w * s, h = f.h * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, -w / 2, -h / 2, w, h);
    ctx.restore();
  },

  // Draw a frame into a box, matching its aspect ratio to the box height.
  drawAt(ctx, key, x, y, targetH, alpha = 1) {
    const f = this.frames[key];
    if (!f || !f.img) return { w: 0, h: 0 };
    const s = targetH / f.h;
    const w = f.w * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(f.img, f.x, f.y, f.w, f.h, x, y, w, targetH);
    ctx.restore();
    return { w, h: targetH };
  },

  frameAspect(key) {
    const f = this.frames[key];
    return f ? f.w / f.h : 1;
  },
};
