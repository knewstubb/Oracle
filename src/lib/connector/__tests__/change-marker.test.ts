import { describe, it, expect } from 'vitest'
import { readChangeMarker, type MarkerDb } from '../change-marker'
type Row = Record<string, unknown>
/** A fake table: records every filter, answers the "made" query and the "undone" query from two canned lists. */
function fakeDb(made: Row[], undone: Row[], error = false) {
  const calls: { cols: string; filters: string[] }[] = []
  const db = {
    from(table: string) {
      expect(table).toBe('ai_change_log')
      return {
        select(cols: string) {
          const call = { cols, filters: [] as string[] }
          calls.push(call)
          const q: Record<string, unknown> = {}
          const chain = (name: string) => (...a: unknown[]) => {
            call.filters.push(`${name}:${a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(',')}`)
            return q
          }
          for (const n of ['eq', 'or', 'not', 'gte', 'order', 'limit']) q[n] = chain(n)
          q.then = (res: (v: unknown) => unknown) => res({ data: cols.includes('undone_at') ? undone : made, error: error ? { message: 'x' } : null })
          return q
        },
      }
    },
  }
  return { db: db as unknown as MarkerDb, calls }
}
describe('readChangeMarker', () => {
  it('asks only for the newest row, scoped to the signed-in user (no card data)', async () => {
    const { db, calls } = fakeDb([], [])
    await readChangeMarker(db, 'user-1')
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      expect(c.filters).toContain('eq:user_id,user-1')
      expect(c.filters).toContain('limit:1')
    }
    expect(calls[0].cols).toBe('id, created_at, approved_by_owner')
  })
  it('limits to one deck (as source or destination) when a deck id is given', async () => {
    const { db, calls } = fakeDb([], [])
    await readChangeMarker(db, 'user-1', 42)
    expect(calls[0].filters).toContain('or:deck_id.eq.42,other_deck_id.eq.42')
    expect(calls[1].filters).toContain('or:deck_id.eq.42,other_deck_id.eq.42')
  })
  it('has no changes yet: a steady marker and no actor', async () => {
    const { db } = fakeDb([], [])
    expect(await readChangeMarker(db, 'u')).toEqual({ marker: '-|-', actor: null })
  })
  it('a new Claude change changes the marker and names Claude', async () => {
    const a = await readChangeMarker(fakeDb([{ id: 'a', created_at: '2026-11-19T10:00:00Z', approved_by_owner: false }], []).db, 'u')
    const b = await readChangeMarker(fakeDb([{ id: 'b', created_at: '2026-11-19T10:00:05Z', approved_by_owner: false }], []).db, 'u')
    expect(a.marker).not.toBe(b.marker)
    expect(b.actor).toBe('claude')
  })
  it('a change the owner approved is the owner\'s own', async () => {
    const r = await readChangeMarker(fakeDb([{ id: 'a', created_at: '2026-11-19T10:00:00Z', approved_by_owner: true }], []).db, 'u')
    expect(r.actor).toBe('owner')
  })
  it('an undo changes the marker; who pressed it decides the actor', async () => {
    const made = [{ id: 'a', created_at: '2026-11-19T10:00:00Z', approved_by_owner: false }]
    const byOwner = await readChangeMarker(fakeDb(made, [{ undone_at: '2026-11-19T10:05:00Z', undone_by: 'owner' }]).db, 'u')
    const byClaude = await readChangeMarker(fakeDb(made, [{ undone_at: '2026-11-19T10:05:00Z', undone_by: 'claude' }]).db, 'u')
    expect(byOwner.marker).toBe('a|2026-11-19T10:05:00Z')
    expect(byOwner.actor).toBe('owner')
    expect(byClaude.actor).toBe('claude')
  })
  it('a newer change after an older undo is Claude again', async () => {
    const r = await readChangeMarker(fakeDb([{ id: 'b', created_at: '2026-11-19T11:00:00Z', approved_by_owner: false }], [{ undone_at: '2026-11-19T10:05:00Z', undone_by: 'owner' }]).db, 'u')
    expect(r.actor).toBe('claude')
  })
  it('a read error is thrown, never a made-up marker', async () => {
    await expect(readChangeMarker(fakeDb([], [], true).db, 'u')).rejects.toThrow('marker_read_failed')
  })
  it('the answer is tiny', async () => {
    const r = await readChangeMarker(fakeDb([{ id: '2d3f8c1e-9a7b-4c55-8f21-0b6e4a1d7c90', created_at: '2026-11-19T10:00:00.123456+00:00', approved_by_owner: false }], [{ undone_at: '2026-11-19T10:05:00.123456+00:00', undone_by: 'claude' }]).db, 'u')
    expect(JSON.stringify({ ok: true, ...r }).length).toBeLessThan(150)
  })
})
