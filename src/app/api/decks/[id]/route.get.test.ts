import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fakeSupabase } from '@/test/fake-supabase'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('@/test/fake-supabase').fakeSupabase>,
  calls: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
}))

vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }), getAuthUser: () => Promise.resolve({ id: 'user-1' }) }))
vi.mock('@/lib/commander-context', () => ({
  getCommanderBuildCardRepository: () => ({
    getSynergyScores: async () => new Map([['Sol Ring', 0.9], ['Brightclimb Pathway', 0.4]]),
  }),
}))
// Every database read takes a moment, and the test counts how many are waiting at the same time.
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from(table: string) {
      h.calls.push(table)
      const q = h.db.client.from(table) as Record<string, unknown>
      const originalThen = q.then as (res: (v: unknown) => unknown) => Promise<unknown>
      const originalMaybeSingle = q.maybeSingle as () => Promise<unknown>
      const track = async <T,>(run: () => Promise<T>): Promise<T> => {
        h.inFlight += 1
        h.maxInFlight = Math.max(h.maxInFlight, h.inFlight)
        await new Promise((r) => setTimeout(r, 5))
        try {
          return await run()
        } finally {
          h.inFlight -= 1
        }
      }
      q.then = (res: (v: unknown) => unknown) => track(() => originalThen(res) as Promise<unknown>)
      q.maybeSingle = () => track(originalMaybeSingle)
      return q
    },
  }),
}))

import { GET } from './route'

const call = (id = '7') =>
  GET(new NextRequest(`http://localhost/api/decks/${id}`), { params: Promise.resolve({ id }) })

const SOL = 'aaaaaaaa-0000-0000-0000-000000000001'
const PATHWAY = 'aaaaaaaa-0000-0000-0000-000000000002'

function seed() {
  h.db = fakeSupabase({
    decks: [
      { id: 7, user_id: 'user-1', name: 'Korvold', commander_id: 'cmd-1', commander_name: null, build_id: 'build-1' },
      { id: 9, user_id: 'user-2', name: 'Atraxa', commander_id: null, commander_name: null, build_id: null },
    ],
    deck_cards: [
      { id: 1, deck_id: 7, card_name: 'Sol Ring', scryfall_id: SOL, copy_id: 11, ownership_status: null, requested_finish: null },
      { id: 2, deck_id: 7, card_name: 'Brightclimb Pathway // Grimclimb Pathway', scryfall_id: PATHWAY, copy_id: null, ownership_status: null, requested_finish: 'foil' },
      { id: 3, deck_id: 7, card_name: 'Island', scryfall_id: null, copy_id: null, ownership_status: null, requested_finish: null },
    ],
    ref_cards: [
      { name: 'Sol Ring', mana_cost: '{1}', type_line: 'Artifact', oracle_text: 'Tap: add two.', color_identity: '' },
      { name: 'Brightclimb Pathway', mana_cost: '{W}', type_line: 'Land', oracle_text: 'Pathway', color_identity: 'W' },
      { name: 'Island', mana_cost: null, type_line: 'Basic Land', oracle_text: null, color_identity: 'U' },
    ],
    ref_printings: [
      { scryfall_id: SOL, name: 'Sol Ring', price_usd: 1.5, rarity: 'uncommon', set_code: 'c21', set_name: 'Commander 2021' },
      { scryfall_id: PATHWAY, name: 'Brightclimb Pathway', price_usd: null, rarity: 'rare', set_code: 'znr', set_name: 'Zendikar Rising' },
    ],
    ref_commanders: [{ id: 'cmd-1', salt_score: 2.5, edhrec_rank: 77, edhrec_deck_count: 1234 }],
    brew_sessions: [{ id: 'brew-1', deck_id: 7, updated_at: '2026-01-01' }],
    user_copies: [
      { id: 11, user_id: 'user-1', finish: 'foil', language: 'ja' },
      { id: 12, user_id: 'user-2', finish: 'etched', language: 'de' },
    ],
  })
}

describe('GET /api/decks/[id]', () => {
  beforeEach(() => {
    seed()
    h.calls = []
    h.inFlight = 0
    h.maxInFlight = 0
  })

  it('returns the deck with prices, editions, commander figures, synergy and copy details', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deck).toMatchObject({ id: 7, commander_id: 'cmd-1', salt_score: 2.5, edhrec_rank: 77, edhrec_deck_count: 1234 })
    expect(body.brewSessionId).toBe('brew-1')
    const sol = body.cards.find((c: { card_name: string }) => c.card_name === 'Sol Ring')
    expect(sol).toMatchObject({
      mana_cost: '{1}',
      type_line: 'Artifact',
      price_usd: 1.5,
      rarity: 'uncommon',
      edition_name: 'Commander 2021',
      synergy_score: 0.9,
      finish: 'foil',
      language: 'ja',
      has_copy: true,
      lifecycle: 'sleeved',
      allocation_status: 'original',
    })
    const pathway = body.cards.find((c: { card_name: string }) => c.card_name === 'Brightclimb Pathway // Grimclimb Pathway')
    // A double-faced card on the deck picks up the data stored under its front-face name.
    expect(pathway).toMatchObject({
      mana_cost: '{W}',
      type_line: 'Land',
      color_identity: 'W',
      price_usd: null,
      rarity: 'rare',
      edition_name: 'Zendikar Rising',
      synergy_score: 0.4,
      finish: 'foil',
      language: null,
      has_copy: false,
      lifecycle: 'planned',
      allocation_status: null,
    })
    const island = body.cards.find((c: { card_name: string }) => c.card_name === 'Island')
    expect(island).toMatchObject({ edition_name: null, price_usd: null, rarity: null, color_identity: 'U', synergy_score: null })
  })

  it('does not return another user\'s copy details', async () => {
    h.db.tables.deck_cards[0].copy_id = 12
    const body = await (await call()).json()
    expect(body.cards[0]).toMatchObject({ has_copy: false, language: null })
  })

  it('reads the printings table once for prices and editions together', async () => {
    await call()
    expect(h.calls.filter((t) => t === 'ref_printings')).toHaveLength(1)
  })

  it('asks the database for independent data at the same time', async () => {
    await call()
    // Wave 1 (deck, cards, brew session) is three at once; wave 2 (cards data, printings, commander, copies) is four.
    expect(h.maxInFlight).toBeGreaterThanOrEqual(4)
  })

  it('splits long lists into batches of 200 and keeps card order', async () => {
    const many = Array.from({ length: 450 }, (_, i) => ({
      id: 100 + i, deck_id: 7, card_name: `Card ${String(i).padStart(3, '0')}`, scryfall_id: null, copy_id: null,
      ownership_status: null, requested_finish: null,
    }))
    h.db.tables.deck_cards = many
    h.db.tables.ref_cards = many.map((c) => ({ name: c.card_name, mana_cost: '{0}', type_line: 'Thing', oracle_text: null, color_identity: '' }))
    const body = await (await call()).json()
    expect(body.cards).toHaveLength(450)
    expect(body.cards.map((c: { card_name: string }) => c.card_name)).toEqual(many.map((c) => c.card_name))
    expect(body.cards.every((c: { mana_cost: string }) => c.mana_cost === '{0}')).toBe(true)
    expect(h.calls.filter((t) => t === 'ref_cards')).toHaveLength(3)
  })

  it('answers 404 for a deck that is not the owner\'s and 400 for a bad id', async () => {
    expect((await call('9')).status).toBe(404)
    expect((await call('abc')).status).toBe(400)
  })
})
