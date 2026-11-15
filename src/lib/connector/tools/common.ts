// Shared helpers for read-only connector tools. Every query a tool builds carries .eq('user_id', ctx.userId).
import type { ConnectorErrorBody } from '../errors'
import { errorBody, MESSAGES } from '../errors'
import type { QueryResult, ReadQuery, ToolContext } from '../user-client'

export type { ToolContext }
export type ToolOutput = ({ ok: true } & Record<string, unknown>) | ConnectorErrorBody

export class LookupFailed extends Error {}

export function lookupFailed(): ConnectorErrorBody {
  return errorBody('LOOKUP_FAILED', MESSAGES.LOOKUP_FAILED, true)
}

export function notFound(): ConnectorErrorBody {
  return errorBody('NOT_FOUND', MESSAGES.NOT_FOUND)
}

export function tooLarge(): ConnectorErrorBody {
  return errorBody('TOO_LARGE', MESSAGES.TOO_LARGE)
}

/** Await a query; a database error is thrown as LookupFailed, never turned into an empty result (D-030). */
export async function must(q: PromiseLike<QueryResult>): Promise<QueryResult> {
  let r: QueryResult
  try {
    r = await q
  } catch {
    throw new LookupFailed()
  }
  if (r.error) throw new LookupFailed()
  return r
}

export function rows<T>(r: QueryResult): T[] {
  return Array.isArray(r.data) ? (r.data as T[]) : []
}

const PAGE = 1000
const MAX_PAGES = 20
const IN_CHUNK = 150

/** Read every row of a query by paging with range(), so PostgREST's row cap never silently shortens a result. */
export async function fetchAll<T>(build: () => ReadQuery): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await must(build().range(page * PAGE, page * PAGE + PAGE - 1))
    const got = rows<T>(r)
    out.push(...got)
    if (got.length < PAGE) return out
  }
  throw new LookupFailed() // more rows than we are willing to read: fail loudly, not quietly short
}

/** Same as fetchAll, for an `in` list, chunked so the request address stays short. */
export async function fetchAllIn<T>(
  ctx: ToolContext,
  table: string,
  columns: string,
  column: string,
  ids: unknown[],
  refine?: (q: ReadQuery) => ReadQuery,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    out.push(
      ...(await fetchAll<T>(() => {
        const q = ctx.db.select(table, columns).eq('user_id', ctx.userId).in(column, chunk)
        return refine ? refine(q) : q
      })),
    )
  }
  return out
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function pageNote(total: number, offset: number, returned: number, byteCut: boolean): { truncated: boolean; note?: string } {
  const more = offset + returned < total
  if (!more && !byteCut) return { truncated: false }
  const next = offset + returned
  const why = byteCut ? ' The answer was shortened to stay a readable size.' : ''
  return {
    truncated: true,
    note: `Showing ${returned} of ${total}.${why} Ask for the next page with offset ${next}.`,
  }
}
