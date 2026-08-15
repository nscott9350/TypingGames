// ============================================================
// On-screen keyboard guide — shared by both games.
//
// Drawn large and faint across the middle of the field, behind the action.
// A small keyboard tucked along the bottom edge still costs you a glance
// down, which is exactly the habit this is meant to break; sitting it in the
// field you are already watching means you catch the lit key in peripheral
// vision without moving your eyes.
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

function keyboardGuideHeight(width, showSpace = true) {
  const u = width / 10.6;
  const keyH = u * 0.9;
  const gap = u * 0.1;
  return 3 * (keyH + gap) + (showSpace ? keyH * 0.72 + gap : 0) + gap * 2;
}

// Centred across the play field and sized to it, rather than a strip pinned
// to an edge. Nothing needs to reserve space for this: it is a watermark and
// the game draws over the top of it.
function keyboardGuideLayout(canvasWidth, canvasHeight, showSpace = true) {
  const w = Math.min(canvasWidth * 0.8, canvasHeight * 1.5, 980);
  const h = keyboardGuideHeight(w, showSpace);
  return { w, h, x: (canvasWidth - w) / 2, y: (canvasHeight - h) / 2 };
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
 *   x, y         top-left of the guide
 *   width        overall width
 *   next         the key that must be pressed now, or null
 *   options      other currently-valid keys — shown between faint and lit
 *   spaceReady   highlight the space bar (Squadron's juke)
 *   showSpace    draw the space bar at all
 *   opacity      how present the unlit keys are (this is a backdrop)
 *   highlight    how present the lit key is
 *   wrong        key just pressed in error, struck through until it fades
 *   wrongAlpha   how far through that fade we are, 1 down to 0
 *   mono         font stack
 */
const WRONG_COLOR = "#FF1744";

function drawKeyboardGuide(ctx, opts) {
  const { x, y, width, next = null, options = [], spaceReady = false,
          showSpace = true, opacity = 0.16, highlight = 0.9,
          wrong = null, wrongAlpha = 0, mono = "monospace" } = opts;
  const u = width / 10.6;
  const keyH = u * 0.9;
  const gap = u * 0.1;
  const optionSet = new Set(options);
  const optAlpha = Math.min(1, opacity * 2.2);

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
      const color = FINGER_COLOR[KEY_FINGER[key]] || "#B9A8E8";
      const isNext = next === key;
      const isOption = !isNext && optionSet.has(key);

      // Explicit alphas per layer, so the ordering can be read off directly:
      // the lit key is always the strongest, options sit between, and the
      // resting keys are barely there. The lit key's fill is translucent
      // rather than a solid block, but it is still the most filled thing on
      // screen — anything else inverts the hierarchy.
      const fillA   = isNext ? highlight * 0.5 : isOption ? opacity * 1.15 : opacity;
      const strokeA = isNext ? highlight       : isOption ? optAlpha       : opacity;
      const textA   = isNext ? highlight       : isOption ? optAlpha       : opacity;

      ctx.globalAlpha = fillA;
      ctx.fillStyle = (isNext || isOption) ? color : "rgba(255,255,255,0.05)";
      kbRoundRect(ctx, rx, ry, u * 0.9, keyH, u * 0.1);
      ctx.fill();

      // Every key keeps a tint of its finger colour, so the hand map stays
      // legible even when nothing is highlighted. The lit key keeps its own
      // finger colour rather than turning white, since which finger to use is
      // the thing worth learning.
      ctx.globalAlpha = strokeA;
      ctx.strokeStyle = color;
      ctx.lineWidth = isNext ? 3 : 1.5;
      kbRoundRect(ctx, rx, ry, u * 0.9, keyH, u * 0.1);
      ctx.stroke();

      if (HOME_KEYS.has(key) && !isNext) {
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        const bw = BUMP_KEYS.has(key) ? u * 0.26 : u * 0.36;
        const bh = BUMP_KEYS.has(key) ? 3.5 : 2;
        ctx.fillRect(rx + u * 0.45 - bw / 2, ry + keyH - u * 0.14, bw, bh);
      }

      ctx.globalAlpha = textA;
      ctx.font = `${isNext ? "bold " : ""}${Math.round(u * 0.4)}px ${mono}`;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(key.toUpperCase(), rx + u * 0.45, ry + keyH / 2 + 1);

      // A key just pressed in error is struck out where it sits, so the
      // mistake is attached to the place on the keyboard rather than being an
      // abstract penalty. Drawn over the letter, fading as it clears.
      if (wrong === key && wrongAlpha > 0) {
        const inset = u * 0.2;
        ctx.globalAlpha = wrongAlpha;
        ctx.fillStyle = WRONG_COLOR;
        kbRoundRect(ctx, rx, ry, u * 0.9, keyH, u * 0.1);
        ctx.fill();
        ctx.strokeStyle = WRONG_COLOR;
        ctx.lineWidth = 3;
        kbRoundRect(ctx, rx, ry, u * 0.9, keyH, u * 0.1);
        ctx.stroke();

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = Math.max(2, u * 0.075);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(rx + inset, ry + inset);
        ctx.lineTo(rx + u * 0.9 - inset, ry + keyH - inset);
        ctx.moveTo(rx + u * 0.9 - inset, ry + inset);
        ctx.lineTo(rx + inset, ry + keyH - inset);
        ctx.stroke();
      }

      rx += u;
    }
    ry += keyH + gap;
  }

  if (showSpace) {
    const spaceH = keyH * 0.72;
    const spaceW = u * 5.2;
    const sx = x + (width - spaceW) / 2;
    ctx.globalAlpha = spaceReady ? Math.min(1, opacity * 2) : opacity;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    kbRoundRect(ctx, sx, ry, spaceW, spaceH, u * 0.1);
    ctx.fill();
    ctx.strokeStyle = FINGER_COLOR.th;
    ctx.lineWidth = 1.5;
    kbRoundRect(ctx, sx, ry, spaceW, spaceH, u * 0.1);
    ctx.stroke();
    ctx.font = `${Math.round(u * 0.24)}px ${mono}`;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("SPACE", x + width / 2, ry + spaceH / 2 + 1);
  }

  ctx.restore();
}

function fingerLabelFor(key) {
  const f = KEY_FINGER[key];
  return f ? FINGER_NAME[f] : null;
}

function fingerColorFor(key) {
  const f = KEY_FINGER[key];
  return f ? FINGER_COLOR[f] : "#B9A8E8";
}
