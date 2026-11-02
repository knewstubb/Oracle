import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => { throw new Error('no real DB in tests') }) }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { lookupOwnedCopies, estimatePrice, type LookupClient } from './owned-copy-lookup'
import { DECK_CHAT_CONTEXT, getToolDefinitions, getToolDefinitionsForContext } from './tool-registry'
import { buildDeckChatPrompt } from './deck-chat-prompt'

type Row = Record<string, unknown>
const FRESH = new Date().toISOString()

/** Mock client: filters rows by eq/in, records every table + method (read-only check). */
function mockClient(tables: Record<string, Row[]>) {
  const calls: string[] = []
  const client: LookupClient = {
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      const q = {
        select() { calls.push(`${table}.select`); return q },
        eq(col: string, v: unknown) { data = data.filter(r => r[col] === v); return q },
        in(col: string, vs: unknown[]) { data = data.filter(r => vs.includes(r[col])); return q },
        ilike(col: string, pat: string) {
          const prefix = pat.replace(/%$/, '').toLowerCase()
          data = data.filter(r => String(r[col]).toLowerCase().startsWith(prefix)); return q
        },
        limit() { return q },
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data, error: null }).then(res) },
      }
      return new Proxy(q, { get: (t, k) => (k in t ? (t as never)[k] : (() => { throw new Error(`write/unknown ${table}.${String(k)}`) })) })
    },
  }
  return { client, calls }
}

const P = (name: string, oracle: string, ci: string[], price: number | null, extra: Row = {}) =>
  ({ name, oracle_id: oracle, color_identity: ci, price_usd: price, digital: false, updated_at: FRESH, ...extra })

function world(over: Partial<Record<string, Row[]>> = {}) {
  return {
    ref_printings: [
      P('Sol Ring', 'o-sol', [], 1.5),
      P('Sol Ring', 'o-sol', [], 4),
      P('Eternal Witness', 'o-ew', ['G'], 0.5),
      P('Rhystic Study', 'o-rs', ['U'], 30),
      P('Cheap Unknown', 'o-cu', ['G'], null),
      P('Zero Price', 'o-zp', ['G'], 0),
      P('Lightning Bolt', 'o-lb', ['R'], 1),
      P('Korvold, Fae-Cursed King', 'o-kor', ['B', 'G', 'R'], 5),
      P('Fire // Ice', 'o-fi', ['R', 'U'], 0.2),
    ],
    user_cards: [
      { id: 1, user_id: 'u1', oracle_id: 'o-sol' },
      { id: 2, user_id: 'u1', oracle_id: 'o-ew' },
      { id: 3, user_id: 'u1', oracle_id: 'o-rs' },
      { id: 9, user_id: 'other', oracle_id: 'o-lb' },
    ],
    user_copies: [
      { id: 10, user_id: 'u1', card_id: 1, is_proxy: false }, // Sol Ring, spare
      { id: 11, user_id: 'u1', card_id: 1, is_proxy: false }, // Sol Ring, in Korvold
      { id: 20, user_id: 'u1', card_id: 2, is_proxy: false }, // EW, in Korvold only
      { id: 30, user_id: 'u1', card_id: 3, is_proxy: true },  // Rhystic: proxy only
      { id: 90, user_id: 'other', card_id: 9, is_proxy: false },
    ],
    deck_cards: [
      { id: 1, deck_id: 100, card_name: 'Sol Ring', copy_id: 11, is_commander: false },
      { id: 2, deck_id: 100, card_name: 'Eternal Witness', copy_id: 20, is_commander: false },
      // Rocco plans Eternal Witness and Sol Ring: no copy, must NOT count as holding anything
      { id: 3, deck_id: 200, card_name: 'Eternal Witness', copy_id: null, is_commander: false },
      { id: 4, deck_id: 200, card_name: 'Sol Ring', copy_id: null, is_commander: false },
      { id: 5, deck_id: 300, card_name: 'Rhystic Study', copy_id: 30, is_commander: false },
      { id: 6, deck_id: 300, card_name: 'Korvold, Fae-Cursed King', copy_id: null, is_commander: true },
    ],
    decks: [
      { id: 100, user_id: 'u1', name: 'Korvold' },
      { id: 200, user_id: 'u1', name: 'Rocco' },
      { id: 300, user_id: 'u1', name: 'Viewed' },
    ],
    ...over,
  } as Record<string, Row[]>
}

const run = (tables: Record<string, Row[]>, names: string[], deckId: number | null = 300) =>
  lookupOwnedCopies(mockClient(tables).client, { userId: 'u1', deckId, cardNames: names })

describe('lookupOwnedCopies', () => {
  it('Spare: a real copy in no deck wins even when another copy is in a deck', async () => {
    const r = (await run(world(), ['Sol Ring'])).results[0]
    expect(r.status).toBe('SPARE')
    expect(r.spare_copies).toBe(1)
    expect(r.real_copies_owned).toBe(2)
    expect(r.in_other_decks[0].deck_name).toBe('Korvold') // still shown
  })

  it('In another deck: names the deck and gives the plain warning', async () => {
    const r = (await run(world(), ['Eternal Witness'], 300)).results[0]
    expect(r.status).toBe('IN_ANOTHER_DECK')
    expect(r.in_other_decks).toEqual([
      { deck_id: 100, deck_name: 'Korvold', copies: 1, warning: 'Using it here leaves Korvold short by one.' },
    ])
  })

  it('a planned slot (no copy) never counts as the copy being in that deck', async () => {
    const r = (await run(world(), ['Eternal Witness'], 300)).results[0]
    expect(r.in_other_decks.map(d => d.deck_name)).not.toContain('Rocco')
    // Sol Ring: Rocco plans it, but the spare copy is still spare
    const s = (await run(world(), ['Sol Ring'])).results[0]
    expect(s.in_other_decks.map(d => d.deck_name)).toEqual(['Korvold'])
    expect(s.spare_copies).toBe(1)
  })

  it('a copy sleeved in the viewed deck is neither spare nor "another deck"', async () => {
    const r = (await run(world(), ['Eternal Witness'], 100)).results[0]
    expect(r.status).toBe('ALREADY_IN_THIS_DECK')
    expect(r.in_this_deck).toBe(1)
    expect(r.in_other_decks).toEqual([])
  })

  it('proxies never count as owned: proxy-only card is UNOWNED', async () => {
    const r = (await run(world(), ['Rhystic Study'], null)).results[0]
    expect(r.status).toBe('UNOWNED')
    expect(r.real_copies_owned).toBe(0)
    expect(r.price?.usd).toBe(30)
    expect(r.price?.label).toMatch(/estimate/i)
  })

  it('unowned with unknown or zero price gives an explicit "no price", never 0', async () => {
    const t = world()
    t.user_cards = []
    const out = await run(t, ['Cheap Unknown', 'Zero Price'], null)
    for (const r of out.results) {
      expect(r.status).toBe('UNOWNED')
      expect(r.price).toEqual({ usd: null, label: 'No price available' })
    }
  })

  it('estimate uses the cheapest known printing and skips digital', () => {
    expect(estimatePrice([{ price_usd: 4 }, { price_usd: 1.5 }, { price_usd: 0.1, digital: true }]).usd).toBe(1.5)
    expect(estimatePrice([]).usd).toBeNull()
  })

  it('marks old price data as possibly out of date', async () => {
    const t = world()
    t.user_cards = []
    t.ref_printings = [P('Rhystic Study', 'o-rs', ['U'], 30, { updated_at: '2020-01-01T00:00:00Z' })]
    const r = (await run(t, ['Rhystic Study'], null)).results[0]
    expect(r.price?.label).toMatch(/out of date/)
  })

  it('matches by oracle identity across printings and is scoped to the user', async () => {
    const r = (await run(world(), ['Lightning Bolt'], null)).results[0]
    expect(r.status).toBe('UNOWNED') // the copy belongs to another user
    expect(r.real_copies_owned).toBe(0)
  })

  it('respects the commander colour identity when known', async () => {
    const out = await run(world(), ['Rhystic Study', 'Eternal Witness'], 300) // commander BGR
    expect(out.commander_colour_identity).toEqual(['B', 'G', 'R'])
    expect(out.results[0].status).toBe('OUTSIDE_COLOUR_IDENTITY')
    expect(out.results[1].status).toBe('IN_ANOTHER_DECK')
  })

  it('says colours were not checked when the commander is unknown', async () => {
    const out = await run(world(), ['Rhystic Study'], null)
    expect(out.commander_colour_identity).toBeNull()
    expect(out.colour_check).toMatch(/NOT checked/)
    expect(out.results[0].status).not.toBe('OUTSIDE_COLOUR_IDENTITY')
  })

  it('unknown names are flagged, not guessed', async () => {
    const out = await run(world(), ['Not A Card'], null)
    expect(out.results[0].status).toBe('UNKNOWN_CARD')
  })

  it('finds a double-faced card by its front face', async () => {
    const t = world()
    t.user_cards = []
    const r = (await run(t, ['Fire'], null)).results[0]
    expect(r.status).toBe('UNOWNED')
    expect(r.card_name).toBe('Fire // Ice')
  })

  it('a copy referenced by two slots is still not spare', async () => {
    const t = world()
    t.deck_cards.push({ id: 7, deck_id: 200, card_name: 'Eternal Witness', copy_id: 20, is_commander: false })
    const r = (await run(t, ['Eternal Witness'], 300)).results[0]
    expect(r.status).toBe('IN_ANOTHER_DECK')
    expect(r.in_other_decks.map(d => d.deck_name).sort()).toEqual(['Korvold', 'Rocco'])
  })

  it('only issues select queries (read-only)', async () => {
    const { client, calls } = mockClient(world())
    await lookupOwnedCopies(client, { userId: 'u1', deckId: 300, cardNames: ['Sol Ring', 'Rhystic Study'] })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every(c => c.endsWith('.select'))).toBe(true)
  })

  it('fails loudly (not with zeros) when a read fails', async () => {
    const bad: LookupClient = { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: null, error: { message: 'x' } }) }) }) }
    await expect(lookupOwnedCopies(bad, { userId: 'u1', cardNames: ['Sol Ring'] })).rejects.toThrow()
  })
})

describe('check_owned_copies wiring', () => {
  it('is offered in the deck chat only, and edit tools stay gated off', () => {
    const chat = getToolDefinitionsForContext(DECK_CHAT_CONTEXT, { deckChatEditEnabled: false }).map(t => t.name)
    expect(chat).toContain('check_owned_copies')
    expect(chat).not.toContain('add_cards_to_deck')
    expect(getToolDefinitionsForContext('exploration').map(t => t.name)).not.toContain('check_owned_copies')
    expect(getToolDefinitions().map(t => t.name)).not.toContain('check_owned_copies')
  })

  it('prompt tells the chat the order, the warning, estimates and suggest-only', () => {
    const p = buildDeckChatPrompt('D', 'C', 'commander', 100, [], '', { editToolsEnabled: false })
    expect(p).toContain('check_owned_copies')
    expect(p.indexOf('1. Spare')).toBeLessThan(p.indexOf('2. In another deck'))
    expect(p.indexOf('2. In another deck')).toBeLessThan(p.indexOf('3. Buy'))
    expect(p).toMatch(/never hide or soften/i)
    expect(p).toMatch(/estimate/)
    expect(p).toMatch(/Suggest only/)
  })
})
