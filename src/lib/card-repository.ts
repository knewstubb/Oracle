// ---------------------------------------------------------------------------
// Brew AI Tools — CardRepository Interface & Supabase Implementation
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Data Interfaces
// ---------------------------------------------------------------------------

/** Ownership info for a single card in the user's collection */
export interface OwnedCardInfo {
  card_name: string
  quantity: number
  set_code: string | null
  foil: boolean
}

/** A single deck allocation record for a card */
export interface DeckAllocation {
  deck_id: number
  deck_name: string
  quantity: number
  is_commander: boolean
  allocation_status: 'original' | 'proxy'
}

/** A card entry within a deck context result */
export interface DeckContextCard {
  card_name: string
  primary_category: string
  additional_categories: string[]
  ownership_status: 'original' | 'proxy' | 'not_owned'
}

/** Full deck context returned for a brew session */
export interface DeckContextResult {
  total_cards: number
  cards: DeckContextCard[]
  category_counts: Record<string, number>
  category_health: Record<string, 'healthy' | 'low' | 'high'>
  suggestions: DeckContextCard[]
}

// ---------------------------------------------------------------------------
// CardRepository Interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over card/collection/deck data access.
 *
 * All methods are async (return Promises) for Supabase async I/O.
 */
export interface CardRepository {
  /** Look up owned cards by exact name(s) */
  getOwnedCards(cardNames: string[]): Promise<OwnedCardInfo[]>

  /** Query all cards owned within a colour identity */
  getCardsByColourIdentity(colours: string[]): Promise<OwnedCardInfo[]>

  /** Get deck allocations for a specific card */
  getDeckAllocations(cardName: string): Promise<DeckAllocation[]>

  /** Get current deck state for a brew session */
  getDeckContext(sessionId: number): Promise<DeckContextResult | null>

  /** Get decision log for a session (exploration phase) */
  getDecisionLog(sessionId: number): Promise<Record<string, unknown> | null>
}

// ---------------------------------------------------------------------------
// Supabase Implementation
// ---------------------------------------------------------------------------

/**
 * Supabase-backed implementation of CardRepository.
 *
 * Uses the Supabase query builder for all database operations.
 */
class SupabaseCardRepository implements CardRepository {
  async getOwnedCards(cardNames: string[]): Promise<OwnedCardInfo[]> {
    if (cardNames.length === 0) return []

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('collection')
      .select('*')
      .in('card_name', cardNames)

    if (error) {
      throw new Error(`getOwnedCards failed: ${error.message}`)
    }

    // Aggregate by card_name (a card may appear in multiple rows with different printings)
    const aggregated = new Map<string, OwnedCardInfo>()
    for (const row of data ?? []) {
      const existing = aggregated.get(row.card_name)
      if (existing) {
        existing.quantity += row.quantity
      } else {
        aggregated.set(row.card_name, {
          card_name: row.card_name,
          quantity: row.quantity,
          set_code: row.set_code ?? null,
          foil: row.foil,
        })
      }
    }

    return Array.from(aggregated.values())
  }

  async getCardsByColourIdentity(colours: string[]): Promise<OwnedCardInfo[]> {
    const supabase = createAdminClient()

    // Fetch all collection entries then filter by colour identity in JS.
    // The colour_identity column stores comma-separated values (e.g., "W,U,B").
    // A card is eligible if every colour in its identity is within the provided set.
    const { data, error } = await supabase
      .from('collection')
      .select('*')

    if (error) {
      throw new Error(`getCardsByColourIdentity failed: ${error.message}`)
    }

    const colourSet = new Set(colours.map(c => c.toUpperCase()))

    const filtered = (data ?? []).filter(row => {
      if (!row.color_identity || row.color_identity === '') return true // colorless
      const cardColours = row.color_identity.split(',').map((c: string) => c.trim().toUpperCase())
      return cardColours.every((c: string) => colourSet.has(c))
    })

    // Aggregate by card_name
    const aggregated = new Map<string, OwnedCardInfo>()
    for (const row of filtered) {
      const existing = aggregated.get(row.card_name)
      if (existing) {
        existing.quantity += row.quantity
      } else {
        aggregated.set(row.card_name, {
          card_name: row.card_name,
          quantity: row.quantity,
          set_code: row.set_code ?? null,
          foil: row.foil,
        })
      }
    }

    return Array.from(aggregated.values())
  }

  async getDeckAllocations(cardName: string): Promise<DeckAllocation[]> {
    const supabase = createAdminClient()

    // Query deck_cards for this card
    const { data: deckCards, error: dcError } = await supabase
      .from('deck_cards')
      .select('*')
      .eq('card_name', cardName)

    if (dcError) {
      throw new Error(`getDeckAllocations failed: ${dcError.message}`)
    }

    if (!deckCards || deckCards.length === 0) return []

    // Get deck names for the relevant deck IDs
    const deckIds = [...new Set(deckCards.map(dc => dc.deck_id))]
    const { data: decks, error: decksError } = await supabase
      .from('decks')
      .select('*')
      .in('id', deckIds)

    if (decksError) {
      throw new Error(`getDeckAllocations decks query failed: ${decksError.message}`)
    }

    const deckNameMap = new Map<number, string>(
      (decks ?? []).map(d => [d.id, d.name])
    )

    return deckCards.map(row => ({
      deck_id: row.deck_id,
      deck_name: deckNameMap.get(row.deck_id) ?? 'Unknown',
      quantity: row.quantity,
      is_commander: row.is_commander,
      allocation_status: 'original' as const,
    }))
  }

  async getDeckContext(sessionId: number): Promise<DeckContextResult | null> {
    const supabase = createAdminClient()

    // Fetch the brew session
    const { data: session, error: sessionError } = await supabase
      .from('brew_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) return null

    if (session.deck_id) {
      // Building phase — query deck_cards for the linked deck
      const { data: cards, error: cardsError } = await supabase
        .from('deck_cards')
        .select('*')
        .eq('deck_id', session.deck_id)

      if (cardsError) {
        throw new Error(`getDeckContext cards query failed: ${cardsError.message}`)
      }

      const deckCards: DeckContextResult['cards'] = (cards ?? []).map(c => ({
        card_name: c.card_name,
        primary_category: (c.categories || 'Uncategorized').split(',')[0].trim(),
        additional_categories: (c.categories || '')
          .split(',')
          .slice(1)
          .map((s: string) => s.trim())
          .filter(Boolean),
        ownership_status: 'original' as const,
      }))

      const categoryCounts: Record<string, number> = {}
      for (const card of deckCards) {
        categoryCounts[card.primary_category] =
          (categoryCounts[card.primary_category] || 0) + 1
      }

      return {
        total_cards: deckCards.length,
        cards: deckCards,
        category_counts: categoryCounts,
        category_health: {},
        suggestions: [],
      }
    }

    // Exploration phase — return skeleton from session if available
    if (session.skeleton_json) {
      try {
        const skeleton = JSON.parse(session.skeleton_json)
        return {
          total_cards: skeleton.totalCards || 0,
          cards: [],
          category_counts: {},
          category_health: {},
          suggestions: [],
        }
      } catch {
        /* fallback to null below */
      }
    }

    return null
  }

  async getDecisionLog(
    sessionId: number
  ): Promise<Record<string, unknown> | null> {
    const supabase = createAdminClient()

    const { data: session, error } = await supabase
      .from('brew_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (error || !session?.decision_log_json) return null

    try {
      return JSON.parse(session.decision_log_json)
    } catch {
      return null
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Factory function — returns the active repository implementation */
export function getCardRepository(): CardRepository {
  return new SupabaseCardRepository()
}
