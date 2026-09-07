import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import {
  groupPhysicalCopiesToPrintingRows,
  computeAllocationState,
  type RawPhysicalCopy,
  type PrintingRowResponse,
} from '@/lib/collection-printing-utils'
import { frontFaceName } from '@/lib/basic-lands'
import { NextRequest } from 'next/server'

/**
 * GET /api/collection/printings
 *
 * Server-side paginated printing-level collection view.
 *
 * Query params:
 *   - page: 1-indexed page number (default: 1)
 *   - pageSize: rows per page (default: 100, max: 200)
 *   - search: card name search string (case-insensitive ilike)
 *   - sort: 'cardName' | 'quantity' | 'setCode' | 'price' | 'rarity' (default: 'cardName')
 *   - sortDir: 'asc' | 'desc' (default: 'asc')
 *   - colors: comma-separated color identity filter (e.g. 'B,G')
 *   - colorMode: 'exact' | 'includes' (default: 'includes')
 *   - includeProxies: 'true' | 'false' (default: 'false')
 *   - includeMissing: 'true' | 'false' (default: 'false')
 *
 * Response: { rows, totalCount, page, pageSize, lastPriceRefresh, isPriceStale }
 *
 * Schema notes (post-migration):
 *   - collection table holds all physical copies (was: physical_copies)
 *   - finish: 'nonfoil' | 'foil' | 'etched' (was: is_foil boolean)
 *   - card_id references cards table (was: card_definition_id → card_definitions)
 *   - printing_id references ref_printings
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollectionPrintingsResponse {
  rows: PrintingRowResponse[]
  totalCount: number
  page: number
  pageSize: number
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rarity ordering for server-side sort */
const RARITY_ORDER: Record<string, number> = {
  mythic: 4,
  rare: 3,
  uncommon: 2,
  common: 1,
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()
  const userId = authResult.id

  // Parse query params
  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '100', 10)))
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'cardName'
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const colors = searchParams.get('colors')?.split(',').filter(Boolean) || []
  const colorMode = searchParams.get('colorMode') || 'includes'
  const includeProxies = searchParams.get('includeProxies') === 'true'
  const includeMissing = searchParams.get('includeMissing') === 'true'

  try {
    // ──── Step 1: Fetch paginated collection copies ─────────────────
    // Fetch paginated collection copies with card name from cards table
    // Calculate range for server-side pagination
    const offset = (page - 1) * pageSize
    
    // If search is provided, first get matching card_ids from user_cards
    let matchingCardIds: number[] | null = null
    if (search) {
      const { data: matchingCards } = await supabase
        .from('user_cards')
        .select('id')
        .eq('user_id', userId)
        .ilike('card_name', `%${search}%`)
      matchingCardIds = matchingCards?.map(c => c.id) || []
      
      // If no cards match search, return empty result
      if (matchingCardIds.length === 0) {
        const [lastPriceRefresh, priceStale] = await Promise.all([
          getLastRefreshTimestamp(),
          isPriceDataStale(),
        ])
        return Response.json({
          rows: [],
          totalCount: 0,
          page,
          pageSize,
          lastPriceRefresh,
          isPriceStale: priceStale,
        } as CollectionPrintingsResponse)
      }
    }
    
    // Note: We can only sort by columns directly on user_copies at the DB level.
    // For card_name sort, we need to sort after enriching with user_cards data.
    // For other sorts (setCode, rarity, price), we need ref_printings data.
    // So we fetch all matching copies, then sort and paginate in memory.
    // This is acceptable for collections up to ~50k copies; larger collections
    // would need a materialized view or denormalized sort columns.
    
    // Fetch ALL matching copies in batches to avoid Supabase 1000-row limit
    // First get total count, then paginate through all results
    const BATCH_SIZE = 1000
    let allCopiesRaw: any[] = []
    let batchOffset = 0
    let hasMore = true
    let dbTotalCountAll: number | null = null
    
    while (hasMore) {
      const batchQuery = supabase
        .from('user_copies')
        .select(`
          id,
          card_id,
          printing_id,
          finish,
          is_proxy,
          missing,
          created_at,
          user_cards!user_copies_card_id_fkey (
            card_name
          )
        `, { count: batchOffset === 0 ? 'exact' : undefined })
        .eq('user_id', userId)
        .range(batchOffset, batchOffset + BATCH_SIZE - 1)
      
      // Apply same filters
      let filteredQuery = batchQuery
      if (matchingCardIds) {
        filteredQuery = filteredQuery.in('card_id', matchingCardIds)
      }
      if (!includeProxies) {
        filteredQuery = filteredQuery.eq('is_proxy', false)
      }
      if (!includeMissing) {
        filteredQuery = filteredQuery.or('missing.is.null,missing.eq.false')
      }
      
      const { data: batchData, error: batchErr, count } = await filteredQuery
      
      if (batchErr) throw batchErr
      
      if (batchOffset === 0 && count !== null) {
        dbTotalCountAll = count
      }
      
      if (batchData && batchData.length > 0) {
        allCopiesRaw.push(...batchData)
        batchOffset += BATCH_SIZE
        hasMore = batchData.length === BATCH_SIZE
      } else {
        hasMore = false
      }
    }

    // Normalize results
    let allCopies = allCopiesRaw.map((row: any) => {
      const card = row.user_cards as { card_name: string } | null
      return {
        id: row.id,
        card_id: row.card_id,
        printing_id: row.printing_id,
        finish: row.finish as 'nonfoil' | 'foil' | 'etched',
        is_proxy: row.is_proxy,
        missing: row.missing,
        created_at: row.created_at,
        card_name: card?.card_name || '',
      }
    })

    // ──── Step 3: Fetch scryfall data for ALL copies ────────────────
    // Get all data from ref_printings (set info, color identity, prices)
    const printingIds = [...new Set(allCopies.map((c) => c.printing_id).filter(Boolean) as string[])]

    const [scryfallRows, lastPriceRefresh, priceStale] = await Promise.all([
      printingIds.length > 0
        ? (async () => {
            const results: any[] = []
            for (let i = 0; i < printingIds.length; i += 200) {
              const batch = printingIds.slice(i, i + 200)
              const { data } = await supabase
                .from('ref_printings')
                .select('scryfall_id, set_code, set_name, rarity, collector_number, type_line, color_identity, mana_cost, price_usd, price_usd_foil')
                .in('scryfall_id', batch)
              if (data) results.push(...data)
            }
            return results
          })()
        : Promise.resolve([]),
      getLastRefreshTimestamp(),
      isPriceDataStale(),
    ])

    // Build scryfall info map (includes color_identity, mana_cost, and prices)
    const scryfallMap = new Map<string, {
      setCode: string
      setName: string
      rarity: string | null
      collectorNumber: string | null
      typeLine: string | null
      colorIdentity: string[]
      manaCost: string | null
      priceUsd: number | null
      priceUsdFoil: number | null
    }>()
    for (const row of scryfallRows) {
      if (row.scryfall_id) {
        scryfallMap.set(row.scryfall_id, {
          setCode: row.set_code || '',
          setName: row.set_name || '',
          rarity: row.rarity || null,
          collectorNumber: row.collector_number || null,
          typeLine: row.type_line || null,
          colorIdentity: Array.isArray(row.color_identity) ? row.color_identity : [],
          manaCost: row.mana_cost || null,
          priceUsd: row.price_usd != null ? Number(row.price_usd) : null,
          priceUsdFoil: row.price_usd_foil != null ? Number(row.price_usd_foil) : null,
        })
      }
    }

    // Enrich copies with scryfall data (color_identity, mana_cost, and prices)
    // finish='foil' or 'etched' uses foil price, otherwise normal price
    let enrichedCopies = allCopies.map((c) => {
      const info = c.printing_id ? scryfallMap.get(c.printing_id) : undefined
      const isFoilFinish = c.finish === 'foil' || c.finish === 'etched'
      return {
        ...c,
        setCode: info?.setCode || '',
        setName: info?.setName || '',
        rarity: info?.rarity || null,
        collectorNumber: info?.collectorNumber || null,
        typeLine: info?.typeLine || null,
        colorIdentity: info?.colorIdentity || [],
        manaCost: info?.manaCost || null,
        price: isFoilFinish ? (info?.priceUsdFoil ?? info?.priceUsd ?? null) : (info?.priceUsd ?? null),
      }
    })

    // Apply color filter (using scryfall color_identity)
    if (colors.length > 0) {
      const selectedColors = colors.map((col) => col.toUpperCase())
      enrichedCopies = enrichedCopies.filter((c) => {
        const cardSet = new Set(c.colorIdentity.map((col) => col.toUpperCase()))

        if (colorMode === 'exact') {
          if (cardSet.size !== selectedColors.length) return false
          return selectedColors.every((color) => cardSet.has(color))
        }
        // 'includes' mode
        return selectedColors.every((color) => cardSet.has(color))
      })
    }

    const pageTotalCount = enrichedCopies.length

    if (pageTotalCount === 0) {
      return Response.json({
        rows: [],
        totalCount: 0,
        page,
        pageSize,
        lastPriceRefresh,
        isPriceStale: priceStale,
      } as CollectionPrintingsResponse)
    }

    // ──── Step 4: Sort the FULL dataset before pagination ──────────
    // This ensures sorting works correctly across all pages
    const dir = sortDir === 'asc' ? 1 : -1
    enrichedCopies.sort((a, b) => {
      switch (sort) {
        case 'cardName':
          return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
        case 'setCode':
          return dir * a.setCode.toLowerCase().localeCompare(b.setCode.toLowerCase())
        case 'rarity': {
          const aRarity = RARITY_ORDER[a.rarity?.toLowerCase() ?? ''] ?? 0
          const bRarity = RARITY_ORDER[b.rarity?.toLowerCase() ?? ''] ?? 0
          return dir * (aRarity - bRarity)
        }
        case 'quantity':
          // For quantity, we'd need to group first - fall back to name for now
          return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
        case 'price': {
          // Sort by price (nulls last)
          if (a.price === null && b.price === null) return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
          if (a.price === null) return 1
          if (b.price === null) return -1
          return dir * (a.price - b.price)
        }
        default:
          return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
      }
    })

    // ──── Step 4b: Apply pagination AFTER sorting ──────────────────
    const totalCount = enrichedCopies.length
    const pageCopies = enrichedCopies.slice(offset, offset + pageSize)

    // ──── Step 5: Fetch deck usage for page only ───────────────────
    const pageCopyIds = pageCopies.map((c) => c.id)

    const [deckUsageRaw] = await Promise.all([
      // Deck usage for page copies (copy_id replaces physical_copy_id)
      pageCopyIds.length > 0
        ? supabase
            .from('deck_cards')
            .select(`
              copy_id,
              deck_id,
              card_name,
              ownership_status,
              decks!deck_cards_deck_id_fkey ( name, is_active )
            `)
            .eq('user_id', userId)
            .not('copy_id', 'is', null)
            .in('copy_id', pageCopyIds)
            .then(({ data }) => data || [])
        : Promise.resolve([]),
    ])

    // Build deck usage map (keyed by copy_id) — all decks claim cards equally now
    const deckUsageMap = new Map<number, Map<number, { deckName: string; role: 'original' | 'proxy' | 'unmet' }>>()
    for (const row of deckUsageRaw as any[]) {
      if (!row.copy_id) continue

      let decksForCopy = deckUsageMap.get(row.copy_id)
      if (!decksForCopy) {
        decksForCopy = new Map()
        deckUsageMap.set(row.copy_id, decksForCopy)
      }
      const deckName = row.decks?.name || ''
      if (!decksForCopy.has(row.deck_id)) {
        // Role comes from deck_cards.ownership_status now
        const role = row.ownership_status || 'unmet'
        decksForCopy.set(row.deck_id, { deckName, role })
      }
    }

    // ──── Step 7: Build raw copies for grouping ───────────────────
    const rawCopies: RawPhysicalCopy[] = pageCopies.map((c) => {
      const decksMap = deckUsageMap.get(c.id)
      const usedByDecks = decksMap
        ? Array.from(decksMap.entries()).map(([deckId, { deckName, role }]) => ({ deckId, deckName, role }))
        : []

      // Map finish to isFoil boolean for the grouping utils (which still use isFoil)
      const isFoil = c.finish === 'foil' || c.finish === 'etched'

      return {
        id: c.id,
        cardName: c.card_name,
        scryfallPrintingId: c.printing_id || '',
        setCode: c.setCode,
        setName: c.setName,
        isFoil,
        quantity: 1,
        colorIdentity: c.colorIdentity,
        usedByCount: usedByDecks.length,
        usedByDecks,
        price: c.price,
        isProxy: Boolean(c.is_proxy),
        isMissing: Boolean(c.missing),
        manaCost: c.manaCost || null,
        rarity: c.rarity,
        collectorNumber: c.collectorNumber,
        typeLine: c.typeLine,
        addedAt: c.created_at || null,
      }
    })

    // Group copies into printing rows
    const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

    // ──── Step 8: Compute allocation state for each row ───────────
    // We need card-level supply/demand for allocation state
    // For paginated view, we compute this per-row based on page data
    for (const row of rows) {
      // Simplified allocation state — we'll show accurate data from the page
      row.originalQty = row.isProxy ? 0 : row.quantity
      row.proxyQty = row.isProxy ? row.quantity : 0
      row.totalSupply = row.quantity
      row.activeDemand = row.usedByCount
      row.allocationState = computeAllocationState(row.originalQty, row.proxyQty, row.activeDemand)
    }

    // ──── Step 9: Re-sort rows if sorting by price or quantity ────
    if (sort === 'price') {
      rows.sort((a, b) => {
        if (a.price === null && b.price === null) return 0
        if (a.price === null) return 1
        if (b.price === null) return -1
        return dir * (a.price - b.price)
      })
    } else if (sort === 'quantity') {
      rows.sort((a, b) => dir * (a.quantity - b.quantity))
    }

    const response: CollectionPrintingsResponse = {
      rows,
      totalCount,
      page,
      pageSize,
      lastPriceRefresh,
      isPriceStale: priceStale,
    }
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
