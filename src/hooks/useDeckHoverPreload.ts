'use client'

import { useEffect } from 'react'
import {
  buildPreloadList,
  runPreload,
  shouldSkipPreload,
  type PreloadableCard,
} from '@/lib/deck-hover-preload'

/** URLs already fetched this session (shared across decks; the browser cache holds the bytes). */
const preloadedUrls = new Set<string>()
/** Keeps Image objects alive until they finish so loads are not dropped mid-flight. */
const inFlight = new Set<HTMLImageElement>()

const START_DELAY_MS = 1500

function loadImage(url: string, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled()) return reject(new Error('cancelled'))
    const img = new Image()
    inFlight.add(img)
    // Hint to the browser that this is background work.
    ;(img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low'
    img.decoding = 'async'
    const done = () => {
      inFlight.delete(img)
    }
    img.onload = () => {
      done()
      resolve()
    }
    img.onerror = () => {
      done()
      reject(new Error('load failed'))
    }
    img.src = url
  })
}

/**
 * Once a deck's cards are loaded and the page is idle, quietly fetch the hover-preview image of
 * every distinct card (at most 4 at a time) so the first hover is instant. Stops on unmount or
 * when the deck changes. Skipped on data-saver, slow connections and touch-only devices.
 */
export function useDeckHoverPreload(
  deckId: string | number | undefined,
  cards: readonly PreloadableCard[] | undefined,
): void {
  const hasCards = !!cards && cards.length > 0

  useEffect(() => {
    if (!deckId || !hasCards || !cards) return
    const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    const canHover =
      typeof window.matchMedia === 'function' ? window.matchMedia('(hover: hover)').matches : true
    if (shouldSkipPreload({ connection: nav.connection, canHover })) return

    let cancelled = false
    const isCancelled = () => cancelled
    let timer: ReturnType<typeof setTimeout> | undefined
    let idleHandle: number | undefined

    const start = () => {
      if (cancelled) return
      const items = buildPreloadList(cards, preloadedUrls)
      void runPreload(items, {
        loadImage: (url) => loadImage(url, isCancelled),
        isCancelled,
        onLoaded: (key) => preloadedUrls.add(key),
      })
    }

    // Wait until the page has settled, then until the browser is idle.
    timer = setTimeout(() => {
      timer = undefined
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(start, { timeout: 5000 })
      } else {
        start()
      }
    }, START_DELAY_MS)

    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }
    }
    // Re-run when the deck or its set of cards changes, not on every array identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, hasCards, cards?.length])
}
