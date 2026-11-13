/**
 * Picklist grouping: which of a deck's planned cards can be placed from a box, which need moving from another
 * deck, and which are not owned. Pure (no database). Used by the deck's Picklist screen.
 *
 * Moved out of PicklistV2 unchanged so that tests can pin today's behaviour before the screen is renamed.
 */
import type { RankedCandidate } from '@/lib/allocation-candidates'
import type { DeckCardLifecycle, CardSlotStatus } from '@/lib/card-status'

export interface PicklistCard {
  deckCardsId: number
  cardName: string
  lifecycle: DeckCardLifecycle
  allocationStatus: CardSlotStatus | null
  copyId: number | null
  isResolved: boolean
  // Compatibility fields retained for existing allocation controls.
  physicalCopyId: number | null
  ownershipStatus: string | null
  candidates: RankedCandidate[]
}

export interface AvailableGroup {
  location: string
  items: Array<{ card: PicklistCard; candidate: RankedCandidate }>
}

export interface ClaimedGroup {
  deckName: string
  deckStatus: string
  items: Array<{ card: PicklistCard; candidate: RankedCandidate }>
}

export interface UnownedItem {
  card: PicklistCard
}

export function categorizeCards(cards: PicklistCard[], currentDeckId: number) {
  const available: AvailableGroup[] = []
  const claimed: ClaimedGroup[] = []
  const unowned: UnownedItem[] = []

  const availableMap = new Map<string, AvailableGroup>()
  const claimedMap = new Map<string, ClaimedGroup>()
  const seen = new Set<number>() // track which deckCardsIds we've already placed

  for (const card of cards) {
    if (card.lifecycle === 'sleeved' || card.isResolved) continue

    // Filter out candidates assigned to the current deck (self-reference)
    const candidates = card.candidates.filter(c => !c.entry.assignedTo || c.entry.assignedTo.deckId !== currentDeckId)
    if (candidates.length === 0 || candidates[0].tier === 5) {
      // Unowned — no copies exist
      unowned.push({ card })
      continue
    }

    // Check for available (free in storage) candidates first
    const freeCandidate = candidates.find(c => !c.entry.assignedTo)
    if (freeCandidate && !seen.has(card.deckCardsId)) {
      // Today's behaviour, kept on purpose in this step: the screen reads `storageLocationName`, which the candidates
      // do not carry (they carry `locationName`), so every free copy lands under "Unsorted". Fixed in the regroup step.
      const location = (freeCandidate.entry as unknown as { storageLocationName?: string }).storageLocationName || 'Unsorted'
      if (!availableMap.has(location)) {
        const group: AvailableGroup = { location, items: [] }
        availableMap.set(location, group)
        available.push(group)
      }
      availableMap.get(location)!.items.push({ card, candidate: freeCandidate })
      seen.add(card.deckCardsId)
      continue
    }

    // Otherwise check for claimed (in another deck) candidates
    const claimedCandidate = candidates.find(c => c.entry.assignedTo)
    if (claimedCandidate && !seen.has(card.deckCardsId)) {
      const assignment = claimedCandidate.entry.assignedTo!
      const key = String(assignment.deckId)
      if (!claimedMap.has(key)) {
        const group: ClaimedGroup = { deckName: assignment.deckName, deckStatus: assignment.deckStatus ?? '', items: [] }
        claimedMap.set(key, group)
        claimed.push(group)
      }
      claimedMap.get(key)!.items.push({ card, candidate: claimedCandidate })
      seen.add(card.deckCardsId)
      continue
    }

    // Fallback: unowned
    if (!seen.has(card.deckCardsId)) {
      unowned.push({ card })
      seen.add(card.deckCardsId)
    }
  }

  // Sort: items alphabetically within each group, groups alphabetically by location/deck name
  for (const group of available) {
    group.items.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))
  }
  available.sort((a, b) => a.location.localeCompare(b.location))

  for (const group of claimed) {
    group.items.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))
  }
  claimed.sort((a, b) => a.deckName.localeCompare(b.deckName))

  unowned.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))

  return { available, claimed, unowned }
}
