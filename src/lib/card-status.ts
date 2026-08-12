/**
 * Card Status Taxonomy — Single Source of Truth
 *
 * Six states for any card slot in a deck. Used by Cards tab, grid view,
 * Picklist, Builder search, and Allocation screen. Don't duplicate this
 * taxonomy elsewhere.
 *
 * Resolved states (copy assigned to this slot):
 * - original: resolved with an owned non-proxy copy
 * - proxy: resolved with a proxy copy
 *
 * Unresolved states (no copy assigned):
 * - available: free copy exists in storage matching the preferred printing
 * - alternate: free copy exists in storage but different printing than preferred
 * - claimed: copies exist but ALL are held by other decks
 * - unowned: no copy exists anywhere in the collection
 *
 * Plus the exemption flag:
 * - generic_land: basic land exempt from tracking (skips computation entirely)
 *
 * Note: For progress bar counts, 'available' and 'alternate' are combined
 * since both represent owned cards in storage that can fill the slot.
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
  copyId: number | null
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

  // Step 1: Resolve card_names → card_ids (batch)
  const uniqueNames = [...new Set(cardNames)]

  // Paginate to handle > 1000 rows
  const PAGE_SIZE = 1000
  const allCards: Array<{ id: number; card_name: string }> = []

  for (let offset = 0; offset < uniqueNames.length; offset += PAGE_SIZE) {
    const batch = uniqueNames.slice(offset, offset + PAGE_SIZE)
    const { data: cards, error } = await supabase
      .from('user_cards')
      .select('id, card_name')
      .eq('user_id', userId)
      .in('card_name', batch)

    if (error) {
      console.error('[card-status] Failed to fetch cards:', error.message)
      return result // Return all as unowned on error
    }
    if (cards) {
      allCards.push(...cards)
    }
  }
  
  // Build card_name → [card_ids] map
  const nameToCardIds = new Map<string, number[]>()
  for (const card of allCards) {
    const existing = nameToCardIds.get(card.card_name)
    if (existing) existing.push(card.id)
    else nameToCardIds.set(card.card_name, [card.id])
  }

  // Cards with no card at all → definitely unowned
  const cardIdsToCheck = allCards.map(d => d.id)
  if (cardIdsToCheck.length === 0) return result

  // Step 2: Fetch collection copies (non-missing) with deck_cards assignment info
  // The deck_cards join tells us whether each copy is free or held
  const allCopies: Array<{
    card_id: number
    printing_id: string | null
    deck_cards: Array<{ id: number }> | null
  }> = []

  for (let offset = 0; offset < cardIdsToCheck.length; offset += PAGE_SIZE) {
    const batch = cardIdsToCheck.slice(offset, offset + PAGE_SIZE)
    const { data: copies, error: pcError } = await supabase
      .from('user_copies')
      .select('card_id, printing_id, deck_cards!deck_cards_copy_id_fkey(id)')
      .eq('user_id', userId)
      .eq('missing', false)
      .in('card_id', batch)

    if (pcError) {
      console.error('[card-status] Failed to fetch collection copies:', pcError.message)
      return result
    }
    if (copies) allCopies.push(...(copies as typeof allCopies))
  }

  // Step 3: Classify per card_id
  // Group copies by card_id, check if any are free (empty deck_cards)
  // Track whether free copies match the preferred printing
  const cardIdToStatus = new Map<number, 'has_free' | 'all_held'>()
  const cardIdToFreePrintings = new Map<number, Set<string>>()

  for (const copy of allCopies) {
    const cardId = copy.card_id
    const deckCardsArr = copy.deck_cards ?? []
    const isFree = deckCardsArr.length === 0

    if (isFree) {
      cardIdToStatus.set(cardId, 'has_free')
      // Track which printings are free
      if (copy.printing_id) {
        const existing = cardIdToFreePrintings.get(cardId) ?? new Set()
        existing.add(copy.printing_id)
        cardIdToFreePrintings.set(cardId, existing)
      }
    } else if (!cardIdToStatus.has(cardId)) {
      cardIdToStatus.set(cardId, 'all_held')
    }
  }

  // Map back to card_names
  for (const [cardName, cardIds] of nameToCardIds) {
    let hasFree = false
    let hasExactFree = false
    let hasAnyCopy = false

    const preferredPrinting = preferredPrintings?.get(cardName)

    for (const cardId of cardIds) {
      const status = cardIdToStatus.get(cardId)
      if (status === 'has_free') {
        hasFree = true
        // Check if any free copy matches the preferred printing
        if (preferredPrinting) {
          const freePrintings = cardIdToFreePrintings.get(cardId)
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
 * Takes deck_cards rows (with copy_id and is_proxy from a join)
 * and returns each with its computed status.
 */
export async function computeDeckCardStatuses(
  deckCards: Array<{
    id: number
    card_name: string
    copy_id: number | null
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
    if (card.copy_id !== null) {
      resolved.push({
        deckCardsId: card.id,
        cardName: card.card_name,
        copyId: card.copy_id,
        isProxy: card.is_proxy,
        status: card.is_proxy ? 'proxy' : 'original',
      })
    } else if (isBasicLand(card.card_name) && !card.scryfall_id) {
      // Generic basic land (no specific printing) — always considered "original"
      resolved.push({
        deckCardsId: card.id,
        cardName: card.card_name,
        copyId: null,
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
    if (card.copy_id === null && card.scryfall_id) {
      preferredPrintings.set(card.card_name, card.scryfall_id)
    }
  }

  const statusMap = await computeUnresolvedStatuses(unresolvedNames, userId, preferredPrintings)

  const unresolvedWithStatus: CardSlotWithStatus[] = unresolvedCards.map(card => ({
    deckCardsId: card.id,
    cardName: card.card_name,
    copyId: null,
    isProxy: null,
    status: statusMap.get(card.card_name) ?? 'unowned',
  }))

  return [...resolved, ...unresolvedWithStatus]
}
