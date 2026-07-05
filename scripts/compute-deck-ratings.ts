/**
 * Compute deck ratings for all decks (or a single deck) and store in deck_ratings.
 * Reads deck_cards + card_metadata from SQLite, classifies cards, computes attribute
 * scores, selects key cards, generates primer, and identifies weaknesses.
 *
 * Run: npx tsx scripts/compute-deck-ratings.ts [deckId]
 */

import * as path from 'path'
import Database from 'better-sqlite3'
import {
  type CardData,
  type ContributingCards,
  type ScoringInputs,
  type DeckRatingsContent,
  type ScoringCategory,
  classifyCard,
  computeAttributeScores,
  selectKeyCards,
  generatePrimer,
  identifyWeaknesses,
} from '../src/lib/rating-engine'

// ---------------------------------------------------------------------------
// Database Setup
// ---------------------------------------------------------------------------

const DB_PATH = path.join(__dirname, '..', 'data', 'oracle.db')
const db = new Database(DB_PATH)

// ---------------------------------------------------------------------------
// Prepared Statements
// ---------------------------------------------------------------------------

const getDecks = db.prepare('SELECT id, name, commander_name FROM decks')
const getDeckById = db.prepare('SELECT id, name, commander_name FROM decks WHERE id = ?')

const getDeckCards = db.prepare(`
  SELECT card_name, quantity, categories, tags, is_commander
  FROM deck_cards
  WHERE deck_id = ?
    AND categories NOT LIKE '%Maybeboard%'
    AND categories NOT LIKE '%Sideboard%'
`)

const getCardMeta = db.prepare(
  'SELECT card_name, type_line, mana_cost, cmc FROM card_metadata WHERE card_name = ?'
)

const getDeckCombos = db.prepare('SELECT content FROM deck_combos WHERE deck_id = ?')

const upsertRatings = db.prepare(
  'INSERT OR REPLACE INTO deck_ratings (deck_id, content, generated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
)

// ---------------------------------------------------------------------------
// Types for DB rows
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
}

interface CardMetaRow {
  card_name: string
  type_line: string | null
  mana_cost: string | null
  cmc: number | null
}

interface ComboRow {
  content: string
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Determine commander card advantage flag from oracle text.
 * Since card_metadata doesn't store oracle_text, we use categories/type info
 * as a heuristic: check if the commander is in a Draw/Tutor category.
 * If oracle_text were available, we'd check for "draw", "search your library",
 * or "look at the top".
 */
function computeCommanderCardAdvantageFlag(commanderCard: CardData): 0 | 1 {
  const oracleText = commanderCard.oracleText.toLowerCase()
  if (
    oracleText.includes('draw') ||
    oracleText.includes('search your library') ||
    oracleText.includes('look at the top')
  ) {
    return 1
  }

  // Fallback: check categories
  let parsedCategories: string[] = []
  try {
    const parsed = JSON.parse(commanderCard.categories)
    if (Array.isArray(parsed)) {
      parsedCategories = parsed.map((c: string) => c.toLowerCase())
    }
  } catch { /* ignore */ }

  if (parsedCategories.includes('draw') || parsedCategories.includes('tutor')) {
    return 1
  }

  return 0
}

/**
 * Extract combo card names from deck_combos content.
 * The content is JSON: { combos: [{ cards: string[], result: string, bracket: string | null }] }
 */
function extractComboCards(deckId: number): string[] {
  const row = getDeckCombos.get(deckId) as ComboRow | undefined
  if (!row) return []

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
      return [...cardNames]
    }
  } catch { /* ignore malformed JSON */ }

  return []
}

/**
 * Check if a card is a land based on type line or categories.
 */
function isLand(typeLine: string, categories: string): boolean {
  if (typeLine.toLowerCase().includes('land')) return true
  try {
    const parsed = JSON.parse(categories)
    if (Array.isArray(parsed)) {
      return parsed.some((c: string) => c.toLowerCase() === 'land')
    }
  } catch { /* ignore */ }
  return false
}

/**
 * Build CardData[] from deck_cards joined with card_metadata.
 */
function buildCardDataList(deckId: number): CardData[] {
  const rows = getDeckCards.all(deckId) as DeckCardRow[]
  const cardDataList: CardData[] = []

  for (const row of rows) {
    const meta = getCardMeta.get(row.card_name) as CardMetaRow | undefined
    const qty = row.quantity || 1

    // Build a CardData for each copy (quantity)
    // For scoring purposes, we include unique cards once but track quantity for counting
    const cardData: CardData = {
      cardName: row.card_name,
      oracleText: '', // oracle_text not available in card_metadata schema
      typeLine: meta?.type_line ?? '',
      manaCost: meta?.mana_cost ?? '',
      cmc: meta?.cmc ?? 0,
      categories: row.categories ?? '[]',
      isCommander: Boolean(row.is_commander),
    }

    // Add one entry per quantity for accurate counting
    for (let i = 0; i < qty; i++) {
      cardDataList.push(cardData)
    }
  }

  return cardDataList
}

/**
 * Process a single deck, computing all rating data and writing to deck_ratings.
 * Returns true if successful, false if skipped or failed.
 */
function processDeck(deck: DeckRow): boolean {
  // Read deck cards
  const rawCards = getDeckCards.all(deck.id) as DeckCardRow[]
  if (rawCards.length === 0) {
    process.stderr.write(`  ⚠ Skipping "${deck.name}" (id=${deck.id}): no cards in deck_cards\n`)
    return false
  }

  // Build CardData list
  const allCards = buildCardDataList(deck.id)

  // Count non-land cards
  const nonLandCards = allCards.filter(
    (card) => !isLand(card.typeLine, card.categories)
  )
  const nonLandCount = nonLandCards.length

  // Check insufficient data threshold
  if (nonLandCount < 60) {
    // Default all scores to 5, set insufficientData: true
    const defaultContent: DeckRatingsContent = {
      scores: { consistency: 5, resilience: 5, interaction: 5, speed: 5 },
      contributingCards: {
        tutors: [],
        drawEngines: [],
        recursion: [],
        removal: [],
        counterspells: [],
        boardWipes: [],
        fastMana: [],
      },
      keyCards: [],
      primer: {
        coreStrategy: `${deck.commander_name ?? deck.name} deck has insufficient data for detailed analysis.`,
        mulliganPriorities: ['Keep hands with balanced lands and spells'],
        keyTips: [`Deploy ${deck.commander_name ?? 'your commander'} when you have protection or mana advantage`],
      },
      weaknesses: [],
      metadata: {
        nonLandCardCount: nonLandCount,
        insufficientData: true,
        warningMessage: `Deck has only ${nonLandCount} non-land cards (minimum 60 required for meaningful scoring)`,
      },
    }

    try {
      upsertRatings.run(deck.id, JSON.stringify(defaultContent))
      console.log(`  ✓ ${deck.name}: consistency=5 resilience=5 interaction=5 speed=5 (insufficient data)`)
      return true
    } catch (err) {
      console.log(`  ✗ ${deck.name} (id=${deck.id}): DB write failed — ${(err as Error).message}`)
      return false
    }
  }

  // --- Classify all cards and build ContributingCards ---
  const contributingCards: ContributingCards = {
    tutors: [],
    drawEngines: [],
    recursion: [],
    removal: [],
    counterspells: [],
    boardWipes: [],
    fastMana: [],
  }

  // Track unique cards (don't double-count same card name in contributing lists)
  const seen = new Map<string, ScoringCategory[]>()

  for (const card of allCards) {
    if (seen.has(card.cardName)) continue
    const categories = classifyCard(card)
    seen.set(card.cardName, categories)

    for (const cat of categories) {
      switch (cat) {
        case 'tutor':
          contributingCards.tutors.push(card.cardName)
          break
        case 'drawEngine':
          contributingCards.drawEngines.push(card.cardName)
          break
        case 'recursion':
          contributingCards.recursion.push(card.cardName)
          break
        case 'removal':
          contributingCards.removal.push(card.cardName)
          break
        case 'counterspell':
          contributingCards.counterspells.push(card.cardName)
          break
        case 'boardWipe':
          contributingCards.boardWipes.push(card.cardName)
          break
        case 'fastMana':
          contributingCards.fastMana.push(card.cardName)
          break
      }
    }
  }

  // --- Compute ScoringInputs ---
  const comboCards = extractComboCards(deck.id)

  // Count combo lines (distinct combos from deck_combos)
  let comboRedundancyCount = 0
  const comboRow = getDeckCombos.get(deck.id) as ComboRow | undefined
  if (comboRow) {
    try {
      const parsed = JSON.parse(comboRow.content)
      if (parsed && Array.isArray(parsed.combos)) {
        comboRedundancyCount = parsed.combos.length
      }
    } catch { /* ignore */ }
  }

  // Find commander card data
  const commanderCard = allCards.find((c) => c.isCommander)
  const commanderCmc = commanderCard?.cmc ?? 4
  const commanderCardAdvantageFlag = commanderCard
    ? computeCommanderCardAdvantageFlag(commanderCard)
    : 0

  // Commander dependency score: ratio of key cards that depend on commander
  // Heuristic: count cards referencing commander or that are primarily synergy
  // For now, use a simple estimate based on commander providing an engine
  const commanderDependencyScore = commanderCardAdvantageFlag === 1 ? 0.6 : 0.3

  // Compute average CMC of non-land cards
  const totalCmc = nonLandCards.reduce((sum, card) => sum + card.cmc, 0)
  const averageCmc = nonLandCount > 0 ? totalCmc / nonLandCount : 3

  // Fast mana count
  const fastManaCount = contributingCards.fastMana.length

  // Estimated fundamental turn: max(2, commander_cmc - min(fast_mana_count, commander_cmc - 1))
  const estimatedFundamentalTurn = Math.max(
    2,
    commanderCmc - Math.min(fastManaCount, commanderCmc - 1)
  )

  const scoringInputs: ScoringInputs = {
    tutorCount: contributingCards.tutors.length,
    drawEngineCount: contributingCards.drawEngines.length,
    commanderCardAdvantageFlag,
    recursionCount: contributingCards.recursion.length,
    comboRedundancyCount,
    commanderDependencyScore,
    removalPlusCounterspellCount:
      contributingCards.removal.length + contributingCards.counterspells.length,
    boardWipeCount: contributingCards.boardWipes.length,
    fastManaCount,
    averageCmc,
    estimatedFundamentalTurn,
    commanderCmc,
  }

  // --- Compute scores ---
  const scores = computeAttributeScores(scoringInputs)

  // --- Select key cards ---
  // De-duplicate allCards for key card selection (one entry per unique card name)
  const uniqueCards = [...new Map(allCards.map((c) => [c.cardName, c])).values()]
  const keyCards = selectKeyCards(uniqueCards, contributingCards, comboCards)

  // --- Generate primer ---
  const commanderName = deck.commander_name ?? deck.name
  const primer = generatePrimer(commanderName, uniqueCards, keyCards, scores)

  // --- Identify weaknesses ---
  const weaknesses = identifyWeaknesses(
    uniqueCards,
    contributingCards,
    scores,
    commanderName
  )

  // --- Build DeckRatingsContent ---
  const content: DeckRatingsContent = {
    scores,
    contributingCards,
    keyCards,
    primer,
    weaknesses,
    metadata: {
      nonLandCardCount: nonLandCount,
      insufficientData: false,
    },
  }

  // --- Write to database ---
  try {
    upsertRatings.run(deck.id, JSON.stringify(content))
    console.log(
      `  ✓ ${deck.name}: consistency=${scores.consistency} resilience=${scores.resilience} interaction=${scores.interaction} speed=${scores.speed}`
    )
    return true
  } catch (err) {
    console.log(
      `  ✗ ${deck.name} (id=${deck.id}): DB write failed — ${(err as Error).message}`
    )
    return false
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2)
  const deckIdArg = args[0]

  if (deckIdArg !== undefined) {
    // Process a single deck
    const deckId = parseInt(deckIdArg, 10)
    if (isNaN(deckId) || deckId <= 0) {
      process.stderr.write(`Error: Invalid deck ID "${deckIdArg}". Must be a positive integer.\n`)
      process.exit(1)
    }

    const deck = getDeckById.get(deckId) as DeckRow | undefined
    if (!deck) {
      process.stderr.write(`Error: Deck with ID ${deckId} not found.\n`)
      process.exit(1)
    }

    console.log(`Computing ratings for deck: ${deck.name} (id=${deck.id})`)
    processDeck(deck)
  } else {
    // Process all decks
    const decks = getDecks.all() as DeckRow[]
    console.log(`Computing ratings for ${decks.length} decks...\n`)

    let processed = 0
    for (const deck of decks) {
      if (processDeck(deck)) {
        processed++
      }
    }

    console.log(`\nDone: ${processed}/${decks.length} decks processed`)
  }

  db.close()
  process.exit(0)
}

main()
