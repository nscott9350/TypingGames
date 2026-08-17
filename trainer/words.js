// ============================================================
// The trainer's word pool.
//
// Builds on the shared sets the games use, but they are not enough on their
// own here. The games pick words at random, so a thin letter is invisible —
// it just turns up rarely. The trainer does the opposite: when it finds your
// weak key it goes looking for words that contain it, and a letter the pool
// barely covers collapses into the same few words over and over. The shared
// sets carry q in five words and z in twelve, which is a loop, not a drill.
//
// So the supplement below is deliberately lopsided. It is not more general
// vocabulary; it is depth on the letters that are both rare in English and
// awkward to reach, so there is always somewhere to go when one of them is
// what you are getting wrong.
// ============================================================

// Grouped by the letter each block exists to cover, which is the only reason
// any of these are here. Words are ordinary English kept to lowercase a-z:
// the trainer teaches letter reaches, and punctuation is a different skill.
const TRAINER_SUPPLEMENT = [
  // ---- q: the worst covered, and always a two-key reach with u ----
  "quick", "queen", "quiet", "quite", "quilt", "quote", "quest", "query",
  "queue", "quart", "quail", "quake", "qualm", "quirk", "quota", "quiz",
  "squad", "squat", "squid", "equal", "equip", "aqua", "quickly", "quietly",
  "liquid", "unique", "square", "quarter", "question", "require", "request",
  "acquire", "antique", "quality", "quantity", "quiver", "quartz", "quaint",
  "conquer", "frequent", "sequence", "banquet", "bouquet", "inquiry",
  "equator", "adequate", "eloquent", "quotient", "mosquito", "squeeze",

  // ---- z: mostly a pinky drop, and doubled in half the words that use it ----
  "zone", "zero", "zoom", "zest", "zinc", "zebra", "zipper", "zenith",
  "buzz", "fuzz", "jazz", "fizz", "size", "maze", "gaze", "haze", "daze",
  "lazy", "hazy", "cozy", "dozen", "prize", "seize", "blaze", "graze",
  "freeze", "frozen", "amaze", "crazy", "dizzy", "fizzy", "muzzle", "nozzle",
  "puzzle", "dazzle", "drizzle", "grizzly", "horizon", "magazine", "organize",
  "realize", "citizen", "hazard", "wizard", "blizzard", "gazette", "zombie",
  "azure", "bronze", "snooze", "breeze",

  // ---- x: ring finger, bottom row, and common in ex- prefixes ----
  "box", "fox", "fix", "mix", "six", "tax", "wax", "exit", "next", "text",
  "flex", "flax", "apex", "axle", "oxen", "toxic", "extra", "index", "relax",
  "exact", "expel", "exile", "mixer", "boxer", "excel", "exert", "sixty",
  "expand", "expect", "export", "extend", "extent", "oxygen", "exhale",
  "exceed", "excuse", "exhaust", "example", "explain", "explore", "express",
  "extreme", "maximum", "complex", "context", "texture", "mixture", "anxious",
  "exhibit", "luxury", "galaxy", "matrix", "vertex", "vortex", "exchange",

  // ---- j: index finger, but a reach up off home and rarely practiced ----
  "jam", "jar", "jaw", "jet", "job", "jog", "joy", "jug", "jump", "just",
  "join", "joke", "jolt", "junk", "jury", "july", "judge", "juice", "jewel",
  "joint", "major", "enjoy", "eject", "inject", "reject", "object", "subject",
  "project", "journey", "justice", "junior", "jacket", "jungle", "joyful",
  "jigsaw", "adjust", "banjo", "majesty", "injury", "journal", "jealous",
  "jumper", "junkyard", "adjacent", "objective", "juggle", "jasmine",

  // ---- v: index finger dropping to the bottom row, a common weak spot ----
  "vex", "van", "vat", "vet", "via", "vibe", "view", "vine", "vote", "vast",
  "verb", "very", "vent", "veto", "void", "volt", "vowel", "value", "valve",
  "video", "virus", "visit", "vivid", "voice", "novel", "cover", "seven",
  "level", "never", "river", "silver", "clever", "drive", "above", "brave",
  "glove", "grave", "leave", "prove", "serve", "solve", "swerve", "travel",
  "vacuum", "valley", "vanish", "vector", "velvet", "vendor", "venture",
  "verify", "vessel", "victim", "victor", "violet", "virtue", "vision",
  "visual", "revive", "review", "involve", "private", "vertical", "vivify",

  // ---- k: fine on its own, awkward in the clusters English puts it in ----
  "kid", "kit", "key", "kin", "keep", "kick", "kind", "king", "kiss", "kite",
  "knee", "knit", "knot", "know", "back", "dark", "desk", "disk", "duck",
  "folk", "fork", "hawk", "lake", "like", "lock", "look", "luck", "make",
  "mark", "milk", "neck", "park", "pick", "pink", "rock", "sink", "sock",
  "take", "talk", "task", "walk", "week", "wick", "work", "black", "break",
  "brick", "check", "click", "clock", "drink", "knock", "knife", "market",
  "packet", "pocket", "rocket", "socket", "ticket", "kitchen", "kingdom",
  "keyboard", "knowledge", "kayak", "kernel", "kindle",

  // ---- Doubles and awkward runs: the transitions that break rhythm ----
  // Same finger twice, or two fingers crossing, which is where speed goes
  // even when every individual key in the word is one you are fine with.
  "bubble", "cabbage", "hobby", "rubber", "ladder", "sudden", "coffee",
  "office", "giggle", "bottle", "little", "kettle", "mammal",
  "summer", "hammer", "banner", "dinner", "runner", "copper", "happen",
  "pepper", "arrow", "carry", "hurry", "sorry", "lesson", "message",
  "pressure", "better", "letter", "matter", "settle", "attend", "bitter",
  "swift", "swing", "sword", "twist", "twelve", "wrist", "wrong", "yacht",
  "rhythm", "myth", "syrup", "system", "crypt", "gypsy", "nymph",
  "plunge", "sponge", "strength", "through", "thought", "thrust", "scratch",
  "stretch", "splash", "spring", "strange", "struggle", "shrink", "shrug",
];

/**
 * The flat pool the trainer samples from: the shared sets plus the
 * supplement, deduplicated.
 *
 * Length is capped at ten. Longer words are not harder in an interesting way
 * — they are the same reaches for longer — and they make a miss expensive,
 * which pushes you into typing carefully rather than naturally.
 */
function trainerWordPool() {
  const seen = new Set();
  const pool = [];
  const add = (w) => {
    if (seen.has(w) || !/^[a-z]{2,10}$/.test(w)) return;
    seen.add(w);
    pool.push(w);
  };

  for (const set of Object.values(WORD_SETS)) {
    for (const bucket of Object.values(set.pools)) bucket.forEach(add);
  }
  TRAINER_SUPPLEMENT.forEach(add);

  return pool;
}
