import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  boardFromCells,
  detectDelimiter,
  isCsvHeaderLine,
  looksLikeSetCode,
  mapCsvHeaders,
  normaliseFinishCell,
  readCsv,
} from '@/lib/import-csv'
import {
  buildDeckPreview,
  detectManaBoxFile,
  isManaBoxCsv,
  parseManaBoxCsv,
  type ManaBoxCardFacts,
  type ManaBoxResolver,
} from '@/lib/manabox-import'
import { parseDeckCSV, isCSVParseError } from '@/lib/csv-deck-parser'

const DIR = resolve(process.cwd(), 'docs/oracle/samples/import-formats')
const fixture = (name: string) => readFileSync(resolve(DIR, name), 'utf8')

/** A resolver that knows every card by name and by set + number, so tests see what the parser asked for. */
function nameResolver(): ManaBoxResolver & { nameCalls: string[]; setCalls: string[] } {
  const nameCalls: string[] = []
  const setCalls: string[] = []
  const facts = (name: string, set = 'tst', cn = '1'): ManaBoxCardFacts => ({
    oracleId: `oracle-${name}`,
    scryfallId: `sf-${name}-${set}-${cn}`,
    cardName: name,
    setCode: set,
    collectorNumber: cn,
    layout: null,
    typeLine: 'Artifact',
  })
  return {
    nameCalls,
    setCalls,
    async resolveByScryfallId() {
      return null
    },
    async resolveBySetCollector(set, cn) {
      setCalls.push(`${set}|${cn}`)
      return facts('Card', set.toLowerCase(), cn)
    },
    async resolveByName(name) {
      nameCalls.push(name)
      return facts(name)
    },
  }
}

describe('readCsv (RFC 4180, E-9..E-11)', () => {
  it('keeps a quoted newline and a doubled quote inside one cell', () => {
    const table = readCsv(fixture('edge-quoted-newline.csv'))
    expect(table.records).toHaveLength(3)
    expect(table.records[1].cells[1]).toBe('Line one\nline two "quoted"')
    // physical line numbers stay true after a multi-line record
    expect(table.records[2].line).toBe(5)
  })

  it('strips a BOM, reads CRLF and detects a semicolon delimiter', () => {
    const table = readCsv(fixture('edge-bom-crlf-semicolon.csv'))
    expect(table.delimiter).toBe(';')
    expect(table.headers[0]).toBe('Name')
    expect(table.records.map((r) => r.cells[0])).toEqual(['Sol Ring', 'Cultivate'])
  })

  it('detects tab and ignores delimiters inside quotes', () => {
    expect(detectDelimiter('Name\tQty\tSet')).toBe('\t')
    expect(detectDelimiter('"a;b;c",Name,Qty')).toBe(',')
    expect(detectDelimiter('Name,Qty')).toBe(',')
  })

  it('skips blank lines but counts them for line numbers', () => {
    const table = readCsv('Name,Qty\n\nSol Ring,1\n')
    expect(table.records).toHaveLength(1)
    expect(table.records[0].line).toBe(3)
  })
})

describe('header alias table (§3.2), one case per row', () => {
  const table: Array<[string, string, number]> = [
    ['quantity', 'Quantity', 0],
    ['quantity', 'Qty', 0],
    ['quantity', 'Count', 0],
    ['quantity', 'Amount', 0],
    ['quantity', 'Qty.', 0],
    ['name', 'Name', 0],
    ['name', 'Card Name', 0],
    ['name', 'Card', 0],
    ['name', 'Card_Name', 0],
    ['name', 'card_name', 0],
    ['scryfallId', 'Scryfall ID', 0],
    ['scryfallId', 'ScryfallID', 0],
    ['scryfallId', 'scryfall_id', 0],
    ['setCode', 'Set code', 0],
    ['setCode', 'Set Code', 0],
    ['setCode', 'Edition Code', 0],
    ['setCode', 'Set', 0],
    ['setCode', 'set_code', 0],
    ['setCode', 'Printing', 0],
    ['setName', 'Set name', 0],
    ['setName', 'Edition', 0],
    ['setName', 'Edition Name', 0],
    ['setName', 'Set Name', 0],
    ['collectorNumber', 'Collector number', 0],
    ['collectorNumber', 'Collector Number', 0],
    ['collectorNumber', 'Card Number', 0],
    ['collectorNumber', 'collector_number', 0],
    ['finish', 'Foil', 0],
    ['finish', 'Finish', 0],
    ['finish', 'Is Foil', 0],
    ['finish', 'is_foil', 0],
    ['condition', 'Condition', 0],
    ['language', 'Language', 0],
    ['proxy', 'Proxy', 0],
    ['proxy', 'Is Proxy', 0],
    ['proxy', 'proxy', 0],
  ]
  it.each(table)('%s accepts "%s"', (column, header) => {
    const map = mapCsvHeaders([header]) as Record<string, number>
    expect(map[column]).toBe(0)
  })

  it.each(['Board', 'Section', 'Zone', 'Categories', 'Category', 'Tags', 'Label'])(
    'board column accepts "%s"',
    (header) => {
      expect(mapCsvHeaders([header]).boardColumns).toEqual([0])
    }
  )

  it('is case-insensitive and trims spaces', () => {
    const map = mapCsvHeaders(['  QTY ', ' CARD NAME', 'set   code'])
    expect(map).toMatchObject({ quantity: 0, name: 1, setCode: 2 })
  })

  it('Number is the quantity alone, the collector number when a quantity exists elsewhere', () => {
    expect(mapCsvHeaders(['Number', 'Name'])).toMatchObject({ quantity: 0 })
    expect(mapCsvHeaders(['Number', 'Name']).collectorNumber).toBeUndefined()
    expect(mapCsvHeaders(['Qty', 'Name', 'Number'])).toMatchObject({ quantity: 0, collectorNumber: 2 })
  })

  it('keeps more than one board-ish column (Categories and Tags)', () => {
    expect(mapCsvHeaders(['Name', 'Categories', 'Tags']).boardColumns).toEqual([1, 2])
  })

  it('ignores unknown columns', () => {
    expect(mapCsvHeaders(['Name', 'Rarity', 'Mana Cost', 'Price'])).toEqual({ name: 0 })
  })
})

describe('cell rules', () => {
  it('reads set codes (2-6 chars) apart from set names', () => {
    expect(looksLikeSetCode('cmm')).toBe(true)
    expect(looksLikeSetCode('Commander Masters')).toBe(false)
    expect(looksLikeSetCode('a')).toBe(false)
  })

  it('normalises finish cells from every site', () => {
    expect(normaliseFinishCell('Foil')).toBe('foil')
    expect(normaliseFinishCell('1')).toBe('foil')
    expect(normaliseFinishCell('etched')).toBe('etched')
    expect(normaliseFinishCell('0')).toBe('normal')
    expect(normaliseFinishCell('Normal')).toBe('normal')
    expect(normaliseFinishCell('')).toBe('')
  })

  it('board cell: a named board beats type categories', () => {
    expect(boardFromCells(['[Ramp,Removal]']).board).toBe('main')
    expect(boardFromCells(['Ramp, Commander']).board).toBe('commander')
    expect(boardFromCells(['[Maybeboard]']).board).toBe('maybeboard')
    expect(boardFromCells(['Sideboard']).board).toBe('maybeboard')
    expect(boardFromCells(['side']).board).toBe('maybeboard')
    expect(boardFromCells(['maybe']).board).toBe('maybeboard')
    expect(boardFromCells(['main']).board).toBe('main')
  })

  it('board cell: disagreement goes maybeboard > commander > main with a warning', () => {
    const result = boardFromCells(['Commander, Maybeboard'])
    expect(result.board).toBe('maybeboard')
    expect(result.warning).toMatch(/more than one section/)
    expect(boardFromCells(['Commander', 'Maybeboard']).board).toBe('maybeboard')
  })
})

describe('detection (E-12)', () => {
  it('recognises every site CSV by its aliases', () => {
    for (const name of [
      'archidekt-deck.csv',
      'moxfield-deck.csv',
      'tappedout-deck.csv',
      'deckbox-deck.csv',
      'deckstats-deck.csv',
      'edge-bom-crlf-semicolon.csv',
      'edge-quoted-newline.csv',
    ]) {
      expect(isManaBoxCsv(fixture(name)), name).toBe(true)
      expect(detectManaBoxFile(fixture(name)), name).toBe('csv')
    }
  })

  it('a text list is not mistaken for a CSV; a short comma sentence is not a header', () => {
    expect(isManaBoxCsv('1 Sol Ring (CMM) 400\n')).toBe(false)
    expect(isManaBoxCsv('Hello, world\nthings')).toBe(false)
    expect(isCsvHeaderLine('Name,Qty')).toBe(false)
    expect(isCsvHeaderLine('Name,Qty,Set')).toBe(true)
  })
})

describe('per-site CSV fixtures through the one parser', () => {
  it('Archidekt: boards, finish, set code and quoted names', () => {
    const { records, badRows } = parseManaBoxCsv(fixture('archidekt-deck.csv'))
    expect(badRows).toEqual([])
    const byName = Object.fromEntries(records.map((r) => [r.row.name, r]))
    expect(byName["Atraxa, Praetors' Voice"].row.board).toBe('commander')
    expect(byName['Sol Ring'].row.board).toBe('main')
    expect(byName['Cultivate'].row.board).toBe('main')
    expect(byName['Cultivate'].rawFoil).toBe('foil')
    expect(byName['Swords to Plowshares'].row.board).toBe('maybeboard')
    expect(byName['Swords to Plowshares'].rawFoil).toBe('etched')
    expect(byName['Mana Crypt'].row.board).toBe('maybeboard')
    expect(byName['Sol Ring'].row.setCode).toBe('cmm')
    expect(byName['Sol Ring'].row.collectorNumber).toBe('400')
  })

  it('Moxfield: Count, Edition as a code, Tags with a Proxy label', () => {
    const { records } = parseManaBoxCsv(fixture('moxfield-deck.csv'))
    expect(records.map((r) => r.row.quantity)).toEqual([1, 2, 1])
    expect(records[0].row.setCode).toBe('cmm')
    expect(records[1].rawFoil).toBe('foil')
    expect(records[2].rawFoil).toBe('etched')
    expect(records[0].rawFoil).toBe('')
  })

  it('TappedOut: Board column main/side/maybe/commander, Printing as code', () => {
    const { records } = parseManaBoxCsv(fixture('tappedout-deck.csv'))
    expect(records.map((r) => r.row.board)).toEqual(['main', 'main', 'maybeboard', 'maybeboard', 'commander'])
    expect(records[0].row.setCode).toBe('cmm')
    expect(records[4].row.name).toBe("Atraxa, Praetors' Voice")
  })

  it('Deckbox: Edition is a set NAME, kept as a name and not used as a code', () => {
    const { records } = parseManaBoxCsv(fixture('deckbox-deck.csv'))
    expect(records[0].row.setCode).toBe('')
    expect(records[0].row.setName).toBe('Commander Masters')
    expect(records[0].row.collectorNumber).toBe('400')
    expect(records[1].rawFoil).toBe('foil')
  })

  it('Deckbox rows fall back to name-only lookup (no name → code table)', async () => {
    const resolver = nameResolver()
    const preview = await buildDeckPreview(
      { fileName: 'deckbox-deck.csv', csvContent: fixture('deckbox-deck.csv') },
      resolver
    )
    expect(resolver.nameCalls).toEqual(['Sol Ring', 'Cultivate'])
    expect(resolver.setCalls).toEqual([])
    expect(preview.rows).toHaveLength(2)
    expect(preview.rows[0].printingGiven).toBe(false)
  })

  it('Deckstats: amount, card_name, is_foil 1/0', () => {
    const { records } = parseManaBoxCsv(fixture('deckstats-deck.csv'))
    expect(records.map((r) => r.row.name)).toEqual(['Sol Ring', 'Cultivate'])
    expect(records[0].rawFoil).toBe('normal')
    expect(records[1].rawFoil).toBe('foil')
  })

  it('BOM + CRLF + semicolon file parses completely (E-10, E-11)', () => {
    const { records, badRows } = parseManaBoxCsv(fixture('edge-bom-crlf-semicolon.csv'))
    expect(badRows).toEqual([])
    expect(records.map((r) => [r.row.name, r.row.quantity, r.row.setCode])).toEqual([
      ['Sol Ring', 1, 'cmm'],
      ['Cultivate', 2, 'c21'],
    ])
  })

  it('quoted newline: the multi-line name stays one row (E-9)', () => {
    const { records, badRows } = parseManaBoxCsv(fixture('edge-quoted-newline.csv'))
    expect(badRows).toEqual([])
    expect(records).toHaveLength(3)
    expect(records[1].row.name).toBe('Line one\nline two "quoted"')
  })
})

describe('row rules', () => {
  it('a missing quantity column means 1; an empty or bad quantity cell is unmatched', () => {
    const noColumn = parseManaBoxCsv('Name,Set code\nSol Ring,cmm')
    expect(noColumn.records[0].row.quantity).toBe(1)

    const bad = parseManaBoxCsv('Name,Qty\nSol Ring,\nCultivate,two\nMana Crypt,0\nArcane Signet,3')
    expect(bad.records.map((r) => r.row.name)).toEqual(['Arcane Signet'])
    expect(bad.badRows.map((r) => r.cardName)).toEqual(['Sol Ring', 'Cultivate', 'Mana Crypt'])
    expect(bad.badRows.every((r) => r.reason === 'bad_line')).toBe(true)
  })

  it('a Scryfall ID is optional', () => {
    const { records } = parseManaBoxCsv('Name,Qty,Set,Number\nSol Ring,1,cmm,400')
    // Number is the collector number because a quantity column exists elsewhere
    expect(records[0].row).toMatchObject({ setCode: 'cmm', collectorNumber: '400', scryfallId: '' })
  })

  it('warns when one row names two sections', () => {
    const { warnings } = parseManaBoxCsv('Name,Qty,Categories\nSol Ring,1,"Commander,Maybeboard"')
    expect(warnings[0]).toMatch(/Line 2/)
  })

  it('a ManaBox collection file still reads its Proxy and board defaults (every row main)', () => {
    const { records } = parseManaBoxCsv(
      'Name,Set code,Collector number,Foil,Quantity,Proxy\nSol Ring,cmm,400,normal,1,true'
    )
    expect(records[0].row.board).toBe('main')
    expect(records[0].row.proxy).toBe(true)
  })

  it('a name column is required', () => {
    expect(() => parseManaBoxCsv('Qty,Set\n1,cmm')).toThrow(/Name/)
  })
})

describe('older Archidekt parser now uses the shared reader', () => {
  it('reads Archidekt CSV, keeps the maybeboard out of the main list, finds the commander', () => {
    const result = parseDeckCSV(fixture('archidekt-deck.csv'), 'Test')
    if (isCSVParseError(result)) throw new Error(result.error)
    expect(result.deck.cards.map((c) => c.cardName)).toEqual([
      "Atraxa, Praetors' Voice",
      'Sol Ring',
      'Cultivate',
    ])
    expect(result.deck.maybeboard?.map((c) => c.cardName)).toEqual(['Swords to Plowshares', 'Mana Crypt'])
    expect(result.deck.commander?.cardName).toBe("Atraxa, Praetors' Voice")
  })

  it('survives a quoted newline and a bad quantity', () => {
    const result = parseDeckCSV('Quantity,Name\n1,"A\nB"\nx,Sol Ring\n', 'T')
    if (isCSVParseError(result)) throw new Error(result.error)
    expect(result.deck.cards).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/not a whole number/)
  })
})
