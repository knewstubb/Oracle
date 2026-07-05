import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeAllocations,
  type AllocationInput,
  type PrintingSupply,
  type AllocationOutput,
} from './allocation-resolver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    demandMap: new Map(),
    supplyMap: new Map(),
    deckPriority: new Map(),
    overrides: new Map(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('computeAllocations', () => {
  describe('single-deck cards', () => {
    it('assigns original when card is owned', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
        ]),
      })

      const result = computeAllocations(input)

      expect(result.allocations).toHaveLength(1)
      expect(result.allocations[0]).toMatchObject({
        cardName: 'Sol Ring',
        deckId: 1,
        role: 'original',
        scryfallId: 'sol-1',
        setCode: 'cmm',
        collectorNumber: '379',
        priorityOverride: false,
      })
      expect(result.proxyReport).toHaveLength(0)
    })

    it('assigns proxy when card is not owned', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1]]]),
        supplyMap: new Map(), // not in collection
      })

      const result = computeAllocations(input)

      expect(result.allocations).toHaveLength(1)
      expect(result.allocations[0]).toMatchObject({
        cardName: 'Sol Ring',
        deckId: 1,
        role: 'proxy',
        scryfallId: null,
        priorityOverride: false,
      })
      expect(result.proxyReport).toHaveLength(1)
      expect(result.proxyReport[0].deficit).toBe(1)
    })
  })

  describe('shared cards — priority ordering', () => {
    it('allocates to highest priority deck first (lower number = higher priority)', () => {
      const input = makeInput({
        demandMap: new Map([['Cyclonic Rift', [1, 2, 3]]]),
        supplyMap: new Map([
          ['Cyclonic Rift', [{ scryfallId: 'rift-1', setCode: 'mm3', collectorNumber: '35', quantity: 1 }]],
        ]),
        deckPriority: new Map([
          [1, 30],
          [2, 10], // highest priority
          [3, 20],
        ]),
      })

      const result = computeAllocations(input)

      expect(result.allocations).toHaveLength(3)
      const deck2 = result.allocations.find((a) => a.deckId === 2)!
      expect(deck2.role).toBe('original')
      expect(deck2.scryfallId).toBe('rift-1')

      const deck3 = result.allocations.find((a) => a.deckId === 3)!
      expect(deck3.role).toBe('proxy')

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      expect(deck1.role).toBe('proxy')
    })

    it('tie-breaks by deck ID ASC when priorities are equal', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [5, 3, 7]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
        ]),
        deckPriority: new Map([
          [5, 10],
          [3, 10], // same priority, lower ID wins
          [7, 10],
        ]),
      })

      const result = computeAllocations(input)

      const deck3 = result.allocations.find((a) => a.deckId === 3)!
      expect(deck3.role).toBe('original')

      const deck5 = result.allocations.find((a) => a.deckId === 5)!
      expect(deck5.role).toBe('proxy')

      const deck7 = result.allocations.find((a) => a.deckId === 7)!
      expect(deck7.role).toBe('proxy')
    })

    it('uses MAX_SAFE_INTEGER for decks without explicit priority', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
        ]),
        deckPriority: new Map([[1, 50]]), // deck 2 has no priority → defaults to MAX
      })

      const result = computeAllocations(input)

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      expect(deck1.role).toBe('original')

      const deck2 = result.allocations.find((a) => a.deckId === 2)!
      expect(deck2.role).toBe('proxy')
    })
  })

  describe('manual overrides', () => {
    it('pin_original consumes a copy regardless of priority', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
        ]),
        deckPriority: new Map([
          [1, 10], // higher priority
          [2, 20],
        ]),
        overrides: new Map([['Sol Ring|2', 'pin_original']]), // override for lower priority deck
      })

      const result = computeAllocations(input)

      // Deck 2 gets original (override), deck 1 gets proxy (no supply left)
      const deck2 = result.allocations.find((a) => a.deckId === 2)!
      expect(deck2.role).toBe('original')
      expect(deck2.priorityOverride).toBe(true)

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      expect(deck1.role).toBe('proxy')
    })

    it('pin_proxy forces proxy regardless of supply', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 2 }]],
        ]),
        deckPriority: new Map([
          [1, 10],
          [2, 20],
        ]),
        overrides: new Map([['Sol Ring|1', 'pin_proxy']]),
      })

      const result = computeAllocations(input)

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      expect(deck1.role).toBe('proxy')
      expect(deck1.priorityOverride).toBe(true)

      const deck2 = result.allocations.find((a) => a.deckId === 2)!
      expect(deck2.role).toBe('original')
    })

    it('pin_original with no supply still honours the override', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map(), // no supply at all
        overrides: new Map([['Sol Ring|1', 'pin_original']]),
      })

      const result = computeAllocations(input)

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      expect(deck1.role).toBe('original')
      expect(deck1.priorityOverride).toBe(true)
      expect(deck1.scryfallId).toBeNull() // no printing available
    })
  })

  describe('printing selection', () => {
    it('prefers matching scryfall_id from preferredPrintings', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1]]]),
        supplyMap: new Map([
          [
            'Sol Ring',
            [
              { scryfallId: 'sol-old', setCode: 'c14', collectorNumber: '100', quantity: 1 },
              { scryfallId: 'sol-new', setCode: 'cmm', collectorNumber: '379', quantity: 1 },
            ],
          ],
        ]),
        preferredPrintings: new Map([['Sol Ring|1', 'sol-old']]),
      })

      const result = computeAllocations(input)

      expect(result.allocations[0].scryfallId).toBe('sol-old')
    })

    it('prefers most recent (last in list) when no preferred match', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1]]]),
        supplyMap: new Map([
          [
            'Sol Ring',
            [
              { scryfallId: 'sol-old', setCode: 'c14', collectorNumber: '100', quantity: 1 },
              { scryfallId: 'sol-new', setCode: 'cmm', collectorNumber: '379', quantity: 1 },
            ],
          ],
        ]),
      })

      const result = computeAllocations(input)

      // Last in list = sol-new (most recently acquired)
      expect(result.allocations[0].scryfallId).toBe('sol-new')
    })

    it('prefers non-foil when positions are identical', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1]]]),
        supplyMap: new Map([
          [
            'Sol Ring',
            [
              { scryfallId: 'sol-foil', setCode: 'cmm', collectorNumber: '379', quantity: 1, isFoil: true },
              { scryfallId: 'sol-norm', setCode: 'cmm', collectorNumber: '379', quantity: 1, isFoil: false },
            ],
          ],
        ]),
      })

      const result = computeAllocations(input)

      // Most recent is sol-norm (last), but also non-foil — both rules agree
      expect(result.allocations[0].scryfallId).toBe('sol-norm')
    })

    it('assigns different printings to different decks', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map([
          [
            'Sol Ring',
            [
              { scryfallId: 'sol-a', setCode: 'c14', collectorNumber: '100', quantity: 1 },
              { scryfallId: 'sol-b', setCode: 'cmm', collectorNumber: '379', quantity: 1 },
            ],
          ],
        ]),
        deckPriority: new Map([
          [1, 10],
          [2, 20],
        ]),
      })

      const result = computeAllocations(input)

      const deck1 = result.allocations.find((a) => a.deckId === 1)!
      const deck2 = result.allocations.find((a) => a.deckId === 2)!

      expect(deck1.role).toBe('original')
      expect(deck2.role).toBe('original')
      // They should get different printings
      expect(deck1.scryfallId).not.toBe(deck2.scryfallId)
    })
  })

  describe('proxy report', () => {
    it('generates report for cards with deficit', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2, 3]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
        ]),
        deckPriority: new Map([
          [1, 10],
          [2, 20],
          [3, 30],
        ]),
      })

      const result = computeAllocations(input)

      expect(result.proxyReport).toHaveLength(1)
      expect(result.proxyReport[0]).toMatchObject({
        cardName: 'Sol Ring',
        totalDemand: 3,
        totalSupply: 1,
        deficit: 2,
        proxyDecks: [2, 3],
        originalDecks: [1],
      })
    })

    it('does not generate report when supply meets demand', () => {
      const input = makeInput({
        demandMap: new Map([['Sol Ring', [1, 2]]]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 2 }]],
        ]),
        deckPriority: new Map([
          [1, 10],
          [2, 20],
        ]),
      })

      const result = computeAllocations(input)

      expect(result.proxyReport).toHaveLength(0)
    })
  })

  describe('multiple cards processed together', () => {
    it('processes all cards independently', () => {
      const input = makeInput({
        demandMap: new Map([
          ['Sol Ring', [1, 2]],
          ['Cyclonic Rift', [1, 2]],
        ]),
        supplyMap: new Map([
          ['Sol Ring', [{ scryfallId: 'sol-1', setCode: 'cmm', collectorNumber: '379', quantity: 1 }]],
          ['Cyclonic Rift', [{ scryfallId: 'rift-1', setCode: 'mm3', collectorNumber: '35', quantity: 2 }]],
        ]),
        deckPriority: new Map([
          [1, 10],
          [2, 20],
        ]),
      })

      const result = computeAllocations(input)

      expect(result.allocations).toHaveLength(4)

      // Sol Ring: deck 1 original, deck 2 proxy
      const solDeck1 = result.allocations.find((a) => a.cardName === 'Sol Ring' && a.deckId === 1)!
      expect(solDeck1.role).toBe('original')

      const solDeck2 = result.allocations.find((a) => a.cardName === 'Sol Ring' && a.deckId === 2)!
      expect(solDeck2.role).toBe('proxy')

      // Cyclonic Rift: both get originals (2 copies)
      const riftDeck1 = result.allocations.find((a) => a.cardName === 'Cyclonic Rift' && a.deckId === 1)!
      expect(riftDeck1.role).toBe('original')

      const riftDeck2 = result.allocations.find((a) => a.cardName === 'Cyclonic Rift' && a.deckId === 2)!
      expect(riftDeck2.role).toBe('original')
    })
  })
})

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('computeAllocations — property-based tests', () => {
  // ---------------------------------------------------------------------------
  // Generators
  // ---------------------------------------------------------------------------

  /** Generate a valid card name (simple alphanumeric to avoid edge cases) */
  const cardNameArb = fc
    .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 12 })
    .map((chars) => chars.join(''))

  /** Generate a PrintingSupply entry */
  const printingArb: fc.Arbitrary<PrintingSupply> = fc.record({
    scryfallId: fc.uuid(),
    setCode: fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 3 }).map((c) => c.join('')),
    collectorNumber: fc.array(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 4 }).map((c) => c.join('')),
    quantity: fc.integer({ min: 1, max: 4 }),
    isFoil: fc.boolean(),
  })

  /** Generate a complete AllocationInput */
  const allocationInputArb = fc
    .record({
      numCards: fc.integer({ min: 1, max: 10 }),
      numDecks: fc.integer({ min: 2, max: 8 }),
    })
    .chain(({ numCards, numDecks }) => {
      // Generate deck IDs
      const deckIds = Array.from({ length: numDecks }, (_, i) => i + 1)

      return fc.record({
        cards: fc.array(cardNameArb, { minLength: numCards, maxLength: numCards }),
        deckAssignments: fc.array(
          fc.subarray(deckIds, { minLength: 1, maxLength: numDecks }),
          { minLength: numCards, maxLength: numCards }
        ),
        supplies: fc.array(
          fc.array(printingArb, { minLength: 0, maxLength: 3 }),
          { minLength: numCards, maxLength: numCards }
        ),
        priorities: fc.array(
          fc.integer({ min: 1, max: 100 }),
          { minLength: numDecks, maxLength: numDecks }
        ),
        // Generate override decisions for each card-deck pair deterministically
        overrideDecisions: fc.array(
          fc.array(
            fc.constantFrom('none', 'none', 'none', 'none', 'pin_original', 'pin_proxy') as fc.Arbitrary<'none' | 'pin_original' | 'pin_proxy'>,
            { minLength: numDecks, maxLength: numDecks }
          ),
          { minLength: numCards, maxLength: numCards }
        ),
      }).map(({ cards, deckAssignments, supplies, priorities, overrideDecisions }) => {
        // Ensure unique card names
        const uniqueCards = [...new Set(cards)].slice(0, numCards)

        const demandMap = new Map<string, number[]>()
        const supplyMap = new Map<string, PrintingSupply[]>()
        const deckPriority = new Map<number, number>()
        const overrides = new Map<string, 'pin_original' | 'pin_proxy'>()

        for (let i = 0; i < uniqueCards.length; i++) {
          const cardName = uniqueCards[i]
          const decks = deckAssignments[i % deckAssignments.length]
          demandMap.set(cardName, decks)
          supplyMap.set(cardName, supplies[i % supplies.length])

          // Apply override decisions deterministically
          const decisions = overrideDecisions[i % overrideDecisions.length]
          for (let j = 0; j < decks.length; j++) {
            const decision = decisions[j % decisions.length]
            if (decision !== 'none') {
              overrides.set(`${cardName}|${decks[j]}`, decision)
            }
          }
        }

        for (let i = 0; i < deckIds.length; i++) {
          deckPriority.set(deckIds[i], priorities[i])
        }

        return { demandMap, supplyMap, deckPriority, overrides } as AllocationInput
      })
    })

  // ---------------------------------------------------------------------------
  // Property 1: Determinism
  // **Validates: Requirements 2.2, 7.1**
  // ---------------------------------------------------------------------------

  it('Property 1 (Determinism): same input produces same output across multiple invocations', () => {
    fc.assert(
      fc.property(allocationInputArb, (input) => {
        const result1 = computeAllocations(input)
        const result2 = computeAllocations(input)

        // Allocations must be identical
        expect(result1.allocations).toEqual(result2.allocations)
        expect(result1.proxyReport).toEqual(result2.proxyReport)
      }),
      { numRuns: 200 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property 2: Supply Conservation
  // **Validates: Requirements 2.1, 7.5**
  // ---------------------------------------------------------------------------

  it('Property 2 (Supply Conservation): original allocations never exceed total supply per card (excluding overrides)', () => {
    fc.assert(
      fc.property(allocationInputArb, (input) => {
        const result = computeAllocations(input)

        for (const [cardName, supply] of input.supplyMap) {
          const totalSupply = supply.reduce((sum, p) => sum + p.quantity, 0)
          const originalCount = result.allocations.filter(
            (a) => a.cardName === cardName && a.role === 'original' && !a.priorityOverride
          ).length

          // Non-overridden originals must not exceed supply
          expect(originalCount).toBeLessThanOrEqual(totalSupply)
        }
      }),
      { numRuns: 200 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property 3: Demand Coverage
  // **Validates: Requirements 1.3, 1.4**
  // ---------------------------------------------------------------------------

  it('Property 3 (Demand Coverage): every deck slot has exactly one allocation record', () => {
    fc.assert(
      fc.property(allocationInputArb, (input) => {
        const result = computeAllocations(input)

        for (const [cardName, deckIds] of input.demandMap) {
          for (const deckId of deckIds) {
            const records = result.allocations.filter(
              (a) => a.cardName === cardName && a.deckId === deckId
            )
            // Exactly one record per card-deck pair
            expect(records).toHaveLength(1)
            // Must have a valid role
            expect(['original', 'proxy']).toContain(records[0].role)
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property: Priority Ordering Respected
  // **Validates: Requirements 7.2, 7.4**
  // ---------------------------------------------------------------------------

  it('Property (Priority Ordering): higher priority decks get originals before lower priority decks (non-overridden)', () => {
    fc.assert(
      fc.property(allocationInputArb, (input) => {
        const result = computeAllocations(input)

        for (const [cardName, deckIds] of input.demandMap) {
          if (deckIds.length < 2) continue

          // Get non-overridden allocations for this card
          const nonOverridden = result.allocations.filter(
            (a) => a.cardName === cardName && !a.priorityOverride
          )

          const originals = nonOverridden.filter((a) => a.role === 'original')
          const proxies = nonOverridden.filter((a) => a.role === 'proxy')

          // Every original deck should have equal or higher priority (lower number)
          // than every proxy deck
          for (const orig of originals) {
            const origPrio = input.deckPriority.get(orig.deckId) ?? Number.MAX_SAFE_INTEGER
            for (const proxy of proxies) {
              const proxyPrio = input.deckPriority.get(proxy.deckId) ?? Number.MAX_SAFE_INTEGER
              if (origPrio !== proxyPrio) {
                expect(origPrio).toBeLessThan(proxyPrio)
              } else {
                // Tie-break by deck ID ASC
                expect(orig.deckId).toBeLessThan(proxy.deckId)
              }
            }
          }
        }
      }),
      { numRuns: 200 }
    )
  })

  // ---------------------------------------------------------------------------
  // Property: Overrides Are Honoured
  // **Validates: Requirements 7.3**
  // ---------------------------------------------------------------------------

  it('Property (Overrides Honoured): pin_original results in original, pin_proxy results in proxy', () => {
    fc.assert(
      fc.property(allocationInputArb, (input) => {
        const result = computeAllocations(input)

        for (const [key, override] of input.overrides) {
          const [cardName, deckIdStr] = key.split('|')
          const deckId = parseInt(deckIdStr, 10)

          // Only check if this card-deck pair exists in the demand map
          const deckIds = input.demandMap.get(cardName)
          if (!deckIds || !deckIds.includes(deckId)) continue

          const record = result.allocations.find(
            (a) => a.cardName === cardName && a.deckId === deckId
          )
          if (!record) continue

          if (override === 'pin_original') {
            expect(record.role).toBe('original')
            expect(record.priorityOverride).toBe(true)
          } else if (override === 'pin_proxy') {
            expect(record.role).toBe('proxy')
            expect(record.priorityOverride).toBe(true)
          }
        }
      }),
      { numRuns: 200 }
    )
  })
})
