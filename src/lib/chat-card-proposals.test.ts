import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fixtures only. Never the owner's live data.
type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  commanders: { names: ['Korvold'], identity: 'BRG' as string | null },
  owned: new Map<string, unknown>(),
  ownedThrows: false,
}))

vi.mock('./deck-colour-identity', () => ({
  loadDeckCommanders: vi.fn(async () => state.commanders),
}))
vi.mock('./owned-copy-lookup', () => ({
  MAX_LOOKUP_NAMES: 60,
  lookupOwnedCopies: vi.fn(async (_c: unknown, args: { cardNames: string[] }) => {
    if (state.ownedThrows) throw new Error('boom')
    return { results: args.cardNames.map((n) => state.owned.get(n) ?? { requested_name: n, status: 'UNOWNED', in_other_decks: [] }) }
  }),
}))
vi.mock('./supabase', () => ({ createAdminClient: vi.fn() }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { decideCard, loadCardFacts, loadDeckFacts, type CardFacts, type DeckFacts } from './chat-proposal-check'
import { proposeDeckCards, sanitiseCategory } from './chat-card-proposals'
import {
  DECK_BUILDING_TOOLS,
  DECK_CHAT_CONTEXT,
  executeTool,
  getToolDefinitionsForContext,
  isToolAllowedInContext,
} from './tool-registry'
import { createAdminClient } from './supabase'

/** In-memory fake database. Records inserts so a test can see exactly what was written. */
function fakeDb(tables: Record<string, Row[]>, opts: { insertError?: boolean; countError?: boolean } = {}) {
  const inserted: Row[] = []
  const writes: string[] = []
  const db = {
    inserted,
    writes,
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      let countMode = false
      const done = () => ({ data, error: null })
      const q: Record<string, unknown> = {
        select: (_cols?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) countMode = true; return q },
        eq: (c: string, v: unknown) => { data = data.filter((r) => r[c] === v); return q },
        gt: () => q,
        in: (c: string, vs: unknown[]) => { data = data.filter((r) => vs.includes(r[c])); return q },
        ilike: (c: string, pattern: string) => {
          const prefix = pattern.replace('%', '').toLowerCase()
          data = data.filter((r) => String(r[c]).toLowerCase().startsWith(prefix))
          return q
        },
        limit: () => q,
        insert: (rows: Row[]) => {
          writes.push(`insert:${table}`)
          if (opts.insertError) return Promise.resolve({ data: null, error: { message: 'relation does not exist' } })
          inserted.push(...rows)
          tables[table] = [...(tables[table] ?? []), ...rows]
          return Promise.resolve({ data: null, error: null })
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (countMode) return resolve({ count: opts.countError ? null : data.length, error: opts.countError ? { message: 'x' } : null, data: null })
          return resolve(done())
        },
      }
      return q
    },
  }
  return db
}

const U = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function baseTables(): Record<string, Row[]> {
  return {
    decks: [{ id: 7, name: 'Korvold', user_id: U }],
    deck_cards: [
      { deck_id: 7, user_id: U, card_name: 'Sol Ring', categories: '["Ramp"]', quantity: 1 },
      { deck_id: 7, user_id: U, card_name: 'Swords to Plowshares', categories: '["Maybeboard"]', quantity: 1 },
    ],
    ref_cards: [
      { name: 'Sol Ring', color_identity: '', commander_legal: true },
      { name: 'Swords to Plowshares', color_identity: 'W', commander_legal: true },
      { name: 'Birds of Paradise', color_identity: 'G', commander_legal: true },
      { name: 'Forest', color_identity: '', commander_legal: true },
      { name: 'Black Lotus', color_identity: '', commander_legal: false },
      { name: 'Cultivate', color_identity: 'G', commander_legal: true },
      { name: 'Wear // Tear', color_identity: 'R, W', commander_legal: true },
    ],
    ref_printings: [
      { name: 'Sol Ring', oracle_id: 'o-sol' },
      { name: 'Swords to Plowshares', oracle_id: 'o-stp' },
      { name: 'Birds of Paradise', oracle_id: 'o-bop' },
      { name: 'Forest', oracle_id: 'o-forest' },
      { name: 'Black Lotus', oracle_id: 'o-lotus' },
      { name: 'Cultivate', oracle_id: 'o-cult' },
      { name: 'Wear // Tear', oracle_id: 'o-wear' },
    ],
    chat_card_proposals: [],
  }
}

beforeEach(() => {
  state.commanders = { names: ['Korvold'], identity: 'BRG' }
  state.owned = new Map()
  state.ownedThrows = false
})

const propose = (db: ReturnType<typeof fakeDb>, names: string[], userId = U) =>
  proposeDeckCards(db, { userId, deckId: 7, cards: names.map((name) => ({ name })) })

describe('decideCard: every row of the blocked table', () => {
  const deck: DeckFacts = { deckName: 'Korvold', deckColours: 'BRG', mainKeys: new Set(['sol ring']), maybeKeys: new Set(['swords to plowshares']), mainCount: 50 }
  const card = (over: Partial<CardFacts> = {}): CardFacts => ({ name: 'Cultivate', oracleId: 'o', colours: ['G'], commanderLegal: true, ...over })

  it('ready card', () => expect(decideCard('Cultivate', card(), deck).state).toBe('ready'))
  it('unknown name', () => {
    const r = decideCard('Sol Rong', null, deck)
    expect(r.blockReason).toBe('not_found')
    expect(r.blockText).toBe("I couldn't confirm a card called Sol Rong, so I can't add it.")
  })
  it('already in the main deck', () => {
    const r = decideCard('Sol Ring', card({ name: 'Sol Ring', colours: [] }), deck)
    expect(r.blockReason).toBe('in_deck')
    expect(r.blockText).toBe('Already in Korvold.')
  })
  it('already in the maybeboard', () => {
    const r = decideCard('x', card({ name: 'Swords to Plowshares', colours: [] }), deck)
    expect(r.blockReason).toBe('in_maybeboard')
    expect(r.blockText).toBe('Already in your Maybeboard. Move it from the deck page.')
  })
  it('basic lands are exempt from the singleton rule', () => {
    const d = { ...deck, mainKeys: new Set(['forest']) }
    expect(decideCard('Forest', card({ name: 'Forest', colours: [] }), d).state).toBe('ready')
  })
  it('outside the commander colours', () => {
    const r = decideCard('x', card({ name: 'Swords to Plowshares', colours: ['W'] }), { ...deck, maybeKeys: new Set() })
    expect(r.blockReason).toBe('outside_colours')
    expect(r.blockText).toBe("Swords to Plowshares is outside Korvold's colours (B, R, G), so it can't go in this deck.")
  })
  it('deck colours unknown fails closed', () => {
    const r = decideCard('Cultivate', card(), { ...deck, deckColours: null })
    expect(r.blockReason).toBe('colours_unknown')
    expect(r.blockText).toBe("I can't tell this deck's colours yet, so I won't add cards. Set a commander first.")
  })
  it('a colourless deck only accepts colourless cards', () => {
    expect(decideCard('x', card(), { ...deck, deckColours: '' }).blockReason).toBe('outside_colours')
    expect(decideCard('x', card({ colours: [] }), { ...deck, deckColours: '' }).state).toBe('ready')
  })
  it('not legal in Commander', () => {
    const r = decideCard('x', card({ name: 'Black Lotus', colours: [], commanderLegal: false }), deck)
    expect(r.blockReason).toBe('not_legal')
    expect(r.blockText).toBe("Black Lotus isn't legal in Commander.")
  })
})

describe('loading facts', () => {
  it('matches the exact name and finds the canonical card id; the front face of a two-sided card works', async () => {
    const facts = await loadCardFacts(fakeDb(baseTables()), ['Cultivate', 'Wear', 'Sol Rong'])
    expect(facts.get('Cultivate')?.oracleId).toBe('o-cult')
    expect(facts.get('Wear')?.name).toBe('Wear // Tear')
    expect(facts.get('Wear')?.colours).toEqual(['W', 'R'])
    expect(facts.has('Sol Rong')).toBe(false)
  })
  it("a card with no canonical id is treated as not found", async () => {
    const t = baseTables()
    t.ref_printings = []
    expect((await loadCardFacts(fakeDb(t), ['Cultivate'])).size).toBe(0)
  })
  it("wrong user's deck returns nothing (same as not found)", async () => {
    expect(await loadDeckFacts(fakeDb(baseTables()), 7, OTHER)).toBeNull()
    expect(await loadDeckFacts(fakeDb(baseTables()), 99, U)).toBeNull()
  })
  it('separates main list from maybeboard', async () => {
    const d = await loadDeckFacts(fakeDb(baseTables()), 7, U)
    expect(d?.mainKeys.has('sol ring')).toBe(true)
    expect(d?.maybeKeys.has('swords to plowshares')).toBe(true)
    expect(d?.mainCount).toBe(1)
  })
})

describe('propose_deck_cards', () => {
  it('records a pending row per ready card and a blocked row per blocked card, and sends the page the ids', async () => {
    const db = fakeDb(baseTables())
    const r = await propose(db, ['Cultivate', 'Sol Ring', 'Nope Card'])
    expect(r.is_error).toBe(false)
    expect(db.inserted.map((x) => x.status)).toEqual(['pending', 'blocked', 'blocked'])
    expect(db.inserted[0]).toMatchObject({ user_id: U, deck_id: 7, oracle_id: 'o-cult', card_name: 'Cultivate' })
    expect(r.event?.type).toBe('add_proposals')
    expect(r.event?.deckName).toBe('Korvold')
    expect(r.event?.proposals.map((p) => p.state)).toEqual(['ready', 'blocked', 'blocked'])
    // 24 hours
    const exp = new Date(String(db.inserted[0].expires_at)).getTime() - Date.now()
    expect(exp).toBeGreaterThan(23.9 * 3600_000)
    expect(exp).toBeLessThan(24.1 * 3600_000)
  })

  it('what the model reads never contains an id or token', async () => {
    const db = fakeDb(baseTables())
    const r = await propose(db, ['Cultivate', 'Sol Ring'])
    const ids = [...db.inserted.map((x) => String(x.id)), ...(r.event?.proposals.map((p) => p.proposalId) ?? [])]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(r.content).not.toContain(id)
    expect(r.content).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    expect(r.content).not.toMatch(/proposalId|o-cult|o-sol/)
    expect(JSON.parse(r.content).results).toEqual([
      { card: 'Cultivate', outcome: 'ready', ownership: "You don't own this. Adding it makes a planned slot here." },
      { card: 'Sol Ring', outcome: 'blocked', why: 'Already in Korvold.' },
    ])
  })

  it('writes nothing to the deck itself', async () => {
    const db = fakeDb(baseTables())
    await propose(db, ['Cultivate'])
    expect(db.writes).toEqual(['insert:chat_card_proposals'])
  })

  it('ownership lines: spare, in another deck, not owned', async () => {
    state.owned.set('Cultivate', { requested_name: 'Cultivate', status: 'SPARE', in_other_decks: [] })
    state.owned.set('Birds of Paradise', { requested_name: 'Birds of Paradise', status: 'IN_ANOTHER_DECK', in_other_decks: [{ deck_name: 'Prosper' }] })
    const r = await propose(fakeDb(baseTables()), ['Cultivate', 'Birds of Paradise'])
    const lines = r.event?.proposals.map((p) => p.ownershipLine)
    expect(lines?.[0]).toBe('You own it, spare.')
    expect(lines?.[1]).toBe("You own it, it's in Prosper. Adding it makes a planned slot here and leaves the card in Prosper.")
  })

  it('still proposes when the ownership lookup fails', async () => {
    state.ownedThrows = true
    const r = await propose(fakeDb(baseTables()), ['Cultivate'])
    expect(r.event?.proposals[0].state).toBe('ready')
    expect(r.event?.proposals[0].ownershipLine).toBeUndefined()
  })

  it("another owner's deck: nothing is proposed or recorded", async () => {
    const db = fakeDb(baseTables())
    const r = await propose(db, ['Cultivate'], OTHER)
    expect(r.is_error).toBe(true)
    expect(r.event).toBeUndefined()
    expect(db.inserted).toHaveLength(0)
  })

  it('unknown deck colours: every card is blocked', async () => {
    state.commanders = { names: [], identity: null }
    const r = await propose(fakeDb(baseTables()), ['Cultivate'])
    expect(r.event?.proposals[0].blockReason).toBe('colours_unknown')
  })

  it('per-call cap of 10 with a note to the model', async () => {
    const t = baseTables()
    const names = Array.from({ length: 12 }, (_, i) => `Card ${i}`)
    for (const n of names) {
      t.ref_cards.push({ name: n, color_identity: 'G', commander_legal: true })
      t.ref_printings.push({ name: n, oracle_id: `o-${n}` })
    }
    const r = await propose(fakeDb(t), names)
    expect(r.event?.proposals).toHaveLength(10)
    expect(r.content).toMatch(/Only the first 10/)
  })

  it('pending cap of 30 per deck: extras are dropped, and a full deck refuses', async () => {
    const t = baseTables()
    t.chat_card_proposals = Array.from({ length: 29 }, (_, i) => ({ id: `p${i}`, user_id: U, deck_id: 7, status: 'pending' }))
    const r = await propose(fakeDb(t), ['Cultivate', 'Birds of Paradise'])
    expect(r.event?.proposals.filter((p) => p.state === 'ready')).toHaveLength(1)
    expect(r.content).toMatch(/Only 1 more/)
    t.chat_card_proposals = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, user_id: U, deck_id: 7, status: 'pending' }))
    const full = await propose(fakeDb(t), ['Cultivate'])
    expect(full.is_error).toBe(true)
  })

  it('if proposals cannot be recorded, the model is told to suggest in words and no event is sent', async () => {
    const r = await propose(fakeDb(baseTables(), { insertError: true }), ['Cultivate'])
    expect(r.is_error).toBe(true)
    expect(r.event).toBeUndefined()
    expect(r.content).toMatch(/words only/)
  })

  it('a repeated name is proposed once', async () => {
    const r = await propose(fakeDb(baseTables()), ['Cultivate', 'cultivate'])
    expect(r.event?.proposals).toHaveLength(1)
  })

  it('model categories: Maybeboard and over-long names are ignored', () => {
    expect(sanitiseCategory('Ramp')).toBe('Ramp')
    expect(sanitiseCategory('maybeboard')).toBeUndefined()
    expect(sanitiseCategory('x'.repeat(40))).toBeUndefined()
    expect(sanitiseCategory(5)).toBeUndefined()
  })
})

describe('tool registration and gating', () => {
  it('is offered in deck chat only', () => {
    const names = (ctx?: string) => getToolDefinitionsForContext(ctx).map((t) => t.name)
    expect(names(DECK_CHAT_CONTEXT)).toContain('propose_deck_cards')
    for (const ctx of ['deck-list', 'forge', 'exploration', 'general', 'collection', 'deck', undefined]) {
      expect(names(ctx)).not.toContain('propose_deck_cards')
    }
    expect(isToolAllowedInContext('propose_deck_cards', 'deck')).toBe(false)
  })

  it('the old editing tools stay hidden in deck chat with the setting off, and no tool can write a deck', () => {
    const names = getToolDefinitionsForContext(DECK_CHAT_CONTEXT, { deckChatEditEnabled: false }).map((t) => t.name)
    for (const t of DECK_BUILDING_TOOLS) expect(names).not.toContain(t)
    // No offered tool name looks like a confirm or write path.
    expect(names.filter((n) => /confirm|undo|apply/.test(n))).toEqual([])
    expect(names.filter((n) => /add_cards|remove_cards|update_deck/.test(n))).toEqual([])
  })

  it('without a deck open the tool refuses and tells the model what to say', async () => {
    const r = await executeTool('propose_deck_cards', { cards: [{ name: 'Cultivate' }] }, { userId: U })
    expect(r.is_error).toBe(true)
    expect(r.content).toContain('Open a deck and I can add cards to it.')
    expect(r.events).toBeUndefined()
  })

  it('through the registry: result carries the page event separately from the model text', async () => {
    const db = fakeDb(baseTables())
    vi.mocked(createAdminClient).mockReturnValue(db as never)
    const r = await executeTool('propose_deck_cards', { cards: [{ name: 'Cultivate', reason: 'Ramp' }] }, { userId: U, deckId: 7 })
    expect(r.is_error).toBe(false)
    expect(r.events?.[0].type).toBe('add_proposals')
    const id = r.events?.[0].proposals?.[0].proposalId as string
    expect(id).toBeTruthy()
    expect(r.content).not.toContain(id)
  })
})
