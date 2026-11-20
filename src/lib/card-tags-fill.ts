/**
 * The fill job's logic with the database injected, so it can be tested without one.
 * scripts/fill-card-tags.ts wires it to the hosted database (service role) or to a throwaway local Postgres.
 *
 * Properties the tests check:
 * - Idempotent: a second run writes nothing new (rows are inserted with "on conflict do nothing").
 * - One run id per run; every row it adds carries it; --undo-run removes exactly those rows.
 * - Writes are batched.
 */
import {
  CARD_TAG_KEYS,
  buildCardTagRows,
  buildDryRunReport,
  computeTagCards,
  type CardTagRow,
  type CardTagSource,
  type DryRunReport,
  type ScryfallTagIndex,
} from './card-tags'

export const FILL_SOURCE: CardTagSource = 'scryfall'
export const FILL_BATCH_SIZE = 1000

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: string): boolean {
  return UUID_RE.test(v)
}

export interface TagStore {
  /** oracle_ids of every card with at least one printing legal in Commander. Read only. */
  loadLegalOracleIds(): Promise<string[]>
  /** oracle_ids in one user's collection. Read only. */
  loadCollectionOracleIds(userId: string): Promise<string[]>
  /** Keys in the stored Tag list (ref_tag_list). Read only. */
  loadTagListKeys(): Promise<string[]>
  /** Insert rows with "on conflict do nothing". Returns how many were new. */
  insertRows(rows: readonly CardTagRow[], source: CardTagSource, runId: string): Promise<number>
  /** Delete every row of one run. Returns how many were removed. */
  deleteRun(runId: string): Promise<number>
  /** Total rows in ref_card_tags. */
  countRows(): Promise<number>
}

export interface FillArgs {
  dryRun: boolean
  undoRun: string | null
  runId: string | null
  userId: string | null
  psqlUrl: string | null
  tagsFile: string
}

export const DEFAULT_TAGS_FILE = 'data/scryfall-tags/oracle-tags.jsonl'

/** Parse command line arguments. Throws a plain message on a bad option. */
export function parseFillArgs(argv: readonly string[]): FillArgs {
  const a: FillArgs = { dryRun: false, undoRun: null, runId: null, userId: null, psqlUrl: null, tagsFile: DEFAULT_TAGS_FILE }
  const value = (i: number, name: string): string => {
    const v = argv[i + 1]
    if (!v || v.startsWith('--')) throw new Error(`${name} needs a value`)
    return v
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') a.dryRun = true
    else if (arg === '--undo-run') a.undoRun = value(i++, arg)
    else if (arg === '--run-id') a.runId = value(i++, arg)
    else if (arg === '--user') a.userId = value(i++, arg)
    else if (arg === '--psql-url') a.psqlUrl = value(i++, arg)
    else if (arg === '--tags-file') a.tagsFile = value(i++, arg)
    else throw new Error(`Unknown option ${arg}`)
  }
  if (a.undoRun && !isUuid(a.undoRun)) throw new Error('--undo-run needs a run id (a UUID)')
  if (a.runId && !isUuid(a.runId)) throw new Error('--run-id needs a UUID')
  if (a.userId && !isUuid(a.userId)) throw new Error('--user needs a UUID')
  if (a.undoRun && a.dryRun) throw new Error('--undo-run and --dry-run cannot be used together')
  return a
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function toUuidSet(ids: readonly string[]): Set<string> {
  const s = new Set<string>()
  for (const id of ids) if (id && isUuid(id)) s.add(id.toLowerCase())
  return s
}

export interface FillResult {
  report: DryRunReport
  runId: string | null
  rowsPlanned: number
  rowsInserted: number
}

/**
 * Plan (and, unless dryRun, write) the card-Tag rows for every Commander-legal card in the library.
 * Reads only when dryRun is true.
 */
export async function runFill(
  store: TagStore,
  index: ScryfallTagIndex,
  opts: { dryRun: boolean; runId: string; userId: string | null; scryfallCopyDate: string | null }
): Promise<FillResult> {
  const library = toUuidSet(await store.loadLegalOracleIds())
  // The collection is compared on its Commander-legal cards only, like the frequency report.
  const owned = opts.userId ? toUuidSet(await store.loadCollectionOracleIds(opts.userId)) : null
  const collection = owned ? new Set([...owned].filter(id => library.has(id))) : null
  const rows = buildCardTagRows(computeTagCards(index), library)
  const report = buildDryRunReport(rows, library, collection, opts.scryfallCopyDate)
  if (opts.dryRun) return { report, runId: null, rowsPlanned: rows.length, rowsInserted: 0 }

  const stored = [...(await store.loadTagListKeys())].sort()
  const expected = [...CARD_TAG_KEYS].sort()
  if (stored.length !== expected.length || stored.some((k, i) => k !== expected[i])) {
    throw new Error(`The stored Tag list (ref_tag_list) does not match the 40 Tags in code (found ${stored.length}). Apply the approved draft first.`)
  }
  let inserted = 0
  for (const batch of chunk(rows, FILL_BATCH_SIZE)) inserted += await store.insertRows(batch, FILL_SOURCE, opts.runId)
  return { report, runId: opts.runId, rowsPlanned: rows.length, rowsInserted: inserted }
}

