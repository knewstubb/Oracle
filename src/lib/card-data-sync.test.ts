import { describe, it, expect, vi } from 'vitest'
import {
  cardToRow,
  dedupeRows,
  sanitizeCmc,
  upsertBatch,
  upsertPrintingsFromLines,
  runCardDataSync,
  getLastSync,
  type ScryfallCard,
} from './card-data-sync'

const card = (id: string, extra: Partial<ScryfallCard> = {}): ScryfallCard => ({
  id,
  oracle_id: 'o-' + id,
  name: 'Card ' + id,
  set: 'sos',
  set_name: 'Set',
  collector_number: '1',
  rarity: 'rare',
  cmc: 2,
  ...extra,
})
async function* lines(cards: ScryfallCard[]) {
  for (const c of cards) yield JSON.stringify(c)
}

/** Fake supabase: records upserts; rejects any batch containing a poisoned id. */
function fakeDb(poison: string[] = []) {
  const upsert = vi.fn(async (rows: Array<{ scryfall_id: string }>) =>
    rows.some((r) => poison.includes(r.scryfall_id))
      ? { error: { message: 'numeric field overflow' } }
      : { error: null }
  )
  const from = vi.fn((table: string) => ({ upsert: (rows: never) => upsert(rows), table }))
  return { db: { from } as never, upsert, from }
}

describe('row conversion', () => {
  it('nulls cmc that does not fit NUMERIC(5,2) (Gleemax = 1,000,000)', () => {
    expect(sanitizeCmc(1_000_000)).toBeNull()
    expect(sanitizeCmc(999.99)).toBe(999.99)
    expect(sanitizeCmc(7)).toBe(7)
    expect(sanitizeCmc(undefined)).toBeNull()
    expect(cardToRow(card('g', { cmc: 1_000_000 }), 'now').cmc).toBeNull()
  })
  it('uses first face images for double-faced cards', () => {
    const row = cardToRow(card('d', { card_faces: [{ image_uris: { small: 's' } }] }), 'now')
    expect(row.image_uri_small).toBe('s')
  })
  it('dedupes by scryfall_id keeping the last', () => {
    const rows = [cardToRow(card('a', { name: 'x' }), 'n'), cardToRow(card('a', { name: 'y' }), 'n')]
    const out = dedupeRows(rows)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('y')
  })
})

describe('upsertBatch', () => {
  it('writes to ref_printings and counts rows', async () => {
    const { db, from } = fakeDb()
    const rows = ['a', 'b'].map((i) => cardToRow(card(i), 'n'))
    expect(await upsertBatch(db, rows)).toMatchObject({ upserted: 2, failed: 0 })
    expect(from).toHaveBeenCalledWith('ref_printings')
  })
  it('isolates one bad row and reports its id and the error', async () => {
    const { db } = fakeDb(['c'])
    const onError = vi.fn()
    const rows = ['a', 'b', 'c', 'd', 'e'].map((i) => cardToRow(card(i), 'n'))
    const r = await upsertBatch(db, rows, onError)
    expect(r).toMatchObject({ upserted: 4, failed: 1, failedIds: ['c'], firstError: 'numeric field overflow' })
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('c'))
  })
})

describe('upsertPrintingsFromLines', () => {
  it('skips rows without oracle_id, counts malformed lines, batches by 500', async () => {
    const { db, upsert } = fakeDb()
    const cards = Array.from({ length: 501 }, (_, i) => card('id' + i))
    const noOracle = { ...card('tok'), oracle_id: undefined }
    async function* all() {
      yield* lines([...cards, noOracle])
      yield 'not json'
      yield ''
    }
    const r = await upsertPrintingsFromLines(db, all())
    expect(r).toMatchObject({ total: 501, upserted: 501, failed: 1 })
    expect(upsert).toHaveBeenCalledTimes(2)
    expect(upsert.mock.calls[0][0]).toHaveLength(500)
    expect(upsert.mock.calls[1][0]).toHaveLength(1) // final batch goes to the same table
  })
  it('dry run writes nothing', async () => {
    const { db, upsert } = fakeDb()
    const r = await upsertPrintingsFromLines(db, lines([card('a')]), { dryRun: true })
    expect(r.upserted).toBe(1)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('sync_meta + skip logic', () => {
  it('getLastSync returns null on error', async () => {
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }),
    } as never
    expect(await getLastSync(db)).toBeNull()
  })
  it('skips when already current and not forced (no download, no writes)', async () => {
    const upsert = vi.fn()
    const db = {
      from: (t: string) =>
        t === 'sync_meta'
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: '2026-10-19T21:05:50.153+00:00' }, error: null }) }) }), upsert }
          : { upsert },
    } as never
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ type: 'default_cards', jsonl_download_uri: 'http://x', updated_at: '2026-10-19T21:05:50.153+00:00' }] }))
    ) as unknown as typeof fetch
    const r = await runCardDataSync(db, { fetchImpl })
    expect(r.skipped).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(upsert).not.toHaveBeenCalled()
  })
})
