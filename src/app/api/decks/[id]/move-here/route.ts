/**
 * Move here: move one chosen copy from another deck into this deck, instantly.
 * Contract: docs/oracle/contracts/know-where-cards-are.md section 4a.
 *
 * GET  /api/decks/[id]/move-here?cardName=X
 *   Says whether this deck has an open (planned) slot for the card, and lists the copies sitting in OTHER decks
 *   in the default order (non-Playable decks first, originals before proxies, then A to Z).
 *   Response: { hasOpenSlot: boolean, copies: MoveHereCopy[] }
 *
 * POST /api/decks/[id]/move-here   body { copyId, cardName, expectedSourceDeckId }
 *   One atomic move through the existing `reassign_to_deck` function. The source deck keeps its slot (now empty).
 *   Creates no checklist entry and no reminder. Undo goes through POST /api/allocation/undo (response.undo).
 *   Response: MoveHereResponse plus `sourceWasPlayable`.
 *
 * No schema change. The contract also describes a dedicated database function that would do the "already in this
 * deck" and "still where the screen said" checks inside the same transaction; that needs a migration, which is not
 * approved yet, so these checks run in this route immediately before the move and the move's own source slot is
 * re-verified afterwards (a mismatch is undone at once).
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { assertAtomicRpcId, assertAtomicRpcSuccess } from '@/lib/atomic-rpc'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import { movableCopies, moveHereErrorMessage, type MoveHereCopy } from '@/lib/move-here'
import type { MoveHereBody, MoveHereResponse } from '../../../../../../docs/oracle/contracts/know-where-cards-are.types'

const DECK_SIZE = 100 // Commander

type Admin = ReturnType<typeof createAdminClient>

interface SlotRow {
  copy_id: number | null
  is_generic: boolean | null
  generic_sleeved: boolean | null
}

async function deckSlots(supabase: Admin, deckIds: number[]): Promise<Map<number, SlotRow[]>> {
  const out = new Map<number, SlotRow[]>()
  if (deckIds.length === 0) return out
  const { data, error } = await supabase
    .from('deck_cards')
    .select('deck_id, copy_id, is_generic, generic_sleeved')
    .in('deck_id', deckIds)
  if (error) throw new Error(`deck lookup failed: ${error.message}`)
  for (const row of (data ?? []) as Array<SlotRow & { deck_id: number }>) {
    const list = out.get(row.deck_id) ?? []
    list.push(row)
    out.set(row.deck_id, list)
  }
  return out
}

function fail(code: string, cardName: string, status: number, sourceDeckName?: string) {
  return Response.json({ error: code, message: moveHereErrorMessage(code, cardName, sourceDeckName) }, { status })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const deckId = parseInt((await params).id, 10)
  const cardName = request.nextUrl.searchParams.get('cardName')?.trim()
  if (isNaN(deckId) || !cardName) {
    return Response.json({ error: 'deck id and cardName are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    const { data: openSlots, error: slotErr } = await supabase
      .from('deck_cards')
      .select('id')
      .eq('deck_id', deckId)
      .eq('user_id', userId)
      .eq('card_name', cardName)
      .is('copy_id', null)
      .limit(1)
    if (slotErr) throw new Error(slotErr.message)
    const hasOpenSlot = (openSlots ?? []).length > 0
    if (!hasOpenSlot) return Response.json({ hasOpenSlot, copies: [] })

    const { data: cards, error: cardErr } = await supabase
      .from('user_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('card_name', cardName)
    if (cardErr) throw new Error(cardErr.message)
    const cardIds = (cards ?? []).map((c) => c.id)
    if (cardIds.length === 0) return Response.json({ hasOpenSlot, copies: [] })

    const { data: copyRows, error: copyErr } = await supabase
      .from('user_copies')
      .select('id, is_proxy, missing, deck_cards!deck_cards_copy_id_fkey(id, deck_id, decks!deck_cards_deck_id_fkey(name))')
      .eq('user_id', userId)
      .in('card_id', cardIds)
    if (copyErr) throw new Error(copyErr.message)

    type Row = {
      id: number
      is_proxy: boolean
      missing: boolean | null
      deck_cards: Array<{ id: number; deck_id: number; decks: { name: string } | null }> | null
    }
    const inDecks: Array<Omit<MoveHereCopy, 'deckState'>> = []
    for (const row of (copyRows ?? []) as unknown as Row[]) {
      if (row.missing) continue // a missing copy is never offered
      const dc = row.deck_cards?.[0]
      if (!dc) continue
      inDecks.push({ copyId: row.id, isProxy: row.is_proxy, deckId: dc.deck_id, deckName: dc.decks?.name ?? `Deck ${dc.deck_id}` })
    }

    const slots = await deckSlots(supabase, [...new Set(inDecks.map((c) => c.deckId))])
    const withState: MoveHereCopy[] = inDecks.map((c) => ({
      ...c,
      deckState: computeDeckReadiness(slots.get(c.deckId) ?? [], DECK_SIZE).state,
    }))
    return Response.json({ hasOpenSlot, copies: movableCopies(withState, deckId) })
  } catch (err) {
    console.error('[move-here GET]', err)
    return Response.json({ error: 'failed', message: "Couldn't check where your copies are." }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id

  const targetDeckId = parseInt((await params).id, 10)
  let body: MoveHereBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { copyId, cardName, expectedSourceDeckId } = body
  if (isNaN(targetDeckId) || !Number.isInteger(copyId) || !Number.isInteger(expectedSourceDeckId) || !cardName) {
    return Response.json({ error: 'copyId, cardName and expectedSourceDeckId are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  try {
    const { data: copy, error: copyErr } = await supabase
      .from('user_copies')
      .select('id, is_proxy, missing, deck_cards!deck_cards_copy_id_fkey(id, deck_id, decks!deck_cards_deck_id_fkey(name))')
      .eq('id', copyId)
      .eq('user_id', userId)
      .maybeSingle()
    if (copyErr) throw new Error(copyErr.message)
    if (!copy) return fail('copy_not_found', cardName, 404)

    const row = copy as unknown as {
      missing: boolean | null
      deck_cards: Array<{ id: number; deck_id: number; decks: { name: string } | null }> | null
    }
    if (row.missing) return fail('copy_missing', cardName, 409)

    const current = row.deck_cards?.[0]
    // Already in the deck we are moving into: refuse (a deck wanting two copies must not shuffle between its own slots).
    if (current && current.deck_id === targetDeckId) return fail('already_in_this_deck', cardName, 409)
    // The screen said the copy was in another deck; if it moved (or left every deck) since, do nothing.
    if (!current || current.deck_id !== expectedSourceDeckId) return fail('source_changed', cardName, 409)
    const sourceDeckName = current.decks?.name ?? `Deck ${current.deck_id}`

    const before = (await deckSlots(supabase, [current.deck_id])).get(current.deck_id) ?? []
    const sourceWasPlayable = computeDeckReadiness(before, DECK_SIZE).state === 'playable'

    const { data, error: rpcErr } = await supabase.rpc('reassign_to_deck', {
      p_copy_id: copyId,
      p_target_deck_id: targetDeckId,
      p_card_name: cardName,
      p_user_id: userId,
      p_source: 'manual',
    })
    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      if (msg.includes('no_open_slot')) return fail('no_open_slot', cardName, 409)
      if (msg.includes('copy_missing')) return fail('copy_missing', cardName, 409)
      if (msg.includes('copy_not_assigned')) return fail('source_changed', cardName, 409, sourceDeckName)
      if (msg.includes('copy_not_found')) return fail('copy_not_found', cardName, 404)
      throw new Error(msg)
    }

    const result = assertAtomicRpcSuccess(data, 'reassign_to_deck')
    const sourceDeckCardId = assertAtomicRpcId(result, 'source_deck_card_id', 'reassign_to_deck')
    const targetDeckCardId = assertAtomicRpcId(result, 'target_deck_card_id', 'reassign_to_deck')

    if (sourceDeckCardId !== current.id) {
      // Someone else moved the copy between our check and the move. Put it back exactly and report.
      await supabase.rpc('undo_copy_move', {
        p_current_deck_card_id: targetDeckCardId,
        p_copy_id: copyId,
        p_restore_deck_card_id: sourceDeckCardId,
        p_user_id: userId,
        p_source: 'manual',
      })
      return fail('source_changed', cardName, 409, sourceDeckName)
    }

    const after = (await deckSlots(supabase, [current.deck_id])).get(current.deck_id) ?? []
    const sourceDeckStatusAfter = computeDeckReadiness(after, DECK_SIZE).state

    const response: MoveHereResponse & { sourceWasPlayable: boolean } = {
      copyId,
      sourceDeckId: current.deck_id,
      sourceDeckName,
      sourceDeckCardId,
      targetDeckCardId,
      sourceDeckNowShort: true,
      sourceDeckStatusAfter,
      undo: { deckCardsId: targetDeckCardId, physicalCopyId: copyId, restoreTo: { deckCardsId: sourceDeckCardId } },
      sourceWasPlayable,
    }
    return Response.json(response)
  } catch (err) {
    console.error('[move-here POST]', err)
    return fail('failed', cardName, 500)
  }
}
