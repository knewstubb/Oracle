import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { executeManaBoxCollectionImport } from '@/lib/manabox-collection-import'
import { importManaBoxDeck } from '@/lib/manabox-deck-import'
import { ImportValidationError } from '@/lib/import-copies'
import type { ManaBoxCardFacts, ManaBoxResolver } from '@/lib/manabox-import'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'

const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

function facts(id: string, name: string, finishes: Array<'nonfoil' | 'foil' | 'etched'> | null): ManaBoxCardFacts {
  return {
    oracleId: `oracle-${id}`,
    scryfallId: id,
    cardName: name,
    setCode: 'c21',
    layout: 'normal',
    typeLine: 'Artifact',
    availableFinishes: finishes ?? undefined,
  }
}

function resolverOf(map: Record<string, ManaBoxCardFacts>): ManaBoxResolver {
  return {
    async resolveByScryfallId(id) {
      return map[id.trim()] ?? null
    },
    async resolveBySetCollector() {
      return null
    },
  }
}

interface Calls {
  rpc: Array<{ name: string; args: { p_user_id: string; p_rows: Array<Record<string, unknown>> } }>
  upserts: string[]
  decksInserted: Array<Record<string, unknown>>
}

/** A fake client that records writes; `printings` answers the ref_printings read. */
function fakeClient(printings: Array<Record<string, unknown>> = [], takenDeckInserts = 0) {
  const calls: Calls = { rpc: [], upserts: [], decksInserted: [] }
  let insertAttempts = 0
  const client = {
    from(table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          calls.decksInserted.push({ table, ...row })
          insertAttempts++
          if (insertAttempts <= takenDeckInserts) return { error: { code: '23505', message: 'duplicate key' } }
          return { error: null }
        },
        upsert(rows: unknown) {
          calls.upserts.push(table)
          const list = (Array.isArray(rows) ? rows : [rows]) as Array<Record<string, unknown>>
          return {
            select: async () => ({
              data: list.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })),
              error: null,
            }),
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }
        },
        select() {
          return { in: async () => ({ data: printings, error: null }) }
        },
      }
    },
    async rpc(name: string, args: Calls['rpc'][number]['args']) {
      calls.rpc.push({ name, args })
      return { data: { success: true, inserted_count: args.p_rows.length }, error: null }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, calls }
}

const CSV = [
  'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language,Purchase price',
  'Sol Ring,c21,263,normal,1,sol,near_mint,en,1.50',
  'Sol Ring,c21,263,normal,2,sol,lightly_played,en,2.00',
].join('\n')

describe('collection write (tests 14, 16, 17)', () => {
  const resolver = resolverOf({ sol: facts('sol', 'Sol Ring', ['nonfoil', 'foil']) })

  it('writes one row per copy with edits applied and own price per line', async () => {
    const { client, calls } = fakeClient()
    const summary = await executeManaBoxCollectionImport({
      csvContent: CSV,
      fileName: 'x.csv',
      userId: 'user-a',
      defaults: DEFAULTS,
      copyEdits: { 'sol|nonfoil|en': { 1: { finish: 'foil' }, 2: { type: 'proxy' } } },
      resolver,
      supabase: client,
    })
    expect(summary.inserted).toBe(3)
    expect(summary.foils).toBe(1)
    expect(calls.rpc).toHaveLength(1)
    const rows = calls.rpc[0].args.p_rows
    expect(rows.map((r) => r.finish)).toEqual(['nonfoil', 'foil', 'nonfoil'])
    expect(rows.map((r) => r.card_condition)).toEqual(['near_mint', 'lightly_played', null])
    expect(rows[2].is_proxy).toBe(true)
    expect(rows.map((r) => r.purchase_price)).toEqual([1.5, 2, 2])
    expect(calls.rpc[0].args.p_user_id).toBe('user-a')
  })

  it('rejects an owner-chosen foil that Scryfall does not list, writing nothing', async () => {
    const { client, calls } = fakeClient()
    const nonFoilOnly = resolverOf({ sol: facts('sol', 'Sol Ring', ['nonfoil']) })
    await expect(
      executeManaBoxCollectionImport({
        csvContent: CSV,
        fileName: 'x.csv',
        userId: 'user-a',
        defaults: DEFAULTS,
        copyEdits: { 'sol|nonfoil|en': { 0: { finish: 'foil' } } },
        resolver: nonFoilOnly,
        supabase: client,
      })
    ).rejects.toBeInstanceOf(ImportValidationError)
    expect(calls.rpc).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
  })

  it('rejects an invalid batch before any write (atomicity)', async () => {
    const { client, calls } = fakeClient()
    await expect(
      executeManaBoxCollectionImport({
        csvContent: CSV,
        fileName: 'x.csv',
        userId: 'user-a',
        defaults: { finish: 'nonfoil', condition: 'BAD', language: 'en' } as unknown as ImportDefaults,
        resolver,
        supabase: client,
      })
    ).rejects.toBeInstanceOf(ImportValidationError)
    expect(calls.rpc).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
  })

  it('gives each user only their own rows', async () => {
    const a = fakeClient()
    const b = fakeClient()
    for (const [who, c] of [['user-a', a], ['user-b', b]] as const) {
      await executeManaBoxCollectionImport({
        csvContent: CSV,
        fileName: 'x.csv',
        userId: who,
        defaults: DEFAULTS,
        resolver,
        supabase: c.client,
      })
    }
    expect(a.calls.rpc[0].args.p_user_id).toBe('user-a')
    expect(b.calls.rpc[0].args.p_user_id).toBe('user-b')
  })
})

describe('deck write (tests 9, 12b, 16)', () => {
  const printings = [
    { scryfall_id: 'sol', oracle_id: 'oracle-sol', type_line: 'Artifact', finishes: ['nonfoil', 'foil'] },
  ]

  function deckOf(cards: Array<Record<string, unknown>>) {
    return {
      name: 'D',
      platform: 'manabox',
      platformDeckId: 'x',
      sourceUrl: '',
      commander: null,
      cards,
      cardCount: cards.length,
      colourIdentity: '',
    }
  }

  function solCard(copies: Array<Record<string, unknown>>) {
    return {
      cardName: 'Sol Ring',
      scryfallId: 'sol',
      oracleId: 'oracle-sol',
      setCode: 'c21',
      quantity: copies.length,
      typeLine: '',
      isCommander: false,
      isProxy: false,
      manaCost: null,
      colorIdentity: [],
      sourceCategories: [],
      rowKey: 'sol|text',
      sourceIndex: 1,
      copies: copies.map((file, index) => ({ index, sourceLine: 1, file })),
    }
  }

  it('Unsleeved is a planned slot with requested finish only; originals get per-copy values', async () => {
    const { client, calls } = fakeClient(printings)
    await importManaBoxDeck({
      deck: deckOf([solCard([{}, {}, {}])]) as never,
      name: 'D',
      defaults: DEFAULTS,
      copyEdits: {
        'sol|text': {
          0: { finish: 'foil', language: 'ja' },
          1: { type: 'proxy' },
          2: { type: 'unsleeved', finish: 'foil', language: 'de', condition: 'heavily_played' },
        },
      },
      userId: 'user-a',
      supabase: client,
    })
    const rows = calls.rpc[0].args.p_rows
    expect(rows[0]).toMatchObject({ finish: 'foil', language: 'ja', card_condition: 'near_mint', is_maybeboard: false })
    expect(rows[1]).toMatchObject({ is_proxy: true, card_condition: null })
    expect(rows[2]).toMatchObject({ is_maybeboard: true, card_id: null, finish: 'foil' })
    expect(rows[2]).not.toHaveProperty('language')
    expect(rows[2]).not.toHaveProperty('card_condition')
  })

  it('generic basics create no copies and ignore edits', async () => {
    const { client, calls } = fakeClient(printings)
    const island = { ...solCard([{}, {}]), cardName: 'Island', rowKey: 'isl|text' }
    await importManaBoxDeck({
      deck: deckOf([island]) as never,
      name: 'D',
      defaults: DEFAULTS,
      copyEdits: { 'isl|text': { 0: { finish: 'foil' } } },
      userId: 'user-a',
      supabase: client,
    })
    const rows = calls.rpc[0].args.p_rows
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.card_id === null && r.is_maybeboard === true && r.finish === null)).toBe(true)
  })

  it('creates the deck with insert (never upsert) and retries with a new id when the id is taken', async () => {
    const { client, calls } = fakeClient(printings, 2)
    const result = await importManaBoxDeck({
      deck: deckOf([solCard([{}])]) as never,
      name: 'D',
      defaults: DEFAULTS,
      userId: 'user-a',
      supabase: client,
    })
    const decks = calls.decksInserted.filter((c) => c.table === 'decks')
    expect(decks).toHaveLength(3)
    expect(calls.upserts).not.toContain('decks')
    expect(result.deckId).toBe(decks[2].id)
    expect(calls.rpc[0].args).toMatchObject({ p_deck_id: decks[2].id })
  })

  it('stops with an error, writing no cards, when every id attempt is taken', async () => {
    const { client, calls } = fakeClient(printings, 99)
    await expect(
      importManaBoxDeck({ deck: deckOf([solCard([{}])]) as never, name: 'D', defaults: DEFAULTS, userId: 'u', supabase: client })
    ).rejects.toThrow(/free deck id/)
    expect(calls.rpc).toHaveLength(0)
  })

  it('rejects an owner foil Scryfall does not list, writing nothing', async () => {
    const { client, calls } = fakeClient([{ ...printings[0], finishes: ['nonfoil'] }])
    await expect(
      importManaBoxDeck({
        deck: deckOf([solCard([{}])]) as never,
        name: 'D',
        defaults: DEFAULTS,
        copyEdits: { 'sol|text': { 0: { finish: 'foil' } } },
        userId: 'user-a',
        supabase: client,
      })
    ).rejects.toBeInstanceOf(ImportValidationError)
    expect(calls.rpc).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
  })

  it('rejects when copies do not match quantity or the pair is unknown, writing nothing', async () => {
    const { client, calls } = fakeClient(printings)
    const bad = { ...solCard([{}, {}]), quantity: 3 }
    await expect(
      importManaBoxDeck({ deck: deckOf([bad]) as never, name: 'D', defaults: DEFAULTS, userId: 'u', supabase: client })
    ).rejects.toBeInstanceOf(ImportValidationError)
    const wrongPair = { ...solCard([{}]), oracleId: 'someone-else' }
    await expect(
      importManaBoxDeck({ deck: deckOf([wrongPair]) as never, name: 'D', defaults: DEFAULTS, userId: 'u', supabase: client })
    ).rejects.toBeInstanceOf(ImportValidationError)
    expect(calls.rpc).toHaveLength(0)
    expect(calls.upserts).toHaveLength(0)
  })
})
