/**
 * Pure helpers for the card hover preview image. No DOM access, so they are unit-tested directly.
 */

/**
 * Ordered list of image URLs to try for a card, best first.
 *  1. Scryfall image CDN for the exact printing (fast, cacheable)  — only when there is a printing id
 *  2. Scryfall API redirect for that printing id                    — only when there is a printing id
 *  3. Scryfall API lookup by exact card name                        — always (the only source for rows with no id)
 */
export function previewImageSources(
  scryfallId: string | null | undefined,
  cardName: string,
): string[] {
  const sources: string[] = []
  const id = scryfallId?.trim()
  if (id && id.length >= 2) {
    sources.push(`https://cards.scryfall.io/large/front/${id.charAt(0)}/${id.charAt(1)}/${id}.jpg`)
    sources.push(`https://api.scryfall.com/cards/${id}?format=image&version=large`)
  }
  const name = cardName.trim()
  if (name) {
    sources.push(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=large`,
    )
  }
  return sources
}

/** The URL to try after `failedUrl` failed, or null when every source has been tried. */
export function nextPreviewSource(sources: readonly string[], failedUrl: string): string | null {
  const i = sources.indexOf(failedUrl)
  if (i === -1) return null
  return sources[i + 1] ?? null
}

/** Identity of one hover request: the row the pointer is on. */
export function previewKey(cardName: string, scryfallId: string | null | undefined): string {
  return `${cardName}|${scryfallId ?? ''}`
}

/**
 * Whether the popover may be shown: only when an image has actually loaded, and it is the image
 * for the row the pointer is on right now (a late load for a row already left must stay hidden).
 */
export function shouldShowPreview(
  requestedKey: string | null,
  imageKey: string | null | undefined,
  imageLoaded: boolean,
): boolean {
  return imageLoaded && requestedKey !== null && requestedKey === (imageKey ?? null)
}
