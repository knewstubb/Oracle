/**
 * Backfill can_be_commander
 * 
 * Queries Scryfall's is:commander search to get the authoritative list of cards
 * that can be commanders, then updates ref_cards.can_be_commander accordingly.
 * 
 * Usage:
 *   npx tsx scripts/backfill-can-be-commander.ts           # Run backfill
 *   npx tsx scripts/backfill-can-be-commander.ts --dry-run # Preview without writing
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'
const SCRYFALL_SEARCH_API = 'https://api.scryfall.com/cards/search'

// Rate limit: Scryfall asks for 50-100ms between requests
const RATE_LIMIT_MS = 100

interface ScryfallCard {
  name: string
  oracle_id?: string
}

interface ScryfallSearchResponse {
  data: ScryfallCard[]
  has_more: boolean
  next_page?: string
  total_cards: number
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchAllCommanders(): Promise<Set<string>> {
  console.log('Fetching all commanders from Scryfall (is:commander)...')
  
  const commanderNames = new Set<string>()
  let url: string | null = `${SCRYFALL_SEARCH_API}?q=is:commander&unique=cards`
  let page = 1
  
  while (url) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    })
    
    if (!response.ok) {
      throw new Error(`Scryfall API returned ${response.status}: ${response.statusText}`)
    }
    
    const data: ScryfallSearchResponse = await response.json()
    
    if (page === 1) {
      console.log(`Total commanders found: ${data.total_cards}`)
    }
    
    for (const card of data.data) {
      commanderNames.add(card.name)
    }
    
    console.log(`  Page ${page}: ${data.data.length} cards (${commanderNames.size} total)`)
    
    if (data.has_more && data.next_page) {
      url = data.next_page
      page++
      await sleep(RATE_LIMIT_MS)
    } else {
      url = null
    }
  }
  
  return commanderNames
}

async function updateRefCards(commanderNames: Set<string>, dryRun: boolean): Promise<{ updated: number; notFound: number }> {
  console.log('\nUpdating ref_cards...')
  
  // First, reset all to false
  if (!dryRun) {
    const { error: resetError } = await supabase
      .from('ref_cards')
      .update({ can_be_commander: false })
      .neq('name', '')  // Match all rows
    
    if (resetError) {
      throw new Error(`Failed to reset can_be_commander: ${resetError.message}`)
    }
    console.log('Reset all cards to can_be_commander = false')
  }
  
  // Convert set to array for batch processing
  const names = Array.from(commanderNames)
  const BATCH_SIZE = 100
  let updated = 0
  let notFound = 0
  
  for (let i = 0; i < names.length; i += BATCH_SIZE) {
    const batch = names.slice(i, i + BATCH_SIZE)
    
    if (!dryRun) {
      const { data, error } = await supabase
        .from('ref_cards')
        .update({ can_be_commander: true })
        .in('name', batch)
        .select('name')
      
      if (error) {
        console.error(`Batch error: ${error.message}`)
        continue
      }
      
      updated += data?.length || 0
      notFound += batch.length - (data?.length || 0)
    } else {
      // In dry run, just count
      const { data } = await supabase
        .from('ref_cards')
        .select('name')
        .in('name', batch)
      
      updated += data?.length || 0
      notFound += batch.length - (data?.length || 0)
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= names.length) {
      console.log(`  Processed ${Math.min(i + BATCH_SIZE, names.length)} / ${names.length} commanders`)
    }
  }
  
  return { updated, notFound }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  
  console.log('=== Backfill can_be_commander ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('')
  
  try {
    // Fetch all commanders from Scryfall
    const commanderNames = await fetchAllCommanders()
    
    // Update ref_cards
    const result = await updateRefCards(commanderNames, dryRun)
    
    console.log('\n=== Summary ===')
    console.log(`Commanders from Scryfall: ${commanderNames.size}`)
    console.log(`Updated in ref_cards: ${result.updated}`)
    console.log(`Not found in ref_cards: ${result.notFound}`)
    
    // Verify
    if (!dryRun) {
      const { count } = await supabase
        .from('ref_cards')
        .select('*', { count: 'exact', head: true })
        .eq('can_be_commander', true)
      
      console.log(`\nVerification: ${count} cards now have can_be_commander = true`)
    }
    
    console.log('\nDone!')
    
  } catch (error) {
    console.error('Backfill failed:', error)
    process.exit(1)
  }
}

main()
