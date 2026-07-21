import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

/**
 * GET /api/shared-cards
 *
 * Returns cards that appear in 2+ decks, grouped by card name.
 * Each card group contains all printings (from decks AND physical_copies)
 * so the user can see which versions are in use and which are sitting unused.
 *
 * Ownership is derived from physical_copies (non-proxy copies = owned),
 * NOT from the frozen collection table.
 */

const BASIC_LANDS = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes',
])

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  const searchParams = request.nextUrl.searchParams
  const sort = searchParams.get('sort') === 'card_name' ? 'card_name' : 'total_deck_count'
  const order = searchParams.get('order') === 'asc'

  // Filter query params
  const minDecksParam = searchParams.get('minDecks')
  const identityParam = searchParams.get('identity') // e.g. "B,G"
  const typeParam = searchParams.get('type') // e.g. "Creature"

  const minDecks = minDecksParam ? Math.max(2, parseInt(minDecksParam, 10) || 2) : 2

  try {
    // Step 1: Get all deck_cards for this user to compute shared cards
    const { data: allDeckCards, error: dcErr } = await supabase
      .from('deck_cards')
      .select('card_name, set_code, scryfall_id, deck_id, ownership_status')
      .eq('user_id', authResult.id)

    if (dcErr) throw dcErr

    // Group by card_name → count distinct deck_ids
    const cardDeckCountMap = new Map<string, Set<number>>()
    for (const dc of allDeckCards || []) {
      const deckIds = cardDeckCountMap.get(dc.card_name) || new Set()
      deckIds.add(dc.deck_id)
      cardDeckCountMap.set(dc.card_name, deckIds)
    }

    // Filter to cards in minDecks+ decks, excluding basic lands
    let sharedNames = Array.from(cardDeckCountMap.entries())
      .filter(([name, deckIds]) => deckIds.size >= minDecks && !BASIC_LANDS.has(name))
      .map(([name, deckIds]) => ({
        card_name: name,
        total_deck_count: deckIds.size,
      }))

    // Sort
    if (sort === 'card_name') {
      sharedNames.sort((a, b) => order
        ? a.card_name.localeCompare(b.card_name)
        : b.card_name.localeCompare(a.card_name)
      )
    } else {
      sharedNames.sort((a, b) => order
        ? a.total_deck_count - b.total_deck_count
        : b.total_deck_count - a.total_deck_count
      )
    }

    if (sharedNames.length === 0) {
      return Response.json({ groups: [], collectionSynced: false })
    }

    const nameList = sharedNames.map(r => r.card_name)

    // Step 2: Get physical_copies ownership data via card_definitions
    // This replaces the old collection.quantity lookup
    const { data: physicalCopiesData, error: pcErr } = await supabase
      .from('physical_copies')
      .select(`
        id,
        card_definition_id,
        scryfall_printing_id,
        is_proxy,
        card_definitions!physical_copies_card_definition_id_fkey(card_name, color_identity, type_line)
      `)
      .eq('is_proxy', false)
      .eq('user_id', authResult.id) as { data: any[] | null; error: any }

    if (pcErr) throw pcErr

    // Build ownership counts by card name (from physical_copies, non-proxy only)
    const ownedByName = new Map<string, number>()
    // Build per-printing ownership: key = "card_name_lower|set_code_lower"
    const ownedByPrinting = new Map<string, number>()
    // Track scryfall_printing_ids we need set_code for
    const printingIdsNeeded = new Set<string>()

    // card_definitions data for color/type filtering
    const cardDefInfo = new Map<string, { color_identity: string; type_line: string }>()

    for (const pc of physicalCopiesData || []) {
      const cd = (pc as any).card_definitions as { card_name: string; color_identity: string; type_line: string } | null
      if (!cd || !nameList.includes(cd.card_name)) continue

      // Aggregate owned count by card name
      ownedByName.set(cd.card_name, (ownedByName.get(cd.card_name) || 0) + 1)

      // Track printing IDs for set_code resolution
      if (pc.scryfall_printing_id) {
        printingIdsNeeded.add(pc.scryfall_printing_id)
      }

      // Store card definition info for filtering
      if (!cardDefInfo.has(cd.card_name)) {
        cardDefInfo.set(cd.card_name, {
          color_identity: cd.color_identity || '',
          type_line: cd.type_line || '',
        })
      }
    }

    // Step 3: Resolve set_codes from printing_set_info for physical copies
    const printingSetMap = new Map<string, string>() // scryfall_printing_id → set_code
    if (printingIdsNeeded.size > 0) {
      const { data: printingSetRows } = await (supabase as any)
        .from('printing_set_info')
        .select('scryfall_printing_id, set_code')
        .in('scryfall_printing_id', Array.from(printingIdsNeeded))

      for (const row of printingSetRows || []) {
        printingSetMap.set((row as any).scryfall_printing_id, (row as any).set_code)
      }
    }

    // Build per-printing ownership counts using resolved set_codes
    for (const pc of physicalCopiesData || []) {
      const cd = (pc as any).card_definitions as { card_name: string; color_identity: string; type_line: string } | null
      if (!cd || !nameList.includes(cd.card_name)) continue

      const setCode = (pc.scryfall_printing_id && printingSetMap.get(pc.scryfall_printing_id)) || ''
      const key = `${cd.card_name.toLowerCase()}|${setCode.toLowerCase()}`
      ownedByPrinting.set(key, (ownedByPrinting.get(key) || 0) + 1)
    }

    // Apply color identity filter
    if (identityParam && sharedNames.length > 0) {
      const colors = identityParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      if (colors.length > 0) {
        const matchingNames = new Set<string>()
        for (const [cardName, info] of cardDefInfo) {
          if (info.color_identity) {
            const cardColors = info.color_identity.split(',').map(c => c.trim().toUpperCase())
            if (colors.every(c => cardColors.includes(c))) {
              matchingNames.add(cardName)
            }
          }
        }
        sharedNames = sharedNames.filter(r => matchingNames.has(r.card_name))
      }
    }

    // Apply card type filter
    if (typeParam && sharedNames.length > 0) {
      const typeSet = new Set<string>()
      for (const [cardName, info] of cardDefInfo) {
        if (info.type_line && info.type_line.includes(typeParam)) {
          typeSet.add(cardName)
        }
      }
      sharedNames = sharedNames.filter(r => typeSet.has(r.card_name))
    }

    if (sharedNames.length === 0) {
      return Response.json({ groups: [], collectionSynced: false })
    }

    // Check if physical_copies has data (replaces collection sync check)
    const { count: physicalCopiesCount } = await supabase
      .from('physical_copies')
      .select('*', { count: 'exact', head: true })

    const collectionSynced = (physicalCopiesCount ?? 0) > 0

    // Step 4: Get all deck names
    const allDeckIds = new Set((allDeckCards || []).map(r => r.deck_id))
    const { data: decksData } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', Array.from(allDeckIds))

    const deckMap = new Map<number, string>()
    for (const d of decksData || []) {
      deckMap.set(d.id, d.name)
    }

    // Step 5: Get sets lookup
    const { data: setsRows } = await supabase
      .from('sets')
      .select('code, name')

    const setNameMap = new Map((setsRows || []).map(s => [s.code.toLowerCase(), s.name]))

    // Step 6: Build grouped response
    const finalNameList = sharedNames.map(r => r.card_name)
    const deckCardsForShared = (allDeckCards || []).filter(dc => finalNameList.includes(dc.card_name))

    const groups = sharedNames.map(nameRow => {
      const cardName = nameRow.card_name
      const totalDeckCount = nameRow.total_deck_count
      // Derive owned_total from physical_copies count (not collection.quantity)
      const ownedTotal = ownedByName.get(cardName) || 0

      // Group deck_cards by set_code for this card name
      const deckEntries = deckCardsForShared.filter(dc => dc.card_name === cardName)
      const printingMap = new Map<string, {
        set_code: string
        scryfall_id: string
        deck_ids: Set<number>
        ownershipByDeck: Map<number, string | null>
      }>()

      for (const dc of deckEntries) {
        const setKey = dc.set_code || ''
        if (!printingMap.has(setKey)) {
          printingMap.set(setKey, {
            set_code: setKey,
            scryfall_id: dc.scryfall_id || '',
            deck_ids: new Set(),
            ownershipByDeck: new Map(),
          })
        }
        const p = printingMap.get(setKey)!
        p.deck_ids.add(dc.deck_id)
        p.ownershipByDeck.set(dc.deck_id, dc.ownership_status)
        if (!p.scryfall_id && dc.scryfall_id) p.scryfall_id = dc.scryfall_id
      }

      // Also add physical_copies-only printings (owned but not in any deck)
      for (const pc of physicalCopiesData || []) {
        const cd = (pc as any).card_definitions as { card_name: string; color_identity: string; type_line: string } | null
        if (!cd || cd.card_name !== cardName) continue
        const setCode = (pc.scryfall_printing_id && printingSetMap.get(pc.scryfall_printing_id)) || ''
        if (!printingMap.has(setCode)) {
          printingMap.set(setCode, {
            set_code: setCode,
            scryfall_id: pc.scryfall_printing_id || '',
            deck_ids: new Set(),
            tags: new Map(),
          })
        }
      }

      const printings = [...printingMap.values()].map(p => {
        // Derive per-printing owned count from physical_copies
        const printKey = `${cardName.toLowerCase()}|${p.set_code.toLowerCase()}`
        const ownedThisPrinting = ownedByPrinting.get(printKey) || 0
        const deckIds = [...p.deck_ids]
        return {
          set_code: p.set_code,
          set_name: setNameMap.get(p.set_code.toLowerCase()) || '',
          scryfall_id: p.scryfall_id,
          owned: ownedThisPrinting,
          in_decks: deckIds.length,
          decks: deckIds.map(id => ({
            id,
            name: deckMap.get(id) || `Deck ${id}`,
            is_proxy: p.ownershipByDeck.get(id) === 'proxy',
          })),
        }
      })

      return {
        card_name: cardName,
        total_deck_count: totalDeckCount,
        owned_total: ownedTotal,
        // needing_proxies: demand (deck count) > supply (physical copies count)
        needing_proxies: totalDeckCount > ownedTotal,
        printings,
      }
    })

    return Response.json({ groups, collectionSynced })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[shared-cards] Error: ${message}`)
    return Response.json(
      { groups: [], error: message },
      { status: 500 }
    )
  }
}
