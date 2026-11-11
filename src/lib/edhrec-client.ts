/**
 * EDHREC client (json.edhrec.com, undocumented public JSON; the same files the EDHREC site loads).
 * Contract: docs/oracle/contracts/deck-health-phase2.md, sections 0.1, 1.4 and 1.8.
 *
 * Two files are read, one request each, per commander:
 *  - Commander page  `/pages/commanders/<slug>.json`: top-level type counts are INTEGERS (average cards per deck),
 *    the card lists live in `container.json_dict.cardlists[]`, and there is no `inclusion` field
 *    (inclusion = num_decks / potential_decks).
 *  - Average deck    `/pages/average-decks/<slug>.json`: `deck.cards` grouped by type as [name, quantity].
 *
 * Every request: at least 100 ms apart (process-wide), a timeout, and retry with backoff on 429 and 5xx.
 * A 404 (or 403, which EDHREC returns for some unknown slugs) is "not found"; anything else that fails is
 * `EdhrecUnavailableError`, which callers must never cache.
 *
 * Parsers are pure and exported so tests run on saved copies of the real JSON.
 */

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Front face of a card name ("Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel" gives "Sephiroth, Fabled SOLDIER"). */
function frontFace(name: string): string {
  return name.split(' // ')[0].trim()
}

/**
 * One card name to its EDHREC slug, front face only.
 * "Atraxa, Praetors' Voice" → "atraxa-praetors-voice"; accents are dropped ("Lim-Dûl" → "lim-dul").
 */
export function toEdhrecSlug(cardName: string): string {
  return frontFace(cardName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * The slug for a deck's commander(s). One commander: its slug. A pair (partners, a background): both front-face slugs
 * in alphabetical order, joined with "-" (contract 1.4 step 1: one fixed order; a 404 is "not found", never a guess).
 * Returns null when there is no usable name.
 */
export function commanderSlug(commanderNames: string[]): string | null {
  const slugs = [...new Set(commanderNames.map(toEdhrecSlug).filter((s) => s.length > 0))].sort()
  return slugs.length > 0 ? slugs.join('-') : null
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type EdhrecCardType = 'creature' | 'instant' | 'sorcery' | 'artifact' | 'enchantment' | 'planeswalker' | 'land' | 'battle'

const TYPE_KEYS: readonly EdhrecCardType[] = ['creature', 'instant', 'sorcery', 'artifact', 'enchantment', 'planeswalker', 'land', 'battle']

/** Average number of cards of each type per deck (EDHREC's top-level integers). */
export type EdhrecTypeCounts = Partial<Record<EdhrecCardType, number>>

/** One card from a commander page's lists. `inclusion` is a share, 0 to 1. */
export interface EdhrecListedCard {
  name: string
  /** List header it came from ("Creatures", "Mana Artifacts", …). */
  header: string
  cardType: EdhrecCardType | 'other'
  synergy: number
  numDecks: number
  potentialDecks: number
  inclusion: number
}

export interface EdhrecCommanderPage {
  /** Decks behind the numbers (`container.json_dict.card.num_decks`). */
  numDecks: number | null
  /** Non-land cards from the lists ("Top Cards", "New Cards", "Lands", "Utility Lands" skipped), deduped by name. */
  cards: EdhrecListedCard[]
  /** Every listed card including lands, deduped (for the chat tool). */
  allCards: EdhrecListedCard[]
  typeCounts: EdhrecTypeCounts
}

export interface EdhrecAverageDeckCard {
  name: string
  quantity: number
  /** Group heading in the file ("Creature", "Land", …). */
  group: string
}

export interface EdhrecAverageDeck {
  commanders: string[]
  cards: EdhrecAverageDeckCard[]
  numDecks: number | null
  typeCounts: EdhrecTypeCounts
  /** EDHREC's count of basic lands in this average deck (top-level `basic`). Some files leave the basics out of `deck.cards`. */
  basicCount: number | null
}

export type EdhrecFetch<T> = { status: 'ok'; data: T } | { status: 'not_found' }

/** EDHREC could not be reached or answered with an error other than "not found". Never cached. */
export class EdhrecUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EdhrecUnavailableError'
  }
}

// ---------------------------------------------------------------------------
// Parsers (pure)
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function readTypeCounts(json: any): EdhrecTypeCounts {
  const out: EdhrecTypeCounts = {}
  for (const k of TYPE_KEYS) {
    const v = num(json?.[k])
    if (v !== null) out[k] = v
  }
  return out
}

const SKIPPED_HEADERS = new Set(['top cards', 'new cards', 'lands', 'utility lands'])

function headerType(header: string): EdhrecCardType | 'other' {
  const h = header.toLowerCase()
  if (h.includes('creature')) return 'creature'
  if (h.includes('instant')) return 'instant'
  if (h.includes('sorcer')) return 'sorcery'
  if (h.includes('artifact')) return 'artifact'
  if (h.includes('enchantment')) return 'enchantment'
  if (h.includes('planeswalker')) return 'planeswalker'
  if (h.includes('land')) return 'land'
  if (h.includes('battle')) return 'battle'
  return 'other'
}

/** Reads a commander page. Never throws on odd input: missing parts come back empty. */
export function parseCommanderPage(json: any): EdhrecCommanderPage {
  const dict = json?.container?.json_dict
  const lists: any[] = Array.isArray(dict?.cardlists) ? dict.cardlists : []
  const nonLand = new Map<string, EdhrecListedCard>()
  const all = new Map<string, EdhrecListedCard>()

  for (const list of lists) {
    const header = typeof list?.header === 'string' ? list.header : ''
    const skip = SKIPPED_HEADERS.has(header.toLowerCase())
    const views: any[] = Array.isArray(list?.cardviews) ? list.cardviews : []
    for (const v of views) {
      if (typeof v?.name !== 'string' || v.name.length === 0) continue
      const numDecks = num(v.num_decks) ?? 0
      const potential = num(v.potential_decks) ?? 0
      const card: EdhrecListedCard = {
        name: v.name,
        header,
        cardType: headerType(header),
        synergy: num(v.synergy) ?? 0,
        numDecks,
        potentialDecks: potential,
        inclusion: potential > 0 ? Math.min(1, numDecks / potential) : 0,
      }
      // "Top Cards" and "New Cards" repeat cards from the typed lists; keep the typed entry.
      if (!all.has(card.name) || (all.get(card.name)!.cardType === 'other' && card.cardType !== 'other')) all.set(card.name, card)
      if (!skip && !nonLand.has(card.name)) nonLand.set(card.name, card)
    }
  }

  return {
    numDecks: num(dict?.card?.num_decks),
    cards: [...nonLand.values()],
    allCards: [...all.values()],
    typeCounts: readTypeCounts(json),
  }
}

/** Reads an average-deck file. Quantities of the same name are summed. Never throws on odd input. */
export function parseAverageDeck(json: any): EdhrecAverageDeck {
  const deck = json?.deck
  const commanders: string[] = Array.isArray(deck?.commander) ? deck.commander.filter((c: unknown) => typeof c === 'string') : []
  const groups = deck?.cards && typeof deck.cards === 'object' ? (deck.cards as Record<string, unknown>) : {}
  const byName = new Map<string, EdhrecAverageDeckCard>()
  for (const [group, entries] of Object.entries(groups)) {
    if (!Array.isArray(entries)) continue
    for (const e of entries) {
      if (!Array.isArray(e) || typeof e[0] !== 'string') continue
      const q = num(e[1]) ?? 1
      const prev = byName.get(e[0])
      if (prev) prev.quantity += q
      else byName.set(e[0], { name: e[0], quantity: q, group })
    }
  }
  return {
    commanders,
    cards: [...byName.values()],
    numDecks: num(json?.container?.json_dict?.card?.num_decks),
    typeCounts: readTypeCounts(json),
    basicCount: num(json?.basic),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Transport: throttle, timeout, retry
// ---------------------------------------------------------------------------

const BASE = 'https://json.edhrec.com/pages'
const USER_AGENT = 'TheOracle/0.1.0'
export const EDHREC_MIN_GAP_MS = 100
const TIMEOUT_MS = 10_000
const RETRY_DELAYS_MS = [500, 1500]

let nextSlotAt = 0

/** Waits so that requests start at least EDHREC_MIN_GAP_MS apart across the whole process. */
async function throttle(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, nextSlotAt)
  nextSlotAt = at + EDHREC_MIN_GAP_MS
  if (at > now) await new Promise((r) => setTimeout(r, at - now))
}

export interface EdhrecTransport {
  fetch?: typeof fetch
  /** Tests pass a no-op sleep so retries are instant. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** GET one EDHREC JSON file. 404/403 → not_found. 429/5xx retried with backoff. Other failures throw EdhrecUnavailableError. */
export async function fetchEdhrecJson(path: string, transport: EdhrecTransport = {}): Promise<EdhrecFetch<unknown>> {
  // Tests never reach the real EDHREC: under the test runner a fake fetch must be passed in.
  if (!transport.fetch && process.env.VITEST) throw new EdhrecUnavailableError('EDHREC is not called from tests')
  const doFetch = transport.fetch ?? fetch
  const sleep = transport.sleep ?? defaultSleep
  let lastError = 'EDHREC request failed'

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
    await throttle()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await doFetch(`${BASE}/${path}`, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal })
      if (res.status === 404 || res.status === 403) return { status: 'not_found' }
      if (res.status === 429 || res.status >= 500) {
        lastError = `EDHREC answered ${res.status}`
        continue
      }
      if (!res.ok) throw new EdhrecUnavailableError(`EDHREC answered ${res.status}`)
      try {
        return { status: 'ok', data: await res.json() }
      } catch {
        throw new EdhrecUnavailableError('EDHREC sent a reply that is not JSON')
      }
    } catch (err) {
      if (err instanceof EdhrecUnavailableError) throw err
      lastError = err instanceof Error && err.name === 'AbortError' ? 'EDHREC timed out' : `EDHREC unreachable: ${err instanceof Error ? err.message : String(err)}`
    } finally {
      clearTimeout(timer)
    }
  }
  throw new EdhrecUnavailableError(lastError)
}

/** EDHREC sometimes answers 200 with only `{ redirect: … }` for a name it maps elsewhere. That is not this commander. */
function isRedirectOnly(json: unknown): boolean {
  return !!json && typeof json === 'object' && 'redirect' in json && !('container' in json) && !('deck' in json)
}

export async function getCommanderPage(slug: string, transport?: EdhrecTransport): Promise<EdhrecFetch<EdhrecCommanderPage>> {
  const r = await fetchEdhrecJson(`commanders/${slug}.json`, transport)
  if (r.status === 'not_found' || isRedirectOnly(r.data)) return { status: 'not_found' }
  return { status: 'ok', data: parseCommanderPage(r.data) }
}

export async function getAverageDeck(slug: string, transport?: EdhrecTransport): Promise<EdhrecFetch<EdhrecAverageDeck>> {
  const r = await fetchEdhrecJson(`average-decks/${slug}.json`, transport)
  if (r.status === 'not_found' || isRedirectOnly(r.data)) return { status: 'not_found' }
  return { status: 'ok', data: parseAverageDeck(r.data) }
}

// ---------------------------------------------------------------------------
// Chat tool helpers (get_edhrec_staples)
// ---------------------------------------------------------------------------

export interface EDHRECCard {
  name: string
  synergy: number // -1.0 to 1.0
  inclusion: number // 0-100, share of the commander's decks running this card
  numDecks: number // decks running this card
  cardType: string
}

export interface EDHRECCommanderData {
  commanderName: string
  slug: string
  numDecks: number
  cards: EDHRECCard[]
}

/** Commander top cards, every list (lands included), sorted by inclusion. Throws when not found or unreachable. */
export async function getCommanderTopCards(commanderName: string, transport?: EdhrecTransport): Promise<EDHRECCommanderData> {
  const slug = toEdhrecSlug(commanderName)
  const page = await getCommanderPage(slug, transport)
  if (page.status === 'not_found') throw new Error(`Commander "${commanderName}" not found on EDHREC (slug: ${slug})`)
  const cards: EDHRECCard[] = page.data.allCards
    .map((c) => ({
      name: c.name,
      synergy: c.synergy,
      inclusion: Math.round(c.inclusion * 100),
      numDecks: c.numDecks,
      cardType: c.cardType,
    }))
    .sort((a, b) => b.inclusion - a.inclusion)
  return { commanderName, slug, numDecks: page.data.numDecks ?? 0, cards }
}

/** "creatures" / "Sorceries" / "land" → the singular card type used in `cardType`. */
function singularType(t: string): string {
  const s = t.toLowerCase().trim()
  if (s.startsWith('sorcer')) return 'sorcery'
  return s.endsWith('s') ? s.slice(0, -1) : s
}

/** Top N cards for a commander, optionally one card type (plural or singular accepted). */
export async function getCommanderStaples(
  commanderName: string,
  options?: { limit?: number; cardType?: string },
): Promise<{ commanderName: string; numDecks: number; cards: EDHRECCard[] }> {
  const data = await getCommanderTopCards(commanderName)
  let filtered = data.cards
  if (options?.cardType) {
    const ct = singularType(options.cardType)
    filtered = filtered.filter((c) => c.cardType === ct)
  }
  return { commanderName: data.commanderName, numDecks: data.numDecks, cards: filtered.slice(0, options?.limit ?? 20) }
}

/** Text answer for the AI tool. */
export function formatEDHRECResponse(data: { commanderName: string; numDecks: number; cards: EDHRECCard[] }): string {
  const lines: string[] = [`EDHREC data for ${data.commanderName} (${data.numDecks} decks):`, '']
  for (const card of data.cards) {
    const synPct = (card.synergy * 100).toFixed(0)
    const synLabel = card.synergy > 0 ? `+${synPct}%` : `${synPct}%`
    lines.push(`- ${card.name} | ${card.inclusion}% inclusion | ${synLabel} synergy | ${card.cardType}`)
  }
  return lines.join('\n')
}
