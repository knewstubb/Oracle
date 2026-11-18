// CC-14: rules text matching for the `text` filter. Pure, so it is unit tested without a database.
// Contract: connector-collection-search.md section 14.
export type TextMatchMode = 'all_words' | 'phrase'
/** Lower-case and collapse every run of whitespace (spaces, newlines, the face separator) to one space. */
export function normaliseText(s: string): string {
  return s.toLowerCase().replace(/\s*\/\/\s*/g, ' // ').replace(/\s+/g, ' ').trim()
}
/**
 * all_words: every word of `text` appears somewhere (partial words count).
 * phrase: the whole normalised `text` appears in one piece. A phrase never spans the face separator "//".
 * Empty or missing rules text never matches.
 */
export function matchesRulesText(oracleText: string | null | undefined, text: string, mode: TextMatchMode): boolean {
  if (!oracleText || !oracleText.trim()) return false
  const want = normaliseText(text)
  if (!want) return false
  const have = normaliseText(oracleText)
  if (mode === 'phrase') return have.split(' // ').some((face) => face.includes(want))
  return want.split(' ').every((w) => have.includes(w))
}
