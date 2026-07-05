/**
 * Formats strategy context as a structured, labelled block for AI prompt injection.
 *
 * When strategy data is configured for a deck, this function produces a clearly
 * delimited text block that AI models can distinguish from card data.
 * When strategy is not configured (configured: false), returns null.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyData {
  configured: boolean
  win_condition: string | null
  table_context: string | null
  bracket: number | null
  budget_mode: string | null
  frustration: string | null
  strategy_notes: string | null
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/**
 * Format strategy data as a structured labelled block for AI prompt injection.
 *
 * Returns a clearly labelled multi-line string when strategy is configured,
 * or null when strategy is not configured.
 *
 * The block uses a distinct section header and labelled fields so the AI model
 * can distinguish strategy intent from card data.
 */
export function formatStrategyPromptBlock(strategy: StrategyData): string | null {
  if (!strategy.configured) {
    return null
  }

  const lines: string[] = []

  lines.push('=== DECK STRATEGY CONTEXT ===')
  lines.push('')

  if (strategy.win_condition) {
    lines.push(`Win Condition: ${strategy.win_condition}`)
  }

  if (strategy.table_context) {
    lines.push(`Table Context: ${strategy.table_context}`)
  }

  if (strategy.bracket != null) {
    lines.push(`Bracket: ${strategy.bracket}`)
  }

  if (strategy.budget_mode) {
    lines.push(`Budget Mode: ${strategy.budget_mode}`)
  }

  if (strategy.frustration) {
    lines.push(`Frustration Points: ${strategy.frustration}`)
  }

  if (strategy.strategy_notes) {
    lines.push(`Strategy Notes: ${strategy.strategy_notes}`)
  }

  lines.push('')
  lines.push('=== END STRATEGY CONTEXT ===')

  return lines.join('\n')
}
