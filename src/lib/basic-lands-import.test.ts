/**
 * Round 12 verification: basic lands through both import paths.
 *
 * Two kinds of basics must coexist:
 *  (A) specific lands (the source names the printing) -> real copies, printing/finish/language/condition kept;
 *  (B) generic lands (no printing) -> no collection copy.
 * Everything here runs in memory (fake resolver, fake database client). Nothing touches a real database.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { executeManaBoxCollectionImport } from '@/lib/manabox-collection-import'
import { importManaBoxDeck } from '@/lib/manabox-deck-import'
import { isGenericBasic, hasPrintingGiven } from '@/lib/basic-lands'
import { computeTotals } from '@/components/manabox-import/types'
import { buildCollectionPreview, buildDeckPreview, type ManaBoxCardFacts, type ManaBoxResolver } from '@/lib/manabox-import'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'

const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

type Fin = 'nonfoil' | 'foil' | 'etched'
interface Printing {
  id: string
  name: string
  set: string
  num: string
  finishes: Fin[]
}

const PRINTINGS: Printing[] = [
  { id: 'plains-a', name: 'Plains', set: 'm21', num: '262', finishes: ['nonfoil', 'foil'] },
  { id: 'plains-b', name: 'Plains', set: 'znr', num: '265', finishes: ['nonfoil', 'foil'] },
  { id: 'island-a', name: 'Island', set: 'm21', num: '264', finishes: ['nonfoil', 'foil'] },
  { id: 'swamp-znr', name: 'Swamp', set: 'znr', num: '267', finishes: ['nonfoil', 'foil'] },
  { id: 'swamp-m21', name: 'Swamp', set: 'm21', num: '266', finishes: ['nonfoil', 'foil'] },
  { id: 'mountain-a', name: 'Mountain', set: 'm21', num: '268', finishes: ['nonfoil', 'foil'] },
  { id: 'forest-a', name: 'Forest', set: 'm21', num: '270', finishes: ['nonfoil', 'foil'] },
  { id: 'wastes-a', name: 'Wastes', set: 'ogw', num: '183', finishes: ['nonfoil', 'foil'] },
  { id: 'snow-forest', name: 'Snow-Covered Forest', set: 'khm', num: '285', finishes: ['nonfoil', 'foil', 'etched'] },
  { id: 'snow-swamp', name: 'Snow-Covered Swamp', set: 'khm', num: '283', finishes: ['nonfoil', 'foil'] },
  { id: 'sol-a', name: 'Sol Ring', set: 'c21', num: '263', finishes: ['nonfoil', 'foil'] },
]

function factsOf(p: Printing): ManaBoxCardFacts {
  return {
    oracleId: `oracle-${p.name}`,
    scryfallId: p.id,
    cardName: p.name,
    setCode: p.set,
    layout: 'normal',
    typeLine: p.name.startsWith('Snow') ? 'Basic Snow Land — Forest' : 'Basic Land — Plains',
    availableFinishes: p.finishes,
  }
}

const resolver: ManaBoxResolver = {
  async resolveByScryfallId(id) {
    const p = PRINTINGS.find((x) => x.id === id.trim())
    return p ? factsOf(p) : null
  },
  async resolveBySetCollector(set, num) {
    const p = PRINTINGS.find((x) => x.set === set.trim().toLowerCase() && x.num === num.trim())
    return p ? factsOf(p) : null
  },
  // Plain names resolve to the first listed printing (the default).
  async resolveByName(name) {
    const p = PRINTINGS.find((x) => x.name.toLowerCase() === name.trim().toLowerCase())
    return p ? factsOf(p) : null
  },
}

const printingRows = PRINTINGS.map((p) => ({
  scryfall_id: p.id,
  oracle_id: `oracle-${p.name}`,
  type_line: 'Basic Land',
  finishes: p.finishes,
}))

function fakeClient() {
  const rpc: Array<{ name: string; rows: Array<Record<string, unknown>> }> = []
  const client = {
    from() {
      return {
        async insert() {
          return { error: null }
        },
        upsert(rows: unknown) {
          const list = (Array.isArray(rows) ? rows : [rows]) as Array<Record<string, unknown>>
          return { select: async () => ({ data: list.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })), error: null }) }
        },
        select() {
          return { in: async () => ({ data: printingRows, error: null }) }
        },
      }
    },
    async rpc(name: string, args: { p_rows: Array<Record<string, unknown>> }) {
      rpc.push({ name, rows: args.p_rows })
      return { data: { success: true, inserted_count: args.p_rows.length }, error: null }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, rpc }
}

const HEADER = 'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language'
const COLLECTION_CSV = [
  HEADER,
  'Plains,m21,262,normal,12,plains-a,near_mint,en',
  'Plains,znr,265,foil,3,plains-b,lightly_played,ja',
  'Island,m21,264,normal,20,island-a,near_mint,en',
  'Island,m21,264,foil,2,island-a,near_mint,en',
  'Swamp,znr,267,normal,5,swamp-znr,moderately_played,de',
  'Swamp,m21,266,normal,5,swamp-m21,near_mint,en',
  'Mountain,m21,268,normal,7,mountain-a,near_mint,en',
  'Forest,m21,270,normal,9,forest-a,near_mint,en',
  'Wastes,ogw,183,normal,2,wastes-a,near_mint,en',
  'Snow-Covered Forest,khm,285,etched,1,snow-forest,near_mint,en',
  'Snow-Covered Swamp,khm,283,foil,4,snow-swamp,damaged,fr',
].join('\n')

describe('(1) collection import: basics are normal real copies', () => {
  it('previews every basic as its own ordinary row (no generic collapse, no name de-dupe)', async () => {
    const preview = await buildCollectionPreview({ fileName: 'basics.csv', csvContent: COLLECTION_CSV }, resolver)
    // 11 CSV lines -> 11 rows: two Plains printings, two Swamp printings and two Island finishes stay separate.
    expect(preview.rows).toHaveLength(11)
    expect(preview.rows.map((r) => r.qty)).toEqual([12, 3, 20, 2, 5, 5, 7, 9, 2, 1, 4])
    expect(new Set(preview.rows.map((r) => r.rowKey)).size).toBe(11)
    expect(preview.unmatched).toEqual([])
  })

  it('writes one real copy per physical card with exact printing, finish, language, condition', async () => {
    const { client, rpc } = fakeClient()
    const summary = await executeManaBoxCollectionImport({
      csvContent: COLLECTION_CSV,
      fileName: 'basics.csv',
      userId: 'user-a',
      defaults: DEFAULTS,
      resolver,
      supabase: client,
    })
    const total = 12 + 3 + 20 + 2 + 5 + 5 + 7 + 9 + 2 + 1 + 4
    expect(summary.inserted).toBe(total)
    expect(rpc).toHaveLength(1)
    expect(rpc[0].name).toBe('insert_user_copies')
    const rows = rpc[0].rows
    expect(rows).toHaveLength(total)

    const count = (pred: (r: Record<string, unknown>) => boolean) => rows.filter(pred).length
    // Same name, different printing stays different (Swamp ZNR vs Swamp M21).
    expect(count((r) => r.printing_id === 'swamp-znr')).toBe(5)
    expect(count((r) => r.printing_id === 'swamp-m21')).toBe(5)
    // Language, condition and finish are the file's.
    const zbSwamp = rows.find((r) => r.printing_id === 'swamp-znr')!
    expect(zbSwamp).toMatchObject({ language: 'de', card_condition: 'moderately_played', finish: 'nonfoil', is_proxy: false })
    const jaPlains = rows.find((r) => r.printing_id === 'plains-b')!
    expect(jaPlains).toMatchObject({ language: 'ja', card_condition: 'lightly_played', finish: 'foil' })
    // Same printing, different finish stays different (Island).
    expect(count((r) => r.printing_id === 'island-a' && r.finish === 'nonfoil')).toBe(20)
    expect(count((r) => r.printing_id === 'island-a' && r.finish === 'foil')).toBe(2)
    // Wastes and snow-covered lands are ordinary too (etched kept).
    expect(count((r) => r.printing_id === 'wastes-a')).toBe(2)
    expect(rows.find((r) => r.printing_id === 'snow-forest')).toMatchObject({ finish: 'etched' })
    expect(rows.find((r) => r.printing_id === 'snow-swamp')).toMatchObject({ finish: 'foil', language: 'fr', card_condition: 'damaged' })
    // Never marked as a planned/generic slot.
    expect(rows.some((r) => 'is_maybeboard' in r && r.is_maybeboard)).toBe(false)
  })
})

/** Turn a deck preview's rows into the cards the deck import writes (what the review screen posts). */
async function deckFromText(text: string) {
  const preview = await buildDeckPreview({ fileName: 'deck.txt', textContent: text }, resolver)
  const cards = preview.rows.map((row) => ({
    cardName: row.cardName,
    scryfallId: row.scryfallId,
    oracleId: row.oracleId,
    setCode: row.setCode,
    collectorNumber: row.collectorNumber,
    quantity: row.qty,
    typeLine: '',
    isCommander: false,
    isProxy: false,
    manaCost: null,
    colorIdentity: [],
    sourceCategories: [],
    rowKey: row.rowKey,
    sourceIndex: row.sourceIndex,
    printingGiven: row.printingGiven,
    copies: row.copies,
  }))
  return {
    preview,
    deck: {
      name: 'D',
      platform: 'manabox',
      platformDeckId: 'x',
      sourceUrl: '',
      commander: null,
      cards,
      cardCount: cards.reduce((s, c) => s + c.quantity, 0),
      colourIdentity: '',
    },
  }
}

const importOnce = async (text: string, copyEdits?: Record<string, Record<number, Record<string, unknown>>>) => {
  const { deck } = await deckFromText(text)
  const { client, rpc } = fakeClient()
  await importManaBoxDeck({
    deck: deck as never,
    name: 'D',
    defaults: DEFAULTS,
    copyEdits: copyEdits as never,
    userId: 'user-a',
    supabase: client,
  })
  return rpc[0].rows
}

describe('(2) deck import: a basic naming a printing is a real card', () => {
  it('"Swamp (ZNR) 267" becomes real copies of exactly that printing', async () => {
    const rows = await importOnce('3 Swamp (ZNR) 267\n2 Swamp (M21) 266')
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.is_maybeboard === false && r.card_id !== null)).toBe(true)
    expect(rows.filter((r) => r.scryfall_id === 'swamp-znr')).toHaveLength(3)
    expect(rows.filter((r) => r.scryfall_id === 'swamp-m21')).toHaveLength(2)
    expect(rows[0]).toMatchObject({ set_code: 'znr', scryfall_id: 'swamp-znr' })
  })

  it('follows the ordinary Original/Proxy/Unsleeved rules, with per-copy edits', async () => {
    const { deck } = await deckFromText('3 Swamp (ZNR) 267')
    const key = (deck.cards[0] as { rowKey: string }).rowKey
    const rows = await importOnce('3 Swamp (ZNR) 267', {
      [key]: { 0: { finish: 'foil', language: 'ja' }, 1: { type: 'proxy' }, 2: { type: 'unsleeved' } },
    })
    expect(rows[0]).toMatchObject({ is_maybeboard: false, finish: 'foil', language: 'ja' })
    expect(rows[1]).toMatchObject({ is_proxy: true })
    expect(rows[2]).toMatchObject({ is_maybeboard: true, card_id: null })
  })
})

describe('(3) deck import: both kinds in one list', () => {
  const LIST = '11 Plains\n1 Swamp (ZNR) 267'

  it('"11 Plains" is 11 generic slots; "Swamp (ZNR) 267" is one real copy', async () => {
    const { preview } = await deckFromText(LIST)
    expect(preview.rows.map((r) => [r.cardName, r.printingGiven])).toEqual([
      ['Plains', false],
      ['Swamp', true],
    ])
    const rows = await importOnce(LIST)
    expect(rows).toHaveLength(12)
    const plains = rows.filter((r) => r.card_name === 'Plains')
    expect(plains).toHaveLength(11)
    expect(plains.every((r) => r.card_id === null && r.is_generic === true && r.generic_sleeved === true)).toBe(true)
    const swamp = rows.filter((r) => r.card_name === 'Swamp')
    expect(swamp).toHaveLength(1)
    expect(swamp[0]).toMatchObject({ card_id: expect.anything(), is_maybeboard: false, scryfall_id: 'swamp-znr' })
  })

  it('a plain line never merges with a specific line even when the default printing is the same card', async () => {
    const { preview } = await deckFromText('2 Plains\n1 Plains (M21) 262')
    expect(preview.rows).toHaveLength(2)
    expect(new Set(preview.rows.map((r) => r.rowKey)).size).toBe(2)
  })

  it('the review footer counts generic basics apart from real copies', async () => {
    const { preview } = await deckFromText(LIST)
    const totals = computeTotals(preview.rows, 'deck', DEFAULTS, {})
    expect(totals).toMatchObject({ cards: 12, basics: 11, specificBasics: 1, tracked: 1 })
  })

  it('the "Generic basics" display toggle is not part of the import: the request has no such field', async () => {
    // The old option is gone from the options type; the result is the same whatever a stale client sends.
    const a = await importOnce(LIST)
    const { deck } = await deckFromText(LIST)
    const { client, rpc } = fakeClient()
    await importManaBoxDeck({
      deck: deck as never,
      name: 'D',
      defaults: DEFAULTS,
      userId: 'user-a',
      supabase: client,
      ...({ convertBasicLandsToGeneric: true } as object),
    })
    const b = rpc[0].rows
    expect(b).toEqual(a)
    const { client: c2, rpc: rpc2 } = fakeClient()
    await importManaBoxDeck({
      deck: deck as never,
      name: 'D',
      defaults: DEFAULTS,
      userId: 'user-a',
      supabase: c2,
      ...({ convertBasicLandsToGeneric: false } as object),
    })
    expect(rpc2[0].rows).toEqual(a)
  })
})

describe('isGenericBasic', () => {
  it('is true only for a basic land name with no printing given', () => {
    expect(isGenericBasic('Plains', false)).toBe(true)
    expect(isGenericBasic('Snow-Covered Forest', false)).toBe(true)
    expect(isGenericBasic('Plains', true)).toBe(false)
    expect(isGenericBasic('Sol Ring', false)).toBe(false)
  })
  it('hasPrintingGiven reads set, collector number or Scryfall id', () => {
    expect(hasPrintingGiven({ setCode: '', collectorNumber: '' })).toBe(false)
    expect(hasPrintingGiven({ setCode: 'znr', collectorNumber: '267' })).toBe(true)
    expect(hasPrintingGiven({ scryfallId: 'abc' })).toBe(true)
    expect(hasPrintingGiven({ setCode: ' ', collectorNumber: ' ' })).toBe(false)
  })
})

describe('(4) a non-basic plain name still resolves to a real card', () => {
  it('"1 Sol Ring" is a real copy on the default printing', async () => {
    const rows = await importOnce('1 Sol Ring')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ is_maybeboard: false, scryfall_id: 'sol-a' })
    expect(rows[0].card_id).not.toBeNull()
  })
})
