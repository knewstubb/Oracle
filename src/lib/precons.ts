/**
 * Precon helpers shared by the sync script, the /api/precons routes and the Precon tab.
 * Pure: no database, no network. Brief: docs/oracle/briefs/import-cleanup.md section 6a.
 */

/** One distinct printing in a precon's stored card list. */
export interface PreconCard {
  name: string
  /** Lower-case set code. */
  set_code: string
  /** Collector number. */
  number: string
  foil: boolean
  count: number
  /** True for the commander card(s). */
  commander: boolean
}

export interface PreconListItem {
  id: string
  name: string
  set_code: string
  set_name: string
  commander_name: string | null
  color_identity: string | null
  release_date: string | null
  card_count: number
  commander_image: string | null
}

export interface PreconDetail extends PreconListItem {
  cards: PreconCard[]
}

/** The shape of the community dataset's card entries (taw/magic-preconstructed-decks-data). */
interface RawDatasetCard {
  name?: string
  set_code?: string
  number?: string
  foil?: boolean
  count?: number
}

/**
 * Build the stored list from the dataset: main deck plus commander(s), commander flagged,
 * same printing + finish merged into one entry. The sideboard is not stored.
 */
export function buildStoredCards(deck: {
  cards?: RawDatasetCard[]
  commander?: RawDatasetCard[]
}): PreconCard[] {
  const merged = new Map<string, PreconCard>()
  const add = (c: RawDatasetCard, commander: boolean) => {
    if (!c.name || !c.set_code || !c.number) return
    const count = Number.isFinite(c.count) && (c.count as number) > 0 ? (c.count as number) : 1
    const entry: PreconCard = {
      name: c.name,
      set_code: c.set_code.toLowerCase(),
      number: String(c.number),
      foil: c.foil === true,
      count,
      commander,
    }
    const key = `${entry.set_code}|${entry.number}|${entry.foil}|${commander}`
    const existing = merged.get(key)
    if (existing) existing.count += count
    else merged.set(key, entry)
  }
  for (const c of deck.commander ?? []) add(c, true)
  for (const c of deck.cards ?? []) add(c, false)
  return [...merged.values()]
}

export function preconCardCount(cards: PreconCard[]): number {
  return cards.reduce((sum, c) => sum + c.count, 0)
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * A ManaBox-style CSV for the existing import preview. Every card carries set code, collector
 * number, finish and quantity, so the preview looks each printing up exactly (no Scryfall id is
 * known from the dataset, so that column is empty and set + collector number are used).
 */
export function preconCardsToCsv(cards: PreconCard[]): string {
  const header = [
    'Name',
    'Set code',
    'Set name',
    'Collector number',
    'Foil',
    'Rarity',
    'Quantity',
    'ManaBox ID',
    'Scryfall ID',
    'Purchase price',
    'Misprint',
    'Altered',
    'Condition',
    'Language',
    'Purchase price currency',
  ]
  const lines = [header.join(',')]
  for (const c of cards) {
    lines.push(
      [
        csvCell(c.name),
        csvCell(c.set_code),
        '',
        csvCell(c.number),
        c.foil ? 'foil' : 'normal',
        '',
        String(c.count),
        '',
        '',
        '',
        'false',
        'false',
        '',
        '',
        '',
      ].join(',')
    )
  }
  return lines.join('\n') + '\n'
}

/** The commander to preselect in the review (first flagged card), by name. */
export function preconCommanderName(cards: PreconCard[], fallback: string | null): string | null {
  return cards.find((c) => c.commander)?.name ?? fallback
}

/** Small commander art from a Scryfall id (the id's first two characters make the path). */
export function commanderImageUrl(scryfallId: string | null | undefined): string | null {
  if (!scryfallId || scryfallId.length < 2) return null
  return `https://cards.scryfall.io/art_crop/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`
}

/** True when a database error means the cards column / table is not there yet (migration not applied). */
export function isPreconsNotSetUp(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const code = error.code ?? ''
  if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205') return true
  return /column .*cards.* does not exist|ref_precons.*(does not exist|schema cache)/i.test(error.message ?? '')
}

/** Keeps a search term safe inside a PostgREST `or`/`ilike` filter. */
export function sanitizePreconSearch(q: string): string {
  return q.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
}

/** The name for the review: the deck name, so the owner sees what they picked. */
export function preconFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
  return `${safe || 'Precon'}.csv`
}
