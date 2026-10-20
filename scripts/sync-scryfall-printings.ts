/**
 * Sync Scryfall Printings (command line)
 *
 * Downloads Scryfall's "Default Cards" bulk data and upserts it into
 * ref_printings (upserts only, never deletes). The same logic backs the
 * "Refresh card data" button in Settings (src/lib/card-data-sync.ts).
 *
 * Usage:
 *   npm run sync:cards
 *   npx tsx scripts/sync-scryfall-printings.ts           # Sync if Scryfall has newer data
 *   npx tsx scripts/sync-scryfall-printings.ts --dry-run # Preview without writing
 *   npx tsx scripts/sync-scryfall-printings.ts --force   # Re-sync even if current
 */

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { runCardDataSync } from '../src/lib/card-data-sync'

config({ path: '.env.local' })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  console.log('=== Scryfall Printings Sync ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`)

  try {
    const result = await runCardDataSync(createClient(url, key), {
      dryRun,
      force,
      onProgress: (m) => console.log(`  ${m}`),
      onError: (m) => console.error(`  ERROR: ${m}`),
    })

    if (result.skipped) {
      console.log(`\nAlready up to date (last: ${result.syncedAt}). Use --force to re-sync.`)
      return
    }
    console.log('\n=== Summary ===')
    console.log(`Total cards processed: ${result.total.toLocaleString()}`)
    console.log(`Upserted: ${result.upserted.toLocaleString()}`)
    console.log(`Failed: ${result.failed.toLocaleString()}`)
    if (result.failed > 0) {
      console.error(`First error: ${result.firstError}`)
      console.error(`Example ids: ${result.failedIds.join(', ')}`)
      process.exit(1)
    }
    if (result.syncedAt) console.log(`Sync timestamp updated to: ${result.syncedAt}`)
    console.log('\nDone!')
  } catch (error) {
    console.error('Sync failed:', error)
    process.exit(1)
  }
}

main()
