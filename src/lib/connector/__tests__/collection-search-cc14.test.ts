// CC-14 FEAT-001: text, legendary, can_be_commander, no_card_facts, sorting, subtype and mana value groups, rules text default.
import { describe, it, expect } from 'vitest'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { getCollectionSummary, collectionSummaryInput } from '../tools/get-collection-summary'
import { sortGroups, type CardKindGroup } from '../tools/collection-view'
import { hasEq, type RecordedQuery } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'
const U = 'user-1'
type Res = { ok: true; items: { name: string; kind: string; facts: Record<string, unknown> }[]; total: number; totalCopies: number; note?: string; filterCoverage?: { cardsWithoutFacts: number; cardsWithoutText?: number; note: string } }
type Sum = { ok: true; groups: { label: string; copies: number }[]; groupsTruncated: boolean; note?: string }
const lc = (name: string, type_line: string, mv: number, text: string | null, extra: Partial<LibCard> = {}): LibCard => ({ name, type_line, oracle_text: text, mana_value: mv, color_identity: 'G', ...extra })
const LIB: LibCard[] = [
  lc('Hardened Scales', 'Enchantment', 1, 'If one or more +1/+1 counters would be put on a creature you control, that many plus one are put on it instead.'),
  lc('Walking Ballista', 'Artifact Creature — Construct', 0, 'Remove a +1/+1 counter from this creature: it deals 1 damage to any target.'),
  lc('Llanowar Elves', 'Creature — Elf Druid'.replace(' Druid', ', Druid'), 1, '{T}: Add {G}.'),
  lc('Sol Ring', 'Artifact', 1, '{T}: Add {C}{C}.'),
  lc('Blank Card', 'Instant', 2, null),
  lc('Korvold, Fae-Cursed King', 'Legendary Creature — Dragon Noble', 5, 'Flying\nWhenever Korvold attacks, put a +1/+1 counter on it.', { can_be_commander: true }),
  lc('Relic of Legends', 'Legendary Artifact', 3, 'Tap an untapped legendary creature you control: Add one mana of any color.', { can_be_commander: false }),
  lc('Jace Beleren', 'Legendary Planeswalker — Jace', 3, '+1: Each player draws a card.', { can_be_commander: false }),
  lc('Front // Back', 'Creature — Human // Legendary Creature — Werewolf', 2, 'Vigilance\n//\nTrample, put a counter here.', { can_be_commander: true }),
  lc('Nonlegend Lord', 'Creature — Elf, Warrior', 4, 'Other Elves get +1/+1.', { can_be_commander: false }),
]
const world = (extra: string[] = [], opts: Parameters<typeof viewDb>[1] = {}) => {
  resetIds()
  const rows = [...LIB.map((c) => copyRow(c, { box: 'Box' })), ...extra.map((n) => copyRow(null, { name: n, box: 'Box' }))]
  return viewDb(rows, { library: LIB, ...opts })
}
const run = async (db: never, input: object) => (await searchCollection({ db, userId: U }, searchCollectionInput.parse(input))) as never as Res
const sum = async (db: never, input: object) => (await getCollectionSummary({ db, userId: U }, collectionSummaryInput.parse(input))) as never as Sum
const names = (r: Res) => r.items.map((i) => i.name).sort()
describe('text filter', () => {
  it('all_words is the default: any order, partial words, not case sensitive, the counters example', async () => {
    const { db } = world(['Mystery'])
    expect(names(await run(db as never, { text: 'PUT +1/+1 counter' }))).toEqual(['Hardened Scales', 'Korvold, Fae-Cursed King'])
    expect(names(await run(db as never, { text: 'counter +1/+1' }))).toEqual(['Hardened Scales', 'Korvold, Fae-Cursed King', 'Walking Ballista'])
    expect(names(await run(db as never, { text: 'COUNTER', text_match: 'all_words' }))).toEqual(['Front // Back', 'Hardened Scales', 'Korvold, Fae-Cursed King', 'Walking Ballista'])
  })
  it('phrase needs the exact sequence', async () => {
    const { db } = world()
    expect(names(await run(db as never, { text: 'put a +1/+1 counter', text_match: 'phrase' }))).toEqual(['Korvold, Fae-Cursed King'])
    expect(names(await run(db as never, { text: 'counter +1/+1 a put', text_match: 'phrase' }))).toEqual([])
  })
  it('two-faced text matches on either face; a phrase never spans the faces; all_words may', async () => {
    const { db } = world()
    expect(names(await run(db as never, { text: 'vigilance', text_match: 'phrase' }))).toEqual(['Front // Back'])
    expect(names(await run(db as never, { text: 'trample', text_match: 'phrase' }))).toEqual(['Front // Back'])
    expect(names(await run(db as never, { text: 'vigilance trample', text_match: 'phrase' }))).toEqual([])
    expect(names(await run(db as never, { text: 'vigilance trample' }))).toEqual(['Front // Back'])
  })
  it('cards with no library row or no text are never matched and are counted', async () => {
    const { db } = world(['Mystery', 'Mystery 2'])
    const r = await run(db as never, { text: 'zzzz' })
    expect(r.items).toEqual([])
    expect(r.filterCoverage).toMatchObject({ cardsWithoutFacts: 2, cardsWithoutText: 1 })
    expect(r.filterCoverage!.note).toMatch(/2 owned cards have no card facts yet and 1 has no rules text, so they cannot be matched by the rules text filter\./)
    expect(r.note).toMatch(/"put" not "puts"/)
    expect(names(await run(db as never, { text: 'a' }))).not.toContain('Mystery')
  })
  it('combines with other filters by AND', async () => {
    const { db } = world()
    expect(names(await run(db as never, { text: 'counter', types: ['creature'] }))).toEqual(['Front // Back', 'Korvold, Fae-Cursed King', 'Walking Ballista'])
    expect(names(await run(db as never, { text: 'counter', types: ['creature'], mana_value_max: 2 }))).toEqual(['Front // Back', 'Walking Ballista'])
  })
  it('rejects text_match without text, more than 8 words, and an empty text', () => {
    expect(() => searchCollectionInput.parse({ text_match: 'phrase' })).toThrow()
    expect(() => searchCollectionInput.parse({ text: 'a b c d e f g h i' })).toThrow()
    expect(() => searchCollectionInput.parse({ text: '   ' })).toThrow()
    expect(() => searchCollectionInput.parse({ text: 'a b c d e f g h' })).not.toThrow()
  })
})
describe('legendary and can_be_commander', () => {
  it('legendary true: either face, any card type', async () => {
    const { db } = world(['Mystery'])
    const r = await run(db as never, { legendary: true })
    expect(names(r)).toEqual(['Front // Back', 'Jace Beleren', 'Korvold, Fae-Cursed King', 'Relic of Legends'])
    expect(r.filterCoverage).toMatchObject({ cardsWithoutFacts: 1 })
  })
  it('legendary false: neither face, and never a card without facts', async () => {
    const { db } = world(['Mystery'])
    const r = await run(db as never, { legendary: false })
    expect(names(r)).toEqual(['Blank Card', 'Hardened Scales', 'Llanowar Elves', 'Nonlegend Lord', 'Sol Ring', 'Walking Ballista'])
  })
  it('can_be_commander true and false use the library flag, not the type line', async () => {
    const { db } = world(['Mystery'])
    expect(names(await run(db as never, { can_be_commander: true }))).toEqual(['Front // Back', 'Korvold, Fae-Cursed King'])
    const no = await run(db as never, { can_be_commander: false })
    expect(names(no)).toEqual(['Blank Card', 'Hardened Scales', 'Jace Beleren', 'Llanowar Elves', 'Nonlegend Lord', 'Relic of Legends', 'Sol Ring', 'Walking Ballista'])
    expect(no.filterCoverage!.note).toMatch(/commander filter/)
  })
})
describe('no_card_facts', () => {
  it('lists only cards without a library row', async () => {
    const { db } = world(['Mystery', 'Mystery 2'])
    const r = await run(db as never, { no_card_facts: true })
    expect(names(r)).toEqual(['Mystery', 'Mystery 2'])
    expect(r.filterCoverage).toBeUndefined()
    expect(r.items[0].facts).toMatchObject({ available: false })
  })
  it('cannot be combined with filters that need facts', () => {
    for (const extra of [{ types: ['land'] }, { colours: ['G'] }, { colourless: true }, { subtypes: ['elf'] }, { keywords: ['flying'] }, { roles: ['ramp'] }, { mana_value_min: 1 }, { mana_value_max: 1 }, { text: 'a' }, { legendary: true }, { can_be_commander: true }])
      expect(() => searchCollectionInput.parse({ no_card_facts: true, ...extra }), JSON.stringify(extra)).toThrow()
    expect(() => searchCollectionInput.parse({ no_card_facts: true, query: 'x', only_free: true })).not.toThrow()
    expect(() => searchCollectionInput.parse({ no_card_facts: false })).toThrow()
  })
})
describe('sorting', () => {
  const orderOf = async (input: object) => (await run(world(['Zzz Mystery']).db as never, input)).items.map((i) => i.name)
  it('by name (default) and descending, no-facts cards last only for mana value', async () => {
    const asc = await orderOf({})
    expect(asc.slice(0, 3)).toEqual(['Blank Card', 'Front // Back', 'Hardened Scales'])
    expect((await orderOf({ sort_order: 'desc' }))[0]).toBe('Zzz Mystery')
  })
  it('by mana value asc: numeric, ties by name, no-facts last', async () => {
    const o = await orderOf({ sort_by: 'mana_value' })
    expect(o).toEqual(['Walking Ballista', 'Hardened Scales', 'Llanowar Elves', 'Sol Ring', 'Blank Card', 'Front // Back', 'Jace Beleren', 'Relic of Legends', 'Nonlegend Lord', 'Korvold, Fae-Cursed King', 'Zzz Mystery'])
  })
  it('by mana value desc: no-facts still last', async () => {
    const o = await orderOf({ sort_by: 'mana_value', sort_order: 'desc' })
    expect(o).toEqual(['Korvold, Fae-Cursed King', 'Nonlegend Lord', 'Jace Beleren', 'Relic of Legends', 'Blank Card', 'Front // Back', 'Hardened Scales', 'Llanowar Elves', 'Sol Ring', 'Walking Ballista', 'Zzz Mystery'])
  })
  it('paging follows the sort', async () => {
    const { db } = world(['Zzz Mystery'])
    const p1 = await run(db as never, { sort_by: 'mana_value', sort_order: 'desc', limit: 2 })
    const p2 = await run(db as never, { sort_by: 'mana_value', sort_order: 'desc', limit: 2, offset: 2 })
    expect(p1.items.map((i) => i.name)).toEqual(['Korvold, Fae-Cursed King', 'Nonlegend Lord'])
    expect(p2.items.map((i) => i.name)).toEqual(['Jace Beleren', 'Relic of Legends'])
    expect(p1.total).toBe(11)
  })
  it('sortGroups puts an original before a proxy of the same card', () => {
    const g = (kind: 'original' | 'proxy'): CardKindGroup => ({ cardId: 1, name: 'A', kind, copyIds: [1], manaValue: 2 })
    expect(sortGroups([g('proxy'), g('original')], 'mana_value', 'desc').map((x) => x.kind)).toEqual(['original', 'proxy'])
  })
})
describe('summary groups', () => {
  it('subtype: overlapping groups, No subtype, No facts, note', async () => {
    const { db } = world(['Mystery'])
    const r = await sum(db as never, { group_by: 'subtype' })
    const by = Object.fromEntries(r.groups.map((g) => [g.label, g.copies]))
    expect(by).toMatchObject({ Elf: 2, Druid: 1, Warrior: 1, Human: 1, Werewolf: 1, 'No subtype': 4, 'No facts': 1 })
    expect(r.note).toMatch(/overlap/)
  })
  it('subtype labels are title case, including two words', async () => {
    resetIds()
    const rows = [copyRow(lc('Doctor', 'Creature — Time Lord', 3, 'x'), { box: 'B' })]
    const r = await sum(viewDb(rows).db as never, { group_by: 'subtype' })
    expect(r.groups.map((g) => g.label)).toEqual(['Time Lord'])
  })
  it('mana_value: number order, No facts last', async () => {
    const { db } = world(['Mystery'])
    const r = await sum(db as never, { group_by: 'mana_value' })
    expect(r.groups.map((g) => g.label)).toEqual(['0', '1', '2', '3', '4', '5', 'No facts'])
    expect(r.groups.map((g) => g.copies)).toEqual([1, 3, 2, 2, 1, 1, 1])
    expect(r.groupsTruncated).toBe(false)
  })
  it('summary accepts the new filters', async () => {
    const { db } = world()
    expect((await sum(db as never, { text: 'counter', legendary: true })).groups.reduce((n, g) => n + g.copies, 0)).toBe(2) // Korvold and the two-faced card (Legendary back face)
  })
})
describe('rules text default', () => {
  it('is off unless include_rules_text is true', async () => {
    const { db } = world()
    expect('rulesText' in (await run(db as never, { query: 'sol' })).items[0].facts).toBe(false)
    expect('rulesText' in (await run(db as never, { query: 'sol', include_rules_text: true })).items[0].facts).toBe(true)
  })
})
describe('speed, failure and isolation', () => {
  it('a text search over 250 distinct names reads the library exactly 3 times for the search step', async () => {
    resetIds()
    const many = Array.from({ length: 250 }, (_, i) => lc(`Card ${i}`, 'Creature — Bear', 2, i % 2 ? 'put a counter' : 'nothing'))
    const rows = many.map((c) => copyRow(c, { box: 'B' }))
    let libReads = 0
    const { db, queries } = viewDb(rows, { library: many })
    const r = await run(db as never, { text: 'counter', limit: 1 })
    libReads = (queries as RecordedQuery[]).filter((q) => q.table === 'ref_cards' && q.columns.includes('can_be_commander')).length
    expect(r.total).toBe(125)
    expect(libReads).toBe(Math.ceil(250 / 100))
  })
  it('a failed library read is the lookup-failed error, never a short list', async () => {
    const { db } = world([], { failTable: 'ref_cards' })
    const r = (await run(db as never, { text: 'counter' })) as never as { ok: boolean; error?: { code: string } }
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('LOOKUP_FAILED')
  })
  it('every view query carries the owner id', async () => {
    const { db, queries } = world(['Mystery'])
    await run(db as never, { text: 'counter', legendary: false, sort_by: 'mana_value' })
    await run(db as never, { no_card_facts: true })
    await sum(db as never, { group_by: 'subtype', can_be_commander: true })
    expect(queries.length).toBeGreaterThan(3)
    for (const q of queries as RecordedQuery[]) if (q.table === 'connector_collection_copies') expect(hasEq(q, 'user_id', U), q.table).toBe(true)
  })
})
describe('type-line alignment: supertypes and all card types', () => {
  const TL: LibCard[] = [
    lc('Forest', 'Basic Land — Forest', 0, null),
    lc('Snow-Covered Swamp', 'Basic, Snow Land — Swamp', 0, null),
    lc('Ohran Frostfang', 'Snow Creature — Snake', 4, 'x'),
    lc('Wastes', 'Basic Land —', 0, null),
    lc('Back Legend', 'Creature — Human // Legendary Creature — Werewolf', 2, 'x'),
    lc('Eldrazi Spawner', 'Kindred, Sorcery — Eldrazi', 3, 'x'),
    lc('Golem', 'Artifact, Creature — Golem', 3, 'x'),
    lc('Spell Land', 'Instant // Land', 2, 'x'),
    lc('Landshark', 'Creature — Landshark', 2, 'x'),
    lc('Plain Instant', 'Instant', 1, 'x'),
  ]
  const tlWorld = (extra: string[] = []) => {
    resetIds()
    return viewDb([...TL.map((c) => copyRow(c, { box: 'Box' })), ...extra.map((n) => copyRow(null, { name: n, box: 'Box' }))], { library: TL })
  }
  it('basic true is only Basic cards, including Basic, Snow Land; false leaves them out', async () => {
    const { db } = tlWorld(['Mystery'])
    const yes = await run(db as never, { basic: true })
    expect(names(yes)).toEqual(['Forest', 'Snow-Covered Swamp', 'Wastes'])
    expect(yes.filterCoverage).toMatchObject({ cardsWithoutFacts: 1 })
    const no = await run(db as never, { basic: false })
    expect(names(no)).toEqual(['Back Legend', 'Eldrazi Spawner', 'Golem', 'Landshark', 'Ohran Frostfang', 'Plain Instant', 'Spell Land'])
  })
  it('snow true and false', async () => {
    const { db } = tlWorld()
    expect(names(await run(db as never, { snow: true }))).toEqual(['Ohran Frostfang', 'Snow-Covered Swamp'])
    expect(names(await run(db as never, { snow: false }))).not.toContain('Ohran Frostfang')
    expect(names(await run(db as never, { basic: true, snow: true }))).toEqual(['Snow-Covered Swamp'])
  })
  it('legendary on a back face only still counts', async () => {
    const { db } = tlWorld()
    expect(names(await run(db as never, { legendary: true }))).toEqual(['Back Legend'])
  })
  it('kindred works as a type; an Artifact Creature shows under both artifact and creature', async () => {
    const { db } = tlWorld()
    expect(names(await run(db as never, { types: ['kindred'] }))).toEqual(['Eldrazi Spawner'])
    expect(names(await run(db as never, { types: ['artifact'] }))).toContain('Golem')
    expect(names(await run(db as never, { types: ['creature'] }))).toContain('Golem')
    expect(names(await run(db as never, { types: ['sorcery'] }))).toEqual(['Eldrazi Spawner'])
  })
  it("'Instant // Land' does not match land (front face only); a subtype that contains a type word does not", async () => {
    const { db } = tlWorld()
    expect(names(await run(db as never, { types: ['land'] }))).toEqual(['Forest', 'Snow-Covered Swamp', 'Wastes'])
  })
  it('accepts all 15 types and rejects an unknown one', () => {
    expect(() => searchCollectionInput.parse({ types: ['conspiracy', 'dungeon', 'phenomenon', 'plane', 'scheme', 'vanguard', 'kindred'] })).not.toThrow()
    expect(() => searchCollectionInput.parse({ types: ['hero'] })).toThrow()
  })
  it('basic and snow need card facts and cannot be mixed with no_card_facts', () => {
    expect(() => searchCollectionInput.parse({ basic: true, no_card_facts: true })).toThrow()
  })
  it('group_by type: Kindred is its own bucket and the groups add up to the total', async () => {
    const { db } = tlWorld(['Mystery'])
    const r = await sum(db as never, { group_by: 'type', include_proxies: true })
    const labels = Object.fromEntries(r.groups.map((g) => [g.label, g.copies]))
    expect(labels).toEqual({ Land: 3, Creature: 4, Kindred: 1, Instant: 2, 'No facts': 1 })
    expect(r.groups.reduce((n, g) => n + g.copies, 0)).toBe(TL.length + 1)
  })
})
