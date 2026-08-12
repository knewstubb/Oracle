import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { frontFaceName } from '@/lib/basic-lands'
import { NextRequest } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('*')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const { data: cards, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('card_name')

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  // Fetch mana costs and prices from card_metadata for all cards in this deck
  const cardNames = (cards ?? []).map(c => c.card_name)
  const manaCostMap: Record<string, string> = {}
  const priceMap: Record<string, number> = {}
  const rarityMap: Record<string, string> = {}
  if (cardNames.length > 0) {
    // Build lookup names: include both full DFC names and front-face variants
    const lookupNames = new Set(cardNames)
    for (const name of cardNames) {
      if (name.includes(' // ')) lookupNames.add(frontFaceName(name))
    }
    const lookupArray = Array.from(lookupNames)

    for (let i = 0; i < lookupArray.length; i += 200) {
      const batch = lookupArray.slice(i, i + 200)
      const { data: metaRows } = await supabase
        .from('ref_cards')
        .select('name, mana_cost, edhrec_rank')
        .in('name', batch)
      for (const row of metaRows ?? []) {
        if (row.mana_cost) manaCostMap[row.name] = row.mana_cost
      }
    }

    // Get prices from ref_printings for cards with scryfall_id
    const scryfallIdsForPrice = (cards ?? [])
      .map(c => c.scryfall_id)
      .filter((id): id is string => id !== null)
    
    if (scryfallIdsForPrice.length > 0) {
      const uniquePriceIds = [...new Set(scryfallIdsForPrice)]
      for (let i = 0; i < uniquePriceIds.length; i += 200) {
        const batch = uniquePriceIds.slice(i, i + 200)
        const { data: priceRows } = await supabase
          .from('ref_printings')
          .select('scryfall_id, name, price_usd, rarity')
          .in('scryfall_id', batch)
        for (const row of priceRows ?? []) {
          if (row.price_usd !== null) priceMap[row.name] = row.price_usd
          if (row.rarity) rarityMap[row.name] = row.rarity
        }
      }
    }

    // For DFC cards in deck_cards: if the full name didn't match but front-face did, propagate
    for (const name of cardNames) {
      if (name.includes(' // ') && !manaCostMap[name]) {
        const front = frontFaceName(name)
        if (manaCostMap[front]) manaCostMap[name] = manaCostMap[front]
        if (priceMap[front] !== undefined) priceMap[name] = priceMap[front]
        if (rarityMap[front]) rarityMap[name] = rarityMap[front]
      }
      // Also handle reverse: deck_cards has front-face only, metadata has full name
      if (!name.includes(' // ') && !manaCostMap[name]) {
        // Check if any full DFC name starts with this front face
        const fullName = Object.keys(manaCostMap).find(k => k.startsWith(name + ' // '))
        if (fullName) {
          manaCostMap[name] = manaCostMap[fullName]
          if (priceMap[fullName] !== undefined) priceMap[name] = priceMap[fullName]
          if (rarityMap[fullName]) rarityMap[name] = rarityMap[fullName]
        }
      }
    }

    // Auto-fill missing card data is no longer needed — all data comes from ref_cards and ref_printings
    // which are populated by sync jobs, not on-the-fly Scryfall queries
  }

  // Fetch edition names from ref_printings for cards with scryfall IDs
  const scryfallIds = (cards ?? []).map(c => c.scryfall_id).filter((id): id is string => id !== null)
  const editionMap: Record<string, { setCode: string; editionName: string }> = {}
  if (scryfallIds.length > 0) {
    const uniqueIds = [...new Set(scryfallIds)]
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200)
      const { data: setRows } = await supabase
        .from('ref_printings')
        .select('scryfall_id, set_code, set_name')
        .in('scryfall_id', batch)
      for (const row of setRows ?? []) {
        editionMap[row.scryfall_id] = { setCode: row.set_code, editionName: row.set_name }
      }
    }
  }

  // Get associated brew session if deck is a draft
  const { data: brewSession } = await supabase
    .from('brew_sessions')
    .select('id')
    .eq('deck_id', deckId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch commander metadata (salt score, EDHREC rank) from ref_commanders
  const { data: commanderMeta } = await supabase
    .from('ref_commanders')
    .select('salt_score, edhrec_rank, edhrec_deck_count')
    .ilike('display_name', deck.commander_name)
    .limit(1)
    .maybeSingle()

  // Allocation status is now on deck_cards.ownership_status directly
  // Build allocationMap from cards data
  const allocationMap: Record<string, string> = {}
  for (const card of cards ?? []) {
    allocationMap[card.card_name] = card.ownership_status || 'original'
  }

  // Fetch synergy scores from ref_build_cards if deck has a build_id
  const synergyMap: Record<string, number> = {}
  if (deck.build_id && cardNames.length > 0) {
    // Fetch synergy scores for cards in this build
    // Use batching for large card lists
    for (let i = 0; i < cardNames.length; i += 200) {
      const batch = cardNames.slice(i, i + 200)
      const { data: buildCards } = await supabase
        .from('ref_build_cards')
        .select('card_name, synergy_score')
        .eq('build_id', deck.build_id)
        .in('card_name', batch)
      
      for (const row of buildCards ?? []) {
        if (row.synergy_score !== null) {
          synergyMap[row.card_name] = row.synergy_score
        }
      }
    }
    
    // Handle DFC cards: propagate synergy from front-face to full name
    for (const name of cardNames) {
      if (name.includes(' // ') && synergyMap[name] === undefined) {
        const front = frontFaceName(name)
        if (synergyMap[front] !== undefined) {
          synergyMap[name] = synergyMap[front]
        }
      }
    }
  }

  // Merge allocation status, mana cost, price, edition, and synergy into cards
  const cardsWithStatus = (cards ?? []).map(card => ({
    ...card,
    allocation_role: card.ownership_status || 'original',
    mana_cost: manaCostMap[card.card_name] || null,
    price_usd: priceMap[card.card_name] ?? null,
    edition_name: card.scryfall_id ? editionMap[card.scryfall_id]?.editionName || null : null,
    rarity: rarityMap[card.card_name] || null,
    synergy_score: synergyMap[card.card_name] ?? null,
  }))

  return Response.json({
    deck: {
      ...deck,
      salt_score: commanderMeta?.salt_score ?? null,
      edhrec_rank: commanderMeta?.edhrec_rank ?? null,
      edhrec_deck_count: commanderMeta?.edhrec_deck_count ?? null,
    },
    cards: cardsWithStatus,
    brewSessionId: brewSession?.id ?? null,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, status')
    .eq('id', deckId)
    .eq('user_id', authResult.id)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  // Release all allocated copies back to default storage before deleting
  // This clears deck_cards.copy_id so copies return to unassigned state
  await supabase
    .from('deck_cards')
    .update({ copy_id: null, ownership_status: null })
    .eq('deck_id', deckId)

  // Delete deck_cards (FK constraint)
  await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)

  // Delete the deck
  const { error: deleteErr } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId)
    .eq('user_id', authResult.id)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
