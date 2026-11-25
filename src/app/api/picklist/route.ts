/**
 * GET /api/picklist[?deckIds=1,2,3] — the all-decks Picklist in walking order.
 * Contract: docs/oracle/contracts/know-where-cards-are.md. Read only.
 *
 * Rows are every planned card of every deck (or of `deckIds`), derived the same way the deck's own Picklist
 * (GET /api/decks/[id]/picklist) derives them: deck_cards with no copy, not generic basics, with ranked candidate
 * copies. The saved steps (move_items) that ticks create are merged in and take precedence for their slot, so a tick
 * in either view shows in both. Unowned cards are listed in their own section.
 *
 * Every read is paged past the 1000-row limit. Any failed read returns 500 so the page shows an error, never
 * "Nothing to pick" (D-030).
 */
import { compareDecks } from '@/lib/deck-order'
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { buildAllDecksPicklist, type PlannedSlot, type WalkItem } from '@/lib/all-decks-picklist'
import { getBatchRankedCandidates, type RankedCandidate } from '@/lib/allocation-candidates'
import { isGenericSlot } from '@/lib/basic-lands'
import { fetchAllRows } from '@/lib/supply-pool'

/* eslint-disable @typescript-eslint/no-explicit-any -- new tables are not in the generated types yet */

const IN_CHUNK = 150
/** Card names per candidate lookup, so each copies read stays well under the row limit. */
const NAME_CHUNK = 200

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

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
    const [deckRows, locRows, stepRows] = await Promise.all([
      fetchAllRows<{ id: number; name: string; position: number }>((a, b) => db.from('decks').select('id, name, position').eq('user_id', userId).order('id').range(a, b)),
      fetchAllRows<{ id: number; name: string; is_default: boolean }>((a, b) =>
        db.from('user_locations').select('id, name, is_default').eq('user_id', userId).order('id').range(a, b)),
      fetchAllRows<Record<string, any>>((a, b) => {
        let q = db
          .from('move_items')
          .select('id, state, copy_id, card_name, from_deck_id, from_location_id, to_deck_id, to_deck_card_id, to_location_id')
          .eq('user_id', userId)
          .in('state', ['to_find', 'found', 'placed', 'missing'])
        if (deckFilter) q = q.or(`to_deck_id.in.(${deckFilter.join(',')}),from_deck_id.in.(${deckFilter.join(',')})`)
        return q.order('id').range(a, b)
      }),
    ])

    // Insertion order = the owner's saved deck order; buildAllDecksPicklist lists decks in that order.
    const decks = new Map<number, string>([...deckRows].sort(compareDecks).map((d) => [d.id, d.name]))
    const locations = new Map<number, { name: string; isUnsorted: boolean }>(locRows.map((l) => [l.id, { name: l.name, isUnsorted: l.is_default }]))
    const plannedDeckIds = deckRows.map((d) => d.id).filter((id) => !deckFilter || deckFilter.includes(id))

    // Planned slots: no copy, not a generic basic (D-032). Same test as the deck's own Picklist.
    const slotRows: Array<Record<string, any>> = []
    for (const ids of chunks(plannedDeckIds, IN_CHUNK)) {
      slotRows.push(...(await fetchAllRows<Record<string, any>>((a, b) =>
        db.from('deck_cards')
          .select('id, deck_id, card_name, scryfall_id, is_generic, generic_sleeved, copy_id')
          .in('deck_id', ids)
          .is('copy_id', null)
          .order('id')
          .range(a, b))))
    }
    const planned = slotRows.filter((c) => c.copy_id === null && !isGenericSlot(c as never))

    // Candidates for every planned card name. A failure here fails the load: no candidates would read as Unowned.
    const candidates = new Map<string, RankedCandidate[]>()
    for (const names of chunks([...new Set(planned.map((c) => c.card_name as string))], NAME_CHUNK)) {
      for (const [k, v] of await getBatchRankedCandidates(names, userId)) candidates.set(k, v)
    }
    const slots: PlannedSlot[] = planned.map((c) => ({
      deckId: c.deck_id, deckCardId: c.id, cardName: c.card_name, candidates: candidates.get(c.card_name) ?? [],
    }))

    // Proxy flag for the steps' copies.
    const copyIds = [...new Set(stepRows.map((r) => r.copy_id).filter((v) => v !== null))] as number[]
    const proxy = new Map<number, boolean>()
    for (const ids of chunks(copyIds, IN_CHUNK)) {
      const { data, error } = await db.from('user_copies').select('id, is_proxy').eq('user_id', userId).in('id', ids)
      if (error) throw new Error(error.message)
      for (const c of (data ?? []) as Array<{ id: number; is_proxy: boolean }>) proxy.set(c.id, c.is_proxy)
    }
    const items: WalkItem[] = stepRows.map((r) => ({
      id: r.id, state: r.state, copyId: r.copy_id, cardName: r.card_name, isProxy: proxy.get(r.copy_id) ?? false,
      fromDeckId: r.from_deck_id, fromLocationId: r.from_location_id,
      toDeckId: r.to_deck_id, toDeckCardId: r.to_deck_card_id, toLocationId: r.to_location_id,
    }))

    return Response.json(buildAllDecksPicklist(items, { decks, locations }, slots))
  } catch (err) {
    console.error('[picklist all decks]', err)
    return Response.json({ error: 'load_failed', message: "Couldn't load the Picklist. Try again." }, { status: 500 })
  }
}
