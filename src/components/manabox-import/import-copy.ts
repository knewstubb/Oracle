/** Wording for the import stage screens (import-stage-screens spec, section 7). */

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
