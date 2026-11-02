/**
 * GET /api/precons/[id]
 *
 * READ ONLY. One precon with its stored card list, for the Precon tab to turn into a CSV and
 * open in the normal import review. Reference data (no user rows).
 * 503 `precons_not_set_up` until the `cards` column exists and the sync has filled it.
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  commanderImageUrl,
  isPreconsNotSetUp,
  preconCardCount,
  type PreconCard,
  type PreconDetail,
} from '@/lib/precons'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { id } = await ctx.params
  if (!UUID.test(id)) return Response.json({ error: 'Invalid precon id' }, { status: 400 })

  try {
    const { data, error } = await createAdminClient()
      .from('ref_precons')
      .select(
        'id, name, set_code, set_name, commander_name, commander_scryfall_id, color_identity, release_date, card_count, cards'
      )
      .eq('id', id)
      .maybeSingle()
    if (error) {
      if (isPreconsNotSetUp(error)) {
        return Response.json({ error: 'precons_not_set_up' }, { status: 503 })
      }
      throw new Error(error.message)
    }
    if (!data) return Response.json({ error: 'Precon not found' }, { status: 404 })
    const cards = Array.isArray(data.cards) ? (data.cards as unknown as PreconCard[]) : []
    if (cards.length === 0) return Response.json({ error: 'precons_not_set_up' }, { status: 503 })

    const precon: PreconDetail = {
      id: data.id,
      name: data.name,
      set_code: data.set_code,
      set_name: data.set_name,
      commander_name: data.commander_name,
      color_identity: data.color_identity,
      release_date: data.release_date,
      card_count: preconCardCount(cards),
      commander_image: commanderImageUrl(data.commander_scryfall_id),
      cards,
    }
    return Response.json({ precon })
  } catch (err) {
    console.error('[precons/id]', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Could not load this precon' }, { status: 500 })
  }
}
