/**
 * The database-backed name lookup (fake client, no real database): exact name first, case-insensitive
 * and front-face fallbacks, owned printing preferred, proxies and other users' copies ignored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Row {
  oracle_id: string
  scryfall_id: string
  name: string
  set_code: string
  set_name: string
  collector_number: string
  released_at: string
  digital: boolean
  layout: string
  type_line: string
  finishes: string[]
}

const state: { printings: Row[]; cards: Array<{ id: number; oracle_id: string; user_id: string }>; copies: Array<{ card_id: number; user_id: string; printing_id: string; is_proxy: boolean }>; log: string[]; failIlike: boolean } = {
  printings: [],
  cards: [],
  copies: [],
  log: [],
  failIlike: false,
}

function likeToRegex(pattern: string): RegExp {
  const body = pattern.replace(/\\([\\%_])/g, '\u0000$1').replace(/[.*+?^${}()|[\]]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.').replace(/\u0000(.)/g, '\\$1')
  return new RegExp(`^${body}$`, 'i')
}

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const filters: Array<(r: Record<string, unknown>) => boolean> = []
      let failed = false
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), state.log.push(`eq:${col}`), builder),
        ilike: (col: string, pattern: string) => {
          state.log.push(`ilike:${pattern}`)
          if (state.failIlike) failed = true
          const re = likeToRegex(pattern)
          filters.push((r) => re.test(String(r[col])))
          return builder
        },
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
        order: () => builder,
        limit: () => builder,
        then: (resolve: (v: unknown) => void) => {
          const source = table === 'ref_printings' ? state.printings : table === 'user_cards' ? state.cards : state.copies
          if (failed) return resolve({ data: null, error: { message: 'statement timeout' } })
          resolve({ data: (source as unknown as Array<Record<string, unknown>>).filter((r) => filters.every((f) => f(r))), error: null })
        },
      }
      return builder
    },
  }),
}))

import { createSupabaseManaBoxResolver } from '@/lib/manabox-resolver'

function printing(id: string, name: string, over: Partial<Row> = {}): Row {
  return {
    oracle_id: `o-${name}`,
    scryfall_id: id,
    name,
    set_code: id,
    set_name: `Set ${id}`,
    collector_number: '1',
    released_at: '2020-01-01',
    digital: false,
    layout: 'normal',
    type_line: 'Creature',
    finishes: ['nonfoil', 'foil'],
    ...over,
  }
}

beforeEach(() => {
  state.printings = [
    printing('ghen-new', 'Ghen, Arcanum Weaver', { released_at: '2024-01-01' }),
    printing('ghen-old', 'Ghen, Arcanum Weaver', { released_at: '2022-01-01' }),
    printing('ghen-future', 'Ghen, Arcanum Weaver', { released_at: '2099-01-01' }),
    printing('fire-1', 'Fire // Ice', { layout: 'split' }),
    printing('jaya', "Jaya's Immolating Inferno"),
  ]
  state.cards = [{ id: 7, oracle_id: 'o-Ghen, Arcanum Weaver', user_id: 'me' }, { id: 8, oracle_id: 'o-Ghen, Arcanum Weaver', user_id: 'other' }]
  state.copies = []
  state.log = []
  state.failIlike = false
})

describe('createSupabaseManaBoxResolver().resolveByName', () => {
  it('finds a card by its exact name with the fast lookup and picks the newest released printing', async () => {
    const r = createSupabaseManaBoxResolver()
    const facts = await r.resolveByName!('Ghen, Arcanum Weaver')
    expect(facts).toMatchObject({ scryfallId: 'ghen-new', oracleId: 'o-Ghen, Arcanum Weaver', cardName: 'Ghen, Arcanum Weaver' })
    expect(state.log.some((l) => l.startsWith('ilike'))).toBe(false)
  })

  it('prefers a printing the signed-in user owns, ignoring proxies and other users', async () => {
    state.copies = [
      { card_id: 7, user_id: 'me', printing_id: 'ghen-old', is_proxy: false },
      { card_id: 7, user_id: 'me', printing_id: 'ghen-new', is_proxy: true },
      { card_id: 8, user_id: 'other', printing_id: 'ghen-new', is_proxy: false },
    ]
    const mine = await createSupabaseManaBoxResolver({ userId: 'me' }).resolveByName!('Ghen, Arcanum Weaver')
    expect(mine?.scryfallId).toBe('ghen-old')
    const stranger = await createSupabaseManaBoxResolver({ userId: 'nobody' }).resolveByName!('Ghen, Arcanum Weaver')
    expect(stranger?.scryfallId).toBe('ghen-new')
  })

  it('ignores letter case, straight vs curly apostrophes, and finds a split card by its front', async () => {
    const r = createSupabaseManaBoxResolver()
    expect((await r.resolveByName!('ghen, arcanum weaver'))?.cardName).toBe('Ghen, Arcanum Weaver')
    expect((await r.resolveByName!('Jaya’s Immolating Inferno'))?.scryfallId).toBe('jaya')
    expect((await r.resolveByName!('Fire'))?.cardName).toBe('Fire // Ice')
    expect((await r.resolveByName!('Fire // Ice'))?.scryfallId).toBe('fire-1')
  })

  it('returns null for a name that does not exist, and treats a slow fallback search as no match', async () => {
    const r = createSupabaseManaBoxResolver()
    expect(await r.resolveByName!('Not A Real Card')).toBeNull()
    state.failIlike = true
    expect(await createSupabaseManaBoxResolver().resolveByName!('Missing Card')).toBeNull()
  })

  it('treats % and _ in a typed name literally', async () => {
    expect(await createSupabaseManaBoxResolver().resolveByName!('%')).toBeNull()
  })

  it('narrows to a set when the line named one', async () => {
    const r = createSupabaseManaBoxResolver()
    expect((await r.resolveByName!('Ghen, Arcanum Weaver', { setCode: 'GHEN-OLD' }))?.scryfallId).toBe('ghen-old')
    expect(await r.resolveByName!('Ghen, Arcanum Weaver', { setCode: 'zzz' })).toBeNull()
  })
})
