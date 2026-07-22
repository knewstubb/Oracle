/**
 * External Deck Fetcher — Fetch decklists from MTGGoldfish, TappedOut, Deckbox
 *
 * These platforms don't have stable JSON APIs like Archidekt/Moxfield,
 * but they do provide text/download endpoints that return plain decklists.
 *
 * Strategy: fetch the text export → parse with the universal text parser.
 */

import { parseTextDecklist, type TextParseResult, type TextParseError } from '@/lib/text-deck-parser'
import type { NormalizedDeck } from '@/lib/deck-normalizer'

// ---------------------------------------------------------------------------
// MTGGoldfish
// ---------------------------------------------------------------------------

/**
 * Fetch a deck from MTGGoldfish by its deck ID.
 * Uses the /deck/download/{id} endpoint which returns plain text.
 */
export async function fetchMTGGoldfishDeck(deckId: string): Promise<NormalizedDeck> {
  const url = `https://www.mtggoldfish.com/deck/download/${deckId}`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheOracle/0.2.0' },
    redirect: 'follow',
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error('Deck not found on MTGGoldfish')
    throw new Error(`MTGGoldfish returned ${res.status}`)
  }

  const text = await res.text()
  if (!text.trim()) {
    throw new Error('Empty response from MTGGoldfish')
  }

  const result = parseTextDecklist(text, `MTGGoldfish Deck ${deckId}`)
  if ('error' in result) {
    throw new Error(`Failed to parse MTGGoldfish deck: ${result.error}`)
  }

  result.deck.platform = 'mtggoldfish'
  result.deck.platformDeckId = deckId
  result.deck.sourceUrl = `https://www.mtggoldfish.com/deck/${deckId}`

  return result.deck
}

// ---------------------------------------------------------------------------
// TappedOut
// ---------------------------------------------------------------------------

/**
 * Fetch a deck from TappedOut by its slug.
 * Uses the ?fmt=txt endpoint which returns plain text.
 */
export async function fetchTappedOutDeck(slug: string): Promise<NormalizedDeck> {
  const url = `https://tappedout.net/mtg-decks/${slug}/?fmt=txt`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheOracle/0.2.0' },
    redirect: 'follow',
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error('Deck not found on TappedOut')
    throw new Error(`TappedOut returned ${res.status}`)
  }

  const text = await res.text()
  if (!text.trim()) {
    throw new Error('Empty response from TappedOut')
  }

  const result = parseTextDecklist(text, `TappedOut Deck`)
  if ('error' in result) {
    throw new Error(`Failed to parse TappedOut deck: ${result.error}`)
  }

  result.deck.platform = 'tappedout'
  result.deck.platformDeckId = slug
  result.deck.sourceUrl = `https://tappedout.net/mtg-decks/${slug}/`

  return result.deck
}

// ---------------------------------------------------------------------------
// Deckbox
// ---------------------------------------------------------------------------

/**
 * Fetch a deck from Deckbox by its set ID.
 * Uses the /sets/{id}/export endpoint which returns plain text.
 */
export async function fetchDeckboxDeck(setId: string): Promise<NormalizedDeck> {
  const url = `https://deckbox.org/sets/${setId}/export`

  const res = await fetch(url, {
    headers: { 'User-Agent': 'TheOracle/0.2.0' },
    redirect: 'follow',
  })

  if (!res.ok) {
    if (res.status === 404) throw new Error('Deck not found on Deckbox')
    throw new Error(`Deckbox returned ${res.status}`)
  }

  const text = await res.text()
  if (!text.trim()) {
    throw new Error('Empty response from Deckbox')
  }

  // Deckbox export format is slightly different — may have sections like "Main:" and "Sideboard:"
  // The text parser handles this via section detection
  const result = parseTextDecklist(text, `Deckbox Deck ${setId}`)
  if ('error' in result) {
    throw new Error(`Failed to parse Deckbox deck: ${result.error}`)
  }

  result.deck.platform = 'deckbox'
  result.deck.platformDeckId = setId
  result.deck.sourceUrl = `https://deckbox.org/sets/${setId}`

  return result.deck
}
