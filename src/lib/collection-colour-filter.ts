/**
 * Collection screen colour filter (Collection page only; the Claude connector has its own, see
 * src/lib/connector/tools/collection-filters.ts).
 *
 * The toolbar sends the letters W U B R G and C. C means colourless, which the library stores as an EMPTY
 * colour list, never as the letter C, so a plain "card has colour C" test can never match anything.
 *
 * Rule (one rule for both views and both modes):
 *   - W U B R G chosen: Exact = the card has exactly those colours; Includes = the card has at least those colours.
 *   - C chosen: colourless cards are added to whatever the colours match.
 *   - C chosen alone: colourless cards only, in both modes (a colourless card has no colour to "include").
 *   - Example, Exact + G + C: mono-green cards and colourless cards. Includes + G + C: every green card and colourless cards.
 */
import { createAdminClient } from '@/lib/supabase'

export const COLOUR_LETTERS = ['W', 'U', 'B', 'R', 'G'] as const
export type ColourFilterMode = 'exact' | 'includes'

export interface ColourFilter {
  /** Chosen colours among W U B R G, upper case, no duplicates. */
  colours: string[]
  /** The colourless icon (C) is chosen. */
  colourless: boolean
  mode: ColourFilterMode
}

/** Turns the raw `colors` / `colorMode` request values into a filter, or null when there is nothing to filter on. */
export function parseColourFilter(raw: string[], colorMode: string): ColourFilter | null {
  const chosen = new Set(raw.map((c) => c.trim().toUpperCase()))
  const colours = COLOUR_LETTERS.filter((c) => chosen.has(c)) as string[]
  const colourless = chosen.has('C')
  if (colours.length === 0 && !colourless) return null
  return { colours, colourless, mode: colorMode === 'exact' ? 'exact' : 'includes' }
}

/** Does a card with these colours pass the filter? An empty list is a colourless card. */
export function matchesColourFilter(cardColours: readonly string[] | null | undefined, f: ColourFilter): boolean {
  const have = new Set((cardColours ?? []).map((c) => c.toUpperCase()))
  if (have.size === 0) return f.colourless
  if (f.colours.length === 0) return false
  if (f.mode === 'exact' && have.size !== f.colours.length) return false
  return f.colours.every((c) => have.has(c))
}

// ---------------------------------------------------------------------------
// Database side. Uses the existing read-only view connector_collection_copies (one row per physical copy, with
// has_w .. has_g and is_colourless already worked out from the card library).
// ---------------------------------------------------------------------------

/** The small part of the query builder these routes need; the generated types do not know the view. */
export interface ViewQuery extends PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
  eq(column: string, value: unknown): ViewQuery
  ilike(column: string, pattern: string): ViewQuery
  or(filters: string): ViewQuery
  order(column: string, opts?: { ascending?: boolean }): ViewQuery
  range(from: number, to: number): ViewQuery
}

export interface ViewClient {
  from(table: 'connector_collection_copies'): {
    select(columns: string, opts?: { count?: 'exact'; head?: boolean }): ViewQuery
  }
}

export function asViewClient(db: ReturnType<typeof createAdminClient>): ViewClient {
  return db as unknown as ViewClient
}

/**
 * The PostgREST `or(...)` text for a filter. `extraCopyIds` are copies the view cannot judge (no card library row),
 * already checked in the app with matchesColourFilter.
 */
export function colourOrExpression(f: ColourFilter, extraCopyIds: number[]): string {
  const parts: string[] = []
  if (f.colours.length > 0) {
    const conds = ['facts_available.eq.true']
    const col = { W: 'has_w', U: 'has_u', B: 'has_b', R: 'has_r', G: 'has_g' } as Record<string, string>
    for (const c of COLOUR_LETTERS) {
      if (f.colours.includes(c)) conds.push(`${col[c]}.eq.true`)
      else if (f.mode === 'exact') conds.push(`${col[c]}.eq.false`)
    }
    parts.push(`and(${conds.join(',')})`)
  }
  if (f.colourless) parts.push('and(facts_available.eq.true,is_colourless.eq.true)')
  if (extraCopyIds.length > 0) parts.push(`copy_id.in.(${extraCopyIds.join(',')})`)
  return parts.join(',')
}

// ---------------------------------------------------------------------------
// Copies with no card library row (double-faced names that do not match, for example). The view cannot give
// their colours, so their colours come from the printing, as the list always did. Cached for 30 seconds per
// user because it is the same answer for every colour click.
// ---------------------------------------------------------------------------

interface FactlessCopy {
  copyId: number
  colours: string[]
}

const FACTLESS_TTL_MS = 30_000
const factlessCache = new Map<string, { at: number; value: Promise<FactlessCopy[]> }>()

/** Test hook. */
export function clearFactlessCopyCache(): void {
  factlessCache.clear()
}

async function loadFactlessCopies(db: ReturnType<typeof createAdminClient>, userId: string): Promise<FactlessCopy[]> {
  const view = asViewClient(db)
  const { data, error } = await view
    .from('connector_collection_copies')
    .select('copy_id, printing_id')
    .eq('user_id', userId)
    .eq('facts_available', false)
    .range(0, 999)
  if (error) throw error
  const copies = (data ?? []) as Array<{ copy_id: number; printing_id: string | null }>
  const printingIds = [...new Set(copies.map((c) => c.printing_id).filter(Boolean) as string[])]
  const colourByPrinting = new Map<string, string[]>()
  for (let i = 0; i < printingIds.length; i += 200) {
    const { data: rows, error: pErr } = await db
      .from('ref_printings')
      .select('scryfall_id, color_identity')
      .in('scryfall_id', printingIds.slice(i, i + 200))
    if (pErr) throw pErr
    for (const r of rows ?? []) colourByPrinting.set(r.scryfall_id, Array.isArray(r.color_identity) ? r.color_identity : [])
  }
  return copies.map((c) => ({ copyId: c.copy_id, colours: (c.printing_id && colourByPrinting.get(c.printing_id)) || [] }))
}

/** Ids of the copies the view cannot judge that pass the filter. */
export async function matchingFactlessCopyIds(
  db: ReturnType<typeof createAdminClient>,
  userId: string,
  f: ColourFilter
): Promise<number[]> {
  const now = Date.now()
  let entry = factlessCache.get(userId)
  if (!entry || now - entry.at > FACTLESS_TTL_MS) {
    entry = { at: now, value: loadFactlessCopies(db, userId) }
    factlessCache.set(userId, entry)
    entry.value.catch(() => factlessCache.delete(userId))
  }
  const copies = await entry.value
  return copies.filter((c) => matchesColourFilter(c.colours, f)).map((c) => c.copyId)
}
