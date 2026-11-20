import { describe, it, expect, beforeEach } from 'vitest'
import { fakeClient, type FakeCall, type FakeResult } from './fake-client'
import { loadCollectionCardDetails, loadCollectionMain } from './load-collection'
import { clearRefCaches } from './ref-cache'
import { clearCardTagCaches } from '@/lib/card-tags-read'

const ok = (data: unknown): FakeResult => ({ data, error: null })
interface Opts { copies?: unknown[]; slots?: unknown[]; failTable?: string }
function handler(o: Opts = {}) {
  return (c: FakeCall): FakeResult => {
    if (o.failTable === c.table) return { data: null, error: { message: 'down' } }
    switch (c.table) {
      case 'ref_printings':
        return ok([{ scryfall_id: 'p1', name: 'Sol Ring', set_code: 'c21', set_name: 'C21', collector_number: '263', rarity: 'uncommon', finishes: ['nonfoil'], price_usd: '2.10', price_usd_foil: null, released_at: '2021-01-01', image_uri_small: null, image_uri_normal: null, legality_commander: 'legal' }])
      case 'ref_cards': return ok([{ name: 'Sol Ring', oracle_text: 'x', type_line: 'Artifact', mana_cost: '{1}', mana_value: 1, color_identity: '', power: null, toughness: null }])
      case 'ref_card_tags': return ok([])
      case 'ref_tag_list': return ok([])
      case 'user_copies':
        return ok(o.copies ?? [{ id: 100, is_proxy: false, missing: false, condition: 'near_mint', finish: 'nonfoil', printing_id: 'p1', location_id: null, deck_cards: null, user_cards: { oracle_id: 'oid-1', card_name: 'Sol Ring' } }])
      case 'user_locations': return ok([])
      case 'deck_cards':
        if (c.columns?.startsWith('id, deck_id, card_name')) return ok(o.slots ?? [])
        return ok([{ deck_id: 4, copy_id: null, is_generic: false, generic_sleeved: false, categories: '["Ramp"]' }])
      case 'decks': return ok([{ id: 4, name: 'Rocco', format: 'commander' }])
      case 'ref_rulings': return ok([{ published_at: '2007-10-01', comment: 'A ruling.' }])
    }
    return ok([])
  }
}
const load = (o?: Opts) => loadCollectionCardDetails(fakeClient(handler(o)) as never, 'user-1', 'oid-1')

describe('loadCollectionCardDetails', () => {
  beforeEach(() => { clearCardTagCaches(); clearRefCaches() })
  it('lists a waiting deck even when a free copy exists (no shortfall needed)', async () => {
    const d = await load({ slots: [{ id: 50, deck_id: 4, card_name: 'Sol Ring', categories: '["Ramp"]' }] })
    expect(d.copies).toHaveLength(1)
    expect(d.copies[0].state).toBe('open')
    expect(d.waitingDecks).toEqual([{ deckCardsId: 50, deckId: 4, deckName: 'Rocco', deckState: expect.any(String) }])
  })
  it('skips slots that are not countable (Maybeboard)', async () => {
    const d = await load({ slots: [{ id: 51, deck_id: 4, card_name: 'Sol Ring', categories: '["Maybeboard"]' }] })
    expect(d.waitingDecks).toEqual([])
  })
  it('reads the copies of every printing in one query, filtered by the card\'s oracle id and the user', async () => {
    const log: FakeCall[] = []
    const copies = [
      { id: 100, is_proxy: false, missing: false, condition: 'near_mint', finish: 'nonfoil', printing_id: 'p1', location_id: null, deck_cards: null, user_cards: { oracle_id: 'oid-1', card_name: 'Sol Ring' } },
      { id: 101, is_proxy: false, missing: true, condition: null, finish: 'nonfoil', printing_id: 'p2', location_id: null, deck_cards: null, user_cards: { oracle_id: 'oid-1', card_name: 'Sol Ring' } },
    ]
    const d = await loadCollectionCardDetails(fakeClient(handler({ copies }), log) as never, 'user-1', 'oid-1')
    expect(log.some((l) => l.table === 'user_cards')).toBe(false)
    const copiesCalls = log.filter((l) => l.table === 'user_copies')
    expect(copiesCalls).toHaveLength(1)
    expect(copiesCalls[0].filters).toContainEqual(['eq', 'user_cards.oracle_id', 'oid-1'])
    expect(copiesCalls[0].filters).toContainEqual(['eq', 'user_id', 'user-1'])
    expect(d.ownedCount).toBe(1)
  })
  it('reads each table once (decks are not read three times) and leaves rulings out of the main part', async () => {
    const log: FakeCall[] = []
    const d = await loadCollectionMain(fakeClient(handler({ slots: [{ id: 50, deck_id: 4, card_name: 'Sol Ring', categories: '["Ramp"]' }] }), log) as never, 'user-1', 'oid-1')
    const count = (t: string) => log.filter((l) => l.table === t).length
    expect(count('decks')).toBe(1)
    expect(count('ref_printings')).toBe(1)
    expect(count('ref_rulings')).toBe(0)
    expect('rulings' in d).toBe(false)
  })
  it('answers repeat opens of the same card from the server cache for facts, printings and rulings', async () => {
    const log: FakeCall[] = []
    const client = fakeClient(handler(), log) as never
    await loadCollectionCardDetails(client, 'user-1', 'oid-1')
    const before = { printings: log.filter((l) => l.table === 'ref_printings').length, facts: log.filter((l) => l.table === 'ref_cards').length, rulings: log.filter((l) => l.table === 'ref_rulings').length }
    await loadCollectionCardDetails(client, 'user-1', 'oid-1')
    expect(log.filter((l) => l.table === 'ref_printings')).toHaveLength(before.printings)
    expect(log.filter((l) => l.table === 'ref_cards')).toHaveLength(before.facts)
    expect(log.filter((l) => l.table === 'ref_rulings')).toHaveLength(before.rulings)
    // The user's own copies are never cached.
    expect(log.filter((l) => l.table === 'user_copies')).toHaveLength(2)
  })
  it('still returns printings and rulings for a card the user owns no copy of', async () => {
    const d = await load({ copies: [] })
    expect(d.copies).toEqual([])
    expect(d.ownedCount).toBe(0)
    expect(d.collectionValue).toBeNull()
    expect(d.cardName).toBe('Sol Ring')
    expect(d.printings).toHaveLength(1)
    expect(d.rulings).toHaveLength(1)
  })
  it('throws when a lookup fails instead of answering empty', async () => {
    await expect(load({ failTable: 'user_copies' })).rejects.toThrow(/copies lookup failed/)
    clearRefCaches()
    await expect(load({ failTable: 'ref_rulings' })).rejects.toThrow(/rulings lookup failed/)
  })
})
