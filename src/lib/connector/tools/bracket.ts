// CC-06e: where a deck's bracket comes from. The Strategy window saves to deck_strategy.bracket (1 to 5, the owner's TARGET);
// the deck row's own bracket text is the older place. Claude can set a bracket with set_deck_setup; the readers here only read it.
import type { BracketInfo } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { bracketName, parseBracket } from '../../deck-bracket'
import { fetchAllIn, type ToolContext } from './common'
export { parseBracket }
/** No target bracket yet: Claude asks the owner. It never assumes one, and a missing bracket never limits what Claude may suggest. */
export const BRACKET_WHY_EMPTY: NonNullable<BracketInfo['whyEmpty']> =
  'No target bracket is set for this deck. Ask the owner which bracket they are aiming for (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH) instead of assuming one. Once they say, Claude can set it with set_deck_setup. The bracket never limits which cards Claude may suggest.'
/** The owner's name for a bracket number, for example "Upgraded" for 3. Null for a number that is not a bracket. */
export { bracketName }
export function resolveBracket(strategyBracket: unknown, deckRowBracket: unknown): BracketInfo {
  const fromStrategy = parseBracket(strategyBracket)
  if (fromStrategy !== null) return { value: fromStrategy, source: 'deck_strategy' }
  const fromRow = parseBracket(deckRowBracket)
  if (fromRow !== null) return { value: fromRow, source: 'deck_row' }
  return { value: null, source: 'not_set', whyEmpty: BRACKET_WHY_EMPTY }
}

/** deck id -> the bracket saved in the Strategy window (owner's rows only). */
export async function loadStrategyBrackets(ctx: ToolContext, deckIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>()
  if (deckIds.length === 0) return out
  const rs = await fetchAllIn<{ deck_id: number; bracket: number | null }>(ctx, 'deck_strategy', 'deck_id, bracket', 'deck_id', deckIds)
  for (const r of rs) out.set(r.deck_id, r.bracket)
  return out
}
