import { describe, it, expect } from 'vitest'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import { computeSleevedCounts, isCountableCard, type DeckCardRow } from '@/lib/deck-list-data'
import { deckTargetFor } from '@/lib/format-config'

const sleeved = (n: number) => Array.from({ length: n }, (_, i) => ({ copy_id: i + 1 }))
const planned = (n: number) => Array.from({ length: n }, () => ({ copy_id: null }))
const generics = (n: number, isSleeved: boolean) =>
  Array.from({ length: n }, () => ({ is_generic: true, generic_sleeved: isSleeved }))

function status(slots: Parameters<typeof computeDeckReadiness>[0], format = 'commander') {
  const t = deckTargetFor(format)
  return computeDeckReadiness(slots, t.deckSize, t.countRule).state
}

describe('automatic deck status: Commander', () => {
  it('an empty list and a 100-card list with nothing sleeved are Draft', () => {
    expect(status([])).toBe('draft')
    expect(status(planned(100))).toBe('draft')
  })
  it('14 of 100 sleeved is Assembling', () => {
    expect(status([...sleeved(14), ...planned(86)])).toBe('assembling')
  })
  it('100 of 100 sleeved is Playable', () => {
    expect(status(sleeved(100))).toBe('playable')
  })
  it('101 cards all sleeved is Assembling', () => {
    expect(status(sleeved(101))).toBe('assembling')
  })
  it('99 cards all sleeved is Assembling', () => {
    expect(status(sleeved(99))).toBe('assembling')
  })
  it('100 cards with one unsleeved is Assembling', () => {
    expect(status([...sleeved(99), ...planned(1)])).toBe('assembling')
  })
  it('generic basics marked sleeved count; marked unsleeved do not', () => {
    expect(status([...sleeved(64), ...generics(36, true)])).toBe('playable')
    expect(status([...sleeved(64), ...generics(36, false)])).toBe('assembling')
    expect(status(generics(100, false))).toBe('draft')
  })
  it('a proxy copy counts as sleeved (it is a copy assigned to the slot)', () => {
    expect(status(sleeved(100))).toBe('playable')
  })
  it('Maybeboard and Sideboard rows are excluded once callers filter with isCountableCard', () => {
    const rows = [
      ...sleeved(100).map((r) => ({ ...r, categories: '["Creature"]' })),
      { copy_id: null, categories: '["Maybeboard"]' },
      { copy_id: 500, categories: '["Sideboard"]' },
    ]
    const main = rows.filter((r) => isCountableCard(r.categories))
    expect(main).toHaveLength(100)
    expect(status(main)).toBe('playable')
    expect(status(rows)).toBe('assembling') // unfiltered: shows why the filter matters
  })
})

describe('automatic deck status: other formats (open point for the owner)', () => {
  it('Standard (minimum 60): 60 and 61 all sleeved are Playable, 59 is Assembling, none sleeved is Draft', () => {
    expect(status(sleeved(60), 'standard')).toBe('playable')
    expect(status(sleeved(61), 'standard')).toBe('playable')
    expect(status(sleeved(59), 'standard')).toBe('assembling')
    expect(status(planned(60), 'standard')).toBe('draft')
  })
  it('Casual (no target): all sleeved is Playable, none sleeved is Draft, empty is Draft', () => {
    expect(status(sleeved(7), 'casual')).toBe('playable')
    expect(status([...sleeved(3), ...planned(2)], 'casual')).toBe('assembling')
    expect(status(planned(5), 'casual')).toBe('draft')
    expect(status([], 'casual')).toBe('draft')
  })
})

describe('status and the tile / header count never disagree', () => {
  it('sleeved count equals computeSleevedCounts for a mixed list', () => {
    const rows: DeckCardRow[] = [
      { deck_id: 1, card_name: 'A', copy_id: 1, categories: '["Creature"]' },
      { deck_id: 1, card_name: 'B', copy_id: null, categories: '["Land"]' },
      { deck_id: 1, card_name: 'C', copy_id: 9, categories: '["Maybeboard"]' },
      { deck_id: 1, card_name: 'Island', copy_id: null, categories: '["Land"]', is_generic: true, generic_sleeved: true },
      { deck_id: 1, card_name: 'Swamp', copy_id: null, categories: '["Land"]', is_generic: true, generic_sleeved: false },
    ]
    const main = rows.filter((r) => isCountableCard(r.categories))
    const r = computeDeckReadiness(main, 100, 'exact')
    expect(r.sleeved).toBe(computeSleevedCounts(rows)[1])
    expect(r.sleeved).toBe(2)
    expect(r.state).toBe('assembling')
  })
})
