/**
 * Fetch Commander's Herald Articles
 * 
 * Uses WordPress REST API to fetch strategy articles from Commander's Herald.
 * Extracts commander mentions from content and stores in local SQLite.
 * 
 * Usage:
 *   npx tsx scripts/fetch-commanders-herald.ts              # Fetch all strategy articles
 *   npx tsx scripts/fetch-commanders-herald.ts --limit 100  # Fetch up to 100 articles
 *   npx tsx scripts/fetch-commanders-herald.ts --dry-run    # Preview without writing
 *   npx tsx scripts/fetch-commanders-herald.ts --category deckbuilding  # Specific category
 */

import Database from 'better-sqlite3'
import { JSDOM } from 'jsdom'
import { resolve } from 'path'

const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
const db = new Database(SQLITE_PATH)

const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'
const API_BASE = 'https://commandersherald.com/wp-json/wp/v2'

// Rate limiting - 300ms between requests
const RATE_LIMIT_MS = 300

// Categories relevant to commander strategy
const STRATEGY_CATEGORIES: Record<string, number> = {
  deckbuilding: 1166,
  cedh: 1164,
  budget: 1590,
  opinion: 1165,
}

interface WPPost {
  id: number
  date: string
  link: string
  title: { rendered: string }
  content: { rendered: string }
  excerpt: { rendered: string }
  author: number
  categories: number[]
}

interface WPAuthor {
  id: number
  name: string
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

function stripHtml(html: string): string {
  const dom = new JSDOM(html)
  return dom.window.document.body.textContent || ''
}

function cleanText(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&hellip;/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
}

// Extract commander names mentioned in article content
// This is a simple heuristic - looks for card name patterns
function extractCommanderMentions(content: string, title: string): string[] {
  const commanders: Set<string> = new Set()
  
  // Common patterns for commander mentions in articles
  // "X, Y" pattern (e.g., "Prosper, Tome-Bound")
  const commaPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z][a-z]+(?:\s+[A-Za-z-]+)*)\b/g
  
  let match
  while ((match = commaPattern.exec(content)) !== null) {
    const fullName = `${match[1]}, ${match[2]}`
    // Filter out common false positives
    if (!fullName.includes('WotC') && 
        !fullName.includes('Wizards') &&
        !fullName.match(/^(However|Therefore|Additionally|Furthermore)/)) {
      commanders.add(fullName)
    }
  }
  
  // Also check title for commander name
  const titleMatch = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+([A-Z][a-z]+(?:\s+[A-Za-z-]+)*)/)
  if (titleMatch) {
    commanders.add(`${titleMatch[1]}, ${titleMatch[2]}`)
  }
  
  // If no commanders found, use "general" as placeholder
  if (commanders.size === 0) {
    commanders.add('_general')
  }
  
  return Array.from(commanders)
}

async function fetchAuthors(): Promise<Map<number, string>> {
  const authors = new Map<number, string>()
  
  try {
    let page = 1
    while (true) {
      const response = await fetch(`${API_BASE}/users?per_page=100&page=${page}`, {
        headers: { 'User-Agent': USER_AGENT },
      })
      
      if (!response.ok) break
      
      const data = await response.json() as WPAuthor[]
      if (data.length === 0) break
      
      for (const author of data) {
        authors.set(author.id, author.name)
      }
      
      page++
      await sleep(RATE_LIMIT_MS)
    }
  } catch (error) {
    console.error('Error fetching authors:', error)
  }
  
  return authors
}

async function fetchPosts(categoryId: number, limit?: number): Promise<WPPost[]> {
  const posts: WPPost[] = []
  let page = 1
  const perPage = 100
  
  while (true) {
    const url = `${API_BASE}/posts?categories=${categoryId}&per_page=${perPage}&page=${page}&_fields=id,date,link,title,content,excerpt,author,categories`
    
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    })
    
    if (!response.ok) {
      if (response.status === 400) break // No more pages
      console.error(`API error: ${response.status}`)
      break
    }
    
    const data = await response.json() as WPPost[]
    if (data.length === 0) break
    
    posts.push(...data)
    
    if (limit && posts.length >= limit) {
      return posts.slice(0, limit)
    }
    
    // Check if there are more pages
    const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1')
    if (page >= totalPages) break
    
    page++
    await sleep(RATE_LIMIT_MS)
  }
  
  return limit ? posts.slice(0, limit) : posts
}

function upsertArticles(rows: ContentRow[]): number {
  if (rows.length === 0) return 0
  
  const stmt = db.prepare(`
    INSERT INTO raw_content (source_url, card_name, source, title, author, published_date, excerpt, full_content, fetched_at, content_fetched_at)
    VALUES (@source_url, @card_name, @source, @title, @author, @published_date, @excerpt, @full_content, @fetched_at, @fetched_at)
    ON CONFLICT(source_url) DO UPDATE SET
      card_name = excluded.card_name,
      title = excluded.title,
      author = excluded.author,
      published_date = excluded.published_date,
      excerpt = excluded.excerpt,
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
  const limitArg = args.find(a => a.startsWith('--limit'))
  const categoryArg = args.find(a => a.startsWith('--category'))
  
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : undefined
  const categoryFilter = categoryArg ? args[args.indexOf(categoryArg) + 1] : undefined
  
  console.log('=== Fetch Commander\'s Herald Articles ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (limit) console.log(`Limit: ${limit} articles per category`)
  if (categoryFilter) console.log(`Category: ${categoryFilter}`)
  console.log('')
  
  // Fetch authors first
  console.log('Fetching author data...')
  const authors = await fetchAuthors()
  console.log(`Found ${authors.size} authors`)
  
  // Determine which categories to fetch
  const categoriesToFetch = categoryFilter 
    ? { [categoryFilter]: STRATEGY_CATEGORIES[categoryFilter] }
    : STRATEGY_CATEGORIES
  
  if (categoryFilter && !STRATEGY_CATEGORIES[categoryFilter]) {
    console.error(`Unknown category: ${categoryFilter}`)
    console.log(`Available: ${Object.keys(STRATEGY_CATEGORIES).join(', ')}`)
    db.close()
    return
  }
  
  const now = new Date().toISOString()
  let totalPosts = 0
  let totalRows = 0
  
  for (const [categoryName, categoryId] of Object.entries(categoriesToFetch)) {
    console.log(`\nFetching ${categoryName} articles (category ${categoryId})...`)
    
    const posts = await fetchPosts(categoryId, limit)
    console.log(`  Found ${posts.length} posts`)
    totalPosts += posts.length
    
    const rows: ContentRow[] = []
    
    for (const post of posts) {
      const title = cleanText(stripHtml(post.title.rendered))
      const excerpt = cleanText(stripHtml(post.excerpt.rendered))
      const fullContent = cleanText(stripHtml(post.content.rendered))
      const authorName = authors.get(post.author) || null
      const publishedDate = post.date.split('T')[0]
      
      // Extract commander mentions
      const commanders = extractCommanderMentions(fullContent, title)
      
      // Create a row for each commander mentioned
      for (const commander of commanders) {
        rows.push({
          source_url: post.link,
          card_name: commander,
          source: 'commanders_herald',
          title,
          author: authorName,
          published_date: publishedDate,
          excerpt: excerpt.substring(0, 500),
          full_content: fullContent,
          fetched_at: now,
        })
      }
    }
    
    if (!dryRun && rows.length > 0) {
      upsertArticles(rows)
    }
    
    totalRows += rows.length
    console.log(`  Created ${rows.length} content rows`)
  }
  
  console.log('\n=== Summary ===')
  console.log(`Total posts fetched: ${totalPosts}`)
  console.log(`Total content rows: ${totalRows}`)
  
  if (!dryRun) {
    const result = db.prepare("SELECT COUNT(*) as count FROM raw_content WHERE source = 'commanders_herald'").get() as { count: number }
    console.log(`\nTotal Commander's Herald rows in SQLite: ${result.count}`)
  }
  
  db.close()
  console.log('\nDone!')
}

main()
