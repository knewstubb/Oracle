import { describe, it, expect } from 'vitest'
import {
  buildDeckSlotFacts,
  formatDeckSlotFactsForPrompt,
  loadDeckSlotFacts,
  type DeckSlotRow,
  type DeckFactsClient,
} from './deck-chat-facts'

let id = 0
const row = (o: Partial<DeckSlotRow>): DeckSlotRow => ({
  id: ++id, card_name: 'Sol Ring', quantity: 1, categories: '["Ramp"]',
  copy_id: null, scryfall_id: 'abc', is_commander: false, is_proxy: null, ...o,
})

describe('buildDeckSlotFacts', () => {
  it('separates proxies, real copies, no-copy slots and generic basics', () => {
    const f = buildDeckSlotFacts([
      row({ card_name: 'Eternal Witness', copy_id: 1, is_proxy: true }),
      row({ card_name: 'Sol Ring', copy_id: 2, is_proxy: false }),
      row({ card_name: 'Cyclonic Rift' }),
      row({ card_name: 'Forest', quantity: 30, scryfall_id: null }),
      row({ card_name: 'Island', quantity: 2, copy_id: 3, is_proxy: false }),
    ], 'commander')
    expect(f.proxies).toEqual(['Eternal Witness'])
    expect(f.originals).toEqual(['Sol Ring', '2x Island'])
    expect(f.noCopy).toEqual(['Cyclonic Rift'])
    expect(f.genericLandCount).toBe(30)
    expect(f.mainListCount).toBe(35)
    expect(f.emptySlots).toBe(65)
  })

  it('excludes maybeboard from the count', () => {
    const f = buildDeckSlotFacts([row({}), row({ categories: '["Maybeboard"]' })], 'commander')
    expect(f.mainListCount).toBe(1)
    expect(f.maybeboardCount).toBe(1)
  })

  it('reports no empty slots at 100', () => {
    const f = buildDeckSlotFacts([row({ quantity: 100, copy_id: 1, is_proxy: false })], 'commander')
    expect(f.emptySlots).toBe(0)
  })

  it('keeps unknown copy type unknown, not real or proxy', () => {
    const f = buildDeckSlotFacts([row({ card_name: 'Mana Crypt', copy_id: 9, is_proxy: null })], 'commander')
    expect(f.unknownType).toEqual(['Mana Crypt'])
    expect(f.proxies).toEqual([])
    expect(f.originals).toEqual([])
  })

  it('does not invent a target size for other formats', () => {
    const f = buildDeckSlotFacts([row({})], 'casual')
    expect(f.targetSize).toBeNull()
    expect(f.emptySlots).toBeNull()
    expect(formatDeckSlotFactsForPrompt(f)).toContain('target size is unknown')
  })

  it('a Custom deck with a commander row targets 100 including the commander (84 cards = 16 empty)', () => {
    const rows = [row({ card_name: 'Mendicant Core, Guidelight', is_commander: true }), row({ card_name: 'Sol Ring', quantity: 83 })]
    const f = buildDeckSlotFacts(rows, 'Custom')
    expect(f.mainListCount).toBe(84)
    expect(f.targetSize).toBe(100)
    expect(f.emptySlots).toBe(16)
  })
  it('a Custom deck with only a commander name set targets 100; maybeboard is excluded', () => {
    const f = buildDeckSlotFacts([row({}), row({ categories: '["Maybeboard"]' })], 'Custom', 'Mendicant Core, Guidelight')
    expect(f.targetSize).toBe(100)
    expect(f.mainListCount).toBe(1)
  })
  it('a companion alone is not a commander; no commander on a Custom deck stays unknown', () => {
    const f = buildDeckSlotFacts([row({ is_commander: true, command_zone_role: 'companion' })], 'Custom', '  ')
    expect(f.targetSize).toBeNull()
    expect(f.emptySlots).toBeNull()
    expect(formatDeckSlotFactsForPrompt(f)).toContain('do not guess a number')
  })
})

describe('formatDeckSlotFactsForPrompt', () => {
  it('says UNKNOWN (no zeros) when facts failed to load', () => {
    const t = formatDeckSlotFactsForPrompt(null)
    expect(t).toContain('UNKNOWN')
    expect(t).not.toMatch(/: 0/)
  })

  it('lists proxies and gaps', () => {
    const t = formatDeckSlotFactsForPrompt(buildDeckSlotFacts([
      row({ card_name: 'Eternal Witness', copy_id: 1, is_proxy: true }),
      row({ card_name: 'Cyclonic Rift' }),
    ], 'commander'))
    expect(t).toContain('Eternal Witness')
    expect(t).toContain('Cyclonic Rift')
    expect(t).toContain('Empty slots: 98')
  })
})

describe('loadDeckSlotFacts (mocked client, read only)', () => {
  const client = (result: { data: unknown; error: unknown } | Error): DeckFactsClient => ({
    from: () => ({
      select: () => ({
        eq: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
      }),
    }),
  })

  it('maps the joined proxy flag', async () => {
    const f = await loadDeckSlotFacts(client({
      error: null,
      data: [
        { id: 1, card_name: 'A', quantity: 1, categories: null, copy_id: 5, scryfall_id: 'x', is_commander: false, user_copies: { is_proxy: true } },
        { id: 2, card_name: 'B', quantity: 1, categories: null, copy_id: 6, scryfall_id: 'x', is_commander: false, user_copies: null },
      ],
    }), 1, 'commander')
    expect(f?.proxies).toEqual(['A'])
    expect(f?.unknownType).toEqual(['B'])
  })

  it('loader: Custom deck with a commander row gets the 100 target', async () => {
    const f = await loadDeckSlotFacts(client({
      error: null,
      data: [{ id: 1, card_name: 'Mendicant Core, Guidelight', quantity: 1, categories: null, copy_id: null, scryfall_id: 'x', is_commander: true, command_zone_role: null, user_copies: null }],
    }), 1, 'Custom')
    expect(f?.targetSize).toBe(100)
    expect(f?.emptySlots).toBe(99)
  })

  it('returns null on error or throw', async () => {
    expect(await loadDeckSlotFacts(client({ data: null, error: { message: 'x' } }), 1, null)).toBeNull()
    expect(await loadDeckSlotFacts(client(new Error('boom')), 1, null)).toBeNull()
  })
})
