import { describe, expect, it } from 'vitest'
import { buildOveruse, type OveruseDeck, type OveruseSlot } from './reconcile-overuse'

const decks: OveruseDeck[] = [
  { deckId: 1, deckName: 'Blight Curse Clone', isActive: true },
  { deckId: 2, deckName: 'Blight Curse Original', isActive: true },
  { deckId: 3, deckName: 'Keen Engineering', isActive: false },
]

function slot(overrides: Partial<OveruseSlot>): OveruseSlot {
  return {
    cardName: 'Arcane Signet',
    deckId: 1,
    scryfallId: 'id-1',
    copyId: null,
    ownershipStatus: null,
    quantity: 1,
    categories: null,
    ...overrides,
  }
}

describe('buildOveruse', () => {
  it('lists a card wanted by more decks than the originals owned, with the competing decks', () => {
    const result = buildOveruse(
      [slot({ deckId: 1, copyId: 10 }), slot({ deckId: 2 })],
      decks,
      new Map([['Arcane Signet', 1]])
    )

    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]).toMatchObject({ cardName: 'Arcane Signet', originalsOwned: 1, slotsWanting: 2, overBy: 1 })
    expect(result.cards[0].decks.map((d) => [d.deckName, d.sleeved])).toEqual([
      ['Blight Curse Clone', 1],
      ['Blight Curse Original', 0],
    ])
  })

  it('does not count slots filled by a proxy', () => {
    const result = buildOveruse(
      [slot({ deckId: 1 }), slot({ deckId: 2, ownershipStatus: 'proxy' })],
      decks,
      new Map([['Arcane Signet', 1]])
    )
    expect(result.cards).toEqual([])
  })

  it('does not count proxy copies as originals owned', () => {
    // Originals owned is supplied already excluding proxies; one original, two original-wanting slots.
    const result = buildOveruse([slot({ deckId: 1 }), slot({ deckId: 3 })], decks, new Map([['Arcane Signet', 1]]))
    expect(result.cards[0].overBy).toBe(1)
  })

  it('includes decks that are not Active', () => {
    const result = buildOveruse([slot({ deckId: 1 }), slot({ deckId: 3 })], decks, new Map([['Arcane Signet', 1]]))
    expect(result.cards[0].decks.map((d) => d.isActive)).toEqual([true, false])
  })

  it('leaves out maybeboard cards, basic lands (even with a printing) and cards with no original owned', () => {
    const result = buildOveruse(
      [
        slot({ deckId: 1, categories: '["Maybeboard"]' }),
        slot({ deckId: 2, categories: '["Maybeboard"]' }),
        slot({ cardName: 'Forest', scryfallId: null, deckId: 1 }),
        slot({ cardName: 'Forest', scryfallId: null, deckId: 2 }),
        slot({ cardName: 'Mountain', scryfallId: 'has-a-printing', deckId: 1 }),
        slot({ cardName: 'Mountain', scryfallId: 'has-a-printing', deckId: 2 }),
        slot({ cardName: 'Unowned Card', deckId: 1 }),
        slot({ cardName: 'Unowned Card', deckId: 2 }),
      ],
      decks,
      new Map([['Arcane Signet', 1], ['Forest', 1], ['Mountain', 1]])
    )
    expect(result.cards).toEqual([])
  })

  it('does not list a card when originals cover every slot', () => {
    const result = buildOveruse([slot({ deckId: 1 }), slot({ deckId: 2 })], decks, new Map([['Arcane Signet', 2]]))
    expect(result.cards).toEqual([])
  })

  it('counts quantity and sorts the most overused first', () => {
    const result = buildOveruse(
      [
        slot({ cardName: 'Sol Ring', deckId: 1, quantity: 1 }),
        slot({ cardName: 'Sol Ring', deckId: 2, quantity: 1 }),
        slot({ cardName: 'Rhystic Study', deckId: 1, quantity: 3 }),
      ],
      decks,
      new Map([['Sol Ring', 1], ['Rhystic Study', 1]])
    )
    expect(result.cards.map((c) => [c.cardName, c.overBy])).toEqual([
      ['Rhystic Study', 2],
      ['Sol Ring', 1],
    ])
  })
})
