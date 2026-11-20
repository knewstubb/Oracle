import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import {
  groupPhysicalCopiesToPrintingRows,
  computeAllocationState,
  type RawPhysicalCopy,
  type PrintingRowResponse,
} from '@/lib/collection-printing-utils'
import {
  asViewClient,
  colourOrExpression,
  matchesColourFilter,
  matchingFactlessCopyIds,
  parseColourFilter,
} from '@/lib/collection-colour-filter'
import { hasSupertype, parseTypeLine } from '@/lib/type-line'
import { InvalidTagFilter, loadTagFilterOracleIds, parseTagFilter } from '@/lib/collection-tag-filter'
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
 *   - basic: 'true' = only Basic cards
 *   - tags: comma-separated Tag keys; tagsMatch: 'all' (default) | 'any'
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

/** A user_copies row joined to its owning user_cards row (card_name). */
interface UserCopyWithCardName {
  id: number
  card_id: number
  printing_id: string | null
  finish: string | null
  is_proxy: boolean
  created_at: string | null
  user_cards: { card_name: string; oracle_id?: string | null } | null
}

/** Subset of ref_printings used to enrich copies. */
interface ScryfallPrintingRow {
  scryfall_id: string
  set_code: string
  set_name: string
  rarity: string
  collector_number: string
  type_line: string | null
  color_identity: string[] | null
  mana_cost: string | null
  price_usd: number | null
  price_usd_foil: number | null
}

/** A deck_cards row joined to its deck. */
interface DeckUsageRow {
  copy_id: number | null
  deck_id: number
  card_name: string
  ownership_status: string | null
  decks: { name: string } | null
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
  const basicOnly = searchParams.get('basic') === 'true'
  const includeProxies = searchParams.get('includeProxies') === 'true'
  let tagFilter: ReturnType<typeof parseTagFilter>
  try {
    tagFilter = parseTagFilter(searchParams.get('tags'), searchParams.get('tagsMatch'))
  } catch (e) {
    if (e instanceof InvalidTagFilter) return Response.json({ error: e.message }, { status: 400 })
    throw e
  }

  try {
    const offset = (page - 1) * pageSize
    // ══════════════════════════════════════════════════════════════════════════
    // FAST PATH: cardName sort (the default), with or without search, colour filter and proxies.
    // The database filters, sorts and counts, and only one page of copies ever leaves it. Colour comes from
    // the connector_collection_copies view (colourless = no colours, see collection-colour-filter.ts).
    // ══════════════════════════════════════════════════════════════════════════
    if (sort === 'cardName') {
      const colourFilter = parseColourFilter(colors, colorMode)
      // The freshness read does not depend on the page, so it starts now and runs alongside the rest.
      const refreshPromise = getLastRefreshTimestamp()
      const extraCopyIds = colourFilter ? await matchingFactlessCopyIds(supabase, userId, colourFilter) : []
      const filteredView = (columns: string, withCount: boolean) => {
        let q = asViewClient(supabase)
          .from('connector_collection_copies')
          .select(columns, withCount ? { count: 'exact' } : undefined)
          .eq('user_id', userId)
        if (!includeProxies) q = q.eq('is_proxy', false)
        if (search) q = q.ilike('card_name', `%${escapeLike(search)}%`)
        if (colourFilter) q = q.or(colourOrExpression(colourFilter, extraCopyIds))
        // Basic is the only word of its kind in a type line, so the text prefilter is what pages the result (an exact check cannot run on a single page).
        if (basicOnly) q = q.ilike('type_line', '%basic%')
        return q
          .order('card_name', { ascending: sortDir === 'asc' })
          .order('copy_id', { ascending: true })
      }
      // Tag filter: the database cannot join the Tag table to the view, so the copies that pass the other filters are
      // listed (copy and card identity only), limited to the tagged cards here, then paged. Only the page's copies are read in full.
      let taggedCopyIds: number[] | null = null
      if (tagFilter) {
        const tagged = await loadTagFilterOracleIds(tagFilter)
        taggedCopyIds = []
        for (let from = 0; ; from += 1000) {
          const r = await filteredView('copy_id, oracle_id', false).range(from, from + 999)
          if (r.error) throw r.error
          const got = (r.data ?? []) as Array<{ copy_id: number; oracle_id: string | null }>
          for (const g of got) if (g.oracle_id && tagged.has(g.oracle_id)) taggedCopyIds.push(g.copy_id)
          if (got.length < 1000) break
        }
      }
      const pageColumns = 'copy_id, card_id, printing_id, finish, is_proxy, card_name'
      const pageQuery: PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> = taggedCopyIds
        ? taggedCopyIds.length === 0
          ? Promise.resolve({ data: [], error: null, count: 0 })
          : filteredView(pageColumns, false).in('copy_id', taggedCopyIds.slice(offset, offset + pageSize))
        : filteredView(pageColumns, true).range(offset, offset + pageSize - 1)
      const [lastPriceRefresh, pageResult] = await Promise.all([refreshPromise, pageQuery])
      const priceStale = await isPriceDataStale(lastPriceRefresh)
      if (pageResult.error) throw pageResult.error
      const totalCount = taggedCopyIds ? taggedCopyIds.length : (pageResult.count ?? 0)
      const pageCopies = ((pageResult.data ?? []) as Array<{
        copy_id: number
        card_id: number
        printing_id: string | null
        finish: string | null
        is_proxy: boolean
        card_name: string | null
      }>).map((row) => ({
        id: row.copy_id,
        card_id: row.card_id,
        printing_id: row.printing_id,
        finish: row.finish as 'nonfoil' | 'foil' | 'etched',
        is_proxy: row.is_proxy,
        card_name: row.card_name || '',
      }))

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

      // Printing info, deck usage and "added" dates for this page only, all at once.
      const printingIds = [...new Set(pageCopies.map(c => c.printing_id).filter(Boolean) as string[])]
      const pageCopyIds = pageCopies.map(c => c.id)
      const [scryfallRows, deckUsageRaw, addedRows] = await Promise.all([
        printingIds.length > 0
          ? supabase
              .from('ref_printings')
              .select('scryfall_id, set_code, set_name, rarity, collector_number, type_line, color_identity, mana_cost, price_usd, price_usd_foil')
              .in('scryfall_id', printingIds)
              .then(({ data }) => data || [])
          : Promise.resolve([]),
        supabase
          .from('deck_cards')
          .select(`
            copy_id,
            deck_id,
            card_name,
            ownership_status,
            decks!deck_cards_deck_id_fkey ( name )
          `)
          .eq('user_id', userId)
          .not('copy_id', 'is', null)
          .in('copy_id', pageCopyIds)
          .then(({ data }) => data || []),
        supabase
          .from('user_copies')
          .select('id, created_at')
          .eq('user_id', userId)
          .in('id', pageCopyIds)
          .then(({ data }) => data || []),
      ])
      const createdById = new Map<number, string | null>(addedRows.map((r) => [r.id, r.created_at]))

      const scryfallMap = buildScryfallMap(scryfallRows)
      const deckUsageMap = buildDeckUsageMap(deckUsageRaw)
      const rawCopies = buildRawCopies(
        pageCopies.map((c) => ({ ...c, created_at: createdById.get(c.id) ?? null })),
        scryfallMap,
        deckUsageMap
      )
      const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

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

    const lastPriceRefresh = await getLastRefreshTimestamp()
    const priceStale = await isPriceDataStale(lastPriceRefresh)

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
    const allCopiesRaw: UserCopyWithCardName[] = []
    let batchOffset = 0
    let hasMore = true
    
    while (hasMore) {
      const batchQuery = supabase
        .from('user_copies')
        .select(`
          id,
          card_id,
          printing_id,
          finish,
          is_proxy,
          created_at,
          user_cards!user_copies_card_id_fkey (
            card_name,
            oracle_id
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
      
      const { data: batchData, error: batchErr } = await filteredQuery
      
      if (batchErr) throw batchErr
      
      if (batchData && batchData.length > 0) {
        allCopiesRaw.push(...batchData)
        batchOffset += BATCH_SIZE
        hasMore = batchData.length === BATCH_SIZE
      } else {
        hasMore = false
      }
    }

    // Normalize results
    const allCopies = allCopiesRaw.map((row) => {
      const card = row.user_cards
      return {
        id: row.id,
        card_id: row.card_id,
        printing_id: row.printing_id,
        finish: row.finish as 'nonfoil' | 'foil' | 'etched',
        is_proxy: row.is_proxy,
        created_at: row.created_at,
        card_name: card?.card_name || '',
        oracle_id: card?.oracle_id ?? null,
      }
    })

    // Fetch scryfall data for ALL copies
    const printingIds = [...new Set(allCopies.map((c) => c.printing_id).filter(Boolean) as string[])]

    const scryfallRows = printingIds.length > 0
      ? await (async () => {
          const results: ScryfallPrintingRow[] = []
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

    // Apply color filter (same rule as the fast path: colourless = no colours)
    const colourFilter = parseColourFilter(colors, colorMode)
    if (colourFilter) {
      enrichedCopies = enrichedCopies.filter((c) => matchesColourFilter(c.colorIdentity, colourFilter))
    }
    if (basicOnly) enrichedCopies = enrichedCopies.filter((c) => hasSupertype(parseTypeLine(c.typeLine), 'Basic', 'any'))
    if (tagFilter) {
      const tagged = await loadTagFilterOracleIds(tagFilter)
      enrichedCopies = enrichedCopies.filter((c) => !!c.oracle_id && tagged.has(c.oracle_id))
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
            decks!deck_cards_deck_id_fkey ( name )
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
/** Makes % _ and \\ in what the user typed match themselves in an ilike pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function buildScryfallMap(scryfallRows: ScryfallPrintingRow[]) {
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

function buildDeckUsageMap(deckUsageRaw: DeckUsageRow[]) {
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
      const role = (row.ownership_status || 'unmet') as 'original' | 'proxy' | 'unmet'
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
      manaCost: info?.manaCost || null,
      rarity: info?.rarity || null,
      collectorNumber: info?.collectorNumber || null,
      typeLine: info?.typeLine || null,
      addedAt: c.created_at || null,
    }
  })
}
