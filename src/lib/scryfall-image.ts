// ---------------------------------------------------------------------------
// Scryfall image URL helper
// ---------------------------------------------------------------------------
// Builds Scryfall CDN image URLs from a printing id (scryfall_id). The CDN
// path includes the first two characters of the id as directories:
//   https://cards.scryfall.io/<size>/front/<a>/<b>/<scryfall_id>.jpg
// Returns null when no id is available so callers can render a placeholder.
// ---------------------------------------------------------------------------

export type ScryfallImageSize = 'small' | 'normal' | 'large' | 'art_crop'

export function getScryfallImageUrl(
  scryfallId: string | null | undefined,
  size: ScryfallImageSize = 'normal'
): string | null {
  if (!scryfallId) return null
  const a = scryfallId.charAt(0)
  const b = scryfallId.charAt(1)
  return `https://cards.scryfall.io/${size}/front/${a}/${b}/${scryfallId}.jpg`
}
