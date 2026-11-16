// In-memory stand-in for the read-only view and the card library, used by the CC-07 tests.
// It understands the same filter calls the real database handle exposes, so a test proves a filter by its effect on rows.
import { mockDb, type RecordedQuery } from './mock-db'

export interface ViewRow {
  user_id: string
  copy_id: number
  card_id: number
  oracle_id: string
  card_name: string
  printing_id: string | null
  finish: string | null
  is_proxy: boolean
  missing: boolean
  in_hand: boolean
  place_kind: 'missing' | 'in_hand' | 'deck' | 'storage' | 'unplaced'
  deck_id: number | null
  deck_name: string | null
  location_id: number | null
  storage_name: string | null
  is_free: boolean
  facts_available: boolean
  type_line: string | null
  mana_value: number | null
  colour_letters: string | null
  has_w: boolean
  has_u: boolean
  has_b: boolean
  has_r: boolean
  has_g: boolean
  is_colourless: boolean
  t_creature: boolean
  t_instant: boolean
  t_sorcery: boolean
  t_artifact: boolean
  t_enchantment: boolean
  t_planeswalker: boolean
  t_land: boolean
  t_battle: boolean
  primary_type: string | null
  subtypes: string[] | null
  keywords: string[] | null
}

export interface LibCard {
  name: string
  type_line: string
  oracle_text: string | null
  mana_cost?: string | null
  mana_value: number
  color_identity: string
  keywords?: string[] | null
  commander_legal?: boolean
}

const PRIMARY = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']
const has = (t: string, w: string) => t.toLowerCase().includes(w)

let nextCopy = 1
let nextCard = 1
const cardIds = new Map<string, number>()

export function resetIds() {
  nextCopy = 1
  nextCard = 1
  cardIds.clear()
}

/** Build a view row the way the real view would, from a library card and where the copy is. */
export function copyRow(
  lib: LibCard | null,
  opts: { name?: string; user?: string; proxy?: boolean; deck?: string | null; box?: string | null; hand?: boolean; missing?: boolean; id?: number } = {},
): ViewRow {
  const name = opts.name ?? lib?.name ?? 'Unknown'
  if (!cardIds.has(name)) cardIds.set(name, nextCard++)
  const hand = !!opts.hand
  const missing = !!opts.missing
  const deck = opts.deck ?? null
  const box = opts.box ?? null
  const ci = lib ? lib.color_identity : null
  const letters = ci == null ? null : ['W', 'U', 'B', 'R', 'G'].filter((c) => ci.includes(c)).join('')
  const t = lib?.type_line ?? ''
  const front = t.split(' // ')[0]
  const dash = (face: string) => (face.includes('—') ? face.split('—').slice(1).join('—') : '')
  const subs = lib ? [...new Set(t.split(' // ').flatMap((f) => dash(f).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)))] : null
  return {
    user_id: opts.user ?? 'user-1',
    copy_id: opts.id ?? nextCopy++,
    card_id: cardIds.get(name)!,
    oracle_id: `o-${name}`,
    card_name: name,
    printing_id: `sf-${name}`,
    finish: 'normal',
    is_proxy: !!opts.proxy,
    missing,
    in_hand: hand,
    place_kind: missing ? 'missing' : hand ? 'in_hand' : deck ? 'deck' : box ? 'storage' : 'unplaced',
    deck_id: deck ? 1 : null,
    deck_name: deck,
    location_id: box ? 5 : null,
    storage_name: box,
    is_free: !missing && !hand && !deck,
    facts_available: !!lib,
    type_line: lib?.type_line ?? null,
    mana_value: lib?.mana_value ?? null,
    colour_letters: letters,
    has_w: !!lib && letters!.includes('W'),
    has_u: !!lib && letters!.includes('U'),
    has_b: !!lib && letters!.includes('B'),
    has_r: !!lib && letters!.includes('R'),
    has_g: !!lib && letters!.includes('G'),
    is_colourless: !!lib && letters === '',
    t_creature: !!lib && has(t, 'creature'),
    t_instant: !!lib && has(t, 'instant'),
    t_sorcery: !!lib && has(t, 'sorcery'),
    t_artifact: !!lib && has(t, 'artifact'),
    t_enchantment: !!lib && has(t, 'enchantment'),
    t_planeswalker: !!lib && has(t, 'planeswalker'),
    t_land: !!lib && has(t, 'land'),
    t_battle: !!lib && has(t, 'battle'),
    primary_type: lib ? (PRIMARY.find((p) => has(front, p.toLowerCase())) ?? 'Other') : null,
    subtypes: subs,
    keywords: lib ? (lib.keywords ?? []).map((k) => k.toLowerCase()) : null,
  }
}

type Row = Record<string, unknown>
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function likeToRegExp(p: string): RegExp {
  let out = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '\\') out += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (c === '%') out += '.*'
    else if (c === '_') out += '.'
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

function applyFilters(rows: Row[], q: RecordedQuery): { rows: Row[]; total: number } {
  let out = rows
  const orders: { col: string; asc: boolean }[] = []
  let range: [number, number] | null = null
  for (const f of q.filters) {
    const [a, b] = f.args as [string, unknown]
    if (f.op === 'eq') out = out.filter((r) => r[a] === b)
    else if (f.op === 'in') out = out.filter((r) => asList(b).includes(r[a]))
    else if (f.op === 'ilike') out = out.filter((r) => likeToRegExp(String(b)).test(String(r[a] ?? '')))
    else if (f.op === 'gte') out = out.filter((r) => typeof r[a] === 'number' && (r[a] as number) >= (b as number))
    else if (f.op === 'lte') out = out.filter((r) => typeof r[a] === 'number' && (r[a] as number) <= (b as number))
    else if (f.op === 'contains') out = out.filter((r) => Array.isArray(r[a]) && asList(b).every((x) => (r[a] as unknown[]).includes(x)))
    else if (f.op === 'overlaps') out = out.filter((r) => Array.isArray(r[a]) && asList(b).some((x) => (r[a] as unknown[]).includes(x)))
    else if (f.op === 'is') out = out.filter((r) => r[a] === null)
    else if (f.op === 'order') orders.push({ col: a, asc: (f.args[1] as { ascending?: boolean } | undefined)?.ascending !== false })
    else if (f.op === 'range') range = [a as unknown as number, b as number]
  }
  if (orders.length) {
    out = [...out].sort((x, y) => {
      for (const o of orders) {
        const xv = x[o.col] as never, yv = y[o.col] as never
        if (xv === yv) continue
        const c = String(xv) < String(yv) ? -1 : 1
        const n = typeof xv === 'boolean' || typeof xv === 'number' ? (xv < yv ? -1 : 1) : c
        return o.asc ? n : -n
      }
      return 0
    })
  }
  const total = out.length
  if (range) out = out.slice(range[0], range[1] + 1)
  return { rows: out, total }
}

export interface ViewDbOptions {
  library?: LibCard[]
  /** Make a table fail: any query on it returns an error. */
  failTable?: string
  /** Called for every query on the view (after filtering), to inspect or count. */
  onView?: (q: RecordedQuery, matched: number) => void
}

export function viewDb(view: ViewRow[], opts: ViewDbOptions = {}) {
  const lib = new Map((opts.library ?? []).map((c) => [c.name, c]))
  return mockDb((q) => {
    if (opts.failTable && q.table === opts.failTable) return { error: { message: 'db down' } }
    if (q.table === 'connector_collection_copies') {
      const r = applyFilters(view as unknown as Row[], q)
      opts.onView?.(q, r.total)
      return { data: r.rows }
    }
    if (q.table === 'ref_cards') {
      const inF = q.filters.find((f) => f.op === 'in')
      const names = inF ? (inF.args[1] as string[]) : []
      return { data: names.filter((n) => lib.has(n)).map((n) => lib.get(n)) }
    }
    return { data: [] }
  })
}
