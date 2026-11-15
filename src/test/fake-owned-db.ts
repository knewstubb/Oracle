/**
 * Small in-memory Supabase stand-in for owner-check route tests (mock-only, no database).
 * Handles select (with optional head count), update, eq, order, limit, maybeSingle, single.
 */
type Row = Record<string, unknown>

export function fakeOwnedDb(tables: Record<string, Row[]>) {
  const client = {
    from(table: string) {
      let filters: Array<(r: Row) => boolean> = []
      let mode: 'select' | 'update' = 'select'
      let payload: Row = {}
      let head = false
      let lim: number | undefined
      const run = () => {
        const all = (tables[table] ??= [])
        const hit = all.filter((r) => filters.every((f) => f(r)))
        if (mode === 'update') {
          for (const r of hit) Object.assign(r, payload)
        }
        const data = (lim ? hit.slice(0, lim) : hit).map((r) => ({ ...r }))
        return { data: head ? null : data, count: hit.length, error: null }
      }
      const q: Record<string, unknown> = {
        select: (_cols?: string, opts?: { head?: boolean }) => {
          if (opts?.head) head = true
          return q
        },
        update: (p: Row) => {
          mode = 'update'
          payload = p
          return q
        },
        eq: (col: string, v: unknown) => {
          filters = [...filters, (r) => r[col] === v]
          return q
        },
        order: () => q,
        limit: (n: number) => {
          lim = n
          return q
        },
        maybeSingle: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
        single: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      }
      return q
    },
  }
  return { client, tables }
}
