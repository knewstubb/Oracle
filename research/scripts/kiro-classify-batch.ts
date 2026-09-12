/**
 * Apply Kiro-generated card classifications to the database.
 * 
 * This script reads a JSON file of classifications and applies them to card_metadata.
 * 
 * Usage:
 *   npx tsx scripts/kiro-classify-batch.ts classifications.json [--dry-run]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface Classification {
  card_name: string
  primary: string
  secondary?: string[]
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filePath = args.find(a => !a.startsWith('--'))

  if (!filePath) {
    console.error('Usage: npx tsx scripts/kiro-classify-batch.ts <classifications.json> [--dry-run]')
    process.exit(1)
  }

  console.log(`=== Kiro Classification Batch Apply ===`)
  console.log(`File: ${filePath}`)
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log('')

  // Read classifications file
  const raw = readFileSync(filePath, 'utf-8')
  const classifications: Classification[] = JSON.parse(raw)

  console.log(`Loaded ${classifications.length} classifications`)

  // Validate and transform
  const rows = classifications.map(c => ({
    card_name: c.card_name,
    default_category: {
      primary: c.primary,
      secondary: c.secondary || [],
      confidence: c.confidence,
      notes: c.notes
    }
  }))

  // Category distribution
  const catCounts = new Map<string, number>()
  for (const c of classifications) {
    catCounts.set(c.primary, (catCounts.get(c.primary) || 0) + 1)
  }
  
  console.log('\n=== Category Distribution ===')
  for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would update these cards:')
    for (const r of rows.slice(0, 20)) {
      const cat = r.default_category as { primary: string; secondary: string[] }
      const sec = cat.secondary.length ? ` [+${cat.secondary.join(', ')}]` : ''
      console.log(`  ${r.card_name}: ${cat.primary}${sec}`)
    }
    if (rows.length > 20) {
      console.log(`  ... and ${rows.length - 20} more`)
    }
    return
  }

  // Write to database in batches
  console.log('\nWriting to card_metadata...')
  const BATCH = 100
  let updated = 0
  let failed = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    
    const { error } = await supabase
      .from('card_metadata')
      .upsert(batch, { onConflict: 'card_name' })

    if (error) {
      console.error(`Batch ${i} failed:`, error.message)
      failed += batch.length
    } else {
      updated += batch.length
    }

    if ((i + BATCH) % 500 === 0 || i + BATCH >= rows.length) {
      console.log(`Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
    }
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`)
}

main().catch(console.error)
