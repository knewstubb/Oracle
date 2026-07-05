import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

interface CardInfo {
  name: string
  set?: string
  rarity?: string
  price?: number
}

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

  // Get deck info including precon_url
  const { data: deck, error: deckErr } = await supabase
    .from('decks')
    .select('id, name, precon_url, deck_type')
    .eq('id', deckId)
    .maybeSingle()

  if (deckErr) {
    return Response.json({ error: deckErr.message }, { status: 500 })
  }
  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  if (!deck.precon_url || deck.deck_type !== 'Precon Mod') {
    return Response.json({ error: 'Not a precon modification', isPreconMod: false }, { status: 200 })
  }

  // Get precon card list
  const { data: preconCards, error: preconErr } = await supabase
    .from('precon_cards')
    .select('card_name')
    .eq('precon_url', deck.precon_url)

  if (preconErr) {
    return Response.json({ error: preconErr.message }, { status: 500 })
  }

  if (!preconCards || preconCards.length === 0) {
    return Response.json({ error: 'Precon card list not loaded yet', isPreconMod: true, preconUrl: deck.precon_url }, { status: 200 })
  }

  const preconSet = new Set(preconCards.map(c => c.card_name))

  // Get current deck cards (excluding Maybeboard/Sideboard) with set info
  const { data: currentCardsRaw, error: cardsErr } = await supabase
    .from('deck_cards')
    .select('card_name, set_code, scryfall_id, categories')
    .eq('deck_id', deckId)

  if (cardsErr) {
    return Response.json({ error: cardsErr.message }, { status: 500 })
  }

  // Filter out Maybeboard and Sideboard categories
  const currentCards = (currentCardsRaw ?? []).filter(
    c => !(c.categories ?? '').includes('Maybeboard') && !(c.categories ?? '').includes('Sideboard')
  )

  const currentSet = new Set(currentCards.map(c => c.card_name))

  // Build a map of card_name -> set_code for added cards
  const cardSetMap = new Map<string, string>()
  for (const c of currentCards) {
    if (c.set_code) cardSetMap.set(c.card_name, c.set_code.toUpperCase())
  }

  // Compute diff
  const addedNames = [...currentSet].filter(c => !preconSet.has(c)).sort()
  const removedNames = [...preconSet].filter(c => !currentSet.has(c)).sort()

  // Look up rarity and price from card_metadata for added cards
  const allCardNames = [...new Set([...addedNames, ...removedNames])]
  let metadataMap = new Map<string, { rarity: string | null; price_usd: number | null }>()

  if (allCardNames.length > 0) {
    const { data: metadata } = await supabase
      .from('card_metadata')
      .select('card_name, rarity, price_usd')
      .in('card_name', allCardNames)

    metadataMap = new Map(
      (metadata ?? []).map(m => [m.card_name, { rarity: m.rarity, price_usd: m.price_usd }])
    )
  }

  const added: CardInfo[] = addedNames.map(name => {
    const meta = metadataMap.get(name)
    return {
      name,
      set: cardSetMap.get(name) || undefined,
      rarity: meta?.rarity || undefined,
      price: meta?.price_usd || undefined,
    }
  })

  const removed: CardInfo[] = removedNames.map(name => {
    const meta = metadataMap.get(name)
    return {
      name,
      rarity: meta?.rarity || undefined,
      price: meta?.price_usd || undefined,
    }
  })

  // Compute compliance
  const addedRarities = added.reduce((acc, c) => {
    const r = (c.rarity || 'common').toLowerCase()
    acc[r] = (acc[r] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const totalValue = added.reduce((sum, c) => sum + (c.price || 0), 0)
  const solRingRemoved = removedNames.includes('Sol Ring')

  const compliance = {
    swapsUsed: Math.max(added.length, removed.length),
    swapLimit: 10,
    swapsOk: Math.max(added.length, removed.length) <= 10,
    solRingRemoved,
    solRingOk: solRingRemoved,
    rarityBreakdown: {
      mythic: addedRarities['mythic'] || 0,
      rare: addedRarities['rare'] || 0,
      uncommon: addedRarities['uncommon'] || 0,
      common: addedRarities['common'] || 0,
    },
    rarityOk: (addedRarities['mythic'] || 0) <= 1 &&
      (addedRarities['mythic'] || 0) + (addedRarities['rare'] || 0) <= 3 &&
      (addedRarities['mythic'] || 0) + (addedRarities['rare'] || 0) + (addedRarities['uncommon'] || 0) <= 6,
    totalValue: Math.round(totalValue * 100) / 100,
    valueLimit: 50,
    valueOk: totalValue <= 50,
  }

  return Response.json({
    isPreconMod: true,
    preconUrl: deck.precon_url,
    preconCardCount: preconCards.length,
    currentCardCount: currentCards.length,
    added,
    removed,
    swapCount: Math.max(added.length, removed.length),
    compliance,
  })
}
