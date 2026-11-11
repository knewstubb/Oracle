// ---------------------------------------------------------------------------
// Browse the owner's real copies that fit the viewed deck — READ ONLY.
//
// Answers "what could replace this proxy / fill this gap?" by looking through
// the collection rather than checking only cards the assistant names.
//
//  - Real copies only: user_copies.is_proxy = false (proxies never count, D-037).
//  - A copy is "sleeved" only when a deck_cards row points at it (copy_id); planned
//    slots never claim a copy. Same rule as owned-copy-lookup.ts. Old ownership
//    counts are NOT used.
//  - Spare = real copy sleeved in no deck. In another deck = every real copy is in
//    other decks; each carries the "leaves <deck> short by one" warning (shown, never hidden).
//  - Colour identity: the deck's stored colour identity, or when blank (older imports)
//    derived from the commander's card data. If neither works, nothing is listed as fitting.
//  - Cards already on this deck's list are left out. Basic lands are left out.
//  - Buy is not listed here: the assistant then calls check_owned_copies on candidates,
//    which gives the Scryfall estimate or "no price" (never zero).
// Only select queries are issued.
// ---------------------------------------------------------------------------

import { isBasicLand } from './basic-lands'
import { gapDetailLine } from './gap-detail-line'
import { isLandTypeLine, rolesForCard, ROLE_TEXT_NEEDLES, type Role } from './card-roles'
import { parseColourLetters } from './command-zone'
import { loadCommanderColours, shortByOneWarning, withinIdentity, type LookupClient } from './owned-copy-lookup'

export const DEFAULT_BROWSE_LIMIT = 25
export const MAX_BROWSE_LIMIT = 40
const PAGE = 1000
const NAME_BATCH = 200

type Row = Record<string, unknown>

export interface BrowseHolding { deck_id: number; deck_name: string; copies: number; warning: string }

export interface BrowseCard {
  card_name: string
  type_line: string
  mana_value: number | null
  spare_copies: number
  in_other_decks: BrowseHolding[]
  /** Scryfall printing id of one of the owner's own copies (spare copy preferred); null when unknown. */
  printing_id?: string | null
  /** One short sentence on what the card does for the asked-for role, when a role was asked for. */
  detail_line?: string | null}

export interface SpareBrowseResult {
  /** null = could not be determined; nothing is listed as fitting in that case */
  colour_identity: string[] | null
  colour_source: 'deck' | 'commander' | 'unknown'
  filter: string
  spare: BrowseCard[]
  in_another_deck: BrowseCard[]
  total_spare: number
  total_in_another_deck: number
  /** Owned cards whose card data could not be matched (not checked) */
  unchecked_cards: number
  order: ['SPARE', 'IN_ANOTHER_DECK', 'BUY']
  notes: string[]
}

/** Like `paged`, but asks for several pages at once (speculatively) so a big table costs one round trip, not one per page. */
async function pagedParallel(build: () => { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> }, what: string, firstPages = 3): Promise<Row[]> {
  const out: Row[] = []
  for (let start = 0; ; start += firstPages * PAGE) {
    const pages = await Promise.all(
      Array.from({ length: firstPages }, async (_, i) => {
        const from = start + i * PAGE
        const { data, error } = await build().range(from, from + PAGE - 1)
        if (error || !Array.isArray(data)) throw new Error(`Could not read ${what}`)
        return data as Row[]
      }),
    )
    for (const p of pages) {
      out.push(...p)
      if (p.length < PAGE) return out
    }
  }
}

async function simple(q: PromiseLike<{ data: unknown; error: unknown }>, what: string): Promise<Row[]> {
  const { data, error } = await q
  if (error || !Array.isArray(data)) throw new Error(`Could not read ${what}`)
  return data as Row[]
}

type Matcher = (typeLine: string, oracleText: string, name?: string) => boolean

const TYPE_WORDS = ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'land', 'planeswalker', 'battle']

function roleFromKind(k: string): Role | null {
  return k === 'draw' || k === 'card draw' ? 'draw'
    : k === 'ramp' || k === 'mana' ? 'ramp'
    : k === 'removal' || k === 'removal spell' ? 'removal'
    : k === 'wipes' || k === 'wipe' || k === 'board wipe' ? 'wipes'
    : null
}

/**
 * What the database can narrow card data by before anything is sent to the app. It only ever removes cards the real
 * filter would also remove (role: card text must contain a needle; lands: type line contains "land").
 * null = no narrowing possible (type words, "any"): every owned card's data is fetched.
 */
type Prefilter = { or: string } | { typeLike: string } | null
export function prefilterFor(kind: string | null | undefined): Prefilter {
  const k = (kind ?? '').trim().toLowerCase()
  const role = roleFromKind(k)
  if (role) return { or: ROLE_TEXT_NEEDLES[role].map((n) => `oracle_text.ilike.*${n.replace(/[,()*]/g, '')}*`).join(',') }
  if (k === 'lands' || k === 'land') return { typeLike: '%land%' }
  return null
}

/** Pure: turn a type / role word ("creature", "draw", "ramp", "removal") into a matcher. Approximate for roles. */
export function buildFilter(kind: string | null | undefined): { label: string; match: Matcher } {
  const k = (kind ?? '').trim().toLowerCase()
  if (!k || k === 'any' || k === 'all') return { label: 'any card', match: () => true }
  // Roles use the one shared role function (same as the deck health counts), never their own text rules.
  const role = roleFromKind(k)
  if (role) {
    return { label: `${role} (from card text)`, match: (t, o, n) => rolesForCard({ name: n ?? '', typeLine: t, oracleText: o }).includes(role) }
  }
  // Lands: decided from the front-face type line, same as the deck health Lands count.
  if (k === 'lands' || k === 'land') {
    return { label: 'land', match: t => isLandTypeLine(t) }
  }
  if (TYPE_WORDS.includes(k.replace(/s$/, ''))) {
    const w = k.replace(/s$/, '')
    return { label: w, match: t => t.toLowerCase().includes(w) }
  }
  return { label: k, match: t => t.toLowerCase().includes(k) }
}

export async function browseSpareCopies(
  client: LookupClient,
  args: { userId: string; deckId: number; kind?: string | null; limit?: number | null }
): Promise<SpareBrowseResult> {
  const { userId, deckId } = args
  if (!userId) throw new Error('userId is required')
  const limit = Math.min(Math.max(Math.floor(args.limit ?? DEFAULT_BROWSE_LIMIT) || DEFAULT_BROWSE_LIMIT, 1), MAX_BROWSE_LIMIT)
  const filter = buildFilter(args.kind)
  const notes: string[] = []

  // Round 1: everything that does not depend on anything else, all at once (one round trip, not a chain).
  //  - the viewed deck (must be this owner's)
  //  - the commanders' colours
  //  - the owner's cards, real copies and deck list
  const [deckRows, commanderColours, cards, copies, userDecks] = await Promise.all([
    simple(client.from('decks').select('id, name, colour_identity').eq('id', deckId).eq('user_id', userId), 'deck'),
    loadCommanderColours(client, deckId).catch(() => null),
    pagedParallel(() => client.from('user_cards').select('id, card_name, oracle_id').eq('user_id', userId).order('id'), 'owned cards'),
    pagedParallel(() => client.from('user_copies').select('id, card_id, printing_id').eq('user_id', userId).eq('is_proxy', false).order('id'), 'owned copies', 5),
    pagedParallel(() => client.from('decks').select('id, name').eq('user_id', userId).order('id'), 'decks', 1),
  ])
  if (deckRows.length === 0) throw new Error('Deck not found')

  // Colour identity = ALL the commanders' colours together (partner, background...; never the companion).
  // Worked out from the commander cards; the stored deck value is only the fallback, because it can lag behind.
  let identity: string[] | null = commanderColours
  let source: SpareBrowseResult['colour_source'] = 'unknown'
  if (identity) {
    source = 'commander'
  } else {
    const stored = typeof deckRows[0].colour_identity === 'string' ? deckRows[0].colour_identity : ''
    const storedSet = parseColourLetters(stored)
    if (storedSet.size > 0) {
      identity = [...storedSet].sort()
      source = 'deck'
    }
  }

  const empty = (extra: string): SpareBrowseResult => ({
    colour_identity: null, colour_source: 'unknown', filter: filter.label,
    spare: [], in_another_deck: [], total_spare: 0, total_in_another_deck: 0, unchecked_cards: 0,
    order: ['SPARE', 'IN_ANOTHER_DECK', 'BUY'], notes: [...notes, extra],
  })
  if (!identity) {
    return empty("The deck's colours could not be determined (no colour identity stored and no commander card data found). Nothing was listed as fitting; tell the owner this and do not guess.")
  }

  const deckName = new Map(userDecks.map(d => [Number(d.id), String(d.name)]))
  const copiesByCard = new Map<number, number[]>()
  const printingByCopy = new Map<number, string>()
  for (const c of copies) {
    copiesByCard.set(Number(c.card_id), [...(copiesByCard.get(Number(c.card_id)) ?? []), Number(c.id)])
    if (typeof c.printing_id === 'string' && c.printing_id) printingByCopy.set(Number(c.id), c.printing_id)
  }

  // Only cards the owner really has (not basics, not proxy-only) can be spare or held elsewhere.
  const names = [...new Set(cards.filter(c => (copiesByCard.get(Number(c.id)) ?? []).length > 0).map(c => String(c.card_name)))].filter(n => !isBasicLand(n))

  // Round 2, all at once:
  //  - which deck holds each real copy (one query over the owner's decks, not one per deck)
  //  - card data, narrowed IN THE DATABASE to cards that could have the role (and a plain list of which names are known at all)
  const pre = prefilterFor(args.kind)
  const REF_COLS = 'name, type_line, oracle_text, color_identity, mana_value, edhrec_rank'
  const nameBatches: string[][] = []
  for (let i = 0; i < names.length; i += NAME_BATCH) nameBatches.push(names.slice(i, i + NAME_BATCH))
  const refData = nameBatches.map((batch) => {
    let q = client.from('ref_cards').select(REF_COLS).in('name', batch)
    if (pre && 'or' in pre) q = q.or(pre.or)
    else if (pre) q = q.ilike('type_line', pre.typeLike)
    return simple(q, 'card data')
  })
  const refKnown = pre ? nameBatches.map((batch) => simple(client.from('ref_cards').select('name').in('name', batch), 'card names')) : []
  const [deckCardRows, refDataSets, refKnownSets] = await Promise.all([
    userDecks.length > 0
      ? pagedParallel(() => client.from('deck_cards').select('card_name, copy_id, deck_id, categories').in('deck_id', userDecks.map(d => Number(d.id))).order('id'), 'deck cards', 2)
      : Promise.resolve([] as Row[]),
    Promise.all(refData),
    Promise.all(refKnown),
  ])

  const copyToDecks = new Map<number, number[]>()
  const thisDeckNames = new Set<string>()
  for (const r of deckCardRows) {
    const did = Number(r.deck_id)
    if (did === deckId && !(typeof r.categories === 'string' && r.categories.includes('Maybeboard'))) {
      thisDeckNames.add(String(r.card_name).toLowerCase())
    }
    if (r.copy_id === null || r.copy_id === undefined) continue
    const k = Number(r.copy_id)
    copyToDecks.set(k, [...(copyToDecks.get(k) ?? []), did])
  }

  const ref = new Map<string, Row>()
  const known = new Set<string>()
  for (const rs of refDataSets) for (const r of rs) { ref.set(String(r.name).toLowerCase(), r); known.add(String(r.name).toLowerCase()) }
  for (const rs of refKnownSets) for (const r of rs) known.add(String(r.name).toLowerCase())

  type Entry = BrowseCard & { rank: number }
  const spare: Entry[] = []
  const other: Entry[] = []
  let unchecked = 0
  // One entry per card (oracle id), pooling copies across printings
  const groups = new Map<string, { name: string; copyIds: number[] }>()
  for (const card of cards) {
    const name = String(card.card_name)
    if (isBasicLand(name)) continue
    const key = String(card.oracle_id ?? name).toLowerCase()
    const g = groups.get(key) ?? { name, copyIds: [] }
    g.copyIds.push(...(copiesByCard.get(Number(card.id)) ?? []))
    groups.set(key, g)
  }
  for (const { name, copyIds: mine } of groups.values()) {
    if (mine.length === 0) continue // proxies only or none: not a real copy
    if (thisDeckNames.has(name.toLowerCase())) continue
    const data = ref.get(name.toLowerCase())
    if (!data) { if (!known.has(name.toLowerCase())) unchecked++; continue }
    if (!withinIdentity([...parseColourLetters(String(data.color_identity ?? ''))], identity)) continue
    if (!filter.match(String(data.type_line ?? ''), String(data.oracle_text ?? ''), name)) continue

    let spareN = 0
    let inThis = 0
    let spareCopyId: number | null = null
    const held = new Map<number, number>()
    for (const id of mine) {
      const ds = copyToDecks.get(id) ?? []
      if (ds.length === 0) { spareN++; if (spareCopyId === null || (!printingByCopy.has(spareCopyId) && printingByCopy.has(id))) spareCopyId = id; continue }
      if (ds.includes(deckId)) { inThis++; continue }
      for (const d of new Set(ds)) held.set(d, (held.get(d) ?? 0) + 1)
    }
    if (inThis > 0 && spareN === 0 && held.size === 0) continue
    const holdings: BrowseHolding[] = [...held.entries()].map(([id, n]) => {
      const dn = deckName.get(id) ?? `deck #${id}`
      return { deck_id: id, deck_name: dn, copies: n, warning: shortByOneWarning(dn) }
    })
    const entry: Entry = {
      card_name: name, type_line: String(data.type_line ?? ''),
      mana_value: typeof data.mana_value === 'number' ? data.mana_value : null,
      spare_copies: spareN, in_other_decks: holdings,
      printing_id: (spareCopyId !== null ? printingByCopy.get(spareCopyId) : undefined) ?? mine.map((id) => printingByCopy.get(id)).find(Boolean) ?? null,
      detail_line: gapDetailLine(args.kind, String(data.type_line ?? ''), typeof data.oracle_text === 'string' ? data.oracle_text : null),
      rank: typeof data.edhrec_rank === 'number' ? data.edhrec_rank : Number.MAX_SAFE_INTEGER,
    }
    if (spareN > 0) spare.push(entry)
    else if (holdings.length > 0) other.push(entry)
  }

  const sort = (a: Entry, b: Entry) => a.rank - b.rank || a.card_name.localeCompare(b.card_name)
  const strip = ({ rank: _rank, ...rest }: Entry): BrowseCard => rest
  spare.sort(sort)
  other.sort(sort)
  if (spare.length > limit) notes.push(`Showing ${limit} of ${spare.length} spare cards (most popular first). Ask with a narrower type or role to see others.`)
  if (other.length > limit) notes.push(`Showing ${limit} of ${other.length} cards held by other decks (most popular first).`)
  if (unchecked > 0) notes.push(`${unchecked} owned cards could not be matched to card data and were not checked.`)
  if (filter.label.includes('from card text')) notes.push('Role filters read the card text and can miss or over-include; say so if the list looks thin.')
  notes.push('This lists cards the owner already has. For Buy suggestions, call check_owned_copies on the candidates to get a Scryfall estimate or "no price".')

  return {
    colour_identity: identity,
    colour_source: source,
    filter: filter.label,
    spare: spare.slice(0, limit).map(strip),
    in_another_deck: other.slice(0, limit).map(strip),
    total_spare: spare.length,
    total_in_another_deck: other.length,
    unchecked_cards: unchecked,
    order: ['SPARE', 'IN_ANOTHER_DECK', 'BUY'],
    notes,
  }
}
