import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => { throw new Error('no real DB in tests') }) }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { loadDeckGap } from './deck-health-gap'
import { formatPrice, toPrice, MAX_BUY_IDEAS } from './deck-health-buy'
import type { HealthClient } from './deck-health-server'
import { guideTargets, type CommanderTargets } from './commander-targets'
import type { Role } from './card-roles'

// In-memory fake database with made-up cards. Never the live one.
type Row = Record<string, unknown>

function fakeDb(tables: Record<string, Row[]>, failTable?: string): HealthClient {
  return {
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      const result = () => (table === failTable ? { data: null, error: { message: 'boom' } } : { data, error: null })
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, v: unknown) => { data = data.filter((r) => r[col] === v); return q },
        in: (col: string, vs: unknown[]) => { data = data.filter((r) => vs.includes(r[col])); return q },
        ilike: (col: string, pattern: string) => {
          const lower = pattern.toLowerCase()
          const needle = lower.replace(/^%|%$/g, '')
          data = data.filter((r) => (lower.startsWith('%') ? String(r[col]).toLowerCase().includes(needle) : String(r[col]).toLowerCase().startsWith(needle)))
          return q
        },
        or: () => q,
        order: () => q,
        limit: (n: number) => { data = data.slice(0, n); return Promise.resolve(result()) },
        range: (a: number, b: number) => { data = data.slice(a, b + 1); return Promise.resolve(result()) },
        maybeSingle: () => { const r = result(); return Promise.resolve(r.error ? r : { data: data[0] ?? null, error: null }) },
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      }
      return q
    },
  }
}

const ref = (name: string, type: string, text = '', ci = 'R') => ({ name, type_line: type, oracle_text: text, color_identity: ci, mana_value: 2, edhrec_rank: 100 })
const printing = (name: string, oracle: string, ci: string[], price: number | null, extra: Row = {}) => ({
  name,
  oracle_id: oracle,
  color_identity: ci,
  price_usd: price,
  digital: false,
  updated_at: new Date().toISOString(),
  scryfall_id: `sf-${oracle}`,
  ...extra,
})

function world(commanderColours: string[] | null = ['R']): Record<string, Row[]> {
  const draw = 'Draw two cards.'
  return {
    decks: [
      { id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: '', commander_name: 'Mendicant Core' },
      { id: 2, user_id: 'u1', name: 'Korvold', colour_identity: 'BGR' },
    ],
    deck_cards: [
      { id: 1, deck_id: 1, card_name: 'Mendicant Core', quantity: 1, is_commander: true, copy_id: null, categories: null, command_zone_role: null },
      { id: 2, deck_id: 1, card_name: 'In Deck Draw', quantity: 1, is_commander: false, copy_id: null, categories: null, command_zone_role: null },
      { id: 3, deck_id: 1, card_name: 'Maybe Buy Draw', quantity: 1, is_commander: false, copy_id: null, categories: 'Maybeboard', command_zone_role: null },
      { id: 4, deck_id: 2, card_name: 'Held Draw', quantity: 1, is_commander: false, copy_id: 21, categories: null, command_zone_role: null },
    ],
    ref_printings: [
      ...(commanderColours ? [printing('Mendicant Core', 'oc', commanderColours, 1)] : []),
      printing('Pricey Draw', 'p1', ['R'], 38),
      printing('Pricey Draw', 'p1', ['R'], 52, { scryfall_id: 'sf-p1-other' }),
      printing('Unpriced Draw', 'p2', ['R'], null),
      printing('Zero Draw', 'p3', ['R'], 0),
      printing('Spare Draw', 'p4', ['R'], 3),
      printing('Held Draw', 'p5', ['R'], 3),
      printing('Green Draw', 'p6', ['G'], 3),
      printing('In Deck Draw', 'p7', ['R'], 3),
      printing('Maybe Buy Draw', 'p8', ['R'], 2),
      printing('Ramp Rock', 'p9', [], 1),
      printing('Proxy Only Draw', 'p10', ['R'], 5),
    ],
    user_cards: [
      { id: 10, user_id: 'u1', card_name: 'Spare Draw', oracle_id: 'p4' },
      { id: 11, user_id: 'u1', card_name: 'Held Draw', oracle_id: 'p5' },
      { id: 15, user_id: 'u1', card_name: 'Proxy Only Draw', oracle_id: 'p10' },
    ],
    user_copies: [
      { id: 20, user_id: 'u1', card_id: 10, is_proxy: false },
      { id: 21, user_id: 'u1', card_id: 11, is_proxy: false },
      { id: 25, user_id: 'u1', card_id: 15, is_proxy: true },
    ],
    ref_cards: [
      ref('Mendicant Core', 'Legendary Artifact Creature'),
      ref('In Deck Draw', 'Sorcery', draw),
      ref('Maybe Buy Draw', 'Sorcery', draw),
      ref('Held Draw', 'Sorcery', draw),
      ref('Spare Draw', 'Sorcery', draw),
      ref('Pricey Draw', 'Sorcery', 'Draw three cards.'),
      ref('Unpriced Draw', 'Sorcery', draw),
      ref('Zero Draw', 'Sorcery', draw),
      ref('Green Draw', 'Sorcery', draw, 'G'),
      ref('Proxy Only Draw', 'Sorcery', draw),
      ref('Ramp Rock', 'Artifact', '{T}: Add {C}.'),
    ],
  }
}

const card = (name: string, roles: Role[], inclusion: number | null) => ({ name, roles, inclusion })

function okTargets(cards: Array<ReturnType<typeof card>>): CommanderTargets {
  return {
    ...guideTargets('x'),
    status: 'ok',
    source: 'edhrec_estimate',
    sourceLabel: 'EDHREC estimate, 5,000 decks',
    roles: (['ramp', 'draw', 'removal', 'wipes'] as const).map((role) => ({ role, typical: 8, cardsInRole: 8 })),
    landsTypical: 36,
    cards,
  }
}

const SAVED = [
  card('Spare Draw', ['draw'], 0.9),
  card('Held Draw', ['draw'], 0.85),
  card('Green Draw', ['draw'], 0.8),
  card('In Deck Draw', ['draw'], 0.75),
  card('Pricey Draw', ['draw'], 0.71),
  card('Ramp Rock', ['ramp'], 0.7),
  card('Unpriced Draw', ['draw'], 0.4),
  card('Zero Draw', ['draw'], 0.3),
  card('Proxy Only Draw', ['draw'], 0.2),
  card('Maybe Buy Draw', ['draw'], 0.1),
]

const run = (tables: Record<string, Row[]>, targets: CommanderTargets, role: 'draw' | 'ramp' | 'lands' = 'draw', failTable?: string) =>
  loadDeckGap(fakeDb(tables, failTable), 1, 'u1', role, { targets: async () => targets })

describe('price printing', () => {
  it('known price reads "$38.00 est."; unknown reads "Price unknown", never $0', () => {
    expect(formatPrice(toPrice(38))).toBe('$38.00 est.')
    expect(formatPrice(toPrice(4.5))).toBe('$4.50 est.')
    for (const bad of [null, undefined, 0, -1, NaN, '3']) {
      expect(toPrice(bad)).toEqual({ usd: null, state: 'unknown' })
      expect(formatPrice(toPrice(bad))).toBe('Price unknown')
    }
    expect(formatPrice({ usd: 0, state: 'known' })).toBe('Price unknown')
  })
})

describe('buy ideas', () => {
  it('excludes owned, off-colour, in-deck and other-role cards; keeps unowned on-colour ones, most popular first', async () => {
    const r = await run(world(), okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    const names = r.gap.buyIdeas.map((b) => b.name)
    // Proxy-only copies do not count as owned; a maybeboard card is not in the deck.
    expect(names).toEqual(['Pricey Draw', 'Unpriced Draw', 'Zero Draw', 'Proxy Only Draw', 'Maybe Buy Draw'])
    for (const n of ['Spare Draw', 'Held Draw', 'Green Draw', 'In Deck Draw', 'Ramp Rock', 'Mendicant Core']) expect(names).not.toContain(n)
    expect(r.gap.buyUnavailableReason).toBeNull()
  })

  it('prices: cheapest printing, "est." suffix; no price or a zero price is "Price unknown", never $0', async () => {
    const r = await run(world(), okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    const by = Object.fromEntries(r.gap.buyIdeas.map((b) => [b.name, b]))
    expect(by['Pricey Draw'].price).toEqual({ usd: 38, state: 'known' })
    expect(formatPrice(by['Pricey Draw'].price)).toBe('$38.00 est.')
    expect(by['Unpriced Draw'].price).toEqual({ usd: null, state: 'unknown' })
    expect(by['Zero Draw'].price).toEqual({ usd: null, state: 'unknown' })
    expect(JSON.stringify(r.gap.buyIdeas)).not.toContain('"usd":0')
    for (const b of r.gap.buyIdeas) expect(formatPrice(b.price)).not.toMatch(/\$0(\.00)?\b/)
  })

  it('carries popularity, a thumbnail printing and the short detail line', async () => {
    const r = await run(world(), okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    const p = r.gap.buyIdeas[0]
    expect(p.inclusionPct).toBe(71)
    expect(p.printingId).toBe('sf-p1')
    expect(p.detailLine).toMatch(/draws/i)
    expect(p.typeLine).toBe('Sorcery')
  })

  it('average-deck cards without a share keep their listed order and show no percentage', async () => {
    const r = await run(world(), okTargets([card('Unpriced Draw', ['draw'], null), card('Pricey Draw', ['draw'], null)]))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.buyIdeas.map((b) => [b.name, b.inclusionPct])).toEqual([['Unpriced Draw', null], ['Pricey Draw', null]])
  })

  it('shows at most 8', async () => {
    const t = world()
    const many = Array.from({ length: 12 }, (_, i) => `Extra Draw ${i}`)
    t.ref_printings.push(...many.map((n, i) => printing(n, `x${i}`, ['R'], 1 + i)))
    t.ref_cards.push(...many.map((n) => ref(n, 'Sorcery', 'Draw two cards.')))
    const r = await run(t, okTargets(many.map((n, i) => card(n, ['draw'], 0.9 - i / 100))))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.buyIdeas).toHaveLength(MAX_BUY_IDEAS)
    expect(r.gap.buyIdeas[0].name).toBe('Extra Draw 0')
  })

  it('default open only when nothing owned fits; collapsed (closed) when a spare or other-deck card exists', async () => {
    const withOwned = await run(world(), okTargets(SAVED))
    if (!withOwned.ok) throw new Error('expected ok')
    expect(withOwned.gap.spare.length + withOwned.gap.inAnotherDeck.length).toBeGreaterThan(0)
    expect(withOwned.gap.nothingOwnedFits).toBe(false)
    expect(withOwned.gap.buyDefaultOpen).toBe(false)

    const t = world()
    t.user_copies = []
    const none = await run(t, okTargets(SAVED))
    if (!none.ok) throw new Error('expected ok')
    expect(none.gap.spare).toHaveLength(0)
    expect(none.gap.inAnotherDeck).toHaveLength(0)
    expect(none.gap.nothingOwnedFits).toBe(true)
    expect(none.gap.buyDefaultOpen).toBe(true)
    expect(none.gap.buyIdeas.length).toBeGreaterThan(0)
  })

  it('only another-deck cards owned: still collapsed', async () => {
    const t = world()
    t.user_cards = t.user_cards.filter((c) => c.oracle_id !== 'p4')
    t.user_copies = t.user_copies.filter((c) => c.card_id !== 10)
    const r = await run(t, okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.spare).toHaveLength(0)
    expect(r.gap.inAnotherDeck).toHaveLength(1)
    expect(r.gap.buyDefaultOpen).toBe(false)
  })

  it('thin data gives none, with the reason; not-found too; nothing is guessed from a saved list', async () => {
    for (const status of ['thin', 'not_found'] as const) {
      const r = await run(world(), { ...okTargets(SAVED), status })
      if (!r.ok) throw new Error('expected ok')
      expect(r.gap.buyIdeas).toEqual([])
      expect(r.gap.buyUnavailableReason).toBe('thin_data')
    }
    const guide = await run(world(), guideTargets('General guide'))
    if (!guide.ok) throw new Error('expected ok')
    expect(guide.gap.buyIdeas).toEqual([])
    expect(guide.gap.buyUnavailableReason).toBe('thin_data')
  })

  it('unknown commander colours give none, with the reason (the colour filter is never skipped)', async () => {
    const r = await run(world(null), okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.coloursKnown).toBe(false)
    expect(r.gap.buyIdeas).toEqual([])
    expect(r.gap.buyUnavailableReason).toBe('colours_unknown')
  })

  it('colourless commander: only colourless cards pass', async () => {
    const r = await run(world([]), okTargets(SAVED))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.buyIdeas).toEqual([]) // every saved draw card here has a colour
    const t = world([])
    t.ref_printings.push(printing('Colourless Draw', 'c1', [], 2))
    t.ref_cards.push(ref('Colourless Draw', 'Artifact', 'Draw a card.'))
    const r2 = await run(t, okTargets([card('Colourless Draw', ['draw'], 0.5), card('Pricey Draw', ['draw'], 0.4)]))
    if (!r2.ok) throw new Error('expected ok')
    expect(r2.gap.buyIdeas.map((b) => b.name)).toEqual(['Colourless Draw'])
  })

  it('lands have no buy ideas (the saved list holds non-land cards only)', async () => {
    const r = await run(world(), okTargets(SAVED), 'lands')
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.buyIdeas).toEqual([])
    expect(r.gap.buyUnavailableReason).toBeNull()
  })

  it('uses the saved list only: no EDHREC request is made', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    try {
      await run(world(), okTargets(SAVED))
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('asks the owned-copies lookup for 60 names at most', async () => {
    const t = world()
    const many = Array.from({ length: 90 }, (_, i) => `Bulk Draw ${i}`)
    t.ref_printings.push(...many.map((n, i) => printing(n, `b${i}`, ['R'], 1)))
    t.ref_cards.push(...many.map((n) => ref(n, 'Sorcery', 'Draw two cards.')))
    const r = await run(t, okTargets(many.map((n) => card(n, ['draw'], 0.5))))
    if (!r.ok) throw new Error('expected ok')
    expect(r.gap.buyIdeas).toHaveLength(MAX_BUY_IDEAS)
  })

  it('a failed buy lookup does not hide the owned cards: it says it could not check', async () => {
    const t = world()
    const db = fakeDb(t)
    let armed = false // set once the typical numbers are read, which is just before the buy step starts
    const flaky: HealthClient = {
      from: (table: string) => {
        if (table === 'user_cards' && armed) throw new Error('boom')
        return db.from(table)
      },
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const r = await loadDeckGap(flaky, 1, 'u1', 'draw', { targets: async () => { armed = true; return okTargets(SAVED) } })
      if (!r.ok) throw new Error('expected ok')
      expect(r.gap.spare.length).toBeGreaterThan(0)
      expect(r.gap.buyIdeas).toEqual([])
      expect(r.gap.buyUnavailableReason).toBe('lookup_failed')
    } finally {
      spy.mockRestore()
    }
  })
})
