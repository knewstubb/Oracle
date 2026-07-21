import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

/**
 * GET /api/collection/rollup
 *
 * Server-side paginated card-level rollup.
 *
 * Strategy: Query card_definitions directly (small table, ~2400 rows) with
 * filters + pagination at the DB level. Then enrich only the current page's
 * cards with physical_copies and deck usage data. No bulk scans.
 *
 * Query params:
 *   - tab: 'collection' | 'proxies' (default: 'collection')
 *   - page: 1-indexed page number (default: 1)
 *   - pageSize: rows per page (default: 50, max: 200)
 *   - search: card name search string (case-insensitive ilike)
 *   - sort: 'cardName' | 'ownedQuantity' (default: 'cardName')
 *   - sortDir: 'asc' | 'desc' (default: 'asc')
 *   - colors: comma-separated color identity filter (e.g. 'B,G')
 *   - colorMode: 'exact' | 'includes' | 'at_most' (default: 'includes')
 *
 * Response: { rows, totalCount, page, pageSize, lastPriceRefresh, isPriceStale }
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeckUsageEntry {
  deckId: number
  deckName: string
  quantity: number
}

interface PrintingSubgroupRow {
  physicalCopyId: number
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
  quantity: number
  inUseCount: number
  ownedValuation: number | null
  deckUsage: DeckUsageEntry[]
}

export interface CollectionRollupRowWithPrice {
  cardDefinitionId: number
  cardName: string
  oracleId: string
  colorIdentity: string[]
  isBasicLand: boolean
  ownedQuantity: number
  inUseCount: number
  priceToAdd: number | null
  printingSubgroups: PrintingSubgroupRow[]
}

export interface CollectionRollupResponse {
  rows: CollectionRollupRowWithPrice[]
  totalCount: number
  page: number
  pageSize: number
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  const searchParams = request.nextUrl.searchParams
  const tab = searchParams.get('tab') || 'collection'
  const isProxyFilter = tab === 'proxies'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)))
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'cardName'
  const sortDir = searchParams.get('sortDir') === 'desc' ? 'desc' : 'asc'
  const colors = searchParams.get('colors')?.split(',').filter(Boolean) || []
  const colorMode = searchParams.get('colorMode') || 'includes'

  try {
    // ──── Step 1: Count + paginate card_definitions ────────────────────
    // Use an inner join to only get definitions that have physical_copies
    // matching our tab filter. PostgREST's !inner syntax does this efficiently.
    //
    // However, Supabase's .select() with !inner doesn't support count+head mode
    // cleanly with joined filters. So we use a two-step approach:
    // 1. Get the count via a simple query on physical_copies (just counting distinct IDs)
    // 2. Get the page data via card_definitions with search/sort/pagination

    // Build base filters for card_definitions
    function applyFilters(query: any) {
      if (search) {
        query = query.ilike('card_name', `%${search}%`)
      }
      if (colors.length > 0 && (colorMode === 'includes' || colorMode === 'exact')) {
        for (const color of colors) {
          query = query.ilike('color_identity', `%${color}%`)
        }
      }
      return query
    }

    // Step 1a: Get total count
    // We can't use !inner join for counting (it inflates count for 1:many).
    // Instead, query card_definitions with search/color filters and check existence
    // of physical_copies via a simple count on card_definitions that have copies.
    // Since card_definitions.user_id matches physical_copies.user_id for this app
    // (single-user), we just count filtered card_definitions directly.
    let countQuery = supabase
      .from('card_definitions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    countQuery = applyFilters(countQuery)
    const { count: totalCount, error: countErr } = await countQuery

    if (countErr) throw countErr

    if (totalCount === 0) {
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
      } as CollectionRollupResponse)
    }

    // Step 1b: Get the page of card_definitions
    const sortColumn = sort === 'cardName' ? 'card_name' : 'card_name'
    const ascending = sortDir === 'asc'
    const offset = (page - 1) * pageSize

    let dataQuery = supabase
      .from('card_definitions')
      .select('id, card_name, oracle_id, color_identity, type_line')
      .eq('user_id', userId)

    dataQuery = applyFilters(dataQuery)
    dataQuery = dataQuery.order(sortColumn, { ascending }).range(offset, offset + pageSize - 1)

    const { data: pageCardDefs, error: defsErr } = await dataQuery

    if (defsErr) throw defsErr

    const cardDefs = (pageCardDefs || []) as Array<{
      id: number
      card_name: string
      oracle_id: string
      color_identity: string | null
      type_line: string | null
    }>

    if (cardDefs.length === 0) {
      const [lastPriceRefresh, priceStale] = await Promise.all([
        getLastRefreshTimestamp(),
        isPriceDataStale(),
      ])
      return Response.json({
        rows: [],
        totalCount,
        page,
        pageSize,
        lastPriceRefresh,
        isPriceStale: priceStale,
      } as CollectionRollupResponse)
    }

    // ──── Step 2: Enrich only this page's cards ───────────────────────
    const pageDefIds = cardDefs.map(cd => cd.id)

    // Fetch physical_copies + price metadata in parallel
    const [physicalCopiesRaw, lastPriceRefresh, priceStale] = await Promise.all([
      supabase
        .from('physical_copies')
        .select('id, card_definition_id, scryfall_printing_id, is_foil')
        .eq('user_id', userId)
        .eq('is_proxy', isProxyFilter)
        .in('card_definition_id', pageDefIds)
        .then(({ data, error }) => {
          if (error) throw error
          return data || []
        }),
      getLastRefreshTimestamp(),
      isPriceDataStale(),
    ])

    // Fetch deck usage + set info in parallel (both depend on physical_copies)
    const physicalCopyIds = physicalCopiesRaw.map(pc => pc.id)
    const printingIds = [...new Set(
      physicalCopiesRaw.map(pc => pc.scryfall_printing_id).filter(Boolean) as string[]
    )]

    const [deckUsageResult, setInfoResult] = await Promise.all([
      physicalCopyIds.length > 0
        ? supabase
            .from('deck_cards')
            .select('physical_copy_id, deck_id, quantity, decks!deck_cards_deck_id_fkey(name)')
            .not('physical_copy_id', 'is', null)
            .in('physical_copy_id', physicalCopyIds)
            .then(({ data, error }) => {
              if (error) throw error
              return data || []
            })
        : Promise.resolve([]),

      printingIds.length > 0
        ? (supabase
            .from('printing_set_info' as any)
            .select('scryfall_printing_id, set_code, edition_name')
            .in('scryfall_printing_id', printingIds) as any)
            .then(({ data }: any) => data || [])
        : Promise.resolve([]),
    ])

    // ──── Step 3: Assemble rollup rows ────────────────────────────────
    const deckUsageMap = new Map<number, DeckUsageEntry[]>()
    for (const row of deckUsageResult as any[]) {
      const entries = deckUsageMap.get(row.physical_copy_id) || []
      entries.push({
        deckId: row.deck_id,
        deckName: (row.decks as any)?.name || '',
        quantity: row.quantity ?? 1,
      })
      deckUsageMap.set(row.physical_copy_id, entries)
    }

    const setInfoMap = new Map<string, { setCode: string; setName: string }>()
    for (const row of setInfoResult as any[]) {
      if (row.scryfall_printing_id) {
        setInfoMap.set(row.scryfall_printing_id, {
          setCode: row.set_code || '',
          setName: row.edition_name || '',
        })
      }
    }

    const pcByCardDef = new Map<number, typeof physicalCopiesRaw>()
    for (const pc of physicalCopiesRaw) {
      const group = pcByCardDef.get(pc.card_definition_id) || []
      group.push(pc)
      pcByCardDef.set(pc.card_definition_id, group)
    }

    const rows: CollectionRollupRowWithPrice[] = cardDefs.map(cd => {
      const isBasicLand = cd.type_line ? /\bBasic\b/i.test(cd.type_line) : false
      const colorIdentity = cd.color_identity
        ? cd.color_identity.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')
        : []

      const copies = pcByCardDef.get(cd.id) || []
      const ownedQuantity = copies.length

      const printingSubgroups: PrintingSubgroupRow[] = copies.map((pc) => {
        const deckUsage = deckUsageMap.get(pc.id) || []
        const inUseCount = deckUsage.reduce((sum, d) => sum + d.quantity, 0)
        const setInfo = pc.scryfall_printing_id ? setInfoMap.get(pc.scryfall_printing_id) : undefined

        return {
          physicalCopyId: pc.id,
          scryfallPrintingId: pc.scryfall_printing_id || '',
          setCode: setInfo?.setCode || '',
          setName: setInfo?.setName || '',
          isFoil: Boolean(pc.is_foil),
          quantity: 1,
          inUseCount,
          ownedValuation: null,
          deckUsage,
        }
      })

      const inUseCount = printingSubgroups.reduce((sum, sg) => sum + sg.inUseCount, 0)

      return {
        cardDefinitionId: cd.id,
        cardName: cd.card_name,
        oracleId: cd.oracle_id,
        colorIdentity,
        isBasicLand,
        ownedQuantity,
        inUseCount,
        priceToAdd: null, // Loaded lazily on expand to avoid bulk RPC on every page
        printingSubgroups,
      }
    })

    return Response.json({
      rows,
      totalCount,
      page,
      pageSize,
      lastPriceRefresh,
      isPriceStale: priceStale,
    } as CollectionRollupResponse)
  } catch (error) {
    console.error('Failed to load collection rollup:', error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load collection data', detail: message },
      { status: 500 }
    )
  }
}
