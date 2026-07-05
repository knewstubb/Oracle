// rating-engine.ts — Pure scoring logic for deck ratings computation.
// No database dependencies; this module is imported by the compute script and tests.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoringInputs {
  tutorCount: number
  drawEngineCount: number
  commanderCardAdvantageFlag: 0 | 1
  recursionCount: number
  comboRedundancyCount: number
  commanderDependencyScore: number // 0-1
  removalPlusCounterspellCount: number
  boardWipeCount: number
  fastManaCount: number
  averageCmc: number
  estimatedFundamentalTurn: number
  commanderCmc: number
}

export interface AttributeScores {
  consistency: number // 1-10
  resilience: number // 1-10
  interaction: number // 1-10
  speed: number // 1-10
}

export interface ContributingCards {
  tutors: string[]
  drawEngines: string[]
  recursion: string[]
  removal: string[]
  counterspells: string[]
  boardWipes: string[]
  fastMana: string[]
}

export interface CardData {
  cardName: string
  oracleText: string
  typeLine: string
  manaCost: string
  cmc: number
  categories: string // JSON array from deck_cards
  isCommander: boolean
}

export type ScoringCategory =
  | 'tutor'
  | 'drawEngine'
  | 'recursion'
  | 'removal'
  | 'counterspell'
  | 'boardWipe'
  | 'fastMana'

export interface KeyCard {
  cardName: string
  reason: string // max 150 chars
  priorityTier: 'commander' | 'combo' | 'multi-category' | 'synergy'
}

export interface Primer {
  coreStrategy: string // 2-3 sentences
  mulliganPriorities: string[] // 3-5 items, each <= 30 words
  keyTips: string[] // 3-5 items, each <= 30 words
}

export type WeaknessSeverity = 'Critical' | 'Moderate' | 'Minor'

export interface Weakness {
  description: string
  severity: WeaknessSeverity
  hateCards: string[]
}

export interface DeckRatingsContent {
  scores: AttributeScores
  contributingCards: ContributingCards
  keyCards: KeyCard[]
  primer: Primer
  weaknesses: Weakness[]
  metadata: {
    nonLandCardCount: number
    insufficientData: boolean
    warningMessage?: string
  }
}

// ---------------------------------------------------------------------------
// Weakness Detection Constants
// ---------------------------------------------------------------------------

const GRAVEYARD_HATE_CARDS = [
  'Rest in Peace',
  "Grafdigger's Cage",
  'Leyline of the Void',
  "Tormod's Crypt",
]

const COMMANDER_HATE_CARDS = [
  'Darksteel Mutation',
  'Imprisoned in the Moon',
  'Song of the Dryads',
  'Lignify',
]

const LOW_INTERACTION_THREATS = ['Stax pieces', 'fast combo decks']

const SLOW_SPEED_THREATS = ['Aggressive decks', 'fast combo']

const SINGLE_WIN_CON_HATE_CARDS = [
  'Surgical Extraction',
  "Praetor's Grasp",
  'Thought Erasure',
]

const ARTIFACT_HATE_CARDS = [
  'Collector Ouphe',
  'Null Rod',
  'Stony Silence',
  'Vandalblast',
]

// ---------------------------------------------------------------------------
// Card Classification
// ---------------------------------------------------------------------------

const MANA_SYMBOL_PATTERN = /\{[WUBRGC]\}/

/**
 * Classify a card into zero or more scoring categories based on its oracle text,
 * type line, CMC, and user-assigned categories from Archidekt.
 */
export function classifyCard(card: CardData): ScoringCategory[] {
  const categories: ScoringCategory[] = []
  const oracleText = card.oracleText.toLowerCase()
  const typeLine = card.typeLine.toLowerCase()

  // Parse the JSON categories array from deck_cards
  let parsedCategories: string[] = []
  try {
    const parsed = JSON.parse(card.categories)
    if (Array.isArray(parsed)) {
      parsedCategories = parsed.map((c: string) => c.toLowerCase())
    }
  } catch {
    // If categories is not valid JSON, treat as empty
  }

  // Tutor: oracle_text contains "search your library" OR categories includes "Tutor"
  if (oracleText.includes('search your library') || parsedCategories.includes('tutor')) {
    categories.push('tutor')
  }

  // Draw Engine: categories includes "Draw" OR oracle_text contains "draw a card"
  if (parsedCategories.includes('draw') || oracleText.includes('draw a card')) {
    categories.push('drawEngine')
  }

  // Recursion: (oracle_text contains "return" AND "from your graveyard") OR categories includes "Recursion"
  if (
    (oracleText.includes('return') && oracleText.includes('from your graveyard')) ||
    parsedCategories.includes('recursion')
  ) {
    categories.push('recursion')
  }

  // Removal: categories includes "Removal"
  if (parsedCategories.includes('removal')) {
    categories.push('removal')
  }

  // Counterspell: type_line contains "Instant" AND oracle_text contains "counter target"
  if (typeLine.includes('instant') && oracleText.includes('counter target')) {
    categories.push('counterspell')
  }

  // Board Wipe: oracle_text contains "destroy all" OR "exile all" OR categories includes "Board Wipe"
  if (
    oracleText.includes('destroy all') ||
    oracleText.includes('exile all') ||
    parsedCategories.includes('board wipe')
  ) {
    categories.push('boardWipe')
  }

  // Fast Mana: cmc ≤ 2 AND (categories includes "Ramp" OR (oracle_text contains "add" AND matches mana symbol pattern))
  if (card.cmc <= 2) {
    if (
      parsedCategories.includes('ramp') ||
      (oracleText.includes('add') && MANA_SYMBOL_PATTERN.test(card.oracleText))
    ) {
      categories.push('fastMana')
    }
  }

  return categories
}

// ---------------------------------------------------------------------------
// Score Interpolation
// ---------------------------------------------------------------------------

/**
 * Map a raw weighted sum to a 1–10 integer using linear interpolation,
 * floor rounding, and clamping.
 *
 * Formula:
 *   normalized = (raw - min) / (max - min)
 *   scaled = 1 + normalized * 9
 *   return clamp(floor(scaled), 1, 10)
 */
export function interpolateScore(
  rawSum: number,
  minThreshold: number,
  maxThreshold: number
): number {
  const normalized = (rawSum - minThreshold) / (maxThreshold - minThreshold)
  const scaled = 1 + normalized * 9
  return Math.max(1, Math.min(10, Math.floor(scaled)))
}

// ---------------------------------------------------------------------------
// Raw Score Computations
// ---------------------------------------------------------------------------

/**
 * Compute the Consistency weighted sum.
 * Formula: tutorCount × 2 + drawEngineCount × 1 + commanderCardAdvantageFlag × 3
 */
export function computeConsistencyRaw(
  inputs: Pick<ScoringInputs, 'tutorCount' | 'drawEngineCount' | 'commanderCardAdvantageFlag'>
): number {
  return inputs.tutorCount * 2 + inputs.drawEngineCount * 1 + inputs.commanderCardAdvantageFlag * 3
}

/**
 * Compute the Resilience weighted sum.
 * Formula: recursionCount × 1.5 + comboRedundancyCount × 3 + (1 - commanderDependencyScore) × 4
 */
export function computeResilienceRaw(
  inputs: Pick<ScoringInputs, 'recursionCount' | 'comboRedundancyCount' | 'commanderDependencyScore'>
): number {
  return (
    inputs.recursionCount * 1.5 +
    inputs.comboRedundancyCount * 3 +
    (1 - inputs.commanderDependencyScore) * 4
  )
}

/**
 * Compute the Interaction weighted sum.
 * Formula: removalPlusCounterspellCount × 1 + Math.min(boardWipeCount, 4) × 2
 */
export function computeInteractionRaw(
  inputs: Pick<ScoringInputs, 'removalPlusCounterspellCount' | 'boardWipeCount'>
): number {
  return inputs.removalPlusCounterspellCount * 1 + Math.min(inputs.boardWipeCount, 4) * 2
}

/**
 * Compute the Speed weighted sum (inverse — lower CMC and turn = higher score).
 * Formula: fastManaCount × 1.5 + Math.max(0, 5 - averageCmc) × 2 + Math.max(0, 5 - estimatedFundamentalTurn) × 2
 */
export function computeSpeedRaw(
  inputs: Pick<ScoringInputs, 'fastManaCount' | 'averageCmc' | 'estimatedFundamentalTurn'>
): number {
  return (
    inputs.fastManaCount * 1.5 +
    Math.max(0, 5 - inputs.averageCmc) * 2 +
    Math.max(0, 5 - inputs.estimatedFundamentalTurn) * 2
  )
}

// ---------------------------------------------------------------------------
// Attribute Score Computation
// ---------------------------------------------------------------------------

/**
 * Compute all four attribute scores from scoring inputs.
 * Each raw weighted sum is passed through interpolateScore with defined
 * min/max thresholds per attribute.
 */
export function computeAttributeScores(inputs: ScoringInputs): AttributeScores {
  const consistencyRaw = computeConsistencyRaw(inputs)
  const resilienceRaw = computeResilienceRaw(inputs)
  const interactionRaw = computeInteractionRaw(inputs)
  const speedRaw = computeSpeedRaw(inputs)

  return {
    consistency: interpolateScore(consistencyRaw, 0, 15),
    resilience: interpolateScore(resilienceRaw, 0, 12),
    interaction: interpolateScore(interactionRaw, 0, 14),
    speed: interpolateScore(speedRaw, 0, 15),
  }
}

// ---------------------------------------------------------------------------
// Primer Generation
// ---------------------------------------------------------------------------

/**
 * Determine the primary archetype label from attribute scores.
 * The highest-scoring attribute determines the deck's primary focus.
 */
function getPrimaryArchetype(scores: AttributeScores): string {
  const entries: [string, number][] = [
    ['consistency-focused', scores.consistency],
    ['resilient', scores.resilience],
    ['interactive', scores.interaction],
    ['aggressive', scores.speed],
  ]
  entries.sort((a, b) => b[1] - a[1])
  return entries[0][0]
}

/**
 * Find a win condition card from keyCards (combo tier) or from cards
 * that look like finishers based on their categories or oracle text.
 */
function findWinCondition(cards: CardData[], keyCards: KeyCard[]): string {
  // First try: keyCards with 'combo' tier
  const comboCard = keyCards.find((kc) => kc.priorityTier === 'combo')
  if (comboCard) return comboCard.cardName

  // Second try: look for cards with finisher-like categories or oracle text
  const finisherKeywords = ['you win the game', 'infinite', 'each opponent loses']
  for (const card of cards) {
    const oracleLower = card.oracleText.toLowerCase()
    if (finisherKeywords.some((kw) => oracleLower.includes(kw))) {
      return card.cardName
    }
  }

  // Third try: any multi-category keyCard
  const multiCat = keyCards.find((kc) => kc.priorityTier === 'multi-category')
  if (multiCat) return multiCat.cardName

  // Fallback: first non-commander keyCard
  const nonCommander = keyCards.find((kc) => kc.priorityTier !== 'commander')
  if (nonCommander) return nonCommander.cardName

  // Last resort: any non-land card
  const nonLand = cards.find((c) => !c.typeLine.toLowerCase().includes('land') && !c.isCommander)
  return nonLand ? nonLand.cardName : cards[0]?.cardName ?? 'unknown'
}

/**
 * Find notable ramp/mana cards from the deck to reference in mulligan advice.
 */
function findRampCards(cards: CardData[]): string[] {
  const rampNames: string[] = []
  for (const card of cards) {
    if (card.isCommander) continue
    const oracleLower = card.oracleText.toLowerCase()
    let parsedCategories: string[] = []
    try {
      const parsed = JSON.parse(card.categories)
      if (Array.isArray(parsed)) parsedCategories = parsed.map((c: string) => c.toLowerCase())
    } catch { /* empty */ }

    if (
      parsedCategories.includes('ramp') ||
      (card.cmc <= 2 && oracleLower.includes('add') && MANA_SYMBOL_PATTERN.test(card.oracleText))
    ) {
      rampNames.push(card.cardName)
    }
    if (rampNames.length >= 4) break
  }
  return rampNames
}

/**
 * Find draw engine cards from the deck to reference in mulligan advice.
 */
function findDrawCards(cards: CardData[]): string[] {
  const drawNames: string[] = []
  for (const card of cards) {
    if (card.isCommander) continue
    const oracleLower = card.oracleText.toLowerCase()
    let parsedCategories: string[] = []
    try {
      const parsed = JSON.parse(card.categories)
      if (Array.isArray(parsed)) parsedCategories = parsed.map((c: string) => c.toLowerCase())
    } catch { /* empty */ }

    if (parsedCategories.includes('draw') || oracleLower.includes('draw a card')) {
      drawNames.push(card.cardName)
    }
    if (drawNames.length >= 3) break
  }
  return drawNames
}

/**
 * Truncate a string to a maximum word count.
 */
function truncateToWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter((w) => w.length > 0)
  if (words.length <= maxWords) return text
  return words.slice(0, maxWords).join(' ')
}

/**
 * Generate primer content from deck data. This is a DETERMINISTIC function —
 * no AI/LLM calls. It generates structured content based on deck characteristics
 * using templates and card references.
 *
 * - Core Strategy: 2-3 sentences referencing commander by name + win condition
 * - Mulligan Priorities: 3-5 items, each <= 30 words
 * - Key Tips: 3-5 items, each <= 30 words, each referencing at least one named card
 */
export function generatePrimer(
  commanderName: string,
  cards: CardData[],
  keyCards: KeyCard[],
  scores: AttributeScores
): Primer {
  // --- Core Strategy (2-3 sentences) ---
  const archetype = getPrimaryArchetype(scores)
  const winCondition = findWinCondition(cards, keyCards)

  const sentence1 = `${commanderName} leads an ${archetype} strategy that leverages the command zone for consistent advantage.`
  const sentence2 = `The deck aims to close games through ${winCondition} as its primary win condition.`
  const sentence3 = scores.resilience >= 6
    ? `Multiple redundant lines ensure the deck can recover and win through disruption.`
    : `Focus on protecting key pieces to maintain the path to victory.`
  const coreStrategy = `${sentence1} ${sentence2} ${sentence3}`

  // --- Mulligan Priorities (3-5 items, each <= 30 words) ---
  const rampCards = findRampCards(cards)
  const drawCards = findDrawCards(cards)

  const commanderCmc = cards.find((c) => c.isCommander)?.cmc ?? 4
  const landCount = commanderCmc >= 5 ? '3-4' : '2-3'

  const mulliganPriorities: string[] = []

  // Priority 1: Lands + ramp
  const rampRef = rampCards.length > 0
    ? ` like ${rampCards.slice(0, 2).join(' or ')}`
    : ''
  mulliganPriorities.push(
    truncateToWords(`Keep hands with ${landCount} lands and early ramp${rampRef} to cast ${commanderName} on curve.`, 30)
  )

  // Priority 2: Card draw / card advantage
  const drawRef = drawCards.length > 0
    ? `such as ${drawCards[0]}`
    : 'that draw cards'
  mulliganPriorities.push(
    truncateToWords(`Prioritize hands with a card advantage source ${drawRef} to maintain resources.`, 30)
  )

  // Priority 3: Interaction piece
  if (scores.interaction >= 5) {
    mulliganPriorities.push(
      truncateToWords(`Having at least one piece of interaction or removal helps answer early threats.`, 30)
    )
  } else {
    mulliganPriorities.push(
      truncateToWords(`Mulligan hands with no clear plan for the first three turns of the game.`, 30)
    )
  }

  // Priority 4: Speed consideration
  if (scores.speed >= 7) {
    const fastManaRef = rampCards[0] ?? 'mana rocks'
    mulliganPriorities.push(
      truncateToWords(`Fast mana like ${fastManaRef} enables explosive starts and early pressure on opponents.`, 30)
    )
  }

  // Priority 5: Avoid dead hands
  if (commanderCmc >= 5) {
    mulliganPriorities.push(
      truncateToWords(`Avoid keeping hands that rely entirely on drawing into ramp spells for a high-cost commander.`, 30)
    )
  }

  // Ensure 3-5 items
  while (mulliganPriorities.length < 3) {
    mulliganPriorities.push(
      truncateToWords(`Look for hands that have a mix of lands, acceleration, and early plays.`, 30)
    )
  }
  if (mulliganPriorities.length > 5) {
    mulliganPriorities.length = 5
  }

  // --- Key Tips (3-5 items, each <= 30 words, each referencing at least one card name) ---
  const keyTips: string[] = []

  // Get named cards to reference (from keyCards, excluding commander for variety)
  const namedCards = keyCards
    .filter((kc) => kc.priorityTier !== 'commander')
    .map((kc) => kc.cardName)

  // Tip 1: Commander sequencing
  keyTips.push(
    truncateToWords(`Deploy ${commanderName} when you can protect it or immediately use its abilities for value.`, 30)
  )

  // Tip 2: Combo/synergy reference
  if (namedCards.length > 0) {
    keyTips.push(
      truncateToWords(`Sequence ${namedCards[0]} carefully to maximize synergy with other key pieces in the deck.`, 30)
    )
  }

  // Tip 3: Win condition timing
  keyTips.push(
    truncateToWords(`Hold ${winCondition} until you can protect it or the table is tapped out from other threats.`, 30)
  )

  // Tip 4: Resource management (if we have another named card)
  if (namedCards.length > 1) {
    keyTips.push(
      truncateToWords(`Use ${namedCards[1]} early to generate incremental advantage before committing to your main line.`, 30)
    )
  }

  // Tip 5: Threat assessment
  if (namedCards.length > 2) {
    keyTips.push(
      truncateToWords(`Save ${namedCards[2]} for the most impactful moment rather than using it at the first opportunity.`, 30)
    )
  }

  // Ensure 3-5 items, each referencing a card name
  while (keyTips.length < 3) {
    // Use commander name as fallback reference
    keyTips.push(
      truncateToWords(`Build your board around ${commanderName} to maximize the value of each subsequent play.`, 30)
    )
  }
  if (keyTips.length > 5) {
    keyTips.length = 5
  }

  return {
    coreStrategy,
    mulliganPriorities,
    keyTips,
  }
}

// ---------------------------------------------------------------------------
// Weakness Detection
// ---------------------------------------------------------------------------

/**
 * Count cards that provide graveyard protection/mitigation.
 * Looks for cards with oracle text indicating graveyard protection:
 * - "shuffle" + "graveyard" (e.g., Eldrazi titans, Gaea's Blessing)
 * - "return" + "from exile" (e.g., Pull from Eternity)
 */
function countGraveyardProtection(cards: CardData[]): number {
  return cards.filter((card) => {
    const text = card.oracleText.toLowerCase()
    return (
      (text.includes('shuffle') && text.includes('graveyard')) ||
      (text.includes('return') && text.includes('from exile'))
    )
  }).length
}

/**
 * Count cards that provide commander protection.
 * Looks for cards that grant hexproof, indestructible, or shroud to creatures,
 * or counterspells that can protect the commander.
 */
function countCommanderProtection(cards: CardData[]): number {
  return cards.filter((card) => {
    const text = card.oracleText.toLowerCase()
    const typeLine = card.typeLine.toLowerCase()

    // Protection-granting cards (hexproof, indestructible, shroud)
    const grantsProtection =
      text.includes('hexproof') ||
      text.includes('indestructible') ||
      text.includes('shroud')

    // Counterspells (instants that can counter removal)
    const isCounterspell =
      typeLine.includes('instant') && text.includes('counter target')

    return grantsProtection || isCounterspell
  }).length
}

/**
 * Count artifact cards in the deck (non-land cards with "Artifact" in type line).
 */
function countArtifacts(cards: CardData[]): number {
  return cards.filter((card) => {
    const typeLine = card.typeLine.toLowerCase()
    return typeLine.includes('artifact') && !typeLine.includes('land')
  }).length
}

/**
 * Count cards that can recover artifacts from the graveyard.
 */
function countArtifactRecursion(cards: CardData[]): number {
  return cards.filter((card) => {
    const text = card.oracleText.toLowerCase()
    return (
      (text.includes('return') && text.includes('artifact') && text.includes('graveyard')) ||
      (text.includes('return') && text.includes('from your graveyard') && card.typeLine.toLowerCase().includes('artifact'))
    )
  }).length
}

/**
 * Identify and classify deck weaknesses based on deck composition and scores.
 *
 * Detects patterns:
 * - Graveyard dependency: recursion count >= 5
 * - Commander dependency: many key cards require commander
 * - Low interaction: interaction score <= 3
 * - Slow speed: speed score <= 3
 * - Single win condition: low combo redundancy and few finishers
 * - Specific hate vulnerability: artifact-heavy with low artifact recursion
 */
export function identifyWeaknesses(
  cards: CardData[],
  contributingCards: ContributingCards,
  scores: AttributeScores,
  commanderName: string
): Weakness[] {
  const weaknesses: Weakness[] = []

  // --- Graveyard Dependency ---
  // Critical if recursion count >= 5 and < 2 graveyard protection cards
  if (contributingCards.recursion.length >= 5) {
    const graveyardProtectionCount = countGraveyardProtection(cards)
    const severity: WeaknessSeverity = graveyardProtectionCount < 2 ? 'Critical' : 'Moderate'
    weaknesses.push({
      description: `Heavy graveyard dependency with ${contributingCards.recursion.length} recursion cards. Vulnerable to graveyard hate that shuts down the recursion engine.`,
      severity,
      hateCards: GRAVEYARD_HATE_CARDS,
    })
  }

  // --- Commander Dependency ---
  // Critical if many key cards require commander on battlefield and < 2 protection cards
  // Detect commander dependency: count cards whose oracle text references effects
  // that only work when the commander is central to strategy.
  // Use a heuristic: if the commander is referenced frequently or if there are few
  // independent win lines, the deck is commander-dependent.
  const commanderCards = cards.filter((card) => card.isCommander)
  const commanderOracleText = commanderCards.length > 0
    ? commanderCards[0].oracleText.toLowerCase()
    : ''

  // Commander dependency: check if the commander provides essential card advantage/engine
  // and if many non-commander cards reference effects that need the commander
  const commanderNameLower = commanderName.toLowerCase()
  const cardsReferencingCommander = cards.filter((card) => {
    if (card.isCommander) return false
    const text = card.oracleText.toLowerCase()
    return text.includes(commanderNameLower)
  }).length

  // Also consider if commander provides card advantage (draw, tutor, top-of-library)
  const commanderProvidesEngine =
    commanderOracleText.includes('draw') ||
    commanderOracleText.includes('search your library') ||
    commanderOracleText.includes('look at the top')

  const isCommanderDependent =
    cardsReferencingCommander >= 3 || commanderProvidesEngine

  if (isCommanderDependent) {
    const commanderProtectionCount = countCommanderProtection(cards)
    const severity: WeaknessSeverity = commanderProtectionCount < 2 ? 'Critical' : 'Moderate'
    weaknesses.push({
      description: `High commander dependency on ${commanderName}. Strategy relies heavily on the commander being on the battlefield.`,
      severity,
      hateCards: COMMANDER_HATE_CARDS,
    })
  }

  // --- Low Interaction ---
  // Moderate if interaction score <= 3
  if (scores.interaction <= 3) {
    weaknesses.push({
      description: 'Low interaction suite. The deck struggles to disrupt opponents\' game plans or respond to threats at instant speed.',
      severity: 'Moderate',
      hateCards: LOW_INTERACTION_THREATS,
    })
  }

  // --- Slow Speed ---
  // Moderate if speed score <= 3
  if (scores.speed <= 3) {
    weaknesses.push({
      description: 'Slow speed profile. The deck takes too long to develop its game plan, making it vulnerable to faster strategies.',
      severity: 'Moderate',
      hateCards: SLOW_SPEED_THREATS,
    })
  }

  // --- Single Win Condition ---
  // Moderate if combo redundancy is low (few combo pieces / finishers)
  // Detect: few recursion + few contributing cards across finisher categories
  const totalFinishers = contributingCards.recursion.length +
    contributingCards.boardWipes.length
  const hasLowRedundancy = totalFinishers <= 2 &&
    contributingCards.tutors.length <= 1

  if (hasLowRedundancy) {
    weaknesses.push({
      description: 'Limited win condition redundancy. If the primary win condition is disrupted, the deck has few alternative paths to victory.',
      severity: 'Moderate',
      hateCards: SINGLE_WIN_CON_HATE_CARDS,
    })
  }

  // --- Specific Hate Vulnerability: Artifact-heavy ---
  // Minor if many artifacts in deck and < 2 artifact recursion cards
  const artifactCount = countArtifacts(cards)
  if (artifactCount >= 10) {
    const artifactRecursionCount = countArtifactRecursion(cards)
    if (artifactRecursionCount < 2) {
      weaknesses.push({
        description: `Artifact-heavy deck with ${artifactCount} artifacts and limited artifact recursion. Vulnerable to mass artifact removal.`,
        severity: 'Minor',
        hateCards: ARTIFACT_HATE_CARDS,
      })
    }
  }

  return weaknesses
}

// ---------------------------------------------------------------------------
// Key Card Selection
// ---------------------------------------------------------------------------

/**
 * Select 8–10 key cards from a deck using priority ordering:
 * 1. Commander (always first)
 * 2. Combo pieces (cards whose name is in comboCards)
 * 3. Multi-category cards (classified into 2+ scoring categories)
 * 4. Highest-synergy remaining cards (at least 1 category, sorted by count)
 *
 * Within each tier, cards are sorted by category count (descending).
 * Fills until 8–10 slots are used (stops at 10).
 * If fewer than 8 qualifying cards total, returns all matching.
 */
export function selectKeyCards(
  cards: CardData[],
  contributingCards: ContributingCards,
  comboCards: string[]
): KeyCard[] {
  const MAX_KEY_CARDS = 10
  const result: KeyCard[] = []
  const selected = new Set<string>()

  // Helper: count how many scoring categories a card belongs to
  function getCategoryCount(card: CardData): number {
    return classifyCard(card).length
  }

  // Helper: get categories list for a card (for reason generation)
  function getCategoryNames(card: CardData): string[] {
    return classifyCard(card).map(formatCategoryName)
  }

  // Helper: format a ScoringCategory to human-readable label
  function formatCategoryName(cat: ScoringCategory): string {
    switch (cat) {
      case 'tutor': return 'tutor'
      case 'drawEngine': return 'draw engine'
      case 'recursion': return 'recursion'
      case 'removal': return 'removal'
      case 'counterspell': return 'counterspell'
      case 'boardWipe': return 'board wipe'
      case 'fastMana': return 'fast mana'
    }
  }

  // Helper: generate reason string (max 150 chars)
  function generateReason(card: CardData, tier: KeyCard['priorityTier']): string {
    let reason: string
    switch (tier) {
      case 'commander':
        reason = `Commander — deck's linchpin that defines the strategy`
        break
      case 'combo': {
        const relatedComboCards = comboCards.filter(c => c !== card.cardName).slice(0, 2)
        if (relatedComboCards.length > 0) {
          reason = `Key combo piece enabling ${relatedComboCards.join(' + ')}`
        } else {
          reason = `Key combo piece enabling the deck's primary win condition`
        }
        break
      }
      case 'multi-category': {
        const cats = getCategoryNames(card)
        reason = `Multi-role: serves as ${cats.join(', ')}`
        break
      }
      case 'synergy': {
        const cats = classifyCard(card)
        const primaryCat = cats.length > 0 ? formatCategoryName(cats[0]) : 'synergy'
        reason = `Core ${primaryCat} piece for the deck's strategy`
        break
      }
    }
    // Truncate to 150 chars if needed
    return reason.length > 150 ? reason.slice(0, 147) + '...' : reason
  }

  // Sort helper: descending by category count
  function sortByCategoryCount(a: CardData, b: CardData): number {
    return getCategoryCount(b) - getCategoryCount(a)
  }

  // --- Tier 1: Commander ---
  const commanders = cards.filter(c => c.isCommander)
  for (const commander of commanders) {
    if (result.length >= MAX_KEY_CARDS) break
    if (!selected.has(commander.cardName)) {
      result.push({
        cardName: commander.cardName,
        reason: generateReason(commander, 'commander'),
        priorityTier: 'commander',
      })
      selected.add(commander.cardName)
    }
  }

  // --- Tier 2: Combo pieces ---
  const comboCardSet = new Set(comboCards)
  const comboCandidates = cards
    .filter(c => comboCardSet.has(c.cardName) && !selected.has(c.cardName))
    .sort(sortByCategoryCount)

  for (const card of comboCandidates) {
    if (result.length >= MAX_KEY_CARDS) break
    result.push({
      cardName: card.cardName,
      reason: generateReason(card, 'combo'),
      priorityTier: 'combo',
    })
    selected.add(card.cardName)
  }

  // --- Tier 3: Multi-category cards (2+ categories) ---
  const multiCategoryCandidates = cards
    .filter(c => !selected.has(c.cardName) && getCategoryCount(c) >= 2)
    .sort(sortByCategoryCount)

  for (const card of multiCategoryCandidates) {
    if (result.length >= MAX_KEY_CARDS) break
    result.push({
      cardName: card.cardName,
      reason: generateReason(card, 'multi-category'),
      priorityTier: 'multi-category',
    })
    selected.add(card.cardName)
  }

  // --- Tier 4: Highest-synergy remaining (at least 1 category) ---
  const synergyCandidates = cards
    .filter(c => !selected.has(c.cardName) && getCategoryCount(c) >= 1)
    .sort(sortByCategoryCount)

  for (const card of synergyCandidates) {
    if (result.length >= MAX_KEY_CARDS) break
    result.push({
      cardName: card.cardName,
      reason: generateReason(card, 'synergy'),
      priorityTier: 'synergy',
    })
    selected.add(card.cardName)
  }

  return result
}


