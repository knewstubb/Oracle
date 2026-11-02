import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDeckPreview,
  parseManaBoxText,
  textLineFileValues,
  type ManaBoxCardFacts,
  type ManaBoxResolver,
} from '@/lib/manabox-import'
import { resolveRowCopies } from '@/lib/import-copies'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'

const INITIAL_IMPORT_DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

const ROOT = resolve(process.cwd(), 'docs/oracle/samples')
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8')

/** Resolver for text fixtures: every set + number resolves; foil is available everywhere. */
function textResolver(): ManaBoxResolver {
  return {
    async resolveByScryfallId() {
      return null
    },
    async resolveBySetCollector(setCode, collectorNumber) {
      return {
        oracleId: `oracle-${setCode}-${collectorNumber}`,
        scryfallId: `sf-${setCode.toLowerCase()}-${collectorNumber}`,
        cardName: 'Card',
        setCode: setCode.toLowerCase(),
        collectorNumber,
        layout: null,
        typeLine: 'Artifact',
        availableFinishes: ['nonfoil', 'foil', 'etched'],
      } satisfies ManaBoxCardFacts
    },
  }
}

describe('S-4 text finish markers (N-3)', () => {
  it('*F* and *E* set the copy finish on the review row; unmarked lines set none', async () => {
    const preview = await buildDeckPreview(
      { fileName: 'moxfield-deck.txt', textContent: read('import-formats/moxfield-deck.txt') },
      textResolver()
    )
    const byKey = (set: string) => preview.rows.find((r) => r.setCode === set.toLowerCase())!
    expect(byKey('CMM').copies.some((c) => c.file.finish === 'foil')).toBe(true)
    expect(byKey('C21').copies[0].file.finish).toBe('etched')
    expect(byKey('CLB').copies[0].file.finish).toBeUndefined()
  })

  it('the resolved copy is Foil / Etched with the file as the source, others follow the default', async () => {
    const preview = await buildDeckPreview(
      { fileName: 'moxfield-deck.txt', textContent: read('import-formats/moxfield-deck.txt') },
      textResolver()
    )
    const sol = preview.rows.find((r) => r.setCode === 'cmm' && r.collectorNumber === '400')!
    const arcane = preview.rows.find((r) => r.setCode === 'c21')!
    const tower = preview.rows.find((r) => r.setCode === 'clb')!
    const resolved = (row: typeof sol) => resolveRowCopies(row, INITIAL_IMPORT_DEFAULTS)[0]
    expect(resolved(sol).finish).toBe('foil')
    expect(resolved(arcane).finish).toBe('etched')
    expect(resolved(tower).finish).toBe('nonfoil')
  })

  it('the owner can still untick Foil on the row', async () => {
    const preview = await buildDeckPreview(
      { fileName: 'moxfield-deck.txt', textContent: read('import-formats/moxfield-deck.txt') },
      textResolver()
    )
    const sol = preview.rows.find((r) => r.setCode === 'cmm' && r.collectorNumber === '400')!
    const edits = { [sol.rowKey]: { 0: { finish: 'nonfoil' as const } } }
    expect(resolveRowCopies(sol, INITIAL_IMPORT_DEFAULTS, edits, sol.rowKey)[0].finish).toBe('nonfoil')
  })

  it('ManaBox text samples without markers stay nonfoil (D-049)', async () => {
    for (const name of ['Armageddon.txt', 'Strixhaven.txt']) {
      const content = read(`manabox/${name}`)
      const preview = await buildDeckPreview({ fileName: name, textContent: content }, textResolver())
      expect(preview.rows.length).toBeGreaterThan(0)
      for (const row of preview.rows) {
        for (const copy of row.copies) expect(copy.file.finish, `${name} ${row.cardName}`).toBeUndefined()
        for (const copy of resolveRowCopies(row, INITIAL_IMPORT_DEFAULTS)) expect(copy.finish).toBe('nonfoil')
      }
    }
  })

  it('a ^Proxy^ label sets the Proxy default on text rows', async () => {
    const text = '1 Sol Ring (CMM) 400 ^Proxy^\n1 Cultivate (C21) 244\n'
    const preview = await buildDeckPreview({ fileName: 'x.txt', textContent: text }, textResolver())
    const types = preview.rows.map((r) => resolveRowCopies(r, INITIAL_IMPORT_DEFAULTS)[0].type)
    expect(types).toEqual(['proxy', 'original'])
  })

  it('textLineFileValues maps markers and leaves blanks unset', () => {
    expect(textLineFileValues({})).toEqual({})
    expect(textLineFileValues({ finish: 'etched', proxy: true })).toEqual({ finish: 'etched', proxy: true })
    expect(parseManaBoxText('1 Sol Ring (CMM) 400 *F*').lines[0].finish).toBe('foil')
  })
})

describe('S-4 CSV Foil / Finish / Is Foil columns', () => {
  it('Archidekt Finish and Moxfield Foil set finish on the copies', async () => {
    const resolver: ManaBoxResolver = textResolver()
    const arch = await buildDeckPreview(
      { fileName: 'a.csv', csvContent: read('import-formats/archidekt-deck.csv') },
      resolver
    )
    const finishOf = (preview: typeof arch, set: string) =>
      preview.rows.find((r) => r.setCode === set)!.copies[0].file.finish
    expect(finishOf(arch, 'c21')).toBe('foil')
    expect(finishOf(arch, 'sta')).toBe('etched')
    expect(finishOf(arch, 'cmm')).toBe('nonfoil')

    const mox = await buildDeckPreview(
      { fileName: 'm.csv', csvContent: read('import-formats/moxfield-deck.csv') },
      resolver
    )
    expect(finishOf(mox, 'c21')).toBe('foil')
    expect(finishOf(mox, 'sta')).toBe('etched')
    // a blank Foil cell is "not supplied", not nonfoil
    expect(finishOf(mox, 'cmm')).toBeUndefined()
  })

  it('Deckstats is_foil 1/0 sets foil / nonfoil', async () => {
    const preview = await buildDeckPreview(
      { fileName: 'd.csv', csvContent: read('import-formats/deckstats-deck.csv') },
      textResolver()
    )
    expect(preview.rows.find((r) => r.setCode === 'cmm')!.copies[0].file.finish).toBe('nonfoil')
    expect(preview.rows.find((r) => r.setCode === 'c21')!.copies[0].file.finish).toBe('foil')
  })
})
