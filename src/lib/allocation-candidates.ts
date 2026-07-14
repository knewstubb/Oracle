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
  deckStatus: string // 'brew' | 'boxed' | 'archived'
}

/** Enriched supply entry with assignment and storage context */
export interface EnrichedSupplyEntry {
  physicalCopyId: number
  cardDefinitionId: number
  scryfallPrintingId: string | null
  isFoil: boolean
  isProxy: boolean
  condition: string | null
  storageLocationId: number | null
  storageLocationName: string | null
  /** null = free (unallocated), otherwise describes current assignment */
  assignedTo: CopyAssignment | null
}

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
 * Fetch all physical copies matching a card_name for a user, enriched with
 * assignment status (free vs. assigned-to-which-deck+status).
 *
 * This is a READ-ONLY query — no writes, no clearing, works incrementally
 * alongside existing assignments.
 *
 * The query joins:
 *   physical_copies → card_definitions (to resolve card_name → card_definition_id)
 *   physical_copies ← deck_cards (left join on physical_copy_id) → decks (name, status)
 *   physical_copies → storage_locations (name)
 */
export async function fetchEnrichedSupply(
  cardName: string,
  userId: string
): Promise<EnrichedSupplyEntry[]> {
  const supabase = createAdminClient()

  // Step 1: Resolve card_name → card_definition_id(s)
  const { data: defs, error: defErr } = await supabase
    .from('card_definitions')
    .select('id')
    .eq('card_name', cardName)
    .eq('user_id', userId)

  if (defErr) throw new Error(`Failed to resolve card definition for "${cardName}": ${defErr.message}`)
  if (!defs || defs.length === 0) return [] // No card definition found — no physical copies possible

  const defIds = defs.map(d => d.id)

  // Step 2: Fetch physical_copies for those card_definition_ids with nested joins
  // Use explicit FK hints for ambiguous relationships
  const { data: copies, error: copyErr } = await supabase
    .from('physical_copies')
    .select(`
      id,
      card_definition_id,
      scryfall_printing_id,
      is_foil,
      is_proxy,
      condition,
      storage_location_id,
      storage_locations(name),
      deck_cards!deck_cards_physical_copy_id_fkey(
        id,
        deck_id,
        decks!deck_cards_deck_id_fkey(name, status)
      )
    `)
    .eq('user_id', userId)
    .in('card_definition_id', defIds)

  if (copyErr) throw new Error(`Failed to fetch physical copies for "${cardName}": ${copyErr.message}`)
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
        deckStatus: deck?.status ?? 'unknown',
      }
    }

    return {
      physicalCopyId: copy.id,
      cardDefinitionId: copy.card_definition_id,
      scryfallPrintingId: copy.scryfall_printing_id ?? null,
      isFoil: copy.is_foil,
      isProxy: copy.is_proxy,
      condition: copy.condition ?? null,
      storageLocationId: copy.storage_location_id ?? null,
      storageLocationName: copy.storage_locations?.name ?? null,
      assignedTo,
    }
  })
}

// ---------------------------------------------------------------------------
// Tier Classification
// ---------------------------------------------------------------------------

/**
 * Classify an enriched supply entry into a priority tier.
 *
 * Tier 1: Unallocated owned original in storage
 * Tier 2: Unallocated proxy already in storage
 * Tier 3: Reassign from another Brew-status deck
 * Tier 4: Reassign from another Boxed-status deck (never auto-selected)
 * Tier 5: Print a new proxy (synthetic — no physical copy exists)
 *
 * Note: Tier 5 is NOT derived from an existing physical copy — it's generated
 * separately when no candidates exist at all. This function only returns 1-4.
 */
export function classifyTier(entry: EnrichedSupplyEntry): Exclude<CandidateTier, 5> {
  if (!entry.assignedTo) {
    // Unallocated
    return entry.isProxy ? 2 : 1
  }

  // Assigned to another deck — tier depends on that deck's status
  const status = entry.assignedTo.deckStatus
  if (status === 'brew') return 3
  // Everything else (boxed, archived, unknown) is tier 4
  return 4
}

const TIER_LABELS: Record<CandidateTier, string> = {
  1: 'Free original in storage',
  2: 'Free proxy in storage',
  3: 'Reassign from Brew deck',
  4: 'Reassign from Boxed deck',
  5: 'Print new proxy',
}

// ---------------------------------------------------------------------------
// Ranking Function
// ---------------------------------------------------------------------------

/**
 * Score a candidate within its tier. Reuses the same logic as
 * computeAllocationV2's scoreCopy:
 *   +2 if scryfall_printing_id matches preferred
 *   +1 if non-foil
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
    entry.scryfallPrintingId &&
    entry.scryfallPrintingId === preferredScryfallId
  ) {
    score += 2
  }
  if (!entry.isFoil) {
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
        cardDefinitionId: -1,
        scryfallPrintingId: null,
        isFoil: false,
        isProxy: true,
        condition: null,
        storageLocationId: null,
        storageLocationName: null,
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
      autoSelectable: tier <= 3, // Tier 4 is never auto-selectable
    }
  })

  // Sort: tier ascending, then withinTierScore descending
  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier
    return b.withinTierScore - a.withinTierScore
  })

  return ranked
}
