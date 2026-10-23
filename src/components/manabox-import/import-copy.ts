/** Wording for the import stage screens (import-stage-screens spec, section 7). */
import type { ImportIntent } from '../../../docs/oracle/contracts/import-intent.types'

export type StageKind = 'collection' | 'deck'

export function wrongTypeMessage(extensions: string[]): string {
  return `That isn't a ManaBox ${extensions.map((e) => `.${e}`).join(' or ')} file. Choose the file you exported from ManaBox.`
}

export const EMPTY_FILE_MESSAGE =
  'This file has no cards. Check you exported the right list from ManaBox, then try again.'

export const UNREADABLE_FILE_MESSAGE =
  "We couldn't read that file. Export it from ManaBox again and retry."

export function exportHelpText(kind: StageKind): string {
  return kind === 'deck'
    ? 'Open the deck in ManaBox and export it as CSV or text.'
    : 'Open your collection in ManaBox and export it as CSV.'
}

export const NEXT_STEPS = [
  'We read finish, condition and language from your file.',
  'You review the cards and can change any copy.',
  'Nothing is added until you confirm.',
]

export function processingDetail(cards?: number): string {
  return cards && cards > 0
    ? `Matching ${cards} ${cards === 1 ? 'card' : 'cards'} to Scryfall. This usually takes a few seconds.`
    : 'Matching your cards to Scryfall.'
}

// ---------------------------------------------------------------------------
// Deck import intent (spec import-intent §3, §12)
// ---------------------------------------------------------------------------

export const INTENT_QUESTION = "What's this deck?"
export const INTENT_CHOOSE_ERROR = 'Choose one to continue.'
export const INTENT_FILE_HELD = 'Choose one above.'

export const INTENT_OPTIONS: { value: ImportIntent; label: string; description: string; heading: string }[] = [
  { value: 'purchased', label: 'I bought it', description: 'Adds every card to your collection and sleeves it.', heading: 'Import purchased deck' },
  { value: 'built', label: 'I built it', description: 'Uses cards you own. Add any new ones as you go.', heading: 'Import built deck' },
  { value: 'planned', label: "I'm planning it", description: 'Just a list. Nothing is added or sleeved.', heading: 'Import planned deck' },
]

/** Dialog heading: "Import deck" until an intent is chosen. */
export function intentHeading(intent: ImportIntent | null): string {
  return INTENT_OPTIONS.find((o) => o.value === intent)?.heading ?? 'Import deck'
}

export const OWNERSHIP_LOADING = 'Checking your collection…'
export const OWNERSHIP_FAILED = "Couldn't check your collection."
/** Built and planned imports can be reviewed but not saved yet (saving arrives in a later slice). */
export const INTENT_SAVE_PENDING = 'Saving built and planned decks is coming soon. You can review the list now.'

/** Precon tab. */
export const PRECON_INTENT_NOTE = 'Precons are always something you bought, so this is set for you.'
export const PRECONS_NOT_SET_UP = 'Precons not set up yet'
export const PRECONS_NOT_SET_UP_HINT = 'The precon list has not been loaded into your library yet. You can still import by URL, pasted list or file.'
export const PRECON_OPEN_FAILED = "Couldn't open that precon. Try again."
