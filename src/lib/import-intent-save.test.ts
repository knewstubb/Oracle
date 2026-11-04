/**
 * Intent save path (S4-S8) against a FAKE database. Nothing here touches a real database, and the
 * import_deck_with_intent function (draft M2) is not applied: these tests only check what the app SENDS to it
 * and how it reads the answer. The SQL itself is untested until the Architect has reviewed it and a test
 * database exists.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/deck-versions', () => ({ createVersionSnapshot: vi.fn(async () => undefined) }))

import { importManaBoxDeck, type ManaBoxDeckCard } from '@/lib/manabox-deck-import'
import {
  NeedsChoiceError,
  buildIntentSummary,
  needsChoiceRowKeys,
  planToIntentRpcRow,
  unconfirmedMoveRowKeys,
  validateIntentEdits,
} from '@/lib/import-intent-save'
import type { ImportDefaults } from '../../docs/oracle/contracts/import-row-editing.types'
import type { CopyPlan, ImportIntent, IntentCopyEdits, OwnershipResponse } from '../../docs/oracle/contracts/import-intent.types'
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

function fake(opts: {
  rpcAnswer?: unknown
  rpcError?: { code?: string; message: string }
  printings: string[]
  slotsInDeck?: boolean
}): Fake {
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
          const slotChain: Record<string, unknown> = {
            eq: () => slotChain,
            limit: async () => ({ data: opts.slotsInDeck ? [{ id: 1 }] : [], error: null }),
          }
          return {
            ...slotChain,
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

  it('purchased: a copy the file marks Proxy is saved as a proxy; the owner can override', async () => {
    const proxyCard = (name: string, i: number) => {
      const c = card(name, 1, `${name}-p1`, i)
      c.copies = [{ index: 0, sourceLine: i, file: { proxy: true }, owner: {} }]
      return c
    }
    const f = fake({ printings: ['Sol Ring-p1', 'Arcane Signet-p1'] })
    const r = await run('purchased', [proxyCard('Sol Ring', 1), card('Arcane Signet', 1, 'Arcane Signet-p1', 2)], f)
    expect(f.rpcCalls[0].rows.map((x) => x.is_proxy)).toEqual([true, false])
    expect(r.intentSummary?.addedProxies).toBe(1)

    const f2 = fake({ printings: ['Sol Ring-p1'] })
    const edits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { type: 'original' } } }
    await run('purchased', [proxyCard('Sol Ring', 1)], f2, { edits })
    expect(f2.rpcCalls[0].rows[0].is_proxy).toBe(false)
  })

  it('planned: nothing is sleeved or added', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    await run('planned', [card('Sol Ring', 2)], f)
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned', 'planned'])
  })

  it('Card source New on a built deck adds a new copy (the legacy add:true means the same)', async () => {
    for (const edit of [{ source: 'new' as const }, { add: true }]) {
      const f = fake({ printings: ['Sol Ring-p1'] })
      await run('built', [card('Sol Ring', 1)], f, { edits: { 'Sol Ring-p1|nonfoil': { 0: edit } } })
      expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['add_sleeved'])
    }
  })

  it('Card source None on a purchased deck is a planned slot; Collection sleeves the owned copy', async () => {
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [free(1)], held: [] }],
    }
    const f = fake({ printings: ['Sol Ring-p1'] })
    const edits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { source: 'none' }, 1: { source: 'collection' } } }
    await run('purchased', [card('Sol Ring', 2)], f, { facts, edits })
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned', 'sleeve_owned'])
  })

  it('a copy held by one other deck moves, but only when the owner picked that deck', async () => {
    const held = (deckId: number) => ({ ...free(1), deckId, deckName: `Deck ${deckId}` })
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [], held: [held(7)] }],
    }
    const f = fake({ printings: ['Sol Ring-p1'] })
    const err = await run('built', [card('Sol Ring', 1)], f, { facts }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NeedsChoiceError)
    expect(f.rpcCalls).toHaveLength(0)
    const edits: IntentCopyEdits = { 'Sol Ring-p1|nonfoil': { 0: { source: 'collection', pick: { kind: 'deck', deckId: 7 } } } }
    const g = fake({ printings: ['Sol Ring-p1'] })
    await run('built', [card('Sol Ring', 1)], g, { facts, edits })
    expect(g.rpcCalls[0].rows[0]).toMatchObject({ action: 'move', from_deck_id: 7 })
  })

  it('a short copy (Collection with nothing left) is refused as needing a choice', async () => {
    const facts: OwnershipResponse = {
      rows: [{ rowKey: 'Sol Ring-p1|nonfoil', oracleId: 'oracle-Sol Ring', free: [free(1)], held: [] }],
    }
    const f = fake({ printings: ['Sol Ring-p1'] })
    const err = await run('built', [card('Sol Ring', 2)], f, { facts }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(NeedsChoiceError)
    expect(f.rpcCalls).toHaveLength(0)
    // Picking None for the short copy lets it save.
    const f2 = fake({ printings: ['Sol Ring-p1'] })
    await run('built', [card('Sol Ring', 2)], f2, { facts, edits: { 'Sol Ring-p1|nonfoil': { 1: { source: 'none' } } } })
    expect(f2.rpcCalls[0].rows.map((x) => x.action)).toEqual(['sleeve_owned', 'planned'])
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

  it('ownership unavailable with an explicit Collection pick on a purchased deck: listed, not blocked', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    const r = await run('purchased', [card('Sol Ring', 2)], f, {
      edits: { 'Sol Ring-p1|nonfoil': { 0: { source: 'collection' } } },
      facts: async () => {
        throw new Error('db down')
      },
    })
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned', 'add_sleeved'])
    expect(r.intentSummary?.needsALook?.map((n) => [n.copyIndex, n.reason])).toEqual([[0, 'ownership_unavailable']])
  })

  it('ownership unavailable on a planned deck: nothing is listed', async () => {
    const f = fake({ printings: ['Sol Ring-p1'] })
    const r = await run('planned', [card('Sol Ring', 1)], f, {
      facts: async () => {
        throw new Error('db down')
      },
    })
    expect(f.rpcCalls[0].rows.map((x) => x.action)).toEqual(['planned'])
    expect(r.intentSummary?.needsALook ?? []).toEqual([])
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

  it('a clear rejection by the function removes the still-empty deck it just made', async () => {
    const f = fake({ printings: ['Sol Ring-p1'], rpcError: { code: 'P0001', message: 'card_not_found' } })
    await expect(run('purchased', [card('Sol Ring', 1)], f)).rejects.toThrow(/card_not_found/)
    expect(f.deleted).toHaveLength(2) // id, then user_id (both must match)
    expect(f.deleted[1]).toMatchObject({ table: 'decks', user_id: 'user-a' })
  })

  it('an ambiguous error (timeout / dropped connection) never deletes anything', async () => {
    for (const rpcError of [{ message: 'fetch failed' }, { code: '57014', message: 'statement timeout' }, { code: '08006', message: 'connection failure' }]) {
      const f = fake({ printings: ['Sol Ring-p1'], rpcError })
      await expect(run('purchased', [card('Sol Ring', 1)], f)).rejects.toThrow()
      expect(f.deleted).toHaveLength(0)
    }
  })

  it('a deck that already has slots is never deleted, even after a clear rejection', async () => {
    const f = fake({ printings: ['Sol Ring-p1'], rpcError: { code: 'P0001', message: 'deck_not_empty' }, slotsInDeck: true })
    await expect(run('purchased', [card('Sol Ring', 1)], f)).rejects.toThrow()
    expect(f.deleted).toHaveLength(0)
  })

  it('function missing: clear message and the empty deck is removed', async () => {
    const f = fake({ printings: ['Sol Ring-p1'], rpcError: { code: 'PGRST202', message: 'Could not find the function public.import_deck_with_intent' } })
    await expect(run('purchased', [card('Sol Ring', 1)], f)).rejects.toThrow(/not installed/)
    expect(f.deleted).toHaveLength(2)
  })
})

function plan(over: Partial<CopyPlan>): CopyPlan {
  return { rowKey: 'a', copyIndex: 0, kind: 'add_sleeved', type: 'original', slotPrintingId: 'p', canOriginal: true, canProxy: true, ...over }
}

describe('plan helpers', () => {
  it('needsChoiceRowKeys includes short copies and unset sources', () => {
    const plans = [plan({ rowKey: 'a' }), plan({ rowKey: 'b', kind: 'unowned', short: true }), plan({ rowKey: 'c', kind: 'needs_choice_move' })]
    expect(needsChoiceRowKeys(plans)).toEqual(['b', 'c'])
  })
  it('a move is only confirmed when the owner picked that deck', () => {
    const plans = [plan({ rowKey: 'a', kind: 'move', fromDeckId: 7 }), plan({ rowKey: 'b', kind: 'move', fromDeckId: 7 })]
    const edits = { a: { 0: { pick: { kind: 'deck', deckId: 7 } } }, b: { 0: { pick: { kind: 'deck', deckId: 8 } } } } as never
    expect(unconfirmedMoveRowKeys(plans, edits)).toEqual(['b'])
    expect(unconfirmedMoveRowKeys(plans, {})).toEqual(['a', 'b'])
  })
  it('planToIntentRpcRow sends the exact finish for a spare or moved copy, and the donor deck', () => {
    const copy = { finish: 'nonfoil', condition: 'near_mint', language: 'en', type: 'original' } as never
    const ctx = { cardId: 1, cardName: 'Sol Ring', scryfallId: 'p', setCode: 'tst', categories: [] } as never
    const row = planToIntentRpcRow(plan({ kind: 'move', fromDeckId: 7, finish: 'foil', slotPrintingId: 'p' }), copy, ctx, 0)
    expect(row).toMatchObject({ action: 'move', finish: 'foil', from_deck_id: 7 })
    expect(planToIntentRpcRow(plan({ kind: 'sleeve_owned', finish: 'etched', slotPrintingId: 'p' }), copy, ctx, 0)).toMatchObject({ finish: 'etched' })
  })
})

describe('validateIntentEdits', () => {
  const rows = [{ rowKey: 'a', qty: 2 }]
  it('accepts good input', () => {
    expect(validateIntentEdits('built', { a: { 0: { source: 'collection', type: 'proxy' }, 1: { source: 'none' } } }, rows)).toEqual([])
    expect(validateIntentEdits('built', { a: { 1: { add: true, move: { kind: 'skip' }, printing: 'use_mine' } } }, rows)).toEqual([])
  })
  it('rejects a bad source', () => {
    expect(validateIntentEdits('built', { a: { 0: { source: 'mine' as never } } }, rows)).toEqual([
      'a: source must be none, collection or new',
    ])
  })
  it('rejects a bad intent, index, add, move and printing', () => {
    expect(validateIntentEdits('nope', {}, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 5: {} } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { add: 'yes' as unknown as boolean } } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { move: { kind: 'move' } as never } } }, rows)).not.toEqual([])
    expect(validateIntentEdits('built', { a: { 0: { printing: 'x' as never } } }, rows)).not.toEqual([])
  })
})

describe('buildIntentSummary: result lists', () => {
  it('lists spare, taken (with the donor deck) and new copies, leaving out copies that could not be honoured', () => {
    const plans = [
      plan({ rowKey: 'a', kind: 'sleeve_owned' }),
      plan({ rowKey: 'b', kind: 'move', fromDeckId: 7, fromDeckName: 'Elves' }),
      plan({ rowKey: 'c', kind: 'move', fromDeckId: 7, fromDeckName: 'Elves' }),
      plan({ rowKey: 'd', kind: 'add_sleeved' }),
    ]
    const origins = ['a', 'b', 'c', 'd'].map((k) => ({ rowKey: k, copyIndex: 0, cardName: `Card ${k}` }))
    const out = buildIntentSummary(1, {} as never, { needs_a_look: [{ row_index: 2, reason: 'copy_no_longer_in_deck' }] }, origins, plans)
    expect(out.usedSpare).toEqual(['Card a'])
    expect(out.taken).toEqual([{ cardName: 'Card b', fromDeckId: 7, fromDeckName: 'Elves' }])
    expect(out.newCopies).toEqual(['Card d'])
  })
})
