import { describe, it, expect, vi, afterEach } from 'vitest'
import { decidePending, fetchChanges, fetchConnectionStatus, fetchPendingCount, undoGroup } from './api'

const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body })
afterEach(() => vi.unstubAllGlobals())

describe('connector api client', () => {
  it('maps the status route to active/off', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, connected: true, connection: { id: 'c1', client_name: 'Claude', last_used_at: null } }))
    expect(await fetchConnectionStatus()).toMatchObject({ state: 'active', connectionId: 'c1', clientName: 'Claude' })
    vi.stubGlobal('fetch', reply(200, { ok: true, connected: false, connection: null }))
    expect((await fetchConnectionStatus()).state).toBe('off')
  })
  it('a 503 is an error, not an empty list', async () => {
    vi.stubGlobal('fetch', reply(503, { ok: false, error: 'x' }))
    await expect(fetchChanges()).rejects.toThrow()
  })
  it('reads the count', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, count: 3 }))
    expect(await fetchPendingCount()).toBe(3)
  })
  it('a 409 undo carries the refusal', async () => {
    vi.stubGlobal('fetch', reply(409, { ok: false, refused: { code: 'slot_sleeved', card: 'X' } }))
    expect(await undoGroup('g')).toEqual({ ok: false, refused: { code: 'slot_sleeved', card: 'X' } })
  })
  it('a network failure on undo is "failed", not refused', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await undoGroup('g')).toEqual({ ok: false, failed: true })
  })
  it('a 409 approve is stale', async () => {
    vi.stubGlobal('fetch', reply(409, { ok: false, outcome: 'failed', error: 'The deck changed' }))
    expect(await decidePending('p', 'approve')).toMatchObject({ ok: false, stale: true })
  })
})
