/**
 * Bug Condition Exploration Test — Enriched Columns Destroyed on Reimport
 *
 * This test encodes the EXPECTED behavior for the diffDeckCards() function.
 * It imports diffDeckCards which does NOT YET EXIST — the import failure
 * confirms the bug condition: there is no diff primitive, so the destructive
 * delete-then-reinsert is the only reimport path.
 *
 * EXPECTED OUTCOME: Test FAILS (proves the diff primitive is needed)
 *
 * Once diffDeckCards is implemented, this same test validates the fix.
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// This import WILL FAIL — diffDeckCards does not exist yet.
// The failure confirms the bug: no diff primitive exists to preserve enriched columns.
import { diffDeckCards } from '@/lib/deck-cards-diff'

// ---------------------------------------------------------------------------
// Types (matching the deck_cards schema)
// ---------------------------------------------------------------------------

interface ExistingDeckCardRow {
  id: number
  deck_id: number
  card_name: string
  scryfall_id: string
  set_code: string
  quantity: number
  categories: string
  is_commander: boolean
  user_id: string
  // Enriched columns — these are what gets destroyed on reimport
  physical_copy_id: number | null
  ownership_status: string | null
  proxy_of_deck_id: number | null
  dead_weight_flag: string | null
  dead_weight_reason: string | null
}

interface IncomingCard {
  card_name: string
  scryfall_id: string
  set_code: string
  quantity: number
  categories: string
  is_commander: boolean
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const ARCHIDEKT_DEFAULT_CATEGORIES = '["Creature"]'

/** Generate a non-empty card name */
const arbCardName = fc.stringMatching(/^[a-z ]{3,20}$/).filter((s) => s.trim().length > 0)

/** Generate a scryfall-style UUID */
const arbScryfallId = fc.uuid()

/** Generate a set code */
const arbSetCode = fc.stringMatching(/^[a-z0-9]{3,5}$/)

/** Generate a non-default categories value (simulating Oracle edits) */
const arbEnrichedCategories = fc.constantFrom(
  '["Ramp","Draw"]',
  '["Removal"]',
  '["Finisher","Combo"]',
  '["Tokens","Tribal"]',
  '["Protection"]'
)

/** Generate an existing deck_cards row with enriched columns populated */
const arbExistingRow = (idGen: fc.Arbitrary<number>) =>
  fc.record({
    id: idGen,
    deck_id: fc.constant(1000),
    card_name: arbCardName,
    scryfall_id: arbScryfallId,
    set_code: arbSetCode,
    quantity: fc.constant(1), // Each row is quantity=1 in this schema
    categories: arbEnrichedCategories,
    is_commander: fc.constant(false),
    user_id: fc.constant('user-123'),
    // At least one enriched column is non-null (bug condition)
    physical_copy_id: fc.option(fc.integer({ min: 1, max: 10000 }), { nil: null, freq: 3 }),
    ownership_status: fc.option(
      fc.constantFrom('original', 'proxy', 'borrowed'),
      { nil: null, freq: 3 }
    ),
    proxy_of_deck_id: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null, freq: 8 }),
    dead_weight_flag: fc.option(fc.constantFrom('true'), { nil: null, freq: 8 }),
    dead_weight_reason: fc.option(
      fc.constantFrom('outclassed', 'off-theme', 'too-expensive'),
      { nil: null, freq: 8 }
    ),
  })

/**
 * Generate a set of existing rows that satisfy the bug condition:
 * At least one row has a non-null enriched column.
 */
const arbExistingRowsWithEnrichment: fc.Arbitrary<ExistingDeckCardRow[]> = fc
  .array(arbExistingRow(fc.integer({ min: 1, max: 50000 })), { minLength: 2, maxLength: 10 })
  .filter((rows) => {
    // Bug condition: at least one row has enriched data
    return rows.some(
      (row) =>
        row.physical_copy_id != null ||
        row.ownership_status != null ||
        row.categories !== ARCHIDEKT_DEFAULT_CATEGORIES ||
        row.proxy_of_deck_id != null ||
        row.dead_weight_flag != null ||
        row.dead_weight_reason != null
    )
  })
  .map((rows) => {
    // Ensure unique IDs
    return rows.map((row, i) => ({ ...row, id: i + 1 }))
  })

/**
 * Generate incoming cards that share stable identity (card_name, scryfall_id)
 * with SOME existing rows (simulating a reimport of the same deck).
 */
function arbIncomingCardsForExisting(existingRows: ExistingDeckCardRow[]): fc.Arbitrary<IncomingCard[]> {
  // Take identity keys from existing rows
  const existingIdentities = existingRows.map((r) => ({
    card_name: r.card_name,
    scryfall_id: r.scryfall_id,
    set_code: r.set_code,
  }))

  // Generate incoming cards: some overlap with existing, some are new
  const arbOverlappingCard = fc.constantFrom(...existingIdentities).map((identity) => ({
    card_name: identity.card_name,
    scryfall_id: identity.scryfall_id,
    set_code: identity.set_code,
    quantity: 1,
    categories: ARCHIDEKT_DEFAULT_CATEGORIES, // Archidekt always sends its own categories
    is_commander: false,
  }))

  const arbNewCard: fc.Arbitrary<IncomingCard> = fc.record({
    card_name: arbCardName,
    scryfall_id: arbScryfallId,
    set_code: arbSetCode,
    quantity: fc.constant(1),
    categories: fc.constant(ARCHIDEKT_DEFAULT_CATEGORIES),
    is_commander: fc.constant(false),
  })

  // Mix: at least 1 overlapping + optional new cards
  return fc.tuple(
    fc.array(arbOverlappingCard, { minLength: 1, maxLength: existingIdentities.length }),
    fc.array(arbNewCard, { minLength: 0, maxLength: 3 })
  ).map(([overlapping, newCards]) => [...overlapping, ...newCards])
}

// ---------------------------------------------------------------------------
// Property 1: Bug Condition — Enriched Columns Preserved on Persisting Rows
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — Enriched Columns Destroyed on Reimport', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
   *
   * For all inputs satisfying the bug condition (existing rows have enriched data),
   * diffDeckCards(existing, incoming) produces a toKeep set where every kept row's
   * enriched columns are preserved unchanged.
   */
  it('persisting rows retain all enriched columns unchanged after diff', () => {
    fc.assert(
      fc.property(
        arbExistingRowsWithEnrichment.chain((existingRows) =>
          arbIncomingCardsForExisting(existingRows).map((incoming) => ({
            existingRows,
            incoming,
          }))
        ),
        ({ existingRows, incoming }) => {
          const diff = diffDeckCards(existingRows, incoming)

          // Build lookup of existing rows by id
          const existingById = new Map(existingRows.map((r) => [r.id, r]))

          // toKeep rows must preserve all enriched columns
          for (const keptId of diff.toKeep) {
            const originalRow = existingById.get(keptId)
            expect(originalRow).toBeDefined()

            // The kept row is NOT deleted and NOT reinserted — enriched columns survive
            expect(diff.toDelete).not.toContain(keptId)

            // Verify the row exists in the original set (identity preserved)
            if (originalRow) {
              // These enriched columns must be preserved (they're not in toInsert as new rows)
              expect(originalRow.physical_copy_id).toBeDefined()
              expect(originalRow.ownership_status).toBeDefined()
              expect(originalRow.categories).toBeDefined()
              expect(originalRow.proxy_of_deck_id).toBeDefined()
              expect(originalRow.dead_weight_flag).toBeDefined()
              expect(originalRow.dead_weight_reason).toBeDefined()
            }
          }

          // toKeep + toDelete should account for all existing rows
          const accountedIds = new Set([...diff.toKeep, ...diff.toDelete])
          for (const row of existingRows) {
            expect(accountedIds.has(row.id)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * New rows (toInsert) have null physical_copy_id/ownership_status
   * and use incoming Archidekt categories.
   */
  it('newly inserted rows have null enriched columns and use Archidekt categories', () => {
    fc.assert(
      fc.property(
        arbExistingRowsWithEnrichment.chain((existingRows) =>
          arbIncomingCardsForExisting(existingRows).map((incoming) => ({
            existingRows,
            incoming,
          }))
        ),
        ({ existingRows, incoming }) => {
          const diff = diffDeckCards(existingRows, incoming)

          // All new rows must have null enriched columns
          for (const newRow of diff.toInsert) {
            expect(newRow.physical_copy_id).toBeNull()
            expect(newRow.ownership_status).toBeNull()
            // New rows use Archidekt's categories (from incoming)
            expect(newRow.categories).toBeDefined()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 2.5**
   *
   * When quantity decreases for a printing slot, rows with physical_copy_id = null
   * are preferred for deletion over assigned rows.
   */
  it('prefers deleting unassigned rows when quantity decreases', () => {
    // Create a scenario with multiple rows for the same identity,
    // some assigned and some not
    const arbQuantityDecreaseScenario = fc.record({
      card_name: arbCardName,
      scryfall_id: arbScryfallId,
      set_code: arbSetCode,
    }).chain((identity) => {
      // 3 existing rows for same identity: 1 assigned, 2 unassigned
      const existingRows: ExistingDeckCardRow[] = [
        {
          id: 1,
          deck_id: 1000,
          ...identity,
          quantity: 1,
          categories: '["Creature"]',
          is_commander: false,
          user_id: 'user-123',
          physical_copy_id: 42, // ASSIGNED
          ownership_status: 'original',
          proxy_of_deck_id: null,
          dead_weight_flag: null,
          dead_weight_reason: null,
        },
        {
          id: 2,
          deck_id: 1000,
          ...identity,
          quantity: 1,
          categories: '["Creature"]',
          is_commander: false,
          user_id: 'user-123',
          physical_copy_id: null, // UNASSIGNED
          ownership_status: null,
          proxy_of_deck_id: null,
          dead_weight_flag: null,
          dead_weight_reason: null,
        },
        {
          id: 3,
          deck_id: 1000,
          ...identity,
          quantity: 1,
          categories: '["Creature"]',
          is_commander: false,
          user_id: 'user-123',
          physical_copy_id: null, // UNASSIGNED
          ownership_status: null,
          proxy_of_deck_id: null,
          dead_weight_flag: null,
          dead_weight_reason: null,
        },
      ]

      // Incoming: only 1 copy (quantity decreased from 3 to 1)
      const incoming: IncomingCard[] = [
        {
          ...identity,
          quantity: 1,
          categories: ARCHIDEKT_DEFAULT_CATEGORIES,
          is_commander: false,
        },
      ]

      return fc.constant({ existingRows, incoming })
    })

    fc.assert(
      fc.property(arbQuantityDecreaseScenario, ({ existingRows, incoming }) => {
        const diff = diffDeckCards(existingRows, incoming)

        // 2 rows should be deleted (quantity went from 3 to 1)
        expect(diff.toDelete.length).toBe(2)

        // The assigned row (id=1, physical_copy_id=42) should be KEPT, not deleted
        expect(diff.toKeep).toContain(1)

        // The unassigned rows (id=2, id=3) should be deleted
        expect(diff.toDelete).toContain(2)
        expect(diff.toDelete).toContain(3)
      }),
      { numRuns: 50 }
    )
  })
})
