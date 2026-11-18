import { describe, expect, it } from 'vitest'
import { classifyCard } from './rating-engine'
import { mapScryfallToRefCard } from './ref-card-backfill'

describe('remaining type-line readers use the parser', () => {
  it('counts an Instant counterspell and ignores a word-in-a-subtype false hit', () => {
    const base = { oracleText: 'Counter target spell.', categories: '[]' } as never
    expect(classifyCard({ ...(base as object), typeLine: 'Instant' } as never)).toContain('counterspell')
    expect(classifyCard({ ...(base as object), typeLine: 'Creature — Instantiator' } as never)).not.toContain('counterspell')
  })
  it('does not treat a Legendary Land as a commander', () => {
    const row = mapScryfallToRefCard({ name: 'X', type_line: 'Legendary Land', oracle_text: '' } as never)
    expect(row.can_be_commander).toBe(false)
  })
})
