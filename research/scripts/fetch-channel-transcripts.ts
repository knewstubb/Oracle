/**
 * Fetch YouTube Transcripts from Specific Quality Channels
 * 
 * Targets high-quality MTG deck tech channels and fetches their commander content.
 * Uses YouTube Data API for proper metadata (channel, dates) and youtube-transcript for content.
 * 
 * Usage:
 *   npx tsx scripts/fetch-channel-transcripts.ts              # Full run
 *   npx tsx scripts/fetch-channel-transcripts.ts --dry-run    # Preview without writing
 *   npx tsx scripts/fetch-channel-transcripts.ts --limit 50   # Limit videos per channel
 *   npx tsx scripts/fetch-channel-transcripts.ts --channel "The Commander's Quarters"  # Single channel
 */

import Database from 'better-sqlite3'
import { YoutubeTranscript } from 'youtube-transcript'
import { resolve } from 'path'
import { config } from 'dotenv'

config({ path: resolve(__dirname, '../../.env.local') })

const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
const db = new Database(SQLITE_PATH)

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

// Rate limiting
const SEARCH_RATE_MS = 200
const TRANSCRIPT_RATE_MS = 500

// Target channels - using search-based approach instead of channelId
// This avoids needing exact channel IDs which can be tricky to find
const TARGET_CHANNELS: { name: string; channelId: string | null; searchQuery: string }[] = [
  {
    name: "The Commander's Quarters",
    channelId: 'UC-w5MNByr4SNy3z2232sj0g',
    searchQuery: '"The Commander\'s Quarters" deck tech',
  },
  {
    name: "Commander's Brew",
    channelId: null, // Will use global search
    searchQuery: '"Commander\'s Brew" deck tech commander',
  },
  {
    name: 'MTGGoldfish',
    channelId: 'UCZAZTSd0xnor7hJFmINIBIw',
    searchQuery: 'MTGGoldfish commander deck tech',
  },
  {
    name: 'EDHRECast',
    channelId: null,
    searchQuery: 'EDHRECast commander',
  },
  {
    name: 'Grazzet MTG',
    channelId: null,
    searchQuery: '"Grazzet" commander deck tech',
  },
  {
    name: 'MTG Muddstah',
    channelId: null,
    searchQuery: '"MTG Muddstah" deck tech',
  },
  {
    name: 'The Command Zone',
    channelId: 'UCLsiaNUb42gRAP7ewbJ0ecQ',
    searchQuery: '"Command Zone" deck tech commander',
  },
  {
    name: 'Nitpicking Nerds',
    channelId: null,
    searchQuery: '"Nitpicking Nerds" commander deck',
  },
  {
    name: 'Play to Win',
    channelId: null,
    searchQuery: '"Play to Win" cEDH deck tech',
  },
  {
    name: 'I Hate Your Deck',
    channelId: null,
    searchQuery: '"I Hate Your Deck" commander',
  },
  {
    name: 'Budget Commander / Tomer',
    channelId: null,
    searchQuery: '"Budget Commander" Tomer deck tech',
  },
]

interface VideoResult {
  id: string
  title: string
  channelTitle: string
  publishedAt: string
  description: string
}

interface ContentRow {
  source_url: string
  card_name: string
  source: string
  title: string
  author: string | null
  published_date: string | null
  excerpt: string | null
  full_content: string | null
  fetched_at: string
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Search for commander deck tech videos (channel-specific or global)
 */
async function searchVideos(
  channelId: string | null,
  searchQuery: string,
  maxResults: number = 50
): Promise<VideoResult[]> {
  if (!YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY not set')
  }

  const allResults: VideoResult[] = []
  const seenIds = new Set<string>()
  let nextPageToken: string | null = null

  while (allResults.length < maxResults) {
    const url = new URL(`${YOUTUBE_API_BASE}/search`)
    url.searchParams.set('key', YOUTUBE_API_KEY)
    url.searchParams.set('q', searchQuery)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', '50')
    url.searchParams.set('order', 'relevance')
    
    if (channelId) {
      url.searchParams.set('channelId', channelId)
    }
    
    if (nextPageToken) {
      url.searchParams.set('pageToken', nextPageToken)
    }

    try {
      const response = await fetch(url.toString())
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`  Search failed: ${response.status} - ${errorText}`)
        break
      }

      const data = await response.json()
      
      for (const item of data.items || []) {
        const videoId = item.id?.videoId
        if (!videoId || seenIds.has(videoId)) continue
        
        seenIds.add(videoId)
        allResults.push({
          id: videoId,
          title: item.snippet?.title || '',
          channelTitle: item.snippet?.channelTitle || '',
          publishedAt: item.snippet?.publishedAt || '',
          description: item.snippet?.description || '',
        })
      }

      nextPageToken = data.nextPageToken || null
      if (!nextPageToken) break
      
      await sleep(SEARCH_RATE_MS)
    } catch (error) {
      console.error(`  Error searching:`, error)
      break
    }
  }

  return allResults.slice(0, maxResults)
}

/**
 * Extract commander name from video title
 */
function extractCommanderName(title: string): string | null {
  // Common patterns:
  // "Aesi, Tyrant of Gyre Strait | Deck Tech"
  // "Building THE BEST Ur-Dragon Commander Deck"
  // "$50 Budget Commander: Atraxa"
  // "Vadrik Deck Tech | cEDH"
  
  // Try to extract text before common separators
  const patterns = [
    /^([^|]+?)\s*\|/,                          // "Name | Deck Tech"
    /^([^-]+?)\s*-\s*(?:Deck Tech|Commander|EDH)/i,  // "Name - Deck Tech"
    /(?:Building|Brewing)\s+(?:THE BEST\s+)?([^!]+)/i, // "Building THE BEST Name"
    /Budget Commander[:\s]+([^|$]+)/i,         // "Budget Commander: Name"
    /\$\d+\s+(?:Budget\s+)?([^|$]+)/i,         // "$50 Name"
    /^([A-Z][^|]+?)\s+(?:Deck Tech|Commander Deck|EDH)/i, // "Name Deck Tech"
  ]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match?.[1]) {
      let name = match[1].trim()
      // Clean up common suffixes
      name = name.replace(/\s*(Commander|EDH|Deck|Tech|MTG|Budget|cEDH).*$/i, '').trim()
      if (name.length > 3 && name.length < 60) {
        return name
      }
    }
  }

  return null
}

/**
 * Fetch transcript for a YouTube video
 */
async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId)
    
    if (!transcript || transcript.length === 0) {
      return null
    }

    const fullText = transcript
      .map(segment => segment.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()

    return fullText
  } catch {
    return null
  }
}

/**
 * Check if we already have this video
 */
function hasExistingVideo(videoUrl: string): boolean {
  const result = db.prepare(
    "SELECT 1 FROM raw_content WHERE source_url = ?"
  ).get(videoUrl)
  return !!result
}

/**
 * Upsert content rows
 */
function upsertContent(rows: ContentRow[]): number {
  if (rows.length === 0) return 0

  const stmt = db.prepare(`
    INSERT INTO raw_content (source_url, card_name, source, title, author, published_date, excerpt, full_content, fetched_at, content_fetched_at)
    VALUES (@source_url, @card_name, @source, @title, @author, @published_date, @excerpt, @full_content, @fetched_at, @fetched_at)
    ON CONFLICT(source_url) DO UPDATE SET
      card_name = excluded.card_name,
      title = excluded.title,
      author = excluded.author,
      published_date = excluded.published_date,
      full_content = excluded.full_content,
      fetched_at = excluded.fetched_at,
      content_fetched_at = excluded.content_fetched_at
  `)

  const upsertMany = db.transaction((articles: ContentRow[]) => {
    for (const article of articles) {
      stmt.run(article)
    }
  })

  upsertMany(rows)
  return rows.length
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.indexOf('--limit')
  const channelArg = args.indexOf('--channel')
  
  const videosPerChannel = limitArg !== -1 ? parseInt(args[limitArg + 1]) : 100
  const singleChannel = channelArg !== -1 ? args[channelArg + 1] : null

  console.log('=== Channel Transcript Fetcher ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Videos per channel: ${videosPerChannel}`)
  
  if (!YOUTUBE_API_KEY) {
    console.error('Error: YOUTUBE_API_KEY not found in .env.local')
    process.exit(1)
  }

  const channels = singleChannel
    ? TARGET_CHANNELS.filter(c => c.name.toLowerCase().includes(singleChannel.toLowerCase()))
    : TARGET_CHANNELS

  if (channels.length === 0) {
    console.error(`No channels found matching "${singleChannel}"`)
    process.exit(1)
  }

  console.log(`\nProcessing ${channels.length} channel sources...\n`)

  const now = new Date().toISOString()
  let totalVideos = 0
  let totalTranscripts = 0
  let skippedExisting = 0
  let noCommanderName = 0

  for (const channel of channels) {
    console.log(`\n📺 ${channel.name}`)
    if (channel.channelId) {
      console.log(`   Channel ID: ${channel.channelId}`)
    } else {
      console.log(`   Using global search: "${channel.searchQuery}"`)
    }
    
    // Search for videos
    process.stdout.write('   Searching...')
    const videos = await searchVideos(channel.channelId, channel.searchQuery, videosPerChannel)
    console.log(` found ${videos.length} videos`)

    const rows: ContentRow[] = []
    let channelTranscripts = 0

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i]
      const videoUrl = `https://www.youtube.com/watch?v=${video.id}`
      
      // Skip if we already have it
      if (hasExistingVideo(videoUrl)) {
        skippedExisting++
        continue
      }

      // Extract commander name from title
      const commanderName = extractCommanderName(video.title)
      if (!commanderName) {
        noCommanderName++
        continue
      }

      totalVideos++

      // Fetch transcript
      await sleep(TRANSCRIPT_RATE_MS)
      const transcript = await fetchTranscript(video.id)

      if (transcript && transcript.length > 200) {
        totalTranscripts++
        channelTranscripts++

        const publishedDate = video.publishedAt ? video.publishedAt.split('T')[0] : null

        rows.push({
          source_url: videoUrl,
          card_name: commanderName,
          source: 'youtube',
          title: video.title,
          author: video.channelTitle,
          published_date: publishedDate,
          excerpt: transcript.substring(0, 500),
          full_content: transcript,
          fetched_at: now,
        })

        process.stdout.write(`   ✓ ${commanderName.substring(0, 30).padEnd(30)} (${video.publishedAt?.substring(0, 10) || 'no date'})\n`)
      }
    }

    if (!dryRun && rows.length > 0) {
      upsertContent(rows)
    }

    console.log(`   → ${channelTranscripts} new transcripts from ${channel.name}`)
  }

  console.log('\n=== Summary ===')
  console.log(`Channels processed: ${channels.length}`)
  console.log(`Videos found: ${totalVideos}`)
  console.log(`Transcripts captured: ${totalTranscripts}`)
  console.log(`Skipped (already in DB): ${skippedExisting}`)
  console.log(`Skipped (no commander name): ${noCommanderName}`)

  if (!dryRun) {
    const result = db.prepare(`
      SELECT COUNT(*) as count, COUNT(DISTINCT author) as channels
      FROM raw_content 
      WHERE source = 'youtube' AND author IS NOT NULL AND author != ''
    `).get() as { count: number; channels: number }
    console.log(`\nYouTube rows with channel info: ${result.count} (${result.channels} channels)`)
  }

  db.close()
  console.log('\nDone!')
}

main().catch(console.error)
