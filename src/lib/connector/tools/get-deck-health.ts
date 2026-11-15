import { z } from 'zod'
import { MAX_HEALTH_RESULT_BYTES, byteLength } from '../limits'
import { LookupFailed, lookupFailed, must, notFound, rows, type ToolContext, type ToolOutput } from './common'

export const getDeckHealthInput = z.strictObject({
  deck_id: z.number().int().positive().describe('The deck id from list_decks.'),
})

const STALE_MS = 7 * 24 * 60 * 60 * 1000

/** Cached result only. This tool never computes a check, and never writes. */
export async function getDeckHealth(ctx: ToolContext, input: z.infer<typeof getDeckHealthInput>, now: Date = new Date()): Promise<ToolOutput> {
  try {
    const dr = await must(ctx.db.select('decks', 'id').eq('user_id', ctx.userId).eq('id', input.deck_id).limit(1))
    if (rows<{ id: number }>(dr).length === 0) return notFound()

    const hr = await must(
      ctx.db.select('deck_health', 'deck_id, overall_status, computed_at, result_json').eq('user_id', ctx.userId).eq('deck_id', input.deck_id).limit(1),
    )
    const row = rows<{ deck_id: number; overall_status: string; computed_at: string; result_json: string }>(hr)[0]
    if (!row) {
      return {
        ok: true,
        deckId: input.deck_id,
        status: 'not_computed',
        overallStatus: null,
        computedAt: null,
        stale: false,
        result: null,
        note: 'No health check has been run for this deck yet. This is not the same as healthy.',
      }
    }
    let result: unknown = null
    let note: string | undefined
    try {
      result = JSON.parse(row.result_json)
    } catch {
      note = 'The saved health details could not be read.'
    }
    if (result !== null && byteLength(result) > MAX_HEALTH_RESULT_BYTES) {
      result = null
      note = 'The saved health details were too large to include; only the overall status is shown.'
    }
    const computedMs = Date.parse(row.computed_at)
    return {
      ok: true,
      deckId: input.deck_id,
      status: 'computed',
      overallStatus: row.overall_status,
      computedAt: row.computed_at,
      stale: Number.isNaN(computedMs) ? true : now.getTime() - computedMs > STALE_MS,
      result,
      ...(note ? { note } : {}),
    }
  } catch (e) {
    if (e instanceof LookupFailed) return lookupFailed()
    throw e
  }
}
