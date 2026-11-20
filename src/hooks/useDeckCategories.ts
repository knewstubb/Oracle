'use client'

import { useMemo } from 'react'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import type { DeckCard } from '@/components/CardGrid'

/**
 * Derives the available category vocabulary from a deck's card list.
 * Returns a sorted, deduplicated list of every category in use (first or not), whole.
 */
export function useDeckCategories(cards: DeckCard[]): string[] {
  return useMemo(() => {
    const categories = new Set<string>()
    for (const card of cards) {
      const { primary_category, additional_categories } = parseCategoriesCapped(card.categories)
      for (const name of [primary_category, ...additional_categories]) {
        if (name !== 'Other') categories.add(name)
      }
    }
    // Always include 'Other' at the end as a fallback
    const sorted = Array.from(categories).sort()
    sorted.push('Other')
    return sorted
  }, [cards])
}
