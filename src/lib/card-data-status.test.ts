import { describe, it, expect } from 'vitest'
import { calculateCardDataStaleness } from './card-data-status'

const now = new Date('2026-10-20T00:00:00Z')

describe('calculateCardDataStaleness', () => {
  it('is stale when never synced', () => {
    expect(calculateCardDataStaleness(null, now)).toEqual({ lastSyncedAt: null, ageDays: null, isStale: true })
  })
  it('is stale when the date is unreadable', () => {
    expect(calculateCardDataStaleness('nope', now).isStale).toBe(true)
  })
  it('is fresh at 7 days exactly and stale just after', () => {
    expect(calculateCardDataStaleness('2026-10-13T00:00:00Z', now)).toMatchObject({ ageDays: 7, isStale: false })
    expect(calculateCardDataStaleness('2026-10-12T23:59:00Z', now).isStale).toBe(true)
  })
  it('is fresh for yesterday and for future timestamps', () => {
    expect(calculateCardDataStaleness('2026-10-19T00:00:00Z', now)).toMatchObject({ ageDays: 1, isStale: false })
    expect(calculateCardDataStaleness('2026-10-21T00:00:00Z', now)).toMatchObject({ ageDays: 0, isStale: false })
  })
})
