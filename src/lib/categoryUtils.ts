// ---------------------------------------------------------------------------
// Category Utility — Unified parse / serialize / cap enforcement
// ---------------------------------------------------------------------------
// Requirements 1.1–1.6, 2.1–2.3: Single source of truth for converting between
// the flat database representation (deck_cards.categories TEXT) and the
// structured app-layer type used by all consumers.
// ---------------------------------------------------------------------------

/**
 * Canonical app-layer category type.
 * primary_category is always non-empty; additional_categories has 0–4 entries
 * (5 categories in all, HC-02). The first one decides the group in the list.
 */
export interface StructuredCategories {
  primary_category: string
  additional_categories: string[]
}

/** Regex to strip Archidekt position markers (case-insensitive). */
const POSITION_MARKER_RE = /\s*\((top|bottom)\)\s*/gi

/**
 * Strip `(top)` and `(bottom)` markers from a category string and trim.
 */
function stripMarkers(raw: string): string {
  return raw.replace(POSITION_MARKER_RE, '').trim()
}

/**
 * Parse flat DB text into structured type.
 *
 * Strategy:
 * 1. If null/undefined/empty → default
 * 2. Try JSON parse — if result is an array of strings, use it
 * 3. Otherwise fall through to CSV split on commas
 * 4. Strip position markers from all entries
 * 5. First entry becomes primary_category, rest become additional_categories
 */
export function parseCategories(raw: string | null | undefined): StructuredCategories {
  const DEFAULT: StructuredCategories = {
    primary_category: 'Other',
    additional_categories: [],
  }

  if (raw == null || raw.trim() === '') {
    return DEFAULT
  }

  let entries: string[] = []

  // Attempt JSON parse
  let jsonParsed = false
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      jsonParsed = true
      entries = parsed
        .map((item) => (typeof item === 'string' ? stripMarkers(item) : ''))
        .filter((s) => s.length > 0)
    }
  } catch {
    // Not valid JSON — fall through to CSV
  }

  // If JSON didn't yield entries and wasn't a valid JSON array, try CSV split
  if (!jsonParsed && entries.length === 0) {
    entries = raw
      .split(',')
      .map((token) => stripMarkers(token))
      .filter((s) => s.length > 0)
  }

  // If still nothing usable, return default
  if (entries.length === 0) {
    return DEFAULT
  }

  return {
    primary_category: entries[0],
    additional_categories: entries.slice(1),
  }
}

/** Most categories one card can hold: the first plus four more. Matches Claude's set_card_category (1 to 5). */
export const MAX_CATEGORIES_PER_CARD = 5
/** Most entries after the first. */
export const MAX_ADDITIONAL_CATEGORIES = MAX_CATEGORIES_PER_CARD - 1

/**
 * Enforce the 5-category hard cap (1 first + max 4 more).
 * Truncates additional_categories silently. Idempotent.
 */
export function enforceCategoryCap(structured: StructuredCategories): StructuredCategories {
  if (structured.additional_categories.length <= MAX_ADDITIONAL_CATEGORIES) {
    return structured
  }
  return {
    primary_category: structured.primary_category,
    additional_categories: structured.additional_categories.slice(0, MAX_ADDITIONAL_CATEGORIES),
  }
}

/**
 * Serialize structured categories back to flat text for DB storage.
 * Returns JSON array string with primary first: '["Ramp","Draw","Removal"]'
 */
export function serializeCategories(structured: StructuredCategories): string {
  return JSON.stringify([
    structured.primary_category,
    ...structured.additional_categories,
  ])
}

/** Maximum allowed length for any single category name. Matches Claude's set_card_category (up to 60). */
export const MAX_CATEGORY_LENGTH = 60

/**
 * Check a category list before it is stored. Returns an error sentence, or null when it is fine.
 * Names are 1 to MAX_CATEGORY_LENGTH characters; nothing is cut or changed here.
 */
export function validateCategoryNames(primary: string, additional: string[]): string | null {
  const all = [primary, ...additional]
  if (all.length > MAX_CATEGORIES_PER_CARD) return `A card can be in at most ${MAX_CATEGORIES_PER_CARD} categories`
  if (all.some((n) => n.length === 0)) return 'Category names cannot be empty'
  if (all.some((n) => n.length > MAX_CATEGORY_LENGTH)) return `Category names can be at most ${MAX_CATEGORY_LENGTH} characters`
  return null
}

/**
 * Parse and cap in one call — convenience for read paths.
 * Equivalent to enforceCategoryCap(parseCategories(raw)) with an additional
 * defensive truncation of each category string to MAX_CATEGORY_LENGTH chars.
 */
export function parseCategoriesCapped(raw: string | null | undefined): StructuredCategories {
  const capped = enforceCategoryCap(parseCategories(raw))
  return {
    primary_category: capped.primary_category.slice(0, MAX_CATEGORY_LENGTH),
    additional_categories: capped.additional_categories.map(c => c.slice(0, MAX_CATEGORY_LENGTH)),
  }
}

/**
 * Apply bulk category suggestions (e.g. from AI) with cap enforcement.
 * Filters out the primary category from suggestions, keeps only the first 4.
 */
export function applyCategoryBulk(suggestions: string[], primaryCategory: string): StructuredCategories {
  const filtered = suggestions.filter(s => s !== primaryCategory)
  return {
    primary_category: primaryCategory,
    additional_categories: filtered.slice(0, MAX_ADDITIONAL_CATEGORIES),
  }
}
