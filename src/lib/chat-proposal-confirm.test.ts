import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fixtures only. Never the owner's live data.
// NOTE: the confirm/undo database functions are not applied yet (owner approval pending), so this fake
// database re-implements their rules in plain code. These tests prove the route logic around them; the SQL
// itself is checked when the owner applies the migration.
type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  commanders: { names: ['Korvold'], identity: 'BRG' as string | null },
  owned: new Map<string, string>(),
  rpcFails: false,
}))

vi.mock('./deck-colour-identity', () => ({ loadDeckCommanders: vi.fn(async () => state.commanders) }))
vi.mock('./card-data', () => ({ getOwnedPrintingsByNames: vi.fn(async () => state.owned) }))
vi.mock('./auth', () => ({ requireAuth: vi.fn() }))
vi.mock('./supabase', () => ({ createAdminClient: vi.fn() }))

import { confirmProposals, dismissProposals, parseProposalIds, undoProposals } from './chat-proposal-confirm'
import type { CheckClient } from './chat-proposal-check'

const U = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const FUTURE = new Date(Date.now() + 3600_000).toISOString()

function makeDb(tables: Record<string, Row[]>) {
  let nextId = 1000
  const rpcCalls: string[] = []
  const db = {
    tables,
    rpcCalls,
    from(table: string) {
      let data = [...(tables[table] ?? [])]
      let patch: Row | null = null
      const matches: Array<[string, unknown]> = []
      const apply = () => {
        if (patch) {
          for (const r of tables[table] ?? []) {
            if (matches.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v))) Object.assign(r, patch)
          }
        }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { data = data.filter((r) => r[c] === v); matches.push([c, v]); return q },
        in: (c: string, vs: unknown[]) => { data = data.filter((r) => vs.includes(r[c])); matches.push([c, vs]); return q },
        ilike: (c: string, p: string) => { const pre = p.replace('%', '').toLowerCase(); data = data.filter((r) => String(r[c]).toLowerCase().startsWith(pre)); return q },
        order: () => q,
        limit: () => q,
        update: (p: Row) => { patch = p; return q },
        then: (resolve: (v: unknown) => unknown) => { apply(); return resolve({ data, error: null }) },
      }
      return q
    },
    // Plain-code copy of the database functions' rules.
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push(name)
      if (state.rpcFails) return { data: null, error: { message: 'boom' } }
      const props = tables.chat_card_proposals
      const cards = tables.deck_cards
      if (name === 'confirm_chat_card_proposals') {
        const added: unknown[] = []
        const skipped: unknown[] = []
        for (const it of args.p_items as Array<{ proposal_id: string; card_name: string; scryfall_id: string | null; categories: string | null }>) {
          const p = props.find((x) => x.id === it.proposal_id && x.user_id === args.p_user_id && x.deck_id === args.p_deck_id)
          if (!p) { skipped.push({ proposal_id: it.proposal_id, reason: 'unknown' }); continue }
          if (p.status !== 'pending') { skipped.push({ proposal_id: it.proposal_id, reason: 'used' }); continue }
          if (cards.some((c) => c.deck_id === args.p_deck_id && String(c.card_name).toLowerCase() === it.card_name.toLowerCase())) {
            p.status = 'blocked'; skipped.push({ proposal_id: it.proposal_id, reason: 'in_deck' }); continue
          }
          const id = nextId++
          cards.push({ id, deck_id: args.p_deck_id, user_id: args.p_user_id, card_name: it.card_name, scryfall_id: it.scryfall_id, categories: it.categories, quantity: 1, copy_id: null, ownership_status: null })
          Object.assign(p, { status: 'added', created_deck_card_id: id, created_categories: it.categories })
          added.push({ proposal_id: it.proposal_id, deck_card_id: id })
        }
        return { data: { success: true, added, skipped }, error: null }
      }
      if (name === 'undo_chat_card_proposals') {
        const undone: string[] = []
        const refused: unknown[] = []
        for (const id of args.p_proposal_ids as string[]) {
          const p = props.find((x) => x.id === id && x.user_id === args.p_user_id && x.deck_id === args.p_deck_id)
          if (!p) { refused.push({ proposal_id: id, reason: 'unknown' }); continue }
          if (p.status !== 'added') { refused.push({ proposal_id: id, reason: 'not_added' }); continue }
          const slot = cards.find((c) => c.id === p.created_deck_card_id)
          if (slot && (slot.copy_id != null || slot.ownership_status != null || slot.categories !== p.created_categories)) {
            refused.push({ proposal_id: id, reason: 'changed' }); continue
          }
          if (slot) cards.splice(cards.indexOf(slot), 1)
          p.status = 'undone'; undone.push(id)
        }
        return { data: { success: true, undone, refused }, error: null }
      }
      return { data: null, error: { message: 'unknown rpc' } }
    },
  }
  return db
}

function tables(): Record<string, Row[]> {
  return {
    decks: [{ id: 7, name: 'Korvold', user_id: U }, { id: 8, name: 'Prosper', user_id: U }],
    deck_cards: [
      { id: 1, deck_id: 7, user_id: U, card_name: 'Sol Ring', categories: '["Ramp"]', quantity: 1, copy_id: null },
      { id: 2, deck_id: 8, user_id: U, card_name: 'Cultivate', categories: '["Ramp"]', quantity: 1, copy_id: 55, ownership_status: 'original' },
    ],
    ref_cards: [
      { name: 'Sol Ring', color_identity: '', commander_legal: true, default_category: { primary: 'Ramp' }, type_line: 'Artifact' },
      { name: 'Cultivate', color_identity: 'G', commander_legal: true, default_category: { primary: 'Ramp' }, type_line: 'Sorcery' },
      { name: 'Birds of Paradise', color_identity: 'G', commander_legal: true, default_category: null, type_line: 'Creature — Bird' },
      { name: 'Swords to Plowshares', color_identity: 'W', commander_legal: true, default_category: null, type_line: 'Instant' },
    ],
    ref_printings: [
      { name: 'Sol Ring', oracle_id: 'o1', scryfall_id: 'sf-sol' },
      { name: 'Cultivate', oracle_id: 'o2', scryfall_id: 'sf-cult' },
      { name: 'Birds of Paradise', oracle_id: 'o3', scryfall_id: 'sf-bop' },
      { name: 'Swords to Plowshares', oracle_id: 'o4', scryfall_id: 'sf-stp' },
    ],
    chat_card_proposals: [
      { id: P1, user_id: U, deck_id: 7, card_name: 'Cultivate', category: null, status: 'pending', expires_at: FUTURE },
      { id: P2, user_id: U, deck_id: 7, card_name: 'Birds of Paradise', category: 'Ramp', status: 'pending', expires_at: FUTURE },
      { id: P3, user_id: U, deck_id: 7, card_name: 'Swords to Plowshares', category: null, status: 'pending', expires_at: FUTURE },
    ],
  }
}

const confirm = (db: ReturnType<typeof makeDb>, ids: string[], userId = U, deckId = 7) =>
  confirmProposals(db as unknown as CheckClient, { userId, deckId, proposalIds: ids })

beforeEach(() => {
  state.commanders = { names: ['Korvold'], identity: 'BRG' }
  state.owned = new Map()
  state.rpcFails = false
})

describe('confirm', () => {
  it('adds exactly one planned slot: quantity 1, no copy assigned, in the default category', async () => {
    const db = makeDb(tables())
    const before = db.tables.deck_cards.length
    const out = await confirm(db, [P1])
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(out.reply.added).toHaveLength(1)
    expect(db.tables.deck_cards).toHaveLength(before + 1)
    const slot = db.tables.deck_cards.find((c) => c.id === out.reply.added[0].deckCardId)!
    expect(slot).toMatchObject({ card_name: 'Cultivate', quantity: 1, copy_id: null, ownership_status: null, deck_id: 7, categories: '["Ramp"]', scryfall_id: 'sf-cult' })
    expect(db.tables.chat_card_proposals.find((p) => p.id === P1)).toMatchObject({ status: 'added', created_deck_card_id: slot.id })
    expect(out.reply.deckCardCount).toBe(2)
  })

  it("an owned card sitting in another deck stays there: only a planned slot is made", async () => {
    state.owned.set('Cultivate', 'sf-owned-printing')
    const db = makeDb(tables())
    await confirm(db, [P1])
    const prosperRow = db.tables.deck_cards.find((c) => c.id === 2)!
    expect(prosperRow).toMatchObject({ deck_id: 8, copy_id: 55, ownership_status: 'original' })
    const added = db.tables.deck_cards.find((c) => c.deck_id === 7 && c.card_name === 'Cultivate')!
    expect(added.copy_id).toBeNull()
    expect(added.scryfall_id).toBe('sf-owned-printing') // asks for the printing the owner owns (D-003)
  })

  it("a proposal's own category is used", async () => {
    const db = makeDb(tables())
    const out = await confirm(db, [P2])
    expect(out.kind).toBe('ok')
    expect(db.tables.deck_cards.find((c) => c.card_name === 'Birds of Paradise')?.categories).toBe('["Ramp"]')
  })

  it('a second confirm of the same proposal is refused as already used, and adds nothing', async () => {
    const db = makeDb(tables())
    await confirm(db, [P1])
    const count = db.tables.deck_cards.length
    const again = await confirm(db, [P1])
    expect(again.kind).toBe('used')
    expect(db.tables.deck_cards).toHaveLength(count)
  })

  it("another owner's proposal id and another owner's deck both look like not found", async () => {
    const db = makeDb(tables())
    expect((await confirm(db, [P1], OTHER)).kind).toBe('not_found')
    expect((await confirm(db, [P1], U, 999)).kind).toBe('not_found')
    // proposal belongs to deck 7; asking through deck 8 finds nothing
    expect((await confirm(db, [P1], U, 8)).kind).toBe('not_found')
    expect(db.rpcCalls).toEqual([])
    expect(db.tables.deck_cards).toHaveLength(2)
  })

  it('an expired proposal adds nothing and says expired', async () => {
    const t = tables()
    t.chat_card_proposals[0].expires_at = new Date(Date.now() - 1000).toISOString()
    const db = makeDb(t)
    expect((await confirm(db, [P1])).kind).toBe('expired')
    expect(db.tables.deck_cards).toHaveLength(2)
    expect(db.tables.chat_card_proposals[0].status).toBe('expired')
  })

  it('a card that became a duplicate between propose and click is blocked and not added', async () => {
    const t = tables()
    t.deck_cards.push({ id: 3, deck_id: 7, user_id: U, card_name: 'Cultivate', categories: '["Ramp"]', quantity: 1, copy_id: null })
    const db = makeDb(t)
    const out = await confirm(db, [P1])
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(out.reply.added).toEqual([])
    expect(out.reply.skipped[0]).toMatchObject({ proposalId: P1, blockReason: 'in_deck', blockText: 'Already in Korvold.' })
    expect(db.tables.chat_card_proposals[0].status).toBe('blocked')
  })

  it('and one that is now outside the deck colours is blocked', async () => {
    state.commanders = { names: ['Korvold'], identity: 'B' }
    const out = await confirm(makeDb(tables()), [P1])
    expect(out.kind === 'ok' && out.reply.skipped[0].blockReason).toBe('outside_colours')
  })

  it('Add all with one stale card adds the rest and reports the one', async () => {
    const t = tables()
    t.deck_cards.push({ id: 3, deck_id: 7, user_id: U, card_name: 'Birds of Paradise', categories: '[]', quantity: 1, copy_id: null })
    const db = makeDb(t)
    const out = await confirm(db, [P1, P2])
    expect(out.kind).toBe('ok')
    if (out.kind !== 'ok') return
    expect(out.reply.added.map((a) => a.proposalId)).toEqual([P1])
    expect(out.reply.skipped.map((s) => [s.proposalId, s.blockReason])).toEqual([[P2, 'in_deck']])
    expect(db.rpcCalls).toEqual(['confirm_chat_card_proposals']) // one transaction for the whole batch
  })

  it('the same card twice in one Add all is added once', async () => {
    const t = tables()
    t.chat_card_proposals.push({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', user_id: U, deck_id: 7, card_name: 'Cultivate', category: null, status: 'pending', expires_at: FUTURE })
    const out = await confirm(makeDb(t), [P1, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'])
    expect(out.kind === 'ok' && out.reply.added).toHaveLength(1)
  })

  it('a database failure leaves nothing added and says failed', async () => {
    state.rpcFails = true
    const db = makeDb(tables())
    expect((await confirm(db, [P1])).kind).toBe('failed')
    expect(db.tables.deck_cards).toHaveLength(2)
    expect(db.tables.chat_card_proposals[0].status).toBe('pending')
  })

  it('past 100 cards still adds, and the reply carries the new count for the warning', async () => {
    const t = tables()
    t.deck_cards[0].quantity = 100
    const out = await confirm(makeDb(t), [P1])
    expect(out.kind === 'ok' && out.reply.deckCardCount).toBe(101)
  })
})

describe('dismiss', () => {
  it('only changes the proposal, never the deck', async () => {
    const db = makeDb(tables())
    expect(await dismissProposals(db as unknown as CheckClient, { userId: U, deckId: 7, proposalIds: [P1] })).toBe('ok')
    expect(db.tables.chat_card_proposals[0].status).toBe('dismissed')
    expect(db.tables.deck_cards).toHaveLength(2)
    expect(await dismissProposals(db as unknown as CheckClient, { userId: OTHER, deckId: 7, proposalIds: [P2] })).toBe('not_found')
    expect(db.tables.chat_card_proposals[1].status).toBe('pending')
  })
})

describe('undo', () => {
  const undo = (db: ReturnType<typeof makeDb>, ids: string[], userId = U) =>
    undoProposals(db as unknown as CheckClient, { userId, deckId: 7, proposalIds: ids })

  it('removes exactly the slot that was added, and nothing else', async () => {
    const db = makeDb(tables())
    await confirm(db, [P1])
    const out = await undo(db, [P1])
    expect(out).toMatchObject({ kind: 'ok', reply: { undone: [P1], refused: [] } })
    expect(db.tables.deck_cards.map((c) => c.id)).toEqual([1, 2])
    expect(db.tables.chat_card_proposals[0].status).toBe('undone')
  })

  it('refuses when a copy has been sleeved to the slot since', async () => {
    const db = makeDb(tables())
    await confirm(db, [P1])
    db.tables.deck_cards.find((c) => c.card_name === 'Cultivate' && c.deck_id === 7)!.copy_id = 77
    const out = await undo(db, [P1])
    expect(out.kind === 'ok' && out.reply.refused[0].text).toBe('This card has been changed since. Remove it from the deck page.')
    expect(db.tables.deck_cards.some((c) => c.copy_id === 77)).toBe(true)
  })

  it('refuses a card that was never added, and treats another owner as not found', async () => {
    const db = makeDb(tables())
    const out = await undo(db, [P1])
    expect(out.kind === 'ok' && out.reply.refused[0].text).toMatch(/not added/)
    expect((await undo(db, [P1], OTHER)).kind).toBe('not_found')
  })

  it('Add all, then one Undo for the whole batch', async () => {
    const db = makeDb(tables())
    await confirm(db, [P1, P2])
    const out = await undo(db, [P1, P2])
    expect(out.kind === 'ok' && out.reply.undone).toEqual([P1, P2])
    expect(db.tables.deck_cards).toHaveLength(2)
  })
})

describe('safety boundary', () => {
  it('parseProposalIds only accepts 1 to 30 well-formed ids', () => {
    expect(parseProposalIds([P1, P1])).toEqual([P1])
    expect(parseProposalIds([])).toBeNull()
    expect(parseProposalIds(['nope'])).toBeNull()
    expect(parseProposalIds('x')).toBeNull()
    expect(parseProposalIds(Array.from({ length: 31 }, () => P1))).toBeNull()
  })

  it('the tool registry and tool loop have no path to the confirm, undo or dismiss code', () => {
    for (const file of ['tool-registry.ts', 'tool-executor.ts']) {
      const src = readFileSync(join(__dirname, file), 'utf8')
      expect(src).not.toMatch(/chat-proposal-confirm|chat-proposals|confirm_chat_card_proposals|undo_chat_card_proposals|apply_ai_deck_delta/)
    }
    const registry = readFileSync(join(__dirname, 'chat-card-proposals.ts'), 'utf8')
    expect(registry).not.toMatch(/chat-proposal-confirm|\.rpc\(|\.update\(|\.delete\(/)
    // The propose path only ever writes proposal rows.
    expect(registry.match(/\.insert\(/g)).toHaveLength(1)
  })
})

describe('routes', () => {
  it('confirm route: signed-out is refused, bad ids are refused, nothing reaches the database', async () => {
    const { requireAuth } = await import('./auth')
    const { POST } = await import('@/app/api/decks/[id]/chat-proposals/confirm/route')
    const mk = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never
    vi.mocked(requireAuth).mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }) as never)
    expect((await POST(mk({ proposalIds: [P1] }), { params: Promise.resolve({ id: '7' }) })).status).toBe(401)
    vi.mocked(requireAuth).mockResolvedValueOnce({ id: U } as never)
    expect((await POST(mk({ proposalIds: ['not-an-id'] }), { params: Promise.resolve({ id: '7' }) })).status).toBe(400)
  })
})
