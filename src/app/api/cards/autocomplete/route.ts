/**
 * GET /api/cards/autocomplete?q=<query>
 *
 * Proxies Scryfall's autocomplete API to provide card name suggestions.
 * Returns up to 20 card names matching the query prefix.
 */

import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')

  if (!q || q.length < 2) {
    return Response.json({ data: [] })
  }

  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`,
      {
        headers: { 'User-Agent': 'TheOracle/0.1.0' },
        next: { revalidate: 3600 }, // Cache for 1 hour
      }
    )

    if (!res.ok) {
      return Response.json({ data: [] })
    }

    const json = await res.json()
    return Response.json({ data: json.data ?? [] })
  } catch {
    return Response.json({ data: [] })
  }
}
