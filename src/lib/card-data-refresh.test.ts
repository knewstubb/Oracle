import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startRefresh, getRefreshState, resetRefreshStateForTests, describeResult } from './card-data-refresh'
import type { SyncResult } from './card-data-sync'

const ok: SyncResult = { skipped: false, total: 3, upserted: 3, failed: 0, failedIds: [], firstError: null, syncedAt: 't' }
const db = {} as never

beforeEach(() => resetRefreshStateForTests())

describe('startRefresh', () => {
  it('refuses a second refresh while one is running, then allows another', async () => {
    let release!: (r: SyncResult) => void
    const run = vi.fn(() => new Promise<SyncResult>((res) => (release = res)))
    const first = startRefresh(db, run)
    expect(first.started).toBe(true)
    expect(getRefreshState().phase).toBe('running')
    expect(startRefresh(db, run).started).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
    release(ok)
    await first.done
    expect(getRefreshState()).toMatchObject({ phase: 'succeeded' })
    expect(startRefresh(db, vi.fn(async () => ok)).started).toBe(true)
  })
  it('records failure with a plain message when the sync throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { done } = startRefresh(db, async () => {
      throw new Error('boom')
    })
    await done
    expect(getRefreshState().phase).toBe('failed')
    expect(getRefreshState().message).toMatch(/could not be refreshed/)
    err.mockRestore()
  })
  it('marks failed when rows could not be saved', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { done } = startRefresh(db, async () => ({ ...ok, failed: 2, upserted: 1, failedIds: ['a'] }))
    await done
    expect(getRefreshState().phase).toBe('failed')
    err.mockRestore()
  })
  it('reports progress', async () => {
    const { done } = startRefresh(db, async (_d, o) => {
      o?.onProgress?.('Saved 10 cards…', 10)
      expect(getRefreshState()).toMatchObject({ message: 'Saved 10 cards…', processed: 10 })
      return ok
    })
    await done
  })
})

describe('describeResult', () => {
  it('describes skipped and success', () => {
    expect(describeResult({ ...ok, skipped: true }).message).toMatch(/already up to date/)
    expect(describeResult(ok)).toMatchObject({ ok: true })
  })
})
