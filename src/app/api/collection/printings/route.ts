import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import {
  groupPhysicalCopiesToPrintingRows,
  computeAllocationState,
  lookupPrice,
  type RawPhysicalCopy,
  type PrintingRowResponse,
} from '@/lib/collection-printing-utils'

/**
 * GET /api/collection/printings
 *
 * Returns the flat printing-level collection view. Each unique combination of
 * (cardName, scryfallPrintingId, isFoil) becomes one row with summed quantity.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1, 5.2
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollectionPrintingsResponse {
  rows: PrintingRowResponse[]
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000 // Match Supabase PostgREST max_rows default

// ---------------------------------------------------------------------------
// Paginated fetch helper — reduces boilerplate for paginated Supabase queries
// ---------------------------------------------------------------------------

async function fetchAll<T>(
  query: (offset: number, limit: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const results: T[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await query(offset, PAGE_SIZE)
    if (error) throw new Error(error.message)
    const page = data || []
    results.push(...page)
    hasMore = page.length === PAGE_SIZE
    offset += PAGE_SIZE
  }

  return results
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  try {
    // ──── FALLBACK CHECK (parallel count queries) ────
    const [{ count: physicalCopiesCount }, { count: collectionCount }] = await Promise.all([
      supabase.from('physical_copies').select('*', { count: 'exact', head: true }),
      supabase.from('collection').select('*', { count: 'exact', head: true }),
    ])

    const useCollectionFallback =
      !physicalCopiesCount ||
      physicalCopiesCount === 0 ||
      (collectionCount && physicalCopiesCount < collectionCount * 0.8)

    if (useCollectionFallback) {
      return await serveFallback(supabase)
    }

    // ──── PARALLEL DATA FETCH ────
    // All queries + price metadata run concurrently
    const [physicalCopiesRaw, deckUsageRaw, activeDeckIds, allocationRoles, priceRows, setInfoRows, lastPriceRefresh, priceStale] =
      await Promise.all([
        // 1. Physical copies + card definitions (BOTH originals AND proxies)
        fetchAll<{
          id: number
          card_definition_id: number
          scryfall_printing_id: string | null
          is_foil: boolean
          is_proxy: boolean
          card_definitions: { card_name: string; color_identity: string | null } | null
        }>((offset, limit) =>
          supabase
            .from('physical_copies')
            .select(`
              id,
              card_definition_id,
              scryfall_printing_id,
              is_foil,
              is_proxy,
              card_definitions!physical_copies_card_definition_id_fkey (
                card_name,
                color_identity
              )
            `)
            .range(offset, offset + limit - 1) as any
        ),

        // 2. Deck cards usage (all decks — we'll filter to active later)
        fetchAll<{
          physical_copy_id: number | null
          deck_id: number
          card_name: string
          decks: { name: string; status: string } | null
        }>((offset, limit) =>
          supabase
            .from('deck_cards')
            .select(`
              physical_copy_id,
              deck_id,
              card_name,
              decks!deck_cards_deck_id_fkey ( name, status )
            `)
            .not('physical_copy_id', 'is', null)
            .range(offset, offset + limit - 1) as any
        ),

        // 3. Get active deck IDs for allocation computation
        supabase
          .from('decks')
          .select('id')
          .eq('status', 'active')
          .then(({ data }) => new Set((data || []).map((d: { id: number }) => d.id))),

        // 4. Deck allocations (role per card+deck)
        fetchAll<{
          card_name: string
          deck_id: number
          role: string
        }>((offset, limit) =>
          supabase
            .from('deck_allocations')
            .select('card_name, deck_id, role')
            .range(offset, offset + limit - 1) as any
        ),

        // 5. Prices
        fetchAll<{
          scryfall_printing_id: string
          price_retail: number
          is_foil: boolean
        }>((offset, limit) =>
          supabase
            .from('card_kingdom_prices')
            .select('scryfall_printing_id, price_retail, is_foil')
            .range(offset, offset + limit - 1) as any
        ),

        // 6. Set info from printing_set_info reference table
        fetchAll<{
          scryfall_printing_id: string
          set_code: string
          edition_name: string
        }>((offset, limit) =>
          (supabase
            .from('printing_set_info' as any)
            .select('scryfall_printing_id, set_code, edition_name')
            .range(offset, offset + limit - 1)) as any
        ),

        // 7. Price metadata
        getLastRefreshTimestamp(),
        isPriceDataStale(),
      ])

    // ──── PROCESS RESULTS ────

    // Normalize physical copies
    const allPhysicalCopies = physicalCopiesRaw.map((row) => {
      const cd = row.card_definitions as unknown as { card_name: string; color_identity: string | null } | null
      return {
        id: row.id,
        card_definition_id: row.card_definition_id,
        scryfall_printing_id: row.scryfall_printing_id,
        is_foil: row.is_foil,
        is_proxy: row.is_proxy,
        quantity: 1, // Instance-level: one row = one copy
        card_name: cd?.card_name || '',
        color_identity: cd?.color_identity || null,
      }
    })

    if (allPhysicalCopies.length === 0) {
      return Response.json({ rows: [], lastPriceRefresh, isPriceStale: priceStale })
    }

    // Build price map
    const priceMap = new Map<string, number>()
    for (const row of priceRows) {
      const foilKey = `${row.scryfall_printing_id}:${row.is_foil ? 'foil' : 'normal'}`
      priceMap.set(foilKey, row.price_retail)
      const fallbackKey = `${row.scryfall_printing_id}:${row.is_foil ? 'normal' : 'foil'}`
      if (!priceMap.has(fallbackKey)) {
        priceMap.set(fallbackKey, row.price_retail)
      }
    }

    // Build set info map
    const setInfoMap = new Map<string, { setCode: string; setName: string }>()
    for (const row of setInfoRows) {
      if (row.scryfall_printing_id && !setInfoMap.has(row.scryfall_printing_id)) {
        setInfoMap.set(row.scryfall_printing_id, {
          setCode: row.set_code || '',
          setName: row.edition_name || '',
        })
      }
    }

    // Build deck usage map (only counting active decks for demand)
    // Also build a card-level role lookup from deck_allocations
    const allocationRoleMap = new Map<string, 'original' | 'proxy'>() // key: "cardName|deckId"
    for (const row of allocationRoles) {
      allocationRoleMap.set(`${row.card_name}|${row.deck_id}`, row.role as 'original' | 'proxy')
    }

    const deckUsageMap = new Map<number, Map<number, { deckName: string; role: 'original' | 'proxy' | 'unmet' }>>()
    for (const row of deckUsageRaw) {
      if (!row.physical_copy_id) continue
      // Only include usage from active decks
      const deckStatus = (row.decks as unknown as { name: string; status: string })?.status
      if (deckStatus !== 'active') continue

      let decksForCopy = deckUsageMap.get(row.physical_copy_id)
      if (!decksForCopy) {
        decksForCopy = new Map()
        deckUsageMap.set(row.physical_copy_id, decksForCopy)
      }
      const deckName = (row.decks as unknown as { name: string; status: string })?.name || ''
      if (!decksForCopy.has(row.deck_id)) {
        // Look up the role from deck_allocations
        const roleKey = `${row.card_name}|${row.deck_id}`
        const role = allocationRoleMap.get(roleKey) || 'unmet'
        decksForCopy.set(row.deck_id, { deckName, role })
      }
    }

    // Compute card-level supply aggregates (original qty and proxy qty per card name)
    const cardSupply = new Map<string, { originalQty: number; proxyQty: number }>()
    for (const pc of allPhysicalCopies) {
      const existing = cardSupply.get(pc.card_name) || { originalQty: 0, proxyQty: 0 }
      if (pc.is_proxy) {
        existing.proxyQty += pc.quantity
      } else {
        existing.originalQty += pc.quantity
      }
      cardSupply.set(pc.card_name, existing)
    }

    // Compute card-level active demand (number of active decks using this card)
    // Use deck_cards by card_name across active decks
    const cardDemand = new Map<string, Set<number>>()
    for (const row of deckUsageRaw) {
      const deckStatus = (row.decks as unknown as { name: string; status: string })?.status
      if (deckStatus !== 'active') continue
      const existing = cardDemand.get(row.card_name) || new Set()
      existing.add(row.deck_id)
      cardDemand.set(row.card_name, existing)
    }

    // Build raw copies and group
    const rawCopies: RawPhysicalCopy[] = allPhysicalCopies.map((pc) => {
      const setInfo = pc.scryfall_printing_id ? setInfoMap.get(pc.scryfall_printing_id) : undefined
      const decksMap = deckUsageMap.get(pc.id)
      const usedByDecks = decksMap
        ? Array.from(decksMap.entries()).map(([deckId, { deckName, role }]) => ({ deckId, deckName, role }))
        : []

      return {
        id: pc.id,
        cardName: pc.card_name,
        scryfallPrintingId: pc.scryfall_printing_id || '',
        setCode: setInfo?.setCode || '',
        setName: setInfo?.setName || '',
        isFoil: Boolean(pc.is_foil),
        quantity: pc.quantity,
        colorIdentity: pc.color_identity ? pc.color_identity.split(',').map((c) => c.trim()).filter(Boolean) : [],
        usedByCount: usedByDecks.length,
        usedByDecks,
        price: pc.scryfall_printing_id ? lookupPrice(priceMap, pc.scryfall_printing_id, pc.is_foil) : null,
        isProxy: Boolean(pc.is_proxy),
      }
    })

    const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

    // Populate allocation-level fields on each row
    for (const row of rows) {
      const supply = cardSupply.get(row.cardName) || { originalQty: 0, proxyQty: 0 }
      const demand = cardDemand.get(row.cardName)?.size || 0
      row.originalQty = supply.originalQty
      row.proxyQty = supply.proxyQty
      row.totalSupply = supply.originalQty + supply.proxyQty
      row.activeDemand = demand
      row.allocationState = computeAllocationState(supply.originalQty, supply.proxyQty, demand)
    }

    const response: CollectionPrintingsResponse = { rows, lastPriceRefresh, isPriceStale: priceStale }
    return Response.json(response)
  } catch (error) {
    console.error('Failed to load collection printings:', error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load collection data', detail: message },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// Fallback: serve from collection table when physical_copies is incomplete
// ---------------------------------------------------------------------------

async function serveFallback(supabase: ReturnType<typeof createAdminClient>) {
  const collRows = await fetchAll<{
    id: number
    card_name: string
    scryfall_id: string | null
    set_code: string | null
    quantity: number
    foil: boolean | null
    color_identity: string | null
    edition_name: string | null
  }>((offset, limit) =>
    supabase
      .from('collection')
      .select(
        'id, card_name, scryfall_id, set_code, quantity, foil, color_identity, edition_name'
      )
      .gt('quantity', 0)
      .range(offset, offset + limit - 1) as any
  )

  const rawCopies: RawPhysicalCopy[] = collRows.map((row) => {
    const colorIdentity = row.color_identity
      ? row.color_identity
          .split(',')
          .map((c: string) => c.trim())
          .filter(Boolean)
      : []

    return {
      id: row.id,
      cardName: row.card_name,
      scryfallPrintingId: row.scryfall_id || '',
      setCode: row.set_code || '',
      setName: row.edition_name || '',
      isFoil: row.foil || false,
      quantity: row.quantity,
      colorIdentity,
      usedByCount: 0,
      usedByDecks: [],
      price: null,
    }
  })

  const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

  const response: CollectionPrintingsResponse = {
    rows,
    lastPriceRefresh: null,
    isPriceStale: true,
  }

  return Response.json(response)
}
