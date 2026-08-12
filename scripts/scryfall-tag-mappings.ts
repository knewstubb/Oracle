/**
 * Scryfall Oracle Tag → Archetype/Theme Mappings
 * 
 * Maps Scryfall's community-curated oracle tags to our archetype/theme taxonomy.
 * These mappings are used to analyze build cards for secondary archetype detection.
 */

// Tags that indicate ARCHETYPE tendencies
// Key: Scryfall tag slug, Value: { archetypes, weight }
// Weight: how strongly this tag signals the archetype (1-3)
export const archetypeTagMappings: Record<string, { archetypes: string[]; weight: number }> = {
  // === ARISTOCRATS ===
  "sacrifice outlet-creature": { archetypes: ["aristocrats"], weight: 3 },
  "sacrifice outlet-artifact": { archetypes: ["aristocrats"], weight: 2 },
  "sacrifice outlet-permanent": { archetypes: ["aristocrats"], weight: 2 },
  "sacrifice outlet-token": { archetypes: ["aristocrats"], weight: 2 },
  "free sacrifice outlet": { archetypes: ["aristocrats"], weight: 3 },
  "repeatable sacrifice outlet": { archetypes: ["aristocrats"], weight: 3 },
  "death trigger": { archetypes: ["aristocrats"], weight: 3 },
  "death trigger-self": { archetypes: ["aristocrats"], weight: 2 },
  "death trigger opponent": { archetypes: ["aristocrats"], weight: 2 },
  "blood artist ability": { archetypes: ["aristocrats"], weight: 3 },
  "grave pact": { archetypes: ["aristocrats"], weight: 3 },
  "your sacrifice matters": { archetypes: ["aristocrats"], weight: 3 },
  "sacrifice matters": { archetypes: ["aristocrats"], weight: 2 },
  "martyr": { archetypes: ["aristocrats"], weight: 2 },

  // === REANIMATOR ===
  "reanimate-creature": { archetypes: ["reanimator"], weight: 3 },
  "reanimate-any": { archetypes: ["reanimator"], weight: 3 },
  "reanimate-artifact": { archetypes: ["reanimator"], weight: 2 },
  "recursion": { archetypes: ["reanimator"], weight: 2 },
  "castable from graveyard": { archetypes: ["reanimator", "spellslinger"], weight: 2 },
  "mill-self": { archetypes: ["reanimator"], weight: 2 },
  "affinity for graveyard": { archetypes: ["reanimator"], weight: 2 },

  // === SPELLSLINGER ===
  "cast trigger-you": { archetypes: ["spellslinger"], weight: 2 },
  "magecraft": { archetypes: ["spellslinger"], weight: 3 },
  "storm": { archetypes: ["spellslinger"], weight: 3 },
  "synergy-instant": { archetypes: ["spellslinger"], weight: 2 },
  "synergy-sorcery": { archetypes: ["spellslinger"], weight: 2 },
  "cantrip": { archetypes: ["spellslinger"], weight: 1 },
  "prowess anthem": { archetypes: ["spellslinger"], weight: 3 },
  "copy spell": { archetypes: ["spellslinger", "combo"], weight: 2 },

  // === COMBO ===
  "tutor-card": { archetypes: ["combo"], weight: 2 },
  "tutor-to-hand": { archetypes: ["combo"], weight: 2 },
  "tutor-to-battlefield": { archetypes: ["combo"], weight: 2 },
  "tutor-creature": { archetypes: ["combo"], weight: 1 },
  "infinite combo": { archetypes: ["combo"], weight: 3 },
  "untapper-creature": { archetypes: ["combo"], weight: 2 },
  "bottomless mana sink": { archetypes: ["combo"], weight: 2 },
  "mana sink": { archetypes: ["combo"], weight: 1 },
  "adds multiple mana": { archetypes: ["combo", "ramp"], weight: 2 },

  // === CONTROL ===
  "counterspell": { archetypes: ["control"], weight: 3 },
  "counterspell-free": { archetypes: ["control"], weight: 3 },
  "counterspell-soft": { archetypes: ["control"], weight: 2 },
  "sweeper": { archetypes: ["control"], weight: 3 },
  "spot removal": { archetypes: ["control"], weight: 1 },
  "removal-exile": { archetypes: ["control"], weight: 2 },
  "removal-permanent": { archetypes: ["control"], weight: 2 },
  "multi removal": { archetypes: ["control"], weight: 2 },
  "repeatable removal": { archetypes: ["control"], weight: 2 },
  "tapper-creature": { archetypes: ["control"], weight: 2 },
  "pillowfort": { archetypes: ["control", "pillowfort"], weight: 3 },

  // === AGGRO ===
  "anthem": { archetypes: ["aggro"], weight: 3 },
  "keyword anthem": { archetypes: ["aggro"], weight: 2 },
  "power boost to all": { archetypes: ["aggro"], weight: 2 },
  "gives haste": { archetypes: ["aggro"], weight: 2 },
  "attack trigger": { archetypes: ["aggro"], weight: 2 },
  "attacking matters": { archetypes: ["aggro"], weight: 2 },
  "attacking matters-self": { archetypes: ["aggro"], weight: 1 },
  "combat trick": { archetypes: ["aggro", "voltron"], weight: 1 },
  "saboteur": { archetypes: ["aggro"], weight: 2 },
  "evasion": { archetypes: ["aggro", "voltron"], weight: 1 },
  "extra combat": { archetypes: ["aggro"], weight: 3 },

  // === RAMP ===
  "ramp": { archetypes: ["ramp"], weight: 3 },
  "land ramp": { archetypes: ["ramp"], weight: 3 },
  "multi land ramp": { archetypes: ["ramp"], weight: 3 },
  "mana dork": { archetypes: ["ramp"], weight: 2 },
  "tutor-land-to-battlefield": { archetypes: ["ramp"], weight: 3 },
  "tutor-land-basic": { archetypes: ["ramp"], weight: 2 },

  // === VOLTRON ===
  "protects-creature": { archetypes: ["voltron"], weight: 2 },
  "pump": { archetypes: ["voltron"], weight: 2 },
  "aura": { archetypes: ["voltron", "enchantress"], weight: 1 },
  "gives hexproof": { archetypes: ["voltron"], weight: 2 },
  "gives indestructible": { archetypes: ["voltron"], weight: 2 },
  "gives trample": { archetypes: ["voltron", "aggro"], weight: 1 },
  "gives double strike": { archetypes: ["voltron"], weight: 2 },
  "synergy-equipment": { archetypes: ["voltron"], weight: 3 },
  "synergy-aura": { archetypes: ["voltron", "enchantress"], weight: 2 },

  // === MILL ===
  "mill-opponent": { archetypes: ["mill"], weight: 3 },
  "mill-any": { archetypes: ["mill"], weight: 2 },
  "mill-exile": { archetypes: ["mill"], weight: 2 },

  // === LIFEGAIN ===
  "lifegain": { archetypes: ["lifegain"], weight: 2 },
  "repeatable lifegain": { archetypes: ["lifegain"], weight: 2 },
  "lifegain payoff": { archetypes: ["lifegain"], weight: 3 },
  "life doubler": { archetypes: ["lifegain"], weight: 3 },

  // === ENCHANTRESS ===
  "enchantress": { archetypes: ["enchantress"], weight: 3 },
  "constellation": { archetypes: ["enchantress"], weight: 3 },
  "synergy-enchantment": { archetypes: ["enchantress"], weight: 2 },

  // === STAX ===
  "stax": { archetypes: ["stax"], weight: 3 },
  "hate-ramp": { archetypes: ["stax"], weight: 2 },
  "hate-tutor": { archetypes: ["stax"], weight: 2 },
  "symmetrical": { archetypes: ["stax", "group-hug"], weight: 1 },
  "tax": { archetypes: ["stax"], weight: 2 },

  // === GROUP HUG ===
  "group hug": { archetypes: ["group-hug"], weight: 3 },

  // === GROUP SLUG ===
  "group slug": { archetypes: ["group-slug"], weight: 3 },
  "opponent loses life": { archetypes: ["group-slug"], weight: 2 },
  "pinger": { archetypes: ["group-slug"], weight: 2 },
  "burn player": { archetypes: ["group-slug"], weight: 2 },
  "burn any": { archetypes: ["group-slug"], weight: 1 },

  // === BLINK ===
  "blink": { archetypes: ["blink"], weight: 3 },
  "flicker": { archetypes: ["blink"], weight: 3 },
  "etb": { archetypes: ["blink"], weight: 2 },
  "creaturefall": { archetypes: ["blink"], weight: 1 },

  // === THEFT ===
  "theft": { archetypes: ["theft"], weight: 3 },
  "gain control": { archetypes: ["theft"], weight: 3 },
  "control changing effects": { archetypes: ["theft"], weight: 3 },

  // === WHEELS ===
  "wheel": { archetypes: ["wheels"], weight: 3 },
  "discard": { archetypes: ["wheels", "reanimator"], weight: 1 },
  "discard outlet": { archetypes: ["wheels", "reanimator"], weight: 2 },

  // === LANDS MATTER ===
  "landfall": { archetypes: ["lands-matter"], weight: 3 },
  "land sacrifice matters": { archetypes: ["lands-matter"], weight: 3 },
  "land recursion": { archetypes: ["lands-matter"], weight: 3 },
};

// Tags that indicate THEME tendencies (more specific than archetypes)
export const themeTagMappings: Record<string, { themes: string[]; weight: number }> = {
  // === TOKENS ===
  "repeatable creature tokens": { themes: ["tokens"], weight: 3 },
  "token doubler": { themes: ["tokens"], weight: 3 },
  "token copy": { themes: ["tokens"], weight: 2 },
  "multiple bodies": { themes: ["tokens"], weight: 2 },

  // === COUNTERS ===
  "counters matter": { themes: ["counters"], weight: 3 },
  "gains pp counters": { themes: ["counters"], weight: 2 },
  "gives pp counters": { themes: ["counters"], weight: 2 },
  "repeatable pp counters": { themes: ["counters"], weight: 2 },
  "counter doubler": { themes: ["counters"], weight: 3 },
  "synergy-proliferate": { themes: ["counters", "proliferate"], weight: 3 },

  // === ARTIFACTS ===
  "synergy-artifact": { themes: ["artifacts"], weight: 3 },
  "artifact matters": { themes: ["artifacts"], weight: 3 },
  "artifactfall": { themes: ["artifacts"], weight: 3 },

  // === GRAVEYARD ===
  "graveyard matters": { themes: ["graveyard"], weight: 3 },
  "affinity for graveyard": { themes: ["graveyard"], weight: 2 },

  // === EQUIPMENT ===
  "synergy-equipment": { themes: ["equipment"], weight: 3 },
  "equip cost reduction": { themes: ["equipment"], weight: 3 },

  // === SACRIFICE ===
  "sacrifice matters": { themes: ["sacrifice"], weight: 3 },
  "your sacrifice matters": { themes: ["sacrifice"], weight: 3 },

  // === TREASURE ===
  "treasure": { themes: ["treasure"], weight: 3 },
  "treasure matters": { themes: ["treasure"], weight: 3 },

  // === CLONES ===
  "clone": { themes: ["clones"], weight: 3 },
  "copy creature": { themes: ["clones"], weight: 3 },

  // === DRAW ===
  "draw engine": { themes: ["card-draw"], weight: 2 },
  "pure draw": { themes: ["card-draw"], weight: 1 },
  "burst draw": { themes: ["card-draw"], weight: 2 },
  "draw matters": { themes: ["card-draw"], weight: 3 },

  // === ENERGY ===
  "energy": { themes: ["energy"], weight: 3 },
  "counter fuel-energy": { themes: ["energy"], weight: 3 },

  // === FLASH ===
  "flash matters": { themes: ["flash"], weight: 3 },
  "gives flash": { themes: ["flash"], weight: 2 },

  // === LANDFALL ===
  "landfall": { themes: ["landfall"], weight: 3 },

  // === PROLIFERATE ===
  "synergy-proliferate": { themes: ["proliferate"], weight: 3 },
};

// Tribal/kindred tags (typal-*)
export const tribalTagMappings: Record<string, string> = {
  "typal-angel": "kindred:angels",
  "typal-beast": "kindred:beasts",
  "typal-bird": "kindred:birds",
  "typal-cat": "kindred:cats",
  "typal-cleric": "kindred:clerics",
  "typal-demon": "kindred:demons",
  "typal-dinosaur": "kindred:dinosaurs",
  "typal-dragon": "kindred:dragons",
  "typal-druid": "kindred:druids",
  "typal-dwarf": "kindred:dwarves",
  "typal-eldrazi": "kindred:eldrazi",
  "typal-elemental": "kindred:elementals",
  "typal-elf": "kindred:elves",
  "typal-faerie": "kindred:faeries",
  "typal-giant": "kindred:giants",
  "typal-goblin": "kindred:goblins",
  "typal-god": "kindred:gods",
  "typal-horror": "kindred:horrors",
  "typal-human": "kindred:humans",
  "typal-knight": "kindred:knights",
  "typal-merfolk": "kindred:merfolk",
  "typal-ninja": "kindred:ninjas",
  "typal-pirate": "kindred:pirates",
  "typal-rat": "kindred:rats",
  "typal-rogue": "kindred:rogues",
  "typal-shaman": "kindred:shamans",
  "typal-skeleton": "kindred:skeletons",
  "typal-sliver": "kindred:slivers",
  "typal-snake": "kindred:snakes",
  "typal-soldier": "kindred:soldiers",
  "typal-sphinx": "kindred:sphinxes",
  "typal-spirit": "kindred:spirits",
  "typal-vampire": "kindred:vampires",
  "typal-warrior": "kindred:warriors",
  "typal-werewolf": "kindred:werewolves",
  "typal-wizard": "kindred:wizards",
  "typal-zombie": "kindred:zombies",
};

// Get all mapped tag slugs
export function getAllMappedTags(): string[] {
  return [
    ...Object.keys(archetypeTagMappings),
    ...Object.keys(themeTagMappings),
    ...Object.keys(tribalTagMappings),
  ];
}
