/* eslint-disable @typescript-eslint/no-explicit-any -- test results are inspected loosely */
import { describe, it, expect } from 'vitest'
import { getDeckHealth } from '../tools/get-deck-health'
import { loadDeckHealth } from '../../deck-health-server'
import { guideTargets, GUIDE_LABEL } from '../../commander-targets'
import { GUIDE_TIMEOUT_LABEL, HEALTH_TARGETS_TIMEOUT_MS } from '../deck-health-loader'
import { readOnlyRefClient } from '../read-only-ref-client'
import { hasEq, mockDb, type RecordedQuery } from './mock-db'

const U = 'user-1'
const guide = async () => guideTargets(GUIDE_LABEL)

const DECKS = [{ id: 1, user_id: U, commander_name: null }, { id: 2, user_id: 'someone-else', commander_name: null }]
const CARDS = [
  { deck_id: 1, user_id: U, card_name: 'Sol Ring', quantity: 1, categories: '["Ramp"]', is_commander: false, command_zone_role: null },
  { deck_id: 1, user_id: U, card_name: 'Llanowar Elves', quantity: 1, categories: '["Ramp"]', is_commander: false, command_zone_role: null },
  { deck_id: 1, user_id: U, card_name: 'Swords to Plowshares', quantity: 1, categories: '["Removal"]', is_commander: false, command_zone_role: null },
  { deck_id: 1, user_id: U, card_name: 'Forest', quantity: 30, categories: '["Land"]', is_commander: false, command_zone_role: null },
  { deck_id: 2, user_id: 'someone-else', card_name: 'Secret Tech', quantity: 1, categories: null, is_commander: false, command_zone_role: null },
]
const REF = [
  { name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.' },
  { name: 'Llanowar Elves', type_line: 'Creature — Elf Druid', oracle_text: '{T}: Add {G}.' },
  { name: 'Swords to Plowshares', type_line: 'Instant', oracle_text: 'Exile target creature. Its controller gains life equal to its power.' },
  { name: 'Forest', type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)' },
]

type Row = Record<string, any>
/** Filters rows the way the app's wider client would. */
function appFake(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      return {
        select() {
          let rs = [...(tables[table] ?? [])]
          const chain: any = {
            eq: (c: string, v: unknown) => ((rs = rs.filter((r) => r[c] === v)), chain),
            in: (c: string, vs: unknown[]) => ((rs = rs.filter((r) => vs.includes(r[c]))), chain),
            ilike: () => ((rs = []), chain),
            limit: (n: number) => ((rs = rs.slice(0, n)), chain),
            maybeSingle: async () => ({ data: rs[0] ?? null, error: null }),
            then: (ok: any, bad: any) => Promise.resolve({ data: rs, error: null }).then(ok, bad),
          }
          return chain
        },
      }
    },
  } as any
}

function connectorDb(opts: { failOn?: string } = {}) {
  return mockDb((q: RecordedQuery) => {
    if (opts.failOn === q.table) return { error: { message: 'boom' } }
    const eqs = Object.fromEntries(q.filters.filter((f) => f.op === 'eq').map((f) => [f.args[0] as string, f.args[1]]))
    const matches = (r: Row) => Object.entries(eqs).every(([c, v]) => r[c] === v)
    if (q.table === 'decks') return { data: DECKS.filter(matches) }
    if (q.table === 'deck_cards') return { data: CARDS.filter(matches) }
    if (q.table === 'ref_cards') {
      const names = (q.filters.find((f) => f.op === 'in')?.args[1] as string[]) ?? []
      return { data: REF.filter((r) => names.includes(r.name)) }
    }
    return { data: [] }
  })
}

describe('get_deck_health, live (CC-06d)', () => {
  it('gives the same six rows, numbers and verdicts as the Deck health screen for the same deck', async () => {
    const app = await loadDeckHealth(appFake({ decks: DECKS, deck_cards: CARDS, ref_cards: REF }), 1, U, { targets: guide })
    expect(app.ok).toBe(true)
    const { db } = connectorDb()
    const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide)) as any
    expect(r).toMatchObject({ ok: true, deckId: 1, status: 'computed_now' })
    const { computedAt: _a, ...appHealth } = (app as any).health // eslint-disable-line @typescript-eslint/no-unused-vars
    const { computedAt: _b, ...toolHealth } = r.health // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(toolHealth).toEqual(appHealth) // the same answer apart from the time of the check
    expect(toolHealth.rows).toEqual(appHealth.rows)
    expect(toolHealth.rows.map((x: any) => x.kind)).toEqual(['lands', 'ramp', 'card_advantage', 'targeted_removal', 'board_wipes', 'game_plan'])
    expect(toolHealth.rows.map((x: any) => x.have)).toEqual([30, 2, 0, 1, 0, 0])
    expect(toolHealth.rows.map((x: any) => x.verdict)).toEqual(['light', 'light', 'light', 'light', 'light', null])
    expect(toolHealth.verdict.headline).toBe('0 of 5 in range')
    expect(Number.isNaN(Date.parse(r.computedAt))).toBe(false)
  })

  it('runs a fresh check on every call (no saved-only branch, no "not_computed")', async () => {
    const { db } = connectorDb()
    const a = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide, () => new Date('2026-11-16T00:00:00Z'))) as any
    const b = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide, () => new Date('2026-11-16T00:00:05Z'))) as any
    expect(a.computedAt).not.toBe(b.computedAt)
    expect(JSON.stringify(a)).not.toMatch(/not_computed/)
  })

  it('another user\'s deck is not found, and so is a missing one', async () => {
    const { db } = connectorDb()
    expect(await getDeckHealth({ db, userId: U }, { deck_id: 2 }, guide)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await getDeckHealth({ db, userId: U }, { deck_id: 99 }, guide)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('a forced failure is an error, never a pass', async () => {
    for (const failOn of ['deck_cards', 'ref_cards']) {
      const { db } = connectorDb({ failOn })
      const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide)) as any
      expect(r.ok, failOn).toBe(false)
      expect(r.error.code, failOn).toBe('HEALTH_FAILED')
      expect(r.health).toBeUndefined()
    }
    const { db } = connectorDb({ failOn: 'decks' })
    expect(((await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide)) as any).ok).toBe(false)
  })

  it('a failing numbers provider is an error, not a pass', async () => {
    const { db } = connectorDb()
    const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, async () => { throw new Error('nope') })) as any
    expect(r).toMatchObject({ ok: false, error: { code: 'HEALTH_FAILED' } })
  })

  it('a commander with nothing saved still answers with the six rows, and the reference line says there is no average', async () => {
    const { db } = connectorDb()
    // The built-in connector provider, with no commander on the deck: no EDHREC average, no network.
    const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 })) as any
    expect(r.ok).toBe(true)
    expect(r.health.rows).toHaveLength(6)
    expect(r.health.reference).toEqual({ available: false, label: 'No EDHREC average for this commander' })
    expect(r.note).toMatch(/Game Plan & Win Conditions is a plain total with no range and no verdict/)
    expect(r.note).toMatch(/EDHREC average is for reference only/)
  })

  it('every owner-table query carries the user id; only card library tables are shared', async () => {
    const { db, queries } = connectorDb()
    await getDeckHealth({ db, userId: U }, { deck_id: 1 }, guide)
    expect(queries.length).toBeGreaterThan(0)
    for (const q of queries) {
      if (q.table.startsWith('ref_')) continue
      expect(hasEq(q, 'user_id', U), q.table).toBe(true)
    }
  })
})

describe('get_deck_health, slow commander numbers (CC-06 follow-up)', () => {
  it('gives up after the time limit and answers with the six rows and a plain no-average reference, saving nothing', async () => {
    const { db, queries } = connectorDb()
    const never = () => new Promise<never>(() => {}) // EDHREC never answers
    const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, never, undefined, 20)) as any
    expect(r.ok).toBe(true)
    expect(r.status).toBe('computed_now')
    expect(GUIDE_TIMEOUT_LABEL).toMatch(/took too long/)
    expect(r.health.rows).toHaveLength(6) // the rows never wait for EDHREC
    expect(r.health.reference).toEqual({ available: false, label: 'No EDHREC average just now (EDHREC could not be reached)' })
    expect(r.health.rows.every((x: any) => x.reference === null)).toBe(true)
    expect(queries.every((q) => !['insert', 'upsert', 'update', 'delete'].includes((q as any).op ?? ''))).toBe(true)
  })

  it('a provider that answers in time is used as normal', async () => {
    const { db } = connectorDb()
    const quick = async () => ({
      ...guideTargets('EDHREC average deck, 500 decks'),
      status: 'ok' as const,
      source: 'edhrec_average' as const,
      roles: (['ramp', 'draw', 'removal', 'wipes'] as const).map((role) => ({ role, typical: 9, cardsInRole: 9 })),
      landsTypical: 36,
    })
    const r = (await getDeckHealth({ db, userId: U }, { deck_id: 1 }, quick, undefined, 1000)) as any
    expect(r.health.reference.label).toBe('EDHREC average deck, 500 decks')
  })

  it('the time limit is about 8 seconds', () => {
    expect(HEALTH_TARGETS_TIMEOUT_MS).toBe(8000)
  })
})

describe('read-only card library view', () => {
  it('reaches only card library tables and has no way to write', () => {
    const { db } = connectorDb()
    const c = readOnlyRefClient(db)
    expect(() => c.from('decks')).toThrow()
    expect(() => c.from('user_cards')).toThrow()
    const t = c.from('ref_cards') as any
    expect(Object.keys(t)).toEqual(['select'])
    expect(Object.keys(t.select('*')).sort()).toEqual(['eq', 'ilike', 'in', 'limit', 'maybeSingle', 'then'])
  })
})
