import type { RailCard } from '@/lib/deck-rail-stats'
import { seedForDeck, simulateManaByTurn, type SimOptions } from './simulate'
import { summarise, type TurnSummary } from './summary'

export type { TurnSummary } from './summary'

export interface ManaByTurnResult {
  actual: TurnSummary
  untapped: TurnSummary
}

/** Both runs share one seed, so the all-untapped line is never below the real line because of noise. */
export function manaByTurn(cards: RailCard[], commanderNames: string[], options: Pick<SimOptions, 'games' | 'turns'> = {}): ManaByTurnResult {
  const seed = seedForDeck(cards, commanderNames)
  return {
    actual: summarise(simulateManaByTurn(cards, commanderNames, { ...options, seed })),
    untapped: summarise(simulateManaByTurn(cards, commanderNames, { ...options, seed, allUntapped: true })),
  }
}
