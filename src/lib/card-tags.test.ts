import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CARD_TAGS,
  CARD_TAG_KEYS,
  allMappedScryfallSlugs,
  buildCardTagRows,
  buildDryRunReport,
  buildScryfallTagIndex,
  computeTagCards,
  formatDryRunReport,
  oracleIdsForScryfallTag,
  parseScryfallTagLines,
  type ScryfallTagRecord,
} from './card-tags'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** One Scryfall tag record per slug, each carrying the given cards. */
function rec(slug: string, cards: string[], opts: { id?: string; children?: string[]; type?: string } = {}): ScryfallTagRecord {
  return { id: opts.id ?? `id-${slug}`, slug, type: opts.type ?? 'oracle', child_ids: opts.children ?? [], taggings: cards.map(oracle_id => ({ oracle_id })) }
}

/** An index with every slug the mapping uses; slug i carries card uuid(i+1) only. */
function fullIndex(extra: ScryfallTagRecord[] = []) {
  const slugs = allMappedScryfallSlugs()
  const records = slugs.map((s, i) => rec(s, [uuid(i + 1)]))
  return { index: buildScryfallTagIndex([...records, ...extra]), slugs }
}

describe('the 40 Tags', () => {
  it('has 40 Tags: 13 broad and 27 mechanic, with unique keys and display order', () => {
    expect(CARD_TAGS).toHaveLength(40)
    expect(CARD_TAGS.filter(t => t.kind === 'broad')).toHaveLength(13)
    expect(CARD_TAGS.filter(t => t.kind === 'mechanic')).toHaveLength(27)
    expect(new Set(CARD_TAG_KEYS).size).toBe(40)
    expect(new Set(CARD_TAGS.map(t => t.displayName)).size).toBe(40)
    // broad first, then mechanic
    expect(CARD_TAGS.slice(0, 13).every(t => t.kind === 'broad')).toBe(true)
  })

  it('uses stable snake_case keys, never a scryfall id (D-003)', () => {
    for (const t of CARD_TAGS) expect(t.key).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('does not contain the dropped Tags (Lands matter, Pinger) or the nested ones', () => {
    const names = CARD_TAGS.map(t => t.displayName.toLowerCase())
    for (const dropped of ['lands matter', 'pinger', 'mana rock', 'mana dork', 'land ramp', 'reanimation', 'spot removal', 'repeatable draw']) {
      expect(names).not.toContain(dropped)
    }
    const used = allMappedScryfallSlugs()
    for (const slug of ['lands-matter', 'pinger', 'mana-rock', 'mana-dork', 'land-ramp', 'reanimation', 'spot-removal', 'repeatable-draw']) {
      expect(used).not.toContain(slug)
    }
  })

  it.each(CARD_TAGS.map(t => [t.key, t] as const))('%s: each Scryfall tag it maps from gives a card that Tag', (_key, tag) => {
    for (const slug of tag.scryfallTags) {
      const card = uuid(900)
      const { index } = fullIndex()
      // Replace this slug's record so it carries only one known card.
      const records = [...index.bySlug.values()].filter(r => r.slug !== slug)
      const idx = buildScryfallTagIndex([...records, rec(slug, [card])])
      const tagCards = computeTagCards(idx)
      expect(tagCards.get(tag.key)!.has(card)).toBe(true)
    }
  })
})

describe('sub-tags, exclusions and nesting', () => {
  it('counts a card carried only by a sub-tag (Reanimation under Recursion, Mana rock under Ramp)', () => {
    const { index } = fullIndex()
    const records = [...index.bySlug.values()].map(r => {
      if (r.slug === 'recursion') return { ...r, child_ids: ['id-reanimation'] }
      if (r.slug === 'ramp') return { ...r, child_ids: ['id-mana-rock'] }
      return r
    })
    const idx = buildScryfallTagIndex([...records, rec('reanimation', [uuid(901)]), rec('mana-rock', [uuid(902)])])
    const t = computeTagCards(idx)
    expect(t.get('recursion')!.has(uuid(901))).toBe(true)
    expect(t.get('ramp')!.has(uuid(902))).toBe(true)
    // Nested tags do not become Tags of their own.
    for (const [key, cards] of t) {
      if (key !== 'recursion') expect(cards.has(uuid(901))).toBe(false)
      if (key !== 'ramp') expect(cards.has(uuid(902))).toBe(false)
    }
  })

  it('follows sub-tags several levels down and survives a loop', () => {
    const a = rec('a', [uuid(1)], { id: 'A', children: ['B'] })
    const b = rec('b', [uuid(2)], { id: 'B', children: ['C'] })
    const c = rec('c', [uuid(3)], { id: 'C', children: ['A'] })
    const idx = buildScryfallTagIndex([a, b, c])
    expect([...oracleIdsForScryfallTag(idx, 'a')].sort()).toEqual([uuid(1), uuid(2), uuid(3)])
  })

  it('Targeted removal leaves out sweepers and land removal, including their sub-tags', () => {
    const { index } = fullIndex()
    const records = [...index.bySlug.values()].map(r =>
      r.slug === 'removal' ? { ...r, taggings: [{ oracle_id: uuid(910) }], child_ids: ['id-removal-creature', 'id-sweeper', 'id-removal-land'] } : r
    )
    const idx = buildScryfallTagIndex([
      ...records.filter(r => r.slug !== 'sweeper'),
      rec('sweeper', [uuid(911)], { children: ['id-sweeper-sub'] }),
      rec('sweeper-sub', [uuid(912)]),
      rec('removal-creature', [uuid(913)]),
      rec('removal-land', [uuid(914)]),
    ])
    const t = computeTagCards(idx)
    const removal = t.get('targeted_removal')!
    expect(removal.has(uuid(910))).toBe(true)
    expect(removal.has(uuid(913))).toBe(true)
    for (const n of [911, 912, 914]) expect(removal.has(uuid(n))).toBe(false)
    // The sweeper cards are Board wipe.
    expect(t.get('board_wipe')!.has(uuid(911))).toBe(true)
    expect(t.get('board_wipe')!.has(uuid(912))).toBe(true)
  })

  it('Steal / gain control leaves out reanimate-from-opponent', () => {
    const { index } = fullIndex()
    const records = [...index.bySlug.values()].map(r => (r.slug === 'theft' ? { ...r, child_ids: ['id-reanimate-from-opponent'] } : r))
    const idx = buildScryfallTagIndex([...records.filter(r => r.slug !== 'reanimate-from-opponent'), rec('reanimate-from-opponent', [uuid(920)])])
    expect(computeTagCards(idx).get('steal_control')!.has(uuid(920))).toBe(false)
  })

  it('ignores art (illustration) tags', () => {
    const idx = buildScryfallTagIndex([rec('ramp', [uuid(1)], { type: 'illustration' }), rec('draw', [uuid(2)])])
    expect(idx.bySlug.has('ramp')).toBe(false)
    expect(idx.bySlug.has('draw')).toBe(true)
  })

  it('refuses a Scryfall tag that is missing from the data instead of silently skipping it', () => {
    const idx = buildScryfallTagIndex([rec('draw', [uuid(1)])])
    expect(() => computeTagCards(idx)).toThrow(/is not in the tag data/)
  })
})

describe('rows (oracle_id keys, D-003)', () => {
  it('writes only oracle_id and Tag key, only for cards in the library, in a stable order', () => {
    const { index } = fullIndex()
    const tagCards = computeTagCards(index)
    const library = new Set([uuid(1), uuid(2), uuid(3), uuid(4)])
    const rows = buildCardTagRows(tagCards, library)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(['oracle_id', 'tag_key'])
      expect(library.has(r.oracle_id)).toBe(true)
      expect(CARD_TAG_KEYS).toContain(r.tag_key)
    }
    expect(new Set(rows.map(r => `${r.oracle_id}|${r.tag_key}`)).size).toBe(rows.length)
    expect(buildCardTagRows(computeTagCards(index), library)).toEqual(rows)
  })

  it('a card in the Scryfall data but not in the library gets no row', () => {
    const { index } = fullIndex()
    expect(buildCardTagRows(computeTagCards(index), new Set([uuid(99999)]))).toEqual([])
  })
})

describe('dry-run report', () => {
  const { index } = fullIndex()
  const tagCards = computeTagCards(index)
  const library = new Set(Array.from({ length: 80 }, (_, i) => uuid(i + 1)))
  const collection = new Set([uuid(1), uuid(2), uuid(79)])
  const rows = buildCardTagRows(tagCards, library)

  it('has one entry per Tag and coverage for the library and the collection', () => {
    const r = buildDryRunReport(rows, library, collection, '2026-08-07')
    expect(r.perTag).toHaveLength(40)
    expect(r.perTag.map(t => t.key)).toEqual([...CARD_TAG_KEYS])
    expect(r.totalRows).toBe(rows.length)
    expect(r.perTag.reduce((n, t) => n + t.rows, 0)).toBe(rows.length)
    expect(r.library.cards).toBe(80)
    expect(r.library.withTag + r.library.withoutTag).toBe(80)
    expect(r.collection!.cards).toBe(3)
    expect(r.scryfallCopyDate).toBe('2026-08-07')
    expect(Object.keys(r).sort()).toEqual(['collection', 'library', 'perTag', 'scryfallCopyDate', 'totalRows'])
    expect(Object.keys(r.library).sort()).toEqual(['cards', 'withTag', 'withTagPercent', 'withoutTag'])
  })

  it('has no collection section without a user, and prints a readable summary', () => {
    const r = buildDryRunReport(rows, library, null, null)
    expect(r.collection).toBeNull()
    const text = formatDryRunReport(r)
    expect(text).toContain('All Commander-legal cards: 80 cards')
    expect(text).not.toContain('Collection:')
    for (const t of CARD_TAGS) expect(text).toContain(t.displayName)
    expect(formatDryRunReport(buildDryRunReport(rows, library, collection, null))).toContain('Collection: 3 cards')
  })
})

describe('the stored Tag list in the draft matches the code', () => {
  const draft = resolve(__dirname, '../../supabase/drafts/20261120100000_tags_fill_tag_tables.draft.sql')
  it('seeds the same 40 keys, names, kinds, orders and Scryfall tags', () => {
    const sql = readFileSync(draft, 'utf8')
    const rows = [...sql.matchAll(/^\s+\('([a-z0-9_]+)', '((?:[^']|'')*)', '(broad|mechanic)', ARRAY\[([^\]]*)\]::text\[\], (?:'\{\}'::text\[\]|ARRAY\[([^\]]*)\]::text\[\]), (\d+)\)/gm)]
    expect(rows).toHaveLength(40)
    const list = (s: string | undefined) => (s ? [...s.matchAll(/'([^']+)'/g)].map(m => m[1]) : [])
    rows.forEach((m, i) => {
      const t = CARD_TAGS[i]
      expect(m[1]).toBe(t.key)
      expect(m[2].replace(/''/g, "'")).toBe(t.displayName)
      expect(m[3]).toBe(t.kind)
      expect(list(m[4])).toEqual(t.scryfallTags)
      expect(list(m[5])).toEqual(t.exclude ?? [])
      expect(Number(m[6])).toBe(i + 1)
    })
  })
})

// Runs only where the local Scryfall copy exists (it is git-ignored). Guards against renamed or removed Scryfall tags.
const realFile = [resolve(process.cwd(), 'data/scryfall-tags/oracle-tags.jsonl'), '/Users/bradknewstubb/Developer/Personal/oracle_app/data/scryfall-tags/oracle-tags.jsonl'].find(existsSync)
describe.skipIf(!realFile)('against the real local Scryfall copy', () => {
  it('every Scryfall tag name in the mapping exists, and every Tag gets cards', () => {
    const index = buildScryfallTagIndex(parseScryfallTagLines(readFileSync(realFile!, 'utf8')))
    expect(allMappedScryfallSlugs().filter(s => !index.bySlug.has(s))).toEqual([])
    const t = computeTagCards(index)
    for (const tag of CARD_TAGS) expect(t.get(tag.key)!.size, tag.key).toBeGreaterThan(100)
  })
})
