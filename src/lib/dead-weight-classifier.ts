/**
 * Dead Weight Classifier — Pure classification logic + Supabase data access layer.
 *
 * Classification priority (highest to lowest):
 * 1. format_violation — card violates declared format constraints
 * 2. redundant — lowest synergy in a category exceeding its target count
 * 3. off_strategy — synergy < 30 AND not in combo cards
 * 4. bracket_mismatch — only when bracket is configured
 *
 * Data access functions use the Supabase query builder for:
 * - Reading flagged dead weight cards from deck_cards
 * - Reading/writing dead_weight_dismissals
 * - Clearing/setting dead weight flags on deck_cards
 *
 * Validates: Requirements 5.1, 5.5
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'mythic'] as const
export type Rarity = (typeof RARITY_ORDER)[number]

/** Default category target counts — flag as redundant when exceeding these */
export const DEFAULT_CATEGORY_TARGETS: Record<string, number> = {
  Ramp: 12,
  Draw: 12,
  Removal: 10,
  Counterspell: 5,
  'Board Wipe': 4,
  Recursion: 5,
  Tutor: 5,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeadWeightFlag =
  | 'redundant'
  | 'off_strategy'
  | 'bracket_mismatch'
  | 'format_violation'

export interface DeadWeightResult {
  cardName: string
  flag: DeadWeightFlag
  reason: string
}

export interface DeadWeightCard {
  cardName: string
  flag: string
  reason: string | null
}

export interface SynergyData {
  cardName: string
  synergyScore: number // 0-100 percentage
}

export interface FormatRules {
  format_name: string
  swap_limit?: number
  mandatory_cuts?: string[]
  rarity_budget?: { mythic: number; rare: number; uncommon: number; common: number }
  value_cap?: number
  rarity_restriction?: 'common' | 'uncommon' | 'rare' | 'mythic'
  progression_level?: number
  progression_points?: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a card's rarity exceeds the maximum allowed rarity.
 * Returns true if the card rarity is strictly higher than the max allowed.
 *
 * Rarity ordering: common < uncommon < rare < mythic
 */
export function exceedsRarityRestriction(
  cardRarity: string | null,
  maxAllowed: Rarity
): boolean {
  if (!cardRarity) return false
  const normalised = cardRarity.toLowerCase() as string
  const cardIdx = RARITY_ORDER.indexOf(normalised as Rarity)
  const maxIdx = RARITY_ORDER.indexOf(maxAllowed)
  // Unknown rarity is treated as not exceeding
  if (cardIdx === -1) return false
  return cardIdx > maxIdx
}

// ---------------------------------------------------------------------------
// Core Classification (Pure Logic — no DB access)
// ---------------------------------------------------------------------------

/**
 * Classify a single card against dead weight rules.
 *
 * Returns a DeadWeightResult if the card is flagged, or null if it passes.
 *
 * Classification priority (first match wins):
 * 1. format_violation — mandatory_cuts list or rarity_restriction
 * 2. redundant — lowest synergy in over-target category
 * 3. off_strategy — synergy < 30 AND not in combos
 * 4. bracket_mismatch — only if bracket is configured (non-null)
 *
 * @param cardName - Name of the card being classified
 * @param synergyScore - EDHREC synergy score (0-100)
 * @param categoryCount - Map of category name → current card count in that category
 * @param categoryTargets - Map of category name → target maximum count
 * @param comboCards - Set of card names that participate in combos
 * @param bracket - Declared bracket (1-4) or null if not configured
 * @param formatRules - Format constraints or null if none
 * @param cardRarity - Rarity of the card (common/uncommon/rare/mythic) or null
 */
export function classifyDeadWeight(
  cardName: string,
  synergyScore: number,
  categoryCount: Map<string, number>,
  categoryTargets: Map<string, number>,
  comboCards: Set<string>,
  bracket: number | null,
  formatRules: FormatRules | null,
  cardRarity: string | null
): DeadWeightResult | null {
  // Priority 1: Format violation
  const formatResult = checkFormatViolation(cardName, formatRules, cardRarity)
  if (formatResult) return formatResult

  // Priority 2: Redundant (lowest synergy in over-target category)
  const redundantResult = checkRedundant(cardName, synergyScore, categoryCount, categoryTargets)
  if (redundantResult) return redundantResult

  // Priority 3: Off-strategy (low synergy, not in combos)
  const offStrategyResult = checkOffStrategy(cardName, synergyScore, comboCards)
  if (offStrategyResult) return offStrategyResult

  // Priority 4: Bracket mismatch (only if bracket configured)
  const bracketResult = checkBracketMismatch(cardName, synergyScore, bracket)
  if (bracketResult) return bracketResult

  return null
}

// ---------------------------------------------------------------------------
// Classification checks (pure logic)
// ---------------------------------------------------------------------------

function checkFormatViolation(
  cardName: string,
  formatRules: FormatRules | null,
  cardRarity: string | null
): DeadWeightResult | null {
  if (!formatRules) return null

  // Check mandatory cuts
  if (formatRules.mandatory_cuts) {
    const isInMandatoryCuts = formatRules.mandatory_cuts.some(
      (cut) => cut.toLowerCase() === cardName.toLowerCase()
    )
    if (isInMandatoryCuts) {
      return {
        cardName,
        flag: 'format_violation',
        reason: `${cardName} is a mandatory cut in ${formatRules.format_name} format rules`,
      }
    }
  }

  // Check rarity restriction
  if (formatRules.rarity_restriction && cardRarity) {
    if (exceedsRarityRestriction(cardRarity, formatRules.rarity_restriction)) {
      return {
        cardName,
        flag: 'format_violation',
        reason: `This ${cardRarity} card violates the ${formatRules.rarity_restriction}-max restriction in ${formatRules.format_name}`,
      }
    }
  }

  return null
}

function checkRedundant(
  cardName: string,
  synergyScore: number,
  categoryCount: Map<string, number>,
  categoryTargets: Map<string, number>
): DeadWeightResult | null {
  const entries = Array.from(categoryCount.entries())
  for (const [category, count] of entries) {
    const target = categoryTargets.get(category)
    if (target === undefined) continue
    if (count > target) {
      return {
        cardName,
        flag: 'redundant',
        reason: `Lowest synergy (${synergyScore}%) in ${category} which has ${count} cards (target: ${target})`,
      }
    }
  }

  return null
}

function checkOffStrategy(
  cardName: string,
  synergyScore: number,
  comboCards: Set<string>
): DeadWeightResult | null {
  if (synergyScore < 30 && !comboCards.has(cardName)) {
    return {
      cardName,
      flag: 'off_strategy',
      reason: `Synergy score ${synergyScore}% is below the 30% threshold and card is not part of any combo line`,
    }
  }
  return null
}

function checkBracketMismatch(
  cardName: string,
  synergyScore: number,
  bracket: number | null
): DeadWeightResult | null {
  // Only flag when bracket is explicitly configured
  if (bracket === null) return null

  const thresholds: Record<number, number> = {
    1: 80,
    2: 85,
    3: 90,
    4: 101, // never triggered
  }

  const threshold = thresholds[bracket]
  if (threshold === undefined) return null

  if (synergyScore > threshold) {
    return {
      cardName,
      flag: 'bracket_mismatch',
      reason: `Synergy score ${synergyScore}% exceeds bracket ${bracket} threshold (${threshold}%)`,
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Data Access Layer — Supabase query builder
// ---------------------------------------------------------------------------

/**
 * Get all dead weight flagged cards for a deck.
 * Returns cards from deck_cards where dead_weight_flag IS NOT NULL.
 */
export async function getDeadWeightCards(deckId: number): Promise<DeadWeightCard[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('deck_cards')
    .select('card_name, dead_weight_flag, dead_weight_reason')
    .eq('deck_id', deckId)
    .not('dead_weight_flag', 'is', null)

  if (error) {
    throw new Error(`Failed to get dead weight cards for deck ${deckId}: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    cardName: row.card_name,
    flag: row.dead_weight_flag!,
    reason: row.dead_weight_reason,
  }))
}

/**
 * Clear all dead weight flags for a deck (set to NULL).
 * Called before recomputing flags.
 */
export async function clearDeadWeightFlags(deckId: number): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('deck_cards')
    .update({ dead_weight_flag: null, dead_weight_reason: null })
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to clear dead weight flags for deck ${deckId}: ${error.message}`)
  }
}

/**
 * Write a dead weight flag to a specific card in a deck.
 */
export async function writeDeadWeightFlag(
  deckId: number,
  cardName: string,
  flag: DeadWeightFlag,
  reason: string
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('deck_cards')
    .update({ dead_weight_flag: flag, dead_weight_reason: reason })
    .eq('deck_id', deckId)
    .eq('card_name', cardName)

  if (error) {
    throw new Error(`Failed to write dead weight flag for "${cardName}" in deck ${deckId}: ${error.message}`)
  }
}

/**
 * Write multiple dead weight flags in batch for a deck.
 * More efficient than calling writeDeadWeightFlag one by one.
 */
export async function writeDeadWeightFlags(
  deckId: number,
  results: DeadWeightResult[]
): Promise<void> {
  if (results.length === 0) return

  // Supabase doesn't support batch updates with different values per row in one call,
  // so we issue individual updates. For larger batches, consider an RPC function.
  const supabase = createAdminClient()

  for (const result of results) {
    const { error } = await supabase
      .from('deck_cards')
      .update({ dead_weight_flag: result.flag, dead_weight_reason: result.reason })
      .eq('deck_id', deckId)
      .eq('card_name', result.cardName)

    if (error) {
      throw new Error(
        `Failed to write dead weight flag for "${result.cardName}" in deck ${deckId}: ${error.message}`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Dead Weight Dismissals — Supabase query builder
// ---------------------------------------------------------------------------

/**
 * Get all dismissed card names for a deck.
 */
export async function getDismissals(deckId: number): Promise<string[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('dead_weight_dismissals')
    .select('card_name')
    .eq('deck_id', deckId)

  if (error) {
    throw new Error(`Failed to get dismissals for deck ${deckId}: ${error.message}`)
  }

  return (data ?? []).map((row) => row.card_name)
}

/**
 * Dismiss a card (add to dead_weight_dismissals).
 * Returns true if inserted, false if already dismissed (duplicate).
 */
export async function dismissCard(deckId: number, cardName: string, userId: string): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('dead_weight_dismissals')
    .insert({
      deck_id: deckId,
      card_name: cardName,
      user_id: userId,
    })

  if (error) {
    // Supabase returns code '23505' for unique constraint violations
    if (error.code === '23505') {
      return false
    }
    throw new Error(`Failed to dismiss card "${cardName}" for deck ${deckId}: ${error.message}`)
  }

  return true
}

/**
 * Un-dismiss a card (remove from dead_weight_dismissals).
 */
export async function undismissCard(deckId: number, cardName: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('dead_weight_dismissals')
    .delete()
    .eq('deck_id', deckId)
    .eq('card_name', cardName)

  if (error) {
    throw new Error(`Failed to un-dismiss card "${cardName}" for deck ${deckId}: ${error.message}`)
  }
}
