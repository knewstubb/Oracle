// ---------------------------------------------------------------------------
// Brew Mode V2 — Archidekt Category Mapping
// ---------------------------------------------------------------------------
// Requirement 8.4: Push to Archidekt maps primary_category first, then additional
// Requirement 8.5: Import from Archidekt maps first to primary, rest to additional
// ---------------------------------------------------------------------------

import type { DeckCard } from './brew-v2-types'

/**
 * Export a DeckCard's categories to Archidekt's flat category array.
 * Primary category is always the first element, followed by additional categories.
 */
export function toArchidektCategories(card: DeckCard): string[] {
  return [card.primary_category, ...card.additional_categories]
}

/**
 * Import an Archidekt flat category array into the primary + additional model.
 * The first element becomes the primary category; remaining become additional.
 * If the array is empty, primary defaults to 'Uncategorized'.
 */
export function fromArchidektCategories(categories: string[]): {
  primary: string
  additional: string[]
} {
  const [primary, ...additional] = categories
  return { primary: primary ?? 'Uncategorized', additional }
}
