/**
 * Archetype & Theme Detection Rules
 * 
 * Rules for detecting archetypes and themes from card oracle text.
 * Each rule defines patterns to match and a minimum count threshold.
 */

export interface DetectionRule {
  // Patterns to match in oracle text (case-insensitive)
  patterns: (string | RegExp)[];
  // Minimum number of matching cards to trigger
  threshold: number;
  // Description for reporting
  description: string;
}

export interface ArchetypeChecklist {
  // Component requirements (all must be present)
  components: {
    name: string;
    patterns: (string | RegExp)[];
    minCount: number;
  }[];
  description: string;
}

// ============================================================
// THEME DETECTION RULES
// Themes are detected by counting cards with matching patterns
// ============================================================

export const themeRules: Record<string, DetectionRule> = {
  // Card type themes
  artifacts: {
    patterns: ["artifact", /\bartifacts?\b/i],
    threshold: 8,
    description: "Artifact synergies",
  },
  enchantments: {
    patterns: ["enchantment", /\benchantments?\b/i],
    threshold: 8,
    description: "Enchantment synergies",
  },
  equipment: {
    patterns: ["equipment", "equip", "equipped creature"],
    threshold: 5,
    description: "Equipment focus",
  },
  auras: {
    patterns: ["aura", "enchant creature", "enchanted creature"],
    threshold: 5,
    description: "Aura focus",
  },

  // Mechanic themes
  counters: {
    patterns: ["+1/+1 counter", "-1/-1 counter", "counter on"],
    threshold: 6,
    description: "+1/+1 or -1/-1 counter synergies",
  },
  tokens: {
    patterns: ["create", "token", /\d+\/\d+ .* token/i],
    threshold: 8,
    description: "Token generation",
  },
  sacrifice: {
    patterns: ["sacrifice", "sacrificed", "when .* dies"],
    threshold: 6,
    description: "Sacrifice synergies",
  },
  graveyard: {
    patterns: [
      "from your graveyard",
      "graveyard to the battlefield",
      "in your graveyard",
      "return .* from .* graveyard",
    ],
    threshold: 6,
    description: "Graveyard interaction",
  },
  blink: {
    patterns: [
      "exile .* return",
      "flicker",
      "enters the battlefield",
      "leaves the battlefield",
    ],
    threshold: 6,
    description: "Blink/flicker effects",
  },
  "card-draw": {
    patterns: ["draw a card", "draw cards", "draws a card", "draw two"],
    threshold: 10, // Higher threshold — card draw is everywhere
    description: "Card draw focus",
  },
  treasure: {
    patterns: ["treasure", "treasure token"],
    threshold: 5,
    description: "Treasure generation",
  },
  food: {
    patterns: ["food", "food token"],
    threshold: 4,
    description: "Food token synergies",
  },
  clones: {
    patterns: ["copy of", "becomes a copy", "clone"],
    threshold: 4,
    description: "Clone/copy effects",
  },
  "topdeck-matters": {
    patterns: ["top of your library", "look at the top", "reveal the top"],
    threshold: 5,
    description: "Topdeck manipulation",
  },
  energy: {
    patterns: ["energy counter", "{e}"],
    threshold: 4,
    description: "Energy counter synergies",
  },
  cascade: {
    patterns: ["cascade"],
    threshold: 3,
    description: "Cascade synergies",
  },
  flashback: {
    patterns: ["flashback"],
    threshold: 4,
    description: "Flashback synergies",
  },
  madness: {
    patterns: ["madness", "discard"],
    threshold: 5,
    description: "Madness/discard synergies",
  },
  morph: {
    patterns: ["morph", "face down", "manifest"],
    threshold: 4,
    description: "Morph/manifest synergies",
  },
  mutate: {
    patterns: ["mutate"],
    threshold: 4,
    description: "Mutate synergies",
  },
  "experience-counters": {
    patterns: ["experience counter"],
    threshold: 1, // Commander mechanic, low threshold
    description: "Experience counter synergies",
  },
  venture: {
    patterns: ["venture into the dungeon", "dungeon"],
    threshold: 3,
    description: "Venture/dungeon synergies",
  },
  proliferate: {
    patterns: ["proliferate"],
    threshold: 3,
    description: "Proliferate synergies",
  },
  populate: {
    patterns: ["populate"],
    threshold: 3,
    description: "Populate synergies",
  },

  // Combat themes
  flying: {
    patterns: ["flying", "creature with flying"],
    threshold: 10,
    description: "Flying creatures focus",
  },
  deathtouch: {
    patterns: ["deathtouch"],
    threshold: 5,
    description: "Deathtouch synergies",
  },
  "power-matters": {
    patterns: ["power is", "equal to its power", "power or greater"],
    threshold: 4,
    description: "Power-matters synergies",
  },
  "toughness-matters": {
    patterns: ["toughness is", "equal to its toughness", "defender"],
    threshold: 4,
    description: "Toughness/defender synergies",
  },
  haste: {
    patterns: ["haste", "creatures you control have haste"],
    threshold: 5,
    description: "Haste focus",
  },
  flash: {
    patterns: ["flash", "as though it had flash"],
    threshold: 5,
    description: "Flash focus",
  },

  // Lands themes
  landfall: {
    patterns: ["landfall", "whenever a land enters"],
    threshold: 4,
    description: "Landfall triggers",
  },
  "lands-matter": {
    patterns: [
      "landfall",
      "lands you control",
      "whenever a land enters the battlefield under your control",
      "play an additional land",
    ],
    threshold: 5,
    description: "Land synergies (not just basic ramp)",
  },
};

// ============================================================
// ARCHETYPE CHECKLISTS
// Archetypes require multiple components to be present
// ============================================================

export const archetypeChecklists: Record<string, ArchetypeChecklist> = {
  aristocrats: {
    components: [
      {
        name: "sacrifice outlets",
        patterns: ["sacrifice a creature", "sacrifice another", "you may sacrifice", ", sacrifice"],
        minCount: 3,
      },
      {
        name: "death triggers",
        patterns: ["control dies", "creature dies", "dies,", "when it dies"],
        minCount: 3,
      },
      {
        name: "fodder/recursion",
        patterns: ["create a", "token"],
        minCount: 4,
      },
    ],
    description: "Sacrifice-based value engine",
  },

  voltron: {
    components: [
      {
        name: "equipment/auras",
        patterns: ["equip", "equipment", "enchant creature", "aura"],
        minCount: 5,
      },
      {
        name: "stat boosts",
        patterns: [
          "gets +",
          "+1/+1",
          "double strike",
          "trample",
          "hexproof",
          "indestructible",
        ],
        minCount: 4,
      },
    ],
    description: "Single-creature pump strategy",
  },

  reanimator: {
    components: [
      {
        name: "reanimation effects",
        patterns: [
          "return .* from .* graveyard to the battlefield",
          "graveyard to the battlefield",
          "reanimate",
        ],
        minCount: 4,
      },
      {
        name: "self-mill/discard",
        patterns: [
          "mill",
          "put .* into your graveyard",
          "discard",
          "from your library into your graveyard",
        ],
        minCount: 2,
      },
    ],
    description: "Graveyard recursion strategy",
  },

  spellslinger: {
    components: [
      {
        name: "spell triggers",
        patterns: [
          "cast an instant or sorcery",
          "whenever you cast",
          "instant and sorcery",
          "noncreature spell",
        ],
        minCount: 4,
      },
      {
        name: "spell payoffs",
        patterns: [
          "copy",
          "deals damage",
          "draw a card",
          "magecraft",
          "storm",
        ],
        minCount: 3,
      },
    ],
    description: "Instant/sorcery focused strategy",
  },

  combo: {
    components: [
      {
        name: "tutors",
        patterns: [
          "search your library",
          "tutor",
          "find a card",
        ],
        minCount: 3,
      },
      {
        name: "infinite enablers",
        patterns: [
          "untap",
          "additional",
          "copy",
          "whenever .* add",
          "doesn't untap",
        ],
        minCount: 3,
      },
    ],
    description: "Combo-oriented strategy",
  },

  control: {
    components: [
      {
        name: "removal",
        patterns: [
          "destroy target",
          "exile target",
          "counter target spell",
          "return target .* to its owner's hand",
        ],
        minCount: 6,
      },
      {
        name: "card advantage",
        patterns: ["draw .* cards", "scry", "look at the top .* cards"],
        minCount: 4,
      },
    ],
    description: "Control/interaction heavy strategy",
  },

  aggro: {
    components: [
      {
        name: "cheap threats",
        patterns: ["haste", "first strike", "double strike", "menace"],
        minCount: 4,
      },
      {
        name: "damage amplifiers",
        patterns: [
          "deals .* additional",
          "combat damage",
          "attacking",
          "extra combat",
        ],
        minCount: 3,
      },
    ],
    description: "Aggressive combat strategy",
  },

  ramp: {
    components: [
      {
        name: "mana acceleration",
        patterns: [
          "add .* mana",
          "search your library for a .* land .* onto the battlefield",
          "put .* land .* onto the battlefield",
          "for each land you control",
        ],
        minCount: 7,
      },
      {
        name: "big payoffs",
        patterns: [
          "mana value .* or greater",
          "high mana value",
        ],
        minCount: 1,
      },
    ],
    description: "Mana ramp into big threats",
  },

  "lands-matter": {
    components: [
      {
        name: "land synergy",
        patterns: [
          "landfall",
          "whenever a land enters the battlefield under your control",
          "lands you control",
          "play an additional land",
          "land from your graveyard",
        ],
        minCount: 6,
      },
      {
        name: "land payoffs",
        patterns: [
          "for each land",
          "equal to the number of lands",
          "sacrifice a land",
        ],
        minCount: 2,
      },
    ],
    description: "Land-focused synergy strategy",
  },

  "legendary-matters": {
    components: [
      {
        name: "legend synergy",
        patterns: [
          "legendary",
          "legendary creature",
          "legendary permanent",
        ],
        minCount: 6,
      },
      {
        name: "legend payoffs",
        patterns: [
          "for each legendary",
          "whenever you cast a legendary",
        ],
        minCount: 2,
      },
    ],
    description: "Legendary permanents matter",
  },

  "group-hug": {
    components: [
      {
        name: "symmetrical benefits",
        patterns: [
          "each player draws",
          "each player may",
          "all players",
        ],
        minCount: 4,
      },
    ],
    description: "Group hug / political strategy",
  },

  "group-slug": {
    components: [
      {
        name: "symmetrical damage",
        patterns: [
          "each player loses",
          "each opponent loses",
          "deals .* damage to each",
          "whenever a player",
        ],
        minCount: 5,
      },
    ],
    description: "Group slug / burn everyone strategy",
  },

  mill: {
    components: [
      {
        name: "mill effects",
        patterns: [
          "mill",
          "put .* from .* library into .* graveyard",
          "cards from the top of their library",
        ],
        minCount: 4,
      },
      {
        name: "mill payoffs",
        patterns: [
          "for each card",
          "cards in .* graveyard",
          "wins the game",
        ],
        minCount: 2,
      },
    ],
    description: "Mill strategy",
  },

  lifegain: {
    components: [
      {
        name: "lifegain sources",
        patterns: ["gain .* life", "lifelink", "you gain life"],
        minCount: 5,
      },
      {
        name: "lifegain payoffs",
        patterns: [
          "whenever you gain life",
          "life you've gained",
          "pay .* life",
        ],
        minCount: 3,
      },
    ],
    description: "Lifegain synergy strategy",
  },

  enchantress: {
    components: [
      {
        name: "enchantment synergy",
        patterns: [
          "enchantment",
          "whenever you cast an enchantment",
          "enchantments you control",
        ],
        minCount: 6,
      },
      {
        name: "enchantress effects",
        patterns: ["draw a card", "constellation", "whenever an enchantment"],
        minCount: 3,
      },
    ],
    description: "Enchantment-focused value",
  },

  stax: {
    components: [
      {
        name: "tax effects",
        patterns: [
          "pay .* more to cast",
          "costs .* more to cast",
          "can't cast",
          "don't untap during",
          "skip .* untap step",
          "enters the battlefield tapped",
        ],
        minCount: 4,
      },
      {
        name: "asymmetry",
        patterns: ["each opponent", "opponents can't", "opponents control"],
        minCount: 2,
      },
    ],
    description: "Resource denial strategy",
  },

  blink: {
    components: [
      {
        name: "blink effects",
        patterns: [
          "exile .* return",
          "flicker",
          "exile target creature .* return",
        ],
        minCount: 4,
      },
      {
        name: "ETB payoffs",
        patterns: [
          "enters the battlefield",
          "when .* enters",
          "ETB",
        ],
        minCount: 5,
      },
    ],
    description: "Blink/flicker value strategy",
  },

  theft: {
    components: [
      {
        name: "theft effects",
        patterns: [
          "gain control",
          "control of target",
          "opponent controls",
          "steal",
        ],
        minCount: 4,
      },
    ],
    description: "Theft/control-change strategy",
  },

  wheels: {
    components: [
      {
        name: "wheel effects",
        patterns: [
          "each player discards",
          "discard .* hand .* draw",
          "wheel",
        ],
        minCount: 3,
      },
      {
        name: "discard payoffs",
        patterns: ["whenever .* discards", "madness", "whenever you draw"],
        minCount: 2,
      },
    ],
    description: "Wheel/discard strategy",
  },
};

// Staples to exclude from analysis
export const STAPLES = [
  "Sol Ring",
  "Arcane Signet",
  "Command Tower",
  "Exotic Orchard",
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
];
