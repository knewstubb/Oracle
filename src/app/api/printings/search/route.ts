/**
 * Read-only printing search for one card name (used by the generic-basic art picker).
 * GET /api/printings/search?name=Island&q=zendikar
 * Returns up to 60 printings, newest first, with finishes and whether the user owns each.
 */

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ownedBasicPrintings } from '@/lib/generic-basics'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const name = request.nextUrl.searchParams.get('name')?.trim()
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().replace(/[%,()]/g, '')
  if (!name) return Response.json({ error: 'name is required' }, { status: 400 })

  const supabase = createAdminClient()
  let query = supabase
    .from('ref_printings')
    .select('scryfall_id, set_code, set_name, collector_number, finishes, released_at, image_uri_small')
    .eq('name', name)
    .order('released_at', { ascending: false })
    .limit(60)
  if (q) query = query.or(`set_name.ilike.%${q}%,set_code.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return Response.json({ error: 'Printing search failed' }, { status: 500 })

  const owned = new Set(await ownedBasicPrintings(supabase, authResult.id, name))
  return Response.json({
    printings: (data ?? []).map((p) => ({
      scryfallId: p.scryfall_id,
      setCode: p.set_code,
      setName: p.set_name,
      collectorNumber: p.collector_number,
      finishes: p.finishes ?? [],
      imageUrl: p.image_uri_small,
      owned: owned.has(p.scryfall_id),
    })),
  })
}
