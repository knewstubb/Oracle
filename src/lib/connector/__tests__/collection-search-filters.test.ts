// CC-07 S2: every filter, the role step, and the honesty rules, against an in-memory copy of the view.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { runTool } from '../server'
import { CONNECTOR_TOOLS, toJsonSchema } from '../tools'
import { ROLE_ORDER, CLASSIFIER_VERSION, isLandTypeLine, rolesForCard } from '../../card-roles'
import { classifyDeckCard } from '../../deck-health'
import fixtures from '../../__fixtures__/card-roles-scryfall.json'
import { hasEq, mockDb, type RecordedQuery } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'

const U = 'user-1'
type Row = { name: string; kind: string; copyCount: number; roles?: string[]; keywords?: string[]; copies: { location: Record<string, unknown> }[] }
type Res = { ok: true; items: Row[]; total: number; totalCopies: number; returned: number; note?: string; filterCoverage?: { cardsWithoutFacts: number; cardsWithoutText?: number; note: string }; knownPlaces?: string[]; roleRulesVersion?: number }
const card = (name: string, type_line: string, color_identity: string, mana_value: number, extra: Partial<LibCard> = {}): LibCard => ({ name, type_line, oracle_text: 'Some rules text.', mana_value, color_identity, ...extra })

const LIB: LibCard[] = [
  card('Llanowar Elves', 'Creature — Elf, Druid', 'G', 1, { oracle_text: '{T}: Add {G}.' }),
  card('Elvish Mystic', 'Creature — Elf, Druid', 'G', 1, { oracle_text: '{T}: Add {G}.' }),
  card('Craterhoof Behemoth', 'Creature — Beast', 'G', 8, { keywords: ['Haste'] }),
  card('Questing Beast', 'Creature — Beast', 'G', 4, { keywords: ['Vigilance', 'Deathtouch', 'Haste'] }),
  card('Serra Angel', 'Creature — Angel', 'W', 5, { keywords: ['Flying', 'Vigilance'] }),
  card('Lightning Helix', 'Instant', 'RW', 2, { oracle_text: 'Lightning Helix deals 3 damage to any target. You gain 3 life.' }),
  card('Sol Ring', 'Artifact', '', 1, { oracle_text: '{T}: Add {C}{C}.' }),
  card('Skullclamp', 'Artifact — Equipment', '', 1, { oracle_text: 'Equipped creature gets +1/-1. Whenever equipped creature dies, draw two cards.' }),
  card('Kithkin Greatheart', 'Creature — Kithkin, Soldier', 'W', 2, { keywords: ['Kinship'] }),
  card('Jace, the Mind Sculptor', 'Legendary Planeswalker — Jace', 'U', 4),
  card('Forest', 'Basic Land — Forest', 'G', 0, { oracle_text: '({T}: Add {G}.)' }),
  card('Murderous Rider // Swift End', 'Legendary Creature — Zombie Knight // Instant — Adventure', 'B', 3),
  card('Thing // Other', 'Creature — Elf // Creature — Human', 'GW', 2),
  card('Goblin Time Lord', 'Creature — Time Lord', 'R', 3),
]
const L = (n: string) => LIB.find((c) => c.name === n)!

type Opt = Parameters<typeof copyRow>[1]
function setup(spec: [string | null, Opt?][], more: Partial<{ failTable: string }> = {}) {
  resetIds()
  const rows = spec.map(([n, o]) => (n && LIB.some((c) => c.name === n) ? copyRow(L(n), o) : copyRow(null, { ...o, name: n ?? 'Mystery' })))
  const v = viewDb(rows, { library: LIB, ...more })
  return { ...v, rows }
}
const run = async (db: never, input: object) => (await searchCollection({ db, userId: U }, searchCollectionInput.parse(input))) as never as Res
const names = (r: Res) => r.items.map((i) => i.name)
const box = { box: 'Unsorted' }

describe('filters', () => {
  const spec: [string, Opt?][] = [
    ['Llanowar Elves', box], ['Elvish Mystic', { deck: 'Korvold' }], ['Craterhoof Behemoth', box], ['Serra Angel', box], ['Lightning Helix', box],
    ['Sol Ring', box], ['Skullclamp', box], ['Jace, the Mind Sculptor', box], ['Forest', box], ['Murderous Rider // Swift End', box],
  ]

  it('types: ANY of them, either face counts', async () => {
    const { db } = setup(spec)
    expect(names(await run(db as never, { types: ['instant'] }))).toEqual(['Lightning Helix', 'Murderous Rider // Swift End'])
    expect(names(await run(db as never, { types: ['planeswalker', 'land'] }))).toEqual(['Forest', 'Jace, the Mind Sculptor'])
  })
  it('colours: within (default) includes colourless; exact is mono only; includes allows more', async () => {
    const { db } = setup(spec)
    expect(names(await run(db as never, { colours: ['G'] }))).toEqual(['Craterhoof Behemoth', 'Elvish Mystic', 'Forest', 'Llanowar Elves', 'Skullclamp', 'Sol Ring'])
    expect(names(await run(db as never, { colours: ['G'], colour_match: 'exact' }))).toEqual(['Craterhoof Behemoth', 'Elvish Mystic', 'Forest', 'Llanowar Elves'])
    expect(names(await run(db as never, { colours: ['R'], colour_match: 'includes' }))).toEqual(['Lightning Helix'])
    expect(names(await run(db as never, { colours: ['W', 'R'] }))).toEqual(['Lightning Helix', 'Serra Angel', 'Skullclamp', 'Sol Ring'])
    expect(names(await run(db as never, { colours: ['W', 'U'], colour_match: 'exact' }))).toEqual([])
  })
  it('colourless: true gives only colourless cards, never cards without facts', async () => {
    const { db } = setup([...spec, ['Mystery', box]])
    expect(names(await run(db as never, { colourless: true }))).toEqual(['Skullclamp', 'Sol Ring'])
    expect(names(await run(db as never, { colours: [], colour_match: 'exact' }))).toEqual(['Skullclamp', 'Sol Ring'])
  })
  it('contradictory inputs are INVALID_INPUT', async () => {
    expect(() => searchCollectionInput.parse({ colourless: true, colours: ['G'] })).toThrow()
    expect(() => searchCollectionInput.parse({ mana_value_min: 5, mana_value_max: 2 })).toThrow()
    expect(() => searchCollectionInput.parse({ roles: ['tutor'] })).toThrow()
    expect(() => searchCollectionInput.parse({ subtypes: [''] })).toThrow()
    expect(() => searchCollectionInput.parse({ keywords: ['x'.repeat(41)] })).toThrow()
    expect(() => searchCollectionInput.parse({ bogus: 1 })).toThrow()
    const ctx = { db: mockDb(() => ({ data: [] })).db, userId: U, connectionId: 'c', clientId: 'c', clientName: 'c', gateway: {} as never }
    expect((await runTool(ctx, 'search_collection', { roles: ['tutor'] })).structuredContent).toMatchObject({ error: { code: 'INVALID_INPUT' } })
    expect((await runTool(ctx, 'search_collection', { only_proxies: true, include_proxies: false })).structuredContent).toMatchObject({ error: { code: 'INVALID_INPUT' } })
  })
  it('mana value range is inclusive at both ends', async () => {
    const { db } = setup(spec)
    expect(names(await run(db as never, { mana_value_min: 2, mana_value_max: 5 }))).toEqual(['Jace, the Mind Sculptor', 'Lightning Helix', 'Murderous Rider // Swift End', 'Serra Angel'])
    expect(names(await run(db as never, { mana_value_min: 8 }))).toEqual(['Craterhoof Behemoth'])
    expect(names(await run(db as never, { mana_value_max: 0 }))).toEqual(['Forest'])
  })
  it('location: deck, box, In your hand and Missing, case-insensitive and whole name', async () => {
    const { db } = setup([['Sol Ring', { deck: 'Korvold' }], ['Skullclamp', box], ['Llanowar Elves', { hand: true }], ['Forest', { missing: true }], ['Serra Angel', { deck: 'Korvold Pet Deck' }]])
    expect(names(await run(db as never, { location: 'korvold' }))).toEqual(['Sol Ring'])
    expect(names(await run(db as never, { location: 'UNSORTED' }))).toEqual(['Skullclamp'])
    expect(names(await run(db as never, { location: 'in your hand' }))).toEqual(['Llanowar Elves'])
    expect(names(await run(db as never, { location: 'Missing' }))).toEqual(['Forest'])
  })
  it('a name shared by a deck and a box returns both, each row says where it is', async () => {
    const { db } = setup([['Sol Ring', { deck: 'Eldrazi' }], ['Skullclamp', { box: 'Eldrazi' }]])
    const r = await run(db as never, { location: 'eldrazi' })
    expect(r.items.map((i) => i.copies[0].location.kind).sort()).toEqual(['deck', 'storage'])
  })
  it('an unknown place is ok with zero results, a note and real place names', async () => {
    const { db } = setup([['Sol Ring', { deck: 'Korvold' }], ['Skullclamp', box]])
    const r = await run(db as never, { location: 'Nowhere' })
    expect(r).toMatchObject({ ok: true, total: 0 })
    expect(r.knownPlaces).toEqual(['In your hand', 'Korvold', 'Missing', 'Unsorted'])
    expect(r.note).toMatch(/No deck, box or binder is called "Nowhere"/)
    // A real place with nothing matching the other filters is just empty: no place list.
    const r2 = await run(db as never, { location: 'Korvold', types: ['land'] })
    expect(r2.total).toBe(0)
    expect(r2.knownPlaces).toBeUndefined()
  })
  it('all filters apply to the same copy: free proxies in the Unsorted box', async () => {
    const { db } = setup([
      ['Sol Ring', { box: 'Unsorted', proxy: true }], // yes
      ['Sol Ring', { box: 'Unsorted' }], // original
      ['Skullclamp', { deck: 'D', proxy: true }], // proxy in a deck
      ['Llanowar Elves', { box: 'Other', proxy: true }], // wrong box
      ['Forest', { hand: true, box: 'Unsorted', proxy: true }], // in hand: not free
    ])
    const r = await run(db as never, { only_free: true, only_proxies: true, location: 'Unsorted' })
    expect(names(r)).toEqual(['Sol Ring'])
    expect(r.totalCopies).toBe(1)
    expect(r.items[0].kind).toBe('proxy')
  })
  it('a type filter says how many owned cards have no facts and cannot match; they are not counted as colourless', async () => {
    const { db } = setup([['Sol Ring', box], ['Mystery', box], ['Mystery', box], ['Other Mystery', box]])
    const r = await run(db as never, { types: ['artifact'] })
    expect(names(r)).toEqual(['Sol Ring'])
    expect(r.filterCoverage).toMatchObject({ cardsWithoutFacts: 2 })
    expect(r.filterCoverage!.note).toMatch(/2 owned cards have no card facts yet/)
    expect((await run(db as never, { colourless: true })).filterCoverage!.cardsWithoutFacts).toBe(2)
    expect((await run(db as never, {})).filterCoverage).toBeUndefined()
  })
  it('coverage counts only cards that pass the other filters', async () => {
    const { db } = setup([['Mystery', { deck: 'D' }], ['Other Mystery', box], ['Sol Ring', box]])
    expect((await run(db as never, { types: ['artifact'], only_free: true })).filterCoverage!.cardsWithoutFacts).toBe(1)
  })
  it('include_rules_text false leaves rules text out', async () => {
    const { db } = setup([['Sol Ring', box]])
    const r = (await run(db as never, { include_rules_text: false })) as never as { items: { facts: Record<string, unknown> }[] }
    expect('rulesText' in r.items[0].facts).toBe(false)
    expect('rulesText' in ((await run(db as never, {})) as never as { items: { facts: Record<string, unknown> }[] }).items[0].facts).toBe(true)
  })
})

describe('subtypes and keywords', () => {
  const spec: [string, Opt?][] = [
    ['Llanowar Elves', box], ['Elvish Mystic', box], ['Craterhoof Behemoth', box], ['Questing Beast', box], ['Serra Angel', box],
    ['Skullclamp', box], ['Kithkin Greatheart', box], ['Thing // Other', box], ['Goblin Time Lord', box], ['Sol Ring', box],
  ]
  it('subtypes: ANY of them, whole word, not case sensitive, either face', async () => {
    const { db } = setup(spec)
    expect(names(await run(db as never, { subtypes: ['ELF'] }))).toEqual(['Elvish Mystic', 'Llanowar Elves', 'Thing // Other'])
    expect(names(await run(db as never, { subtypes: ['human'] }))).toEqual(['Thing // Other'])
    expect(names(await run(db as never, { subtypes: ['Elf', 'Equipment', 'Kithkin'] }))).toEqual(['Elvish Mystic', 'Kithkin Greatheart', 'Llanowar Elves', 'Skullclamp', 'Thing // Other'])
    expect(names(await run(db as never, { subtypes: ['elv'] }))).toEqual([]) // never a text match
  })
  it('a multi-word subtype stays one entry', async () => {
    const { db } = setup(spec)
    expect(names(await run(db as never, { subtypes: ['Time Lord'] }))).toEqual(['Goblin Time Lord'])
    expect(names(await run(db as never, { subtypes: ['Time'] }))).toEqual([])
  })
  it('keywords: all by default, any on request; rows show the keywords', async () => {
    const { db } = setup(spec)
    const both = await run(db as never, { keywords: ['Haste', 'deathtouch'] })
    expect(names(both)).toEqual(['Questing Beast'])
    expect(both.items[0].keywords).toEqual(['vigilance', 'deathtouch', 'haste'])
    expect(names(await run(db as never, { keywords: ['haste', 'flying'], keywords_match: 'any' }))).toEqual(['Craterhoof Behemoth', 'Questing Beast', 'Serra Angel'])
    expect(names(await run(db as never, { keywords: ['haste', 'flying'] }))).toEqual([])
    expect(names(await run(db as never, { keywords: ['kinship'] }))).toEqual(['Kithkin Greatheart'])
  })
  it('an unknown word is not an error: zero results, a note, and a spelling suggestion from the owner\'s own words', async () => {
    const { db } = setup(spec)
    const r = await run(db as never, { subtypes: ['Elves'] })
    expect(r).toMatchObject({ ok: true, total: 0 })
    expect(r.note).toMatch(/No owned card has the subtype "Elves"\. Did you mean "elf"\?/)
    const k = await run(db as never, { keywords: ['first-strike'] })
    expect(k.note).toMatch(/No owned card has the keyword "first-strike"/)
    const s = await run(db as never, { subtypes: ['Zzzyx'] })
    expect(s.note).not.toMatch(/Did you mean/)
  })
  it('cards with no facts are never matched and are counted', async () => {
    const { db } = setup([...spec, ['Mystery', box]])
    const r = await run(db as never, { subtypes: ['elf'] })
    expect(r.filterCoverage).toMatchObject({ cardsWithoutFacts: 1 })
    expect(r.filterCoverage!.note).toMatch(/subtype filter/)
  })
  it('combines with other filters on the same copy', async () => {
    const { db } = setup([['Llanowar Elves', { deck: 'D' }], ['Elvish Mystic', box]])
    expect(names(await run(db as never, { subtypes: ['elf'], only_free: true, colours: ['G'], mana_value_max: 1 }))).toEqual(['Elvish Mystic'])
  })
})

// ---- roles ----
const FX = fixtures as Record<string, { typeLine: string; oracleText: string }>
const fixtureLib: LibCard[] = Object.entries(FX).map(([name, f]) => ({ name, type_line: f.typeLine, oracle_text: f.oracleText, mana_value: 2, color_identity: '' }))

function roleSetup(extra: [LibCard | null, Opt?][] = [], onlyNames?: string[]) {
  resetIds()
  const lib = [...fixtureLib.filter((c) => !onlyNames || onlyNames.includes(c.name)), ...extra.map((e) => e[0]).filter((x): x is LibCard => !!x)]
  const rows = lib.map((c) => copyRow(c, { box: 'Unsorted' }))
  for (const [c, o] of extra) if (!c) rows.push(copyRow(null, { ...o, name: 'Mystery' }))
  return { ...viewDb(rows, { library: lib }), lib, rows }
}
const independent = (lib: LibCard[], pred: (roles: string[]) => boolean) =>
  lib.filter((c) => pred(rolesForCard({ name: c.name, typeLine: c.type_line, oracleText: c.oracle_text }))).map((c) => c.name).sort((a, b) => a.localeCompare(b))

describe('role search', () => {
  it('free removal equals an independent count with the same classifier, carries the rules version', async () => {
    const { db, lib } = roleSetup()
    const r = await run(db as never, { roles: ['removal'], only_free: true })
    expect(names(r)).toEqual(independent(lib, (x) => x.includes('removal')))
    expect(r.total).toBeGreaterThan(0)
    expect(r.roleRulesVersion).toBe(CLASSIFIER_VERSION)
    for (const role of ROLE_ORDER) {
      const rr = await run(db as never, { roles: [role], limit: 25 })
      expect(rr.total).toBe(independent(lib, (x) => x.includes(role)).length)
    }
  })
  it('Sol Ring is ramp, a known wipe is a wipe, Damn is removal and wipes', async () => {
    const { db } = roleSetup()
    expect(names(await run(db as never, { roles: ['ramp'] }))).toContain('Sol Ring')
    expect(names(await run(db as never, { roles: ['wipes'] }))).toContain('Wrath of God')
    const both = await run(db as never, { roles: ['removal', 'wipes'], roles_match: 'all' })
    expect(names(both)).toContain('Damn')
    for (const i of both.items) expect(i.roles).toEqual(expect.arrayContaining(['removal', 'wipes']))
    const any = await run(db as never, { roles: ['removal', 'wipes'] })
    expect(any.total).toBeGreaterThanOrEqual(both.total)
  })
  it('several roles default to ANY', async () => {
    const { db, lib } = roleSetup()
    const r = await run(db as never, { roles: ['ramp', 'draw'] })
    expect(r.total).toBe(independent(lib, (x) => x.includes('ramp') || x.includes('draw')).length)
  })
  it('combines with colour, type and location on the same copy', async () => {
    resetIds()
    const rampG = card('Rampant Elf', 'Creature — Elf', 'G', 1, { oracle_text: '{T}: Add {G}.' })
    const rampU = card('Blue Rock', 'Artifact', 'U', 2, { oracle_text: '{T}: Add {U}.' })
    const rows = [copyRow(rampG, { box: 'Unsorted' }), copyRow(rampG, { deck: 'D' }), copyRow(rampU, { box: 'Unsorted' }), copyRow(rampG, { box: 'Other' })]
    const { db } = viewDb(rows, { library: [rampG, rampU] })
    const r = await run(db as never, { roles: ['ramp'], colours: ['G'], types: ['creature'], location: 'Unsorted' })
    expect(names(r)).toEqual(['Rampant Elf'])
    expect(r.totalCopies).toBe(1)
  })
  it('a land never appears under any role', async () => {
    const { db } = roleSetup([[card('Fertile Ground Land', 'Land', '', 0, { oracle_text: '{T}: Add {G}. Destroy target creature. Draw a card.' }), box]])
    for (const role of ROLE_ORDER) expect(names(await run(db as never, { roles: [role] }))).not.toContain('Fertile Ground Land')
    expect(names(await run(db as never, { roles: [...ROLE_ORDER] }))).not.toContain('Command Tower')
  })
  it('a card with no library row is never matched; the note counts it live, with cards that have no rules text', async () => {
    const noText = card('Blank Card', 'Artifact', '', 1, { oracle_text: null })
    const { db } = roleSetup([[null, box], [null, { name: 'Mystery', box: 'X' }], [noText, box]], ['Sol Ring'])
    const r = await run(db as never, { roles: ['ramp'] })
    expect(names(r)).toEqual(['Sol Ring'])
    expect(r.filterCoverage).toMatchObject({ cardsWithoutFacts: 1, cardsWithoutText: 1 })
    expect(r.filterCoverage!.note).toBe('1 owned card has no card facts yet and 1 has no rules text, so they cannot be matched by the role filter.')
    // Both numbers are within the cards that pass the other filters.
    const free = await run(db as never, { roles: ['ramp'], types: ['artifact'] })
    expect(free.filterCoverage!.cardsWithoutFacts).toBe(1)
  })
  it('cost reducers count as ramp under the current rules, and a rule edit changes search with no other change', async () => {
    const medallion = card('Sapphire Medallion', 'Artifact', '', 2, { oracle_text: 'Blue spells you cast cost {1} less to cast.' })
    const { db } = roleSetup([[medallion, box]], ['Sol Ring'])
    expect(names(await run(db as never, { roles: ['ramp'] }))).toContain('Sapphire Medallion')
  })
  it('the search role step reads the roles through the shared classifier only (guard)', () => {
    const dir = path.resolve(__dirname, '../')
    const files: string[] = []
    const walk = (d: string) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? (e.name === '__tests__' ? null : walk(path.join(d, e.name))) : files.push(path.join(d, e.name))))
    walk(dir)
    const body = files.map((f) => readFileSync(f, 'utf8')).join('\n')
    // The phrases the classifier matches on must not be retyped anywhere in the connector.
    for (const phrase of ['destroy all', 'exile all', 'search your library', 'additional land', 'damage to each', 'cost {1} less']) expect(body.toLowerCase()).not.toContain(phrase)
    expect(readFileSync(path.join(dir, 'tools/collection-query.ts'), 'utf8')).toMatch(/from '..\/..\/card-roles'/)
    expect(readFileSync(path.join(dir, 'tools/collection-filters.ts'), 'utf8')).toMatch(/ROLE_ORDER/)
  })
  it('parity: search roles equal Deck health roles for every saved non-land card', async () => {
    const { db } = roleSetup()
    for (const role of ROLE_ORDER) {
      const searched = new Set(names(await run(db as never, { roles: [role] })))
      for (const c of fixtureLib) {
        if (isLandTypeLine(c.type_line)) {
          expect(searched.has(c.name)).toBe(false)
          continue
        }
        const k = classifyDeckCard({ cardName: c.name, quantity: 1, typeLine: c.type_line, oracleText: c.oracle_text, inMainDeck: true })
        const deckHas = k.kind === 'roles' && k.roles.includes(role)
        expect(searched.has(c.name), `${c.name} / ${role}`).toBe(deckHas)
      }
    }
  })
  it('rows show roles ([] = checked, none); a card with no text has no roles field', async () => {
    const { db } = roleSetup([[card('Vanilla', 'Creature — Bear', 'G', 2, { oracle_text: 'Trample' }), box], [card('Blank', 'Artifact', '', 1, { oracle_text: null }), box]], ['Sol Ring'])
    const r = await run(db as never, {})
    const by = Object.fromEntries(r.items.map((i) => [i.name, i.roles]))
    expect(by['Sol Ring']).toEqual(['ramp'])
    expect(by['Vanilla']).toEqual([])
    expect('roles' in r.items.find((i) => i.name === 'Blank')!).toBe(false)
  })
  it('over the 5,000-name ceiling, or a failed read, is LOOKUP_FAILED, never a partial list', async () => {
    resetIds()
    const big = Array.from({ length: 5001 }, (_, i) => copyRow(card(`Card ${i}`, 'Artifact', '', 1), { box: 'A' }))
    const { db } = viewDb(big, { library: [] })
    expect(await run(db as never, { roles: ['ramp'] })).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
    const bad = roleSetup().rows
    const failing = viewDb(bad, { library: fixtureLib, failTable: 'ref_cards' })
    expect(await run(failing.db as never, { roles: ['ramp'] })).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

describe('isolation and registry', () => {
  it('every owner-table query carries the user id (only card library reads are shared)', async () => {
    const { db, queries } = setup([['Sol Ring', box], ['Mystery', box]])
    await run(db as never, { roles: ['ramp'], types: ['artifact'], location: 'nope', subtypes: ['zzz'], keywords: ['zzz'] })
    expect(queries.length).toBeGreaterThan(3)
    for (const q of queries as RecordedQuery[]) if (!q.table.startsWith('ref_')) expect(hasEq(q, 'user_id', U), q.table).toBe(true)
  })
  it('the filters are pushed to the database where it can do them', async () => {
    const { db, queries } = setup([['Sol Ring', box]])
    await run(db as never, { mana_value_min: 1, mana_value_max: 3, subtypes: ['elf'], keywords: ['a', 'b'], colours: ['G'], colour_match: 'exact', only_free: true })
    const ops = queries[0].filters.map((f) => f.op)
    for (const op of ['gte', 'lte', 'overlaps', 'contains']) expect(ops).toContain(op)
    expect(queries[0].filters.find((f) => f.op === 'contains')!.args).toEqual(['keywords', ['a', 'b']])
  })
  it('the tool description states the role and keyword limits', () => {
    const d = CONNECTOR_TOOLS.find((t) => t.name === 'search_collection')!.description
    for (const w of ['best guess', 'front face', 'lands never have a role', 'cost reducers count as ramp', 'EDHREC', 'Kinship', 'filterCoverage', 'colourless cards are included']) expect(d).toContain(w)
    expect(d).not.toMatch(/not in any deck|3000/)
  })
  it('search_collection shows only the new inputs; nothing else changed in the registry', () => {
    const props = Object.keys((toJsonSchema(CONNECTOR_TOOLS.find((t) => t.name === 'search_collection')!.inputSchema) as { properties: object }).properties).sort()
    expect(props).toEqual([
      'colour_match', 'colourless', 'colours', 'include_proxies', 'include_rules_text', 'keywords', 'keywords_match', 'limit', 'location', 'mana_value_max', 'mana_value_min',
      'offset', 'only_free', 'only_proxies', 'query', 'roles', 'roles_match', 'subtypes', 'types',
    ])
  })
})
