/**
 * Pure Commander legality check used by GET /api/decks/[id]/legality.
 * The companion is outside the deck (contract command-zone-roles §2): it is still checked as a card
 * (banned), but not for colour identity and not for the singleton/size rule.
 */
import { isCommanderRow, isCompanion } from '@/lib/command-zone'

export interface LegalityDeckCard {
  card_name: string
  quantity: number | null
  is_commander: boolean | null
  command_zone_role?: string | null
}

export interface LegalityCardData {
  commander_legal: boolean
  color_identity: string
}

export interface LegalityIssue {
  cardName: string
  reason: 'banned' | 'color_identity' | 'over_limit'
  details: string
}

const BASIC_LANDS = [
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
  'Snow-Covered Mountain', 'Snow-Covered Forest', 'Wastes',
]

const COLOUR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }

export function evaluateCommanderLegality(
  deckCards: LegalityDeckCard[],
  legalityMap: Record<string, LegalityCardData>,
  deckColourIdentity: Set<string>
): LegalityIssue[] {
  const issues: LegalityIssue[] = []

  for (const deckCard of deckCards) {
    const cardData = legalityMap[deckCard.card_name]
    if (!cardData) continue

    if (!cardData.commander_legal) {
      issues.push({
        cardName: deckCard.card_name,
        reason: 'banned',
        details: `${deckCard.card_name} is banned in Commander`,
      })
      continue
    }

    // The companion is outside the deck: no colour-identity or singleton check.
    if (isCompanion(deckCard)) continue

    // Commanders define the identity, so they are not checked against it.
    if (!isCommanderRow(deckCard) && cardData.color_identity) {
      const cardColors = new Set(
        cardData.color_identity.split(/[,\s]+/).filter((c: string) => 'WUBRG'.includes(c))
      )
      const invalidColors: string[] = []
      for (const color of cardColors) {
        if (!deckColourIdentity.has(color)) invalidColors.push(color)
      }
      if (invalidColors.length > 0) {
        const colorList = invalidColors.map((c) => COLOUR_NAMES[c] || c).join(', ')
        issues.push({
          cardName: deckCard.card_name,
          reason: 'color_identity',
          details: `Contains ${colorList} which is outside your commander's color identity`,
        })
      }
    }

    if (!BASIC_LANDS.includes(deckCard.card_name) && (deckCard.quantity ?? 0) > 1) {
      issues.push({
        cardName: deckCard.card_name,
        reason: 'over_limit',
        details: `Commander allows only 1 copy of each card (you have ${deckCard.quantity})`,
      })
    }
  }

  return issues
}
