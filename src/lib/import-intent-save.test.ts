/**
 * Intent save path (S4-S8) against a FAKE database. Nothing here touches a real database, and the
 * import_deck_with_intent function (draft M2) is not applied: these tests only check what the app SENDS to it
 * and how it reads the answer. The SQL itself is untested until the Architect has reviewed it and a test
 * database exists.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { importManaBoxDeck, type ManaBoxDeckCard } from '@/lib/manabox-deck-import'
import { NeedsChoiceError, validateIntentEdits } from '@/lib/import-intent-save'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import type { ImportIntent, IntentCopyEdits, OwnershipResponse } from '../../docs/oracle/contracts/import-intent.types'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

const DEFAULTS: ImportDefaults = { finish: 'nonfoil', condition: 'near_mint', language: 'en' }

function card(name: string, qty: number, printing = `${name}-p1`, i = 1): ManaBoxDeckCard {
  return {
    cardName: name,
    scryfallId: printing,
    oracleId: `oracle-${name}`,
    setCode: 'tst',
    collectorNumber: '1',
    quantity: qty,
    typeLine: 'Artifact',
    isCommander: false,
    isProxy: false,
    manaCost: null,
    colorIdentity: [],
    sourceCategories: [],
    rowKey: `${printing}|nonfoil`,
    copies: Array.from({ length: qty }, (_, k) => ({ index: k, sourceLine: i, file: {}, owner: {} })),
    printingGiven: true,
    sourceIndex: i,
  }
}

function deckOf(cards: ManaBoxDeckCard[]): NormalizedDeck {
  return {
    name: 'Test deck',
    platform: 'manabox',
    platformDeckId: '',
    sourceUrl: '',
    commander: null,
    cards,
    cardCount: cards.reduce((n, c) => n + c.quantity, 0),
    colourIdentity: '',
  } as unknown as NormalizedDeck
}

interface Fake {
  client: never
  rpcCalls: Array<{ name: string; rows: Array<Record<string, unknown>> }>
  deleted: Array<Record<string, unknown>>
}

function fake(opts: { rpcAnswer?: unknown; rpcError?: { code?: string; message: string }; printings: string[] }): Fake {
  const rpcCalls: Fake['rpcCalls'] = []
  const deleted: Fake['deleted'] = []
  const client = {
    from(table: string) {
      return {
        async insert() {
          return { error: null }
        },
        upsert(rows: unknown) {
          const list = (Array.isArray(rows) ? rows : [rows]) as Array<Record<string, unknown>>
          return { select: async () => ({ data: list.map((r, i) => ({ id: i + 1, oracle_id: r.oracle_id })), error: null }) }
        },
        select() {
          return {
            in: async () => ({
              data: opts.printings.map((p) => ({
                scryfall_id: p,
                oracle_id: `oracle-${p.replace(/-p\d+$/, '')}`,
                type_line: 'Artifact',
                finishes: ['nonfoil', 'foil'],
              })),
              error: null,
            }),
          }
        },
        delete() {
          const rec: Record<string, unknown> = { table }
          const chain = {
            eq(col: string, val: unknown) {
              rec[col] = val
              deleted.push({ ...rec })
              return chain
            },
            then(resolve: (v: unknown) => void) {
              resolve({ error: null })
            },
          }
          return chain
        },
      }
    },
    async rpc(name: string, args: { p_rows: Array<Record<string, unknown>> }) {
      rpcCalls.push({ name, rows: args.p_rows })
      if (opts.rpcError) return { data: null, error: opts.rpcError }
      return { data: opts.rpcAnswer ?? { success: true, inserted_count: args.p_rows.length, needs_a_look: [] }, error: null }
    },
  }
  return { client: client as never, rpcCalls, deleted }
}

const noFacts = async (): Promise<OwnershipResponse> => ({ rows: [] })

async function run(
  intent: ImportIntent,
  cards: ManaBoxDeckCard[],
  f: Fake,
  extra: { edits?: IntentCopyEdits; facts?: OwnershipResponse | (() => Promise<OwnershipResponse>) } = {}
) {
  return importManaBoxDeck({
    deck: deckOf(cards),
    name: 'Test deck',
    defaults: DEFAULTS,
    copyEdits: extra.edits,
    userId: 'user-a',
    supabase: f.client,
    intent,
    loadOwnership: typeof extra.facts === 'function' ? extra.facts : async () => (extra.facts as OwnershipResponse | undefined) ?? { rows: [] },
  })
}

const free = (n: number, printingId = 'Sol Ring-p1') => ({
  printingId,
  setCode: 'tst',
  collectorNumber: '1',
  finish: 'nonfoil' as const,
  isProxy: false,
  count: n,
})

describe('intent save: what is sent to import_deck_with_intent', () => {
  it('purchased: every copy is added and sleeved', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    const r = await run('purchased', [card('Sol Ring', 2)], f)
    expect(f.rpcCalls).toHaveLength(1)
    expect(f.rpcCalls[0].name).toBe('import_deck_with_intent')
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['add_sleeved', 'add_sleeved'])
    expect(r.intentSummary?.added).toBe(2)
  })

  it('built: an owned free copy is sleeved (descriptor, no copy id), a card not owned is Unowned', async () => {
    const f = fake({ printings: ['Sol Ring-p1', 'Arcane Signet-p1'] })
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [free(1)], held: [] }],
    }
    const r = await run('built', [card('Sol Ring', 1), card('Arcane Signet', 1, 'Arcane Signet-p1', 2)], f, { facts })
    const rows = f.rpcCalls[0].rows
    expect(rows.map((x) => x.action)).toEqual(['sleeve_owned', 'planned'])
    expect(rows[0]).toMatchObject({ link_printing_id: 'Sol Ring-p1', link_is_proxy: false })
    expect(rows[0]).not.toHaveProperty('link_copy_id')
    expect(r.intentSummary).toMatchObject({ sleevedFromCollection: 1, unowned: 1 })
  })

  it('planned: nothing is sleeved or added', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    await run('planned', [card('Sol Ring', 2)], f)
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned', 'planned'])
  })

  it('a ticked Add on a built deck adds a new copy', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    const edits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { add: true } } }
    await run('built', [card('Sol Ring', 1)], f, { edits })
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['add_sleeved'])
  })

  it('move: sends the donor deck; skip sends the alert decks (all holder decks)', async () => {
    const held = (deckId: number) => ({ ...free(1), deckId, deckName: `Deck ${deckId}` })
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [], held: [held(7), held(8)] }],
    }
    const moveEdits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { move: { kind: 'move', fromDeckId: 8 } } } }
    const f1 = fake({ printings: ['Sol Ring-p1'] })
    await run('built', [card('Sol Ring', 1)], f1, { facts, edits: moveEdits })
    expect(f1.rpcCalls[0].rows[0]).toMatchObject({ action: 'move', from_deck_id: 8 })

    const skipEdits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { move: { kind: 'skip' } } } }
    const f2 = fake({ printings: ['Sol Ring-p1'] })
    const r = await run('built', [card('Sol Ring', 1)], f2, { facts, edits: skipEdits })
    expect(f2.rpcCalls[0].rows[0]).toMatchObject({ action: 'move_skipped', alert_deck_ids: [7, 8] })
    expect(r.intentSummary?.alertsOnOtherDecks).toBe(2)
  })

  it('a choice still open is refused before anything is written', async () => {
    const held = (deckId: number) => ({ ...free(1), deckId, deckName: `Deck ${deckId}` })
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [], held: [held(7), held(8)] }],
    }
    const f = fake({ printings: ['Sol Ring-p1'] })
    await expect(run('built', [card('Sol Ring', 1)], f, { facts })).rejects.toBeInstanceOf(NeedsChoiceError)
    expect(f.rpcCalls).toHaveLength(0)
  })

  it('ownership unavailable: saved planned and listed, not an error', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    const r = await run('built', [card('Sol Ring', 1)], f, {
      facts: async () => {
        throw new Error('db down')
      },
    })
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned'])
    expect(r.intentSummary?.needsALook).toEqual([
      { rowKey: 'Sol Ring-p1|nonfoil', copyIndex: 0, cardName: 'Sol Ring', reason: 'ownership_unavailable' },
    ])
  })

  it('maps a needs_a_look answer from the function back to the card', async () => {
    const f = fake({
      printings: ['Sol Ring-p1'],
      rpcAnswer: { success: true, inserted_count: 1, alerts_created: 0, needs_a_look: [{ row_index: 0, reason: 'copy_no_longer_free' }] },
    })
    const facts: OwnershipResponse = { rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [free(1)], held: [] }] }
    const r = await run('built', [card('Sol Ring', 1)], f, { facts })
    expect(r.intentSummary?.needsALook).toEqual([
      { rowKey: 'Sol Ring-p1|nonfoil', copyIndex: 0, cardName: 'Sol Ring', reason: 'copy_no_longer_free' },
    ])
  })

  it('function not installed yet: fails clearly and removes the empty deck it just made', async () => {
    const f = fake({ printings: ['Sol Ring-p1'], rpcError: { code: 'PGRST202', message: 'Could not find the function public.import_deck_with_intent' } })
    await expect(run('purchased', [card('Sol Ring', 1)], f)).rejects.toThrow(/awaiting review/)
    expect(f.deleted).toHaveLength(2) // id, then user_id (both must match)
    expect(f.deleted[1]).toMatchObject({ table: 'decks', user_id: 'user-a' })
  })
})

describe('validateIntentEdits', () => {
  const rows = [{ rowKey: 'a', qty: 2 }]
  it('accepts good input', () => {
    expect(validateIntentEdits('built', { a: { 1: { add: true, move: { kind: 'skip' }, printing: 'use_mine' } } }, rows)).toEqual([])
  })
  it('rejects a bad intent, index, add, move and printing', () => {
    expect(validateIntentEdits('nope', {}, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 5: {} } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { add: 'yes' as unknown as boolean } } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { move: { kind: 'move' } as never } } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { printing: 'x' as never } } }, rows)).not.toEqual([])
  })
})
