// User-scoped, read-only database handle for tool code. Contract section 4 step 6 and section 7.3.
// Built from the anon key plus the caller's own token, so row-level security applies. It exposes `select` only:
// no insert, update, upsert, delete or rpc.
import { createClient } from '@supabase/supabase-js'

export interface QueryResult {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

/** The chainable read query a tool may build. Every tool query must carry .eq('user_id', userId). */
export interface ReadQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): ReadQuery
  in(column: string, values: unknown[]): ReadQuery
  ilike(column: string, pattern: string): ReadQuery
  is(column: string, value: null): ReadQuery
  not(column: string, op: string, value: unknown): ReadQuery
  order(column: string, opts?: { ascending?: boolean }): ReadQuery
  range(from: number, to: number): ReadQuery
  limit(n: number): ReadQuery
}

export interface ReadOnlyDb {
  select(table: string, columns: string, opts?: { count?: 'exact'; head?: boolean }): ReadQuery
}

export function createUserScopedClient(token: string): ReadOnlyDb {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing Supabase environment variables')
  const client = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return {
    select: (table, columns, opts) => client.from(table).select(columns, opts) as unknown as ReadQuery,
  }
}

export interface ToolContext {
  db: ReadOnlyDb
  userId: string // the verified `sub`. The only source of a user id.
}
