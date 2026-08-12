/**
 * Scryfall Tag → Deck Category Mapping
 *
 * Maps Scryfall's community-curated function tags to our deck category taxonomy.
 * Used by the category suggestion system to auto-categorize cards.
 *
 * Category taxonomy reference: docs/category-taxonomy.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CategoryMapping {
  /** Primary category to suggest */
  primary: string
  /** Secondary categories (optional) */
  secondary?: string[]
  /** Confidence level of this mapping */
  confidence: 'high' | 'medium' | 'low'
}

export interface CategorySuggestion {
  category: string
  confidence: 'high' | 'medium' | 'low'
  source: 'tag' | 'archetype' | 'theme'
  sourceValue: string
}

// ---------------------------------------------------------------------------
// Tag → Category Mapping
// ---------------------------------------------------------------------------

/**
 * Direct mapping from Scryfall tags to deck categories.
 * 
 * Priority:
 * 1. High confidence: Tag directly maps to a single clear category
 * 2. Medium confidence: Tag could map to multiple categories
 * 3. Low confidence: Tag is vague or context-dependent
 */
export const TAG_TO_CATEGORY: Record<string, CategoryMapping> = {
  // === RAMP ===
  'ramp': { primary: 'Ramp', confidence: 'high' },
  'tutor-land-to-battlefield': { primary: 'Ramp', confidence: 'high' },
  'tutor-land-basic': { primary: 'Ramp', secondary: ['Tutor'], confidence: 'high' },
  
  // === CARD DRAW / CARD ADVANTAGE ===
  'cantrip': { primary: 'Draw', confidence: 'high' },
  'pure-draw': { primary: 'Draw', confidence: 'high' },
  'draw-engine': { primary: 'Draw', confidence: 'high' },
  'card-advantage': { primary: 'Draw', confidence: 'high' },
  
  // === REMOVAL ===
  'sweeper': { primary: 'Removal', secondary: ['Board Wipe'], confidence: 'high' },
  'removal-exile': { primary: 'Removal', confidence: 'high' },
  'removal-permanent': { primary: 'Removal', confidence: 'high' },
  'removal-destroy': { primary: 'Removal', confidence: 'high' },
  'spot-removal': { primary: 'Removal', confidence: 'high' },
  'pinger': { primary: 'Removal', secondary: ['Utility'], confidence: 'medium' },
  'bounce': { primary: 'Removal', confidence: 'medium' },
  
  // === COUNTERSPELLS ===
  'counterspell': { primary: 'Counterspell', confidence: 'high' },
  'counterspell-soft': { primary: 'Counterspell', confidence: 'high' },
  'counterspell-hard': { primary: 'Counterspell', confidence: 'high' },
  
  // === TUTORS ===
  'tutor-to-hand': { primary: 'Tutor', confidence: 'high' },
  'tutor-to-battlefield': { primary: 'Tutor', confidence: 'high' },
  'tutor-card': { primary: 'Tutor', confidence: 'high' },
  'tutor-creature': { primary: 'Tutor', confidence: 'high' },
  'tutor-artifact': { primary: 'Tutor', confidence: 'high' },
  'tutor-enchantment': { primary: 'Tutor', confidence: 'high' },
  'tutor-instant': { primary: 'Tutor', confidence: 'high' },
  'tutor-sorcery': { primary: 'Tutor', confidence: 'high' },
  
  // === PROTECTION ===
  'protects-creature': { primary: 'Protection', confidence: 'high' },
  'protects-player': { primary: 'Protection', confidence: 'high' },
  'fog': { primary: 'Protection', confidence: 'high' },
  'gives-hexproof': { primary: 'Protection', confidence: 'high' },
  'gives-indestructible': { primary: 'Protection', confidence: 'high' },
  'gives-shroud': { primary: 'Protection', confidence: 'high' },
  
  // === RECURSION ===
  'reanimate-creature': { primary: 'Recursion', confidence: 'high' },
  'reanimate-artifact': { primary: 'Recursion', confidence: 'high' },
  'reanimate-enchantment': { primary: 'Recursion', confidence: 'high' },
  'reanimate-any': { primary: 'Recursion', confidence: 'high' },
  'recursion': { primary: 'Recursion', confidence: 'high' },
  'castable-from-graveyard': { primary: 'Recursion', confidence: 'medium' },
  
  // === DISCARD ===
  'discard': { primary: 'Discard', confidence: 'high' },
  'discard-outlet': { primary: 'Utility', secondary: ['Discard'], confidence: 'medium' },
  'hand-disruption': { primary: 'Discard', confidence: 'high' },
  
  // === MILL ===
  'mill-self': { primary: 'Mill', secondary: ['Utility'], confidence: 'high' },
  'mill-opponent': { primary: 'Mill', confidence: 'high' },
  'mill-any': { primary: 'Mill', confidence: 'high' },
  'mill-exile': { primary: 'Mill', confidence: 'high' },
  
  // === UTILITY / VALUE ===
  'anthem': { primary: 'Utility', secondary: ['Anthem'], confidence: 'high' },
  'evasion': { primary: 'Utility', secondary: ['Evasion'], confidence: 'medium' },
  'lifegain': { primary: 'Utility', secondary: ['Lifegain'], confidence: 'medium' },
  'tapper-creature': { primary: 'Utility', confidence: 'medium' },
  'untapper-creature': { primary: 'Utility', confidence: 'medium' },
  'clone': { primary: 'Utility', secondary: ['Clone'], confidence: 'high' },
  'token-generator': { primary: 'Utility', secondary: ['Tokens'], confidence: 'high' },
  'sacrifice-outlet': { primary: 'Utility', secondary: ['Sac Outlet'], confidence: 'high' },
  'free-sacrifice-outlet': { primary: 'Utility', secondary: ['Sac Outlet'], confidence: 'high' },
  'sacrifice-outlet-creature': { primary: 'Utility', secondary: ['Sac Outlet'], confidence: 'high' },
  'repeatable-sacrifice-outlet': { primary: 'Utility', secondary: ['Sac Outlet'], confidence: 'high' },
  'death-trigger': { primary: 'Utility', secondary: ['Death Trigger'], confidence: 'high' },
  'martyr': { primary: 'Utility', secondary: ['Sacrifice'], confidence: 'medium' },
  'saboteur': { primary: 'Utility', secondary: ['Combat Damage'], confidence: 'medium' },
  'symmetrical': { primary: 'Utility', confidence: 'low' },
  
  // === SYNERGY TAGS ===
  'synergy-artifact': { primary: 'Utility', secondary: ['Artifacts'], confidence: 'low' },
  'synergy-enchantment': { primary: 'Utility', secondary: ['Enchantments'], confidence: 'low' },
  'synergy-equipment': { primary: 'Utility', secondary: ['Equipment'], confidence: 'medium' },
  'synergy-aura': { primary: 'Utility', secondary: ['Auras'], confidence: 'medium' },
  'synergy-instant': { primary: 'Utility', secondary: ['Spellslinger'], confidence: 'low' },
  'synergy-sorcery': { primary: 'Utility', secondary: ['Spellslinger'], confidence: 'low' },
  'synergy-proliferate': { primary: 'Utility', secondary: ['Counters'], confidence: 'medium' },
  
  // === TRIGGERS ===
  'landfall': { primary: 'Utility', secondary: ['Landfall'], confidence: 'high' },
  'creaturefall': { primary: 'Utility', secondary: ['ETB'], confidence: 'medium' },
  'artifactfall': { primary: 'Utility', secondary: ['Artifacts'], confidence: 'medium' },
  'etb': { primary: 'Utility', secondary: ['ETB'], confidence: 'medium' },
  'magecraft': { primary: 'Utility', secondary: ['Spellslinger'], confidence: 'high' },
  'cast-trigger': { primary: 'Utility', secondary: ['Cast Trigger'], confidence: 'medium' },
}

// ---------------------------------------------------------------------------
// Archetype → Category Hints
// ---------------------------------------------------------------------------

/**
 * Maps archetypes to category suggestions.
 * These are hints based on deck context, not direct mappings.
 */
export const ARCHETYPE_CATEGORY_HINTS: Record<string, CategoryMapping> = {
  'aristocrats': { primary: 'Utility', secondary: ['Sac Outlet', 'Death Trigger'], confidence: 'medium' },
  'control': { primary: 'Counterspell', secondary: ['Removal'], confidence: 'low' },
  'aggro': { primary: 'Creature', confidence: 'low' },
  'voltron': { primary: 'Utility', secondary: ['Equipment', 'Auras', 'Protection'], confidence: 'low' },
  'mill': { primary: 'Mill', confidence: 'medium' },
  'blink': { primary: 'Utility', secondary: ['ETB'], confidence: 'medium' },
  'reanimator': { primary: 'Recursion', confidence: 'medium' },
  'spellslinger': { primary: 'Utility', secondary: ['Spellslinger'], confidence: 'medium' },
  'tokens': { primary: 'Utility', secondary: ['Tokens'], confidence: 'medium' },
  'combo': { primary: 'Combo', confidence: 'low' },
}

// ---------------------------------------------------------------------------
// Theme → Category Hints
// ---------------------------------------------------------------------------

/**
 * Maps themes to category suggestions.
 */
export const THEME_CATEGORY_HINTS: Record<string, CategoryMapping> = {
  'artifacts': { primary: 'Utility', secondary: ['Artifacts'], confidence: 'low' },
  'enchantments': { primary: 'Utility', secondary: ['Enchantments'], confidence: 'low' },
  'equipment': { primary: 'Utility', secondary: ['Equipment'], confidence: 'medium' },
  'auras': { primary: 'Utility', secondary: ['Auras'], confidence: 'medium' },
  'counters': { primary: 'Utility', secondary: ['Counters'], confidence: 'medium' },
  'tokens': { primary: 'Utility', secondary: ['Tokens'], confidence: 'medium' },
  'graveyard': { primary: 'Utility', secondary: ['Graveyard'], confidence: 'medium' },
  'lifegain': { primary: 'Utility', secondary: ['Lifegain'], confidence: 'medium' },
  'sacrifice': { primary: 'Utility', secondary: ['Sacrifice'], confidence: 'medium' },
  'proliferate': { primary: 'Utility', secondary: ['Counters'], confidence: 'medium' },
  // Kindred/tribal themes
  'kindred:dragons': { primary: 'Tribal', secondary: ['Dragons'], confidence: 'high' },
  'kindred:elves': { primary: 'Tribal', secondary: ['Elves'], confidence: 'high' },
  'kindred:zombies': { primary: 'Tribal', secondary: ['Zombies'], confidence: 'high' },
  'kindred:goblins': { primary: 'Tribal', secondary: ['Goblins'], confidence: 'high' },
  'kindred:vampires': { primary: 'Tribal', secondary: ['Vampires'], confidence: 'high' },
  'kindred:spirits': { primary: 'Tribal', secondary: ['Spirits'], confidence: 'high' },
  'kindred:slivers': { primary: 'Tribal', secondary: ['Slivers'], confidence: 'high' },
  'kindred:humans': { primary: 'Tribal', secondary: ['Humans'], confidence: 'high' },
  'kindred:merfolk': { primary: 'Tribal', secondary: ['Merfolk'], confidence: 'high' },
  'kindred:wizards': { primary: 'Tribal', secondary: ['Wizards'], confidence: 'high' },
  'kindred:pirates': { primary: 'Tribal', secondary: ['Pirates'], confidence: 'high' },
  'kindred:dwarves': { primary: 'Tribal', secondary: ['Dwarves'], confidence: 'high' },
}

// ---------------------------------------------------------------------------
// Tribal Tags Mapping
// ---------------------------------------------------------------------------

/**
 * Direct typal tag to tribal category mapping.
 */
export const TYPAL_TO_TRIBAL: Record<string, string> = {
  'typal-dragon': 'Dragons',
  'typal-elf': 'Elves',
  'typal-zombie': 'Zombies',
  'typal-goblin': 'Goblins',
  'typal-vampire': 'Vampires',
  'typal-spirit': 'Spirits',
  'typal-sliver': 'Slivers',
  'typal-human': 'Humans',
  'typal-merfolk': 'Merfolk',
  'typal-wizard': 'Wizards',
  'typal-pirate': 'Pirates',
  'typal-dwarf': 'Dwarves',
  'typal-angel': 'Angels',
  'typal-demon': 'Demons',
  'typal-beast': 'Beasts',
  'typal-dinosaur': 'Dinosaurs',
  'typal-rat': 'Rats',
  'typal-cat': 'Cats',
  'typal-dog': 'Dogs',
  'typal-bird': 'Birds',
  'typal-soldier': 'Soldiers',
  'typal-knight': 'Knights',
  'typal-cleric': 'Clerics',
  'typal-rogue': 'Rogues',
  'typal-warrior': 'Warriors',
  'typal-shaman': 'Shamans',
  'typal-druid': 'Druids',
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Get category suggestions for a card based on its Scryfall tags.
 */
export function suggestCategoriesFromTags(
  tags: string[],
  archetypeSignals?: Array<{ archetype: string; weight: number }>,
  themeSignals?: Array<{ theme: string; weight: number }>
): CategorySuggestion[] {
  const suggestions: CategorySuggestion[] = []
  const seen = new Set<string>()

  // Process direct tag mappings (highest priority)
  for (const tag of tags) {
    const mapping = TAG_TO_CATEGORY[tag]
    if (mapping && !seen.has(mapping.primary)) {
      seen.add(mapping.primary)
      suggestions.push({
        category: mapping.primary,
        confidence: mapping.confidence,
        source: 'tag',
        sourceValue: tag,
      })
    }

    // Add secondary categories
    if (mapping?.secondary) {
      for (const secondary of mapping.secondary) {
        if (!seen.has(secondary)) {
          seen.add(secondary)
          suggestions.push({
            category: secondary,
            confidence: 'low', // Secondary categories are always low confidence
            source: 'tag',
            sourceValue: tag,
          })
        }
      }
    }

    // Check typal tags
    const tribal = TYPAL_TO_TRIBAL[tag]
    if (tribal && !seen.has('Tribal')) {
      seen.add('Tribal')
      suggestions.push({
        category: 'Tribal',
        confidence: 'high',
        source: 'tag',
        sourceValue: tag,
      })
      if (!seen.has(tribal)) {
        seen.add(tribal)
        suggestions.push({
          category: tribal,
          confidence: 'high',
          source: 'tag',
          sourceValue: tag,
        })
      }
    }
  }

  // Process archetype signals
  if (archetypeSignals) {
    for (const { archetype, weight } of archetypeSignals) {
      if (weight >= 2) { // Only consider signals with weight >= 2
        const hint = ARCHETYPE_CATEGORY_HINTS[archetype.toLowerCase()]
        if (hint && !seen.has(hint.primary)) {
          seen.add(hint.primary)
          suggestions.push({
            category: hint.primary,
            confidence: hint.confidence,
            source: 'archetype',
            sourceValue: archetype,
          })
        }
      }
    }
  }

  // Process theme signals
  if (themeSignals) {
    for (const { theme, weight } of themeSignals) {
      if (weight >= 2) {
        const hint = THEME_CATEGORY_HINTS[theme.toLowerCase()]
        if (hint && !seen.has(hint.primary)) {
          seen.add(hint.primary)
          suggestions.push({
            category: hint.primary,
            confidence: hint.confidence,
            source: 'theme',
            sourceValue: theme,
          })
        }
      }
    }
  }

  // Sort by confidence (high > medium > low) then by source (tag > archetype > theme)
  const confidenceOrder = { high: 3, medium: 2, low: 1 }
  const sourceOrder = { tag: 3, archetype: 2, theme: 1 }
  
  return suggestions.sort((a, b) => {
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
    if (confDiff !== 0) return confDiff
    return sourceOrder[b.source] - sourceOrder[a.source]
  })
}

/**
 * Get the best single category suggestion.
 * Returns the highest confidence primary category.
 */
export function getBestCategorySuggestion(
  tags: string[],
  archetypeSignals?: Array<{ archetype: string; weight: number }>,
  themeSignals?: Array<{ theme: string; weight: number }>
): CategorySuggestion | null {
  const suggestions = suggestCategoriesFromTags(tags, archetypeSignals, themeSignals)
  return suggestions.length > 0 ? suggestions[0] : null
}

/**
 * Check if a tag has a high-confidence category mapping.
 */
export function hasHighConfidenceMapping(tag: string): boolean {
  const mapping = TAG_TO_CATEGORY[tag]
  return mapping?.confidence === 'high'
}

/**
 * Get all available categories from the mapping.
 * Useful for populating category pickers.
 */
export function getAvailableCategories(): string[] {
  const categories = new Set<string>()
  
  for (const mapping of Object.values(TAG_TO_CATEGORY)) {
    categories.add(mapping.primary)
    if (mapping.secondary) {
      mapping.secondary.forEach(cat => categories.add(cat))
    }
  }
  
  for (const mapping of Object.values(ARCHETYPE_CATEGORY_HINTS)) {
    categories.add(mapping.primary)
    if (mapping.secondary) {
      mapping.secondary.forEach(cat => categories.add(cat))
    }
  }
  
  for (const mapping of Object.values(THEME_CATEGORY_HINTS)) {
    categories.add(mapping.primary)
    if (mapping.secondary) {
      mapping.secondary.forEach(cat => categories.add(cat))
    }
  }
  
  // Add tribal categories
  Object.values(TYPAL_TO_TRIBAL).forEach(tribal => categories.add(tribal))
  categories.add('Tribal')
  
  // Add standard categories
  const standardCategories = [
    'Ramp', 'Draw', 'Removal', 'Counterspell', 'Tutor', 'Protection',
    'Recursion', 'Discard', 'Mill', 'Utility', 'Finisher', 'Engine',
    'Land', 'Commander', 'Creature', 'Combo'
  ]
  standardCategories.forEach(cat => categories.add(cat))
  
  return Array.from(categories).sort()
}
