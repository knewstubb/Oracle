/**
 * Card data freshness — pure, client-safe helpers.
 * "Card data" = the local copy of Scryfall printings (table ref_printings).
 */

export const CARD_DATA_STALE_AFTER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface CardDataStaleness {
  lastSyncedAt: string | null
  /** Whole days since last sync; null when never synced or unreadable. */
  ageDays: number | null
  /** True when never synced, unreadable, or older than 7 days. */
  isStale: boolean
}

export function calculateCardDataStaleness(
  lastSyncedAt: string | null | undefined,
  now: Date = new Date(),
  staleAfterDays: number = CARD_DATA_STALE_AFTER_DAYS
): CardDataStaleness {
  if (!lastSyncedAt) return { lastSyncedAt: null, ageDays: null, isStale: true }
  const t = new Date(lastSyncedAt).getTime()
  if (Number.isNaN(t)) return { lastSyncedAt: null, ageDays: null, isStale: true }
  const ageMs = Math.max(0, now.getTime() - t)
  return {
    lastSyncedAt,
    ageDays: Math.floor(ageMs / DAY_MS),
    isStale: ageMs > staleAfterDays * DAY_MS,
  }
}

export type CardDataRefreshPhase = 'idle' | 'running' | 'succeeded' | 'failed'

/** Response shape of GET /api/card-data/refresh. */
export interface CardDataStatus {
  lastSyncedAt: string | null
  isStale: boolean
  ageDays: number | null
  totalPrintings: number | null
  refresh: {
    phase: CardDataRefreshPhase
    /** Plain-language progress or result message. */
    message: string | null
    startedAt: string | null
    finishedAt: string | null
    processed: number
  }
}
