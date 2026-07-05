/**
 * Archidekt Sync — Connects allocation diffs to Playwright writes
 *
 * Bridges the allocation engine's output to the Archidekt Playwright layer:
 * 1. Groups allocation changes by deck (one browser navigation per deck)
 * 2. Uses markAsProxy/unmarkAsProxy for text manipulation
 * 3. Records success/failure in deck_allocations.written_to_archidekt
 * 4. Provides retryFailedWrites for unwritten records
 * 5. Includes read-back verification after writing
 * 6. Orchestrates post-delta pipeline: resolveOwnership → tag write-back (gated)
 *
 * Note: Playwright automation remains dormant per Requirement 7.2.
 * Only DB read/write operations are converted to Supabase.
 *
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3
 */

import { createAdminClient } from '@/lib/supabase'
import type { AllocationDiff } from './allocation-store'
import type { AllocationRecord } from './allocation-resolver'
import { markAsProxy, unmarkAsProxy, PROXY_TAG, PROXY_CATEGORY } from './archidekt-playwright'
import { resolveOwnership } from './ownership-resolver'
import type { DenormalisationResult } from './ownership-resolver'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dependency injection for Playwright operations */
export interface ArchidektPlaywrightClient {
  /** Get the Import Text for a deck */
  getImportText(deckId: number): Promise<string>
  /** Set the Import Text for a deck (navigates to import page, pastes, saves) */
  setImportText(deckId: number, text: string): Promise<void>
}

export interface WriteResult {
  deckId: number
  success: boolean
  error?: string
  cardsWritten: number
  cardsVerified: number
}

/** Internal type for grouping changes per deck */
interface DeckChangeGroup {
  deckId: number
  changes: Array<{
    cardName: string
    newRole: 'original' | 'proxy'
  }>
}

// ---------------------------------------------------------------------------
// writeAllocationDiffToArchidekt
// ---------------------------------------------------------------------------

/**
 * Write allocation diff changes to Archidekt via Playwright.
 * Groups changes by deck ID (one navigation per deck).
 * Records success/failure in deck_allocations.written_to_archidekt.
 */
export async function writeAllocationDiffToArchidekt(
  diff: AllocationDiff,
  client: ArchidektPlaywrightClient,
  userId: string
): Promise<WriteResult[]> {
  // 1. Collect all changed records from the diff
  const changedRecords: AllocationRecord[] = [
    ...diff.originalToProxy,
    ...diff.proxyToOriginal,
    // Include added records where role assignment matters (they need label writes)
    ...diff.added,
  ]

  if (changedRecords.length === 0) {
    return []
  }

  // 2. Group by deck_id
  const deckGroups = groupByDeck(changedRecords)

  // 3. Process each deck
  const results: WriteResult[] = []

  for (const group of deckGroups) {
    const result = await processDeckGroup(group, client, userId)
    results.push(result)
  }

  return results
}

// ---------------------------------------------------------------------------
// retryFailedWrites
// ---------------------------------------------------------------------------

/**
 * Retry previously failed writes.
 * Reads deck_allocations records where written_to_archidekt = FALSE,
 * groups by deck, and attempts to write them.
 */
export async function retryFailedWrites(
  client: ArchidektPlaywrightClient,
  userId: string
): Promise<WriteResult[]> {
  const supabase = createAdminClient()

  // Find all unwritten allocation records for the current user
  const { data: unwrittenRows, error } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role')
    .eq('written_to_archidekt', false)
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Failed to fetch unwritten allocations: ${error.message}`)
  }

  if (!unwrittenRows || unwrittenRows.length === 0) {
    return []
  }

  // Convert to AllocationRecord-like shape and group by deck
  const records: AllocationRecord[] = unwrittenRows.map(row => ({
    cardName: row.card_name,
    deckId: row.deck_id,
    role: row.role as 'original' | 'proxy',
    scryfallId: null,
    setCode: null,
    collectorNumber: null,
    priorityOverride: false,
  }))

  const deckGroups = groupByDeck(records)

  const results: WriteResult[] = []

  for (const group of deckGroups) {
    const result = await processDeckGroup(group, client, userId)
    results.push(result)
  }

  return results
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Group allocation records by deck ID for batch processing.
 */
function groupByDeck(records: AllocationRecord[]): DeckChangeGroup[] {
  const groupMap = new Map<number, DeckChangeGroup>()

  for (const record of records) {
    let group = groupMap.get(record.deckId)
    if (!group) {
      group = { deckId: record.deckId, changes: [] }
      groupMap.set(record.deckId, group)
    }
    group.changes.push({
      cardName: record.cardName,
      newRole: record.role,
    })
  }

  return Array.from(groupMap.values())
}

/**
 * Process a single deck's changes: get text, apply changes, write back, verify.
 */
async function processDeckGroup(
  group: DeckChangeGroup,
  client: ArchidektPlaywrightClient,
  userId: string
): Promise<WriteResult> {
  const { deckId, changes } = group

  try {
    // a. Get current import text from Archidekt
    const currentText = await client.getImportText(deckId)

    // b. Apply changes to text
    let modifiedText = currentText
    for (const change of changes) {
      if (change.newRole === 'proxy') {
        modifiedText = markAsProxy(modifiedText, change.cardName)
      } else {
        modifiedText = unmarkAsProxy(modifiedText, change.cardName)
      }
    }

    // c. Write modified text back to Archidekt
    await client.setImportText(deckId, modifiedText)

    // d. Read-back verification: fetch text again and confirm changes are present
    const verificationText = await client.getImportText(deckId)
    let cardsVerified = 0

    for (const change of changes) {
      const verified = verifyCardInText(verificationText, change.cardName, change.newRole)
      if (verified) {
        cardsVerified++
      }
    }

    // e. If verification passed for all cards, mark as written
    const allVerified = cardsVerified === changes.length

    if (allVerified) {
      // On success: UPDATE deck_allocations SET written_to_archidekt = TRUE, written_at = now
      const supabase = createAdminClient()
      const now = new Date().toISOString()

      for (const change of changes) {
        const { error } = await supabase
          .from('deck_allocations')
          .update({ written_to_archidekt: true, written_at: now })
          .eq('card_name', change.cardName)
          .eq('deck_id', deckId)
          .eq('user_id', userId)

        if (error) {
          console.error(`[archidekt-sync] Failed to mark allocation as written: ${error.message}`, {
            cardName: change.cardName,
            deckId,
          })
        }
      }

      return {
        deckId,
        success: true,
        cardsWritten: changes.length,
        cardsVerified,
      }
    } else {
      // Verification failed: write went through but some cards didn't verify
      return {
        deckId,
        success: false,
        error: `Verification failed: ${cardsVerified}/${changes.length} cards verified`,
        cardsWritten: changes.length,
        cardsVerified,
      }
    }
  } catch (err) {
    // On failure: leave written_to_archidekt = FALSE, record error
    const errorMessage = err instanceof Error ? err.message : String(err)
    return {
      deckId,
      success: false,
      error: errorMessage,
      cardsWritten: 0,
      cardsVerified: 0,
    }
  }
}

/**
 * Verify that a card's proxy status in the import text matches the expected role.
 *
 * For role = 'proxy': the card line should contain PROXY_TAG and PROXY_CATEGORY
 * For role = 'original': the card line should NOT contain PROXY_TAG or PROXY_CATEGORY
 */
function verifyCardInText(text: string, cardName: string, expectedRole: 'original' | 'proxy'): boolean {
  // Build a regex to find the card line
  const escaped = cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`^\\d+x\\s+${escaped}(.*)$`, 'im')
  const match = text.match(regex)

  if (!match) {
    // Card not found in text — can't verify
    return false
  }

  const fullLine = match[0]
  const hasProxyTag = fullLine.includes(PROXY_TAG)
  const hasProxyCategory = fullLine.includes(`[${PROXY_CATEGORY}]`) ||
    fullLine.match(/\[[^\]]*Proxy[^\]]*\]/) !== null

  if (expectedRole === 'proxy') {
    // Should have both proxy tag and proxy category
    return hasProxyTag && hasProxyCategory
  } else {
    // Should have neither proxy tag nor proxy category
    return !hasProxyTag && !hasProxyCategory
  }
}

// ---------------------------------------------------------------------------
// resolveAndSync — Post-delta pipeline orchestrator
// ---------------------------------------------------------------------------

/** Result of the post-delta ownership resolution and sync pipeline */
export interface ResolveAndSyncResult {
  ownershipResolved: boolean
  denormalisation?: DenormalisationResult
  diff?: AllocationDiff
  tagWriteResults?: WriteResult[]
  error?: string
}

/**
 * Execute the post-delta pipeline: ownership resolution → tag write-back.
 *
 * Called immediately after delta application in the sync flow.
 * Gates recommendation generation behind successful resolution.
 *
 * Pipeline ordering (Req 3.1, 3.2):
 *   Sync delta applied → resolveOwnership() → recommendations / tag write-back
 *
 * On resolver failure (Req 3.3):
 *   Catches error, logs { deckId, error }, halts downstream processing.
 *
 * Validates: Requirements 2.1, 2.6, 3.1, 3.2, 3.3
 */
export async function resolveAndSync(
  client: ArchidektPlaywrightClient | null,
  deckId?: number,
  userId?: string
): Promise<ResolveAndSyncResult> {
  // Step 1: Run ownership resolution (allocation + denormalisation)
  let diff: AllocationDiff
  let denormalisation: DenormalisationResult
  try {
    const resolved = await resolveOwnership()
    diff = resolved.diff
    denormalisation = resolved.result
  } catch (err) {
    // Resolver failure: log and halt downstream processing
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[archidekt-sync] Ownership resolution failed', {
      deckId: deckId ?? 'all',
      error: errorMessage,
    })
    return {
      ownershipResolved: false,
      error: errorMessage,
    }
  }

  // Step 2: Gate — only proceed with tag write-back if resolution succeeded
  // Recommendation generation is gated behind ownershipResolved=true
  let tagWriteResults: WriteResult[] | undefined
  if (client && (diff.originalToProxy.length > 0 || diff.proxyToOriginal.length > 0 || diff.added.length > 0)) {
    tagWriteResults = await writeAllocationDiffToArchidekt(diff, client, userId ?? '')
  }

  return {
    ownershipResolved: true,
    denormalisation,
    diff,
    tagWriteResults,
  }
}
