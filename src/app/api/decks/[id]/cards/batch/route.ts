/**
 * POST /api/decks/[id]/cards/batch
 *
 * Applies an AI-proposed deck-card delta in one Postgres transaction.
 * Additions create planned slots; removing a sleeved slot returns its copy
 * to the user's default storage location before deleting the slot.
 *
 * Body:
 *   {
 *     additions?: { name: string; category?: string; quantity?: number }[],
 *     removeCards?: { name: string }[]
 *   }
 */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { assertAtomicRpcCount, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'

interface AdditionInput {
  name: string
  category?: string
  quantity?: number
}

interface RemoveInput {
  name: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const { id } = await params
  const deckId = Number.parseInt(id, 10)
  if (Number.isNaN(deckId)) {
    return Response.json({ error: 'Invalid deck ID' }, { status: 400 })
  }

  let body: { additions?: AdditionInput[]; removeCards?: RemoveInput[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const additions = Array.isArray(body.additions) ? body.additions : []
  const removeCards = Array.isArray(body.removeCards) ? body.removeCards : []

  if (additions.length === 0 && removeCards.length === 0) {
    return Response.json({ success: true, added_count: 0, removed_count: 0 })
  }

  if (additions.some((addition) => !addition?.name?.trim())) {
    return Response.json({ error: 'Every addition requires a card name' }, { status: 400 })
  }
  if (removeCards.some((card) => !card?.name?.trim())) {
    return Response.json({ error: 'Every removal requires a card name' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Resolve the rows to remove before entering the transaction. The RPC
  // re-checks ownership and locks these rows before mutating them.
  const removalNames = removeCards.map((card) => card.name.trim())
  const removeDeckCardIds: number[] = []
  if (removalNames.length > 0) {
    const { data: rows, error: rowsError } = await supabase
      .from('deck_cards')
      .select('id, card_name')
      .eq('deck_id', deckId)
      .eq('user_id', userId)
      .in('card_name', removalNames)
      .order('id', { ascending: true })

    if (rowsError) {
      return Response.json({ error: rowsError.message }, { status: 500 })
    }

    const rowsByName = new Map<string, number[]>()
    for (const row of rows ?? []) {
      const existing = rowsByName.get(row.card_name) ?? []
      existing.push(row.id)
      rowsByName.set(row.card_name, existing)
    }

    for (const name of removalNames) {
      const candidates = rowsByName.get(name) ?? []
      const deckCardId = candidates.shift()
      if (deckCardId == null) {
        return Response.json(
          { error: `Card "${name}" was not found in this deck` },
          { status: 404 }
        )
      }
      removeDeckCardIds.push(deckCardId)
    }
  }

  // Resolve presentation metadata concurrently. The actual insert remains in
  // the single RPC so metadata lookup failure cannot leave a partial delta.
  const resolvedAdditions = await Promise.all(
    additions.map(async (addition) => {
      const name = addition.name.trim()
      const explicitCategory = addition.category?.trim()

      const [cardMetaResult, printingResult] = await Promise.all([
        supabase
          .from('ref_cards')
          .select('default_category, type_line')
          .eq('name', name)
          .maybeSingle(),
        supabase
          .from('ref_printings')
          .select('scryfall_id, type_line')
          .eq('name', name)
          .order('released_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (cardMetaResult.error) {
        throw new Error(`Failed to resolve ${name}: ${cardMetaResult.error.message}`)
      }
      if (printingResult.error) {
        throw new Error(`Failed to resolve printing for ${name}: ${printingResult.error.message}`)
      }

      let categories: string | null = explicitCategory
        ? JSON.stringify([explicitCategory])
        : null
      if (!categories && cardMetaResult.data?.default_category) {
        const category = cardMetaResult.data.default_category as { primary?: string }
        if (category.primary) categories = JSON.stringify([category.primary])
      }

      const quantity = addition.quantity ?? 1
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        throw new Error(`Invalid quantity for ${name}`)
      }

      return {
        card_name: name,
        scryfall_id: printingResult.data?.scryfall_id ?? null,
        set_code: null,
        categories,
        quantity,
        is_commander: false,
      }
    })
  ).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message }
  })

  if ('error' in resolvedAdditions) {
    return Response.json({ error: resolvedAdditions.error }, { status: 500 })
  }

  const { data, error: rpcErr } = await supabase.rpc('apply_ai_deck_delta', {
    p_deck_id: deckId,
    p_user_id: userId,
    p_additions: resolvedAdditions,
    p_remove_deck_card_ids: removeDeckCardIds,
  })

  if (rpcErr) {
    if (rpcErr.message?.includes('deck_not_found') || rpcErr.message?.includes('deck_card_not_found')) {
      return Response.json({ error: 'Deck or card not found' }, { status: 404 })
    }
    return Response.json({ error: `Failed to apply deck changes: ${rpcErr.message}` }, { status: 500 })
  }

  const result = assertAtomicRpcSuccess(data, 'apply_ai_deck_delta')
  assertAtomicRpcCount(
    result,
    'added_count',
    'apply_ai_deck_delta',
    resolvedAdditions.reduce((total, addition) => total + addition.quantity, 0)
  )
  assertAtomicRpcCount(
    result,
    'removed_count',
    'apply_ai_deck_delta',
    removeDeckCardIds.length
  )

  return Response.json({ success: true, ...result })
}
