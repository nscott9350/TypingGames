// ============================================================
// Word pools. All entries are lowercase a-z with no punctuation.
// ============================================================

// The default set: general vocabulary, already grouped by length.
const WORDS = {
  short: [
    "air", "ant", "arm", "art", "ash", "bag", "bat", "bed", "bee", "big",
    "box", "bus", "cab", "cap", "car", "cat", "cow", "cup", "day", "dog",
    "ear", "eat", "egg", "elk", "eye", "fan", "fig", "fin", "fly", "fog",
    "fox", "fun", "gap", "gas", "gem", "hat", "hen", "hip", "hot", "ice",
    "ink", "jam", "jar", "jet", "joy", "key", "kit", "lab", "leg", "lip",
    "log", "map", "mat", "mix", "mud", "net", "nut", "oak", "oar", "owl",
    "pan", "paw", "pen", "pig", "pin", "pot", "rat", "ray", "red", "rib",
    "rug", "run", "sea", "sky", "sun", "tab", "tan", "tar", "tea", "toe",
    "top", "toy", "urn", "van", "vat", "vet", "war", "wax", "web", "wig",
    "win", "yak", "yam", "zip", "zoo"
  ],
  medium: [
    "amber", "anchor", "apple", "arrow", "badge", "banjo", "basket", "beacon",
    "berry", "blaze", "bridge", "bronze", "cabin", "candle", "canyon", "castle",
    "cedar", "chair", "cliff", "cloud", "clover", "cobalt", "comet", "copper",
    "coral", "crane", "crater", "cricket", "crystal", "dagger", "dolphin",
    "dragon", "eagle", "ember", "engine", "falcon", "feather", "flame", "forest",
    "fossil", "galaxy", "garden", "geyser", "glacier", "goblet", "granite",
    "harbor", "hazard", "helmet", "honey", "island", "jacket", "jungle",
    "kettle", "knight", "lagoon", "lantern", "legend", "lemon", "lizard",
    "magnet", "mango", "marble", "meadow", "meteor", "mirror", "monkey",
    "nebula", "needle", "ocean", "orange", "orbit", "oyster", "panther",
    "pebble", "pepper", "phantom", "piano", "pirate", "planet", "plasma",
    "pocket", "prism", "puzzle", "python", "quartz", "quiver", "rabbit",
    "raven", "reef", "ridge", "river", "rocket", "saddle", "salmon", "shadow",
    "shield", "signal", "silver", "spider", "spiral", "stone", "storm",
    "summit", "sword", "temple", "thunder", "tiger", "timber", "torch",
    "tulip", "tunnel", "turtle", "valley", "velvet", "violet", "voyage",
    "walnut", "whale", "willow", "window", "winter", "wizard", "zephyr"
  ],
  long: [
    "adventure", "algorithm", "asteroid", "atmosphere", "avalanche",
    "blueprint", "boulevard", "butterfly", "carousel", "cathedral",
    "chandelier", "chemistry", "chocolate", "clockwork", "constellation",
    "crocodile", "dandelion", "discovery", "dynamite", "elephant",
    "evergreen", "explorer", "firecracker", "framework", "frequency",
    "grasshopper", "gravity", "harmonica", "horizon", "hurricane",
    "hypothesis", "illusion", "invention", "labyrinth", "lighthouse",
    "limestone", "machinery", "magnitude", "marathon", "microscope",
    "molecule", "momentum", "monument", "mountain", "navigator",
    "nightfall", "obsidian", "orchestra", "overdrive", "paradox",
    "parachute", "pendulum", "peninsula", "porcupine", "propeller",
    "quicksand", "quicksilver", "raspberry", "revolution", "sapphire",
    "satellite", "scaffold", "scorpion", "sculpture", "skeleton",
    "snowflake", "spacecraft", "spectrum", "starlight", "submarine",
    "symphony", "telescope", "territory", "tornado", "trajectory",
    "trampoline", "treasure", "turbulence", "umbrella", "universe",
    "velocity", "vertebrae", "volcano", "waterfall", "wavelength",
    "whirlpool", "wilderness", "xylophone", "zeppelin"
  ]
};

// ---- Drill sets ----
// Home row only (a s d f g h j k l): builds the anchor position.
const HOME_ROW_WORDS = [
  "ad", "add", "ads", "aha", "alas", "all", "ash", "ask", "dad", "dads",
  "dash", "fad", "fads", "fall", "falls", "flag", "flags", "flash", "flask",
  "flasks", "gag", "gags", "gal", "gala", "galas", "gas", "gash", "glad",
  "glads", "glass", "had", "hag", "hags", "haha", "half", "hall", "halls",
  "has", "hash", "jag", "jags", "lad", "lads", "lag", "lags", "lash", "lass",
  "sad", "sag", "sags", "salad", "salads", "salsa", "sash", "shad", "shag",
  "shall", "slag", "slash", "alfalfa"
];

// Left hand only (q w e r t / a s d f g / z x c v b).
const LEFT_HAND_WORDS = [
  "act", "add", "are", "art", "ate", "bad", "bag", "bar", "bat", "bed",
  "bet", "cab", "car", "cat", "ear", "eat", "egg", "era", "far", "fat",
  "few", "gas", "get", "saw", "sea", "see", "set", "sew", "tab", "tag",
  "tar", "tax", "tea", "vat", "wag", "war", "was", "wax", "web", "wed",
  "wet", "bare", "base", "bass", "bead", "bear", "beat", "beef", "best",
  "brag", "card", "care", "cart", "case", "cast", "cave", "crab", "dart",
  "data", "date", "dear", "debt", "deer", "draw", "east", "edge", "face",
  "fact", "fade", "fast", "fate", "fear", "feed", "feet", "gate", "gave",
  "gear", "grab", "grew", "race", "raft", "rage", "rate", "read", "rear",
  "seat", "seed", "star", "stag", "swat", "test", "text", "tree",
  "vase", "vast", "verb", "vest", "wage", "ward", "wave", "wear", "west",
  "badge", "barge", "beast", "brace", "brave", "bread", "cadet", "cease",
  "cedar", "crate", "crest", "dress", "dwarf", "eager", "erase", "exact",
  "fever", "grade", "grass", "grate", "great", "sweat", "swear", "tease",
  "treat", "waste", "water", "barter", "career", "create", "crater",
  "decade", "defeat", "desert", "detect", "drawer", "estate", "garage",
  "grease", "secret", "starve", "street", "swerve", "target", "average",
  "extract", "retreat"
];

// Right hand only (y u i o p / h j k l / n m).
const RIGHT_HAND_WORDS = [
  "him", "hip", "hop", "hum", "ill", "ink", "inn", "ion", "joy", "kin",
  "lip", "mom", "mop", "nip", "nun", "oil", "pin", "pop", "pun", "pup",
  "yip", "you", "yum", "hill", "holy", "honk", "hook", "hoop", "hump",
  "join", "july", "jump", "junk", "kilo", "lily", "limp", "link", "lion",
  "loin", "look", "loom", "loon", "loop", "lump", "milk", "mill", "mink",
  "monk", "moon", "noon", "null", "only", "pill", "pink", "plum", "plop",
  "ploy", "polo", "pony", "pool", "poll", "pomp", "pump", "punk", "upon",
  "yolk", "hilly", "holly", "jumpy", "junky", "lupin", "nylon", "onion",
  "opium", "phony", "pinky", "plump", "pupil", "union", "unpin", "hominy",
  "minion", "phylum", "unholy", "unhook", "unlink", "minimum", "opinion",
  "pumpkin", "monopoly"
];

// The most frequent English words: the ones worth building muscle memory for.
const COMMON_WORDS = [
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can",
  "had", "her", "was", "one", "our", "out", "day", "get", "has", "him",
  "his", "how", "man", "new", "now", "old", "see", "two", "way", "who",
  "boy", "did", "its", "let", "put", "say", "she", "too", "use", "that",
  "with", "have", "this", "will", "your", "from", "they", "know", "want",
  "been", "good", "much", "some", "time", "very", "when", "come", "here",
  "just", "like", "long", "make", "many", "over", "such", "take", "than",
  "them", "well", "were", "what", "work", "back", "call", "came", "each",
  "even", "find", "give", "hand", "high", "keep", "kind", "last", "left",
  "life", "live", "look", "made", "most", "move", "must", "name", "need",
  "next", "open", "part", "play", "read", "real", "said", "same", "seem",
  "show", "side", "tell", "turn", "used", "want", "week", "went", "word",
  "year", "about", "after", "again", "could", "every", "first", "found",
  "great", "house", "large", "learn", "never", "other", "place", "plant",
  "point", "right", "small", "sound", "spell", "still", "study", "their",
  "there", "these", "thing", "think", "three", "under", "water", "where",
  "which", "while", "world", "would", "write", "years", "young", "always",
  "animal", "answer", "around", "because", "before", "better", "between",
  "change", "enough", "example", "family", "father", "follow", "friend",
  "letter", "little", "mother", "number", "people", "picture", "second",
  "should", "through", "together", "another", "children", "important",
  "sentence", "something", "sometimes", "different"
];

// Split a flat list into the short/medium/long buckets the spawner expects.
function bucketByLength(words) {
  const pools = { short: [], medium: [], long: [] };
  for (const w of words) {
    if (w.length <= 4) pools.short.push(w);
    else if (w.length <= 7) pools.medium.push(w);
    else pools.long.push(w);
  }
  return pools;
}

const WORD_SETS = {
  all:     { label: "All words",   pools: WORDS },
  common:  { label: "Common",      pools: bucketByLength(COMMON_WORDS) },
  homerow: { label: "Home row",    pools: bucketByLength(HOME_ROW_WORDS) },
  left:    { label: "Left hand",   pools: bucketByLength(LEFT_HAND_WORDS) },
  right:   { label: "Right hand",  pools: bucketByLength(RIGHT_HAND_WORDS) },
};
