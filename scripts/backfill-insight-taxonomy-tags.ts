/**
 * Backfill taxonomy_tags on existing insights from their build_variant
 * 
 * Run: npx tsx scripts/backfill-insight-taxonomy-tags.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('Backfilling taxonomy_tags on insights...\n')
  
  // 1. Load taxonomy with aliases
  const { data: taxonomy, error: taxError } = await supabase
    .from('ref_taxonomy')
    .select('slug, edhrec_aliases')
  
  if (taxError) {
    console.error('Error loading taxonomy:', taxError)
    process.exit(1)
  }
  
  // Build alias -> slug map
  const aliasToSlug = new Map<string, string>()
  for (const entry of taxonomy || []) {
    aliasToSlug.set(entry.slug.toLowerCase(), entry.slug)
    if (entry.edhrec_aliases) {
      for (const alias of entry.edhrec_aliases) {
        aliasToSlug.set(alias.toLowerCase(), entry.slug)
      }
    }
  }
  
  console.log(`Loaded ${aliasToSlug.size} alias mappings`)
  
  // 2. Load insights with build_variant but no taxonomy_tags
  const { data: insights, error: insightError } = await supabase
    .from('ref_commander_insights')
    .select('id, build_variant')
    .not('build_variant', 'is', null)
    .is('taxonomy_tags', null)
  
  if (insightError) {
    console.error('Error loading insights:', insightError)
    process.exit(1)
  }
  
  console.log(`Found ${insights?.length || 0} insights to backfill`)
  
  // 3. Map and update
  let updated = 0
  let unmapped = new Set<string>()
  
  for (const insight of insights || []) {
    const slug = aliasToSlug.get(insight.build_variant.toLowerCase())
    
    if (slug) {
      const { error } = await supabase
        .from('ref_commander_insights')
        .update({ taxonomy_tags: [slug] })
        .eq('id', insight.id)
      
      if (!error) updated++
    } else {
      unmapped.add(insight.build_variant)
    }
  }
  
  console.log(`\nBackfill complete!`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Unmapped variants: ${unmapped.size}`)
  
  if (unmapped.size > 0) {
    console.log(`  Unmapped:`, Array.from(unmapped).join(', '))
  }
}

main()
