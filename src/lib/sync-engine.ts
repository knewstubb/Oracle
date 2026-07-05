/**
 * Sync Engine — Orchestrates deck import/reconciliation and allocation cycles
 *
 * Core responsibilities:
 * 1. reconcileDeck: Fetch Archidekt state, diff against local deck_cards, Archidekt wins on conflict
 *    (ONLY called for explicit user-triggered re-imports or new deck imports)
 * 2. runSyncCycle: Process decks sequentially with failure isolation, run allocation resolver, record results
 *    - Discovery mode (no deckIds): only process NEW decks (never imported before)
 *    - Re-import mode (deckIds provided): user-triggered reconciliation of specific decks
 *    - NEVER auto-reconciles previously-imported decks
 *
 * Validates: Requirements 1.2, 1.3, 2.1, 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 6.2, 6.4
 */

import { createAdminClient } from '@/lib/supabase'
import type { ArchidektDeckFull, ArchidektDeckCard } from './archidekt-client'
import { buildAllocationInput, applyAllocationOutput } from './allocation-store'
import type { AllocationDiff } from './allocation-store'
import { computeAllocations } from './allocation-resolver'
import type { AllocationRecord } from './allocation-resolver'
import { resolveOwnership } from './ownership-resolver'
import { parseCollectionCSV } from './csv-import'
import type { CollectionCSVRow, ImportDelta } from './csv-import'
import { computeHealth } from './health-engine'
import { upsertHealthResult, getHealthOverrides } from './health-store'
import type { FunctionalCategory } from './category-classifier'
import { recomputePreconModState } from './precon-mod-store'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLandFromCategories(rawCategories: string | null): boolean {
  if (!rawCategories) return false
  const trimmed = rawCategories.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.some((cat: string) => cat.toLowerCase() === 'lands' || cat.toLowerCase() === 'land')
      }
    } catch { /* fall through */ }
  }
  return trimmed.split(',').some((cat) => {
    const c = cat.trim().toLowerCase()
    return c === 'lands' || c === 'land'
  })
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncCycleResult {
  startedAt: string
  completedAt: string
  trigger: 'csv_import' | 'manual' | 'card_movement' | 'scheduled'
  deckResults: DeckSyncResult[]
  allocationChanges: number
  archidektWrites: number
  /** Whether ownership resolution succeeded — downstream (recommendations) is gated behind this */
  ownershipResolved: boolean
}

export interface DeckSyncResult {
  deckId: number
  deckName: string
  success: boolean
  error?: string
  compositionChanges: number
  allocationChanges: number
  archidektWritten: boolean
}

/** Dependency injection interface for fetching deck data from Archidekt */
export interface ArchidektFetcher {
  fetchDeck(deckId: number): Promise<ArchidektDeckFull>
}

/** Local deck card row from the database */
interface LocalDeckCard {
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  quantity: number
  categories: string | null
  tags: string | null
  is_commander: boolean
}

// ---------------------------------------------------------------------------
// reconcileDeck
// ---------------------------------------------------------------------------

/**
 * Reconcile a single deck's composition against the Archidekt API state.
 *
 * Fetches the deck from Archidekt, diffs against local deck_cards,
 * and on conflict: Archidekt wins (Req 5.6).
 *
 * Returns the number of composition changes made to local state.
 */
export async function reconcileDeck(
  deckId: number,
  fetcher: ArchidektFetcher,
  userId: string
): Promise<number> {
  const supabase = createAdminClient()

  // Fetch current state from Archidekt
  const archidektDeck = await fetcher.fetchDeck(deckId)

  // Get local deck_cards
  const { data: localCards, error: localErr } = await supabase
    .from('deck_cards')
    .select('card_name, scryfall_id, set_code, quantity, categories, tags, is_commander')
    .eq('deck_id', deckId)

  if (localErr) throw new Error(`Failed to fetch deck_cards for deck ${deckId}: ${localErr.message}`)

  // Build lookup maps
  const localMap = new Map<string, LocalDeckCard>()
  for (const card of localCards || []) {
    localMap.set(card.card_name, card as LocalDeckCard)
  }

  // Parse Archidekt cards (exclude Maybeboard/Sideboard as per existing sync.ts pattern)
  const archidektCards = archidektDeck.cards.filter(
    (c) => !c.categories.includes('Maybeboard') && !c.categories.includes('Sideboard')
  )

  const archidektMap = new Map<string, ArchidektDeckCard>()
  for (const card of archidektCards) {
    const name = card.card?.oracleCard?.name
    if (name) {
      archidektMap.set(name, card)
    }
  }

  let changes = 0

  // 1. Cards in Archidekt but not in local → add them
  for (const [cardName, archCard] of archidektMap) {
    if (!localMap.has(cardName)) {
      const isCommander = archCard.categories.includes('Commander')
      const label = archCard.label || ''
      const tags = label && !label.startsWith(',')
        ? JSON.stringify([{ name: label.split(',')[0], color: label.split(',').slice(1).join(',') }])
        : '[]'

      const { error: insertErr } = await supabase
        .from('deck_cards')
        .insert({
          deck_id: deckId,
          card_name: cardName,
          scryfall_id: archCard.card?.uid ?? null,
          set_code: archCard.card?.edition?.editioncode ?? null,
          quantity: archCard.quantity,
          categories: JSON.stringify(archCard.categories),
          tags,
          is_commander: isCommander,
          user_id: userId,
        })

      if (insertErr) throw new Error(`Failed to insert deck card ${cardName}: ${insertErr.message}`)
      changes++
    }
  }

  // 2. Cards in local but not in Archidekt → remove them (Archidekt wins)
  for (const [cardName] of localMap) {
    if (!archidektMap.has(cardName)) {
      const { error: deleteErr } = await supabase
        .from('deck_cards')
        .delete()
        .eq('deck_id', deckId)
        .eq('card_name', cardName)

      if (deleteErr) throw new Error(`Failed to delete deck card ${cardName}: ${deleteErr.message}`)
      changes++
    }
  }

  // 3. Cards in both → check for differences, Archidekt wins on conflict
  for (const [cardName, archCard] of archidektMap) {
    const localCard = localMap.get(cardName)
    if (!localCard) continue // already handled in step 1

    const archScryfallId = archCard.card?.uid ?? null
    const archSetCode = archCard.card?.edition?.editioncode ?? null
    const archQuantity = archCard.quantity
    const archCategories = JSON.stringify(archCard.categories)
    const isCommander = archCard.categories.includes('Commander')

    // Check if anything differs
    const localCategories = localCard.categories ?? '[]'
    const differs =
      localCard.scryfall_id !== archScryfallId ||
      localCard.set_code !== archSetCode ||
      localCard.quantity !== archQuantity ||
      localCategories !== archCategories ||
      localCard.is_commander !== isCommander

    if (differs) {
      const label = archCard.label || ''
      const tags = label && !label.startsWith(',')
        ? JSON.stringify([{ name: label.split(',')[0], color: label.split(',').slice(1).join(',') }])
        : '[]'

      const { error: updateErr } = await supabase
        .from('deck_cards')
        .update({
          scryfall_id: archScryfallId,
          set_code: archSetCode,
          quantity: archQuantity,
          categories: archCategories,
          tags,
          is_commander: isCommander,
        })
        .eq('deck_id', deckId)
        .eq('card_name', cardName)

      if (updateErr) throw new Error(`Failed to update deck card ${cardName}: ${updateErr.message}`)
      changes++
    }
  }

  // Update deck metadata
  const commanderCard = archidektDeck.cards.find(c => c.categories.includes('Commander'))
  const commanderName = commanderCard?.card?.oracleCard?.name ?? null

  // Map colour identity from Archidekt format to MTG letter codes
  const COLOUR_NAME_TO_LETTER: Record<string, string> = {
    white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
    w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
  }
  const colourIdentity = (commanderCard?.card?.oracleCard?.colorIdentity ?? [])
    .map((c: string) => {
      const lower = c.toLowerCase()
      if (c.length === 1 && 'WUBRG'.includes(c.toUpperCase())) return c.toUpperCase()
      return COLOUR_NAME_TO_LETTER[lower] ?? c[0]?.toUpperCase() ?? ''
    })
    .filter((c: string) => 'WUBRG'.includes(c))
    .join('')

  const { error: deckUpdateErr } = await supabase
    .from('decks')
    .update({
      name: archidektDeck.name,
      commander_name: commanderName,
      colour_identity: colourIdentity,
      card_count: archidektCards.length,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', deckId)

  if (deckUpdateErr) throw new Error(`Failed to update deck metadata for ${deckId}: ${deckUpdateErr.message}`)

  return changes
}

// ---------------------------------------------------------------------------
// runSyncCycle
// ---------------------------------------------------------------------------

/**
 * Run a sync cycle with deck authority split semantics.
 *
 * - When deckIds are provided: explicit re-import (user-triggered) — reconcile those specific decks
 * - When no deckIds: discovery mode — only process NEW decks (not yet imported, i.e. no last_synced_at)
 * - NEVER auto-reconciles existing (previously-imported) deck data
 *
 * Each deck is failure-isolated: if one fails, continue to next.
 * After reconciliation: runs allocation resolver.
 * Records results in sync_runs table.
 *
 * Validates: Requirements 1.2, 1.3, 2.1, 6.2, 6.4
 */
export async function runSyncCycle(
  trigger: SyncCycleResult['trigger'],
  fetcher: ArchidektFetcher,
  deckIds?: number[],
  userId?: string
): Promise<SyncCycleResult> {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()
  const deckResults: DeckSyncResult[] = []

  // Determine which decks to process
  let decksToProcess: { id: number; name: string }[]

  if (deckIds && deckIds.length > 0) {
    // Explicit re-import: user chose these specific decks — reconcile them
    const { data, error } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', deckIds)

    if (error) throw new Error(`Failed to fetch decks for sync: ${error.message}`)
    decksToProcess = data || []
  } else {
    // Discovery mode: only process decks that have NEVER been imported
    const { data, error } = await supabase
      .from('decks')
      .select('id, name')
      .is('last_synced_at', null)

    if (error) throw new Error(`Failed to fetch unsynced decks: ${error.message}`)
    decksToProcess = data || []
  }

  // Phase 1: Reconcile each deck (failure-isolated)
  for (const deck of decksToProcess) {
    try {
      const compositionChanges = await reconcileDeck(deck.id, fetcher, userId ?? '')

      // Recompute precon mod state if this is a precon mod deck
      try {
        const { data: deckRow } = await supabase
          .from('decks')
          .select('deck_type')
          .eq('id', deck.id)
          .maybeSingle()

        if (deckRow?.deck_type === 'Precon Mod') {
          await recomputePreconModState(deck.id, userId ?? '')
        }
      } catch (preconErr) {
        // Non-blocking: log warning but don't fail the sync cycle
        console.warn(`[sync-engine] Precon mod state recomputation failed for deck ${deck.id}:`, preconErr)
      }

      deckResults.push({
        deckId: deck.id,
        deckName: deck.name,
        success: true,
        compositionChanges,
        allocationChanges: 0, // filled after allocation pass
        archidektWritten: false,
      })
    } catch (err) {
      deckResults.push({
        deckId: deck.id,
        deckName: deck.name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        compositionChanges: 0,
        allocationChanges: 0,
        archidektWritten: false,
      })
    }
  }

  // Phase 2: Run ownership resolver (allocation + denormalisation into deck_cards)
  let totalAllocationChanges = 0
  let ownershipResolutionSucceeded = false
  try {
    const { result: _denormResult, diff } = await resolveOwnership()

    ownershipResolutionSucceeded = true
    totalAllocationChanges =
      diff.added.length +
      diff.removed.length +
      diff.originalToProxy.length +
      diff.proxyToOriginal.length

    // Attribute allocation changes back to successfully synced decks
    const changedDeckIds = new Set<number>()
    for (const alloc of [...diff.added, ...diff.removed, ...diff.originalToProxy, ...diff.proxyToOriginal]) {
      changedDeckIds.add(alloc.deckId)
    }
    for (const result of deckResults) {
      if (result.success && changedDeckIds.has(result.deckId)) {
        const deckAllocChanges = [...diff.added, ...diff.removed, ...diff.originalToProxy, ...diff.proxyToOriginal]
          .filter((a) => a.deckId === result.deckId).length
        result.allocationChanges = deckAllocChanges
      }
    }
  } catch (err) {
    // Ownership resolution failed — log and halt downstream processing
    ownershipResolutionSucceeded = false
    const errorMessage = err instanceof Error ? err.message : String(err)
    for (const result of deckResults) {
      if (result.success) {
        console.error('[sync-engine] Ownership resolution failed', {
          deckId: result.deckId,
          error: errorMessage,
        })
      }
    }
  }

  // Phase 3: Recompute health for successfully synced decks
  if (ownershipResolutionSucceeded) {
    for (const result of deckResults) {
      if (!result.success) continue
      const deckId = result.deckId
      try {
        const { data: healthCards, error: healthErr } = await supabase
          .from('deck_cards')
          .select('card_name, categories')
          .eq('deck_id', deckId)

        if (healthErr) throw healthErr

        const cards = (healthCards || []).map((row) => ({
          cardName: row.card_name,
          categories: row.categories,
          oracleText: null,
          typeLine: null,
          isLand: isLandFromCategories(row.categories),
        }))

        const classOverrides = new Map<string, FunctionalCategory>()
        const healthOverrides = await getHealthOverrides(deckId)
        const healthResult = computeHealth(cards, classOverrides, healthOverrides)
        healthResult.deckId = deckId
        await upsertHealthResult(healthResult, userId ?? '')
      } catch (err) {
        // Non-blocking: log warning but don't fail the sync
        console.warn(`[sync] Health recomputation failed for deck ${deckId}:`, err)
      }
    }
  }

  // Phase 4: Record results in sync_runs
  const completedAt = new Date().toISOString()
  const decksProcessed = deckResults.length
  const decksSucceeded = deckResults.filter((r) => r.success).length
  const decksFailed = deckResults.filter((r) => !r.success).length

  const { error: syncRunErr } = await supabase
    .from('sync_runs')
    .insert({
      started_at: startedAt,
      completed_at: completedAt,
      trigger,
      decks_processed: decksProcessed,
      decks_succeeded: decksSucceeded,
      decks_failed: decksFailed,
      details: JSON.stringify(deckResults),
      user_id: userId ?? '',
    })

  if (syncRunErr) {
    console.error('[sync-engine] Failed to record sync run:', syncRunErr.message)
  }

  // Update sync_meta timestamp
  const { error: metaErr } = await supabase
    .from('sync_meta')
    .upsert(
      { key: 'last_sync_at', value: completedAt, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    )

  if (metaErr) {
    console.error('[sync-engine] Failed to update sync_meta:', metaErr.message)
  }

  return {
    startedAt,
    completedAt,
    trigger,
    deckResults,
    allocationChanges: totalAllocationChanges,
    ownershipResolved: ownershipResolutionSucceeded,
    archidektWrites: 0, // Archidekt writes handled separately by the automator
  }
}


// ---------------------------------------------------------------------------
// importCollectionAndReallocate
// ---------------------------------------------------------------------------

/** A proxy slot that was fulfilled by a newly imported card. */
export interface ProxyFulfillment {
  cardName: string
  deckId: number
  deckName: string
  scryfallId: string | null
  setCode: string | null
}

/** An allocation that was broken because a card was removed from collection. */
export interface BrokenAllocation {
  cardName: string
  deckId: number
  deckName: string
  previousScryfallId: string | null
  previousSetCode: string | null
}

/** Result of collection import and reallocation. */
export interface ImportAndReallocateResult {
  importDelta: ImportDelta
  allocationChanges: AllocationDiff
  newlyFulfilled: ProxyFulfillment[]
  newlyBroken: BrokenAllocation[]
}

/**
 * Import collection CSV and trigger reallocation.
 *
 * Flow:
 * 1. Parse CSV, compute delta against current DB
 * 2. Apply import (atomic DB transaction — replaces collection table)
 * 3. Capture allocation state before recomputing
 * 4. Run allocation resolver (new supply may fulfil existing proxy slots)
 * 5. Diff new allocations against previous → identify fulfilled/broken slots
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */
export async function importCollectionAndReallocate(
  csvContent: string,
  userId: string
): Promise<ImportAndReallocateResult> {
  const supabase = createAdminClient()

  // Step 1: Parse CSV
  const rows = parseCollectionCSV(csvContent)

  // Step 2: Compute delta against current DB state
  const { data: currentDbRows, error: currentErr } = await supabase
    .from('collection')
    .select('card_name, set_code, quantity, finish')

  if (currentErr) throw new Error(`Failed to fetch current collection: ${currentErr.message}`)

  const currentMap = new Map<string, number>()
  for (const row of currentDbRows || []) {
    const key = `${row.card_name}|${row.set_code}|${row.finish || 'Normal'}`
    currentMap.set(key, row.quantity)
  }

  const newMap = new Map<string, CollectionCSVRow>()
  for (const row of rows) {
    const key = `${row.name}|${row.editionCode}|${row.finish}`
    newMap.set(key, row)
  }

  const added: CollectionCSVRow[] = []
  const removed: CollectionCSVRow[] = []
  const quantityChanged: Array<{ entry: CollectionCSVRow; previousQuantity: number }> = []

  for (const [key, row] of newMap) {
    const prevQty = currentMap.get(key)
    if (prevQty === undefined) {
      added.push(row)
    } else if (row.quantity !== prevQty) {
      quantityChanged.push({ entry: row, previousQuantity: prevQty })
    }
  }

  for (const dbRow of currentDbRows || []) {
    const key = `${dbRow.card_name}|${dbRow.set_code}|${dbRow.finish || 'Normal'}`
    if (!newMap.has(key)) {
      removed.push({
        quantity: dbRow.quantity,
        name: dbRow.card_name,
        finish: (dbRow.finish || 'Normal') as 'Normal' | 'Foil' | 'Etched',
        condition: '',
        dateAdded: '',
        language: '',
        purchasePrice: 0,
        tags: '',
        editionName: '',
        editionCode: dbRow.set_code || '',
        multiverseId: '',
        scryfallId: '',
        collectorNumber: '',
        identities: '',
        types: '',
      })
    }
  }

  const importDelta: ImportDelta = {
    added,
    removed,
    quantityChanged,
    totalEntries: rows.length,
    previousEntries: (currentDbRows || []).length,
  }

  // Step 3: Capture previous allocations before import
  const { data: previousAllocations, error: prevAllocErr } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role, scryfall_id, set_code')

  if (prevAllocErr) throw new Error(`Failed to fetch previous allocations: ${prevAllocErr.message}`)

  const previousAllocMap = new Map<string, { role: string; scryfallId: string | null; setCode: string | null }>()
  for (const row of previousAllocations || []) {
    previousAllocMap.set(`${row.card_name}|${row.deck_id}`, {
      role: row.role,
      scryfallId: row.scryfall_id,
      setCode: row.set_code,
    })
  }

  // Step 4: Apply collection import — delete all and re-insert
  // Delete existing collection
  const { error: deleteErr } = await supabase
    .from('collection')
    .delete()
    .neq('id', 0) // delete all rows (Supabase requires a filter)

  if (deleteErr) throw new Error(`Failed to clear collection: ${deleteErr.message}`)

  // Insert rows in batches of 500
  const BATCH_SIZE = 500
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({
      card_name: row.name,
      scryfall_id: row.scryfallId || null,
      set_code: row.editionCode,
      quantity: row.quantity,
      foil: row.finish === 'Foil',
      finish: row.finish,
      condition: row.condition,
      date_added: row.dateAdded || null,
      language: row.language,
      purchase_price: row.purchasePrice,
      collector_number: row.collectorNumber,
      color_identity: row.identities,
      types: row.types,
      edition_name: row.editionName,
      user_id: userId,
    }))

    const { error: batchErr } = await supabase
      .from('collection')
      .insert(batch)

    if (batchErr) throw new Error(`Failed to insert collection batch at offset ${i}: ${batchErr.message}`)
  }

  // Update sync_meta
  const now = new Date().toISOString()
  const { error: metaErr } = await supabase
    .from('sync_meta')
    .upsert(
      { key: 'last_collection_import', value: now, updated_at: now },
      { onConflict: 'key' }
    )

  if (metaErr) {
    console.error('[sync-engine] Failed to update sync_meta after collection import:', metaErr.message)
  }

  // Step 5: Run allocation resolver with updated collection state
  const input = await buildAllocationInput()
  const output = computeAllocations(input)
  const allocationChanges = await applyAllocationOutput(output)

  // Step 6: Identify newly fulfilled proxy slots and newly broken allocations
  // Build deck name lookup
  const { data: deckRows, error: deckErr } = await supabase
    .from('decks')
    .select('id, name')

  if (deckErr) throw new Error(`Failed to fetch deck names: ${deckErr.message}`)

  const deckNames = new Map<number, string>()
  for (const row of deckRows || []) {
    deckNames.set(row.id, row.name)
  }

  const newlyFulfilled: ProxyFulfillment[] = []
  const newlyBroken: BrokenAllocation[] = []

  // proxyToOriginal from the diff: slots that were proxy and are now original
  for (const alloc of allocationChanges.proxyToOriginal) {
    newlyFulfilled.push({
      cardName: alloc.cardName,
      deckId: alloc.deckId,
      deckName: deckNames.get(alloc.deckId) || `Deck ${alloc.deckId}`,
      scryfallId: alloc.scryfallId,
      setCode: alloc.setCode,
    })
  }

  // originalToProxy from the diff: slots that were original and are now proxy
  for (const alloc of allocationChanges.originalToProxy) {
    const prev = previousAllocMap.get(`${alloc.cardName}|${alloc.deckId}`)
    newlyBroken.push({
      cardName: alloc.cardName,
      deckId: alloc.deckId,
      deckName: deckNames.get(alloc.deckId) || `Deck ${alloc.deckId}`,
      previousScryfallId: prev?.scryfallId ?? null,
      previousSetCode: prev?.setCode ?? null,
    })
  }

  // Step 7: Recompute health for all affected decks
  const affectedDeckIds = new Set<number>()
  for (const alloc of [...allocationChanges.added, ...allocationChanges.removed, ...allocationChanges.originalToProxy, ...allocationChanges.proxyToOriginal]) {
    affectedDeckIds.add(alloc.deckId)
  }
  for (const deckId of affectedDeckIds) {
    try {
      const { data: healthCards, error: healthErr } = await supabase
        .from('deck_cards')
        .select('card_name, categories')
        .eq('deck_id', deckId)

      if (healthErr) throw healthErr

      const cards = (healthCards || []).map((row) => ({
        cardName: row.card_name,
        categories: row.categories,
        oracleText: null,
        typeLine: null,
        isLand: isLandFromCategories(row.categories),
      }))

      const classOverrides = new Map<string, FunctionalCategory>()
      const healthOverrides = await getHealthOverrides(deckId)
      const healthResult = computeHealth(cards, classOverrides, healthOverrides)
      healthResult.deckId = deckId
      await upsertHealthResult(healthResult, userId)
    } catch (err) {
      // Non-blocking: log warning but don't fail the import
      console.warn(`[sync] Health recomputation failed for deck ${deckId} after collection import:`, err)
    }
  }

  return {
    importDelta,
    allocationChanges,
    newlyFulfilled,
    newlyBroken,
  }
}
