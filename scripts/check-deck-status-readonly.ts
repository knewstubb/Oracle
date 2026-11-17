/**
 * READ-ONLY check: for every deck, the automatic status agrees with the "(N sleeved)" count.
 * Only `select` calls are made. Nothing is inserted, updated, deleted or called as a function.
 *
 * Run:  ENV_FILE=/path/to/.env.local npx tsx scripts/check-deck-status-readonly.ts
 * Exits 1 if any deck's status disagrees with its counts.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { computeSleevedCounts, computeDeckStatuses, isCountableCard, type DeckCardRow } from '../src/lib/deck-list-data'
import { computeDeckReadiness } from '../src/lib/deck-readiness'
import { deckTargetFor } from '../src/lib/format-config'

config({ path: process.env.ENV_FILE ?? resolve(__dirname, '../.env.local') })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function readAll<T>(table: string, columns: string, order: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(order).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as unknown as T[]))
    if ((data ?? []).length < 1000) return out
  }
}

async function main() {
  const decks = await readAll<{ id: number; name: string; format: string | null; user_id: string }>('decks', 'id, name, format, user_id', 'id')
  const rows = await readAll<DeckCardRow>('deck_cards', 'id, deck_id, card_name, copy_id, categories, is_generic, generic_sleeved', 'id')
  const formats = new Map(decks.map((d) => [d.id, d.format]))
  const sleevedByDeck = computeSleevedCounts(rows) // the tile's "(N sleeved)" rule
  const statuses = computeDeckStatuses(rows, formats)
  let bad = 0
  console.log('name | format | listed | sleeved | status')
  for (const d of decks) {
    const listed = rows.filter((r) => r.deck_id === d.id && isCountableCard(r.categories)).length
    const sleeved = sleevedByDeck[d.id] ?? 0
    const status = statuses[d.id]
    const t = deckTargetFor(d.format)
    const again = computeDeckReadiness(rows.filter((r) => r.deck_id === d.id && isCountableCard(r.categories)), t.deckSize, t.countRule)
    const eligible = again.sleeved === listed && listed > 0 && (t.deckSize === null || t.countRule === null || (t.countRule === 'exact' ? listed === t.deckSize : listed >= t.deckSize))
    const ok =
      again.sleeved === sleeved &&
      (status === 'draft' ? sleeved === 0 : status === 'playable' ? sleeved === listed && eligible : sleeved > 0 && !eligible)
    if (!ok) bad++
    console.log(`${d.name} | ${d.format ?? 'commander'} | ${listed} | ${sleeved} | ${status}${ok ? '' : '   <-- DISAGREES'}`)
  }
  console.log(`${decks.length} decks checked, ${bad} disagreement(s).`)
  if (bad > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
