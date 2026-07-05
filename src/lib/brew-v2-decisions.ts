// ---------------------------------------------------------------------------
// Brew Mode V2 — Decision Categorization
// ---------------------------------------------------------------------------

import type { DecisionEntry } from './brew-v2-types'

// ---------------------------------------------------------------------------
// Decision Type Constants
// ---------------------------------------------------------------------------

export const DECISION_TYPES = {
  ARCHETYPE: 'archetype',
  PLAYSTYLE: 'playstyle',
  WIN_APPROACH: 'win_approach',
  COLOUR_IDENTITY: 'colour_identity',
  BRACKET: 'bracket',
  CONSTRAINTS: 'constraints',
  EXCLUSIONS: 'exclusions',
  KNOWN_CARD_INCLUDES: 'known_card_includes',
} as const

export type DecisionType = (typeof DECISION_TYPES)[keyof typeof DECISION_TYPES]

// ---------------------------------------------------------------------------
// Section Constants
// ---------------------------------------------------------------------------

export const DECISION_SECTIONS = {
  STRATEGY: 'Strategy',
  PARAMETERS: 'Parameters',
  CONSTRAINTS: 'Constraints',
} as const

export type DecisionSection =
  (typeof DECISION_SECTIONS)[keyof typeof DECISION_SECTIONS]

// ---------------------------------------------------------------------------
// Section Mapping
// ---------------------------------------------------------------------------

/**
 * Maps each recognized decision type to its Decision Log section.
 *
 * - Strategy-related: archetype, playstyle, win_approach, known_card_includes
 * - Measurable parameters: colour_identity, bracket
 * - Limitations: constraints, exclusions
 */
export const DECISION_TYPE_TO_SECTION: Record<DecisionType, DecisionSection> = {
  [DECISION_TYPES.ARCHETYPE]: DECISION_SECTIONS.STRATEGY,
  [DECISION_TYPES.PLAYSTYLE]: DECISION_SECTIONS.STRATEGY,
  [DECISION_TYPES.WIN_APPROACH]: DECISION_SECTIONS.STRATEGY,
  [DECISION_TYPES.KNOWN_CARD_INCLUDES]: DECISION_SECTIONS.STRATEGY,
  [DECISION_TYPES.COLOUR_IDENTITY]: DECISION_SECTIONS.PARAMETERS,
  [DECISION_TYPES.BRACKET]: DECISION_SECTIONS.PARAMETERS,
  [DECISION_TYPES.CONSTRAINTS]: DECISION_SECTIONS.CONSTRAINTS,
  [DECISION_TYPES.EXCLUSIONS]: DECISION_SECTIONS.CONSTRAINTS,
}

// ---------------------------------------------------------------------------
// Categorization Function
// ---------------------------------------------------------------------------

/**
 * Categorizes a decision entry into the appropriate Decision Log section.
 *
 * Uses the entry's `key` field (normalized to lowercase with spaces replaced
 * by underscores) to look up the section mapping.
 *
 * Returns the section name ("Strategy", "Parameters", or "Constraints"),
 * or `null` if the decision type is not recognized.
 */
export function categorizeDecision(
  entry: DecisionEntry
): DecisionSection | null {
  const normalizedKey = entry.key.toLowerCase().replace(/\s+/g, '_')
  return DECISION_TYPE_TO_SECTION[normalizedKey as DecisionType] ?? null
}
