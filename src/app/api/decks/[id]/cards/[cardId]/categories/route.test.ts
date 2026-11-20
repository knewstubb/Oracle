import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// HC-02: a card can hold up to five categories, names up to 60 characters, stored whole.
let updated: Record<string, unknown> | null = null
vi.mock('@/lib/supabase', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (v: Record<string, unknown>) => {
        updated = v
        const chain = { eq: () => chain, select: () => chain, single: () => Promise.resolve({ data: { id: 1, ...v }, error: null }) }
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/auth', () => ({ requireAuth: () => Promise.resolve({ id: 'user-1' }) }))

import { PUT } from './route'

const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/decks/5/cards/1/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: '5', cardId: '1' }) },
  )

describe('PUT /api/decks/[id]/cards/[cardId]/categories', () => {
  beforeEach(() => {
    updated = null
  })

  it('stores five categories in order, with a 60-character name whole', async () => {
    const sixty = 'B'.repeat(60)
    const res = await put({ primary_category: 'Game Plan & Win Conditions', additional_categories: ['Ramp', sixty, 'Payoffs', 'Protection'] })
    expect(res.status).toBe(200)
    expect(JSON.parse(String(updated?.categories))).toEqual(['Game Plan & Win Conditions', 'Ramp', sixty, 'Payoffs', 'Protection'])
  })

  it('refuses a sixth category and changes nothing', async () => {
    const res = await put({ primary_category: 'A', additional_categories: ['B', 'C', 'D', 'E', 'F'] })
    expect(res.status).toBe(400)
    expect(updated).toBeNull()
  })

  it('refuses a name over 60 characters instead of cutting it', async () => {
    const res = await put({ primary_category: 'A'.repeat(61), additional_categories: [] })
    expect(res.status).toBe(400)
    expect(updated).toBeNull()
  })
})
