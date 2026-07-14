/**
 * GET /api/allocation
 *
 * Get current allocation state.
 * - ?view=shared            → returns cards in 2+ decks with per-deck ownership status
 * - ?view=shared&deckId=X   → returns shared cards filtered to those in deck X AND at least one other
 * - ?deckId=X               → returns allocations for that deck (legacy)
 * - ?cardName=Y             → returns allocations for that card across all decks
 * - No params               → returns the full proxy report
 *
 * Validates: Requirements 7.2, 7.3, 7.4, 7.5
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  getAllocationsForDeck,
  getAllocationsForCard,
  getProxyReport,
} from '@/lib/allocation-store'

/** Response shape for the allocation tab view */
export interface AllocationDeckEntry {
  deckId: number
  deckName: string
  ownershipStatus: 'original' | 'proxy' | null
  proxyOfDeckId: number | null
  scryfallId: string | null
  setCode: string | null
}

/** A physical copy from the collection with its deck assignment */
export interface PhysicalCopyEntry {
  collectionId: number
  scryfallId: string | null
  setCode: string | null
  editionName: string | null
  isFoil: boolean
  /** Which deck this copy is assigned to (null if unassigned) */
  assignedDeckId: number | null
  assignedDeckName: string | null
}

/** A deck that wants this card but has no physical copy assigned */
export interface UnmetDeckEntry {
  deckId: number
  deckName: string
}

export interface AllocationCardGroup {
  cardName: string
  decks: AllocationDeckEntry[]
  /** Number of owned physical copies from the collection table */
  ownedCopies: number
  /** Individual physical copies with assignment info */
  copies: PhysicalCopyEntry[]
  /** Decks that need this card but have no copy */
  unmetDecks: UnmetDeckEntry[]
}

/**
 * Returns cards appearing in 2+ decks with per-deck ownership status.
 * When deckId is provided, filters to cards in that deck AND at least one other.
 *
 * Derives allocation state from deck_cards.physical_copy_id (V2 resolver output)
 * rather than the frozen deck_allocations table.
 */
async function getSharedCardsAllocation(deckId?: number): Promise<AllocationCardGroup[]> {
  const supabase = createAdminClient()

  // Step 1: Find card names appearing in 2+ distinct active decks
  // Paginate to avoid hitting row limits
  const allCards: Array<{ card_name: string; deck_id: number }> = []
  let offset = 0
  const PAGE = 5000
  let hasMore = true

  while (hasMore) {
    const { data: page, error: pageErr } = await supabase
      .from('deck_cards')
      .select('card_name, deck_id, decks!deck_cards_deck_id_fkey(status)')
      .eq('decks.status', 'active')
      .range(offset, offset + PAGE - 1)

    if (pageErr) throw new Error(pageErr.message)
    if (page) {
      for (const row of page) {
        // Only include cards from active decks (non-active decks have decks: null due to the filter)
        if ((row as any).decks) {
          allCards.push({ card_name: row.card_name, deck_id: row.deck_id })
        }
      }
    }
    hasMore = (page?.length ?? 0) === PAGE
    offset += PAGE
  }

  if (allCards.length === 0) return []

  // Group by card_name and count distinct deck_ids
  const cardDeckMap = new Map<string, Set<number>>()
  for (const row of allCards) {
    if (!cardDeckMap.has(row.card_name)) {
      cardDeckMap.set(row.card_name, new Set())
    }
    cardDeckMap.get(row.card_name)!.add(row.deck_id)
  }

  // Filter to cards in 2+ decks
  let cardNames = [...cardDeckMap.entries()]
    .filter(([, decks]) => decks.size >= 2)
    .map(([name]) => name)

  if (cardNames.length === 0) return []

  // Step 2: If deckId filter provided, narrow to cards that include that deck
  if (deckId !== undefined) {
    cardNames = cardNames.filter((name) => cardDeckMap.get(name)!.has(deckId))
  }

  if (cardNames.length === 0) return []

  // Step 3: Get all deck_cards rows for these shared cards with ownership data
  // Supabase has a URL length limit for IN queries, so batch if needed
  const BATCH_SIZE = 200
  const allRows: Array<{
    card_name: string
    deck_id: number
    ownership_status: string | null
    proxy_of_deck_id: number | null
    scryfall_id: string | null
    set_code: string | null
    physical_copy_id: number | null
    decks: { name: string } | null
  }> = []

  for (let i = 0; i < cardNames.length; i += BATCH_SIZE) {
    const batch = cardNames.slice(i, i + BATCH_SIZE)
    const { data: batchRows, error: batchErr } = await supabase
      .from('deck_cards')
      .select('card_name, deck_id, ownership_status, proxy_of_deck_id, scryfall_id, set_code, physical_copy_id, decks!deck_cards_deck_id_fkey(name)')
      .in('card_name', batch)

    if (batchErr) throw new Error(batchErr.message)
    if (batchRows) allRows.push(...(batchRows as any))
  }

  const rows = allRows
  if (rows.length === 0) return []

  // Step 4: Group by card_name and build deck entries
  const groupMap = new Map<string, { cardName: string; decks: AllocationDeckEntry[] }>()

  for (const row of rows) {
    const deckName = (row.decks as unknown as { name: string })?.name ?? 'Unknown'
    if (!groupMap.has(row.card_name)) {
      groupMap.set(row.card_name, { cardName: row.card_name, decks: [] })
    }
    const group = groupMap.get(row.card_name)!
    group.decks.push({
      deckId: row.deck_id,
      deckName,
      ownershipStatus: (row.ownership_status as 'original' | 'proxy' | null) ?? null,
      proxyOfDeckId: row.proxy_of_deck_id,
      scryfallId: row.scryfall_id ?? null,
      setCode: row.set_code ?? null,
    })
  }

  // Step 5: Get physical_copies for these card names (via card_definitions join)
  // This replaces the old collection + deck_allocations queries
  // First, get card_definition_ids for our shared card names
  const cardDefsByName = new Map<string, number[]>() // card_name → card_definition_ids
  for (let i = 0; i < cardNames.length; i += BATCH_SIZE) {
    const batch = cardNames.slice(i, i + BATCH_SIZE)
    const { data: cdRows, error: cdErr } = await supabase
      .from('card_definitions')
      .select('id, card_name')
      .in('card_name', batch)

    if (cdErr) throw new Error(cdErr.message)
    for (const row of cdRows || []) {
      const existing = cardDefsByName.get(row.card_name)
      if (existing) existing.push(row.id)
      else cardDefsByName.set(row.card_name, [row.id])
    }
  }

  // Now query physical_copies by card_definition_id
  const allCardDefIds = [...cardDefsByName.values()].flat()
  const physicalCopiesByCard = new Map<string, Array<{
    id: number
    scryfallPrintingId: string | null
    setCode: string | null
    isFoil: boolean
    isProxy: boolean
    cardDefinitionId: number
  }>>()

  // Build reverse lookup: card_definition_id → card_name
  const cardDefIdToName = new Map<number, string>()
  for (const [name, ids] of cardDefsByName.entries()) {
    for (const id of ids) {
      cardDefIdToName.set(id, name)
    }
  }

  for (let i = 0; i < allCardDefIds.length; i += BATCH_SIZE) {
    const batch = allCardDefIds.slice(i, i + BATCH_SIZE)
    const { data: pcRows, error: pcErr } = await supabase
      .from('physical_copies')
      .select('id, scryfall_printing_id, is_foil, is_proxy, card_definition_id')
      .in('card_definition_id', batch)

    if (pcErr) throw new Error(pcErr.message)
    for (const row of pcRows || []) {
      const cardName = cardDefIdToName.get(row.card_definition_id)
      if (!cardName) continue
      const entry = {
        id: row.id,
        scryfallPrintingId: row.scryfall_printing_id,
        setCode: null as string | null, // physical_copies doesn't have set_code directly
        isFoil: row.is_foil,
        isProxy: row.is_proxy,
        cardDefinitionId: row.card_definition_id,
      }
      const existing = physicalCopiesByCard.get(cardName)
      if (existing) existing.push(entry)
      else physicalCopiesByCard.set(cardName, [entry])
    }
  }

  // Step 6: Build assignment map from deck_cards.physical_copy_id
  // For each deck_cards row with a non-null physical_copy_id, that copy is assigned to that deck
  const assignmentByPhysicalCopyId = new Map<number, { deckId: number; deckName: string }>()
  for (const row of rows) {
    if (row.physical_copy_id !== null) {
      const deckName = (row.decks as unknown as { name: string })?.name ?? 'Unknown'
      assignmentByPhysicalCopyId.set(row.physical_copy_id, {
        deckId: row.deck_id,
        deckName,
      })
    }
  }

  // Build a deck name lookup from the grouped data
  const deckNameLookup = new Map<number, string>()
  for (const group of groupMap.values()) {
    for (const d of group.decks) {
      deckNameLookup.set(d.deckId, d.deckName)
    }
  }

  // Step 7: Only return groups that still have 2+ decks, enriched with copies
  const results: AllocationCardGroup[] = []
  for (const group of groupMap.values()) {
    if (group.decks.length < 2) continue

    const cardPhysicalCopies = physicalCopiesByCard.get(group.cardName) || []

    // Build the copies array from physical_copies, using deck_cards.physical_copy_id for assignments
    const copies: PhysicalCopyEntry[] = []
    for (const pc of cardPhysicalCopies) {
      const assignment = assignmentByPhysicalCopyId.get(pc.id)
      copies.push({
        collectionId: pc.id, // physical_copies.id serves as the unique copy identifier
        scryfallId: pc.scryfallPrintingId,
        setCode: pc.setCode,
        editionName: null, // physical_copies doesn't store edition name directly
        isFoil: pc.isFoil,
        assignedDeckId: assignment?.deckId ?? null,
        assignedDeckName: assignment?.deckName ?? null,
      })
    }

    // Unmet decks: deck_cards rows for this card where physical_copy_id IS NULL
    // These represent decks that want the card but have no physical copy assigned
    const unmetDeckIds = new Set<number>()
    for (const row of rows) {
      if (row.card_name === group.cardName && row.physical_copy_id === null) {
        unmetDeckIds.add(row.deck_id)
      }
    }
    const unmetDecks: UnmetDeckEntry[] = [...unmetDeckIds].map(dId => ({
      deckId: dId,
      deckName: deckNameLookup.get(dId) || 'Unknown',
    }))

    // ownedCopies = count of non-proxy physical copies for this card
    const ownedCopies = cardPhysicalCopies.filter(pc => !pc.isProxy).length

    results.push({
      ...group,
      ownedCopies,
      copies,
      unmetDecks,
    })
  }

  return results.sort((a, b) => a.cardName.localeCompare(b.cardName))
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const searchParams = request.nextUrl.searchParams
    const viewParam = searchParams.get('view')
    const deckIdParam = searchParams.get('deckId')
    const cardNameParam = searchParams.get('cardName')

    // New: shared cards view for the Allocation tab
    if (viewParam === 'shared') {
      const deckId = deckIdParam ? parseInt(deckIdParam, 10) : undefined
      if (deckIdParam && (isNaN(deckId!) || deckId! <= 0)) {
        return Response.json(
          { success: false, error: 'deckId must be a positive integer' },
          { status: 400 }
        )
      }

      // If deckId is provided, verify the deck is active before querying shared cards
      if (deckId !== undefined) {
        const supabase = createAdminClient()
        const { data: deck } = await supabase
          .from('decks')
          .select('status')
          .eq('id', deckId)
          .maybeSingle()

        if (!deck || deck.status !== 'active') {
          return Response.json({
            cards: [],
            message: 'Deck is not active',
          })
        }
      }

      const cards = await getSharedCardsAllocation(deckId)
      return Response.json({ cards })
    }

    // New: full collection allocation view — every physical copy as its own row
    // Derives status from deck_cards.physical_copy_id instead of frozen deck_allocations
    if (viewParam === 'all') {
      const supabase = createAdminClient()

      // Step 1: Get all non-proxy physical copies with their card definition and printing info
      const allPhysicalCopies: any[] = []
      let offset = 0
      const PAGE_SIZE = 1000
      let hasMore = true

      while (hasMore) {
        const { data: page, error: pageErr } = await supabase
          .from('physical_copies')
          .select(`
            id,
            card_definition_id,
            scryfall_printing_id,
            is_foil,
            storage_location_id,
            card_definitions!physical_copies_card_definition_id_fkey(card_name)
          `)
          .eq('is_proxy', false)
          .range(offset, offset + PAGE_SIZE - 1)

        if (pageErr) {
          return Response.json({ error: pageErr.message }, { status: 500 })
        }
        if (page) allPhysicalCopies.push(...page)
        hasMore = (page?.length ?? 0) === PAGE_SIZE
        offset += PAGE_SIZE
      }

      // Step 2: Get all deck_cards rows that have a physical_copy_id assigned
      // These tell us which copies are in decks and their ownership_status
      const allDeckCardAssignments: any[] = []
      offset = 0
      hasMore = true

      while (hasMore) {
        const { data: page, error: pageErr } = await supabase
          .from('deck_cards')
          .select('physical_copy_id, deck_id, ownership_status, decks!deck_cards_deck_id_fkey(name)')
          .not('physical_copy_id', 'is', null)
          .range(offset, offset + PAGE_SIZE - 1)

        if (pageErr) {
          return Response.json({ error: pageErr.message }, { status: 500 })
        }
        if (page) allDeckCardAssignments.push(...page)
        hasMore = (page?.length ?? 0) === PAGE_SIZE
        offset += PAGE_SIZE
      }

      // Build a lookup: physical_copy_id → { deckId, deckName, ownershipStatus }
      const assignmentMap = new Map<number, { deckId: number; deckName: string; ownershipStatus: string }>()
      for (const dc of allDeckCardAssignments) {
        const deckName = (dc.decks as any)?.name ?? 'Unknown'
        assignmentMap.set(dc.physical_copy_id, {
          deckId: dc.deck_id,
          deckName,
          ownershipStatus: dc.ownership_status ?? 'original',
        })
      }

      // Step 3: Get printing_set_info for set_code lookup
      const printingIds = [...new Set(allPhysicalCopies.map((pc: any) => pc.scryfall_printing_id).filter(Boolean))]
      const printingSetMap = new Map<string, string>()

      if (printingIds.length > 0) {
        const BATCH = 200
        for (let i = 0; i < printingIds.length; i += BATCH) {
          const batch = printingIds.slice(i, i + BATCH)
          const { data: printingRows } = await (supabase as any)
            .from('printing_set_info')
            .select('scryfall_printing_id, set_code')
            .in('scryfall_printing_id', batch)

          for (const row of printingRows ?? []) {
            printingSetMap.set((row as any).scryfall_printing_id, (row as any).set_code)
          }
        }
      }

      // Step 4: Get storage location names
      const { data: locations } = await (supabase as any)
        .from('storage_locations')
        .select('id, name, color')

      const locationMap = new Map<number, { name: string; color: string }>()
      for (const loc of locations ?? []) {
        locationMap.set(loc.id, { name: loc.name, color: loc.color })
      }

      // Step 5: Build the response — one row per physical copy
      const cards: any[] = []

      for (const pc of allPhysicalCopies) {
        const cardName = (pc.card_definitions as any)?.card_name ?? 'Unknown'
        const setCode = pc.scryfall_printing_id ? (printingSetMap.get(pc.scryfall_printing_id) ?? null) : null
        const assignment = assignmentMap.get(pc.id)

        let status: 'in-deck' | 'proxy' | 'unallocated'
        let assignedDeckId: number | null = null
        let assignedDeckName: string | null = null

        if (assignment) {
          // Copy is assigned to a deck via deck_cards.physical_copy_id
          if (assignment.ownershipStatus === 'proxy') {
            status = 'proxy'
          } else {
            status = 'in-deck'
          }
          assignedDeckId = assignment.deckId
          assignedDeckName = assignment.deckName
        } else {
          status = 'unallocated'
        }

        // Storage location only shown for unallocated copies
        const loc = (status === 'unallocated' && pc.storage_location_id)
          ? locationMap.get(pc.storage_location_id)
          : null

        cards.push({
          collectionId: pc.id,
          cardName,
          setCode,
          status,
          assignedDeckId,
          assignedDeckName,
          storageLocation: loc ? { id: pc.storage_location_id, name: loc.name, color: loc.color } : null,
        })
      }

      // Sort by card name for consistent output
      cards.sort((a, b) => a.cardName.localeCompare(b.cardName))

      return Response.json({ cards, total: cards.length })
    }

    // Legacy: allocations for a specific deck
    if (deckIdParam) {
      const deckId = parseInt(deckIdParam, 10)
      if (isNaN(deckId) || deckId <= 0) {
        return Response.json(
          { success: false, error: 'deckId must be a positive integer' },
          { status: 400 }
        )
      }

      const allocations = await getAllocationsForDeck(deckId)
      return Response.json({
        success: true,
        deckId,
        allocations,
        count: allocations.length,
      })
    }

    if (cardNameParam) {
      if (!cardNameParam.trim()) {
        return Response.json(
          { success: false, error: 'cardName must not be empty' },
          { status: 400 }
        )
      }

      const allocations = await getAllocationsForCard(cardNameParam)
      return Response.json({
        success: true,
        cardName: cardNameParam,
        allocations,
        count: allocations.length,
      })
    }

    // No filter — return full proxy report
    const proxyReport = await getProxyReport()
    return Response.json({
      success: true,
      proxyReport,
      totalProxiedCards: proxyReport.length,
      totalProxySlots: proxyReport.reduce((sum, entry) => sum + entry.deficit, 0),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[allocation] Unexpected error: ${message}`)
    return Response.json(
      { success: false, error: `Unexpected error: ${message}` },
      { status: 500 }
    )
  }
}
