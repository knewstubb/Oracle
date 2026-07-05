// ---------------------------------------------------------------------------
// Category Colour — shared visual encoding for category identity
// ---------------------------------------------------------------------------

/** 10 saturated colours for primary category ring / left-spine */
export const PRIMARY_PALETTE = [
  '#e53e3e', // red
  '#dd6b20', // orange
  '#d69e2e', // yellow
  '#38a169', // green
  '#319795', // teal
  '#3182ce', // blue
  '#5a67d8', // indigo
  '#805ad5', // purple
  '#d53f8c', // pink
  '#2b6cb0', // dark blue
]

/** 8 muted colours for secondary category letter badges */
export const SECONDARY_PALETTE = [
  '#a78bfa', '#f472b6', '#34d399', '#fbbf24',
  '#60a5fa', '#fb923c', '#a3e635', '#e879f9',
]

/** Hash a category name to an index in a palette */
function hashToIndex(category: string, paletteLength: number): number {
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = ((hash << 5) - hash + category.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % paletteLength
}

/** Get the primary colour for a category (used for ring/spine) */
export function categoryPrimaryColour(category: string): string {
  return PRIMARY_PALETTE[hashToIndex(category, PRIMARY_PALETTE.length)]
}

/** Get the secondary colour for a category (used for letter badges) */
export function categorySecondaryColour(category: string): string {
  return SECONDARY_PALETTE[hashToIndex(category, SECONDARY_PALETTE.length)]
}

/** Get the initial letter for a category (first char, uppercase) */
export function categoryInitial(category: string): string {
  return category.charAt(0).toUpperCase()
}
