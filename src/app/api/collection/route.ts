import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const supabase = createAdminClient()
  const userId = authResult.id

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'name'
  const order = searchParams.get('order') === 'desc'

  // Fetch copies with card info via join
  let query = supabase
    .from('user_copies')
    .select(`
      id,
      printing_id,
      finish,
      user_cards!inner(card_name)
    `)
    .eq('user_id', userId)

  const { data: copies, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Get unique card names for search filtering
  let result = (copies || []).map((r: any) => ({
    copyId: r.id,
    card_name: r.user_cards?.card_name || '',
    scryfall_id: r.printing_id || '',
    foil: r.finish === 'foil' || r.finish === 'etched',
  }))

  // Apply search filter
  if (search) {
    const searchLower = search.toLowerCase()
    result = result.filter((r: any) => r.card_name.toLowerCase().includes(searchLower))
  }

  // Apply sorting
  if (sort === 'name') {
    result.sort((a: any, b: any) => {
      const cmp = a.card_name.localeCompare(b.card_name)
      return order ? -cmp : cmp
    })
  }

  return Response.json(result)
}
