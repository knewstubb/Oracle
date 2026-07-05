import { createAdminClient } from '@/lib/supabase'
import { getBulkPriceToAdd, getOwnedValuation, getLastRefreshTimestamp, isPriceDataStale } from '@/lib/price-store'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

/**
 * GET /api/collection/rollup?tab=collection|proxies
 *
 * Returns the full card-level rollup with pricing for client-side filtering/sorting.
 * Collection tab (default): is_proxy = false
 * Proxies tab: is_proxy = true
 *
 * Validates: Requirements 1.4, 1.7, 2.1, 2.3, 9.1, 11.1, 11.2
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

interface CollectionRollupRowWithPrice {
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

interface CollectionRollupResponse {
  rows: CollectionRollupRowWithPrice[]
  lastPriceRefresh: string | null
  isPriceStale: boolean
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  const searchParams = request.nextUrl.searchParams
  const tab = searchParams.get('tab') || 'collection'
  const isProxyFilter = tab === 'proxies'

  try {
    // ──── FALLBACK: If physical_copies is incomplete, serve from collection table ────
    // Compare physical_copies count to collection count — if physical_copies has
    // less than 80% of collection entries, use the collection table directly.
    const { count: physicalCopiesCount } = await supabase
      .from('physical_copies')
      .select('*', { count: 'exact', head: true })
      .eq('is_proxy', isProxyFilter)
      .gt('quantity', 0)

    const { count: collectionCount } = await supabase
      .from('collection')
      .select('*', { count: 'exact', head: true })

    const useCollectionFallback = !physicalCopiesCount ||
      physicalCopiesCount === 0 ||
      (collectionCount && physicalCopiesCount < collectionCount * 0.8)

    if (useCollectionFallback) {
      // Serve directly from the collection table (legacy/import staging)
      const { data: collRows, error: collErr } = await supabase
        .from('collection')
        .select('id, card_name, scryfall_id, set_code, quantity, foil, finish, color_identity, edition_name')
        .gt('quantity', 0)
        .limit(10000)

      if (collErr) throw collErr

      // Group by card_name to create rollup rows
      const cardMap = new Map<string, CollectionRollupRowWithPrice>()
      for (const row of collRows || []) {
        const existing = cardMap.get(row.card_name)
        if (existing) {
          existing.ownedQuantity += row.quantity
          existing.printingSubgroups.push({
            physicalCopyId: row.id,
            scryfallPrintingId: row.scryfall_id || '',
            setCode: row.set_code || '',
            setName: row.edition_name || '',
            isFoil: row.foil || false,
            quantity: row.quantity,
            inUseCount: 0,
            ownedValuation: null,
            deckUsage: [],
          })
        } else {
          const colorIdentity = row.color_identity
            ? row.color_identity.split(',').map((c: string) => c.trim()).filter(Boolean)
            : []
          cardMap.set(row.card_name, {
            cardDefinitionId: row.id,
            cardName: row.card_name,
            oracleId: '',
            colorIdentity,
            isBasicLand: false,
            ownedQuantity: row.quantity,
            inUseCount: 0,
            priceToAdd: null,
            printingSubgroups: [{
              physicalCopyId: row.id,
              scryfallPrintingId: row.scryfall_id || '',
              setCode: row.set_code || '',
              setName: row.edition_name || '',
              isFoil: row.foil || false,
              quantity: row.quantity,
              inUseCount: 0,
              ownedValuation: null,
              deckUsage: [],
            }],
          })
        }
      }

      const response: CollectionRollupResponse = {
        rows: Array.from(cardMap.values()),
        lastPriceRefresh: null,
        isPriceStale: true,
      }
      return Response.json(response)
    }

    // ──── NORMAL PATH: card_definitions + physical_copies ────
    // 1. Get all physical_copies with their card_definitions (paginated to handle Supabase max_rows limit)
    let allPhysicalCopies: Array<{
      id: number
      card_definition_id: number
      scryfall_printing_id: string | null
      is_foil: boolean
      quantity: number
    }> = []
    const cardDefMap = new Map<number, {
      id: number
      card_name: string
      oracle_id: string
      color_identity: string | null
      type_line: string | null
    }>()

    const PAGE_SIZE = 1000
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
            id,
            card_name,
            oracle_id,
            color_identity,
            type_line
          )
        `)
        .eq('is_proxy', isProxyFilter)
        .gt('quantity', 0)
        .range(offset, offset + PAGE_SIZE - 1)

      if (pageErr) throw pageErr

      for (const row of page || []) {
        allPhysicalCopies.push({
          id: row.id,
          card_definition_id: row.card_definition_id,
          scryfall_printing_id: row.scryfall_printing_id,
          is_foil: row.is_foil,
          quantity: row.quantity,
        })

        const cd = row.card_definitions as unknown as {
          id: number
          card_name: string
          oracle_id: string
          color_identity: string | null
          type_line: string | null
        }
        if (cd && !cardDefMap.has(cd.id)) {
          cardDefMap.set(cd.id, cd)
        }
      }

      hasMore = (page?.length ?? 0) === PAGE_SIZE
      offset += PAGE_SIZE
    }

    const uniqueCardDefs = Array.from(cardDefMap.values())
    const physicalCopies = allPhysicalCopies

    if (uniqueCardDefs.length === 0) {
      const lastPriceRefresh = await getLastRefreshTimestamp()
      const priceStale = await isPriceDataStale()
      const response: CollectionRollupResponse = {
        rows: [],
        lastPriceRefresh,
        isPriceStale: priceStale,
      }
      return Response.json(response)
    }

    // 3. Get deck usage — all deck_cards that reference any physical_copy (paginated)
    let deckUsageRows: Array<{
      physical_copy_id: number
      deck_id: number
      deck_name: string
      quantity: number
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
            quantity,
            decks!deck_cards_deck_id_fkey ( name )
          `)
          .not('physical_copy_id', 'is', null)
          .range(duOffset, duOffset + 999)

        if (duErr) throw duErr

        for (const row of duData || []) {
          deckUsageRows.push({
            physical_copy_id: row.physical_copy_id!,
            deck_id: row.deck_id,
            deck_name: (row.decks as unknown as { name: string })?.name || '',
            quantity: row.quantity ?? 1,
          })
        }

        duHasMore = (duData?.length ?? 0) === 1000
        duOffset += 1000
      }
    }

    // 4. Get set info from collection table (paginated)
    const setInfoMap = new Map<string, { setCode: string; setName: string }>()

    {
      let setOffset = 0
      let setHasMore = true
      while (setHasMore) {
        const { data: setRows } = await supabase
          .from('collection')
          .select('scryfall_id, set_code, edition_name')
          .not('scryfall_id', 'is', null)
          .range(setOffset, setOffset + 999)

        for (const row of setRows || []) {
          if (row.scryfall_id && !setInfoMap.has(row.scryfall_id)) {
            setInfoMap.set(row.scryfall_id, {
              setCode: row.set_code || '',
              setName: row.edition_name || '',
            })
          }
        }

        setHasMore = (setRows?.length ?? 0) === 1000
        setOffset += 1000
      }
    }

    // 5. Get bulk Price_To_Add
    const priceToAddMap = await getBulkPriceToAdd()

    // 6. Get price metadata
    const lastPriceRefresh = await getLastRefreshTimestamp()
    const priceStale = await isPriceDataStale()

    // 7. Build deck usage lookup: physical_copy_id → DeckUsageEntry[]
    const deckUsageMap = new Map<number, DeckUsageEntry[]>()
    for (const row of deckUsageRows) {
      const entries = deckUsageMap.get(row.physical_copy_id) || []
      entries.push({
        deckId: row.deck_id,
        deckName: row.deck_name,
        quantity: row.quantity,
      })
      deckUsageMap.set(row.physical_copy_id, entries)
    }

    // 8. Group physical copies by card_definition_id
    const pcByCardDef = new Map<number, typeof physicalCopies>()
    for (const pc of physicalCopies || []) {
      const group = pcByCardDef.get(pc.card_definition_id) || []
      group.push(pc)
      pcByCardDef.set(pc.card_definition_id, group)
    }

    // 9. Build rollup rows
    const rows: CollectionRollupRowWithPrice[] = uniqueCardDefs.map(cd => {
      const isBasicLand = cd.type_line ? /\bBasic\b/i.test(cd.type_line) : false
      const colorIdentity = cd.color_identity
        ? cd.color_identity.split(',').map(c => c.trim()).filter(c => c !== '')
        : []

      const copies = pcByCardDef.get(cd.id) || []

      // Owned quantity = sum of physical_copies.quantity
      const ownedQuantity = copies.reduce((sum, pc) => sum + (pc.quantity ?? 0), 0)

      // Build printing subgroups
      const printingSubgroups: PrintingSubgroupRow[] = copies.map(pc => {
        const deckUsage = deckUsageMap.get(pc.id) || []
        const inUseCount = deckUsage.reduce((sum, d) => sum + d.quantity, 0)

        const setInfo = pc.scryfall_printing_id
          ? setInfoMap.get(pc.scryfall_printing_id)
          : undefined

        // Get owned valuation (null for basic lands)
        // Note: getOwnedValuation is async but we batch the lookups
        let ownedValuation: number | null = null
        // Will be populated below via async lookup

        return {
          physicalCopyId: pc.id,
          scryfallPrintingId: pc.scryfall_printing_id || '',
          setCode: setInfo?.setCode || '',
          setName: setInfo?.setName || '',
          isFoil: Boolean(pc.is_foil),
          quantity: pc.quantity ?? 0,
          inUseCount,
          ownedValuation,
          deckUsage,
        }
      })

      // Card-level in-use count = sum of subgroup in-use counts
      const inUseCount = printingSubgroups.reduce((sum, sg) => sum + sg.inUseCount, 0)

      // Price_To_Add from bulk lookup
      const priceToAdd = priceToAddMap.get(cd.id) ?? null

      return {
        cardDefinitionId: cd.id,
        cardName: cd.card_name,
        oracleId: cd.oracle_id,
        colorIdentity,
        isBasicLand,
        ownedQuantity,
        inUseCount,
        priceToAdd,
        printingSubgroups,
      }
    })

    // 9b. Populate owned valuations (async) — skip for large datasets to avoid timeout
    // Valuations are lazily loaded on expand instead
    if (rows.length <= 200) {
      for (const row of rows) {
        if (row.isBasicLand) continue
        for (const sg of row.printingSubgroups) {
          if (sg.scryfallPrintingId) {
            sg.ownedValuation = await getOwnedValuation(sg.scryfallPrintingId, sg.isFoil)
          }
        }
      }
    }

    const response: CollectionRollupResponse = {
      rows,
      lastPriceRefresh,
      isPriceStale: priceStale,
    }

    return Response.json(response)
  } catch (error) {
    console.error('Failed to load collection rollup:', error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load collection data', detail: message },
      { status: 500 }
    )
  }
}
