import type { DestinationsResponse } from '../../../docs/oracle/contracts/know-where-cards-are.types'

/** Loads the places the import picker offers. Throws when they cannot be loaded (Unsorted stays usable). */
export async function fetchImportDestinations(): Promise<DestinationsResponse> {
  const res = await fetch('/api/import/destinations')
  if (!res.ok) throw new Error('Could not load destinations')
  return (await res.json()) as DestinationsResponse
}
