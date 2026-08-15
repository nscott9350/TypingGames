// ============================================================
// On-screen keyboard guide — shared by both games.
//
// The point is not to show where a letter lives, it is to show which finger
// owns it. Looking down teaches you the map; colour-coding by finger teaches
// you the habit, which is the thing that actually transfers.
// ============================================================

// Standard touch-typing finger assignments for the letter keys.
const KEY_FINGER = {
  q: "lp", a: "lp", z: "lp",
  w: "lr", s: "lr", x: "lr",
  e: "lm", d: "lm", c: "lm",
  r: "li", f: "li", v: "li", t: "li", g: "li", b: "li",
  y: "ri", h: "ri", n: "ri", u: "ri", j: "ri", m: "ri",
  i: "rm", k: "rm",
  o: "rr", l: "rr",
  p: "rpk",
};

const FINGER_COLOR = {
  lp:  "#FF5FA2",   // left pinky
  lr:  "#FFA23D",   // left ring
  lm:  "#FFE600",   // left middle
  li:  "#7CFF3D",   // left index
  ri:  "#00E5FF",   // right index
  rm:  "#4D8CFF",   // right middle
  rr:  "#9D00FF",   // right ring
  rpk: "#FF3355",   // right pinky
  th:  "#B9A8E8",   // thumbs
};

const FINGER_NAME = {
  lp: "L pinky", lr: "L ring", lm: "L middle", li: "L index",
  ri: "R index", rm: "R middle", rr: "R ring", rpk: "R pinky", th: "Thumb",
};

const KEY_ROWS = [
  ["q","w","e","r","t","y","u","i","o","p"],
  ["a","s","d","f","g","h","j","k","l"],
  ["z","x","c","v","b","n","m"],
];

// Where the fingers rest. F and J carry the raised bumps on a real keyboard,
// which is how you find home position without looking.
const HOME_KEYS = new Set(["a","s","d","f","j","k","l"]);
const BUMP_KEYS = new Set(["f","j"]);

function kbUnit(width) {
  return Math.min(46, width / 10.6);
}

// Total height the guide will occupy for a given width, so callers can lay
// out around it rather than have it cover the play area.
function keyboardGuideHeight(width, showSpace = true) {
  const u = kbUnit(width);
  const keyH = u * 0.9;
  const gap = u * 0.1;
  return 3 * (keyH + gap) + (showSpace ? keyH * 0.72 + gap : 0) + gap * 2;
}

function keyboardGuideWidth(canvasWidth) {
  return Math.min(500, canvasWidth * 0.62);
}

function kbRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * opts:
 *   x, y        top-left of the guide
 *   width       overall width
 *   next        the single key that must be pressed now (string) or null
 *   options     other currently-valid keys (array) — shown dimmer
 *   spaceReady  highlight the space bar (Squadron's juke)
 *   showSpace   draw the space bar at all
 *   mono        font stack
 */
function drawKeyboardGuide(ctx, opts) {
  const { x, y, width, next = null, options = [], spaceReady = false,
          showSpace = true, mono = "monospace" } = opts;
  const u = kbUnit(width);
  const keyH = u * 0.9;
  const gap = u * 0.1;
  const optionSet = new Set(options);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let ry = y + gap;
  for (let r = 0; r < KEY_ROWS.length; r++) {
    const row = KEY_ROWS[r];
    // Stagger the rows the way a real keyboard does
    const indent = [0, u * 0.38, u * 0.95][r];
    let rx = x + indent;
    for (const key of row) {
      const finger = KEY_FINGER[key];
      const color = FINGER_COLOR[finger] || "#B9A8E8";
      const isNext = next === key;
      const isOption = !isNext && optionSet.has(key);

      // Body
      ctx.fillStyle = isNext ? color
                    : isOption ? `${color}44`
                    : "rgba(255,255,255,0.045)";
      kbRoundRect(ctx, rx, ry, u * 0.9, keyH, 5);
      ctx.fill();

      // Edge: every key keeps a faint tint of its finger colour, so the
      // hand map is legible even when nothing is highlighted.
      ctx.strokeStyle = isNext ? "#FFFFFF"
                      : isOption ? `${color}CC`
                      : `${color}3A`;
      ctx.lineWidth = isNext ? 2 : 1;
      kbRoundRect(ctx, rx, ry, u * 0.9, keyH, 5);
      ctx.stroke();

      // Home-row marker
      if (HOME_KEYS.has(key) && !isNext) {
        ctx.fillStyle = `${color}55`;
        ctx.fillRect(rx + u * 0.28, ry + keyH - 5, u * 0.34, 2);
      }
      if (BUMP_KEYS.has(key) && !isNext) {
        ctx.fillStyle = `${color}AA`;
        ctx.fillRect(rx + u * 0.34, ry + keyH - 5, u * 0.22, 2.5);
      }

      // Letter
      ctx.font = `${isNext ? "bold " : ""}${Math.round(u * 0.42)}px ${mono}`;
      ctx.fillStyle = isNext ? "#0B0212"
                    : isOption ? "#FFFFFF"
                    : "rgba(255,255,255,0.5)";
      ctx.fillText(key.toUpperCase(), rx + u * 0.45, ry + keyH / 2 + 1);

      rx += u;
    }
    ry += keyH + gap;
  }

  if (showSpace) {
    const spaceH = keyH * 0.72;
    const spaceW = u * 5.2;
    const sx = x + (width - spaceW) / 2;
    ctx.fillStyle = spaceReady ? `${FINGER_COLOR.th}33` : "rgba(255,255,255,0.045)";
    kbRoundRect(ctx, sx, ry, spaceW, spaceH, 5);
    ctx.fill();
    ctx.strokeStyle = spaceReady ? `${FINGER_COLOR.th}AA` : `${FINGER_COLOR.th}3A`;
    ctx.lineWidth = 1;
    kbRoundRect(ctx, sx, ry, spaceW, spaceH, 5);
    ctx.stroke();
    ctx.font = `${Math.round(u * 0.26)}px ${mono}`;
    ctx.fillStyle = spaceReady ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.35)";
    ctx.fillText("SPACE", x + width / 2, ry + spaceH / 2 + 1);
  }

  ctx.restore();
}

// A one-line prompt naming the finger for the current key, for players who
// are still learning which finger owns what.
function fingerLabelFor(key) {
  const f = KEY_FINGER[key];
  return f ? FINGER_NAME[f] : null;
}

function fingerColorFor(key) {
  const f = KEY_FINGER[key];
  return f ? FINGER_COLOR[f] : "#B9A8E8";
}
