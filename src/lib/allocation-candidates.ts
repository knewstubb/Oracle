/**
 * Allocation Candidates — Enriched Supply + Tiered Ranking
 *
 * Phase 1 of the deck lifecycle build. Provides:
 *   - Enriched supply query: fetch physical copies with assignment status
 *   - Tiered ranking: score candidates using a 5-tier priority system
 *
 * This module is READ-ONLY — no writes, no clearing, works incrementally
 * alongside existing assignments.
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Assignment status of a physical copy */
export interface CopyAssignment {
  deckCardsId: number
  deckId: number
  deckName: string
  /** @deprecated Use isActive instead */
  deckStatus?: string
  isActive?: boolean
}

/** Enriched supply entry with assignment and storage context */
export interface EnrichedSupplyEntry {
  physicalCopyId: number
  cardId: number
  printingId: string | null
  finish: string // 'nonfoil' | 'foil' | 'etched'
  isProxy: boolean
  condition: string | null
  locationId: number | null
  locationName: string | null
  /** null = free (unallocated), otherwise describes current assignment */
  assignedTo: CopyAssignment | null
}

/** @deprecated Use EnrichedSupplyEntry with finish/locationId instead */
export type EnrichedSupplyEntryLegacy = EnrichedSupplyEntry

/** Priority tier for candidate ranking */
export type CandidateTier = 1 | 2 | 3 | 4 | 5

/** A ranked candidate ready for picklist display */
export interface RankedCandidate {
  /** The physical copy details */
  entry: EnrichedSupplyEntry
  /** Priority tier (1=best, 5=worst) */
  tier: CandidateTier
  /** Tier explanation for UI display */
  tierLabel: string
  /** Within-tier score (higher=better match) — reuses scoreCopy logic */
  withinTierScore: number
  /** Whether this candidate can be auto-selected (tiers 1-3 only) */
  autoSelectable: boolean
}

// ---------------------------------------------------------------------------
// Enriched Supply Query
// ---------------------------------------------------------------------------

/**
 * Fetch all copies matching a card_name for a user, enriched with
 * assignment status (free vs. assigned-to-which-deck+status).
 *
 * This is a READ-ONLY query — no writes, no clearing, works incrementally
 * alongside existing assignments.
 *
 * The query joins:
 *   collection → cards (to resolve card_name → card_id)
 *   collection ← deck_cards (left join on copy_id) → decks (name, status)
 *   collection → locations (name)
 */
export async function fetchEnrichedSupply(
  cardName: string,
  userId: string
): Promise<EnrichedSupplyEntry[]> {
  const supabase = createAdminClient()

  // Step 1: Resolve card_name → card_id(s)
  let { data: cards, error: cardErr } = await supabase
    .from('user_cards')
    .select('id')
    .eq('card_name', cardName)
    .eq('user_id', userId)

  if (cardErr) throw new Error(`Failed to resolve card for "${cardName}": ${cardErr.message}`)

  // DFC fallback: if not found and name contains ' // ', try front-face only
  if ((!cards || cards.length === 0) && cardName.includes(' // ')) {
    const front = cardName.substring(0, cardName.indexOf(' // '))
    const fallback = await supabase
      .from('user_cards')
      .select('id')
      .eq('card_name', front)
      .eq('user_id', userId)
    if (!fallback.error && fallback.data && fallback.data.length > 0) {
      cards = fallback.data
    }
  }

  if (!cards || cards.length === 0) return [] // No card found — no copies possible

  const cardIds = cards.map(d => d.id)

  // Step 2: Fetch collection copies for those card_ids with nested joins
  // Use explicit FK hints for ambiguous relationships
  const { data: copies, error: copyErr } = await supabase
    .from('user_copies')
    .select(`
      id,
      card_id,
      printing_id,
      finish,
      is_proxy,
      condition,
      location_id,
      user_locations!user_copies_location_id_fkey(name),
      deck_cards!deck_cards_copy_id_fkey(
        id,
        deck_id,
        decks!deck_cards_deck_id_fkey(name, is_active)
      )
    `)
    .eq('user_id', userId)
    .in('card_id', cardIds)

  if (copyErr) throw new Error(`Failed to fetch collection copies for "${cardName}": ${copyErr.message}`)
  if (!copies) return []

  // Step 3: Map to EnrichedSupplyEntry
  return copies.map((copy: any) => {
    // deck_cards is an array (left join) — empty if unassigned
    const deckCardsArr = copy.deck_cards || []
    let assignedTo: CopyAssignment | null = null

    if (deckCardsArr.length > 0) {
      const dc = deckCardsArr[0]
      const deck = dc.decks
      assignedTo = {
        deckCardsId: dc.id,
        deckId: dc.deck_id,
        deckName: deck?.name ?? `Deck ${dc.deck_id}`,
        isActive: deck?.is_active ?? true,
      }
    }

    return {
      physicalCopyId: copy.id,
      cardId: copy.card_id,
      printingId: copy.printing_id ?? null,
      finish: copy.finish ?? 'nonfoil',
      isProxy: copy.is_proxy,
      condition: copy.condition ?? null,
      locationId: copy.location_id ?? null,
      locationName: copy.user_locations?.name ?? null,
      assignedTo,
    }
  })
}

// ---------------------------------------------------------------------------
// Batch Enriched Supply — fetch all copies for multiple card names in 2 queries
// ---------------------------------------------------------------------------

/**
 * Batch version of fetchEnrichedSupply. Resolves all card names → card_ids
 * in one query, then fetches all copies in one query.
 * Returns a Map keyed by card_name.
 */
export async function fetchBatchEnrichedSupply(
  cardNames: string[],
  userId: string
): Promise<Map<string, EnrichedSupplyEntry[]>> {
  const result = new Map<string, EnrichedSupplyEntry[]>()
  if (cardNames.length === 0) return result

  // Initialize all names with empty arrays
  for (const name of cardNames) {
    result.set(name, [])
  }

  const supabase = createAdminClient()

  // Step 1: Batch resolve card_names → card_ids
  const PAGE_SIZE = 1000
  const allCards: Array<{ id: number; card_name: string }> = []

  for (let offset = 0; offset < cardNames.length; offset += PAGE_SIZE) {
    const batch = cardNames.slice(offset, offset + PAGE_SIZE)
    const { data: cards, error } = await supabase
      .from('user_cards')
      .select('id, card_name')
      .eq('user_id', userId)
      .in('card_name', batch)

    if (error) throw new Error(`Batch cards lookup failed: ${error.message}`)
    if (cards) allCards.push(...cards)
  }

  // DFC fallback: for any unresolved names with ' // ', try front-face lookup
  const resolvedNames = new Set(allCards.map(d => d.card_name))
  const dfcFallbacks = cardNames
    .filter(n => !resolvedNames.has(n) && n.includes(' // '))
    .map(n => n.substring(0, n.indexOf(' // ')))
  if (dfcFallbacks.length > 0) {
    for (let offset = 0; offset < dfcFallbacks.length; offset += PAGE_SIZE) {
      const batch = dfcFallbacks.slice(offset, offset + PAGE_SIZE)
      const { data: cards, error } = await supabase
        .from('user_cards')
        .select('id, card_name')
        .eq('user_id', userId)
        .in('card_name', batch)
      if (!error && cards) allCards.push(...cards)
    }
  }

  if (allCards.length === 0) return result

  // Build cardId → cardName map
  const cardIdToName = new Map<number, string>()
  for (const card of allCards) {
    cardIdToName.set(card.id, card.card_name)
  }

  const cardIds = allCards.map(d => d.id)

  // Step 2: Batch fetch collection copies for all card_ids
  const allCopies: any[] = []

  for (let offset = 0; offset < cardIds.length; offset += PAGE_SIZE) {
    const batch = cardIds.slice(offset, offset + PAGE_SIZE)
    const { data: copies, error } = await supabase
      .from('user_copies')
      .select(`
        id,
        card_id,
        printing_id,
        finish,
        is_proxy,
        condition,
        location_id,
        user_locations!user_copies_location_id_fkey(name),
        deck_cards!deck_cards_copy_id_fkey(
          id,
          deck_id,
          decks!deck_cards_deck_id_fkey(name, is_active)
        )
      `)
      .eq('user_id', userId)
      .in('card_id', batch)

    if (error) throw new Error(`Batch collection fetch failed: ${error.message}`)
    if (copies) allCopies.push(...copies)
  }

  // Step 3: Map copies to EnrichedSupplyEntry and group by card_name
  for (const copy of allCopies) {
    const cardName = cardIdToName.get(copy.card_id)
    if (!cardName) continue

    const deckCardsArr = copy.deck_cards || []
    let assignedTo: CopyAssignment | null = null

    if (deckCardsArr.length > 0) {
      const dc = deckCardsArr[0]
      const deck = dc.decks
      assignedTo = {
        deckCardsId: dc.id,
        deckId: dc.deck_id,
        deckName: deck?.name ?? `Deck ${dc.deck_id}`,
        isActive: deck?.is_active ?? true,
      }
    }

    const entry: EnrichedSupplyEntry = {
      physicalCopyId: copy.id,
      cardId: copy.card_id,
      printingId: copy.printing_id ?? null,
      finish: copy.finish ?? 'nonfoil',
      isProxy: copy.is_proxy,
      condition: copy.condition ?? null,
      locationId: copy.location_id ?? null,
      locationName: copy.user_locations?.name ?? null,
      assignedTo,
    }

    result.get(cardName)!.push(entry)
  }

  return result
}

// ---------------------------------------------------------------------------
// Tier Classification
// ---------------------------------------------------------------------------

/**
 * Classify an enriched supply entry into a priority tier.
 *
 * Tier 1: Unallocated owned original in storage
 * Tier 2: Unallocated proxy already in storage
 * Tier 3: Reassign from another deck (all decks claim cards equally — never auto-selected)
 * Tier 5: Print a new proxy (synthetic — no physical copy exists)
 *
 * Note: Tier 5 is NOT derived from an existing physical copy — it's generated
 * separately when no candidates exist at all. This function only returns 1-3.
 * 
 * Tier 4 was removed when all decks started claiming cards equally (no more
 * special treatment for "brewing" vs "in_rotation" status).
 */
export function classifyTier(entry: EnrichedSupplyEntry): Exclude<CandidateTier, 4 | 5> {
  if (!entry.assignedTo) {
    // Unallocated
    return entry.isProxy ? 2 : 1
  }

  // Assigned to another deck — all decks claim equally, so this is Tier 3
  return 3
}

const TIER_LABELS: Record<CandidateTier, string> = {
  1: 'Free original in storage',
  2: 'Free proxy in storage',
  3: 'Assigned to another deck',
  4: 'Assigned to another deck', // Legacy — same as Tier 3 now
  5: 'Print new proxy',
}

// ---------------------------------------------------------------------------
// Ranking Function
// ---------------------------------------------------------------------------

/**
 * Score a candidate within its tier. Reuses the same logic as
 * computeAllocationV2's scoreCopy:
 *   +2 if printing_id matches preferred
 *   +1 if non-foil (finish === 'nonfoil')
 *
 * Extended with:
 *   +1 if condition is 'near_mint'
 */
export function scoreCandidate(
  entry: EnrichedSupplyEntry,
  preferredScryfallId: string | null
): number {
  let score = 0
  if (
    preferredScryfallId &&
    entry.printingId &&
    entry.printingId === preferredScryfallId
  ) {
    score += 2
  }
  if (entry.finish === 'nonfoil') {
    score += 1
  }
  if (entry.condition === 'near_mint') {
    score += 1
  }
  return score
}

/**
 * Given a card_name and userId, fetch all physical copy candidates and return
 * them ranked by tier (ascending) then within-tier score (descending).
 *
 * If no candidates exist at all, returns a single synthetic Tier 5 entry
 * indicating "print new proxy" is the only option.
 */
export async function getRankedCandidates(
  cardName: string,
  userId: string,
  preferredScryfallId?: string | null
): Promise<RankedCandidate[]> {
  const entries = await fetchEnrichedSupply(cardName, userId)

  if (entries.length === 0) {
    // Tier 5: nothing exists — only option is printing a new proxy
    return [{
      entry: {
        physicalCopyId: -1, // synthetic — no real copy
        cardId: -1,
        printingId: null,
        finish: 'nonfoil',
        isProxy: true,
        condition: null,
        locationId: null,
        locationName: null,
        assignedTo: null,
      },
      tier: 5,
      tierLabel: TIER_LABELS[5],
      withinTierScore: 0,
      autoSelectable: false,
    }]
  }

  // Classify and score each entry
  const ranked: RankedCandidate[] = entries.map(entry => {
    const tier = classifyTier(entry)
    const withinTierScore = scoreCandidate(entry, preferredScryfallId ?? null)
    return {
      entry,
      tier,
      tierLabel: TIER_LABELS[tier],
      withinTierScore,
      // Only Tiers 1-2 are auto-selectable — Tier 3 requires user decision since
      // all decks now claim cards equally
      autoSelectable: tier <= 2,
    }
  })

  // Sort: tier ascending, then withinTierScore descending
  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    return b.withinTierScore - a.withinTierScore
  })

  return ranked
}

/**
 * Batch version of getRankedCandidates — fetches supply for all card names
 * in 2 bulk queries instead of 2*N queries.
 * Returns a Map<cardName, RankedCandidate[]>.
 */
export async function getBatchRankedCandidates(
  cardNames: string[],
  userId: string
): Promise<Map<string, RankedCandidate[]>> {
  const supplyByName = await fetchBatchEnrichedSupply(cardNames, userId)
  const result = new Map<string, RankedCandidate[]>()

  for (const [cardName, entries] of supplyByName) {
    if (entries.length === 0) {
      // Tier 5: no copies exist
      result.set(cardName, [{
        entry: {
          physicalCopyId: -1,
          cardId: -1,
          printingId: null,
          finish: 'nonfoil',
          isProxy: true,
          condition: null,
          locationId: null,
          locationName: null,
          assignedTo: null,
        },
        tier: 5,
        tierLabel: TIER_LABELS[5],
        withinTierScore: 0,
        autoSelectable: false,
      }])
      continue
    }

    const ranked: RankedCandidate[] = entries.map(entry => {
      const tier = classifyTier(entry)
      const withinTierScore = scoreCandidate(entry, null)
      return {
        entry,
        tier,
        tierLabel: TIER_LABELS[tier],
        withinTierScore,
        // Only Tiers 1-2 are auto-selectable — Tier 3 requires user decision
        autoSelectable: tier <= 2,
      }
    })

    ranked.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      return b.withinTierScore - a.withinTierScore
    })

    result.set(cardName, ranked)
  }

  return result
}
