/**
 * Card Status Taxonomy — Single Source of Truth
 *
 * Five states for any card slot in a deck. Used by Cards tab, grid view,
 * Picklist, Builder search, and Allocation screen. Don't duplicate this
 * taxonomy elsewhere.
 *
 * - original: resolved with an owned non-proxy copy
 * - proxy: resolved with a proxy copy
 * - open: not resolved, but a free candidate exists (Tier 1–4 possible)
 * - claimed: not resolved, copies exist but ALL are held by other decks
 * - unowned: not resolved, no copy exists anywhere in the collection
 *
 * Plus the exemption flag:
 * - generic_land: basic land exempt from tracking (skips computation entirely)
 */

import { createAdminClient } from '@/lib/supabase'
import { isBasicLand } from '@/lib/basic-lands'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardSlotStatus = 'original' | 'proxy' | 'available' | 'alternate' | 'claimed' | 'unowned' | 'generic_land'

export interface CardSlotWithStatus {
  deckCardsId: number
  cardName: string
  physicalCopyId: number | null
  isProxy: boolean | null
  status: CardSlotStatus
}

// ---------------------------------------------------------------------------
// Single-slot classification (when you already know the physical copy's proxy status)
// ---------------------------------------------------------------------------

/**
 * Classify a single card slot's status from its DB fields.
 * NOTE: For unresolved slots, this returns 'available' by default —
 * call computeBatchStatus() to distinguish open vs claimed vs unowned.
 */
export function classifySlotStatus(
  physicalCopyId: number | null,
  isProxy: boolean | null
): CardSlotStatus {
  if (physicalCopyId !== null) {
    return isProxy ? 'proxy' : 'original'
  }
  // Default for unresolved — caller must use batch computation for accurate classification
  return 'available'
}

// ---------------------------------------------------------------------------
// Batch computation — distinguishes unallocated from unowned
// ---------------------------------------------------------------------------

/**
 * For a list of unresolved card names, determine which are "unallocated"
 * (at least one free candidate exists), "claimed" (copies exist but all
 * are held by other decks), or "unowned" (no copy exists at all).
 *
 * Uses 2–3 bulk queries regardless of card count:
 * 1. Resolve all card_names → card_definition_ids in one query
 * 2. Fetch physical_copies (non-missing) with deck_cards join to determine
 *    which copies are free vs held
 * 3. Classify: free copy exists → unallocated, all held → claimed, none exist → unowned
 *
 * Returns a Map<cardName, 'available' | 'claimed' | 'unowned'>
 */
export async function computeUnresolvedStatuses(
  cardNames: string[],
  userId: string,
  /** Map of cardName → preferred scryfall_id (from deck_cards.scryfall_id) */
  preferredPrintings?: Map<string, string | null>
): Promise<Map<string, 'available' | 'alternate' | 'claimed' | 'unowned'>> {
  if (cardNames.length === 0) return new Map()

  const supabase = createAdminClient()
  const result = new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned'>()

  // Default everything to 'unowned' — we'll upgrade based on physical copies
  for (const name of cardNames) {
    result.set(name, 'unowned')
  }

  // Step 1: Resolve card_names → card_definition_ids (batch)
  const uniqueNames = [...new Set(cardNames)]

  // Paginate to handle > 1000 rows
  const PAGE_SIZE = 1000
  const allDefs: Array<{ id: number; card_name: string }> = []

  for (let offset = 0; offset < uniqueNames.length; offset += PAGE_SIZE) {
    const batch = uniqueNames.slice(offset, offset + PAGE_SIZE)
    const { data: defs, error } = await supabase
      .from('card_definitions')
      .select('id, card_name')
      .eq('user_id', userId)
      .in('card_name', batch)

    if (error) {
      console.error('[card-status] Failed to fetch card_definitions:', error.message)
      return result // Return all as unowned on error
    }
    if (defs) allDefs.push(...defs)
  }

  // Build card_name → [card_definition_ids] map
  const nameToDefIds = new Map<string, number[]>()
  for (const def of allDefs) {
    const existing = nameToDefIds.get(def.card_name)
    if (existing) existing.push(def.id)
    else nameToDefIds.set(def.card_name, [def.id])
  }

  // Cards with no card_definition at all → definitely unowned
  const defIdsToCheck = allDefs.map(d => d.id)
  if (defIdsToCheck.length === 0) return result

  // Step 2: Fetch physical_copies (non-missing) with deck_cards assignment info
  // The deck_cards join tells us whether each copy is free or held
  const allCopies: Array<{
    card_definition_id: number
    scryfall_printing_id: string | null
    deck_cards: Array<{ id: number }> | null
  }> = []

  for (let offset = 0; offset < defIdsToCheck.length; offset += PAGE_SIZE) {
    const batch = defIdsToCheck.slice(offset, offset + PAGE_SIZE)
    const { data: copies, error: pcError } = await supabase
      .from('physical_copies')
      .select('card_definition_id, scryfall_printing_id, deck_cards!deck_cards_physical_copy_id_fkey(id)')
      .eq('user_id', userId)
      .eq('missing', false)
      .in('card_definition_id', batch)

    if (pcError) {
      console.error('[card-status] Failed to fetch physical_copies:', pcError.message)
      return result
    }
    if (copies) allCopies.push(...(copies as typeof allCopies))
  }

  // Step 3: Classify per card_definition_id
  // Group copies by card_definition_id, check if any are free (empty deck_cards)
  // Track whether free copies match the preferred printing
  const defIdToStatus = new Map<number, 'has_free' | 'all_held'>()
  const defIdToFreePrintings = new Map<number, Set<string>>()

  for (const copy of allCopies) {
    const defId = copy.card_definition_id
    const deckCardsArr = copy.deck_cards ?? []
    const isFree = deckCardsArr.length === 0

    if (isFree) {
      defIdToStatus.set(defId, 'has_free')
      // Track which printings are free
      if (copy.scryfall_printing_id) {
        const existing = defIdToFreePrintings.get(defId) ?? new Set()
        existing.add(copy.scryfall_printing_id)
        defIdToFreePrintings.set(defId, existing)
      }
    } else if (!defIdToStatus.has(defId)) {
      defIdToStatus.set(defId, 'all_held')
    }
  }

  // Map back to card_names
  for (const [cardName, defIds] of nameToDefIds) {
    let hasFree = false
    let hasExactFree = false
    let hasAnyCopy = false

    const preferredPrinting = preferredPrintings?.get(cardName)

    for (const defId of defIds) {
      const status = defIdToStatus.get(defId)
      if (status === 'has_free') {
        hasFree = true
        // Check if any free copy matches the preferred printing
        if (preferredPrinting) {
          const freePrintings = defIdToFreePrintings.get(defId)
          if (freePrintings?.has(preferredPrinting)) {
            hasExactFree = true
          }
        } else {
          // No preferred printing specified — any free copy counts as exact
          hasExactFree = true
        }
        break
      } else if (status === 'all_held') {
        hasAnyCopy = true
      }
    }

    if (hasFree) {
      result.set(cardName, hasExactFree ? 'available' : 'alternate')
    } else if (hasAnyCopy) {
      result.set(cardName, 'claimed')
    }
    // Otherwise stays 'unowned' (the default)
  }

  return result
}

// ---------------------------------------------------------------------------
// Full deck status computation (convenience function for APIs)
// ---------------------------------------------------------------------------

/**
 * Compute the five-state status for every card in a deck.
 *
 * Takes deck_cards rows (with physical_copy_id and is_proxy from a join)
 * and returns each with its computed status.
 */
export async function computeDeckCardStatuses(
  deckCards: Array<{
    id: number
    card_name: string
    physical_copy_id: number | null
    is_proxy: boolean | null
    scryfall_id?: string | null
  }>,
  userId: string
): Promise<CardSlotWithStatus[]> {
  // Separate resolved from unresolved
  const resolved: CardSlotWithStatus[] = []
  const unresolvedNames: string[] = []
  const unresolvedCards: Array<{ id: number; card_name: string }> = []

  for (const card of deckCards) {
    if (card.physical_copy_id !== null) {
      resolved.push({
        deckCardsId: card.id,
        cardName: card.card_name,
        physicalCopyId: card.physical_copy_id,
        isProxy: card.is_proxy,
        status: card.is_proxy ? 'proxy' : 'original',
      })
    } else if (isBasicLand(card.card_name) && !card.scryfall_id) {
      // Generic basic land (no specific printing) — always considered "original"
      resolved.push({
        deckCardsId: card.id,
        cardName: card.card_name,
        physicalCopyId: null,
        isProxy: null,
        status: 'generic_land',
      })
    } else {
      // Unresolved: either a non-land card, or a specific-printing land
      unresolvedNames.push(card.card_name)
      unresolvedCards.push({ id: card.id, card_name: card.card_name })
    }
  }

  // Batch compute unallocated vs claimed vs unowned for unresolved cards
  // Pass preferred printings so we can distinguish 'available' (exact) from 'alternate'
  const preferredPrintings = new Map<string, string | null>()
  for (const card of deckCards) {
    if (card.physical_copy_id === null && card.scryfall_id) {
      preferredPrintings.set(card.card_name, card.scryfall_id)
    }
  }

  const statusMap = await computeUnresolvedStatuses(unresolvedNames, userId, preferredPrintings)

  const unresolvedWithStatus: CardSlotWithStatus[] = unresolvedCards.map(card => ({
    deckCardsId: card.id,
    cardName: card.card_name,
    physicalCopyId: null,
    isProxy: null,
    status: statusMap.get(card.card_name) ?? 'unowned',
  }))

  return [...resolved, ...unresolvedWithStatus]
}
