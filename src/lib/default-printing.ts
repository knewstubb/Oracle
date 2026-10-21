/**
 * Default printing for a card named WITHOUT a printing (plain text decklists).
 *
 * The card is identified by its name (the canonical card, `oracle_id`); the printing is
 * only a default the owner can change later. Pure functions, no database access.
 *
 * Order of preference:
 *  1. a printing the owner already owns (a real, non-proxy copy), the one they own most of,
 *     newest first on a tie;
 *  2. otherwise the newest regular paper printing (not digital-only, not a promo / Secret Lair /
 *     stamped or starred variant);
 *  3. otherwise the newest paper printing of any kind, then anything at all.
 */

export interface PrintingCandidate {
  scryfallId: string
  oracleId: string
  name: string
  setCode: string
  setName: string
  collectorNumber: string
  layout: string | null
  releasedAt: string | null
  digital: boolean | null
}

/** Layouts that are never a real card the owner would list in a deck. */
const NON_CARD_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'planar', 'scheme', 'vanguard'])

/** `ref_printings` has no promo flag, so promos are recognised from the set name and collector number. */
export function isPromoLikePrinting(p: Pick<PrintingCandidate, 'setName' | 'collectorNumber'>): boolean {
  if (/promo|secret lair|judge gift|playtest|heroes of the realm|celebration|world championship|gold-bordered/i.test(p.setName)) {
    return true
  }
  // Starred / stamped variants inside a normal set: "123★", "45p", "67s".
  return /[★∗†]|\d[ps]$/i.test(p.collectorNumber)
}

function collectorOrder(p: PrintingCandidate): number {
  const n = Number.parseInt(p.collectorNumber, 10)
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n
}

/** Newest first; printings from the same day go lowest collector number first so the choice is stable. */
function newestFirst(a: PrintingCandidate, b: PrintingCandidate): number {
  return (b.releasedAt ?? '').localeCompare(a.releasedAt ?? '') || collectorOrder(a) - collectorOrder(b)
}

/**
 * Pick the default printing. `ownedCounts` maps scryfall id -> how many real copies the owner has.
 * Printings not released yet (spoiled sets with a future date) are never chosen while a released one
 * exists. Returns null only when there are no candidates at all.
 */
export function pickDefaultPrinting(
  candidates: PrintingCandidate[],
  ownedCounts: ReadonlyMap<string, number> = new Map(),
  today: string = new Date().toISOString().slice(0, 10)
): PrintingCandidate | null {
  const cards = candidates.filter((c) => !NON_CARD_LAYOUTS.has((c.layout ?? '').toLowerCase()))
  const real = cards.length > 0 ? cards : candidates
  const released = real.filter((c) => !c.releasedAt || c.releasedAt <= today)
  const pool = released.length > 0 ? released : real
  if (pool.length === 0) return null

  const owned = pool.filter((c) => (ownedCounts.get(c.scryfallId) ?? 0) > 0)
  if (owned.length > 0) {
    return [...owned].sort(
      (a, b) => (ownedCounts.get(b.scryfallId) ?? 0) - (ownedCounts.get(a.scryfallId) ?? 0) || newestFirst(a, b)
    )[0]
  }

  const paper = pool.filter((c) => !c.digital)
  const regular = paper.filter((c) => !isPromoLikePrinting(c))
  for (const tier of [regular, paper, pool]) {
    if (tier.length > 0) return [...tier].sort(newestFirst)[0]
  }
  return null
}

/**
 * The names a plain-text line may be stored under in `ref_printings`, in order of preference.
 * Double-faced and split cards are stored as "Front // Back"; people often type only the front.
 * Curly apostrophes are straightened.
 */
export function nameLookupVariants(typed: string): { exact: string; frontFace: string | null } {
  const exact = typed.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
  const idx = exact.indexOf(' // ')
  return { exact, frontFace: idx === -1 ? null : exact.slice(0, idx).trim() }
}
