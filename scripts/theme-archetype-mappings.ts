/**
 * Theme → Archetype Mappings
 * 
 * Each theme maps to one or more likely archetypes based on how decks
 * with that theme typically play. These are defaults — card analysis
 * or manual review can override.
 * 
 * Confidence levels:
 * - "high" = almost always this archetype
 * - "medium" = usually this archetype, but exceptions exist
 * - "low" = sometimes this archetype, needs card analysis to confirm
 */

export interface ArchetypeMapping {
  archetypes: string[];
  confidence: "high" | "medium" | "low";
  notes?: string;
}

// Kindred themes — tribe-specific mappings
// NOT all kindred = aggro. The tribe's card pool determines the archetype.
export const kindredMappings: Record<string, ArchetypeMapping> = {
  // Combo/Ramp tribes — mana generation and big finishers
  "kindred:elves": {
    archetypes: ["combo", "ramp"],
    confidence: "high",
    notes: "Elf tribal is mana-dork chains into combo finishes, not beatdown",
  },
  "kindred:eldrazi": {
    archetypes: ["ramp", "stax"],
    confidence: "high",
    notes: "Ramp into giant threats, often with taxing effects",
  },
  "kindred:dragons": {
    archetypes: ["ramp", "aggro"],
    confidence: "medium",
    notes: "High CMC tribe, needs ramp; can be aggro with haste enablers",
  },
  "kindred:hydras": {
    archetypes: ["ramp"],
    confidence: "high",
    notes: "X-cost creatures need mana, pure ramp strategy",
  },

  // Aristocrats/Reanimator tribes — recursion and death triggers
  "kindred:zombies": {
    archetypes: ["aristocrats", "reanimator"],
    confidence: "high",
    notes: "Recursion-based value engine, sacrifice synergies",
  },
  "kindred:skeletons": {
    archetypes: ["aristocrats", "reanimator"],
    confidence: "high",
    notes: "Recursion-focused tribe",
  },
  "kindred:vampires": {
    archetypes: ["aristocrats", "lifegain"],
    confidence: "medium",
    notes: "Split between aristocrats (sacrifice) and lifegain aggro",
  },
  "kindred:spirits": {
    archetypes: ["aristocrats", "blink"],
    confidence: "medium",
    notes: "ETB/death triggers, varies by color",
  },

  // Spellslinger/Tempo tribes — spell synergies, not combat
  "kindred:ninjas": {
    archetypes: ["spellslinger"],
    confidence: "high",
    notes: "Yuriko-style: chip damage triggering spell-based payoffs",
  },
  "kindred:wizards": {
    archetypes: ["spellslinger", "control"],
    confidence: "high",
    notes: "Card draw, spell-matters triggers, not combat stats",
  },
  "kindred:faeries": {
    archetypes: ["control", "spellslinger"],
    confidence: "medium",
    notes: "Flash, counterspells, tempo play",
  },

  // Aggro tribes — anthem effects, go-wide, haste
  "kindred:goblins": {
    archetypes: ["aggro", "combo"],
    confidence: "high",
    notes: "Go-wide aggro or Krenko-style combo",
  },
  "kindred:soldiers": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Anthem-based go-wide aggro",
  },
  "kindred:warriors": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Combat-focused tribe",
  },
  "kindred:knights": {
    archetypes: ["aggro", "voltron"],
    confidence: "medium",
    notes: "Equipment synergy can push toward voltron",
  },
  "kindred:cats": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Typically go-wide with equipment subtheme",
  },
  "kindred:dogs": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Go-wide aggro",
  },
  "kindred:dinosaurs": {
    archetypes: ["aggro", "ramp"],
    confidence: "medium",
    notes: "Big creatures, needs ramp but wins through combat",
  },
  "kindred:pirates": {
    archetypes: ["aggro", "theft"],
    confidence: "medium",
    notes: "Treasure generation and theft effects",
  },
  "kindred:beasts": {
    archetypes: ["aggro", "ramp"],
    confidence: "medium",
    notes: "Big green creatures",
  },

  // Control/Value tribes
  "kindred:sphinxes": {
    archetypes: ["control"],
    confidence: "high",
    notes: "Card draw, high CMC, control finishers",
  },
  "kindred:angels": {
    archetypes: ["lifegain", "aggro"],
    confidence: "medium",
    notes: "Split between lifegain synergy and flying beatdown",
  },
  "kindred:demons": {
    archetypes: ["aristocrats", "reanimator"],
    confidence: "medium",
    notes: "Often sacrifice/reanimator themes",
  },

  // Combo tribes
  "kindred:slivers": {
    archetypes: ["combo", "aggro"],
    confidence: "high",
    notes: "Sliver combo or overwhelming board presence",
  },
  "kindred:allies": {
    archetypes: ["combo", "blink"],
    confidence: "high",
    notes: "ETB triggers, often blink/combo",
  },
  "kindred:merfolk": {
    archetypes: ["control", "aggro"],
    confidence: "medium",
    notes: "Tempo/control or islandwalk aggro",
  },
  "kindred:rats": {
    archetypes: ["aristocrats"],
    confidence: "high",
    notes: "Sacrifice and recursion focused",
  },

  // Mill/Self-mill tribes
  "kindred:rogues": {
    archetypes: ["mill"],
    confidence: "high",
    notes: "Mill synergies, graveyard payoffs",
  },
  "kindred:horrors": {
    archetypes: ["reanimator", "mill"],
    confidence: "medium",
    notes: "Often graveyard-focused",
  },

  // Misc tribes — need case-by-case analysis
  "kindred:humans": {
    archetypes: [],
    confidence: "low",
    notes: "Too diverse — depends entirely on commander/colors",
  },
  "kindred:elementals": {
    archetypes: ["blink"],
    confidence: "medium",
    notes: "Often evoke/ETB focused, blink synergies",
  },
  "kindred:giants": {
    archetypes: ["aggro", "ramp"],
    confidence: "medium",
    notes: "Big creatures, combat-focused",
  },
  "kindred:shapeshifters": {
    archetypes: [],
    confidence: "low",
    notes: "Changeling — archetype depends on what tribe they're supporting",
  },
  "kindred:assassins": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Often deathtouch/combat tricks",
  },
  "kindred:birds": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Flying aggro",
  },
  "kindred:clerics": {
    archetypes: ["lifegain", "aristocrats"],
    confidence: "medium",
    notes: "Lifegain or sacrifice synergies",
  },
  "kindred:druids": {
    archetypes: ["ramp"],
    confidence: "high",
    notes: "Mana dork tribe",
  },
  "kindred:insects": {
    archetypes: ["aristocrats", "aggro"],
    confidence: "medium",
    notes: "Token generation, sacrifice",
  },
  "kindred:fungi": {
    archetypes: ["aristocrats"],
    confidence: "high",
    notes: "Saproling tokens, sacrifice synergies",
  },
  "kindred:treefolk": {
    archetypes: ["ramp"],
    confidence: "medium",
    notes: "Lands-matter adjacent, big creatures",
  },
  "kindred:werewolves": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Transform aggro, combat-focused",
  },
  "kindred:wolves": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Go-wide aggro",
  },
  "kindred:bears": {
    archetypes: ["aggro", "stax"],
    confidence: "low",
    notes: "Ayula is aggro, but bear tribal can vary",
  },
  "kindred:squirrels": {
    archetypes: ["aggro", "combo"],
    confidence: "medium",
    notes: "Token generation, can combo",
  },
  "kindred:phoenixes": {
    archetypes: ["reanimator", "spellslinger"],
    confidence: "medium",
    notes: "Recursion from graveyard",
  },
  "kindred:minotaurs": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Combat-focused tribe",
  },
  "kindred:auras": {
    archetypes: ["voltron", "enchantress"],
    confidence: "high",
    notes: "Aura-focused = voltron or enchantress",
  },
  "kindred:gods": {
    archetypes: ["good-stuff"],
    confidence: "low",
    notes: "Too diverse, depends on god type",
  },
  "kindred:oozes": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Counter-based growth, combat",
  },
  "kindred:saprolings": {
    archetypes: ["aristocrats"],
    confidence: "high",
    notes: "Token sacrifice synergies, fungi adjacent",
  },
  "kindred:phyrexians": {
    archetypes: ["aristocrats", "reanimator"],
    confidence: "medium",
    notes: "Often sacrifice and recursion themes",
  },
  "kindred:snakes": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Counter-based or deathtouch strategies",
  },
  "kindred:dwarves": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Artifact synergy tribe, equipment focus",
  },
  "kindred:golems": {
    archetypes: ["combo"],
    confidence: "medium",
    notes: "Artifact creature focus, often combo",
  },
  "kindred:samurai": {
    archetypes: ["aggro", "voltron"],
    confidence: "medium",
    notes: "Single attacker payoffs push toward voltron",
  },
  "kindred:frogs": {
    archetypes: ["lands-matter"],
    confidence: "medium",
    notes: "Land-drop synergies (Gitrog style)",
  },
  "kindred:spiders": {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Reach creatures, defensive strategy",
  },
  "kindred:orcs": {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Combat-focused tribe",
  },
  "kindred:halflings": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Go-wide with food subtheme",
  },
  "kindred:tyranids": {
    archetypes: ["aggro", "ramp"],
    confidence: "medium",
    notes: "X-cost creatures, big threats",
  },
  "kindred:rabbits": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Token generation, go-wide",
  },
  "kindred:otters": {
    archetypes: ["spellslinger"],
    confidence: "medium",
    notes: "Spell-based synergies",
  },
  "kindred:mice": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Token aggro",
  },
  "kindred:raccoons": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Threshold/delirium adjacent",
  },
};

// Non-kindred theme mappings
export const themeMappings: Record<string, ArchetypeMapping> = {
  // Card-type themes
  artifacts: {
    archetypes: ["combo", "control"],
    confidence: "medium",
    notes: "Artifact synergies lean combo or control",
  },
  enchantments: {
    archetypes: ["enchantress", "control"],
    confidence: "high",
    notes: "Enchantment theme = enchantress archetype",
  },
  equipment: {
    archetypes: ["voltron"],
    confidence: "high",
    notes: "Equipment theme almost always voltron",
  },
  planeswalkers: {
    archetypes: ["control"],
    confidence: "high",
    notes: "Superfriends = control shell",
  },

  // Mechanic themes
  counters: {
    archetypes: ["aggro", "voltron"],
    confidence: "medium",
    notes: "+1/+1 counters can be go-wide aggro or single-target voltron",
  },
  energy: {
    archetypes: ["combo"],
    confidence: "medium",
    notes: "Energy tends toward combo payoffs",
  },
  cascade: {
    archetypes: ["combo", "good-stuff"],
    confidence: "medium",
    notes: "Cascade chains into combo or value piles",
  },
  flashback: {
    archetypes: ["spellslinger", "reanimator"],
    confidence: "medium",
    notes: "Graveyard spell recursion",
  },
  madness: {
    archetypes: ["reanimator"],
    confidence: "medium",
    notes: "Discard synergies",
  },
  foretell: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Mana smoothing for control",
  },
  mutate: {
    archetypes: ["voltron"],
    confidence: "high",
    notes: "Stacking onto one creature = voltron",
  },
  ninjutsu: {
    archetypes: ["spellslinger"],
    confidence: "high",
    notes: "Tempo/triggers, not combat damage",
  },
  manifest: {
    archetypes: ["blink"],
    confidence: "medium",
    notes: "Face-down tricks, often blink to flip",
  },
  morph: {
    archetypes: ["blink", "control"],
    confidence: "medium",
    notes: "Face-down tricks",
  },
  exile: {
    archetypes: ["spellslinger", "theft"],
    confidence: "low",
    notes: "Depends on what you do with exiled cards",
  },
  "experience-counters": {
    archetypes: ["voltron", "combo"],
    confidence: "medium",
    notes: "Commander-focused, scaling payoffs",
  },
  dungeon: {
    archetypes: ["blink"],
    confidence: "medium",
    notes: "Venture triggers, often blink",
  },
  investigate: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Card draw, artifacts matter",
  },
  treasure: {
    archetypes: ["ramp", "combo"],
    confidence: "medium",
    notes: "Mana generation for big plays",
  },
  food: {
    archetypes: ["lifegain", "aristocrats"],
    confidence: "medium",
    notes: "Life gain or artifact sacrifice",
  },
  clones: {
    archetypes: ["control", "combo"],
    confidence: "medium",
    notes: "Copy effects for value or combo",
  },
  tokens: {
    archetypes: ["aggro", "aristocrats"],
    confidence: "medium",
    notes: "Go-wide aggro or sacrifice fodder",
  },
  sacrifice: {
    archetypes: ["aristocrats"],
    confidence: "high",
    notes: "Sacrifice theme = aristocrats",
  },
  "card-draw": {
    archetypes: ["control", "combo"],
    confidence: "low",
    notes: "Card draw supports any strategy",
  },
  "graveyard": {
    archetypes: ["reanimator", "aristocrats"],
    confidence: "high",
    notes: "Graveyard theme = reanimator or aristocrats",
  },
  "topdeck-matters": {
    archetypes: ["combo"],
    confidence: "medium",
    notes: "Manipulation for combo or value",
  },
  discard: {
    archetypes: ["reanimator", "control"],
    confidence: "medium",
    notes: "Discard for reanimator or hand control",
  },
  "power-matters": {
    archetypes: ["voltron", "aggro"],
    confidence: "medium",
    notes: "Big creature payoffs",
  },
  "toughness-matters": {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Defender-style strategies",
  },
  defenders: {
    archetypes: ["control", "combo"],
    confidence: "medium",
    notes: "Wall tribal, Arcades-style",
  },
  deathtouch: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Removal through combat",
  },
  flying: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Evasive damage",
  },
  menace: {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Combat evasion",
  },
  trample: {
    archetypes: ["voltron", "aggro"],
    confidence: "medium",
    notes: "Damage through blockers",
  },
  haste: {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Immediate pressure",
  },
  flash: {
    archetypes: ["control"],
    confidence: "high",
    notes: "Reactive play = control",
  },
  vehicles: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Artifact creatures for combat",
  },
  sagas: {
    archetypes: ["enchantress", "blink"],
    confidence: "medium",
    notes: "Enchantment synergy, blink to reset",
  },
  backgrounds: {
    archetypes: [],
    confidence: "low",
    notes: "Depends on the background chosen",
  },
  partners: {
    archetypes: [],
    confidence: "low",
    notes: "Depends on partner combination",
  },
  cedh: {
    archetypes: ["combo"],
    confidence: "high",
    notes: "cEDH is combo-focused by definition",
  },

  // Elemental themes (from crossover sets)
  firebending: {
    archetypes: ["spellslinger", "aggro"],
    confidence: "medium",
    notes: "Burn spells",
  },
  waterbending: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Control/bounce",
  },
  earthbending: {
    archetypes: ["lands-matter", "ramp"],
    confidence: "medium",
    notes: "Land manipulation",
  },
  airbending: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Evasive creatures",
  },

  // Misc
  devotion: {
    archetypes: ["combo", "ramp"],
    confidence: "medium",
    notes: "Mana generation or combo payoffs",
  },
  "legendary-matters": {
    archetypes: ["good-stuff"],
    confidence: "low",
    notes: "Depends on legends chosen",
  },
  "historic-matters": {
    archetypes: ["good-stuff", "artifacts"],
    confidence: "low",
    notes: "Broad category",
  },
  adventure: {
    archetypes: ["blink", "spellslinger"],
    confidence: "medium",
    notes: "ETB/cast triggers",
  },
  explore: {
    archetypes: ["lands-matter"],
    confidence: "medium",
    notes: "Land drops and graveyard",
  },
  fight: {
    archetypes: ["voltron", "control"],
    confidence: "low",
    notes: "Creature-based removal",
  },
  amass: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Growing army token",
  },
  proliferate: {
    archetypes: ["combo"],
    confidence: "medium",
    notes: "Counter manipulation for combo",
  },
  populate: {
    archetypes: ["tokens", "aggro"],
    confidence: "medium",
    notes: "Token doubling",
  },
  
  // Additional themes from EDHREC data
  landfall: {
    archetypes: ["lands-matter", "ramp"],
    confidence: "high",
    notes: "Land drop triggers = lands-matter archetype",
  },
  midrange: {
    archetypes: ["good-stuff"],
    confidence: "medium",
    notes: "Value-based, no specific combo or aggro lean",
  },
  monarch: {
    archetypes: ["control", "aggro"],
    confidence: "medium",
    notes: "Card draw reward, can be defensive or aggressive",
  },
  "sea-creatures": {
    archetypes: ["ramp"],
    confidence: "medium",
    notes: "High CMC creatures, needs mana",
  },
  mutants: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Tyranid-adjacent, big creatures",
  },
  "modified-creatures": {
    archetypes: ["voltron", "aggro"],
    confidence: "medium",
    notes: "Equipment/counters/auras — voltron-adjacent",
  },
  "multicolor-matters": {
    archetypes: ["good-stuff"],
    confidence: "low",
    notes: "Depends on color combination",
  },
  outlaws: {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Rogues/assassins/pirates — combat-focused",
  },
  sunforger: {
    archetypes: ["control", "toolbox"],
    confidence: "high",
    notes: "Instant-based toolbox strategy",
  },
  scry: {
    archetypes: ["combo", "control"],
    confidence: "medium",
    notes: "Topdeck manipulation for combo or control",
  },
  "shadowborn-apostles": {
    archetypes: ["combo", "reanimator"],
    confidence: "high",
    notes: "Tutor combo into demons",
  },
  "persistent-petitioners": {
    archetypes: ["mill"],
    confidence: "high",
    notes: "Mill combo deck",
  },
  snow: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Snow synergies, often control-oriented",
  },
  "the-ring": {
    archetypes: ["aggro", "voltron"],
    confidence: "medium",
    notes: "Ring-bearer = single creature focus",
  },
  "impulse-draw": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Red card advantage, plays fast",
  },
  "rad-counters": {
    archetypes: ["mill", "aristocrats"],
    confidence: "medium",
    notes: "Self-mill and damage triggers",
  },
  "time-counters": {
    archetypes: ["combo", "control"],
    confidence: "medium",
    notes: "Suspend/vanishing manipulation",
  },
  tempo: {
    archetypes: ["aggro", "control"],
    confidence: "low",
    notes: "Hybrid strategy — needs card analysis",
  },
  zoo: {
    archetypes: ["aggro"],
    confidence: "high",
    notes: "Creature-based aggro",
  },
  "vanilla": {
    archetypes: ["aggro"],
    confidence: "medium",
    notes: "Vanilla creatures matter — Muraganda style",
  },
  guildgates: {
    archetypes: ["lands-matter", "control"],
    confidence: "medium",
    notes: "Gate synergies, often Maze's End",
  },
  rooms: {
    archetypes: ["control"],
    confidence: "medium",
    notes: "Room enchantments, value-oriented",
  },
};

// Get mapping for a theme
export function getArchetypeMapping(theme: string): ArchetypeMapping | null {
  // Check kindred first
  if (theme.startsWith("kindred:")) {
    return kindredMappings[theme] || {
      archetypes: [],
      confidence: "low",
      notes: `Unknown kindred theme: ${theme}`,
    };
  }

  return themeMappings[theme] || null;
}

// Export all mappings for review
export function getAllMappings() {
  return {
    kindred: kindredMappings,
    themes: themeMappings,
  };
}
