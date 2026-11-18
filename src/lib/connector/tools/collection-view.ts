// CC-07: reading the read-only view `connector_collection_copies` (one row per physical copy, with card facts and place).
// Contract: docs/oracle/contracts/connector-collection-search.md sections 3 and 5. Every query carries the owner id.
import type { CopyView } from '../../../../docs/oracle/contracts/claude-connector-slice-a.types'
import { fetchAll, fetchAllIn, type ToolContext } from './common'
import type { ReadQuery } from '../user-client'

export const COPIES_VIEW = 'connector_collection_copies'

/** Columns read for every matching copy. Narrow on purpose: up to 5 small requests at today's size. */
export const NARROW_COLS = 'copy_id, card_id, card_name, is_proxy, facts_available'

export interface NarrowRow {
  copy_id: number
  card_id: number
  card_name: string
  is_proxy: boolean
  facts_available: boolean
  // Only present when the matching filter or grouping asked for them:
  type_line?: string | null
  primary_type?: string | null
  colour_letters?: string | null
  place_kind?: string
  deck_name?: string | null
  storage_name?: string | null
  t_creature?: boolean
  t_instant?: boolean
  t_sorcery?: boolean
  t_artifact?: boolean
  t_enchantment?: boolean
  t_planeswalker?: boolean
  t_land?: boolean
  t_battle?: boolean
  mana_value?: number | null
  subtypes?: string[] | null
}

export interface DetailRow {
  copy_id: number
  card_id: number
  oracle_id: string
  card_name: string
  printing_id: string | null
  finish: string | null
  is_proxy: boolean
  missing: boolean
  in_hand: boolean
  place_kind: string
  deck_id: number | null
  deck_name: string | null
  storage_name: string | null
  type_line: string | null
  keywords: string[] | null
}
export const DETAIL_COLS = 'copy_id, card_id, oracle_id, card_name, printing_id, finish, is_proxy, missing, in_hand, place_kind, deck_id, deck_name, storage_name, type_line, keywords'

/** Filters the database can apply itself. Anything that needs OR logic is applied in the app after the read (see collection-filters.ts). */
export interface PushdownFilters {
  query?: string
  onlyFree?: boolean
  includeProxies?: boolean
  onlyProxies?: boolean
  extra?: (q: ReadQuery) => ReadQuery
}

export function scopedView(ctx: ToolContext, columns: string): ReadQuery {
  return ctx.db.select(COPIES_VIEW, columns).eq('user_id', ctx.userId)
}

/** Read every matching copy, in a stable order: card name, card, originals before proxies, copy. Throws LookupFailed past the read ceiling. */
export function readMatchingCopies(
  ctx: ToolContext,
  columns: string,
  apply: (q: ReadQuery) => ReadQuery,
): Promise<NarrowRow[]> {
  return fetchAll<NarrowRow>(() =>
    apply(scopedView(ctx, columns))
      .order('card_name', { ascending: true })
      .order('card_id', { ascending: true })
      .order('is_proxy', { ascending: true })
      .order('copy_id', { ascending: true }),
  )
}

export function readDetail(ctx: ToolContext, copyIds: number[]): Promise<DetailRow[]> {
  return copyIds.length ? fetchAllIn<DetailRow>(ctx, COPIES_VIEW, DETAIL_COLS, 'copy_id', copyIds) : Promise.resolve([])
}

export function locationOf(r: Pick<DetailRow, 'place_kind' | 'deck_id' | 'deck_name' | 'storage_name'>): CopyView['location'] {
  switch (r.place_kind) {
    case 'missing':
      return { kind: 'missing' }
    case 'in_hand':
      return { kind: 'in_hand' }
    case 'deck':
      return { kind: 'deck', deckId: r.deck_id ?? 0, deckName: r.deck_name ?? '' }
    case 'storage':
      return { kind: 'storage', name: r.storage_name ?? null }
    default:
      return { kind: 'unknown' }
  }
}

export interface CardKindGroup {
  cardId: number
  name: string
  kind: 'original' | 'proxy'
  copyIds: number[]
  manaValue: number | null // null when the card has no facts
}

/** One group = one card + one kind. Input order is kept (it is already sorted: name, card, original before proxy). */
export function groupByCardAndKind(rows: NarrowRow[]): CardKindGroup[] {
  const map = new Map<string, CardKindGroup>()
  for (const r of rows) {
    const key = `${r.card_id}:${r.is_proxy ? 'p' : 'o'}`
    let g = map.get(key)
    if (!g) {
      g = { cardId: r.card_id, name: r.card_name, kind: r.is_proxy ? 'proxy' : 'original', copyIds: [], manaValue: r.facts_available ? (r.mana_value ?? null) : null }
      map.set(key, g)
    }
    g.copyIds.push(r.copy_id)
  }
  return [...map.values()]
}
/** Stable sort for search results. Ties by name, then original before proxy. Cards with no mana value (no facts) are always last, in both directions. */
export function sortGroups(groups: CardKindGroup[], sortBy: 'name' | 'mana_value', order: 'asc' | 'desc'): CardKindGroup[] {
  const dir = order === 'desc' ? -1 : 1
  const byName = (a: CardKindGroup, b: CardKindGroup) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : a.kind === b.kind ? 0 : a.kind === 'original' ? -1 : 1
  return groups
    .map((g, i) => ({ g, i }))
    .sort((x, y) => {
      if (sortBy === 'mana_value') {
        const a = x.g.manaValue, b = y.g.manaValue
        if (a == null && b != null) return 1
        if (a != null && b == null) return -1
        if (a != null && b != null && a !== b) return (a - b) * dir
        const n = byName(x.g, y.g) // ties by name, always ascending
        return n || x.i - y.i
      }
      const n = byName(x.g, y.g) * dir
      return n || x.i - y.i
    })
    .map((e) => e.g)
}
