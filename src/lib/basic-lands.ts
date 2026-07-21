/**
 * Basic Land Detection — Chunk 11
 *
 * Identifies basic lands that should be treated as "generic" (no allocation tracking).
 * Generic basic land slots:
 * - Default to no physical_copy_id (expected state, not an error)
 * - Are exempt from the four-state status taxonomy
 * - Collapse into a single row in the Cards tab display
 * - Don't require supply verification
 */

const BASIC_LAND_NAMES = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
])

/**
 * Check if a card name is a basic land eligible for generic (untracked) treatment.
 */
export function isBasicLand(cardName: string): boolean {
  return BASIC_LAND_NAMES.has(cardName)
}

/**
 * Check if a basic land slot is "tracked" (has a physical_copy_id assigned).
 * A tracked basic land behaves like a normal card — real status, real resolution.
 */
export function isTrackedBasicLand(
  cardName: string,
  physicalCopyId: number | null
): boolean {
  return isBasicLand(cardName) && physicalCopyId !== null
}

/**
 * Check if a basic land slot is "generic" (untracked, no physical_copy_id).
 * Generic slots are exempt from status computation and display no badge.
 */
export function isGenericBasicLand(
  cardName: string,
  physicalCopyId: number | null
): boolean {
  return isBasicLand(cardName) && physicalCopyId === null
}


// ---------------------------------------------------------------------------
// DFC (Double-Faced Card) Name Resolution
// ---------------------------------------------------------------------------

/**
 * Extract the front face name from a DFC card name.
 * DFC names use " // " as separator: "Delver of Secrets // Insectile Aberration"
 * Returns the original name if it's not a DFC.
 *
 * Use this when:
 * - Building Scryfall /cards/collection requests (which only accept front face names)
 * - Constructing named image URLs
 * - Looking up card_metadata (which may be stored under front face only)
 */
export function frontFaceName(cardName: string): string {
  const idx = cardName.indexOf(' // ')
  return idx === -1 ? cardName : cardName.substring(0, idx)
}

/**
 * Check if a card name is a DFC (contains " // " separator).
 */
export function isDFC(cardName: string): boolean {
  return cardName.includes(' // ')
}
