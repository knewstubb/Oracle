import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importDeckBuilt } from '@/lib/deck-import'
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

vi.mock('@/lib/deck-versions', () => ({
  createVersionSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const TEST_USER_ID = 'user-abc-123'

function makeCard(overrides: Partial<NormalizedCard> = {}): NormalizedCard {
  return {
    cardName: 'Sol Ring',
    scryfallId: 'scry-sol-ring',
    oracleId: 'oracle-sol-ring',
    setCode: 'c21',
    quantity: 1,
    typeLine: 'Artifact',
    isCommander: false,
    isProxy: false,
    manaCost: '{1}',
    colorIdentity: [],
    sourceCategories: [],
    ...overrides,
  }
}

function makeDeck(cards: NormalizedCard[], maybeboard: NormalizedCard[] = []): NormalizedDeck {
  return {
    name: 'Built Test Deck',
    platform: 'archidekt',
    platformDeckId: '99999',
    sourceUrl: 'https://archidekt.com/decks/99999',
    commander: null,
    cards,
    maybeboard,
    cardCount: cards.reduce((sum, card) => sum + card.quantity, 0),
    colourIdentity: '',
  }
}

function makeQuery(response: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    upsert: vi.fn(() => query),
    select: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'decks') return makeQuery({ data: [{ id: 99999, name: 'Built Test Deck' }], error: null })
    throw new Error(`Unexpected table: ${table}`)
  })
  mockRpc.mockResolvedValue({
    data: {
      success: true,
      assigned_count: 1,
      shortfall_count: 1,
      released_count: 1,
      inserted_count: 2,
      deleted_count: 1,
      conflicts: [{
        cardName: 'Birds of Paradise',
        scryfallId: 'scry-birds',
        requested: 2,
        assigned: 1,
        unresolved: 1,
        reason: 'claimed',
        claimedDecks: [{ deckId: 42, deckName: 'Other Deck' }],
      }],
    },
    error: null,
  })
})

describe('Built deck import reconciliation', () => {
  it('uses the atomic reconciliation RPC and returns structured conflicts', async () => {
    const result = await importDeckBuilt(
      makeDeck([
        makeCard(),
        makeCard({
          cardName: 'Birds of Paradise',
          scryfallId: 'scry-birds',
          oracleId: 'oracle-birds',
          quantity: 2,
          typeLine: 'Creature — Plant',
        }),
      ]),
      TEST_USER_ID,
    )

    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('reconcile_built_deck', expect.objectContaining({
      p_deck_id: 99999,
      p_user_id: TEST_USER_ID,
      p_rows: expect.arrayContaining([
        expect.objectContaining({ card_name: 'Birds of Paradise', quantity: 2 }),
      ]),
    }))
    expect(result.allocationSummary.assigned).toBe(1)
    expect(result.allocationSummary.shortfall).toBe(1)
    expect(result.allocationSummary.conflicts).toEqual([
      expect.objectContaining({
        cardName: 'Birds of Paradise',
        reason: 'claimed',
        unresolved: 1,
      }),
    ])
    expect(result.allocationSummary.errors[0]).toContain('Other Deck')
  })

  it('passes maybeboard cards as maybeboard rows and leaves main-deck rows unchanged', async () => {
    const mainCard = makeCard()
    const maybeCard = makeCard({
      cardName: 'Gilded Goose',
      scryfallId: 'scry-goose',
      oracleId: 'oracle-goose',
      typeLine: 'Creature — Bird',
      sourceCategories: ['Maybeboard'],
    })

    await importDeckBuilt(makeDeck([mainCard], [maybeCard]), TEST_USER_ID)

    expect(mockRpc).toHaveBeenCalledTimes(1)
    const payload = mockRpc.mock.calls[0][1].p_rows as Array<Record<string, unknown>>

    const mainRow = payload.find((row) => row.card_name === 'Sol Ring')!
    expect(mainRow.is_maybeboard).toBe(false)
    expect(mainRow.is_commander).toBe(false)

    const maybeRow = payload.find((row) => row.card_name === 'Gilded Goose')!
    expect(maybeRow.is_maybeboard).toBe(true)
    expect(maybeRow.categories).toBe('["Maybeboard"]')
    expect(maybeRow.is_generic_land).toBe(false)
  })
})
