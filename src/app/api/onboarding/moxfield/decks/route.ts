/**
 * GET /api/onboarding/moxfield/decks?username=Bullet_the_Grey
 *
 * Fetches a Moxfield user's public deck list for the deck picker.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { fetchMoxfieldUserDecks } from '@/lib/moxfield-client'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const username = request.nextUrl.searchParams.get('username')
  if (!username) {
    return Response.json({ error: 'username query parameter is required' }, { status: 400 })
  }

  try {
    const decks = await fetchMoxfieldUserDecks(username)

    return Response.json({
      decks: decks.map(d => ({
        id: d.publicId,
        name: d.name,
        cardCount: d.mainboardCount || 0,
        isPrivate: false, // only public decks are returned by the API
      })),
      errors: [],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('private') || message.includes('not found')) {
      return Response.json({ error: message }, { status: 403 })
    }
    return Response.json({ error: message }, { status: 500 })
  }
}
