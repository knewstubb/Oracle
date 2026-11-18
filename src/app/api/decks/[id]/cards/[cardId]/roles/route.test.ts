import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const OID = 'aaaaaaaa-0000-4000-8000-000000000001'
const h = vi.hoisted(() => ({
  deck: { id: 4 } as { id: number } | null,
  slot: { id: 7, card_name: 'Sol Ring' } as { id: number; card_name: string } | null,
  rpc: (async () => ({ data: null, error: null })) as (fn: string, args: unknown) => Promise<unknown>,
  deckFilters: [] as Array<[string, unknown]>,
}))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/ref-card-text', () => ({
  fetchRefTextByName: async () => ({ map: new Map([['Sol Ring', { name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' }]]), error: null }),
}))
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    rpc: (fn: string, args: unknown) => h.rpc(fn, args),
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { if (table === 'decks') h.deckFilters.push([col, v]); return q },
        maybeSingle: async () => ({ data: table === 'decks' ? h.deck : h.slot, error: null }),
      }
      return q
    },
  }),
}))
import { GET, PUT } from './route'

const ctx = { params: Promise.resolve({ id: '4', cardId: '7' }) }
const put = (body: unknown) => PUT(new NextRequest('http://x/api', { method: 'PUT', body: JSON.stringify(body) }), ctx)
const get = () => GET(new NextRequest('http://x/api'), ctx)

beforeEach(() => {
  h.deck = { id: 4 }
  h.slot = { id: 7, card_name: 'Sol Ring' }
  h.deckFilters = []
  h.rpc = vi.fn(async (fn: string) => {
    if (fn === '_slot_oracle_id') return { data: OID, error: null }
    if (fn === 'get_effective_card_roles') return { data: [{ oracle_id: OID, role: 'ramp', in_baseline: true, baseline_proposer: 'system', owner_effect: null, claude_effect: null, claude_state: null, effective: true, effective_from: 'baseline', beside: false }], error: null }
    if (fn === 'owner_set_card_role') return { data: { previous: { owner_effect: null, claude_effect: null, claude_state: null }, current: { owner_effect: 'add' } }, error: null }
    return { data: null, error: { message: 'unexpected' } }
  })
})

describe('GET roles', () => {
  it('returns stored roles read for the signed-in user with the oracle id, plus the text reading', async () => {
    const res = await get()
    const body = await res.json()
    expect(h.rpc).toHaveBeenCalledWith('_slot_oracle_id', { p_user_id: 'user-1', p_deck_id: 4, p_slot_id: 7 })
    expect(h.rpc).toHaveBeenCalledWith('get_effective_card_roles', { p_user_id: 'user-1', p_oracle_ids: [OID] })
    expect(body.stored).toMatchObject({ status: 'ok', oracleId: OID })
    expect(body.stored.rows[0]).toMatchObject({ role: 'ramp', effective_from: 'baseline' })
    expect(body.kind).toBe('roles')
    expect(body.roles).toEqual(['ramp'])
  })
  it('says the stored read failed instead of an empty list', async () => {
    h.rpc = vi.fn(async (fn: string) => (fn === '_slot_oracle_id' ? { data: OID, error: null } : { data: null, error: { message: 'boom' } }))
    const body = await (await get()).json()
    expect(body.stored).toEqual({ status: 'error' })
    expect(body.kind).toBe('roles')
  })
  it('says no identity when the card cannot be matched', async () => {
    h.rpc = vi.fn(async () => ({ data: null, error: null }))
    expect((await (await get()).json()).stored).toEqual({ status: 'no_identity' })
  })
  it('404 for a deck that is not the user\'s', async () => {
    h.deck = null
    expect((await get()).status).toBe(404)
  })
})

describe('PUT roles', () => {
  it('saves through owner_set_card_role with the user id and oracle id (never a printing id) and returns the previous value', async () => {
    const res = await put({ role: 'tutor', action: 'add' })
    expect(res.status).toBe(200)
    expect(h.rpc).toHaveBeenCalledWith('owner_set_card_role', { p_user_id: 'user-1', p_oracle_id: OID, p_role: 'tutor', p_action: 'add' })
    expect(await res.json()).toEqual({ previous: { owner_effect: null }, current: { owner_effect: 'add' } })
    expect(h.deckFilters).toContainEqual(['user_id', 'user-1'])
  })
  it('refuses unknown roles and actions before touching the database', async () => {
    expect((await put({ role: 'draw', action: 'add' })).status).toBe(400)
    expect((await put({ role: 'ramp', action: 'toggle' })).status).toBe(400)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('404 for another user\'s deck or a card not in the deck', async () => {
    h.deck = null
    expect((await put({ role: 'ramp', action: 'add' })).status).toBe(404)
    h.deck = { id: 4 }
    h.slot = null
    expect((await put({ role: 'ramp', action: 'add' })).status).toBe(404)
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('422 when the card has no identity, and nothing is written', async () => {
    h.rpc = vi.fn(async () => ({ data: null, error: null }))
    const res = await put({ role: 'ramp', action: 'add' })
    expect(res.status).toBe(422)
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('maps database refusals to 422 and a failure to 500', async () => {
    h.rpc = vi.fn(async (fn: string) => (fn === '_slot_oracle_id' ? { data: OID, error: null } : { data: null, error: { message: 'unknown_card' } }))
    expect((await put({ role: 'ramp', action: 'add' })).status).toBe(422)
    h.rpc = vi.fn(async (fn: string) => (fn === '_slot_oracle_id' ? { data: OID, error: null } : { data: null, error: { message: 'connection reset' } }))
    expect((await put({ role: 'ramp', action: 'add' })).status).toBe(500)
  })
})
