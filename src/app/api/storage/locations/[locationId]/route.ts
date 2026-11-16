/** GET /api/storage/locations/{id} — copies stored in one storage location. */
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { fetchStorageCopies } from '@/lib/storage/copies'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ locationId: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const { locationId } = await params
  const id = Number(locationId)
  if (!Number.isInteger(id)) return Response.json({ error: 'Invalid location' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: loc, error } = await supabase
    .from('user_locations')
    .select('id, name, color')
    .eq('id', id)
    .eq('user_id', authResult.id)
    .eq('type', 'storage')
    .maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!loc) return Response.json({ error: 'Location not found' }, { status: 404 })

  try {
    const copies = await fetchStorageCopies(supabase, authResult.id, id)
    return Response.json({ locationName: loc.name, locationColor: loc.color, copies })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
