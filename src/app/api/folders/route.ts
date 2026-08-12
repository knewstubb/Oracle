/**
 * GET /api/folders - List all folders for the current user
 * POST /api/folders - Create a new folder
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

export interface Folder {
  id: number
  name: string
  color: string | null
  position: number
  deckCount: number
}

export async function GET() {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const supabase = createAdminClient()

  // Fetch folders with deck counts
  const { data: folders, error } = await (supabase as any)
    .from('deck_folders')
    .select('id, name, color, position')
    .eq('user_id', userId)
    .order('position', { ascending: true })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Get deck counts per folder
  const { data: deckCounts } = await (supabase as any)
    .from('decks')
    .select('folder_id')
    .eq('user_id', userId)
    .not('folder_id', 'is', null)

  const countMap = new Map<number, number>()
  for (const deck of deckCounts ?? []) {
    countMap.set(deck.folder_id, (countMap.get(deck.folder_id) ?? 0) + 1)
  }

  const result: Folder[] = (folders ?? []).map((f: any) => ({
    id: f.id,
    name: f.name,
    color: f.color,
    position: f.position,
    deckCount: countMap.get(f.id) ?? 0,
  }))

  return Response.json({ folders: result })
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: { name: string; color?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, color } = body

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return Response.json({ error: 'Folder name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Get the next position
  const { data: lastFolder } = await (supabase as any)
    .from('deck_folders')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (lastFolder?.position ?? -1) + 1

  const { data: folder, error } = await (supabase as any)
    .from('deck_folders')
    .insert({
      user_id: userId,
      name: name.trim(),
      color: color ?? null,
      position: nextPosition,
    })
    .select('id, name, color, position')
    .single()

  if (error) {
    if (error.code === '23505') { // unique violation
      return Response.json({ error: 'A folder with that name already exists' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ folder: { ...folder, deckCount: 0 } }, { status: 201 })
}
