/**
 * ManaBox collection import — add-only (D-050).
 *
 * Parses a ManaBox collection CSV, resolves every row against `ref_printings`,
 * skips tokens (D-051) and appends physical copies to the collection. Existing
 * copies and deck sleeves are never touched.
 *
 * Every physical copy is one `user_copies` row (D-001). Its type, finish,
 * condition and language come from `resolveCopy` (owner edit, then the file,
 * then the defaults) so what the owner saw on the review screen is what is
 * written. The server re-reads the file itself; the client sends only the
 * defaults and the owner's per-copy edits.
 *
 * Contract: docs/oracle/contracts/import-row-editing.md §3, §5, §7, §10.
 */

import { countStoredFoils } from '@/lib/import-result'
import { createAdminClient } from '@/lib/supabase'
import type { Json } from '@/types/supabase'
import { assertAtomicRpcSuccess, assertAtomicRpcCount } from '@/lib/atomic-rpc'
import { createSupabaseManaBoxResolver } from '@/lib/manabox-resolver'
import { resolveCollectionRows, combineResolvedRows, type ManaBoxResolver } from '@/lib/manabox-import'
import {
  ImportValidationError,
  applyEditsToRow,
  resolveCopy,
  toCollectionRpcRow,
  validateImportInput,
  validateRowFinishes,
} from '@/lib/import-copies'
import type {
  ImportCopyEdits,
  ImportDefaults,
} from '../../docs/oracle/contracts/import-row-editing.types'
import type { ManaBoxCollectionImportSummary } from '../../docs/oracle/contracts/manabox-import.types'

/** The slice of the Supabase client this module uses (lets tests inject a fake). */
export type CollectionImportClient = Pick<ReturnType<typeof createAdminClient>, 'from' | 'rpc'>

export interface ManaBoxCollectionImportOptions {
  csvContent: string
  fileName: string
  /** Always the signed-in user's id, taken from the session, never from the request body. */
  userId: string
  defaults: ImportDefaults
  /** Owner edits: rowKey -> copy index -> fields. Holds no database ids. */
  copyEdits?: ImportCopyEdits
  /** Progress in copies: `resolving` while looking cards up, `writing` while saving. */
  onProgress?: (progress: { phase: 'resolving' | 'writing'; done: number; total: number }) => void
  /** Injectable resolver for tests. */
  resolver?: ManaBoxResolver
  /** Injectable database client for tests. */
  supabase?: CollectionImportClient
}

/**
 * Execute an add-only ManaBox collection import. Returns the insert summary;
 * the collection is never cleared or replaced. Throws `ImportValidationError`
 * (nothing written) when the defaults or edits are not acceptable.
 */
export async function executeManaBoxCollectionImport(
  options: ManaBoxCollectionImportOptions
): Promise<ManaBoxCollectionImportSummary> {
  const startTime = Date.now()
  const supabase = options.supabase ?? createAdminClient()
  const resolver = options.resolver ?? createSupabaseManaBoxResolver()

  const resolution = await resolveCollectionRows(
    { fileName: options.fileName, csvContent: options.csvContent },
    resolver,
    (done, total) => options.onProgress?.({ phase: 'resolving', done, total })
  )

  const rows = combineResolvedRows(resolution.candidates, 'collection')

  // 0. Validate everything before anything is written.
  const problems = validateImportInput(
    rows.map((row) => ({ rowKey: row.rowKey, qty: row.qty })),
    options.defaults,
    options.copyEdits,
    { allowUnsleeved: false }
  )
  if (problems.length > 0) throw new ImportValidationError(problems)

  const resolvedByRow = rows.map((row) => {
    const edited = applyEditsToRow(row, options.copyEdits)
    return {
      row,
      resolved: edited.copies.map((copy) =>
        resolveCopy(copy, options.defaults, row.availableFinishes)
      ),
    }
  })

  const finishCheck = validateRowFinishes(
    resolvedByRow.map(({ row, resolved }) => ({
      rowKey: row.rowKey,
      availableFinishes: row.availableFinishes,
      resolved,
    }))
  )
  if (finishCheck.problems.length > 0) throw new ImportValidationError(finishCheck.problems)

  const lineBySource = new Map(resolution.candidates.map((c) => [c.sourceIndex, c]))
  const errors: string[] = []

  // 1. Upsert user_cards for every unique oracle_id.
  const uniqueCards = new Map<string, string>()
  for (const candidate of resolution.candidates) {
    if (!uniqueCards.has(candidate.oracleId)) {
      uniqueCards.set(candidate.oracleId, candidate.cardName)
    }
  }

  const cardIdByOracle = new Map<string, number>()
  if (uniqueCards.size > 0) {
    const upsertRows = [...uniqueCards.entries()].map(([oracleId, cardName]) => ({
      oracle_id: oracleId,
      card_name: cardName,
      user_id: options.userId,
    }))

    const { data, error } = await supabase
      .from('user_cards')
      .upsert(upsertRows, { onConflict: 'oracle_id,user_id' })
      .select('id, oracle_id')

    if (error) {
      throw new Error(`Failed to upsert user cards: ${error.message}`)
    }
    for (const card of data ?? []) {
      cardIdByOracle.set(card.oracle_id, card.id)
    }
  }

  // 2. One copy row per physical copy, each carrying its own source line's price and date.
  const copyRows: Array<{ [key: string]: Json | undefined }> = []
  for (const { row, resolved } of resolvedByRow) {
    const cardId = cardIdByOracle.get(row.oracleId)
    if (!cardId) {
      errors.push(`Unable to create or resolve user card for "${row.cardName}"`)
      continue
    }
    const copies = applyEditsToRow(row, options.copyEdits).copies
    for (const copy of resolved) {
      const line = lineBySource.get(copies[copy.index].sourceLine)
      copyRows.push(
        toCollectionRpcRow(copy, {
          cardId,
          scryfallId: row.scryfallId,
          purchasePrice: line?.purchasePrice,
          acquiredAt: line?.acquiredAt,
        }) as unknown as { [key: string]: Json | undefined }
      )
    }
  }

  if (errors.length > 0) {
    return {
      inserted: 0,
      skipped: resolution.skippedTokens.length,
      removed: 0,
      sourceTag: 'manabox',
      errors,
      unmatched: resolution.unmatched,
      durationMs: Date.now() - startTime,
      unlistedFinish: finishCheck.unlistedFinish,
    }
  }

  // 3. Insert atomically through the existing collection RPC.
  let inserted = 0
  options.onProgress?.({ phase: 'writing', done: 0, total: copyRows.length })
  if (copyRows.length > 0) {
    const { data, error } = await supabase.rpc('insert_user_copies', {
      p_user_id: options.userId,
      p_rows: copyRows as unknown as Json,
    })

    if (error) {
      throw new Error(`Atomic collection insert failed: ${error.message}`)
    }

    inserted = assertAtomicRpcCount(
      assertAtomicRpcSuccess(data, 'Atomic collection insert'),
      'inserted_count',
      'Atomic collection insert',
      copyRows.length
    )
  }

  return {
    inserted,
    skipped: resolution.skippedTokens.length,
    removed: 0,
    sourceTag: 'manabox',
    errors,
    unmatched: resolution.unmatched,
    durationMs: Date.now() - startTime,
    unlistedFinish: finishCheck.unlistedFinish,
    foils: countStoredFoils(copyRows as unknown as Array<{ finish: string; is_proxy?: boolean }>),
  }
}
