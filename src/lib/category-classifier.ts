// category-classifier.ts — Three-tier card classification pipeline for deck health monitoring.
// No database dependencies; this module is imported by the health engine and tests.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunctionalCategory =
  | 'Ramp'
  | 'Draw'
  | 'Removal'
  | 'Interaction'
  | 'Finisher'
  | 'Board Wipe'
  | 'Recursion'
  | 'Tutor'
  | 'Protection'
  | 'Other'

export interface CardClassification {
  cardName: string
  category: FunctionalCategory
  source: 'archidekt' | 'heuristic' | 'override'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known Archidekt category strings that map to functional roles */
export const ARCHIDEKT_CATEGORY_MAP: Record<string, FunctionalCategory> = {
  'Ramp': 'Ramp',
  'Mana': 'Ramp',
  'Draw': 'Draw',
  'Card Draw': 'Draw',
  'Card Advantage': 'Draw',
  'Removal': 'Removal',
  'Single Target Removal': 'Removal',
  'Interaction': 'Interaction',
  'Counterspell': 'Interaction',
  'Counter': 'Interaction',
  'Protection': 'Protection',
  'Board Wipe': 'Board Wipe',
  'Wrath': 'Board Wipe',
  'Finisher': 'Finisher',
  'Win Condition': 'Finisher',
  'Win Con': 'Finisher',
  'Recursion': 'Recursion',
  'Graveyard': 'Recursion',
  'Tutor': 'Tutor',
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Tier 1: Map an Archidekt category string to a FunctionalCategory.
 * Parses rawCategories (may be JSON array or comma-separated string).
 * Returns null if no mapping found.
 */
export function mapArchidektCategory(
  rawCategories: string | null
): FunctionalCategory | null {
  if (!rawCategories) return null

  const categories = parseCategories(rawCategories)

  for (const cat of categories) {
    const trimmed = cat.trim()
    // Case-insensitive lookup against the map
    const match = Object.keys(ARCHIDEKT_CATEGORY_MAP).find(
      (key) => key.toLowerCase() === trimmed.toLowerCase()
    )
    if (match) {
      return ARCHIDEKT_CATEGORY_MAP[match]
    }
  }

  return null
}

/**
 * Tier 2: Infer a FunctionalCategory from oracle text and type line.
 * Returns 'Other' if no heuristic matches.
 */
export function inferFromOracleText(
  oracleText: string | null,
  typeLine: string | null
): FunctionalCategory {
  const text = oracleText ?? ''
  const type = typeLine ?? ''

  // Board Wipe — check before single-target removal to avoid false positives
  if (/destroy all/i.test(text) || /exile all/i.test(text) || /each creature/i.test(text)) {
    return 'Board Wipe'
  }

  // Ramp
  if (/add \{[WUBRGC]\}/i.test(text) || /adds? .* mana/i.test(text)) {
    return 'Ramp'
  }

  // Draw
  if (/draw .* card/i.test(text)) {
    return 'Draw'
  }

  // Interaction (counterspells) — check before removal
  if (/counter target.*spell/i.test(text)) {
    return 'Interaction'
  }

  // Removal (single-target)
  if (/destroy target/i.test(text) || /exile target/i.test(text) || /-\d+\/-\d+/.test(text)) {
    return 'Removal'
  }

  // Recursion
  if (/from .* graveyard .* to/i.test(text) || /return .* from .* graveyard/i.test(text)) {
    return 'Recursion'
  }

  // Tutor
  if (/search .* library/i.test(text)) {
    return 'Tutor'
  }

  // Protection
  if (/hexproof/i.test(text) || /indestructible/i.test(text) || /protection from/i.test(text)) {
    return 'Protection'
  }

  // Finisher — check oracle text patterns and creature power
  if (/each opponent/i.test(text)) {
    return 'Finisher'
  }
  // Creature with power >= 6
  if (/creature/i.test(type)) {
    const powerMatch = text.match(/(\d+)\/\d+/) || type.match(/(\d+)\/\d+/)
    if (powerMatch && parseInt(powerMatch[1], 10) >= 6) {
      return 'Finisher'
    }
    // Also check type line for power (e.g., "Creature — Dragon 7/7")
    const typeLinePower = type.match(/(\d+)\/\d+/)
    if (typeLinePower && parseInt(typeLinePower[1], 10) >= 6) {
      return 'Finisher'
    }
  }

  return 'Other'
}

/**
 * Classify a single card using the three-tier pipeline.
 *
 * Priority: manual override > Archidekt mapping > oracle text heuristic
 */
export function classifyCard(
  cardName: string,
  archidektCategories: string | null,
  oracleText: string | null,
  typeLine: string | null,
  overrides: Map<string, FunctionalCategory>
): CardClassification {
  // Tier 3 (highest priority): Manual override
  const override = overrides.get(cardName)
  if (override) {
    return { cardName, category: override, source: 'override' }
  }

  // Tier 1: Archidekt category mapping
  const archidektCategory = mapArchidektCategory(archidektCategories)
  if (archidektCategory) {
    return { cardName, category: archidektCategory, source: 'archidekt' }
  }

  // Tier 2: Oracle text heuristic
  const heuristicCategory = inferFromOracleText(oracleText, typeLine)
  return { cardName, category: heuristicCategory, source: 'heuristic' }
}

/**
 * Classify all non-land cards in a deck.
 */
export function classifyDeck(
  cards: Array<{
    cardName: string
    categories: string | null
    oracleText: string | null
    typeLine: string | null
    isLand: boolean
  }>,
  overrides: Map<string, FunctionalCategory>
): CardClassification[] {
  return cards
    .filter((card) => !card.isLand)
    .map((card) =>
      classifyCard(
        card.cardName,
        card.categories,
        card.oracleText,
        card.typeLine,
        overrides
      )
    )
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Parse raw category input — handles JSON arrays, comma-separated strings,
 * and single values.
 */
function parseCategories(raw: string): string[] {
  const trimmed = raw.trim()

  // Try JSON array parse first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map(String)
      }
    } catch {
      // Fall through to comma-separated parsing
    }
  }

  // Comma-separated string
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}
