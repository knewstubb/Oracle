import { describe, it, expect } from 'vitest'
import { listDecks, listDecksInput } from '../tools/list-decks'
import { mockDb } from './mock-db'

const deck = (id: number, name: string) => ({ id, name, commander_name: null, colour_identity: null, format: 'commander', bracket: null, card_count: 0 })

describe('list_decks follows the saved deck order (brief scenario 5)', () => {
  it('asks the database for position, then name, then id, and keeps the order it gets back', async () => {
    const { db, queries } = mockDb((q) => (q.table === 'decks' ? { data: [deck(7, 'Zur'), deck(2, 'Atraxa')], count: 2 } : { data: [] }))
    const r = (await listDecks({ db, userId: 'u1' }, listDecksInput.parse({}))) as never as { items: { name: string }[] }
    expect(r.items.map((d) => d.name)).toEqual(['Zur', 'Atraxa'])
    const orders = queries[0].filters.filter((f) => f.op === 'order').map((f) => f.args[0])
    expect(orders).toEqual(['position', 'name', 'id'])
  })
  it('pages over the saved order', async () => {
    const { db, queries } = mockDb((q) => (q.table === 'decks' ? { data: [deck(1, 'A')], count: 30 } : { data: [] }))
    await listDecks({ db, userId: 'u1' }, listDecksInput.parse({ limit: 10, offset: 10 }))
    const f = queries[0].filters
    expect(f.findIndex((x) => x.op === 'order')).toBeLessThan(f.findIndex((x) => x.op === 'range'))
    expect(f.find((x) => x.op === 'range')?.args).toEqual([10, 19])
  })
})
