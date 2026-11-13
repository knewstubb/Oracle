// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  execute: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/import-engine-v2', () => ({ executeInstanceLevelImport: vi.fn() }))
vi.mock('@/lib/manabox-collection-import', () => ({ executeManaBoxCollectionImport: mocks.execute }))

import { POST } from './route'
import { ImportDestinationError } from '@/lib/import-destination'

const SUMMARY = {
  inserted: 2,
  skipped: 0,
  removed: 0,
  sourceTag: 'manabox',
  errors: [],
  unmatched: [],
  durationMs: 1,
  placement: { destination: { kind: 'storage', id: 5, name: 'Valuable binder' }, total: 2, placedInStorage: 2 },
}

function jsonRequest(body: unknown, query = '?mode=manabox') {
  return new NextRequest(new URL(`/api/collection/import${query}`, 'http://localhost:3000'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('collection import destination (route)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'me' })
    mocks.execute.mockResolvedValue(SUMMARY)
  })

  it('no destination: the import runs as Unsorted', async () => {
    const res = await POST(jsonRequest({ csvContent: 'a,b', defaults: {} }))
    expect(res.status).toBe(200)
    expect(mocks.execute.mock.calls[0][0].destination).toEqual({ kind: 'unsorted' })
  })

  it('JSON body carries the destination and the summary has placement', async () => {
    const res = await POST(jsonRequest({ csvContent: 'a,b', defaults: {}, destination: { kind: 'storage', locationId: 5 } }))
    expect(mocks.execute.mock.calls[0][0].destination).toEqual({ kind: 'storage', locationId: 5 })
    expect(mocks.execute.mock.calls[0][0].userId).toBe('me')
    expect((await res.json()).placement.destination.name).toBe('Valuable binder')
  })

  it('multipart carries the destination as a JSON field', async () => {
    const form = new FormData()
    form.set('file', new File(['a,b'], 'x.csv'))
    form.set('defaults', JSON.stringify({}))
    form.set('destination', JSON.stringify({ kind: 'storage', locationId: 5 }))
    const res = await POST(
      new NextRequest(new URL('/api/collection/import?mode=manabox', 'http://localhost:3000'), { method: 'POST', body: form })
    )
    expect(res.status).toBe(200)
    expect(mocks.execute.mock.calls[0][0].destination).toEqual({ kind: 'storage', locationId: 5 })
  })

  it('the streamed variant carries the destination and completes with placement', async () => {
    const res = await POST(
      jsonRequest({ csvContent: 'a,b', defaults: {}, destination: { kind: 'storage', locationId: 5 } }, '?mode=manabox&stream=1')
    )
    const events = (await res.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(mocks.execute.mock.calls[0][0].destination).toEqual({ kind: 'storage', locationId: 5 })
    expect(events.at(-1)).toMatchObject({ type: 'complete', summary: { placement: { total: 2 } } })
  })

  it.each([
    ['unknown kind', { kind: 'in_hand' }],
    ['both ids', { kind: 'storage', locationId: 1, deckId: 2 }],
  ])('refuses %s with 400 before anything runs', async (_l, destination) => {
    const res = await POST(jsonRequest({ csvContent: 'a,b', defaults: {}, destination }))
    expect(res.status).toBe(400)
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('maps a refused place to its status, and the stream to an error event', async () => {
    mocks.execute.mockRejectedValue(new ImportDestinationError('That box or binder no longer exists. Pick another place.', 404))
    const res = await POST(jsonRequest({ csvContent: 'a,b', defaults: {}, destination: { kind: 'storage', locationId: 5 } }))
    expect(res.status).toBe(404)
    const streamed = await POST(
      jsonRequest({ csvContent: 'a,b', defaults: {}, destination: { kind: 'storage', locationId: 5 } }, '?mode=manabox&stream=1')
    )
    const events = (await streamed.text()).trim().split('\n').map((l) => JSON.parse(l))
    expect(events.at(-1)).toEqual({ type: 'error', message: 'That box or binder no longer exists. Pick another place.' })
  })
})
