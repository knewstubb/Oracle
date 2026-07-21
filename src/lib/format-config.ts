/**
 * Format Configuration — defines rules for each supported MTG format.
 *
 * This is the single source of truth for format-specific behavior across
 * the app (deck creation, analysis, allocation, brew).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeckFormat =
  | 'commander'
  | 'standard'
  | 'modern'
  | 'legacy'
  | 'vintage'
  | 'pioneer'
  | 'pauper'
  | 'cube'
  | 'casual'

export interface FormatDefinition {
  id: DeckFormat
  label: string
  /** Target deck size (null = no target, user decides) */
  deckSize: number | null
  /** Whether the count must be exact or is a minimum */
  countRule: 'exact' | 'minimum' | null
  /** Maximum copies of a single card (null = no limit) */
  maxCopies: number | null
  /** Whether the format enforces singleton (1 copy max) */
  singleton: boolean
  /** Whether decks in this format have a commander */
  hasCommander: boolean
  /** Whether color identity filtering applies */
  colorIdentityRule: boolean
  /** Whether AI brew is available for this format */
  brewEnabled: boolean
  /** Short description for UI tooltips */
  description: string
}

// ---------------------------------------------------------------------------
// Format Definitions
// ---------------------------------------------------------------------------

export const FORMAT_DEFINITIONS: Record<DeckFormat, FormatDefinition> = {
  commander: {
    id: 'commander',
    label: 'Commander',
    deckSize: 100,
    countRule: 'exact',
    maxCopies: 1,
    singleton: true,
    hasCommander: true,
    colorIdentityRule: true,
    brewEnabled: true,
    description: '100-card singleton with a legendary commander',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, up to 4 copies per card',
  },
  modern: {
    id: 'modern',
    label: 'Modern',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, cards from 8th Edition onward',
  },
  legacy: {
    id: 'legacy',
    label: 'Legacy',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, nearly all cards legal',
  },
  vintage: {
    id: 'vintage',
    label: 'Vintage',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, all cards legal (some restricted)',
  },
  pioneer: {
    id: 'pioneer',
    label: 'Pioneer',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, Return to Ravnica onward',
  },
  pauper: {
    id: 'pauper',
    label: 'Pauper',
    deckSize: 60,
    countRule: 'minimum',
    maxCopies: 4,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: '60-card constructed, commons only',
  },
  cube: {
    id: 'cube',
    label: 'Cube',
    deckSize: 360,
    countRule: 'minimum',
    maxCopies: 1,
    singleton: true,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: 'Custom draft environment, typically 360 singleton cards',
  },
  casual: {
    id: 'casual',
    label: 'Casual',
    deckSize: null,
    countRule: null,
    maxCopies: null,
    singleton: false,
    hasCommander: false,
    colorIdentityRule: false,
    brewEnabled: false,
    description: 'No rules — just a container for cards',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get all format options for dropdowns/selects */
export const FORMAT_OPTIONS: { value: DeckFormat; label: string }[] = Object.values(FORMAT_DEFINITIONS).map(f => ({
  value: f.id,
  label: f.label,
}))

/** Get format config by ID (defaults to commander if unknown) */
export function getFormatConfig(format: string | null | undefined): FormatDefinition {
  if (!format) return FORMAT_DEFINITIONS.commander
  return FORMAT_DEFINITIONS[format as DeckFormat] ?? FORMAT_DEFINITIONS.commander
}

/** Get the display label for a deck size target */
export function getDeckSizeLabel(format: string | null | undefined): string {
  const config = getFormatConfig(format)
  if (config.deckSize === null) return '—'
  return `${config.deckSize}`
}

// ---------------------------------------------------------------------------
// Count Validation
// ---------------------------------------------------------------------------

export interface CountValidation {
  /** Whether the current count satisfies the format's rule */
  valid: boolean
  /** Current card count */
  current: number
  /** Required count (target for exact, minimum for minimum rule) */
  required: number
  /** The rule type applied */
  rule: 'exact' | 'minimum' | null
  /** Human-readable explanation when invalid */
  reason: string | null
}

/**
 * Validate a deck's card count against its format's rules.
 * Used for both the Brewing→In Rotation gate and the deck tile display.
 */
export function validateDeckCount(cardCount: number, format: string | null | undefined): CountValidation {
  const config = getFormatConfig(format)

  if (config.deckSize === null || config.countRule === null) {
    return { valid: true, current: cardCount, required: 0, rule: null, reason: null }
  }

  const required = config.deckSize

  if (config.countRule === 'exact') {
    const valid = cardCount === required
    return {
      valid,
      current: cardCount,
      required,
      rule: 'exact',
      reason: valid ? null : `Needs exactly ${required} cards, currently has ${cardCount}`,
    }
  }

  // minimum
  const valid = cardCount >= required
  return {
    valid,
    current: cardCount,
    required,
    rule: 'minimum',
    reason: valid ? null : `Needs at least ${required} cards, currently has ${cardCount}`,
  }
}
