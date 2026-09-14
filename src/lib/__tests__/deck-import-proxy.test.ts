import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importDeckTheorycrafted, importDeckNewCards } from '@/lib/deck-import'
import type { NormalizedCard, NormalizedDeck } from '@/lib/deck-normalizer'

const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockResolveCardDefinitions = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

vi.mock('@/lib/card-definition-resolver', () => ({
  resolveCardDefinitions: (...args: unknown[]) => mockResolveCardDefinitions(...args),
}))

vi.mock('@/lib/deck-versions', () => ({
  createVersionSnapshot: vi.fn().mockResolvedValue(undefined),
}))

const TEST_USER_ID = 'user-abc-123'

function makeCard(overrides: Partial<NormalizedCard> = {}): NormalizedCard {
  return {
    cardName: 'Rhystic Study',
    scryfallId: 'scry-rhystic-001',
    oracleId: 'oracle-rhystic-001',
    setCode: 'pcy',
    quantity: 1,
    typeLine: 'Enchantment',
    isCommander: false,
    isProxy: true,
    manaCost: '{2}{U}',
    colorIdentity: ['U'],
    sourceCategories: [],
    ...overrides,
  }
}

function makeDeck(cards: NormalizedCard[]): NormalizedDeck {
  return {
    name: 'Test Deck',
    platform: 'archidekt',
    platformDeckId: '99999',
    sourceUrl: 'https://archidekt.com/decks/99999',
    commander: null,
    cards,
    cardCount: cards.reduce((sum, card) => sum + card.quantity, 0),
    colourIdentity: 'U',
  }
}

function makeQuery(response: { data: unknown; error: unknown }) {
  const query: any = {
    select: vi.fn(() => query),
    upsert: vi.fn(() => query),
    eq: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  }
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'decks') return makeQuery({ data: [{ id: 99999, name: 'Test Deck' }], error: null })
    if (table === 'deck_cards') return makeQuery({ data: [], error: null })
    throw new Error(`Unexpected table: ${table}`)
  })
  mockResolveCardDefinitions.mockImplementation(async (cards: NormalizedCard[]) =>
    new Map(cards.map((card, index) => [card.oracleId, index + 1]))
  )
  mockRpc.mockImplementation(async (name: string, args: Record<string, any>) => {
    if (name === 'replace_deck_with_new_cards') {
      return {
        data: {
          success: true,
          inserted_count: args.p_rows.length,
          removed_count: 0,
        },
        error: null,
      }
    }
    if (name === 'apply_deck_cards_diff') {
      return {
        data: {
          success: true,
          deleted_count: args.p_delete_ids.length,
          inserted_count: args.p_insert_rows.length,
        },
        error: null,
      }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
})

describe('current deck import proxy contract', () => {
  it('preserves proxy identity in the atomic new-cards payload', async () => {
    const proxy = makeCard()
    const original = makeCard({
      cardName: 'Sol Ring',
      oracleId: 'oracle-sol-ring',
      scryfallId: 'scry-sol-ring',
      isProxy: false,
      typeLine: 'Artifact',
      manaCost: '{1}',
      colorIdentity: [],
    })

    await importDeckNewCards(makeDeck([proxy, original]), TEST_USER_ID)

    const replaceCall = mockRpc.mock.calls.find(([name]) => name === 'replace_deck_with_new_cards')
    if (!replaceCall) throw new Error('replace_deck_with_new_cards was not called')
    const rows = replaceCall[1].p_rows
    expect(rows).toHaveLength(2)
    expect(rows.map((row: Record<string, unknown>) => row.is_proxy)).toEqual([true, false])
  })

  it('creates one atomic row per requested proxy quantity', async () => {
    await importDeckNewCards(makeDeck([makeCard({ quantity: 3 })]), TEST_USER_ID)

    const replaceCall = mockRpc.mock.calls.find(([name]) => name === 'replace_deck_with_new_cards')
    if (!replaceCall) throw new Error('replace_deck_with_new_cards was not called')
    expect(replaceCall[1].p_rows).toHaveLength(3)
    expect(replaceCall[1].p_rows.every((row: Record<string, unknown>) => row.is_proxy === true)).toBe(true)
  })

  it('keeps theorycrafted mode on the atomic deck diff path without collection writes', async () => {
    await importDeckTheorycrafted(makeDeck([makeCard({ isProxy: true })]), TEST_USER_ID)

    expect(mockRpc).toHaveBeenCalledWith(
      'apply_deck_cards_diff',
      expect.objectContaining({
        p_insert_rows: [expect.objectContaining({ card_name: 'Rhystic Study' })],
      })
    )
    expect(mockRpc).not.toHaveBeenCalledWith('replace_deck_with_new_cards', expect.anything())
  })
})
