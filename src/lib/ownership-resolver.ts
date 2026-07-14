/**
 * Ownership Resolver — Orchestration Layer
 *
 * Bridges the allocation resolver output into the `deck_cards` table,
 * writing `ownership_status` and `proxy_of_deck_id` for every card slot.
 *
 * GUARD: This module only modifies deck_cards.ownership_status and
 * deck_cards.proxy_of_deck_id (allocation metadata). It does NOT modify
 * deck composition columns (card_name, quantity, categories, is_commander).
 * It does NOT fetch deck data from Archidekt.
 * See: deck-authority-split spec, Requirements 6.1, 6.2.
 *
 * Pipeline: buildAllocationInput → computeAllocations → applyAllocationOutput → denormaliseOwnership
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5
 */

import { createAdminClient } from '@/lib/supabase'
import type { AllocationOutput } from './allocation-resolver'
import { computeAllocations } from './allocation-resolver'
import { buildAllocationInput, applyAllocationOutput, extractProxyOverridesFromDecks } from './allocation-store'
import type { AllocationDiff } from './allocation-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DenormalisationResult {
  rowsUpdated: number
  originalCount: number
  proxyCount: number
  notOwnedCount: number
}

export interface ConflictResult {
  hasConflict: boolean
  affectedDeckName?: string
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Run the full ownership resolution pipeline:
 * 1. Extract proxy overrides from Archidekt tags on deck_cards
 * 2. Build input from DB state (with proxy tag overrides)
 * 3. Compute allocations (pure)
 * 4. Persist to deck_allocations
 * 5. Denormalise into deck_cards
 *
 * Returns the denormalisation result and the diff from applyAllocationOutput
 * for downstream consumers (e.g. tag write-back queueing).
 */
export async function resolveOwnership(): Promise<{
  result: DenormalisationResult
  diff: AllocationDiff
}> {
  // Extract pin_proxy overrides from Archidekt proxy tags/categories on deck_cards
  const proxyTagOverrides = await extractProxyOverridesFromDecks()
  const input = await buildAllocationInput(proxyTagOverrides)
  const output = computeAllocations(input)
  const diff = await applyAllocationOutput(output)
  const result = await denormaliseOwnership(output)
  return { result, diff }
}

// ---------------------------------------------------------------------------
// Denormalisation
// ---------------------------------------------------------------------------

/**
 * Write ownership_status and proxy_of_deck_id to deck_cards
 * based on the allocation output.
 *
 * Rules:
 * - role='original' → ownership_status='original', proxy_of_deck_id=NULL
 * - role='proxy'    → ownership_status='proxy', proxy_of_deck_id=<deck with original>
 * - no allocation   → ownership_status=NULL, proxy_of_deck_id=NULL
 *
 * Updates are performed via Supabase query builder calls.
 */
export async function denormaliseOwnership(
  output: AllocationOutput
): Promise<DenormalisationResult> {
  const supabase = createAdminClient()
  let originalCount = 0
  let proxyCount = 0
  let notOwnedCount = 0

  // Before processing allocations, mark all generic land rows.
  // Generic land slots are entirely outside the ownership system —
  // they get a neutral 'generic' status and never fall through to
  // original/proxy/not_owned resolution.
  const { error: genericErr } = await supabase
    .from('deck_cards')
    .update({ ownership_status: 'generic', proxy_of_deck_id: null })
    .eq('is_generic_land', true)
    .neq('ownership_status', 'generic')

  if (genericErr) throw new Error(`Failed to mark generic land rows: ${genericErr.message}`)

  // Build lookup: cardName → deckId that holds the original
  const originalHolders = new Map<string, number>()
  for (const alloc of output.allocations) {
    if (alloc.role === 'original') {
      originalHolders.set(alloc.cardName, alloc.deckId)
    }
  }

  // Track which deck_cards rows have an allocation record
  const allocatedKeys = new Set<string>()
  for (const alloc of output.allocations) {
    allocatedKeys.add(`${alloc.cardName}|${alloc.deckId}`)
  }

  // Process allocated records
  for (const alloc of output.allocations) {
    if (alloc.role === 'original') {
      const { error } = await supabase
        .from('deck_cards')
        .update({ ownership_status: 'original', proxy_of_deck_id: null })
        .eq('card_name', alloc.cardName)
        .eq('deck_id', alloc.deckId)

      if (error) throw new Error(`Failed to update deck_cards (original) for ${alloc.cardName}: ${error.message}`)
      originalCount++
    } else {
      // role='proxy' — find which deck holds the original for this card
      const holderDeckId = originalHolders.get(alloc.cardName) ?? null
      const { error } = await supabase
        .from('deck_cards')
        .update({ ownership_status: 'proxy', proxy_of_deck_id: holderDeckId })
        .eq('card_name', alloc.cardName)
        .eq('deck_id', alloc.deckId)

      if (error) throw new Error(`Failed to update deck_cards (proxy) for ${alloc.cardName}: ${error.message}`)
      proxyCount++
    }
  }

  // Mark unallocated deck_cards rows — set ownership_status to NULL
  // (unresolved slots have NULL; their status is computed dynamically)
  // Exclude generic land rows — they already have 'generic' status
  const { data: allDeckCards, error: fetchErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id')
    .eq('is_generic_land', false)

  if (fetchErr) throw new Error(`Failed to fetch deck_cards for unresolved marking: ${fetchErr.message}`)

  for (const row of allDeckCards || []) {
    const key = `${row.card_name}|${row.deck_id}`
    if (!allocatedKeys.has(key)) {
      const { error } = await supabase
        .from('deck_cards')
        .update({ ownership_status: null, proxy_of_deck_id: null })
        .eq('card_name', row.card_name)
        .eq('deck_id', row.deck_id)

      if (error) throw new Error(`Failed to update deck_cards (unresolved) for ${row.card_name}: ${error.message}`)
      notOwnedCount++
    }
  }

  return {
    rowsUpdated: originalCount + proxyCount + notOwnedCount,
    originalCount,
    proxyCount,
    notOwnedCount,
  }
}

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/**
 * Detect whether adding a card to a target deck would cause a proxy conflict.
 *
 * A conflict exists when:
 * 1. The card exists in the collection (supply > 0)
 * 2. The card is already allocated as original in another deck
 * 3. Adding it to the target deck would cause total demand to exceed supply
 *
 * Used by the upgrade panel to surface proactive warnings on recommendation cards.
 *
 * Validates: Requirements 6.1, 6.3
 */
export async function detectConflict(
  cardName: string,
  targetDeckId: number
): Promise<ConflictResult> {
  const supabase = createAdminClient()

  // Check if the card exists in the collection
  const { data: supplyRows, error: supplyErr } = await supabase
    .from('collection')
    .select('quantity')
    .eq('card_name', cardName)

  if (supplyErr) throw new Error(`Failed to fetch collection supply for ${cardName}: ${supplyErr.message}`)

  const totalSupply = (supplyRows || []).reduce((sum, r) => sum + r.quantity, 0)

  if (totalSupply === 0) {
    // Not owned — no conflict (user would need to buy it)
    return { hasConflict: false }
  }

  // Check if the card is already allocated as original in another deck
  const { data: originalRows, error: originalErr } = await supabase
    .from('deck_cards')
    .select('deck_id')
    .eq('card_name', cardName)
    .eq('ownership_status', 'original')
    .neq('deck_id', targetDeckId)
    .limit(1)

  if (originalErr) throw new Error(`Failed to fetch original allocation for ${cardName}: ${originalErr.message}`)

  let affectedDeckName: string | undefined

  if (originalRows && originalRows.length > 0) {
    // Fetch the deck name for the affected deck
    const { data: deckRow, error: deckErr } = await supabase
      .from('decks')
      .select('name')
      .eq('id', originalRows[0].deck_id)
      .single()

    if (!deckErr && deckRow) {
      affectedDeckName = deckRow.name
    }
  }

  // Check if adding to target would exceed supply
  const { data: demandRows, error: demandErr } = await supabase
    .from('deck_cards')
    .select('id')
    .eq('card_name', cardName)

  if (demandErr) throw new Error(`Failed to fetch demand count for ${cardName}: ${demandErr.message}`)

  const currentDemand = (demandRows || []).length

  if (affectedDeckName && currentDemand >= totalSupply) {
    return { hasConflict: true, affectedDeckName }
  }

  return { hasConflict: false }
}
