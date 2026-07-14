#!/usr/bin/env npx tsx
/**
 * Legacy Allocation Transfer Script
 *
 * Transfers `deck_allocations.role` to `deck_cards.ownership_status` and
 * attempts to populate `deck_cards.physical_copy_id` where possible.
 *
 * Steps:
 *   1. Read all deck_allocations rows
 *   2. For each, match against deck_cards by card_name + deck_id
 *   3. Map 'original' → 'original', 'proxy' → 'not_owned'
 *   4. Preserve existing non-null ownership_status on conflict (log it)
 *   5. Log unmatched deck_allocations rows (no matching deck_cards row)
 *   6. Attempt physical_copy_id population by matching card_name + set_code
 *      against non-proxy, unassigned physical copies
 *   7. Leave physical_copy_id NULL when no matching copy found
 *   8. Output migration summary
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.local before any other imports
config({ path: resolve(__dirname, '..', '.env.local') })

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeckAllocationRow {
  id: number
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  collector_number: string | null
  deck_id: number
  role: 'original' | 'proxy'
  user_id: string
}

interface DeckCardRow {
  id: number
  deck_id: number
  card_name: string
  scryfall_id: string | null
  set_code: string | null
  ownership_status: string | null
  physical_copy_id: number | null
  user_id: string
}

interface ConflictLog {
  cardName: string
  deckId: number
  existingValue: string
  incomingValue: string
}

interface UnmatchedLog {
  cardName: string
  deckId: number
  allocationId: number
}

interface MigrationSummary {
  totalAllocations: number
  rowsMapped: number
  rowsSkipped: number       // no matching deck_cards row
  conflictsPreserved: number
  physicalCopyAssignments: number
  durationMs: number
  conflicts: ConflictLog[]
  unmatched: UnmatchedLog[]
}

// ---------------------------------------------------------------------------
// Role → ownership_status mapping
// ---------------------------------------------------------------------------

/**
 * Maps deck_allocations.role to deck_cards.ownership_status.
 * 'original' → 'original', 'proxy' → 'not_owned'
 */
export function mapRoleToOwnershipStatus(role: 'original' | 'proxy'): string {
  const mapping: Record<string, string> = {
    original: 'original',
    proxy: 'not_owned',
  }
  return mapping[role] ?? 'not_owned'
}

// ---------------------------------------------------------------------------
// Main migration logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now()

  // Dynamic import after env is loaded
  const { createAdminClient } = await import('../src/lib/supabase')
  const supabase = createAdminClient()

  console.log('[legacy-transfer] Starting legacy allocation transfer...')

  // -------------------------------------------------------------------------
  // Step 1: Fetch all deck_allocations rows
  // -------------------------------------------------------------------------
  const { data: allocations, error: allocError } = await supabase
    .from('deck_allocations')
    .select('*')
    .order('deck_id', { ascending: true })

  if (allocError) {
    console.error('[legacy-transfer] ❌ Failed to fetch deck_allocations:', allocError.message)
    process.exit(1)
  }

  const allocationRows = (allocations ?? []) as unknown as DeckAllocationRow[]

  if (allocationRows.length === 0) {
    console.log('[legacy-transfer] No deck_allocations rows found. Nothing to transfer.')
    return
  }

  console.log(`[legacy-transfer] Found ${allocationRows.length} deck_allocations rows to process.`)

  // -------------------------------------------------------------------------
  // Step 2: Fetch all deck_cards rows (for matching)
  // -------------------------------------------------------------------------
  const { data: deckCards, error: dcError } = await supabase
    .from('deck_cards')
    .select('id, deck_id, card_name, scryfall_id, set_code, ownership_status, physical_copy_id, user_id')
    .order('deck_id', { ascending: true })

  if (dcError) {
    console.error('[legacy-transfer] ❌ Failed to fetch deck_cards:', dcError.message)
    process.exit(1)
  }

  const deckCardRows = (deckCards ?? []) as unknown as DeckCardRow[]
  console.log(`[legacy-transfer] Found ${deckCardRows.length} deck_cards rows for matching.`)

  // Build a lookup map: key = `${card_name}__${deck_id}` → DeckCardRow[]
  const deckCardMap = new Map<string, DeckCardRow[]>()
  for (const dc of deckCardRows) {
    const key = `${dc.card_name}__${dc.deck_id}`
    const existing = deckCardMap.get(key) ?? []
    existing.push(dc)
    deckCardMap.set(key, existing)
  }

  // -------------------------------------------------------------------------
  // Step 3: Process allocations — map role to ownership_status
  // -------------------------------------------------------------------------
  let rowsMapped = 0
  let rowsSkipped = 0
  let conflictsPreserved = 0
  const conflicts: ConflictLog[] = []
  const unmatched: UnmatchedLog[] = []

  // Track deck_card IDs that were mapped (for physical_copy_id population later)
  const mappedDeckCardIds: number[] = []

  for (const alloc of allocationRows) {
    const key = `${alloc.card_name}__${alloc.deck_id}`
    const matchingDeckCards = deckCardMap.get(key)

    if (!matchingDeckCards || matchingDeckCards.length === 0) {
      // Requirement 7.3: Log unmatched rows
      rowsSkipped++
      unmatched.push({
        cardName: alloc.card_name,
        deckId: alloc.deck_id,
        allocationId: alloc.id,
      })
      continue
    }

    const targetOwnershipStatus = mapRoleToOwnershipStatus(alloc.role)

    // Apply mapping to each matching deck_cards row (Requirement 7.2)
    for (const dc of matchingDeckCards) {
      if (dc.ownership_status !== null) {
        // Requirement 7.4: Preserve existing non-null ownership_status on conflict
        if (dc.ownership_status !== targetOwnershipStatus) {
          conflictsPreserved++
          conflicts.push({
            cardName: dc.card_name,
            deckId: dc.deck_id,
            existingValue: dc.ownership_status,
            incomingValue: targetOwnershipStatus,
          })
        }
        // Either way, existing non-null value preserved — skip update
        continue
      }

      // Update ownership_status on this deck_cards row
      const { error: updateError } = await supabase
        .from('deck_cards')
        .update({ ownership_status: targetOwnershipStatus })
        .eq('id', dc.id)

      if (updateError) {
        console.warn(`[legacy-transfer] ⚠️  Failed to update deck_cards id=${dc.id}: ${updateError.message}`)
        continue
      }

      rowsMapped++
      mappedDeckCardIds.push(dc.id)

      // Update the local copy so physical_copy_id population has accurate state
      dc.ownership_status = targetOwnershipStatus
    }
  }

  console.log(`[legacy-transfer] Ownership status mapping complete.`)
  console.log(`  Mapped: ${rowsMapped}, Skipped: ${rowsSkipped}, Conflicts preserved: ${conflictsPreserved}`)

  // -------------------------------------------------------------------------
  // Step 4: Attempt physical_copy_id population (Requirement 7.5, 7.6)
  // -------------------------------------------------------------------------
  console.log('[legacy-transfer] Attempting physical_copy_id population...')

  // Fetch physical copies that are non-proxy for matching
  const { data: physicalCopies, error: pcError } = await supabase
    .from('physical_copies')
    .select('id, card_definition_id, scryfall_printing_id, is_proxy, user_id')
    .eq('is_proxy', false)

  if (pcError) {
    console.error('[legacy-transfer] ❌ Failed to fetch physical_copies:', pcError.message)
    process.exit(1)
  }

  // Fetch card_definitions to map card_name → card_definition_id
  const { data: cardDefs, error: cdError } = await supabase
    .from('card_definitions')
    .select('id, card_name')

  if (cdError) {
    console.error('[legacy-transfer] ❌ Failed to fetch card_definitions:', cdError.message)
    process.exit(1)
  }

  const cardDefRows = (cardDefs ?? []) as { id: number; card_name: string }[]
  const pcRows = (physicalCopies ?? []) as {
    id: number
    card_definition_id: number
    scryfall_printing_id: string | null
    is_proxy: boolean
    user_id: string
  }[]

  // Build card_name → card_definition_ids map
  const cardNameToDefIds = new Map<string, number[]>()
  for (const cd of cardDefRows) {
    const existing = cardNameToDefIds.get(cd.card_name) ?? []
    existing.push(cd.id)
    cardNameToDefIds.set(cd.card_name, existing)
  }

  // Build card_definition_id → physical_copy_ids (non-proxy only)
  const defIdToPhysicalCopyIds = new Map<number, number[]>()
  for (const pc of pcRows) {
    const existing = defIdToPhysicalCopyIds.get(pc.card_definition_id) ?? []
    existing.push(pc.id)
    defIdToPhysicalCopyIds.set(pc.card_definition_id, existing)
  }

  // Track assigned physical_copy_ids (already assigned in deck_cards)
  const { data: assignedCopies, error: assignedError } = await supabase
    .from('deck_cards')
    .select('physical_copy_id')
    .not('physical_copy_id', 'is', null)

  if (assignedError) {
    console.error('[legacy-transfer] ❌ Failed to fetch assigned copies:', assignedError.message)
    process.exit(1)
  }

  const alreadyAssigned = new Set<number>(
    ((assignedCopies ?? []) as { physical_copy_id: number }[])
      .map(row => row.physical_copy_id)
  )

  let physicalCopyAssignments = 0

  // For each deck_cards row that has ownership_status = 'original' and no physical_copy_id,
  // attempt to find and assign a matching physical copy
  for (const dc of deckCardRows) {
    // Only try to assign physical copies to rows with 'original' status and no existing assignment
    if (dc.ownership_status !== 'original' || dc.physical_copy_id !== null) {
      continue
    }

    // Find card_definition_ids for this card_name
    const defIds = cardNameToDefIds.get(dc.card_name)
    if (!defIds || defIds.length === 0) {
      continue
    }

    // Find available (unassigned, non-proxy) physical copies for these def IDs
    let assignedCopyId: number | null = null

    for (const defId of defIds) {
      const availableCopies = defIdToPhysicalCopyIds.get(defId) ?? []

      for (const copyId of availableCopies) {
        if (!alreadyAssigned.has(copyId)) {
          assignedCopyId = copyId
          break
        }
      }

      if (assignedCopyId !== null) break
    }

    if (assignedCopyId === null) {
      // Requirement 7.6: Leave physical_copy_id NULL when no match found
      continue
    }

    // Assign the physical copy
    const { error: assignError } = await supabase
      .from('deck_cards')
      .update({ physical_copy_id: assignedCopyId })
      .eq('id', dc.id)

    if (assignError) {
      console.warn(`[legacy-transfer] ⚠️  Failed to assign physical_copy_id to deck_cards id=${dc.id}: ${assignError.message}`)
      continue
    }

    // Mark as assigned so we don't reuse it
    alreadyAssigned.add(assignedCopyId)
    physicalCopyAssignments++
  }

  // -------------------------------------------------------------------------
  // Step 5: Output migration summary (Requirement 7.7)
  // -------------------------------------------------------------------------
  const durationMs = Date.now() - startTime
  const summary: MigrationSummary = {
    totalAllocations: allocationRows.length,
    rowsMapped,
    rowsSkipped,
    conflictsPreserved,
    physicalCopyAssignments,
    durationMs,
    conflicts,
    unmatched,
  }

  const elapsed = (durationMs / 1000).toFixed(1)
  console.log(`\n[legacy-transfer] ✅ Migration complete in ${elapsed}s`)
  console.log(`  Total deck_allocations rows: ${summary.totalAllocations}`)
  console.log(`  Rows mapped:                 ${summary.rowsMapped}`)
  console.log(`  Rows skipped (unmatched):    ${summary.rowsSkipped}`)
  console.log(`  Conflicts preserved:         ${summary.conflictsPreserved}`)
  console.log(`  Physical copy assignments:   ${summary.physicalCopyAssignments}`)

  if (summary.unmatched.length > 0) {
    console.log(`\n  ⚠️  Unmatched allocations (${summary.unmatched.length}):`)
    for (const u of summary.unmatched.slice(0, 20)) {
      console.log(`    - [alloc ${u.allocationId}] "${u.cardName}" in deck ${u.deckId}`)
    }
    if (summary.unmatched.length > 20) {
      console.log(`    ... and ${summary.unmatched.length - 20} more`)
    }
  }

  if (summary.conflicts.length > 0) {
    console.log(`\n  ⚠️  Conflicts preserved (${summary.conflicts.length}):`)
    for (const c of summary.conflicts.slice(0, 20)) {
      console.log(`    - "${c.cardName}" in deck ${c.deckId}: kept "${c.existingValue}", incoming was "${c.incomingValue}"`)
    }
    if (summary.conflicts.length > 20) {
      console.log(`    ... and ${summary.conflicts.length - 20} more`)
    }
  }
}

main().catch(err => {
  console.error('[legacy-transfer] ❌ Unhandled error:', err)
  process.exit(1)
})
