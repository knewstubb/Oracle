#!/usr/bin/env npx tsx
/**
 * Detect dead weight cards in decks using EDHREC synergy data.
 *
 * Usage:
 *   npx tsx scripts/detect-dead-weight.ts [deckId]
 *
 * Without arguments: processes all decks.
 * With a deck ID: processes only that deck.
 *
 * For each deck:
 * 1. Clears existing dead weight flags
 * 2. Reads deck_cards + card_metadata + deck_strategy
 * 3. Fetches EDHREC synergy scores via MCP (rate-limited)
 * 4. Checks dismissals (skips dismissed cards)
 * 5. Classifies cards using pure logic (dead-weight-classifier)
 * 6. Writes flags back to deck_cards
 *
 * On MCP failure: skips the card, logs warning to stderr, continues.
 * Logs deck name + flagged card counts by category to stdout.
 */

import * as path from 'path'
import Database from 'better-sqlite3'
import { ConcurrencyLimiter } from '../src/lib/concurrency-limiter'
import { getMcpClient, closeMcpClient } from '../src/lib/mcp-client'
import {
  classifyDeadWeight,
  DEFAULT_CATEGORY_TARGETS,
  type DeadWeightResult,
  type FormatRules,
} from '../src/lib/dead-weight-classifier'

// ---------------------------------------------------------------------------
// Database Setup
// ---------------------------------------------------------------------------

const DB_PATH = path.join(__dirname, '..', 'data', 'oracle.db')
const db = new Database(DB_PATH)

// ---------------------------------------------------------------------------
// MCP Integration
// ---------------------------------------------------------------------------

let mcpAvailable = false

/**
 * Initialize the MCP client. Returns true if successful.
 */
async function initMcp(): Promise<boolean> {
  try {
    await getMcpClient()
    mcpAvailable = true
    return true
  } catch (err) {
    process.stderr.write(
      `  ⚠ Failed to initialize MCP client: ${(err as Error).message}\n`
    )
    process.stderr.write('  ⚠ Running without MCP — synergy scores will be unavailable\n')
    mcpAvailable = false
    return false
  }
}

/**
 * Fetch EDHREC synergy score for a card via the MTG MCP server.
 * Returns the synergy percentage (0-100) or null on failure.
 */
async function fetchSynergyScore(
  commanderName: string,
  cardName: string,
  limiter: ConcurrencyLimiter
): Promise<number | null> {
  if (!mcpAvailable) return null

  return limiter.execute(async () => {
    try {
      const client = await getMcpClient()
      const result = await client.callTool({
        name: 'edhrec_card_synergy',
        arguments: { card_name: cardName, commander_name: commanderName },
      })

      if (result.isError) {
        process.stderr.write(
          `  ⚠ MCP error for "${cardName}": tool returned error\n`
        )
        return null
      }

      // Parse text content from MCP response
      const textParts = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)

      const rawText = textParts.join('\n')

      // Try to parse as JSON
      try {
        const parsed = JSON.parse(rawText)
        if (typeof parsed.synergy === 'number') return parsed.synergy
        if (typeof parsed.synergy_score === 'number') return parsed.synergy_score
      } catch {
        // Try to extract synergy from text patterns like "Synergy: 45%"
        const match = rawText.match(/synergy[:\s]+(-?\d+)/i)
        if (match) return parseInt(match[1], 10)
      }

      return null
    } catch (err) {
      process.stderr.write(
        `  ⚠ MCP failure for "${cardName}" with "${commanderName}": ${(err as Error).message}\n`
      )
      return null
    }
  })
}

// ---------------------------------------------------------------------------
// Prepared Statements
// ---------------------------------------------------------------------------

const getDecks = db.prepare('SELECT id, name, commander_name FROM decks')
const getDeckById = db.prepare('SELECT id, name, commander_name FROM decks WHERE id = ?')

const getDeckCards = db.prepare(`
  SELECT dc.card_name, dc.quantity, dc.categories, dc.tags, dc.is_commander,
         cm.type_line, cm.rarity, cm.cmc
  FROM deck_cards dc
  LEFT JOIN card_metadata cm ON cm.card_name = dc.card_name
  WHERE dc.deck_id = ?
    AND dc.categories NOT LIKE '%Maybeboard%'
    AND dc.categories NOT LIKE '%Sideboard%'
`)

const getStrategy = db.prepare('SELECT * FROM deck_strategy WHERE deck_id = ?')

const getDismissals = db.prepare(
  'SELECT card_name FROM dead_weight_dismissals WHERE deck_id = ?'
)

const clearFlags = db.prepare(
  'UPDATE deck_cards SET dead_weight_flag = NULL, dead_weight_reason = NULL WHERE deck_id = ?'
)

const writeFlag = db.prepare(
  'UPDATE deck_cards SET dead_weight_flag = ?, dead_weight_reason = ? WHERE deck_id = ? AND card_name = ?'
)

// Check if deck_combos table exists
let getDeckCombos: Database.Statement | null = null
try {
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='deck_combos'"
  ).get()
  if (tableCheck) {
    getDeckCombos = db.prepare('SELECT content FROM deck_combos WHERE deck_id = ?')
  }
} catch {
  // Table doesn't exist, that's fine
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeckRow {
  id: number
  name: string
  commander_name: string | null
}

interface DeckCardRow {
  card_name: string
  quantity: number
  categories: string | null
  tags: string | null
  is_commander: number | boolean
  type_line: string | null
  rarity: string | null
  cmc: number | null
}

interface StrategyRow {
  deck_id: number
  win_condition: string | null
  table_context: string | null
  bracket: number | null
  budget_mode: string | null
  budget_ceiling: number | null
  frustration: string | null
  strategy_notes: string | null
  format_rules: string | null
  updated_at: string | null
}

interface ComboRow {
  content: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a card is a land based on type_line or categories.
 */
function isLand(typeLine: string | null, categories: string | null): boolean {
  if (typeLine && typeLine.toLowerCase().includes('land')) return true
  if (categories) {
    try {
      const parsed = JSON.parse(categories)
      if (Array.isArray(parsed)) {
        return parsed.some((c: string) => c.toLowerCase() === 'land')
      }
    } catch { /* ignore */ }
  }
  return false
}

/**
 * Extract combo card names from deck_combos content.
 */
function extractComboCards(deckId: number): Set<string> {
  if (!getDeckCombos) return new Set()

  const row = getDeckCombos.get(deckId) as ComboRow | undefined
  if (!row) return new Set()

  try {
    const parsed = JSON.parse(row.content)
    if (parsed && Array.isArray(parsed.combos)) {
      const cardNames = new Set<string>()
      for (const combo of parsed.combos) {
        if (Array.isArray(combo.cards)) {
          for (const card of combo.cards) {
            cardNames.add(card)
          }
        }
      }
      return cardNames
    }
  } catch { /* ignore malformed JSON */ }

  return new Set()
}

/**
 * Parse categories JSON string into an array of category names.
 */
function parseCategories(categories: string | null): string[] {
  if (!categories) return []
  try {
    const parsed = JSON.parse(categories)
    if (Array.isArray(parsed)) return parsed
  } catch { /* ignore */ }
  return []
}

/**
 * Parse format_rules JSON from strategy table.
 */
function parseFormatRules(formatRulesJson: string | null): FormatRules | null {
  if (!formatRulesJson) return null
  try {
    const parsed = JSON.parse(formatRulesJson)
    if (parsed && typeof parsed === 'object' && parsed.format_name) {
      return parsed as FormatRules
    }
  } catch { /* ignore */ }
  return null
}

/**
 * Build category count map: how many cards are in each category for this deck.
 */
function buildCategoryCounts(cards: DeckCardRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const card of cards) {
    if (isLand(card.type_line, card.categories)) continue
    const cats = parseCategories(card.categories)
    for (const cat of cats) {
      counts.set(cat, (counts.get(cat) || 0) + (card.quantity || 1))
    }
  }
  return counts
}

// ---------------------------------------------------------------------------
// Core Processing
// ---------------------------------------------------------------------------

/**
 * Process a single deck: fetch synergy, classify, write flags.
 */
async function processDeck(deck: DeckRow, limiter: ConcurrencyLimiter): Promise<void> {
  const commanderName = deck.commander_name
  if (!commanderName) {
    process.stderr.write(`  ⚠ Skipping "${deck.name}" (id=${deck.id}): no commander\n`)
    return
  }

  // Read deck cards with metadata
  const allCards = getDeckCards.all(deck.id) as DeckCardRow[]
  if (allCards.length === 0) {
    process.stderr.write(`  ⚠ Skipping "${deck.name}" (id=${deck.id}): no cards\n`)
    return
  }

  // Read strategy
  const strategy = getStrategy.get(deck.id) as StrategyRow | undefined
  const bracket = strategy?.bracket ?? null
  const formatRules = parseFormatRules(strategy?.format_rules ?? null)

  // Get dismissed cards
  const dismissals = new Set(
    (getDismissals.all(deck.id) as { card_name: string }[]).map((r) => r.card_name)
  )

  // Get combo cards
  const comboCards = extractComboCards(deck.id)

  // Clear existing flags before recompute
  clearFlags.run(deck.id)

  // Filter to non-land, non-commander cards for processing
  const nonLandCards = allCards.filter(
    (card) => !isLand(card.type_line, card.categories) && !card.is_commander
  )

  // Build category counts for redundancy detection
  const categoryCounts = buildCategoryCounts(allCards)

  // Build category targets map
  const categoryTargets = new Map<string, number>(
    Object.entries(DEFAULT_CATEGORY_TARGETS)
  )

  // Fetch synergy scores for non-land cards via MCP
  const synergyScores = new Map<string, number>()

  if (mcpAvailable) {
    console.log(`  Fetching synergy scores for ${nonLandCards.length} cards...`)
    for (const card of nonLandCards) {
      // Skip dismissed cards (no need to fetch synergy)
      if (dismissals.has(card.card_name)) continue

      const score = await fetchSynergyScore(commanderName, card.card_name, limiter)
      if (score !== null) {
        synergyScores.set(card.card_name, score)
      }
    }
  }

  // Classify each non-land card
  const results: DeadWeightResult[] = []
  const flagCounts: Record<string, number> = {
    redundant: 0,
    off_strategy: 0,
    bracket_mismatch: 0,
    format_violation: 0,
  }

  for (const card of nonLandCards) {
    // Skip dismissed cards
    if (dismissals.has(card.card_name)) continue

    const synergyScore = synergyScores.get(card.card_name)

    // If we have no synergy data and no format rules, we can't classify
    if (synergyScore === undefined && !formatRules) continue

    // Build per-card category count (for this card's categories)
    const cardCategories = parseCategories(card.categories)
    const cardCategoryCount = new Map<string, number>()
    for (const cat of cardCategories) {
      const count = categoryCounts.get(cat)
      if (count !== undefined) {
        cardCategoryCount.set(cat, count)
      }
    }

    const result = classifyDeadWeight(
      card.card_name,
      synergyScore ?? 50, // Default to 50 if no synergy data available
      cardCategoryCount,
      categoryTargets,
      comboCards,
      bracket,
      formatRules,
      card.rarity
    )

    if (result) {
      results.push(result)
      flagCounts[result.flag]++
    }
  }

  // Write flags to database in a transaction
  const writeTransaction = db.transaction((flagResults: DeadWeightResult[]) => {
    for (const result of flagResults) {
      writeFlag.run(result.flag, result.reason, deck.id, result.cardName)
    }
  })

  writeTransaction(results)

  // Log results to stdout
  const totalFlagged = results.length
  const flagSummary = Object.entries(flagCounts)
    .filter(([_, count]) => count > 0)
    .map(([flag, count]) => `${flag}: ${count}`)
    .join(', ')

  if (totalFlagged > 0) {
    console.log(`  ✓ ${deck.name}: ${totalFlagged} flagged (${flagSummary})`)
  } else {
    console.log(`  ✓ ${deck.name}: no dead weight detected`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const deckIdArg = args[0]

  // Initialize MCP client
  await initMcp()

  const limiter = new ConcurrencyLimiter(500)

  if (deckIdArg !== undefined) {
    // Process a single deck
    const deckId = parseInt(deckIdArg, 10)
    if (isNaN(deckId) || deckId <= 0) {
      process.stderr.write(
        `Error: Invalid deck ID "${deckIdArg}". Must be a positive integer.\n`
      )
      process.exit(1)
    }

    const deck = getDeckById.get(deckId) as DeckRow | undefined
    if (!deck) {
      process.stderr.write(`Error: Deck with ID ${deckId} not found.\n`)
      process.exit(1)
    }

    console.log(`Detecting dead weight for deck: ${deck.name} (id=${deck.id})`)
    await processDeck(deck, limiter)
  } else {
    // Process all decks
    const decks = getDecks.all() as DeckRow[]
    console.log(`Detecting dead weight for ${decks.length} decks...\n`)

    let processed = 0
    for (const deck of decks) {
      await processDeck(deck, limiter)
      processed++
    }

    console.log(`\nDone: ${processed}/${decks.length} decks processed`)
  }

  // Cleanup MCP client
  try {
    await closeMcpClient()
  } catch { /* ignore cleanup errors */ }

  db.close()
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${(err as Error).message}\n`)
  db.close()
  process.exit(1)
})
