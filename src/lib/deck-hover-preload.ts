/**
 * Pure logic for preloading a deck's hover-preview images. No DOM access except where a
 * `loadImage` function is injected, so everything here is unit-tested directly.
 */
import { previewImageSources } from '@/lib/card-preview-image'
import { getBasicLandDefaultScryfallId } from '@/lib/basic-lands'

export interface PreloadableCard {
  card_name: string
  scryfall_id?: string | null
}

export interface PreloadItem {
  /** Dedupe key (the URL itself: same URL = same browser cache entry). */
  key: string
  /** First-choice hover URL, identical to what the hover popover requests first. */
  url: string
}

/**
 * One item per distinct first-choice image URL, in deck order.
 * Basic lands without a printing use the default-art id (same as the grouped land rows);
 * cards without any id use the name-based source. Already-preloaded keys are skipped.
 */
export function buildPreloadList(
  cards: readonly PreloadableCard[],
  alreadyPreloaded: ReadonlySet<string> = new Set(),
): PreloadItem[] {
  const seen = new Set<string>()
  const items: PreloadItem[] = []
  for (const card of cards) {
    const name = card.card_name?.trim()
    if (!name) continue
    const id = card.scryfall_id?.trim() || getBasicLandDefaultScryfallId(name)
    const url = previewImageSources(id, name)[0]
    if (!url || seen.has(url) || alreadyPreloaded.has(url)) continue
    seen.add(url)
    items.push({ key: url, url })
  }
  return items
}

/** Split a list into consecutive batches of at most `size`. */
export function chunk<T>(list: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size))
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

interface ConnectionLike {
  saveData?: boolean
  effectiveType?: string
}

/** Preloading is skipped on data-saver / very slow connections and on touch-only (no hover) devices. */
export function shouldSkipPreload(env: {
  connection?: ConnectionLike | null
  canHover: boolean
}): boolean {
  if (!env.canHover) return true
  const c = env.connection
  if (c?.saveData) return true
  if (c?.effectiveType === 'slow-2g' || c?.effectiveType === '2g') return true
  return false
}

export interface RunPreloadOptions {
  loadImage: (url: string) => Promise<void>
  isCancelled: () => boolean
  onLoaded?: (key: string) => void
  /** Max loads in flight at once. */
  maxConcurrent?: number
  /** Pause between batches, ms. */
  delayBetweenBatches?: number
  wait?: (ms: number) => Promise<void>
}

/** Load items in small batches with a pause between them; stops as soon as `isCancelled` is true. */
export async function runPreload(items: readonly PreloadItem[], opts: RunPreloadOptions): Promise<void> {
  const {
    loadImage,
    isCancelled,
    onLoaded,
    maxConcurrent = 4,
    delayBetweenBatches = 150,
    wait = (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  } = opts
  const batches = chunk(items, maxConcurrent)
  for (let i = 0; i < batches.length; i++) {
    if (isCancelled()) return
    await Promise.all(
      batches[i].map(async (item) => {
        try {
          await loadImage(item.url)
          onLoaded?.(item.key)
        } catch {
          // Non-critical: the hover falls back to its other sources.
        }
      }),
    )
    if (i < batches.length - 1) {
      await wait(delayBetweenBatches)
    }
  }
}
