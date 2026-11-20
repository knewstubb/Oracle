/** Test helper: a chainable fake of the Supabase query builder. Every query ends in `resolve(call)`. */
export interface FakeCall {
  table: string
  op: 'select' | 'update'
  columns?: string
  values?: unknown
  filters: Array<[string, string, unknown]>
}
export type FakeResult = { data: unknown; error: { message: string; code?: string } | null }

export function fakeClient(resolve: (call: FakeCall) => FakeResult, log: FakeCall[] = []) {
  function builder(table: string) {
    const call: FakeCall = { table, op: 'select', filters: [] }
    const run = () => {
      log.push(call)
      return resolve(call)
    }
    const b: Record<string, unknown> = {}
    const chain = (name: string, fn?: (...a: unknown[]) => void) => {
      b[name] = (...a: unknown[]) => {
        fn?.(...a)
        return b
      }
    }
    chain('select', (cols) => {
      if (call.op === 'select') call.columns = cols as string
    })
    chain('update', (v) => {
      call.op = 'update'
      call.values = v
    })
    for (const f of ['eq', 'in', 'ilike', 'is']) chain(f, (col, val) => call.filters.push([f, col as string, val]))
    for (const f of ['order', 'limit']) chain(f)
    b.maybeSingle = () => {
      const r = run()
      const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data
      return Promise.resolve({ ...r, data: d })
    }
    b.then = (ok: (v: FakeResult) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
    return b
  }
  return { from: (table: string) => builder(table), rpc: () => Promise.resolve({ data: null, error: null }) }
}
