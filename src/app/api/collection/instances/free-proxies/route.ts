import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

/**
 * GET /api/collection/instances/free-proxies?cardName=Sol+Ring
 *
 * Returns unassigned proxy copies for a given card name.
 * These are physical_copies where is_proxy=true, card_definition matches,
 * and the copy is NOT referenced by any deck_cards.physical_copy_id.
 */

interface FreeProxy {
  physicalCopyId: number
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
    // 1. Resolve card_name → card_definition_id(s)
    const { data: cardDefs, error: cdErr } = await (supabase as any)
      .from('card_definitions')
      .select('id')
      .eq('card_name', cardName)

    if (cdErr) throw cdErr
    if (!cardDefs || cardDefs.length === 0) {
      return Response.json({ proxies: [] })
    }

    const cardDefIds = cardDefs.map((cd: any) => cd.id)

    // 2. Fetch physical_copies where card_definition_id IN (those IDs), is_proxy=true, user owned
    const { data: proxyCopies, error: pcErr } = await (supabase as any)
      .from('physical_copies')
      .select('id, condition, scryfall_printing_id')
      .in('card_definition_id', cardDefIds)
      .eq('is_proxy', true)
      .eq('user_id', authResult.id)

    if (pcErr) throw pcErr
    if (!proxyCopies || proxyCopies.length === 0) {
      return Response.json({ proxies: [] })
    }

    // 3. Filter out any that are currently assigned (referenced by deck_cards.physical_copy_id)
    const proxyIds = proxyCopies.map((pc: any) => pc.id)

    const { data: assignedRows } = await (supabase as any)
      .from('deck_cards')
      .select('physical_copy_id')
      .in('physical_copy_id', proxyIds)
      .not('physical_copy_id', 'is', null)

    const assignedIds = new Set(
      (assignedRows ?? []).map((r: any) => r.physical_copy_id)
    )

    // 4. Get set info for unassigned proxies
    const freeProxies = proxyCopies.filter((pc: any) => !assignedIds.has(pc.id))

    if (freeProxies.length === 0) {
      return Response.json({ proxies: [] })
    }

    // Resolve set names from printing_set_info
    const scryfallIds = freeProxies
      .map((pc: any) => pc.scryfall_printing_id)
      .filter((id: any) => id !== null)

    let printingMap: Map<string, string> = new Map()
    if (scryfallIds.length > 0) {
      const { data: printings } = await (supabase as any)
        .from('printing_set_info')
        .select('scryfall_printing_id, edition_name, set_code')
        .in('scryfall_printing_id', scryfallIds)

      if (printings) {
        for (const p of printings) {
          printingMap.set(
            p.scryfall_printing_id,
            p.edition_name || p.set_code?.toUpperCase() || 'Unknown Set'
          )
        }
      }
    }

    const result: FreeProxy[] = freeProxies.map((pc: any) => ({
      physicalCopyId: pc.id,
      setName: printingMap.get(pc.scryfall_printing_id) ?? 'Proxy',
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
