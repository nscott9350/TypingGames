// Word pools by difficulty. All lowercase a-z, no punctuation.
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
