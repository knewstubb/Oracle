import { describe, expect, it } from 'vitest'
import {
  applyBulk,
  applyCopyOneToAll,
  allowedFinishes,
  buildRowCopies,
  buildRowKey,
  bulkTypeState,
  countFinishNotices,
  finishControlState,
  mapScryfallFinishes,
  parseFileCondition,
  parseFileFinish,
  parseFileLanguage,
  pickFallbackFinish,
  resolveCopy,
  resolveRowCopies,
  setCopyField,
  summariseRowTags,
  toCollectionRpcRow,
  toDeckRpcRow,
  validateCopyFinish,
  validateImportInput,
  validateRowFinishes,
  type ImportCopy,
  type ImportCopyEdits,
  type ImportDefaults,
  type ImportRow,
} from './import-copies'

const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

function copy(index: number, file: ImportCopy['file'] = {}, owner: ImportCopy['owner'] = {}): ImportCopy {
  return { index, sourceLine: index + 2, file, owner }
}

function row(
  rowKey: string,
  copies: ImportCopy[],
  availableFinishes: ImportRow['availableFinishes'] = null
): ImportRow {
  return {
    rowKey,
    sourceIndex: 2,
    sourceLines: [2],
    cardName: 'Sol Ring',
    setCode: 'c21',
    collectorNumber: '263',
    scryfallId: rowKey.split('|')[0],
    oracleId: 'oracle-1',
    qty: copies.length,
    availableFinishes,
    copies,
    isBasicLand: false,
  }
}

describe('parseFileFinish / Condition / Language (test 1)', () => {
  it('maps the three recognised finishes, any case and padding', () => {
    expect(parseFileFinish('normal')).toBe('nonfoil')
    expect(parseFileFinish(' FOIL ')).toBe('foil')
    expect(parseFileFinish('Etched')).toBe('etched')
  })
  it('treats blank, missing and unrecognised finish as not supplied', () => {
    expect(parseFileFinish('')).toBeUndefined()
    expect(parseFileFinish(undefined)).toBeUndefined()
    expect(parseFileFinish('glossy')).toBeUndefined()
  })
  it('maps every condition spelling including dmg and d', () => {
    expect(parseFileCondition('near_mint')).toBe('near_mint')
    expect(parseFileCondition('Near Mint')).toBe('near_mint')
    expect(parseFileCondition('NM')).toBe('near_mint')
    expect(parseFileCondition('lightly_played')).toBe('lightly_played')
    expect(parseFileCondition('MP')).toBe('moderately_played')
    expect(parseFileCondition('heavily_played')).toBe('heavily_played')
    expect(parseFileCondition('dmg')).toBe('damaged')
    expect(parseFileCondition('D')).toBe('damaged')
    expect(parseFileCondition('  Damaged ')).toBe('damaged')
  })
  it('treats blank or unrecognised condition as not supplied', () => {
    expect(parseFileCondition('')).toBeUndefined()
    expect(parseFileCondition(undefined)).toBeUndefined()
    expect(parseFileCondition('poor')).toBeUndefined()
  })
  it('accepts 2 to 4 letter languages and rejects bad shapes', () => {
    expect(parseFileLanguage('EN')).toBe('en')
    expect(parseFileLanguage(' ja ')).toBe('ja')
    expect(parseFileLanguage('zhs')).toBe('zhs')
    expect(parseFileLanguage('')).toBeUndefined()
    expect(parseFileLanguage('english')).toBeUndefined()
    expect(parseFileLanguage('e')).toBeUndefined()
    expect(parseFileLanguage('e1')).toBeUndefined()
  })
  it('a text export supplies nothing: empty file values resolve entirely from defaults', () => {
    const r = resolveCopy(copy(0, {}), DEFAULTS, null)
    expect(r.sources).toEqual({ type: 'default', finish: 'default', condition: 'default', language: 'default' })
  })
})

describe('resolveCopy precedence (tests 2 and 3)', () => {
  const available = null
  it('owner beats file beats default for each field', () => {
    const c = copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' }, { finish: 'etched', condition: 'damaged', language: 'de' })
    const r = resolveCopy(c, DEFAULTS, available)
    expect(r.finish).toBe('etched')
    expect(r.condition).toBe('damaged')
    expect(r.language).toBe('de')
    expect(r.sources).toMatchObject({ finish: 'owner', condition: 'owner', language: 'owner' })

    const fromFile = resolveCopy(copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' }), DEFAULTS, available)
    expect(fromFile.finish).toBe('foil')
    expect(fromFile.sources).toMatchObject({ finish: 'file', condition: 'file', language: 'file' })

    const fromDefaults = resolveCopy(copy(0), { finish: 'foil', condition: 'heavily_played', language: 'fr' }, available)
    expect(fromDefaults).toMatchObject({ finish: 'foil', condition: 'heavily_played', language: 'fr' })
    expect(fromDefaults.sources).toMatchObject({ finish: 'default', condition: 'default', language: 'default' })
  })
  it('type is never from the file', () => {
    expect(resolveCopy(copy(0, {}), DEFAULTS, available).sources.type).toBe('default')
    expect(resolveCopy(copy(0, {}), DEFAULTS, available).type).toBe('original')
    expect(resolveCopy(copy(0, {}, { type: 'proxy' }), DEFAULTS, available).sources.type).toBe('owner')
  })
  it('an owner value equal to the file value still reports owner', () => {
    const r = resolveCopy(copy(0, { language: 'ja' }, { language: 'ja' }), DEFAULTS, available)
    expect(r.sources.language).toBe('owner')
  })
  it('mixed sources are reported field by field', () => {
    const r = resolveCopy(copy(0, { condition: 'lightly_played' }, { language: 'ja' }), DEFAULTS, available)
    expect(r.sources).toEqual({ type: 'default', finish: 'default', condition: 'file', language: 'owner' })
  })
  it('changing defaults moves only default-sourced copies', () => {
    const c1 = copy(0, {}) // default
    const c2 = copy(1, { language: 'ja' }) // file
    const c3 = copy(2, {}, { language: 'de' }) // owner
    const next: ImportDefaults = { ...DEFAULTS, language: 'fr' }
    expect(resolveCopy(c1, next, null).language).toBe('fr')
    expect(resolveCopy(c2, next, null).language).toBe('ja')
    expect(resolveCopy(c3, next, null).language).toBe('de')
  })
})

describe('proxy handling (test 4)', () => {
  it('resolves condition to null but keeps finish and held condition', () => {
    const r = resolveCopy(copy(0, { finish: 'foil', condition: 'lightly_played' }, { type: 'proxy' }), DEFAULTS, null)
    expect(r.condition).toBeNull()
    expect(r.finish).toBe('foil')
    expect(r.heldCondition).toBe('lightly_played')
  })
  it('toggling Original -> Proxy -> Original returns the original values', () => {
    const base = copy(0, { finish: 'foil', condition: 'lightly_played' })
    const original = resolveCopy(base, DEFAULTS, null)
    const asProxy = resolveCopy({ ...base, owner: { type: 'proxy' } }, DEFAULTS, null)
    const back = resolveCopy({ ...base, owner: { type: 'original' } }, DEFAULTS, null)
    expect(asProxy.condition).toBeNull()
    expect(back.finish).toBe(original.finish)
    expect(back.condition).toBe(original.condition)
  })
  it('unsleeved resolves condition to null', () => {
    expect(resolveCopy(copy(0, { condition: 'lightly_played' }, { type: 'unsleeved' }), DEFAULTS, null).condition).toBeNull()
  })
})

describe('buildRowCopies and buildRowKey (tests 5, 6, 7)', () => {
  it('[1 NM, 2 LP] gives [NM, LP, LP], stable, with source lines kept', () => {
    const candidates = [
      { sourceIndex: 3, qty: 2, file: { condition: 'lightly_played' as const } },
      { sourceIndex: 2, qty: 1, file: { condition: 'near_mint' as const } },
    ]
    const a = buildRowCopies(candidates)
    const b = buildRowCopies(candidates)
    expect(a.map((c) => c.file.condition)).toEqual(['near_mint', 'lightly_played', 'lightly_played'])
    expect(a.map((c) => c.sourceLine)).toEqual([2, 3, 3])
    expect(a.map((c) => c.index)).toEqual([0, 1, 2])
    expect(b).toEqual(a)
  })
  it('caps a single line at 100 copies', () => {
    expect(buildRowCopies([{ sourceIndex: 2, qty: 500, file: {} }])).toHaveLength(100)
  })
  it('builds keys from file values only', () => {
    expect(buildRowKey({ scryfallId: 'abc', file: { finish: 'foil', language: 'ja' } }, 'collection')).toBe('abc|foil|ja')
    expect(buildRowKey({ scryfallId: 'abc', file: {} }, 'collection')).toBe('abc|nonfoil|en')
    expect(buildRowKey({ scryfallId: 'abc', file: { finish: 'foil', language: 'ja' } }, 'deck')).toBe('abc|foil')
    expect(buildRowKey({ scryfallId: 'abc', file: { finish: 'foil' } }, 'text')).toBe('abc|text')
  })
  it('D-051: en and ja are two keys, NM and LP one key, and an owner edit never changes the key', () => {
    const en = buildRowKey({ scryfallId: 'abc', file: { finish: 'nonfoil', language: 'en' } }, 'collection')
    const ja = buildRowKey({ scryfallId: 'abc', file: { finish: 'nonfoil', language: 'ja' } }, 'collection')
    expect(en).not.toBe(ja)
    const nm = buildRowKey({ scryfallId: 'abc', file: { condition: 'near_mint' } }, 'collection')
    const lp = buildRowKey({ scryfallId: 'abc', file: { condition: 'lightly_played' } }, 'collection')
    expect(nm).toBe(lp)
    const r = row('abc|nonfoil|en', [copy(0), copy(1)])
    const edits = setCopyField({}, r.rowKey, 1, 'language', 'ja')
    expect(r.rowKey).toBe('abc|nonfoil|en')
    expect(resolveRowCopies(r, DEFAULTS, edits, r.rowKey)[1].language).toBe('ja')
  })
})

describe('owner actions (test 8)', () => {
  it('setCopyField is immutable and marks the field as owner', () => {
    const edits: ImportCopyEdits = {}
    const next = setCopyField(edits, 'k', 0, 'finish', 'foil')
    expect(edits).toEqual({})
    expect(next).toEqual({ k: { 0: { finish: 'foil' } } })
    const r = row('k', [copy(0, { finish: 'foil' })])
    expect(resolveRowCopies(r, DEFAULTS, next, 'k')[0].sources.finish).toBe('owner')
  })

  it('apply-to-all copies copy 1 visible fields; a proxy copy 1 writes no finish or condition', () => {
    const r = row('k', [copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' }), copy(1), copy(2)])
    const all = applyCopyOneToAll({}, r, DEFAULTS)
    expect(all.k[1]).toEqual({ type: 'original', language: 'ja', finish: 'foil', condition: 'lightly_played' })
    expect(all.k[0]).toBeUndefined()

    const proxyFirst = applyCopyOneToAll(setCopyField({}, 'k', 0, 'type', 'proxy'), r, DEFAULTS)
    expect(proxyFirst.k[2]).toEqual({ type: 'proxy', language: 'ja' })
  })

  it('apply-to-all does nothing for a single copy', () => {
    expect(applyCopyOneToAll({}, row('k', [copy(0)]), DEFAULTS)).toEqual({})
  })

  it('bulk skips finish and condition on proxies, and language and condition on unsleeved', () => {
    const r = row('k', [copy(0, {}, { type: 'proxy' }), copy(1), copy(2, {}, { type: 'unsleeved' })])
    const result = applyBulk({}, [r], ['k'], { finish: 'foil', condition: 'damaged', language: 'ja' }, DEFAULTS)
    expect(result.edits.k[0]).toEqual({ language: 'ja' })
    expect(result.edits.k[1]).toEqual({ finish: 'foil', condition: 'damaged', language: 'ja' })
    expect(result.edits.k[2]).toEqual({ finish: 'foil' })
    expect(result.applied).toBe(3)
  })

  it('bulk ignores unselected rows and every applied field becomes an owner edit (dot clears)', () => {
    const a = row('a', [copy(0, { language: 'en' })])
    const b = row('b', [copy(0, { language: 'en' })])
    const res = applyBulk({}, [a, b], ['a'], { language: 'ja' }, DEFAULTS)
    expect(res.edits.b).toBeUndefined()
    expect(resolveRowCopies(a, DEFAULTS, res.edits, 'a')[0].sources.language).toBe('owner')
  })

  it('bulk type state reports mixed', () => {
    const r = row('k', [copy(0), copy(1)])
    expect(bulkTypeState(resolveRowCopies(r, DEFAULTS))).toBe('original')
    expect(bulkTypeState(resolveRowCopies(r, DEFAULTS, { k: { 0: { type: 'proxy' } } }, 'k'))).toBe('mixed')
    expect(bulkTypeState([])).toBe('mixed')
  })
})

describe('summariseRowTags (test 11)', () => {
  const tags = (copies: ImportCopy[], defaults = DEFAULTS) =>
    summariseRowTags(resolveRowCopies(row('k', copies), defaults), defaults)

  it('shows nothing for a default row', () => {
    expect(tags([copy(0), copy(1)])).toEqual({ tags: [], overflow: 0 })
  })
  it('shows only differing values, in order Proxy / finish / condition / language', () => {
    const t = tags([copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' })])
    expect(t.tags.map((x) => x.kind)).toEqual(['finish', 'condition', 'language'])
    expect(t.tags.map((x) => x.label)).toEqual(['Foil', 'LP', 'JA'])
  })
  it('counts: "2 Proxy" when some copies differ, "Proxy" when all', () => {
    const some = tags([copy(0, {}, { type: 'proxy' }), copy(1, {}, { type: 'proxy' }), copy(2)])
    expect(some.tags[0]).toMatchObject({ label: 'Proxy', count: 2, all: false })
    const all = tags([copy(0, {}, { type: 'proxy' })])
    expect(all.tags[0]).toMatchObject({ label: 'Proxy', all: true })
  })
  it('finish and condition tags ignore proxies; a proxy still gets a language tag', () => {
    const t = tags([copy(0, { finish: 'foil', condition: 'damaged', language: 'ja' }, { type: 'proxy' })])
    expect(t.tags.map((x) => x.label)).toEqual(['Proxy', 'JA'])
  })
  it('caps at three tags with an overflow count', () => {
    const t = tags([
      copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' }, { type: 'proxy' }),
      copy(1, { finish: 'foil', condition: 'lightly_played', language: 'ja' }),
    ])
    expect(t.tags).toHaveLength(3)
    expect(t.overflow).toBe(1)
  })
})

describe('validateImportInput (test 12)', () => {
  const rows = [{ rowKey: 'k', qty: 2 }]
  const opts = { allowUnsleeved: false }
  it('accepts a clean request', () => {
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { finish: 'foil' } } }, opts)).toEqual([])
  })
  it('rejects unknown enums', () => {
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { finish: 'shiny' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { condition: 'poor' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { type: 'gift' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { language: 'english' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, { ...DEFAULTS, finish: 'x' }, {}, opts)).not.toEqual([])
  })
  it('rejects unsleeved unless allowed (collection has none)', () => {
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { type: 'unsleeved' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, DEFAULTS, { k: { 0: { type: 'unsleeved' } } }, { allowUnsleeved: true })).toEqual([])
  })
  it('rejects copies.length !== quantity', () => {
    expect(validateImportInput([{ rowKey: 'k', qty: 3, copies: [copy(0)] }], DEFAULTS, {}, opts)).not.toEqual([])
  })
  it('rejects an index past qty and unknown rows', () => {
    expect(validateImportInput(rows, DEFAULTS, { k: { 2: { finish: 'foil' } } }, opts)).not.toEqual([])
    expect(validateImportInput(rows, DEFAULTS, { nope: { 0: { finish: 'foil' } } }, opts)).not.toEqual([])
  })
  it('rejects an oversize import', () => {
    expect(validateImportInput([{ rowKey: 'k', qty: 10_001 }], DEFAULTS, {}, opts)).not.toEqual([])
  })
})

describe('finish availability (test 12a)', () => {
  const nonfoilOnly: ImportRow['availableFinishes'] = ['nonfoil']
  const foilOnly: ImportRow['availableFinishes'] = ['foil']
  const etchedOnly: ImportRow['availableFinishes'] = ['etched']
  const both: ImportRow['availableFinishes'] = ['nonfoil', 'foil']

  it('validateCopyFinish: owner foil on non-foil-only is rejected, on a foil-capable one ok', () => {
    expect(validateCopyFinish('foil', 'owner', nonfoilOnly)).toBe('rejected')
    expect(validateCopyFinish('foil', 'owner', both)).toBe('ok')
    expect(validateCopyFinish('foil', 'default', nonfoilOnly)).toBe('rejected')
  })
  it('file foil on a non-foil-only printing is kept, flagged, still dotted', () => {
    expect(validateCopyFinish('foil', 'file', nonfoilOnly)).toBe('unlisted_file')
    const r = resolveCopy(copy(0, { finish: 'foil' }), DEFAULTS, nonfoilOnly)
    expect(r.finish).toBe('foil')
    expect(r.finishNote).toBe('unlisted')
    expect(r.sources.finish).toBe('file')
  })
  it('default foil on a non-foil-only card falls back and keeps default source; clears when the bar changes', () => {
    const foilDefault: ImportDefaults = { ...DEFAULTS, finish: 'foil' }
    const r = resolveCopy(copy(0), foilDefault, nonfoilOnly)
    expect(r.finish).toBe('nonfoil')
    expect(r.finishNote).toBe('fallback')
    expect(r.sources.finish).toBe('default')
    const back = resolveCopy(copy(0), DEFAULTS, nonfoilOnly)
    expect(back.finishNote).toBeNull()
  })
  it('foil-only and etched-only printings fall back to the listed finish', () => {
    expect(pickFallbackFinish('nonfoil', foilOnly)).toBe('foil')
    expect(pickFallbackFinish('foil', etchedOnly)).toBe('etched')
    expect(pickFallbackFinish('etched', both)).toBe('nonfoil')
    expect(pickFallbackFinish('foil', both)).toBe('foil')
  })
  it('bulk Set Foil over 7 copies where 2 printings lack foil: 5 changed, 2 untouched', () => {
    const withFoil = row('a', [copy(0), copy(1), copy(2), copy(3), copy(4)], both)
    const noFoil = row('b', [copy(0), copy(1)], nonfoilOnly)
    const res = applyBulk({}, [withFoil, noFoil], ['a', 'b'], { finish: 'foil' }, DEFAULTS)
    expect(res.applied).toBe(5)
    expect(res.skipped).toBe(2)
    expect(res.edits.b).toBeUndefined()
  })
  it('bulk Set Foil that applies to none changes nothing', () => {
    const noFoil = row('b', [copy(0), copy(1)], nonfoilOnly)
    const res = applyBulk({}, [noFoil], ['b'], { finish: 'foil' }, DEFAULTS)
    expect(res.applied).toBe(0)
    expect(res.skipped).toBe(2)
    expect(res.edits).toEqual({})
  })
  it('a null list allows all three with no note', () => {
    expect(allowedFinishes(null)).toEqual(['nonfoil', 'foil', 'etched'])
    const r = resolveCopy(copy(0), { ...DEFAULTS, finish: 'etched' }, null)
    expect(r.finish).toBe('etched')
    expect(r.finishNote).toBeNull()
  })
  it('mapScryfallFinishes drops glossy and maps empty/missing to null', () => {
    expect(mapScryfallFinishes(['nonfoil', 'glossy'])).toEqual(['nonfoil'])
    expect(mapScryfallFinishes(['etched', 'foil'])).toEqual(['foil', 'etched'])
    expect(mapScryfallFinishes(['glossy'])).toBeNull()
    expect(mapScryfallFinishes([])).toBeNull()
    expect(mapScryfallFinishes(null)).toBeNull()
    expect(mapScryfallFinishes(undefined)).toBeNull()
  })
  it('finishControlState: hidden for one finish, a select for two, an extra option for an unlisted file value', () => {
    expect(finishControlState(foilOnly, 'foil', 'default').mode).toBe('hidden')
    const two = finishControlState(both, 'nonfoil', 'default')
    expect(two.mode).toBe('select')
    expect(two.options.map((o) => o.value)).toEqual(['nonfoil', 'foil'])
    const unlisted = finishControlState(nonfoilOnly, 'foil', 'file')
    expect(unlisted.mode).toBe('select')
    expect(unlisted.options).toEqual([
      { value: 'nonfoil', unlisted: false },
      { value: 'foil', unlisted: true },
    ])
    expect(finishControlState(null, 'nonfoil', 'default').options).toHaveLength(3)
  })
  it('validateRowFinishes rejects owner-chosen unlisted finishes and counts file ones', () => {
    const r = row('a', [copy(0, {}, { finish: 'foil' }), copy(1, { finish: 'foil' })], nonfoilOnly)
    const out = validateRowFinishes([
      { rowKey: 'a', availableFinishes: nonfoilOnly, resolved: resolveRowCopies(r, DEFAULTS) },
    ])
    expect(out.problems).toHaveLength(1)
    expect(out.unlistedFinish).toBe(1)
  })
  it('screen notices count unlisted file finishes and default fallbacks', () => {
    const r = row('a', [copy(0, { finish: 'foil' }), copy(1)], nonfoilOnly)
    expect(countFinishNotices([r], { ...DEFAULTS, finish: 'foil' })).toEqual({
      unlistedFinish: 1,
      defaultFinishFellBack: 1,
    })
  })
})

describe('mapping to RPC rows (test 10)', () => {
  it('collection: original keeps condition, proxy gets null, price and date come from context', () => {
    const original = resolveCopy(copy(0, { finish: 'foil', condition: 'lightly_played', language: 'ja' }), DEFAULTS, null)
    const proxy = resolveCopy(copy(1, { finish: 'foil', condition: 'lightly_played' }, { type: 'proxy' }), DEFAULTS, null)
    const ctx = { cardId: 7, scryfallId: 'sid', purchasePrice: 1.5, acquiredAt: '2025-01-01' }
    expect(toCollectionRpcRow(original, ctx)).toEqual({
      card_id: 7,
      printing_id: 'sid',
      finish: 'foil',
      language: 'ja',
      is_proxy: false,
      card_condition: 'lightly_played',
      source_tag: 'manabox',
      location_id: null,
      purchase_price: 1.5,
      acquired_at: '2025-01-01',
    })
    const p = toCollectionRpcRow(proxy, { cardId: 7, scryfallId: 'sid' })
    expect(p.is_proxy).toBe(true)
    expect(p.card_condition).toBeNull()
    expect(p.finish).toBe('foil')
    expect(p).not.toHaveProperty('purchase_price')
  })
  it('deck: unsleeved is a planned slot with only finish; proxy has null condition', () => {
    const ctx = { cardId: 7, cardName: 'Sol Ring', scryfallId: 'sid', setCode: 'c21', categories: '["Artifact"]' }
    const unsleeved = toDeckRpcRow(resolveCopy(copy(0, { finish: 'foil', language: 'ja', condition: 'damaged' }, { type: 'unsleeved' }), DEFAULTS, null), ctx)
    expect(unsleeved).toMatchObject({ is_maybeboard: true, card_id: null, finish: 'foil', is_proxy: false })
    expect(unsleeved).not.toHaveProperty('language')
    expect(unsleeved).not.toHaveProperty('card_condition')

    const proxy = toDeckRpcRow(resolveCopy(copy(0, { language: 'ja' }, { type: 'proxy' }), DEFAULTS, null), ctx)
    expect(proxy).toMatchObject({ is_proxy: true, is_maybeboard: false, card_condition: null, language: 'ja', card_id: 7, source_tag: 'deck-import' })
  })
})
