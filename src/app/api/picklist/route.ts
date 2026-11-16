/**
 * GET /api/picklist[?deckIds=1,2,3] — the all-decks Picklist in walking order.
 * Contract: docs/oracle/contracts/know-where-cards-are.md. Read only. The steps are the same saved steps (move_items) that
 * the deck Picklists tick, so a tick in either view shows in both. Unowned cards are not listed; a count per deck is
 * returned for the footnote.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { buildAllDecksPicklist, type WalkItem } from '@/lib/all-decks-picklist'

/* eslint-disable @typescript-eslint/no-explicit-any -- new tables are not in the generated types yet */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const userId = authResult.id
  const db = createAdminClient() as any

  const raw = request.nextUrl.searchParams.get('deckIds')
  const deckFilter = raw ? raw.split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n)) : null
  if (raw && (deckFilter === null || deckFilter.length === 0)) {
    return Response.json({ error: 'bad_request', message: 'deckIds must be a list of deck numbers.' }, { status: 400 })
  }

  try {
    let q = db
      .from('move_items')
      .select('id, state, copy_id, card_name, from_deck_id, from_location_id, to_deck_id, to_deck_card_id, to_location_id')
      .eq('user_id', userId)
      .in('state', ['to_find', 'found', 'placed', 'missing'])
    if (deckFilter) q = q.or(`to_deck_id.in.(${deckFilter.join(',')}),from_deck_id.in.(${deckFilter.join(',')})`)
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    const raws = (rows ?? []) as Array<Record<string, any>>

    const copyIds = [...new Set(raws.map((r) => r.copy_id).filter((v) => v !== null))] as number[]
    const proxy = new Map<number, boolean>()
    if (copyIds.length > 0) {
      const { data } = await db.from('user_copies').select('id, is_proxy').eq('user_id', userId).in('id', copyIds)
      for (const c of (data ?? []) as Array<{ id: number; is_proxy: boolean }>) proxy.set(c.id, c.is_proxy)
    }
    const items: WalkItem[] = raws.map((r) => ({
      id: r.id, state: r.state, copyId: r.copy_id, cardName: r.card_name, isProxy: proxy.get(r.copy_id) ?? false,
      fromDeckId: r.from_deck_id, fromLocationId: r.from_location_id,
      toDeckId: r.to_deck_id, toDeckCardId: r.to_deck_card_id, toLocationId: r.to_location_id,
    }))

    const deckIds = [...new Set(raws.flatMap((r) => [r.from_deck_id, r.to_deck_id]).filter((v) => v !== null))] as number[]
    const locIds = [...new Set(raws.flatMap((r) => [r.from_location_id, r.to_location_id]).filter((v) => v !== null))] as number[]
    const decks = new Map<number, string>()
    const locations = new Map<number, { name: string; isUnsorted: boolean }>()
    if (deckIds.length > 0) {
      const { data } = await db.from('decks').select('id, name').eq('user_id', userId).in('id', deckIds)
      for (const d of (data ?? []) as Array<{ id: number; name: string }>) decks.set(d.id, d.name)
    }
    if (locIds.length > 0) {
      const { data } = await db.from('user_locations').select('id, name, is_default').eq('user_id', userId).in('id', locIds)
      for (const l of (data ?? []) as Array<{ id: number; name: string; is_default: boolean }>) locations.set(l.id, { name: l.name, isUnsorted: l.is_default })
    }

    return Response.json(buildAllDecksPicklist(items, { decks, locations }))
  } catch (err) {
    console.error('[picklist all decks]', err)
    return Response.json({ error: 'load_failed', message: "Couldn't load the Picklist. Try again." }, { status: 500 })
  }
}
