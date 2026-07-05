import { createServerClient } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()

  const searchParams = request.nextUrl.searchParams
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'name'
  const order = searchParams.get('order') === 'desc'
  const identity = searchParams.get('identity') || ''
  const type = searchParams.get('type') || ''

  let query = supabase
    .from('collection')
    .select('card_name, scryfall_id, set_code, quantity, foil, color_identity, types')

  if (search) {
    query = query.ilike('card_name', `%${search}%`)
  }

  // Identity filter: ?identity=W,U means card must contain BOTH W AND U
  if (identity) {
    const identityValues = identity.split(',').map((v) => v.trim())
    for (const id of identityValues) {
      query = query.or(
        `color_identity.eq.${id},color_identity.like.${id}\\,%,color_identity.like.%\\,${id},color_identity.like.%\\,${id}\\,%`
      )
    }
  }

  // Type filter: ?type=Creature means card's types must contain the value
  if (type) {
    query = query.or(
      `types.eq.${type},types.like.${type}\\,%,types.like.%\\,${type},types.like.%\\,${type}\\,%`
    )
  }

  // Sorting
  switch (sort) {
    case 'quantity':
      query = query.order('quantity', { ascending: !order }).order('card_name', { ascending: true })
      break
    case 'set':
      query = query.order('set_code', { ascending: !order }).order('card_name', { ascending: true })
      break
    default:
      query = query.order('card_name', { ascending: !order })
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const result = (data || []).map((r) => ({
    card_name: r.card_name,
    scryfall_id: r.scryfall_id || '',
    set_code: r.set_code || '',
    quantity: r.quantity,
    foil: !!r.foil,
    color_identity: r.color_identity || '',
    types: r.types || '',
  }))

  return Response.json(result)
}
