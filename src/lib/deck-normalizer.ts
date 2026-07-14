// ---------------------------------------------------------------------------
// Deck Normalizer — Transforms Archidekt/Moxfield responses into a common format
// ---------------------------------------------------------------------------

import type { DeckPlatform } from '@/lib/url-parser'
import type {
  ArchidektDeckFull,
  ArchidektDeckCard,
} from '@/lib/archidekt-client'
import { isProxyLabel } from '@/lib/archidekt-client'
import type { MoxfieldDeckFull, MoxfieldCard } from '@/lib/moxfield-client'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NormalizedCard {
  cardName: string
  scryfallId: string
  oracleId: string
  setCode: string
  quantity: number
  typeLine: string
  isCommander: boolean
  isProxy: boolean
  manaCost: string | null
  colorIdentity: string[]
  /** Platform-specific categories (Archidekt user-assigned roles like "Ramp", "Removal") */
  sourceCategories: string[]
}

export interface NormalizedDeck {
  name: string
  platform: DeckPlatform
  platformDeckId: string
  sourceUrl: string
  commander: NormalizedCard | null
  cards: NormalizedCard[]
  cardCount: number
  colourIdentity: string
}

export type CardTypeGroup =
  | 'Creature'
  | 'Instant'
  | 'Sorcery'
  | 'Artifact'
  | 'Enchantment'
  | 'Land'
  | 'Planeswalker'
  | 'Battle'
  | 'Other'

export interface CardsByType {
  groups: Record<CardTypeGroup, NormalizedCard[]>
  totalCount: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WUBRG_ORDER = ['W', 'U', 'B', 'R', 'G']

/**
 * Convert a color identity array into a sorted WUBRG string.
 * Handles both WUBRG letter format (['G', 'W']) and full name format (['Green', 'White'])
 * that comes from different API sources (Archidekt uses full names).
 */
const COLOUR_NAME_TO_LETTER: Record<string, string> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
  w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
}

function toWubrgString(colors: string[]): string {
  const normalized = colors.map((c) => {
    const upper = c.toUpperCase()
    if (upper.length === 1 && WUBRG_ORDER.includes(upper)) return upper
    return COLOUR_NAME_TO_LETTER[c.toLowerCase()] ?? ''
  }).filter(Boolean)
  return WUBRG_ORDER.filter((c) => normalized.includes(c)).join('')
}

/** Categories that should be excluded from the deck card list */
const EXCLUDED_ARCHIDEKT_CATEGORIES = ['Maybeboard', 'Sideboard']

// ─── Archidekt Normalizer ────────────────────────────────────────────────────

function normalizeArchidektCard(entry: ArchidektDeckCard): NormalizedCard {
  const { card, categories, label, quantity } = entry
  const isCommander = categories.includes('Commander')
  const isProxy = isProxyLabel(label)

  return {
    cardName: card.oracleCard.name,
    scryfallId: card.uid,
    oracleId: card.oracleCard.uid,
    setCode: card.edition.editioncode,
    quantity,
    typeLine: card.oracleCard.typeLine ?? (card.oracleCard.types?.join(' ') || ''),
    isCommander,
    isProxy,
    manaCost: card.oracleCard.manaCost ?? null,
    colorIdentity: card.oracleCard.colorIdentity,
    sourceCategories: categories,
  }
}

export function normalizeArchidektDeck(
  deck: ArchidektDeckFull,
  sourceUrl: string
): NormalizedDeck {
  // Filter out excluded categories
  const includedCards = deck.cards.filter(
    (entry) =>
      !entry.categories.some((cat) =>
        EXCLUDED_ARCHIDEKT_CATEGORIES.includes(cat)
      )
  )

  const cards = includedCards.map(normalizeArchidektCard)

  const commander = cards.find((c) => c.isCommander) ?? null
  const colourIdentity = commander
    ? toWubrgString(commander.colorIdentity)
    : ''

  const cardCount = cards.reduce((sum, c) => sum + c.quantity, 0)

  return {
    name: deck.name,
    platform: 'archidekt',
    platformDeckId: String(deck.id),
    sourceUrl,
    commander,
    cards,
    cardCount,
    colourIdentity,
  }
}

// ─── Moxfield Normalizer ─────────────────────────────────────────────────────

/**
 * Derive a category from a type line for Moxfield cards.
 * Moxfield doesn't have user-assigned categories, so we use the card type.
 */
function deriveMoxfieldCategory(typeLine: string): string {
  const front = typeLine.split(' // ')[0]
  if (front.includes('Creature')) return 'Creature'
  if (front.includes('Planeswalker')) return 'Planeswalker'
  if (front.includes('Battle')) return 'Battle'
  if (front.includes('Instant')) return 'Instant'
  if (front.includes('Sorcery')) return 'Sorcery'
  if (front.includes('Artifact')) return 'Artifact'
  if (front.includes('Enchantment')) return 'Enchantment'
  if (front.includes('Land')) return 'Land'
  return 'Other'
}

function normalizeMoxfieldCard(
  entry: MoxfieldCard,
  isCommander: boolean,
  tags: string[]
): NormalizedCard | null {
  const { card, quantity } = entry

  // Resolve oracleId: use oracle_id if present, fall back to scryfall_id, or skip
  let oracleId: string
  if (card.oracle_id) {
    oracleId = card.oracle_id
  } else if (card.scryfall_id) {
    console.warn(
      `[deck-normalizer] Card "${card.name}" missing oracle_id, using scryfall_id as fallback`
    )
    oracleId = card.scryfall_id
  } else {
    console.warn(
      `[deck-normalizer] Card "${card.name}" missing both oracle_id and scryfall_id, skipping`
    )
    return null
  }

  // Determine categories: use authorTags if available, otherwise derive from type
  const sourceCategories = isCommander
    ? ['Commander']
    : tags.length > 0
      ? tags
      : [deriveMoxfieldCategory(card.type_line)]

  return {
    cardName: card.name,
    scryfallId: card.scryfall_id,
    oracleId,
    setCode: card.set,
    quantity,
    typeLine: card.type_line,
    isCommander,
    isProxy: entry.isProxy ?? false,
    manaCost: card.mana_cost || null,
    colorIdentity: card.color_identity,
    sourceCategories,
  }
}

export function normalizeMoxfieldDeck(
  deck: MoxfieldDeckFull,
  sourceUrl: string
): NormalizedDeck {
  const cards: NormalizedCard[] = []
  const authorTags = deck.authorTags ?? {}

  // Commanders board
  for (const [key, entry] of Object.entries(deck.commanders.cards)) {
    const tags = authorTags[key] ?? []
    const normalized = normalizeMoxfieldCard(entry, true, tags)
    if (normalized) cards.push(normalized)
  }

  // Mainboard
  for (const [key, entry] of Object.entries(deck.mainboard.cards)) {
    const tags = authorTags[key] ?? []
    const normalized = normalizeMoxfieldCard(entry, false, tags)
    if (normalized) cards.push(normalized)
  }

  const commander = cards.find((c) => c.isCommander) ?? null
  const colourIdentity = commander
    ? toWubrgString(commander.colorIdentity)
    : ''

  const cardCount = cards.reduce((sum, c) => sum + c.quantity, 0)

  return {
    name: deck.name,
    platform: 'moxfield',
    platformDeckId: deck.publicId,
    sourceUrl,
    commander,
    cards,
    cardCount,
    colourIdentity,
  }
}

// ─── Card Type Grouping ──────────────────────────────────────────────────────

const TYPE_PRIORITY: CardTypeGroup[] = [
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment',
  'Land',
]

/**
 * Classify a card into a type group based on its typeLine.
 * Uses priority order so "Artifact Creature" becomes "Creature".
 * For DFCs, only the front face (before " // ") is considered.
 */
function classifyCard(typeLine: string): CardTypeGroup {
  // For DFCs, only consider the front face
  const frontFace = typeLine.split(' // ')[0]

  for (const type of TYPE_PRIORITY) {
    if (frontFace.includes(type)) {
      return type
    }
  }

  return 'Other'
}

/**
 * Group normalized cards by their primary type line.
 */
export function groupCardsByType(cards: NormalizedCard[]): CardsByType {
  const groups: Record<CardTypeGroup, NormalizedCard[]> = {
    Creature: [],
    Instant: [],
    Sorcery: [],
    Artifact: [],
    Enchantment: [],
    Land: [],
    Planeswalker: [],
    Battle: [],
    Other: [],
  }

  for (const card of cards) {
    const group = classifyCard(card.typeLine)
    groups[group].push(card)
  }

  const totalCount = cards.reduce((sum, c) => sum + c.quantity, 0)

  return { groups, totalCount }
}
