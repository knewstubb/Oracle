/**
 * Tiny in-memory Supabase stand-in for tests (mock-only, no database). Supports the calls the commander code uses:
 * from().select().eq().in().limit().maybeSingle()/single() and from().update().eq().eq(), awaited directly.
 */
type Row = Record<string, unknown>

export function fakeSupabase(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; payload: Row }> = []
  const client = {
    // Used by routes that call set_deck_command_zone: answers as if it worked.
    rpc: async (_name: string, args: Row) => ({ data: { deck_id: args.p_deck_id }, error: null }),
    from(table: string) {
      const rows = () => (tables[table] ??= [])
      let filters: Array<(r: Row) => boolean> = []
      let mode: 'select' | 'update' = 'select'
      let payload: Row = {}
      const run = () => {
        const hit = rows().filter((r) => filters.every((f) => f(r)))
        if (mode === 'update') {
          writes.push({ table, payload })
          for (const r of hit) Object.assign(r, payload)
          return { data: null, error: null }
        }
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      const q: Record<string, unknown> = {
        select: () => q,
        update: (p: Row) => {
          mode = 'update'
          payload = p
          return q
        },
        eq: (col: string, v: unknown) => {
          filters = [...filters, (r) => r[col] === v]
          return q
        },
        in: (col: string, vs: unknown[]) => {
          filters = [...filters, (r) => vs.includes(r[col])]
          return q
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
        single: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
      }
      return q
    },
  }
  return { client, tables, writes }
}
