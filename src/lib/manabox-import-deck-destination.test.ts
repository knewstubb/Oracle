import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/import-destination', async (orig) => ({
  ...(await orig<typeof import('@/lib/import-destination')>()),
  // The deck switch is still off in the app; this test pretends the deck was found and the switch is on.
  resolveImportDestination: async () => ({ kind: 'deck', id: 7, name: 'Korvold' }),
}))

import { executeManaBoxCollectionImport } from '@/lib/manabox-collection-import'
import type { ManaBoxCardFacts, ManaBoxResolver } from '@/lib/manabox-import'

const DEFAULTS = { finish: 'nonfoil', condition: 'near_mint', language: 'en' } as const

const facts = (id: string, name: string): ManaBoxCardFacts => ({
  oracleId: `o-${id}`, scryfallId: id, cardName: name, setCode: 'c21', layout: 'normal', typeLine: 'Artifact', availableFinishes: ['nonfoil', 'foil'],
})
const resolver: ManaBoxResolver = {
  async resolveByScryfallId(id) {
    return { sol: facts('sol', 'Sol Ring'), bolt: facts('bolt', 'Lightning Bolt') }[id.trim()] ?? null
  },
  async resolveBySetCollector() { return null },
}

const CSV = [
  'Name,Set code,Collector number,Foil,Quantity,Scryfall ID,Condition,Language',
  'Sol Ring,c21,263,normal,2,sol,near_mint,en',
  'Lightning Bolt,c21,1,normal,1,bolt,near_mint,en',
].join('\n')

type Result = { data?: unknown; error: unknown }

/** Table reads end in .maybeSingle(), .single() or are awaited directly; all answer from `tables`. */
function fakeClient(opts: { rpcAnswer?: unknown; rpcError?: { message: string } }) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const tables: Record<string, unknown> = {
    decks: { id: 7, name: 'Korvold', user_id: 'me', format: 'commander', commander_name: null },
    deck_cards: [{ copy_id: 1, is_generic: false, generic_sleeved: false, categories: null, card_name: 'Sol Ring', quantity: 1 }],
    ref_cards: [{ name: 'Lightning Bolt', color_identity: 'R', commander_legal: true }],
    ref_printings: [{ name: 'Lightning Bolt', oracle_id: 'o-bolt' }],
  }
  const chain = (table: string): unknown => {
    const rows = tables[table]
    const list = Array.isArray(rows) ? rows : rows ? [rows] : []
    const result: Result = { data: list, error: null }
    const c: Record<string, unknown> = {
      select: () => c, eq: () => c, in: () => c, ilike: () => c, limit: () => c, order: () => c,
      maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
      upsert: (r: Array<{ oracle_id: string }>) => ({
        select: async () => ({ data: r.map((x, i) => ({ id: i + 1, oracle_id: x.oracle_id })), error: null }),
      }),
      then: (resolve: (v: Result) => void) => resolve(result),
    }
    return c
  }
  const client = {
    from: (table: string) => chain(table),
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if (opts.rpcError) return { data: null, error: opts.rpcError }
      return { data: opts.rpcAnswer, error: null }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, rpcCalls }
}

const run = (client: ReturnType<typeof fakeClient>['client']) =>
  executeManaBoxCollectionImport({
    csvContent: CSV, fileName: 'x.csv', userId: 'me', defaults: DEFAULTS as never, resolver, supabase: client,
    destination: { kind: 'deck', deckId: 7 },
  })

describe('collection import into a deck', () => {
  it('sends every copy in one call and reports where each went, warning about an off-colour card', async () => {
    const { client, rpcCalls } = fakeClient({
      rpcAnswer: {
        success: true, deck_id: 7, inserted_ids: [1, 2, 3],
        outcomes: [
          { index: 0, copy_id: 1, kind: 'filled', reason: null },
          { index: 1, copy_id: 2, kind: 'unsorted', reason: 'already_filled' },
          { index: 2, copy_id: 3, kind: 'added', reason: null },
        ],
        counts: { filled: 1, added: 1, unsorted: 1, proxies_placed: 0 },
      },
    })
    const summary = await run(client)
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('insert_user_copies_to_deck')
    expect(rpcCalls[0].args).toMatchObject({ p_user_id: 'me', p_deck_id: 7, p_max_copies: 1 })
    expect((rpcCalls[0].args.p_rows as unknown[]).length).toBe(3)
    expect(summary.inserted).toBe(3)
    const p = summary.placement!
    expect(p.filledSlots! + p.addedAsNew! + p.sentToUnsorted!).toBe(3)
    expect(p.details).toEqual([{ cardName: 'Sol Ring', outcome: 'unsorted', reason: 'duplicate' }])
    expect(p.unsortedCopyIds).toEqual([2])
    // Deck colours are unknown in this fake (no commander), so the check says so rather than "no warnings".
    expect(p.warnings?.checksUnavailable).toBe(true)
  })

  it('a refusal from the database adds nothing and says the deck is gone', async () => {
    const { client } = fakeClient({ rpcError: { message: 'deck_not_found' } })
    await expect(run(client)).rejects.toMatchObject({ status: 404, message: expect.stringMatching(/no longer exists/) })
  })

  it('an answer whose counts do not add up fails the import instead of hiding cards', async () => {
    const { client } = fakeClient({
      rpcAnswer: { success: true, outcomes: [], counts: { filled: 0, added: 0, unsorted: 0, proxies_placed: 0 } },
    })
    await expect(run(client)).rejects.toThrow(/do not add up|unexpected/)
  })
})
