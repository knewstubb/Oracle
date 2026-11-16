/**
 * Deck destination, server side (contract 4c, slice I2). Pure helpers: build the rows for
 * `insert_user_copies_to_deck`, turn its answer into the `placement` the result screen shows, and work out the
 * warnings (outside the commander's colours, not legal, deck over size). Warnings never block: the card is
 * still added (owner decision). A check that cannot run says so (D-030), it is never "no warnings".
 */
import { getFormatConfig } from '@/lib/format-config'
import type {
  ImportPlacementResult,
  ImportUnsortedReason,
} from '../../docs/oracle/contracts/know-where-cards-are.types'

/** Extra keys the deck function reads on each row (it ignores location_id). */
export interface DeckRowMeta {
  cardName: string
  scryfallId: string
  setCode: string
  isBasicLand: boolean
}

export function toDeckRpcRows<T extends Record<string, unknown>>(rows: T[], metas: DeckRowMeta[]): Array<Record<string, unknown>> {
  if (rows.length !== metas.length) throw new Error('Deck import rows and row details do not line up')
  return rows.map((row, i) => ({
    ...row,
    location_id: null,
    card_name: metas[i].cardName,
    scryfall_id: metas[i].scryfallId,
    set_code: metas[i].setCode,
    is_basic_land: metas[i].isBasicLand,
  }))
}

const REASONS: Record<string, ImportUnsortedReason> = {
  already_filled: 'duplicate',
  maybeboard_only: 'in_maybeboard',
  basic_land: 'basic_land',
  could_not_place: 'could_not_place',
}

interface RpcOutcome {
  index: number
  kind: 'filled' | 'added' | 'unsorted'
  reason?: string | null
}

export interface DeckRpcAnswer {
  outcomes: RpcOutcome[]
  counts: { filled: number; added: number; unsorted: number; proxies_placed: number }
}

/** Reads the function's answer. Throws if it is malformed or the counts do not add up (nothing is hidden). */
export function parseDeckRpcAnswer(data: unknown, expectedTotal: number): DeckRpcAnswer {
  const d = data as { success?: boolean; outcomes?: RpcOutcome[]; counts?: DeckRpcAnswer['counts'] } | null
  if (!d || d.success !== true || !Array.isArray(d.outcomes) || !d.counts) {
    throw new Error('Deck import returned an unexpected answer')
  }
  const { filled, added, unsorted } = d.counts
  if (filled + added + unsorted !== expectedTotal || d.outcomes.length !== expectedTotal) {
    throw new Error('Deck import counts do not add up to the cards imported')
  }
  return { outcomes: d.outcomes, counts: d.counts }
}

const DETAIL_CAP = 200

export function buildDeckPlacement(args: {
  deckId: number
  deckName: string
  answer: DeckRpcAnswer
  /** Card name for each imported copy, in file order. */
  names: string[]
}): ImportPlacementResult {
  const { answer, names } = args
  const unsortedReasons: Record<ImportUnsortedReason, number> = { duplicate: 0, in_maybeboard: 0, basic_land: 0, could_not_place: 0 }
  const details: NonNullable<ImportPlacementResult['details']> = []
  for (const o of answer.outcomes) {
    const reason = o.kind === 'unsorted' ? (REASONS[o.reason ?? ''] ?? 'could_not_place') : undefined
    if (reason) unsortedReasons[reason]++
    // Only the copies that went to Unsorted need naming on the screen; the list is capped.
    if (o.kind === 'unsorted' && details.length < DETAIL_CAP) {
      details.push({ cardName: names[o.index] ?? 'Unknown card', outcome: 'unsorted', reason })
    }
  }
  return {
    destination: { kind: 'deck', id: args.deckId, name: args.deckName },
    total: answer.outcomes.length,
    filledSlots: answer.counts.filled,
    addedAsNew: answer.counts.added,
    sentToUnsorted: answer.counts.unsorted,
    unsortedReasons,
    details,
    proxies: answer.counts.proxies_placed,
  }
}

export interface WarningCardFacts {
  colours: string[]
  commanderLegal: boolean
}

/** Colours as letters from the deck ("WBR", "" = colourless). null = could not be worked out. */
export function computeDeckWarnings(args: {
  deckFormat: string | null
  deckColours: string | null
  /** Names of cards that became NEW slots (cards the deck already listed were accepted earlier). */
  addedNames: string[]
  /** null = the card data could not be read. */
  cardFacts: Map<string, WarningCardFacts> | null
  /** Main-list size after the import (Maybeboard excluded); null if it could not be read. */
  mainCountAfter: number | null
}): NonNullable<ImportPlacementResult['warnings']> {
  const config = getFormatConfig(args.deckFormat)
  const target = config.deckSize
  const outsideColours: string[] = []
  const notLegal: string[] = []
  const unique = [...new Set(args.addedNames)]
  let checksUnavailable = args.mainCountAfter === null
  if (unique.length > 0) {
    if (args.cardFacts === null) {
      checksUnavailable = true
    } else {
      if (config.colorIdentityRule && args.deckColours === null) checksUnavailable = true
      const allowed = new Set((args.deckColours ?? '').toUpperCase().split(''))
      for (const name of unique) {
        const facts = args.cardFacts.get(name)
        if (!facts) {
          checksUnavailable = true
          continue
        }
        if (config.colorIdentityRule && args.deckColours !== null && !facts.colours.every((c) => allowed.has(c))) {
          outsideColours.push(name)
        }
        if (config.id === 'commander' && !facts.commanderLegal) notLegal.push(name)
      }
    }
  }
  const mainCountAfter = args.mainCountAfter ?? 0
  return {
    outsideColours,
    notLegal,
    mainCountAfter,
    targetCount: target,
    overTarget: target !== null && args.mainCountAfter !== null && args.addedNames.length > 0 && mainCountAfter > target,
    checksUnavailable,
  }
}
