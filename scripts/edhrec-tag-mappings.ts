/**
 * EDHREC Tag → Taxonomy Mappings
 * 
 * Maps EDHREC's crowd-sourced tag names to our curated taxonomy slugs.
 * 
 * Two-axis model (aligned with ref_commander_builds):
 * - ARCHETYPES: How you play (win condition, playstyle)
 * - THEMES: What you build around (card types, mechanics, tribes)
 * 
 * Tribes use the `kindred:` prefix pattern (e.g., `kindred:vampires`).
 * Bare `kindred` is for generic tribal decks (Morophon, Adaptive Automaton).
 * 
 * Mapping rules:
 * - Direct match: EDHREC tag maps 1:1 to our taxonomy slug
 * - Variant: EDHREC uses different naming, maps to our equivalent
 * - Parent: EDHREC sub-theme maps to our broader category
 * - null: Tag is ignored (too generic, not useful, or commander mechanic)
 * 
 * Tags not in this map are tracked as "unmapped" in the sync report.
 * Review unmapped tags periodically to decide if mappings should be added.
 */

export type TaxonomyCategory = 'themes' | 'archetypes';

export interface TagMapping {
  slug: string;
  category: TaxonomyCategory;
  /** If true, tag is a sub-variant (e.g., "Food" is sub of "artifacts") */
  isSubVariant?: boolean;
}

/**
 * Main mapping table: lowercase EDHREC tag → taxonomy mapping
 * 
 * null = explicitly ignored (won't show in unmapped report)
 * undefined (not in map) = unmapped, will appear in report
 */
export const TAG_MAPPINGS: Record<string, TagMapping | null> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // THEMES - What you build around
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Artifacts
  'artifact': { slug: 'artifacts', category: 'themes' },
  'artifacts': { slug: 'artifacts', category: 'themes' },
  'artifacts matter': { slug: 'artifacts-matter', category: 'archetypes' },
  'artifact tokens': { slug: 'artifacts', category: 'themes', isSubVariant: true },
  'treasure': { slug: 'treasure', category: 'themes' },
  'treasures': { slug: 'treasure', category: 'themes' },
  'food': { slug: 'artifacts', category: 'themes', isSubVariant: true },
  'clues': { slug: 'artifacts', category: 'themes', isSubVariant: true },
  'blood': { slug: 'artifacts', category: 'themes', isSubVariant: true },
  'powerstones': { slug: 'artifacts', category: 'themes', isSubVariant: true },
  'affinity': { slug: 'artifacts', category: 'themes' },
  'metalcraft': { slug: 'artifacts', category: 'themes' },
  
  // Clones
  'clones': { slug: 'clones', category: 'themes' },
  'clone': { slug: 'clones', category: 'themes' },
  'copy': { slug: 'clones', category: 'themes' },
  'shapeshifter': { slug: 'clones', category: 'themes' },
  'shapeshifters': { slug: 'clones', category: 'themes' },
  
  // Counters — NOTE: does NOT include experience counters (commander mechanic, doesn't interact with counter synergies)
  '+1/+1 counters': { slug: 'counters', category: 'themes' },
  '+1/+1 counter': { slug: 'counters', category: 'themes' },
  'plus-1-plus-1-counters': { slug: 'counters', category: 'themes' },  // hyphenated slug variant
  'counters': { slug: 'counters', category: 'themes' },
  'counter': { slug: 'counters', category: 'themes' },
  '-1/-1 counters': { slug: 'counters', category: 'themes' },
  'minus-1-minus-1-counters': { slug: 'counters', category: 'themes' },  // hyphenated slug variant
  'charge counters': { slug: 'counters', category: 'themes', isSubVariant: true },
  'charge-counters': { slug: 'counters', category: 'themes', isSubVariant: true },  // hyphenated
  // NOTE: experience-counters excluded — commander mechanic, doesn't proliferate or interact with counters synergy
  // NOTE: modified-creatures excluded — triggers off auras/equipment/counters, counters is only 1/3 of the card pool
  
  // Enchantments
  'enchantment': { slug: 'enchantments', category: 'themes' },
  'enchantments': { slug: 'enchantments', category: 'themes' },
  'auras': { slug: 'enchantments', category: 'themes' },
  'aura': { slug: 'enchantments', category: 'themes' },
  'constellation': { slug: 'enchantments', category: 'themes' },
  
  // Energy
  'energy': { slug: 'energy', category: 'themes' },
  'energy counters': { slug: 'energy', category: 'themes' },
  
  // Equipment
  'equipment': { slug: 'equipment', category: 'themes' },
  'equipments': { slug: 'equipment', category: 'themes' },
  'equip': { slug: 'equipment', category: 'themes' },
  'swords': { slug: 'equipment', category: 'themes', isSubVariant: true },
  
  // Exile / Cast from Exile
  'exile': { slug: 'exile', category: 'themes' },
  'impulse draw': { slug: 'exile', category: 'themes' },
  'impulse-draw': { slug: 'exile', category: 'themes' },  // hyphenated
  'cast from exile': { slug: 'cast-from-exile', category: 'archetypes' },
  
  // Graveyard
  'graveyard': { slug: 'graveyard', category: 'themes' },
  'self-mill': { slug: 'graveyard', category: 'themes' },
  'self mill': { slug: 'graveyard', category: 'themes' },
  'recursion': { slug: 'graveyard', category: 'themes' },
  'reanimation': { slug: 'graveyard', category: 'themes' },
  'dredge': { slug: 'graveyard', category: 'themes' },
  'cycling': { slug: 'graveyard', category: 'themes' },  // puts cards in yard as cost, same wiring as surveil/delirium
  
  // Infect
  'infect': { slug: 'infect', category: 'archetypes' },
  'poison': { slug: 'infect', category: 'archetypes' },
  'poison counters': { slug: 'infect', category: 'archetypes' },
  'toxic': { slug: 'infect', category: 'archetypes' },
  
  // Landfall
  'landfall': { slug: 'landfall', category: 'themes' },
  'lands': { slug: 'landfall', category: 'themes' },
  'land': { slug: 'landfall', category: 'themes' },
  'extra land drops': { slug: 'landfall', category: 'themes' },
  
  // Planeswalkers
  'planeswalker': { slug: 'planeswalkers', category: 'themes' },
  'planeswalkers': { slug: 'planeswalkers', category: 'themes' },
  'loyalty': { slug: 'planeswalkers', category: 'themes' },
  
  // Sacrifice
  'sacrifice': { slug: 'sacrifice', category: 'themes' },
  'sac': { slug: 'sacrifice', category: 'themes' },
  'death triggers': { slug: 'sacrifice', category: 'themes' },
  'fodder': { slug: 'sacrifice', category: 'themes' },
  
  // Spellslinger — moved to archetypes (it's a playstyle, not a card type)
  
  // Tokens
  'tokens': { slug: 'tokens', category: 'themes' },
  'token': { slug: 'tokens', category: 'themes' },
  'go wide': { slug: 'tokens', category: 'themes' },
  'wide': { slug: 'tokens', category: 'themes' },
  'anthem': { slug: 'tokens', category: 'themes' },
  'anthems': { slug: 'tokens', category: 'themes' },
  
  // Vehicles
  'vehicles': { slug: 'vehicles', category: 'themes' },
  'vehicle': { slug: 'vehicles', category: 'themes' },
  'crew': { slug: 'vehicles', category: 'themes' },
  
  // Toughness Matters — Doran/Arcades style, distinct from defenders
  'toughness matters': { slug: 'toughness-matters', category: 'themes' },
  'toughness-matters': { slug: 'toughness-matters', category: 'themes' },  // hyphenated
  'toughness': { slug: 'toughness-matters', category: 'themes' },
  
  // Defenders — keyword-based theme (can't attack), NOT a tribe (defender is not a creature type)
  'defenders': { slug: 'defenders', category: 'themes' },
  'defender': { slug: 'defenders', category: 'themes' },
  'walls': { slug: 'defenders', category: 'themes' },
  
  // Monarch — adversarial mechanic, NOT group-hug (everyone incentivized to attack you)
  'monarch': { slug: 'monarch', category: 'themes' },
  'the monarch': { slug: 'monarch', category: 'themes' },
  
  // Snow — dedicated card pool, real theme
  'snow': { slug: 'snow', category: 'themes' },
  'snow-covered': { slug: 'snow', category: 'themes' },
  
  // Devotion — mono-color pip counting, distinct payoff pool (Theros gods, etc.)
  'devotion': { slug: 'devotion', category: 'themes' },
  
  // Power Matters — cards that scale with creature power (Fling, Rishkar's Expertise, etc.)
  'power': { slug: 'power-matters', category: 'themes' },
  'power matters': { slug: 'power-matters', category: 'themes' },
  'power-matters': { slug: 'power-matters', category: 'themes' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ARCHETYPES - How you play
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Aggro
  'aggro': { slug: 'aggro', category: 'archetypes' },
  'aggressive': { slug: 'aggro', category: 'archetypes' },
  'beatdown': { slug: 'aggro', category: 'archetypes' },
  'combat': { slug: 'aggro', category: 'archetypes' },
  'combat damage': { slug: 'aggro', category: 'archetypes' },
  'self-damage': { slug: 'aggro', category: 'archetypes' },
  
  // Aristocrats
  'aristocrats': { slug: 'aristocrats', category: 'archetypes' },
  'drain': { slug: 'aristocrats', category: 'archetypes' },
  'blood artist': { slug: 'aristocrats', category: 'archetypes' },
  'lifedrain': { slug: 'aristocrats', category: 'archetypes' },
  
  // Artifacts Matter (archetype) - moved to line 39
  
  // Blink
  'blink': { slug: 'blink', category: 'archetypes' },
  'flicker': { slug: 'blink', category: 'archetypes' },
  'etb': { slug: 'blink', category: 'archetypes' },
  'enters the battlefield': { slug: 'blink', category: 'archetypes' },
  'enter the battlefield': { slug: 'blink', category: 'archetypes' },
  
  // Cast from Exile - moved to line 85
  
  // Chaos
  'chaos': { slug: 'chaos', category: 'archetypes' },
  'random': { slug: 'chaos', category: 'archetypes' },
  'coin flip': { slug: 'chaos', category: 'archetypes' },
  'coin flips': { slug: 'chaos', category: 'archetypes' },
  'coin-flip': { slug: 'chaos', category: 'archetypes' },  // hyphenated
  'die roll': { slug: 'chaos', category: 'archetypes' },
  'die-roll': { slug: 'chaos', category: 'archetypes' },  // hyphenated
  
  // Combo
  'combo': { slug: 'combo', category: 'archetypes' },
  'infinite': { slug: 'combo', category: 'archetypes' },
  'win condition': { slug: 'combo', category: 'archetypes' },
  
  // Control
  'control': { slug: 'control', category: 'archetypes' },
  'counterspells': { slug: 'control', category: 'archetypes' },
  'counterspell': { slug: 'control', category: 'archetypes' },
  'board wipes': { slug: 'control', category: 'archetypes' },
  'board wipe': { slug: 'control', category: 'archetypes' },
  'removal': { slug: 'control', category: 'archetypes' },
  
  // Enchantress
  'enchantress': { slug: 'enchantress', category: 'archetypes' },
  
  // Group Hug
  'group hug': { slug: 'group-hug', category: 'archetypes' },
  'group-hug': { slug: 'group-hug', category: 'archetypes' },  // hyphenated
  'political': { slug: 'group-hug', category: 'archetypes' },
  'politics': { slug: 'group-hug', category: 'archetypes' },
  
  // Group Slug
  'group slug': { slug: 'group-slug', category: 'archetypes' },
  'group-slug': { slug: 'group-slug', category: 'archetypes' },  // hyphenated
  'punisher': { slug: 'group-slug', category: 'archetypes' },
  'burn': { slug: 'group-slug', category: 'archetypes' },
  'forced combat': { slug: 'group-slug', category: 'archetypes' },
  'forced-combat': { slug: 'group-slug', category: 'archetypes' },  // hyphenated
  
  // Lands Matter
  'lands matter': { slug: 'lands-matter', category: 'archetypes' },
  'lands-matter': { slug: 'lands-matter', category: 'archetypes' },  // hyphenated
  // NOTE: 'land destruction' moved to stax (resource denial = stax, not lands-matter)
  
  // Legendary Matters
  'legendary matters': { slug: 'legendary-matters', category: 'archetypes' },
  'legendary': { slug: 'legendary-matters', category: 'archetypes' },
  'historic': { slug: 'legendary-matters', category: 'archetypes' },
  'legends': { slug: 'legendary-matters', category: 'archetypes' },
  
  // Commander Matters (cards that reference the commander zone/mechanic)
  'commander matters': { slug: 'commander-matters', category: 'archetypes' },
  'commander-matters': { slug: 'commander-matters', category: 'archetypes' },  // hyphenated
  
  // Lifegain
  'lifegain': { slug: 'lifegain', category: 'archetypes' },
  'life gain': { slug: 'lifegain', category: 'archetypes' },
  'life': { slug: 'lifegain', category: 'archetypes' },
  
  // Mill
  'mill': { slug: 'mill', category: 'archetypes' },
  'milling': { slug: 'mill', category: 'archetypes' },
  
  // Pillowfort
  'pillowfort': { slug: 'pillowfort', category: 'archetypes' },
  'pillow fort': { slug: 'pillowfort', category: 'archetypes' },
  'pillow-fort': { slug: 'pillowfort', category: 'archetypes' },  // hyphenated
  'defensive': { slug: 'pillowfort', category: 'archetypes' },
  
  // Ramp
  'ramp': { slug: 'ramp', category: 'archetypes' },
  'big mana': { slug: 'ramp', category: 'archetypes' },
  'mana': { slug: 'ramp', category: 'archetypes' },
  
  // Reanimator
  'reanimator': { slug: 'reanimator', category: 'archetypes' },
  'reanimate': { slug: 'reanimator', category: 'archetypes' },
  
  // Stax
  'stax': { slug: 'stax', category: 'archetypes' },
  'tax': { slug: 'stax', category: 'archetypes' },
  'hatebears': { slug: 'stax', category: 'archetypes' },
  'hate bears': { slug: 'stax', category: 'archetypes' },
  'resource denial': { slug: 'stax', category: 'archetypes' },
  'land destruction': { slug: 'stax', category: 'archetypes' },  // resource denial = stax, not lands-matter
  'land-destruction': { slug: 'stax', category: 'archetypes' },  // hyphenated
  
  // Superfriends
  'superfriends': { slug: 'superfriends', category: 'archetypes' },
  'super friends': { slug: 'superfriends', category: 'archetypes' },
  
  // Theft
  'theft': { slug: 'theft', category: 'archetypes' },
  'steal': { slug: 'theft', category: 'archetypes' },
  'threaten': { slug: 'theft', category: 'archetypes' },
  'act of treason': { slug: 'theft', category: 'archetypes' },
  
  // Voltron
  'voltron': { slug: 'voltron', category: 'archetypes' },
  'commander damage': { slug: 'voltron', category: 'archetypes' },
  
  // Wheels
  'wheels': { slug: 'wheels', category: 'archetypes' },
  'wheel': { slug: 'wheels', category: 'archetypes' },
  'discard': { slug: 'wheels', category: 'archetypes' },
  
  // Spellslinger
  'spellslinger': { slug: 'spellslinger', category: 'archetypes' },
  'spell slinger': { slug: 'spellslinger', category: 'archetypes' },
  'instants': { slug: 'spellslinger', category: 'archetypes' },
  'sorceries': { slug: 'spellslinger', category: 'archetypes' },
  'instants and sorceries': { slug: 'spellslinger', category: 'archetypes' },
  'magecraft': { slug: 'spellslinger', category: 'archetypes' },
  'storm': { slug: 'spellslinger', category: 'archetypes' },
  'cantrips': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'x spells': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'spell copy': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  
  // Extra Combats — own archetype, "build to one explosive turn" serves aggro/aristocrats/combo equally
  'extra combats': { slug: 'extra-combats', category: 'archetypes' },
  'extra combat': { slug: 'extra-combats', category: 'archetypes' },
  'extra-combats': { slug: 'extra-combats', category: 'archetypes' },  // hyphenated
  
  // Extra Turns — own archetype, most are ramp/control shells not infinite loops
  'extra turns': { slug: 'extra-turns', category: 'archetypes' },
  'extra turn': { slug: 'extra-turns', category: 'archetypes' },
  'extra-turns': { slug: 'extra-turns', category: 'archetypes' },  // hyphenated
  'extra upkeeps': { slug: 'extra-turns', category: 'archetypes', isSubVariant: true },
  'extra-upkeeps': { slug: 'extra-turns', category: 'archetypes', isSubVariant: true },  // hyphenated
  
  // Toolbox — repeatable tutor chains for answers, not necessarily combo
  'toolbox': { slug: 'toolbox', category: 'archetypes' },
  'birthing pod': { slug: 'toolbox', category: 'archetypes' },
  'birthing-pod': { slug: 'toolbox', category: 'archetypes' },  // hyphenated
  
  // Topdeck — low-hand-size decks compensating with extra draw
  'topdeck': { slug: 'topdeck', category: 'archetypes' },
  
  // Tap/Untap — incremental value engines, not necessarily infinite
  'tap / untap': { slug: 'tap-untap', category: 'archetypes' },
  'tap/untap': { slug: 'tap-untap', category: 'archetypes' },
  'tap-untap': { slug: 'tap-untap', category: 'archetypes' },  // hyphenated
  'untap': { slug: 'tap-untap', category: 'archetypes' },
  
  // Good Stuff
  'good stuff': { slug: 'good-stuff', category: 'archetypes' },
  'goodstuff': { slug: 'good-stuff', category: 'archetypes' },
  'good-stuff': { slug: 'good-stuff', category: 'archetypes' },  // hyphenated
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MECHANICS → folded into THEMES (keywords that modify deckbuilding)
  // ═══════════════════════════════════════════════════════════════════════════
  
  'cascade': { slug: 'cascade', category: 'themes' },
  'discover': { slug: 'cascade', category: 'themes' },
  'flashback': { slug: 'flashback', category: 'themes' },
  'jump-start': { slug: 'flashback', category: 'themes' },
  'madness': { slug: 'madness', category: 'themes' },
  'proliferate': { slug: 'proliferate', category: 'themes' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TRIBES → folded into THEMES with `kindred:` prefix
  // Bare `kindred` is for generic tribal (Morophon, Adaptive Automaton)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Generic tribal
  'kindred': { slug: 'kindred', category: 'themes' },
  'tribal': { slug: 'kindred', category: 'themes' },
  'typal': { slug: 'kindred', category: 'themes' },
  'changeling': { slug: 'kindred', category: 'themes' },
  'changelings': { slug: 'kindred', category: 'themes' },
  
  'angels': { slug: 'kindred:angels', category: 'themes' },
  'angel': { slug: 'kindred:angels', category: 'themes' },
  'bears': { slug: 'kindred:bears', category: 'themes' },
  'bear': { slug: 'kindred:bears', category: 'themes' },
  'beasts': { slug: 'kindred:beasts', category: 'themes' },
  'beast': { slug: 'kindred:beasts', category: 'themes' },
  'cats': { slug: 'kindred:cats', category: 'themes' },
  'cat': { slug: 'kindred:cats', category: 'themes' },
  'clerics': { slug: 'kindred:clerics', category: 'themes' },
  'cleric': { slug: 'kindred:clerics', category: 'themes' },
  'constructs': { slug: 'kindred:constructs', category: 'themes' },
  'construct': { slug: 'kindred:constructs', category: 'themes' },
  'demons': { slug: 'kindred:demons', category: 'themes' },
  'demon': { slug: 'kindred:demons', category: 'themes' },
  'dinosaurs': { slug: 'kindred:dinosaurs', category: 'themes' },
  'dinosaur': { slug: 'kindred:dinosaurs', category: 'themes' },
  'dinos': { slug: 'kindred:dinosaurs', category: 'themes' },
  'dragons': { slug: 'kindred:dragons', category: 'themes' },
  'dragon': { slug: 'kindred:dragons', category: 'themes' },
  'druids': { slug: 'kindred:druids', category: 'themes' },
  'druid': { slug: 'kindred:druids', category: 'themes' },
  'eldrazi': { slug: 'kindred:eldrazi', category: 'themes' },
  'elementals': { slug: 'kindred:elementals', category: 'themes' },
  'elemental': { slug: 'kindred:elementals', category: 'themes' },
  'elves': { slug: 'kindred:elves', category: 'themes' },
  'elf': { slug: 'kindred:elves', category: 'themes' },
  'faeries': { slug: 'kindred:faeries', category: 'themes' },
  'faerie': { slug: 'kindred:faeries', category: 'themes' },
  'giants': { slug: 'kindred:giants', category: 'themes' },
  'giant': { slug: 'kindred:giants', category: 'themes' },
  'goblins': { slug: 'kindred:goblins', category: 'themes' },
  'goblin': { slug: 'kindred:goblins', category: 'themes' },
  'gods': { slug: 'kindred:gods', category: 'themes' },
  'god': { slug: 'kindred:gods', category: 'themes' },
  'golems': { slug: 'kindred:golems', category: 'themes' },
  'golem': { slug: 'kindred:golems', category: 'themes' },
  'humans': { slug: 'kindred:humans', category: 'themes' },
  'human': { slug: 'kindred:humans', category: 'themes' },
  'hydras': { slug: 'kindred:hydras', category: 'themes' },
  'hydra': { slug: 'kindred:hydras', category: 'themes' },
  'knights': { slug: 'kindred:knights', category: 'themes' },
  'knight': { slug: 'kindred:knights', category: 'themes' },
  'krakens': { slug: 'kindred:krakens', category: 'themes' },
  'kraken': { slug: 'kindred:krakens', category: 'themes' },
  'sea monsters': { slug: 'kindred:krakens', category: 'themes' },
  'sea creatures': { slug: 'kindred:krakens', category: 'themes' },
  'sea-creatures': { slug: 'kindred:krakens', category: 'themes' },  // hyphenated
  'merfolk': { slug: 'kindred:merfolk', category: 'themes' },
  'myr': { slug: 'kindred:myr', category: 'themes' },
  'ninjas': { slug: 'kindred:ninjas', category: 'themes' },
  'ninja': { slug: 'kindred:ninjas', category: 'themes' },
  'phoenixes': { slug: 'kindred:phoenixes', category: 'themes' },
  'phoenix': { slug: 'kindred:phoenixes', category: 'themes' },
  'pirates': { slug: 'kindred:pirates', category: 'themes' },
  'pirate': { slug: 'kindred:pirates', category: 'themes' },
  'rats': { slug: 'kindred:rats', category: 'themes' },
  'rat': { slug: 'kindred:rats', category: 'themes' },
  'rogues': { slug: 'kindred:rogues', category: 'themes' },
  'rogue': { slug: 'kindred:rogues', category: 'themes' },
  'saprolings': { slug: 'kindred:saprolings', category: 'themes' },
  'saproling': { slug: 'kindred:saprolings', category: 'themes' },
  'fungus': { slug: 'kindred:saprolings', category: 'themes' },
  'shamans': { slug: 'kindred:shamans', category: 'themes' },
  'shaman': { slug: 'kindred:shamans', category: 'themes' },
  'slivers': { slug: 'kindred:slivers', category: 'themes' },
  'sliver': { slug: 'kindred:slivers', category: 'themes' },
  'snakes': { slug: 'kindred:snakes', category: 'themes' },
  'snake': { slug: 'kindred:snakes', category: 'themes' },
  'soldiers': { slug: 'kindred:soldiers', category: 'themes' },
  'soldier': { slug: 'kindred:soldiers', category: 'themes' },
  'sphinxes': { slug: 'kindred:sphinxes', category: 'themes' },
  'sphinx': { slug: 'kindred:sphinxes', category: 'themes' },
  'spirits': { slug: 'kindred:spirits', category: 'themes' },
  'spirit': { slug: 'kindred:spirits', category: 'themes' },
  'squirrels': { slug: 'kindred:squirrels', category: 'themes' },
  'squirrel': { slug: 'kindred:squirrels', category: 'themes' },
  'thopters': { slug: 'kindred:thopters', category: 'themes' },
  'thopter': { slug: 'kindred:thopters', category: 'themes' },
  'treefolk': { slug: 'kindred:treefolk', category: 'themes' },
  'vampires': { slug: 'kindred:vampires', category: 'themes' },
  'vampire': { slug: 'kindred:vampires', category: 'themes' },
  'warriors': { slug: 'kindred:warriors', category: 'themes' },
  'warrior': { slug: 'kindred:warriors', category: 'themes' },
  'werewolves': { slug: 'kindred:werewolves', category: 'themes' },
  'werewolf': { slug: 'kindred:werewolves', category: 'themes' },
  'wizards': { slug: 'kindred:wizards', category: 'themes' },
  'wizard': { slug: 'kindred:wizards', category: 'themes' },
  'wolves': { slug: 'kindred:wolves', category: 'themes' },
  'wolf': { slug: 'kindred:wolves', category: 'themes' },
  'zombies': { slug: 'kindred:zombies', category: 'themes' },
  'zombie': { slug: 'kindred:zombies', category: 'themes' },
  'skeletons': { slug: 'kindred:zombies', category: 'themes', isSubVariant: true },  // mechanically similar to zombies
  
  // Additional tribes
  'phyrexians': { slug: 'kindred:phyrexians', category: 'themes' },
  'phyrexian': { slug: 'kindred:phyrexians', category: 'themes' },
  'praetors': { slug: 'kindred:phyrexians', category: 'themes', isSubVariant: true },  // praetor subtype
  'assassins': { slug: 'kindred:assassins', category: 'themes' },
  'assassin': { slug: 'kindred:assassins', category: 'themes' },
  'birds': { slug: 'kindred:birds', category: 'themes' },
  'bird': { slug: 'kindred:birds', category: 'themes' },
  'allies': { slug: 'kindred:allies', category: 'themes' },
  'ally': { slug: 'kindred:allies', category: 'themes' },
  'dwarves': { slug: 'kindred:dwarves', category: 'themes' },
  'dwarf': { slug: 'kindred:dwarves', category: 'themes' },
  'dogs': { slug: 'kindred:dogs', category: 'themes' },
  'dog': { slug: 'kindred:dogs', category: 'themes' },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW TAXONOMY ENTRIES — promoted from unmapped tag review (2026-08-06)
  // Four new archetypes, five new themes. See
  // research/docs/product/taxonomy-archetypes-and-themes.md for the reasoning
  // behind each category placement.
  // ═══════════════════════════════════════════════════════════════════════════

  // NOTE: Extra Combats, Extra Turns, Toolbox, Topdeck, Toughness Matters, 
  // Defenders, Monarch, Tap/Untap, and Snow have been moved to their proper
  // sections above in the main archetypes/themes blocks.

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL MAPPINGS — reviewed from unmapped tag report (2026-08-05)
  // Each maps a real sub-theme/mechanic onto an existing slug rather than
  // creating a new taxonomy entry. See tag-mapping-report.md review notes for
  // tags that were judged to deserve their own new entry instead.
  // ═══════════════════════════════════════════════════════════════════════════

  // → Spellslinger — now in archetypes section
  'prowess': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'all spells': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'all-spells': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },  // hyphenated
  'arcane': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'suspend': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },
  'spell-copy': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },  // hyphenated
  'x-spells': { slug: 'spellslinger', category: 'archetypes', isSubVariant: true },  // hyphenated
  
  // → Ramp
  'big-mana': { slug: 'ramp', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Enchantments
  'sagas': { slug: 'enchantments', category: 'themes', isSubVariant: true },
  'shrines': { slug: 'enchantments', category: 'themes', isSubVariant: true },
  'curses': { slug: 'enchantments', category: 'themes', isSubVariant: true },

  // → Tokens
  'populate': { slug: 'tokens', category: 'themes', isSubVariant: true },
  'weenies': { slug: 'tokens', category: 'themes', isSubVariant: true },
  'convoke': { slug: 'tokens', category: 'themes', isSubVariant: true },
  'offspring': { slug: 'tokens', category: 'themes', isSubVariant: true },
  'incubate': { slug: 'tokens', category: 'themes', isSubVariant: true },
  'squad': { slug: 'tokens', category: 'themes', isSubVariant: true },

  // → Voltron (evasion/single-threat payoffs)
  'unblockable': { slug: 'voltron', category: 'archetypes', isSubVariant: true },
  'landwalk': { slug: 'voltron', category: 'archetypes', isSubVariant: true },
  'exalted': { slug: 'voltron', category: 'archetypes', isSubVariant: true },
  'heroic': { slug: 'voltron', category: 'archetypes', isSubVariant: true },
  'skulk': { slug: 'voltron', category: 'archetypes', isSubVariant: true },

  // → Tribes (same-name-card decks and closely tied creature types)
  'rat colony': { slug: 'kindred:rats', category: 'themes', isSubVariant: true },
  'rat-colony': { slug: 'kindred:rats', category: 'themes', isSubVariant: true },  // hyphenated
  'relentless rats': { slug: 'kindred:rats', category: 'themes', isSubVariant: true },
  'relentless-rats': { slug: 'kindred:rats', category: 'themes', isSubVariant: true },  // hyphenated
  'shadowborn apostles': { slug: 'kindred:demons', category: 'themes', isSubVariant: true },
  'shadowborn-apostles': { slug: 'kindred:demons', category: 'themes', isSubVariant: true },  // hyphenated
  'templar knights': { slug: 'kindred:knights', category: 'themes', isSubVariant: true },
  'templar-knights': { slug: 'kindred:knights', category: 'themes', isSubVariant: true },  // hyphenated
  "dragon's approach": { slug: 'kindred:dragons', category: 'themes', isSubVariant: true },
  'dragons-approach': { slug: 'kindred:dragons', category: 'themes', isSubVariant: true },  // hyphenated
  'annihilator': { slug: 'kindred:eldrazi', category: 'themes', isSubVariant: true },
  'day / night': { slug: 'kindred:werewolves', category: 'themes', isSubVariant: true },
  'day-night': { slug: 'kindred:werewolves', category: 'themes', isSubVariant: true },  // hyphenated
  'enrage': { slug: 'kindred:dinosaurs', category: 'themes', isSubVariant: true },
  'fungi': { slug: 'kindred:saprolings', category: 'themes', isSubVariant: true },
  'robots': { slug: 'kindred:constructs', category: 'themes', isSubVariant: true },
  'servos': { slug: 'kindred:constructs', category: 'themes', isSubVariant: true },
  'saboteurs': { slug: 'kindred:ninjas', category: 'themes', isSubVariant: true },
  'ninjutsu': { slug: 'kindred:ninjas', category: 'themes', isSubVariant: true },  // mechanic = tribe

  // → Aggro
  'attack triggers': { slug: 'aggro', category: 'archetypes', isSubVariant: true },
  'attack-triggers': { slug: 'aggro', category: 'archetypes', isSubVariant: true },  // hyphenated
  'stompy': { slug: 'aggro', category: 'archetypes', isSubVariant: true },
  'glass cannon': { slug: 'aggro', category: 'archetypes', isSubVariant: true },
  'glass-cannon': { slug: 'aggro', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Combo (named build-around packages)
  'eggs': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'cheerios': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'ad nauseam': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'ad-nauseam': { slug: 'combo', category: 'archetypes', isSubVariant: true },  // hyphenated
  'primal surge': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'primal-surge': { slug: 'combo', category: 'archetypes', isSubVariant: true },  // hyphenated
  'sneak attack': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'sneak-attack': { slug: 'combo', category: 'archetypes', isSubVariant: true },  // hyphenated
  'polymorph': { slug: 'combo', category: 'archetypes', isSubVariant: true },
  'doomsday': { slug: 'combo', category: 'archetypes', isSubVariant: true },

  // → Counters
  'counters matter': { slug: 'counters', category: 'themes' },
  'counters-matter': { slug: 'counters', category: 'themes' },  // hyphenated
  'modular': { slug: 'counters', category: 'themes', isSubVariant: true },
  'spore counters': { slug: 'counters', category: 'themes', isSubVariant: true },
  'spore-counters': { slug: 'counters', category: 'themes', isSubVariant: true },  // hyphenated
  'stun': { slug: 'counters', category: 'themes', isSubVariant: true },
  'time counters': { slug: 'counters', category: 'themes', isSubVariant: true },
  'time-counters': { slug: 'counters', category: 'themes', isSubVariant: true },  // hyphenated
  'oil counters': { slug: 'counters', category: 'themes', isSubVariant: true },
  'oil-counters': { slug: 'counters', category: 'themes', isSubVariant: true },  // hyphenated

  // → Stax
  'prison': { slug: 'stax', category: 'archetypes' },

  // → Group Slug (punisher/damage-everyone effects)
  'pingers': { slug: 'group-slug', category: 'archetypes', isSubVariant: true },
  'donate': { slug: 'group-slug', category: 'archetypes', isSubVariant: true },
  'myriad': { slug: 'group-slug', category: 'archetypes', isSubVariant: true },
  // NOTE: 'forced combat' moved to main Group Slug section above

  // → Lands Matter
  'tron': { slug: 'lands-matter', category: 'archetypes', isSubVariant: true },
  'land animation': { slug: 'lands-matter', category: 'archetypes', isSubVariant: true },
  'land-animation': { slug: 'lands-matter', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Ramp
  'mana dorks': { slug: 'ramp', category: 'archetypes', isSubVariant: true },
  'mana-dorks': { slug: 'ramp', category: 'archetypes', isSubVariant: true },  // hyphenated
  'mana rocks': { slug: 'ramp', category: 'archetypes', isSubVariant: true },
  'mana-rocks': { slug: 'ramp', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Graveyard
  'self-discard': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'delver': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'surveil': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'looting': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'connive': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'delirium': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'descend': { slug: 'graveyard', category: 'themes', isSubVariant: true },
  'retrace': { slug: 'graveyard', category: 'themes', isSubVariant: true },

  // → Sacrifice
  'evoke': { slug: 'sacrifice', category: 'themes', isSubVariant: true },
  'fling': { slug: 'sacrifice', category: 'themes', isSubVariant: true },
  'self-destruct': { slug: 'sacrifice', category: 'themes', isSubVariant: true },
  'exploit': { slug: 'sacrifice', category: 'themes', isSubVariant: true },

  // → Blink
  'bounce': { slug: 'blink', category: 'archetypes', isSubVariant: true },
  'ltb effects': { slug: 'blink', category: 'archetypes', isSubVariant: true },
  'ltb-effects': { slug: 'blink', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Wheels
  'hand size': { slug: 'wheels', category: 'archetypes', isSubVariant: true },
  'hand-size': { slug: 'wheels', category: 'archetypes', isSubVariant: true },  // hyphenated
  'hellbent': { slug: 'wheels', category: 'archetypes', isSubVariant: true },

  // → Theft
  'crime': { slug: 'theft', category: 'archetypes', isSubVariant: true },

  // → Control
  'creatureless': { slug: 'control', category: 'archetypes', isSubVariant: true },

  // → Group Hug
  'voting': { slug: 'group-hug', category: 'archetypes', isSubVariant: true },

  // → Pillowfort
  'turbo fog': { slug: 'pillowfort', category: 'archetypes', isSubVariant: true },
  'turbo-fog': { slug: 'pillowfort', category: 'archetypes', isSubVariant: true },  // hyphenated
  'aikido': { slug: 'pillowfort', category: 'archetypes', isSubVariant: true },

  // → Good Stuff
  'rock': { slug: 'good-stuff', category: 'archetypes', isSubVariant: true },

  // → Equipment
  'stoneblade': { slug: 'equipment', category: 'themes', isSubVariant: true },

  // → Artifacts Matter
  'artificers': { slug: 'artifacts-matter', category: 'archetypes', isSubVariant: true },
  'improvise': { slug: 'artifacts-matter', category: 'archetypes', isSubVariant: true },

  // → Lifegain
  'life exchange': { slug: 'lifegain', category: 'archetypes', isSubVariant: true },
  'life-exchange': { slug: 'lifegain', category: 'archetypes', isSubVariant: true },  // hyphenated

  // → Exile
  'mayhem': { slug: 'exile', category: 'themes', isSubVariant: true },

  // NOTE: 'die roll' moved to main Chaos section above

  // ═══════════════════════════════════════════════════════════════════════════
  // IGNORED TAGS - Too generic, not useful, or commander-specific mechanics
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Budget/meta tags
  'budget': null,
  'precon': null,
  'precon upgrade': null,
  'upgraded precon': null,
  'cedh': null,
  'competitive': null,
  'casual': null,
  'high power': null,
  'low power': null,
  
  // Commander pairing mechanics (not strategies)
  'partner': null,
  'partners': null,
  'background': null,
  'backgrounds': null,
  'commander': null,
  'commanders': null,
  'experience counters': null,
  
  // 60-card format concepts that don't translate to Commander
  'midrange': null,
  
  // Set-specific mechanics (too niche)
  'amass': null,
  'the ring': null,
  'the-ring': null,  // hyphenated
  'foretell': null,  // Kaldheim mechanic, small payoff pool
  'miracle': null,  // tiny payoff pool
  
  // Niche tribes not in our taxonomy
  'wraiths': null,
  'orcs': null,
  
  // Too generic
  'value': null,
  'card draw': null,
  'draw': null,
  'tutor': null,
  'tutors': null,
  'protection': null,
  'evasion': null,
  'flying': null,
  'haste': null,
  'trample': null,
  'deathtouch': null,
  'lifelink': null,
  'first strike': null,
  'double strike': null,
  'flash': null,
  'hexproof': null,
  'indestructible': null,
  'vigilance': null,
  'menace': null,
  'reach': null,
  
  // Color-based (we handle colors separately)
  'mono white': null,
  'mono blue': null,
  'mono black': null,
  'mono red': null,
  'mono green': null,
  'colorless': null,
  'multicolor': null,
  'five color': null,
  '5 color': null,
  'multicolor matters': null,
  
  // Mechanics without clean homes yet — skip for now, revisit if count grows
  'morph': null,
  'mutate': null,
  'modified creatures': null,  // triggers off auras/equipment/counters — counters is only 1/3 of the card pool
  
  // Set-specific mechanics with small payoff pools
  'outlaws': null,  // OTJ mechanic, revisit if reinforced in future sets
  'dungeon': null,  // AFR mechanic, small payoff pool
  'rad-counters': null,  // Fallout UB
  'zoo': null,  // 60-card format concept
  'card-draw': null,  // too generic (hyphenated variant)
  'multicolor-matters': null,  // colors handled separately (hyphenated variant)
  'experience-counters': null,  // commander mechanic, doesn't interact with counters synergy (hyphenated)
  'modified-creatures': null,  // triggers off auras/equipment/counters, counters is only 1/3 of the card pool

  // ═══════════════════════════════════════════════════════════════════════════
  // IGNORED TAGS (batch 2) — reviewed from unmapped tag report (2026-08-05)
  // ═══════════════════════════════════════════════════════════════════════════

  // Universes Beyond flavor/crossover tags — not real cross-set strategies
  'earthbending': null,
  'firebending': null,
  'waterbending': null,
  'airbending': null,
  'daleks': null,
  'cybermen': null,
  'time lords': null,
  'time-lords': null,  // hyphenated
  'necrons': null,
  'tyranids': null,
  'astartes': null,
  'job select': null,
  'job-select': null,  // hyphenated
  'cid': null,
  'opus': null,
  'web-slinging': null,
  'symbiotes': null,
  'bobbleheads': null,

  // Companion legality tags — format restriction, not a strategy
  'kaheera companion': null,
  'kaheera-companion': null,  // hyphenated
  'keruga companion': null,
  'keruga-companion': null,  // hyphenated
  'obosh companion': null,
  'obosh-companion': null,  // hyphenated
  'zirda companion': null,
  'zirda-companion': null,  // hyphenated
  'umori companion': null,
  'umori-companion': null,  // hyphenated
  'jegantha companion': null,
  'jegantha-companion': null,  // hyphenated
  'lurrus companion': null,
  'lurrus-companion': null,  // hyphenated
  'gyruda companion': null,
  'gyruda-companion': null,  // hyphenated

  // Niche/meme creature types with no dedicated payoff package
  'frogs': null,
  'otters': null,
  'rabbits': null,
  'mice': null,
  'bats': null,
  'apes': null,
  'raccoons': null,
  'wurms': null,
  'spiders': null,
  'insects': null,
  'lizards': null,
  'monkeys': null,
  'foxes': null,
  'gnomes': null,
  'elephants': null,
  'pegasi': null,
  'sharks': null,
  'goats': null,
  'minotaurs': null,
  'halflings': null,
  'kithkin': null,
  'kor': null,
  'ogres': null,
  'bards': null,
  'cephalids': null,
  'crabs': null,
  'turtles': null,
  'drakes': null,
  'devils': null,
  'mercenaries': null,
  'whales': null,
  'scarecrows': null,
  'elders': null,
  'avatars': null,
  'moonfolk': null,
  'samurai': null,
  'plants': null,
  'horses': null,
  'archers': null,
  'berserkers': null,
  'griffins': null,
  'minions': null,
  'specters': null,
  'crocodiles': null,
  'hippos': null,
  'barbarians': null,
  'satyrs': null,
  'gorgons': null,
  'nightmares': null,
  'unicorns': null,
  'vanilla': null,
  'monks': null,
  'rebels': null,
  'advisors': null,
  'mounts': null,
  'detectives': null,
  'villains': null,
  'nobles': null,
  'heroes': null,
  'toys': null,
  'books': null,
  'horrors': null,
  'atogs': null,
  'illusions': null,
  'lhurgoyfs': null,
  'oozes': null,
  'mutants': null,
  'kavu': null,

  // Single-card, format, or meta tags — not deck-building strategies
  'sunforger': null,
  'persistent petitioners': null,
  'persistent-petitioners': null,  // hyphenated
  'hare apparent': null,
  'hare-apparent': null,  // hyphenated
  'slime against humanity': null,
  'slime-against-humanity': null,  // hyphenated
  'dandan': null,
  'european highlander': null,
  'planechase': null,
  'old school': null,
  'old-school': null,  // hyphenated
  'custom cards': null,
  'custom-cards': null,  // hyphenated
  'repartee': null,
  'shades': null,
  'rube goldberg': null,
  'rube-goldberg': null,  // hyphenated
  'tempest hawk': null,
  'tempest-hawk': null,  // hyphenated
  'clash': null,
  'banding': null,
  'lure': null,
  'dash': null,
  'type hack': null,
  'color hack': null,
  'paradigm': null,
  'value vintage': null,
  'blue moon': null,
  'blue-moon': null,  // hyphenated
  'villainous choice': null,
  'villainous-choice': null,  // hyphenated
  'stickers': null,
  'attractions': null,
  'lessons': null,
  'rooms': null,
  'spacecraft': null,
  'freerunning': null,
  'adventures': null,
  'battles': null,
  'towns': null,
  'warp': null,
  'plot': null,
  'craft': null,
  'level up': null,
  'horsemanship': null,
  'phasing': null,
  'miracles': null,
  'sunburst': null,
  'caves': null,
  'guildgates': null,
  'deserts': null,
  'devoid': null,
  'rad counters': null,
  'party': null,
  'sneak': null,
  'speed': null,
  'tempo': null,
  'turbo': null,
  'paradox': null,
  'summons': null,
  'bloodthirst': null,

  // Generic keyword mechanics — no distinct deck-building implication
  'fight': null,
  'scry': null,
  'explore': null,
  'triggered abilities': null,
  'triggered-abilities': null,  // hyphenated
  'activated abilities': null,
  'activated-abilities': null,  // hyphenated
  'keywords': null,
  'transform': null,
  'kicker': null,
  'unnatural': null,
};

/**
 * Normalize an EDHREC tag for lookup
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase().trim();
}

/**
 * Look up a tag mapping
 * @returns TagMapping if mapped, null if explicitly ignored, undefined if unmapped
 */
export function getTagMapping(tag: string): TagMapping | null | undefined {
  const normalized = normalizeTag(tag);
  return TAG_MAPPINGS[normalized];
}

/**
 * Check if a tag is explicitly ignored
 */
export function isIgnoredTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  return normalized in TAG_MAPPINGS && TAG_MAPPINGS[normalized] === null;
}

/**
 * Check if a tag is unmapped (not in our mapping table at all)
 */
export function isUnmappedTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  return !(normalized in TAG_MAPPINGS);
}
