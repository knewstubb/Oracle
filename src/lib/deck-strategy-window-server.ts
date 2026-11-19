// Server side of the Strategy window (DV-02): reads and writes the deck's strategy row.
// The owner applies the stored-data change (summary, updated_by, bracket 5) later, so every read and write here
// has to work before it exists: a missing column is a normal state, never an error shown to the owner.
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseBracket } from './deck-bracket'
import type { ImpliedBracket, StrategyWindowData } from './deck-strategy-window'
const NEW_COLUMNS = 'bracket, strategy_notes, table_context, summary, updated_by, updated_at'
const OLD_COLUMNS = 'bracket, strategy_notes, table_context, updated_at'
interface DbError {
  code?: string
  message?: string
}
/** The database does not have a column yet (before the owner applies the change). */
export function isMissingColumn(err: DbError | null | undefined): boolean {
  if (!err) return false
  if (err.code === '42703' || err.code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column/i.test(err.message ?? '')
}
/** The database refused a number that is not allowed there yet (an old 1 to 4 check). */
export function isCheckViolation(err: DbError | null | undefined): boolean {
  return !!err && (err.code === '23514' || /violates check constraint/i.test(err.message ?? ''))
}
/**
 * What the cards imply. RQ-14 (Game Changers stored, combo data) is a later item, so nothing is counted today and this
 * returns null: the warning area is built and shows nothing until a source exists. Never used to filter or refuse anything.
 */
export async function impliedBracketForDeck(_deckId: number): Promise<ImpliedBracket | null> { // eslint-disable-line @typescript-eslint/no-unused-vars
  return null
}
type Row = {
  bracket?: unknown
  strategy_notes?: string | null
  table_context?: string | null
  summary?: string | null
  updated_by?: string | null
  updated_at?: string | null
}
export function toWindowData(row: Row | null, canStoreNewFields: boolean, implied: ImpliedBracket | null): StrategyWindowData {
  return {
    configured: !!row,
    bracket: parseBracket(row?.bracket),
    summary: row?.summary ?? '',
    strategy: row?.strategy_notes ?? '',
    playgroup: row?.table_context ?? '',
    updatedBy: row?.updated_by === 'owner' || row?.updated_by === 'claude' ? row.updated_by : null,
    updatedAt: row?.updated_at ?? null,
    canStoreNewFields,
    implied,
  }
}
export async function loadStrategyWindow(
  supabase: SupabaseClient,
  userId: string,
  deckId: number,
): Promise<{ ok: true; data: StrategyWindowData } | { ok: false; error: string }> {
  let canStore = true
  let res = await supabase.from('deck_strategy').select(NEW_COLUMNS).eq('deck_id', deckId).eq('user_id', userId).maybeSingle()
  if (res.error && isMissingColumn(res.error)) {
    canStore = false
    res = await supabase.from('deck_strategy').select(OLD_COLUMNS).eq('deck_id', deckId).eq('user_id', userId).maybeSingle()
  }
  if (res.error) return { ok: false, error: res.error.message }
  return { ok: true, data: toWindowData(res.data as Row | null, canStore, await impliedBracketForDeck(deckId)) }
}
export interface SaveValues {
  bracket?: number | null
  summary?: string | null
  strategy?: string | null
  playgroup?: string | null
}
export type SaveOutcome =
  | { ok: true; notSaved: 'summary'[] }
  | { ok: false; code: 'bracket_5_not_stored_yet' | 'failed'; error: string }
/**
 * Saves only the fields the window sent. Fields it did not send (win condition, budget and the rest) are never touched.
 * Before the stored-data change: the old fields still save; a typed summary is reported back as not saved.
 */
export async function saveStrategyWindow(supabase: SupabaseClient, userId: string, deckId: number, values: SaveValues, now: Date): Promise<SaveOutcome> {
  const base: Record<string, unknown> = { deck_id: deckId, user_id: userId, updated_at: now.toISOString() }
  if (values.bracket !== undefined) base.bracket = values.bracket
  if (values.strategy !== undefined) base.strategy_notes = values.strategy
  if (values.playgroup !== undefined) base.table_context = values.playgroup
  const withNew: Record<string, unknown> = { ...base, updated_by: 'owner' }
  if (values.summary !== undefined) withNew.summary = values.summary
  let { error } = await supabase.from('deck_strategy').upsert(withNew, { onConflict: 'deck_id' })
  let notSaved: 'summary'[] = []
  if (error && isMissingColumn(error)) {
    ;({ error } = await supabase.from('deck_strategy').upsert(base, { onConflict: 'deck_id' }))
    if (typeof values.summary === 'string' && values.summary !== '') notSaved = ['summary']
  }
  if (error) {
    if (values.bracket === 5 && isCheckViolation(error)) {
      return { ok: false, code: 'bracket_5_not_stored_yet', error: "Bracket 5 can't be saved yet. Oracle's stored data still stops at 4. Pick 1 to 4 for now." }
    }
    return { ok: false, code: 'failed', error: error.message }
  }
  return { ok: true, notSaved }
}
