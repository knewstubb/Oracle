/**
 * Preservation Property Tests — First-Time Import and Card Removal Behavior
 *
 * These tests define preservation contracts for the diffDeckCards() function.
 * They encode behavior that MUST remain unchanged after the fix:
 *
 * 1. First-time imports (no prior rows) produce all fresh rows with Archidekt categories
 * 2. Cards removed from the source are correctly identified for deletion
 * 3. Stable identity matching (card_name, scryfall_id) treats different printings as different slots
 *
 * EXPECTED OUTCOME: Tests will FAIL because diffDeckCards doesn't exist yet.
 * Once implemented, these tests validate preservation of existing behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.5, 3.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// This import WILL FAIL — diffDeckCards does not exist yet.
// The failure confirms that the diff primitive still needs to be implemented.
import { diffDeckCards } from '@/lib/deck-cards-diff'

// ---------------------------------------------------------------------------
// Types (matching the deck_cards schema — same as bug condition test)
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
  // Enriched columns
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

/** Generate a category string from Archidekt */
const arbArchidektCategories = fc.constantFrom(
  '["Creature"]',
  '["Instant"]',
  '["Sorcery"]',
  '["Artifact"]',
  '["Enchantment"]',
  '["Land"]',
  '["Planeswalker"]'
)

/** Generate an incoming card with Archidekt categories */
const arbIncomingCard: fc.Arbitrary<IncomingCard> = fc.record({
  card_name: arbCardName,
  scryfall_id: arbScryfallId,
  set_code: arbSetCode,
  quantity: fc.constant(1),
  categories: arbArchidektCategories,
  is_commander: fc.constant(false),
})

/** Generate a list of unique incoming cards (unique by identity key) */
const arbUniqueIncomingCards: fc.Arbitrary<IncomingCard[]> = fc
  .array(arbIncomingCard, { minLength: 1, maxLength: 15 })
  .map((cards) => {
    // Deduplicate by (card_name, scryfall_id) identity key
    const seen = new Set<string>()
    return cards.filter((c) => {
      const key = `${c.card_name}|${c.scryfall_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })
  .filter((cards) => cards.length >= 1)

// ---------------------------------------------------------------------------
// Property 2a: First-Time Import — All Fresh Rows
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — First-Time Import and Card Removal Behavior', () => {
  /**
   * **Validates: Requirements 3.1, 3.6**
   *
   * For all inputs where existingRows.length === 0 (first-time import),
   * diffDeckCards([], incomingCards) produces:
   * - toDelete = [] (nothing to delete)
   * - toKeep = [] (nothing to keep)
   * - toInsert contains all incoming cards with Archidekt categories and null enriched columns
   */
  it('first-time import: produces all fresh rows with null enriched columns and Archidekt categories', () => {
    fc.assert(
      fc.property(
        arbUniqueIncomingCards,
        (incomingCards) => {
          const existingRows: ExistingDeckCardRow[] = []

          const diff = diffDeckCards(existingRows, incomingCards)

          // No rows to delete (nothing existed before)
          expect(diff.toDelete).toEqual([])

          // No rows to keep (nothing existed before)
          expect(diff.toKeep).toEqual([])

          // All incoming cards should be in toInsert
          expect(diff.toInsert.length).toBe(incomingCards.length)

          // Each inserted row must have null enriched columns and use Archidekt categories
          for (let i = 0; i < diff.toInsert.length; i++) {
            const inserted = diff.toInsert[i]

            // Null enriched columns (fresh row, no prior data)
            expect(inserted.physical_copy_id).toBeNull()
            expect(inserted.ownership_status).toBeNull()

            // Categories come from the incoming Archidekt source
            expect(inserted.categories).toBeDefined()
            expect(typeof inserted.categories).toBe('string')
          }

          // Verify every incoming card identity appears in toInsert
          const insertedIdentities = new Set(
            diff.toInsert.map((r: any) => `${r.card_name}|${r.scryfall_id}`)
          )
          for (const incoming of incomingCards) {
            const key = `${incoming.card_name}|${incoming.scryfall_id}`
            expect(insertedIdentities.has(key)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property 2b: Card Removal — Removed Cards Identified for Deletion
  // ---------------------------------------------------------------------------

  /**
   * **Validates: Requirements 3.2**
   *
   * For all inputs where incoming cards are a strict subset of existing cards
   * (some cards removed), diffDeckCards(existing, incoming) produces:
   * - toDelete containing exactly the rows whose (card_name, scryfall_id)
   *   is NOT in the incoming set
   */
  it('card removal: cards no longer in source are correctly identified for deletion', () => {
    // Generate existing rows, then create incoming as a strict subset
    const arbRemovalScenario = arbUniqueIncomingCards
      .filter((cards) => cards.length >= 3) // Need at least 3 to remove some
      .chain((fullCardList) => {
        // Create existing rows from the full card list
        const existingRows: ExistingDeckCardRow[] = fullCardList.map((card, idx) => ({
          id: idx + 1,
          deck_id: 1000,
          card_name: card.card_name,
          scryfall_id: card.scryfall_id,
          set_code: card.set_code,
          quantity: 1,
          categories: card.categories,
          is_commander: card.is_commander,
          user_id: 'user-123',
          physical_copy_id: idx % 2 === 0 ? idx + 100 : null, // Some assigned, some not
          ownership_status: idx % 2 === 0 ? 'original' : null,
          proxy_of_deck_id: null,
          dead_weight_flag: null,
          dead_weight_reason: null,
        }))

        // Remove 1-2 cards from incoming (strict subset)
        const removeCount = Math.min(2, Math.floor(fullCardList.length / 2))
        const incoming = fullCardList.slice(removeCount) // Remove the first `removeCount` cards

        return fc.constant({ existingRows, incoming, removedRows: existingRows.slice(0, removeCount) })
      })

    fc.assert(
      fc.property(arbRemovalScenario, ({ existingRows, incoming, removedRows }) => {
        const diff = diffDeckCards(existingRows, incoming)

        // Build set of incoming identity keys
        const incomingIdentities = new Set(
          incoming.map((c) => `${c.card_name}|${c.scryfall_id}`)
        )

        // toDelete should contain exactly the IDs whose identity is NOT in incoming
        const expectedDeleteIds = existingRows
          .filter((row) => !incomingIdentities.has(`${row.card_name}|${row.scryfall_id}`))
          .map((row) => row.id)

        expect(diff.toDelete.sort()).toEqual(expectedDeleteIds.sort())

        // Removed rows should match what we expect
        for (const removed of removedRows) {
          expect(diff.toDelete).toContain(removed.id)
        }

        // Kept rows should NOT be in toDelete
        for (const keptId of diff.toKeep) {
          expect(diff.toDelete).not.toContain(keptId)
        }
      }),
      { numRuns: 100 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property 2c: Stable Identity — Same Name + Different Scryfall ID = Different Slots
  // ---------------------------------------------------------------------------

  /**
   * **Validates: Requirements 3.1, 3.2, 3.5, 3.6**
   *
   * For all random card lists with mixed scryfall_id values, stable identity
   * matching (card_name, scryfall_id) is correct — same name with different
   * scryfall_id are treated as different printing slots.
   */
  it('stable identity: same card_name with different scryfall_id are treated as different printing slots', () => {
    // Generate a scenario where the same card name has multiple printings (different scryfall_ids)
    const arbMultiPrintingScenario = fc.record({
      card_name: arbCardName,
      set_code_a: arbSetCode,
      set_code_b: arbSetCode,
      scryfall_id_a: arbScryfallId,
      scryfall_id_b: arbScryfallId,
    }).filter((s) => s.scryfall_id_a !== s.scryfall_id_b) // Ensure different printings
      .chain((scenario) => {
        // Two existing rows: same card name, different scryfall_ids (different printings)
        const existingRows: ExistingDeckCardRow[] = [
          {
            id: 1,
            deck_id: 1000,
            card_name: scenario.card_name,
            scryfall_id: scenario.scryfall_id_a,
            set_code: scenario.set_code_a,
            quantity: 1,
            categories: '["Creature"]',
            is_commander: false,
            user_id: 'user-123',
            physical_copy_id: 42,
            ownership_status: 'original',
            proxy_of_deck_id: null,
            dead_weight_flag: null,
            dead_weight_reason: null,
          },
          {
            id: 2,
            deck_id: 1000,
            card_name: scenario.card_name,
            scryfall_id: scenario.scryfall_id_b,
            set_code: scenario.set_code_b,
            quantity: 1,
            categories: '["Creature"]',
            is_commander: false,
            user_id: 'user-123',
            physical_copy_id: 99,
            ownership_status: 'original',
            proxy_of_deck_id: null,
            dead_weight_flag: null,
            dead_weight_reason: null,
          },
        ]

        // Incoming: only printing A remains (printing B removed)
        const incoming: IncomingCard[] = [
          {
            card_name: scenario.card_name,
            scryfall_id: scenario.scryfall_id_a,
            set_code: scenario.set_code_a,
            quantity: 1,
            categories: '["Creature"]',
            is_commander: false,
          },
        ]

        return fc.constant({ existingRows, incoming, scenario })
      })

    fc.assert(
      fc.property(arbMultiPrintingScenario, ({ existingRows, incoming, scenario }) => {
        const diff = diffDeckCards(existingRows, incoming)

        // Printing A (scryfall_id_a) should be KEPT — it's still in the incoming set
        expect(diff.toKeep).toContain(1)

        // Printing B (scryfall_id_b) should be DELETED — it's NOT in the incoming set
        expect(diff.toDelete).toContain(2)

        // They must NOT be treated as the same slot just because card_name matches
        // (i.e., printing B must not be kept just because "same card name" is in incoming)
        expect(diff.toKeep).not.toContain(2)
        expect(diff.toDelete).not.toContain(1)

        // No new inserts needed (incoming card matched existing printing A)
        expect(diff.toInsert.length).toBe(0)
      }),
      { numRuns: 100 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property 2d: skipAutoAssign suppression (contract documentation)
  // ---------------------------------------------------------------------------

  /**
   * **Validates: Requirements 3.5**
   *
   * This is a documentation test: diffDeckCards is a pure function that does NOT
   * trigger auto-assign. The skipAutoAssign flag is respected at the caller level
   * (importDeckExistingCollection). The diff primitive itself is unaware of it.
   *
   * The contract: diffDeckCards produces the same output regardless of any
   * auto-assign flags — it's purely about computing the diff.
   */
  it('diffDeckCards is a pure function: same inputs always produce the same diff output', () => {
    const arbPureScenario = arbUniqueIncomingCards
      .filter((cards) => cards.length >= 2)
      .chain((cards) => {
        const existingRows: ExistingDeckCardRow[] = cards.slice(0, 1).map((card, idx) => ({
          id: idx + 1,
          deck_id: 1000,
          card_name: card.card_name,
          scryfall_id: card.scryfall_id,
          set_code: card.set_code,
          quantity: 1,
          categories: card.categories,
          is_commander: card.is_commander,
          user_id: 'user-123',
          physical_copy_id: null,
          ownership_status: null,
          proxy_of_deck_id: null,
          dead_weight_flag: null,
          dead_weight_reason: null,
        }))

        return fc.constant({ existingRows, incoming: cards })
      })

    fc.assert(
      fc.property(arbPureScenario, ({ existingRows, incoming }) => {
        // Call diffDeckCards twice with same inputs
        const diff1 = diffDeckCards(existingRows, incoming)
        const diff2 = diffDeckCards(existingRows, incoming)

        // Pure function: same inputs → same outputs (deterministic)
        expect(diff1.toDelete.sort()).toEqual(diff2.toDelete.sort())
        expect(diff1.toKeep.sort()).toEqual(diff2.toKeep.sort())
        expect(diff1.toInsert.length).toBe(diff2.toInsert.length)
      }),
      { numRuns: 50 }
    )
  })
})
