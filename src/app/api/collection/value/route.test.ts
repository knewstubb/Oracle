import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

const db = vi.hoisted(() => ({
  copies: [] as Array<{
    id: number
    printing_id: string | null
    is_proxy: boolean
    user_cards: { card_name: string }
  }>,
  printings: [] as Array<{ scryfall_id: string; price_usd: number | null }>,
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'user-1' }),
}))

vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'user_copies') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          range: () => Promise.resolve({ data: db.copies, error: null }),
        }
        return chain
      }
      if (table === 'ref_printings') {
        const chain = {
          select: () => chain,
          in: () => chain,
          not: () => Promise.resolve({ data: db.printings, error: null }),
        }
        return chain
      }
      throw new Error(`Unexpected table in test: ${table}`)
    },
  }),
}))

import { GET } from './route'

function callGET() {
  return GET(new NextRequest('http://localhost/api/collection/value'))
}

beforeEach(() => {
  db.copies = []
  db.printings = []
})

describe('GET /api/collection/value', () => {
  it('counts unknown prices as 0 in the total but reports them separately', async () => {
    db.copies = [
      { id: 1, printing_id: 'pa', is_proxy: false, user_cards: { card_name: 'Sol Ring' } },
      { id: 2, printing_id: 'pb', is_proxy: false, user_cards: { card_name: 'Mana Crypt' } },
    ]
    db.printings = [{ scryfall_id: 'pa', price_usd: 5 }]

    const body = await (await callGET()).json()

    expect(body.totalMarketValue).toBe(5)
    expect(body.cardCount).toBe(2)
    expect(body.unpricedCardCount).toBe(1)
  })

  it('shows an unknown-priced card as null (em dash), not $0.00', async () => {
    db.copies = [
      { id: 1, printing_id: 'pb', is_proxy: false, user_cards: { card_name: 'Mana Crypt' } },
    ]
    db.printings = []

    const body = await (await callGET()).json()

    expect(body.unpricedCardCount).toBe(1)
    expect(body.topCards[0]).toMatchObject({ cardName: 'Mana Crypt', pricePerCopy: null, totalValue: null })
  })

  it('sorts known prices before unknown prices', async () => {
    db.copies = [
      { id: 1, printing_id: 'pb', is_proxy: false, user_cards: { card_name: 'Unknown Card' } },
      { id: 2, printing_id: 'pa', is_proxy: false, user_cards: { card_name: 'Known Card' } },
    ]
    db.printings = [{ scryfall_id: 'pa', price_usd: 12 }]

    const body = await (await callGET()).json()

    expect(body.topCards[0].cardName).toBe('Known Card')
    expect(body.topCards[0].totalValue).toBe(12)
  })

  it('skips proxies for both the total and the count', async () => {
    db.copies = [
      { id: 1, printing_id: 'pa', is_proxy: false, user_cards: { card_name: 'Sol Ring' } },
      { id: 2, printing_id: 'pb', is_proxy: true, user_cards: { card_name: 'Mana Crypt' } },
    ]
    db.printings = [{ scryfall_id: 'pa', price_usd: 5 }]

    const body = await (await callGET()).json()

    expect(body.totalMarketValue).toBe(5)
    expect(body.cardCount).toBe(1)
    expect(body.unpricedCardCount).toBe(0)
  })

  it('treats a stored 0 as unknown, never as a real $0.00 value', async () => {
    db.copies = [
      { id: 1, printing_id: 'pa', is_proxy: false, user_cards: { card_name: 'Sol Ring' } },
    ]
    db.printings = [{ scryfall_id: 'pa', price_usd: 0 }]

    const body = await (await callGET()).json()

    expect(body.totalMarketValue).toBe(0)
    expect(body.unpricedCardCount).toBe(1)
    expect(body.topCards[0].totalValue).toBeNull()
  })

  it('reports all-known prices with no unpriced cards', async () => {
    db.copies = [
      { id: 1, printing_id: 'pa', is_proxy: false, user_cards: { card_name: 'Sol Ring' } },
    ]
    db.printings = [{ scryfall_id: 'pa', price_usd: 0.5 }]

    const body = await (await callGET()).json()

    expect(body.totalMarketValue).toBe(0.5)
    expect(body.unpricedCardCount).toBe(0)
    expect(body.topCards[0]).toMatchObject({ pricePerCopy: 0.5, totalValue: 0.5 })
  })
})
