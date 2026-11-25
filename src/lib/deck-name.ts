import { DECK_NAME_MAX, type DeckRenameError } from '../../docs/oracle/contracts/deck-rename-and-reorder.types'

export type DeckNameCheck = { ok: true; name: string } | { ok: false; error: Extract<DeckRenameError, 'name_empty' | 'name_too_long'> }

/** Trims a typed deck name and checks it is 1 to 100 characters (contract: deck-rename-and-reorder, section 2). */
export function checkDeckName(raw: unknown): DeckNameCheck {
  const name = typeof raw === 'string' ? raw.trim() : ''
  if (name.length === 0) return { ok: false, error: 'name_empty' }
  if (name.length > DECK_NAME_MAX) return { ok: false, error: 'name_too_long' }
  return { ok: true, name }
}

/**
 * True when ANOTHER deck already uses this name, ignoring capital letters.
 * The deck being renamed is skipped, so "korvold" -> "Korvold" on the same deck is allowed.
 */
export function hasNameClash(decks: Array<{ id: number; name: string }>, deckId: number, name: string): boolean {
  const wanted = name.toLowerCase()
  return decks.some((d) => d.id !== deckId && d.name.trim().toLowerCase() === wanted)
}
