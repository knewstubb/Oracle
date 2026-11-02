// ---------------------------------------------------------------------------
// Owned-copy lookup for the deck chat — READ ONLY.
//
// For a list of card names, says per card (by oracle identity, never printing):
//   SPARE                 a real (non-proxy) copy is sleeved in no deck
//   IN_ANOTHER_DECK       real copies exist but every one is sleeved in another deck
//   ALREADY_IN_THIS_DECK  every real copy is already sleeved in the viewed deck
//   UNOWNED               no real copy owned (proxies never count, D-037);
//                         carries a Scryfall estimate or an explicit "no price"
//   OUTSIDE_COLOUR_IDENTITY  card is outside the viewed deck's commander colours
//   UNKNOWN_CARD          the name could not be matched to a card
//
// Rules (all server-side so the model cannot drop them):
//  - A copy is "sleeved" only when a deck_cards row points at it (copy_id).
//    A planned slot (card on a list, copy_id null) NEVER claims a copy. [audit finding 2/3]
//  - Spare = real copy not referenced by ANY deck_cards row. We do not assume the
//    database allows one slot per copy. [audit A1]
//  - Matching is by oracle_id; user_id scopes every query. [D-003, audit risk 4]
//  - Unknown price is null, never 0 and never a fact. [D-035, D-040]
//  - Missing-marked copies are ordinary owned copies (D-028). All decks count (D-029).
// Only select queries are issued.
// ---------------------------------------------------------------------------

import { isPriceDataStale } from './price-store'
import { findCommanderCards, type FlagRow } from './commander-card-flag'

export const MAX_LOOKUP_NAMES = 60
const CHUNK = 100

export type OwnedCopyStatus =
  | 'SPARE'
  | 'IN_ANOTHER_DECK'
  | 'ALREADY_IN_THIS_DECK'
  | 'UNOWNED'
  | 'OUTSIDE_COLOUR_IDENTITY'
  | 'UNKNOWN_CARD'

export interface DeckHolding {
  deck_id: number
  deck_name: string
  copies: number
  warning: string
}

export interface PriceEstimate {
  /** null = no price known. Never 0. */
  usd: number | null
  label: string
}

export interface OwnedCopyResult {
  requested_name: string
  card_name: string | null
  status: OwnedCopyStatus
  real_copies_owned: number
  spare_copies: number
  /** Other decks that hold a real copy (always shown, also when a spare exists) */
  in_other_decks: DeckHolding[]
  /** Copies sleeved in the viewed deck itself */
  in_this_deck: number
  price?: PriceEstimate
  note?: string
}

export interface OwnedCopyLookup {
  /** null = commander colours not known, so no colour check was done */
  commander_colour_identity: string[] | null
  colour_check: string
  results: OwnedCopyResult[]
  /** Presentation order for the answer: Spare, In another deck, Buy */
  order: ['SPARE', 'IN_ANOTHER_DECK', 'UNOWNED']
  notes: string[]
}

/** Minimal read-only client (the admin Supabase client satisfies it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LookupClient { from: (table: string) => any }

type Row = Record<string, unknown>

async function rows(q: PromiseLike<{ data: unknown; error: unknown }>, what: string): Promise<Row[]> {
  const { data, error } = await q
  if (error || !Array.isArray(data)) throw new Error(`Could not read ${what}`)
  return data as Row[]
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK))
  return out
}

function norm(name: string): string {
  return name.trim().toLowerCase()
}

const PRINTING_COLS = 'oracle_id, name, color_identity, price_usd, digital, updated_at'

interface Resolved { oracleId: string; name: string }

/** Names -> oracle ids. Exact name first, then the front face of a double-faced card. */
async function resolveNames(client: LookupClient, names: string[]): Promise<Map<string, Resolved>> {
  const out = new Map<string, Resolved>()
  const found = new Map<string, Resolved>() // lower-case printed name -> card
  const addRows = (rs: Row[]) => {
    for (const r of rs) {
      const printed = String(r.name)
      const res = { oracleId: String(r.oracle_id), name: printed }
      found.set(norm(printed), res)
      const front = printed.split(' // ')[0]
      if (!found.has(norm(front))) found.set(norm(front), res)
    }
  }
  for (const part of chunks(names)) {
    addRows(await rows(client.from('ref_printings').select('oracle_id, name').in('name', part), 'card names'))
  }
  const missing = names.filter(n => !found.has(norm(n)))
  for (const n of missing) {
    // DFC typed by front face only: "Front // Back" stored in the reference data.
    const safe = n.replace(/[%_,()]/g, ' ').trim()
    if (!safe) continue
    addRows(await rows(client.from('ref_printings').select('oracle_id, name').ilike('name', `${safe} // %`).limit(1), 'card names'))
  }
  for (const n of names) {
    const hit = found.get(norm(n))
    if (hit) out.set(n, hit)
  }
  return out
}

/** Commander colours of the viewed deck, or null when not known. */
export async function loadCommanderColours(client: LookupClient, deckId: number): Promise<string[] | null> {
  // Every commander counts equally (partner, background...; never the companion). An old deck that only
  // has the commander's name set still works: that card is found by name.
  const cardRows = await rows(
    client.from('deck_cards').select('id, card_name, categories, is_commander, command_zone_role').eq('deck_id', deckId),
    'commander'
  )
  const deck = await rows(client.from('decks').select('commander_name').eq('id', deckId), 'deck')
  const n = deck[0]?.commander_name
  const named = typeof n === 'string' && n ? n : null
  const names = [...new Set(findCommanderCards(cardRows as unknown as FlagRow[], named).map(r => String(r.card_name)))]
  if (named && !names.includes(named)) names.push(named)
  if (names.length === 0) return null
  const prints = await rows(client.from('ref_printings').select('name, color_identity').in('name', names), 'commander colours')
  const union = new Set<string>()
  for (const name of names) {
    const hit = prints.find(p => norm(String(p.name)) === norm(name) && Array.isArray(p.color_identity))
    if (!hit) return null // one commander unknown -> the identity is unknown
    for (const c of hit.color_identity as string[]) union.add(c)
  }
  return [...union].sort()
}

export function withinIdentity(cardColours: string[], commanderColours: string[]): boolean {
  return cardColours.every(c => commanderColours.includes(c))
}

/** Plain warning built by the server so it cannot be left out. */
export function shortByOneWarning(deckName: string): string {
  return `Using it here leaves ${deckName} short by one.`
}

/** Cheapest known non-digital USD price across printings; null when none. */
export function estimatePrice(printings: Row[]): PriceEstimate {
  const prices = printings
    .filter(p => p.digital !== true)
    .map(p => p.price_usd)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  if (prices.length === 0) return { usd: null, label: 'No price available' }
  return { usd: Math.min(...prices), label: 'Estimate from Scryfall (cheapest printing), not a fixed price' }
}

export async function lookupOwnedCopies(
  client: LookupClient,
  args: { userId: string; deckId?: number | null; cardNames: string[] }
): Promise<OwnedCopyLookup> {
  const { userId } = args
  if (!userId) throw new Error('userId is required')
  const requested = [...new Set(args.cardNames.map(n => n.trim()).filter(Boolean))].slice(0, MAX_LOOKUP_NAMES)
  const notes: string[] = []
  if (args.cardNames.length > MAX_LOOKUP_NAMES) {
    notes.push(`Only the first ${MAX_LOOKUP_NAMES} card names were checked; ask again for the rest.`)
  }

  const resolved = await resolveNames(client, requested)
  const oracleIds = [...new Set([...resolved.values()].map(r => r.oracleId))]

  // Colour identity of the viewed deck's commander (null = unknown, no filtering)
  let commander: string[] | null = null
  if (args.deckId) {
    try { commander = await loadCommanderColours(client, args.deckId) } catch { commander = null }
  }

  // All printings of the resolved cards (colour identity + prices)
  const printings: Row[] = []
  for (const part of chunks(oracleIds)) {
    printings.push(...await rows(client.from('ref_printings').select(PRINTING_COLS).in('oracle_id', part), 'card data'))
  }
  const printingsBy = new Map<string, Row[]>()
  for (const p of printings) {
    const k = String(p.oracle_id)
    printingsBy.set(k, [...(printingsBy.get(k) ?? []), p])
  }

  // Owner's card identities and real copies
  const cardIdToOracle = new Map<number, string>()
  for (const part of chunks(oracleIds)) {
    const rs = await rows(client.from('user_cards').select('id, oracle_id').eq('user_id', userId).in('oracle_id', part), 'owned cards')
    for (const r of rs) cardIdToOracle.set(Number(r.id), String(r.oracle_id))
  }
  const realCopies: Array<{ id: number; oracleId: string }> = []
  for (const part of chunks([...cardIdToOracle.keys()])) {
    const rs = await rows(
      client.from('user_copies').select('id, card_id').eq('user_id', userId).eq('is_proxy', false).in('card_id', part),
      'owned copies'
    )
    for (const r of rs) realCopies.push({ id: Number(r.id), oracleId: cardIdToOracle.get(Number(r.card_id)) as string })
  }

  // Which of those copies are sleeved, and where (copy_id set only; planned slots ignored)
  const copyToDeck = new Map<number, number[]>()
  const copyIds = realCopies.map(c => c.id)
  for (const part of chunks(copyIds)) {
    const rs = await rows(client.from('deck_cards').select('copy_id, deck_id').in('copy_id', part), 'sleeved copies')
    for (const r of rs) {
      if (r.copy_id === null || r.copy_id === undefined) continue
      const k = Number(r.copy_id)
      copyToDeck.set(k, [...(copyToDeck.get(k) ?? []), Number(r.deck_id)])
    }
  }
  const deckIds = [...new Set([...copyToDeck.values()].flat())]
  const deckNames = new Map<number, string>()
  for (const part of chunks(deckIds)) {
    const rs = await rows(client.from('decks').select('id, name').eq('user_id', userId).in('id', part), 'decks')
    for (const r of rs) deckNames.set(Number(r.id), String(r.name))
  }

  const staleNote = async (ps: Row[]): Promise<string | null> => {
    const stamps = ps.map(p => p.updated_at).filter((v): v is string => typeof v === 'string').sort()
    const latest = stamps.length ? stamps[stamps.length - 1] : null
    return (await isPriceDataStale(latest)) ? 'Price data may be out of date.' : null
  }

  const results: OwnedCopyResult[] = []
  for (const name of requested) {
    const base = { requested_name: name, real_copies_owned: 0, spare_copies: 0, in_other_decks: [], in_this_deck: 0 }
    const card = resolved.get(name)
    if (!card) {
      results.push({ ...base, card_name: null, status: 'UNKNOWN_CARD', note: 'Could not match this name to a card. Check the spelling; do not guess ownership.' })
      continue
    }
    const ps = printingsBy.get(card.oracleId) ?? []
    const identity = ps.find(p => Array.isArray(p.color_identity))?.color_identity as string[] | undefined
    if (commander && identity && !withinIdentity(identity, commander)) {
      results.push({ ...base, card_name: card.name, status: 'OUTSIDE_COLOUR_IDENTITY', note: `Outside the commander's colours (${commander.join('') || 'colourless'}); not a valid pick for this deck.` })
      continue
    }

    const mine = realCopies.filter(c => c.oracleId === card.oracleId)
    let spare = 0
    let here = 0
    const held = new Map<number, number>()
    for (const c of mine) {
      const decks = copyToDeck.get(c.id) ?? []
      if (decks.length === 0) { spare++; continue }
      if (args.deckId && decks.includes(args.deckId)) { here++; continue }
      for (const d of new Set(decks)) held.set(d, (held.get(d) ?? 0) + 1)
    }
    const inOther: DeckHolding[] = [...held.entries()].map(([deck_id, copies]) => {
      const deck_name = deckNames.get(deck_id) ?? `deck #${deck_id}`
      return { deck_id, deck_name, copies, warning: shortByOneWarning(deck_name) }
    })
    const common = { requested_name: name, card_name: card.name, real_copies_owned: mine.length, spare_copies: spare, in_other_decks: inOther, in_this_deck: here }

    if (spare > 0) results.push({ ...common, status: 'SPARE' })
    else if (inOther.length > 0) results.push({ ...common, status: 'IN_ANOTHER_DECK' })
    else if (here > 0) results.push({ ...common, status: 'ALREADY_IN_THIS_DECK', note: 'Every real copy you own is already in this deck.' })
    else {
      const price = estimatePrice(ps)
      const stale = price.usd !== null ? await staleNote(ps) : null
      results.push({
        ...common,
        status: 'UNOWNED',
        price: stale ? { ...price, label: `${price.label}. ${stale}` } : price,
        note: 'No real copy owned (proxies do not count).',
      })
    }
  }

  return {
    commander_colour_identity: commander,
    colour_check: commander
      ? `Checked against the commander's colours (${commander.join('') || 'colourless'}).`
      : 'Commander colours not known: colours were NOT checked. Do not claim the cards fit the deck.',
    results,
    order: ['SPARE', 'IN_ANOTHER_DECK', 'UNOWNED'],
    notes,
  }
}
