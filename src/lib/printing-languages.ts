/**
 * Which languages a printing exists in, per Scryfall. Small pure functions plus
 * one fetcher; the browser never calls Scryfall directly (it uses
 * `/api/printing-languages`).
 */

const SCRYFALL_SEARCH = 'https://api.scryfall.com/cards/search'
const USER_AGENT = 'TheOracle/1.0'

/** Scryfall search text for every language of one printing. */
export function buildPrintingLanguageUrl(setCode: string, collectorNumber: string): string {
  const set = setCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const number = collectorNumber.trim().replace(/"/g, '')
  const q = `set:${set} cn:"${number}"`
  return `${SCRYFALL_SEARCH}?q=${encodeURIComponent(q)}&unique=prints&include_multilingual=true`
}

/** Language codes from a Scryfall list response, de-duplicated and sorted (English first). */
export function languagesFromScryfall(body: unknown): string[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  const codes = new Set<string>()
  for (const card of data) {
    const lang = (card as { lang?: unknown })?.lang
    if (typeof lang === 'string' && lang.trim()) codes.add(lang.trim().toLowerCase())
  }
  return [...codes].sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)))
}

/**
 * Ask Scryfall which languages a printing exists in. Returns `null` when the
 * lookup fails (so callers can fail safe); `[]` when Scryfall knows no prints.
 */
export async function fetchPrintingLanguages(
  setCode: string,
  collectorNumber: string,
  fetchImpl: typeof fetch = fetch
): Promise<string[] | null> {
  try {
    const res = await fetchImpl(buildPrintingLanguageUrl(setCode, collectorNumber), {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    })
    if (res.status === 404) return []
    if (!res.ok) return null
    return languagesFromScryfall(await res.json())
  } catch {
    return null
  }
}

export type LanguageLookup = { status: 'loading' } | { status: 'done'; languages: string[] | null }

export type LanguageChoices =
  | { mode: 'loading'; codes: string[] }
  | { mode: 'hidden'; codes: string[] }
  | { mode: 'select'; codes: string[] }

/**
 * What the Language control shows. The file's value and the current value are
 * always selectable. When the lookup failed, the choices are the languages the
 * file itself used for this row. One choice means the control is hidden.
 */
export function languageChoices(
  lookup: LanguageLookup,
  fileLanguages: string[],
  current: string
): LanguageChoices {
  const keep = [...fileLanguages, current].filter(Boolean)
  if (lookup.status === 'loading') return { mode: 'loading', codes: unique(keep) }
  const base = lookup.languages && lookup.languages.length > 0 ? lookup.languages : []
  const codes = unique([...base, ...keep])
  return { mode: codes.length > 1 ? 'select' : 'hidden', codes }
}

function unique(codes: string[]): string[] {
  return [...new Set(codes)]
}
