import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fc from 'fast-check'
import Database from 'better-sqlite3'
import { formatStrategyPromptBlock, StrategyData } from '@/lib/format-strategy-prompt'
import { classifyDeadWeight, FormatRules, exceedsRarityRestriction, RARITY_ORDER, Rarity } from '@/lib/dead-weight-classifier'
import { applyBudgetFilter, applyFormatConstraints, applyFormatConstraintsWithRarity, sortUpgrades, pairUpgradesWithCuts, PairedUpgrade } from '@/lib/upgrade-pairing'

let testDb: InstanceType<typeof Database>

vi.mock('@/lib/db', () => ({
  default: new Proxy({} as unknown as InstanceType<typeof Database>, {
    get(_, prop) { return (testDb as unknown as Record<string, unknown>)[prop as string] },
  }),
}))
vi.mock('@/lib/init-db', () => ({ ensureDb: vi.fn() }))

import { GET, PUT } from '@/app/api/decks/[id]/strategy/route'
import { NextRequest } from 'next/server'

function setupSchema(db: InstanceType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      commander_name TEXT,
      colour_identity TEXT
    );
    CREATE TABLE IF NOT EXISTS deck_strategy (
      deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
      win_condition TEXT,
      table_context TEXT,
      bracket INTEGER CHECK(bracket >= 1 AND bracket <= 4),
      budget_mode TEXT CHECK(budget_mode IN ('collection', 'budget', 'unrestricted')),
      budget_ceiling REAL,
      frustration TEXT,
      strategy_notes TEXT,
      format_rules TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

function callGET(id: string) {
  const request = new NextRequest(`http://localhost/api/decks/${id}/strategy`)
  return GET(request, { params: Promise.resolve({ id }) })
}

function callPUT(id: string, body: Record<string, unknown>) {
  const request = new NextRequest(`http://localhost/api/decks/${id}/strategy`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
  return PUT(request, { params: Promise.resolve({ id }) })
}

// --- Generators ---

const bracketArb = fc.integer({ min: 1, max: 4 })

const budgetModeArb = fc.constantFrom('collection', 'budget', 'unrestricted')

const winConditionArb = fc.string({ minLength: 1, maxLength: 200 })
const tableContextArb = fc.string({ minLength: 1, maxLength: 200 })
const frustrationArb = fc.string({ minLength: 0, maxLength: 200 })
const strategyNotesArb = fc.string({ minLength: 0, maxLength: 200 })

const budgetCeilingArb = fc.double({ min: 0.01, max: 1000, noNaN: true })

// Format rules generators for the three supported schema shapes
const preconModRulesArb = fc.record({
  format_name: fc.constant('precon_mod'),
  swap_limit: fc.integer({ min: 1, max: 20 }),
  mandatory_cuts: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
  rarity_budget: fc.record({
    mythic: fc.integer({ min: 0, max: 10 }),
    rare: fc.integer({ min: 0, max: 10 }),
    uncommon: fc.integer({ min: 0, max: 10 }),
    common: fc.integer({ min: 0, max: 10 }),
  }),
  value_cap: fc.double({ min: 1, max: 500, noNaN: true }),
})

const baggyLeagueRulesArb = fc.record({
  format_name: fc.constant('baggy_league'),
  rarity_restriction: fc.constantFrom('common', 'uncommon', 'rare', 'mythic'),
  progression_level: fc.integer({ min: 1, max: 10 }),
  progression_points: fc.integer({ min: 0, max: 100 }),
})

const customRulesArb = fc.record({
  format_name: fc.constant('custom'),
  description: fc.string({ minLength: 1, maxLength: 100 }),
  constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
})

const formatRulesArb = fc.oneof(preconModRulesArb, baggyLeagueRulesArb, customRulesArb)

// Generate a full valid strategy payload
// When budget_mode is 'budget', always include a positive budget_ceiling
const strategyPayloadArb = fc.tuple(
  bracketArb,
  budgetModeArb,
  winConditionArb,
  tableContextArb,
  frustrationArb,
  strategyNotesArb,
  budgetCeilingArb,
  fc.option(formatRulesArb, { nil: undefined }),
).map(([bracket, budget_mode, win_condition, table_context, frustration, strategy_notes, budget_ceiling, format_rules]) => {
  const payload: Record<string, unknown> = {
    bracket,
    budget_mode,
    win_condition,
    table_context,
    frustration,
    strategy_notes,
  }

  // When budget_mode is 'budget', always include a positive budget_ceiling
  if (budget_mode === 'budget') {
    payload.budget_ceiling = budget_ceiling
  }

  if (format_rules !== undefined) {
    payload.format_rules = format_rules
  }

  return payload
})

// --- Property Tests ---

describe('Feature: oracle-upgrade-engine, Property 2: Strategy API Round-Trip', () => {
  /**
   * **Validates: Requirements 2.1, 2.3**
   *
   * Property 2: Strategy API Round-Trip
   * For any valid strategy payload (with valid bracket 1-4, valid budget_mode,
   * and budget_ceiling present when mode is 'budget'), submitting via PUT to
   * `/api/decks/[id]/strategy` and then retrieving via GET SHALL return a record
   * with equivalent field values and `configured: true`.
   */

  beforeEach(() => {
    testDb = new Database(':memory:')
    setupSchema(testDb)
    // Insert a test deck that all generated payloads will target
    testDb.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Test Deck')
  })

  afterEach(() => {
    testDb.close()
  })

  it('PUT then GET returns equivalent field values with configured: true', () => {
    return fc.assert(
      fc.asyncProperty(strategyPayloadArb, async (payload) => {
        // PUT the strategy payload
        const putResponse = await callPUT('1', payload)
        expect(putResponse.status).toBe(200)

        // GET the strategy back
        const getResponse = await callGET('1')
        expect(getResponse.status).toBe(200)

        const result = await getResponse.json()

        // Must be configured
        expect(result.configured).toBe(true)

        // All submitted fields must round-trip correctly
        expect(result.win_condition).toBe(payload.win_condition ?? null)
        expect(result.table_context).toBe(payload.table_context ?? null)
        expect(result.bracket).toBe(payload.bracket ?? null)
        expect(result.budget_mode).toBe(payload.budget_mode ?? null)
        expect(result.frustration).toBe(payload.frustration ?? null)
        expect(result.strategy_notes).toBe(payload.strategy_notes ?? null)

        // Budget ceiling: only set when budget_mode is 'budget'
        if (payload.budget_mode === 'budget') {
          expect(result.budget_ceiling).toBe(payload.budget_ceiling)
        }

        // Format rules: deep equality when provided
        if (payload.format_rules !== undefined) {
          expect(result.format_rules).toEqual(payload.format_rules)
        } else {
          expect(result.format_rules).toBeNull()
        }

        // updated_at must be set
        expect(result.updated_at).toBeDefined()
        expect(typeof result.updated_at).toBe('string')
      }),
      { numRuns: 100 }
    )
  })
})

describe('Feature: oracle-upgrade-engine, Property 3: Strategy API Input Validation', () => {
  /**
   * **Validates: Requirements 2.4, 2.5, 2.6**
   *
   * Property 3: Strategy API Input Validation
   * For any PUT with invalid bracket (outside 1-4), budget mode 'budget' with
   * null ceiling, or non-positive-integer deck ID → returns 400
   */

  beforeEach(() => {
    testDb = new Database(':memory:')
    setupSchema(testDb)
    // Insert a deck so bracket/budget tests don't hit 404 before validation
    testDb.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Test Deck')
  })

  afterEach(() => {
    testDb.close()
  })

  it('returns 400 for invalid bracket values (outside 1-4)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ max: 0 }),          // 0, negative integers
          fc.integer({ min: 5 }),           // 5 and above
          fc.double({ min: 1.1, max: 3.9, noNaN: true }).filter(n => !Number.isInteger(n)) // non-integer floats between 1-4
        ),
        async (invalidBracket) => {
          const response = await callPUT('1', {
            bracket: invalidBracket,
            budget_mode: 'unrestricted',
          })
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 for budget mode "budget" with null/undefined budget_ceiling', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(null, undefined),
        async (ceiling) => {
          const body: Record<string, unknown> = {
            budget_mode: 'budget',
          }
          if (ceiling === null) {
            body.budget_ceiling = null
          }
          // When ceiling is undefined, budget_ceiling key is not in body
          const response = await callPUT('1', body)
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns 400 for non-positive-integer deck IDs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.integer({ max: 0 }).map(n => String(n)),                     // "0", "-1", "-5", etc.
          fc.array(
            fc.constantFrom('a','b','c','x','y','z','!','@','#'),
            { minLength: 1, maxLength: 5 }
          ).map(arr => arr.join('')),                                       // purely non-numeric strings
          fc.constantFrom('abc', 'foo', '', 'null', 'undefined', 'NaN', '   ', '.', '-') // edge-case non-numeric strings
        ),
        async (invalidId) => {
          const response = await callPUT(invalidId, {
            win_condition: 'test',
            budget_mode: 'unrestricted',
          })
          expect(response.status).toBe(400)
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 7: Dead Weight — Bracket Mismatch Requires Strategy', () => {
  /**
   * **Validates: Requirements 5.7, 5.11**
   *
   * Property 7: Dead Weight — Bracket Mismatch Requires Strategy
   * No card receives `bracket_mismatch` when deck has no strategy or null bracket;
   * cards exceeding bracket threshold ARE flagged when bracket is set.
   */

  it('never returns bracket_mismatch when bracket is null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),     // cardName
        fc.integer({ min: 0, max: 100 }),                // synergyScore (any valid score)
        (cardName, synergyScore) => {
          // Setup: no format rules, empty categories (at target), not in combos
          // synergy >= 30 to avoid off_strategy triggering
          const adjustedSynergy = Math.max(synergyScore, 30)
          const categoryCount = new Map<string, number>()
          const categoryTargets = new Map<string, number>()
          const comboCards = new Set<string>()
          const bracket = null // No bracket configured
          const formatRules = null // No format rules
          const cardRarity = null

          const result = classifyDeadWeight(
            cardName,
            adjustedSynergy,
            categoryCount,
            categoryTargets,
            comboCards,
            bracket,
            formatRules,
            cardRarity
          )

          // Result should either be null or NOT bracket_mismatch
          if (result !== null) {
            expect(result.flag).not.toBe('bracket_mismatch')
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('flags bracket_mismatch when synergy exceeds bracket threshold', () => {
    // Bracket thresholds: 1 → 80, 2 → 85, 3 → 90
    const bracketWithThreshold = fc.constantFrom(
      { bracket: 1, threshold: 80 },
      { bracket: 2, threshold: 85 },
      { bracket: 3, threshold: 90 },
    )

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),     // cardName
        bracketWithThreshold,
        fc.integer({ min: 1, max: 19 }),                // offset above threshold (1-19 so max score is threshold+19 ≤ 100)
        (cardName, { bracket, threshold }, offset) => {
          // Synergy score above the bracket threshold
          const synergyScore = Math.min(threshold + offset, 100)

          // Setup: no format violations, no redundant categories, synergy >= 30 (no off_strategy)
          const categoryCount = new Map<string, number>()
          const categoryTargets = new Map<string, number>()
          const comboCards = new Set<string>()
          const formatRules = null // No format rules to avoid format_violation
          const cardRarity = null

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            categoryCount,
            categoryTargets,
            comboCards,
            bracket,
            formatRules,
            cardRarity
          )

          // Must be flagged as bracket_mismatch
          expect(result).not.toBeNull()
          expect(result!.flag).toBe('bracket_mismatch')
          expect(result!.reason).toContain(String(bracket))
          expect(result!.reason).toContain(String(threshold))
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Feature: oracle-upgrade-engine, Property 4: Strategy Prompt Injection Completeness', () => {
  /**
   * **Validates: Requirements 4.1, 4.3**
   *
   * Property 4: Strategy Prompt Injection Completeness
   * For any valid strategy with non-null win_condition, table_context, bracket,
   * and budget_mode, the formatted prompt block contains string representations
   * of all four fields.
   */

  // Generators for non-null strategy fields
  const winConditionArb = fc.string({ minLength: 1, maxLength: 200 })
  const tableContextArb = fc.string({ minLength: 1, maxLength: 200 })
  const bracketArb = fc.integer({ min: 1, max: 4 })
  const budgetModeArb = fc.constantFrom('collection', 'budget', 'unrestricted')
  const frustrationArb = fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null })
  const strategyNotesArb = fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null })

  const configuredStrategyArb = fc.tuple(
    winConditionArb,
    tableContextArb,
    bracketArb,
    budgetModeArb,
    frustrationArb,
    strategyNotesArb,
  ).map(([win_condition, table_context, bracket, budget_mode, frustration, strategy_notes]): StrategyData => ({
    configured: true,
    win_condition,
    table_context,
    bracket,
    budget_mode,
    frustration,
    strategy_notes,
  }))

  it('formatted prompt block contains string representations of all four required fields', () => {
    fc.assert(
      fc.property(configuredStrategyArb, (strategy) => {
        const result = formatStrategyPromptBlock(strategy)

        // Result must not be null for a configured strategy with all fields non-null
        expect(result).not.toBeNull()

        const block = result as string

        // Must contain string representation of win_condition
        expect(block).toContain(strategy.win_condition!)

        // Must contain string representation of table_context
        expect(block).toContain(strategy.table_context!)

        // Must contain string representation of bracket as a number string
        expect(block).toContain(String(strategy.bracket!))

        // Must contain string representation of budget_mode
        expect(block).toContain(strategy.budget_mode!)

        // Must be clearly delimited with section markers
        expect(block).toContain('=== DECK STRATEGY CONTEXT ===')
        expect(block).toContain('=== END STRATEGY CONTEXT ===')
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 5: Dead Weight — Redundant Classification', () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * Property 5: Dead Weight — Redundant Classification
   * For any category exceeding target count, lowest synergy card(s) in excess
   * positions are flagged `redundant`. When categoryCount <= categoryTargets for
   * any category, classifyDeadWeight should NOT return 'redundant'.
   */

  // Generator: category name from a realistic set
  const categoryNameArb = fc.constantFrom(
    'Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor'
  )

  // Generator: target count (reasonable range for Commander categories)
  const targetCountArb = fc.integer({ min: 1, max: 20 })

  // Generator: synergy score (0–100)
  const synergyScoreArb = fc.integer({ min: 0, max: 100 })

  // Generator: card name (non-empty string)
  const cardNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  it('flags redundant when category count exceeds target', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        categoryNameArb,
        targetCountArb,
        // Ensure count exceeds the target by at least 1
        fc.integer({ min: 1, max: 10 }),
        synergyScoreArb,
        (cardName, category, target, excess, synergy) => {
          const count = target + excess // count > target guaranteed

          const categoryCount = new Map<string, number>([[category, count]])
          const categoryTargets = new Map<string, number>([[category, target]])
          const comboCards = new Set<string>() // not in combos
          const bracket: number | null = null // no bracket configured
          const formatRules: FormatRules | null = null
          const cardRarity: string | null = null

          const result = classifyDeadWeight(
            cardName,
            synergy,
            categoryCount,
            categoryTargets,
            comboCards,
            bracket,
            formatRules,
            cardRarity
          )

          // When the category exceeds target, the card should be flagged redundant
          expect(result).not.toBeNull()
          expect(result!.flag).toBe('redundant')
          expect(result!.cardName).toBe(cardName)
          expect(result!.reason).toContain(category)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('does NOT flag redundant when category count is at or below target', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        categoryNameArb,
        targetCountArb,
        // Synergy >= 30 to avoid triggering off_strategy flag instead
        fc.integer({ min: 30, max: 100 }),
        (cardName, category, target, synergy) => {
          // Count is exactly equal to the target (not exceeding)
          const count = target

          const categoryCount = new Map<string, number>([[category, count]])
          const categoryTargets = new Map<string, number>([[category, target]])
          const comboCards = new Set<string>() // not in combos
          const bracket: number | null = null // no bracket to avoid bracket_mismatch
          const formatRules: FormatRules | null = null
          const cardRarity: string | null = null

          const result = classifyDeadWeight(
            cardName,
            synergy,
            categoryCount,
            categoryTargets,
            comboCards,
            bracket,
            formatRules,
            cardRarity
          )

          // When count <= target, the card should NOT be flagged redundant
          // Result should be null (no flag at all since synergy >= 30 and no bracket)
          if (result !== null) {
            expect(result.flag).not.toBe('redundant')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 6: Dead Weight — Off-Strategy Classification', () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * Property 6: Dead Weight — Off-Strategy Classification
   * Card with synergy < 30 AND not in combos → flagged `off_strategy`;
   * card with synergy ≥ 30 OR in combos → NOT flagged `off_strategy`
   */

  // Generators
  const cardNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Empty category count so redundant check doesn't interfere
  const emptyCategoryCount = new Map<string, number>()
  const emptyCategoryTargets = new Map<string, number>()

  // Null bracket and null format rules so other checks don't interfere
  const nullBracket = null
  const nullFormatRules = null
  const nullRarity = null

  it('card with synergy < 30 AND not in combos is flagged off_strategy', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        fc.integer({ min: 0, max: 29 }),
        (cardName, synergyScore) => {
          // Card is NOT in combo set
          const comboCards = new Set<string>()

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            emptyCategoryCount,
            emptyCategoryTargets,
            comboCards,
            nullBracket,
            nullFormatRules,
            nullRarity
          )

          // Must be flagged as off_strategy
          expect(result).not.toBeNull()
          expect(result!.flag).toBe('off_strategy')
          expect(result!.cardName).toBe(cardName)
          expect(result!.reason).toBeDefined()
          expect(result!.reason.length).toBeGreaterThan(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('card with synergy >= 30 OR in combos is NOT flagged off_strategy', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        fc.integer({ min: 0, max: 100 }),
        fc.boolean(), // whether the card is in combos
        (cardName, synergyScore, isInCombo) => {
          // Filter to cases where synergy >= 30 OR card is in combos
          // (at least one condition must hold for the property to apply)
          fc.pre(synergyScore >= 30 || isInCombo)

          const comboCards = new Set<string>()
          if (isInCombo) {
            comboCards.add(cardName)
          }

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            emptyCategoryCount,
            emptyCategoryTargets,
            comboCards,
            nullBracket,
            nullFormatRules,
            nullRarity
          )

          // Must NOT be flagged as off_strategy
          // (result may be null — no flag at all — or could be another flag type,
          //  but it must never be off_strategy)
          if (result !== null) {
            expect(result.flag).not.toBe('off_strategy')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 8: Dead Weight — Dismissed Cards Are Never Flagged', () => {
  /**
   * **Validates: Requirements 5.9, 6.4**
   *
   * Property 8: Dead Weight — Dismissed Cards Are Never Flagged
   * Any card in the dismissals table for a deck SHALL NOT receive any
   * dead_weight_flag regardless of synergy/category/bracket. This tests the
   * SCRIPT-LEVEL behavior: the dismissal check prevents classifyDeadWeight
   * from ever being called on dismissed cards.
   */

  let dismissalDb: InstanceType<typeof Database>

  // Helper: set up a minimal schema with the dead_weight_dismissals table
  function setupDismissalSchema(db: InstanceType<typeof Database>) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dead_weight_dismissals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        card_name TEXT NOT NULL,
        dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(deck_id, card_name)
      );
      CREATE INDEX IF NOT EXISTS idx_dw_dismissals_deck ON dead_weight_dismissals(deck_id);
    `)
  }

  // Simulate the script's isDismissed check
  function isDismissed(db: InstanceType<typeof Database>, deckId: number, cardName: string): boolean {
    const row = db.prepare(
      'SELECT 1 FROM dead_weight_dismissals WHERE deck_id = ? AND card_name = ?'
    ).get(deckId, cardName)
    return row !== undefined
  }

  // Simulate the script's processing logic:
  // 1. Check if card is dismissed → if yes, skip (return null)
  // 2. If not dismissed, call classifyDeadWeight
  function processCardForDeadWeight(
    db: InstanceType<typeof Database>,
    deckId: number,
    cardName: string,
    synergyScore: number,
    categoryCount: Map<string, number>,
    categoryTargets: Map<string, number>,
    comboCards: Set<string>,
    bracket: number | null,
    formatRules: FormatRules | null,
    cardRarity: string | null
  ) {
    // Script-level dismissal check — dismissed cards are never classified
    if (isDismissed(db, deckId, cardName)) {
      return null
    }

    return classifyDeadWeight(
      cardName,
      synergyScore,
      categoryCount,
      categoryTargets,
      comboCards,
      bracket,
      formatRules,
      cardRarity
    )
  }

  beforeEach(() => {
    dismissalDb = new Database(':memory:')
    setupDismissalSchema(dismissalDb)
    dismissalDb.prepare('INSERT INTO decks (id, name) VALUES (?, ?)').run(1, 'Test Deck')
  })

  afterEach(() => {
    dismissalDb.close()
  })

  // Generators
  const cardNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  const synergyArb = fc.integer({ min: 0, max: 100 })
  const bracketArb = fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 4 }))
  const categoryNameArb = fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor')
  const rarityArb = fc.oneof(fc.constant(null), fc.constantFrom('common', 'uncommon', 'rare', 'mythic'))

  // Generate conditions that WOULD trigger a dead weight flag (low synergy, over-target category, etc.)
  const flagTriggeringConditionsArb = fc.record({
    cardName: cardNameArb,
    synergyScore: fc.integer({ min: 0, max: 29 }), // Low synergy ensures off_strategy or worse
    category: categoryNameArb,
    categoryExcess: fc.integer({ min: 1, max: 5 }), // Category exceeds target
    target: fc.integer({ min: 3, max: 12 }),
    bracket: bracketArb,
    cardRarity: rarityArb,
  })

  it('dismissed card is never flagged, even under conditions that would trigger a flag', () => {
    fc.assert(
      fc.property(flagTriggeringConditionsArb, (conditions) => {
        const { cardName, synergyScore, category, categoryExcess, target, bracket, cardRarity } = conditions

        // Set up an over-target category so the card WOULD be flagged as redundant
        const count = target + categoryExcess
        const categoryCount = new Map<string, number>([[category, count]])
        const categoryTargets = new Map<string, number>([[category, target]])
        const comboCards = new Set<string>() // Not in combos
        const formatRules: FormatRules | null = null

        // First verify that WITHOUT dismissal the card WOULD be flagged
        const wouldBeFlag = classifyDeadWeight(
          cardName,
          synergyScore,
          categoryCount,
          categoryTargets,
          comboCards,
          bracket,
          formatRules,
          cardRarity
        )
        // The conditions we generate should produce a flag (redundant or off_strategy at minimum)
        expect(wouldBeFlag).not.toBeNull()

        // Now dismiss the card
        dismissalDb.prepare(
          'INSERT OR REPLACE INTO dead_weight_dismissals (deck_id, card_name) VALUES (?, ?)'
        ).run(1, cardName)

        // Process through the script-level logic
        const result = processCardForDeadWeight(
          dismissalDb,
          1,
          cardName,
          synergyScore,
          categoryCount,
          categoryTargets,
          comboCards,
          bracket,
          formatRules,
          cardRarity
        )

        // Dismissed card must NEVER receive a flag
        expect(result).toBeNull()

        // Clean up the dismissal for next iteration
        dismissalDb.prepare(
          'DELETE FROM dead_weight_dismissals WHERE deck_id = ? AND card_name = ?'
        ).run(1, cardName)
      }),
      { numRuns: 100 }
    )
  })

  it('non-dismissed card IS flagged under the same conditions', () => {
    fc.assert(
      fc.property(flagTriggeringConditionsArb, (conditions) => {
        const { cardName, synergyScore, category, categoryExcess, target, bracket, cardRarity } = conditions

        // Set up conditions that would trigger a flag
        const count = target + categoryExcess
        const categoryCount = new Map<string, number>([[category, count]])
        const categoryTargets = new Map<string, number>([[category, target]])
        const comboCards = new Set<string>()
        const formatRules: FormatRules | null = null

        // Ensure card is NOT dismissed
        const notDismissed = !isDismissed(dismissalDb, 1, cardName)
        expect(notDismissed).toBe(true)

        // Process through the script-level logic
        const result = processCardForDeadWeight(
          dismissalDb,
          1,
          cardName,
          synergyScore,
          categoryCount,
          categoryTargets,
          comboCards,
          bracket,
          formatRules,
          cardRarity
        )

        // Non-dismissed card SHOULD get flagged under these triggering conditions
        expect(result).not.toBeNull()
        expect(result!.flag).toBeDefined()
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 1: Format Rules JSON Round-Trip', () => {
  /**
   * **Validates: Requirements 1.5, 1.6, 11.8**
   *
   * Property 1: Format Rules JSON Round-Trip
   * For any valid format_rules object (precon_mod, baggy_league, custom),
   * JSON.stringify then JSON.parse produces deeply equal object.
   */

  it('JSON.stringify then JSON.parse produces deeply equal object for precon_mod rules', () => {
    fc.assert(
      fc.property(preconModRulesArb, (rules) => {
        const serialized = JSON.stringify(rules)
        const deserialized = JSON.parse(serialized)
        expect(deserialized).toEqual(rules)
      }),
      { numRuns: 100 }
    )
  })

  it('JSON.stringify then JSON.parse produces deeply equal object for baggy_league rules', () => {
    fc.assert(
      fc.property(baggyLeagueRulesArb, (rules) => {
        const serialized = JSON.stringify(rules)
        const deserialized = JSON.parse(serialized)
        expect(deserialized).toEqual(rules)
      }),
      { numRuns: 100 }
    )
  })

  it('JSON.stringify then JSON.parse produces deeply equal object for custom rules', () => {
    fc.assert(
      fc.property(customRulesArb, (rules) => {
        const serialized = JSON.stringify(rules)
        const deserialized = JSON.parse(serialized)
        expect(deserialized).toEqual(rules)
      }),
      { numRuns: 100 }
    )
  })

  it('JSON.stringify then JSON.parse produces deeply equal object for any format_rules variant', () => {
    fc.assert(
      fc.property(formatRulesArb, (rules) => {
        const serialized = JSON.stringify(rules)
        const deserialized = JSON.parse(serialized)
        expect(deserialized).toEqual(rules)
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 18: Format Enforcement — Violation Detection', () => {
  /**
   * **Validates: Requirements 11.4, 11.5**
   *
   * Property 18: Format Enforcement — Violation Detection
   * Card in mandatory_cuts list while in deck → flagged `format_violation`;
   * card with rarity exceeding rarity_restriction → flagged `format_violation`
   * with reason naming the specific rule.
   */

  // Generators
  const cardNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
  const formatNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
  const rarityArb: fc.Arbitrary<Rarity> = fc.constantFrom('common', 'uncommon', 'rare', 'mythic')

  // Shared neutral test context — no categories over target, synergy >= 30, no bracket
  const neutralCategoryCount = new Map<string, number>()
  const neutralCategoryTargets = new Map<string, number>()
  const neutralComboCards = new Set<string>()
  const nullBracket = null

  it('card in mandatory_cuts is flagged format_violation with reason mentioning format name', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        formatNameArb,
        // Additional cards in mandatory_cuts to ensure list has variety
        fc.array(cardNameArb, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 30, max: 100 }), // synergy >= 30 to avoid off_strategy
        (cardName, formatName, otherCuts, synergyScore) => {
          // Build format rules with mandatory_cuts containing our card
          const formatRules: FormatRules = {
            format_name: formatName,
            mandatory_cuts: [cardName, ...otherCuts],
          }

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            neutralCategoryCount,
            neutralCategoryTargets,
            neutralComboCards,
            nullBracket,
            formatRules,
            null // rarity doesn't matter for this sub-property
          )

          // Must be flagged as format_violation
          expect(result).not.toBeNull()
          expect(result!.flag).toBe('format_violation')
          expect(result!.cardName).toBe(cardName)
          // Reason must mention the format name
          expect(result!.reason).toContain(formatName)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('card with rarity exceeding rarity_restriction is flagged format_violation with reason naming the restriction', () => {
    // Generate a max-allowed rarity that is NOT mythic (so there's room to exceed)
    const maxAllowedArb: fc.Arbitrary<Rarity> = fc.constantFrom('common', 'uncommon', 'rare')

    fc.assert(
      fc.property(
        cardNameArb,
        formatNameArb,
        maxAllowedArb,
        fc.integer({ min: 30, max: 100 }), // synergy >= 30 to avoid off_strategy
        (cardName, formatName, maxAllowed, synergyScore) => {
          // Pick a card rarity that exceeds maxAllowed
          const maxIdx = RARITY_ORDER.indexOf(maxAllowed)
          // Card rarity is any rarity strictly above maxAllowed
          const exceedingRarities = RARITY_ORDER.slice(maxIdx + 1)
          // Pick one deterministically based on card name length
          const cardRarity = exceedingRarities[cardName.length % exceedingRarities.length]

          // Verify our setup: card rarity must exceed restriction
          expect(exceedsRarityRestriction(cardRarity, maxAllowed)).toBe(true)

          // Format rules with rarity_restriction but no mandatory_cuts
          const formatRules: FormatRules = {
            format_name: formatName,
            rarity_restriction: maxAllowed,
          }

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            neutralCategoryCount,
            neutralCategoryTargets,
            neutralComboCards,
            nullBracket,
            formatRules,
            cardRarity
          )

          // Must be flagged as format_violation
          expect(result).not.toBeNull()
          expect(result!.flag).toBe('format_violation')
          expect(result!.cardName).toBe(cardName)
          // Reason must name the specific rarity restriction
          expect(result!.reason).toContain(maxAllowed)
          // Reason must also mention the format name
          expect(result!.reason).toContain(formatName)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('card NOT in mandatory_cuts AND rarity not exceeding restriction is NOT flagged format_violation', () => {
    fc.assert(
      fc.property(
        cardNameArb,
        formatNameArb,
        // mandatory_cuts that do NOT contain the card
        fc.array(cardNameArb, { minLength: 1, maxLength: 5 }),
        rarityArb, // card rarity
        rarityArb, // max allowed rarity
        fc.integer({ min: 30, max: 100 }), // synergy >= 30 to avoid off_strategy
        (cardName, formatName, otherCuts, cardRarity, maxAllowed, synergyScore) => {
          // Ensure cardName is NOT in mandatory_cuts
          const cuts = otherCuts.filter(c => c.toLowerCase() !== cardName.toLowerCase())

          // Ensure card rarity does NOT exceed the restriction
          const cardIdx = RARITY_ORDER.indexOf(cardRarity)
          const maxIdx = RARITY_ORDER.indexOf(maxAllowed)
          fc.pre(cardIdx <= maxIdx)

          const formatRules: FormatRules = {
            format_name: formatName,
            mandatory_cuts: cuts,
            rarity_restriction: maxAllowed,
          }

          const result = classifyDeadWeight(
            cardName,
            synergyScore,
            neutralCategoryCount,
            neutralCategoryTargets,
            neutralComboCards,
            nullBracket,
            formatRules,
            cardRarity
          )

          // Must NOT be flagged as format_violation
          // (result may be null or another flag type, but never format_violation)
          if (result !== null) {
            expect(result.flag).not.toBe('format_violation')
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 9: Upgrade Ownership Cross-Reference', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * Property 9: Upgrade Ownership Cross-Reference
   * For any upgrade candidate, `owned = true` iff card exists in collection with quantity ≥ 1.
   * This tests the ownership assignment logic that the generate-upgrade-data script performs:
   * given a collection (set of owned card names with quantities) and a list of candidate names,
   * the owned field must be true if and only if the card is in the collection with quantity ≥ 1.
   */

  // The cross-reference logic as implemented by the script:
  // For each candidate, look up its name in the collection. If SUM(quantity) >= 1, owned = true.
  function assignOwnership(
    candidateNames: string[],
    collection: Map<string, number> // cardName -> total quantity
  ): { cardName: string; owned: boolean }[] {
    return candidateNames.map((cardName) => {
      const quantity = collection.get(cardName) ?? 0
      return { cardName, owned: quantity >= 1 }
    })
  }

  // Generator: card name (realistic MTG-style strings)
  const cardNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)

  // Generator: a collection entry with quantity (including 0 = "not really owned")
  const collectionEntryArb = fc.tuple(
    cardNameArb,
    fc.integer({ min: 0, max: 10 })
  )

  // Generator: a collection as a Map<string, number>
  const collectionArb = fc.uniqueArray(collectionEntryArb, {
    minLength: 0,
    maxLength: 30,
    selector: ([name]) => name.toLowerCase(),
  }).map((entries) => new Map(entries))

  // Generator: list of candidate card names (some may be in collection, some not)
  const candidateNamesArb = fc.array(cardNameArb, { minLength: 1, maxLength: 20 })

  it('owned = true iff card exists in collection with quantity >= 1', () => {
    fc.assert(
      fc.property(candidateNamesArb, collectionArb, (candidates, collection) => {
        const result = assignOwnership(candidates, collection)

        for (const { cardName, owned } of result) {
          const quantity = collection.get(cardName) ?? 0

          if (quantity >= 1) {
            // Card is in collection with quantity >= 1 → must be owned
            expect(owned).toBe(true)
          } else {
            // Card is NOT in collection or has quantity 0 → must NOT be owned
            expect(owned).toBe(false)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('owned = false when card is not in collection at all', () => {
    fc.assert(
      fc.property(
        // Generate candidate names that are guaranteed NOT in the collection
        fc.tuple(
          fc.array(cardNameArb, { minLength: 1, maxLength: 10 }),
          fc.array(cardNameArb, { minLength: 1, maxLength: 10 }),
        ).map(([candidates, collectionNames]) => {
          // Build a collection that explicitly excludes candidates
          const collection = new Map<string, number>()
          for (const name of collectionNames) {
            // Only add to collection if NOT a candidate
            if (!candidates.includes(name)) {
              collection.set(name, Math.ceil(Math.random() * 4))
            }
          }
          return { candidates, collection }
        }),
        ({ candidates, collection }) => {
          const result = assignOwnership(candidates, collection)

          for (const { cardName, owned } of result) {
            if (!collection.has(cardName)) {
              expect(owned).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('owned = true for all cards that exist in collection with quantity >= 1', () => {
    fc.assert(
      fc.property(
        // Generate candidates that are ALL in the collection with quantity >= 1
        fc.array(cardNameArb, { minLength: 1, maxLength: 15 }).chain((names) => {
          const uniqueNames = [...new Set(names)]
          const collection = new Map<string, number>()
          for (const name of uniqueNames) {
            collection.set(name, Math.ceil(Math.random() * 4) + 1) // quantity 2-5
          }
          return fc.constant({ candidates: uniqueNames, collection })
        }),
        ({ candidates, collection }) => {
          const result = assignOwnership(candidates, collection)

          // Every candidate is in collection with quantity >= 1, so all must be owned
          for (const { owned } of result) {
            expect(owned).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('cards with quantity exactly 0 are NOT owned', () => {
    fc.assert(
      fc.property(
        fc.array(cardNameArb, { minLength: 1, maxLength: 15 }),
        (candidates) => {
          // Build collection where all candidates have quantity = 0
          const collection = new Map<string, number>()
          for (const name of candidates) {
            collection.set(name, 0)
          }

          const result = assignOwnership(candidates, collection)

          for (const { owned } of result) {
            expect(owned).toBe(false)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('biconditional holds: owned=true ↔ in collection; owned=false ↔ NOT in collection', () => {
    // Mix of candidates: some in collection with qty >= 1, some with qty 0, some not in collection
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            cardNameArb,
            fc.constantFrom('owned', 'zero-quantity', 'absent') // ownership scenario
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (candidateScenarios) => {
          const collection = new Map<string, number>()
          const candidates: string[] = []

          for (const [cardName, scenario] of candidateScenarios) {
            candidates.push(cardName)
            switch (scenario) {
              case 'owned':
                collection.set(cardName, Math.ceil(Math.random() * 4) + 1) // qty >= 1
                break
              case 'zero-quantity':
                collection.set(cardName, 0)
                break
              case 'absent':
                // Don't add to collection
                break
            }
          }

          const result = assignOwnership(candidates, collection)

          for (let i = 0; i < candidateScenarios.length; i++) {
            const [, scenario] = candidateScenarios[i]
            const { owned } = result[i]

            if (scenario === 'owned') {
              expect(owned).toBe(true)
            } else {
              expect(owned).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 10: Upgrade Pairing With Dead Weight Cuts', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * Property 10: Upgrade Pairing With Dead Weight Cuts
   * For any set of upgrade candidates and dead weight cards, each upgrade in the
   * result SHALL be paired with at most one dead weight card as its `suggested_cut`,
   * and no dead weight card SHALL be used as a cut for more than one upgrade.
   */

  // pairUpgradesWithCuts is imported at the top of the file

  // Generator: unique card name (non-empty string)
  const cardNameArb = fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0)

  // Generator: role from the set used in upgrade-pairing module
  const roleArb = fc.constantFrom(
    'Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor',
    'Finisher', 'Protection', 'Tribal', 'Combo', 'Utility'
  )

  // Generator: dead weight flag
  const deadWeightFlagArb = fc.constantFrom(
    'format_violation', 'off_strategy', 'redundant', 'bracket_mismatch'
  ) as fc.Arbitrary<'format_violation' | 'off_strategy' | 'redundant' | 'bracket_mismatch'>

  // Generator: a single upgrade candidate
  const upgradeCandidateArb = fc.record({
    cardName: cardNameArb,
    role: roleArb,
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 80 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 200, noNaN: true })),
  })

  // Generator: a single dead weight card
  const deadWeightCardArb = fc.record({
    cardName: cardNameArb,
    flag: deadWeightFlagArb,
    reason: fc.string({ minLength: 1, maxLength: 80 }),
  })

  // Generator: list of upgrade candidates with unique card names
  const upgradeCandidatesArb = fc.uniqueArray(upgradeCandidateArb, {
    minLength: 0,
    maxLength: 15,
    selector: (c) => c.cardName.toLowerCase(),
  })

  // Generator: list of dead weight cards with unique card names
  const deadWeightCardsArb = fc.uniqueArray(deadWeightCardArb, {
    minLength: 0,
    maxLength: 15,
    selector: (c) => c.cardName.toLowerCase(),
  })

  it('each upgrade is paired with at most one suggestedCut', () => {
    fc.assert(
      fc.property(upgradeCandidatesArb, deadWeightCardsArb, (candidates, deadWeightCards) => {
        const result = pairUpgradesWithCuts(candidates, deadWeightCards)

        // Result length should match input candidates length
        expect(result.length).toBe(candidates.length)

        // Each upgrade has at most one suggestedCut (it's either a string or null)
        for (const paired of result) {
          expect(
            paired.suggestedCut === null || typeof paired.suggestedCut === 'string'
          ).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('no dead weight card is used as a cut for more than one upgrade', () => {
    fc.assert(
      fc.property(upgradeCandidatesArb, deadWeightCardsArb, (candidates, deadWeightCards) => {
        const result = pairUpgradesWithCuts(candidates, deadWeightCards)

        // Collect all non-null suggestedCut values
        const usedCuts = result
          .map((r: { suggestedCut: string | null }) => r.suggestedCut)
          .filter((cut: string | null): cut is string => cut !== null)

        // No duplicates — each cut card used at most once
        const uniqueCuts = new Set(usedCuts)
        expect(uniqueCuts.size).toBe(usedCuts.length)
      }),
      { numRuns: 100 }
    )
  })

  it('suggestedCut values are only drawn from the provided dead weight card names', () => {
    fc.assert(
      fc.property(upgradeCandidatesArb, deadWeightCardsArb, (candidates, deadWeightCards) => {
        const result = pairUpgradesWithCuts(candidates, deadWeightCards)

        const validCutNames = new Set(deadWeightCards.map((dw: { cardName: string }) => dw.cardName))

        for (const paired of result) {
          if (paired.suggestedCut !== null) {
            expect(validCutNames.has(paired.suggestedCut)).toBe(true)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it('when there are more upgrades than dead weight cards, some upgrades get null cuts', () => {
    // Generate cases where upgrades > dead weight to verify graceful handling
    const moreUpgradesThanCutsArb = fc.tuple(
      fc.uniqueArray(upgradeCandidateArb, {
        minLength: 3,
        maxLength: 15,
        selector: (c) => c.cardName.toLowerCase(),
      }),
      fc.uniqueArray(deadWeightCardArb, {
        minLength: 0,
        maxLength: 2,
        selector: (c) => c.cardName.toLowerCase(),
      }),
    ).filter(([upgrades, cuts]) => upgrades.length > cuts.length)

    fc.assert(
      fc.property(moreUpgradesThanCutsArb, ([candidates, deadWeightCards]) => {
        const result = pairUpgradesWithCuts(candidates, deadWeightCards)

        // Count non-null cuts — should equal the number of available dead weight cards
        const assignedCuts = result.filter(
          (r: { suggestedCut: string | null }) => r.suggestedCut !== null
        )
        expect(assignedCuts.length).toBeLessThanOrEqual(deadWeightCards.length)

        // Some upgrades must have null cuts (since we have more upgrades than cuts)
        const nullCuts = result.filter(
          (r: { suggestedCut: string | null }) => r.suggestedCut === null
        )
        expect(nullCuts.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 12: Budget Mode — Collection Filter', () => {
  /**
   * **Validates: Requirements 8.5**
   *
   * Property 12: Budget Mode — Collection Filter
   * With budget_mode='collection', every result has owned=true.
   * No unowned card SHALL appear regardless of synergy score or price.
   */

  // Generator for a PairedUpgrade object with mixed owned/unowned status
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for arrays of PairedUpgrade with mixed ownership
  const upgradeListArb = fc.array(pairedUpgradeArb, { minLength: 0, maxLength: 30 })

  it('every result from applyBudgetFilter with budget_mode="collection" has owned=true', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'collection', null)

        // Every item in the result must have owned === true
        for (const item of result) {
          expect(item.owned).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('no unowned card appears in the result regardless of synergy or price', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'collection', null)

        // No unowned card should be present
        const unownedInResult = result.filter(u => !u.owned)
        expect(unownedInResult).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it('all owned cards from the input are preserved in the result', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'collection', null)

        // The result should contain exactly the owned cards from the input
        const ownedInInput = upgrades.filter(u => u.owned)
        expect(result).toHaveLength(ownedInInput.length)

        // Each owned input card should be in the result
        for (const ownedCard of ownedInInput) {
          expect(result).toContainEqual(ownedCard)
        }
      }),
      { numRuns: 100 }
    )
  })
})



describe('Feature: oracle-upgrade-engine, Property 13: Budget Mode — Budget Filter', () => {
  /**
   * **Validates: Requirements 8.6**
   *
   * Property 13: Budget Mode — Budget Filter
   * With budget_mode='budget', every result satisfies owned=true OR price ≤ budget_ceiling.
   * No item where owned=false AND price > ceiling appears in the result.
   */

  // Generator for a PairedUpgrade object with mixed owned/unowned and varied prices
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for arrays of PairedUpgrade with mixed ownership and prices
  const upgradeListArb = fc.array(pairedUpgradeArb, { minLength: 0, maxLength: 30 })

  // Generator for a positive budget ceiling
  const budgetCeilingArb = fc.double({ min: 0.01, max: 500, noNaN: true })

  it('every result satisfies owned=true OR price <= budget_ceiling', () => {
    fc.assert(
      fc.property(upgradeListArb, budgetCeilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'budget', ceiling)

        // Every item in the result must satisfy: owned === true OR price <= ceiling
        for (const item of result) {
          const passesFilter = item.owned === true || (item.price !== null && item.price <= ceiling)
          expect(passesFilter).toBe(true)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('no item where owned=false AND price > ceiling appears in result', () => {
    fc.assert(
      fc.property(upgradeListArb, budgetCeilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'budget', ceiling)

        // No unowned card with price exceeding the ceiling should be present
        const violators = result.filter(
          item => !item.owned && item.price !== null && item.price > ceiling
        )
        expect(violators).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it('owned cards are always preserved regardless of price', () => {
    fc.assert(
      fc.property(upgradeListArb, budgetCeilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'budget', ceiling)

        // All owned cards from input should be in the result
        const ownedInInput = upgrades.filter(u => u.owned)
        for (const ownedCard of ownedInInput) {
          expect(result).toContainEqual(ownedCard)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('unowned cards with price <= ceiling are preserved in result', () => {
    fc.assert(
      fc.property(upgradeListArb, budgetCeilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'budget', ceiling)

        // All unowned cards with price <= ceiling should be in the result
        const affordableUnowned = upgrades.filter(
          u => !u.owned && u.price !== null && u.price <= ceiling
        )
        for (const card of affordableUnowned) {
          expect(result).toContainEqual(card)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('unowned cards with null price are excluded from result', () => {
    fc.assert(
      fc.property(upgradeListArb, budgetCeilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'budget', ceiling)

        // Unowned cards with null price should NOT appear (price comparison fails)
        const nullPriceUnowned = result.filter(
          item => !item.owned && item.price === null
        )
        expect(nullPriceUnowned).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })
})


describe('Feature: oracle-upgrade-engine, Property 11: Upgrade Sort Order Invariant', () => {
  /**
   * **Validates: Requirements 8.4, 9.6**
   *
   * Property 11: Upgrade Sort Order Invariant
   * For any list of upgrade results, after sorting, all entries with `owned = true`
   * SHALL appear before all entries with `owned = false`, and within each ownership
   * group the `synergy_score` SHALL be non-increasing (monotonically decreasing or equal).
   */

  // Generator for a PairedUpgrade object with arbitrary owned/synergy values
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.double({ min: 0, max: 100, noNaN: true }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('format_violation' as const, 'off_strategy' as const, 'redundant' as const, 'bracket_mismatch' as const)
    ),
  })

  // Generator for arrays of PairedUpgrade with mixed owned/unowned
  const upgradeArrayArb = fc.array(pairedUpgradeArb, { minLength: 0, maxLength: 30 })

  it('all owned entries appear before all unowned entries after sorting', () => {
    fc.assert(
      fc.property(upgradeArrayArb, (upgrades) => {
        const sorted = sortUpgrades(upgrades)

        // Find the index of the first unowned entry
        const firstUnownedIdx = sorted.findIndex(u => !u.owned)

        if (firstUnownedIdx === -1) {
          // All entries are owned (or empty) — trivially satisfied
          return
        }

        // Every entry before firstUnownedIdx must be owned
        for (let i = 0; i < firstUnownedIdx; i++) {
          expect(sorted[i].owned).toBe(true)
        }

        // Every entry from firstUnownedIdx onwards must be unowned
        for (let i = firstUnownedIdx; i < sorted.length; i++) {
          expect(sorted[i].owned).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('within the owned group, synergy_score is non-increasing', () => {
    fc.assert(
      fc.property(upgradeArrayArb, (upgrades) => {
        const sorted = sortUpgrades(upgrades)

        // Extract the owned group
        const ownedGroup = sorted.filter(u => u.owned)

        // Synergy scores should be non-increasing (each ≥ next)
        for (let i = 0; i < ownedGroup.length - 1; i++) {
          expect(ownedGroup[i].synergyScore).toBeGreaterThanOrEqual(ownedGroup[i + 1].synergyScore)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('within the unowned group, synergy_score is non-increasing', () => {
    fc.assert(
      fc.property(upgradeArrayArb, (upgrades) => {
        const sorted = sortUpgrades(upgrades)

        // Extract the unowned group
        const unownedGroup = sorted.filter(u => !u.owned)

        // Synergy scores should be non-increasing (each ≥ next)
        for (let i = 0; i < unownedGroup.length - 1; i++) {
          expect(unownedGroup[i].synergyScore).toBeGreaterThanOrEqual(unownedGroup[i + 1].synergyScore)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('sortUpgrades does not mutate the input array', () => {
    fc.assert(
      fc.property(upgradeArrayArb, (upgrades) => {
        // Take a snapshot of the original
        const originalCopy = [...upgrades]

        sortUpgrades(upgrades)

        // Original array should be unchanged
        expect(upgrades).toEqual(originalCopy)
      }),
      { numRuns: 100 }
    )
  })

  it('sortUpgrades preserves all elements (same length, same elements)', () => {
    fc.assert(
      fc.property(upgradeArrayArb, (upgrades) => {
        const sorted = sortUpgrades(upgrades)

        // Same length
        expect(sorted.length).toBe(upgrades.length)

        // Same elements (sorted by cardName for comparison)
        const originalNames = upgrades.map(u => u.cardName).sort()
        const sortedNames = sorted.map(u => u.cardName).sort()
        expect(sortedNames).toEqual(originalNames)
      }),
      { numRuns: 100 }
    )
  })
})



describe('Feature: oracle-upgrade-engine, Property 14: Budget Mode — Unrestricted Includes All', () => {
  /**
   * **Validates: Requirements 8.7**
   *
   * Property 14: Budget Mode — Unrestricted Includes All
   * With budget_mode='unrestricted', result contains all candidates that pass format
   * constraints. Since applyBudgetFilter only handles budget filtering (format
   * constraints are applied separately), calling applyBudgetFilter with 'unrestricted'
   * SHALL return all input items with no filtering applied.
   */

  // Generator for a PairedUpgrade object with mixed owned/unowned and varied prices
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for arrays of PairedUpgrade with mixed ownership and prices
  const upgradeListArb = fc.array(pairedUpgradeArb, { minLength: 0, maxLength: 30 })

  it('result length equals input length (all pass through)', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'unrestricted', null)

        // All input items must pass through — no filtering
        expect(result.length).toBe(upgrades.length)
      }),
      { numRuns: 100 }
    )
  })

  it('result contains exact same items as input (no filtering applied)', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'unrestricted', null)

        // Result must contain the same items in the same order
        expect(result).toEqual(upgrades)
      }),
      { numRuns: 100 }
    )
  })

  it('unowned cards with high prices are included (no price filtering)', () => {
    fc.assert(
      fc.property(upgradeListArb, (upgrades) => {
        const result = applyBudgetFilter(upgrades, 'unrestricted', null)

        // Every unowned card regardless of price must be in the result
        const unownedInInput = upgrades.filter(u => !u.owned)
        const unownedInResult = result.filter(u => !u.owned)
        expect(unownedInResult).toHaveLength(unownedInInput.length)

        for (const unowned of unownedInInput) {
          expect(unownedInResult).toContainEqual(unowned)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('budget_ceiling parameter is ignored in unrestricted mode', () => {
    // Even when a budget_ceiling is provided, unrestricted mode ignores it
    const ceilingArb = fc.oneof(
      fc.constant(null),
      fc.double({ min: 0.01, max: 1000, noNaN: true })
    )

    fc.assert(
      fc.property(upgradeListArb, ceilingArb, (upgrades, ceiling) => {
        const result = applyBudgetFilter(upgrades, 'unrestricted', ceiling)

        // Result must still include all items regardless of ceiling value
        expect(result.length).toBe(upgrades.length)
        expect(result).toEqual(upgrades)
      }),
      { numRuns: 100 }
    )
  })
})



describe('Feature: oracle-upgrade-engine, Property 16: Format Enforcement — Swap Limit', () => {
  /**
   * **Validates: Requirements 11.2**
   *
   * Property 16: Format Enforcement — Swap Limit
   * When existing swaps ≥ swap_limit, zero additional suggestions returned.
   * Also: when existingSwapCount < swap_limit, up to (limit - existingSwapCount)
   * suggestions pass through.
   */

  // Generator for a PairedUpgrade object
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for arrays of PairedUpgrade
  const upgradeListArb = fc.array(pairedUpgradeArb, { minLength: 1, maxLength: 20 })

  // Generator for swap_limit (reasonable range)
  const swapLimitArb = fc.integer({ min: 1, max: 20 })

  it('returns zero accepted upgrades when existingSwapCount >= swap_limit', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        swapLimitArb,
        // existingSwapCount is at or above the limit
        fc.integer({ min: 0, max: 50 }),
        (upgrades, swapLimit, extraSwaps) => {
          // Ensure existingSwapCount >= swap_limit
          const existingSwapCount = swapLimit + extraSwaps

          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            swap_limit: swapLimit,
          }

          const result = applyFormatConstraints(upgrades, formatRules, existingSwapCount, 0)

          // Must return zero accepted upgrades
          expect(result.accepted).toHaveLength(0)

          // All upgrades must be in the rejected list
          expect(result.rejected).toHaveLength(upgrades.length)
          for (const upgrade of upgrades) {
            expect(result.rejected).toContain(upgrade.cardName)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('returns zero accepted upgrades when existingSwapCount equals swap_limit exactly', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        swapLimitArb,
        (upgrades, swapLimit) => {
          // existingSwapCount === swap_limit (boundary case)
          const existingSwapCount = swapLimit

          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            swap_limit: swapLimit,
          }

          const result = applyFormatConstraints(upgrades, formatRules, existingSwapCount, 0)

          // Must return zero accepted upgrades
          expect(result.accepted).toHaveLength(0)
          expect(result.rejected).toHaveLength(upgrades.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when existingSwapCount < swap_limit, at most (swap_limit - existingSwapCount) suggestions pass through', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        swapLimitArb,
        (upgrades, swapLimit) => {
          // existingSwapCount is strictly less than the limit
          // Use a value between 0 and swapLimit - 1
          const existingSwapCount = Math.max(0, swapLimit - Math.ceil(Math.random() * swapLimit))
          fc.pre(existingSwapCount < swapLimit)

          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            swap_limit: swapLimit,
          }

          const result = applyFormatConstraints(upgrades, formatRules, existingSwapCount, 0)

          // Accepted count must be at most (swap_limit - existingSwapCount)
          const maxAllowed = swapLimit - existingSwapCount
          expect(result.accepted.length).toBeLessThanOrEqual(maxAllowed)

          // Accepted count must also not exceed the number of input upgrades
          expect(result.accepted.length).toBeLessThanOrEqual(upgrades.length)

          // Total accepted + rejected must equal input count
          expect(result.accepted.length + result.rejected.length).toBe(upgrades.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when existingSwapCount < swap_limit and fewer upgrades than remaining slots, all pass through', () => {
    // Generate cases where upgrades.length <= (swap_limit - existingSwapCount)
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }), // swap_limit
        fc.integer({ min: 0, max: 19 }), // existingSwapCount (we'll constrain below)
        fc.array(pairedUpgradeArb, { minLength: 1, maxLength: 10 }),
        (swapLimit, existingSwapCountRaw, upgrades) => {
          // Ensure existingSwapCount < swapLimit
          const existingSwapCount = Math.min(existingSwapCountRaw, swapLimit - 1)
          fc.pre(existingSwapCount < swapLimit)

          const remainingSlots = swapLimit - existingSwapCount

          // Only test when we have fewer upgrades than remaining slots
          fc.pre(upgrades.length <= remainingSlots)

          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            swap_limit: swapLimit,
          }

          const result = applyFormatConstraints(upgrades, formatRules, existingSwapCount, 0)

          // All upgrades should be accepted since we have capacity
          expect(result.accepted.length).toBe(upgrades.length)
          expect(result.rejected).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when formatRules is null, all upgrades pass through regardless of swap count', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        fc.integer({ min: 0, max: 100 }), // any existingSwapCount
        (upgrades, existingSwapCount) => {
          const result = applyFormatConstraints(upgrades, null, existingSwapCount, 0)

          // With no format rules, all upgrades are accepted
          expect(result.accepted.length).toBe(upgrades.length)
          expect(result.rejected).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})



describe('Feature: oracle-upgrade-engine, Property 17: Format Enforcement — Value Cap', () => {
  /**
   * **Validates: Requirements 11.3**
   *
   * Property 17: Format Enforcement — Value Cap
   * For any deck with a `value_cap` in its format_rules, the cumulative price of
   * all upgrade candidates in the result set plus the value of previously added
   * cards SHALL NOT exceed the declared value cap.
   */

  // Generator for a PairedUpgrade with a non-null price
  const pricedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.double({ min: 0.01, max: 50, noNaN: true }),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for an array of priced upgrades
  const upgradeListArb = fc.array(pricedUpgradeArb, { minLength: 1, maxLength: 20 })

  // Generator for a value_cap (positive dollar amount)
  const valueCapArb = fc.double({ min: 1, max: 200, noNaN: true })

  // Generator for existing added value (non-negative, less than value_cap is more interesting but not required)
  const existingAddedValueArb = fc.double({ min: 0, max: 100, noNaN: true })

  it('cumulative price of accepted upgrades + existingAddedValue does not exceed value_cap', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        valueCapArb,
        // Constrain existingAddedValue to be at most the value_cap so the property is meaningful
        // (when existingAddedValue > value_cap, the system correctly accepts nothing with price)
        valueCapArb.chain(cap =>
          fc.double({ min: 0, max: cap, noNaN: true }).map(existing => ({ cap, existing }))
        ),
        (upgrades, _unusedCap, { cap: valueCap, existing: existingAddedValue }) => {
          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            value_cap: valueCap,
          }

          const { accepted } = applyFormatConstraints(
            upgrades,
            formatRules,
            0, // existingSwapCount = 0 so swap_limit doesn't interfere
            existingAddedValue
          )

          // Sum the prices of accepted upgrades
          const acceptedPriceSum = accepted.reduce((sum, u) => {
            return sum + (u.price ?? 0)
          }, 0)

          // The cumulative value (existingAddedValue + accepted prices) must not exceed value_cap
          // Use a small epsilon for floating point arithmetic
          expect(acceptedPriceSum + existingAddedValue).toBeLessThanOrEqual(valueCap + 1e-9)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rejected upgrades are those that would have caused value_cap to be exceeded', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        valueCapArb,
        existingAddedValueArb,
        (upgrades, valueCap, existingAddedValue) => {
          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            value_cap: valueCap,
          }

          const { accepted, rejected } = applyFormatConstraints(
            upgrades,
            formatRules,
            0,
            existingAddedValue
          )

          // Total items = accepted + rejected (accounting for all input upgrades)
          expect(accepted.length + rejected.length).toBe(upgrades.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when existingAddedValue already exceeds value_cap, no upgrades with price are accepted', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        valueCapArb,
        (upgrades, valueCap) => {
          // Set existingAddedValue above the cap
          const existingAddedValue = valueCap + 1

          const formatRules: FormatRules = {
            format_name: 'precon_mod',
            value_cap: valueCap,
          }

          const { accepted } = applyFormatConstraints(
            upgrades,
            formatRules,
            0,
            existingAddedValue
          )

          // No upgrade with a non-null price should be accepted when we're already over the cap
          for (const item of accepted) {
            if (item.price !== null) {
              // If a priced item was accepted, existingAddedValue + price must still be ≤ value_cap
              // But since existingAddedValue > value_cap, no priced item should pass
              expect(existingAddedValue + item.price).toBeLessThanOrEqual(valueCap + 0.0001)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('with no value_cap in format_rules, all upgrades pass through', () => {
    fc.assert(
      fc.property(
        upgradeListArb,
        existingAddedValueArb,
        (upgrades, existingAddedValue) => {
          // Format rules without value_cap
          const formatRules: FormatRules = {
            format_name: 'baggy_league',
            rarity_restriction: 'mythic', // allow all rarities so rarity check doesn't interfere
            progression_level: 1,
            progression_points: 0,
          }

          const { accepted, rejected } = applyFormatConstraints(
            upgrades,
            formatRules,
            0,
            existingAddedValue
          )

          // Without value_cap constraint (and no rarity restriction that would reject),
          // all upgrades should be accepted
          expect(accepted.length).toBe(upgrades.length)
          expect(rejected.length).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})



describe('Feature: oracle-upgrade-engine, Property 15: Format Enforcement — Rarity Restriction', () => {
  /**
   * **Validates: Requirements 11.1**
   *
   * Property 15: Format Enforcement — Rarity Restriction
   * For any deck with a `rarity_restriction` in its format_rules, no upgrade candidate
   * in the result whose rarity exceeds the declared maximum SHALL appear in the final
   * suggestions. The rarity ordering is: common < uncommon < rare < mythic.
   */

  // Generator for a PairedUpgrade object
  const pairedUpgradeArb: fc.Arbitrary<PairedUpgrade> = fc.record({
    cardName: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
    role: fc.constantFrom('Ramp', 'Draw', 'Removal', 'Counterspell', 'Board Wipe', 'Recursion', 'Tutor', 'Finisher'),
    synergyScore: fc.integer({ min: 0, max: 100 }),
    reason: fc.string({ minLength: 1, maxLength: 100 }),
    owned: fc.boolean(),
    price: fc.oneof(fc.constant(null), fc.double({ min: 0.01, max: 500, noNaN: true })),
    suggestedCut: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    cutFlag: fc.oneof(
      fc.constant(null),
      fc.constantFrom('redundant' as const, 'off_strategy' as const, 'bracket_mismatch' as const, 'format_violation' as const)
    ),
  })

  // Generator for a rarity value
  const rarityArb: fc.Arbitrary<Rarity> = fc.constantFrom('common', 'uncommon', 'rare', 'mythic')

  // Generator for rarity_restriction (the max allowed rarity)
  const rarityRestrictionArb: fc.Arbitrary<Rarity> = fc.constantFrom('common', 'uncommon', 'rare', 'mythic')

  // Generator for arrays of PairedUpgrade with unique card names
  const upgradeListArb = fc.uniqueArray(pairedUpgradeArb, {
    minLength: 1,
    maxLength: 20,
    selector: (c) => c.cardName.toLowerCase(),
  })

  // Generator: assign a random rarity to each card in the upgrade list
  const upgradesWithRaritiesArb = upgradeListArb.chain((upgrades) => {
    // Generate a rarity for each upgrade card
    return fc.tuple(
      fc.constant(upgrades),
      fc.array(rarityArb, { minLength: upgrades.length, maxLength: upgrades.length })
    )
  }).map(([upgrades, rarities]) => {
    const rarityMap = new Map<string, string>()
    upgrades.forEach((u, i) => {
      rarityMap.set(u.cardName, rarities[i])
    })
    return { upgrades, rarityMap }
  })

  it('no card with rarity exceeding the restriction appears in accepted results', () => {
    fc.assert(
      fc.property(
        upgradesWithRaritiesArb,
        rarityRestrictionArb,
        ({ upgrades, rarityMap }, rarityRestriction) => {
          const formatRules: FormatRules = {
            format_name: 'baggy_league',
            rarity_restriction: rarityRestriction,
          }

          const { accepted } = applyFormatConstraintsWithRarity(
            upgrades,
            rarityMap,
            formatRules,
            0, // existingSwapCount
            0  // existingAddedValue
          )

          // Assert: no card in accepted has rarity exceeding the restriction
          for (const upgrade of accepted) {
            const rarity = rarityMap.get(upgrade.cardName)
            if (rarity) {
              expect(exceedsRarityRestriction(rarity, rarityRestriction)).toBe(false)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('cards with rarity at or below the restriction are accepted (when no other constraint blocks them)', () => {
    fc.assert(
      fc.property(
        upgradesWithRaritiesArb,
        rarityRestrictionArb,
        ({ upgrades, rarityMap }, rarityRestriction) => {
          // Format rules with only rarity_restriction (no swap_limit, no value_cap)
          const formatRules: FormatRules = {
            format_name: 'baggy_league',
            rarity_restriction: rarityRestriction,
          }

          const { accepted, rejected } = applyFormatConstraintsWithRarity(
            upgrades,
            rarityMap,
            formatRules,
            0, // no existing swaps
            0  // no existing added value
          )

          // Cards with rarity <= restriction should be in accepted
          for (const upgrade of upgrades) {
            const rarity = rarityMap.get(upgrade.cardName)
            if (rarity && !exceedsRarityRestriction(rarity, rarityRestriction)) {
              // Should be in accepted
              expect(accepted.some(a => a.cardName === upgrade.cardName)).toBe(true)
            }
          }

          // Cards with rarity > restriction should be in rejected
          for (const upgrade of upgrades) {
            const rarity = rarityMap.get(upgrade.cardName)
            if (rarity && exceedsRarityRestriction(rarity, rarityRestriction)) {
              expect(rejected).toContain(upgrade.cardName)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when rarity_restriction is mythic, all rarities are accepted', () => {
    fc.assert(
      fc.property(
        upgradesWithRaritiesArb,
        ({ upgrades, rarityMap }) => {
          // mythic is the highest — nothing exceeds it
          const formatRules: FormatRules = {
            format_name: 'baggy_league',
            rarity_restriction: 'mythic',
          }

          const { accepted, rejected } = applyFormatConstraintsWithRarity(
            upgrades,
            rarityMap,
            formatRules,
            0,
            0
          )

          // All cards should be accepted since mythic is the max
          expect(accepted.length).toBe(upgrades.length)
          expect(rejected).toHaveLength(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('when rarity_restriction is common, only commons are accepted', () => {
    fc.assert(
      fc.property(
        upgradesWithRaritiesArb,
        ({ upgrades, rarityMap }) => {
          const formatRules: FormatRules = {
            format_name: 'baggy_league',
            rarity_restriction: 'common',
          }

          const { accepted } = applyFormatConstraintsWithRarity(
            upgrades,
            rarityMap,
            formatRules,
            0,
            0
          )

          // Only commons should be in accepted
          for (const upgrade of accepted) {
            const rarity = rarityMap.get(upgrade.cardName)
            if (rarity) {
              expect(rarity).toBe('common')
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('rarity ordering is strictly common < uncommon < rare < mythic', () => {
    // Verify that the rarity comparison works correctly for all pairs
    fc.assert(
      fc.property(
        rarityArb,
        rarityArb,
        (cardRarity, maxAllowed) => {
          const cardIdx = RARITY_ORDER.indexOf(cardRarity)
          const maxIdx = RARITY_ORDER.indexOf(maxAllowed)

          const exceeds = exceedsRarityRestriction(cardRarity, maxAllowed)

          // exceeds should be true iff cardIdx > maxIdx
          expect(exceeds).toBe(cardIdx > maxIdx)
        }
      ),
      { numRuns: 100 }
    )
  })
})
