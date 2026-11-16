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
import { assertAtomicRpcSuccess, assertAtomicRpcCount, assertAtomicRpcIdList } from '@/lib/atomic-rpc'
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
import {
  applyStorageDestination,
  destinationErrorFromDatabase,
  resolveImportDestination,
} from '@/lib/import-destination'
import { loadCardFacts, loadDeckFacts, type CheckClient } from '@/lib/chat-proposal-check'
import { destinationDeckStatus, type DestinationSlotRow } from '@/lib/import-destinations-list'
import { getFormatConfig } from '@/lib/format-config'
import {
  buildDeckPlacement,
  computeDeckWarnings,
  parseDeckRpcAnswer,
  toDeckRpcRows,
  type DeckRowMeta,
} from '@/lib/import-deck-result'
import type { ImportDestination, ImportPlacementResult } from '../../docs/oracle/contracts/know-where-cards-are.types'
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
  /** One place for the whole import. Absent = Unsorted (today's behaviour). Shape-checked by the caller. */
  destination?: ImportDestination
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

  // Check the destination first: a place that is not the user's, or not allowed, refuses the whole import
  // before any file work or any write.
  const destination = await resolveImportDestination(
    supabase as unknown as Parameters<typeof resolveImportDestination>[0],
    options.userId,
    options.destination ?? { kind: 'unsorted' }
  )

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
  const copyMetas: DeckRowMeta[] = []
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
      copyMetas.push({ cardName: row.cardName, scryfallId: row.scryfallId, setCode: row.setCode, isBasicLand: row.isBasicLand })
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

  // 3. Insert atomically through the existing collection RPC. A box or binder destination only sets the
  // location on each row; the function re-checks it belongs to the user, all or nothing.
  const writeRows = applyStorageDestination(copyRows, destination)
  let inserted = 0
  let placement: ImportPlacementResult | undefined
  let insertedIds: number[] = []
  options.onProgress?.({ phase: 'writing', done: 0, total: writeRows.length })
  if (destination.kind === 'deck' && destination.id !== null) {
    // Deck destination: one database function saves the copies and places each one, all or nothing.
    if (writeRows.length > 0) {
      placement = await importIntoDeck({
        supabase,
        userId: options.userId,
        deckId: destination.id,
        deckName: destination.name,
        rows: writeRows,
        metas: copyMetas,
      })
      inserted = placement.total
    }
  } else if (writeRows.length > 0) {
    const { data, error } = await supabase.rpc('insert_user_copies', {
      p_user_id: options.userId,
      p_rows: writeRows as unknown as Json,
    })

    if (error) {
      throw destinationErrorFromDatabase(error.message) ?? new Error(`Atomic collection insert failed: ${error.message}`)
    }

    const answer = assertAtomicRpcSuccess(data, 'Atomic collection insert')
    inserted = assertAtomicRpcCount(answer, 'inserted_count', 'Atomic collection insert', writeRows.length)
    // Unsorted destination only: these exact copies feed "Add all" on the result screen.
    if (destination.kind === 'unsorted') {
      insertedIds = assertAtomicRpcIdList(answer, 'inserted_ids', 'Atomic collection insert', writeRows.length)
    }
  }

  if (!placement) {
    placement = {
      destination: { kind: destination.kind, id: destination.id, name: destination.name },
      total: inserted,
      placedInStorage: inserted,
      // Unsorted: every copy of this import (names in file order). Box or binder: nothing is in Unsorted.
      unsortedCopyIds: insertedIds,
      unsortedCardNames: insertedIds.length > 0 ? copyMetas.map((m) => m.cardName) : [],
    }
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
    placement,
  }
}

/** Saves and places every copy in one database call, then reads back what it needs to warn the owner. */
async function importIntoDeck(args: {
  supabase: CollectionImportClient
  userId: string
  deckId: number
  deckName: string
  rows: Array<{ [key: string]: Json | undefined }>
  metas: DeckRowMeta[]
}): Promise<ImportPlacementResult> {
  const { supabase, userId, deckId, rows, metas } = args
  const { data: deckRow, error: deckErr } = await supabase
    .from('decks')
    .select('format')
    .eq('id', deckId)
    .eq('user_id', userId)
    .maybeSingle()
  if (deckErr) throw new Error(`Could not read the deck: ${deckErr.message}`)
  const format = (deckRow as { format: string | null } | null)?.format ?? null

  const { data, error } = await supabase.rpc('insert_user_copies_to_deck' as never, {
    p_user_id: userId,
    p_deck_id: deckId,
    p_rows: toDeckRpcRows(rows, metas) as unknown as Json,
    p_max_copies: getFormatConfig(format).maxCopies ?? 1,
  } as never)
  if (error) {
    throw destinationErrorFromDatabase(error.message) ?? new Error(`Atomic deck import failed: ${error.message}`)
  }

  const answer = parseDeckRpcAnswer(data, rows.length)
  const names = metas.map((m) => m.cardName)
  const placement = buildDeckPlacement({ deckId, deckName: args.deckName, answer, names })

  // The copies are saved and placed. Anything below only adds information, so a failure here becomes
  // "could not check" on the result, never a failed import (D-030).
  const addedNames = answer.outcomes.filter((o) => o.kind === 'added').map((o) => names[o.index])
  try {
    const checkClient = supabase as unknown as CheckClient
    const [facts, cardFacts, slots] = await Promise.all([
      loadDeckFacts(checkClient, deckId, userId),
      addedNames.length > 0 ? loadCardFacts(checkClient, addedNames) : Promise.resolve(new Map()),
      supabase
        .from('deck_cards')
        .select('copy_id, is_generic, generic_sleeved, categories')
        .eq('deck_id', deckId)
        .eq('user_id', userId),
    ])
    placement.warnings = computeDeckWarnings({
      deckFormat: format,
      deckColours: facts?.deckColours ?? null,
      addedNames,
      cardFacts: facts ? new Map([...cardFacts].map(([k, v]) => [k, { colours: v.colours, commanderLegal: v.commanderLegal }])) : null,
      mainCountAfter: facts?.mainCount ?? null,
    })
    if (!slots.error && slots.data) {
      placement.deckStatusAfter = destinationDeckStatus(slots.data as DestinationSlotRow[], format)
    }
  } catch {
    placement.warnings = computeDeckWarnings({
      deckFormat: format,
      deckColours: null,
      addedNames,
      cardFacts: null,
      mainCountAfter: null,
    })
  }
  return placement
}
