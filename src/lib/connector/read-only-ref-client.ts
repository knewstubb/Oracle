// A read-only view of the card library tables for code written against the app's wider client shape
// (fetchRefTextByName, getCommanderTargets). Built on the connector's select-only handle, so it cannot write.
// Only shared reference tables (ref_*) are reachable through it; user tables are never read this way, because
// those queries must carry the owner's user id (contract section 6).
import type { RefClient } from '../ref-card-text'
import type { QueryResult, ReadOnlyDb, ReadQuery } from './user-client'

export interface RefReadQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): RefReadQuery
  in(column: string, values: unknown[]): RefReadQuery
  ilike(column: string, pattern: string): RefReadQuery
  limit(n: number): RefReadQuery
  maybeSingle(): Promise<{ data: unknown; error: { message: string } | null }>
}

function wrap(q: ReadQuery): RefReadQuery {
  return {
    eq: (c, v) => wrap(q.eq(c, v)),
    in: (c, v) => wrap(q.in(c, v)),
    ilike: (c, p) => wrap(q.ilike(c, p)),
    limit: (n) => wrap(q.limit(n)),
    maybeSingle: async () => {
      const r = await q.limit(1)
      const first = Array.isArray(r.data) ? (r.data[0] ?? null) : null
      return { data: first, error: r.error }
    },
    then: (onOk, onErr) => q.then(onOk, onErr),
  }
}

export function readOnlyRefClient(db: ReadOnlyDb): RefClient {
  return {
    from: (table: string) => {
      if (!table.startsWith('ref_')) throw new Error(`readOnlyRefClient only reads card library tables, not ${table}`)
      // No write methods exist here: a caller that tries to save (for example the commander-numbers cache) gets a TypeError
      // that the caller already treats as "could not save", and nothing is stored.
      return { select: (columns: string) => wrap(db.select(table, columns)) }
    },
  }
}
