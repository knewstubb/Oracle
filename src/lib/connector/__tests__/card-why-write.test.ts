/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
// Claude writes a deck card's Why (set_card_why): fills an empty line, changes a written one, both through the change log; refusals write nothing;
// an older database (no Why column yet) is told plainly. The database rules themselves are rehearsed in docs/oracle/reports/evidence/roles-db/test_card_why.sh.
import { describe, it, expect, vi } from 'vitest'
import { runTool } from '../server'
import { CONNECTOR_TOOLS } from '../tools'
import { describeGroup } from '../change-sentences'
import { mockDb, type RecordedQuery } from './mock-db'
import type { Gateway } from '../write-types'
const U = 'user-1'
const G = '11111111-2222-4333-8444-555555555555'
const slot = (why: string | null) => ({ id: 7, card_name: 'Rancor', why_here: why })
function db(why: string | null, opts: { column?: boolean; slot?: boolean } = {}) {
  return mockDb((q: RecordedQuery) => {
    if (q.table === 'deck_cards') {
      if (opts.column === false) return { error: { message: 'column deck_cards.why_here does not exist' } }
      return { data: opts.slot === false ? [] : [slot(why)] }
    }
    return { data: [] }
  })
}
function gw(over: Record<string, unknown> = {}) {
  const setCardWhy = vi.fn(async (a: any) => ({ ok: true as const, data: { success: true, outcome: 'applied', group_id: G, count: 1, filled: !a.whyBase, current: a.why } }))
  const recordReason = vi.fn(async () => ({ ok: true as const, data: { success: true, stored: true } }))
  return { setCardWhy, recordReason, ...over } as unknown as Gateway & { setCardWhy: typeof setCardWhy }
}
const ctx = (g: Gateway, d: ReturnType<typeof db>['db']) => ({ db: d, userId: U, connectionId: 'conn-1', gateway: g }) as any
const body = (r: any) => JSON.parse(r.content[0].text)
const args = (why = 'Ramps into the big turn.') => ({ reason: 'The owner asked for reasons.', deck_id: 1, slot_id: 7, name: 'Rancor', why })
describe('set_card_why', () => {
  it('is registered as an edit tool (not read-only, not destructive)', () => {
    const t = CONNECTOR_TOOLS.find((x) => x.name === 'set_card_why')!
    expect(t.annotations.readOnlyHint).toBe(false)
    expect(t.annotations.destructiveHint).toBe(false)
  })
  it('fills an empty Why: one call, answer says filled, History and Undo mentioned', async () => {
    const g = gw()
    const r = body(await runTool(ctx(g, db(null).db), 'set_card_why', args()))
    expect(g.setCardWhy).toHaveBeenCalledWith({ userId: U, connectionId: 'conn-1', deckId: 1, slotId: 7, why: 'Ramps into the big turn.', whyBase: '' })
    expect(r).toMatchObject({ ok: true, status: 'applied', group_id: G, filled: true })
    expect(r.message).toMatch(/History/)
  })
  it('changes a Why the owner wrote: sends the text it read so a newer edit is refused, and says it replaced one', async () => {
    const g = gw()
    const r = body(await runTool(ctx(g, db('Mine.').db), 'set_card_why', args('Better.')))
    expect(g.setCardWhy).toHaveBeenCalledWith(expect.objectContaining({ why: 'Better.', whyBase: 'Mine.' }))
    expect(r).toMatchObject({ ok: true, status: 'applied', filled: false })
    expect(r.message).toMatch(/replaced a Why that was already there/)
  })
  it('the owner changed the line meanwhile: the database refuses, nothing is changed, the answer says so', async () => {
    const g = gw({ setCardWhy: vi.fn(async () => ({ ok: false as const, code: 'why_changed', detail: { card: 'Rancor' } })) })
    const r = (await runTool(ctx(g, db('Mine.').db), 'set_card_why', args('Better.'))) as any
    expect(JSON.stringify(r)).toMatch(/changed by the owner/)
  })
  it('refuses a wrong name, an unknown slot, a line break, over 200 characters and a missing reason, without calling the database', async () => {
    const g = gw()
    expect(JSON.stringify(await runTool(ctx(g, db(null).db), 'set_card_why', { ...args(), name: 'Sol Ring' }))).toMatch(/Nothing was changed/)
    expect(JSON.stringify(await runTool(ctx(g, db(null, { slot: false }).db), 'set_card_why', args()))).toMatch(/Nothing was changed/)
    expect(JSON.stringify(await runTool(ctx(g, db(null).db), 'set_card_why', args('one\ntwo')))).toMatch(/Nothing was changed|one line/)
    expect(JSON.stringify(await runTool(ctx(g, db(null).db), 'set_card_why', args('a'.repeat(201))))).toMatch(/200|Nothing was changed/)
    expect(JSON.stringify(await runTool(ctx(g, db(null).db), 'set_card_why', { deck_id: 1, slot_id: 7, name: 'Rancor', why: 'x' }))).toMatch(/reason/i)
    expect(g.setCardWhy).not.toHaveBeenCalled()
  })
  it('exactly 200 characters is accepted', async () => {
    const g = gw()
    expect(body(await runTool(ctx(g, db(null).db), 'set_card_why', args('a'.repeat(200)))).status).toBe('applied')
  })
  it('an older database without the Why column is told plainly and nothing is written', async () => {
    const g = gw()
    const r = await runTool(ctx(g, db(null, { column: false }).db), 'set_card_why', args())
    expect(JSON.stringify(r)).toMatch(/not been updated/)
    expect(g.setCardWhy).not.toHaveBeenCalled()
  })
  it('writing the same text again reports no change', async () => {
    const g = gw({ setCardWhy: vi.fn(async () => ({ ok: true as const, data: { success: true, outcome: 'no_change', count: 0 } })) })
    expect(body(await runTool(ctx(g, db('Same.').db), 'set_card_why', args('Same.'))).status).toBe('no_change')
  })
  it('History describes the change in plain words', () => {
    const row = { kind: 'card_why', card_name: 'Rancor', deck_name: 'Pauper Elves', group_id: G } as any
    expect(describeGroup([row]).summary).toBe('Claude changed the Why on Rancor in Pauper Elves.')
  })
})
