/**
 * Import destination (know-where-cards-are contract section 4c): where the whole add-only collection import goes.
 *
 * Absent = Unsorted (today's behaviour). Valid: Unsorted, a storage box or binder the user owns, a deck the user owns.
 * Missing and In your hand are never destinations (they are markers on a copy, not places), and the per-deck
 * `user_locations` rows (type 'deck') are never offered or accepted.
 *
 * Contract: docs/oracle/contracts/know-where-cards-are.md section 4c.
 */

import type { ImportDestination } from '../../docs/oracle/contracts/know-where-cards-are.types'

/**
 * Deck destination (slice I2) is built but stays off until the all-or-nothing database function
 * `insert_user_copies_to_deck` is approved and applied (draft: supabase/drafts). Flip to true only after that.
 */
export const DECK_DESTINATION_ENABLED = false

/** A destination the server refuses. Nothing has been written when this is thrown. */
export class ImportDestinationError extends Error {
  constructor(
    message: string,
    /** 400 = malformed request; 404 = not found (nothing revealed); 503 = not available yet. */
    readonly status: 400 | 404 | 503 = 400
  ) {
    super(message)
    this.name = 'ImportDestinationError'
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/**
 * Shape check only (no database). Absent or null = Unsorted. Anything unknown, or a request naming both a
 * location and a deck, is refused with 400.
 */
export function parseImportDestination(raw: unknown): ImportDestination {
  if (raw === undefined || raw === null) return { kind: 'unsorted' }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ImportDestinationError('Invalid destination')
  }
  const body = raw as Record<string, unknown>
  const hasLocation = body.locationId !== undefined && body.locationId !== null
  const hasDeck = body.deckId !== undefined && body.deckId !== null
  if (hasLocation && hasDeck) throw new ImportDestinationError('Invalid destination: pick a place or a deck, not both')

  switch (body.kind) {
    case 'unsorted':
      if (hasLocation || hasDeck) throw new ImportDestinationError('Invalid destination')
      return { kind: 'unsorted' }
    case 'storage':
      if (!isPositiveInt(body.locationId) || hasDeck) throw new ImportDestinationError('Invalid destination')
      return { kind: 'storage', locationId: body.locationId }
    case 'deck':
      if (!isPositiveInt(body.deckId) || hasLocation) throw new ImportDestinationError('Invalid destination')
      return { kind: 'deck', deckId: body.deckId }
    default:
      throw new ImportDestinationError('Invalid destination')
  }
}

/** Multipart bodies carry the destination as a JSON string field. */
export function parseImportDestinationField(raw: FormDataEntryValue | null): ImportDestination {
  if (raw === null) return { kind: 'unsorted' }
  if (typeof raw !== 'string') throw new ImportDestinationError('Invalid destination')
  try {
    return parseImportDestination(JSON.parse(raw))
  } catch (err) {
    if (err instanceof ImportDestinationError) throw err
    throw new ImportDestinationError('Invalid destination')
  }
}

/** The slice of the database client the destination lookup needs. */
export interface DestinationLookupClient {
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface ResolvedDestination {
  kind: ImportDestination['kind']
  /** Storage location id, deck id, or null for Unsorted (the insert function substitutes the default location). */
  id: number | null
  name: string
}

const GONE_STORAGE = 'That box or binder no longer exists. Pick another place.'
const GONE_DECK = 'That deck no longer exists. Pick another place.'

/** Checks, before anything is written, that the chosen place belongs to this user and is allowed. */
export async function resolveImportDestination(
  supabase: DestinationLookupClient,
  userId: string,
  destination: ImportDestination
): Promise<ResolvedDestination> {
  if (destination.kind === 'unsorted') return { kind: 'unsorted', id: null, name: 'Unsorted' }

  if (destination.kind === 'storage') {
    const { data, error } = await supabase
      .from('user_locations')
      .select('id, name, type, user_id')
      .eq('id', destination.locationId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`Could not check the destination: ${error.message}`)
    if (!data) throw new ImportDestinationError(GONE_STORAGE, 404)
    if (data.type !== 'storage') throw new ImportDestinationError('Invalid destination')
    return { kind: 'storage', id: data.id, name: data.name }
  }

  if (!DECK_DESTINATION_ENABLED) {
    throw new ImportDestinationError('Importing straight into a deck is not available yet. Choose Unsorted or a box.', 503)
  }
  const { data, error } = await supabase
    .from('decks')
    .select('id, name, user_id')
    .eq('id', destination.deckId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Could not check the destination: ${error.message}`)
  if (!data) throw new ImportDestinationError(GONE_DECK, 404)
  return { kind: 'deck', id: data.id, name: data.name }
}

/** Sets the chosen storage location on every row. Unsorted / deck leave rows untouched (null = default location). */
export function applyStorageDestination<T extends { location_id?: unknown }>(
  rows: T[],
  resolved: ResolvedDestination
): T[] {
  if (resolved.kind !== 'storage' || resolved.id === null) return rows
  return rows.map((row) => ({ ...row, location_id: resolved.id }))
}

/** Maps a database refusal raised inside the insert (a box deleted between the check and the write). */
export function destinationErrorFromDatabase(message: string): ImportDestinationError | null {
  if (message.includes('storage_location_not_found')) return new ImportDestinationError(GONE_STORAGE, 404)
  if (message.includes('deck_not_found')) return new ImportDestinationError(GONE_DECK, 404)
  return null
}
