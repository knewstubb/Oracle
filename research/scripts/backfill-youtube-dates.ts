/**
 * Backfill YouTube Published Dates
 * 
 * Fetches publishedAt dates for all YouTube videos in raw_content
 * using the official YouTube Data API v3.
 * 
 * Setup:
 *   1. Get a YouTube Data API key from Google Cloud Console
 *   2. Add YOUTUBE_API_KEY to .env.local
 * 
 * Usage:
 *   npx tsx scripts/backfill-youtube-dates.ts              # Full backfill
 *   npx tsx scripts/backfill-youtube-dates.ts --dry-run    # Preview without updating
 *   npx tsx scripts/backfill-youtube-dates.ts --limit 100  # Process only 100 videos
 * 
 * Quota Cost:
 *   - videos.list costs 1 unit per request
 *   - We batch 50 videos per request
 *   - ~2,945 videos = ~59 requests = ~59 quota units
 *   - Default daily quota is 10,000 units, so this is very cheap
 */

import Database from 'better-sqlite3'
import { resolve } from 'path'
import { config } from 'dotenv'

// Load environment variables
config({ path: resolve(__dirname, '../../.env.local') })

const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
const db = new Database(SQLITE_PATH)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
const BATCH_SIZE = 50  // Max IDs per request
const RATE_LIMIT_MS = 100  // Be gentle

interface VideoRow {
  source_url: string
  published_date: string | null
}

interface YouTubeVideoItem {
  id: string
  snippet: {
    publishedAt: string
    title: string
    channelTitle: string
  }
}

interface YouTubeVideosResponse {
  items: YouTubeVideoItem[]
}

function extractVideoId(url: string): string | null {
  const match = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/)
  return match?.[1] || null
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch video details from YouTube Data API (batched)
 */
async function fetchVideoDetails(videoIds: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()
  
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set in environment')
  }

  const url = new URL(`${YOUTUBE_API_BASE}/videos`)
  url.searchParams.set('key', YOUTUBE_API_KEY)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('id', videoIds.join(','))

  const response = await fetch(url.toString())
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`YouTube API error: ${response.status} - ${error}`)
  }

  const data: YouTubeVideosResponse = await response.json()
  
  for (const item of data.items || []) {
    // publishedAt is ISO 8601: "2024-03-15T14:30:00Z"
    // Extract just the date portion
    const publishedDate = item.snippet.publishedAt.split('T')[0]
    results.set(item.id, publishedDate)
  }

  return results
}

/**
 * Get all YouTube videos missing published_date
 */
function getVideosMissingDates(limit?: number): VideoRow[] {
  let query = `
    SELECT source_url, published_date 
    FROM raw_content 
    WHERE source = 'youtube' 
      AND published_date IS NULL
  `
  
  if (limit) {
    query += ` LIMIT ${limit}`
  }
  
  return db.prepare(query).all() as VideoRow[]
}

/**
 * Update published_date for a video
 */
function updatePublishedDate(sourceUrl: string, publishedDate: string): void {
  db.prepare(`
    UPDATE raw_content 
    SET published_date = ? 
    WHERE source_url = ?
  `).run(publishedDate, sourceUrl)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.indexOf('--limit')
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]) : undefined

  console.log('=== YouTube Date Backfill ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  
  if (!YOUTUBE_API_KEY) {
    console.error('\nError: YOUTUBE_API_KEY not found in .env.local')
    console.error('To get an API key:')
    console.error('  1. Go to https://console.cloud.google.com/')
    console.error('  2. Create or select a project')
    console.error('  3. Enable "YouTube Data API v3"')
    console.error('  4. Go to Credentials → Create Credentials → API Key')
    console.error('  5. Add to .env.local: YOUTUBE_API_KEY=your_key_here')
    process.exit(1)
  }

  // Get videos missing dates
  const videos = getVideosMissingDates(limit)
  console.log(`\nVideos missing published_date: ${videos.length}`)
  
  if (videos.length === 0) {
    console.log('Nothing to do!')
    db.close()
    return
  }

  // Extract video IDs
  const urlToId = new Map<string, string>()
  for (const video of videos) {
    const videoId = extractVideoId(video.source_url)
    if (videoId) {
      urlToId.set(video.source_url, videoId)
    }
  }

  console.log(`Valid video IDs: ${urlToId.size}`)
  
  // Process in batches
  const allUrls = Array.from(urlToId.keys())
  const batches = Math.ceil(allUrls.length / BATCH_SIZE)
  
  console.log(`Batches to process: ${batches} (${BATCH_SIZE} videos each)`)
  console.log(`Estimated quota cost: ~${batches} units\n`)

  let updated = 0
  let notFound = 0
  let errors = 0

  for (let i = 0; i < batches; i++) {
    const batchUrls = allUrls.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
    const batchIds = batchUrls.map(url => urlToId.get(url)!).filter(Boolean)
    
    process.stdout.write(`Batch ${i + 1}/${batches} (${batchIds.length} videos)...`)

    try {
      const dateMap = await fetchVideoDetails(batchIds)
      
      for (const url of batchUrls) {
        const videoId = urlToId.get(url)!
        const publishedDate = dateMap.get(videoId)
        
        if (publishedDate) {
          if (!dryRun) {
            updatePublishedDate(url, publishedDate)
          }
          updated++
        } else {
          notFound++
        }
      }
      
      console.log(` ✓ (${dateMap.size} dates found)`)
    } catch (error) {
      console.log(` ✗ Error: ${error}`)
      errors++
    }

    await sleep(RATE_LIMIT_MS)
  }

  console.log('\n=== Summary ===')
  console.log(`Updated: ${updated}`)
  console.log(`Not found (deleted/private videos): ${notFound}`)
  console.log(`Batch errors: ${errors}`)

  if (!dryRun) {
    // Verify results
    const result = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(published_date) as with_date,
        MIN(published_date) as oldest,
        MAX(published_date) as newest
      FROM raw_content 
      WHERE source = 'youtube'
    `).get() as { total: number; with_date: number; oldest: string; newest: string }
    
    console.log(`\nYouTube videos in DB: ${result.total}`)
    console.log(`With published_date: ${result.with_date}`)
    console.log(`Date range: ${result.oldest} to ${result.newest}`)
  }

  db.close()
  console.log('\nDone!')
}

main().catch(console.error)
