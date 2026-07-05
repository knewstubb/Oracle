// ---------------------------------------------------------------------------
// Brew Mode — Validation Utilities
// ---------------------------------------------------------------------------

import type { StrategyBrief, DeckSkeleton } from '@/types/brew'

// ---------------------------------------------------------------------------
// Commander Format Ban List (as of 2026)
// ---------------------------------------------------------------------------

const COMMANDER_BAN_LIST: readonly string[] = [
  'Adriana\'s Valor',
  'Advantageous Proclamation',
  'Amulet of Quoz',
  'Ancestral Recall',
  'Assemble the Rank and Vile',
  'Backup Plan',
  'Balance',
  'Black Lotus',
  'Brago\'s Favor',
  'Bronze Tablet',
  'Channel',
  'Chaos Orb',
  'Cleanse',
  'Contract from Below',
  'Crusade',
  'Darkpact',
  'Demonic Attorney',
  'Dockside Extortionist',
  'Double Stroke',
  'Echoing Boon',
  'Emissary\'s Ploy',
  'Emrakul, the Aeons Torn',
  'Erayo, Soratami Ascendant // Erayo\'s Essence',
  'Falling Star',
  'Fastbond',
  'Flash',
  'Golos, Tireless Pilgrim',
  'Griselbrand',
  'Hired Heist',
  'Hold the Perimeter',
  'Hullbreacher',
  'Hymn of the Wilds',
  'Immediate Action',
  'Imprison',
  'Incendiary Dissent',
  'Invoke Prejudice',
  'Iona, Shield of Emeria',
  'Iterative Analysis',
  'Jeweled Bird',
  'Jeweled Lotus',
  'Jihad',
  'Karakas',
  'Leovold, Emissary of Trest',
  'Library of Alexandria',
  'Limited Resources',
  'Mana Crypt',
  'Mox Emerald',
  'Mox Jet',
  'Mox Pearl',
  'Mox Ruby',
  'Mox Sapphire',
  'Muzzio\'s Preparations',
  'Nadu, Winged Wisdom',
  'Natural Unity',
  'Paradox Engine',
  'Power Play',
  'Pradesh Gypsies',
  'Primeval Titan',
  'Prophet of Kruphix',
  'Rebirth',
  'Recurring Nightmare',
  'Rofellos, Llanowar Emissary',
  'Secret Summoning',
  'Secrets of Paradise',
  'Sentinel Dispatch',
  'Shahrazad',
  'Sovereign\'s Realm',
  'Stone-Throwing Devils',
  'Summoner\'s Bond',
  'Sundering Titan',
  'Sylvan Primordial',
  'Tempest Efreet',
  'Time Vault',
  'Time Walk',
  'Timmerian Fiends',
  'Tinker',
  'Tolarian Academy',
  'Trade Secrets',
  'Unexpected Potential',
  'Upheaval',
  'Weight Advantage',
  'Worldknit',
  'Yawgmoth\'s Bargain',
] as const

/** Set for O(1) lookup — stores lowercase names for case-insensitive matching */
const BAN_SET = new Set(COMMANDER_BAN_LIST.map(name => name.toLowerCase()))

// ---------------------------------------------------------------------------
// Valid colour identity letters
// ---------------------------------------------------------------------------

const VALID_COLOURS = new Set(['W', 'U', 'B', 'R', 'G'])

// ---------------------------------------------------------------------------
// validateStrategyBrief
// ---------------------------------------------------------------------------

/**
 * Validates an unknown JSON value as a StrategyBrief.
 * Returns the narrowed StrategyBrief if valid, or null if validation fails.
 */
export function validateStrategyBrief(json: unknown): StrategyBrief | null {
  if (json === null || json === undefined || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>

  // Check commanderName is a non-empty string
  if (typeof obj.commanderName !== 'string' || obj.commanderName.trim() === '') {
    return null
  }

  // Check colourIdentity is a non-empty array of valid colour letters
  if (!Array.isArray(obj.colourIdentity) || obj.colourIdentity.length === 0) {
    return null
  }
  for (const colour of obj.colourIdentity) {
    if (typeof colour !== 'string' || !VALID_COLOURS.has(colour.toUpperCase())) {
      return null
    }
  }

  // Check primaryWinCondition is a non-empty string
  if (typeof obj.primaryWinCondition !== 'string' || obj.primaryWinCondition.trim() === '') {
    return null
  }

  // Check secondaryWinCondition is a non-empty string
  if (typeof obj.secondaryWinCondition !== 'string' || obj.secondaryWinCondition.trim() === '') {
    return null
  }

  // Check targetBracket is 1, 2, 3, or 4
  if (typeof obj.targetBracket !== 'number' || ![1, 2, 3, 4].includes(obj.targetBracket)) {
    return null
  }

  // Check knownIncludes is an array of strings
  if (!Array.isArray(obj.knownIncludes)) {
    return null
  }
  for (const item of obj.knownIncludes) {
    if (typeof item !== 'string') {
      return null
    }
  }

  // Check playstyleDescription is a non-empty string
  if (typeof obj.playstyleDescription !== 'string' || obj.playstyleDescription.trim() === '') {
    return null
  }

  // Check budgetPreference is one of the valid values
  if (
    typeof obj.budgetPreference !== 'string' ||
    !['collection', 'budget', 'unrestricted'].includes(obj.budgetPreference)
  ) {
    return null
  }

  // Check optional budgetCeiling — if present, must be a positive number
  if (obj.budgetCeiling !== undefined && obj.budgetCeiling !== null) {
    if (typeof obj.budgetCeiling !== 'number' || obj.budgetCeiling <= 0) {
      return null
    }
  }

  // Normalise colourIdentity to uppercase
  const colourIdentity = (obj.colourIdentity as string[]).map(c => c.toUpperCase())

  return {
    commanderName: obj.commanderName as string,
    colourIdentity,
    primaryWinCondition: obj.primaryWinCondition as string,
    secondaryWinCondition: obj.secondaryWinCondition as string,
    targetBracket: obj.targetBracket as 1 | 2 | 3 | 4,
    knownIncludes: obj.knownIncludes as string[],
    playstyleDescription: obj.playstyleDescription as string,
    budgetPreference: obj.budgetPreference as 'collection' | 'budget' | 'unrestricted',
    ...(obj.budgetCeiling !== undefined && obj.budgetCeiling !== null
      ? { budgetCeiling: obj.budgetCeiling as number }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// validateSkeleton
// ---------------------------------------------------------------------------

/**
 * Validates an unknown JSON value as a DeckSkeleton.
 * Verifies total card count = 100 and category grouping integrity.
 * Returns the narrowed DeckSkeleton if valid, or null if validation fails.
 */
export function validateSkeleton(json: unknown): DeckSkeleton | null {
  if (json === null || json === undefined || typeof json !== 'object') {
    return null
  }

  const obj = json as Record<string, unknown>

  // Check commanderName is a non-empty string
  if (typeof obj.commanderName !== 'string' || obj.commanderName.trim() === '') {
    return null
  }

  // Check colourIdentity is a non-empty array of valid colour letters
  if (!Array.isArray(obj.colourIdentity) || obj.colourIdentity.length === 0) {
    return null
  }
  for (const colour of obj.colourIdentity) {
    if (typeof colour !== 'string' || !VALID_COLOURS.has(colour.toUpperCase())) {
      return null
    }
  }

  // Check totalCards is 100
  if (typeof obj.totalCards !== 'number' || obj.totalCards !== 100) {
    return null
  }

  // Check categories is a non-empty array
  if (!Array.isArray(obj.categories) || obj.categories.length === 0) {
    return null
  }

  // Validate each category group
  let cardSum = 0
  for (const category of obj.categories) {
    if (category === null || typeof category !== 'object') {
      return null
    }

    const cat = category as Record<string, unknown>

    // Each category must have a non-empty name
    if (typeof cat.name !== 'string' || cat.name.trim() === '') {
      return null
    }

    // Each category must have a non-empty cards array
    if (!Array.isArray(cat.cards) || cat.cards.length === 0) {
      return null
    }

    // Validate each card entry
    for (const card of cat.cards) {
      if (card === null || typeof card !== 'object') {
        return null
      }

      const cardObj = card as Record<string, unknown>

      if (typeof cardObj.cardName !== 'string' || cardObj.cardName.trim() === '') {
        return null
      }

      if (
        typeof cardObj.ownershipStatus !== 'string' ||
        !['owned', 'proxy_candidate', 'not_owned'].includes(cardObj.ownershipStatus)
      ) {
        return null
      }

      if (cardObj.price !== null && typeof cardObj.price !== 'number') {
        return null
      }

      if (typeof cardObj.overBudget !== 'boolean') {
        return null
      }

      if (typeof cardObj.accepted !== 'boolean') {
        return null
      }
    }

    cardSum += (cat.cards as unknown[]).length
  }

  // Total cards across all categories must equal 100
  if (cardSum !== 100) {
    return null
  }

  return json as unknown as DeckSkeleton
}

// ---------------------------------------------------------------------------
// isWithinColourIdentity
// ---------------------------------------------------------------------------

/**
 * Checks that a card's colour identity is a subset of the commander's colour identity.
 * Colorless cards (empty cardCI) are always within any identity.
 * Comparison is case-insensitive.
 */
export function isWithinColourIdentity(cardCI: string[], commanderCI: string[]): boolean {
  // Colorless cards are always legal
  if (cardCI.length === 0) {
    return true
  }

  const commanderSet = new Set(commanderCI.map(c => c.toUpperCase()))

  return cardCI.every(colour => commanderSet.has(colour.toUpperCase()))
}

// ---------------------------------------------------------------------------
// isCommanderLegal
// ---------------------------------------------------------------------------

/**
 * Checks if a card is legal in Commander format.
 * Returns true if the card is NOT on the ban list.
 * Case-insensitive comparison.
 */
export function isCommanderLegal(cardName: string): boolean {
  return !BAN_SET.has(cardName.toLowerCase())
}
