/**
 * Apply the default_category column migration.
 * Run: npx tsx scripts/apply-category-migration.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('Checking if default_category column exists...')
  
  // Try to select the column - if it errors, column doesn't exist
  const { error: checkErr } = await supabase
    .from('card_metadata')
    .select('default_category')
    .limit(1)
  
  if (!checkErr) {
    console.log('Column already exists!')
    return
  }
  
  if (checkErr.code === '42703') {
    console.log('Column does not exist. Please add it via Supabase dashboard SQL editor:')
    console.log('')
    console.log('  ALTER TABLE card_metadata ADD COLUMN IF NOT EXISTS default_category JSONB;')
    console.log('')
    console.log('Then re-run the classification script.')
  } else {
    console.error('Unexpected error:', checkErr)
  }
}

main().catch(console.error)
