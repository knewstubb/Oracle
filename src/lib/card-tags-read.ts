/**
 * Card Tags, read side: the shared read path for the collection Tag filter, Claude's search_collection and get_deck,
 * and (later) the card details redesign. Spec: docs/oracle/specs/deck-rail-strategy-tags.md section 4a.
 *
 * Tags are global (keyed by oracle_id, D-003) and read-only. Names and order come from the app's fixed list of 40
 * (card-tags.ts), never from the stored list. A failed read is `{ status: 'error' }`, never "no Tags".
 *
 * The database call is passed in as a TagRowReader so a screen route (session client) and the connector (read-only
 * client) use the same code. Reads are cached for a few minutes because Tags change only when the fill job runs.
 */
import { CARD_TAGS, type CardTagKind } from './card-tags'

export interface CardTag {
  key: string
  name: string
  kind: CardTagKind
}
export type TagMatch = 'all' | 'any'
export interface TagRow {
  oracle_id: string
  tag_key: string
}
export interface TagReadResult {
  data: TagRow[] | null
  error: unknown
}
/** The two reads this module needs. Both return rows of ref_card_tags (oracle_id, tag_key), one range at a time. */
export interface TagRowReader {
  byOracleIds(ids: string[], from: number, to: number): Promise<TagReadResult>
  byTagKey(key: string, from: number, to: number): Promise<TagReadResult>
}
export type CardTagsResult = { status: 'ok'; byOracleId: Map<string, CardTag[]> } | { status: 'error' }
export type TagIdsResult = { status: 'ok'; ids: Set<string> } | { status: 'error' }

export const TAG_ID_BATCH = 100 // oracle ids per read, so the request address stays short
export const TAG_PARALLEL = 4
export const TAG_PAGE = 1000 // the database returns at most 1,000 rows per read
const MAX_PAGES = 20 // the biggest Tag has about 4,900 cards; more than 20,000 rows is a fault, not a result
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX = 50_000

const ORDER = new Map(CARD_TAGS.map((t, i) => [t.key, i]))
const BY_KEY = new Map(CARD_TAGS.map((t) => [t.key, t]))

/** The 40 Tags in display order, as the read path returns them. */
export const ALL_TAGS: readonly CardTag[] = CARD_TAGS.map((t) => ({ key: t.key, name: t.displayName, kind: t.kind }))

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, '')
const BY_SQUASHED = new Map<string, CardTag>()
for (const t of ALL_TAGS) {
  BY_SQUASHED.set(squash(t.name), t)
  BY_SQUASHED.set(squash(t.key), t)
}
/** A Tag from its screen name or stored key (not case sensitive, spaces and punctuation ignored), or undefined. */
export function resolveTag(input: string): CardTag | undefined {
  return BY_SQUASHED.get(squash(input))
}

// ---- caches (Tags are the same for everyone, so no user in the key) ----
const cardCache = new Map<string, { at: number; tags: CardTag[] }>()
const tagIdCache = new Map<string, { at: number; ids: Set<string> }>()
/** Test hook. */
export function clearCardTagCaches(): void {
  cardCache.clear()
  tagIdCache.clear()
}

function toTags(keys: string[], warn: (key: string) => void): CardTag[] {
  const known: CardTag[] = []
  for (const k of new Set(keys)) {
    const def = BY_KEY.get(k)
    if (!def) {
      warn(k)
      continue
    }
    known.push({ key: def.key, name: def.displayName, kind: def.kind })
  }
  return known.sort((a, b) => ORDER.get(a.key)! - ORDER.get(b.key)!)
}

async function readPages(read: (from: number, to: number) => Promise<TagReadResult>): Promise<TagRow[]> {
  const out: TagRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await read(page * TAG_PAGE, page * TAG_PAGE + TAG_PAGE - 1)
    if (r.error || !Array.isArray(r.data)) throw new Error('tag read failed')
    out.push(...r.data)
    if (r.data.length < TAG_PAGE) return out
  }
  throw new Error('tag read returned more rows than allowed')
}

/**
 * Tags for each oracle id, in one batched read (100 ids a request, 4 requests at once). Every requested id is in the
 * answer: an empty list means "no Tag", `{ status: 'error' }` means "could not read" (never a partial answer).
 */
export async function getCardTags(reader: TagRowReader, oracleIds: string[]): Promise<CardTagsResult> {
  const wanted = [...new Set(oracleIds.filter(Boolean))]
  const byOracleId = new Map<string, CardTag[]>()
  const now = Date.now()
  const missing: string[] = []
  for (const id of wanted) {
    const hit = cardCache.get(id)
    if (hit && now - hit.at < CACHE_TTL_MS) byOracleId.set(id, hit.tags)
    else missing.push(id)
  }
  if (missing.length === 0) return { status: 'ok', byOracleId }
  try {
    const batches: string[][] = []
    for (let i = 0; i < missing.length; i += TAG_ID_BATCH) batches.push(missing.slice(i, i + TAG_ID_BATCH))
    const keysById = new Map<string, string[]>(missing.map((id) => [id, []]))
    for (let i = 0; i < batches.length; i += TAG_PARALLEL) {
      const got = await Promise.all(batches.slice(i, i + TAG_PARALLEL).map((b) => readPages((from, to) => reader.byOracleIds(b, from, to))))
      for (const row of got.flat()) keysById.get(row.oracle_id)?.push(row.tag_key)
    }
    const unknown = new Set<string>()
    const readAt = Date.now()
    if (cardCache.size > CACHE_MAX) cardCache.clear()
    for (const [id, keys] of keysById) {
      const tags = toTags(keys, (k) => unknown.add(k))
      byOracleId.set(id, tags)
      cardCache.set(id, { at: readAt, tags })
    }
    for (const k of unknown) console.warn(`card tags: stored Tag key "${k}" is not in the app's list; skipped`)
    return { status: 'ok', byOracleId }
  } catch {
    console.error(`card tags: read failed for ${wanted.length} card ids`)
    return { status: 'error' }
  }
}

async function idsForTag(reader: TagRowReader, key: string): Promise<Set<string>> {
  const hit = tagIdCache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ids
  const rows = await readPages((from, to) => reader.byTagKey(key, from, to))
  const ids = new Set(rows.map((r) => r.oracle_id))
  tagIdCache.set(key, { at: Date.now(), ids })
  return ids
}

/**
 * The oracle ids that have ALL (or ANY) of the given Tags. One read per Tag, followed page by page, then an
 * intersection or union here. Used by the collection filter and by Claude's search so both give the same cards.
 */
export async function oracleIdsWithTags(reader: TagRowReader, tagKeys: string[], mode: TagMatch): Promise<TagIdsResult> {
  const keys = [...new Set(tagKeys)]
  if (keys.length === 0 || keys.some((k) => !BY_KEY.has(k))) return { status: 'error' }
  try {
    const sets = await Promise.all(keys.map((k) => idsForTag(reader, k)))
    const out = new Set<string>()
    if (mode === 'any') {
      for (const s of sets) for (const id of s) out.add(id)
    } else {
      const [first, ...rest] = sets.sort((a, b) => a.size - b.size)
      for (const id of first) if (rest.every((s) => s.has(id))) out.add(id)
    }
    return { status: 'ok', ids: out }
  } catch {
    console.error(`card tags: filter read failed for ${keys.length} Tags`)
    return { status: 'error' }
  }
}

// ---- adapters ----
/** The small part of a Supabase client this module uses (session client in routes). */
interface Ordered {
  order(column: string): Ordered
  range(from: number, to: number): PromiseLike<TagReadResult>
}
interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: unknown[]): Ordered
      eq(column: string, value: unknown): Ordered
    }
  }
}
/** Stable order so paging by range never repeats or skips a row. */
export function supabaseTagReader(client: unknown): TagRowReader {
  const c = client as SupabaseLike
  const table = () => c.from('ref_card_tags').select('oracle_id, tag_key')
  return {
    byOracleIds: async (ids, from, to) => table().in('oracle_id', ids).order('oracle_id').order('tag_key').range(from, to),
    byTagKey: async (key, from, to) => table().eq('tag_key', key).order('oracle_id').range(from, to),
  }
}
