/**
 * Migrate commander taxonomy from existing insights
 * 
 * This script:
 * 1. Reads build_variant from ref_commander_insights
 * 2. Maps build variants to taxonomy slugs
 * 3. Creates junction table entries with relevance scores
 * 
 * Run: npx tsx scripts/migrate-commander-taxonomy.ts
 */

import { createClient } from '@supabase/supabase-js'
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

interface TaxonomyEntry {
  slug: string
  category: string
  edhrec_aliases: string[] | null
}

interface Insight {
  commander_id: string
  build_variant: string | null
}

async function main() {
  console.log('Migrating commander taxonomy from insights...\n')
  
  // 1. Load taxonomy with aliases
  const { data: taxonomyData, error: taxError } = await supabase
    .from('ref_taxonomy')
    .select('slug, category, edhrec_aliases')
  
  if (taxError) {
    console.error('Error loading taxonomy:', taxError)
    process.exit(1)
  }
  
  const taxonomy = taxonomyData as TaxonomyEntry[]
  console.log(`Loaded ${taxonomy.length} taxonomy entries`)
  
  // Build reverse lookup: alias -> slug
  const aliasToSlug = new Map<string, string>()
  for (const entry of taxonomy) {
    if (entry.edhrec_aliases) {
      for (const alias of entry.edhrec_aliases) {
        aliasToSlug.set(alias.toLowerCase(), entry.slug)
      }
    }
    // Also map the slug itself
    aliasToSlug.set(entry.slug.toLowerCase(), entry.slug)
  }
  
  console.log(`Built alias map with ${aliasToSlug.size} entries`)
  
  // 2. Load insights with build_variant
  const { data: insights, error: insightError } = await supabase
    .from('ref_commander_insights')
    .select('commander_id, build_variant')
    .not('build_variant', 'is', null)
  
  if (insightError) {
    console.error('Error loading insights:', insightError)
    process.exit(1)
  }
  
  console.log(`Loaded ${insights?.length || 0} insights with build_variant`)
  
  // 3. Aggregate by commander - count occurrences of each build_variant
  const commanderVariants = new Map<string, Map<string, number>>()
  
  for (const insight of insights || []) {
    if (!insight.build_variant) continue
    
    if (!commanderVariants.has(insight.commander_id)) {
      commanderVariants.set(insight.commander_id, new Map())
    }
    const variants = commanderVariants.get(insight.commander_id)!
    variants.set(insight.build_variant, (variants.get(insight.build_variant) || 0) + 1)
  }
  
  console.log(`Found ${commanderVariants.size} commanders with build variants`)
  
  // 4. Build junction table entries
  const junctionEntries: Array<{
    commander_id: string
    taxonomy_slug: string
    relevance: 'primary' | 'secondary' | 'minor'
    source: string
    confidence: number
  }> = []
  
  let mappedCount = 0
  let unmappedVariants = new Set<string>()
  
  for (const [commanderId, variants] of commanderVariants) {
    // Sort variants by count (most frequent first)
    const sorted = Array.from(variants.entries()).sort((a, b) => b[1] - a[1])
    
    for (let i = 0; i < sorted.length; i++) {
      const [variant, count] = sorted[i]
      const slug = aliasToSlug.get(variant.toLowerCase())
      
      if (slug) {
        // Relevance based on position in sorted list
        const relevance = i === 0 ? 'primary' : i < 3 ? 'secondary' : 'minor'
        
        junctionEntries.push({
          commander_id: commanderId,
          taxonomy_slug: slug,
          relevance,
          source: 'ai',
          confidence: Math.min(0.95, 0.6 + (count * 0.1)), // Higher confidence with more mentions
        })
        mappedCount++
      } else {
        unmappedVariants.add(variant)
      }
    }
  }
  
  console.log(`\nCreated ${junctionEntries.length} taxonomy mappings`)
  console.log(`Mapped ${mappedCount} variant references`)
  
  if (unmappedVariants.size > 0) {
    console.log(`\nUnmapped variants (${unmappedVariants.size}):`)
    const sorted = Array.from(unmappedVariants).sort()
    for (const variant of sorted.slice(0, 20)) {
      console.log(`  - ${variant}`)
    }
    if (sorted.length > 20) {
      console.log(`  ... and ${sorted.length - 20} more`)
    }
  }
  
  // 5. Insert in batches
  if (junctionEntries.length === 0) {
    console.log('\nNo entries to insert.')
    return
  }
  
  const BATCH_SIZE = 500
  let inserted = 0
  
  for (let i = 0; i < junctionEntries.length; i += BATCH_SIZE) {
    const batch = junctionEntries.slice(i, i + BATCH_SIZE)
    
    const { error } = await supabase
      .from('ref_commander_taxonomy')
      .upsert(batch, { 
        onConflict: 'commander_id,taxonomy_slug',
        ignoreDuplicates: false 
      })
    
    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error)
    } else {
      inserted += batch.length
      process.stdout.write(`\rInserted ${inserted}/${junctionEntries.length}`)
    }
  }
  
  console.log(`\n\nMigration complete!`)
  console.log(`  - Total mappings: ${inserted}`)
  console.log(`  - Unmapped variants: ${unmappedVariants.size}`)
}

main().catch(console.error)
