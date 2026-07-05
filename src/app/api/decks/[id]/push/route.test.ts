import { describe, it, expect } from 'vitest'
import { POST } from './route'
import { NextRequest } from 'next/server'

function makeRequest(id: string): [NextRequest, { params: Promise<{ id: string }> }] {
  const req = new NextRequest(`http://localhost:3000/api/decks/${id}/push`, {
    method: 'POST',
  })
  return [req, { params: Promise.resolve({ id }) }]
}

describe('POST /api/decks/[id]/push', () => {
  it('returns 400 for invalid deck ID', async () => {
    const [req, ctx] = makeRequest('abc')
    const res = await POST(req, ctx)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Invalid deck ID')
  })

  it('returns 501 indicating Playwright automation is dormant', async () => {
    const [req, ctx] = makeRequest('123')
    const res = await POST(req, ctx)
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Playwright automation is dormant')
    expect(body.deckId).toBe(123)
  })

  it('returns the deck ID in the response', async () => {
    const [req, ctx] = makeRequest('999')
    const res = await POST(req, ctx)
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.deckId).toBe(999)
  })
})
