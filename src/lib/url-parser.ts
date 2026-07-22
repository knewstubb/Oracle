// ---------------------------------------------------------------------------
// URL Parser — Extracts platform and deck ID from Archidekt/Moxfield URLs
// ---------------------------------------------------------------------------

export type DeckPlatform = 'archidekt' | 'moxfield' | 'mtggoldfish' | 'tappedout' | 'deckbox' | 'csv' | 'paste'

export interface ParsedDeckUrl {
  platform: DeckPlatform
  deckId: string
}

export interface ParseError {
  error: string
  supportedFormats: string[]
}

const SUPPORTED_FORMATS = [
  'https://archidekt.com/decks/{numericId}',
  'https://www.archidekt.com/decks/{numericId}',
  'https://moxfield.com/decks/{alphanumericId}',
  'https://www.moxfield.com/decks/{alphanumericId}',
  'https://www.mtggoldfish.com/deck/{numericId}',
  'https://tappedout.net/mtg-decks/{slug}/',
  'https://deckbox.org/sets/{numericId}',
]

// Matches archidekt.com/decks/{numericId} with optional trailing path/query
const ARCHIDEKT_PATTERN = /^(?:https?:\/\/)?(?:www\.)?archidekt\.com\/decks\/(\d+)(?:\/[^\s?]*)?(?:\?[^\s]*)?$/i

// Matches moxfield.com/decks/{alphanumericId} with optional trailing path/query
const MOXFIELD_PATTERN = /^(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([a-zA-Z0-9_-]+)(?:\/[^\s?]*)?(?:\?[^\s]*)?$/i

// Matches mtggoldfish.com/deck/{numericId} or /archetype/{slug}
const MTGGOLDFISH_PATTERN = /^(?:https?:\/\/)?(?:www\.)?mtggoldfish\.com\/(?:deck|archetype)\/([a-zA-Z0-9_#-]+)(?:\/[^\s?]*)?(?:\?[^\s]*)?$/i

// Matches tappedout.net/mtg-decks/{slug}/
const TAPPEDOUT_PATTERN = /^(?:https?:\/\/)?(?:www\.)?tappedout\.net\/mtg-decks\/([a-zA-Z0-9_-]+)\/?(?:\?[^\s]*)?$/i

// Matches deckbox.org/sets/{numericId}
const DECKBOX_PATTERN = /^(?:https?:\/\/)?(?:www\.)?deckbox\.org\/sets\/(\d+)(?:\/[^\s?]*)?(?:\?[^\s]*)?$/i

/**
 * Parse a deck URL into platform + deck ID.
 * Accepts URLs with/without protocol, with/without www.
 *
 * Supported patterns:
 * - archidekt.com/decks/{numericId}[/...]
 * - moxfield.com/decks/{alphanumericId}[/...]
 */
export function parseDeckUrl(url: string): ParsedDeckUrl | ParseError {
  const trimmed = url.trim()

  if (!trimmed) {
    return {
      error: 'URL is required',
      supportedFormats: SUPPORTED_FORMATS,
    }
  }

  const archidektMatch = trimmed.match(ARCHIDEKT_PATTERN)
  if (archidektMatch) {
    return {
      platform: 'archidekt',
      deckId: archidektMatch[1],
    }
  }

  const moxfieldMatch = trimmed.match(MOXFIELD_PATTERN)
  if (moxfieldMatch) {
    return {
      platform: 'moxfield',
      deckId: moxfieldMatch[1],
    }
  }

  const mtggoldfishMatch = trimmed.match(MTGGOLDFISH_PATTERN)
  if (mtggoldfishMatch) {
    return {
      platform: 'mtggoldfish',
      deckId: mtggoldfishMatch[1],
    }
  }

  const tappedoutMatch = trimmed.match(TAPPEDOUT_PATTERN)
  if (tappedoutMatch) {
    return {
      platform: 'tappedout',
      deckId: tappedoutMatch[1],
    }
  }

  const deckboxMatch = trimmed.match(DECKBOX_PATTERN)
  if (deckboxMatch) {
    return {
      platform: 'deckbox',
      deckId: deckboxMatch[1],
    }
  }

  return {
    error: 'URL does not match any supported deck platform',
    supportedFormats: SUPPORTED_FORMATS,
  }
}

/**
 * Type guard to check if a parse result is an error.
 */
export function isParseError(result: ParsedDeckUrl | ParseError): result is ParseError {
  return 'error' in result
}
