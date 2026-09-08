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
    const offset = (page - 1) * pageSize
    const [lastPriceRefresh, priceStale] = await Promise.all([
      getLastRefreshTimestamp(),
      isPriceDataStale(),
    ])

    // ══════════════════════════════════════════════════════════════════════════
    // OPTIMIZED PATH: cardName sort without color filter
    // Strategy: Query user_cards (sorted by card_name at DB level) first,
    // then fetch copies only for the cards on the current page.
    // This avoids fetching ALL copies just to sort them in memory.
    // ══════════════════════════════════════════════════════════════════════════
    if (sort === 'cardName' && colors.length === 0) {
      // Step 1: Get paginated card IDs, sorted by card_name at DB level
      let cardsQuery = supabase
        .from('user_cards')
        .select('id, card_name', { count: 'exact' })
        .eq('user_id', userId)
        .order('card_name', { ascending: sortDir === 'asc' })

      if (search) {
        cardsQuery = cardsQuery.ilike('card_name', `%${search}%`)
      }

      // We need to know which cards have copies matching our filters
      // First get all card_ids that have matching copies (paginated to avoid 1000-row limit)
      const cardIdsWithCopies: number[] = []
      const FILTER_PAGE_SIZE = 1000
      let filterOffset = 0
      let hasMoreFilterResults = true

      while (hasMoreFilterResults) {
        let copiesFilterQuery = supabase
          .from('user_copies')
          .select('card_id')
          .eq('user_id', userId)
          .range(filterOffset, filterOffset + FILTER_PAGE_SIZE - 1)
        
        if (!includeProxies) {
          copiesFilterQuery = copiesFilterQuery.eq('is_proxy', false)
        }
        if (!includeMissing) {
          copiesFilterQuery = copiesFilterQuery.or('missing.is.null,missing.eq.false')
        }

        const { data: copiesWithFilter } = await copiesFilterQuery
        if (copiesWithFilter && copiesWithFilter.length > 0) {
          for (const c of copiesWithFilter) {
            if (!cardIdsWithCopies.includes(c.card_id)) {
              cardIdsWithCopies.push(c.card_id)
            }
          }
          hasMoreFilterResults = copiesWithFilter.length === FILTER_PAGE_SIZE
          filterOffset += FILTER_PAGE_SIZE
        } else {
          hasMoreFilterResults = false
        }
      }

      if (cardIdsWithCopies.length === 0) {
        return Response.json({
          rows: [],
          totalCount: 0,
          page,
          pageSize,
          lastPriceRefresh,
          isPriceStale: priceStale,
        } as CollectionPrintingsResponse)
      }

      // Apply card_id filter to user_cards query - need to batch due to URL length limit
      // Also need to paginate to avoid 1000-row limit on user_cards
      let allMatchingCards: { id: number; card_name: string }[] = []
      const CARD_BATCH_SIZE = 200 // For .in() URL limit
      const CARD_PAGE_SIZE = 1000

      // Batch the card_id filter and paginate results
      for (let i = 0; i < cardIdsWithCopies.length; i += CARD_BATCH_SIZE) {
        const batchIds = cardIdsWithCopies.slice(i, i + CARD_BATCH_SIZE)
        let batchOffset = 0
        let hasMoreCards = true

        while (hasMoreCards) {
          let batchCardsQuery = supabase
            .from('user_cards')
            .select('id, card_name')
            .eq('user_id', userId)
            .in('id', batchIds)
            .order('card_name', { ascending: sortDir === 'asc' })
            .range(batchOffset, batchOffset + CARD_PAGE_SIZE - 1)

          if (search) {
            batchCardsQuery = batchCardsQuery.ilike('card_name', `%${search}%`)
          }

          const { data: batchCards } = await batchCardsQuery
          if (batchCards && batchCards.length > 0) {
            allMatchingCards.push(...batchCards)
            hasMoreCards = batchCards.length === CARD_PAGE_SIZE
            batchOffset += CARD_PAGE_SIZE
          } else {
            hasMoreCards = false
          }
        }
      }

      // Re-sort all cards since we fetched in batches
      allMatchingCards.sort((a, b) => {
        const cmp = a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
        return sortDir === 'asc' ? cmp : -cmp
      })
      if (!allMatchingCards?.length) {
        return Response.json({
          rows: [],
          totalCount: 0,
          page,
          pageSize,
          lastPriceRefresh,
          isPriceStale: priceStale,
        } as CollectionPrintingsResponse)
      }

      // Now we need to count copies, not cards, for pagination
      // Each card can have multiple copies, so we need copy-level pagination
      // This is tricky - let's fetch copies for all matching cards and count
      const matchingCardIds = allMatchingCards.map(c => c.id)
      
      // Fetch ALL copies for matching cards (we'll paginate in memory)
      // This is still better than fetching ALL copies in the collection
      // Use smaller batch for .in() URL limit, and paginate each batch for 1000-row limit
      const COPY_BATCH_SIZE = 200 // For .in() URL limit
      const COPY_PAGE_SIZE = 1000 // Supabase row limit
      let allCopiesRaw: any[] = []
      
      for (let i = 0; i < matchingCardIds.length; i += COPY_BATCH_SIZE) {
        const batchIds = matchingCardIds.slice(i, i + COPY_BATCH_SIZE)
        let batchOffset = 0
        let hasMoreCopies = true

        while (hasMoreCopies) {
          let batchQuery = supabase
            .from('user_copies')
            .select('id, card_id, printing_id, finish, is_proxy, missing, created_at')
            .eq('user_id', userId)
            .in('card_id', batchIds)
            .range(batchOffset, batchOffset + COPY_PAGE_SIZE - 1)
          
          if (!includeProxies) {
            batchQuery = batchQuery.eq('is_proxy', false)
          }
          if (!includeMissing) {
            batchQuery = batchQuery.or('missing.is.null,missing.eq.false')
          }

          const { data: batchCopies } = await batchQuery
          if (batchCopies && batchCopies.length > 0) {
            allCopiesRaw.push(...batchCopies)
            hasMoreCopies = batchCopies.length === COPY_PAGE_SIZE
            batchOffset += COPY_PAGE_SIZE
          } else {
            hasMoreCopies = false
          }
        }
      }

      // Build card_id -> card_name map
      const cardNameMap = new Map<number, string>()
      for (const card of allMatchingCards) {
        cardNameMap.set(card.id, card.card_name)
      }

      // Enrich copies with card_name
      let allCopies = allCopiesRaw.map(row => ({
        ...row,
        card_name: cardNameMap.get(row.card_id) || '',
      }))

      // Sort ALL copies by card_name (consistent with DB order)
      allCopies.sort((a, b) => {
        const cmp = a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
        return sortDir === 'asc' ? cmp : -cmp
      })

      const totalCount = allCopies.length

      // Paginate
      const pageCopies = allCopies.slice(offset, offset + pageSize)

      if (pageCopies.length === 0) {
        return Response.json({
          rows: [],
          totalCount,
          page,
          pageSize,
          lastPriceRefresh,
          isPriceStale: priceStale,
        } as CollectionPrintingsResponse)
      }

      // Fetch printing info and deck usage for this page
      const printingIds = [...new Set(pageCopies.map(c => c.printing_id).filter(Boolean) as string[])]
      const pageCopyIds = pageCopies.map(c => c.id)

      const [scryfallRows, deckUsageRaw] = await Promise.all([
        printingIds.length > 0
          ? supabase
              .from('ref_printings')
              .select('scryfall_id, set_code, set_name, rarity, collector_number, type_line, color_identity, mana_cost, price_usd, price_usd_foil')
              .in('scryfall_id', printingIds)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
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

      // Build lookup maps
      const scryfallMap = buildScryfallMap(scryfallRows)
      const deckUsageMap = buildDeckUsageMap(deckUsageRaw)

      // Normalize for grouping
      const normalizedCopies = pageCopies.map(c => ({
        id: c.id,
        card_id: c.card_id,
        printing_id: c.printing_id,
        finish: c.finish as 'nonfoil' | 'foil' | 'etched',
        is_proxy: c.is_proxy,
        missing: c.missing,
        created_at: c.created_at,
        card_name: c.card_name,
      }))

      // Build raw copies for grouping
      const rawCopies = buildRawCopies(normalizedCopies, scryfallMap, deckUsageMap)
      const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

      // Compute allocation state
      for (const row of rows) {
        row.originalQty = row.isProxy ? 0 : row.quantity
        row.proxyQty = row.isProxy ? row.quantity : 0
        row.totalSupply = row.quantity
        row.activeDemand = row.usedByCount
        row.allocationState = computeAllocationState(row.originalQty, row.proxyQty, row.activeDemand)
      }

      return Response.json({
        rows,
        totalCount,
        page,
        pageSize,
        lastPriceRefresh,
        isPriceStale: priceStale,
      } as CollectionPrintingsResponse)
    }

    // ──── FALLBACK PATH: Other sorts or color filters ────────────────
    // For price/rarity/setCode sorts or color filters, we need ref_printings data
    // which requires fetching all copies first, then enriching and sorting
    
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
    
    // Fetch ALL matching copies in batches to avoid Supabase 1000-row limit
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

    // Fetch scryfall data for ALL copies
    const printingIds = [...new Set(allCopies.map((c) => c.printing_id).filter(Boolean) as string[])]

    const scryfallRows = printingIds.length > 0
      ? await (async () => {
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
      : []

    const scryfallMap = buildScryfallMap(scryfallRows)

    // Enrich copies with scryfall data
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

    // Apply color filter
    if (colors.length > 0) {
      const selectedColors = colors.map((col) => col.toUpperCase())
      enrichedCopies = enrichedCopies.filter((c) => {
        const cardSet = new Set(c.colorIdentity.map((col) => col.toUpperCase()))

        if (colorMode === 'exact') {
          if (cardSet.size !== selectedColors.length) return false
          return selectedColors.every((color) => cardSet.has(color))
        }
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

    // Sort the FULL dataset before pagination
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
          return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
        case 'price': {
          if (a.price === null && b.price === null) return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
          if (a.price === null) return 1
          if (b.price === null) return -1
          return dir * (a.price - b.price)
        }
        default:
          return dir * a.card_name.toLowerCase().localeCompare(b.card_name.toLowerCase())
      }
    })

    // Apply pagination AFTER sorting
    const totalCount = enrichedCopies.length
    const pageCopies = enrichedCopies.slice(offset, offset + pageSize)

    // Fetch deck usage for page only
    const pageCopyIds = pageCopies.map((c) => c.id)

    const deckUsageRaw = pageCopyIds.length > 0
      ? await supabase
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
      : []

    const deckUsageMap = buildDeckUsageMap(deckUsageRaw)

    // Build raw copies for grouping
    const rawCopies: RawPhysicalCopy[] = pageCopies.map((c) => {
      const decksMap = deckUsageMap.get(c.id)
      const usedByDecks = decksMap
        ? Array.from(decksMap.entries()).map(([deckId, { deckName, role }]) => ({ deckId, deckName, role }))
        : []
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

    const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

    // Compute allocation state
    for (const row of rows) {
      row.originalQty = row.isProxy ? 0 : row.quantity
      row.proxyQty = row.isProxy ? row.quantity : 0
      row.totalSupply = row.quantity
      row.activeDemand = row.usedByCount
      row.allocationState = computeAllocationState(row.originalQty, row.proxyQty, row.activeDemand)
    }

    // Re-sort rows if sorting by price or quantity
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

    return Response.json({
      rows,
      totalCount,
      page,
      pageSize,
      lastPriceRefresh,
      isPriceStale: priceStale,
    } as CollectionPrintingsResponse)
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
// Helper functions
// ---------------------------------------------------------------------------

function buildScryfallMap(scryfallRows: any[]) {
  const map = new Map<string, {
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
      map.set(row.scryfall_id, {
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
  return map
}

function buildDeckUsageMap(deckUsageRaw: any[]) {
  const map = new Map<number, Map<number, { deckName: string; role: 'original' | 'proxy' | 'unmet' }>>()
  for (const row of deckUsageRaw) {
    if (!row.copy_id) continue

    let decksForCopy = map.get(row.copy_id)
    if (!decksForCopy) {
      decksForCopy = new Map()
      map.set(row.copy_id, decksForCopy)
    }
    const deckName = row.decks?.name || ''
    if (!decksForCopy.has(row.deck_id)) {
      const role = row.ownership_status || 'unmet'
      decksForCopy.set(row.deck_id, { deckName, role })
    }
  }
  return map
}

function buildRawCopies(
  normalizedCopies: Array<{
    id: number
    card_id: number
    printing_id: string | null
    finish: 'nonfoil' | 'foil' | 'etched'
    is_proxy: boolean
    missing: boolean | null
    created_at: string | null
    card_name: string
  }>,
  scryfallMap: ReturnType<typeof buildScryfallMap>,
  deckUsageMap: ReturnType<typeof buildDeckUsageMap>
): RawPhysicalCopy[] {
  return normalizedCopies.map((c) => {
    const info = c.printing_id ? scryfallMap.get(c.printing_id) : undefined
    const isFoilFinish = c.finish === 'foil' || c.finish === 'etched'
    const decksMap = deckUsageMap.get(c.id)
    const usedByDecks = decksMap
      ? Array.from(decksMap.entries()).map(([deckId, { deckName, role }]) => ({ deckId, deckName, role }))
      : []

    return {
      id: c.id,
      cardName: c.card_name,
      scryfallPrintingId: c.printing_id || '',
      setCode: info?.setCode || '',
      setName: info?.setName || '',
      isFoil: isFoilFinish,
      quantity: 1,
      colorIdentity: info?.colorIdentity || [],
      usedByCount: usedByDecks.length,
      usedByDecks,
      price: isFoilFinish ? (info?.priceUsdFoil ?? info?.priceUsd ?? null) : (info?.priceUsd ?? null),
      isProxy: Boolean(c.is_proxy),
      isMissing: Boolean(c.missing),
      manaCost: info?.manaCost || null,
      rarity: info?.rarity || null,
      collectorNumber: info?.collectorNumber || null,
      typeLine: info?.typeLine || null,
      addedAt: c.created_at || null,
    }
  })
}
