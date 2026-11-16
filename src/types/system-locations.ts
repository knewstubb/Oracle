/** Mirrors docs/oracle/contracts/know-where-cards-are.types.ts (SystemLocationsResponse). */
export type PlaceRef = { kind: 'deck'; deckId: number; deckCardId?: number } | { kind: 'location'; locationId: number }
export interface SystemLocationsResponse {
  inHand: { count: number; cards: Array<{ copyId: number; cardName: string; isProxy: boolean; openItemId: number | null }> }
  missing: { count: number; cards: Array<{ copyId: number; cardName: string; isProxy: boolean; since: string; lastSeen: PlaceRef | null }> }
  unsorted: { count: number; locationId: number }
}
