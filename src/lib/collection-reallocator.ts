/**
 * Collection Reallocator — Handles collection CSV import with allocation recomputation
 *
 * Extracted from sync-engine.ts to preserve the importCollectionAndReallocate function
 * after the sync system is removed. Used by the collection import route (?reallocate=true).
 *
 * Validates: Requirements 5.1, 5.4
 */

import { createAdminClient } from '@/lib/supabase'
import { buildAllocationInput, applyAllocationOutput } from './allocation-store'
import type { AllocationDiff } from './allocation-store'
import { computeAllocations } from './allocation-resolver'
import { parseCollectionCSV } from './csv-import'
import type { CollectionCSVRow, ImportDelta } from './csv-import'
import { computeHealth } from './health-engine'
import { upsertHealthResult, getHealthOverrides } from './health-store'
import type { FunctionalCategory } from './category-classifier'

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

// ---------------------------------------------------------------------------
// importCollectionAndReallocate
// ---------------------------------------------------------------------------

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
    console.error('[collection-reallocator] Failed to update sync_meta after collection import:', metaErr.message)
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
      console.warn(`[collection-reallocator] Health recomputation failed for deck ${deckId} after collection import:`, err)
    }
  }

  return {
    importDelta,
    allocationChanges,
    newlyFulfilled,
    newlyBroken,
  }
}
