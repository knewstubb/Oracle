/**
 * Ownership facts for the deck-import review (contract import-intent §3). READ ONLY.
 *
 * "What does the owner already have of these cards, and is each copy free or sleeved in
 * another deck?" Nothing here writes. No copy ids (user_copies.id) ever leave this module:
 * copies are only counted into groups.
 *
 * A copy is FREE when it is not marked missing and no deck slot points at it.
 * A copy is HELD when a deck slot of the owner's points at it (the group names the deck).
 * Copies marked missing appear in neither.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImportFinish } from '../../docs/oracle/contracts/import-row-editing.types'
import type {
  HeldCopyGroup,
  OwnedCopyGroup,
  OwnershipRequest,
  OwnershipRequestCard,
  OwnershipResponse,
  OwnershipRowFacts,
} from '../../docs/oracle/contracts/import-intent.types'

/** Rows per request (contract §3). */
export const MAX_OWNERSHIP_CARDS = 1000
const CHUNK = 100
const PAGE = 1000

export interface OwnershipCopyRow {
  id: number
  card_id: number
  printing_id: string | null
  finish: string | null
  is_proxy: boolean
}
export interface OwnershipHolderRow {
  copy_id: number
  deck_id: number
}

export interface OwnershipSource {
  /** user_cards rows for the owner: id -> oracle id. */
  userCards: { id: number; oracle_id: string }[]
  /** The owner's copies that are not missing. */
  copies: OwnershipCopyRow[]
  /** deck_cards rows (of the owner) that point at one of those copies. */
  holders: OwnershipHolderRow[]
  /** The owner's decks: id -> name. */
  decks: { id: number; name: string }[]
  /** Printing details: scryfall id -> set code and collector number. */
  printings: { scryfall_id: string; set_code: string; collector_number: string }[]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Returns an error message, or null when the body is a valid OwnershipRequest. */
export function validateOwnershipRequest(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'Body must be an object'
  const cards = (body as { cards?: unknown }).cards
  if (!Array.isArray(cards)) return '`cards` must be an array'
  if (cards.length > MAX_OWNERSHIP_CARDS) return `At most ${MAX_OWNERSHIP_CARDS} cards per request`
  const seen = new Set<string>()
  for (const c of cards as Partial<OwnershipRequestCard>[]) {
    if (!c || typeof c.rowKey !== 'string' || !c.rowKey) return 'Each card needs a rowKey'
    if (typeof c.oracleId !== 'string' || !c.oracleId) return 'Each card needs an oracleId'
    if (typeof c.printingId !== 'string' || !c.printingId) return 'Each card needs a printingId'
    if (typeof c.qty !== 'number' || !Number.isInteger(c.qty) || c.qty < 1) return 'Each card needs a positive whole qty'
    if (seen.has(c.rowKey)) return `Duplicate rowKey: ${c.rowKey}`
    seen.add(c.rowKey)
  }
  return null
}

// ---------------------------------------------------------------------------
// Pure grouping
// ---------------------------------------------------------------------------

function toFinish(raw: string | null): ImportFinish {
  return raw === 'foil' || raw === 'etched' ? raw : 'nonfoil'
}

/** Turn raw rows into per-row facts. Pure. */
export function buildOwnershipFacts(cards: OwnershipRequestCard[], src: OwnershipSource): OwnershipResponse {
  const oracleByCard = new Map(src.userCards.map((c) => [c.id, c.oracle_id]))
  const deckName = new Map(src.decks.map((d) => [d.id, d.name]))
  const printing = new Map(src.printings.map((p) => [p.scryfall_id, p]))
  const deckByCopy = new Map<number, number>()
  for (const h of src.holders) if (deckName.has(h.deck_id) && !deckByCopy.has(h.copy_id)) deckByCopy.set(h.copy_id, h.deck_id)

  const free = new Map<string, Map<string, OwnedCopyGroup>>()
  const held = new Map<string, Map<string, HeldCopyGroup>>()

  for (const copy of src.copies) {
    const oracleId = oracleByCard.get(copy.card_id)
    if (!oracleId || !copy.printing_id) continue
    const p = printing.get(copy.printing_id)
    const base = {
      printingId: copy.printing_id,
      setCode: p?.set_code ?? '',
      collectorNumber: p?.collector_number ?? '',
      finish: toFinish(copy.finish),
      isProxy: copy.is_proxy === true,
    }
    const deckId = deckByCopy.get(copy.id)
    if (deckId === undefined && src.holders.some((h) => h.copy_id === copy.id)) continue // sleeved in a deck we can't name
    if (deckId === undefined) {
      const map = free.get(oracleId) ?? new Map<string, OwnedCopyGroup>()
      const key = `${base.printingId}|${base.finish}|${base.isProxy}`
      const g = map.get(key)
      if (g) g.count++
      else map.set(key, { ...base, count: 1 })
      free.set(oracleId, map)
    } else {
      const map = held.get(oracleId) ?? new Map<string, HeldCopyGroup>()
      const key = `${deckId}|${base.printingId}|${base.finish}|${base.isProxy}`
      const g = map.get(key)
      if (g) g.count++
      else map.set(key, { ...base, count: 1, deckId, deckName: deckName.get(deckId) ?? '' })
      held.set(oracleId, map)
    }
  }

  const cmp = (a: OwnedCopyGroup, b: OwnedCopyGroup) =>
    a.printingId.localeCompare(b.printingId) ||
    a.finish.localeCompare(b.finish) ||
    Number(a.isProxy) - Number(b.isProxy)

  const rows: OwnershipRowFacts[] = cards.map((c) => ({
    rowKey: c.rowKey,
    oracleId: c.oracleId,
    free: [...(free.get(c.oracleId)?.values() ?? [])].map((g) => ({ ...g })).sort(cmp),
    held: [...(held.get(c.oracleId)?.values() ?? [])]
      .map((g) => ({ ...g }))
      .sort((a, b) => a.deckId - b.deckId || cmp(a, b)),
  }))
  return { rows }
}

// ---------------------------------------------------------------------------
// Reading (database, reads only)
// ---------------------------------------------------------------------------

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

async function readAll<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

/**
 * Read what the owner has of the requested cards. Every query filters by the owner's id.
 * Issues only `select` calls.
 */
export async function loadOwnershipFacts(
  client: SupabaseClient,
  userId: string,
  request: OwnershipRequest
): Promise<OwnershipResponse> {
  const oracleIds = [...new Set(request.cards.map((c) => c.oracleId))]

  const userCards: OwnershipSource['userCards'] = []
  for (const ids of chunks(oracleIds)) {
    userCards.push(
      ...(await readAll<{ id: number; oracle_id: string }>((from, to) =>
        client.from('user_cards').select('id, oracle_id').eq('user_id', userId).in('oracle_id', ids).order('id').range(from, to)
      ))
    )
  }

  const copies: OwnershipCopyRow[] = []
  for (const ids of chunks(userCards.map((c) => c.id))) {
    copies.push(
      ...(await readAll<OwnershipCopyRow>((from, to) =>
        client
          .from('user_copies')
          .select('id, card_id, printing_id, finish, is_proxy')
          .eq('user_id', userId)
          .eq('missing', false)
          .in('card_id', ids)
          .order('id')
          .range(from, to)
      ))
    )
  }

  const holders: OwnershipHolderRow[] = []
  for (const ids of chunks(copies.map((c) => c.id))) {
    holders.push(
      ...(await readAll<OwnershipHolderRow>((from, to) =>
        client.from('deck_cards').select('copy_id, deck_id').eq('user_id', userId).in('copy_id', ids).order('id').range(from, to)
      ))
    )
  }

  const decks: OwnershipSource['decks'] = []
  for (const ids of chunks([...new Set(holders.map((h) => h.deck_id))])) {
    decks.push(
      ...(await readAll<{ id: number; name: string }>((from, to) =>
        client.from('decks').select('id, name').eq('user_id', userId).in('id', ids).order('id').range(from, to)
      ))
    )
  }

  const printings: OwnershipSource['printings'] = []
  for (const ids of chunks([...new Set(copies.map((c) => c.printing_id).filter((p): p is string => !!p))])) {
    printings.push(
      ...(await readAll<OwnershipSource['printings'][number]>((from, to) =>
        client.from('ref_printings').select('scryfall_id, set_code, collector_number').in('scryfall_id', ids).order('scryfall_id').range(from, to)
      ))
    )
  }

  return buildOwnershipFacts(request.cards, { userCards, copies, holders, decks, printings })
}
