/**
 * Fetch YouTube Transcripts for Commanders Missing Insights
 * 
 * Searches YouTube for commander deck tech videos and extracts transcripts
 * to feed into the insight distillation pipeline.
 * 
 * Prerequisites:
 *   npm install youtube-transcript youtubei.js
 * 
 * Usage:
 *   npx tsx scripts/fetch-youtube-transcripts.ts
 *   npx tsx scripts/fetch-youtube-transcripts.ts --limit 10
 *   npx tsx scripts/fetch-youtube-transcripts.ts --commander "Muldrotha"
 *   npx tsx scripts/fetch-youtube-transcripts.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load env
config({ path: resolve(__dirname, '../../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Parse CLI args
const args = process.argv.slice(2)
const commanderFilter = args.includes('--commander')
  ? args[args.indexOf('--commander') + 1]
  : null
const limitArg = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : 20
const dryRun = args.includes('--dry-run')
const verbose = args.includes('--verbose')

interface Commander {
  id: string
  display_name: string
  color_identity: string
  edhrec_rank: number | null
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`)
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Get commanders that don't have any insights yet
 * Prioritized by EDHREC rank (most popular first)
 */
async function getCommandersWithoutInsights(limit: number): Promise<Commander[]> {
  // Get all commander IDs that have insights
  const { data: insightCommanders } = await supabase
    .from('ref_commander_insights')
    .select('commander_id')
  
  const hasInsights = new Set((insightCommanders ?? []).map(r => r.commander_id))
  
  // Get commanders without insights, ordered by popularity
  let query = supabase
    .from('ref_commanders')
    .select('id, display_name, color_identity, edhrec_rank')
    .eq('legal_commander', true)
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
    .limit(limit * 2) // Fetch extra since we'll filter
  
  if (commanderFilter) {
    query = query.ilike('display_name', `%${commanderFilter}%`)
  }
  
  const { data: commanders, error } = await query
  
  if (error) {
    throw new Error(`Failed to fetch commanders: ${error.message}`)
  }
  
  // Filter out those with insights and limit
  const filtered = (commanders ?? [])
    .filter(c => !hasInsights.has(c.id))
    .slice(0, limit)
  
  return filtered
}

/**
 * Search YouTube for deck tech videos (uses youtube-transcript package)
 * Returns video IDs for a commander
 */
async function searchYouTube(commanderName: string): Promise<string[]> {
  // Use youtubei.js for searching (no API key required)
  try {
    const { Innertube } = await import('youtubei.js')
    const youtube = await Innertube.create()
    
    const searchQuery = `${commanderName} commander deck tech edh`
    const results = await youtube.search(searchQuery, { type: 'video' })
    
    // Get first 3 relevant videos
    const videoIds: string[] = []
    for (const item of results.videos.slice(0, 3)) {
      if (item.id) {
        videoIds.push(item.id)
      }
    }
    
    return videoIds
  } catch (err) {
    log(`  YouTube search failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    return []
  }
}

/**
 * Fetch transcript for a YouTube video
 */
async function fetchTranscript(videoId: string): Promise<{ title: string; transcript: string; channel: string } | null> {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript')
    const { Innertube } = await import('youtubei.js')
    
    // Get video info
    const youtube = await Innertube.create()
    const videoInfo = await youtube.getBasicInfo(videoId)
    const title = videoInfo.basic_info.title || 'Unknown'
    const channel = videoInfo.basic_info.channel?.name || 'Unknown'
    
    // Get transcript
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId)
    const transcript = transcriptItems.map(item => item.text).join(' ')
    
    if (transcript.length < 500) {
      log(`  Transcript too short (${transcript.length} chars), skipping`)
      return null
    }
    
    return { title, transcript, channel }
  } catch (err) {
    if (verbose) {
      log(`  Transcript fetch failed for ${videoId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    return null
  }
}

/**
 * Store transcript in content-raw.sqlite for later distillation
 */
function storeTranscript(
  db: Database.Database,
  commanderName: string,
  videoId: string,
  title: string,
  channel: string,
  transcript: string
): boolean {
  const sourceUrl = `https://www.youtube.com/watch?v=${videoId}`
  
  // Check if already exists
  const existing = db.prepare(
    'SELECT id FROM raw_content WHERE source_url = ?'
  ).get(sourceUrl)
  
  if (existing) {
    if (verbose) log(`  Already have transcript for ${videoId}`)
    return false
  }
  
  // Insert new transcript
  db.prepare(`
    INSERT INTO raw_content (source_url, card_name, source, title, author, full_content, created_at)
    VALUES (?, ?, 'youtube', ?, ?, ?, datetime('now'))
  `).run(sourceUrl, commanderName, title, channel, transcript)
  
  return true
}

async function main() {
  log('=== YouTube Transcript Fetcher ===')
  if (dryRun) log('DRY RUN MODE - no data will be saved')
  
  // Open content-raw.sqlite
  const dbPath = process.env.COMMANDER_CONTENT_DB_PATH
    ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
  const db = new Database(dbPath)
  
  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url TEXT UNIQUE NOT NULL,
      card_name TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT,
      author TEXT,
      published_date TEXT,
      full_content TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // Get commanders without insights
  log(`Fetching commanders without insights (limit: ${limitArg})...`)
  const commanders = await getCommandersWithoutInsights(limitArg)
  log(`Found ${commanders.length} commanders to process`)
  
  let stats = {
    processed: 0,
    videosFound: 0,
    transcriptsFetched: 0,
    transcriptsStored: 0,
    errors: 0,
  }
  
  for (const commander of commanders) {
    log(`\nProcessing: ${commander.display_name} (rank: ${commander.edhrec_rank ?? 'N/A'})`)
    stats.processed++
    
    // Search YouTube
    const videoIds = await searchYouTube(commander.display_name)
    if (videoIds.length === 0) {
      log(`  No videos found`)
      continue
    }
    log(`  Found ${videoIds.length} videos`)
    stats.videosFound += videoIds.length
    
    // Fetch transcripts
    for (const videoId of videoIds) {
      const result = await fetchTranscript(videoId)
      if (!result) continue
      
      stats.transcriptsFetched++
      log(`  Got transcript: "${result.title}" by ${result.channel} (${result.transcript.length} chars)`)
      
      if (!dryRun) {
        const stored = storeTranscript(
          db,
          commander.display_name,
          videoId,
          result.title,
          result.channel,
          result.transcript
        )
        if (stored) {
          stats.transcriptsStored++
          log(`  Stored transcript`)
        }
      }
      
      // Rate limit: 500ms between transcript fetches
      await new Promise(r => setTimeout(r, 500))
    }
    
    // Rate limit: 1s between commanders
    await new Promise(r => setTimeout(r, 1000))
  }
  
  db.close()
  
  log('\n=== Summary ===')
  log(`Commanders processed: ${stats.processed}`)
  log(`Videos found: ${stats.videosFound}`)
  log(`Transcripts fetched: ${stats.transcriptsFetched}`)
  log(`Transcripts stored: ${stats.transcriptsStored}`)
  log(`Errors: ${stats.errors}`)
  
  if (!dryRun && stats.transcriptsStored > 0) {
    log(`\nNext step: Run distillation to extract insights:`)
    log(`  npx tsx scripts/distill-commander-insights.ts --limit ${stats.transcriptsStored}`)
  }
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
