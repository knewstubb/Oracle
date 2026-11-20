/**
 * Card Tags: the ONE mapping from Scryfall's Oracle tags to the app's 40 Tags.
 *
 * Source of the list: docs/oracle/reports/2026-11-20-architect-tag-frequency-proposal.md (sections 5a, 5b, 5c)
 * and docs/oracle/reports/evidence/tag-frequency/proposed-tags.csv. Owner decision 2026-11-20: use these 40.
 *
 * Rules (docs/oracle/briefs/card-tags-and-deck-slot-why.md):
 * - Tags are keyed by oracle_id (D-003), never a scryfall_id. They are global: no user, no deck.
 * - A Scryfall tag carries a card when the card has that tag OR any more specific sub-tag (child tags, recursively).
 * - `exclude` removes every card carried by the excluded tags (sub-tags included) from that Tag.
 * - Dropped (not Tags): Lands matter, Pinger. Nested (no Tag of their own): Mana rock, Mana dork, Land ramp,
 *   Reanimation, Spot removal, Repeatable draw. They are inside Ramp, Recursion, Targeted removal and Card draw.
 *
 * This is not the deck Category mapping in scryfall-category-mapping.ts (Scryfall tag to deck Category). That file
 * maps to Categories for suggestions; this file maps to Tags. The two do not overlap.
 *
 * Pure functions only. Reading files and writing to a database live in scripts/fill-card-tags.ts.
 */

export type CardTagKind = 'broad' | 'mechanic'

/** Where a stored Tag row came from. Only 'scryfall' is written today; the rest are reserved for later. */
export type CardTagSource = 'scryfall' | 'rule' | 'ai' | 'owner_correction'

export interface CardTagDefinition {
  /** Stable key, never changes once stored. */
  key: string
  /** Name the owner sees. */
  displayName: string
  kind: CardTagKind
  /** Scryfall tag slugs that give a card this Tag (each with its sub-tags). */
  scryfallTags: string[]
  /** Scryfall tag slugs whose cards (with sub-tags) are removed from this Tag. */
  exclude?: string[]
}

/** The 40 Tags in display order (13 broad, then 27 mechanic, most common first). */
export const CARD_TAGS: readonly CardTagDefinition[] = [
  // --- 13 broad ---
  { key: 'targeted_removal', displayName: 'Targeted removal', kind: 'broad', scryfallTags: ['removal'], exclude: ['sweeper', 'removal-land'] },
  { key: 'card_draw', displayName: 'Card draw', kind: 'broad', scryfallTags: ['draw'] },
  { key: 'ramp', displayName: 'Ramp', kind: 'broad', scryfallTags: ['ramp'] },
  { key: 'recursion', displayName: 'Recursion', kind: 'broad', scryfallTags: ['recursion'] },
  { key: 'card_selection', displayName: 'Card selection', kind: 'broad', scryfallTags: ['scry', 'surveil', 'top-deck-manipulation', 'loot', 'rummage'] },
  { key: 'protection', displayName: 'Protection', kind: 'broad', scryfallTags: ['protection'] },
  { key: 'tutor', displayName: 'Tutor', kind: 'broad', scryfallTags: ['tutor'] },
  { key: 'fixing', displayName: 'Fixing', kind: 'broad', scryfallTags: ['mana-fix', 'mana-filter', 'dual-land', 'tutor-land-basic'] },
  { key: 'board_wipe', displayName: 'Board wipe', kind: 'broad', scryfallTags: ['sweeper'] },
  { key: 'hand_disruption', displayName: 'Hand disruption', kind: 'broad', scryfallTags: ['hand-disruption'] },
  { key: 'stax_tax', displayName: 'Stax / tax', kind: 'broad', scryfallTags: ['tax', 'lockdown', 'mass-land-denial'] },
  { key: 'counterspell', displayName: 'Counterspell', kind: 'broad', scryfallTags: ['counterspell'] },
  { key: 'graveyard_hate', displayName: 'Graveyard hate', kind: 'broad', scryfallTags: ['hate-graveyard'] },
  // --- 27 mechanic ---
  { key: 'direct_damage', displayName: 'Direct damage or life loss to opponents', kind: 'mechanic', scryfallTags: ['burn-player', 'drain-life', 'opponent-loses-life', 'group-slug'] },
  { key: 'plus_one_counters', displayName: '+1/+1 counter maker', kind: 'mechanic', scryfallTags: ['gives-pp-counters', 'repeatable-pp-counters'] },
  { key: 'lifegain', displayName: 'Lifegain', kind: 'mechanic', scryfallTags: ['lifegain'] },
  { key: 'token_generator', displayName: 'Token generator', kind: 'mechanic', scryfallTags: ['repeatable-token-generator'] },
  { key: 'play_from_exile', displayName: 'Play from exile (impulse)', kind: 'mechanic', scryfallTags: ['impulse', 'repeatable-impulse', 'castable-from-exile', 'gives-castable-from-exile'] },
  { key: 'anthem', displayName: 'Anthem / team pump', kind: 'mechanic', scryfallTags: ['power-boost-to-all', 'toughness-boost-to-all', 'anthem', 'keyword-anthem'] },
  { key: 'death_trigger', displayName: 'Death trigger', kind: 'mechanic', scryfallTags: ['death-trigger'] },
  { key: 'mana_sink', displayName: 'Mana sink', kind: 'mechanic', scryfallTags: ['mana-sink', 'bottomless-mana-sink'] },
  { key: 'sacrifice_outlet', displayName: 'Sacrifice outlet', kind: 'mechanic', scryfallTags: ['sacrifice-outlet'] },
  { key: 'discard_outlet', displayName: 'Discard outlet', kind: 'mechanic', scryfallTags: ['discard-outlet'] },
  { key: 'counters_payoff', displayName: 'Counters payoff', kind: 'mechanic', scryfallTags: ['counters-matter', 'pp-counters-matter'] },
  { key: 'cast_trigger', displayName: 'Cast trigger', kind: 'mechanic', scryfallTags: ['cast-trigger-you'] },
  { key: 'graveyard_payoff', displayName: 'Graveyard payoff', kind: 'mechanic', scryfallTags: ['cards-in-graveyard-matter', 'graveyard-fuel'] },
  { key: 'artifact_payoff', displayName: 'Artifact payoff', kind: 'mechanic', scryfallTags: ['synergy-artifact'] },
  { key: 'self_mill', displayName: 'Self-mill', kind: 'mechanic', scryfallTags: ['mill-self'] },
  { key: 'copy_clone', displayName: 'Copy / clone', kind: 'mechanic', scryfallTags: ['copy'] },
  { key: 'tapper', displayName: 'Tapper', kind: 'mechanic', scryfallTags: ['tapper-creature'] },
  { key: 'steal_control', displayName: 'Steal / gain control', kind: 'mechanic', scryfallTags: ['theft', 'control-changing-effects'], exclude: ['reanimate-from-opponent'] },
  { key: 'creature_enters_payoff', displayName: 'Creature-enters payoff', kind: 'mechanic', scryfallTags: ['creaturefall'] },
  { key: 'spellslinger_payoff', displayName: 'Spellslinger payoff', kind: 'mechanic', scryfallTags: ['synergy-instant', 'synergy-sorcery'] },
  { key: 'mill_opponents', displayName: 'Mill opponents', kind: 'mechanic', scryfallTags: ['mill-opponent', 'mill-any'] },
  { key: 'group_hug', displayName: 'Group hug', kind: 'mechanic', scryfallTags: ['group-hug', 'selective-group-hug'] },
  { key: 'free_cast', displayName: 'Free cast / cheat into play', kind: 'mechanic', scryfallTags: ['free-cast-another'] },
  { key: 'cost_reducer', displayName: 'Cost reducer', kind: 'mechanic', scryfallTags: ['cost-reducer'] },
  { key: 'landfall', displayName: 'Landfall', kind: 'mechanic', scryfallTags: ['landfall'] },
  { key: 'treasure_generator', displayName: 'Treasure generator', kind: 'mechanic', scryfallTags: ['repeatable-treasures'] },
  { key: 'blink', displayName: 'Blink', kind: 'mechanic', scryfallTags: ['flicker'] },
]

export const CARD_TAG_KEYS: readonly string[] = CARD_TAGS.map(t => t.key)

// ---------------------------------------------------------------------------
// Scryfall Oracle tag index (built from data/scryfall-tags/oracle-tags.jsonl)
// ---------------------------------------------------------------------------

/** The fields of one line of oracle-tags.jsonl that this module reads. */
export interface ScryfallTagRecord {
  id: string
  slug: string
  type?: string
  child_ids?: string[]
  taggings?: Array<{ oracle_id?: string | null }>
}

export interface ScryfallTagIndex {
  bySlug: Map<string, ScryfallTagRecord>
  byId: Map<string, ScryfallTagRecord>
}

/** Only function ("oracle") tags count. Art ("illustration") tags are ignored. */
export function buildScryfallTagIndex(records: Iterable<ScryfallTagRecord>): ScryfallTagIndex {
  const bySlug = new Map<string, ScryfallTagRecord>()
  const byId = new Map<string, ScryfallTagRecord>()
  for (const r of records) {
    if (r.type && r.type !== 'oracle') continue
    bySlug.set(r.slug, r)
    byId.set(r.id, r)
  }
  return { bySlug, byId }
}

/** Parse the text of oracle-tags.jsonl. Blank lines are skipped. */
export function parseScryfallTagLines(text: string): ScryfallTagRecord[] {
  const out: ScryfallTagRecord[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    out.push(JSON.parse(line) as ScryfallTagRecord)
  }
  return out
}

/** oracle_ids carried by a Scryfall tag, counting every sub-tag (children, recursively). */
export function oracleIdsForScryfallTag(
  index: ScryfallTagIndex,
  slug: string,
  cache: Map<string, Set<string>> = new Map()
): Set<string> {
  const root = index.bySlug.get(slug)
  if (!root) throw new Error(`Scryfall tag "${slug}" is not in the tag data`)
  const cached = cache.get(slug)
  if (cached) return cached
  const out = new Set<string>()
  const seen = new Set<string>()
  const stack = [root]
  while (stack.length) {
    const t = stack.pop()!
    if (seen.has(t.id)) continue
    seen.add(t.id)
    for (const g of t.taggings ?? []) if (g.oracle_id) out.add(g.oracle_id)
    for (const c of t.child_ids ?? []) {
      const child = index.byId.get(c)
      if (child) stack.push(child)
    }
  }
  cache.set(slug, out)
  return out
}

/** Every Scryfall slug the mapping uses (includes and excludes). Used to catch renamed or missing tags. */
export function allMappedScryfallSlugs(defs: readonly CardTagDefinition[] = CARD_TAGS): string[] {
  const s = new Set<string>()
  for (const d of defs) {
    d.scryfallTags.forEach(x => s.add(x))
    d.exclude?.forEach(x => s.add(x))
  }
  return [...s].sort()
}

/** Tag key -> set of oracle_ids that carry it (all cards in the Scryfall data, not yet limited to a library). */
export function computeTagCards(
  index: ScryfallTagIndex,
  defs: readonly CardTagDefinition[] = CARD_TAGS
): Map<string, Set<string>> {
  const cache = new Map<string, Set<string>>()
  const out = new Map<string, Set<string>>()
  for (const d of defs) {
    const cards = new Set<string>()
    for (const slug of d.scryfallTags) for (const id of oracleIdsForScryfallTag(index, slug, cache)) cards.add(id)
    for (const slug of d.exclude ?? []) for (const id of oracleIdsForScryfallTag(index, slug, cache)) cards.delete(id)
    out.set(d.key, cards)
  }
  return out
}

export interface CardTagRow {
  oracle_id: string
  tag_key: string
}

/**
 * The rows to store: one per (oracle_id, Tag) for every card in `library`.
 * Sorted by Tag display order then oracle_id, so two runs over the same input give identical output (idempotent).
 */
export function buildCardTagRows(
  tagCards: Map<string, Set<string>>,
  library: ReadonlySet<string>,
  defs: readonly CardTagDefinition[] = CARD_TAGS
): CardTagRow[] {
  const rows: CardTagRow[] = []
  for (const d of defs) {
    const ids: string[] = []
    for (const id of tagCards.get(d.key) ?? []) if (library.has(id)) ids.push(id)
    ids.sort()
    for (const id of ids) rows.push({ oracle_id: id, tag_key: d.key })
  }
  return rows
}

// ---------------------------------------------------------------------------
// Dry-run report
// ---------------------------------------------------------------------------

export interface CoverageCount {
  cards: number
  withTag: number
  withoutTag: number
  /** Percent of cards with at least one Tag, one decimal. */
  withTagPercent: number
}

export interface DryRunReport {
  scryfallCopyDate: string | null
  totalRows: number
  perTag: Array<{ key: string; displayName: string; kind: CardTagKind; rows: number; collectionCards: number | null }>
  library: CoverageCount
  collection: CoverageCount | null
}

function coverage(cards: ReadonlySet<string>, tagged: ReadonlySet<string>): CoverageCount {
  let withTag = 0
  for (const id of cards) if (tagged.has(id)) withTag++
  const n = cards.size
  return { cards: n, withTag, withoutTag: n - withTag, withTagPercent: n === 0 ? 0 : Math.round((withTag / n) * 1000) / 10 }
}

export function buildDryRunReport(
  rows: readonly CardTagRow[],
  library: ReadonlySet<string>,
  collection: ReadonlySet<string> | null,
  scryfallCopyDate: string | null,
  defs: readonly CardTagDefinition[] = CARD_TAGS
): DryRunReport {
  const perKey = new Map<string, number>()
  const perKeyCollection = new Map<string, number>()
  const tagged = new Set<string>()
  for (const r of rows) {
    perKey.set(r.tag_key, (perKey.get(r.tag_key) ?? 0) + 1)
    tagged.add(r.oracle_id)
    if (collection?.has(r.oracle_id)) perKeyCollection.set(r.tag_key, (perKeyCollection.get(r.tag_key) ?? 0) + 1)
  }
  return {
    scryfallCopyDate,
    totalRows: rows.length,
    perTag: defs.map(d => ({
      key: d.key,
      displayName: d.displayName,
      kind: d.kind,
      rows: perKey.get(d.key) ?? 0,
      collectionCards: collection ? perKeyCollection.get(d.key) ?? 0 : null,
    })),
    library: coverage(library, tagged),
    collection: collection ? coverage(collection, tagged) : null,
  }
}

export function formatDryRunReport(r: DryRunReport): string {
  const lines: string[] = []
  lines.push(`Scryfall tag copy dated: ${r.scryfallCopyDate ?? 'unknown'}`)
  lines.push(`Rows that would be written: ${r.totalRows}`)
  lines.push('')
  lines.push(['Tag'.padEnd(42), 'Kind'.padEnd(9), 'Cards'.padStart(7), r.collection ? 'Collection'.padStart(11) : ''].join(' ').trimEnd())
  for (const t of r.perTag) {
    lines.push([t.displayName.padEnd(42), t.kind.padEnd(9), String(t.rows).padStart(7), t.collectionCards === null ? '' : String(t.collectionCards).padStart(11)].join(' ').trimEnd())
  }
  lines.push('')
  const c = (label: string, v: CoverageCount) =>
    `${label}: ${v.cards} cards, ${v.withTag} with at least one Tag (${v.withTagPercent}%), ${v.withoutTag} with none`
  lines.push(c('All Commander-legal cards', r.library))
  if (r.collection) lines.push(c('Collection', r.collection))
  return lines.join('\n')
}
