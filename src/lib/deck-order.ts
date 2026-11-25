// One place for deck order. Every list of decks the owner reads uses: position, then name, then id
// (docs/oracle/contracts/deck-rename-and-reorder.md section 4).
type Orderable<Q> = { order(column: string, opts?: { ascending?: boolean }): Q }

/** Add the saved deck order to a query on `decks`. The query must also select `position` only if the caller needs it back. */
export function orderDecks<Q extends Orderable<Q>>(q: Q): Q {
  return q.order('position', { ascending: true }).order('name', { ascending: true }).order('id', { ascending: true })
}

export interface DeckOrderKey { id: number; name: string; position?: number | null }

/** Same order, for decks already in memory. A deck with no position goes after those that have one. */
export function compareDecks(a: DeckOrderKey, b: DeckOrderKey): number {
  const pa = a.position ?? Number.MAX_SAFE_INTEGER
  const pb = b.position ?? Number.MAX_SAFE_INTEGER
  return pa - pb || a.name.localeCompare(b.name) || a.id - b.id
}

/** deck id -> place in the saved order (0 = first). */
export function deckRanks(decks: readonly DeckOrderKey[]): Map<number, number> {
  return new Map([...decks].sort(compareDecks).map((d, i) => [d.id, i]))
}

/**
 * The whole saved order after one deck is dropped. `groupIds` are the decks in the group the owner dragged inside
 * (all decks in the plain grid, one status group when grouped), in the order shown. `beforeId` is the deck it lands in
 * front of, or null for the end of that group. Decks outside the group keep their relative places.
 * Returns null when the drop changes nothing.
 */
export function moveInOrder(allIds: readonly number[], groupIds: readonly number[], movedId: number, beforeId: number | null): number[] | null {
  if (!groupIds.includes(movedId) || beforeId === movedId) return null
  if (beforeId !== null && !groupIds.includes(beforeId)) return null
  const rest = allIds.filter((id) => id !== movedId)
  let at: number
  if (beforeId !== null) at = rest.indexOf(beforeId)
  else {
    const lastInGroup = [...groupIds].reverse().find((id) => id !== movedId)
    at = lastInGroup === undefined ? allIds.indexOf(movedId) : rest.indexOf(lastInGroup) + 1
  }
  const next = [...rest.slice(0, at), movedId, ...rest.slice(at)]
  return next.every((id, i) => id === allIds[i]) ? null : next
}
