// ---------------------------------------------------------------------------
// POST /api/decks/[id]/push
//
// DORMANT: Playwright browser automation is decommissioned for Vercel deployment
// (supabase-migration Requirement 7). This route is retained but returns a 501
// indicating the feature is unavailable in the current deployment environment.
// Users should manually copy-paste deck lists to Archidekt instead.
//
// The push route previously used Playwright to:
// - Write proxy tags for imported decks (updateProxyTags)
// - Create new decks on Archidekt (createDeck)
//
// Both operations now require manual user action on Archidekt.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await params
  const deckId = parseInt(id, 10)

  if (isNaN(deckId)) {
    return Response.json(
      { success: false, error: 'Invalid deck ID' },
      { status: 400 }
    )
  }

  return Response.json(
    {
      success: false,
      error:
        'Playwright automation is dormant — pushing to Archidekt is not available in this deployment. Please manually copy-paste your deck list to Archidekt.',
      deckId,
    },
    { status: 501 }
  )
}
