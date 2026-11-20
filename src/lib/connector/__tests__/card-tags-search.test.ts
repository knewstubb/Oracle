// Tags in Claude's tools: the search_collection Tag filter, Tags on each result, and the wording.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchCollection, searchCollectionInput } from '../tools/search-collection'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { CONNECTOR_TOOLS, toJsonSchema } from '../tools'
import { clearCardTagCaches } from '../../card-tags-read'
import { mockDb } from './mock-db'
import { copyRow, resetIds, viewDb, type LibCard } from './view-db'

const U = 'user-1'
const card = (name: string, type_line: string, mana_value = 1): LibCard => ({ name, type_line, oracle_text: 'Some rules text.', mana_value, color_identity: '' })
const LIB: LibCard[] = [
  card('Sol Ring', 'Artifact'),
  card('Warren Soultrader', 'Creature — Goblin', 4),
  card('Viscera Seer', 'Creature — Vampire Wizard', 1),
  card('Smothering Tithe', 'Enchantment', 4),
  card('Forest', 'Basic Land — Forest', 0),
]
const TAGS: Record<string, string[]> = {
  'o-Sol Ring': ['ramp'],
  'o-Warren Soultrader': ['ramp', 'token_generator', 'sacrifice_outlet', 'treasure_generator'],
  'o-Viscera Seer': ['sacrifice_outlet'],
  'o-Smothering Tithe': ['ramp', 'stax_tax', 'token_generator', 'treasure_generator'],
}
type Res = { ok: true; items: { name: string; tags?: string[]; tags_unavailable?: boolean }[]; total: number; filterCoverage?: { note: string } }
type Opt = Parameters<typeof copyRow>[1]
function setup(spec: [string, Opt?][], more: Parameters<typeof viewDb>[1] = {}) {
  resetIds()
  const rows = spec.map(([n, o]) => copyRow(LIB.find((c) => c.name === n)!, o))
  return viewDb(rows, { library: LIB, tags: TAGS, ...more })
}
const box = { box: 'Unsorted' }
const run = async (db: never, input: object) => (await searchCollection({ db, userId: U }, searchCollectionInput.parse(input))) as never as Res
const names = (r: Res) => r.items.map((i) => i.name)
const ALL: [string, Opt?][] = [['Sol Ring', box], ['Warren Soultrader', box], ['Viscera Seer', { deck: 'Korvold' }], ['Smothering Tithe', box], ['Forest', box]]

beforeEach(() => {
  clearCardTagCaches()
  vi.restoreAllMocks()
})

describe('search_collection tags filter', () => {
  it('owned cards tagged Sacrifice outlet that are not in a deck, in one call', async () => {
    const { db } = setup(ALL)
    expect(names(await run(db as never, { tags: ['Sacrifice outlet'], only_free: true }))).toEqual(['Warren Soultrader'])
    expect(names(await run(db as never, { tags: ['Sacrifice outlet'] }))).toEqual(['Viscera Seer', 'Warren Soultrader'])
  })
  it('all of them is the default; any is one setting away', async () => {
    const { db } = setup(ALL)
    expect(names(await run(db as never, { tags: ['Sacrifice outlet', 'Treasure generator'] }))).toEqual(['Warren Soultrader'])
    expect(names(await run(db as never, { tags: ['Sacrifice outlet', 'Treasure generator'], tags_match: 'any' }))).toEqual(['Smothering Tithe', 'Viscera Seer', 'Warren Soultrader'])
  })
  it('works with the other filters (types, location)', async () => {
    const { db } = setup(ALL)
    expect(names(await run(db as never, { tags: ['Ramp'], types: ['creature'] }))).toEqual(['Warren Soultrader'])
    expect(names(await run(db as never, { tags: ['Sacrifice outlet'], location: 'Korvold' }))).toEqual(['Viscera Seer'])
  })
  it('takes the Tag name in any case, or its stored key', async () => {
    const { db } = setup(ALL)
    expect(names(await run(db as never, { tags: ['stax / TAX'] }))).toEqual(['Smothering Tithe'])
    expect(names(await run(db as never, { tags: ['stax_tax'] }))).toEqual(['Smothering Tithe'])
  })
  it('a Tag name that is not one of the 40 is refused, and the message lists the 40', () => {
    const r = searchCollectionInput.safeParse({ tags: ['Removal spell'] })
    expect(r.success).toBe(false)
    const msg = JSON.stringify(r.error?.issues)
    expect(msg).toContain('Removal spell')
    expect(msg).toContain('Sacrifice outlet')
    expect(msg).toContain('Blink')
  })
  it('tags_match without tags is refused; the Tag filter cannot be combined with no_card_facts', () => {
    expect(searchCollectionInput.safeParse({ tags_match: 'any' }).success).toBe(false)
    expect(searchCollectionInput.safeParse({ tags: ['Ramp'], no_card_facts: true }).success).toBe(false)
  })
  it('a card with no card data never matches, and the coverage note says so', async () => {
    resetIds()
    const rows = [copyRow(LIB[0], box), copyRow(null, { name: 'Mystery', ...box })]
    const { db } = viewDb(rows, { library: LIB, tags: { ...TAGS, 'o-Mystery': ['ramp'] } })
    const r = await run(db as never, { tags: ['Ramp'] })
    expect(names(r)).toEqual(['Sol Ring'])
    expect(r.filterCoverage?.note).toMatch(/Tag filter/)
  })
  it('a failed Tag read is a lookup failure, never an empty list', async () => {
    const inner = setup(ALL).db
    const db = { select: (t: string, c: string, o?: never) => (t === 'ref_card_tags' ? mockDb(() => ({ error: { message: 'down' } })).db.select(t, c, o) : inner.select(t, c, o)) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await searchCollection({ db: db as never, userId: U }, searchCollectionInput.parse({ tags: ['Ramp'] }))).toMatchObject({ ok: false, error: { code: 'LOOKUP_FAILED' } })
  })
})

describe('Tags on each result', () => {
  it('every Tag the card has (not cut to five), broad first then mechanic, in list order', async () => {
    const { db } = setup(ALL)
    const r = await run(db as never, {})
    const byName = Object.fromEntries(r.items.map((i) => [i.name, i]))
    expect(byName['Warren Soultrader'].tags).toEqual(['Ramp', 'Token generator', 'Sacrifice outlet', 'Treasure generator'])
    expect(byName['Smothering Tithe'].tags).toEqual(['Ramp', 'Stax / tax', 'Token generator', 'Treasure generator'])
  })
  it('a card with no Tag has an empty list, which is different from "could not read"', async () => {
    const { db } = setup(ALL)
    const r = await run(db as never, { query: 'Forest' })
    expect(r.items[0].tags).toEqual([])
    expect(r.items[0].tags_unavailable).toBeUndefined()
  })
  it('a failed Tag read still returns the cards, marked tags_unavailable, with no tags list', async () => {
    const inner = setup(ALL).db
    const db = { select: (t: string, c: string, o?: never) => (t === 'ref_card_tags' ? mockDb(() => ({ error: { message: 'down' } })).db.select(t, c, o) : inner.select(t, c, o)) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await run(db as never, {})
    expect(r.items.length).toBe(5)
    for (const i of r.items) {
      expect(i.tags_unavailable).toBe(true)
      expect(i.tags).toBeUndefined()
    }
  })
  it('one batched Tag read for the page, not one per card', async () => {
    const { db, queries } = setup(ALL)
    await run(db as never, {})
    expect(queries.filter((q) => q.table === 'ref_card_tags').length).toBe(1)
  })
})

describe('get_deck Tags', () => {
  const DECK = { id: 1, name: 'Korvold', commander_name: 'Korvold', format: 'commander', status: 'active', bracket: null, card_count: 2, is_active: true }
  const slot = (id: number, name: string, printing: string | null) => ({ id, card_name: name, quantity: 1, categories: null, is_commander: false, ownership_status: 'original', is_generic: false, copy_id: null, scryfall_id: printing, requested_finish: null })
  const deckDb = (tagsRead?: () => object) =>
    mockDb((q) => {
      if (q.table === 'decks') return { data: [DECK] }
      if (q.table === 'deck_cards') return { data: [slot(1, 'Sol Ring', 'p-sol'), slot(2, 'Forest', 'p-forest'), slot(3, 'Mystery', null)] }
      if (q.table === 'ref_printings' && q.columns === 'scryfall_id, oracle_id') return { data: [{ scryfall_id: 'p-sol', oracle_id: 'o-Sol Ring' }, { scryfall_id: 'p-forest', oracle_id: 'o-Forest' }] }
      if (q.table === 'ref_card_tags') return tagsRead ? tagsRead() : { data: Object.entries(TAGS).flatMap(([id, ks]) => ks.map((k) => ({ oracle_id: id, tag_key: k }))).filter((r) => (q.filters.find((f) => f.op === 'in')?.args[1] as string[]).includes(r.oracle_id)) }
      return { data: [] }
    })
  it('each card carries its Tags, in one batched read; a card with no printing is marked, not shown as having none', async () => {
    const { db, queries } = deckDb()
    const r = (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }))) as never as { mainboard: { items: { name: string; tags?: string[]; tags_unavailable?: boolean }[] } }
    const by = Object.fromEntries(r.mainboard.items.map((i) => [i.name, i]))
    expect(by['Sol Ring'].tags).toEqual(['Ramp'])
    expect(by['Forest'].tags).toEqual([])
    expect(by['Mystery'].tags_unavailable).toBe(true)
    expect(queries.filter((q) => q.table === 'ref_card_tags').length).toBe(1)
  })
  it('deck health, Categories and card order are the same with or without Tags', async () => {
    const health = async () => ({ ok: true as const, status: 'computed' as const })
    const withTags = (await getDeck({ db: deckDb().db, userId: U }, getDeckInput.parse({ deck_id: 1 }), health as never)) as never as { health: unknown; mainboard: { items: { name: string; categories: string[] }[] } }
    clearCardTagCaches()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const noTags = (await getDeck({ db: deckDb(() => ({ error: { message: 'down' } })).db, userId: U }, getDeckInput.parse({ deck_id: 1 }), health as never)) as never as typeof withTags
    expect(withTags.health).toEqual(noTags.health)
    expect(withTags.mainboard.items.map((i) => [i.name, i.categories])).toEqual(noTags.mainboard.items.map((i) => [i.name, i.categories]))
  })
})

describe('tool wording', () => {
  const d = (n: string) => CONNECTOR_TOOLS.find((t) => t.name === n)!.description
  it('says Tags describe what a card does in any deck, cannot be changed, and are separate from a Category', () => {
    for (const n of ['search_collection', 'get_deck']) {
      expect(d(n)).toMatch(/Tags say what a card does in any deck/)
      expect(d(n)).toMatch(/cannot be changed/)
      expect(d(n)).toMatch(/separate from (a Category|Categories)/)
      expect(d(n)).toContain('tags_unavailable')
    }
  })
  it('the old role filter says it is not the same as Tags', () => {
    expect(d('search_collection')).toMatch(/not the same as Tags/)
    const schema = JSON.stringify(toJsonSchema(CONNECTOR_TOOLS.find((t) => t.name === 'search_collection')!.inputSchema))
    expect(schema).toContain('Not the same as Tags.')
  })
})
