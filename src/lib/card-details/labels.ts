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
