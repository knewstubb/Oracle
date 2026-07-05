/**
 * Health Engine — Core health computation module for Monitor Mode.
 *
 * Classifies deck cards into functional categories, compares counts against
 * configurable thresholds, and produces per-category + overall health status.
 *
 * Validates: Requirements 4.4, 4.5, 6.2, 6.3, 6.4
 */

import type { FunctionalCategory } from './category-classifier'
import { classifyDeck } from './category-classifier'
import type {
  HealthStatus,
  CategoryHealth,
  HealthResult,
  ThresholdEntry,
  ThresholdSet,
  OverrideMap,
} from './health-store'

// Re-export types for convenience
export type { HealthStatus, CategoryHealth, HealthResult, ThresholdEntry, ThresholdSet, OverrideMap }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_AMBER_MARGIN = 1

export const DEFAULT_THRESHOLDS: ThresholdSet = {
  Ramp: { min: 10, max: 12 },
  Draw: { min: 10, max: 12 },
  Removal: { min: 6, max: 10 },
  Interaction: { min: 3, max: 5 },
  Finisher: { min: 4, max: 6 },
  'Board Wipe': { min: 2, max: 4 },
  Recursion: { min: 2, max: 5 },
  Tutor: { min: 2, max: 5 },
  Protection: { min: 2, max: 4 },
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Merge global default thresholds with per-deck overrides.
 * Override values take precedence for specified categories.
 */
export function mergeThresholds(
  defaults: ThresholdSet,
  overrides: OverrideMap | null
): { thresholds: ThresholdSet; amberMargin: number } {
  if (!overrides) {
    return { thresholds: { ...defaults }, amberMargin: DEFAULT_AMBER_MARGIN }
  }

  const merged: ThresholdSet = { ...defaults }

  if (overrides.thresholds) {
    for (const [category, entry] of Object.entries(overrides.thresholds)) {
      if (entry) {
        merged[category] = { min: entry.min, max: entry.max }
      }
    }
  }

  const amberMargin = overrides.amber_margin ?? DEFAULT_AMBER_MARGIN

  return { thresholds: merged, amberMargin }
}

/**
 * Determine HealthStatus for a single category.
 *
 * - green: min <= actual <= max
 * - amber: (min - amberMargin) <= actual < min OR max < actual <= (max + amberMargin)
 * - red: actual < (min - amberMargin) OR actual > (max + amberMargin)
 */
export function deriveStatus(
  actual: number,
  min: number,
  max: number,
  amberMargin: number
): HealthStatus {
  // Green: within target range
  if (actual >= min && actual <= max) {
    return 'green'
  }

  // Amber: within amber margin of the boundary but outside range
  if (
    (actual >= min - amberMargin && actual < min) ||
    (actual > max && actual <= max + amberMargin)
  ) {
    return 'amber'
  }

  // Red: outside amber margin
  return 'red'
}

/**
 * Derive overall deck health from per-category statuses.
 * Returns the most severe status across all categories.
 * Severity ordering: red > amber > green.
 */
export function deriveOverallStatus(categories: CategoryHealth[]): HealthStatus {
  if (categories.some((c) => c.status === 'red')) return 'red'
  if (categories.some((c) => c.status === 'amber')) return 'amber'
  return 'green'
}

/**
 * Select the most severe violation for the contextual note.
 *
 * Priority: red > amber. Among equal severity, the category
 * furthest from its target range wins.
 *
 * Returns null if all categories are green.
 */
export function selectMostSevereViolation(
  categories: CategoryHealth[]
): CategoryHealth | null {
  const violations = categories.filter((c) => c.status !== 'green')
  if (violations.length === 0) return null

  const severityOrder: Record<HealthStatus, number> = { red: 2, amber: 1, green: 0 }

  return violations.sort((a, b) => {
    // 1. Red > Amber
    const sevDiff = severityOrder[b.status] - severityOrder[a.status]
    if (sevDiff !== 0) return sevDiff

    // 2. Among equal severity, furthest from target range
    const distA = a.actual < a.min ? a.min - a.actual : a.actual - a.max
    const distB = b.actual < b.min ? b.min - b.actual : b.actual - b.max
    return distB - distA
  })[0]
}

/**
 * Generate a plain-language contextual note for a violation.
 * Includes category name, actual count, and expected range.
 */
export function formatContextualNote(violation: CategoryHealth): string {
  const { category, actual, min, max } = violation
  const direction = actual < min ? 'low' : 'high'

  if (direction === 'low') {
    const deficit = min - actual
    return `${category} is low (${actual} cards, target ${min}–${max}). Consider adding ${deficit}–${deficit + (max - min)} more ${category.toLowerCase()} effects.`
  }

  const excess = actual - max
  return `${category} is high (${actual} cards, target ${min}–${max}). Consider removing ${excess}–${excess + (max - min)} ${category.toLowerCase()} effects.`
}

/**
 * Compute health for a single deck.
 *
 * 1. Classify all cards using classifyDeck
 * 2. Count cards per category
 * 3. Merge global thresholds with per-deck overrides
 * 4. Derive per-category status
 * 5. Derive overall status
 * 6. Return full HealthResult
 */
export function computeHealth(
  cards: Array<{
    cardName: string
    categories: string | null
    oracleText: string | null
    typeLine: string | null
    isLand: boolean
  }>,
  overrides: Map<string, FunctionalCategory>,
  healthOverrides: OverrideMap | null
): HealthResult {
  // 1. Classify all cards
  const classifications = classifyDeck(cards, overrides)

  // 2. Count cards per category (excluding 'Other')
  const counts: Record<string, number> = {}
  for (const classification of classifications) {
    if (classification.category === 'Other') continue
    counts[classification.category] = (counts[classification.category] ?? 0) + 1
  }

  // 3. Merge thresholds
  const { thresholds, amberMargin } = mergeThresholds(DEFAULT_THRESHOLDS, healthOverrides)

  // 4. Derive per-category status
  const categoryHealths: CategoryHealth[] = Object.entries(thresholds).map(
    ([category, entry]) => {
      const actual = counts[category] ?? 0
      const status = deriveStatus(actual, entry.min, entry.max, amberMargin)
      return {
        category,
        status,
        actual,
        min: entry.min,
        max: entry.max,
      }
    }
  )

  // 5. Derive overall status
  const overallStatus = deriveOverallStatus(categoryHealths)

  // 6. Return result
  return {
    deckId: 0, // Caller should set the deckId
    categories: categoryHealths,
    overallStatus,
    computedAt: new Date().toISOString(),
  }
}
