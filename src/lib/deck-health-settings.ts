/**
 * Deck health settings: which targets a deck is checked against, and how the rail shows them.
 * Pure: no database, no network. The counts for the default rows come from buildDeckHealth (the text classifier, HC-01);
 * the counts for custom categories come from the categories on the deck's cards.
 *
 * Two modes. "default" shows the six standard rows (with any per-deck range the owner changed). "custom" shows the
 * owner's own categories. Switching mode never deletes the other mode's rows, so Custom -> Default -> Custom keeps everything.
 * A category with no range, or only a proposal from Claude, shows its count and "No target" and never gets a verdict.
 */
import { parseCategories } from './categoryUtils'
import { KIND_LABELS, RANGED_KINDS, verdictFor, type DeckHealthResponse, type HealthKind, type HealthRange, type RangedKind } from './deck-health'

export type HealthMode = 'default' | 'custom'

export interface CustomCategory {
  id: number
  name: string
  min: number | null
  max: number | null
  /** A range Claude suggested that the owner has not confirmed yet. Never used for a verdict. */
  proposed: HealthRange | null
}

export interface HealthSettings {
  /** False when the stored-data change has not been applied yet: defaults are shown and nothing can be saved. */
  available: boolean
  mode: HealthMode
  /** Per-deck changes to a default range. */
  overrides: Partial<Record<RangedKind, HealthRange>>
  categories: CustomCategory[]
}

export const DEFAULT_SETTINGS: HealthSettings = { available: true, mode: 'default', overrides: {}, categories: [] }
export const UNAVAILABLE_SETTINGS: HealthSettings = { available: false, mode: 'default', overrides: {}, categories: [] }

/** Names a custom category may not use: they are places a card sits, not jobs it does. */
export const RESERVED_CATEGORY_NAMES = ['maybeboard', 'sideboard', 'commander', 'companion'] as const
export const CATEGORY_NAME_MAX = 60
export const TARGET_MAX = 100
/** Stored name of a per-deck range change for a default row (the stored table needs a name on every row). */
export const OVERRIDE_PREFIX = 'default:'

export type TileStatus = 'under' | 'over' | 'on' | 'none' | 'total'

export interface HealthTile {
  key: string
  /** The default row this tile is, or null for a custom category. */
  kind: HealthKind | null
  categoryId: number | null
  /** "Targeted Removal", "Game Plan", or the custom name. */
  label: string
  have: number
  min: number | null
  max: number | null
  /** Negative = below the minimum, positive = above the maximum, 0 otherwise. */
  offBy: number
  status: TileStatus
  /** "10\u201312" or null. */
  rangeText: string | null
  /** Claude's suggested range for a custom category, shown only in the Deck settings window. */
  proposed: HealthRange | null
  doubleFaced: number
  ariaLabel: string
}

export interface HealthTilesView {
  mode: HealthMode
  /** Fixed order: Ramp, Board Wipes, Card Advantage, Lands, Targeted Removal, Game Plan (custom mode: problems first as before). */
  tiles: HealthTile[]
  headline: { text: string; problem: boolean }
}

const SHORT_NAMES: Record<HealthKind, string> = {
  lands: 'lands',
  ramp: 'ramp',
  card_advantage: 'card advantage',
  targeted_removal: 'removal',
  board_wipes: 'board wipes',
  game_plan: 'game plan',
}

const dash = (r: HealthRange) => `${r.min}\u2013${r.max}`
const plural = (n: number) => (n === 1 ? 'card' : 'cards')

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function ariaFor(label: string, have: number, status: TileStatus, range: string | null, offBy: number): string {
  let s = `${label}: ${have} ${plural(have)}.`
  if (status === 'total') return `${s} A total, no target. Open details.`
  if (status === 'none') return `${s} No target. Open details.`
  s += ` Target ${range}.`
  if (status === 'under') s += ` ${-offBy} below.`
  if (status === 'over') s += ` ${offBy} above.`
  if (status === 'on') s += ' On target.'
  return `${s} Open details.`
}

function rangedTile(kind: HealthKind | null, id: number | null, key: string, label: string, have: number, range: HealthRange | null, proposed: HealthRange | null, doubleFaced = 0): HealthTile {
  const verdict = range ? verdictFor(have, range) : null
  const offBy = !range ? 0 : verdict === 'heavy' ? have - range.max : verdict === 'light' ? have - range.min : 0
  const status: TileStatus = !range ? 'none' : verdict === 'light' ? 'under' : verdict === 'heavy' ? 'over' : 'on'
  const rangeText = range ? dash(range) : null
  return {
    key,
    kind,
    categoryId: id,
    label,
    have,
    min: range?.min ?? null,
    max: range?.max ?? null,
    offBy,
    status,
    rangeText,
    proposed,
    doubleFaced,
    ariaLabel: ariaFor(label, have, status, rangeText, offBy),
  }
}

/** Case-insensitive, trimmed key for comparing category names. */
export const categoryKey = (name: string) => name.trim().toLowerCase()

/** Cards (by quantity) in the main deck that carry this category, in any of their up to five category slots. */
export function countCategory(cards: Array<{ categories?: string | null; quantity?: number | null }>, name: string): number {
  const want = categoryKey(name)
  let n = 0
  for (const c of cards) {
    const parsed = parseCategories(c.categories)
    const all = [parsed.primary_category, ...parsed.additional_categories].map(categoryKey)
    if (all.some((x) => (RESERVED_CATEGORY_NAMES as readonly string[]).includes(x))) continue
    if (all.includes(want)) n += c.quantity || 1
  }
  return n
}

/** Every distinct category name on the deck's cards, for the "Add category" suggestions. */
export function categoryNamesOnCards(cards: Array<{ categories?: string | null }>): string[] {
  const seen = new Map<string, string>()
  for (const c of cards) {
    if (!c.categories) continue
    const parsed = parseCategories(c.categories)
    for (const name of [parsed.primary_category, ...parsed.additional_categories]) {
      const k = categoryKey(name)
      if (!k || k === 'other' || (RESERVED_CATEGORY_NAMES as readonly string[]).includes(k)) continue
      if (!seen.has(k)) seen.set(k, name)
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** The tiles for the current mode. Default mode never reads `cards`; custom mode never reads `health`. */
export function applySettings(
  health: DeckHealthResponse,
  settings: HealthSettings,
  cards: Array<{ categories?: string | null; quantity?: number | null }>,
): HealthTile[] {
  if (settings.available && settings.mode === 'custom') {
    return settings.categories.map((c) => {
      const range = c.min !== null && c.max !== null ? { min: c.min, max: c.max } : null
      return rangedTile(null, c.id, `cat-${c.id}`, c.name, countCategory(cards, c.name), range, c.proposed)
    })
  }
  const overrides = settings.available ? settings.overrides : {}
  return health.rows.map((r) => {
    if (r.kind === 'game_plan') {
      return { ...rangedTile('game_plan', null, 'game_plan', 'Game Plan', r.have, null, null), status: 'total' as const, ariaLabel: ariaFor('Game Plan', r.have, 'total', null, 0) }
    }
    const range = overrides[r.kind as RangedKind] ?? r.range
    return rangedTile(r.kind, null, r.kind, KIND_LABELS[r.kind].replace(' / Mass Disruption', ''), r.have, range, null, r.doubleFaced ?? 0)
  })
}

const RAIL_TILE_ORDER: HealthKind[] = ['ramp', 'board_wipes', 'card_advantage', 'lands', 'targeted_removal', 'game_plan']
/** Words the headline and puts the tiles in the design's fixed order (problems are not moved to the front). */
export function healthTilesView(tiles: HealthTile[], mode: HealthMode): HealthTilesView {
  const under = tiles.filter((t) => t.status === 'under').sort((a, b) => a.offBy - b.offBy)
  const over = tiles.filter((t) => t.status === 'over').sort((a, b) => b.offBy - a.offBy)
  // Fixed order as in the design (default mode); custom mode keeps problems first.
  const pos = (t: HealthTile) => (t.kind ? RAIL_TILE_ORDER.indexOf(t.kind) : -1)
  const rest = tiles.filter((t) => t.status !== 'under' && t.status !== 'over')
  const problemsFirst = [...under, ...over, ...rest.filter((t) => t.status !== 'total'), ...rest.filter((t) => t.status === 'total')]
  const ordered = mode === 'default' ? [...tiles].sort((a, b) => pos(a) - pos(b)) : problemsFirst
  const name = (t: HealthTile) => (t.kind ? SHORT_NAMES[t.kind] : t.label)
  let text: string
  if (under.length + over.length > 0) {
    const parts: string[] = []
    if (under.length > 0) parts.push(`Light on ${joinNames(under.map(name))}`)
    if (over.length > 0) parts.push(`${under.length > 0 ? 'heavy' : 'Heavy'} on ${joinNames(over.map(name))}`)
    text = parts.join(', ')
  } else if (!tiles.some((t) => t.status === 'on')) {
    text = 'No targets set yet'
  } else if (tiles.some((t) => t.status === 'none')) {
    text = 'On target everywhere a target is set'
  } else {
    text = 'On target in every category'
  }
  return { mode, tiles: ordered, headline: { text, problem: under.length + over.length > 0 } }
}

// ---------------------------------------------------------------------------
// Validation (used by the route and by the window's inputs)
// ---------------------------------------------------------------------------

export function validateRange(min: unknown, max: unknown): { ok: true; range: HealthRange } | { ok: false; error: string } {
  const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
  if (!isInt(min) || !isInt(max)) return { ok: false, error: 'Targets are whole numbers.' }
  if (min < 0 || max < 0 || min > TARGET_MAX || max > TARGET_MAX) return { ok: false, error: `Targets run from 0 to ${TARGET_MAX}.` }
  if (min > max) return { ok: false, error: 'The minimum can\u2019t be more than the maximum.' }
  return { ok: true, range: { min, max } }
}

export function validateCategoryName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== 'string') return { ok: false, error: 'Give the category a name.' }
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 1) return { ok: false, error: 'Give the category a name.' }
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: `Names can be up to ${CATEGORY_NAME_MAX} characters.` }
  if ((RESERVED_CATEGORY_NAMES as readonly string[]).includes(categoryKey(name))) return { ok: false, error: `${name} is a place a card sits, not a category you can set a target for.` }
  if (name.toLowerCase().startsWith(OVERRIDE_PREFIX)) return { ok: false, error: 'Pick a different name.' }
  if (name.includes(',')) return { ok: false, error: 'Names can\u2019t contain a comma.' }
  return { ok: true, name }
}

export { RANGED_KINDS }
