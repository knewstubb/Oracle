import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the playwright module before importing the route
vi.mock('@/lib/archidekt-playwright', () => ({
  updateProxyTags: vi.fn(),
}))

import { POST } from './route'
import { updateProxyTags } from '@/lib/archidekt-playwright'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/archidekt/write-tags', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/archidekt/write-tags', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 if deckId is missing', async () => {
    const res = await POST(makeRequest({ changes: [{ cardName: 'Sol Ring', action: 'add' }] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('deckId')
  })

  it('returns 400 if changes array is empty', async () => {
    const res = await POST(makeRequest({ deckId: 123, changes: [] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 400 if changes array is missing', async () => {
    const res = await POST(makeRequest({ deckId: 123 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid action', async () => {
    const res = await POST(
      makeRequest({ deckId: 123, changes: [{ cardName: 'Sol Ring', action: 'toggle' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('toggle')
  })

  it('returns 400 if cardName is missing', async () => {
    const res = await POST(
      makeRequest({ deckId: 123, changes: [{ action: 'add' }] })
    )
    expect(res.status).toBe(400)
  })

  it('calls updateProxyTags and returns success', async () => {
    vi.mocked(updateProxyTags).mockResolvedValue({ success: true, changesApplied: 2 })

    const res = await POST(
      makeRequest({
        deckId: 123,
        changes: [
          { cardName: 'Sol Ring', action: 'add' },
          { cardName: 'Blood Crypt', action: 'remove' },
        ],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.changesApplied).toBe(2)
    expect(updateProxyTags).toHaveBeenCalledWith(123, [
      { cardName: 'Sol Ring', action: 'add' },
      { cardName: 'Blood Crypt', action: 'remove' },
    ])
  })

  it('returns 502 when updateProxyTags fails', async () => {
    vi.mocked(updateProxyTags).mockResolvedValue({
      success: false,
      error: 'Archidekt session expired',
    })

    const res = await POST(
      makeRequest({
        deckId: 123,
        changes: [{ cardName: 'Sol Ring', action: 'add' }],
      })
    )

    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('session expired')
  })

  it('returns 500 on unexpected errors', async () => {
    vi.mocked(updateProxyTags).mockRejectedValue(new Error('Unexpected crash'))

    const res = await POST(
      makeRequest({
        deckId: 123,
        changes: [{ cardName: 'Sol Ring', action: 'add' }],
      })
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Unexpected')
  })
})
