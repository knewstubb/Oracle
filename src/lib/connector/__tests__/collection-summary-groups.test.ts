// CC-07 S3: get_collection_summary with filters and group_by.
import { describe, it, expect } from 'vitest'
import { getCollectionSummary, collectionSummaryInput } from '../tools/get-collection-summary'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { runTool } from '../server'
import { CONNECTOR_TOOLS } from '../tools'
import { byteLength } from '../limits'
import { ROLE_ORDER, rolesForCard, CLASSIFIER_VERSION } from '../../card-roles'
import fixtures from '../../__fixtures__/card-roles-scryfall.json'
import { hasEq, mockDb } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'

const U = 'user-1'
type G = { label: string; copies: number; distinctCards: number }
type Res = { ok: true; groupBy: string; totalCopies: number; distinctCards: number; groups: G[]; groupsTruncated: boolean; note?: string; roleRulesVersion?: number }
const c = (name: string, type_line: string, ci: string, mv = 1, oracle_text: string | null = 'x'): LibCard => ({ name, type_line, color_identity: ci, mana_value: mv, oracle_text })
const sum = async (db: never, input: object) => (await getCollectionSummary({ db, userId: U }, collectionSummaryInput.parse(input))) as never as Res
const labels = (r: Res) => Object.fromEntries(r.groups.map((g) => [g.label, g.copies]))

const LIB = [c('Sol Ring', 'Artifact', ''), c('Forest', 'Basic Land — Forest', 'G'), c('Elf', 'Creature — Elf', 'G'), c('Bolt', 'Instant', 'R'), c('Helix', 'Instant', 'RW'), c('Arti Creature', 'Artifact Creature — Golem', ''), c('Mystic', 'Creature — Elf', 'G')]
const lib = (n: string) => LIB.find((x) => x.name === n)!
function world() {
  resetIds()
  const rows = [
    copyRow(lib('Sol Ring'), { box: 'Unsorted' }), copyRow(lib('Sol Ring'), { deck: 'Korvold', proxy: true }), copyRow(lib('Forest'), { box: 'Lands' }),
    copyRow(lib('Elf'), { box: 'Unsorted' }), copyRow(lib('Elf'), { deck: 'Korvold' }), copyRow(lib('Bolt'), { hand: true }), copyRow(lib('Helix'), { missing: true }),
    copyRow(lib('Arti Creature'), { box: 'Unsorted' }), copyRow(null, { name: 'Mystery', box: 'Unsorted' }), copyRow(null, { name: 'Mystery', box: 'Unsorted' }),
  ]
  return { rows, ...viewDb(rows, { library: LIB }) }
}

describe('get_collection_summary: groups', () => {
  it('no input is exactly today\'s answer (regression)', async () => {
    const { db, queries } = mockDb((q) => ({ count: q.table === 'user_cards' ? 10 : q.table === 'deck_cards' ? 4 : q.filters.some((f) => f.args[0] === 'is_proxy' && f.args[1] === true) ? 2 : 30 }))
    const r = await getCollectionSummary({ db, userId: U })
    expect(r).toEqual({ ok: true, distinctCards: 10, totalCopies: 30, proxyCopies: 2, originalCopies: 30, copiesInDecks: 4, copiesInStorage: 30, missingCopies: 30 })
    expect(queries.length).toBe(7)
    const viaTool = await runTool({ db, userId: U, connectionId: 'c', clientId: 'c', clientName: 'c', gateway: {} as never }, 'get_collection_summary', {})
    expect(viaTool.structuredContent).toMatchObject({ ok: true, distinctCards: 10 })
  })
  it('group_by colour: one answer, groups add up to the total, with Colourless and a No facts group', async () => {
    const { db } = world()
    const r = await sum(db as never, { group_by: 'colour' })
    expect(r.totalCopies).toBe(10)
    expect(r.groups.reduce((a, g) => a + g.copies, 0)).toBe(10)
    expect(labels(r)).toEqual({ Colourless: 3, Green: 3, 'No facts': 2, Red: 1, 'White/Red': 1 })
    expect(byteLength(r)).toBeLessThan(3 * 1024)
    expect(r.groups[0].copies).toBeGreaterThanOrEqual(r.groups[1].copies)
    expect(r.groups.find((g) => g.label === 'Colourless')!.distinctCards).toBe(2)
  })
  it('group_by type uses one type per card and adds up', async () => {
    const { db } = world()
    const r = await sum(db as never, { group_by: 'type' })
    expect(labels(r)).toEqual({ Artifact: 2, Land: 1, Creature: 3, Instant: 2, 'No facts': 2 })
    expect(r.groups.reduce((a, g) => a + g.copies, 0)).toBe(r.totalCopies)
  })
  it('group_by location covers each deck, each box, In your hand and Missing', async () => {
    const { db } = world()
    const r = await sum(db as never, { group_by: 'location' })
    expect(labels(r)).toEqual({ 'Korvold (deck)': 2, Unsorted: 5, Lands: 1, 'In your hand': 1, Missing: 1 })
  })
  it('group_by kind counts original and proxy', async () => {
    const { db } = world()
    expect(labels(await sum(db as never, { group_by: 'kind' }))).toEqual({ Original: 9, Proxy: 1 })
  })
  it('filters give the same totals as search, and say how many cards could not be matched', async () => {
    const { db } = world()
    const filters = { types: ['creature' as const], only_free: true }
    const s = await sum(db as never, { group_by: 'colour', ...filters })
    const found = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse(filters))) as never as { total: number; totalCopies: number }
    expect(s.totalCopies).toBe(found.totalCopies)
    expect(s.distinctCards).toBe(found.total)
    expect(s.note).toMatch(/1 owned card has no card facts yet/)
  })
  it('filters without group_by group by type', async () => {
    const { db } = world()
    expect((await sum(db as never, { colourless: true })).groupBy).toBe('type')
  })
  it('at most 60 groups, with a truncation flag, and the answer stays small', async () => {
    resetIds()
    const libs = Array.from({ length: 70 }, (_, i) => c(`C${i}`, 'Creature — X', 'G'))
    const rows = libs.map((l, i) => copyRow(l, { deck: `Deck ${String(i).padStart(2, '0')}` }))
    const { db } = viewDb(rows, { library: libs })
    const r = await sum(db as never, { group_by: 'location' })
    expect(r.groups).toHaveLength(60)
    expect(r.groupsTruncated).toBe(true)
    expect(r.totalCopies).toBe(70)
    expect(byteLength(r)).toBeLessThan(4 * 1024) // worst case: 60 long labels. A colour or type answer is well under 3 KB.
  })
  it('a database error is LOOKUP_FAILED', async () => {
    const { db } = viewDb([], { failTable: 'connector_collection_copies' })
    expect(await getCollectionSummary({ db, userId: U }, collectionSummaryInput.parse({ group_by: 'type' }))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
  it('every query is scoped to the owner', async () => {
    const { db, queries } = world()
    await sum(db as never, { group_by: 'role', roles: ['ramp'] })
    for (const q of queries) if (!q.table.startsWith('ref_')) expect(hasEq(q, 'user_id', U)).toBe(true)
  })
  it('a smuggled user id is refused', () => {
    expect(() => collectionSummaryInput.parse({ user_id: 'x' })).toThrow()
    expect(CONNECTOR_TOOLS.find((t) => t.name === 'get_collection_summary')!.description).toMatch(/overlap/)
  })
})

describe('get_collection_summary: roles', () => {
  const FX = fixtures as Record<string, { typeLine: string; oracleText: string }>
  const roleLib: LibCard[] = [
    ...Object.entries(FX).map(([name, f]) => c(name, f.typeLine, '', 2, f.oracleText)),
    c('Blank Card', 'Artifact', '', 1, null),
  ]
  const setup = () => {
    resetIds()
    const rows = [...roleLib.map((l) => copyRow(l, { box: 'A' })), copyRow(null, { name: 'Mystery', box: 'A' })]
    return viewDb(rows, { library: roleLib })
  }
  it('group_by role overlaps, says so, carries No role and No facts, and matches the classifier', async () => {
    const { db } = setup()
    const r = await sum(db as never, { group_by: 'role' })
    expect(r.note).toMatch(/overlap/)
    expect(r.roleRulesVersion).toBe(CLASSIFIER_VERSION)
    const by = labels(r)
    const withText = roleLib.filter((l) => l.oracle_text)
    for (const role of ROLE_ORDER) {
      const want = withText.filter((l) => rolesForCard({ name: l.name, typeLine: l.type_line, oracleText: l.oracle_text }).includes(role)).length
      expect(by[role[0].toUpperCase() + role.slice(1)] ?? 0).toBe(want)
    }
    expect(by['No facts']).toBe(2) // no library row, and no rules text
    expect(by['No role']).toBeGreaterThan(0)
    // The identity: any role + No role + No facts = total; first-class totals are not double counted.
    const anyRole = withText.filter((l) => rolesForCard({ name: l.name, typeLine: l.type_line, oracleText: l.oracle_text }).length > 0).length
    expect(anyRole + by['No role'] + by['No facts']).toBe(r.totalCopies)
    expect(r.totalCopies).toBe(roleLib.length + 1)
  })
  it('a role filter in the summary equals the search total', async () => {
    const { db } = setup()
    const s = await sum(db as never, { roles: ['removal'], group_by: 'kind' })
    const f = (await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({ roles: ['removal'] }))) as never as { total: number; totalCopies: number; roleRulesVersion: number }
    expect(s.totalCopies).toBe(f.totalCopies)
    expect(s.distinctCards).toBe(f.total)
    expect(s.roleRulesVersion).toBe(f.roleRulesVersion)
  })
})
