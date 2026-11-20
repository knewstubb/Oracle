import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeClient, type FakeCall, type FakeResult } from '@/lib/card-details/fake-client'

let copyId: number | null = null
let writes: Array<{ table: string; values: unknown }> = []
const handler = (c: FakeCall): FakeResult => {
  if (c.op === 'update') {
    writes.push({ table: c.table, values: c.values })
    return { data: null, error: null }
  }
  return { data: { id: 1, deck_id: 5, copy_id: copyId, decks: { user_id: 'user-1' } }, error: null }
}
vi.mock('@/lib/supabase', () => ({ createAdminClient: () => fakeClient(handler) }))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
import { PATCH } from './route'

const patch = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/api/decks/5/cards/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: '5', cardId: '1' }) },
  )

describe('PATCH /api/decks/[id]/cards/[cardId] slotOnly guard', () => {
  beforeEach(() => {
    writes = []
    copyId = null
  })
  it('slotOnly on a sleeved slot answers 409 and changes nothing', async () => {
    copyId = 77
    const res = await patch({ scryfall_id: 'sf2', set_code: 'bbb', slotOnly: true })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('slot_has_copy')
    expect(writes).toEqual([])
  })
  it('slotOnly on a Planned slot sets the slot printing and never touches user_copies', async () => {
    const res = await patch({ scryfall_id: 'sf2', set_code: 'bbb', slotOnly: true })
    expect(res.status).toBe(200)
    expect(writes.map((w) => w.table)).toEqual(['deck_cards'])
  })
  it('without slotOnly a sleeved slot still mirrors the printing onto the copy (unchanged behaviour)', async () => {
    copyId = 77
    const res = await patch({ scryfall_id: 'sf2', set_code: 'bbb' })
    expect(res.status).toBe(200)
    expect(writes.map((w) => w.table)).toEqual(['deck_cards', 'user_copies'])
  })
})
