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
export const INTENT_FILE_HELD = 'Choose one below.'

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

/** Per-card controls (spec §4-§6). */
export const ADD_COLUMN = 'Add to collection'
export const ADD_WAITING_TITLE = 'Checking your collection…'
export const NOT_OWNED_TITLE = 'Not owned: tick Add'
export const NO_FREE_COPY_TITLE = 'No free copy: tick Add'
export const MOVE_FROM = 'copy will be moved from'
export const MOVE_SKIP = 'Skip'
export const MOVE_SKIP_TITLE = 'Adds a new sleeved copy here; the other deck shows an alert on this card.'
export const PRINTING_ADD = 'Add this printing'
export const PRINTING_USE = (printing: string) => `Use my ${printing}`
export const printingNeedsChoice = (owned: string, listed: string) =>
  `you own it as ${owned}; this deck lists ${listed}. It can't be sleeved until you choose.`
export const printingLabel = (p: { setCode: string; collectorNumber: string }) =>
  `${p.setCode.toUpperCase()} ${p.collectorNumber}`
/** Purchased decks with an unticked Add can't be saved yet (owned-copy saving comes in a later slice). */
export const INTENT_SAVE_PENDING_UNTICKED =
  'Saving cards you already own is coming soon. Tick Add on every card to import now.'
