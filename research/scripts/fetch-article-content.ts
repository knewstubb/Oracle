/**
 * Fetch Full Article Content
 * 
 * Reads article URLs from local SQLite (raw_content table) where full_content is NULL,
 * fetches the HTML, extracts the article body text, and updates the record.
 * 
 * Usage:
 *   npx tsx scripts/fetch-article-content.ts              # Fetch all unfetched articles
 *   npx tsx scripts/fetch-article-content.ts --limit 100  # Fetch up to 100 articles
 *   npx tsx scripts/fetch-article-content.ts --dry-run    # Preview without fetching
 *   npx tsx scripts/fetch-article-content.ts --source edhrec_article  # Filter by source
 */

import Database from 'better-sqlite3'
import { JSDOM } from 'jsdom'
import { resolve } from 'path'

const SQLITE_PATH = process.env.COMMANDER_CONTENT_DB_PATH
  ?? resolve(__dirname, '../../../research/commander-content/content-raw.sqlite')
const db = new Database(SQLITE_PATH)

const USER_AGENT = 'TheOracle/1.0 (https://github.com/bradknewstubb/the-oracle)'

// Polite rate limiting - 500ms between requests
const RATE_LIMIT_MS = 500

interface ArticleRow {
  id: number
  source_url: string
  source: string
  title: string
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchArticleHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    
    if (!response.ok) {
      console.error(`  HTTP ${response.status} for ${url}`)
      return null
    }
    
    return await response.text()
  } catch (error) {
    console.error(`  Error fetching ${url}:`, error)
    return null
  }
}

function extractEdhrecArticleContent(html: string): string | null {
  try {
    const dom = new JSDOM(html)
    const doc = dom.window.document
    
    // EDHREC articles use .article-content or similar
    const selectors = [
      '.article-content',
      '.entry-content', 
      'article .content',
      'article',
      '.post-content',
      'main article',
    ]
    
    for (const selector of selectors) {
      const element = doc.querySelector(selector)
      if (element) {
        // Remove script tags, ads, and navigation
        element.querySelectorAll('script, style, nav, .ad, .advertisement, .sidebar, .related-posts').forEach(el => el.remove())
        
        // Get text content, clean up whitespace
        const text = element.textContent || ''
        const cleaned = text
          .replace(/\s+/g, ' ')
          .replace(/\n\s*\n/g, '\n\n')
          .trim()
        
        if (cleaned.length > 200) {
          return cleaned
        }
      }
    }
    
    return null
  } catch (error) {
    console.error('  Error parsing HTML:', error)
    return null
  }
}

function extractCommandersHeraldContent(html: string): string | null {
  try {
    const dom = new JSDOM(html)
    const doc = dom.window.document
    
    const selectors = [
      '.entry-content',
      '.post-content',
      'article .content',
      'article',
    ]
    
    for (const selector of selectors) {
      const element = doc.querySelector(selector)
      if (element) {
        element.querySelectorAll('script, style, nav, .ad, .sidebar').forEach(el => el.remove())
        
        const text = element.textContent || ''
        const cleaned = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim()
        
        if (cleaned.length > 200) {
          return cleaned
        }
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

function extractGenericContent(html: string): string | null {
  try {
    const dom = new JSDOM(html)
    const doc = dom.window.document
    
    // Try common article selectors
    const selectors = ['article', 'main', '.content', '.post', '#content']
    
    for (const selector of selectors) {
      const element = doc.querySelector(selector)
      if (element) {
        element.querySelectorAll('script, style, nav, header, footer, .sidebar').forEach(el => el.remove())
        
        const text = element.textContent || ''
        const cleaned = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim()
        
        if (cleaned.length > 200) {
          return cleaned
        }
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

function extractContent(html: string, source: string): string | null {
  switch (source) {
    case 'edhrec_article':
      return extractEdhrecArticleContent(html)
    case 'commanders_herald':
      return extractCommandersHeraldContent(html)
    default:
      return extractGenericContent(html)
  }
}

function getUnfetchedArticles(limit?: number, source?: string): ArticleRow[] {
  let query = `
    SELECT id, source_url, source, title 
    FROM raw_content 
    WHERE full_content IS NULL
  `
  
  if (source) {
    query += ` AND source = '${source}'`
  }
  
  query += ' ORDER BY id'
  
  if (limit) {
    query += ` LIMIT ${limit}`
  }
  
  return db.prepare(query).all() as ArticleRow[]
}

function updateArticleContent(id: number, content: string): void {
  const stmt = db.prepare(`
    UPDATE raw_content 
    SET full_content = ?, content_fetched_at = datetime('now')
    WHERE id = ?
  `)
  stmt.run(content, id)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const limitArg = args.find(a => a.startsWith('--limit'))
  const sourceArg = args.find(a => a.startsWith('--source'))
  
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : undefined
  const source = sourceArg ? args[args.indexOf(sourceArg) + 1] : undefined
  
  console.log('=== Fetch Article Content ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`)
  if (limit) console.log(`Limit: ${limit} articles`)
  if (source) console.log(`Source filter: ${source}`)
  console.log('')
  
  const articles = getUnfetchedArticles(limit, source)
  console.log(`Found ${articles.length} articles to fetch`)
  
  if (articles.length === 0) {
    console.log('No articles to fetch')
    db.close()
    return
  }
  
  let processed = 0
  let success = 0
  let failed = 0
  
  for (const article of articles) {
    processed++
    
    if (processed % 50 === 0 || processed === articles.length) {
      console.log(`Progress: ${processed}/${articles.length} (success: ${success}, failed: ${failed})`)
    }
    
    if (dryRun) {
      console.log(`  Would fetch: ${article.source_url}`)
      continue
    }
    
    const html = await fetchArticleHtml(article.source_url)
    
    if (!html) {
      failed++
      continue
    }
    
    const content = extractContent(html, article.source)
    
    if (!content) {
      console.error(`  Could not extract content from: ${article.source_url}`)
      failed++
      continue
    }
    
    updateArticleContent(article.id, content)
    success++
    
    await sleep(RATE_LIMIT_MS)
  }
  
  console.log('\n=== Summary ===')
  console.log(`Processed: ${processed}`)
  console.log(`Success: ${success}`)
  console.log(`Failed: ${failed}`)
  
  // Verification
  if (!dryRun) {
    const result = db.prepare('SELECT COUNT(*) as count FROM raw_content WHERE full_content IS NOT NULL').get() as { count: number }
    console.log(`\nTotal articles with full_content: ${result.count}`)
  }
  
  db.close()
  console.log('\nDone!')
}

main()
