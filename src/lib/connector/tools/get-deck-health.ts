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

const NOTE =
  'Six rows, always shown: Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes / Mass Disruption and Game Plan & Win Conditions. The first five are checked against the Command Zone template ranges (Light below the minimum, Ok inside, Heavy above the maximum). Game Plan & Win Conditions is a plain total with no range and no verdict. The EDHREC average is for reference only. These are the same six rows the Deck health screen shows.'
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
  timeoutMs?: number,
): Promise<ToolOutput> {
  const started = Date.now()
  const r = await loadConnectorDeckHealth(ctx, input.deck_id, targets, timeoutMs)
  if (!r.ok) return r.status === 404 ? notFound() : editError('HEALTH_FAILED', FAILED, true)
  console.info(`[connector] deck health for deck ${input.deck_id} computed in ${Date.now() - started} ms`)
  if (byteLength(r.health) > MAX_HEALTH_RESULT_BYTES) return editError('HEALTH_FAILED', 'The deck health result was too large to return.', false)
  const result: Extract<DeckHealthToolResult, { ok: true }> = {
    ok: true,
    deckId: input.deck_id,
    status: 'computed_now',
    computedAt: now().toISOString(),
    health: r.health,
    note: NOTE,
  }
  return result as unknown as ToolOutput
}
