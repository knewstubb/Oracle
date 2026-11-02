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

export interface CollectionCloseState extends CloseGuardState {
  /** The result (or failed) screen is showing: Escape may close it. */
  finished: boolean
}

/**
 * Collection import window. Outside click never closes it. Escape closes the
 * result screen, and on a review list with edits it asks "Discard edits?" just
 * like X; on upload, reading, an unedited review or saving it does nothing.
 * X and Cancel close unless a save is running; with edits they ask first.
 */
export function decideCollectionClose(reason: string | undefined, state: CollectionCloseState): CloseDecision {
  if (reason === 'outside-press') return 'block'
  if (state.saving) return 'block'
  if (state.hasEdits && !state.finished && !state.checking) return 'confirm'
  if (reason === 'escape-key' && !state.finished) return 'block'
  if (state.hasEdits) return 'confirm'
  return 'allow'
}
