/**
 * In-process refresh runner for the local dev server.
 *
 * POST starts the sync in the background of the Next.js server process and
 * returns straight away; the browser polls GET for progress. State lives on
 * globalThis so it survives Next.js dev hot reloads and is shared by routes.
 * Only one refresh may run at a time. Not suitable for serverless hosting
 * (the process may be frozen after the response) — Oracle runs locally.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { runCardDataSync, type SyncResult } from '@/lib/card-data-sync'
import type { CardDataStatus } from '@/lib/card-data-status'

type RefreshState = CardDataStatus['refresh']

const KEY = '__oracleCardDataRefresh'
const g = globalThis as unknown as Record<string, RefreshState | undefined>

function state(): RefreshState {
  if (!g[KEY]) {
    g[KEY] = { phase: 'idle', message: null, startedAt: null, finishedAt: null, processed: 0 }
  }
  return g[KEY] as RefreshState
}

export function getRefreshState(): RefreshState {
  return { ...state() }
}

export function resetRefreshStateForTests() {
  g[KEY] = undefined
}

export function describeResult(r: SyncResult): { ok: boolean; message: string } {
  if (r.skipped) return { ok: true, message: 'Card data was already up to date.' }
  if (r.failed > 0) {
    return {
      ok: false,
      message: `Card data updated, but ${r.failed.toLocaleString()} cards could not be saved. Please try again.`,
    }
  }
  return { ok: true, message: `Card data updated — ${r.upserted.toLocaleString()} cards refreshed.` }
}

/**
 * Starts a refresh unless one is running. Returns false when one is already
 * running (caller should answer 409). The returned promise-free API keeps the
 * route fast; `done` is exposed for tests.
 */
export function startRefresh(
  db: Pick<SupabaseClient, 'from'>,
  run: typeof runCardDataSync = runCardDataSync
): { started: boolean; done: Promise<void> } {
  const s = state()
  if (s.phase === 'running') return { started: false, done: Promise.resolve() }

  s.phase = 'running'
  s.message = 'Starting…'
  s.startedAt = new Date().toISOString()
  s.finishedAt = null
  s.processed = 0

  const done = (async () => {
    try {
      const result = await run(db, {
        onProgress: (message, processed) => {
          s.message = message
          s.processed = processed
        },
        onError: (m) => console.error('[card-data-refresh]', m),
      })
      const outcome = describeResult(result)
      s.phase = outcome.ok ? 'succeeded' : 'failed'
      s.message = outcome.message
      if (result.failed > 0) {
        console.error('[card-data-refresh] failed rows', result.failed, result.failedIds, result.firstError)
      }
    } catch (e) {
      console.error('[card-data-refresh] failed', e)
      s.phase = 'failed'
      s.message = 'Card data could not be refreshed. Check your internet connection and try again.'
    } finally {
      s.finishedAt = new Date().toISOString()
    }
  })()

  return { started: true, done }
}
