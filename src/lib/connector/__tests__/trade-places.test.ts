// CC-25: Trade places are left out of Claude's collection search and counts by default.
// Safe before the database draft is applied: a missing is_trade column means "no Trade places", never a crash.
import { describe, it, expect } from 'vitest'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { getCollectionSummary, collectionSummaryInput } from '../tools/get-collection-summary'
import { hasEq } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard, type ViewDbOptions } from './view-db'

const U = 'user-1'
const lc = (name: string, type_line: string, mv: number): LibCard => ({ name, type_line, oracle_text: 'x', mana_value: mv, color_identity: 'G' })
const LIB = [lc('Sol Ring', 'Artifact', 1), lc('Llanowar Elves', 'Creature — Elf, Druid', 1), lc('Rhystic Study', 'Enchantment', 3)]
const BLACK = { id: 7, name: 'Black Binder' }
// Sol Ring: one copy in Main Box, one in the Black Binder. Elves: only in the Black Binder. Study: only in Main Box.
const world = (opts: ViewDbOptions = {}) => {
  resetIds()
  const rows = [
    copyRow(LIB[0], { box: 'Main Box', boxId: 5 }),
    copyRow(LIB[0], { box: 'Black Binder', boxId: 7 }),
    copyRow(LIB[1], { box: 'Black Binder', boxId: 7 }),
    copyRow(LIB[2], { box: 'Main Box', boxId: 5 }),
    copyRow(LIB[2], { deck: 'Korvold' }),
  ]
  return viewDb(rows, { library: LIB, ...opts })
}
type Res = { ok: true; items: { name: string; copyCount: number }[]; totalCopies: number; note?: string }
type Sum = { ok: true; totalCopies: number; groups: { label: string; copies: number }[]; note?: string }
const run = async (db: never, input: object) => (await searchCollection({ db, userId: U }, searchCollectionInput.parse(input))) as never as Res
const sum = async (db: never, input: object) => (await getCollectionSummary({ db, userId: U }, collectionSummaryInput.parse(input))) as never as Sum
const names = (r: Res) => r.items.map((i) => i.name).sort()

describe('Trade places are left out by default', () => {
  it('search leaves out copies in a Trade place and says how many', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const r = await run(db as never, { types: ['artifact', 'creature', 'enchantment'] })
    expect(names(r)).toEqual(['Rhystic Study', 'Sol Ring'])
    expect(r.items.find((i) => i.name === 'Sol Ring')!.copyCount).toBe(1)
    expect(r.totalCopies).toBe(3)
    expect(r.note).toMatch(/2 copies in your Trade place \(Black Binder\) were left out/)
    expect(r.note).toMatch(/include_trade true/)
  })
  it('a single copy left out is worded in the singular', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const r = await run(db as never, { query: 'llanowar' })
    expect(r.items).toEqual([])
    expect(r.note).toMatch(/1 copy in your Trade place \(Black Binder\) was left out/)
  })
  it('include_trade true counts them again and adds no note', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const r = await run(db as never, { include_trade: true })
    expect(names(r)).toEqual(['Llanowar Elves', 'Rhystic Study', 'Sol Ring'])
    expect(r.totalCopies).toBe(5)
    expect(r.note ?? '').not.toMatch(/Trade place/)
  })
  it('naming the Trade place in location includes it, without include_trade', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const r = await run(db as never, { location: 'Black Binder' })
    expect(names(r)).toEqual(['Llanowar Elves', 'Sol Ring'])
    expect(r.totalCopies).toBe(2)
  })
  it('copies in decks or other places are never touched, and only_free still works', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    expect((await run(db as never, { location: 'Korvold' })).totalCopies).toBe(1)
    const free = await run(db as never, { only_free: true })
    expect(free.totalCopies).toBe(2)
    expect(names(free)).toEqual(['Rhystic Study', 'Sol Ring'])
  })
  it('the card facts count stays right: a card only in a Trade place is left out, not reported as "no facts"', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const r = (await run(db as never, { no_card_facts: true })) as Res
    expect(r.items).toEqual([])
  })
  it('counts (get_collection_summary) leave them out too, group by location included', async () => {
    const { db } = world({ tradePlaces: [BLACK] })
    const s = await sum(db as never, { group_by: 'location' })
    expect(s.totalCopies).toBe(3)
    expect(s.groups.map((g) => g.label).sort()).toEqual(['Korvold (deck)', 'Main Box'])
    expect(s.note).toMatch(/2 copies in your Trade place/)
    const all = await sum(db as never, { group_by: 'location', include_trade: true })
    expect(all.totalCopies).toBe(5)
    expect(all.groups.map((g) => g.label)).toContain('Black Binder')
  })
  it('the Trade places are read for the signed-in owner only', async () => {
    const { db, queries } = world({ tradePlaces: [BLACK] })
    await run(db as never, {})
    const q = queries.find((x) => x.table === 'user_locations')!
    expect(hasEq(q, 'user_id', U)).toBe(true)
    expect(hasEq(q, 'is_trade', true)).toBe(true)
  })
})

describe('before the database draft is applied (and with no Trade places)', () => {
  it('a missing is_trade column means no Trade places: nothing is left out, no note, no crash', async () => {
    const { db } = world({ locationsError: 'column user_locations.is_trade does not exist' })
    const r = await run(db as never, {})
    expect(r.ok).toBe(true)
    expect(r.totalCopies).toBe(5)
    expect(r.note ?? '').not.toMatch(/Trade/)
    expect((await sum(db as never, { group_by: 'location' })).totalCopies).toBe(5)
  })
  it('the same when the owner has no Trade places', async () => {
    const { db } = world({ tradePlaces: [] })
    expect((await run(db as never, {})).totalCopies).toBe(5)
  })
  it('any other failure reading the places is a lookup failure, never a quiet "no Trade places"', async () => {
    const { db } = world({ locationsError: 'db down' })
    const r = (await run(db as never, {})) as unknown as { ok: boolean; error?: { code: string } }
    expect(r.ok).toBe(false)
  })
})
