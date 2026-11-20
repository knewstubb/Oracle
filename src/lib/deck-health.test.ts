import { describe, it, expect } from 'vitest'
import {
  countDeckTypes,
  buildDeckHealth,
  countRoles,
  verdictFor,
  isDoubleFacedLandCard,
  HEALTH_KIND_ORDER,
  DEFAULT_RANGES,
  type HealthDeckCard,
  type HealthKind,
  type DeckHealthResponse,
} from './deck-health'
import { loadDeckHealth, commanderNamesFor, type HealthClient, type TargetsProvider } from './deck-health-server'
import { guideTargets, type CommanderTargets } from './commander-targets'
import { MAX_HEALTH_RESULT_BYTES, byteLength } from './connector/limits'

const card = (name: string, typeLine: string, oracleText: string | null, quantity = 1): HealthDeckCard => ({
  cardName: name,
  quantity,
  typeLine,
  oracleText,
  inMainDeck: true,
})
const row = (h: DeckHealthResponse, kind: HealthKind) => h.rows.find((r) => r.kind === kind)!
const copies = (n: number, make: (i: number) => HealthDeckCard) => Array.from({ length: n }, (_, i) => make(i))

describe('verdictFor: Light below the minimum, Ok inside (ends included), Heavy above the maximum', () => {
  it.each([
    ['lands', 34, 'light'],
    ['lands', 35, 'ok'],
    ['lands', 38, 'ok'],
    ['lands', 39, 'heavy'],
    ['ramp', 9, 'light'],
    ['ramp', 10, 'ok'],
    ['ramp', 12, 'ok'],
    ['ramp', 13, 'heavy'],
    ['card_advantage', 9, 'light'],
    ['card_advantage', 12, 'ok'],
    ['card_advantage', 13, 'heavy'],
    ['targeted_removal', 10, 'ok'],
    ['targeted_removal', 13, 'heavy'],
    ['board_wipes', 0, 'light'],
    ['board_wipes', 2, 'light'],
    ['board_wipes', 3, 'ok'],
    ['board_wipes', 6, 'ok'],
    ['board_wipes', 7, 'heavy'],
  ] as const)('%s with %i is %s', (kind, have, expected) => {
    expect(verdictFor(have, DEFAULT_RANGES[kind])).toBe(expected)
  })
  it('one short of the minimum is Light now (the old rule needed two)', () => {
    expect(verdictFor(9, DEFAULT_RANGES.ramp)).toBe('light')
  })
})

describe('buildDeckHealth: the six rows', () => {
  it('always returns the six rows in order, even for an empty deck', () => {
    const h = buildDeckHealth([])
    expect(h.rows.map((r) => r.kind)).toEqual([...HEALTH_KIND_ORDER])
    expect(h.rows.map((r) => r.label)).toEqual([
      'Lands',
      'Ramp',
      'Card Advantage',
      'Targeted Removal',
      'Board Wipes / Mass Disruption',
      'Game Plan & Win Conditions',
    ])
    expect(h.rows.map((r) => r.have)).toEqual([0, 0, 0, 0, 0, 0])
    expect(row(h, 'lands')).toMatchObject({ verdict: 'light', range: { min: 35, max: 38 }, rangeSource: 'default' })
  })

  it('a real-shaped deck: counts from card text, verdicts per row, Game Plan as the remainder', () => {
    const cards: HealthDeckCard[] = [
      card('Forest', 'Basic Land — Forest', null, 30),
      card('Command Tower', 'Land', null, 7), // 37 lands: ok
      ...copies(18, (i) => card(`Rock ${i}`, 'Artifact', '{T}: Add {G}.')), // 18 ramp: heavy
      ...copies(6, (i) => card(`Brain ${i}`, 'Sorcery', 'Draw two cards.')), // 6 card advantage: light
      ...copies(6, (i) => card(`Kill ${i}`, 'Instant', 'Destroy target creature.')), // 6 removal: light
      ...copies(34, (i) => card(`Beater ${i}`, 'Creature — Elf', 'Trample')), // 34 game plan
    ]
    const h = buildDeckHealth(cards)
    expect(row(h, 'lands')).toMatchObject({ have: 37, verdict: 'ok', offBy: 0, summary: 'Range 35 to 38' })
    expect(row(h, 'ramp')).toMatchObject({ have: 18, verdict: 'heavy', offBy: 6, summary: 'Range 10 to 12 · 6 above' })
    expect(row(h, 'card_advantage')).toMatchObject({ have: 6, verdict: 'light', offBy: -4, summary: 'Range 10 to 12 · 4 below' })
    expect(row(h, 'targeted_removal')).toMatchObject({ have: 6, verdict: 'light', offBy: -4 })
    expect(row(h, 'board_wipes')).toMatchObject({ have: 0, verdict: 'light', offBy: -3, summary: 'Range 3 to 6 · 3 below' })
    expect(row(h, 'game_plan')).toMatchObject({ have: 34 })
    expect(h.verdict).toMatchObject({ headline: '1 of 5 in range', inRange: 1, ranged: 5 })
    expect(h.mainDeckCount).toBe(101)
    expect(h.rowsTotal).toBe(101)
    expect(h.notes.overlap).toBeNull()
    expect(h.notes.uncategorised).toBeNull()
  })

  it('all five in range says "All 5 in range"', () => {
    const cards = [
      card('Forest', 'Basic Land — Forest', null, 36),
      ...copies(10, (i) => card(`Rock ${i}`, 'Artifact', '{T}: Add {G}.')),
      ...copies(10, (i) => card(`Brain ${i}`, 'Sorcery', 'Draw two cards.')),
      ...copies(10, (i) => card(`Kill ${i}`, 'Instant', 'Destroy target creature.')),
      ...copies(3, (i) => card(`Wrath ${i}`, 'Sorcery', 'Destroy all creatures.')),
    ]
    const h = buildDeckHealth(cards)
    expect(h.rows.slice(0, 5).map((r) => r.verdict)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok'])
    expect(h.verdict).toMatchObject({ headline: 'All 5 in range', inRange: 5, ranged: 5 })
  })

  it('Game Plan is a plain total: no range, no verdict, and never counted in the header line', () => {
    const h = buildDeckHealth(copies(40, (i) => card(`Beater ${i}`, 'Creature', 'Trample')))
    const gp = row(h, 'game_plan')
    expect(gp).toMatchObject({ have: 40, range: null, rangeSource: null, verdict: null, offBy: 0, role: null })
    expect(gp.summary).toBe('No range. Everything not counted above.')
    expect(gp.guide).toEqual({ min: 25, max: 30 }) // a quiet note only
    expect(h.verdict.ranged).toBe(5)
  })

  it('Game Plan counts a card only when no other row has it (a ramp card is not in Game Plan)', () => {
    const h = buildDeckHealth([card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.'), card('Bear', 'Creature', 'Trample')])
    expect(row(h, 'ramp').have).toBe(1)
    expect(row(h, 'game_plan').cards).toEqual([{ name: 'Bear', quantity: 1 }])
  })

  it('cards with no card text sit in the Game Plan total and an uncategorised note says so', () => {
    const h = buildDeckHealth([card('Ghost', 'Creature', null, 4), card('Bear', 'Creature', 'Trample', 6)])
    expect(row(h, 'game_plan').have).toBe(10)
    expect(h.unclassifiedCount).toBe(4)
    expect(h.notes.uncategorised).toBe('4 cards have no card text yet, so Oracle could not place them. They are counted in Game Plan & Win Conditions.')
    const one = buildDeckHealth([card('Ghost', 'Creature', null, 1)])
    expect(one.notes.uncategorised).toBe('1 card has no card text yet, so Oracle could not place it. It is counted in Game Plan & Win Conditions.')
  })

  it('a card in two rows (Damn: removal and a wipe) is counted in both, the deck total stays the card count, and a note says so', () => {
    const cards = [card('Damn', 'Sorcery', 'Destroy target creature. Overload {2}{W}{W} (You may cast this spell for its overload cost. If you do, change "target" to "each".)'), card('Bear', 'Creature', 'Trample')]
    const h = buildDeckHealth(cards)
    expect(row(h, 'targeted_removal').have).toBe(1)
    expect(row(h, 'board_wipes').have).toBe(1)
    expect(h.mainDeckCount).toBe(2)
    expect(h.rowsTotal).toBe(3)
    expect(h.multiRowCards).toBe(1)
    expect(h.notes.overlap).toBe('2 cards in the list. 1 card counts in more than one row, so the rows add to 3.')
  })

  it('does not count lands or off-list cards in any row', () => {
    const cards = [card('Forest', 'Basic Land — Forest', null, 30), { ...card('X', 'Instant', 'Destroy target creature.'), inMainDeck: false }]
    const r = countRoles(cards)
    expect(r.have.removal).toBe(0)
    expect(r.have.lands).toBe(30)
    expect(r.unclassifiedCount).toBe(0)
    expect(row(buildDeckHealth(cards), 'game_plan').have).toBe(0)
  })

  it('each row lists its own cards', () => {
    const h = buildDeckHealth([card('Forest', 'Basic Land — Forest', null, 2), card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.')])
    expect(row(h, 'lands').cards).toEqual([{ name: 'Forest', quantity: 2 }])
    expect(row(h, 'ramp').cards).toEqual([{ name: 'Sol Ring', quantity: 1 }])
  })
})

describe('the response size', () => {
  it('a full 101-card deck with long card names stays under the connector result limit', () => {
    const cards = [
      card('Forest', 'Basic Land — Forest', null, 30),
      ...copies(7, (i) => card(`Exploration Center Of The Ancient World ${i}`, 'Land', null)),
      ...copies(18, (i) => card(`Treasure Cruise Of The Long Lost Seas ${i}`, 'Artifact', '{T}: Add {G}.')),
      ...copies(12, (i) => card(`Harmonize The Spirits Of The Forest ${i}`, 'Sorcery', 'Draw two cards.')),
      ...copies(12, (i) => card(`Reclamation Of The Fallen Sages ${i}`, 'Instant', 'Destroy target creature.')),
      ...copies(22, (i) => card(`Avenger Of The Endless Green Horde ${i}`, 'Creature — Elf', 'Trample')),
    ]
    const h = buildDeckHealth(cards)
    expect(h.mainDeckCount).toBe(101)
    expect(byteLength(h)).toBeLessThan(MAX_HEALTH_RESULT_BYTES)
  })
})

describe('double-faced land cards', () => {
  const dfc = (name: string) => card(`${name} // Back`, 'Sorcery // Land', 'Destroy target creature.\n//\n{T}: Add {R}.')
  it('is true for a spell front with a land back, false for a land front or a transforming card', () => {
    expect(isDoubleFacedLandCard({ typeLine: 'Sorcery // Land', oracleText: null })).toBe(true)
    expect(isDoubleFacedLandCard({ typeLine: 'Instant // Land', oracleText: 'Draw a card.' })).toBe(true)
    expect(isDoubleFacedLandCard({ typeLine: 'Land // Land', oracleText: null })).toBe(false)
    expect(isDoubleFacedLandCard({ typeLine: 'Land', oracleText: null })).toBe(false)
    expect(isDoubleFacedLandCard({ typeLine: 'Creature — Human // Creature — Werewolf', oracleText: null })).toBe(false)
    expect(isDoubleFacedLandCard({ typeLine: 'Enchantment // Land', oracleText: 'At the beginning of your upkeep, you may transform this.' })).toBe(false)
    expect(isDoubleFacedLandCard({ typeLine: null, oracleText: null })).toBe(false)
  })
  it('is one land beside the land line: "36 lands + 2 double-faced", in mana sources once, never in the land count', () => {
    const cards = [card('Forest', 'Basic Land — Forest', null, 36), dfc('Smash'), dfc('Recover'), card('Bear', 'Creature', 'Trample')]
    const h = buildDeckHealth(cards)
    const lands = row(h, 'lands')
    expect(lands.have).toBe(36) // plain lands only, so the verdict uses them
    expect(lands.doubleFaced).toBe(2)
    expect(lands.verdict).toBe('ok')
    expect(h.manaSources).toEqual({ total: 38, lands: 36, doubleFaced: 2, ramp: 0 })
    expect(h.notes.manaSources).toBe('Mana sources 38: 36 lands, 2 double-faced, 0 ramp cards. An estimate.')
    expect(h.mainDeckCount).toBe(39)
  })
  it('a double-faced card with ramp text is one source, not two', () => {
    const ramp = card('Spell // Land', 'Sorcery // Land', 'Search your library for a basic land card, put it onto the battlefield tapped.')
    const h = buildDeckHealth([ramp])
    expect(row(h, 'ramp').have).toBe(1)
    expect(h.manaSources).toEqual({ total: 1, lands: 0, doubleFaced: 1, ramp: 0 })
  })
  it('mana sources without double-faced cards: "Mana sources 55: 37 lands, 18 ramp cards."', () => {
    const cards = [card('Forest', 'Basic Land — Forest', null, 37), ...copies(18, (i) => card(`Rock ${i}`, 'Artifact', '{T}: Add {G}.'))]
    expect(buildDeckHealth(cards).notes.manaSources).toBe('Mana sources 55: 37 lands, 18 ramp cards. An estimate.')
  })
  it('counts lands from the front-face type line: a spell-front double-faced card is not a land', () => {
    const cards = [
      card('Forest', 'Basic Land — Forest', null, 30),
      card('Command Tower', 'Land', null, 1),
      card('Shatterskull Smashing // Shatterskull, the Hammer Pass', 'Sorcery // Land', null, 1),
      card('Bala Ged Recovery // Bala Ged Sanctuary', 'Sorcery // Land', null, 1),
    ]
    const lands = row(buildDeckHealth(cards), 'lands')
    expect(lands.have).toBe(31)
    expect(lands.verdict).toBe('light')
    expect(lands.doubleFaced).toBe(2)
  })
})

describe('buildDeckHealth: partial check', () => {
  it('is partial when over 10% of the deck has no card text', () => {
    const cards = [card('Ghost', 'Creature', null, 20), card('Kill', 'Instant', 'Destroy target creature.', 80)]
    expect(buildDeckHealth(cards).checkState).toBe('partial')
    const few = [card('Ghost', 'Creature', null, 5), card('Kill', 'Instant', 'Destroy target creature.', 95)]
    expect(buildDeckHealth(few).checkState).toBe('full')
  })
})

// A fake client. Never the live database.
function fakeClient(opts: {
  deck: { id: number } | null
  deckCards?: unknown[]
  refs?: unknown[]
  fail?: 'deck_cards' | 'ref_cards'
}) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = []
  const client: HealthClient = {
    from(table: string) {
      const rec = { table, eq: [] as Array<[string, unknown]> }
      calls.push(rec)
      const result = () => {
        if (table === 'decks') return { data: opts.deck, error: null }
        if (table === 'deck_cards') return opts.fail === 'deck_cards' ? { data: null, error: { message: 'boom' } } : { data: opts.deckCards ?? [], error: null }
        return opts.fail === 'ref_cards' ? { data: null, error: { message: 'boom' } } : { data: opts.refs ?? [], error: null }
      }
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (col: string, val: unknown) => {
        rec.eq.push([col, val])
        return chain
      }
      chain.in = () => Promise.resolve(result())
      chain.ilike = () => chain
      chain.limit = () => Promise.resolve(result())
      chain.maybeSingle = () => Promise.resolve(result())
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res)
      return chain
    },
  }
  return { client, calls }
}

describe('loadDeckHealth', () => {
  it('filters the deck by owner and returns 404 for someone else\'s deck', async () => {
    const { client, calls } = fakeClient({ deck: null })
    const r = await loadDeckHealth(client, 5, 'user-b')
    expect(r).toMatchObject({ ok: false, status: 404 })
    expect(calls[0].eq).toContainEqual(['user_id', 'user-b'])
  })

  it('passes real card text to the classifier', async () => {
    const { client } = fakeClient({
      deck: { id: 5 },
      deckCards: [{ card_name: 'Swords to Plowshares', quantity: 1, categories: null, is_commander: false, command_zone_role: null }],
      refs: [{ name: 'Swords to Plowshares', type_line: 'Instant', oracle_text: 'Exile target creature. Its controller gains life equal to its power.' }],
    })
    const r = await loadDeckHealth(client, 5, 'u')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.health.rows.find((x) => x.kind === 'targeted_removal')?.have).toBe(1)
  })

  it('returns 500, not a green result, when a read fails', async () => {
    for (const fail of ['deck_cards', 'ref_cards'] as const) {
      const { client } = fakeClient({
        deck: { id: 5 },
        deckCards: [{ card_name: 'A', quantity: 1, categories: null, is_commander: false, command_zone_role: null }],
        fail,
      })
      const r = await loadDeckHealth(client, 5, 'u')
      expect(r).toMatchObject({ ok: false, status: 500 })
    }
  })

  it('looks up the commander from its commander row, and passes Recheck through', async () => {
    const { client } = fakeClient({
      deck: { id: 5, commander_name: 'Old Name' } as { id: number },
      deckCards: [{ card_name: 'Hearthhull, the Worldseed', quantity: 1, categories: null, is_commander: true, command_zone_role: null }],
      refs: [],
    })
    const seen: Array<{ names: string[]; recheck?: boolean }> = []
    const targets: TargetsProvider = async (_db, names, opts) => {
      seen.push({ names, recheck: opts.recheck })
      return edhrecTargets({ lands: 41 })
    }
    const r = await loadDeckHealth(client, 5, 'u', { recheck: true, targets })
    expect(seen).toEqual([{ names: ['Hearthhull, the Worldseed'], recheck: true }])
    expect(r.ok && r.health.reference.label).toBe('EDHREC average deck, 33,879 decks')
    expect(r.ok && r.health.rows.find((x) => x.kind === 'lands')?.reference).toBe(41)
  })
})

describe('commanderNamesFor', () => {
  const row = (card_name: string, is_commander: boolean, command_zone_role: string | null = null) => ({ card_name, quantity: 1, categories: null, is_commander, command_zone_role })

  it('uses commander rows (both partners), never the companion', () => {
    expect(commanderNamesFor([row('Thrasios, Triton Hero', true), row('Tymna the Weaver', true, 'partner'), row('Lurrus', false, 'companion'), row('Sol Ring', false)], null)).toEqual([
      'Thrasios, Triton Hero',
      'Tymna the Weaver',
    ])
  })

  it('falls back to the deck commander name when no row is marked (real case: the "Mendicant 2" deck)', () => {
    expect(commanderNamesFor([row('Sol Ring', false)], 'Mendicant Core, Guidelight')).toEqual(['Mendicant Core, Guidelight'])
    expect(commanderNamesFor([], null)).toEqual([])
  })
})

function edhrecTargets(o: { lands: number | null; removal?: number }): CommanderTargets {
  return {
    status: 'ok',
    source: 'edhrec_average',
    sourceLabel: 'EDHREC average deck, 33,879 decks',
    roles: [
      { role: 'ramp', typical: 19, cardsInRole: 19 },
      { role: 'draw', typical: 8, cardsInRole: 8 },
      { role: 'removal', typical: o.removal ?? 9, cardsInRole: o.removal ?? 9 },
      { role: 'wipes', typical: 2, cardsInRole: 2 },
    ],
    landsTypical: o.lands,
    cardsUsed: 57,
    deckSample: 33879,
    coverage: null,
    typeCounts: [
      { type: 'creature', average: 30 },
      { type: 'land', average: 41 },
    ],
    typeCountsLabel: 'EDHREC averages, 33,879 decks',
    fetchedAt: '2026-11-11T00:00:00.000Z',
    stale: false,
  }
}

describe('buildDeckHealth with commander numbers: EDHREC is a reference line only', () => {
  const removal = (n: number) => copies(n, (i) => card(`Kill ${i}`, 'Instant', 'Destroy target creature.'))
  it('no verdict reads the EDHREC numbers: the same deck gets the same rows with or without them', () => {
    const deck = [...removal(7), card('Forest', 'Basic Land — Forest', null, 40)]
    const withEdhrec = buildDeckHealth(deck, edhrecTargets({ lands: 41 }))
    const without = buildDeckHealth(deck)
    for (const k of HEALTH_KIND_ORDER) {
      expect(row(withEdhrec, k)).toMatchObject({ have: row(without, k).have, verdict: row(without, k).verdict, range: row(without, k).range })
    }
    expect(row(withEdhrec, 'targeted_removal')).toMatchObject({ have: 7, verdict: 'light', reference: 9 })
    expect(row(withEdhrec, 'lands')).toMatchObject({ have: 40, verdict: 'heavy', reference: 41 })
    expect(row(without, 'targeted_removal').reference).toBeNull()
  })
  it('names the reference and fills each ranged row with its average (none for Game Plan)', () => {
    const h = buildDeckHealth([], edhrecTargets({ lands: 41 }))
    expect(h.reference).toEqual({ available: true, label: 'EDHREC average deck, 33,879 decks', sample: 33879 })
    expect(h.rows.map((r) => r.reference)).toEqual([41, 19, 8, 9, 2, null])
  })
  it('the added reference.sample changes no row: counts, ranges, verdicts and offsets are the same with or without EDHREC', () => {
    const withEdhrec = buildDeckHealth(removal(6), edhrecTargets({ lands: 41 }))
    const without = buildDeckHealth(removal(6))
    const core = (h: ReturnType<typeof buildDeckHealth>) => h.rows.map((r) => [r.kind, r.have, r.range, r.verdict, r.offBy, r.summary])
    expect(core(withEdhrec)).toEqual(core(without))
    expect(without.reference.sample).toBeNull()
  })
  it('thin data: no EDHREC average, the card types are shown instead', () => {
    const thin = guideTargets('General guide', { typeCounts: [{ type: 'creature', average: 25 }], label: 'EDHREC averages, 61 decks' })
    const h = buildDeckHealth(removal(6), thin)
    expect(h.reference.available).toBe(false)
    expect(h.rows.every((r) => r.reference === null)).toBe(true)
    expect(h.typeCounts).toEqual([{ type: 'creature', average: 25, have: 0 }])
  })
  it('type counts carry what the deck has, counted from the front face', () => {
    const h = buildDeckHealth([card('Bear', 'Creature — Bear', 'x', 3), card('Forest', 'Basic Land — Forest', null, 5), card('Mutavault', 'Land', null, 1)], edhrecTargets({ lands: 41 }))
    expect(h.typeCounts).toEqual([
      { type: 'creature', average: 30, have: 3 },
      { type: 'land', average: 41, have: 6 },
    ])
    expect(h.typeCountsLabel).toBe('EDHREC averages, 33,879 decks')
  })
})
describe('countDeckTypes: Land takes priority', () => {
  const card = (cardName: string, typeLine: string | null, quantity = 1): HealthDeckCard => ({ cardName, quantity, typeLine, oracleText: null, inMainDeck: true })
  it('counts an Artifact Land as a land only, and still counts an Artifact Creature as both', () => {
    const t = countDeckTypes([
      card('Darksteel Citadel', 'Artifact, Land —'),
      card('Seat of the Synod', 'Artifact Land'),
      card('Snowy Thing', 'Snow Artifact Land'),
      card('Sol Ring', 'Artifact —'),
      card('Steel Hellkite', 'Artifact Creature — Dragon'),
    ])
    expect(t.land).toBe(3)
    expect(t.artifact).toBe(2)
    expect(t.creature).toBe(1)
  })
})
