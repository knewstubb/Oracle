import { z } from 'zod'
import type { DeckHealthToolResult } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { MAX_HEALTH_RESULT_BYTES, byteLength } from '../limits'
import { editError } from '../errors'
import type { TargetsProvider } from '../../deck-health-server'
import { connectorTargetsProvider, loadConnectorDeckHealth } from '../deck-health-loader'
import { notFound, type ToolContext, type ToolOutput } from './common'

export const getDeckHealthInput = z.strictObject({
  deck_id: z.number().int().positive().describe('The deck id from list_decks.'),
})

const FAILED = 'The deck health check could not be completed. This is not the same as healthy. Try again in a moment.'

/**
 * Runs the same Deck health check as the Deck health screen, on every call. Read-only: nothing is saved, including the
 * shared commander-numbers cache. A failure is a real error, never a passing result (D-030).
 */
export async function getDeckHealth(
  ctx: ToolContext,
  input: z.infer<typeof getDeckHealthInput>,
  targets: TargetsProvider = connectorTargetsProvider,
  now: () => Date = () => new Date(),
): Promise<ToolOutput> {
  const started = Date.now()
  const r = await loadConnectorDeckHealth(ctx, input.deck_id, targets)
  if (!r.ok) return r.status === 404 ? notFound() : editError('HEALTH_FAILED', FAILED, true)
  console.info(`[connector] deck health for deck ${input.deck_id} computed in ${Date.now() - started} ms`)
  if (byteLength(r.health) > MAX_HEALTH_RESULT_BYTES) return editError('HEALTH_FAILED', 'The deck health result was too large to return.', false)
  const result: Extract<DeckHealthToolResult, { ok: true }> = {
    ok: true,
    deckId: input.deck_id,
    status: 'computed_now',
    computedAt: now().toISOString(),
    health: r.health,
    // Said out loud when the commander's typical numbers are older or are the general guide.
    ...(/out of date|couldn't reach|General guide/i.test(r.health.sourceLine) ? { note: r.health.sourceLine } : {}),
  }
  return result as unknown as ToolOutput
}
