import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the allocation module (which uses Supabase internally)
vi.mock('@/lib/allocation', () => ({
  commitAllocation: vi.fn(),
}))

import { POST } from './route'
import { commitAllocation } from '@/lib/allocation'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/proxy-allocate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/proxy-allocate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- Validation ---

  it('returns 400 if cardName is missing', async () => {
    const res = await POST(
      makeRequest({ allocations: [{ deckId: 1, role: 'proxy' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('cardName')
  })

  it('returns 400 if allocations is missing', async () => {
    const res = await POST(makeRequest({ cardName: 'Sol Ring' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('allocations')
  })

  it('returns 400 if allocations is empty', async () => {
    const res = await POST(makeRequest({ cardName: 'Sol Ring', allocations: [] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 400 if deckId is missing in an allocation', async () => {
    const res = await POST(
      makeRequest({ cardName: 'Sol Ring', allocations: [{ role: 'proxy' }] })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('deckId')
  })

  it('returns 400 for invalid role', async () => {
    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [{ deckId: 1, role: 'unknown' }],
      })
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('unknown')
  })

  // --- Successful allocation ---

  it('delegates to commitAllocation and returns success', async () => {
    vi.mocked(commitAllocation).mockResolvedValue({
      success: true,
      results: [{ deckId: 100, success: true }],
      warnings: [],
    })

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [{ deckId: 100, role: 'proxy' }],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toEqual({ deckId: 100, success: true })

    expect(commitAllocation).toHaveBeenCalledWith({
      cardName: 'Sol Ring',
      allocations: [{ deckId: 100, role: 'proxy' }],
    })
  })

  it('passes original role to commitAllocation', async () => {
    vi.mocked(commitAllocation).mockResolvedValue({
      success: true,
      results: [{ deckId: 200, success: true }],
      warnings: [],
    })

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [{ deckId: 200, role: 'original' }],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)

    expect(commitAllocation).toHaveBeenCalledWith({
      cardName: 'Sol Ring',
      allocations: [{ deckId: 200, role: 'original' }],
    })
  })

  // --- Multiple decks ---

  it('processes multiple allocations in a single call', async () => {
    vi.mocked(commitAllocation).mockResolvedValue({
      success: true,
      results: [
        { deckId: 1, success: true },
        { deckId: 2, success: true },
        { deckId: 3, success: true },
      ],
      warnings: [],
    })

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [
          { deckId: 1, role: 'original' },
          { deckId: 2, role: 'proxy' },
          { deckId: 3, role: 'proxy' },
        ],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(3)

    expect(commitAllocation).toHaveBeenCalledWith({
      cardName: 'Sol Ring',
      allocations: [
        { deckId: 1, role: 'original' },
        { deckId: 2, role: 'proxy' },
        { deckId: 3, role: 'proxy' },
      ],
    })
  })

  // --- Partial failure ---

  it('returns 207 when commitAllocation reports partial failure', async () => {
    vi.mocked(commitAllocation).mockResolvedValue({
      success: false,
      results: [
        { deckId: 1, success: true },
        { deckId: 2, success: false, error: 'Upsert failed' },
        { deckId: 3, success: true },
      ],
      warnings: [],
    })

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [
          { deckId: 1, role: 'proxy' },
          { deckId: 2, role: 'proxy' },
          { deckId: 3, role: 'proxy' },
        ],
      })
    )

    expect(res.status).toBe(207)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('1 of 3')
    expect(body.results[0]).toEqual({ deckId: 1, success: true })
    expect(body.results[1]).toEqual({ deckId: 2, success: false, error: 'Upsert failed' })
    expect(body.results[2]).toEqual({ deckId: 3, success: true })
  })

  // --- Exception handling ---

  it('returns 500 when commitAllocation throws', async () => {
    vi.mocked(commitAllocation).mockRejectedValue(new Error('Connection refused'))

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [{ deckId: 1, role: 'proxy' }],
      })
    )

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Connection refused')
  })

  it('returns 500 on unexpected top-level error (invalid JSON)', async () => {
    const req = new NextRequest('http://localhost:3000/api/proxy-allocate', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Unexpected error')
  })

  // --- Warning logging (multiple originals) ---

  it('still succeeds when multiple originals are submitted (logs warning)', async () => {
    vi.mocked(commitAllocation).mockResolvedValue({
      success: true,
      results: [
        { deckId: 1, success: true },
        { deckId: 2, success: true },
      ],
      warnings: [],
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await POST(
      makeRequest({
        cardName: 'Sol Ring',
        allocations: [
          { deckId: 1, role: 'original' },
          { deckId: 2, role: 'original' },
        ],
      })
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('2 decks marked as original')
    )

    warnSpy.mockRestore()
  })
})
