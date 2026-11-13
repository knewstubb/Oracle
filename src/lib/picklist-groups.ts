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

export interface NeedsMovingGroup {
  deckName: string
  deckStatus: string
  items: Array<{ card: PicklistCard; candidate: RankedCandidate }>
}

export interface UnownedItem {
  card: PicklistCard
}

export function categorizeCards(cards: PicklistCard[], currentDeckId: number) {
  const available: AvailableGroup[] = []
  const needsMoving: NeedsMovingGroup[] = []
  const unowned: UnownedItem[] = []

  const availableMap = new Map<string, AvailableGroup>()
  const needsMovingMap = new Map<string, NeedsMovingGroup>()
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
      const location = freeCandidate.entry.locationName || 'Unsorted'
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
    const otherDeckCandidate = candidates.find(c => c.entry.assignedTo)
    if (otherDeckCandidate && !seen.has(card.deckCardsId)) {
      const assignment = otherDeckCandidate.entry.assignedTo!
      const key = String(assignment.deckId)
      if (!needsMovingMap.has(key)) {
        const group: NeedsMovingGroup = { deckName: assignment.deckName, deckStatus: assignment.deckStatus ?? '', items: [] }
        needsMovingMap.set(key, group)
        needsMoving.push(group)
      }
      needsMovingMap.get(key)!.items.push({ card, candidate: otherDeckCandidate })
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

  for (const group of needsMoving) {
    group.items.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))
  }
  needsMoving.sort((a, b) => a.deckName.localeCompare(b.deckName))

  unowned.sort((a, b) => a.card.cardName.localeCompare(b.card.cardName))

  return { available, needsMoving, unowned }
}
