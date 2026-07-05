/**
 * Upgrade Strategy Data Builder
 *
 * Generates verified upgrade recommendation data for a deck by:
 * 1. Reading the deck's current card list from Supabase
 * 2. Accepting EDHREC candidate cards as input
 * 3. Cross-referencing each candidate against the collection table
 * 4. Checking allocation status (which other decks use the card)
 * 5. Returning classified results with ground-truth ownership
 *
 * This module exists to prevent the "hallucinated ownership" problem where
 * AI content generation marks cards as "not owned" without actually checking.
 *
 * Uses Supabase client for all database operations (async).
 */

import { createServerClient } from '@/lib/supabase'

export interface UpgradeCandidate {
  cardName: string
  role: string
  synergy: number  // EDHREC synergy percentage
  reason: string
}

export interface ClassifiedUpgrade {
  cardName: string
  role: string
  synergy: number
  reason: string
  ownership: 'free' | 'allocated' | 'not_owned'
  allocatedTo?: string  // deck name if allocated
  quantity: number      // copies owned (0 if not owned)
}

export interface UpgradeStrategyResult {
  deckId: number
  deckName: string
  commanderName: string
  totalCandidates: number
  filteredOut: number  // candidates already in the deck
  classifications: {
    free: ClassifiedUpgrade[]
    allocated: ClassifiedUpgrade[]
    notOwned: ClassifiedUpgrade[]
  }
}

/**
 * Classify upgrade candidates against the Supabase database.
 *
 * @param deckId - the target deck's ID
 * @param candidates - EDHREC-sourced candidate cards
 * @returns Verified classification with ground-truth ownership data
 */
export async function classifyUpgradeCandidates(
  deckId: number,
  candidates: UpgradeCandidate[]
): Promise<UpgradeStrategyResult> {
  const supabase = createServerClient()

  // Get deck metadata
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('id, name, commander_name')
    .eq('id', deckId)
    .maybeSingle()

  if (deckError) {
    throw new Error(`Failed to fetch deck ${deckId}: ${deckError.message}`)
  }

  if (!deck) {
    return {
      deckId,
      deckName: 'Unknown',
      commanderName: 'Unknown',
      totalCandidates: candidates.length,
      filteredOut: 0,
      classifications: { free: [], allocated: [], notOwned: [] },
    }
  }

  // Get all cards currently in this deck
  const { data: deckCardRows, error: deckCardsError } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('deck_id', deckId)

  if (deckCardsError) {
    throw new Error(`Failed to fetch deck cards for deck ${deckId}: ${deckCardsError.message}`)
  }

  const deckCards = new Set((deckCardRows ?? []).map(r => r.card_name))

  // Filter out candidates already in the deck
  const notInDeck = candidates.filter(c => !deckCards.has(c.cardName))
  const filteredOut = candidates.length - notInDeck.length

  // Classify each remaining candidate
  const free: ClassifiedUpgrade[] = []
  const allocated: ClassifiedUpgrade[] = []
  const notOwned: ClassifiedUpgrade[] = []

  for (const candidate of notInDeck) {
    // Check ownership in collection
    const { data: ownershipRows, error: ownershipError } = await supabase
      .from('collection')
      .select('quantity')
      .eq('card_name', candidate.cardName)

    if (ownershipError) {
      throw new Error(`Failed to check ownership for ${candidate.cardName}: ${ownershipError.message}`)
    }

    const quantity = (ownershipRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0)

    if (quantity <= 0) {
      // Not owned
      notOwned.push({
        ...candidate,
        ownership: 'not_owned',
        quantity: 0,
      })
    } else {
      // Owned — check if allocated to another deck
      const { data: otherDeckRows, error: otherDecksError } = await supabase
        .from('deck_cards')
        .select('deck_id')
        .eq('card_name', candidate.cardName)
        .neq('deck_id', deckId)

      if (otherDecksError) {
        throw new Error(`Failed to check allocation for ${candidate.cardName}: ${otherDecksError.message}`)
      }

      if (otherDeckRows && otherDeckRows.length > 0) {
        // Get the name of the first deck that uses this card
        const { data: otherDeck, error: otherDeckError } = await supabase
          .from('decks')
          .select('name')
          .eq('id', otherDeckRows[0].deck_id)
          .maybeSingle()

        if (otherDeckError) {
          throw new Error(`Failed to fetch deck name: ${otherDeckError.message}`)
        }

        allocated.push({
          ...candidate,
          ownership: 'allocated',
          allocatedTo: otherDeck?.name ?? 'Unknown',
          quantity,
        })
      } else {
        free.push({
          ...candidate,
          ownership: 'free',
          quantity,
        })
      }
    }
  }

  // Sort each group by synergy descending
  const sortBySynergy = (a: ClassifiedUpgrade, b: ClassifiedUpgrade) => b.synergy - a.synergy
  free.sort(sortBySynergy)
  allocated.sort(sortBySynergy)
  notOwned.sort(sortBySynergy)

  return {
    deckId,
    deckName: deck.name,
    commanderName: deck.commander_name || 'Unknown',
    totalCandidates: candidates.length,
    filteredOut,
    classifications: { free, allocated, notOwned },
  }
}
