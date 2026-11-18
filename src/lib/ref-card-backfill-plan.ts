/**
 * CC-14 / FEAT-002: planning, guards, apply and rollback logic for the prepared ref_cards backfill.
 * All database and Scryfall access goes through the interfaces below so tests inject fakes.
 * The runnable script is supabase/drafts/cc14-backfill-ref-cards.ts (NOT applied; needs owner approval).
 */
import {
  mapScryfallToRefCard,
  normaliseTypeLineSubtypes,
  type RefCardRow,
  type ScryfallCard,
} from './ref-card-backfill'

export interface OwnedCard {
  name: string
  oracleId: string | null
}

export interface LibraryTextRow {
  name: string
  type_line: string
  oracle_text: string | null
}

/** Everything the plan needs from the database. Reads first, writes last. */
export interface BackfillDb {
  /** Owner's cards (user_cards) that have no ref_cards row. */
  readOwnedCardsWithoutLibraryRow(userId: string): Promise<OwnedCard[]>
  /** ref_cards rows named 'A // B' whose oracle_text is null. */
  readSlashRowsWithoutText(): Promise<LibraryTextRow[]>
  /** ref_cards names equal to a front face or starting 'Front // ' (name-mismatch candidates). */
  findFrontFaceMatches(fronts: string[]): Promise<string[]>
  /** oracle_id by card name from ref_printings (first printing found). */
  readOracleIdsByName(names: string[]): Promise<Map<string, string>>
  /** Inserts rows, ignoring any whose name already exists. Returns the names actually inserted. */
  insertIgnoringExisting(rows: RefCardRow[]): Promise<string[]>
  /** Sets oracle_text and type_line only where oracle_text is currently null. Returns whether a row changed. */
  updateWhereTextNull(name: string, patch: { oracle_text: string | null; type_line: string }): Promise<boolean>
  deleteByNames(names: string[]): Promise<void>
  restoreText(name: string, previous: { oracle_text: string | null; type_line: string }): Promise<void>
}

export interface ScryfallLookup {
  found: ScryfallCard[]
  notFound: string[]
}
/** Fetches cards by oracle_id (real implementation batches 75 per call, 100 ms apart). */
export type FetchScryfallByOracleId = (oracleIds: string[]) => Promise<ScryfallLookup>

export type Cause = 'no row, single-faced' | 'no row, two-faced' | 'library row with no text'

export interface PlannedInsert {
  name: string
  cause: Cause
  row: RefCardRow
}
export interface PlannedUpdate {
  name: string
  before: { oracle_text: string | null; type_line: string }
  after: { oracle_text: string | null; type_line: string }
}

export interface BackfillPlan {
  countsByCause: Record<Cause, number>
  inserts: PlannedInsert[]
  updates: PlannedUpdate[]
  /** Reported, never guessed. */
  errors: string[]
  /** ref_cards rows that look like the same card under a different name. Expected empty. */
  nameMismatchCandidates: string[]
}

const SLASH = ' // '

export async function buildPlan(
  db: BackfillDb,
  fetchScryfall: FetchScryfallByOracleId,
  userId: string,
): Promise<BackfillPlan> {
  const errors: string[] = []
  const missing = await db.readOwnedCardsWithoutLibraryRow(userId)
  const slashRows = await db.readSlashRowsWithoutText()

  const countsByCause: Record<Cause, number> = {
    'no row, single-faced': 0,
    'no row, two-faced': 0,
    'library row with no text': slashRows.length,
  }
  for (const m of missing) {
    countsByCause[m.name.includes(SLASH) ? 'no row, two-faced' : 'no row, single-faced']++
  }

  const fronts = missing.filter(m => m.name.includes(SLASH)).map(m => m.name.split(SLASH)[0])
  const nameMismatchCandidates = fronts.length ? await db.findFrontFaceMatches(fronts) : []

  // Resolve oracle_ids: owner's rows carry them; library rows come from ref_printings.
  const wanted = new Map<string, { cause: Cause; oracleId: string }>()
  for (const m of missing) {
    if (!m.oracleId) {
      errors.push(`${m.name}: owned card has no oracle_id, skipped`)
      continue
    }
    wanted.set(m.name, {
      cause: m.name.includes(SLASH) ? 'no row, two-faced' : 'no row, single-faced',
      oracleId: m.oracleId,
    })
  }
  const slashByName = new Map(slashRows.map(r => [r.name, r]))
  const printingIds = slashRows.length ? await db.readOracleIdsByName(slashRows.map(r => r.name)) : new Map<string, string>()
  const slashWanted = new Map<string, string>()
  for (const r of slashRows) {
    const id = printingIds.get(r.name)
    if (!id) errors.push(`${r.name}: no printing found to read oracle_id from, skipped`)
    else slashWanted.set(r.name, id)
  }

  const ids = Array.from(new Set([...Array.from(wanted.values()).map(w => w.oracleId), ...Array.from(slashWanted.values())]))
  const lookup = ids.length ? await fetchScryfall(ids) : { found: [], notFound: [] }
  for (const id of lookup.notFound) errors.push(`Scryfall did not find oracle_id ${id}, skipped`)
  const byOracleId = new Map<string, ScryfallCard>()
  for (const c of lookup.found) if (c.oracle_id) byOracleId.set(c.oracle_id, c)

  const inserts: PlannedInsert[] = []
  for (const [name, w] of Array.from(wanted)) {
    const card = byOracleId.get(w.oracleId)
    if (!card) {
      if (!lookup.notFound.includes(w.oracleId)) errors.push(`${name}: Scryfall returned no card for oracle_id ${w.oracleId}, skipped`)
      continue
    }
    try {
      const row = mapScryfallToRefCard(card, w.oracleId)
      if (row.name !== name) {
        errors.push(`${name}: Scryfall name is "${row.name}", not inserted (name must match the owned card exactly)`)
        continue
      }
      inserts.push({ name, cause: w.cause, row })
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}, skipped`)
    }
  }

  const updates: PlannedUpdate[] = []
  for (const [name, id] of Array.from(slashWanted)) {
    const card = byOracleId.get(id)
    const current = slashByName.get(name)!
    if (!card) {
      if (!lookup.notFound.includes(id)) errors.push(`${name}: Scryfall returned no card for oracle_id ${id}, skipped`)
      continue
    }
    try {
      const row = mapScryfallToRefCard(card, id)
      if (row.name !== name) {
        errors.push(`${name}: Scryfall name is "${row.name}", not updated`)
        continue
      }
      const after = { oracle_text: row.oracle_text, type_line: row.type_line }
      const before = { oracle_text: current.oracle_text, type_line: current.type_line }
      if (after.oracle_text === before.oracle_text && after.type_line === before.type_line) continue
      updates.push({ name, before, after })
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}, skipped`)
    }
  }

  return { countsByCause, inserts, updates, errors, nameMismatchCandidates }
}

export function formatPlan(plan: BackfillPlan): string {
  const lines: string[] = ['DRY RUN: nothing is written.', '']
  lines.push('Counts by cause:')
  for (const [cause, n] of Object.entries(plan.countsByCause)) lines.push(`  ${cause}: ${n}`)
  lines.push(`Name-mismatch candidates (expected 0): ${plan.nameMismatchCandidates.length}`)
  for (const n of plan.nameMismatchCandidates) lines.push(`  ${n}`)
  lines.push('', `Inserts (${plan.inserts.length}):`)
  for (const i of plan.inserts) lines.push(`  + ${i.name} | ${i.row.type_line} | ${i.cause}`)
  lines.push('', `Updates (${plan.updates.length}):`)
  for (const u of plan.updates) {
    lines.push(`  ~ ${u.name}`)
    lines.push(`      type_line:   ${u.before.type_line}  =>  ${u.after.type_line}`)
    lines.push(`      oracle_text: ${JSON.stringify(u.before.oracle_text)}  =>  ${JSON.stringify(u.after.oracle_text)}`)
  }
  lines.push('', `Errors (${plan.errors.length}):`)
  for (const e of plan.errors) lines.push(`  ! ${e}`)
  lines.push('', `Totals: ${plan.inserts.length} rows inserted, ${plan.updates.length} rows updated, ${plan.errors.length} reported errors.`)
  return lines.join('\n')
}

export interface Manifest {
  generatedAt: string
  /** 'dry-run' manifests list planned changes and can never be rolled back. */
  mode: 'dry-run' | 'apply'
  inserted: string[]
  updated: Array<{ name: string; previous_oracle_text: string | null; previous_type_line: string }>
}

export function planToManifest(plan: BackfillPlan, mode: Manifest['mode'], now = new Date()): Manifest {
  return {
    generatedAt: now.toISOString(),
    mode,
    inserted: plan.inserts.map(i => i.name),
    updated: plan.updates.map(u => ({
      name: u.name,
      previous_oracle_text: u.before.oracle_text,
      previous_type_line: u.before.type_line,
    })),
  }
}

export interface GuardInput {
  apply: boolean
  live: boolean
  /** True when --env-file (a throwaway database env file) was passed. */
  envFileGiven: boolean
  env: Record<string, string | undefined>
}

/** Returns null when a write is allowed, else the reason it is refused. Used for --apply and --rollback. */
export function writeRefusal(g: GuardInput, what: '--apply' | '--rollback' = '--apply'): string | null {
  if (!g.apply) return `${what} was not given`
  if (g.env.CC14_OWNER_APPROVED !== 'yes') return `${what} refused: CC14_OWNER_APPROVED=yes is not set (owner approval needed)`
  const throwaway = g.env.TEST_DB_CONFIRMED === 'yes' && g.envFileGiven
  if (!throwaway && !g.live) {
    return `${what} refused: needs TEST_DB_CONFIRMED=yes with a throwaway database passed by --env-file, or the --live flag`
  }
  return null
}

export async function applyPlan(db: BackfillDb, plan: BackfillPlan, now = new Date()): Promise<Manifest> {
  const inserted = plan.inserts.length ? await db.insertIgnoringExisting(plan.inserts.map(i => i.row)) : []
  const updated: Manifest['updated'] = []
  for (const u of plan.updates) {
    const changed = await db.updateWhereTextNull(u.name, u.after)
    if (changed) {
      updated.push({ name: u.name, previous_oracle_text: u.before.oracle_text, previous_type_line: u.before.type_line })
    }
  }
  return { generatedAt: now.toISOString(), mode: 'apply', inserted, updated }
}

export async function rollbackManifest(db: BackfillDb, manifest: Manifest): Promise<void> {
  if (manifest.mode !== 'apply') throw new Error('Only a manifest written by --apply can be rolled back (this one is a dry run).')
  if (manifest.inserted.length) await db.deleteByNames(manifest.inserted)
  for (const u of manifest.updated) {
    await db.restoreText(u.name, { oracle_text: u.previous_oracle_text, type_line: u.previous_type_line })
  }
}

/** Re-exported so the script and tests share one definition of "library style". */
export { normaliseTypeLineSubtypes }
