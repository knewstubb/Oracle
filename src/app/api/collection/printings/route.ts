import { createAdminClient } from '@/lib/supabase'
import { getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import {
  groupPhysicalCopiesToPrintingRows,
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

const PAGE_SIZE = 1000

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  try {
    // ──── FALLBACK CHECK ────
    // If physical_copies is incomplete (<80% of collection count), serve from collection table
    const { count: physicalCopiesCount } = await supabase
      .from('physical_copies')
      .select('*', { count: 'exact', head: true })
      .eq('is_proxy', false)
      .gt('quantity', 0)

    const { count: collectionCount } = await supabase
      .from('collection')
      .select('*', { count: 'exact', head: true })

    const useCollectionFallback =
      !physicalCopiesCount ||
      physicalCopiesCount === 0 ||
      (collectionCount && physicalCopiesCount < collectionCount * 0.8)

    if (useCollectionFallback) {
      return await serveFallback(supabase)
    }

    // ──── 1. Query physical_copies + card_definitions (paginated) ────
    const allPhysicalCopies: Array<{
      id: number
      card_definition_id: number
      scryfall_printing_id: string | null
      is_foil: boolean
      quantity: number
      card_name: string
      color_identity: string | null
    }> = []

    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: page, error: pageErr } = await supabase
        .from('physical_copies')
        .select(`
          id,
          card_definition_id,
          scryfall_printing_id,
          is_foil,
          quantity,
          card_definitions!physical_copies_card_definition_id_fkey (
            card_name,
            color_identity
          )
        `)
        .eq('is_proxy', false)
        .gt('quantity', 0)
        .range(offset, offset + PAGE_SIZE - 1)

      if (pageErr) throw pageErr

      for (const row of page || []) {
        const cd = row.card_definitions as unknown as {
          card_name: string
          color_identity: string | null
        }
        allPhysicalCopies.push({
          id: row.id,
          card_definition_id: row.card_definition_id,
          scryfall_printing_id: row.scryfall_printing_id,
          is_foil: row.is_foil,
          quantity: row.quantity,
          card_name: cd?.card_name || '',
          color_identity: cd?.color_identity || null,
        })
      }

      hasMore = (page?.length ?? 0) === PAGE_SIZE
      offset += PAGE_SIZE
    }

    if (allPhysicalCopies.length === 0) {
      const lastPriceRefresh = await getLastRefreshTimestamp()
      const priceStale = await isPriceDataStale()
      const response: CollectionPrintingsResponse = {
        rows: [],
        lastPriceRefresh,
        isPriceStale: priceStale,
      }
      return Response.json(response)
    }

    // ──── 2. Query deck_cards + decks for usage (paginated) ────
    const deckUsageRows: Array<{
      physical_copy_id: number
      deck_id: number
      deck_name: string
    }> = []

    {
      let duOffset = 0
      let duHasMore = true
      while (duHasMore) {
        const { data: duData, error: duErr } = await supabase
          .from('deck_cards')
          .select(`
            physical_copy_id,
            deck_id,
            decks!deck_cards_deck_id_fkey ( name )
          `)
          .not('physical_copy_id', 'is', null)
          .range(duOffset, duOffset + PAGE_SIZE - 1)

        if (duErr) throw duErr

        for (const row of duData || []) {
          deckUsageRows.push({
            physical_copy_id: row.physical_copy_id!,
            deck_id: row.deck_id,
            deck_name: (row.decks as unknown as { name: string })?.name || '',
          })
        }

        duHasMore = (duData?.length ?? 0) === PAGE_SIZE
        duOffset += PAGE_SIZE
      }
    }

    // ──── 3. Query card_kingdom_prices for price lookup ────
    const priceMap = new Map<string, number>()

    {
      let priceOffset = 0
      let priceHasMore = true
      while (priceHasMore) {
        const { data: priceRows, error: priceErr } = await supabase
          .from('card_kingdom_prices')
          .select('scryfall_printing_id, price_retail, is_foil')
          .range(priceOffset, priceOffset + PAGE_SIZE - 1)

        if (priceErr) throw priceErr

        for (const row of priceRows || []) {
          const key = `${row.scryfall_printing_id}:${row.is_foil ? 'foil' : 'normal'}`
          priceMap.set(key, row.price_retail)
        }

        priceHasMore = (priceRows?.length ?? 0) === PAGE_SIZE
        priceOffset += PAGE_SIZE
      }
    }

    // ──── 4. Query collection table for set info ────
    const setInfoMap = new Map<string, { setCode: string; setName: string }>()

    {
      let setOffset = 0
      let setHasMore = true
      while (setHasMore) {
        const { data: setRows } = await supabase
          .from('collection')
          .select('scryfall_id, set_code, edition_name')
          .not('scryfall_id', 'is', null)
          .range(setOffset, setOffset + PAGE_SIZE - 1)

        for (const row of setRows || []) {
          if (row.scryfall_id && !setInfoMap.has(row.scryfall_id)) {
            setInfoMap.set(row.scryfall_id, {
              setCode: row.set_code || '',
              setName: row.edition_name || '',
            })
          }
        }

        setHasMore = (setRows?.length ?? 0) === PAGE_SIZE
        setOffset += PAGE_SIZE
      }
    }

    // ──── 5. Get price metadata ────
    const lastPriceRefresh = await getLastRefreshTimestamp()
    const priceStale = await isPriceDataStale()

    // ──── 6. Build deck usage lookup: physical_copy_id → { deckId, deckName }[] ────
    const deckUsageMap = new Map<number, Map<number, string>>()
    for (const row of deckUsageRows) {
      let decksForCopy = deckUsageMap.get(row.physical_copy_id)
      if (!decksForCopy) {
        decksForCopy = new Map()
        deckUsageMap.set(row.physical_copy_id, decksForCopy)
      }
      // Use Map keyed by deck_id for distinct deck counting
      if (!decksForCopy.has(row.deck_id)) {
        decksForCopy.set(row.deck_id, row.deck_name)
      }
    }

    // ──── 7. Build RawPhysicalCopy array ────
    const rawCopies: RawPhysicalCopy[] = allPhysicalCopies.map((pc) => {
      const setInfo = pc.scryfall_printing_id
        ? setInfoMap.get(pc.scryfall_printing_id)
        : undefined

      const decksMap = deckUsageMap.get(pc.id)
      const usedByDecks = decksMap
        ? Array.from(decksMap.entries()).map(([deckId, deckName]) => ({
            deckId,
            deckName,
          }))
        : []

      const price = pc.scryfall_printing_id
        ? lookupPrice(priceMap, pc.scryfall_printing_id, pc.is_foil)
        : null

      const colorIdentity = pc.color_identity
        ? pc.color_identity
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : []

      return {
        id: pc.id,
        cardName: pc.card_name,
        scryfallPrintingId: pc.scryfall_printing_id || '',
        setCode: setInfo?.setCode || '',
        setName: setInfo?.setName || '',
        isFoil: Boolean(pc.is_foil),
        quantity: pc.quantity,
        colorIdentity,
        usedByCount: usedByDecks.length,
        usedByDecks,
        price,
      }
    })

    // ──── 8. Group and produce flat rows ────
    const rows = groupPhysicalCopiesToPrintingRows(rawCopies)

    // ──── 9. Return response ────
    const response: CollectionPrintingsResponse = {
      rows,
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

// ---------------------------------------------------------------------------
// Fallback: serve from collection table when physical_copies is incomplete
// ---------------------------------------------------------------------------

async function serveFallback(supabase: ReturnType<typeof createAdminClient>) {
  const { data: collRows, error: collErr } = await supabase
    .from('collection')
    .select(
      'id, card_name, scryfall_id, set_code, quantity, foil, color_identity, edition_name'
    )
    .gt('quantity', 0)
    .limit(10000)

  if (collErr) throw collErr

  const rawCopies: RawPhysicalCopy[] = (collRows || []).map((row) => {
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
