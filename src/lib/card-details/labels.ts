/**
 * Every owner-visible word in the card details modal, in one place (plan item 7).
 * Words follow docs/oracle/specs/vocabulary.md and the allocation terminology convention:
 * states Planned / In deck / Open / Original / Proxy / Claimed / Unowned; actions Sleeve / Release / Reassign.
 * To rename a word, change it here only.
 */
export const CARD_DETAILS_LABELS = {
  // Slot state (rail badge)
  planned: 'Planned',
  inDeck: 'In deck',
  // Copy state (Copies tab)
  open: 'Open',
  original: 'Original',
  proxy: 'Proxy',
  claimed: 'Claimed',
  unowned: 'Unowned',
  missing: 'Missing',
  inThisDeck: 'In this deck',
  // Actions
  sleeveHere: 'Sleeve here',
  moveHere: 'Move here',
  /** Spec said "Swap in"; the convention has no "swap", so it is Sleeve here with a line under it. */
  swapIn: 'Sleeve here',
  swapInNote: 'replaces the copy now in this slot',
  // Empty and quiet lines
  noTags: 'No Tags for this card yet.',
  noRulings: 'No rulings for this card.',
  tagsHeading: 'Tags',
  // Modal chrome and notes
  removeFromDeck: 'Remove from deck',
  printingFollowsCopy: 'This slot has a copy in it, so its printing follows that copy. To use another printing, sleeve a different copy from the Copies tab.',
  printingFootnote: "Picking a printing you own doesn't sleeve it. Do that from Copies.",
  slotPlannedNote: 'This slot has no copy yet. Sleeve an Open one, or move one from another deck.',
  planHint: 'Sleeve a copy in the Copies tab',
  rulingsFootnote: "Rulings belong to the card, so they're the same in every printing and every view.",
  // Collection context (slice 2)
  youOwn: (n: number) => (n > 0 ? `You own ${n}` : "You don't own it"),
  whereYourCopiesAre: 'Where your copies are',
  decksWaiting: 'Decks waiting for it',
  plannedNotSleeved: 'Planned, not sleeved',
  noCopiesYet: 'None of your copies yet.',
  noDecksWaiting: 'No deck is waiting for this card.',
  sleeveFreeCopy: 'Sleeve free copy',
  addProxy: 'Add proxy',
  addAProxy: 'Add a proxy',
  addToDeck: 'Add to a deck',
  /** The app has no "Release" word in its screens today; the menu keeps the spec's "Unassign". Change here only. */
  unassign: 'Unassign',
  moveToDeck: 'Move to a deck',
  deleteCopy: 'Delete',
  replaceWithOriginal: 'Replace with original',
  noOpenOriginal: 'No Open original copy to replace it with.',
  unassigned: 'Unassigned',
  storedInHint: 'Unassign it to change where it is stored',
  copiesFootnote: 'Condition and storage save as you change them. More actions: move to a deck, unassign, delete.',
  moveFootnote: 'Moving a copy out of a Playable deck leaves that slot Planned, so the deck drops to Assembling.',
} as const

export type CopyState = 'in_this_deck' | 'open' | 'claimed' | 'proxy_elsewhere' | 'missing'

/** "In Auntie Ool · Playable" (spec said "Sleeved · Playable deck"). */
export function inDeckLabel(deckName: string, deckStateLabel: string | null): string {
  return deckStateLabel ? `In ${deckName} · ${deckStateLabel}` : `In ${deckName}`
}

export function deckStateLabel(state: 'brewing' | 'assembling' | 'playable'): string {
  return state === 'playable' ? 'Playable' : state === 'assembling' ? 'Assembling' : 'Brewing'
}

/** Stored condition words and the short words the owner sees. One two-way map; unknown values pass through. */
export const CONDITION_OPTIONS = [
  { stored: 'near_mint', label: 'NM' },
  { stored: 'lightly_played', label: 'LP' },
  { stored: 'moderately_played', label: 'MP' },
  { stored: 'heavily_played', label: 'HP' },
  { stored: 'damaged', label: 'DMG' },
] as const
export function conditionLabel(stored: string | null | undefined): string {
  if (!stored) return '–'
  return CONDITION_OPTIONS.find((o) => o.stored === stored)?.label ?? stored
}
export function conditionStored(label: string): string {
  return CONDITION_OPTIONS.find((o) => o.label === label)?.stored ?? label
}
