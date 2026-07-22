/**
 * POST /api/decks/import/preview
 *
 * Fetches and normalizes a deck from Archidekt or Moxfield based on a URL.
 * Returns the normalized deck and cards grouped by type for UI preview.
 * This endpoint is read-only — no database writes occur.
 *
 * Validates: Requirements 2.1, 3.1, 4.1
 */

import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { parseDeckUrl, isParseError } from '@/lib/url-parser'
import { fetchDeck } from '@/lib/archidekt-client'
import { fetchMoxfieldDeck } from '@/lib/moxfield-client'
import {
  normalizeArchidektDeck,
  normalizeMoxfieldDeck,
  groupCardsByType,
} from '@/lib/deck-normalizer'
import {
  fetchMTGGoldfishDeck,
  fetchTappedOutDeck,
  fetchDeckboxDeck,
} from '@/lib/external-deck-fetcher'

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }

  const { url } = body
  if (!url || typeof url !== 'string') {
    return Response.json(
      { error: 'URL is required' },
      { status: 400 }
    )
  }

  // Parse the URL to identify platform and deck ID
  const parseResult = parseDeckUrl(url)
  if (isParseError(parseResult)) {
    return Response.json(
      {
        error: parseResult.error,
        supportedFormats: parseResult.supportedFormats,
      },
      { status: 400 }
    )
  }

  const { platform, deckId } = parseResult

  try {
    if (platform === 'archidekt') {
      const rawDeck = await fetchDeck(parseInt(deckId))
      const deck = normalizeArchidektDeck(rawDeck, url)
      const cardsByType = groupCardsByType(deck.cards)
      return Response.json({ deck, cardsByType })
    }

    if (platform === 'moxfield') {
      const rawDeck = await fetchMoxfieldDeck(deckId)
      const deck = normalizeMoxfieldDeck(rawDeck, url)
      const cardsByType = groupCardsByType(deck.cards)
      return Response.json({ deck, cardsByType })
    }

    if (platform === 'mtggoldfish') {
      const deck = await fetchMTGGoldfishDeck(deckId)
      const cardsByType = groupCardsByType(deck.cards)
      return Response.json({ deck, cardsByType })
    }

    if (platform === 'tappedout') {
      const deck = await fetchTappedOutDeck(deckId)
      const cardsByType = groupCardsByType(deck.cards)
      return Response.json({ deck, cardsByType })
    }

    if (platform === 'deckbox') {
      const deck = await fetchDeckboxDeck(deckId)
      const cardsByType = groupCardsByType(deck.cards)
      return Response.json({ deck, cardsByType })
    }

    return Response.json({ error: `Unsupported platform: ${platform}` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[decks/import/preview] Fetch failed: ${message}`)

    // Archidekt 403 — private deck
    if (message.includes('403')) {
      return Response.json(
        { error: 'This deck is private and cannot be imported' },
        { status: 403 }
      )
    }

    // 404 — deck not found
    if (message.toLowerCase().includes('not found')) {
      return Response.json(
        { error: `Deck not found on ${platform}` },
        { status: 404 }
      )
    }

    // Timeout
    if (message.toLowerCase().includes('timed out') || message.toLowerCase().includes('timeout')) {
      return Response.json(
        { error: 'Request timed out' },
        { status: 504 }
      )
    }

    // Generic external API error
    return Response.json(
      { error: `Failed to fetch deck from ${platform}` },
      { status: 502 }
    )
  }
}
