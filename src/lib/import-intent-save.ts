/**
 * Save path for the intent-aware deck import (contract import-intent §5, slices S4-S8).
 * Pure helpers: turn the server's CopyPlan for each copy into one `import_deck_with_intent` row.
 *
 * The RPC (draft M2, docs/oracle/contracts/drafts/DRAFT_20261023160000_import_deck_with_intent.sql) is NOT
 * applied yet. Until it is, `isIntentRpcMissing` lets the caller fail with a clear message instead of a
 * confusing database error, and nothing is written (the deck row is removed by the caller).
 */

import type {
  CopyPlan,
  NeedsALookItem,
  ImportPlanSummary,
  DeckImportIntentSummary,
  IntentCopyEdits,
} from '../../docs/oracle/contracts/import-intent.types'
import type { ResolvedImportCopy } from '@/lib/import-copies'
import { toDeckRpcRow } from '@/lib/import-copies'
import type { DeckCopyContext } from '@/lib/import-copies'

export type IntentRpcAction =
  | 'add_sleeved'
  | 'add_unsleeved'
  | 'sleeve_owned'
  | 'move'
  | 'move_skipped'
  | 'planned'
  | 'generic'

/** One p_rows element (extends the existing row shape; see the draft SQL header). */
export type IntentRpcPayloadRow = ReturnType<typeof toDeckRpcRow> & {
  action: IntentRpcAction
  row_index: number
  /** sleeve_owned / move: describes the copy to pick under lock (no copy ids ever leave the server). */
  link_printing_id?: string
  link_is_proxy?: boolean
  from_deck_id?: number
  alert_deck_ids?: number[]
}

/** Where a row came from, so a "needs a look" answer can be shown against the right card. */
export interface IntentRowOrigin {
  rowKey: string
  copyIndex: number
  cardName: string
}

/** Thrown (before anything is written) when a plan still needs an owner choice. */
export class NeedsChoiceError extends Error {
  readonly rowKeys: string[]
  constructor(rowKeys: string[]) {
    super(`Some cards still need a choice: ${rowKeys.slice(0, 5).join(', ')}`)
    this.name = 'NeedsChoiceError'
    this.rowKeys = rowKeys
  }
}

/** Row keys of every copy whose plan still needs a choice (contract §5: the route answers 400 needs_choice). */
export function needsChoiceRowKeys(plans: CopyPlan[]): string[] {
  return [
    ...new Set(
      plans.filter((p) => p.kind === 'needs_choice_move' || p.kind === 'needs_choice_printing').map((p) => p.rowKey)
    ),
  ]
}

/** One real (non-generic) copy -> one RPC row. `copy` is the resolved copy; the plan decides the action and type. */
export function planToIntentRpcRow(
  plan: CopyPlan,
  copy: ResolvedImportCopy,
  context: DeckCopyContext,
  rowIndex: number
): IntentRpcPayloadRow {
  const asType = (type: 'original' | 'proxy' | 'unsleeved') => ({ ...copy, type })
  switch (plan.kind) {
    case 'add_sleeved':
      return { ...toDeckRpcRow(asType(plan.type === 'proxy' ? 'proxy' : 'original'), context), action: 'add_sleeved', row_index: rowIndex }
    case 'add_unsleeved':
      return { ...toDeckRpcRow(asType('original'), context), action: 'add_unsleeved', row_index: rowIndex }
    case 'move_skipped':
      return {
        ...toDeckRpcRow(asType('original'), context),
        action: 'move_skipped',
        row_index: rowIndex,
        alert_deck_ids: plan.alertDeckIds ?? [],
      }
    case 'sleeve_owned':
    case 'move': {
      const proxy = plan.type === 'proxy'
      return {
        ...toDeckRpcRow(asType(proxy ? 'proxy' : 'original'), context),
        action: plan.kind,
        row_index: rowIndex,
        link_printing_id: plan.slotPrintingId,
        link_is_proxy: proxy,
        ...(plan.kind === 'move' ? { from_deck_id: plan.fromDeckId } : {}),
      }
    }
    case 'owned_unsleeved':
    case 'unowned':
      return { ...toDeckRpcRow(asType('unsleeved'), context), action: 'planned', row_index: rowIndex }
    default:
      // needs_choice_* is rejected before this point; generic rows are built by the caller.
      throw new Error(`Cannot save a copy with plan "${plan.kind}"`)
  }
}

/** Merge the RPC answer into the summary the result screen shows. */
export function buildIntentSummary(
  deckId: number,
  summary: ImportPlanSummary,
  rpcResult: Record<string, unknown>,
  origins: IntentRowOrigin[]
): DeckImportIntentSummary {
  const raw = Array.isArray(rpcResult.needs_a_look) ? (rpcResult.needs_a_look as unknown[]) : []
  const needsALook: NeedsALookItem[] = []
  for (const item of raw) {
    const rec = item as { row_index?: unknown; reason?: unknown }
    const origin = typeof rec.row_index === 'number' ? origins[rec.row_index] : undefined
    if (!origin) continue
    needsALook.push({
      rowKey: origin.rowKey,
      copyIndex: origin.copyIndex,
      cardName: origin.cardName,
      reason: rec.reason === 'copy_no_longer_in_deck' ? 'copy_no_longer_in_deck' : 'copy_no_longer_free',
    })
  }
  // A copy that could not be honoured was saved Unsleeved, so it no longer counts as sleeved/moved.
  const out: DeckImportIntentSummary = { ...summary, deckId, needsALook, alertsCreated: Number(rpcResult.alerts_created ?? 0) }
  return out
}

/** True when the database error says the function does not exist yet (draft M2 not applied). */
export const INTENTS: readonly string[] = ['purchased', 'built', 'planned']

/** Shape checks for the intent-only edit fields (the rest are checked by validateImportInput). Returns problems. */
export function validateIntentEdits(
  intent: unknown,
  edits: IntentCopyEdits,
  rows: Array<{ rowKey: string; qty: number }>
): string[] {
  const problems: string[] = []
  if (typeof intent !== 'string' || !INTENTS.includes(intent)) problems.push('intent must be purchased, built or planned')
  const qtyByKey = new Map(rows.map((r) => [r.rowKey, r.qty]))
  for (const [rowKey, perIndex] of Object.entries(edits)) {
    if (!perIndex || typeof perIndex !== 'object') continue
    for (const [i, e] of Object.entries(perIndex)) {
      const qty = qtyByKey.get(rowKey)
      if (qty !== undefined && (Number(i) >= qty || Number(i) < 0)) problems.push(`${rowKey}: copy ${i} does not exist`)
      if (e.add !== undefined && typeof e.add !== 'boolean') problems.push(`${rowKey}: add must be true or false`)
      if (e.printing !== undefined && e.printing !== 'use_mine' && e.printing !== 'add_this') {
        problems.push(`${rowKey}: printing must be use_mine or add_this`)
      }
      if (e.move !== undefined) {
        const m = e.move as { kind?: unknown; fromDeckId?: unknown }
        const ok = m && (m.kind === 'skip' || (m.kind === 'move' && Number.isInteger(m.fromDeckId)))
        if (!ok) problems.push(`${rowKey}: move must be skip or a move from a deck`)
      }
    }
  }
  return problems
}

/** True when the database error says the function does not exist yet (draft M2 not applied). */
export function isIntentRpcMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || /Could not find the function|does not exist/i.test(error.message ?? '')
}

/** A clear refusal from the function (it raised on purpose, P0001) or the function being absent. Never a timeout or dropped connection. */
export function isClearRejection(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === 'P0001' || isIntentRpcMissing(error)
}

/** Loose client for the clean-up (tests inject a fake). */
export interface CleanupClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * After a failed intent save, remove the deck this import just created, but only when it is safe:
 * the failure was a clear rejection (see isClearRejection) AND the deck has no slots at all.
 * An ambiguous failure (timeout, dropped connection: the save may have gone through) never deletes.
 * Returns true when the deck was deleted. Never throws.
 */
export async function cleanupEmptyDeckAfterRejection(
  client: CleanupClient,
  deckId: number,
  userId: string,
  error: { code?: string; message?: string } | null | undefined
): Promise<boolean> {
  if (!isClearRejection(error)) return false
  try {
    const slots = await client.from('deck_cards').select('id').eq('deck_id', deckId).eq('user_id', userId).limit(1)
    if (slots.error || !Array.isArray(slots.data) || slots.data.length > 0) return false
    const del = await client.from('decks').delete().eq('id', deckId).eq('user_id', userId)
    return !del.error
  } catch {
    return false
  }
}
