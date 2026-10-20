import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  statusMap: new Map<string, 'available' | 'alternate' | 'claimed' | 'unowned' | 'failed'>(),
}))

vi.mock('@/lib/auth', () => ({
  requireAuth: () => Promise.resolve({ id: 'test-user-id', email: 'test@example.com' }),
}))

vi.mock('@/lib/card-status', () => ({
  computeUnresolvedStatuses: vi.fn(async () => h.statusMap),
}))

vi.mock('@/lib/allocation-candidates', () => ({
  fetchEnrichedSupply: vi.fn(async () => []),
}))

import { GET } from './route'
import { computeUnresolvedStatuses } from '@/lib/card-status'

function callGet(cardNames: string[]) {
  const url = new URL('http://localhost/api/cards/builder-status')
  url.searchParams.set('cardNames', cardNames.join(','))
  return GET(new NextRequest(url))
}

describe('GET /api/cards/builder-status', () => {
  beforeEach(() => {
    h.statusMap = new Map()
    vi.clearAllMocks()
  })

  it('validates the cardNames parameter', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cards/builder-status'))
    expect(response.status).toBe(400)
  })

  it('returns statuses from the batch lookup', async () => {
    h.statusMap.set('Sol Ring', 'available')
    h.statusMap.set('Rhystic Study', 'claimed')

    const response = await callGet(['Sol Ring', 'Rhystic Study'])
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.results).toEqual([
      { cardName: 'Sol Ring', status: 'available', heldBy: null },
      { cardName: 'Rhystic Study', status: 'claimed', heldBy: null },
    ])
  })

  it('returns "failed" when the batch lookup fails, never "unowned"', async () => {
    h.statusMap.set('Sol Ring', 'failed')
    h.statusMap.set('Rhystic Study', 'failed')

    const response = await callGet(['Sol Ring', 'Rhystic Study'])
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.results).toEqual([
      { cardName: 'Sol Ring', status: 'failed', heldBy: null },
      { cardName: 'Rhystic Study', status: 'failed', heldBy: null },
    ])
  })

  it('falls back to "failed" for a missing entry instead of guessing', async () => {
    // Lookup returns an empty map (unexpected), so every card should report failure.
    h.statusMap = new Map()

    const response = await callGet(['Mystic Remora'])
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.results).toEqual([
      { cardName: 'Mystic Remora', status: 'failed', heldBy: null },
    ])
  })

  it('caps the request at 20 card names', async () => {
    const names = Array.from({ length: 21 }, (_, i) => `Card ${i + 1}`)
    const response = await callGet(names)
    expect(response.status).toBe(400)
  })
})
