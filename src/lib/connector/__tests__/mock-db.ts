import type { QueryResult, ReadOnlyDb, ReadQuery } from '../user-client'

export interface RecordedQuery {
  table: string
  columns: string
  opts?: { count?: 'exact'; head?: boolean }
  filters: { op: string; args: unknown[] }[]
}

export type Resolver = (q: RecordedQuery) => Partial<QueryResult> | Promise<Partial<QueryResult>>

/** Chainable mock of the read-only db. Records every query so tests can assert .eq('user_id', ...) on all of them. */
export function mockDb(resolve: Resolver): { db: ReadOnlyDb; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = []
  const db: ReadOnlyDb = {
    select(table, columns, opts) {
      const rec: RecordedQuery = { table, columns, opts, filters: [] }
      queries.push(rec)
      const chain: Record<string, unknown> = {}
      for (const op of ['eq', 'in', 'ilike', 'is', 'not', 'order', 'range', 'limit', 'gte', 'lte', 'contains', 'overlaps']) {
        chain[op] = (...args: unknown[]) => {
          rec.filters.push({ op, args })
          return chain
        }
      }
      chain.then = (onOk: (v: QueryResult) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(resolve(rec)).then((r) => ({ data: null, error: null, ...r }) as QueryResult).then(onOk, onErr)
      return chain as unknown as ReadQuery
    },
  }
  return { db, queries }
}

export function hasEq(q: RecordedQuery, col: string, value: unknown): boolean {
  return q.filters.some((f) => f.op === 'eq' && f.args[0] === col && f.args[1] === value)
}

export function rangeOf(q: RecordedQuery): [number, number] | null {
  const f = q.filters.find((x) => x.op === 'range')
  return f ? [f.args[0] as number, f.args[1] as number] : null
}
