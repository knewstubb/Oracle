// ---------------------------------------------------------------------------
// Deck Cards Diff — Maybeboard relation (D-005/D-018)
//
// A card that appears both in the main deck and on the maybeboard must remain
// two slots in the same deck. The diff identity key therefore includes the
// relation derived from `categories`.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest'
import {
  diffDeckCards,
  type ExistingDeckCardRow,
  type IncomingCard,
} from '@/lib/deck-cards-diff'

function existingRow(overrides: Partial<ExistingDeckCardRow> = {}): ExistingDeckCardRow {
  return {
    id: 1,
    deck_id: 10,
    card_name: 'Gilded Goose',
    scryfall_id: 'scry-goose',
    set_code: 'eld',
    quantity: 1,
    categories: '["Creature"]',
    is_commander: false,
    user_id: 'user-1',
    copy_id: null,
    ownership_status: null,
    proxy_of_deck_id: null,
    dead_weight_flag: null,
    dead_weight_reason: null,
    ...overrides,
  }
}

function incomingCard(overrides: Partial<IncomingCard> = {}): IncomingCard {
  return {
    card_name: 'Gilded Goose',
    scryfall_id: 'scry-goose',
    set_code: 'eld',
    quantity: 1,
    categories: '["Creature"]',
    is_commander: false,
    ...overrides,
  }
}

describe('diffDeckCards — maybeboard relation', () => {
  it('does not collapse a card that exists both in the deck and on the maybeboard', () => {
    const existing = [existingRow({ id: 7, categories: '["Maybeboard"]' })]
    const incoming = [
      incomingCard({ categories: '["Creature"]' }),
      incomingCard({ categories: '["Maybeboard"]' }),
    ]

    const diff = diffDeckCards(existing, incoming)

    // The existing maybeboard slot is preserved, the main-deck slot is added.
    expect(diff.toKeep).toEqual([7])
    expect(diff.toDelete).toEqual([])
    expect(diff.toInsert).toHaveLength(1)
    expect(diff.toInsert[0].categories).toBe('["Creature"]')
  })

  it('treats a maybeboard card as removed when only the main-deck slot remains', () => {
    const existing = [
      existingRow({ id: 1, categories: '["Creature"]' }),
      existingRow({ id: 2, categories: '["Maybeboard"]' }),
    ]
    const incoming = [incomingCard({ categories: '["Creature"]' })]

    const diff = diffDeckCards(existing, incoming)

    expect(diff.toKeep).toEqual([1])
    expect(diff.toDelete).toEqual([2])
    expect(diff.toInsert).toEqual([])
  })
})
