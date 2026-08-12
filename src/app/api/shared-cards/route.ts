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

    // Step 2: Get user_copies ownership data via user_cards
    // This replaces the old collection.quantity lookup
    const { data: userCopiesData, error: pcErr } = await supabase
      .from('user_copies')
      .select(`
        id,
        card_id,
        scryfall_id,
        is_proxy,
        user_cards!user_copies_card_id_fkey(card_name),
        ref_printings!user_copies_scryfall_id_fkey(set_code, set_name)
      `)
      .eq('is_proxy', false)
      .eq('user_id', authResult.id) as { data: any[] | null; error: any }

    if (pcErr) throw pcErr

    // Build ownership counts by card name (from user_copies, non-proxy only)
    const ownedByName = new Map<string, number>()
    // Build per-printing ownership: key = "card_name_lower|set_code_lower"
    const ownedByPrinting = new Map<string, number>()
    // set_code → set_name map (built from ref_printings join)
    const setNameMap = new Map<string, string>()

    for (const uc of userCopiesData || []) {
      const userCard = (uc as any).user_cards as { card_name: string } | null
      const printing = (uc as any).ref_printings as { set_code: string; set_name: string } | null
      if (!userCard || !nameList.includes(userCard.card_name)) continue

      // Aggregate owned count by card name
      ownedByName.set(userCard.card_name, (ownedByName.get(userCard.card_name) || 0) + 1)

      // Build per-printing ownership counts
      const setCode = printing?.set_code || ''
      const key = `${userCard.card_name.toLowerCase()}|${setCode.toLowerCase()}`
      ownedByPrinting.set(key, (ownedByPrinting.get(key) || 0) + 1)

      // Store set_name for later
      if (printing?.set_code && printing?.set_name && !setNameMap.has(printing.set_code.toLowerCase())) {
        setNameMap.set(printing.set_code.toLowerCase(), printing.set_name)
      }
    }

    // Step 3: Get ref_cards data for color/type filtering (only for cards we need)
    const cardDefInfo = new Map<string, { color_identity: string; type_line: string }>()
    if ((identityParam || typeParam) && nameList.length > 0) {
      const { data: refCards } = await supabase
        .from('ref_cards')
        .select('name, color_identity, type_line')
        .in('name', nameList)

      for (const rc of refCards || []) {
        cardDefInfo.set(rc.name, {
          color_identity: rc.color_identity || '',
          type_line: rc.type_line || '',
        })
      }
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

    // Check if user_copies has data (replaces collection sync check)
    const { count: userCopiesCount } = await supabase
      .from('user_copies')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', authResult.id)

    const collectionSynced = (userCopiesCount ?? 0) > 0

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

    // Step 5: setNameMap already built in Step 2 from ref_printings join
    // Also get set names for deck_cards set_codes that weren't in user_copies
    const deckCardSetCodes = new Set(
      (allDeckCards || [])
        .map(dc => dc.set_code?.toLowerCase())
        .filter((code): code is string => !!code && !setNameMap.has(code))
    )
    if (deckCardSetCodes.size > 0) {
      const { data: additionalSets } = await supabase
        .from('ref_printings')
        .select('set_code, set_name')
        .in('set_code', Array.from(deckCardSetCodes))
        .limit(deckCardSetCodes.size)

      for (const row of additionalSets || []) {
        if (row.set_code && row.set_name && !setNameMap.has(row.set_code.toLowerCase())) {
          setNameMap.set(row.set_code.toLowerCase(), row.set_name)
        }
      }
    }

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

      // Also add user_copies-only printings (owned but not in any deck)
      for (const uc of userCopiesData || []) {
        const userCard = (uc as any).user_cards as { card_name: string } | null
        const printing = (uc as any).ref_printings as { set_code: string; set_name: string } | null
        if (!userCard || userCard.card_name !== cardName) continue
        const setCode = printing?.set_code || ''
        if (!printingMap.has(setCode)) {
          printingMap.set(setCode, {
            set_code: setCode,
            scryfall_id: uc.scryfall_id || '',
            deck_ids: new Set(),
            ownershipByDeck: new Map(),
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
