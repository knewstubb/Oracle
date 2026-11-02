/**
 * GET /api/precons?q=&limit=
 *
 * READ ONLY list of commander precons for the Precon tab. Reference data (no user rows).
 * Degrades gracefully: until the `cards` column exists and the sync has filled it, returns
 * `{ precons: [], setup: false }` so the tab can say "Precons not set up yet".
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import {
  commanderImageUrl,
  isPreconsNotSetUp,
  sanitizePreconSearch,
  type PreconListItem,
} from '@/lib/precons'

const COLUMNS =
  'id, name, set_code, set_name, commander_name, commander_scryfall_id, color_identity, release_date, card_count'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const params = request.nextUrl.searchParams
  const q = sanitizePreconSearch(params.get('q') ?? '')
  const limit = Math.min(Math.max(Number.parseInt(params.get('limit') ?? '30', 10) || 30, 1), 300)

  try {
    let query = createAdminClient()
      .from('ref_precons')
      .select(COLUMNS)
      // Only precons whose card list has been stored can be opened.
      .not('cards', 'is', null)
      .order('release_date', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (q) {
      query = query.or(`name.ilike.%${q}%,commander_name.ilike.%${q}%,set_name.ilike.%${q}%`)
    }
    const { data, error } = await query
    if (error) {
      if (isPreconsNotSetUp(error)) return Response.json({ precons: [], setup: false })
      throw new Error(error.message)
    }
    const precons: PreconListItem[] = (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      set_code: r.set_code,
      set_name: r.set_name,
      commander_name: r.commander_name,
      color_identity: r.color_identity,
      release_date: r.release_date,
      card_count: r.card_count ?? 100,
      commander_image: commanderImageUrl(r.commander_scryfall_id),
    }))
    // With no search and nothing stored, the sync has not been run yet.
    return Response.json({ precons, setup: q ? true : precons.length > 0 })
  } catch (err) {
    console.error('[precons]', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Could not load precons' }, { status: 500 })
  }
}
