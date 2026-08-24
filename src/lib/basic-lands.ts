/**
 * Basic Land Detection — Chunk 11
 *
 * Identifies basic lands that should be treated as "generic" (no allocation tracking).
 * Generic basic land slots:
 * - Default to no copy_id (expected state, not an error)
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
 * Default Scryfall IDs for basic lands — used when deck_cards has no scryfall_id.
 * These are iconic printings that look good as placeholders.
 */
const BASIC_LAND_DEFAULT_SCRYFALL_IDS: Record<string, string> = {
  'Plains': 'fcaff77a-58a5-4c6a-8a8d-8a89272a216e',           // MH3 full-art
  'Island': '73051e78-5376-4e6f-984e-93d0683f9254',           // MH3 full-art  
  'Swamp': 'f0acec33-e7e7-4ef7-a8df-43d082a0fe17',            // MH3 full-art
  'Mountain': 'eb708d7a-8cf9-43ab-bca4-9d027fd8c295',         // MH3 full-art
  'Forest': '39513cdb-2461-4e9e-ad7f-ebde097cd189',           // MH3 full-art
  'Wastes': 'a1b36fc8-7984-4d59-b74b-546c134d1e6e',           // OGW
  'Snow-Covered Plains': '84ed8b7e-6f85-4e49-800e-a5ae5b7bf15c',
  'Snow-Covered Island': '17e52b5f-e5b3-4ec1-a5fd-1eb3bf54a2d0',
  'Snow-Covered Swamp': 'e7d764d4-3e57-4e01-b45b-4a75ddb1edf4',
  'Snow-Covered Mountain': '7a378e5c-d00c-4830-a2b7-5a3ade3a2174',
  'Snow-Covered Forest': 'a86c8e75-c1e4-4c35-87b6-4e7d9fa4dafa',
}

/**
 * Get a default Scryfall ID for a basic land when no printing is assigned.
 * Returns undefined for non-basic lands.
 */
export function getBasicLandDefaultScryfallId(cardName: string): string | undefined {
  return BASIC_LAND_DEFAULT_SCRYFALL_IDS[cardName]
}

/**
 * Check if a card name is a basic land eligible for generic (untracked) treatment.
 */
export function isBasicLand(cardName: string): boolean {
  return BASIC_LAND_NAMES.has(cardName)
}

/**
 * Check if a basic land slot is "tracked" (has a copy_id assigned).
 * A tracked basic land behaves like a normal card — real status, real resolution.
 */
export function isTrackedBasicLand(
  cardName: string,
  physicalCopyId: number | null
): boolean {
  return isBasicLand(cardName) && physicalCopyId !== null
}

/**
 * Check if a basic land slot is "generic" (untracked, no copy_id).
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
