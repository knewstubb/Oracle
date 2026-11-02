/**
 * The owner's real ManaBox file (tests/fixtures/rocco.csv) through the real path of the deck import with the
 * "I bought it" choice (intent 'purchased'): parse -> preview -> save. Only the database is fake.
 * Every card the file's Proxy column marks must be saved as a Proxy; every other card as an Original.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { buildDeckPreview, parseManaBoxCsv, type ManaBoxCardFacts, type ManaBoxResolver } from '@/lib/manabox-import'
import { importManaBoxDeck, type ManaBoxDeckCard } from '@/lib/manabox-deck-import'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

const CSV = readFileSync(join(__dirname, '../../tests/fixtures/rocco.csv'), 'utf8')
const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

/** The six cards the file's Proxy column marks true (read from the file, checked against a known list below). */
const { records } = parseManaBoxCsv(CSV)
const proxyNames = records.filter((r) => r.row.proxy === true).map((r) => r.row.name)

function resolverFromFile(): ManaBoxResolver {
  const byId = new Map<string, ManaBoxCardFacts>()
  for (const { row } of records) {
    byId.set(row.scryfallId, {
      oracleId: `oracle-${row.scryfallId}`,
      scryfallId: row.scryfallId,
      cardName: row.name,
      setCode: row.setCode.toLowerCase(),
      collectorNumber: row.collectorNumber,
      layout: 'normal',
      typeLine: 'Creature',
      availableFinishes: ['nonfoil', 'foil'],
    })
  }
  return {
    async resolveByScryfallId(id) {
      return byId.get(id.trim()) ?? null
    },
    async resolveBySetCollector() {
      return null
    },
  }
}

function fakeDb() {
  const rpcCalls: Array<{ name: string; rows: Array<Record<string, unknown>> }> = []
  const printings = [...new Set(records.map((r) => r.row.scryfallId))].map((id) => ({
    scryfall_id: id,
    oracle_id: `oracle-${id}`,
    type_line: 'Creature',
    finishes: ['nonfoil', 'foil'],
  }))
  const client = {
    from() {
      return {
        async insert() {
          return { error: null }
        },
        upsert(rows: unknown) {
          const list = rows as Array<Record<string, unknown>>
          return { select: async () => ({ data: list.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })), error: null }) }
        },
        select() {
          const chain: Record<string, unknown> = { eq: () => chain, limit: async () => ({ data: [], error: null }) }
          return { ...chain, in: async () => ({ data: printings, error: null }) }
        },
        delete() {
          const chain = { eq: () => chain, then: (resolve: (v: unknown) => void) => resolve({ error: null }) }
          return chain
        },
      }
    },
    async rpc(name: string, args: { p_rows: Array<Record<string, unknown>> }) {
      rpcCalls.push({ name, rows: args.p_rows })
      return { data: { success: true, inserted_count: args.p_rows.length, needs_a_look: [] }, error: null }
    },
  }
  return { client: client as never, rpcCalls }
}

describe('rocco.csv with "I bought it" (purchased)', () => {
  it('the file marks exactly the six expected proxies', () => {
    expect(records).toHaveLength(99)
    expect([...proxyNames].sort()).toEqual(
      ['Delighted Halfling', 'Elvish Mystic', 'Eternal Witness', 'Wild Growth', 'Windswept Heath', 'Wooded Foothills'].sort()
    )
  })

  it('preview then save: the six proxies are saved as Proxy, everything else as Original', async () => {
    const preview = await buildDeckPreview({ fileName: 'rocco.csv', csvContent: CSV }, resolverFromFile())
    expect(preview.unmatched).toHaveLength(0)

    // What the browser sends: each preview row with its file values and no owner edits.
    const cards: ManaBoxDeckCard[] = preview.rows.map((row) => ({
      cardName: row.cardName,
      scryfallId: row.scryfallId,
      oracleId: row.oracleId,
      setCode: row.setCode,
      collectorNumber: row.collectorNumber,
      quantity: row.qty,
      typeLine: 'Creature',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: [],
      rowKey: row.rowKey,
      copies: row.copies,
      printingGiven: row.printingGiven,
      sourceIndex: row.sourceIndex,
    })) as unknown as ManaBoxDeckCard[]
    const deck = {
      name: 'Rocco',
      platform: 'manabox',
      platformDeckId: '',
      sourceUrl: '',
      commander: null,
      cards,
      cardCount: cards.reduce((n, c) => n + c.quantity, 0),
      colourIdentity: '',
    } as unknown as NormalizedDeck

    const db = fakeDb()
    await importManaBoxDeck({ deck, name: 'Rocco', defaults: DEFAULTS, userId: 'u', supabase: db.client, intent: 'purchased' })

    const rows = db.rpcCalls[0].rows
    expect(rows).toHaveLength(100)
    const proxies = rows.filter((r) => r.is_proxy === true)
    expect(proxies.map((r) => r.card_name).sort()).toEqual([...proxyNames].sort())
    expect(proxies).toHaveLength(6)
    expect(rows.filter((r) => r.is_proxy !== true)).toHaveLength(94)
    // Everything is added and sleeved under "I bought it".
    expect(new Set(rows.map((r) => r.action))).toEqual(new Set(['add_sleeved']))
  })
})
