import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ createAdminClient: vi.fn(() => { throw new Error('no real DB in tests') }) }))
vi.mock('./mcp-client', () => ({ getMcpClient: vi.fn() }))

import { loadDeckGap, parseGapRole } from './deck-health-gap'
import { loadDeckHealth, type HealthClient } from './deck-health-server'
import { cardsInRole, classifyDeckCard, type HealthDeckCard } from './deck-health'
import { guideTargets } from './commander-targets'

// In-memory fake database. Never the live one.
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
        or: () => q, // pre-filter only narrows; the app-side role check still decides
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

const ref = (name: string, ci: string, type: string, text = '') => ({ name, color_identity: ci, type_line: type, oracle_text: text, mana_value: 2, edhrec_rank: 100 })

function world(): Record<string, Row[]> {
  return {
    decks: [
      { id: 1, user_id: 'u1', name: 'Mendicant', colour_identity: '', commander_name: 'Mendicant Core' },
      { id: 2, user_id: 'u1', name: 'Korvold', colour_identity: 'BGR' },
      { id: 3, user_id: 'u2', name: 'Their deck', colour_identity: 'R' },
    ],
    deck_cards: [
      { id: 1, deck_id: 1, card_name: 'Mendicant Core', quantity: 1, is_commander: true, copy_id: null, categories: null, command_zone_role: null },
      { id: 2, deck_id: 1, card_name: 'In Deck Draw', quantity: 1, is_commander: false, copy_id: null, categories: null, command_zone_role: null },
      { id: 3, deck_id: 1, card_name: 'In Deck Draw Two', quantity: 1, is_commander: false, copy_id: null, categories: null, command_zone_role: null },
      { id: 4, deck_id: 1, card_name: 'Command Tower', quantity: 1, is_commander: false, copy_id: null, categories: null, command_zone_role: null },
      { id: 5, deck_id: 1, card_name: 'Mountain', quantity: 20, is_commander: false, copy_id: null, categories: null, command_zone_role: null },
      { id: 6, deck_id: 1, card_name: 'Maybe Draw', quantity: 1, is_commander: false, copy_id: null, categories: 'Maybeboard', command_zone_role: null },
      { id: 7, deck_id: 2, card_name: 'Held Draw', quantity: 1, is_commander: false, copy_id: 21, categories: null, command_zone_role: null },
    ],
    ref_printings: [{ name: 'Mendicant Core', color_identity: ['R'] }],
    user_cards: [
      { id: 10, user_id: 'u1', card_name: 'Spare Draw', oracle_id: 'o1' },
      { id: 11, user_id: 'u1', card_name: 'Held Draw', oracle_id: 'o2' },
      { id: 12, user_id: 'u1', card_name: 'Green Draw', oracle_id: 'o3' },
      { id: 13, user_id: 'u1', card_name: 'Spare Land', oracle_id: 'o4' },
      { id: 14, user_id: 'u1', card_name: 'Spare Bear', oracle_id: 'o5' },
      { id: 99, user_id: 'u2', card_name: 'Their Draw', oracle_id: 'o9' },
    ],
    user_copies: [
      { id: 20, user_id: 'u1', card_id: 10, is_proxy: false },
      { id: 21, user_id: 'u1', card_id: 11, is_proxy: false },
      { id: 22, user_id: 'u1', card_id: 12, is_proxy: false },
      { id: 23, user_id: 'u1', card_id: 13, is_proxy: false },
      { id: 24, user_id: 'u1', card_id: 14, is_proxy: false },
      { id: 98, user_id: 'u2', card_id: 99, is_proxy: false },
    ],
    ref_cards: [
      ref('Mendicant Core', 'R', 'Legendary Artifact Creature'),
      ref('In Deck Draw', 'R', 'Sorcery', 'Draw two cards.'),
      ref('In Deck Draw Two', 'R', 'Sorcery', 'Draw three cards.'),
      ref('Command Tower', '', 'Land'),
      ref('Mountain', 'R', 'Basic Land — Mountain'),
      ref('Maybe Draw', 'R', 'Sorcery', 'Draw two cards.'),
      ref('Spare Draw', 'R', 'Sorcery', 'Draw two cards.'),
      ref('Held Draw', 'R', 'Sorcery', 'Draw three cards.'),
      ref('Green Draw', 'G', 'Sorcery', 'Draw two cards.'),
      ref('Spare Land', '', 'Land'),
      ref('Spare Bear', 'R', 'Creature — Bear'),
      ref('Their Draw', 'R', 'Sorcery', 'Draw two cards.'),
    ],
  }
}

describe('parseGapRole', () => {
  it('accepts the five roles and nothing else', () => {
    for (const r of ['ramp', 'draw', 'removal', 'wipes', 'lands']) expect(parseGapRole(r)).toBe(r)
    expect(parseGapRole('creature')).toBeNull()
    expect(parseGapRole(null)).toBeNull()
  })
})

describe('loadDeckGap', () => {
  it('draw: the in-deck count equals the pill count and the listed cards', async () => {
    const db = fakeDb(world())
    const gap = await loadDeckGap(db, 1, 'u1', 'draw')
    const health = await loadDeckHealth(db, 1, 'u1')
    expect(gap.ok && health.ok).toBe(true)
    if (!gap.ok || !health.ok) return
    const pill = health.health.roles.find((r) => r.role === 'draw')!.have
    expect(pill).toBe(2)
    expect(gap.gap.have).toBe(pill)
    expect(gap.gap.inDeckCount).toBe(pill)
    expect(gap.gap.inDeckCards.map((c) => c.name)).toEqual(['In Deck Draw', 'In Deck Draw Two'])
  })

  it('lists spare first, then another deck with the deck name only; off-colour and other users never appear', async () => {
    const gap = await loadDeckGap(fakeDb(world()), 1, 'u1', 'draw')
    if (!gap.ok) throw new Error('expected ok')
    expect(gap.gap.spare.map((c) => c.name)).toEqual(['Spare Draw'])
    expect(gap.gap.inAnotherDeck.map((c) => c.name)).toEqual(['Held Draw'])
    expect(gap.gap.inAnotherDeck[0].otherDeckName).toBe('Korvold')
    expect(JSON.stringify(gap.gap)).not.toMatch(/short by one|warning/i)
    const all = JSON.stringify(gap.gap)
    for (const n of ['Green Draw', 'Their Draw', 'Maybe Draw', 'Spare Bear']) expect(all).not.toContain(n)
    expect(gap.gap.coloursKnown).toBe(true)
  })

  it('lands: lists the spare non-basic land and counts the lands in the deck', async () => {
    const db = fakeDb(world())
    const gap = await loadDeckGap(db, 1, 'u1', 'lands')
    if (!gap.ok) throw new Error('expected ok')
    expect(gap.gap.spare.map((c) => c.name)).toEqual(['Spare Land'])
    expect(gap.gap.inDeckCount).toBe(21) // Command Tower + 20 Mountain
    expect(gap.gap.have).toBe(21)
    expect(gap.gap.typical).toBe(36)
  })

  it('uses the same commander typical numbers as the health check (lands 34 for Mendicant Core)', async () => {
    const db = fakeDb(world())
    const seen: string[][] = []
    const targets = async (_db: unknown, names: string[]) => {
      seen.push(names)
      return {
        ...guideTargets('x'),
        status: 'ok' as const,
        source: 'edhrec_average' as const,
        sourceLabel: 'EDHREC average deck, 17,659 decks',
        roles: (['ramp', 'draw', 'removal', 'wipes'] as const).map((role) => ({ role, typical: 12, cardsInRole: 12 })),
        landsTypical: 34,
      }
    }
    const gap = await loadDeckGap(db, 1, 'u1', 'lands', { targets })
    const health = await loadDeckHealth(db, 1, 'u1', { targets })
    if (!gap.ok || !health.ok) throw new Error('expected ok')
    expect(seen[0]).toEqual(['Mendicant Core'])
    expect(gap.gap.typical).toBe(34)
    expect(health.health.roles.find((r) => r.role === 'lands')!.typical).toBe(34)
  })

  it("another user's deck is a 404 and nothing is read from their cards", async () => {
    const r = await loadDeckGap(fakeDb(world()), 3, 'u1', 'draw')
    expect(r).toMatchObject({ ok: false, status: 404 })
  })

  it('a read failure is a 500, not an empty list', async () => {
    const r = await loadDeckGap(fakeDb(world(), 'user_cards'), 1, 'u1', 'draw')
    expect(r).toMatchObject({ ok: false, status: 500 })
  })
})

describe('cardsInRole matches countRoles', () => {
  it('quantities add up to the role count', () => {
    const cards: HealthDeckCard[] = [
      { cardName: 'A', quantity: 2, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: true },
      { cardName: 'B', quantity: 1, typeLine: 'Sorcery', oracleText: 'Draw two cards.', inMainDeck: false },
      { cardName: 'C', quantity: 5, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
    ]
    expect(cardsInRole(cards, 'draw')).toEqual([{ name: 'A', quantity: 2 }])
    expect(cardsInRole(cards, 'lands')).toEqual([{ name: 'C', quantity: 5 }])
    expect(classifyDeckCard(cards[1]).kind).toBe('skip')
  })
})
