// ---------------------------------------------------------------------------
// Server-side checks for cards the chat proposes (contract: chat-add-cards.md, sections 2.6 and 3).
// The model's own validation is advice; this is what the server actually trusts. Used at propose time and again
// at confirm time (the deck may have changed in between). Read only: nothing here writes.
// ---------------------------------------------------------------------------

import { loadDeckCommanders } from './deck-colour-identity'
import type { BlockReason, ProposalState } from './chat-proposal-types'

/** Minimal client shape (the admin Supabase client satisfies it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CheckClient { from: (table: string) => any }

/** Same exempt list as deck-legality.ts (D-032). */
const BASIC_LANDS = new Set([
  'plains', 'island', 'swamp', 'mountain', 'forest',
  'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
  'snow-covered mountain', 'snow-covered forest', 'wastes',
])

export function isBasicLand(name: string): boolean {
  return BASIC_LANDS.has(name.trim().toLowerCase())
}

/** Lower-case front face, so "Front // Back" and "Front" compare equal. */
export function cardKey(name: string): string {
  return name.split(' // ')[0].trim().toLowerCase()
}

export interface CardFacts {
  /** The printed name from the reference data (what ends up on the deck). */
  name: string
  /** Canonical card id (D-003). Never a printing id. */
  oracleId: string
  /** Letters from WUBRG, may be empty (colourless). */
  colours: string[]
  commanderLegal: boolean
}

export interface DeckFacts {
  deckName: string
  /** Deck colours as letters ("WBR", "" = colourless); null = could not be worked out (fail closed). */
  deckColours: string | null
  mainKeys: Set<string>
  maybeKeys: Set<string>
  /** Cards on the main list, counted by slot (quantity 1 per slot unless quantity says more). */
  mainCount: number
}

export interface CheckOutcome {
  state: ProposalState
  blockReason?: BlockReason
  blockText?: string
}

const COLOUR_ORDER = 'WUBRG'

function parseColours(text: unknown): string[] {
  const seen = new Set<string>()
  for (const ch of String(text ?? '').toUpperCase()) if (COLOUR_ORDER.includes(ch)) seen.add(ch)
  return [...COLOUR_ORDER].filter((c) => seen.has(c))
}

const BLOCKED_TEXT = {
  notFound: (requested: string) => `I couldn't confirm a card called ${requested}, so I can't add it.`,
  inDeck: (deck: string) => `Already in ${deck}.`,
  inMaybeboard: () => 'Already in your Maybeboard. Move it from the deck page.',
  outside: (card: string, deck: string, colours: string) =>
    `${card} is outside ${deck}'s colours (${colours}), so it can't go in this deck.`,
  unknown: () => "I can't tell this deck's colours yet, so I won't add cards. Set a commander first.",
  notLegal: (card: string) => `${card} isn't legal in Commander.`,
}

export function blockText(reason: BlockReason, ctx: { requested?: string; card?: string; deck?: string; colours?: string }): string {
  switch (reason) {
    case 'not_found': return BLOCKED_TEXT.notFound(ctx.requested ?? 'that card')
    case 'in_deck': return BLOCKED_TEXT.inDeck(ctx.deck ?? 'this deck')
    case 'in_maybeboard': return BLOCKED_TEXT.inMaybeboard()
    case 'outside_colours': return BLOCKED_TEXT.outside(ctx.card ?? 'That card', ctx.deck ?? 'this deck', ctx.colours ?? '')
    case 'colours_unknown': return BLOCKED_TEXT.unknown()
    case 'not_legal': return BLOCKED_TEXT.notLegal(ctx.card ?? 'That card')
    case 'expired': return 'This suggestion has expired. Ask me again.'
    case 'changed': return 'This card has been changed since. Remove it from the deck page.'
  }
}

/** Pure decision for one card. Order follows the contract table. */
export function decideCard(requested: string, card: CardFacts | null, deck: DeckFacts): CheckOutcome {
  const block = (reason: BlockReason, colours?: string): CheckOutcome => ({
    state: 'blocked',
    blockReason: reason,
    blockText: blockText(reason, { requested, card: card?.name, deck: deck.deckName, colours }),
  })
  if (!card) return block('not_found')
  const key = cardKey(card.name)
  if (!isBasicLand(card.name)) {
    if (deck.mainKeys.has(key)) return block('in_deck')
    if (deck.maybeKeys.has(key)) return block('in_maybeboard')
  }
  if (deck.deckColours === null) return block('colours_unknown')
  const allowed = new Set(parseColours(deck.deckColours))
  if (!card.colours.every((c) => allowed.has(c))) {
    return block('outside_colours', [...allowed].join(', ') || 'colourless')
  }
  if (!card.commanderLegal) return block('not_legal')
  return { state: 'ready' }
}

type Row = Record<string, unknown>

async function readRows(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[] | null> {
  try {
    const { data, error } = await q
    if (error || !Array.isArray(data)) return null
    return data as Row[]
  } catch {
    return null
  }
}

/** Loads the deck's facts. Null means "not your deck / not found" (one answer for both, nothing leaks). */
export async function loadDeckFacts(client: CheckClient, deckId: number, userId: string): Promise<DeckFacts | null> {
  const deckRows = await readRows(client.from('decks').select('id, name, user_id').eq('id', deckId).eq('user_id', userId).limit(1))
  const deck = deckRows?.[0]
  if (!deck || deck.user_id !== userId) return null
  const cards = await readRows(client.from('deck_cards').select('card_name, categories, quantity').eq('deck_id', deckId).eq('user_id', userId))
  const main = new Set<string>()
  const maybe = new Set<string>()
  let mainCount = 0
  for (const c of cards ?? []) {
    const key = cardKey(String(c.card_name ?? ''))
    if (String(c.categories ?? '').includes('Maybeboard')) maybe.add(key)
    else {
      main.add(key)
      mainCount += typeof c.quantity === 'number' && c.quantity > 0 ? c.quantity : 1
    }
  }
  let deckColours: string | null = null
  try {
    // Reads the commanders' colours fresh (both partners count). Null when unknown: the check fails closed.
    const info = await loadDeckCommanders(client as never, deckId, userId)
    deckColours = info?.identity ?? null
  } catch {
    deckColours = null
  }
  return { deckName: String(deck.name ?? 'this deck'), deckColours, mainKeys: main, maybeKeys: maybe, mainCount }
}

/** Exact-name match against the reference data (front face of a double-faced card also works). Map key = requested name. */
export async function loadCardFacts(client: CheckClient, requestedNames: string[]): Promise<Map<string, CardFacts>> {
  const out = new Map<string, CardFacts>()
  const names = [...new Set(requestedNames.map((n) => n.trim()).filter(Boolean))]
  if (names.length === 0) return out
  const found = new Map<string, Row>() // lower-case key -> ref_cards row
  const add = (rows: Row[] | null) => {
    for (const r of rows ?? []) {
      const printed = String(r.name)
      found.set(printed.toLowerCase(), r)
      const front = cardKey(printed)
      if (!found.has(front)) found.set(front, r)
    }
  }
  add(await readRows(client.from('ref_cards').select('name, color_identity, commander_legal').in('name', names)))
  for (const n of names) {
    if (found.has(n.toLowerCase())) continue
    const safe = n.replace(/[%_,()]/g, ' ').trim()
    if (!safe) continue
    add(await readRows(client.from('ref_cards').select('name, color_identity, commander_legal').ilike('name', `${safe} // %`).limit(1)))
  }
  const printedNames = [...new Set([...found.values()].map((r) => String(r.name)))]
  const oracle = new Map<string, string>()
  if (printedNames.length > 0) {
    for (const r of (await readRows(client.from('ref_printings').select('name, oracle_id').in('name', printedNames))) ?? []) {
      if (r.oracle_id) oracle.set(String(r.name), String(r.oracle_id))
    }
  }
  for (const n of names) {
    const row = found.get(n.toLowerCase())
    if (!row) continue
    const oracleId = oracle.get(String(row.name))
    if (!oracleId) continue // no canonical id: treated as not found (fail closed)
    out.set(n, {
      name: String(row.name),
      oracleId,
      colours: parseColours(row.color_identity),
      commanderLegal: row.commander_legal === true,
    })
  }
  return out
}
