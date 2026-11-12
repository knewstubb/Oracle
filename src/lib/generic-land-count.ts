/**
 * Parse what the owner typed into a generic land row's count box.
 * Returns a whole number, 0 or more, or null when the text is not one
 * ("", "abc", "-1", "2.5", "1e3" are all rejected).
 */
export function parseLandCount(text: string): number | null {
  const t = text.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isSafeInteger(n) ? n : null
}
