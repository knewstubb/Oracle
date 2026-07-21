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
        .from('card_metadata')
        .select('card_name, mana_cost, price_usd, rarity')
        .in('card_name', batch)
      for (const row of metaRows ?? []) {
        if (row.mana_cost) manaCostMap[row.card_name] = row.mana_cost
        if (row.price_usd !== null) priceMap[row.card_name] = row.price_usd
        if (row.rarity) rarityMap[row.card_name] = row.rarity
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

    // Auto-fill missing metadata from Scryfall (fire-and-forget, don't block response)
    const missingNames = cardNames.filter(n => !manaCostMap[n])
    if (missingNames.length > 0 && missingNames.length <= 75) {
      // Only auto-fill for small batches to avoid blocking
      // For DFC cards, use front face name for Scryfall lookup
      const identifiers = missingNames.map(name => ({ name: frontFaceName(name) }))
      fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TheOracle/0.1.0' },
        body: JSON.stringify({ identifiers }),
      }).then(async (res) => {
        if (!res.ok) return
        const json = await res.json()
        const rows: any[] = []
        for (const card of json.data ?? []) {
          const manaCost = card.mana_cost ?? card.card_faces?.[0]?.mana_cost ?? ''
          const row = {
            card_name: card.name,
            mana_cost: manaCost,
            cmc: card.cmc ?? 0,
            type_line: card.type_line ?? '',
            price_usd: card.prices?.usd ? parseFloat(card.prices.usd) : null,
            rarity: card.rarity ?? null,
          }
          rows.push(row)
          // Also store under front-face name for decks that use short names
          const front = frontFaceName(card.name)
          if (front !== card.name) {
            rows.push({ ...row, card_name: front })
          }
        }
        if (rows.length > 0) {
          await supabase.from('card_metadata').upsert(rows, { onConflict: 'card_name' })
        }
      }).catch(() => { /* non-critical */ })
    }
  }

  // Fetch edition names from printing_set_info for cards with scryfall IDs
  const scryfallIds = (cards ?? []).map(c => c.scryfall_id).filter(Boolean)
  const editionMap: Record<string, { setCode: string; editionName: string }> = {}
  if (scryfallIds.length > 0) {
    const uniqueIds = [...new Set(scryfallIds)]
    for (let i = 0; i < uniqueIds.length; i += 200) {
      const batch = uniqueIds.slice(i, i + 200)
      const { data: setRows } = await (supabase
        .from('printing_set_info' as any)
        .select('scryfall_printing_id, set_code, edition_name')
        .in('scryfall_printing_id', batch)) as any
      for (const row of setRows ?? []) {
        editionMap[row.scryfall_printing_id] = { setCode: row.set_code, editionName: row.edition_name }
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

  // Include allocation data (proxy/original status per card)
  const { data: allocations } = await supabase
    .from('deck_allocations')
    .select('card_name, role')
    .eq('deck_id', deckId)

  const allocationMap: Record<string, string> = {}
  for (const a of allocations ?? []) {
    allocationMap[a.card_name] = a.role
  }

  // Merge allocation status, mana cost, price, and edition into cards
  const cardsWithStatus = (cards ?? []).map(card => ({
    ...card,
    allocation_role: allocationMap[card.card_name] || 'original',
    mana_cost: manaCostMap[card.card_name] || null,
    price_usd: priceMap[card.card_name] ?? null,
    edition_name: card.scryfall_id ? editionMap[card.scryfall_id]?.editionName || null : null,
    rarity: rarityMap[card.card_name] || null,
  }))

  return Response.json({ deck, cards: cardsWithStatus, brewSessionId: brewSession?.id ?? null })
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
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (deck.status === 'in_rotation') {
    return Response.json(
      { error: 'Decks in rotation cannot be deleted. Move to graveyard first.' },
      { status: 403 }
    )
  }

  // Delete deck_cards first (FK constraint)
  await supabase
    .from('deck_cards')
    .delete()
    .eq('deck_id', deckId)

  // Delete the deck
  const { error: deleteErr } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId)

  if (deleteErr) {
    return Response.json({ error: deleteErr.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
