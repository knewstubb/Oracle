/** Wording for the import stage screens (import-stage-screens spec, section 7). */
import type { ImportIntent } from '../../../docs/oracle/contracts/import-intent.types'

export type StageKind = 'collection' | 'deck'

export function wrongTypeMessage(extensions: string[]): string {
  return `That isn't a ${extensions.map((e) => `.${e}`).join(' or ')} file. Choose a ${extensions.map((e) => `.${e}`).join(' or ')} file exported from your deck or collection app.`
}

export const EMPTY_FILE_MESSAGE =
  'This file has no cards. Check you exported the right list, then try again.'

export const UNREADABLE_FILE_MESSAGE =
  "We couldn't read that file. Export it again and retry."

export function exportHelpText(kind: StageKind): string {
  return kind === 'deck'
    ? 'Export the deck from your deck app or site as CSV or text.'
    : 'Export your collection from your collection app as CSV.'
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

export const INTENT_OPTIONS: { value: ImportIntent; label: string; description: string; heading: string }[] = [
  { value: 'purchased', label: 'I bought it', description: "A deck you've just bought, such as a precon. Every card is added to your collection and sleeved.", heading: 'Import purchased deck' },
  { value: 'built', label: 'I built it', description: 'The deck is already sleeved from cards you own.', heading: 'Import built deck' },
  { value: 'planned', label: "I'm planning it", description: 'Just a list. Nothing is added or sleeved, and no other deck is touched.', heading: 'Import planned deck' },
]

/** Dialog heading: "Import deck" until an intent is chosen. */
export function intentHeading(intent: ImportIntent | null): string {
  return INTENT_OPTIONS.find((o) => o.value === intent)?.heading ?? 'Import deck'
}

export const OWNERSHIP_LOADING = 'Checking your collection…'
export const OWNERSHIP_FAILED = "Couldn't check your collection."
/** Built and planned imports can be reviewed but not saved yet (saving arrives in a later slice). */
/**
 * Off until migration M2 (import_deck_with_intent) is applied after the Architect's review.
 * Turn on with NEXT_PUBLIC_IMPORT_INTENT_SAVE=true (then restart the dev server).
 */
export const INTENT_SAVE_ENABLED = process.env.NEXT_PUBLIC_IMPORT_INTENT_SAVE === 'true'

/** Plain result-screen lines for an intent save (S8): what was moved, alerts, and copies that need a look. */
export function intentNotes(s?: {
  moved: number
  alertsCreated: number
  needsALook: { cardName: string }[]
  usedSpare?: string[]
  taken?: Array<{ cardName: string; fromDeckId: number; fromDeckName: string }>
  newCopies?: string[]
}): string[] {
  if (!s) return []
  const notes: string[] = []
  const names = (list: string[]) => [...new Set(list)].join(', ')
  if (s.usedSpare && s.usedSpare.length > 0) notes.push(`Used spare copies: ${names(s.usedSpare)}.`)
  if (s.taken && s.taken.length > 0) {
    const byDeck = new Map<number, { deck: string; cards: string[] }>()
    for (const t of s.taken) {
      const d = byDeck.get(t.fromDeckId) ?? { deck: t.fromDeckName, cards: [] }
      d.cards.push(t.cardName)
      byDeck.set(t.fromDeckId, d)
    }
    for (const { deck, cards } of byDeck.values()) {
      notes.push(`Taken from ${deck}: ${names(cards)}. ${deck} is now short ${cards.length}.`)
    }
  } else if (s.moved > 0) {
    notes.push(`${s.moved} ${s.moved === 1 ? 'copy was' : 'copies were'} moved from other decks.`)
  }
  if (s.newCopies && s.newCopies.length > 0) notes.push(`New copies added: ${names(s.newCopies)}.`)
  if (s.alertsCreated > 0) {
    notes.push(`${s.alertsCreated} ${s.alertsCreated === 1 ? 'alert was' : 'alerts were'} added to your other decks.`)
  }
  if (s.needsALook.length > 0) {
    const names = [...new Set(s.needsALook.map((n) => n.cardName))]
    notes.push(`Needs a look (saved Unsleeved): ${names.join(', ')}.`)
  }
  return notes
}

export const INTENT_SAVE_PENDING = 'Saving built and planned decks is coming soon. You can review the list now.'

/** Precon tab. */
/** URL tab: the sites the importer reads (src/lib/url-parser.ts). Keep in step with that file. */
export const URL_HELP_TITLE = 'Works with links from'
export const URL_HELP_EXAMPLES = [
  { site: 'Archidekt', example: 'archidekt.com/decks/1234567' },
  { site: 'Moxfield', example: 'moxfield.com/decks/aBc123XyZ' },
  { site: 'MTGGoldfish', example: 'mtggoldfish.com/deck/1234567' },
  { site: 'TappedOut', example: 'tappedout.net/mtg-decks/my-deck/' },
  { site: 'Deckbox', example: 'deckbox.org/sets/1234567' },
]
export const URL_HELP_NOTE = 'The deck must be public. Add https:// or leave it off.'
export const PRECONS_NOT_SET_UP = 'Precons not set up yet'
export const PRECONS_NOT_SET_UP_HINT = 'The precon list has not been loaded into your library yet. You can still import by URL, pasted text or file.'
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

/** Simplified review (owner decision 2026-10-30): Card origin and Type. */
export const SOURCE_COLUMN = 'Card origin'
export const TYPE_COLUMN = 'Type'
export const STATUS_COLUMN = 'Status'
/** Bulk bar toggles (short texts). */
export const SOURCE_LABELS = { none: 'No copy', collection: 'From collection', new: 'New copy' } as const
/** Row dropdown options: closed label plus the one-line description in the menu. */
export const ORIGIN_OPTION_TEXT = {
  none: { label: 'Unowned', description: 'Just on the list, no copy' },
  collection: { label: 'From collection', description: 'Uses a copy you own' },
  new: { label: 'New copy', description: 'Adds one to your collection' },
} as const
/** The "none" label depends on whether the card is owned at all. */
export const originNoneLabel = (anyOwned: boolean) => (anyOwned ? 'Owned, not in deck' : 'Unowned')
export const TYPE_OPTION_TEXT = {
  original: { label: 'Original', description: 'The real card' },
  proxy: { label: 'Proxy', description: 'A stand-in copy' },
} as const
export const GENERIC_ORIGIN_TEXT = { label: 'Generic land', description: 'Any basic, sleeved, not tracked' } as const
export const STATUS_OWNED = 'Owned'
export const STATUS_UNOWNED = 'Unowned'
export const STATUS_BASIC = 'Basic land'
export const SOURCE_TITLES = {
  none: 'Not in the deck: just a slot on the list.',
  collection: 'Uses a copy you own (any printing). A copy already in another deck is used too and flagged on both.',
  new: 'Adds a new copy of this printing to your collection.',
} as const
export const NO_COLLECTION_TITLE = 'None left in your collection'
export const NO_ORIGINAL_TITLE = 'No original in your collection'
export const NO_PROXY_TITLE = 'No proxy in your collection'
export const PICK_SOURCE_FIRST_TITLE = 'Choose a card origin first'
export const MAYBEBOARD_NOT_ADDED = 'Not added or sleeved'
/** Purchased decks with a non-New copy can't be saved by the old path. */
export const INTENT_SAVE_PENDING_NOT_NEW =
  'Saving cards from your collection is coming soon. Set every card to New copy to import now.'
/** Footer, amber: Import stays off until every copy from the collection has a source. */
export const NEEDS_SOURCE_BLOCKS_IMPORT = (n: number) => `${n} ${n === 1 ? 'card needs' : 'cards need'} a source.`

/** Under each choice while the deck is still loading. */
export const INTENT_NUMBERS_PENDING = 'Numbers appear once the deck has loaded'

/** Amber one-line note under the Name field when a deck with this name exists. Warns only; never blocks. */
export const DUPLICATE_NAME_NOTE = (name: string) =>
  `You already have a deck called "${name}". Importing will create a second one.`
