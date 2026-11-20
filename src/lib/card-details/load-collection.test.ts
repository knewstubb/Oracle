import { describe, it, expect, beforeEach } from 'vitest'
import { fakeClient, type FakeCall, type FakeResult } from './fake-client'
import { loadCollectionCardDetails } from './load-collection'
import { clearCardTagCaches } from '@/lib/card-tags-read'

const ok = (data: unknown): FakeResult => ({ data, error: null })
interface Opts { copies?: unknown[]; cards?: unknown[]; slots?: unknown[]; failTable?: string }
function handler(o: Opts = {}) {
  return (c: FakeCall): FakeResult => {
    if (o.failTable === c.table) return { data: null, error: { message: 'down' } }
    switch (c.table) {
      case 'user_cards': return ok(o.cards ?? [{ id: 11, card_name: 'Sol Ring' }])
      case 'ref_printings':
        return ok([{ scryfall_id: 'p1', name: 'Sol Ring', set_code: 'c21', set_name: 'C21', collector_number: '263', rarity: 'uncommon', finishes: ['nonfoil'], price_usd: '2.10', price_usd_foil: null, released_at: '2021-01-01', image_uri_small: null, image_uri_normal: null, legality_commander: 'legal' }])
      case 'ref_cards': return ok([{ name: 'Sol Ring', oracle_text: 'x', type_line: 'Artifact', mana_cost: '{1}', mana_value: 1, color_identity: '', power: null, toughness: null }])
      case 'ref_card_tags': return ok([])
      case 'ref_tag_list': return ok([])
      case 'user_copies':
        return ok(o.copies ?? [{ id: 100, is_proxy: false, missing: false, condition: 'near_mint', finish: 'nonfoil', printing_id: 'p1', location_id: null, deck_cards: null }])
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
  beforeEach(() => clearCardTagCaches())
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
  it('matches copies by oracle_id across printings: the copy query is by every user_cards row of the oracle id', async () => {
    const log: FakeCall[] = []
    const d = await loadCollectionCardDetails(fakeClient(handler({ cards: [{ id: 11, card_name: 'Sol Ring' }, { id: 12, card_name: 'Sol Ring' }] }), log) as never, 'user-1', 'oid-1')
    const cardsCall = log.find((l) => l.table === 'user_cards')!
    expect(cardsCall.filters).toContainEqual(['eq', 'oracle_id', 'oid-1'])
    const copiesCall = log.find((l) => l.table === 'user_copies')!
    expect(copiesCall.filters).toContainEqual(['in', 'card_id', [11, 12]])
    expect(d.ownedCount).toBe(1)
  })
  it('still returns printings and rulings for a card the user owns no copy of', async () => {
    const d = await load({ cards: [] })
    expect(d.copies).toEqual([])
    expect(d.ownedCount).toBe(0)
    expect(d.collectionValue).toBeNull()
    expect(d.cardName).toBe('Sol Ring')
    expect(d.printings).toHaveLength(1)
    expect(d.rulings).toHaveLength(1)
  })
  it('throws when a lookup fails instead of answering empty', async () => {
    await expect(load({ failTable: 'user_copies' })).rejects.toThrow(/copies lookup failed/)
    await expect(load({ failTable: 'ref_rulings' })).rejects.toThrow(/rulings lookup failed/)
  })
})
