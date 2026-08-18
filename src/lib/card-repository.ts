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
  ownership_status: 'original' | 'proxy' | null
  is_commander?: boolean
}

/** Full deck context returned for a brew session */
export interface DeckContextResult {
  total_cards: number
  cards: DeckContextCard[]
  category_counts: Record<string, number>
  category_health: Record<string, 'healthy' | 'low' | 'high'>
  suggestions: DeckContextCard[] | string[]
  commander_name?: string | null
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

  /** Search owned cards by type/subtype (e.g., "Curse", "Saga", "Equipment") */
  searchOwnedByType(typeKeyword: string, colourIdentity?: string[]): Promise<OwnedCardInfo[]>

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
 * Filters all queries by user_id to ensure data isolation.
 */
class SupabaseCardRepository implements CardRepository {
  private userId: string | null

  constructor(userId?: string) {
    this.userId = userId ?? null
  }

  async getOwnedCards(cardNames: string[]): Promise<OwnedCardInfo[]> {
    if (cardNames.length === 0) return []

    const supabase = createAdminClient()
    
    // First, find user_cards matching the requested names
    let userCardsQuery = supabase
      .from('user_cards')
      .select('id, card_name')
      .in('card_name', cardNames) // Try exact match first
    
    if (this.userId) {
      userCardsQuery = userCardsQuery.eq('user_id', this.userId)
    }
    
    const { data: userCards, error: ucError } = await userCardsQuery
    
    if (ucError) {
      throw new Error(`getOwnedCards failed: ${ucError.message}`)
    }
    
    // Also try case-insensitive match for any not found
    const foundNames = new Set((userCards ?? []).map(uc => uc.card_name.toLowerCase()))
    const missingNames = cardNames.filter(n => !foundNames.has(n.toLowerCase()))
    
    let allUserCards = userCards ?? []
    
    if (missingNames.length > 0) {
      for (const name of missingNames) {
        let fuzzyQuery = supabase
          .from('user_cards')
          .select('id, card_name')
          .ilike('card_name', name)
          .limit(1)
        
        if (this.userId) {
          fuzzyQuery = fuzzyQuery.eq('user_id', this.userId)
        }
        
        const { data: fuzzyMatch } = await fuzzyQuery
        
        if (fuzzyMatch && fuzzyMatch.length > 0) {
          allUserCards.push(fuzzyMatch[0])
        }
      }
    }
    
    if (allUserCards.length === 0) {
      return []
    }
    
    // Now fetch copies only for the cards we found
    const cardIds = allUserCards.map(uc => uc.id)
    
    let copiesQuery = supabase
      .from('user_copies')
      .select('id, card_id')
      .eq('is_proxy', false)
      .in('card_id', cardIds)
    
    if (this.userId) {
      copiesQuery = copiesQuery.eq('user_id', this.userId)
    }
    
    const { data: copies, error: copyError } = await copiesQuery

    if (copyError) {
      throw new Error(`getOwnedCards failed: ${copyError.message}`)
    }

    // Aggregate by card name
    const aggregated = new Map<string, OwnedCardInfo>()
    
    for (const copy of copies ?? []) {
      const userCard = allUserCards.find(uc => uc.id === copy.card_id)
      if (!userCard) continue
      
      const cardNameLower = userCard.card_name.toLowerCase()
      const existing = aggregated.get(cardNameLower)
      if (existing) {
        existing.quantity += 1
      } else {
        aggregated.set(cardNameLower, {
          card_name: userCard.card_name,
          quantity: 1,
          set_code: null,
          foil: false,
        })
      }
    }

    return Array.from(aggregated.values())
  }

  async getCardsByColourIdentity(colours: string[]): Promise<OwnedCardInfo[]> {
    const supabase = createAdminClient()

    // Fetch all collection entries then filter by colour identity in JS.
    // user_copies → user_cards (via card_id FK) for card_name and color_identity
    // Note: set_code would require joining ref_printings via printing_id, 
    // but that FK isn't defined. Return null for set_code for now.
    let query = supabase
      .from('user_copies')
      .select(`
        id,
        card_id,
        is_proxy,
        printing_id,
        user_cards!user_copies_card_id_fkey (
          card_name,
          color_identity
        )
      `)
      .eq('is_proxy', false)
    
    // Filter by user_id if available
    if (this.userId) {
      query = query.eq('user_id', this.userId)
    }
    
    const { data, error } = await query

    if (error) {
      throw new Error(`getCardsByColourIdentity failed: ${error.message}`)
    }

    const colourSet = new Set(colours.map(c => c.toUpperCase()))

    // Filter and aggregate
    const aggregated = new Map<string, OwnedCardInfo>()
    for (const row of data ?? []) {
      const cardInfo = row.user_cards as unknown as { card_name: string; color_identity: string | null } | null
      if (!cardInfo?.card_name) continue
      
      // Check colour identity - colorless cards (empty/null) are always eligible
      const cardColourIdentity = cardInfo.color_identity
      if (cardColourIdentity && cardColourIdentity !== '') {
        const cardColours = cardColourIdentity.split(',').map(c => c.trim().toUpperCase())
        if (!cardColours.every(c => colourSet.has(c))) continue
      }
      
      const key = cardInfo.card_name.toLowerCase()
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += 1
      } else {
        aggregated.set(key, {
          card_name: cardInfo.card_name,
          quantity: 1,
          set_code: null, // Would need separate ref_printings lookup
          foil: false,
        })
      }
    }

    return Array.from(aggregated.values())
  }

  async searchOwnedByType(typeKeyword: string, colourIdentity?: string[]): Promise<OwnedCardInfo[]> {
    const supabase = createAdminClient()

    // Step 1: Get all user's cards with their oracle IDs
    let userCardsQuery = supabase
      .from('user_cards')
      .select('id, card_name, oracle_id')
    
    if (this.userId) {
      userCardsQuery = userCardsQuery.eq('user_id', this.userId)
    }
    
    const { data: userCards, error: ucError } = await userCardsQuery
    
    if (ucError) {
      throw new Error(`searchOwnedByType failed: ${ucError.message}`)
    }
    
    if (!userCards || userCards.length === 0) {
      return []
    }
    
    // Step 2: Get card type info from ref_cards for all owned cards
    const cardNames = userCards.map(uc => uc.card_name)
    const { data: refCards, error: rcError } = await supabase
      .from('ref_cards')
      .select('name, type_line, color_identity')
      .in('name', cardNames)
    
    if (rcError) {
      throw new Error(`searchOwnedByType ref lookup failed: ${rcError.message}`)
    }
    
    // Build lookup map
    const refMap = new Map(
      (refCards ?? []).map(rc => [rc.name.toLowerCase(), rc])
    )
    
    // Step 3: Filter by type keyword
    const typeKeywordLower = typeKeyword.toLowerCase()
    const colourSet = colourIdentity 
      ? new Set(colourIdentity.map(c => c.toUpperCase()))
      : null
    
    const matchingCards: { card_name: string; user_card_id: string }[] = []
    
    for (const uc of userCards) {
      const ref = refMap.get(uc.card_name.toLowerCase())
      if (!ref) continue
      
      // Check if type_line contains the keyword
      const typeLine = (ref.type_line || '').toLowerCase()
      if (!typeLine.includes(typeKeywordLower)) continue
      
      // Check color identity if filter provided
      if (colourSet) {
        const cardColors = (ref.color_identity || '').split('').filter((c: string) => 'WUBRG'.includes(c))
        if (!cardColors.every((c: string) => colourSet.has(c))) continue
      }
      
      matchingCards.push({ card_name: uc.card_name, user_card_id: uc.id })
    }
    
    if (matchingCards.length === 0) {
      return []
    }
    
    // Step 4: Count copies for each matching card
    const userCardIds = matchingCards.map(mc => mc.user_card_id)
    
    let copiesQuery = supabase
      .from('user_copies')
      .select('id, card_id')
      .eq('is_proxy', false)
      .in('card_id', userCardIds)
    
    if (this.userId) {
      copiesQuery = copiesQuery.eq('user_id', this.userId)
    }
    
    const { data: copies, error: copyError } = await copiesQuery
    
    if (copyError) {
      throw new Error(`searchOwnedByType copies failed: ${copyError.message}`)
    }
    
    // Aggregate by card name
    const aggregated = new Map<string, OwnedCardInfo>()
    
    for (const copy of copies ?? []) {
      const mc = matchingCards.find(m => m.user_card_id === copy.card_id)
      if (!mc) continue
      
      const key = mc.card_name.toLowerCase()
      const existing = aggregated.get(key)
      if (existing) {
        existing.quantity += 1
      } else {
        aggregated.set(key, {
          card_name: mc.card_name,
          quantity: 1,
          set_code: null,
          foil: false,
        })
      }
    }
    
    return Array.from(aggregated.values())
  }

  async getDeckAllocations(cardName: string): Promise<DeckAllocation[]> {
    const supabase = createAdminClient()

    // Query deck_cards for this card
    let query = supabase
      .from('deck_cards')
      .select('*')
      .eq('card_name', cardName)
    
    // Filter by user_id if available
    if (this.userId) {
      query = query.eq('user_id', this.userId)
    }
    
    const { data: deckCards, error: dcError } = await query

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
      quantity: row.quantity ?? 1,
      is_commander: row.is_commander ?? false,
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

    // First, try to get canvas cards from skeleton_json (always up-to-date with UI)
    let canvasCards: DeckContextResult['cards'] = []
    let canvasSuggestions: string[] = []
    
    if (session.skeleton_json) {
      try {
        const skeleton = JSON.parse(session.skeleton_json)
        
        // Parse cards from skeleton (matches PersistedSkeleton.cards structure)
        if (Array.isArray(skeleton.cards)) {
          canvasCards = skeleton.cards.map((c: any) => ({
            card_name: c.card_name || c.cardName || '',
            primary_category: c.primary_category || c.primaryCategory || 'Uncategorized',
            additional_categories: c.additional_categories || c.additionalCategories || [],
            ownership_status: c.ownership_status || c.ownershipStatus || 'original',
            is_commander: c.is_commander || c.isCommander || false,
          }))
        }
        
        // Parse suggestions if available
        if (Array.isArray(skeleton.suggestions)) {
          canvasSuggestions = skeleton.suggestions.map((s: any) => 
            typeof s === 'string' ? s : (s.card_name || s.cardName || '')
          ).filter(Boolean)
        }
      } catch {
        /* skeleton parse failed, continue with other sources */
      }
    }

    // If we have canvas cards, return them (most up-to-date source)
    if (canvasCards.length > 0) {
      const categoryCounts: Record<string, number> = {}
      for (const card of canvasCards) {
        categoryCounts[card.primary_category] =
          (categoryCounts[card.primary_category] || 0) + 1
      }

      return {
        total_cards: canvasCards.length,
        cards: canvasCards,
        category_counts: categoryCounts,
        category_health: {},
        suggestions: canvasSuggestions,
        commander_name: session.commander_name || null,
      }
    }

    // Fallback: if there's a deck_id and no canvas cards, query committed deck_cards
    if (session.deck_id) {
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
        commander_name: session.commander_name || null,
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
export function getCardRepository(userId?: string): CardRepository {
  return new SupabaseCardRepository(userId)
}
