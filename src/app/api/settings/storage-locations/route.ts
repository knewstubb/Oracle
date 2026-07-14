import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/settings/storage-locations
 * Returns all storage locations for the authenticated user, ordered by sort_order.
 */
export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()

  const { data, error } = await (supabase as any)
    .from('storage_locations')
    .select('id, name, description, color, sort_order, created_at')
    .eq('user_id', authResult.id)
    .order('sort_order')
    .order('name')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

/**
 * POST /api/settings/storage-locations
 * Create a new storage location.
 * Body: { name: string, description?: string, color?: string }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { name?: string; description?: string; color?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return Response.json({ error: 'Name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get max sort_order to append at end
  const { data: existing } = await (supabase as any)
    .from('storage_locations')
    .select('sort_order')
    .eq('user_id', authResult.id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextSort = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await (supabase as any)
    .from('storage_locations')
    .insert({
      name,
      description: body.description || null,
      color: body.color || '#6B7280',
      sort_order: nextSort,
      user_id: authResult.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'A location with that name already exists' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data, { status: 201 })
}
