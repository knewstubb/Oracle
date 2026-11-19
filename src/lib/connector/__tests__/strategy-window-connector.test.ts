/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
// DV-02 slice 1: Claude reads the Strategy window's fields (get_deck: deck, strategy, health, cards) and writes them
// (set_deck_setup). Rules held here: bracket-empty asks, Claude rewrites the whole Strategy only when it read the latest text, nothing is
// refused or filtered because of bracket, and an older database (no new columns yet) is told plainly.
import { describe, it, expect, vi } from 'vitest'
import { runTool } from '../server'
import { getDeck, getDeckInput } from '../tools/get-deck'
import { CONNECTOR_TOOLS } from '../tools'
import { mockDb, type RecordedQuery } from './mock-db'
import { AI_LIMITS_NEW } from '../edit-config'
import { STRATEGY_MAX } from '../../deck-strategy-window'
import { buildDeckHealth } from '../../deck-health'
import type { Gateway } from '../write-types'
const U = 'user-1'
const G = '11111111-2222-4333-8444-555555555555'
const deckRow = (bracket: string | null = null) => ({ id: 1, name: 'Yedora', commander_name: 'Yedora, Grave Gardener', format: 'commander', bracket, card_count: 99 })
const healthOk = async () => ({
  ok: true as const,
  health: buildDeckHealth(
    [
      { cardName: 'Forest', quantity: 36, typeLine: 'Basic Land — Forest', oracleText: null, inMainDeck: true },
      { cardName: 'Sol Ring', quantity: 1, typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.', inMainDeck: true },
    ],
    undefined,
    new Date('2026-11-19T00:00:00Z'),
  ),
}) as any
function strategyDb(row: Record<string, unknown> | null, opts: { newColumns?: boolean; deck?: ReturnType<typeof deckRow> } = {}) {
  const newColumns = opts.newColumns ?? true
  return mockDb((q: RecordedQuery) => {
    if (q.table === 'decks') return { data: [opts.deck ?? deckRow()] }
    if (q.table === 'deck_strategy') {
      if (!newColumns && /summary|updated_by/.test(q.columns)) return { error: { message: 'column deck_strategy.summary does not exist' } }
      return { data: row ? [{ deck_id: 1, ...row }] : [] }
    }
    return { data: [] }
  })
}
const get = async (db: ReturnType<typeof strategyDb>['db'], health = healthOk) => (await getDeck({ db, userId: U }, getDeckInput.parse({ deck_id: 1 }), health)) as any
describe('get_deck: deck, strategy, health, cards, in that order', () => {
  it('the answer lists its parts in that order', async () => {
    const r = await get(strategyDb({ bracket: 3, strategy_notes: 'Eat the graveyard.', table_context: 'Friday pod', summary: 'Plants and recursion', updated_by: 'owner', updated_at: '2026-11-19T10:00:00Z' }).db)
    const keys = Object.keys(r)
    expect(keys.indexOf('deck')).toBeLessThan(keys.indexOf('strategy'))
    expect(keys.indexOf('strategy')).toBeLessThan(keys.indexOf('health'))
    expect(keys.indexOf('health')).toBeLessThan(keys.indexOf('mainboard'))
    expect(keys.filter((k) => ['deck', 'strategy', 'health', 'mainboard'].includes(k))).toEqual(['deck', 'strategy', 'health', 'mainboard'])
  })
  it('strategy carries the marker Claude sends back as based_on, or none, with a note saying so', async () => {
    const a = await get(strategyDb({ strategy_notes: 'Mine.', updated_at: '2026-11-19T10:00:00Z' }).db)
    expect(a.strategy.version).toBe('2026-11-19T10:00:00Z')
    expect(a.strategy.versionNote).toMatch(/based_on/)
    expect((await get(strategyDb(null).db)).strategy.version).toBe('none')
  })
  it('strategy carries the target bracket with its name, the summary, the Strategy text, the playgroup and who changed it last', async () => {
    const r = await get(strategyDb({ bracket: 3, strategy_notes: 'Eat the graveyard.', table_context: 'Friday pod', summary: 'Plants and recursion', updated_by: 'claude', updated_at: '2026-11-19T10:00:00Z' }).db)
    expect(r.strategy).toMatchObject({
      targetBracket: { value: 3, name: 'Upgraded', source: 'deck_strategy' },
      summary: 'Plants and recursion',
      strategy: 'Eat the graveyard.',
      playgroup: 'Friday pod',
      lastChanged: { by: 'claude', at: '2026-11-19T10:00:00Z' },
    })
    expect(r.strategy.note).toBeUndefined()
  })
  it('bracket 5 reads as 5 cEDH', async () => {
    const r = await get(strategyDb({ bracket: 5 }).db)
    expect(r.strategy.targetBracket).toMatchObject({ value: 5, name: 'cEDH' })
  })
  it('health is the short Deck health check; a failed check says so and is never a passing result', async () => {
    const ok = await get(strategyDb(null).db)
    expect(ok.health).toMatchObject({ status: 'computed_now', headline: '1 of 5 in range', source: 'No EDHREC average for this commander' })
    expect(ok.health.groups.map((g: any) => [g.group, g.have, g.verdict])).toEqual([
      ['lands', 36, 'ok'],
      ['ramp', 1, 'light'],
      ['card_advantage', 0, 'light'],
      ['targeted_removal', 0, 'light'],
      ['board_wipes', 0, 'light'],
      ['game_plan', 0, null],
    ])
    expect(ok.health.groups[0].range).toEqual({ min: 35, max: 38 })
    const bad = await get(strategyDb(null).db, (async () => ({ ok: false, status: 500, error: 'EDHREC down' })) as any)
    expect(bad.health.status).toBe('unavailable')
    expect(bad.health.message).toMatch(/not the same as healthy/)
    const thrown = await get(strategyDb(null).db, (async () => { throw new Error('boom') }) as any)
    expect(thrown.health.status).toBe('unavailable')
  })
  it('bracket empty: Claude is told to ask the owner and not to assume, and that a bracket never limits suggestions', async () => {
    const r = await get(strategyDb(null).db)
    expect(r.strategy.targetBracket.value).toBeNull()
    expect(r.strategy.targetBracket.name).toBeNull()
    expect(r.strategy.targetBracket.whyEmpty).toMatch(/Ask the owner/)
    expect(r.strategy.targetBracket.whyEmpty).toMatch(/instead of assuming/)
    expect(r.strategy.targetBracket.whyEmpty).toMatch(/never limits which cards/)
    expect(r.strategy).toMatchObject({ summary: null, strategy: null, playgroup: null, lastChanged: null })
  })
  it('before the stored-data update the older fields still come back, with a plain note instead of an error', async () => {
    const r = await get(strategyDb({ bracket: 2, strategy_notes: 'Keep it fun.', table_context: null, updated_at: '2026-11-19T10:00:00Z' }, { newColumns: false }).db)
    expect(r.ok).toBe(true)
    expect(r.strategy).toMatchObject({ targetBracket: { value: 2, name: 'Core' }, strategy: 'Keep it fun.', summary: null, lastChanged: { by: null } })
    expect(r.strategy.note).toMatch(/not stored yet/)
  })
  it('every strategy read carries the owner id', async () => {
    const { db, queries } = strategyDb(null)
    await get(db)
    const sq = queries.filter((q) => q.table === 'deck_strategy' && /summary/.test(q.columns))
    expect(sq.length).toBeGreaterThan(0)
    for (const q of sq) expect(q.filters.some((f) => f.op === 'eq' && f.args[0] === 'user_id' && f.args[1] === U)).toBe(true)
  })
})
function gw(over: Partial<Record<keyof Gateway, unknown>> = {}): Gateway {
  return { resolveCard: async (n: string) => ({ card: { oracleId: 'o-' + n, scryfallId: 's-' + n, name: n, setCode: 'cmm' } }), recordReason: vi.fn(async () => ({ ok: true, data: { success: true, stored: true } })), ...over } as unknown as Gateway
}
const applied = { ok: true, data: { success: true, outcome: 'applied', group_id: G, count: 1, changed: {} } }
const ctx = (gateway: Gateway, db: ReturnType<typeof strategyDb>['db']) => ({ db, userId: U, connectionId: 'conn-1', clientId: 'cl', clientName: 'Claude', gateway })
const V1 = '2026-11-19T10:00:00Z'
describe('set_deck_setup: Claude rewrites the whole Strategy, guarded by the marker from get_deck', () => {
  it('a rewrite with the matching marker is sent as one replaced text, with the text it replaces as the base', async () => {
    const mine = 'Yedora turns every land into a plant.\n\nNever cut Scute Swarm.'
    const next = 'Yedora turns every land into a plant, then sacrifices them. Never cut Scute Swarm.'
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    const r = await runTool(ctx(g, strategyDb({ strategy_notes: mine, updated_at: V1 }).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: next, based_on: V1 })
    expect(r.isError).toBeFalsy()
    const patch = (g.setDeckSetup as any).mock.calls[0][0].patch
    expect(patch.strategy_notes).toBe(next)
    expect(patch.strategy_notes_base).toBe(mine)
    expect(patch.strategy_notes).not.toMatch(/Claude, \d/)
  })
  it('the same moment written another way still matches', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    await runTool(ctx(g, strategyDb({ strategy_notes: 'Mine.', updated_at: '2026-11-19T10:00:00+00:00' }).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'New.', based_on: '2026-11-19T10:00:00Z' })
    expect(g.setDeckSetup).toHaveBeenCalledTimes(1)
  })
  it('on a deck with no Strategy yet, none matches and the base is null', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'First words.', based_on: 'none' })
    const patch = (g.setDeckSetup as any).mock.calls[0][0].patch
    expect(patch.strategy_notes).toBe('First words.')
    expect(patch.strategy_notes_base).toBeNull()
  })
  it('a stale marker is refused before anything is written, in plain words', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const r = await runTool(ctx(g, strategyDb({ strategy_notes: 'Owner edit.', updated_at: '2026-11-19T11:00:00Z' }).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'New.', based_on: V1 })
    expect(r.structuredContent).toMatchObject({ error: { code: 'strategy_changed' } })
    expect(JSON.stringify(r.structuredContent)).toMatch(/Strategy changed after you read it.*Call get_deck again.*Nothing was changed/)
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('none is refused when a Strategy exists, and a time is refused when there is none', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const a = await runTool(ctx(g, strategyDb({ strategy_notes: 'Mine.', updated_at: V1 }).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'New.', based_on: 'none' })
    const b = await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'New.', based_on: V1 })
    expect(a.structuredContent).toMatchObject({ error: { code: 'strategy_changed' } })
    expect(b.structuredContent).toMatchObject({ error: { code: 'strategy_changed' } })
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('a Strategy without based_on, and the old strategy_add and strategy_notes inputs, are refused before the database is called', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const c = ctx(g, strategyDb({ strategy_notes: 'Mine.', updated_at: V1 }).db)
    for (const extra of [{ strategy: 'New.' }, { strategy_add: 'New.' }, { strategy_notes: 'New.' }]) {
      expect((await runTool(c, 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, ...extra })).isError).toBe(true)
    }
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('a rewrite without a reason is refused and nothing is sent', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const r = await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { deck_id: 1, strategy: 'New.', based_on: 'none' })
    expect(r.isError).toBe(true)
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('a Strategy over the limit is refused and nothing is sent', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const r = await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'x'.repeat(STRATEGY_MAX + 1), based_on: 'none' })
    expect(r.isError).toBe(true)
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('the limit equals the database limit', () => {
    expect(STRATEGY_MAX).toBe(AI_LIMITS_NEW.strategy_notes_max_chars)
  })
  it('a failed read of the current Strategy changes nothing', async () => {
    const g = gw({ setDeckSetup: vi.fn() })
    const db = mockDb((q) => (q.table === 'deck_strategy' && /strategy_notes/.test(q.columns) ? { error: { message: 'down' } } : { data: [] })).db
    const r = await runTool(ctx(g, db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'Hello.', based_on: 'none' })
    expect(r.isError).toBe(true)
    expect(g.setDeckSetup).not.toHaveBeenCalled()
  })
  it('the database refusing because the text changed meanwhile tells Claude to read and rewrite again', async () => {
    const g = gw({ setDeckSetup: async () => ({ ok: false, code: 'notes_changed', detail: {} }) })
    const r = await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'Hello.', based_on: 'none' })
    expect(JSON.stringify(r.structuredContent)).toMatch(/changed the Strategy while this was being written.*Nothing was changed.*Call get_deck again/)
  })
  it('before the stored-data update, the database refusal reads as "not applied yet", not a code', async () => {
    const g = gw({ setDeckSetup: async () => ({ ok: false, code: 'notes_replace_refused', detail: {} }) })
    const r = await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, strategy: 'Hello.', based_on: 'none' })
    const text = JSON.stringify(r.structuredContent)
    expect(text).toMatch(/cannot replace the Strategy yet.*has not been applied.*Nothing was changed.*Ask the owner to apply it/)
    expect(text).not.toMatch(/strategy_add|paragraph/)
  })
  it('a rewrite is one change group: Claude can undo it, and it shows in list_recent_changes', async () => {
    const row = { id: 'r1', group_id: G, kind: 'deck_setup', client_name: 'Claude', deck_id: 1, deck_name: 'Yedora', other_deck_id: null, other_deck_name: null, card_name: 'Yedora', oracle_id: null, printing_id: null, approved_by_owner: false, created_at: '2026-11-19T12:00:00Z', undoable_until: '2026-11-26T12:00:00Z', undone_at: null, undone_by: null, owner_only: false, undo_blocker: null, claude_reason: 'Refining the plan.' }
    const g = gw({ setDeckSetup: vi.fn(async () => applied), listRecent: vi.fn(async () => ({ ok: true, data: [row] })), undoAsClaude: vi.fn(async () => ({ ok: true, data: { success: true, undone: 1 } })) })
    const c = ctx(g, strategyDb(null).db)
    const w = await runTool(c, 'set_deck_setup', { reason: 'Refining the plan.', deck_id: 1, strategy: 'First words.', based_on: 'none' })
    expect((w.structuredContent as any).group_id).toBe(G)
    const list = await runTool(c, 'list_recent_changes', {})
    expect(JSON.stringify(list.structuredContent)).toMatch(/Claude changed the setup of Yedora/)
    expect((list.structuredContent as any).changes[0]).toMatchObject({ group_id: G, claude_can_undo: true })
    const u = await runTool(c, 'undo_change', { group_id: G })
    expect(g.undoAsClaude).toHaveBeenCalledWith(U, 'conn-1', G)
    expect(u.structuredContent).toMatchObject({ status: 'undone' })
  })
})
describe('set_deck_setup: summary, playgroup and bracket 1 to 5', () => {
  it('sends the summary and playgroup, and null clears them', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, summary: 'Plants and recursion', playgroup: null, bracket: 5 })
    expect((g.setDeckSetup as any).mock.calls[0][0].patch).toEqual({ summary: 'Plants and recursion', playgroup: null, bracket: 5 })
  })
  it('a summary of 120 is accepted and 121 is not', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    expect((await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, summary: 'x'.repeat(120) })).isError).toBeFalsy()
    expect((await runTool(ctx(g, strategyDb(null).db), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, summary: 'x'.repeat(121) })).isError).toBe(true)
  })
  it('before the stored-data update the summary, the playgroup and bracket 5 are refused in plain words and nothing is sent', async () => {
    const g = gw({ setDeckSetup: vi.fn(async () => applied) })
    const old = strategyDb(null, { newColumns: false }).db
    for (const input of [{ summary: 'Hello' }, { playgroup: 'Friday' }, { bracket: 5 }]) {
      const r = await runTool(ctx(g, old), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, ...input })
      expect(r.structuredContent).toMatchObject({ error: { code: 'strategy_fields_not_ready' } })
      expect(JSON.stringify(r.structuredContent)).toMatch(/Nothing was changed/)
    }
    expect(g.setDeckSetup).not.toHaveBeenCalled()
    // what the old database can hold still goes through
    const ok = await runTool(ctx(g, old), 'set_deck_setup', { reason: 'Test reason.', deck_id: 1, bracket: 4 })
    expect(ok.isError).toBeFalsy()
  })
})
describe('a bracket never limits, filters or refuses anything', () => {
  it('no tool text implies suggestions are restricted by bracket, and the two bracket tools say it never limits', () => {
    for (const t of CONNECTOR_TOOLS) expect(t.description, t.name).not.toMatch(/only suggest|restricted to|limited to the bracket|recommended for your bracket|filtered by bracket/i)
    expect(CONNECTOR_TOOLS.find((t) => t.name === 'get_deck')!.description).toMatch(/never limits which cards/)
    expect(CONNECTOR_TOOLS.find((t) => t.name === 'set_deck_setup')!.description).toMatch(/never limits which cards/)
  })
  it('no read tool takes a bracket as a filter', () => {
    for (const t of CONNECTOR_TOOLS.filter((x) => x.name !== 'set_deck_setup')) {
      const shape = (t.inputSchema as any)._zod?.def?.shape ?? (t.inputSchema as any).shape ?? {}
      expect(Object.keys(shape).some((k) => /bracket/i.test(k)), t.name).toBe(false)
    }
  })
})
