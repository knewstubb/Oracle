/**
 * Supabase-backed identity resolution for ManaBox imports.
 *
 * Implements the ManaBoxResolver contract from `manabox-import.ts` against the
 * `ref_printings` reference table. Set codes are normalised to lower case
 * before any lookup (contract §5.4).
 */

import { createAdminClient } from '@/lib/supabase'
import type { ManaBoxCardFacts, ManaBoxResolver } from '@/lib/manabox-import'
import { mapScryfallFinishes } from '@/lib/import-copies'
import { nameLookupVariants, pickDefaultPrinting, type PrintingCandidate } from '@/lib/default-printing'

interface PrintingRow {
  oracle_id: string
  scryfall_id: string
  name: string
  set_code: string
  set_name?: string | null
  collector_number: string
  released_at?: string | null
  digital?: boolean | null
  layout: string | null
  type_line: string | null
  finishes?: string[] | null
}

const PRINTING_COLUMNS =
  'oracle_id, scryfall_id, name, set_code, set_name, collector_number, released_at, digital, layout, type_line, finishes'


/** Lower-case and trim a ManaBox set code before a database lookup. */
export function normalizeSetCode(setCode: string): string {
  return setCode.trim().toLowerCase()
}

function toFacts(row: PrintingRow): ManaBoxCardFacts {
  return {
    oracleId: row.oracle_id,
    scryfallId: row.scryfall_id,
    cardName: row.name,
    setCode: row.set_code,
    collectorNumber: row.collector_number,
    layout: row.layout,
    typeLine: row.type_line,
    availableFinishes: mapScryfallFinishes(row.finishes),
  }
}

/** Escape the characters `ilike` treats as patterns, so a card name is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * Build a resolver backed by `ref_printings`. Results are cached for the life
 * of the resolver so a preview that repeats a printing does one query.
 *
 * `userId` (the signed-in user) lets a plain-name lookup prefer a printing the
 * owner already owns. It is only ever used for reads.
 */
export function createSupabaseManaBoxResolver(options: { userId?: string } = {}): ManaBoxResolver {
  const byScryfallId = new Map<string, ManaBoxCardFacts | null>()
  const bySetCollector = new Map<string, ManaBoxCardFacts | null>()
  const byName = new Map<string, ManaBoxCardFacts | null>()
  const supabase = createAdminClient()

  /**
   * Every printing whose stored name matches. An exact match uses the name index (fast); the
   * slower case-insensitive and "Front // ..." searches run only when that finds nothing, and a
   * failure there (e.g. a database timeout) counts as "no match" rather than failing the whole preview.
   */
  async function printingsNamed(typed: string): Promise<PrintingRow[]> {
    const { exact, frontFace } = nameLookupVariants(typed)
    const front = frontFace ?? exact
    const select = () => supabase.from('ref_printings').select(PRINTING_COLUMNS)
    const searches = [
      { run: () => select().eq('name', exact).order('released_at', { ascending: false }).limit(1000), tolerant: false },
      { run: () => select().ilike('name', escapeLike(exact)).order('released_at', { ascending: false }).limit(1000), tolerant: true },
      { run: () => select().ilike('name', `${escapeLike(front)} // %`).order('released_at', { ascending: false }).limit(1000), tolerant: true },
    ]
    for (const { run, tolerant } of searches) {
      const { data, error } = await run()
      if (error) {
        if (tolerant) continue
        throw new Error(`Failed to look up "${typed}": ${error.message}`)
      }
      if (data && data.length > 0) return data as unknown as PrintingRow[]
    }
    return []
  }

  /** How many real (non-proxy) copies the owner has of each printing of these cards. */
  async function ownedCounts(oracleIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (!options.userId || oracleIds.length === 0) return counts
    const { data: cards, error: cardsError } = await supabase
      .from('user_cards')
      .select('id')
      .eq('user_id', options.userId)
      .in('oracle_id', oracleIds)
    if (cardsError) throw new Error(`Failed to read owned cards: ${cardsError.message}`)
    const ids = (cards ?? []).map((c) => c.id)
    if (ids.length === 0) return counts
    const { data: copies, error: copiesError } = await supabase
      .from('user_copies')
      .select('printing_id')
      .eq('user_id', options.userId)
      .eq('is_proxy', false)
      .in('card_id', ids)
    if (copiesError) throw new Error(`Failed to read owned copies: ${copiesError.message}`)
    for (const copy of copies ?? []) {
      if (copy.printing_id) counts.set(copy.printing_id, (counts.get(copy.printing_id) ?? 0) + 1)
    }
    return counts
  }

  return {
    async resolveByName(name: string, opts?: { setCode?: string }): Promise<ManaBoxCardFacts | null> {
      const set = opts?.setCode ? normalizeSetCode(opts.setCode) : ''
      const key = `${nameLookupVariants(name).exact.toLowerCase()}|${set}`
      if (byName.has(key)) return byName.get(key) ?? null

      let rows = await printingsNamed(name)
      if (set) rows = rows.filter((r) => r.set_code === set)

      // Identity is the card (oracle_id), never a printing id: the name finds the card, and the
      // printing is only a default chosen below.
      const candidates: PrintingCandidate[] = rows.map((r) => ({
        scryfallId: r.scryfall_id,
        oracleId: r.oracle_id,
        name: r.name,
        setCode: r.set_code,
        setName: r.set_name ?? '',
        collectorNumber: r.collector_number,
        layout: r.layout,
        releasedAt: r.released_at ?? null,
        digital: r.digital ?? null,
      }))
      const owned = await ownedCounts([...new Set(candidates.map((c) => c.oracleId))])
      const picked = pickDefaultPrinting(candidates, owned)
      const facts = picked ? toFacts(rows.find((r) => r.scryfall_id === picked.scryfallId) as PrintingRow) : null
      byName.set(key, facts)
      return facts
    },

    async resolveByScryfallId(scryfallId: string): Promise<ManaBoxCardFacts | null> {
      const key = scryfallId.trim()
      if (byScryfallId.has(key)) return byScryfallId.get(key) ?? null

      const { data, error } = await supabase
        .from('ref_printings')
        .select(PRINTING_COLUMNS)
        .eq('scryfall_id', key)
        .limit(1)

      if (error) {
        throw new Error(`Failed to resolve printing ${key}: ${error.message}`)
      }

      const facts = data && data.length > 0 ? toFacts(data[0] as PrintingRow) : null
      byScryfallId.set(key, facts)
      return facts
    },

    async resolveBySetCollector(
      setCode: string,
      collectorNumber: string
    ): Promise<ManaBoxCardFacts | null> {
      const set = normalizeSetCode(setCode)
      const collector = collectorNumber.trim()
      const key = `${set}|${collector}`
      if (bySetCollector.has(key)) return bySetCollector.get(key) ?? null

      const find = async (num: string): Promise<ManaBoxCardFacts | null> => {
        const { data, error } = await supabase
          .from('ref_printings')
          .select(PRINTING_COLUMNS)
          .eq('set_code', set)
          .eq('collector_number', num)
          .limit(1)
        if (error) {
          throw new Error(`Failed to resolve printing ${set}/${num}: ${error.message}`)
        }
        return data && data.length > 0 ? toFacts(data[0] as PrintingRow) : null
      }
      let facts = await find(collector)
      // Some lists add a face letter ("2129a" for the front of a two-faced card); Scryfall numbers the card "2129".
      const bare = /^(\d+)[a-z]$/i.exec(collector)?.[1]
      if (!facts && bare) facts = await find(bare)
      bySetCollector.set(key, facts)
      return facts
    },
  }
}
