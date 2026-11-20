import { describe, it, expect } from 'vitest'
import { shapeCopies, type CopyRow, type DeckInfo } from './copies'

const copy = (over: Partial<CopyRow> & { id: number }): CopyRow => ({
  is_proxy: false, missing: false, condition: 'NM', finish: 'nonfoil', printing_id: 'p1', deck_cards: null, location: { name: 'Binder 2' }, ...over,
})
const decks = new Map<number, DeckInfo>([
  [5, { name: 'This deck', state: 'brewing' }],
  [9, { name: 'Auntie Ool', state: 'playable' }],
])
const printings = new Map([['p1', { setCode: 'aaa', collectorNumber: '45' }]])
const run = (rows: CopyRow[], slotCopyId: number | null) => shapeCopies(rows, { deckId: 5, slotCopyId, decks, printings })

describe('shapeCopies', () => {
  const rows = [
    copy({ id: 1 }),
    copy({ id: 2, deck_cards: [{ id: 20, deck_id: 9 }] }),
    copy({ id: 3, is_proxy: true, deck_cards: [{ id: 30, deck_id: 9 }] }),
    copy({ id: 4, missing: true }),
  ]
  it('on a Planned slot: Open copy can be sleeved, Claimed copy moved, proxy elsewhere has no action', () => {
    const out = run(rows, null)
    const by = Object.fromEntries(out.map((c) => [c.copyId, c]))
    expect(by[1]).toMatchObject({ state: 'open', action: 'sleeve_here', where: { kind: 'storage', name: 'Binder 2' } })
    expect(by[2]).toMatchObject({ state: 'claimed', action: 'move_here', where: { kind: 'deck', deckName: 'Auntie Ool', deckState: 'playable' } })
    expect(by[3]).toMatchObject({ state: 'proxy_elsewhere', action: null })
    expect(by[4]).toMatchObject({ state: 'missing', action: null })
    expect(by[1].printing).toEqual({ setCode: 'aaa', collectorNumber: '45' })
  })
  it('on an In deck slot: the slot copy is In this deck, an Open copy is offered as swap, Claimed has no action', () => {
    const out = run([copy({ id: 7, deck_cards: [{ id: 70, deck_id: 5 }] }), ...rows], 7)
    const by = Object.fromEntries(out.map((c) => [c.copyId, c]))
    expect(by[7]).toMatchObject({ state: 'in_this_deck', action: null })
    expect(by[1].action).toBe('swap_in')
    expect(by[2].action).toBeNull()
    expect(out[0].copyId).toBe(7)
  })
})
