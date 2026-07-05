import { createServerClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

/**
 * GET /api/shared-cards
 *
 * Returns cards that appear in 2+ decks, grouped by card name.
 * Each card group contains all printings (from decks AND collection)
 * so the user can see which versions are in use and which are sitting unused.
 */

const BASIC_LANDS = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes',
])

export async function GET(request: NextRequest) {
  const supabase = createServerClient()

  const searchParams = request.nextUrl.searchParams
  const sort = searchParams.get('sort') === 'card_name' ? 'card_name' : 'total_deck_count'
  const order = searchParams.get('order') === 'asc'

  // Filter query params
  const minDecksParam = searchParams.get('minDecks')
  const identityParam = searchParams.get('identity') // e.g. "B,G"
  const typeParam = searchParams.get('type') // e.g. "Creature"

  const minDecks = minDecksParam ? Math.max(2, parseInt(minDecksParam, 10) || 2) : 2

  try {
    // Step 1: Get all deck_cards to compute shared cards
    const { data: allDeckCards, error: dcErr } = await supabase
      .from('deck_cards')
      .select('card_name, set_code, scryfall_id, deck_id, tags')

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

    // Get collection data for these cards
    const nameList = sharedNames.map(r => r.card_name)

    const { data: collectionCards, error: collErr } = await supabase
      .from('collection')
      .select('card_name, set_code, scryfall_id, quantity, color_identity, types')
      .in('card_name', nameList)

    if (collErr) throw collErr

    // Apply color identity filter
    if (identityParam && sharedNames.length > 0) {
      const colors = identityParam.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      if (colors.length > 0) {
        const matchingNames = new Set<string>()
        for (const row of collectionCards || []) {
          if (row.color_identity) {
            const cardColors = row.color_identity.split(',').map(c => c.trim().toUpperCase())
            if (colors.every(c => cardColors.includes(c))) {
              matchingNames.add(row.card_name)
            }
          }
        }
        sharedNames = sharedNames.filter(r => matchingNames.has(r.card_name))
      }
    }

    // Apply card type filter
    if (typeParam && sharedNames.length > 0) {
      const typeSet = new Set<string>()
      for (const row of collectionCards || []) {
        if (row.types && row.types.includes(typeParam)) {
          typeSet.add(row.card_name)
        }
      }
      sharedNames = sharedNames.filter(r => typeSet.has(r.card_name))
    }

    if (sharedNames.length === 0) {
      return Response.json({ groups: [], collectionSynced: false })
    }

    // Check if collection is synced
    const { count: collectionCount } = await supabase
      .from('collection')
      .select('*', { count: 'exact', head: true })

    const collectionSynced = (collectionCount ?? 0) > 0

    // Step 2: Get all deck names
    const allDeckIds = new Set((allDeckCards || []).map(r => r.deck_id))
    const { data: decksData } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', Array.from(allDeckIds))

    const deckMap = new Map<number, string>()
    for (const d of decksData || []) {
      deckMap.set(d.id, d.name)
    }

    // Step 3: Get sets lookup
    const { data: setsRows } = await supabase
      .from('sets')
      .select('code, name')

    const setNameMap = new Map((setsRows || []).map(s => [s.code.toLowerCase(), s.name]))

    // Step 4: Build collection lookups
    const collectionByPrinting = new Map<string, number>()
    const collectionByName = new Map<string, number>()
    for (const c of collectionCards || []) {
      const key = `${c.card_name.toLowerCase()}|${(c.set_code || '').toLowerCase()}`
      collectionByPrinting.set(key, (collectionByPrinting.get(key) || 0) + (c.quantity ?? 0))
      collectionByName.set(
        c.card_name.toLowerCase(),
        (collectionByName.get(c.card_name.toLowerCase()) || 0) + (c.quantity ?? 0)
      )
    }

    // Step 5: Build grouped response
    const finalNameList = sharedNames.map(r => r.card_name)
    const deckCardsForShared = (allDeckCards || []).filter(dc => finalNameList.includes(dc.card_name))

    const groups = sharedNames.map(nameRow => {
      const cardName = nameRow.card_name
      const totalDeckCount = nameRow.total_deck_count
      const ownedTotal = collectionByName.get(cardName.toLowerCase()) || 0

      // Group deck_cards by set_code for this card name
      const deckEntries = deckCardsForShared.filter(dc => dc.card_name === cardName)
      const printingMap = new Map<string, {
        set_code: string
        scryfall_id: string
        deck_ids: Set<number>
        tags: Map<number, string>
      }>()

      for (const dc of deckEntries) {
        const setKey = dc.set_code || ''
        if (!printingMap.has(setKey)) {
          printingMap.set(setKey, {
            set_code: setKey,
            scryfall_id: dc.scryfall_id || '',
            deck_ids: new Set(),
            tags: new Map(),
          })
        }
        const p = printingMap.get(setKey)!
        p.deck_ids.add(dc.deck_id)
        if (dc.tags) p.tags.set(dc.deck_id, dc.tags)
        if (!p.scryfall_id && dc.scryfall_id) p.scryfall_id = dc.scryfall_id
      }

      // Also add collection-only printings
      for (const cc of (collectionCards || []).filter(c => c.card_name === cardName)) {
        const setKey = cc.set_code || ''
        if (!printingMap.has(setKey)) {
          printingMap.set(setKey, {
            set_code: setKey,
            scryfall_id: cc.scryfall_id || '',
            deck_ids: new Set(),
            tags: new Map(),
          })
        }
      }

      const printings = [...printingMap.values()].map(p => {
        const printKey = `${cardName.toLowerCase()}|${p.set_code.toLowerCase()}`
        const ownedThisPrinting = collectionByPrinting.get(printKey) || 0
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
            is_proxy: (p.tags.get(id) || '').toLowerCase().includes('proxy'),
          })),
        }
      })

      return {
        card_name: cardName,
        total_deck_count: totalDeckCount,
        owned_total: ownedTotal,
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
