import { describe, it, expect } from 'vitest'
import { formatStrategyPromptBlock, type StrategyData } from './format-strategy-prompt'

describe('formatStrategyPromptBlock', () => {
  it('returns null when strategy is not configured', () => {
    const strategy: StrategyData = {
      configured: false,
      win_condition: null,
      table_context: null,
      bracket: null,
      budget_mode: null,
      frustration: null,
      strategy_notes: null,
    }

    expect(formatStrategyPromptBlock(strategy)).toBeNull()
  })

  it('returns a formatted block when strategy is configured with all fields', () => {
    const strategy: StrategyData = {
      configured: true,
      win_condition: 'Infinite combo via Peregrine Drake + Deadeye Navigator',
      table_context: 'Casual pod, bracket 2-3, no infinite combos before turn 8',
      bracket: 3,
      budget_mode: 'budget',
      frustration: 'Too many dead cards in opening hands',
      strategy_notes: 'Focus on graveyard recursion as primary engine',
    }

    const result = formatStrategyPromptBlock(strategy)

    expect(result).not.toBeNull()
    expect(result).toContain('=== DECK STRATEGY CONTEXT ===')
    expect(result).toContain('=== END STRATEGY CONTEXT ===')
    expect(result).toContain('Win Condition: Infinite combo via Peregrine Drake + Deadeye Navigator')
    expect(result).toContain('Table Context: Casual pod, bracket 2-3, no infinite combos before turn 8')
    expect(result).toContain('Bracket: 3')
    expect(result).toContain('Budget Mode: budget')
    expect(result).toContain('Frustration Points: Too many dead cards in opening hands')
    expect(result).toContain('Strategy Notes: Focus on graveyard recursion as primary engine')
  })

  it('omits null fields from the formatted block', () => {
    const strategy: StrategyData = {
      configured: true,
      win_condition: 'Commander damage',
      table_context: null,
      bracket: 2,
      budget_mode: 'collection',
      frustration: null,
      strategy_notes: null,
    }

    const result = formatStrategyPromptBlock(strategy)!

    expect(result).toContain('Win Condition: Commander damage')
    expect(result).toContain('Bracket: 2')
    expect(result).toContain('Budget Mode: collection')
    expect(result).not.toContain('Table Context:')
    expect(result).not.toContain('Frustration Points:')
    expect(result).not.toContain('Strategy Notes:')
  })

  it('uses clear delimiters distinguishable from card data', () => {
    const strategy: StrategyData = {
      configured: true,
      win_condition: 'Voltron',
      table_context: null,
      bracket: 1,
      budget_mode: 'unrestricted',
      frustration: null,
      strategy_notes: null,
    }

    const result = formatStrategyPromptBlock(strategy)!

    // Must start with the delimiter
    expect(result.startsWith('=== DECK STRATEGY CONTEXT ===')).toBe(true)
    // Must end with the closing delimiter
    expect(result.endsWith('=== END STRATEGY CONTEXT ===')).toBe(true)
  })

  it('includes all non-null fields as labelled key-value pairs', () => {
    const strategy: StrategyData = {
      configured: true,
      win_condition: 'Tokens overwhelming the board',
      table_context: 'Competitive pod with stax and combo',
      bracket: 4,
      budget_mode: 'unrestricted',
      frustration: 'Lack of card draw',
      strategy_notes: 'Need more protection for commander',
    }

    const result = formatStrategyPromptBlock(strategy)!
    const lines = result.split('\n').filter(Boolean)

    // Each field should have a label prefix
    expect(lines.some(l => l.startsWith('Win Condition:'))).toBe(true)
    expect(lines.some(l => l.startsWith('Table Context:'))).toBe(true)
    expect(lines.some(l => l.startsWith('Bracket:'))).toBe(true)
    expect(lines.some(l => l.startsWith('Budget Mode:'))).toBe(true)
    expect(lines.some(l => l.startsWith('Frustration Points:'))).toBe(true)
    expect(lines.some(l => l.startsWith('Strategy Notes:'))).toBe(true)
  })
})
