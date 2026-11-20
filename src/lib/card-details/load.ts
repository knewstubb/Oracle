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
import { peekWhyColumn, rememberWhyColumn } from './why-column'
import { createRefCache } from './ref-cache'

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

/** What the window needs for the Overview tab, rail and header. Printings, copies and rulings come separately. */
export interface DeckOverview {
  deckId: number
  deckName: string
  deckCardId: number
  cardName: string
  oracleId: string | null
  slot: CardDetails['slot']
  facts: CardFacts | null
  tags: TagChip[]
  /** Only the printing the slot is set to (one row per finish). The Printings tab loads the rest. */
  slotPrintings: PrintingFinishRow[]
  commanderLegality: string | null
  whyAvailable: boolean
  why: string | null
}

/** The Printings and Copies tabs share one read of the user's copies, so they load together. */
export interface DeckCollectionPart {
  printings: PrintingFinishRow[]
  copies: CopyView[]
}

export interface RulingsPart {
  rulings: Ruling[]
}

/** A deck that is not the user's or a card that is not in the deck is an answer, not an error. */
export type Loaded<T> = { status: 'ok'; data: T } | { status: 'no-deck' } | { status: 'no-card' }

export function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what} failed: ${error?.message ?? 'unknown'}`)
}


const PRINTING_COLS = 'scryfall_id, name, set_code, set_name, collector_number, rarity, finishes, price_usd, price_usd_foil, released_at, image_uri_small, image_uri_normal, legality_commander'
export type PrintingReadRow = PrintingRow & { name?: string; legality_commander?: string | null }

const FIVE_MIN = 5 * 60_000
const TEN_MIN = 10 * 60_000
const factsCache = createRefCache<CardFacts>(TEN_MIN)
const printingsCache = createRefCache<PrintingReadRow[]>(FIVE_MIN)
const rulingsCache = createRefCache<Ruling[]>(TEN_MIN)

/** Rarely changing: every printing of one card (the owned counts are added later, from the user's copies). */
export async function loadPrintingRows(supabase: Client, oracleId: string): Promise<PrintingReadRow[]> {
  const hit = printingsCache.get(oracleId)
  if (hit) return hit
  const { data, error } = await supabase.from('ref_printings').select(PRINTING_COLS).eq('oracle_id', oracleId)
  if (error) fail('printings lookup', error)
  const rows = (data ?? []) as unknown as PrintingReadRow[]
  printingsCache.set(oracleId, rows)
  return rows
}

export async function loadRulings(supabase: Client, oracleId: string): Promise<Ruling[]> {
  const hit = rulingsCache.get(oracleId)
  if (hit) return hit
  const { data, error } = await supabase.from('ref_rulings').select('published_at, comment').eq('oracle_id', oracleId).order('published_at', { ascending: true })
  if (error) fail('rulings lookup', error)
  const rulings = ((data ?? []) as Array<{ published_at: string; comment: string }>).map((r) => ({ publishedAt: r.published_at, comment: r.comment }))
  rulingsCache.set(oracleId, rulings)
  return rulings
}

/** Oracle id without the printing lookup: from the sleeved copy, then from the card name. */
async function resolveOracleIdByCopyOrName(
  supabase: Client,
  slot: { copy_id: number | null; card_name: string },
): Promise<string | null> {
  if (slot.copy_id != null) {
    const { data, error } = await supabase.from('user_copies').select('user_cards!user_copies_card_id_fkey(oracle_id)').eq('id', slot.copy_id).maybeSingle()
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
  const hit = factsCache.get(cardName)
  if (hit) return hit
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
  const facts: CardFacts = {
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
  factsCache.set(cardName, facts)
  return facts
}

export interface DeckRow {
  id: number
  name: string
  format: string | null
}
interface SlotCountRow {
  deck_id: number
  categories: string | null
  copy_id: number | null
  is_generic: boolean | null
  generic_sleeved: boolean | null
}

export async function readDeckSlots(supabase: Client, deckIds: number[]): Promise<SlotCountRow[]> {
  if (deckIds.length === 0) return []
  const { data, error } = await supabase.from('deck_cards').select('deck_id, copy_id, is_generic, generic_sleeved, categories').in('deck_id', deckIds)
  if (error) fail('deck slots lookup', error)
  return (data ?? []) as SlotCountRow[]
}

/** Each deck's readiness state from its slots (pure). */
export function buildDeckInfos(decks: readonly DeckRow[], slots: readonly SlotCountRow[]): Map<number, DeckInfo> {
  const out = new Map<number, DeckInfo>()
  const byDeck = new Map<number, SlotCountRow[]>()
  for (const s of slots) {
    if (!isCountableCard(s.categories)) continue
    const list = byDeck.get(s.deck_id) ?? []
    list.push(s)
    byDeck.set(s.deck_id, list)
  }
  for (const d of decks) {
    const target = deckTargetFor(d.format)
    const state: MoveHereDeckState = computeDeckReadiness(byDeck.get(d.id) ?? [], target.deckSize, target.countRule).state
    out.set(d.id, { name: d.name, state })
  }
  return out
}

/** The deck names and slot reads run together (they do not depend on each other). */
export async function deckInfos(supabase: Client, deckIds: number[]): Promise<Map<number, DeckInfo>> {
  if (deckIds.length === 0) return new Map()
  const [decksRes, slots] = await Promise.all([
    supabase.from('decks').select('id, name, format').in('id', deckIds),
    readDeckSlots(supabase, deckIds),
  ])
  if (decksRes.error) fail('deck lookup', decksRes.error)
  return buildDeckInfos((decksRes.data ?? []) as DeckRow[], slots)
}

export type CopyReadRow = CopyRow & { location_id: number | null }

/** The user's copies of one card (any printing, any finish), found through user_cards in a single read. */
export const COPY_COLS =
  'id, is_proxy, missing, condition, finish, printing_id, location_id, user_cards!user_copies_card_id_fkey!inner(oracle_id, card_name), deck_cards!deck_cards_copy_id_fkey(id, deck_id)'
export async function readCopyRows<T>(supabase: Client, userId: string, oracleId: string): Promise<T[]> {
  const { data, error } = await supabase.from('user_copies').select(COPY_COLS).eq('user_id', userId).eq('user_cards.oracle_id', oracleId)
  if (error) fail('copies lookup', error)
  return (data ?? []) as unknown as T[]
}

export async function readLocationNames(supabase: Client, locationIds: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (locationIds.length === 0) return out
  const { data, error } = await supabase.from('user_locations').select('id, name').in('id', locationIds)
  if (error) fail('locations lookup', error)
  for (const l of (data ?? []) as Array<{ id: number; name: string }>) out.set(l.id, l.name)
  return out
}

export function ownedCounts(copyRows: ReadonlyArray<{ missing?: boolean | null; is_proxy?: boolean | null; printing_id?: string | null; finish?: string | null }>): Map<string, number> {
  const owned = new Map<string, number>()
  for (const c of copyRows) {
    if (c.missing || c.is_proxy || !c.printing_id) continue
    const k = ownedKey(c.printing_id, c.finish)
    owned.set(k, (owned.get(k) ?? 0) + 1)
  }
  return owned
}

interface SlotRead {
  id: number
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  copy_id: number | null
  requested_finish: string | null
  why_here?: string | null
}

/**
 * The slot, with the Why line when the column exists. The Why column's presence is remembered for 60 seconds. While it
 * is unknown the read just asks for it, and falls back to a read without it if the database says the column is missing.
 */
async function readSlot(supabase: Client, deckId: number, deckCardId: number): Promise<{ slot: SlotRead | null; whyAvailable: boolean }> {
  const base = 'id, card_name, scryfall_id, set_code, copy_id, requested_finish'
  if (peekWhyColumn() !== false) {
    const r = await supabase.from('deck_cards').select(`${base}, why_here`).eq('id', deckCardId).eq('deck_id', deckId).maybeSingle()
    if (!r.error) {
      rememberWhyColumn(true)
      return { slot: (r.data as SlotRead | null) ?? null, whyAvailable: true }
    }
    if ((r.error as { code?: string }).code === '42703') rememberWhyColumn(false)
    else console.error('[why-column] read with Why failed, treating Why as not available:', (r.error as { message?: string }).message)
  }
  const r = await supabase.from('deck_cards').select(base).eq('id', deckCardId).eq('deck_id', deckId).maybeSingle()
  if (r.error) fail('card lookup', r.error)
  return { slot: (r.data as SlotRead | null) ?? null, whyAvailable: false }
}

async function readOwnDeckName(supabase: Client, userId: string, deckId: number): Promise<string | null> {
  const { data, error } = await supabase.from('decks').select('name').eq('id', deckId).eq('user_id', userId).maybeSingle()
  if (error) fail('deck lookup', error)
  return data ? ((data as { name?: string }).name ?? `Deck ${deckId}`) : null
}

/**
 * Overview, rail and header. Reads that do not depend on each other run together: the deck and the slot, then the
 * slot's printing and the card facts, then the Tags (cached on the server).
 */
export async function loadDeckOverview(supabase: Client, userId: string, deckId: number, deckCardId: number): Promise<Loaded<DeckOverview>> {
  const [deckName, { slot, whyAvailable }] = await Promise.all([readOwnDeckName(supabase, userId, deckId), readSlot(supabase, deckId, deckCardId)])
  if (deckName == null) return { status: 'no-deck' }
  if (!slot) return { status: 'no-card' }

  const slotPrintingRead = async (): Promise<{ oracleId: string | null; row: PrintingReadRow | null }> => {
    if (slot.scryfall_id) {
      const { data, error } = await supabase.from('ref_printings').select(`oracle_id, ${PRINTING_COLS}`).eq('scryfall_id', slot.scryfall_id).maybeSingle()
      if (error) fail('printing lookup', error)
      const row = data as unknown as (PrintingReadRow & { oracle_id?: string }) | null
      if (row?.oracle_id) return { oracleId: row.oracle_id, row }
    }
    return { oracleId: await resolveOracleIdByCopyOrName(supabase, slot), row: null }
  }
  const [{ oracleId, row }, facts] = await Promise.all([slotPrintingRead(), loadFacts(supabase, slot.card_name)])

  let tags: TagChip[] = []
  let commanderLegality: string | null = row?.legality_commander ?? null
  if (oracleId) {
    const needLegality = commanderLegality == null
    const [tagRead, legalityRows] = await Promise.all([
      getCardTags(supabaseTagReader(supabase), [oracleId]),
      needLegality ? loadPrintingRows(supabase, oracleId) : Promise.resolve([] as PrintingReadRow[]),
    ])
    if (tagRead.status === 'error') fail('tags lookup', { message: 'tag read failed' })
    tags = (tagRead.byOracleId.get(oracleId) ?? []).map((t) => ({ key: t.key, displayName: t.name, kind: t.kind }))
    if (needLegality) commanderLegality = legalityRows.find((p) => p.legality_commander)?.legality_commander ?? null
  }

  return {
    status: 'ok',
    data: {
      deckId,
      deckName,
      deckCardId,
      cardName: slot.card_name,
      oracleId,
      slot: { scryfallId: slot.scryfall_id ?? null, setCode: slot.set_code ?? null, copyId: slot.copy_id ?? null, finish: slot.requested_finish ?? null },
      facts,
      tags,
      slotPrintings: row ? shapePrintings([row], { owned: new Map(), slotScryfallId: slot.scryfall_id ?? null }) : [],
      commanderLegality,
      whyAvailable,
      why: whyAvailable ? (slot.why_here ?? null) : null,
    },
  }
}

/** Printings (with how many of each the user owns) and the user's copies, for the Printings and Copies tabs. */
export async function loadDeckCollectionPart(supabase: Client, userId: string, deckId: number, deckCardId: number, oracleId: string): Promise<Loaded<DeckCollectionPart>> {
  const [deckName, slotRes, copyRows, printingRows] = await Promise.all([
    readOwnDeckName(supabase, userId, deckId),
    supabase.from('deck_cards').select('copy_id, scryfall_id').eq('id', deckCardId).eq('deck_id', deckId).maybeSingle(),
    readCopyRows<CopyReadRow>(supabase, userId, oracleId),
    loadPrintingRows(supabase, oracleId),
  ])
  if (deckName == null) return { status: 'no-deck' }
  if (slotRes.error) fail('card lookup', slotRes.error)
  const slot = slotRes.data as { copy_id: number | null; scryfall_id: string | null } | null
  if (!slot) return { status: 'no-card' }

  const deckIds = [...new Set([deckId, ...copyRows.flatMap((c) => (c.deck_cards ?? []).map((d) => d.deck_id))])]
  const locationIds = [...new Set(copyRows.filter((c) => c.location_id != null).map((c) => c.location_id as number))]
  const [locationNames, decks] = await Promise.all([readLocationNames(supabase, locationIds), deckInfos(supabase, deckIds)])
  for (const c of copyRows) c.location = c.location_id != null && locationNames.has(c.location_id) ? { name: locationNames.get(c.location_id)! } : null

  const printings = shapePrintings(printingRows, { owned: ownedCounts(copyRows), slotScryfallId: slot.scryfall_id ?? null })
  const printingLookup = new Map(printingRows.map((p) => [p.scryfall_id, { setCode: p.set_code, collectorNumber: p.collector_number }]))
  const copies = shapeCopies(copyRows, { deckId, slotCopyId: slot.copy_id ?? null, decks, printings: printingLookup })
  return { status: 'ok', data: { printings, copies } }
}

/** Rulings are the same for everyone; the deck and slot are still checked so another user's deck is a 404. */
export async function loadDeckRulings(supabase: Client, userId: string, deckId: number, deckCardId: number, oracleId: string): Promise<Loaded<RulingsPart>> {
  const [deckName, slotRes, rulings] = await Promise.all([
    readOwnDeckName(supabase, userId, deckId),
    supabase.from('deck_cards').select('id').eq('id', deckCardId).eq('deck_id', deckId).maybeSingle(),
    loadRulings(supabase, oracleId),
  ])
  if (deckName == null) return { status: 'no-deck' }
  if (slotRes.error) fail('card lookup', slotRes.error)
  if (!slotRes.data) return { status: 'no-card' }
  return { status: 'ok', data: { rulings } }
}

/** Everything in one answer (the original shape). The window itself now loads the parts above. */
export async function loadCardDetails(supabase: Client, userId: string, deckId: number, deckCardId: number): Promise<Loaded<CardDetails>> {
  const overview = await loadDeckOverview(supabase, userId, deckId, deckCardId)
  if (overview.status !== 'ok') return overview
  const o = overview.data
  let part: DeckCollectionPart = { printings: [], copies: [] }
  let rulings: Ruling[] = []
  if (o.oracleId) {
    const [c, r] = await Promise.all([
      loadDeckCollectionPart(supabase, userId, deckId, deckCardId, o.oracleId),
      loadRulings(supabase, o.oracleId),
    ])
    if (c.status !== 'ok') return c
    part = c.data
    rulings = r
  }
  const { slotPrintings: _slotPrintings, ...rest } = o
  void _slotPrintings
  return { status: 'ok', data: { ...rest, printings: part.printings, copies: part.copies, rulings } }
}
