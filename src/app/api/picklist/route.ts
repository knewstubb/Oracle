/**
 * GET /api/picklist[?deckIds=1,2,3] — the all-decks Picklist in walking order.
 * Contract: docs/oracle/contracts/know-where-cards-are.md. Read only. The steps are the same saved steps (move_items) that
 * the deck Picklists tick, so a tick in either view shows in both. Unowned cards are not listed; a count per deck is
 * returned for the footnote.
 */
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { buildAllDecksPicklist, type UnownedDeckCount, type WalkItem } from '@/lib/all-decks-picklist'
import { getBatchRankedCandidates, type RankedCandidate } from '@/lib/allocation-candidates'
import { categorizeCards, type PicklistCard } from '@/lib/picklist-groups'
import { isGenericSlot } from '@/lib/basic-lands'

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

    // Footnote counts only. A failure here is logged and the walk still loads (the footnote is simply left out).
    let unowned: UnownedDeckCount[] = []
    try {
      unowned = await countUnownedByDeck(db, userId, [...new Set([...deckIds, ...(deckFilter ?? [])])], decks, raws)
    } catch (err) {
      console.error('[picklist all decks] unowned counts', err)
    }

    return Response.json(buildAllDecksPicklist(items, { decks, locations }, unowned))
  } catch (err) {
    console.error('[picklist all decks]', err)
    return Response.json({ error: 'load_failed', message: "Couldn't load the Picklist. Try again." }, { status: 500 })
  }
}

/** Planned cards with no owned copy anywhere, per deck on the walk. Same test the deck's own Picklist uses. */
async function countUnownedByDeck(
  db: any, userId: string, deckIds: number[], knownNames: Map<number, string>, steps: Array<Record<string, any>>,
): Promise<UnownedDeckCount[]> {
  if (deckIds.length === 0) return []
  const { data: deckRows } = await db.from('decks').select('id, name').eq('user_id', userId).in('id', deckIds)
  for (const d of (deckRows ?? []) as Array<{ id: number; name: string }>) knownNames.set(d.id, d.name)
  const { data: cardRows, error } = await db
    .from('deck_cards')
    .select('id, deck_id, card_name, scryfall_id, is_generic, generic_sleeved, copy_id')
    .in('deck_id', deckIds)
    .is('copy_id', null)
  if (error) throw new Error(error.message)
  const slotsWithSteps = new Set(steps.map((s) => s.to_deck_card_id).filter((v) => v !== null))
  const planned = ((cardRows ?? []) as Array<Record<string, any>>).filter((c) => !isGenericSlot(c as never) && !slotsWithSteps.has(c.id))
  const names = [...new Set(planned.map((c) => c.card_name as string))]
  const candidates = names.length > 0 ? await getBatchRankedCandidates(names, userId) : new Map<string, RankedCandidate[]>()
  const out: UnownedDeckCount[] = []
  for (const deckId of deckIds) {
    const cards: PicklistCard[] = planned.filter((c) => c.deck_id === deckId).map((c) => ({
      deckCardsId: c.id, cardName: c.card_name, lifecycle: 'planned', allocationStatus: null, copyId: null, isResolved: false,
      physicalCopyId: null, ownershipStatus: null, candidates: candidates.get(c.card_name) ?? [],
    }))
    out.push({ deckId, deckName: knownNames.get(deckId) ?? 'a deck', count: categorizeCards(cards, deckId).unowned.length })
  }
  return out
}
