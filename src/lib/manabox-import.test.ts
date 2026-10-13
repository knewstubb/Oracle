import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  detectManaBoxFile,
  isManaBoxCsv,
  parseManaBoxCsv,
  parseManaBoxText,
  mapManaBoxFinish,
  isTokenCard,
  normalizeDeckRowSplits,
  normalizeProxyCounts,
  buildCollectionPreview,
  buildDeckPreview,
  type ManaBoxCardFacts,
  type ManaBoxResolver,
} from '@/lib/manabox-import'

const SAMPLES = resolve(process.cwd(), 'docs/oracle/samples/manabox')

function sample(name: string): string {
  return readFileSync(resolve(SAMPLES, name), 'utf8')
}

const COLLECTION_OLD = 'manabox-scan-2026-06-05.csv'
const COLLECTION_NEW = 'manabox-scan-2026-10-13.csv'
const DECK_CSV = 'Strix draft.csv'
const ARMAGEDDON = 'Armageddon.txt'
const STRIXHAVEN = 'Strixhaven.txt'

/**
 * A ManaBoxResolver backed by explicit lookups. Tests build the maps from the
 * sample file under test, with optional token overrides.
 */
function makeResolver(
  byScryfallId: Map<string, ManaBoxCardFacts>,
  bySetCollector: Map<string, ManaBoxCardFacts>
): ManaBoxResolver {
  return {
    async resolveByScryfallId(id) {
      return byScryfallId.get(id.trim()) ?? null
    },
    async resolveBySetCollector(setCode, collectorNumber) {
      return bySetCollector.get(`${setCode.trim().toLowerCase()}|${collectorNumber.trim()}`) ?? null
    },
  }
}

interface Overrides {
  /** Key is `${SET_LOWER}|${collector}` — force these facts (e.g. tokens). */
  tokenSetCollectors?: Set<string>
  /** Key is a scryfall id — force these to resolve to null. */
  missingScryfallIds?: Set<string>
  /** Key is `${SET_LOWER}|${collector}` — force these to resolve to null. */
  missingSetCollectors?: Set<string>
}

function resolverForCsv(content: string, overrides: Overrides = {}): ManaBoxResolver {
  const { records } = parseManaBoxCsv(content)
  const byScryfallId = new Map<string, ManaBoxCardFacts>()
  const bySetCollector = new Map<string, ManaBoxCardFacts>()

  for (const { row } of records) {
    const key = `${row.setCode.toLowerCase()}|${row.collectorNumber}`
    const isToken = overrides.tokenSetCollectors?.has(key) ?? false
    const missing =
      (overrides.missingScryfallIds?.has(row.scryfallId) ?? false) ||
      (overrides.missingSetCollectors?.has(key) ?? false)
    if (missing) continue

    const facts: ManaBoxCardFacts = {
      oracleId: `oracle-${row.scryfallId}`,
      scryfallId: row.scryfallId,
      cardName: row.name,
      setCode: row.setCode.toLowerCase(),
      layout: isToken ? 'token' : null,
      typeLine: isToken ? 'Token Creature' : 'Creature',
    }
    byScryfallId.set(row.scryfallId, facts)
    bySetCollector.set(key, facts)
  }

  return makeResolver(byScryfallId, bySetCollector)
}

function resolverForText(content: string, tokenSetCollectors: Set<string> = new Set()): ManaBoxResolver {
  const { lines } = parseManaBoxText(content)
  const bySetCollector = new Map<string, ManaBoxCardFacts>()

  for (const line of lines) {
    const key = `${line.setCode.toLowerCase()}|${line.collectorNumber}`
    const isToken = tokenSetCollectors.has(key)
    bySetCollector.set(key, {
      oracleId: `oracle-${line.setCode}-${line.collectorNumber}`,
      scryfallId: `sf-${line.setCode.toLowerCase()}-${line.collectorNumber}`,
      cardName: line.cardName,
      setCode: line.setCode.toLowerCase(),
      layout: isToken ? 'token' : null,
      typeLine: isToken ? 'Token Creature' : 'Creature',
    })
  }

  return makeResolver(new Map(), bySetCollector)
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe('ManaBox format detection', () => {
  it('detects both collection scans and the deck CSV', () => {
    expect(isManaBoxCsv(sample(COLLECTION_OLD))).toBe(true)
    expect(isManaBoxCsv(sample(COLLECTION_NEW))).toBe(true)
    expect(isManaBoxCsv(sample(DECK_CSV))).toBe(true)
  })

  it('does not treat text exports as CSV', () => {
    expect(isManaBoxCsv(sample(ARMAGEDDON))).toBe(false)
    expect(isManaBoxCsv(sample(STRIXHAVEN))).toBe(false)
  })

  it('classifies each of the five sample files', () => {
    expect(detectManaBoxFile(sample(COLLECTION_OLD))).toBe('csv')
    expect(detectManaBoxFile(sample(COLLECTION_NEW))).toBe('csv')
    expect(detectManaBoxFile(sample(DECK_CSV))).toBe('csv')
    expect(detectManaBoxFile(sample(ARMAGEDDON))).toBe('text')
    expect(detectManaBoxFile(sample(STRIXHAVEN))).toBe('text')
  })

  it('rejects unrelated content', () => {
    expect(detectManaBoxFile('just some random notes\nnothing here')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

describe('parseManaBoxCsv', () => {
  it('parses the older collection scan (26 rows, no Signed/Proxy columns)', () => {
    const { records, badRows, headers } = parseManaBoxCsv(sample(COLLECTION_OLD))
    expect(records).toHaveLength(26)
    expect(badRows).toHaveLength(0)
    expect(headers).not.toContain('Proxy')
    expect(headers).not.toContain('Signed')

    const first = records[0]
    expect(first.rowIndex).toBe(2) // header is line 1
    expect(first.row.name).toBe('Kazandu Nectarpot')
    expect(first.row.setCode).toBe('znr')
    expect(first.row.collectorNumber).toBe('190')
    expect(first.row.quantity).toBe(1)
    expect(first.row.finish).toBe('normal')
    expect(first.row.scryfallId).toBe('7c9d3f4a-ef83-454e-b8a1-1fc5d5f44be8')
  })

  it('parses the newer collection scan and keeps the optional Proxy column', () => {
    const { records, headers } = parseManaBoxCsv(sample(COLLECTION_NEW))
    expect(headers).toContain('Proxy')
    expect(headers).toContain('Signed')
    expect(records).toHaveLength(2)
    expect(records[0].row.proxy).toBe(false)
  })

  it('parses the deck CSV and preserves quoted and double-faced names', () => {
    const { records, badRows } = parseManaBoxCsv(sample(DECK_CSV))
    expect(records).toHaveLength(65)
    expect(badRows).toHaveLength(0)

    const emil = records.find((r) => r.row.name.startsWith('Emil,'))!
    expect(emil.row.name).toBe('Emil, Vastlands Roamer')

    const dfc = records.find((r) => r.row.name === 'Landscape Painter // Vibrant Idea')
    expect(dfc).toBeDefined()
    expect(dfc!.row.setCode).toBe('sos')
  })

  it('reports a bad row for a missing name or invalid quantity', () => {
    const csv = [
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID',
      'Sol Ring,c21,263,normal,1,abc',
      ',c21,264,normal,1,def',
      'Mana Crypt,2xm,270,normal,0,ghi',
    ].join('\n')
    const { records, badRows } = parseManaBoxCsv(csv)
    expect(records).toHaveLength(1)
    expect(badRows).toHaveLength(2)
    expect(badRows[0].reason).toBe('bad_line')
    expect(badRows[1].reason).toBe('bad_line')
    expect(badRows[1].cardName).toBe('Mana Crypt')
  })

  it('throws when required columns are missing', () => {
    expect(() => parseManaBoxCsv('Name,Quantity\nSol Ring,1')).toThrow(/missing required columns/i)
  })
})

// ---------------------------------------------------------------------------
// Text parsing
// ---------------------------------------------------------------------------

describe('parseManaBoxText', () => {
  it('parses Armageddon.txt fully, keeping the collector number', () => {
    const { lines, badLines } = parseManaBoxText(sample(ARMAGEDDON))
    expect(lines).toHaveLength(98)
    expect(badLines).toHaveLength(0)

    const drake = lines.find((l) => l.cardName === 'Drake')!
    expect(drake.quantity).toBe(1)
    expect(drake.setCode).toBe('TFDN')
    expect(drake.collectorNumber).toBe('8')
    expect(drake.isFoil).toBe(false)
  })

  it('parses Strixhaven.txt and preserves double-faced names', () => {
    const { lines, badLines } = parseManaBoxText(sample(STRIXHAVEN))
    expect(lines).toHaveLength(88)
    expect(badLines).toHaveLength(0)

    const dfc = lines.find((l) => l.cardName === 'Adventurous Eater // Have a Bite')!
    expect(dfc.quantity).toBe(2)
    expect(dfc.setCode).toBe('SOS')
    expect(dfc.collectorNumber).toBe('72')
  })

  it('ignores blank lines and comments and reports unreadable lines', () => {
    const text = [
      '// a comment',
      '',
      '1 Sol Ring (C21) 263',
      '# another comment',
      'not a card line',
    ].join('\n')
    const { lines, badLines } = parseManaBoxText(text)
    expect(lines).toHaveLength(1)
    expect(lines[0].cardName).toBe('Sol Ring')
    expect(badLines).toHaveLength(1)
    expect(badLines[0].reason).toBe('bad_line')
    expect(badLines[0].sourceIndex).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// Finish, tokens and overrides
// ---------------------------------------------------------------------------

describe('finish, tokens and overrides', () => {
  it('maps the Foil column to Oracle finish', () => {
    expect(mapManaBoxFinish('normal')).toBe('nonfoil')
    expect(mapManaBoxFinish('')).toBe('nonfoil')
    expect(mapManaBoxFinish(undefined)).toBe('nonfoil')
    expect(mapManaBoxFinish('foil')).toBe('foil')
    expect(mapManaBoxFinish('etched')).toBe('etched')
  })

  it('detects tokens from resolved card data only', () => {
    expect(isTokenCard({ layout: 'token', typeLine: 'Creature' })).toBe(true)
    expect(isTokenCard({ layout: 'double_faced_token', typeLine: '' })).toBe(true)
    expect(isTokenCard({ layout: 'normal', typeLine: 'Token Creature — Drake' })).toBe(true)
    expect(isTokenCard({ layout: 'transform', typeLine: 'Creature' })).toBe(false)
    expect(isTokenCard({ layout: null, typeLine: null })).toBe(false)
  })

  it('defaults deck splits to all Original and rejects invalid sums', () => {
    const rows = [{ sourceIndex: 2, qty: 2 }, { sourceIndex: 5, qty: 3 }]
    const splits = normalizeDeckRowSplits(rows, {
      2: { originalCount: 1, proxyCount: 1, unsleevedCount: 0 },
      5: { originalCount: 1, proxyCount: 1, unsleevedCount: 0 }, // sums to 2, not 3
    })
    expect(splits.get(2)).toEqual({ originalCount: 1, proxyCount: 1, unsleevedCount: 0 })
    expect(splits.get(5)).toEqual({ originalCount: 3, proxyCount: 0, unsleevedCount: 0 })
  })

  it('defaults collection proxy counts to 0 and clamps out-of-range values', () => {
    const rows = [{ sourceIndex: 2, qty: 2 }, { sourceIndex: 3, qty: 1 }]
    const counts = normalizeProxyCounts(rows, { 2: 5, 3: 1 })
    expect(counts.get(2)).toBe(0)
    expect(counts.get(3)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Collection preview
// ---------------------------------------------------------------------------

describe('buildCollectionPreview', () => {
  it('previews the older collection scan as 26 rows with no tokens or unmatched lines', async () => {
    const content = sample(COLLECTION_OLD)
    const preview = await buildCollectionPreview(
      { fileName: COLLECTION_OLD, csvContent: content },
      resolverForCsv(content)
    )
    expect(preview.fileName).toBe(COLLECTION_OLD)
    expect(preview.totalLines).toBe(26)
    expect(preview.rows).toHaveLength(26)
    expect(preview.skippedTokens).toHaveLength(0)
    expect(preview.unmatched).toHaveLength(0)
    expect(preview.rows.reduce((sum, r) => sum + r.qty, 0)).toBe(26)
  })

  it('previews the newer collection scan as 2 rows', async () => {
    const content = sample(COLLECTION_NEW)
    const preview = await buildCollectionPreview(
      { fileName: COLLECTION_NEW, csvContent: content },
      resolverForCsv(content)
    )
    expect(preview.totalLines).toBe(2)
    expect(preview.rows).toHaveLength(2)
    expect(preview.unmatched).toHaveLength(0)
  })

  it('keeps basic lands as ordinary rows (collection basics are real cards)', async () => {
    const csv = [
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID',
      'Island,sos,268,normal,2,island-id',
      'Sol Ring,c21,263,normal,1,sol-id',
    ].join('\n')
    const preview = await buildCollectionPreview(
      { fileName: 'x.csv', csvContent: csv },
      resolverForCsv(csv)
    )
    const island = preview.rows.find((r) => r.cardName === 'Island')!
    expect(island.qty).toBe(2)
    expect(island.isBasicLand).toBe(true)
  })

  it('combines by printing+finish+language, splits languages and combines conditions', async () => {
    const csv = [
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language',
      'Sol Ring,c21,263,normal,1,sol,NEAR_MINT,en',
      'Sol Ring,c21,263,normal,1,sol,LIGHTLY_PLAYED,en',
      'Sol Ring,c21,263,foil,1,sol,near_mint,en',
      'Sol Ring,c21,263,normal,1,sol,near_mint,ja',
    ].join('\n')
    const preview = await buildCollectionPreview(
      { fileName: 'x.csv', csvContent: csv },
      resolverForCsv(csv)
    )
    // nonfoil/en (2 copies, conditions combined), foil/en, nonfoil/ja → 3 rows.
    expect(preview.rows).toHaveLength(3)
    const enNonfoil = preview.rows.find((r) => r.finish === 'nonfoil' && r.language === 'en')!
    expect(enNonfoil.qty).toBe(2)
    expect(enNonfoil.sourceLines).toEqual([2, 3])
    expect(preview.rows.some((r) => r.language === 'ja')).toBe(true)
  })

  it('reports an unknown Scryfall ID and a no-card set+collector lookup', async () => {
    const csv = [
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID',
      'Ghost Card,xxx,999,normal,1,missing-id',
      'No Scryfall,z zz,1,normal,1,',
    ].join('\n')
    const preview = await buildCollectionPreview(
      { fileName: 'x.csv', csvContent: csv },
      resolverForCsv(csv, {
        missingScryfallIds: new Set(['missing-id']),
        missingSetCollectors: new Set(['z zz|1']),
      })
    )
    expect(preview.unmatched).toHaveLength(2)
    expect(preview.unmatched[0].reason).toBe('unknown_id')
    expect(preview.unmatched[1].reason).toBe('no_card')
  })

  it('skips tokens in a collection import too', async () => {
    const csv = [
      'Name,Set code,Collector number,Foil,Quantity,Scryfall ID',
      'Drake,TFDN,8,normal,1,token-id',
      'Sol Ring,c21,263,normal,1,sol-id',
    ].join('\n')
    const preview = await buildCollectionPreview(
      { fileName: 'x.csv', csvContent: csv },
      resolverForCsv(csv, { tokenSetCollectors: new Set(['tfdn|8']) })
    )
    expect(preview.rows).toHaveLength(1)
    expect(preview.skippedTokens).toHaveLength(1)
    expect(preview.skippedTokens[0].cardName).toBe('Drake')
    expect(preview.unmatched).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Deck preview
// ---------------------------------------------------------------------------

describe('buildDeckPreview', () => {
  it('combines the 65 deck CSV rows into 58 rows with 8 basics', async () => {
    const content = sample(DECK_CSV)
    const preview = await buildDeckPreview(
      { fileName: DECK_CSV, csvContent: content },
      resolverForCsv(content)
    )
    expect(preview.totalLines).toBe(65)
    expect(preview.rows).toHaveLength(58)
    expect(preview.skippedTokens).toHaveLength(0)
    expect(preview.unmatched).toHaveLength(0)

    const basicRows = preview.rows.filter((r) => r.isBasicLand)
    expect(basicRows.reduce((sum, r) => sum + r.qty, 0)).toBe(8)
    expect(preview.rows.reduce((sum, r) => sum + r.qty, 0)).toBe(65)

    const island = preview.rows.find((r) => r.cardName === 'Island')!
    expect(island.qty).toBe(3)
    expect(island.sourceLines).toEqual([49, 52, 53])
  })

  it('previews Armageddon.txt and skips the Drake token', async () => {
    const content = sample(ARMAGEDDON)
    const preview = await buildDeckPreview(
      { fileName: ARMAGEDDON, textContent: content },
      resolverForText(content, new Set(['tfdn|8']))
    )
    const parsedQty = parseManaBoxText(content).lines.reduce((sum, l) => sum + l.quantity, 0)
    expect(preview.totalLines).toBe(98)
    expect(preview.skippedTokens).toHaveLength(1)
    expect(preview.skippedTokens[0].cardName).toBe('Drake')
    expect(preview.skippedTokens[0].sourceIndex).toBe(22)
    expect(preview.unmatched).toHaveLength(0)
    expect(preview.rows.reduce((sum, r) => sum + r.qty, 0)).toBe(parsedQty - 1)
  })

  it('previews Strixhaven.txt, storing front-face names and skipping the token', async () => {
    const content = sample(STRIXHAVEN)
    const preview = await buildDeckPreview(
      { fileName: STRIXHAVEN, textContent: content },
      resolverForText(content, new Set(['tsos|7']))
    )
    const parsedQty = parseManaBoxText(content).lines.reduce((sum, l) => sum + l.quantity, 0)
    expect(preview.totalLines).toBe(88)
    expect(preview.skippedTokens).toHaveLength(1)
    expect(preview.skippedTokens[0].cardName).toBe('Inkling')
    expect(preview.unmatched).toHaveLength(0)
    expect(preview.rows.reduce((sum, r) => sum + r.qty, 0)).toBe(parsedQty - 1)

    // Text exports store the front-face name only (contract §5.3).
    expect(preview.rows.some((r) => r.cardName === 'Adventurous Eater')).toBe(true)
    expect(preview.rows.some((r) => r.cardName.includes(' // '))).toBe(false)
  })
})
