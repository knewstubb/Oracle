// CC-07: find the copies that match a set of filters, once, for both search_collection and get_collection_summary.
// Contract: connector-collection-search.md sections 5.3, 12 and 13.3.
//   1. read every matching copy from the view (database-side filters), narrow columns
//   2. apply the OR-style filters (types, location) in the app
//   3. role step: classify the distinct cards with the SHARED classifier, keep the ones with the wanted roles
// Any failed read is LookupFailed (D-030): never a short list, never "none".
import { CLASSIFIER_VERSION, hasClassifiableText, rolesForCard, type Role } from '../../card-roles'
import { matchesRulesText } from './rules-text-match'
import { fetchAll, LookupFailed, type ToolContext } from './common'
import { parseTypeLine, hasCardType, hasSupertype, type ParsedTypeLine } from '../../type-line'
import { applyPushdown, factFilterNames, norm, type CollectionFilters } from './collection-filters'
import { NARROW_COLS, readMatchingCopies, scopedView, type NarrowRow } from './collection-view'

export const ROLE_NAME_CEILING = 5000 // distinct card names; above this the role step fails loudly
const ROLE_BATCH = 100 // names per card-library read, kept short so the request address stays small
const ROLE_PARALLEL = 4
const VOCAB_CEILING = 500
export const IN_HAND = 'in your hand'
export const MISSING = 'missing'

export interface RoleInfo {
  roles: Role[]
  hasText: boolean
}

export interface Coverage {
  cardsWithoutFacts: number
  cardsWithoutText?: number
  note: string
}

export interface MatchOptions {
  /** Extra view columns to read per copy (for grouping). */
  extraCols?: string[]
  /** Run the role step even without a role filter (group_by role). */
  classify?: boolean
}

export interface MatchResult {
  rows: NarrowRow[]
  roleInfo?: Map<string, RoleInfo> // by card name; only when the role step ran
  coverage?: Coverage
  knownPlaces?: string[]
  notes: string[]
}


function columnsFor(f: CollectionFilters, extra: string[] = []): string {
  const cols = new Set(NARROW_COLS.split(', '))
  if (f.types || f.legendary != null || f.basic != null || f.snow != null) cols.add('type_line')
  if (f.location) for (const c of ['place_kind', 'deck_name', 'storage_name']) cols.add(c)
  for (const c of extra) cols.add(c)
  return [...cols].join(', ')
}

export function matchesLocation(r: Pick<NarrowRow, 'place_kind' | 'deck_name' | 'storage_name'>, location: string): boolean {
  const want = norm(location)
  if (want === IN_HAND) return r.place_kind === 'in_hand'
  if (want === MISSING) return r.place_kind === 'missing'
  if (r.place_kind === 'deck') return norm(r.deck_name ?? '') === want
  if (r.place_kind === 'storage') return norm(r.storage_name ?? '') === want
  return false
}

function appFilter(rows: NarrowRow[], f: CollectionFilters, withFacts = true): NarrowRow[] {
  let out = rows
  if (withFacts && (f.types || f.legendary != null || f.basic != null || f.snow != null)) {
    const parsed = new Map<string | null | undefined, ParsedTypeLine>()
    const parse = (t: string | null | undefined) => {
      let p = parsed.get(t)
      if (!p) parsed.set(t, (p = parseTypeLine(t)))
      return p
    }
    // Exact decision from the parsed type line, either face. A row without facts never matches.
    out = out.filter((r) => {
      if (!r.facts_available) return false
      const p = parse(r.type_line)
      if (f.types && !f.types.some((t) => hasCardType(p, t, 'any'))) return false
      if (f.legendary != null && hasSupertype(p, 'Legendary', 'any') !== f.legendary) return false
      if (f.basic != null && hasSupertype(p, 'Basic', 'any') !== f.basic) return false
      if (f.snow != null && hasSupertype(p, 'Snow', 'any') !== f.snow) return false
      return true
    })
  }
  if (f.location) out = out.filter((r) => matchesLocation(r, f.location!))
  return out
}

export interface LibraryRow {
  name: string
  type_line: string | null
  oracle_text: string | null
  can_be_commander?: boolean | null
}
/** One batched read of the card library by name (100 names a request, 4 at a time). Any failed read throws LookupFailed. */
export async function readLibrary(ctx: ToolContext, names: string[]): Promise<Map<string, LibraryRow>> {
  const unique = [...new Set(names)]
  if (unique.length > ROLE_NAME_CEILING) throw new LookupFailed()
  const out = new Map<string, LibraryRow>()
  const batches: string[][] = []
  for (let i = 0; i < unique.length; i += ROLE_BATCH) batches.push(unique.slice(i, i + ROLE_BATCH))
  for (let i = 0; i < batches.length; i += ROLE_PARALLEL) {
    const got = await Promise.all(
      batches.slice(i, i + ROLE_PARALLEL).map((batch) =>
        fetchAll<LibraryRow>(() => ctx.db.select('ref_cards', 'name, type_line, oracle_text, can_be_commander').in('name', batch)),
      ),
    )
    for (const r of got.flat()) out.set(r.name, r)
  }
  return out
}
function rolesFromLibrary(lib: Map<string, LibraryRow>): Map<string, RoleInfo> {
  const out = new Map<string, RoleInfo>()
  for (const r of lib.values()) {
    const card = { name: r.name, typeLine: r.type_line, oracleText: r.oracle_text }
    out.set(r.name, { roles: rolesForCard(card), hasText: hasClassifiableText(card) })
  }
  return out
}
/** Roles for these card names, from the card library text, using the one shared classifier. */
export async function classifyNames(ctx: ToolContext, names: string[]): Promise<Map<string, RoleInfo>> {
  return rolesFromLibrary(await readLibrary(ctx, names))
}
function hasWantedRoles(info: RoleInfo | undefined, wanted: Role[], mode: 'any' | 'all'): boolean {
  if (!info || !info.hasText) return false // cannot be checked: never matched, always counted in the coverage note
  return mode === 'all' ? wanted.every((r) => info.roles.includes(r)) : wanted.some((r) => info.roles.includes(r))
}

const distinct = (rows: NarrowRow[]) => new Set(rows.map((r) => r.card_id)).size

export async function findMatchingCopies(ctx: ToolContext, f: CollectionFilters, opts: MatchOptions = {}): Promise<MatchResult> {
  const cols = columnsFor(f, opts.extraCols)
  const notes: string[] = []
  let rows = appFilter(await readMatchingCopies(ctx, cols, (q) => applyPushdown(q, f)), f)
  let knownPlaces: string[] | undefined

  if (f.location && rows.length === 0) {
    const places = await knownPlaceNames(ctx)
    if (!places.names.has(norm(f.location))) {
      knownPlaces = places.list.slice(0, 50)
      notes.push(`No deck, box or binder is called "${f.location}". Real places are listed in knownPlaces.`)
    }
  }

  let roleInfo: Map<string, RoleInfo> | undefined
  let cardsWithoutText: number | undefined
  if (f.roles || f.text || f.can_be_commander != null || opts.classify) {
    // One library read for everything that needs it (roles, rules text, commander flag).
    const withFacts = rows.filter((r) => r.facts_available)
    const library = await readLibrary(ctx, withFacts.map((r) => r.card_name))
    roleInfo = rolesFromLibrary(library)
    const cardCount = (rs: NarrowRow[]) => new Set(rs.map((r) => r.card_id)).size
    if (f.roles) cardsWithoutText = cardCount(withFacts.filter((r) => !roleInfo!.get(r.card_name)?.hasText))
    else if (f.text) cardsWithoutText = cardCount(withFacts.filter((r) => library.has(r.card_name) && !library.get(r.card_name)!.oracle_text?.trim()))
    if (f.roles || f.text || f.can_be_commander != null) rows = withFacts // rows without facts never match these filters
    if (f.roles) rows = rows.filter((r) => hasWantedRoles(roleInfo!.get(r.card_name), f.roles!, f.roles_match ?? 'any'))
    if (f.text) rows = rows.filter((r) => matchesRulesText(library.get(r.card_name)?.oracle_text, f.text!, f.text_match ?? 'all_words'))
    if (f.can_be_commander != null) rows = rows.filter((r) => library.has(r.card_name) && (library.get(r.card_name)!.can_be_commander === true) === f.can_be_commander)
    if (f.text && rows.length === 0) notes.push('No owned card has those words in its rules text. Rules text says "put" not "puts" and "this creature" not the card\'s name; try fewer or shorter words, or text_match all_words.')
  }
  const used = factFilterNames(f)
  let coverage: Coverage | undefined
  if (used.length > 0) {
    // Cards that pass every filter that does not need facts, but have none: they can never match the fact filters.
    const noFacts = appFilter(await readMatchingCopies(ctx, cols, (q) => applyPushdown(q, f, false).eq('facts_available', false)), f, false)
    const cardsWithoutFacts = distinct(noFacts)
    const list = used.length > 1 ? `${used.slice(0, -1).join(', ')} and ${used[used.length - 1]}` : used[0]
    const parts = [`${cardsWithoutFacts} owned card${cardsWithoutFacts === 1 ? ' has' : 's have'} no card facts yet`]
    if (cardsWithoutText != null) parts.push(`${cardsWithoutText} ${cardsWithoutText === 1 ? 'has' : 'have'} no rules text`)
    const note = `${parts.join(' and ')}, so they cannot be matched by the ${list} filter${used.length > 1 ? 's' : ''}.`
    coverage = { cardsWithoutFacts, ...(cardsWithoutText != null ? { cardsWithoutText } : {}), note }
  }

  if (rows.length === 0 && (f.subtypes || f.keywords)) notes.push(...(await unknownWordNotes(ctx, f)))

  return { rows, ...(roleInfo ? { roleInfo } : {}), ...(coverage ? { coverage } : {}), ...(knownPlaces ? { knownPlaces } : {}), notes }
}

export const ROLE_RULES_VERSION = CLASSIFIER_VERSION

async function knownPlaceNames(ctx: ToolContext): Promise<{ names: Set<string>; list: string[] }> {
  const all = await fetchAll<{ place_kind: string; deck_name: string | null; storage_name: string | null }>(() =>
    scopedView(ctx, 'place_kind, deck_name, storage_name').order('copy_id', { ascending: true }),
  )
  const seen = new Map<string, string>([[IN_HAND, 'In your hand'], [MISSING, 'Missing']])
  for (const r of all) {
    if (r.deck_name) seen.set(norm(r.deck_name), r.deck_name)
    if (r.storage_name) seen.set(norm(r.storage_name), r.storage_name)
  }
  return { names: new Set(seen.keys()), list: [...seen.values()].sort((a, b) => a.localeCompare(b)) }
}

// ---- unknown subtype / keyword words: a note, never an error, with a spelling suggestion from the owner's own words ----

function squash(s: string): string {
  return norm(s).replace(/[\s_-]+/g, '')
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function suggestWord(word: string, vocabulary: string[]): string | null {
  const w = squash(word)
  const singular = w.endsWith('ves') ? `${w.slice(0, -3)}f` : w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('s') ? w.slice(0, -1) : w
  let best: { word: string; d: number } | null = null
  for (const v of vocabulary) {
    const sv = squash(v)
    const d = sv === w || sv === singular ? 0 : editDistance(sv, w) <= 2 && w.length >= 4 ? editDistance(sv, w) : 99
    if (d < 99 && (!best || d < best.d)) best = { word: v, d }
  }
  return best ? best.word : null
}

async function vocabulary(ctx: ToolContext, column: 'subtypes' | 'keywords'): Promise<string[]> {
  const all = await fetchAll<Record<string, string[] | null>>(() => scopedView(ctx, `card_id, ${column}`).order('copy_id', { ascending: true }))
  const set = new Set<string>()
  for (const r of all) for (const w of r[column] ?? []) set.add(w)
  return [...set].slice(0, VOCAB_CEILING)
}

async function unknownWordNotes(ctx: ToolContext, f: CollectionFilters): Promise<string[]> {
  const notes: string[] = []
  for (const [column, label, words] of [['subtypes', 'subtype', f.subtypes], ['keywords', 'keyword', f.keywords]] as const) {
    if (!words) continue
    const vocab = await vocabulary(ctx, column)
    const have = new Set(vocab)
    for (const w of words) {
      if (have.has(norm(w))) continue
      const near = suggestWord(w, vocab)
      notes.push(`No owned card has the ${label} "${w}".${near ? ` Did you mean "${near}"?` : ''}`)
    }
  }
  return notes
}
