// Result size caps. Contract section 9. Truncation is always stated, never silent (D-030).
export const MAX_RESPONSE_BYTES = 40 * 1024
export const MAX_HEALTH_RESULT_BYTES = 20 * 1024
export const MAX_REQUEST_BYTES = 32 * 1024
export const MAX_STRING_CHARS = 300
export const SEARCH_PAGE_MAX = 25
export const DECKS_PAGE_MAX = 50
export const DECK_CARDS_PAGE_MAX = 150
export const COPIES_PER_CARD_MAX = 20

export function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/** Cut free text at 300 characters with an ellipsis. Names are never passed through this. */
export function cutText(s: string | null | undefined): string | null {
  if (s == null) return null
  return s.length > MAX_STRING_CHARS ? `${s.slice(0, MAX_STRING_CHARS - 1)}…` : s
}

/**
 * Drop rows from the end until the serialised wrapper fits under `maxBytes`.
 * `wrap(rows)` builds the full result so the overhead is counted. Returns null if rows exist but not even
 * one fits (caller reports TOO_LARGE).
 */
export function fitRows<T, R>(
  rows: T[],
  wrap: (kept: T[]) => R,
  maxBytes: number = MAX_RESPONSE_BYTES,
): { result: R; kept: number } | null {
  let kept = rows.length
  while (kept >= 0) {
    const result = wrap(rows.slice(0, kept))
    if (byteLength(result) <= maxBytes) {
      if (kept === 0 && rows.length > 0) return null
      return { result, kept }
    }
    // Shrink by about 10% (at least one) so large pages do not take hundreds of serialisations.
    kept -= Math.max(1, Math.floor(kept / 10))
  }
  return null
}
