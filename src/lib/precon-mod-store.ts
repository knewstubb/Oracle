// precon-mod-store.ts — Database access layer for precon_mod_state.
// Reads/writes the precon_mod_state table and orchestrates recomputation.
// Uses Supabase client for all database operations (async).

import { createAdminClient } from '@/lib/supabase'
import { computePreconModState, type PreconModState } from './precon-mod-engine'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getPreconModState
// ---------------------------------------------------------------------------

/**
 * Fetch the precon mod state for a deck. Returns null if no record exists.
 */
export async function getPreconModState(
  deckId: number
): Promise<PreconModState | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('precon_mod_state')
    .select('swaps_used, sol_ring_removed, rarity_mythic_used, rarity_rare_used, rarity_uncommon_used, rarity_common_used, budget_spent')
    .eq('deck_id', deckId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get precon mod state for deck ${deckId}: ${error.message}`)
  }

  if (!data) return null

  return {
    swaps_used: data.swaps_used,
    sol_ring_removed: Boolean(data.sol_ring_removed),
    rarity_mythic_used: data.rarity_mythic_used,
    rarity_rare_used: data.rarity_rare_used,
    rarity_uncommon_used: data.rarity_uncommon_used,
    rarity_common_used: data.rarity_common_used,
    budget_spent: data.budget_spent,
  }
}

// ---------------------------------------------------------------------------
// upsertPreconModState
// ---------------------------------------------------------------------------

/**
 * Upsert the precon mod state for a deck.
 * Uses ON CONFLICT(deck_id) DO UPDATE (deck_id has UNIQUE constraint).
 * Sets updated_at to current timestamp.
 */
export async function upsertPreconModState(
  deckId: number,
  state: PreconModState,
  userId: string
): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('precon_mod_state')
    .upsert(
      {
        deck_id: deckId,
        swaps_used: state.swaps_used,
        sol_ring_removed: state.sol_ring_removed,
        rarity_mythic_used: state.rarity_mythic_used,
        rarity_rare_used: state.rarity_rare_used,
        rarity_uncommon_used: state.rarity_uncommon_used,
        rarity_common_used: state.rarity_common_used,
        budget_spent: state.budget_spent,
        user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'deck_id' }
    )

  if (error) {
    throw new Error(`Failed to upsert precon mod state for deck ${deckId}: ${error.message}`)
  }
}

// ---------------------------------------------------------------------------
// recomputePreconModState
// ---------------------------------------------------------------------------

/**
 * Full recomputation: queries deck_cards and precon_cards,
 * computes state via computePreconModState, upserts result.
 *
 * Rarity and price data come from the card_metadata table (populated by
 * the build-card-metadata script from Scryfall bulk data).
 */
export async function recomputePreconModState(
  deckId: number,
  userId: string
): Promise<PreconModState> {
  const supabase = createAdminClient()

  // Get the deck's precon_url for looking up original precon cards
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('precon_url')
    .eq('id', deckId)
    .maybeSingle()

  if (deckError) {
    throw new Error(`Failed to get deck ${deckId} for precon mod recomputation: ${deckError.message}`)
  }

  // Query deck cards — we need card_name, and then join with card_metadata for rarity/price.
  // Supabase query builder doesn't support arbitrary JOINs easily, so we do two queries.
  const { data: deckCardsRaw, error: dcError } = await supabase
    .from('deck_cards')
    .select('card_name, categories')
    .eq('deck_id', deckId)

  if (dcError) {
    throw new Error(`Failed to get deck cards for precon mod recomputation: ${dcError.message}`)
  }

  // Filter out Maybeboard and Sideboard cards
  const filteredDeckCards = (deckCardsRaw ?? []).filter(
    (dc) =>
      !(dc.categories ?? '').includes('Maybeboard') &&
      !(dc.categories ?? '').includes('Sideboard')
  )

  // Get card_metadata for rarity and price
  const cardNames = filteredDeckCards.map((dc) => dc.card_name)
  let metadataMap = new Map<string, { rarity: string | null; price_usd: number | null }>()

  if (cardNames.length > 0) {
    const { data: metadata, error: metaError } = await supabase
      .from('card_metadata')
      .select('card_name, rarity, price_usd')
      .in('card_name', cardNames)

    if (metaError) {
      throw new Error(`Failed to get card metadata for precon mod recomputation: ${metaError.message}`)
    }

    metadataMap = new Map(
      (metadata ?? []).map((m) => [m.card_name, { rarity: m.rarity, price_usd: m.price_usd }])
    )
  }

  // Build deck cards with rarity and price
  const deckCards = filteredDeckCards.map((dc) => {
    const meta = metadataMap.get(dc.card_name)
    return {
      card_name: dc.card_name,
      rarity: meta?.rarity ?? null,
      price_ck: meta?.price_usd ?? null,
    }
  })

  // Query precon cards (empty array if no precon_url — treats all cards as "added")
  let preconCards: Array<{ card_name: string }> = []
  if (deck?.precon_url) {
    const { data: preconData, error: preconError } = await supabase
      .from('precon_cards')
      .select('card_name')
      .eq('precon_url', deck.precon_url)

    if (preconError) {
      throw new Error(`Failed to get precon cards for recomputation: ${preconError.message}`)
    }

    preconCards = preconData ?? []
  }

  // Compute the state from the diff
  const state = computePreconModState({ deckCards, preconCards })

  // Persist
  await upsertPreconModState(deckId, state, userId)

  return state
}
