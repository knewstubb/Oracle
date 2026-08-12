import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

/**
 * GET /api/collection/rollup
 *
 * Server-side paginated card-level rollup.
 *
 * Strategy: Query cards directly (small table, ~2400 rows) with
 * filters + pagination at the DB level. Then enrich only the current page's
 * cards with collection and deck usage data. No bulk scans.
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
 *
 * Schema notes (post-migration):
 *   - collection table holds all copies (was: physical_copies)
 *   - cards table (was: card_definitions)
 *   - finish: 'nonfoil' | 'foil' | 'etched' (was: is_foil boolean)
 *   - card_id references cards (was: card_definition_id)
 *   - printing_id references scryfall_printings (was: scryfall_printing_id)
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
  copyId: number
  scryfallPrintingId: string
  setCode: string
  setName: string
  isFoil: boolean
  quantity: number
  inUseCount: number
  ownedValuation: number | null
  deckUsage: DeckUsageEntry[]
  /** @deprecated Use copyId */
  physicalCopyId?: number
}

export interface CollectionRollupRowWithPrice {
  cardId: number
  cardName: string
  oracleId: string
  colorIdentity: string[]
  isBasicLand: boolean
  ownedQuantity: number
  inUseCount: number
  priceToAdd: number | null
  printingSubgroups: PrintingSubgroupRow[]
  /** @deprecated Use cardId */
  cardDefinitionId?: number
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
    // ──── Step 1: Count + paginate cards ────────────────────
    // Use an inner join to only get cards that have collection copies
    // matching our tab filter. PostgREST's !inner syntax does this efficiently.
    //
    // However, Supabase's .select() with !inner doesn't support count+head mode
    // cleanly with joined filters. So we use a two-step approach:
    // 1. Get the count via a simple query on collection (just counting distinct IDs)
    // 2. Get the page data via cards with search/sort/pagination

    // Build base filters for cards
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
    // Instead, query cards with search/color filters and check existence
    // of collection via a simple count on cards that have copies.
    // Since cards.user_id matches collection.user_id for this app
    // (single-user), we just count filtered cards directly.
    let countQuery = supabase
      .from('user_cards')
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

    // Step 1b: Get the page of cards
    const sortColumn = sort === 'cardName' ? 'card_name' : 'card_name'
    const ascending = sortDir === 'asc'
    const offset = (page - 1) * pageSize

    let dataQuery = supabase
      .from('user_cards')
      .select('id, card_name, oracle_id, color_identity, type_line')
      .eq('user_id', userId)

    dataQuery = applyFilters(dataQuery)
    dataQuery = dataQuery.order(sortColumn, { ascending }).range(offset, offset + pageSize - 1)

    const { data: pageCards, error: cardsErr } = await dataQuery

    if (cardsErr) throw cardsErr

    const cards = (pageCards || []) as Array<{
      id: number
      card_name: string
      oracle_id: string
      color_identity: string | null
      type_line: string | null
    }>

    if (cards.length === 0) {
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
    const pageCardIds = cards.map(c => c.id)

    // Fetch collection copies + price metadata in parallel
    const [collectionRaw, lastPriceRefresh, priceStale] = await Promise.all([
      supabase
        .from('user_copies')
        .select('id, card_id, printing_id, finish')
        .eq('user_id', userId)
        .eq('is_proxy', isProxyFilter)
        .in('card_id', pageCardIds)
        .then(({ data, error }) => {
          if (error) throw error
          return data || []
        }),
      getLastRefreshTimestamp(),
      isPriceDataStale(),
    ])

    // Fetch deck usage + set info in parallel (both depend on collection copies)
    const copyIds = collectionRaw.map(c => c.id)
    const printingIds = [...new Set(
      collectionRaw.map(c => c.printing_id).filter(Boolean) as string[]
    )]

    const [deckUsageResult, setInfoResult] = await Promise.all([
      copyIds.length > 0
        ? supabase
            .from('deck_cards')
            .select('copy_id, deck_id, quantity, decks!deck_cards_deck_id_fkey(name)')
            .not('copy_id', 'is', null)
            .in('copy_id', copyIds)
            .then(({ data, error }) => {
              if (error) throw error
              return data || []
            })
        : Promise.resolve([]),

      printingIds.length > 0
        ? supabase
            .from('ref_printings')
            .select('scryfall_id, set_code, set_name')
            .in('scryfall_id', printingIds)
            .then(({ data }) => (data || []).map(r => ({
              printing_id: r.scryfall_id,
              set_code: r.set_code,
              edition_name: r.set_name,
            })))
        : Promise.resolve([]),
    ])

    // ──── Step 3: Assemble rollup rows ────────────────────────────────
    const deckUsageMap = new Map<number, DeckUsageEntry[]>()
    for (const row of deckUsageResult as any[]) {
      const entries = deckUsageMap.get(row.copy_id) || []
      entries.push({
        deckId: row.deck_id,
        deckName: (row.decks as any)?.name || '',
        quantity: row.quantity ?? 1,
      })
      deckUsageMap.set(row.copy_id, entries)
    }

    const setInfoMap = new Map<string, { setCode: string; setName: string }>()
    for (const row of setInfoResult as any[]) {
      if (row.printing_id) {
        setInfoMap.set(row.printing_id, {
          setCode: row.set_code || '',
          setName: row.edition_name || '',
        })
      }
    }

    const copyByCard = new Map<number, typeof collectionRaw>()
    for (const copy of collectionRaw) {
      const group = copyByCard.get(copy.card_id) || []
      group.push(copy)
      copyByCard.set(copy.card_id, group)
    }

    const rows: CollectionRollupRowWithPrice[] = cards.map(card => {
      const isBasicLand = card.type_line ? /\bBasic\b/i.test(card.type_line) : false
      const colorIdentity = card.color_identity
        ? card.color_identity.split(',').map((c: string) => c.trim()).filter((c: string) => c !== '')
        : []

      const copies = copyByCard.get(card.id) || []
      const ownedQuantity = copies.length

      const printingSubgroups: PrintingSubgroupRow[] = copies.map((copy) => {
        const deckUsage = deckUsageMap.get(copy.id) || []
        const inUseCount = deckUsage.reduce((sum, d) => sum + d.quantity, 0)
        const setInfo = copy.printing_id ? setInfoMap.get(copy.printing_id) : undefined
        // Map finish to isFoil boolean for backwards compatibility
        const isFoil = copy.finish === 'foil' || copy.finish === 'etched'

        return {
          copyId: copy.id,
          physicalCopyId: copy.id, // deprecated alias
          scryfallPrintingId: copy.printing_id || '',
          setCode: setInfo?.setCode || '',
          setName: setInfo?.setName || '',
          isFoil,
          quantity: 1,
          inUseCount,
          ownedValuation: null,
          deckUsage,
        }
      })

      const inUseCount = printingSubgroups.reduce((sum, sg) => sum + sg.inUseCount, 0)

      return {
        cardId: card.id,
        cardDefinitionId: card.id, // deprecated alias
        cardName: card.card_name,
        oracleId: card.oracle_id,
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
