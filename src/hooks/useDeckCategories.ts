'use client'

import { useMemo } from 'react'
import { parseCategoriesCapped } from '@/lib/categoryUtils'
import type { DeckCard } from '@/components/CardGrid'

/**
 * Derives the available category vocabulary from a deck's card list.
 * Returns a sorted, deduplicated list of all primary categories in use.
 */
export function useDeckCategories(cards: DeckCard[]): string[] {
  return useMemo(() => {
    const categories = new Set<string>()
    for (const card of cards) {
      const { primary_category } = parseCategoriesCapped(card.categories)
      const truncated = primary_category.slice(0, 16)
      if (truncated !== 'Other') {
        categories.add(truncated)
      }
    }
    // Always include 'Other' at the end as a fallback
    const sorted = Array.from(categories).sort()
    sorted.push('Other')
    return sorted
  }, [cards])
}
