/**
 * Move here: pure helpers (no database). Contract: docs/oracle/contracts/know-where-cards-are.md section 4a.
 * Spec: docs/oracle/specs/know-where-cards-are.md section 19.
 */

export type MoveHereDeckState = 'draft' | 'assembling' | 'playable'

/** One copy that could be moved here: it sits in a deck other than the target. */
export interface MoveHereCopy {
  copyId: number
  isProxy: boolean
  deckId: number
  deckName: string
  deckState: MoveHereDeckState
}

/**
 * Default order (spec 19.6): copies in decks that are not Playable first, originals before proxies,
 * then deck name A to Z (then copy id so the order is stable). Never mutates the input.
 */
export function orderMoveHereCopies(copies: readonly MoveHereCopy[]): MoveHereCopy[] {
  return [...copies].sort((a, b) => {
    const playable = Number(a.deckState === 'playable') - Number(b.deckState === 'playable')
    if (playable !== 0) return playable
    const proxy = Number(a.isProxy) - Number(b.isProxy)
    if (proxy !== 0) return proxy
    const name = a.deckName.localeCompare(b.deckName)
    if (name !== 0) return name
    return a.copyId - b.copyId
  })
}

/** Copies that may be offered for a target deck: in another deck only (never the target deck itself). */
export function movableCopies(copies: readonly MoveHereCopy[], targetDeckId: number): MoveHereCopy[] {
  return orderMoveHereCopies(copies.filter((c) => c.deckId !== targetDeckId))
}

export type MoveHereErrorCode =
  | 'already_in_this_deck'
  | 'source_changed'
  | 'copy_missing'
  | 'no_open_slot'
  | 'copy_not_found'
  | 'failed'

/** Plain-language messages for each refusal. Nothing is changed in any of these cases. */
export function moveHereErrorMessage(code: MoveHereErrorCode | string, cardName: string, sourceDeckName?: string): string {
  switch (code) {
    case 'already_in_this_deck':
      return `${cardName} is already in this deck.`
    case 'source_changed':
      return sourceDeckName ? `${cardName} is no longer in ${sourceDeckName}.` : `${cardName} has moved since this page loaded.`
    case 'copy_missing':
      return `${cardName} is marked missing, so it can't be moved.`
    case 'no_open_slot':
      return `This deck has no open slot for ${cardName}. Add it to the deck first.`
    case 'copy_not_found':
      return `Couldn't find that copy of ${cardName}.`
    default:
      return `Couldn't move ${cardName}. Nothing was changed.`
  }
}

/** The toast line after a move (spec 19.3 and 19.5). */
export function movedToastText(sourceDeckName: string, sourceWasPlayable: boolean): string {
  return sourceWasPlayable
    ? `Moved from ${sourceDeckName}. ${sourceDeckName} is now Assembling.`
    : `Moved from ${sourceDeckName}. ${sourceDeckName} is now short by one.`
}

/** The line shown on the row before the click when the source is Playable (spec 19.5). */
export function playableWarning(sourceDeckName: string): string {
  return `${sourceDeckName} is Playable, so it will become Assembling.`
}
