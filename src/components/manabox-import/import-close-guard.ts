/**
 * What to do when the Import Deck window is asked to close while the File tab
 * is showing. Pure so the rules are unit tested.
 *
 * - Clicking outside never closes it.
 * - While reading the file or creating the deck, nothing closes it (Escape, X).
 * - With edits on the review list, ask first.
 */
export interface CloseGuardState {
  checking: boolean
  saving: boolean
  hasEdits: boolean
}

export type CloseDecision = 'allow' | 'block' | 'confirm'

export function decideDeckDialogClose(reason: string | undefined, state: CloseGuardState): CloseDecision {
  if (reason === 'outside-press') return 'block'
  if (state.saving) return 'block'
  if (state.checking && reason === 'escape-key') return 'block'
  if (state.hasEdits) return 'confirm'
  return 'allow'
}
