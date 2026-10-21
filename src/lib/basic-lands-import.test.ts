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

describe('(2) deck import, Generic basics OFF', () => {
  it('"Swamp (ZNR) 267" becomes real copies of exactly that printing', async () => {
    const { deck } = await deckFromText('3 Swamp (ZNR) 267\n2 Swamp (M21) 266')
    const { client, rpc } = fakeClient()
    await importManaBoxDeck({
      deck: deck as never,
      name: 'D',
      defaults: DEFAULTS,
      convertBasicLandsToGeneric: false,
      userId: 'user-a',
      supabase: client,
    })
    const rows = rpc[0].rows
    expect(rows).toHaveLength(5)
    expect(rows.every((r) => r.is_maybeboard === false && r.card_id !== null)).toBe(true)
    expect(rows.filter((r) => r.scryfall_id === 'swamp-znr')).toHaveLength(3)
    expect(rows.filter((r) => r.scryfall_id === 'swamp-m21')).toHaveLength(2)
    expect(rows[0]).toMatchObject({ set_code: 'znr', scryfall_id: 'swamp-znr' })
  })
})

describe('(3) deck import, Generic basics ON (current behaviour, pinned)', () => {
  it('a basic line that names a printing still becomes a generic slot: no copy; the printing is only remembered on the slot', async () => {
    const { deck } = await deckFromText('3 Swamp (ZNR) 267')
    const { client, rpc } = fakeClient()
    await importManaBoxDeck({
      deck: deck as never,
      name: 'D',
      defaults: DEFAULTS,
      convertBasicLandsToGeneric: true,
      userId: 'user-a',
      supabase: client,
    })
    const rows = rpc[0].rows
    expect(rows).toHaveLength(3)
    // Planned slots, no copy created or linked, even though the source named ZNR #267.
    expect(rows.every((r) => r.card_id === null && r.is_maybeboard === true)).toBe(true)
    expect(rows[0]).toMatchObject({ scryfall_id: 'swamp-znr', set_code: 'znr' })
  })
})
