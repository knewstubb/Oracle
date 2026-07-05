/**
 * Backfill Notion Content to Local SQLite
 *
 * One-time migration script that reads existing deck documentation from Notion
 * pages (via notion_deck_map) and writes parsed sections into the local
 * deck_documentation and deck_notes tables.
 *
 * Run: npx tsx scripts/backfill-notion-to-local.ts
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import path from 'path'
import Database from 'better-sqlite3'

/**
 * Minimal NotionClient interface needed for backfill.
 * Defined locally since the notion-sync module has been removed.
 */
interface NotionClient {
  getPageContent(pageId: string): Promise<string>
  searchPages(...args: unknown[]): Promise<unknown[]>
  createPage(...args: unknown[]): Promise<{ id: string }>
  updatePage(...args: unknown[]): Promise<void>
  appendContent(...args: unknown[]): Promise<void>
  replaceSectionContent(...args: unknown[]): Promise<void>
  insertContentAfterSection(...args: unknown[]): Promise<void>
}

// ---------------------------------------------------------------------------
// Section Parser (exported for testability)
// ---------------------------------------------------------------------------

/** Known section headings and their corresponding DB column names */
const KNOWN_SECTIONS: Record<string, keyof ParsedSections> = {
  '## Strategy & Playstyle': 'strategy_playstyle',
  '## Key Synergy Lines': 'synergy_lines',
  '## Strengths & Weaknesses': 'strengths_weaknesses',
  '## Matchup Notes': 'matchup_notes',
  '## Mulligan Guide': 'mulligan_guide',
}

export interface ParsedSections {
  strategy_playstyle: string | null
  synergy_lines: string | null
  strengths_weaknesses: string | null
  matchup_notes: string | null
  mulligan_guide: string | null
}

export interface ParsedContent {
  sections: ParsedSections
  notes: string[]
}

/**
 * Parse markdown content from a Notion page into structured sections and notes.
 *
 * Sections are identified by their ## heading. Content between one known heading
 * and the next heading (known or unknown) is extracted.
 *
 * Notes are trailing content that appears AFTER the last known section heading's
 * content. Split by double newlines for individual note blocks.
 */
export function parseNotionPageContent(markdown: string): ParsedContent {
  const sections: ParsedSections = {
    strategy_playstyle: null,
    synergy_lines: null,
    strengths_weaknesses: null,
    matchup_notes: null,
    mulligan_guide: null,
  }

  const notes: string[] = []

  if (!markdown || markdown.trim().length === 0) {
    return { sections, notes }
  }

  // Find all ## heading positions
  const headingRegex = /^## .+$/gm
  const headings: { index: number; text: string }[] = []
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({ index: match.index, text: match[0] })
  }

  if (headings.length === 0) {
    // No headings found — entire content might be notes
    const trimmed = markdown.trim()
    if (trimmed.length > 0) {
      const noteBlocks = splitIntoNoteBlocks(trimmed)
      notes.push(...noteBlocks)
    }
    return { sections, notes }
  }

  // Track the index of the last known section heading
  let lastKnownSectionEndIndex = -1

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]
    const columnKey = KNOWN_SECTIONS[heading.text]

    // Get content between this heading and the next heading (or end of doc)
    const contentStart = heading.index + heading.text.length
    const contentEnd = i + 1 < headings.length ? headings[i + 1].index : markdown.length
    const body = markdown.slice(contentStart, contentEnd).trim()

    if (columnKey) {
      // This is a known section — extract its body
      sections[columnKey] = body.length > 0 ? body : null
      lastKnownSectionEndIndex = contentEnd
    }
  }

  // Extract notes: content after the last known section's end
  if (lastKnownSectionEndIndex > -1 && lastKnownSectionEndIndex < markdown.length) {
    const trailingContent = markdown.slice(lastKnownSectionEndIndex).trim()
    if (trailingContent.length > 0) {
      const noteBlocks = splitIntoNoteBlocks(trailingContent)
      notes.push(...noteBlocks)
    }
  } else if (lastKnownSectionEndIndex === -1) {
    // No known sections found but there are headings — treat everything as notes
    const trimmed = markdown.trim()
    if (trimmed.length > 0) {
      const noteBlocks = splitIntoNoteBlocks(trimmed)
      notes.push(...noteBlocks)
    }
  }

  return { sections, notes }
}

/**
 * Split text into individual note blocks by double newlines.
 * Filters out empty blocks.
 */
function splitIntoNoteBlocks(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(block => block.trim())
    .filter(block => block.length > 0)
}

// ---------------------------------------------------------------------------
// Main Script
// ---------------------------------------------------------------------------

interface NotionDeckMapRow {
  deck_id: number
  notion_page_id: string
  last_synced_at: string | null
  last_synced_fields: string | null
}

interface BackfillSummary {
  total: number
  succeeded: number
  skipped: number
  failed: { deckId: number; deckName: string; error: string }[]
}

/**
 * Create a basic NotionClient using environment variables.
 * This is a minimal implementation that only needs getPageContent for the backfill.
 */
function createNotionClient(): NotionClient {
  const apiKey = process.env.NOTION_API_KEY
  if (!apiKey) {
    throw new Error('NOTION_API_KEY environment variable is required for backfill')
  }

  // Import the Notion SDK dynamically to avoid hard dependency if not installed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require('@notionhq/client')
  const notion = new Client({ auth: apiKey })

  return {
    async getPageContent(pageId: string): Promise<string> {
      // Fetch all blocks from the page and convert to markdown
      const blocks: unknown[] = []
      let cursor: string | undefined = undefined

      do {
        const response: { results: unknown[]; has_more: boolean; next_cursor: string | null } =
          await notion.blocks.children.list({
            block_id: pageId,
            start_cursor: cursor,
            page_size: 100,
          })
        blocks.push(...response.results)
        cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined
      } while (cursor)

      return blocksToMarkdown(blocks)
    },
    // Stub implementations for unused methods
    async searchPages() { return [] },
    async createPage() { return { id: '' } },
    async updatePage() {},
    async appendContent() {},
    async replaceSectionContent() {},
    async insertContentAfterSection() {},
  }
}

/**
 * Convert Notion blocks to simplified markdown.
 * Handles the common block types found in deck documentation.
 */
function blocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = []

  for (const block of blocks) {
    const b = block as Record<string, unknown>
    const type = b.type as string

    switch (type) {
      case 'heading_1':
        lines.push(`# ${extractRichText(b.heading_1)}`)
        break
      case 'heading_2':
        lines.push(`## ${extractRichText(b.heading_2)}`)
        break
      case 'heading_3':
        lines.push(`### ${extractRichText(b.heading_3)}`)
        break
      case 'paragraph':
        lines.push(extractRichText(b.paragraph))
        break
      case 'bulleted_list_item':
        lines.push(`- ${extractRichText(b.bulleted_list_item)}`)
        break
      case 'numbered_list_item':
        lines.push(`1. ${extractRichText(b.numbered_list_item)}`)
        break
      case 'toggle':
        lines.push(`## ${extractRichText(b.toggle)}`)
        break
      case 'divider':
        lines.push('---')
        break
      default:
        // Skip unsupported block types
        break
    }
  }

  return lines.join('\n')
}

function extractRichText(blockContent: unknown): string {
  if (!blockContent || typeof blockContent !== 'object') return ''
  const content = blockContent as Record<string, unknown>
  const richText = content.rich_text as Array<{ plain_text: string }> | undefined
  if (!richText || !Array.isArray(richText)) return ''
  return richText.map(t => t.plain_text).join('')
}

async function main() {
  const dbPath = path.join(__dirname, '..', 'data', 'oracle.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  console.log('=== Backfill Notion Content to Local SQLite ===\n')

  // Read all rows from notion_deck_map, joined with decks for names
  const mappings = db.prepare(`
    SELECT ndm.deck_id, ndm.notion_page_id, ndm.last_synced_at, ndm.last_synced_fields,
           d.name AS deck_name
    FROM notion_deck_map ndm
    JOIN decks d ON d.id = ndm.deck_id
  `).all() as (NotionDeckMapRow & { deck_name: string })[]

  if (mappings.length === 0) {
    console.log('No mappings found in notion_deck_map. Nothing to backfill.')
    db.close()
    return
  }

  console.log(`Found ${mappings.length} deck-to-Notion mappings.\n`)

  // Initialize Notion client
  let client: NotionClient
  try {
    client = createNotionClient()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Failed to initialize Notion client: ${message}`)
    db.close()
    process.exit(1)
  }

  // Prepare statements
  const upsertDocStmt = db.prepare(`
    INSERT OR REPLACE INTO deck_documentation (
      deck_id, strategy_playstyle, synergy_lines, strengths_weaknesses,
      matchup_notes, mulligan_guide, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `)

  const insertNoteStmt = db.prepare(`
    INSERT INTO deck_notes (deck_id, content)
    SELECT ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM deck_notes WHERE deck_id = ? AND content = ?
    )
  `)

  const summary: BackfillSummary = {
    total: mappings.length,
    succeeded: 0,
    skipped: 0,
    failed: [],
  }

  for (const mapping of mappings) {
    const { deck_id, notion_page_id, deck_name } = mapping

    try {
      console.log(`Processing: ${deck_name} (deck_id=${deck_id}, page=${notion_page_id})`)

      // Fetch page content from Notion
      const pageContent = await client.getPageContent(notion_page_id)

      if (!pageContent || pageContent.trim().length === 0) {
        console.log(`  → No content found, skipping documentation write.`)
        summary.skipped++
        continue
      }

      // Parse sections and notes
      const parsed = parseNotionPageContent(pageContent)

      // Write documentation (INSERT OR REPLACE — idempotent)
      upsertDocStmt.run(
        deck_id,
        parsed.sections.strategy_playstyle,
        parsed.sections.synergy_lines,
        parsed.sections.strengths_weaknesses,
        parsed.sections.matchup_notes,
        parsed.sections.mulligan_guide
      )

      // Write notes (only insert if content doesn't already exist)
      let notesInserted = 0
      for (const note of parsed.notes) {
        const result = insertNoteStmt.run(deck_id, note, deck_id, note)
        if (result.changes > 0) notesInserted++
      }

      console.log(`  ✓ Documentation saved. Notes: ${parsed.notes.length} found, ${notesInserted} new.`)
      summary.succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ FAILED: ${message}`)
      summary.failed.push({ deckId: deck_id, deckName: deck_name, error: message })
    }
  }

  // Print summary
  console.log('\n=== Backfill Summary ===')
  console.log(`Total attempted: ${summary.total}`)
  console.log(`Succeeded:       ${summary.succeeded}`)
  console.log(`Skipped (empty): ${summary.skipped}`)
  console.log(`Failed:          ${summary.failed.length}`)

  if (summary.failed.length > 0) {
    console.log('\nFailed decks:')
    for (const f of summary.failed) {
      console.log(`  - ${f.deckName} (id=${f.deckId}): ${f.error}`)
    }
  }

  console.log('\nDone.')
  db.close()
}

// Only run main() when executed directly (not when imported for testing)
const isDirectExecution = require.main === module ||
  process.argv[1]?.endsWith('backfill-notion-to-local.ts')

if (isDirectExecution) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
