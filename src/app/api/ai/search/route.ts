import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

interface ScryfallCard {
  name: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  color_identity?: string[]
  image_uris?: { normal?: string }
  card_faces?: Array<{ image_uris?: { normal?: string } }>
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  try {
    const body = await request.json()
    const { query, collectionOnly, colorIdentity } = body as {
      query: string
      collectionOnly?: boolean
      colorIdentity?: string
    }

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return Response.json({ cards: [] })
    }

    // Build Scryfall search query
    let scryfallQuery = query.trim()
    
    // Add color identity filter if specified
    if (colorIdentity) {
      scryfallQuery += ` id<=${colorIdentity}`
    }

    // Search Scryfall (their API is fast and well-cached)
    const scryfallUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(scryfallQuery)}&order=name&unique=cards`
    const scryfallRes = await fetch(scryfallUrl, {
      headers: { 'User-Agent': 'TheOracle/1.0' },
      next: { revalidate: 3600 }, // Cache 1 hour
    })

    let scryfallCards: ScryfallCard[] = []
    if (scryfallRes.ok) {
      const json = await scryfallRes.json()
      scryfallCards = (json.data ?? []).slice(0, 30)
    }

    if (scryfallCards.length === 0) {
      return Response.json({ cards: [] })
    }

    // Get ownership data for these cards
    const cardNames = scryfallCards.map(c => c.name)
    const supabase = createServerClient()
    
    const { data: ownedCards } = await supabase
      .from('user_cards')
      .select(`
        card_name,
        user_copies!inner(id, is_proxy)
      `)
      .eq('user_id', userId)
      .in('card_name', cardNames)

    // Build ownership map: card_name -> { owned: count, proxies: count }
    const ownershipMap = new Map<string, { owned: number; proxies: number }>()
    for (const card of ownedCards ?? []) {
      const copies = (card as any).user_copies as Array<{ id: number; is_proxy: boolean }>
      const owned = copies.filter(c => !c.is_proxy).length
      const proxies = copies.filter(c => c.is_proxy).length
      ownershipMap.set(card.card_name, { owned, proxies })
    }

    // Map results
    let cards = scryfallCards.map((card) => {
      const ownership = ownershipMap.get(card.name)
      return {
        name: card.name,
        manaCost: card.mana_cost ?? '',
        typeLine: card.type_line ?? '',
        oracleText: card.oracle_text ?? '',
        colorIdentity: card.color_identity ?? [],
        owned: (ownership?.owned ?? 0) > 0,
        ownedCount: ownership?.owned ?? 0,
        proxyCount: ownership?.proxies ?? 0,
      }
    })

    // Filter to collection only if requested
    if (collectionOnly) {
      cards = cards.filter((c) => c.owned || c.proxyCount > 0)
    }

    return Response.json({ cards })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: `Search failed: ${message}` }, { status: 500 })
  }
}
