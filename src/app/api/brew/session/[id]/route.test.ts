import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetBrewSession = vi.fn()
const mockUpdateBrewSession = vi.fn()

vi.mock('@/lib/brew-v2-session', () => ({
  getBrewSession: (...args: unknown[]) => mockGetBrewSession(...args),
  updateBrewSession: (...args: unknown[]) => mockUpdateBrewSession(...args),
}))

import { PATCH } from './route'

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('/api/brew/session/1', 'http://localhost:3000'), {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/brew/session/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateBrewSession.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Validation — path param
  // -------------------------------------------------------------------------

  it('returns 400 for non-numeric id', async () => {
    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('positive integer')
  })

  it('returns 400 for zero id', async () => {
    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('0'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for negative id', async () => {
    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('-5'))
    expect(res.status).toBe(400)
  })

  // -------------------------------------------------------------------------
  // Validation — request body
  // -------------------------------------------------------------------------

  it('returns 400 for empty body (no fields to update)', async () => {
    const req = makePatchRequest({})
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('No valid fields')
  })

  it('returns 400 for body with only unknown fields', async () => {
    const req = makePatchRequest({ unknown_field: 'value', foo: 'bar' })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new NextRequest(new URL('/api/brew/session/1', 'http://localhost:3000'), {
      method: 'PATCH',
      body: 'not valid json{{{',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid JSON')
  })

  // -------------------------------------------------------------------------
  // 404 — session not found
  // -------------------------------------------------------------------------

  it('returns 404 if session does not exist', async () => {
    mockGetBrewSession.mockResolvedValue(null)

    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('999'))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toContain('not found')
  })

  // -------------------------------------------------------------------------
  // Success — basic field updates
  // -------------------------------------------------------------------------

  it('returns 200 with updated_at on successful update', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'exploring',
      skeleton_json: null,
    })

    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.updated_at).toBeDefined()
    expect(new Date(data.updated_at).toISOString()).toBe(data.updated_at)
  })

  it('passes only allowed fields to updateBrewSession', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'exploring',
      skeleton_json: null,
    })

    const req = makePatchRequest({
      status: 'building',
      commander_name: 'Atraxa',
      unknown_garbage: 'should be ignored',
    })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    expect(mockUpdateBrewSession).toHaveBeenCalledWith(1, expect.objectContaining({
      status: 'building',
      commander_name: 'Atraxa',
    }))
    // Verify unknown field was NOT passed
    const updateCall = mockUpdateBrewSession.mock.calls[0][1]
    expect(updateCall).not.toHaveProperty('unknown_garbage')
  })

  it('accepts null values for nullable fields', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'building',
      skeleton_json: null,
    })

    const req = makePatchRequest({
      commander_name: null,
      colour_identity: null,
      path_type: null,
    })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    expect(mockUpdateBrewSession).toHaveBeenCalledWith(1, expect.objectContaining({
      commander_name: null,
      colour_identity: null,
      path_type: null,
    }))
  })

  // -------------------------------------------------------------------------
  // skeleton_json — read-merge-write
  // -------------------------------------------------------------------------

  it('merges skeleton_json with existing data (preserves sibling keys)', async () => {
    const existingSkeleton = JSON.stringify({
      cards: [{ card_name: 'Sol Ring' }],
      suggestions: [{ card_name: 'Counterspell' }],
      canvasPositions: { 'Sol Ring': { x: 10, y: 20 } },
      explorationArchive: ['item1'],
    })

    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'building',
      skeleton_json: existingSkeleton,
    })

    // Only updating canvasPositions
    const patchSkeleton = JSON.stringify({
      canvasPositions: { 'Sol Ring': { x: 100, y: 200 } },
    })

    const req = makePatchRequest({ skeleton_json: patchSkeleton })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    const updateCall = mockUpdateBrewSession.mock.calls[0][1]
    const mergedSkeleton = JSON.parse(updateCall.skeleton_json as string)

    // canvasPositions should be updated
    expect(mergedSkeleton.canvasPositions).toEqual({ 'Sol Ring': { x: 100, y: 200 } })
    // Sibling fields should be preserved
    expect(mergedSkeleton.cards).toEqual([{ card_name: 'Sol Ring' }])
    expect(mergedSkeleton.suggestions).toEqual([{ card_name: 'Counterspell' }])
    expect(mergedSkeleton.explorationArchive).toEqual(['item1'])
  })

  it('handles skeleton_json merge when existing is null', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'building',
      skeleton_json: null,
    })

    const patchSkeleton = JSON.stringify({
      canvasPositions: { 'Sol Ring': { x: 50, y: 75 } },
    })

    const req = makePatchRequest({ skeleton_json: patchSkeleton })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    const updateCall = mockUpdateBrewSession.mock.calls[0][1]
    const mergedSkeleton = JSON.parse(updateCall.skeleton_json as string)
    expect(mergedSkeleton.canvasPositions).toEqual({ 'Sol Ring': { x: 50, y: 75 } })
  })

  it('handles skeleton_json merge when existing is invalid JSON', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'building',
      skeleton_json: 'not-valid-json{{{',
    })

    const patchSkeleton = JSON.stringify({
      cards: [{ card_name: 'Lightning Bolt' }],
    })

    const req = makePatchRequest({ skeleton_json: patchSkeleton })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(200)

    const updateCall = mockUpdateBrewSession.mock.calls[0][1]
    const mergedSkeleton = JSON.parse(updateCall.skeleton_json as string)
    // Existing was invalid, so only patch keys exist
    expect(mergedSkeleton.cards).toEqual([{ card_name: 'Lightning Bolt' }])
  })

  // -------------------------------------------------------------------------
  // 500 — DB error
  // -------------------------------------------------------------------------

  it('returns 500 when updateBrewSession throws', async () => {
    mockGetBrewSession.mockResolvedValue({
      id: 1,
      status: 'exploring',
      skeleton_json: null,
    })
    mockUpdateBrewSession.mockRejectedValue(new Error('Connection failed'))

    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('Connection failed')
  })

  it('returns 500 when getBrewSession throws', async () => {
    mockGetBrewSession.mockRejectedValue(new Error('DB unavailable'))

    const req = makePatchRequest({ status: 'building' })
    const res = await PATCH(req, makeParams('1'))
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('DB unavailable')
  })
})
