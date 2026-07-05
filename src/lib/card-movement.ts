/**
 * Card Movement Handler
 *
 * Handles moving a physical card from one deck to another, cascading
 * allocation changes across all decks that share the card name.
 *
 * planCardMovement validates and computes changes without writing.
 * executeCardMovement applies the plan atomically to the database.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { createAdminClient } from '@/lib/supabase'
import { computeAllocations } from './allocation-resolver'
import { buildAllocationInput, applyAllocationOutput } from './allocation-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MoveCardCommand {
  cardName: string
  fromDeckId: number
  toDeckId: number
  /** Optional: specific printing to move (if user owns multiple) */
  scryfallId?: string
  /** User ID for the authenticated user */
  userId: string
}

export interface MoveCardResult {
  success: boolean
  error?: string
  /** All allocation changes triggered by this move */
  allocationChanges: AllocationChange[]
  /** Archidekt writes needed */
  archidektWrites: ArchidektWrite[]
  /** Deck IDs affected by this move (for downstream updates) */
  affectedDecks: number[]
}

export interface AllocationChange {
  cardName: string
  deckId: number
  deckName: string
  previousRole: 'original' | 'proxy' | 'unassigned'
  newRole: 'original' | 'proxy'
}

export interface ArchidektWrite {
  deckId: number
  deckName: string
  cardName: string
  action: 'add_proxy_label' | 'remove_proxy_label'
}

// ---------------------------------------------------------------------------
// Plan Card Movement
// ---------------------------------------------------------------------------

/**
 * Validate inputs and compute the full set of allocation changes that would
 * result from moving a card. Does NOT write to the database.
 *
 * Algorithm:
 * 1. Validate: card exists in source deck (deck_cards), target deck exists
 * 2. Simulate: temporarily reassign the printing in deck_cards from source to target
 * 3. Recompute allocations for ALL decks using this card name
 * 4. Diff against current allocations to produce the change set
 */
export async function planCardMovement(command: MoveCardCommand): Promise<MoveCardResult> {
  const { cardName, fromDeckId, toDeckId, scryfallId } = command
  const supabase = createAdminClient()

  // --- Validation ---

  // Check source deck exists
  const { data: sourceDeck, error: sourceErr } = await supabase
    .from('decks')
    .select('id, name')
    .eq('id', fromDeckId)
    .single()

  if (sourceErr || !sourceDeck) {
    return {
      success: false,
      error: `Source deck with ID ${fromDeckId} does not exist`,
      allocationChanges: [],
      archidektWrites: [],
      affectedDecks: [],
    }
  }

  // Check target deck exists
  const { data: targetDeck, error: targetErr } = await supabase
    .from('decks')
    .select('id, name')
    .eq('id', toDeckId)
    .single()

  if (targetErr || !targetDeck) {
    return {
      success: false,
      error: `Target deck with ID ${toDeckId} does not exist`,
      allocationChanges: [],
      archidektWrites: [],
      affectedDecks: [],
    }
  }

  // Check card exists in source deck
  const { data: cardInSource, error: cardErr } = await supabase
    .from('deck_cards')
    .select('id, card_name, scryfall_id')
    .eq('deck_id', fromDeckId)
    .eq('card_name', cardName)
    .limit(1)
    .single()

  if (cardErr || !cardInSource) {
    return {
      success: false,
      error: `Card "${cardName}" does not exist in deck "${sourceDeck.name}" (ID: ${fromDeckId})`,
      allocationChanges: [],
      archidektWrites: [],
      affectedDecks: [],
    }
  }

  // --- Read current allocation state for this card ---
  const { data: currentAllocations, error: allocErr } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role')
    .eq('card_name', cardName)

  if (allocErr) throw new Error(`Failed to fetch current allocations: ${allocErr.message}`)

  const currentRoleMap = new Map<number, 'original' | 'proxy'>()
  for (const row of currentAllocations || []) {
    currentRoleMap.set(row.deck_id, row.role as 'original' | 'proxy')
  }

  const moveScryfallId = scryfallId || cardInSource.scryfall_id

  // --- Build allocation input with the simulated move ---
  const baseInput = await buildAllocationInput()

  // Modify the demandMap to reflect the move:
  const demandMap = new Map(baseInput.demandMap)
  const currentDemand = demandMap.get(cardName) || []

  // Check how many copies of this card exist in the source deck
  const { count: sourceCount, error: countErr } = await supabase
    .from('deck_cards')
    .select('*', { count: 'exact', head: true })
    .eq('deck_id', fromDeckId)
    .eq('card_name', cardName)

  if (countErr) throw new Error(`Failed to count source deck cards: ${countErr.message}`)

  let newDemand: number[]
  if ((sourceCount ?? 0) <= 1) {
    // After the move, source deck no longer has this card
    newDemand = currentDemand.filter((id) => id !== fromDeckId)
  } else {
    // Source deck still has other copies — keep it in demand
    newDemand = [...currentDemand]
  }

  // Add target deck if not already in demand
  if (!newDemand.includes(toDeckId)) {
    newDemand.push(toDeckId)
  }

  if (newDemand.length > 0) {
    demandMap.set(cardName, newDemand)
  } else {
    demandMap.delete(cardName)
  }

  // Update preferred printings: target deck gets the moved printing's scryfall_id
  const preferredPrintings = new Map(baseInput.preferredPrintings || new Map())
  if (moveScryfallId) {
    preferredPrintings.set(`${cardName}|${toDeckId}`, moveScryfallId)
    // Remove preferred for source if it was referencing this printing and source is being removed
    if ((sourceCount ?? 0) <= 1) {
      preferredPrintings.delete(`${cardName}|${fromDeckId}`)
    }
  }

  // Run allocation resolver with modified input
  const modifiedInput = {
    ...baseInput,
    demandMap,
    preferredPrintings,
  }
  const newOutput = computeAllocations(modifiedInput)

  // --- Compute changes by diffing current vs new allocations ---
  const allocationChanges: AllocationChange[] = []
  const archidektWrites: ArchidektWrite[] = []
  const affectedDeckSet = new Set<number>()

  // Build deck name lookup
  const { data: allDecks, error: decksErr } = await supabase
    .from('decks')
    .select('id, name')

  if (decksErr) throw new Error(`Failed to fetch decks: ${decksErr.message}`)

  const deckNames = new Map<number, string>()
  for (const d of allDecks || []) {
    deckNames.set(d.id, d.name)
  }

  // Find allocations for this card in the new output
  const newAllocationsForCard = newOutput.allocations.filter((a) => a.cardName === cardName)

  for (const newAlloc of newAllocationsForCard) {
    const previousRole = currentRoleMap.get(newAlloc.deckId)
    const deckName = deckNames.get(newAlloc.deckId) || `Deck ${newAlloc.deckId}`

    if (previousRole === undefined) {
      // New allocation (deck didn't have this card before — target deck after move)
      allocationChanges.push({
        cardName,
        deckId: newAlloc.deckId,
        deckName,
        previousRole: 'unassigned',
        newRole: newAlloc.role,
      })
      affectedDeckSet.add(newAlloc.deckId)

      if (newAlloc.role === 'proxy') {
        archidektWrites.push({
          deckId: newAlloc.deckId,
          deckName,
          cardName,
          action: 'add_proxy_label',
        })
      }
    } else if (previousRole !== newAlloc.role) {
      // Role changed
      allocationChanges.push({
        cardName,
        deckId: newAlloc.deckId,
        deckName,
        previousRole,
        newRole: newAlloc.role,
      })
      affectedDeckSet.add(newAlloc.deckId)

      archidektWrites.push({
        deckId: newAlloc.deckId,
        deckName,
        cardName,
        action: newAlloc.role === 'proxy' ? 'add_proxy_label' : 'remove_proxy_label',
      })
    }
  }

  // Check for decks that lost the card entirely (source deck after move if it was the only copy)
  for (const [deckId, prevRole] of currentRoleMap) {
    const stillHasAllocation = newAllocationsForCard.some((a) => a.deckId === deckId)
    if (!stillHasAllocation) {
      const deckName = deckNames.get(deckId) || `Deck ${deckId}`
      // This deck no longer has the card at all — track it for downstream updates
      affectedDeckSet.add(deckId)

      // If it was a proxy before, remove the proxy label
      if (prevRole === 'proxy') {
        archidektWrites.push({
          deckId,
          deckName,
          cardName,
          action: 'remove_proxy_label',
        })
      }
    }
  }

  // Always include source and target in affected decks
  affectedDeckSet.add(fromDeckId)
  affectedDeckSet.add(toDeckId)

  return {
    success: true,
    allocationChanges,
    archidektWrites,
    affectedDecks: Array.from(affectedDeckSet).sort((a, b) => a - b),
  }
}

// ---------------------------------------------------------------------------
// Execute Card Movement
// ---------------------------------------------------------------------------

/**
 * Execute a planned card movement by writing changes to the database.
 * Returns success/failure status and queues downstream updates.
 *
 * This function:
 * 1. Moves the card in deck_cards (delete from source, insert into target)
 * 2. Rebuilds allocation input with the new state
 * 3. Runs the allocation resolver
 * 4. Applies the new allocations
 * 5. Returns the list of Archidekt writes and affected decks
 */
export async function executeCardMovement(
  command: MoveCardCommand
): Promise<{
  success: boolean
  error?: string
  archidektResults: Array<{ deckId: number; queued: boolean; error?: string }>
  affectedDeckResults: Array<{ deckId: number; queued: boolean; error?: string }>
}> {
  const { cardName, fromDeckId, toDeckId, scryfallId, userId } = command
  const supabase = createAdminClient()

  // First plan to validate
  const plan = await planCardMovement(command)
  if (!plan.success) {
    return {
      success: false,
      error: plan.error,
      archidektResults: [],
      affectedDeckResults: [],
    }
  }

  try {
    // Find the specific row to move (use the most specific match)
    let rowToMove: {
      id: number
      scryfall_id: string | null
      set_code: string | null
      quantity: number
      categories: string | null
      tags: string | null
      is_commander: boolean
    } | null = null

    if (scryfallId) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('id, scryfall_id, set_code, quantity, categories, tags, is_commander')
        .eq('deck_id', fromDeckId)
        .eq('card_name', cardName)
        .eq('scryfall_id', scryfallId)
        .limit(1)
        .single()

      if (!error && data) {
        rowToMove = data
      }
    }

    if (!rowToMove) {
      const { data, error } = await supabase
        .from('deck_cards')
        .select('id, scryfall_id, set_code, quantity, categories, tags, is_commander')
        .eq('deck_id', fromDeckId)
        .eq('card_name', cardName)
        .limit(1)
        .single()

      if (error || !data) {
        throw new Error(`Card "${cardName}" not found in source deck ${fromDeckId}`)
      }
      rowToMove = data
    }

    // Delete from source
    const { error: deleteErr } = await supabase
      .from('deck_cards')
      .delete()
      .eq('id', rowToMove.id)

    if (deleteErr) throw new Error(`Failed to delete card from source deck: ${deleteErr.message}`)

    // Insert into target (preserve metadata except is_commander which is deck-specific)
    const { error: insertErr } = await supabase
      .from('deck_cards')
      .insert({
        deck_id: toDeckId,
        card_name: cardName,
        scryfall_id: rowToMove.scryfall_id,
        set_code: rowToMove.set_code,
        quantity: rowToMove.quantity,
        categories: rowToMove.categories,
        tags: rowToMove.tags,
        is_commander: false, // is_commander = false for moved cards
        user_id: userId,
      })

    if (insertErr) throw new Error(`Failed to insert card into target deck: ${insertErr.message}`)

    // Rebuild allocation input from the new DB state and recompute
    const newInput = await buildAllocationInput()
    const newOutput = computeAllocations(newInput)

    // Apply the new allocations
    await applyAllocationOutput(newOutput)
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during card movement',
      archidektResults: [],
      affectedDeckResults: [],
    }
  }

  // Queue downstream updates (they'll be processed by the sync engine)
  const archidektResults = plan.archidektWrites.map((w) => ({
    deckId: w.deckId,
    queued: true,
  }))

  const affectedDeckResults = plan.affectedDecks.map((deckId) => ({
    deckId,
    queued: true,
  }))

  return {
    success: true,
    archidektResults,
    affectedDeckResults,
  }
}
