/**
 * Commander Rankings Sync Script
 * 
 * Fetches top commanders by colour identity from EDHREC and updates
 * ref_commanders with edhrec_rank and edhrec_deck_count.
 * 
 * Usage:
 *   npx tsx scripts/sync-commander-rankings.ts
 *   npx tsx scripts/sync-commander-rankings.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import type { Database } from '../src/types/supabase'

// Load env
config({ path: resolve(__dirname, '../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DRY_RUN = process.argv.includes('--dry-run')

// All colour identity slugs to fetch from EDHREC
const COLOR_SLUGS = [
  // Mono
  'mono-white', 'mono-blue', 'mono-black', 'mono-red', 'mono-green', 'colorless',
  // Two-colour
  'azorius', 'dimir', 'rakdos', 'gruul', 'selesnya',
  'orzhov', 'izzet', 'golgari', 'boros', 'simic',
  // Three-colour shards
  'esper', 'grixis', 'jund', 'naya', 'bant',
  // Three-colour wedges
  'abzan', 'jeskai', 'sultai', 'mardu', 'temur',
  // Four-colour
  'yore-tiller', 'glint-eye', 'dune-brood', 'ink-treader', 'witch-maw',
  // Five-colour
  'five-color',
]

interface EdhrecCommander {
  name: string
  num_decks: number
  rank: number
  url: string
}

interface SyncStats {
  fetched: number
  matched: number
  updated: number
  notFound: string[]
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

async function fetchEdhrecCommanders(slug: string): Promise<EdhrecCommander[]> {
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'The-Oracle-Sync/1.0' },
    })
    
    if (!res.ok) {
      log(`  EDHREC returned ${res.status} for ${slug}`)
      return []
    }
    
    const json = await res.json()
    
    // Handle redirects
    if (json.redirect) {
      const redirectSlug = json.redirect.replace('/commanders/', '')
      return fetchEdhrecCommanders(redirectSlug)
    }
    
    const cardlists = json.container?.json_dict?.cardlists
    if (!cardlists || cardlists.length === 0) return []
    
    return cardlists[0]?.cardviews ?? []
  } catch (err) {
    log(`  Error fetching ${slug}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    return []
  }
}

async function syncColorIdentity(slug: string, stats: SyncStats): Promise<void> {
  log(`Fetching ${slug}...`)
  
  const commanders = await fetchEdhrecCommanders(slug)
  if (commanders.length === 0) {
    log(`  No commanders found for ${slug}`)
    return
  }
  
  log(`  Found ${commanders.length} commanders`)
  stats.fetched += commanders.length
  
  // Update each commander in the database
  for (const cmd of commanders) {
    // Try to find matching commander in ref_commanders
    const { data: existing, error: findError } = await supabase
      .from('ref_commanders')
      .select('id, display_name')
      .ilike('display_name', cmd.name)
      .limit(1)
      .maybeSingle()
    
    if (findError) {
      log(`  Error finding ${cmd.name}: ${findError.message}`)
      continue
    }
    
    if (!existing) {
      stats.notFound.push(cmd.name)
      continue
    }
    
    stats.matched++
    
    if (DRY_RUN) {
      log(`  [DRY RUN] Would update ${existing.display_name}: rank=${cmd.rank}, decks=${cmd.num_decks}`)
      continue
    }
    
    // Update the commander with EDHREC data
    const { error: updateError } = await supabase
      .from('ref_commanders')
      .update({
        edhrec_rank: cmd.rank,
        edhrec_deck_count: cmd.num_decks,
        edhrec_synced_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
    
    if (updateError) {
      log(`  Error updating ${existing.display_name}: ${updateError.message}`)
    } else {
      stats.updated++
    }
  }
  
  // Rate limit: 100ms between colour identity fetches
  await new Promise(r => setTimeout(r, 100))
}

async function main() {
  log('=== Commander Rankings Sync ===')
  if (DRY_RUN) log('DRY RUN MODE - no changes will be made')
  
  const stats: SyncStats = {
    fetched: 0,
    matched: 0,
    updated: 0,
    notFound: [],
  }
  
  for (const slug of COLOR_SLUGS) {
    await syncColorIdentity(slug, stats)
  }
  
  log('')
  log('=== Sync Complete ===')
  log(`Fetched: ${stats.fetched} commanders from EDHREC`)
  log(`Matched: ${stats.matched} in ref_commanders`)
  log(`Updated: ${stats.updated} records`)
  
  if (stats.notFound.length > 0) {
    log(`Not found in DB (${stats.notFound.length}): ${stats.notFound.slice(0, 10).join(', ')}${stats.notFound.length > 10 ? '...' : ''}`)
  }
}

main().catch(err => {
  console.error('Sync failed:', err)
  process.exit(1)
})
