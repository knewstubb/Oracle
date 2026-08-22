/**
 * Auto-bracket card names in text
 * 
 * The AI frequently forgets to wrap Magic card names in [[brackets]].
 * This utility detects likely card names and wraps them automatically.
 * 
 * Strategy:
 * 1. Skip text already inside [[brackets]]
 * 2. Look for patterns like "Name, Subtitle" or known card name patterns
 * 3. Validate against a set of known card names (loaded on demand)
 */

// ---------------------------------------------------------------------------
// Known Card Name Set (lazy-loaded)
// ---------------------------------------------------------------------------

let knownCardNames: Set<string> | null = null
let loadingPromise: Promise<Set<string>> | null = null

/**
 * Load known card names from the API (lazy, cached).
 * Returns a Set of lowercase card names for fast lookup.
 */
async function loadKnownCardNames(): Promise<Set<string>> {
  if (knownCardNames) return knownCardNames
  
  if (loadingPromise) return loadingPromise
  
  loadingPromise = (async () => {
    try {
      const res = await fetch('/api/cards/names')
      if (!res.ok) {
        console.warn('[auto-bracket] Failed to load card names, using pattern matching only')
        return new Set<string>()
      }
      const data = await res.json()
      const names = new Set<string>(
        (data.names as string[]).map(n => n.toLowerCase())
      )
      knownCardNames = names
      return names
    } catch (e) {
      console.warn('[auto-bracket] Error loading card names:', e)
      return new Set<string>()
    }
  })()
  
  return loadingPromise
}

// ---------------------------------------------------------------------------
// Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Common Magic card name patterns:
 * - "Word, the Subtitle" (e.g., "Korvold, Fae-Cursed King")
 * - "Word Word" with title case (e.g., "Sol Ring")
 * - "The Noun Noun" (e.g., "The Eldest Reborn")
 * 
 * We look for Title Case patterns that match card name conventions.
 */

// Pattern for "Name, Subtitle" style names (very common for legendary creatures)
const COMMA_NAME_PATTERN = /\b([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*),\s+(?:the\s+)?([A-Z][a-zA-Z\s'-]+?)(?=[.!?,;:\s]|$)/g

// Pattern for multi-word title case names (2-5 words)
// This catches things like "Sol Ring", "Demonic Tutor", "Phyrexian Arena"
const TITLE_CASE_PATTERN = /\b([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*)(?:\s+(?:of|the|and|to|in|for|from|with|on|at|as)\s+|\s+)([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*)(?:(?:\s+(?:of|the|and|to|in|for|from|with|on|at|as)\s+|\s+)([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*))?(?:(?:\s+(?:of|the|and|to|in|for|from|with|on|at|as)\s+|\s+)([A-Z][a-z]+(?:[-'][A-Z]?[a-z]+)*))?(?=[.!?,;:\s]|$)/g

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Auto-bracket card names in text.
 * 
 * @param text - The text to process
 * @param knownNames - Optional set of known card names (lowercase). If not provided, uses pattern matching only.
 * @returns Text with detected card names wrapped in [[brackets]]
 */
export function autoBracketCards(text: string, knownNames?: Set<string>): string {
  // Don't process empty text
  if (!text || text.length === 0) return text
  
  // Split on existing brackets to avoid double-bracketing
  const segments = splitPreservingBrackets(text)
  
  return segments.map(segment => {
    // If segment is already bracketed, return as-is
    if (segment.startsWith('[[') && segment.endsWith(']]')) {
      return segment
    }
    
    // Process this segment for card names
    return bracketCardNamesInSegment(segment, knownNames)
  }).join('')
}

/**
 * Split text into segments, preserving [[bracketed]] content.
 */
function splitPreservingBrackets(text: string): string[] {
  const segments: string[] = []
  let lastIndex = 0
  
  // Match [[anything]]
  const bracketPattern = /\[\[[^\]]+\]\]/g
  let match
  
  while ((match = bracketPattern.exec(text)) !== null) {
    // Add text before this bracket
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index))
    }
    // Add the bracketed content
    segments.push(match[0])
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex))
  }
  
  return segments
}

/**
 * Find and bracket card names in a text segment.
 */
function bracketCardNamesInSegment(text: string, knownNames?: Set<string>): string {
  const cardMatches: Array<{ start: number; end: number; name: string }> = []
  
  // First, find "Name, Subtitle" patterns (high confidence)
  let match
  COMMA_NAME_PATTERN.lastIndex = 0
  while ((match = COMMA_NAME_PATTERN.exec(text)) !== null) {
    const fullName = match[0].trim()
    // Clean trailing punctuation that might have been captured
    const cleanName = fullName.replace(/[.!?,;:]+$/, '')
    
    // Check if this looks like a card name
    if (knownNames) {
      if (knownNames.has(cleanName.toLowerCase())) {
        cardMatches.push({
          start: match.index,
          end: match.index + cleanName.length,
          name: cleanName,
        })
      }
    } else {
      // Without a name list, trust the pattern for "Name, Subtitle" style
      cardMatches.push({
        start: match.index,
        end: match.index + cleanName.length,
        name: cleanName,
      })
    }
  }
  
  // Second, find title case patterns (only if we have known names to validate)
  if (knownNames && knownNames.size > 0) {
    TITLE_CASE_PATTERN.lastIndex = 0
    while ((match = TITLE_CASE_PATTERN.exec(text)) !== null) {
      const fullMatch = match[0].trim()
      const cleanName = fullMatch.replace(/[.!?,;:]+$/, '')
      
      // Check against known names
      if (knownNames.has(cleanName.toLowerCase())) {
        // Make sure we don't overlap with existing matches
        const overlaps = cardMatches.some(m => 
          (match!.index >= m.start && match!.index < m.end) ||
          (match!.index + cleanName.length > m.start && match!.index + cleanName.length <= m.end)
        )
        
        if (!overlaps) {
          cardMatches.push({
            start: match.index,
            end: match.index + cleanName.length,
            name: cleanName,
          })
        }
      }
    }
  }
  
  // Sort by position (reverse order for safe replacement)
  cardMatches.sort((a, b) => b.start - a.start)
  
  // Replace matches with bracketed versions
  let result = text
  for (const m of cardMatches) {
    result = result.slice(0, m.start) + `[[${m.name}]]` + result.slice(m.end)
  }
  
  return result
}

/**
 * Async version that loads known card names first.
 * Use this for best accuracy.
 */
export async function autoBracketCardsAsync(text: string): Promise<string> {
  const names = await loadKnownCardNames()
  return autoBracketCards(text, names)
}

/**
 * Synchronous version using only pattern matching (no database validation).
 * Less accurate but doesn't require API call.
 * Only brackets "Name, Subtitle" patterns which are high-confidence.
 */
export function autoBracketCardsSync(text: string): string {
  return autoBracketCards(text)
}
