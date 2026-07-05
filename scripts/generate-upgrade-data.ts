#!/usr/bin/env npx tsx
/**
 * Generate verified upgrade strategy data for a deck, with pairing and budget logic.
 *
 * Usage:
 *   npx tsx scripts/generate-upgrade-data.ts <deck_id> [--all]
 *   npx tsx scripts/generate-upgrade-data.ts --all
 *
 * This script:
 * 1. Reads the deck from the local SQLite database
 * 2. Reads dead weight flags for pairing with cuts
 * 3. Cross-references upgrade candidates against collection for ownership
 * 4. Fetches EDHREC synergy and candidate data via MCP (rate-limited)
 * 5. Pairs upgrades with dead weight cuts using pairUpgradesWithCuts
 * 6. Applies budget filtering based on deck strategy (defaults to unrestricted)
 * 7. Applies format constraints using applyFormatConstraints
 * 8. Sorts with sortUpgrades (owned first, then synergy descending)
 * 9. Writes extended data to deck_upgrades table
 *
 * Entry point: npx tsx scripts/generate-upgrade-data.ts <deckId> [--all]
 */

import * as path from 'path'
import Database from 'better-sqlite3'
import { ConcurrencyLimiter } from '../src/lib/concurrency-limiter'
import { getMcpClient, closeMcpClient } from '../src/lib/mcp-client'
import {
  pairUpgradesWithCuts,
  applyBudgetFilter,
  applyFormatConstraints,
  sortUpgrades,
  type UpgradeCandidate,
  type PairedUpgrade,
} from '../src/lib/upgrade-pairing'
import type { DeadWeightResult, FormatRules } from '../src/lib/dead-weight-classifier'

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
    process.stderr.write('  ⚠ Running without MCP — EDHREC data will be unavailable\n')
    mcpAvailable = false
    return false
  }
}

/**
 * Fetch EDHREC commander staples via MCP to get upgrade candidates.
 * Returns an array of candidate cards with synergy scores.
 */
async function fetchUpgradeCandidates(
  commanderName: string,
  limiter: ConcurrencyLimiter
): Promise<{ cardName: string; synergy: number; role: string; reason: string }[]> {
  if (!mcpAvailable) return []

  return limiter.execute(async () => {
    try {
      const client = await getMcpClient()
      const result = await client.callTool({
        name: 'edhrec_commander_staples',
        arguments: { commander_name: commanderName },
      })

      if (result.isError) {
        process.stderr.write(`  ⚠ MCP error fetching staples for "${commanderName}"\n`)
        return []
      }

      const textParts = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)

      const rawText = textParts.join('\n')
      const candidates: { cardName: string; synergy: number; role: string; reason: string }[] = []

      // Try JSON parse first
      try {
        const parsed = JSON.parse(rawText)
        if (parsed && Array.isArray(parsed.staples ?? parsed.cards)) {
          const items = parsed.staples ?? parsed.cards
          for (const item of items) {
            candidates.push({
              cardName: String(item.name ?? item.card_name ?? ''),
              synergy: Number(item.synergy ?? item.synergy_score ?? 0),
              role: String(item.category ?? item.role ?? 'Synergy'),
              reason: `EDHREC staple — ${item.inclusion ?? item.inclusion_rate ?? '?'}% inclusion`,
            })
          }
          return candidates.filter((c) => c.cardName.length > 0)
        }
      } catch {
        // Fall through to text parsing
      }

      // Parse markdown: "1. **Card Name** — Synergy: X%, Inclusion: Y%"
      for (const line of rawText.split('\n')) {
        const match = line.match(
          /^\s*(?:\d+\.\s*)?\*?\*?(.+?)\*?\*?\s*[—\-–]\s*(?:Synergy:\s*(-?\d+)%?)?/i
        )
        if (match && match[1]) {
          const cardName = match[1].replace(/\*+/g, '').trim()
          const synergy = match[2] ? parseInt(match[2], 10) : 50
          if (cardName.length > 0) {
            candidates.push({
              cardName,
              synergy,
              role: 'Synergy',
              reason: 'EDHREC staple',
            })
          }
        }
      }

      return candidates
    } catch (err) {
      process.stderr.write(
        `  ⚠ MCP failure fetching staples for "${commanderName}": ${(err as Error).message}\n`
      )
      return []
    }
  })
}

/**
 * Fetch price data for a card via MCP.
 */
async function fetchCardPrice(
  cardName: string,
  limiter: ConcurrencyLimiter
): Promise<number | null> {
  if (!mcpAvailable) return null

  return limiter.execute(async () => {
    try {
      const client = await getMcpClient()
      const result = await client.callTool({
        name: 'scryfall_card_price',
        arguments: { name: cardName },
      })

      if (result.isError) return null

      const textParts = (result.content as { type: string; text?: string }[])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)

      const rawText = textParts.join('\n')

      // Try JSON parse
      try {
        const parsed = JSON.parse(rawText)
        const price = parsed.usd ?? parsed.price ?? parsed.prices?.usd
        if (price !== undefined && price !== null) return parseFloat(String(price))
      } catch {
        // Try text pattern: "$1.23" or "USD: 1.23"
        const priceMatch = rawText.match(/\$?([\d.]+)/)
        if (priceMatch) return parseFloat(priceMatch[1])
      }

      return null
    } catch {
      return null
    }
  })
}

// ---------------------------------------------------------------------------
// Prepared Statements
// ---------------------------------------------------------------------------

const getDecks = db.prepare('SELECT id, name, commander_name FROM decks')
const getDeckById = db.prepare('SELECT id, name, commander_name, colour_identity FROM decks WHERE id = ?')

const getDeckCards = db.prepare(
  'SELECT card_name FROM deck_cards WHERE deck_id = ?'
)

const getDeadWeightCards = db.prepare(`
  SELECT card_name, dead_weight_flag, dead_weight_reason
  FROM deck_cards
  WHERE deck_id = ? AND dead_weight_flag IS NOT NULL
`)

const getCollectionOwnership = db.prepare(`
  SELECT card_name, SUM(quantity) as qty FROM collection GROUP BY card_name
`)

const getStrategy = db.prepare('SELECT * FROM deck_strategy WHERE deck_id = ?')

const upsertUpgrade = db.prepare(`
  INSERT INTO deck_upgrades (deck_id, content, generated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(deck_id) DO UPDATE SET
    content = excluded.content,
    generated_at = excluded.generated_at
`)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeckRow {
  id: number
  name: string
  commander_name: string | null
  colour_identity: string | null
}

interface DeadWeightRow {
  card_name: string
  dead_weight_flag: string
  dead_weight_reason: string | null
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Build a Set of all owned card names from the collection table.
 */
function buildOwnershipMap(): Map<string, number> {
  const rows = getCollectionOwnership.all() as { card_name: string; qty: number }[]
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.card_name, row.qty)
  }
  return map
}

// ---------------------------------------------------------------------------
// Core Processing
// ---------------------------------------------------------------------------

/**
 * Process a single deck: fetch candidates, cross-reference ownership, pair with
 * dead weight cuts, apply budget/format filtering, sort, and write to DB.
 */
async function processDeck(deck: DeckRow, limiter: ConcurrencyLimiter): Promise<void> {
  const commanderName = deck.commander_name
  if (!commanderName) {
    process.stderr.write(`  ⚠ Skipping "${deck.name}" (id=${deck.id}): no commander\n`)
    return
  }

  // 1. Read current deck cards (to filter out candidates already in deck)
  const deckCardRows = getDeckCards.all(deck.id) as { card_name: string }[]
  const deckCardSet = new Set(deckCardRows.map((r) => r.card_name))

  // 2. Read dead weight flags for pairing
  const deadWeightRows = getDeadWeightCards.all(deck.id) as DeadWeightRow[]
  const deadWeightCards: DeadWeightResult[] = deadWeightRows.map((r) => ({
    cardName: r.card_name,
    flag: r.dead_weight_flag as DeadWeightResult['flag'],
    reason: r.dead_weight_reason || '',
  }))

  // 3. Read collection ownership
  const ownershipMap = buildOwnershipMap()

  // 4. Read strategy (budget mode + format rules)
  const strategy = getStrategy.get(deck.id) as StrategyRow | undefined
  const budgetMode = (strategy?.budget_mode as 'collection' | 'budget' | 'unrestricted') || 'unrestricted'
  const budgetCeiling = strategy?.budget_ceiling ?? null
  const formatRules = parseFormatRules(strategy?.format_rules ?? null)

  // 5. Fetch EDHREC candidates via MCP
  console.log(`  Fetching EDHREC candidates for "${commanderName}"...`)
  const rawCandidates = await fetchUpgradeCandidates(commanderName, limiter)

  if (rawCandidates.length === 0 && mcpAvailable) {
    console.log(`  ⚠ No candidates found for "${deck.name}" — writing empty result`)
  }

  // 6. Filter out cards already in the deck
  const filteredCandidates = rawCandidates.filter(
    (c) => !deckCardSet.has(c.cardName)
  )

  // 7. Cross-reference ownership and fetch prices for unowned cards
  console.log(`  Cross-referencing ${filteredCandidates.length} candidates against collection...`)
  const upgradeCandidates: UpgradeCandidate[] = []

  for (const candidate of filteredCandidates) {
    const ownedQty = ownershipMap.get(candidate.cardName) ?? 0
    const owned = ownedQty >= 1

    // Fetch price for unowned cards (or all if unrestricted)
    let price: number | null = null
    if (!owned) {
      price = await fetchCardPrice(candidate.cardName, limiter)
    }

    upgradeCandidates.push({
      cardName: candidate.cardName,
      role: candidate.role,
      synergyScore: candidate.synergy,
      reason: candidate.reason,
      owned,
      price,
    })
  }

  // 8. Pair upgrades with dead weight cuts
  console.log(`  Pairing ${upgradeCandidates.length} upgrades with ${deadWeightCards.length} dead weight cuts...`)
  const paired = pairUpgradesWithCuts(upgradeCandidates, deadWeightCards)

  // 9. Apply budget filtering
  const budgetFiltered = applyBudgetFilter(paired, budgetMode, budgetCeiling)

  // 10. Apply format constraints
  const existingSwapCount = 0 // No prior swaps tracked yet
  const existingAddedValue = 0
  const { accepted: formatFiltered, rejected: formatViolations } = applyFormatConstraints(
    budgetFiltered,
    formatRules,
    existingSwapCount,
    existingAddedValue
  )

  // 11. Sort: owned first, then synergy descending
  const sorted = sortUpgrades(formatFiltered)

  // 12. Write to deck_upgrades table
  const content = JSON.stringify({
    deckId: deck.id,
    deckName: deck.name,
    commander: commanderName,
    budgetMode,
    budgetCeiling,
    generatedAt: new Date().toISOString(),
    totalCandidates: rawCandidates.length,
    filteredFromDeck: rawCandidates.length - filteredCandidates.length,
    formatViolations,
    upgrades: sorted.map((u: PairedUpgrade) => ({
      cardName: u.cardName,
      role: u.role,
      synergyScore: u.synergyScore,
      reason: u.reason,
      owned: u.owned,
      price: u.price,
      suggestedCut: u.suggestedCut,
      cutFlag: u.cutFlag,
    })),
  })

  upsertUpgrade.run(deck.id, content)

  // Log results
  const ownedCount = sorted.filter((u) => u.owned).length
  const unownedCount = sorted.length - ownedCount
  const cutPairings = sorted.filter((u) => u.suggestedCut).length

  console.log(
    `  ✓ ${deck.name}: ${sorted.length} upgrades (${ownedCount} owned, ${unownedCount} to buy), ` +
    `${cutPairings} paired with cuts` +
    (formatViolations.length > 0 ? `, ${formatViolations.length} excluded by format rules` : '')
  )
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const all = args.includes('--all')
  const deckIdArg = args.find((a) => a !== '--all')

  if (!all && !deckIdArg) {
    console.error('Usage: npx tsx scripts/generate-upgrade-data.ts <deck_id> [--all]')
    console.error('       npx tsx scripts/generate-upgrade-data.ts --all')
    process.exit(1)
  }

  if (!all) {
    const deckId = parseInt(deckIdArg!, 10)
    if (isNaN(deckId) || deckId <= 0) {
      console.error(`Error: Invalid deck ID "${deckIdArg}". Must be a positive integer.`)
      process.exit(1)
    }
  }

  // Initialize MCP client
  await initMcp()

  const limiter = new ConcurrencyLimiter(500)

  if (all) {
    // Process all decks
    const decks = getDecks.all() as DeckRow[]
    console.log(`Generating upgrade data for ${decks.length} decks...\n`)

    let processed = 0
    for (const deck of decks) {
      console.log(`Processing: ${deck.name} (id=${deck.id})`)
      await processDeck(deck as DeckRow, limiter)
      processed++
      console.log('')
    }

    console.log(`Done: ${processed}/${decks.length} decks processed`)
  } else {
    // Process a single deck
    const deckId = parseInt(deckIdArg!, 10)
    const deck = getDeckById.get(deckId) as DeckRow | undefined
    if (!deck) {
      console.error(`Error: Deck with ID ${deckId} not found.`)
      process.exit(1)
    }

    console.log(`Generating upgrade data for: ${deck.name} (id=${deck.id})\n`)
    await processDeck(deck, limiter)
  }

  // Cleanup
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
