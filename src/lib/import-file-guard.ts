// ---------------------------------------------------------------------------
// Import file guard (import-formats §7, A-3; T-60 S-5).
//
// Runs before any parsing: refuses file types the app does not read (never guessed), files over
// the size or line limits, and files that hold no cards. The wording is for the owner, in plain
// words.
// ---------------------------------------------------------------------------

import { detectManaBoxFile, type ManaBoxFileKind } from '@/lib/manabox-import'

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_LINES = 5000

export const UNSUPPORTED_FILE_MESSAGE = "This file type isn't supported. Export a text or CSV list."
export const TOO_BIG_MESSAGE = 'This file is too big to import (over 5 MB or 5,000 lines). Split it into smaller lists.'
export const NO_CARDS_MESSAGE =
  "We couldn't find a card list in this file. Export a text or CSV list from your deck app and try again."

const UNSUPPORTED_EXTENSIONS = ['dek', 'cod', 'dck', 'json', 'xml']

export type ImportFileCheck =
  | { ok: true; kind: ManaBoxFileKind }
  | { ok: false; error: string; reason: 'unsupported' | 'too_big' | 'no_cards' }

/** Does the content look like XML or JSON (MTGO .dek, Cockatrice .cod, a JSON export)? */
function looksStructured(content: string): boolean {
  const head = content.replace(/^\uFEFF/, '').trimStart().slice(0, 200)
  if (/^<\?xml/i.test(head) || /^<(?:Deck|cockatrice_deck|\w+)[\s>]/i.test(head)) return true
  if (/^[[{]/.test(head)) {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  }
  return false
}

/** Check a file's content (and name, when known) before it is parsed. */
export function checkImportFile(content: string, fileName?: string): ImportFileCheck {
  const bytes = new TextEncoder().encode(content).length
  if (bytes > MAX_IMPORT_BYTES) return { ok: false, error: TOO_BIG_MESSAGE, reason: 'too_big' }
  // Count newlines without building a huge array.
  let lines = 1
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) lines++
  if (lines > MAX_IMPORT_LINES) return { ok: false, error: TOO_BIG_MESSAGE, reason: 'too_big' }

  const ext = (fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (UNSUPPORTED_EXTENSIONS.includes(ext) || looksStructured(content)) {
    return { ok: false, error: UNSUPPORTED_FILE_MESSAGE, reason: 'unsupported' }
  }

  const kind = detectManaBoxFile(content)
  if (!kind) return { ok: false, error: NO_CARDS_MESSAGE, reason: 'no_cards' }
  return { ok: true, kind }
}
