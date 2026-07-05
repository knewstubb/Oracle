import { NextRequest } from 'next/server'
import { getDocumentation, upsertDocumentation } from '@/lib/deck-documentation-store'
import { requireAuth } from '@/lib/auth'
import type { DeckDocumentationFields } from '@/lib/deck-documentation-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  const documentation = await getDocumentation(deckId)
  return Response.json({ documentation })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)
  if (isNaN(deckId) || deckId <= 0) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: Partial<DeckDocumentationFields>
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate synergy_lines is valid JSON array if provided and non-null
  if (body.synergy_lines !== undefined && body.synergy_lines !== null) {
    try {
      const parsed = JSON.parse(body.synergy_lines)
      if (!Array.isArray(parsed)) {
        return Response.json({ error: 'synergy_lines must be a valid JSON array' }, { status: 400 })
      }
    } catch {
      return Response.json({ error: 'synergy_lines must be a valid JSON array' }, { status: 400 })
    }
  }

  try {
    await upsertDocumentation(deckId, body, authResult.id)
    const updated = await getDocumentation(deckId)
    return Response.json({ documentation: updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save documentation'
    return Response.json({ error: message }, { status: 500 })
  }
}
