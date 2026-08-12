/**
 * Sync keywords from Scryfall bulk data to ref_cards
 * 
 * This script:
 * 1. Reads the AllPrintings SQLite database
 * 2. Extracts unique keywords per card name
 * 3. Updates ref_cards.keywords[]
 * 
 * Run: npx tsx scripts/sync-card-keywords.ts
 */

import { createClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Path to AllPrintings SQLite
const SQLITE_PATH = resolve(__dirname, '../data/AllPrintings.sqlite')

interface CardKeywords {
  name: string
  keywords: string[]
}

async function main() {
  console.log('Syncing card keywords from Scryfall data...\n')
  
  // Open SQLite database
  const db = new Database(SQLITE_PATH, { readonly: true })
  
  // Query unique cards with keywords
  // The 'cards' table has a 'keywords' column as comma-separated string
  const query = `
    SELECT DISTINCT 
      name,
      keywords
    FROM cards
    WHERE keywords IS NOT NULL AND keywords != ''
  `
  
  const rows = db.prepare(query).all() as Array<{ name: string; keywords: string }>
  console.log(`Found ${rows.length} cards with keywords in SQLite`)
  
  // Parse keywords and dedupe by card name (taking union of all printings)
  const cardKeywords = new Map<string, Set<string>>()
  
  for (const row of rows) {
    const keywords = row.keywords.split(',').map(k => k.trim()).filter(Boolean)
    if (keywords.length === 0) continue
    
    if (!cardKeywords.has(row.name)) {
      cardKeywords.set(row.name, new Set())
    }
    for (const kw of keywords) {
      cardKeywords.get(row.name)!.add(kw)
    }
  }
  
  console.log(`Processed ${cardKeywords.size} unique cards with keywords`)
  
  // Convert to array format for batch update
  const updates: CardKeywords[] = []
  for (const [name, kwSet] of cardKeywords) {
    updates.push({
      name,
      keywords: Array.from(kwSet).sort(),
    })
  }
  
  // Show sample
  console.log('\nSample keywords:')
  for (const card of updates.slice(0, 5)) {
    console.log(`  ${card.name}: [${card.keywords.join(', ')}]`)
  }
  
  // Update using parallel batch requests (much faster)
  const BATCH_SIZE = 50  // Parallel requests per batch
  const CONCURRENCY = 10  // Max concurrent requests
  let updated = 0
  let errors = 0
  
  console.log(`\nUpdating ref_cards with ${CONCURRENCY} concurrent requests...`)
  
  for (let i = 0; i < updates.length; i += BATCH_SIZE * CONCURRENCY) {
    const superBatch = updates.slice(i, i + BATCH_SIZE * CONCURRENCY)
    
    // Process in parallel
    const results = await Promise.allSettled(
      superBatch.map(card => 
        supabase
          .from('ref_cards')
          .update({ keywords: card.keywords })
          .eq('name', card.name)
      )
    )
    
    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.error) {
        updated++
      } else {
        errors++
      }
    }
    
    process.stdout.write(`\rProcessed ${Math.min(i + superBatch.length, updates.length)}/${updates.length} (${updated} updated, ${errors} errors)`)
  }
  
  console.log(`\n\nSync complete!`)
  console.log(`  - Cards processed: ${updates.length}`)
  console.log(`  - Cards updated: ${updated}`)
  console.log(`  - Errors: ${errors}`)
  
  db.close()
}

main().catch(console.error)
