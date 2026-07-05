'use client'

import { useMemo } from 'react'
import type { DeckCard } from '@/lib/brew-v2-types'

/** Ordered bucket labels for rendering left-to-right */
export const BUCKET_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+', 'X'] as const

export type BucketLabel = (typeof BUCKET_ORDER)[number]

export type CurveBuckets = Record<BucketLabel, DeckCard[]>

function isLand(card: DeckCard): boolean {
  return /\bLand\b/i.test(card.type_line)
}

function isXCost(card: DeckCard): boolean {
  return card.oracle_text ? card.oracle_text.includes('{X}') : false
}

function getBucket(card: DeckCard): BucketLabel {
  if (isXCost(card)) return 'X'
  if (card.cmc >= 7) return '7+'
  return String(Math.max(0, Math.floor(card.cmc))) as BucketLabel
}

export function useCurveBuckets(cards: DeckCard[]): CurveBuckets {
  return useMemo(() => {
    const buckets: CurveBuckets = {
      '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7+': [], 'X': [],
    }

    for (const card of cards) {
      if (isLand(card)) continue
      const bucket = getBucket(card)
      buckets[bucket].push(card)
    }

    // Sort each bucket alphabetically by card name
    for (const key of BUCKET_ORDER) {
      buckets[key].sort((a, b) => a.card_name.localeCompare(b.card_name))
    }

    return buckets
  }, [cards])
}
