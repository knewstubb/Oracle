import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { loadCollectionCardDetails } from '@/lib/card-details/load-collection'

/**
 * GET /api/collection/instances/[oracleId]/details
 * Read-only. Everything the card details window shows in the collection context: card facts, Tags, printings,
 * the user's copies of the card in any printing, the decks waiting for it, and rulings.
 * A card the user owns no copies of still answers 200 with an empty copies list. A failed lookup is a 500.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ oracleId: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { oracleId } = await params
  if (!oracleId) return Response.json({ error: 'oracleId is required' }, { status: 400 })
  const supabase = createAdminClient()
  try {
    return Response.json(await loadCollectionCardDetails(supabase, authResult.id, oracleId))
  } catch (err) {
    console.error('[collection card details GET]', err)
    return Response.json({ error: "Couldn't load this card's details." }, { status: 500 })
  }
}
