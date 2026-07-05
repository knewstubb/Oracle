/**
 * Unit tests for the backfill section parser.
 *
 * Run: npx vitest run scripts/backfill-notion-to-local.test.ts
 */

import { describe, it, expect } from 'vitest'
import { parseNotionPageContent } from './backfill-notion-to-local'

describe('parseNotionPageContent', () => {
  it('extracts all known sections from well-formed markdown', () => {
    const markdown = `## Strategy & Playstyle

Build an engine that recurs creatures from the graveyard.

## Key Synergy Lines

Muldrotha + Spore Frog = repeatable fog

## Strengths & Weaknesses

### Strengths
- Strong recursion engine

### Weaknesses
- Vulnerable to graveyard hate

## Matchup Notes

Struggles against Rest in Peace decks.

## Mulligan Guide

Keep hands with 3+ lands and a ramp spell.`

    const result = parseNotionPageContent(markdown)

    expect(result.sections.strategy_playstyle).toBe(
      'Build an engine that recurs creatures from the graveyard.'
    )
    expect(result.sections.synergy_lines).toBe(
      'Muldrotha + Spore Frog = repeatable fog'
    )
    expect(result.sections.strengths_weaknesses).toContain('Strong recursion engine')
    expect(result.sections.strengths_weaknesses).toContain('Vulnerable to graveyard hate')
    expect(result.sections.matchup_notes).toBe(
      'Struggles against Rest in Peace decks.'
    )
    expect(result.sections.mulligan_guide).toBe(
      'Keep hands with 3+ lands and a ramp spell.'
    )
    expect(result.notes).toEqual([])
  })

  it('returns null for missing sections', () => {
    const markdown = `## Strategy & Playstyle

Some strategy content here.

## Mulligan Guide

Keep 3 lands.`

    const result = parseNotionPageContent(markdown)

    expect(result.sections.strategy_playstyle).toBe('Some strategy content here.')
    expect(result.sections.synergy_lines).toBeNull()
    expect(result.sections.strengths_weaknesses).toBeNull()
    expect(result.sections.matchup_notes).toBeNull()
    expect(result.sections.mulligan_guide).toBe('Keep 3 lands.')
    expect(result.notes).toEqual([])
  })

  it('extracts trailing notes after the last known section', () => {
    const markdown = `## Strategy & Playstyle

Engine deck.

## Mulligan Guide

Keep 3 lands.

## Some Unknown Section

This is a note block.

Another note block here.`

    const result = parseNotionPageContent(markdown)

    expect(result.sections.strategy_playstyle).toBe('Engine deck.')
    expect(result.sections.mulligan_guide).toBe('Keep 3 lands.')
    // Content after ## Mulligan Guide that is under unknown headings becomes notes
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('handles empty or blank content', () => {
    expect(parseNotionPageContent('')).toEqual({
      sections: {
        strategy_playstyle: null,
        synergy_lines: null,
        strengths_weaknesses: null,
        matchup_notes: null,
        mulligan_guide: null,
      },
      notes: [],
    })

    expect(parseNotionPageContent('   \n  \n   ')).toEqual({
      sections: {
        strategy_playstyle: null,
        synergy_lines: null,
        strengths_weaknesses: null,
        matchup_notes: null,
        mulligan_guide: null,
      },
      notes: [],
    })
  })

  it('handles content with no headings as notes', () => {
    const markdown = `This is just some free text.

And another paragraph.

Third paragraph.`

    const result = parseNotionPageContent(markdown)

    expect(result.sections.strategy_playstyle).toBeNull()
    expect(result.sections.synergy_lines).toBeNull()
    expect(result.notes).toEqual([
      'This is just some free text.',
      'And another paragraph.',
      'Third paragraph.',
    ])
  })

  it('handles section headings with empty content', () => {
    const markdown = `## Strategy & Playstyle

## Key Synergy Lines

Some synergy content.`

    const result = parseNotionPageContent(markdown)

    // Empty section body between two headings
    expect(result.sections.strategy_playstyle).toBeNull()
    expect(result.sections.synergy_lines).toBe('Some synergy content.')
  })

  it('is idempotent — parsing same content twice yields same result', () => {
    const markdown = `## Strategy & Playstyle

Build value engine.

## Mulligan Guide

Keep ramp.`

    const result1 = parseNotionPageContent(markdown)
    const result2 = parseNotionPageContent(markdown)

    expect(result1).toEqual(result2)
  })

  it('handles notes trailing after the last known section when unknown headings follow', () => {
    const markdown = `## Strategy & Playstyle

Engine deck.

## Mulligan Guide

Keep 3 lands.

## Game Log 2024-01-15

Won against aggro.

## Game Log 2024-01-22

Lost to combo.`

    const result = parseNotionPageContent(markdown)

    expect(result.sections.strategy_playstyle).toBe('Engine deck.')
    expect(result.sections.mulligan_guide).toBe('Keep 3 lands.')
    // The unknown sections after Mulligan Guide become notes
    expect(result.notes).toContain('## Game Log 2024-01-15')
    expect(result.notes).toContain('Won against aggro.')
    expect(result.notes).toContain('## Game Log 2024-01-22')
    expect(result.notes).toContain('Lost to combo.')
  })
})
