import { describe, it, expect } from 'vitest'
import { buildScryfallTagIndex, allMappedScryfallSlugs, CARD_TAG_KEYS, type CardTagRow, type ScryfallTagRecord } from './card-tags'
import { FILL_BATCH_SIZE, parseFillArgs, runFill, type TagStore } from './card-tags-fill'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Every mapped Scryfall tag carries a few cards; cards 1..N. */
function index(cardsPerTag = 3) {
  const records: ScryfallTagRecord[] = allMappedScryfallSlugs().map((slug, i) => ({
    id: `id-${slug}`,
    slug,
    type: 'oracle',
    child_ids: [],
    taggings: Array.from({ length: cardsPerTag }, (_, k) => ({ oracle_id: uuid(i * 7 + k + 1) })),
  }))
  return buildScryfallTagIndex(records)
}

/** In-memory store that behaves like ref_card_tags (primary key oracle_id + tag_key + source, on conflict do nothing). */
class MemoryStore implements TagStore {
  rows = new Map<string, { oracle_id: string; tag_key: string; source: string; run_id: string }>()
  writes = 0
  writeSizes: number[] = []
  constructor(public legal: string[], public owned: string[] = [], public tagList: string[] = [...CARD_TAG_KEYS]) {}
  async loadLegalOracleIds() { return this.legal }
  async loadCollectionOracleIds() { return this.owned }
  async loadTagListKeys() { return this.tagList }
  async insertRows(rows: readonly CardTagRow[], source: string, runId: string) {
    this.writes++
    this.writeSizes.push(rows.length)
    let n = 0
    for (const r of rows) {
      const k = `${r.oracle_id}|${r.tag_key}|${source}`
      if (!this.rows.has(k)) { this.rows.set(k, { ...r, source, run_id: runId }); n++ }
    }
    return n
  }
  async deleteRun(runId: string) {
    let n = 0
    for (const [k, v] of this.rows) if (v.run_id === runId) { this.rows.delete(k); n++ }
    return n
  }
  async countRows() { return this.rows.size }
}

const allCards = Array.from({ length: 400 }, (_, i) => uuid(i + 1))
const snapshot = (s: MemoryStore) => JSON.stringify([...s.rows.entries()].sort(([a], [b]) => a.localeCompare(b)))

describe('fill job', () => {
  it('a dry run reads and reports but writes nothing', async () => {
    const store = new MemoryStore(allCards, allCards.slice(0, 20))
    const r = await runFill(store, index(), { dryRun: true, runId: uuid(9001), userId: uuid(5), scryfallCopyDate: '2026-08-07' })
    expect(store.writes).toBe(0)
    expect(store.rows.size).toBe(0)
    expect(r.runId).toBeNull()
    expect(r.rowsPlanned).toBeGreaterThan(0)
    expect(r.report.totalRows).toBe(r.rowsPlanned)
    expect(r.report.collection!.cards).toBe(20)
    expect(r.report.perTag).toHaveLength(40)
  })

  it('a real run writes every planned row, all with the one run id and source "scryfall"', async () => {
    const store = new MemoryStore(allCards)
    const r = await runFill(store, index(), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })
    expect(r.rowsInserted).toBe(r.rowsPlanned)
    expect(store.rows.size).toBe(r.rowsPlanned)
    for (const v of store.rows.values()) {
      expect(v.run_id).toBe(uuid(9001))
      expect(v.source).toBe('scryfall')
    }
  })

  it('is idempotent: a second run (new run id) adds nothing and changes nothing', async () => {
    const store = new MemoryStore(allCards)
    await runFill(store, index(), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })
    const before = snapshot(store)
    const second = await runFill(store, index(), { dryRun: false, runId: uuid(9002), userId: null, scryfallCopyDate: null })
    expect(second.rowsInserted).toBe(0)
    expect(snapshot(store)).toBe(before)
  })

  it('writes in batches no larger than the batch size', async () => {
    const store = new MemoryStore(allCards)
    const r = await runFill(store, index(40), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })
    expect(r.rowsPlanned).toBeGreaterThan(FILL_BATCH_SIZE)
    expect(store.writes).toBeGreaterThan(1)
    expect(Math.max(...store.writeSizes)).toBeLessThanOrEqual(FILL_BATCH_SIZE)
    expect(store.writeSizes.reduce((a, b) => a + b, 0)).toBe(r.rowsPlanned)
  })

  it('undo removes exactly one run and leaves rows from other runs', async () => {
    const store = new MemoryStore(allCards)
    await runFill(store, index(2), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })
    const first = store.rows.size
    // A second run over a bigger tag copy adds only the new rows.
    const r2 = await runFill(store, index(5), { dryRun: false, runId: uuid(9002), userId: null, scryfallCopyDate: null })
    expect(r2.rowsInserted).toBeGreaterThan(0)
    expect(await store.deleteRun(uuid(9002))).toBe(r2.rowsInserted)
    expect(store.rows.size).toBe(first)
    expect(await store.deleteRun(uuid(9001))).toBe(first)
    expect(store.rows.size).toBe(0)
  })

  it('refuses a real run when the stored Tag list is missing or different', async () => {
    const store = new MemoryStore(allCards, [], [])
    await expect(runFill(store, index(), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })).rejects.toThrow(/Apply the approved draft first/)
    expect(store.writes).toBe(0)
  })

  it('only cards outside the library are skipped', async () => {
    const store = new MemoryStore(allCards.slice(0, 5))
    await runFill(store, index(), { dryRun: false, runId: uuid(9001), userId: null, scryfallCopyDate: null })
    for (const v of store.rows.values()) expect(allCards.slice(0, 5)).toContain(v.oracle_id)
  })
})

describe('command line', () => {
  it('reads the options', () => {
    expect(parseFillArgs(['--dry-run', '--user', uuid(1)])).toMatchObject({ dryRun: true, userId: uuid(1), undoRun: null })
    expect(parseFillArgs(['--undo-run', uuid(2)]).undoRun).toBe(uuid(2))
    expect(parseFillArgs([])).toMatchObject({ dryRun: false, undoRun: null, runId: null })
  })
  it('refuses bad input', () => {
    expect(() => parseFillArgs(['--undo-run'])).toThrow()
    expect(() => parseFillArgs(['--undo-run', 'nope'])).toThrow(/UUID/)
    expect(() => parseFillArgs(['--bogus'])).toThrow(/Unknown option/)
    expect(() => parseFillArgs(['--dry-run', '--undo-run', uuid(2)])).toThrow()
  })
})
