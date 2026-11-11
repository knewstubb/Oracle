import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => { throw new Error('no real DB in tests') }) }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { browseSpareCopies, buildFilter } from './spare-copy-browse'
import type { LookupClient } from './owned-copy-lookup'
import { DECK_CHAT_CONTEXT, getToolDefinitions, getToolDefinitionsForContext } from './tool-registry'
import { OWNED_COPY_RULES } from './deck-chat-prompt'
import { buildOracleSystemPrompt } from './oracle-prompt'

type Row = Record<string, unknown>

function mockClient(tables: Record<string, Row[]>) {
  const calls: string[] = []
  const client: LookupClient = {
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      const q = {
        select() { calls.push(`${table}.select`); return q },
        eq(col: string, v: unknown) { data = data.filter(r => r[col] === v); return q },
        in(col: string, vs: unknown[]) { data = data.filter(r => vs.includes(r[col])); return q },
        order() { return q },
        range(a: number, b: number) { return Promise.resolve({ data: data.slice(a, b + 1), error: null }) },
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(res) },
      }
      return new Proxy(q, { get: (t, k) => (k in t ? (t as never)[k] : (() => { throw new Error(`write/unknown ${table}.${String(k)}`) })) })
    },
  }
  return { client, calls }
}

const ref = (name: string, ci: string, type: string, text = '', rank = 100) =>
  ({ name, color_identity: ci, type_line: type, oracle_text: text, mana_value: 2, edhrec_rank: rank })

function world(over: Partial<Record<string, Row[]>> = {}): Record<string, Row[]> {
  return {
    decks: [
      { id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: '', commander_name: 'Mendicant Core, Guidelight' },
      { id: 2, user_id: 'u1', name: 'Korvold', colour_identity: 'BGR' },
    ],
    deck_cards: [
      { id: 1, deck_id: 1, card_name: 'Mendicant Core, Guidelight', copy_id: null, is_commander: true },
      { id: 2, deck_id: 1, card_name: 'Already Here', copy_id: null },
      { id: 3, deck_id: 2, card_name: 'Held Elsewhere', copy_id: 21 },
      { id: 4, deck_id: 2, card_name: 'Planned Only', copy_id: null }, // planned, claims no copy
    ],
    ref_printings: [{ name: 'Mendicant Core, Guidelight', color_identity: ['R'] }],
    user_cards: [
      { id: 10, user_id: 'u1', card_name: 'Spare Bear', oracle_id: 'o1' },
      { id: 11, user_id: 'u1', card_name: 'Held Elsewhere', oracle_id: 'o2' },
      { id: 12, user_id: 'u1', card_name: 'Green Card', oracle_id: 'o3' },
      { id: 13, user_id: 'u1', card_name: 'Proxy Only', oracle_id: 'o4' },
      { id: 14, user_id: 'u1', card_name: 'Planned Only', oracle_id: 'o5' },
      { id: 15, user_id: 'u1', card_name: 'Already Here', oracle_id: 'o6' },
      { id: 16, user_id: 'u1', card_name: 'Forest', oracle_id: 'o7' },
      { id: 17, user_id: 'u1', card_name: 'Spare Draw', oracle_id: 'o8' },
      { id: 99, user_id: 'other', card_name: 'Their Card', oracle_id: 'o9' },
    ],
    user_copies: [
      { id: 20, user_id: 'u1', card_id: 10, is_proxy: false },
      { id: 21, user_id: 'u1', card_id: 11, is_proxy: false },
      { id: 22, user_id: 'u1', card_id: 12, is_proxy: false },
      { id: 23, user_id: 'u1', card_id: 13, is_proxy: true },
      { id: 24, user_id: 'u1', card_id: 14, is_proxy: false },
      { id: 25, user_id: 'u1', card_id: 15, is_proxy: false },
      { id: 26, user_id: 'u1', card_id: 16, is_proxy: false },
      { id: 27, user_id: 'u1', card_id: 17, is_proxy: false },
      { id: 98, user_id: 'other', card_id: 99, is_proxy: false },
    ],
    ref_cards: [
      ref('Spare Bear', 'R', 'Creature — Bear', '', 10),
      ref('Held Elsewhere', 'R', 'Artifact', '', 5),
      ref('Green Card', 'G', 'Creature — Elf'),
      ref('Proxy Only', 'R', 'Creature'),
      ref('Planned Only', 'R', 'Instant', 'Destroy target creature.'),
      ref('Already Here', 'R', 'Creature'),
      ref('Spare Draw', 'R', 'Sorcery', 'Draw two cards.', 1),
    ],
    ...over,
  }
}

const run = (t: Record<string, Row[]>, kind?: string, limit?: number) =>
  browseSpareCopies(mockClient(t).client, { userId: 'u1', deckId: 1, kind, limit })

describe('browseSpareCopies', () => {
  it('derives blank colours from the commander and lists spare real copies that fit', async () => {
    const r = await run(world())
    expect(r.colour_source).toBe('commander')
    expect(r.colour_identity).toEqual(['R'])
    expect(r.spare.map(c => c.card_name)).toEqual(['Spare Draw', 'Spare Bear', 'Planned Only'])
    // outside colours, proxy-only, already in this deck, basics, other users: all absent
    const all = [...r.spare, ...r.in_another_deck].map(c => c.card_name)
    for (const n of ['Green Card', 'Proxy Only', 'Already Here', 'Forest', 'Their Card']) expect(all).not.toContain(n)
  })

  it('planned slots do not claim a copy: a card only planned elsewhere is still spare', async () => {
    const r = await run(world())
    expect(r.spare.map(c => c.card_name)).toContain('Planned Only')
  })

  it('shows copies held by other decks, with the short-by-one warning', async () => {
    const r = await run(world())
    expect(r.in_another_deck).toHaveLength(1)
    expect(r.in_another_deck[0].card_name).toBe('Held Elsewhere')
    expect(r.in_another_deck[0].in_other_decks[0].warning).toBe('Using it here leaves Korvold short by one.')
    expect(r.order).toEqual(['SPARE', 'IN_ANOTHER_DECK', 'BUY'])
  })

  it('a card with a spare and a held copy is Spare and still shows the other deck', async () => {
    const t = world()
    t.user_copies.push({ id: 30, user_id: 'u1', card_id: 11, is_proxy: false })
    const r = await run(t)
    const c = r.spare.find(x => x.card_name === 'Held Elsewhere')
    expect(c?.spare_copies).toBe(1)
    expect(c?.in_other_decks[0].deck_name).toBe('Korvold')
  })

  it('filters by type and by role', async () => {
    expect((await run(world(), 'creature')).spare.map(c => c.card_name)).toEqual(['Spare Bear'])
    expect((await run(world(), 'draw')).spare.map(c => c.card_name)).toEqual(['Spare Draw'])
    expect((await run(world(), 'removal')).spare.map(c => c.card_name)).toEqual(['Planned Only'])
  })

  it('caps each group and says so', async () => {
    const r = await run(world(), undefined, 1)
    expect(r.spare).toHaveLength(1)
    expect(r.total_spare).toBe(3)
    expect(r.notes.join(' ')).toContain('Showing 1 of 3')
  })

  it('uses the stored colour identity only as the fallback, when no commander colours are known', async () => {
    const t = world({ decks: [{ id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: 'RG', commander_name: null }], deck_cards: [] })
    const r = await run(t)
    expect(r.colour_source).toBe('deck')
    expect(r.spare.map(c => c.card_name)).toContain('Green Card')
  })

  it('commanders win over a stale stored value (it may hold one commander only)', async () => {
    const t = world({ decks: [{ id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: 'ZZ', commander_name: 'Mendicant Core, Guidelight' }] })
    const r = await run(t)
    expect(r.colour_source).toBe('commander')
  })

  it('says colours could not be determined and lists nothing', async () => {
    const t = world({ ref_printings: [], deck_cards: [] })
    const r = await run(t)
    expect(r.colour_identity).toBeNull()
    expect(r.spare).toEqual([])
    expect(r.notes.join(' ')).toContain('could not be determined')
  })

  it('rejects a deck that is not the owner’s', async () => {
    await expect(browseSpareCopies(mockClient(world()).client, { userId: 'u2', deckId: 1 })).rejects.toThrow()
  })

  it('only issues select queries', async () => {
    const { client, calls } = mockClient(world())
    await browseSpareCopies(client, { userId: 'u1', deckId: 1 })
    expect(calls.every(c => c.endsWith('.select'))).toBe(true)
  })
})

describe('buildFilter', () => {
  it('ramp matches mana and land-fetch text', () => {
    const f = buildFilter('ramp').match
    expect(f('Artifact', '{T}: Add {C}{C}.')).toBe(true)
    expect(f('Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.')).toBe(true)
    // fetching a land to hand is not ramp (contract section 0.3)
    expect(f('Sorcery', 'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.')).toBe(false)
    expect(f('Creature', 'Flying')).toBe(false)
  })

  it('wipes and lands use the shared role function and the front-face type line', () => {
    expect(buildFilter('wipes').match('Sorcery', 'Destroy all creatures.', 'Wrath of God')).toBe(true)
    expect(buildFilter('wipes').match('Creature', 'Flying')).toBe(false)
    expect(buildFilter('lands').match('Land', '')).toBe(true)
    expect(buildFilter('lands').match('Sorcery // Land', '')).toBe(false)
  })
})

describe('browse_spare_copies wiring', () => {
  it('is offered only in the deck chat context, suggest-only (edit tools stay off)', () => {
    const names = getToolDefinitionsForContext(DECK_CHAT_CONTEXT, { deckChatEditEnabled: false }).map(t => t.name)
    expect(names).toContain('browse_spare_copies')
    expect(names).not.toContain('add_cards_to_deck')
    expect(getToolDefinitionsForContext('general').map(t => t.name)).not.toContain('browse_spare_copies')
    expect(getToolDefinitions().map(t => t.name)).not.toContain('browse_spare_copies')
  })
  it('prompts say browse first, then Spare, another deck, Buy', () => {
    expect(OWNED_COPY_RULES.indexOf('browse_spare_copies')).toBeLessThan(OWNED_COPY_RULES.indexOf('check_owned_copies'))
    expect(OWNED_COPY_RULES.indexOf('1. Spare')).toBeLessThan(OWNED_COPY_RULES.indexOf('2. In another deck'))
    const p = buildOracleSystemPrompt({ type: 'deck', deckId: 1, deckName: 'D', commanderName: 'C' }, '', null, { deckChat: { editToolsEnabled: false, slotFacts: 'x' } })
    expect(p).toContain('browse_spare_copies FIRST')
  })
})
