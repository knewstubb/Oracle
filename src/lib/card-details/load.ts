/**
 * Loads everything the card details modal needs for one deck slot (read-only).
 * Any failed lookup throws, so the route answers 500 and never shows an empty answer as if it were true.
 */
import type { RefClient } from '@/lib/ref-card-text'
import { computeDeckReadiness } from '@/lib/deck-readiness'
import { isCountableCard } from '@/lib/deck-list-data'
import { deckTargetFor } from '@/lib/format-config'
import type { MoveHereDeckState } from '@/lib/move-here'
import { getCardTags, supabaseTagReader } from '@/lib/card-tags-read'
import { shapePrintings, ownedKey, type PrintingFinishRow, type PrintingRow } from './printings'
import { shapeCopies, type CopyRow, type CopyView, type DeckInfo } from './copies'
import { whyColumnAvailable } from './why-column'

export interface TagChip {
  key: string
  displayName: string
  kind: 'broad' | 'mechanic'
}
export interface CardFacts {
  name: string
  oracleText: string | null
  typeLine: string | null
  manaCost: string | null
  manaValue: number | null
  colourIdentity: string | null
  power: string | null
  toughness: string | null
  /** ref_cards has no loyalty column today, so this is always null. */
  loyalty: null
}

export interface Ruling {
  publishedAt: string
  comment: string
}

export interface CardDetails {
  deckId: number
  deckName: string
  deckCardId: number
  cardName: string
  oracleId: string | null
  slot: { scryfallId: string | null; setCode: string | null; copyId: number | null; finish: string | null }
  facts: CardFacts | null
  tags: TagChip[]
  printings: PrintingFinishRow[]
  copies: CopyView[]
  rulings: Ruling[]
  /** ref_printings.legality_commander of the card (same on every printing), or null when unknown. */
  commanderLegality: string | null
  whyAvailable: boolean
  why: string | null
}

type Client = RefClient

export function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what} failed: ${error?.message ?? 'unknown'}`)
}

async function resolveOracleId(
  supabase: Client,
  slot: { scryfall_id: string | null; copy_id: number | null; card_name: string },
): Promise<string | null> {
  if (slot.scryfall_id) {
    const { data, error } = await supabase.from('ref_printings').select('oracle_id').eq('scryfall_id', slot.scryfall_id).maybeSingle()
    if (error) fail('printing lookup', error)
    if (data?.oracle_id) return data.oracle_id as string
  }
  if (slot.copy_id != null) {
    const { data, error } = await supabase.from('user_copies').select('user_cards(oracle_id)').eq('id', slot.copy_id).maybeSingle()
    if (error) fail('copy lookup', error)
    const rel = (data as { user_cards?: { oracle_id?: string } | Array<{ oracle_id?: string }> | null } | null)?.user_cards
    const oid = Array.isArray(rel) ? rel[0]?.oracle_id : rel?.oracle_id
    if (oid) return oid
  }
  const front = slot.card_name.split(' // ')[0]
  const { data, error } = await supabase.from('ref_printings').select('oracle_id').eq('name', slot.card_name).limit(1)
  if (error) fail('name lookup', error)
  if (data?.[0]?.oracle_id) return data[0].oracle_id as string
  if (front !== slot.card_name) {
    const { data: d2, error: e2 } = await supabase.from('ref_printings').select('oracle_id').ilike('name', `${front} // %`).limit(1)
    if (e2) fail('name lookup', e2)
    if (d2?.[0]?.oracle_id) return d2[0].oracle_id as string
  }
  return null
}

export async function loadFacts(supabase: Client, cardName: string): Promise<CardFacts | null> {
  const cols = 'name, oracle_text, type_line, mana_cost, mana_value, color_identity, power, toughness'
  const first = await supabase.from('ref_cards').select(cols).eq('name', cardName).limit(1)
  if (first.error) fail('card facts lookup', first.error)
  let data = first.data
  if (!data?.[0]) {
    const front = cardName.split(' // ')[0]
    const r = await supabase.from('ref_cards').select(cols).ilike('name', `${front.replace(/[\\%_]/g, (c) => `\\${c}`)} // %`).limit(1)
    if (r.error) fail('card facts lookup', r.error)
    data = r.data
  }
  const row = data?.[0]
  if (!row) return null
  return {
    name: row.name,
    oracleText: row.oracle_text ?? null,
    typeLine: row.type_line ?? null,
    manaCost: row.mana_cost ?? null,
    manaValue: row.mana_value ?? null,
    colourIdentity: row.color_identity ?? null,
    power: row.power ?? null,
    toughness: row.toughness ?? null,
    loyalty: null,
  }
}

export async function deckInfos(supabase: Client, deckIds: number[]): Promise<Map<number, DeckInfo>> {
  const out = new Map<number, DeckInfo>()
  if (deckIds.length === 0) return out
  const { data: decks, error } = await supabase.from('decks').select('id, name, format').in('id', deckIds)
  if (error) fail('deck lookup', error)
  const { data: slots, error: slotErr } = await supabase.from('deck_cards').select('deck_id, copy_id, is_generic, generic_sleeved, categories').in('deck_id', deckIds)
  if (slotErr) fail('deck slots lookup', slotErr)
  const byDeck = new Map<number, Array<{ copy_id: number | null; is_generic: boolean | null; generic_sleeved: boolean | null }>>()
  for (const s of (slots ?? []) as Array<{ deck_id: number; categories: string | null; copy_id: number | null; is_generic: boolean | null; generic_sleeved: boolean | null }>) {
    if (!isCountableCard(s.categories)) continue
    const list = byDeck.get(s.deck_id) ?? []
    list.push(s)
    byDeck.set(s.deck_id, list)
  }
  for (const d of (decks ?? []) as Array<{ id: number; name: string; format: string | null }>) {
    const target = deckTargetFor(d.format)
    const state: MoveHereDeckState = computeDeckReadiness(byDeck.get(d.id) ?? [], target.deckSize, target.countRule).state
    out.set(d.id, { name: d.name, state })
  }
  return out
}

/** The caller has already checked the deck belongs to the user and the slot is in the deck. */
export async function loadCardDetails(supabase: Client, userId: string, deckId: number, deckCardId: number): Promise<CardDetails | null> {
  const whyAvailable = await whyColumnAvailable(supabase)
  const slotCols = `id, card_name, scryfall_id, set_code, copy_id, requested_finish${whyAvailable ? ', why_here' : ''}`
  const { data: slot, error: slotErr } = await supabase.from('deck_cards').select(slotCols).eq('id', deckCardId).eq('deck_id', deckId).maybeSingle()
  if (slotErr) fail('card lookup', slotErr)
  if (!slot) return null
  const { data: deck, error: deckErr } = await supabase.from('decks').select('name').eq('id', deckId).maybeSingle()
  if (deckErr) fail('deck lookup', deckErr)

  const oracleId = await resolveOracleId(supabase, slot)
  const facts = await loadFacts(supabase, slot.card_name)

  let tags: TagChip[] = []
  let printings: PrintingFinishRow[] = []
  let copies: CopyView[] = []
  let rulings: Ruling[] = []
  let commanderLegality: string | null = null

  if (oracleId) {
    const tagRead = await getCardTags(supabaseTagReader(supabase), [oracleId])
    if (tagRead.status === 'error') fail('tags lookup', { message: 'tag read failed' })
    tags = (tagRead.byOracleId.get(oracleId) ?? []).map((t) => ({ key: t.key, displayName: t.name, kind: t.kind }))

    const { data: printingRows, error: pErr } = await supabase
      .from('ref_printings')
      .select('scryfall_id, set_code, set_name, collector_number, rarity, finishes, price_usd, price_usd_foil, released_at, image_uri_small, image_uri_normal, legality_commander')
      .eq('oracle_id', oracleId)
    if (pErr) fail('printings lookup', pErr)

    const { data: cardRows, error: cErr } = await supabase.from('user_cards').select('id').eq('user_id', userId).eq('oracle_id', oracleId)
    if (cErr) fail('collection lookup', cErr)
    const cardIds = ((cardRows ?? []) as Array<{ id: number }>).map((c) => c.id)
    let copyRows: Array<CopyRow & { location_id: number | null }> = []
    if (cardIds.length > 0) {
      const { data, error } = await supabase
        .from('user_copies')
        .select('id, is_proxy, missing, condition, finish, printing_id, location_id, deck_cards!deck_cards_copy_id_fkey(id, deck_id)')
        .eq('user_id', userId)
        .in('card_id', cardIds)
      if (error) fail('copies lookup', error)
      copyRows = (data ?? []) as typeof copyRows
    }

    const locationIds = [...new Set(copyRows.filter((c) => c.location_id != null).map((c) => c.location_id as number))]
    const locationNames = new Map<number, string>()
    if (locationIds.length > 0) {
      const { data, error } = await supabase.from('user_locations').select('id, name').in('id', locationIds)
      if (error) fail('locations lookup', error)
      for (const l of (data ?? []) as Array<{ id: number; name: string }>) locationNames.set(l.id, l.name)
    }
    for (const c of copyRows) c.location = c.location_id != null && locationNames.has(c.location_id) ? { name: locationNames.get(c.location_id)! } : null

    const owned = new Map<string, number>()
    for (const c of copyRows) {
      if (c.missing || c.is_proxy || !c.printing_id) continue
      const k = ownedKey(c.printing_id, c.finish)
      owned.set(k, (owned.get(k) ?? 0) + 1)
    }
    const printingRowsTyped = (printingRows ?? []) as PrintingRow[]
    commanderLegality = ((printingRows ?? []) as Array<{ legality_commander?: string | null }>).find((p) => p.legality_commander)?.legality_commander ?? null
    printings = shapePrintings(printingRowsTyped, { owned, slotScryfallId: slot.scryfall_id ?? null })

    const printingLookup = new Map(printingRowsTyped.map((p) => [p.scryfall_id, { setCode: p.set_code, collectorNumber: p.collector_number }]))
    const deckIds = [...new Set([deckId, ...copyRows.flatMap((c) => (c.deck_cards ?? []).map((d) => d.deck_id))])]
    const decks = await deckInfos(supabase, deckIds)
    copies = shapeCopies(copyRows, { deckId, slotCopyId: slot.copy_id ?? null, decks, printings: printingLookup })

    const { data: rulingRows, error: rErr } = await supabase
      .from('ref_rulings')
      .select('published_at, comment')
      .eq('oracle_id', oracleId)
      .order('published_at', { ascending: true })
    if (rErr) fail('rulings lookup', rErr)
    rulings = ((rulingRows ?? []) as Array<{ published_at: string; comment: string }>).map((r) => ({ publishedAt: r.published_at, comment: r.comment }))
  }

  return {
    deckId,
    deckName: deck?.name ?? `Deck ${deckId}`,
    deckCardId,
    cardName: slot.card_name,
    oracleId,
    slot: { scryfallId: slot.scryfall_id ?? null, setCode: slot.set_code ?? null, copyId: slot.copy_id ?? null, finish: slot.requested_finish ?? null },
    facts,
    tags,
    printings,
    copies,
    rulings,
    commanderLegality,
    whyAvailable,
    why: whyAvailable ? ((slot as { why_here?: string | null }).why_here ?? null) : null,
  }
}
