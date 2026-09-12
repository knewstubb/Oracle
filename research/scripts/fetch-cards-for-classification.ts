/**
 * Fetch cards needing classification and output as JSON.
 * Run: npx tsx scripts/fetch-cards-for-classification.ts > cards-to-classify.json
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  const allCards: { card_name: string; type_line: string }[] = []
  let offset = 0
  const PAGE = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('card_metadata')
      .select('card_name, type_line')
      .not('type_line', 'is', null)
      .is('default_category', null)
      .range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('Error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    
    allCards.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  
  console.log(JSON.stringify(allCards, null, 2))
}

main()
