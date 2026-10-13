/**
 * ManaBox collection import — add-only (D-050).
 *
 * Parses a ManaBox collection CSV, resolves every row against `ref_printings`,
 * skips tokens (D-051) and appends physical copies to the collection. Existing
 * copies and deck sleeves are never touched.
 *
 * Contract: docs/oracle/contracts/manabox-import.md §9, §12.1, §15.1.
 */

import { createAdminClient } from '@/lib/supabase'
import type { Json } from '@/types/supabase'
import { assertAtomicRpcSuccess, assertAtomicRpcCount } from '@/lib/atomic-rpc'
import { mapCondition } from '@/lib/identity-resolver'
import { createSupabaseManaBoxResolver } from '@/lib/manabox-resolver'
import {
  resolveCollectionRows,
  combineResolvedRows,
  normalizeProxyCounts,
  type ManaBoxResolver,
} from '@/lib/manabox-import'
import type {
  ManaBoxCollectionImportSummary,
  ManaBoxProxyCounts,
} from '../../docs/oracle/contracts/manabox-import.types'

export interface ManaBoxCollectionImportOptions {
  csvContent: string
  fileName: string
  userId: string
  /** Per combined-row proxy count keyed by the row's 1-based source index. */
  proxyCounts?: ManaBoxProxyCounts
  /** Injectable resolver for tests. */
  resolver?: ManaBoxResolver
}

/** Combined-row key used for collection combining (printing + finish + language). */
function combinedKey(scryfallId: string, finish: string, language?: string): string {
  return `${scryfallId}|${finish}|${language ?? 'en'}`
}

/**
 * Execute an add-only ManaBox collection import. Returns the insert summary;
 * the collection is never cleared or replaced.
 */
export async function executeManaBoxCollectionImport(
  options: ManaBoxCollectionImportOptions
): Promise<ManaBoxCollectionImportSummary> {
  const startTime = Date.now()
  const supabase = createAdminClient()
  const resolver = options.resolver ?? createSupabaseManaBoxResolver()

  const resolution = await resolveCollectionRows(
    { fileName: options.fileName, csvContent: options.csvContent },
    resolver
  )

  const rows = combineResolvedRows(resolution.candidates, 'collection')

  const proxyBySource = normalizeProxyCounts(
    rows.map((row) => ({ sourceIndex: row.sourceIndex, qty: row.qty })),
    options.proxyCounts
  )

  // Remaining proxies to place per combined row, consumed in file order.
  const remainingProxies = new Map<number, number>()
  for (const row of rows) {
    remainingProxies.set(row.sourceIndex, proxyBySource.get(row.sourceIndex) ?? 0)
  }

  // Map each combined key to the source index that owns its proxy budget.
  const sourceIndexByKey = new Map<string, number>()
  for (const row of rows) {
    sourceIndexByKey.set(combinedKey(row.scryfallId, row.finish, row.language), row.sourceIndex)
  }

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

  // 2. Build one copy row per physical copy.
  const copyRows: Array<{ [key: string]: Json | undefined }> = []

  for (const candidate of resolution.candidates) {
    const cardId = cardIdByOracle.get(candidate.oracleId)
    if (!cardId) {
      errors.push(`Unable to create or resolve user card for "${candidate.cardName}"`)
      continue
    }

    const key = combinedKey(candidate.scryfallId, candidate.finish, candidate.language)
    const { condition } = mapCondition(candidate.condition ?? '')

    const orderedSource = sourceIndexByKey.get(key) ?? candidate.sourceIndex

    for (let i = 0; i < candidate.qty; i++) {
      const remaining = remainingProxies.get(orderedSource) ?? 0
      const isProxy = remaining > 0
      if (isProxy) remainingProxies.set(orderedSource, remaining - 1)

      const copyRow: { [key: string]: Json | undefined } = {
        card_id: cardId,
        printing_id: candidate.scryfallId,
        finish: candidate.finish,
        language: candidate.language ?? 'en',
        is_proxy: isProxy,
        card_condition: condition,
        source_tag: 'manabox',
        location_id: null,
      }
      if (candidate.purchasePrice != null) {
        copyRow.purchase_price = candidate.purchasePrice
      }
      if (candidate.acquiredAt) {
        copyRow.acquired_at = candidate.acquiredAt
      }
      copyRows.push(copyRow)
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
    }
  }

  // 3. Insert atomically through the existing collection RPC.
  let inserted = 0
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
  }
}
