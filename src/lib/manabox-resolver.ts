/**
 * Supabase-backed identity resolution for ManaBox imports.
 *
 * Implements the ManaBoxResolver contract from `manabox-import.ts` against the
 * `ref_printings` reference table. Set codes are normalised to lower case
 * before any lookup (contract §5.4).
 */

import { createAdminClient } from '@/lib/supabase'
import type { ManaBoxCardFacts, ManaBoxResolver } from '@/lib/manabox-import'

interface PrintingRow {
  oracle_id: string
  scryfall_id: string
  name: string
  set_code: string
  layout: string | null
  type_line: string | null
}

const PRINTING_COLUMNS = 'oracle_id, scryfall_id, name, set_code, layout, type_line'

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
    layout: row.layout,
    typeLine: row.type_line,
  }
}

/**
 * Build a resolver backed by `ref_printings`. Results are cached for the life
 * of the resolver so a preview that repeats a printing does one query.
 */
export function createSupabaseManaBoxResolver(): ManaBoxResolver {
  const byScryfallId = new Map<string, ManaBoxCardFacts | null>()
  const bySetCollector = new Map<string, ManaBoxCardFacts | null>()
  const supabase = createAdminClient()

  return {
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

      const { data, error } = await supabase
        .from('ref_printings')
        .select(PRINTING_COLUMNS)
        .eq('set_code', set)
        .eq('collector_number', collector)
        .limit(1)

      if (error) {
        throw new Error(
          `Failed to resolve printing ${set}/${collector}: ${error.message}`
        )
      }

      const facts = data && data.length > 0 ? toFacts(data[0] as PrintingRow) : null
      bySetCollector.set(key, facts)
      return facts
    },
  }
}
