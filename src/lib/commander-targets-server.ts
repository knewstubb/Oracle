/**
 * Commander targets, server side: the cache table, the refresh rules and the stale rule.
 * Contract: docs/oracle/contracts/deck-health-phase2.md, sections 1.4 to 1.8.
 *
 * - Lazy only: a commander is looked up when one of its decks is checked. No background job, no bulk fetching.
 * - A saved row is used while fresh (14 days when ok, 7 days when thin or not found, and the same role rules).
 * - One refresh per commander at a time in this process; EDHREC requests are spaced by the client.
 * - Network failures are never saved. On a failed refresh the last saved row is served marked "may be out of date";
 *   with nothing saved, the general guide labelled "General guide (couldn't reach EDHREC)".
 * - If the cache table cannot be read or written (for example before its migration is applied), the numbers are
 *   still worked out live; nothing is saved.
 */

import {
  commanderSlug,
  getAverageDeck,
  getCommanderPage,
  type EdhrecAverageDeck,
  type EdhrecCommanderPage,
  type EdhrecFetch,
} from './edhrec-client'
import { fetchRefTextByName, type RefClient } from './ref-card-text'
import {
  GUIDE_LABEL,
  GUIDE_UNREACHABLE_LABEL,
  NO_BUILDS_LABEL,
  deriveEstimate,
  deriveFromAverageDeck,
  guideTargets,
  isRowFresh,
  rowFromAverage,
  rowFromEstimate,
  rowNotFound,
  targetsFromRow,
  type CommanderTargets,
  type RefLookup,
  type TargetsRow,
  type TypeCount,
  type TypeCountsWithLabel,
} from './commander-targets'
import { CLASSIFIER_VERSION } from './card-roles'

export const TARGETS_TABLE = 'ref_commander_role_targets'
/** POST …/health/recheck may refresh a commander at most once an hour (contract 1.8). */
export const RECHECK_MIN_GAP_MS = 60 * 60 * 1000

export interface EdhrecSource {
  getAverageDeck: (slug: string) => Promise<EdhrecFetch<EdhrecAverageDeck>>
  getCommanderPage: (slug: string) => Promise<EdhrecFetch<EdhrecCommanderPage>>
}

export interface TargetsDeps {
  supabase: RefClient
  /** Tests pass saved fixtures here. Default: the live EDHREC client. */
  edhrec?: EdhrecSource
  now?: () => Date
  log?: (message: string) => void
}

export interface TargetsOptions {
  /** Called from POST …/health/recheck. */
  recheck?: boolean
}

type RefreshOutcome = { kind: 'row'; row: TargetsRow; save: boolean } | { kind: 'unreachable'; reason: string }

const inflight = new Map<string, Promise<RefreshOutcome>>()
const lastRecheckRefresh = new Map<string, number>()

/** Test helper: forget in-process state (single-flight and the recheck limit). */
export function resetTargetsProcessState(): void {
  inflight.clear()
  lastRecheckRefresh.clear()
}

const liveEdhrec: EdhrecSource = { getAverageDeck: (s) => getAverageDeck(s), getCommanderPage: (s) => getCommanderPage(s) }

// ---------------------------------------------------------------------------
// Cache table
// ---------------------------------------------------------------------------

async function readRow(supabase: RefClient, slug: string, log: (m: string) => void): Promise<TargetsRow | null> {
  try {
    const { data, error } = await supabase.from(TARGETS_TABLE).select('*').eq('edhrec_slug', slug).maybeSingle()
    if (error) {
      log(`[commander-targets] could not read saved targets for ${slug}: ${error.message}`)
      return null
    }
    return (data as TargetsRow | null) ?? null
  } catch (err) {
    log(`[commander-targets] could not read saved targets for ${slug}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

async function saveRow(supabase: RefClient, row: TargetsRow, log: (m: string) => void): Promise<void> {
  try {
    const { error } = await supabase.from(TARGETS_TABLE).upsert(row, { onConflict: 'edhrec_slug' })
    if (error) log(`[commander-targets] could not save targets for ${row.edhrec_slug}: ${error.message}`)
  } catch (err) {
    log(`[commander-targets] could not save targets for ${row.edhrec_slug}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ---------------------------------------------------------------------------
// Stored builds (type counts, and the land fallback for the estimate)
// ---------------------------------------------------------------------------

const BUILD_COLUMNS: Array<[TypeCount['type'], string]> = [
  ['creature', 'avg_creatures'],
  ['instant', 'avg_instants'],
  ['sorcery', 'avg_sorceries'],
  ['artifact', 'avg_artifacts'],
  ['enchantment', 'avg_enchantments'],
  ['planeswalker', 'avg_planeswalkers'],
  ['land', 'avg_lands'],
]

/** Means over `ref_commander_builds` for the commander(s), found by name through `ref_commanders` (1.6). Never throws. */
export async function storedBuildTypeCounts(supabase: RefClient, commanderNames: string[]): Promise<TypeCountsWithLabel> {
  const none = { typeCounts: [], label: NO_BUILDS_LABEL }
  try {
    const names = [...new Set(commanderNames.flatMap((n) => [n, n.split(' // ')[0].trim()]))]
    if (names.length === 0) return none
    const { data: cmds, error } = await supabase.from('ref_commanders').select('id').in('display_name', names)
    if (error || !cmds || cmds.length === 0) return none
    const ids = (cmds as Array<{ id: string }>).map((c) => c.id)
    const { data: builds, error: bErr } = await supabase
      .from('ref_commander_builds')
      .select(BUILD_COLUMNS.map(([, col]) => col).join(', '))
      .in('commander_id', ids)
    if (bErr || !builds || builds.length === 0) return none
    const rows = builds as Array<Record<string, number | null>>
    const typeCounts: TypeCount[] = []
    for (const [type, col] of BUILD_COLUMNS) {
      const vals = rows.map((r) => r[col]).filter((v): v is number => typeof v === 'number')
      if (vals.length > 0) typeCounts.push({ type, average: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 })
    }
    if (typeCounts.length === 0) return none
    return { typeCounts, label: `Averages from ${rows.length} stored build${rows.length === 1 ? '' : 's'}` }
  } catch {
    return none
  }
}

// ---------------------------------------------------------------------------
// Refresh: (A) average deck, else (B) estimate
// ---------------------------------------------------------------------------

async function refLookup(supabase: RefClient, names: string[]): Promise<RefLookup> {
  const { map, error } = await fetchRefTextByName(supabase, names)
  if (error) throw new Error(`Could not read card text: ${error}`)
  return (n) => {
    const r = map.get(n)
    return r ? { typeLine: r.type_line, oracleText: r.oracle_text } : undefined
  }
}

async function attempt<T>(fn: () => Promise<EdhrecFetch<T>>): Promise<EdhrecFetch<T> | { status: 'unreachable'; reason: string }> {
  try {
    return await fn()
  } catch (err) {
    return { status: 'unreachable', reason: err instanceof Error ? err.message : String(err) }
  }
}

async function refresh(deps: Required<Pick<TargetsDeps, 'supabase' | 'edhrec'>>, slug: string, commanderNames: string[], now: Date): Promise<RefreshOutcome> {
  const { supabase, edhrec } = deps
  const name = commanderNames.join(' + ')

  const avg = await attempt(() => edhrec.getAverageDeck(slug))
  let thinFromAverage: TargetsRow | null = null
  if (avg.status === 'ok') {
    const ref = await refLookup(supabase, avg.data.cards.map((c) => c.name))
    const d = deriveFromAverageDeck(avg.data, ref)
    if (d.qualifies) return { kind: 'row', row: rowFromAverage(slug, name, d, now), save: true }
    thinFromAverage = { ...rowNotFound(slug, name, now, d.typeCounts), status: 'thin', source: 'edhrec_average', deck_sample: d.deckSample, cards_used: d.nonLandCount - d.missing }
  }

  const page = await attempt(() => edhrec.getCommanderPage(slug))
  if (page.status === 'unreachable') return { kind: 'unreachable', reason: page.reason }
  if (page.status === 'not_found') {
    if (avg.status === 'unreachable') return { kind: 'unreachable', reason: avg.reason }
    return { kind: 'row', row: thinFromAverage ?? rowNotFound(slug, name, now), save: true }
  }

  let fallbackLands: number | null = null
  if (typeof page.data.typeCounts.land !== 'number') {
    const builds = await storedBuildTypeCounts(supabase, commanderNames)
    fallbackLands = builds.typeCounts.find((t) => t.type === 'land')?.average ?? null
  }
  const ref = await refLookup(supabase, page.data.cards.map((c) => c.name))
  const d = deriveEstimate(page.data, ref, fallbackLands)
  // When the average deck could not be fetched (network), the estimate is served but not saved, so the
  // average deck is tried again next time instead of being hidden behind a saved estimate for 14 days.
  return { kind: 'row', row: rowFromEstimate(slug, name, d, now), save: avg.status !== 'unreachable' }
}

function refreshOnce(deps: Required<Pick<TargetsDeps, 'supabase' | 'edhrec'>>, slug: string, names: string[], now: Date): Promise<RefreshOutcome> {
  const running = inflight.get(slug)
  if (running) return running
  const p = refresh(deps, slug, names, now).finally(() => inflight.delete(slug))
  inflight.set(slug, p)
  return p
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function answerFromRow(supabase: RefClient, row: TargetsRow, stale: boolean, names: string[]): Promise<CommanderTargets> {
  const builds = row.type_counts.length > 0 ? undefined : await storedBuildTypeCounts(supabase, names)
  return targetsFromRow(row, stale, builds)
}

/**
 * The typical numbers for a deck's commander(s). Never throws for EDHREC trouble (that gives the stale or guide
 * answer); a failure reading card text from our own database does throw, so the caller can report a real error.
 */
export async function getCommanderTargets(deps: TargetsDeps, commanderNames: string[], opts: TargetsOptions = {}): Promise<CommanderTargets> {
  const supabase = deps.supabase
  const edhrec = deps.edhrec ?? liveEdhrec
  const now = (deps.now ?? (() => new Date()))()
  const log = deps.log ?? ((m: string) => console.warn(m))

  const names = commanderNames.map((n) => n.trim()).filter((n) => n.length > 0)
  const slug = commanderSlug(names)
  if (!slug) return guideTargets(GUIDE_LABEL)

  const saved = await readRow(supabase, slug, log)
  if (saved && isRowFresh(saved, now)) return answerFromRow(supabase, saved, false, names)

  if (opts.recheck && saved) {
    const last = lastRecheckRefresh.get(slug)
    if (last !== undefined && now.getTime() - last < RECHECK_MIN_GAP_MS) return answerFromRow(supabase, saved, true, names)
  }
  if (opts.recheck) lastRecheckRefresh.set(slug, now.getTime())

  const outcome = await refreshOnce({ supabase, edhrec }, slug, names, now)
  if (outcome.kind === 'row') {
    if (outcome.save) await saveRow(supabase, outcome.row, log)
    return answerFromRow(supabase, outcome.row, false, names)
  }

  log(`[commander-targets] EDHREC unreachable for ${slug}: ${outcome.reason}`)
  if (saved) return answerFromRow(supabase, saved, true, names)
  return guideTargets(GUIDE_UNREACHABLE_LABEL, await storedBuildTypeCounts(supabase, names))
}

export { CLASSIFIER_VERSION }
