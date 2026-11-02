/**
 * Which commander actions a deck card may be offered, and what to save when one is chosen.
 * Pure: the card data checks (legal commander, valid partner/background, Companion keyword) come in as
 * the sets the existing eligible-commanders route returned, so nothing here reads card text itself.
 * Saving goes through the existing command-zone route (PUT /api/decks/[id]/command-zone).
 */
import { findCommanderCards } from '@/lib/commander-card-flag'
import { isCompanion } from '@/lib/command-zone'
import type { SecondSlotKind } from '@/lib/commander-pairing'

export interface ActionCard {
  id: number
  card_name: string
  quantity?: number
  categories?: string | null
  is_commander?: boolean | number | null
  command_zone_role?: string | null
}

export type CardCommanderAction =
  | { kind: 'remove-commander' }
  | { kind: 'add-commander'; as: 'commander' | 'partner' | 'background' }
  | { kind: 'add-companion' }

export const ACTION_LABEL = {
  'remove-commander': 'Remove as commander',
  commander: 'Add as commander',
  partner: 'Add as partner',
  background: 'Add as background',
  companion: 'Add as companion',
} as const

export function actionLabel(a: CardCommanderAction): string {
  if (a.kind === 'remove-commander') return ACTION_LABEL['remove-commander']
  if (a.kind === 'add-companion') return ACTION_LABEL.companion
  return ACTION_LABEL[a.as]
}

/** What the server said about the deck's cards (names are card names). */
export interface CommanderEligibility {
  /** Names that could be the first commander right now (legal, not a Background; deck colours are ignored). */
  lead: ReadonlySet<string>
  /** Names that could be the other commander next to the current one (valid pair). */
  second: ReadonlySet<string>
  /** Names with the Companion ability. */
  companion: ReadonlySet<string>
  /** The slot kind the current commander allows (null = none); decides "partner" vs "background" wording. */
  secondKind: SecondSlotKind | null
}

function primaryCategory(categories: string | null | undefined): string | null {
  try {
    const parsed = JSON.parse(categories ?? '[]')
    if (Array.isArray(parsed)) return typeof parsed[0] === 'string' ? parsed[0] : null
    if (parsed && typeof parsed === 'object' && typeof parsed.primary_category === 'string') return parsed.primary_category
  } catch {
    // Plain-text categories ("Creature") are tolerated.
    return categories ?? null
  }
  return null
}

/** On the main list: not Maybeboard, not Sideboard (so not a companion either). These are the cards counted in the 100. */
export function isMainListCard(card: ActionCard): boolean {
  const primary = primaryCategory(card.categories)
  return primary !== 'Maybeboard' && primary !== 'Sideboard' && !isCompanion(card)
}

export function mainListCount(cards: ActionCard[]): number {
  return cards.filter(isMainListCard).reduce((sum, c) => sum + (c.quantity || 1), 0)
}

/** Commanders as equals (the flagged cards plus the deck's named commander), never the companion. */
export function currentCommanders<T extends ActionCard>(cards: T[], commanderName: string | null | undefined): T[] {
  const found = findCommanderCards(cards.filter(isMainListCard), commanderName)
  // A Background always goes in the second saved slot, whichever order the rows came in.
  return [...found].sort((a, b) => Number(a.command_zone_role === 'background') - Number(b.command_zone_role === 'background'))
}

/** The first commander is needed (nothing set yet), or the deck could still take another. */
export function commanderSlotState(commanders: ActionCard[]): 'none' | 'one' | 'full' {
  return commanders.length === 0 ? 'none' : commanders.length === 1 ? 'one' : 'full'
}

/**
 * Does making this card the companion keep the deck at its size? A companion is saved outside the 100, so moving a card
 * out of a full deck would leave 99. Offered when the deck would still be at or over its target afterwards, or when it
 * is already under target (a deck still being built is not newly broken).
 */
export function companionKeepsCount(card: ActionCard, cards: ActionCard[], target: number | null | undefined): boolean {
  if (!target) return true
  const count = mainListCount(cards)
  if (count < target) return true
  return count - (card.quantity || 1) >= target
}

/** The actions this card may be offered. Never lists one that would be invalid. */
export function offeredActions(
  card: ActionCard,
  cards: ActionCard[],
  commanderName: string | null | undefined,
  eligibility: CommanderEligibility | null,
  target: number | null | undefined
): CardCommanderAction[] {
  const out: CardCommanderAction[] = []
  if (isCompanion(card)) return out
  const commanders = currentCommanders(cards, commanderName)
  if (commanders.some((c) => c.id === card.id)) return [{ kind: 'remove-commander' }]
  if (!eligibility || !isMainListCard(card)) return out

  const state = commanderSlotState(commanders)
  if (state === 'none' && eligibility.lead.has(card.card_name)) {
    out.push({ kind: 'add-commander', as: 'commander' })
  } else if (state === 'one' && eligibility.second.has(card.card_name)) {
    out.push({ kind: 'add-commander', as: eligibility.secondKind === 'background' ? 'background' : 'partner' })
  }
  const hasCompanion = cards.some((c) => isCompanion(c))
  if (!hasCompanion && eligibility.companion.has(card.card_name) && companionKeepsCount(card, cards, target)) {
    out.push({ kind: 'add-companion' })
  }
  return out
}

/** The companion slot shows only when a companion is set or the deck has a card with the Companion ability. */
export function companionSlotVisible(cards: ActionCard[], companionNames: ReadonlySet<string> | null): boolean {
  if (cards.some((c) => isCompanion(c))) return true
  if (!companionNames) return false
  return cards.some((c) => isMainListCard(c) && companionNames.has(c.card_name))
}

export interface CommandZoneBody {
  primaryCardId: number | null
  secondCardId: number | null
  companionCardId: number | null
}

/**
 * Body for PUT /api/decks/[id]/command-zone after the action. Commanders are equals, so removing one promotes the
 * other to the saved commander slot (the route rewrites the deck's commander name and colours from the result).
 * The companion is always carried through unchanged.
 */
export function planCommandZoneBody(
  cards: ActionCard[],
  commanderName: string | null | undefined,
  action: CardCommanderAction,
  cardId: number
): CommandZoneBody | null {
  const commanders = currentCommanders(cards, commanderName)
  const companion = cards.find((c) => isCompanion(c))
  const companionCardId = companion?.id ?? null
  if (action.kind === 'remove-commander') {
    const rest = commanders.filter((c) => c.id !== cardId)
    if (rest.length === commanders.length) return null
    // A Background cannot lead on its own, so if only a Background is left it goes back to being an ordinary card.
    const left = rest[0]?.command_zone_role === 'background' ? undefined : rest[0]
    return { primaryCardId: left?.id ?? null, secondCardId: null, companionCardId }
  }
  if (action.kind === 'add-companion') {
    return {
      primaryCardId: commanders[0]?.id ?? null,
      secondCardId: commanders[1]?.id ?? null,
      companionCardId: cardId,
    }
  }
  if (commanders.length === 0) return { primaryCardId: cardId, secondCardId: null, companionCardId }
  if (commanders.length === 1) return { primaryCardId: commanders[0].id, secondCardId: cardId, companionCardId }
  return null
}

/** Cards as the deck page holds them; the extra fields are only read for the commander art. */
type LocalCard = ActionCard & { scryfall_id?: string | null }

export interface LocalCommandZone<T extends LocalCard> {
  cards: T[]
  /** What the deck's commander name becomes (the first commander, or null). */
  commanderName: string | null
  commanderScryfallId: string | null
}

/**
 * What the deck looks like once the save has gone through, so the screen can change before the server answers.
 * Mirrors set_deck_command_zone: every commander / partner / background goes back to an ordinary card, then the new
 * roles are set, and a companion is moved to the Sideboard (outside the 100). Nothing is added or removed.
 * `secondRole` is the role the other commander is saved with.
 */
export function applyCommandZoneLocally<T extends LocalCard>(
  cards: T[],
  body: CommandZoneBody,
  secondRole?: 'partner' | 'background'
): LocalCommandZone<T> {
  const next = cards.map((c) => {
    let card: T = c
    if (c.is_commander || c.command_zone_role === 'partner' || c.command_zone_role === 'background') {
      card = { ...c, is_commander: false, command_zone_role: null }
    }
    if (c.id === body.primaryCardId) card = { ...card, is_commander: true, command_zone_role: null }
    else if (c.id === body.secondCardId) {
      // A second commander that was already one keeps its role unless the action names one.
      const kept = c.command_zone_role === 'background' ? 'background' : 'partner'
      card = { ...card, is_commander: true, command_zone_role: secondRole ?? kept }
    }
    else if (c.id === body.companionCardId) {
      card = { ...card, is_commander: false, command_zone_role: 'companion', categories: '["Sideboard"]' }
    }
    return card
  })
  const primary = next.find((c) => c.id === body.primaryCardId)
  return {
    cards: next,
    commanderName: primary?.card_name ?? null,
    commanderScryfallId: (primary as LocalCard | undefined)?.scryfall_id ?? null,
  }
}

/** The role a chosen "add" action saves the other commander with; null when the action does not add one (keep the existing role). */
export function secondRoleForAction(action: CardCommanderAction): 'partner' | 'background' | undefined {
  if (action.kind !== 'add-commander') return undefined
  return action.as === 'background' ? 'background' : 'partner'
}
