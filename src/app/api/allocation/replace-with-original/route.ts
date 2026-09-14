/**
 * POST /api/allocation/replace-with-original
 *
 * Atomically replaces a proxy in a deck slot with a free original copy and
 * returns the outgoing proxy to storage.
 *
 * Body: {
 *   deckCardsId?: number
 *   proxyCopyId?: number
 *   originalCopyId: number
 *   proxyStorageLocationId: number | null
 * }
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

interface ReplaceBody {
  deckCardsId?: number
  proxyCopyId?: number
  originalCopyId: number
  proxyStorageLocationId: number | null
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  let body: ReplaceBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    deckCardsId: providedDeckCardsId,
    proxyCopyId: bodyProxyCopyId,
    originalCopyId,
    proxyStorageLocationId,
  } = body

  if (typeof originalCopyId !== 'number') {
    return Response.json({ error: 'originalCopyId is required' }, { status: 400 })
  }

  if (providedDeckCardsId == null && bodyProxyCopyId == null) {
    return Response.json(
      { error: 'Either deckCardsId or proxyCopyId is required' },
      { status: 400 }
    )
  }

  if (proxyStorageLocationId === undefined) {
    return Response.json(
      { error: 'proxyStorageLocationId is required (use null for Unsorted)' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  let deckCardsId = providedDeckCardsId

  try {
    if (deckCardsId == null && bodyProxyCopyId != null) {
      const { data: deckCard, error: lookupError } = await supabase
        .from('deck_cards')
        .select('id')
        .eq('copy_id', bodyProxyCopyId)
        .eq('user_id', userId)
        .maybeSingle()

      if (lookupError) {
        return Response.json({ error: lookupError.message }, { status: 500 })
      }
      if (!deckCard) {
        return Response.json({ error: 'Could not find deck slot for this proxy' }, { status: 404 })
      }
      deckCardsId = deckCard.id
    }

    if (deckCardsId == null) {
      return Response.json({ error: 'Could not resolve deck cards ID' }, { status: 400 })
    }

    const { data, error: rpcError } = await supabase.rpc('replace_proxy_with_original', {
      p_deck_card_id: deckCardsId,
      p_original_copy_id: originalCopyId,
      p_proxy_storage_location_id: proxyStorageLocationId,
      p_user_id: userId,
    })

    if (rpcError) {
      if (rpcError.message.includes('proxy_slot_not_found') || rpcError.message.includes('proxy_copy_not_found')) {
        return Response.json({ error: 'Proxy deck slot not found' }, { status: 404 })
      }
      if (rpcError.message.includes('original_copy_not_found')) {
        return Response.json({ error: 'Original copy not found' }, { status: 404 })
      }
      if (rpcError.message.includes('storage_location_not_found')) {
        return Response.json({ error: 'Storage location not found' }, { status: 404 })
      }
      if (rpcError.message.includes('replacement_copy_is_proxy')) {
        return Response.json(
          { error: 'Target copy is also a proxy — must be an original' },
          { status: 400 }
        )
      }
      if (
        rpcError.message.includes('replacement_copy_already_assigned') ||
        rpcError.message.includes('replacement_copy_missing')
      ) {
        return Response.json(
          { error: 'Original copy is unavailable for replacement' },
          { status: 409 }
        )
      }
      return Response.json({ error: `Replacement failed: ${rpcError.message}` }, { status: 500 })
    }

    const result = assertAtomicRpcSuccess(data, 'replace_proxy_with_original')
    return Response.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}
