// DV-02: what Claude reads about a deck's plan and health, ahead of the cards. get_deck returns, in this order:
// deck, strategy, health, cards. Read-only, and every read carries the owner's user id.
import type { BracketInfo } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { offRangeSubline, type DeckHealthResponse } from '../../deck-health'
import { loadConnectorDeckHealth, type ConnectorHealthResult } from '../deck-health-loader'
import { bracketName } from '../../deck-bracket'
import { LookupFailed, rows, type ToolContext } from './common'
export interface DeckStrategyView {
  /** The owner's TARGET bracket. When value is null, whyEmpty tells Claude to ask, not assume. */
  targetBracket: BracketInfo & { name: string | null }
  summary: string | null
  strategy: string | null
  /** The marker to send back as based_on when rewriting the Strategy: when it was last changed, or 'none' when there is no Strategy yet. */
  version: string
  versionNote: string
  playgroup: string | null
  lastChanged: { by: 'owner' | 'claude' | null; at: string | null } | null
  /** Said when part of this could not be read yet (before the stored-data update). */
  note?: string
}
export type DeckHealthView =
  | {
      status: 'computed_now'
      headline: string
      subline: string
      source: string
      checkState: 'full' | 'partial'
      groups: { group: string; label: string; have: number; range: { min: number; max: number } | null; verdict: string | null }[]
    }
  | { status: 'unavailable'; message: string }
type StrategyRow = {
  bracket?: unknown
  strategy_notes?: string | null
  table_context?: string | null
  summary?: string | null
  updated_by?: string | null
  updated_at?: string | null
}
const NEW_COLUMNS = 'bracket, strategy_notes, table_context, summary, updated_by, updated_at'
const OLD_COLUMNS = 'bracket, strategy_notes, table_context, updated_at'
const SUMMARY_NOT_READY = 'The one-line summary and "last changed by" are not stored yet (the owner has not applied that update), so they are empty here.'
const VERSION_NOTE = 'To rewrite the Strategy with set_deck_setup, send this version as based_on. If the Strategy changes before you send, the rewrite is refused and nothing is changed.'
const blank = (v: string | null | undefined) => (v && v.trim() !== '' ? v : null)
/** The deck's strategy row. A database without the new columns still answers, with a note, never an error. */
export async function loadDeckStrategy(ctx: ToolContext, deckId: number, bracketInfo: BracketInfo): Promise<DeckStrategyView> {
  let canStore = true
  let r = await ctx.db.select('deck_strategy', NEW_COLUMNS).eq('user_id', ctx.userId).eq('deck_id', deckId).limit(1)
  if (r.error) {
    canStore = false
    r = await ctx.db.select('deck_strategy', OLD_COLUMNS).eq('user_id', ctx.userId).eq('deck_id', deckId).limit(1)
    if (r.error) throw new LookupFailed()
  }
  const row = rows<StrategyRow>(r)[0]
  const by = row?.updated_by === 'owner' || row?.updated_by === 'claude' ? row.updated_by : null
  return {
    targetBracket: { ...bracketInfo, name: bracketName(bracketInfo.value) },
    summary: blank(row?.summary),
    strategy: blank(row?.strategy_notes),
    version: row?.updated_at ?? 'none',
    versionNote: VERSION_NOTE,
    playgroup: blank(row?.table_context),
    lastChanged: row?.updated_at ? { by, at: row.updated_at } : null,
    ...(canStore ? {} : { note: SUMMARY_NOT_READY }),
  }
}
export type HealthLoader = (ctx: ToolContext, deckId: number) => Promise<ConnectorHealthResult>
const UNAVAILABLE = 'The deck health check could not be completed just now. This is not the same as healthy. Call get_deck_health to try again.'
/** A short form of the Deck health check (the full one is get_deck_health). A failure says so; it is never a passing result. */
export async function loadDeckHealthView(ctx: ToolContext, deckId: number, load: HealthLoader = (c, id) => loadConnectorDeckHealth(c, id)): Promise<DeckHealthView> {
  try {
    const r = await load(ctx, deckId)
    if (!r.ok) return { status: 'unavailable', message: UNAVAILABLE }
    return shortHealth(r.health)
  } catch {
    return { status: 'unavailable', message: UNAVAILABLE }
  }
}
export function shortHealth(h: DeckHealthResponse): DeckHealthView {
  return {
    status: 'computed_now',
    headline: h.verdict.headline,
    subline: offRangeSubline(h),
    source: h.reference.label,
    checkState: h.checkState,
    groups: h.rows.map((x) => ({ group: x.kind, label: x.label, have: x.have, range: x.range, verdict: x.verdict })),
  }
}
