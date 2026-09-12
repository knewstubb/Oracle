/**
 * Apply Kiro's card classifications to the database.
 * This script reads a JSON file of classifications and updates card_metadata.
 * 
 * Run: npx tsx scripts/kiro-classify-cards.ts classifications.json
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

interface Classification {
  card_name: string
  primary: string
  secondary: string[]
  confidence: 'high' | 'medium' | 'low'
  notes?: string
}

async function main() {
  const inputFile = process.argv[2]
  if (!inputFile) {
    console.error('Usage: npx tsx scripts/kiro-classify-cards.ts <classifications.json>')
    process.exit(1)
  }

  const classifications: Classification[] = JSON.parse(readFileSync(inputFile, 'utf-8'))
  console.log(`Loaded ${classifications.length} classifications`)

  // Batch upsert in chunks of 100
  const BATCH_SIZE = 100
  let updated = 0

  for (let i = 0; i < classifications.length; i += BATCH_SIZE) {
    const batch = classifications.slice(i, i + BATCH_SIZE)
    
    const rows = batch.map(c => ({
      card_name: c.card_name,
      default_category: {
        primary: c.primary,
        secondary: c.secondary,
        confidence: c.confidence,
        notes: c.notes
      }
    }))

    const { error } = await supabase
      .from('card_metadata')
      .upsert(rows, { onConflict: 'card_name' })

    if (error) {
      console.error(`Batch ${i} failed:`, error.message)
    } else {
      updated += batch.length
      console.log(`Updated ${Math.min(i + BATCH_SIZE, classifications.length)}/${classifications.length}`)
    }
  }

  console.log(`\nDone! Updated ${updated} cards`)
}

main().catch(console.error)
