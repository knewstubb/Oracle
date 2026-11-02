/**
 * One-off, idempotent: flag the commander card on decks that only have decks.commander_name.
 *
 * For each deck with commander_name set and NO flagged commander card, sets is_commander = true on the
 * deck_cards row whose card_name equals commander_name (exact match, main list only, first match by id).
 * Non-destructive: only that one flag is written; nothing is deleted or otherwise changed.
 * Re-running is safe (decks that already have a flagged commander are skipped).
 *
 * Dry run (default, read-only):  npx tsx scripts/backfill-commander-flags.ts
 * Write:                         npx tsx scripts/backfill-commander-flags.ts --apply
 * Env file: .env.local, or point ENV_FILE at another path.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { findCommanderTarget, type FlagRow } from '../src/lib/commander-card-flag'
import { isCommanderRow } from '../src/lib/command-zone'

dotenv.config({ path: process.env.ENV_FILE ?? '.env.local' })

const apply = process.argv.includes('--apply')

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key)

  const { data: decks, error } = await supabase
    .from('decks')
    .select('id, name, commander_name')
    .not('commander_name', 'is', null)
  if (error) throw error

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${decks?.length ?? 0} deck(s) with a commander name`)
  let toFlag = 0
  let flagged = 0
  for (const deck of decks ?? []) {
    const name = (deck.commander_name ?? '').trim() === '' ? null : (deck.commander_name as string)
    if (!name) continue
    const { data: rows, error: rowsErr } = await supabase
      .from('deck_cards')
      .select('id, card_name, categories, is_commander, command_zone_role')
      .eq('deck_id', deck.id)
    if (rowsErr) throw rowsErr
    const cards = (rows ?? []) as FlagRow[]

    if (cards.some((r) => isCommanderRow(r))) {
      console.log(`  skip   #${deck.id} ${deck.name}: already has a flagged commander`)
      continue
    }
    const target = findCommanderTarget(cards, name)
    if (!target) {
      console.log(`  none   #${deck.id} ${deck.name}: no main-list card named "${name}"`)
      continue
    }
    toFlag++
    if (!apply) {
      console.log(`  would  #${deck.id} ${deck.name}: flag card ${target.id} "${target.card_name}" (categories ${target.categories})`)
      continue
    }
    const { error: upErr } = await supabase
      .from('deck_cards')
      .update({ is_commander: true })
      .eq('id', target.id)
      .eq('deck_id', deck.id)
    if (upErr) throw upErr
    flagged++
    console.log(`  done   #${deck.id} ${deck.name}: flagged card ${target.id} "${target.card_name}"`)
  }
  console.log(apply ? `Flagged ${flagged} deck(s).` : `Would flag ${toFlag} deck(s). Re-run with --apply to write.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
