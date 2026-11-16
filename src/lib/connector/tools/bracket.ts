// CC-06e: where a deck's bracket comes from. The Deck strategy screen saves to deck_strategy.bracket (1 to 4);
// the deck row's own bracket text is the older place. Read only: no tool can set a bracket.
import type { BracketInfo } from '../../../../docs/oracle/contracts/connector-card-facts-and-deck-health.types'
import { fetchAllIn, type ToolContext } from './common'

export const BRACKET_WHY_EMPTY: NonNullable<BracketInfo['whyEmpty']> =
  'Brackets are set by the owner on the Deck strategy screen in Oracle. Claude cannot set them. This deck has none set yet.'

/** A bracket is a whole number 1 to 4. Anything else (empty, "Bracket 3", "7") is not a value. */
export function parseBracket(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 1 && raw <= 4 ? raw : null
  if (typeof raw === 'string') {
    const m = /^\s*([1-4])\s*$/.exec(raw)
    return m ? Number(m[1]) : null
  }
  return null
}

export function resolveBracket(strategyBracket: unknown, deckRowBracket: unknown): BracketInfo {
  const fromStrategy = parseBracket(strategyBracket)
  if (fromStrategy !== null) return { value: fromStrategy, source: 'deck_strategy' }
  const fromRow = parseBracket(deckRowBracket)
  if (fromRow !== null) return { value: fromRow, source: 'deck_row' }
  return { value: null, source: 'not_set', whyEmpty: BRACKET_WHY_EMPTY }
}

/** deck id -> the bracket saved on the Deck strategy screen (owner's rows only). */
export async function loadStrategyBrackets(ctx: ToolContext, deckIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>()
  if (deckIds.length === 0) return out
  const rs = await fetchAllIn<{ deck_id: number; bracket: number | null }>(ctx, 'deck_strategy', 'deck_id, bracket', 'deck_id', deckIds)
  for (const r of rs) out.set(r.deck_id, r.bracket)
  return out
}
