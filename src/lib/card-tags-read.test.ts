import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_TAGS, clearCardTagCaches, getCardTags, oracleIdsWithTags, resolveTag, supabaseTagReader, type TagReadResult, type TagRow, type TagRowReader } from './card-tags-read'
import { CARD_TAGS } from './card-tags'

/** An in-memory ref_card_tags that records every read. */
function fakeReader(rows: TagRow[], opts: { failOn?: 'byOracleIds' | 'byTagKey'; pageLimit?: number } = {}) {
  const calls: { kind: string; arg: unknown; from: number; to: number }[] = []
  let inFlight = 0
  let maxInFlight = 0
  const reply = async (kind: 'byOracleIds' | 'byTagKey', arg: unknown, from: number, to: number, match: (r: TagRow) => boolean): Promise<TagReadResult> => {
    calls.push({ kind, arg, from, to })
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setTimeout(r, 1))
    inFlight--
    if (opts.failOn === kind) return { data: null, error: { message: 'down' } }
    return { data: rows.filter(match).slice(from, to + 1), error: null }
  }
  const reader: TagRowReader = {
    byOracleIds: (ids, from, to) => reply('byOracleIds', ids, from, to, (r) => ids.includes(r.oracle_id)),
    byTagKey: (key, from, to) => reply('byTagKey', key, from, to, (r) => r.tag_key === key),
  }
  return { reader, calls, maxInFlight: () => maxInFlight }
}

beforeEach(() => {
  clearCardTagCaches()
  vi.restoreAllMocks()
})

describe('getCardTags', () => {
  it('returns broad Tags first, then mechanic, each in the Tag list order, whatever order they are stored in', async () => {
    const { reader } = fakeReader([
      { oracle_id: 'a', tag_key: 'treasure_generator' },
      { oracle_id: 'a', tag_key: 'ramp' },
      { oracle_id: 'a', tag_key: 'sacrifice_outlet' },
      { oracle_id: 'a', tag_key: 'token_generator' },
    ])
    const r = await getCardTags(reader, ['a'])
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.byOracleId.get('a')!.map((t) => t.name)).toEqual(['Ramp', 'Token generator', 'Sacrifice outlet', 'Treasure generator'])
    expect(r.byOracleId.get('a')![0]).toEqual({ key: 'ramp', name: 'Ramp', kind: 'broad' })
  })

  it('gives every requested id an answer: a card with no Tag is an empty list', async () => {
    const { reader } = fakeReader([{ oracle_id: 'a', tag_key: 'ramp' }])
    const r = await getCardTags(reader, ['a', 'none'])
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.byOracleId.get('none')).toEqual([])
    expect(r.byOracleId.size).toBe(2)
  })

  it('reads 250 cards in 3 batched reads (100 ids each), at most 4 at once, never one per card', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`)
    const { reader, calls } = fakeReader(ids.map((id) => ({ oracle_id: id, tag_key: 'ramp' })))
    const r = await getCardTags(reader, ids)
    expect(r.status).toBe('ok')
    expect(calls.map((c) => (c.arg as string[]).length).sort((a, b) => a - b)).toEqual([50, 100, 100])
  })

  it('never runs more than 4 reads at once', async () => {
    const ids = Array.from({ length: 900 }, (_, i) => `id-${i}`)
    const { reader, calls, maxInFlight } = fakeReader([])
    await getCardTags(reader, ids)
    expect(calls.length).toBe(9)
    expect(maxInFlight()).toBeLessThanOrEqual(4)
  })

  it('follows a page of 1,000 rows until a short page, so the database row cap never cuts a card short', async () => {
    const keys = CARD_TAGS.map((t) => t.key)
    const rows: TagRow[] = []
    // 100 cards x 40 Tags = 4,000 rows for one batch of 100 ids
    for (let i = 0; i < 100; i++) for (const k of keys) rows.push({ oracle_id: `id-${i}`, tag_key: k })
    const { reader, calls } = fakeReader(rows)
    const r = await getCardTags(reader, Array.from({ length: 100 }, (_, i) => `id-${i}`))
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(calls.length).toBe(5) // 4 full pages and one empty page
    expect(r.byOracleId.get('id-99')!.length).toBe(40)
  })

  it('a failed read is an error, never "no Tags", and is logged once without card names', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { reader } = fakeReader([{ oracle_id: 'Sol Ring', tag_key: 'ramp' }], { failOn: 'byOracleIds' })
    const r = await getCardTags(reader, ['Sol Ring'])
    expect(r).toEqual({ status: 'error' })
    expect(err).toHaveBeenCalledTimes(1)
    expect(String(err.mock.calls[0][0])).not.toContain('Sol Ring')
  })

  it('skips a stored Tag key that is not in the app list, with a warning, and does not crash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { reader } = fakeReader([{ oracle_id: 'a', tag_key: 'ramp' }, { oracle_id: 'a', tag_key: 'brand_new_tag' }])
    const r = await getCardTags(reader, ['a'])
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.byOracleId.get('a')!.map((t) => t.key)).toEqual(['ramp'])
    expect(warn).toHaveBeenCalled()
  })

  it('caches: asking again for the same cards makes no new read, and only the new cards are read', async () => {
    const { reader, calls } = fakeReader([{ oracle_id: 'a', tag_key: 'ramp' }, { oracle_id: 'b', tag_key: 'tutor' }])
    await getCardTags(reader, ['a'])
    await getCardTags(reader, ['a'])
    expect(calls.length).toBe(1)
    await getCardTags(reader, ['a', 'b'])
    expect(calls.length).toBe(2)
    expect(calls[1].arg).toEqual(['b'])
  })

  it('does not cache a failed read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = fakeReader([], { failOn: 'byOracleIds' })
    expect((await getCardTags(bad.reader, ['a'])).status).toBe('error')
    const good = fakeReader([{ oracle_id: 'a', tag_key: 'ramp' }])
    const r = await getCardTags(good.reader, ['a'])
    if (r.status !== 'ok') throw new Error('expected ok')
    expect(r.byOracleId.get('a')!.length).toBe(1)
  })
})

describe('oracleIdsWithTags', () => {
  const rows: TagRow[] = [
    { oracle_id: 'a', tag_key: 'sacrifice_outlet' },
    { oracle_id: 'a', tag_key: 'treasure_generator' },
    { oracle_id: 'b', tag_key: 'sacrifice_outlet' },
    { oracle_id: 'c', tag_key: 'treasure_generator' },
  ]
  it('all of them is an intersection, any of them a union', async () => {
    const { reader } = fakeReader(rows)
    const all = await oracleIdsWithTags(reader, ['sacrifice_outlet', 'treasure_generator'], 'all')
    const any = await oracleIdsWithTags(reader, ['sacrifice_outlet', 'treasure_generator'], 'any')
    expect(all.status === 'ok' && [...all.ids].sort()).toEqual(['a'])
    expect(any.status === 'ok' && [...any.ids].sort()).toEqual(['a', 'b', 'c'])
  })
  it('reads one Tag once and then serves it from the cache', async () => {
    const { reader, calls } = fakeReader(rows)
    await oracleIdsWithTags(reader, ['sacrifice_outlet'], 'all')
    await oracleIdsWithTags(reader, ['sacrifice_outlet', 'treasure_generator'], 'any')
    expect(calls.filter((c) => c.arg === 'sacrifice_outlet').length).toBe(1)
  })
  it('a failed read or an unknown key is an error, never an empty answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await oracleIdsWithTags(fakeReader(rows, { failOn: 'byTagKey' }).reader, ['ramp'], 'all')).toEqual({ status: 'error' })
    expect(await oracleIdsWithTags(fakeReader(rows).reader, ['not_a_tag'], 'all')).toEqual({ status: 'error' })
    expect(await oracleIdsWithTags(fakeReader(rows).reader, [], 'all')).toEqual({ status: 'error' })
  })
})

describe('resolveTag and the list', () => {
  it('has the 40 Tags, 13 broad then 27 mechanic', () => {
    expect(ALL_TAGS.length).toBe(40)
    expect(ALL_TAGS.slice(0, 13).every((t) => t.kind === 'broad')).toBe(true)
    expect(ALL_TAGS.slice(13).every((t) => t.kind === 'mechanic')).toBe(true)
  })
  it('finds a Tag by its screen name or stored key, ignoring case and punctuation', () => {
    expect(resolveTag('Sacrifice outlet')?.key).toBe('sacrifice_outlet')
    expect(resolveTag('sacrifice_outlet')?.key).toBe('sacrifice_outlet')
    expect(resolveTag('STAX / TAX')?.key).toBe('stax_tax')
    expect(resolveTag('+1/+1 counter maker')?.key).toBe('plus_one_counters')
    expect(resolveTag('Removal spell')).toBeUndefined()
  })
})

describe('supabaseTagReader', () => {
  it('reads ref_card_tags with a stable order so paging is safe', async () => {
    const chain = { in: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }
    chain.in.mockReturnValue(chain)
    chain.eq.mockReturnValue(chain)
    chain.order.mockReturnValue(chain)
    chain.range.mockResolvedValue({ data: [], error: null })
    const from = vi.fn(() => ({ select: vi.fn(() => chain) }))
    const reader = supabaseTagReader({ from })
    await reader.byOracleIds(['a'], 0, 999)
    await reader.byTagKey('ramp', 0, 999)
    expect(from).toHaveBeenCalledWith('ref_card_tags')
    expect(chain.order).toHaveBeenCalledWith('oracle_id')
    expect(chain.range).toHaveBeenCalledWith(0, 999)
  })
})
