import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  generateDeckListMarkdown,
  type DeckListCard,
  type DeckListInput,
} from './deck-list-generator'

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

const arbCard: fc.Arbitrary<DeckListCard> = fc.record({
  cardName: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  category: fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length > 0),
  setCode: fc.option(fc.string({ minLength: 2, maxLength: 5 })),
  collectorNumber: fc.option(fc.string({ minLength: 1, maxLength: 5 })),
  status: fc.constantFrom('Original' as const, 'Proxy' as const),
  isCommander: fc.boolean(),
  quantity: fc.integer({ min: 1, max: 4 }),
})

const arbDeck: fc.Arbitrary<DeckListInput> = fc
  .array(arbCard, { minLength: 1, maxLength: 150 })
  .map((cards) => ({ cards }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count card data rows in the markdown output.
 *
 * Card rows are tab-indented table rows whose first cell is a numeric
 * quantity. The header, separator, and summary total rows never have a plain
 * numeric first cell, so this identifies card rows structurally rather than by
 * matching text that could also appear inside a card's own fields (e.g. a set
 * code or category of `**`, which previously looked like the bold total row).
 */
function countCardRows(markdown: string): number {
  const lines = markdown.split('\n')
  let count = 0
  for (const line of lines) {
    if (!line.startsWith('\t|')) continue
    const firstCell = line
      .split('|')
      .map((cell) => cell.trim())
      .find((cell) => cell.length > 0)
    if (firstCell !== undefined && /^\d+$/.test(firstCell)) {
      count++
    }
  }
  return count
}

// ---------------------------------------------------------------------------
// Property 1: Card Completeness
// Validates: Requirements 1.1, 5.5
// ---------------------------------------------------------------------------

describe('Property 1: Card Completeness', () => {
  it('output contains exactly N rows and summary total equals N for any N-card input', () => {
    /**
     * **Validates: Requirements 1.1, 5.5**
     */
    fc.assert(
      fc.property(arbDeck, (input) => {
        const result = generateDeckListMarkdown(input)
        const totalQty = input.cards.reduce((sum, c) => sum + c.quantity, 0)

        // totalCards field matches sum of quantities
        expect(result.totalCards).toBe(totalQty)

        // Row count in markdown equals number of cards (one row per card, not per quantity)
        const rowCount = countCardRows(result.markdown)
        expect(rowCount).toBe(input.cards.length)

        // Summary line contains the correct total
        expect(result.markdown).toContain(`${totalQty} cards`)
      }),
      { numRuns: 100 }
    )
  })

  it('counts rows correctly when a set code or category looks like bold text (**)', () => {
    // Regression for the intermittent failure where countCardRows mistook a
    // card row containing `| **` for the bold summary total row.
    const input: DeckListInput = {
      cards: [
        {
          cardName: 'Sol Ring',
          category: 'Ramp',
          setCode: '**',
          collectorNumber: '263',
          status: 'Original',
          isCommander: false,
          quantity: 1,
        },
        {
          cardName: 'Korvold, Fae-Cursed King',
          category: '**',
          setCode: 'ELD',
          collectorNumber: '197',
          status: 'Proxy',
          isCommander: true,
          quantity: 2,
        },
      ],
    }

    const result = generateDeckListMarkdown(input)

    expect(result.totalCards).toBe(3)
    expect(countCardRows(result.markdown)).toBe(input.cards.length)
    expect(result.markdown).toContain('3 cards')
  })
})

// ---------------------------------------------------------------------------
// Property 4: Ordering Invariants
// Validates: Requirements 1.7, 1.8, 1.9
// ---------------------------------------------------------------------------

describe('Property 4: Ordering Invariants', () => {
  it('Commander group is first; remaining groups alphabetical; cards sorted within groups', () => {
    /**
     * **Validates: Requirements 1.7, 1.8, 1.9**
     */
    fc.assert(
      fc.property(arbDeck, (input) => {
        const result = generateDeckListMarkdown(input)
        const { categoryGroups } = result

        const hasCommanders = input.cards.some((c) => c.isCommander)

        if (hasCommanders) {
          // Commander group is first
          expect(categoryGroups[0].name).toBe('Commander')
        }

        // Remaining groups (after Commander, if present) are alphabetical
        const startIdx = hasCommanders ? 1 : 0
        const remainingNames = categoryGroups
          .slice(startIdx)
          .map((g) => g.name)
        const sortedRemaining = [...remainingNames].sort((a, b) =>
          a.localeCompare(b)
        )
        expect(remainingNames).toEqual(sortedRemaining)

        // Cards within each group are sorted alphabetically
        for (const group of categoryGroups) {
          const names = group.cards.map((c) => c.cardName)
          const sortedNames = [...names].sort((a, b) => a.localeCompare(b))
          expect(names).toEqual(sortedNames)
        }
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 5: Summary Accuracy
// Validates: Requirements 5.5, 6.2
// ---------------------------------------------------------------------------

describe('Property 5: Summary Accuracy', () => {
  it('proxy count in summary equals count of Proxy status rows; total matches row count', () => {
    /**
     * **Validates: Requirements 5.5, 6.2**
     */
    fc.assert(
      fc.property(arbDeck, (input) => {
        const result = generateDeckListMarkdown(input)

        // proxyCount field matches actual proxy card quantities in input
        const expectedProxyCount = input.cards
          .filter((c) => c.status === 'Proxy')
          .reduce((sum, c) => sum + c.quantity, 0)
        expect(result.proxyCount).toBe(expectedProxyCount)

        // Summary line contains correct proxy count
        expect(result.markdown).toContain(`${expectedProxyCount} proxies`)

        // totalCards matches sum of quantities
        const expectedTotal = input.cards.reduce((sum, c) => sum + c.quantity, 0)
        expect(result.totalCards).toBe(expectedTotal)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 6: Commander Grouping Override
// Validates: Requirements 1.7
// ---------------------------------------------------------------------------

describe('Property 6: Commander Grouping Override', () => {
  it('cards with isCommander=true always appear in Commander group regardless of category', () => {
    /**
     * **Validates: Requirements 1.7**
     */
    // Generate decks that always have at least one commander card
    const arbDeckWithCommanders = fc
      .array(arbCard, { minLength: 1, maxLength: 100 })
      .map((cards) => {
        // Ensure at least one commander exists with a non-"Commander" category
        const modified = [...cards]
        modified[0] = {
          ...modified[0],
          isCommander: true,
          category: 'Ramp', // Explicitly non-Commander category
        }
        return { cards: modified }
      })

    fc.assert(
      fc.property(arbDeckWithCommanders, (input) => {
        const result = generateDeckListMarkdown(input)
        const { categoryGroups } = result

        const commanderGroup = categoryGroups.find(
          (g) => g.name === 'Commander'
        )
        const nonCommanderGroups = categoryGroups.filter(
          (g) => g.name !== 'Commander'
        )

        // All commander cards from input must be in the Commander group
        const commanderCards = input.cards.filter((c) => c.isCommander)
        expect(commanderGroup).toBeDefined()
        expect(commanderGroup!.cards.length).toBe(commanderCards.length)

        // Verify each commander card is in the Commander group
        for (const card of commanderCards) {
          const found = commanderGroup!.cards.some(
            (c) => c.cardName === card.cardName
          )
          expect(found).toBe(true)
        }

        // Commander cards must NOT appear in any other group
        for (const group of nonCommanderGroups) {
          for (const card of group.cards) {
            expect(card.isCommander).toBe(false)
          }
        }
      }),
      { numRuns: 100 }
    )
  })
})
