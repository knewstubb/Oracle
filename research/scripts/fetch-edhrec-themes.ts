/**
 * Fetch EDHREC Data for Commanders
 * 
 * Queries EDHREC's JSON API to get strategy/theme data AND articles for commanders.
 * - Strategies → Supabase (commander_strategies table)
 * - Articles → Local SQLite (data/content-raw.sqlite)
 * 
 * Usage:
 *   npx tsx scripts/fetch-edhrec-themes.ts              # Fetch all commanders
 *   npx tsx scripts/fetch-edhrec-themes.ts --limit 100  # Fetch top 100 by EDHREC rank
 *   npx tsx scripts/fetch-edhrec-themes.ts --dry-run    # Preview without writing
 *   npx tsx scripts/fetch-edhrec-themes.ts --name "Prosper, Tome-Bound"  # Fetch single commander
 *   npx tsx scripts/fetch-edhrec-themes.ts --skip-articles  # Skip article extraction
 */

import { createClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local
config({ path: resolve(__dirname, '../../.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Local SQLite for raw content
const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
let sqliteDb: Database.Database | null = null

function getLocalDb(): Database.Database {
  if (!sqliteDb) {
    sqliteDb = new Database(SQLITE_PATH)
  }
  return sqliteDb
}

const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'
const EDHREC_API_BASE = 'https://json.edhrec.com/pages/commanders'

// EDHREC asks for rate limiting - 100ms between requests minimum
const RATE_LIMIT_MS = 150

interface EdhrecTagLink {
  count: number
  slug: string
  value: string
}

interface EdhrecArticle {
  alt?: string
  date?: string
  href: string
  value: string  // title
  author?: {
    name: string
    avatar?: string
  }
  excerpt?: string
  media?: string
}

interface EdhrecResponse {
  tag_counts?: Record<string, number>
  panels?: {
    taglinks?: EdhrecTagLink[]
    articles?: EdhrecArticle[]
  }
  container?: {
    card?: {
      name: string
      num_decks: number
      rank: number
    }
  }
}

interface CommanderRow {
  name: string
  edhrec_rank: number | null
}

interface StrategyRow {
  card_name: string
  edhrec_url: string
  edhrec_themes: string[]
  primary_strategy: string | null
  secondary_strategies: string[]
  theme_count: number
  fetched_at: string
}

interface ContentRow {
  card_name: string
  source: string
  source_url: string
  title: string
  author: string | null
  published_date: string | null
  excerpt: string | null
  fetched_at: string
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',]/g, '')           // Remove apostrophes and commas
    .replace(/\s+/g, '-')           // Spaces to hyphens
    .replace(/[^a-z0-9-]/g, '')     // Remove other special chars
    .replace(/-+/g, '-')            // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Trim leading/trailing hyphens
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchEdhrecData(name: string): Promise<EdhrecResponse | null> {
  const slug = nameToSlug(name)
  const url = `${EDHREC_API_BASE}/${slug}.json`
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
    })
    
    if (response.status === 404) {
      // Commander not found on EDHREC (new card, or name mismatch)
      return null
    }
    
    if (!response.ok) {
      console.error(`  EDHREC returned ${response.status} for ${name}`)
      return null
    }
    
    return await response.json()
  } catch (error) {
    console.error(`  Error fetching ${name}:`, error)
    return null
  }
}

function extractThemes(data: EdhrecResponse): { themes: string[], primary: string | null, secondary: string[] } {
  // Prefer taglinks as it's ordered by count
  if (data.panels?.taglinks && data.panels.taglinks.length > 0) {
    const themes = data.panels.taglinks.map(t => t.value)
    const primary = themes[0] || null
    // Secondary = next 4 themes (positions 1-4)
    const secondary = themes.slice(1, 5)
    return { themes, primary, secondary }
  }
  
  // Fallback to tag_counts
  if (data.tag_counts) {
    const sorted = Object.entries(data.tag_counts)
      .sort((a, b) => b[1] - a[1])
      .map(([theme]) => theme)
    
    const primary = sorted[0] || null
    const secondary = sorted.slice(1, 5)
    return { themes: sorted, primary, secondary }
  }
  
  return { themes: [], primary: null, secondary: [] }
}

function extractArticles(data: EdhrecResponse, commanderName: string, fetchedAt: string): ContentRow[] {
  const articles = data.panels?.articles || []
  
  return articles.map(article => ({
    card_name: commanderName,
    source: 'edhrec_article',
    source_url: article.href,
    title: article.value,
    author: article.author?.name || null,
    published_date: article.date || null,
    excerpt: article.excerpt || null,
    fetched_at: fetchedAt,
  }))
}

function upsertArticlesToSqlite(rows: ContentRow[]): number {
  if (rows.length === 0) return 0
  
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT INTO raw_content (source_url, card_name, source, title, author, published_date, excerpt, fetched_at)
    VALUES (@source_url, @card_name, @source, @title, @author, @published_date, @excerpt, @fetched_at)
    ON CONFLICT(source_url) DO UPDATE SET
      card_name = excluded.card_name,
      title = excluded.title,
      author = excluded.author,
      published_date = excluded.published_date,
      excerpt = excluded.excerpt,
      fetched_at = excluded.fetched_at
  `)
  
  const upsertMany = db.transaction((articles: ContentRow[]) => {
    for (const article of articles) {
      stmt.run(article)
    }
  })
  
  upsertMany(rows)
  return rows.length
}

async function getCommanders(limit?: number, singleName?: string): Promise<CommanderRow[]> {
  if (singleName) {
    const { data, error } = await supabase
      .from('ref_cards')
      .select('name, edhrec_rank')
      .eq('name', singleName)
      .eq('can_be_commander', true)
      .single()
    
    if (error || !data) {
      console.error(`Commander not found: ${singleName}`)
      return []
    }
    return [data]
  }
  
  let query = supabase
    .from('ref_cards')
    .select('name, edhrec_rank')
    .eq('can_be_commander', true)
    .order('edhrec_rank', { ascending: true, nullsFirst: false })
  
  if (limit) {
    query = query.limit(limit)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching commanders:', error)
    return []
  }
  
  return data || []
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const skipArticles = args.includes('--skip-articles')
  const limitArg = args.find(a => a.startsWith('--limit'))
  const nameArg = args.find(a => a.startsWith('--name'))
  
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : undefined
  const singleName = nameArg ? args[args.indexOf(nameArg) + 1] : undefined
  
  console.log('=== Fetch EDHREC Data ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  console.log(`Articles: ${skipArticles ? 'SKIPPED' : 'INCLUDED'}`)
  if (limit) console.log(`Limit: ${limit} commanders`)
  if (singleName) console.log(`Single: ${singleName}`)
  console.log('')
  
  // Get commanders to fetch
  const commanders = await getCommanders(limit, singleName)
  console.log(`Found ${commanders.length} commanders to process`)
  
  if (commanders.length === 0) {
    console.log('No commanders to process')
    return
  }
  
  const now = new Date().toISOString()
  let processed = 0
  let found = 0
  let notFound = 0
  let errors = 0
  let totalArticles = 0
  
  const strategyRows: StrategyRow[] = []
  const contentRows: ContentRow[] = []
  
  for (const commander of commanders) {
    processed++
    
    if (processed % 50 === 0 || processed === commanders.length) {
      console.log(`Progress: ${processed}/${commanders.length} (found: ${found}, not found: ${notFound}, articles: ${totalArticles})`)
    }
    
    const data = await fetchEdhrecData(commander.name)
    
    if (!data) {
      notFound++
      continue
    }
    
    const { themes, primary, secondary } = extractThemes(data)
    
    if (themes.length === 0) {
      notFound++
      continue
    }
    
    found++
    
    // Strategy data
    const strategyRow: StrategyRow = {
      card_name: commander.name,
      edhrec_url: `https://edhrec.com/commanders/${nameToSlug(commander.name)}`,
      edhrec_themes: themes,
      primary_strategy: primary,
      secondary_strategies: secondary,
      theme_count: themes.length,
      fetched_at: now,
    }
    
    strategyRows.push(strategyRow)
    
    // Article data
    if (!skipArticles) {
      const articles = extractArticles(data, commander.name, now)
      contentRows.push(...articles)
      totalArticles += articles.length
    }
    
    // Batch upsert strategies every 50 rows
    if (!dryRun && strategyRows.length >= 50) {
      const { error } = await supabase
        .from('commander_strategies')
        .upsert(strategyRows, { onConflict: 'card_name' })
      
      if (error) {
        console.error('Strategy upsert error:', error.message)
        errors += strategyRows.length
      }
      
      strategyRows.length = 0
    }
    
    // Batch upsert articles every 100 rows (to local SQLite)
    if (!dryRun && !skipArticles && contentRows.length >= 100) {
      try {
        upsertArticlesToSqlite(contentRows)
      } catch (err) {
        console.error('SQLite content upsert error:', err)
        errors += contentRows.length
      }
      
      contentRows.length = 0
    }
    
    await sleep(RATE_LIMIT_MS)
  }
  
  // Final batch - strategies
  if (!dryRun && strategyRows.length > 0) {
    const { error } = await supabase
      .from('commander_strategies')
      .upsert(strategyRows, { onConflict: 'card_name' })
    
    if (error) {
      console.error('Final strategy upsert error:', error.message)
      errors += strategyRows.length
    }
  }
  
  // Final batch - articles (to local SQLite)
  if (!dryRun && !skipArticles && contentRows.length > 0) {
    try {
      upsertArticlesToSqlite(contentRows)
    } catch (err) {
      console.error('Final SQLite content upsert error:', err)
      errors += contentRows.length
    }
  }
  
  console.log('\n=== Summary ===')
  console.log(`Processed: ${processed}`)
  console.log(`Found on EDHREC: ${found}`)
  console.log(`Not found: ${notFound}`)
  console.log(`Articles extracted: ${totalArticles}`)
  if (errors > 0) console.log(`Errors: ${errors}`)
  
  // Show sample if dry run
  if (dryRun && strategyRows.length > 0) {
    console.log('\nSample strategy data (first 3):')
    for (const row of strategyRows.slice(0, 3)) {
      console.log(`  ${row.card_name}:`)
      console.log(`    Primary: ${row.primary_strategy}`)
      console.log(`    Secondary: ${row.secondary_strategies.join(', ')}`)
      console.log(`    All themes (${row.theme_count}): ${row.edhrec_themes.slice(0, 10).join(', ')}...`)
    }
  }
  
  if (dryRun && contentRows.length > 0) {
    console.log('\nSample article data (first 5):')
    for (const row of contentRows.slice(0, 5)) {
      console.log(`  ${row.card_name}: "${row.title}"`)
      console.log(`    URL: ${row.source_url}`)
      if (row.raw_content) {
        console.log(`    Excerpt: ${row.raw_content.substring(0, 80)}...`)
      }
    }
  }
  
  // Verification
  if (!dryRun) {
    const { count: strategyCount } = await supabase
      .from('commander_strategies')
      .select('*', { count: 'exact', head: true })
    
    console.log(`\nTotal rows in commander_strategies: ${strategyCount}`)
    
    if (!skipArticles) {
      // Count from local SQLite
      const db = getLocalDb()
      const result = db.prepare('SELECT COUNT(*) as count FROM raw_content').get() as { count: number }
      console.log(`Total rows in local SQLite (raw_content): ${result.count}`)
    }
  }
  
  // Close SQLite connection
  if (sqliteDb) {
    sqliteDb.close()
    sqliteDb = null
  }
  
  console.log('\nDone!')
}

main()
