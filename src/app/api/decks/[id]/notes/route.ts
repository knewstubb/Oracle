import { NextRequest } from 'next/server'
import { getNotes } from '@/lib/deck-documentation-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  // Parse optional limit query param — ignore if not a positive integer
  const limitParam = request.nextUrl.searchParams.get('limit')
  let limit: number | undefined
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (!isNaN(parsed) && parsed > 0 && Number.isInteger(parsed)) {
      limit = parsed
    }
  }

  const notes = await getNotes(deckId, limit)
  return Response.json({ notes })
}
