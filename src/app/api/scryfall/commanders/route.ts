/**
 * GET /api/scryfall/commanders?q=muldr
 *
 * Searches Scryfall for valid commanders matching the query.
 * Uses Scryfall's search with `is:commander` filter to ensure only
 * legal commanders are returned.
 *
 * Returns: Array<{ name, scryfallId, colorIdentity, imageUri }>
 */
import { NextRequest } from 'next/server'

interface ScryfallCard {
  id: string
  name: string
  color_identity: string[]
  image_uris?: { art_crop?: string }
  card_faces?: Array<{ image_uris?: { art_crop?: string } }>
}

interface ScryfallSearchResponse {
  data?: ScryfallCard[]
  total_cards?: number
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return Response.json([])
  }

  try {
    // Scryfall search: is:commander + name autocomplete
    const query = encodeURIComponent(`${q.trim()} is:commander`)
    const res = await fetch(
      `https://api.scryfall.com/cards/search?q=${query}&order=name&unique=cards`,
      {
        headers: { 'User-Agent': 'TheOracle/1.0' },
        // Cache for 5 minutes at the edge
        next: { revalidate: 300 },
      }
    )

    if (!res.ok) {
      // Scryfall returns 404 for no results
      if (res.status === 404) return Response.json([])
      return Response.json([])
    }

    const data: ScryfallSearchResponse = await res.json()

    const results = (data.data ?? []).slice(0, 10).map((card) => ({
      name: card.name,
      scryfallId: card.id,
      colorIdentity: card.color_identity,
      imageUri: card.image_uris?.art_crop ?? card.card_faces?.[0]?.image_uris?.art_crop ?? null,
    }))

    return Response.json(results)
  } catch {
    return Response.json([])
  }
}
