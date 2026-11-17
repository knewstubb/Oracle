import { describe, it, expect } from 'vitest'
import { computeSleevedCounts, type DeckCardRow } from './deck-list-data'

const row = (o: Partial<DeckCardRow>): DeckCardRow => ({
  deck_id: 1, card_name: 'Sol Ring', copy_id: null, categories: '["Ramp"]', ...o,
})

describe('computeSleevedCounts', () => {
  it('counts cards with an assigned copy, proxies included', () => {
    expect(computeSleevedCounts([row({ copy_id: 5 }), row({ copy_id: 6 }), row({})])).toEqual({ 1: 2 })
  })
  it('counts sleeved generic basics and skips unsleeved ones', () => {
    const rows = [
      row({ is_generic: true, generic_sleeved: true }),
      row({ is_generic: true, generic_sleeved: null }),
      row({ is_generic: true, generic_sleeved: false }),
    ]
    expect(computeSleevedCounts(rows)).toEqual({ 1: 2 })
  })
  it('ignores maybeboard and sideboard cards', () => {
    const rows = [row({ copy_id: 1, categories: '["Maybeboard"]' }), row({ copy_id: 2, categories: '["Sideboard"]' })]
    expect(computeSleevedCounts(rows)).toEqual({})
  })
  it('keeps decks apart', () => {
    expect(computeSleevedCounts([row({ copy_id: 1 }), row({ deck_id: 2, copy_id: 2 })])).toEqual({ 1: 1, 2: 1 })
  })
})
