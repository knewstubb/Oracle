/**
 * Export cards needing classification with their oracle text (from mtg_cards).
 * Run: npx tsx scripts/export-cards-with-oracle-text.ts > cards-with-text.json
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
  // Get cards needing classification from card_metadata
  const cardsToClassify: string[] = []
  let offset = 0
  const PAGE = 1000
  
  console.error('Fetching cards needing classification...')
  
  while (true) {
    const { data, error } = await supabase
      .from('card_metadata')
      .select('card_name')
      .not('type_line', 'is', null)
      .is('default_category', null)
      .range(offset, offset + PAGE - 1)
    
    if (error) {
      console.error('Error:', error.message)
      break
    }
    if (!data || data.length === 0) break
    
    cardsToClassify.push(...data.map(d => d.card_name))
    if (data.length < PAGE) break
    offset += PAGE
  }
  
  console.error(`Found ${cardsToClassify.length} cards needing classification`)
  
  // Fetch oracle text from mtg_cards in batches
  const results: { card_name: string; type_line: string; oracle_text: string }[] = []
  const batchSize = 100
  
  for (let i = 0; i < cardsToClassify.length; i += batchSize) {
    const batch = cardsToClassify.slice(i, i + batchSize)
    
    const { data: mtgData, error: mtgErr } = await supabase
      .from('ref_cards')
      .select('name, type_line, oracle_text')
      .in('name', batch)
    
    if (mtgErr) {
      console.error(`Batch ${i} error:`, mtgErr.message)
      continue
    }
    
    if (mtgData) {
      for (const card of mtgData) {
        results.push({
          card_name: card.name,
          type_line: card.type_line || '',
          oracle_text: card.oracle_text || ''
        })
      }
    }
    
    console.error(`Fetched ${Math.min(i + batchSize, cardsToClassify.length)}/${cardsToClassify.length}`)
  }
  
  console.error(`\nExporting ${results.length} cards with oracle text`)
  console.log(JSON.stringify(results, null, 2))
}

main()
