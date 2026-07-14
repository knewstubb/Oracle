import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchMoxfieldDeck, type MoxfieldDeckFull } from './moxfield-client'

const MOCK_DECK: MoxfieldDeckFull = {
  id: 'abc123',
  name: 'Test Commander Deck',
  format: 'commander',
  publicId: 'abc123',
  mainboard: {
    count: 98,
    cards: {
      'sol-ring': {
        card: {
          name: 'Sol Ring',
          scryfall_id: 'e7aa4a5a-04d9-4f1d-8b1e-1e5e8e5e5e5e',
          set: 'c21',
          type_line: 'Artifact',
          oracle_id: 'oracle-sol-ring',
          cmc: 1,
          color_identity: [],
          mana_cost: '{1}',
        },
        quantity: 1,
      },
    },
  },
  sideboard: { count: 0, cards: {} },
  maybeboard: { count: 0, cards: {} },
  commanders: {
    count: 1,
    cards: {
      'atraxa': {
        card: {
          name: 'Atraxa, Praetors\' Voice',
          scryfall_id: 'f1f1f1f1-aaaa-bbbb-cccc-dddddddddddd',
          set: 'cm2',
          type_line: 'Legendary Creature — Phyrexian Angel Horror',
          oracle_id: 'oracle-atraxa',
          cmc: 4,
          color_identity: ['W', 'U', 'B', 'G'],
          mana_cost: '{G}{W}{U}{B}',
        },
        quantity: 1,
      },
    },
  },
  companions: { count: 0, cards: {} },
}

describe('fetchMoxfieldDeck', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns typed deck data on successful response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_DECK),
    })

    const result = await fetchMoxfieldDeck('abc123')

    expect(result).toEqual(MOCK_DECK)
    expect(result.name).toBe('Test Commander Deck')
    expect(result.commanders.count).toBe(1)
    expect(result.mainboard.cards['sol-ring'].card.name).toBe('Sol Ring')
  })

  it('calls the correct Moxfield API URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_DECK),
    })

    await fetchMoxfieldDeck('xyz789')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api2.moxfield.com/v2/decks/all/xyz789',
      expect.objectContaining({
        headers: { 'User-Agent': 'The-Oracle/1.0' },
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('throws "Deck not found on Moxfield" on 404', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    })

    await expect(fetchMoxfieldDeck('nonexistent')).rejects.toThrow(
      'Deck not found on Moxfield'
    )
  })

  it('throws descriptive error on non-200/non-404 responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    await expect(fetchMoxfieldDeck('abc123')).rejects.toThrow(
      'Failed to fetch deck from Moxfield (HTTP 500)'
    )
  })

  it('throws timeout error when request exceeds 10s', async () => {
    const timeoutError = new DOMException('The operation was aborted.', 'TimeoutError')
    global.fetch = vi.fn().mockRejectedValue(timeoutError)

    await expect(fetchMoxfieldDeck('abc123')).rejects.toThrow(
      'Request to Moxfield timed out'
    )
  })

  it('throws abort error when request is aborted', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    global.fetch = vi.fn().mockRejectedValue(abortError)

    await expect(fetchMoxfieldDeck('abc123')).rejects.toThrow(
      'Request to Moxfield was aborted'
    )
  })

  it('throws connection error on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

    await expect(fetchMoxfieldDeck('abc123')).rejects.toThrow(
      'Failed to connect to Moxfield: fetch failed'
    )
  })
})
