import { describe, it, expect } from 'vitest'
import { ownedKey, shapePrintings, type PrintingRow } from './printings'

const base: PrintingRow = {
  scryfall_id: 'a', set_code: 'aaa', set_name: 'Set A', collector_number: '45', rarity: 'rare',
  finishes: ['nonfoil', 'foil'], price_usd: '2.10', price_usd_foil: null, released_at: '2020-01-01',
  image_uri_small: 's', image_uri_normal: 'n',
}

describe('shapePrintings', () => {
  it('gives one row per printing and finish', () => {
    const rows = shapePrintings([base, { ...base, scryfall_id: 'b', finishes: ['etched'], released_at: '2022-01-01' }], { owned: new Map(), slotScryfallId: null })
    expect(rows.map((r) => `${r.scryfallId}:${r.finish}`)).toEqual(['b:etched', 'a:nonfoil', 'a:foil'])
  })
  it('keeps a missing price as null, never 0', () => {
    const rows = shapePrintings([base], { owned: new Map(), slotScryfallId: null })
    expect(rows.find((r) => r.finish === 'nonfoil')?.priceUsd).toBe(2.1)
    expect(rows.find((r) => r.finish === 'foil')?.priceUsd).toBeNull()
  })
  it('does not borrow the foil price for etched', () => {
    const rows = shapePrintings([{ ...base, finishes: ['etched'], price_usd_foil: 9 }], { owned: new Map(), slotScryfallId: null })
    expect(rows[0].priceUsd).toBeNull()
  })
  it('counts owned copies per printing and finish and marks the slot printing', () => {
    const rows = shapePrintings([base], { owned: new Map([[ownedKey('a', 'foil'), 2]]), slotScryfallId: 'a' })
    expect(rows.find((r) => r.finish === 'foil')?.owned).toBe(2)
    expect(rows.find((r) => r.finish === 'nonfoil')?.owned).toBe(0)
    expect(rows.every((r) => r.isSlotPrinting)).toBe(true)
  })
  it('shows a printing with no finish list once, as nonfoil', () => {
    const rows = shapePrintings([{ ...base, finishes: null }], { owned: new Map(), slotScryfallId: null })
    expect(rows.map((r) => r.finish)).toEqual(['nonfoil'])
  })
})
