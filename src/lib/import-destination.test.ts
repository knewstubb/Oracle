import { describe, it, expect } from 'vitest'
import {
  ImportDestinationError,
  applyStorageDestination,
  destinationErrorFromDatabase,
  parseImportDestination,
  parseImportDestinationField,
  resolveImportDestination,
} from '@/lib/import-destination'
import { executeManaBoxCollectionImport } from '@/lib/manabox-collection-import'
import type { ManaBoxCardFacts, ManaBoxResolver } from '@/lib/manabox-import'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'

const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

describe('parseImportDestination', () => {
  it('absent or null is Unsorted', () => {
    expect(parseImportDestination(undefined)).toEqual({ kind: 'unsorted' })
    expect(parseImportDestination(null)).toEqual({ kind: 'unsorted' })
    expect(parseImportDestination({ kind: 'unsorted' })).toEqual({ kind: 'unsorted' })
  })

  it('accepts a storage location and a deck', () => {
    expect(parseImportDestination({ kind: 'storage', locationId: 7 })).toEqual({ kind: 'storage', locationId: 7 })
    expect(parseImportDestination({ kind: 'deck', deckId: 3 })).toEqual({ kind: 'deck', deckId: 3 })
  })

  it.each([
    ['unknown kind', { kind: 'missing' }],
    ['In your hand is not a place', { kind: 'in_hand' }],
    ['both a location and a deck', { kind: 'storage', locationId: 1, deckId: 2 }],
    ['storage without an id', { kind: 'storage' }],
    ['storage with a fractional id', { kind: 'storage', locationId: 1.5 }],
    ['storage with a text id', { kind: 'storage', locationId: '5' }],
    ['deck with a location id', { kind: 'deck', locationId: 4 }],
    ['unsorted carrying an id', { kind: 'unsorted', locationId: 4 }],
    ['not an object', 'unsorted'],
    ['an array', []],
  ])('refuses %s', (_label, raw) => {
    expect(() => parseImportDestination(raw)).toThrow(ImportDestinationError)
  })

  it('reads the multipart field as JSON and refuses bad JSON', () => {
    expect(parseImportDestinationField(null)).toEqual({ kind: 'unsorted' })
    expect(parseImportDestinationField(JSON.stringify({ kind: 'storage', locationId: 2 }))).toEqual({
      kind: 'storage',
      locationId: 2,
    })
    expect(() => parseImportDestinationField('{nope')).toThrow(ImportDestinationError)
    expect(() => parseImportDestinationField(new File(['x'], 'x'))).toThrow(ImportDestinationError)
  })
})

/** user_locations lookup: .select().eq('id').eq('user_id').maybeSingle() */
function locationClient(rows: Array<{ id: number; name: string; type: string; user_id: string }>) {
  return {
    from() {
      const filters: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val
          return chain
        },
        maybeSingle: async () => ({
          data: rows.find((r) => Object.entries(filters).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) ?? null,
          error: null,
        }),
      }
      return chain
    },
  }
}

describe('resolveImportDestination', () => {
  const client = locationClient([
    { id: 5, name: 'Valuable binder', type: 'storage', user_id: 'me' },
    { id: 6, name: 'Korvold (deck row)', type: 'deck', user_id: 'me' },
    { id: 9, name: 'Their box', type: 'storage', user_id: 'someone-else' },
  ])

  it('Unsorted needs no lookup', async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'unsorted' })).resolves.toEqual({
      kind: 'unsorted',
      id: null,
      name: 'Unsorted',
    })
  })

  it("resolves the user's own box", async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'storage', locationId: 5 })).resolves.toEqual({
      kind: 'storage',
      id: 5,
      name: 'Valuable binder',
    })
  })

  it("another user's box is refused as not found", async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'storage', locationId: 9 })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('a deck-type location row is refused with 400', async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'storage', locationId: 6 })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('a deleted box is not found', async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'storage', locationId: 99 })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('a deck destination is refused while deck import is switched off', async () => {
    await expect(resolveImportDestination(client, 'me', { kind: 'deck', deckId: 1 })).rejects.toMatchObject({ status: 503 })
  })
})

describe('applyStorageDestination / database refusals', () => {
  it('sets the location on every row for a box and leaves Unsorted rows alone', () => {
    const rows = [{ card_id: 1, location_id: null }, { card_id: 2, location_id: null }]
    expect(applyStorageDestination(rows, { kind: 'storage', id: 5, name: 'B' }).map((r) => r.location_id)).toEqual([5, 5])
    expect(applyStorageDestination(rows, { kind: 'unsorted', id: null, name: 'Unsorted' })).toBe(rows)
  })

  it('maps a box deleted mid-import to the plain message', () => {
    expect(destinationErrorFromDatabase('storage_location_not_found')?.message).toMatch(/no longer exists/)
    expect(destinationErrorFromDatabase('something else')).toBeNull()
  })
})

// ---- the import itself ----

function facts(id: string, name: string): ManaBoxCardFacts {
  return {
    oracleId: `oracle-${id}`,
    scryfallId: id,
    cardName: name,
    setCode: 'c21',
    layout: 'normal',
    typeLine: 'Artifact',
    availableFinishes: ['nonfoil', 'foil'],
  }
}

const resolver: ManaBoxResolver = {
  async resolveByScryfallId(id) {
    return id.trim() === 'sol' ? facts('sol', 'Sol Ring') : null
  },
  async resolveBySetCollector() {
    return null
  },
}

const CSV = [
  'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language,Purchase price',
  'Sol Ring,c21,263,normal,3,sol,near_mint,en,1.50',
].join('\n')

function importClient(opts: { rpcError?: string } = {}) {
  const writes = { upserts: 0, rpcs: [] as Array<{ p_rows: Array<Record<string, unknown>> }> }
  const loc = locationClient([
    { id: 5, name: 'Valuable binder', type: 'storage', user_id: 'me' },
    { id: 6, name: 'deck row', type: 'deck', user_id: 'me' },
    { id: 9, name: 'Their box', type: 'storage', user_id: 'other' },
  ])
  const client = {
    from(table: string) {
      if (table === 'user_locations') return loc.from()
      return {
        upsert(rows: Array<Record<string, unknown>>) {
          writes.upserts++
          return { select: async () => ({ data: rows.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })), error: null }) }
        },
      }
    },
    async rpc(_name: string, args: { p_rows: Array<Record<string, unknown>> }) {
      writes.rpcs.push(args)
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } }
      return { data: { success: true, inserted_count: args.p_rows.length }, error: null }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, writes }
}

describe('collection import with a destination', () => {
  const base = { csvContent: CSV, fileName: 'x.csv', userId: 'me', defaults: DEFAULTS, resolver }

  it('no destination builds the same rows as today (location_id null) and reports Unsorted', async () => {
    const { client, writes } = importClient()
    const summary = await executeManaBoxCollectionImport({ ...base, supabase: client })
    expect(writes.rpcs[0].p_rows.map((r) => r.location_id)).toEqual([null, null, null])
    expect(summary.placement).toEqual({
      destination: { kind: 'unsorted', id: null, name: 'Unsorted' },
      total: 3,
      placedInStorage: 3,
    })
  })

  it('a box destination sets the chosen location on every copy and reports it', async () => {
    const { client, writes } = importClient()
    const summary = await executeManaBoxCollectionImport({
      ...base,
      supabase: client,
      destination: { kind: 'storage', locationId: 5 },
    })
    expect(writes.rpcs).toHaveLength(1)
    expect(writes.rpcs[0].p_rows.map((r) => r.location_id)).toEqual([5, 5, 5])
    expect(summary.placement).toMatchObject({ destination: { kind: 'storage', id: 5, name: 'Valuable binder' }, placedInStorage: 3 })
  })

  it.each([
    ['another user box', { kind: 'storage', locationId: 9 }],
    ['a deck-type location row', { kind: 'storage', locationId: 6 }],
    ['a deleted box', { kind: 'storage', locationId: 404 }],
    ['a deck (off until approved)', { kind: 'deck', deckId: 1 }],
  ] as const)('refuses %s and writes nothing', async (_label, destination) => {
    const { client, writes } = importClient()
    await expect(
      executeManaBoxCollectionImport({ ...base, supabase: client, destination: { ...destination } })
    ).rejects.toBeInstanceOf(ImportDestinationError)
    expect(writes.upserts).toBe(0)
    expect(writes.rpcs).toHaveLength(0)
  })

  it('a box deleted between the check and the write refuses the whole import with the plain message', async () => {
    const { client } = importClient({ rpcError: 'storage_location_not_found' })
    await expect(
      executeManaBoxCollectionImport({ ...base, supabase: client, destination: { kind: 'storage', locationId: 5 } })
    ).rejects.toThrow(/no longer exists/)
  })
})
