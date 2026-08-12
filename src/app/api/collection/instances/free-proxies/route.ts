import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/free-proxies?cardName=Sol+Ring
 *
 * Returns unassigned proxy copies for a given card name.
 * These are user_copies where is_proxy=true, user_cards matches,
 * and the copy is NOT referenced by any deck_cards.copy_id.
 */

interface FreeProxy {
  copyId: number
  setName: string
  condition: string | null
}

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const { searchParams } = new URL(request.url)
  const cardName = searchParams.get('cardName')

  if (!cardName) {
    return Response.json({ error: 'cardName query parameter is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  try {
    // 1. Resolve card_name → user_cards.id(s)
    const { data: userCards, error: ucErr } = await supabase
      .from('user_cards')
      .select('id')
      .eq('card_name', cardName)
      .eq('user_id', authResult.id)

    if (ucErr) throw ucErr
    if (!userCards || userCards.length === 0) {
      return Response.json({ proxies: [] })
    }

    const cardIds = userCards.map((uc) => uc.id)

    // 2. Fetch user_copies where card_id IN (those IDs), is_proxy=true
    const { data: proxyCopies, error: pcErr } = await supabase
      .from('user_copies')
      .select('id, condition, printing_id')
      .in('card_id', cardIds)
      .eq('is_proxy', true)
      .eq('user_id', authResult.id)

    if (pcErr) throw pcErr
    if (!proxyCopies || proxyCopies.length === 0) {
      return Response.json({ proxies: [] })
    }

    // 3. Filter out any that are currently assigned (referenced by deck_cards.copy_id)
    const proxyIds = proxyCopies.map((pc) => pc.id)

    const { data: assignedRows } = await supabase
      .from('deck_cards')
      .select('copy_id')
      .in('copy_id', proxyIds)
      .not('copy_id', 'is', null)

    const assignedIds = new Set(
      (assignedRows ?? []).map((r) => r.copy_id)
    )

    // 4. Get set info for unassigned proxies
    const freeProxies = proxyCopies.filter((pc) => !assignedIds.has(pc.id))

    if (freeProxies.length === 0) {
      return Response.json({ proxies: [] })
    }

    // Resolve set names from ref_printings
    const printingIds = freeProxies
      .map((pc) => pc.printing_id)
      .filter((id): id is string => id !== null)

    let printingMap: Map<string, string> = new Map()
    if (printingIds.length > 0) {
      const { data: printings } = await supabase
        .from('ref_printings')
        .select('scryfall_id, set_name, set_code')
        .in('scryfall_id', printingIds)

      if (printings) {
        for (const p of printings) {
          printingMap.set(
            p.scryfall_id,
            p.set_name || p.set_code?.toUpperCase() || 'Unknown Set'
          )
        }
      }
    }

    const result: FreeProxy[] = freeProxies.map((pc) => ({
      copyId: pc.id,
      setName: pc.printing_id ? (printingMap.get(pc.printing_id) ?? 'Proxy') : 'Proxy',
      condition: pc.condition ?? null,
    }))

    return Response.json({ proxies: result })
  } catch (error) {
    console.error('Failed to load free proxies for cardName:', cardName, error)
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return Response.json(
      { error: 'Failed to load free proxies', detail: message },
      { status: 500 }
    )
  }
}
