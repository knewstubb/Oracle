/**
 * Allocation Engine
 *
 * Manages proxy/original allocation decisions for shared cards across decks.
 * Records allocation state in Supabase. Archidekt write-back (Playwright) is
 * dormant — users manually copy-paste deck lists to Archidekt instead.
 *
 * GUARD: This module writes to `proxy_allocations`. It does NOT modify
 * deck_cards composition (card names, quantities, categories).
 * See: deck-authority-split spec, Requirements 6.1, 6.2.
 * See: supabase-migration spec, Requirement 7 (Playwright decommissioned).
 */

import { createServerClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SharedCardSummary {
  cardName: string
  deckCount: number
  ownedCopies: number
  deficit: number // max(0, deckCount - ownedCopies)
  decks: Array<{
    deckId: number
    deckName: string
    currentRole: 'original' | 'proxy' | 'unassigned'
  }>
}

export interface AllocationDecision {
  cardName: string
  allocations: Array<{
    deckId: number
    role: 'original' | 'proxy'
  }>
}

export interface AllocationPreview {
  cardName: string
  changes: Array<{
    deckId: number
    deckName: string
    from: 'original' | 'proxy' | 'unassigned'
    to: 'original' | 'proxy'
  }>
  archidektWrites: Array<{
    deckId: number
    deckName: string
    action: 'add_proxy_tag' | 'remove_proxy_tag'
  }>
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASIC_LANDS = new Set([
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
  'Wastes',
])

// ---------------------------------------------------------------------------
// getSharedCards
// ---------------------------------------------------------------------------

/**
 * Get all cards appearing in 2+ decks with ownership and allocation status.
 * Excludes basic lands.
 */
export async function getSharedCards(filters?: {
  minDecks?: number
  colorIdentity?: string
  cardType?: string
}): Promise<SharedCardSummary[]> {
  const supabase = createServerClient()
  const minDecks = filters?.minDecks ?? 2

  // Step 1: Get all deck_cards to compute sharing in TypeScript
  const { data: allDeckCards, error: dcErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id')

  if (dcErr) throw new Error(`Failed to fetch deck_cards: ${dcErr.message}`)

  // Count distinct deck_ids per card_name
  const cardDeckMap = new Map<string, Set<number>>()
  for (const row of allDeckCards || []) {
    if (!cardDeckMap.has(row.card_name)) {
      cardDeckMap.set(row.card_name, new Set())
    }
    cardDeckMap.get(row.card_name)!.add(row.deck_id)
  }

  // Filter to cards in minDecks+ decks, excluding basic lands
  let cardNames = [...cardDeckMap.entries()]
    .filter(([name, decks]) => decks.size >= minDecks && !BASIC_LANDS.has(name))
    .map(([name]) => name)

  if (cardNames.length === 0) return []

  // Step 2: Apply optional filters
  if (filters?.colorIdentity) {
    const identity = filters.colorIdentity
    const { data: identityRows, error: identityErr } = await supabase
      .from('collection')
      .select('card_name')
      .in('card_name', cardNames)
      .ilike('color_identity', `%${identity}%`)

    if (identityErr) throw new Error(`Failed to filter by color identity: ${identityErr.message}`)

    const identitySet = new Set((identityRows || []).map(r => r.card_name))
    cardNames = cardNames.filter(n => identitySet.has(n))
  }

  if (filters?.cardType) {
    const cardType = filters.cardType
    const { data: typeRows, error: typeErr } = await supabase
      .from('collection')
      .select('card_name')
      .in('card_name', cardNames)
      .ilike('types', `%${cardType}%`)

    if (typeErr) throw new Error(`Failed to filter by card type: ${typeErr.message}`)

    const typeSet = new Set((typeRows || []).map(r => r.card_name))
    cardNames = cardNames.filter(n => typeSet.has(n))
  }

  if (cardNames.length === 0) return []

  // Step 3: Get owned copies per card
  const { data: ownedRows, error: ownedErr } = await supabase
    .from('collection')
    .select('card_name, quantity')
    .in('card_name', cardNames)

  if (ownedErr) throw new Error(`Failed to fetch owned copies: ${ownedErr.message}`)

  // Aggregate quantities by card_name
  const ownedMap = new Map<string, number>()
  for (const row of ownedRows || []) {
    ownedMap.set(row.card_name, (ownedMap.get(row.card_name) || 0) + row.quantity)
  }

  // Step 4: Get deck associations with deck names
  const { data: deckCardRows, error: deckCardErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id, decks!inner(name)')
    .in('card_name', cardNames)

  if (deckCardErr) {
    // Fallback: fetch deck_cards and decks separately if join fails
    const { data: dcRows, error: dcErr2 } = await supabase
      .from('deck_cards')
      .select('card_name, deck_id')
      .in('card_name', cardNames)

    if (dcErr2) throw new Error(`Failed to fetch deck_cards: ${dcErr2.message}`)

    const deckIds = [...new Set((dcRows || []).map(r => r.deck_id))]
    const { data: deckRows, error: deckErr } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', deckIds)

    if (deckErr) throw new Error(`Failed to fetch decks: ${deckErr.message}`)

    const deckNameMap = new Map((deckRows || []).map(d => [d.id, d.name]))

    // Step 5: Get current allocations from proxy_allocations
    const { data: allocRows, error: allocErr } = await supabase
      .from('proxy_allocations')
      .select('card_name, deck_id, role')
      .in('card_name', cardNames)

    if (allocErr) throw new Error(`Failed to fetch proxy_allocations: ${allocErr.message}`)

    const allocMap = new Map<string, string>()
    for (const r of allocRows || []) {
      allocMap.set(`${r.card_name}|${r.deck_id}`, r.role)
    }

    // Step 6: Build results
    const decksByCard = new Map<string, Array<{ deckId: number; deckName: string }>>()
    for (const row of dcRows || []) {
      if (!decksByCard.has(row.card_name)) {
        decksByCard.set(row.card_name, [])
      }
      const existing = decksByCard.get(row.card_name)!
      if (!existing.some(d => d.deckId === row.deck_id)) {
        existing.push({ deckId: row.deck_id, deckName: deckNameMap.get(row.deck_id) || `Deck ${row.deck_id}` })
      }
    }

    return buildSharedCardResults(cardNames, decksByCard, ownedMap, allocMap, minDecks)
  }

  // Successful join path
  // Step 5: Get current allocations from proxy_allocations
  const { data: allocRows, error: allocErr } = await supabase
    .from('proxy_allocations')
    .select('card_name, deck_id, role')
    .in('card_name', cardNames)

  if (allocErr) throw new Error(`Failed to fetch proxy_allocations: ${allocErr.message}`)

  const allocMap = new Map<string, string>()
  for (const r of allocRows || []) {
    allocMap.set(`${r.card_name}|${r.deck_id}`, r.role)
  }

  // Step 6: Build results
  const decksByCard = new Map<string, Array<{ deckId: number; deckName: string }>>()
  for (const row of deckCardRows || []) {
    const deckName = (row as any).decks?.name || `Deck ${row.deck_id}`
    if (!decksByCard.has(row.card_name)) {
      decksByCard.set(row.card_name, [])
    }
    const existing = decksByCard.get(row.card_name)!
    if (!existing.some(d => d.deckId === row.deck_id)) {
      existing.push({ deckId: row.deck_id, deckName })
    }
  }

  return buildSharedCardResults(cardNames, decksByCard, ownedMap, allocMap, minDecks)
}

/**
 * Build SharedCardSummary results from prepared data.
 */
function buildSharedCardResults(
  cardNames: string[],
  decksByCard: Map<string, Array<{ deckId: number; deckName: string }>>,
  ownedMap: Map<string, number>,
  allocMap: Map<string, string>,
  minDecks: number
): SharedCardSummary[] {
  const results: SharedCardSummary[] = []

  for (const cardName of cardNames) {
    const decks = decksByCard.get(cardName) || []
    if (decks.length < minDecks) continue

    const ownedCopies = ownedMap.get(cardName) || 0
    const deckCount = decks.length
    const deficit = Math.max(0, deckCount - ownedCopies)

    const deckDetails = decks.map(d => {
      const key = `${cardName}|${d.deckId}`
      const currentRole = (allocMap.get(key) as 'original' | 'proxy') || 'unassigned'
      return {
        deckId: d.deckId,
        deckName: d.deckName,
        currentRole,
      }
    })

    results.push({
      cardName,
      deckCount,
      ownedCopies,
      deficit,
      decks: deckDetails,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// previewAllocation
// ---------------------------------------------------------------------------

/**
 * Preview what an allocation change would do before committing.
 * Returns a diff of changes and required Archidekt writes.
 */
export async function previewAllocation(decision: AllocationDecision): Promise<AllocationPreview> {
  const supabase = createServerClient()
  const { cardName, allocations } = decision
  const warnings: string[] = []

  // Get current allocations for this card
  const { data: currentAllocRows, error: allocErr } = await supabase
    .from('proxy_allocations')
    .select('deck_id, role')
    .eq('card_name', cardName)

  if (allocErr) throw new Error(`Failed to fetch current allocations: ${allocErr.message}`)

  const currentRoleMap = new Map<number, string>(
    (currentAllocRows || []).map(r => [r.deck_id, r.role])
  )

  // Get deck names
  const deckIds = allocations.map(a => a.deckId)
  let deckNameMap = new Map<number, string>()

  if (deckIds.length > 0) {
    const { data: deckRows, error: deckErr } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', deckIds)

    if (deckErr) throw new Error(`Failed to fetch deck names: ${deckErr.message}`)

    deckNameMap = new Map((deckRows || []).map(d => [d.id, d.name]))
  }

  // Build changes
  const changes: AllocationPreview['changes'] = []
  const archidektWrites: AllocationPreview['archidektWrites'] = []

  for (const alloc of allocations) {
    const from = (currentRoleMap.get(alloc.deckId) as 'original' | 'proxy') || 'unassigned'
    const to = alloc.role
    const deckName = deckNameMap.get(alloc.deckId) || `Deck ${alloc.deckId}`

    if (from === to) continue // No change needed

    changes.push({ deckId: alloc.deckId, deckName, from, to })

    // Determine Archidekt writes
    if (to === 'proxy') {
      archidektWrites.push({
        deckId: alloc.deckId,
        deckName,
        action: 'add_proxy_tag',
      })
    } else if (to === 'original' && from === 'proxy') {
      archidektWrites.push({
        deckId: alloc.deckId,
        deckName,
        action: 'remove_proxy_tag',
      })
    }
  }

  // Check owned quantity: warn if originals exceed owned copies
  const { data: ownedRows, error: ownedErr } = await supabase
    .from('collection')
    .select('quantity')
    .eq('card_name', cardName)

  if (ownedErr) throw new Error(`Failed to fetch owned copies: ${ownedErr.message}`)

  const ownedCopies = (ownedRows || []).reduce((sum, r) => sum + r.quantity, 0)

  const originalCount = allocations.filter(a => a.role === 'original').length
  if (originalCount > ownedCopies) {
    warnings.push(
      `${originalCount} deck(s) marked as original but you only own ${ownedCopies} cop${ownedCopies === 1 ? 'y' : 'ies'} of "${cardName}".`
    )
  }

  return { cardName, changes, archidektWrites, warnings }
}

// ---------------------------------------------------------------------------
// commitAllocation
// ---------------------------------------------------------------------------

/**
 * Commit an allocation: update local DB and write to Archidekt via Playwright.
 * Each deck is processed independently — failure in one does not affect others.
 */
export async function commitAllocation(
  decision: AllocationDecision
): Promise<{
  success: boolean
  results: Array<{ deckId: number; success: boolean; error?: string }>
  warnings: string[]
}> {
  const supabase = createServerClient()
  const { cardName, allocations } = decision
  const results: Array<{ deckId: number; success: boolean; error?: string }> = []
  const warnings: string[] = []

  // Check owned quantity warning
  const { data: ownedRows, error: ownedErr } = await supabase
    .from('collection')
    .select('quantity')
    .eq('card_name', cardName)

  if (ownedErr) throw new Error(`Failed to fetch owned copies: ${ownedErr.message}`)

  const ownedCopies = (ownedRows || []).reduce((sum, r) => sum + r.quantity, 0)
  const originalCount = allocations.filter(a => a.role === 'original').length
  if (originalCount > ownedCopies) {
    warnings.push(
      `${originalCount} deck(s) marked as original but you only own ${ownedCopies} cop${ownedCopies === 1 ? 'y' : 'ies'} of "${cardName}".`
    )
  }

  const userId = process.env.MIGRATION_USER_ID ?? '00000000-0000-0000-0000-000000000000'

  // Record each allocation decision in the database.
  // Playwright write-back is dormant (Requirement 7) — users manually
  // copy-paste deck lists to Archidekt. Allocations are recorded with
  // written_to_archidekt = FALSE; the push route remains available for
  // manual write-back if Playwright is ever re-enabled locally.
  for (const alloc of allocations) {
    try {
      const { error: upsertErr } = await supabase
        .from('proxy_allocations')
        .upsert(
          {
            card_name: cardName,
            deck_id: alloc.deckId,
            role: alloc.role,
            assigned_at: new Date().toISOString(),
            written_to_archidekt: false,
            written_at: null,
            user_id: userId,
          },
          { onConflict: 'card_name,deck_id' }
        )

      if (upsertErr) throw new Error(`Failed to upsert proxy allocation: ${upsertErr.message}`)
      results.push({ deckId: alloc.deckId, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[commitAllocation] Error for deck ${alloc.deckId}: ${message}`)
      results.push({ deckId: alloc.deckId, success: false, error: message })
    }
  }

  const allSucceeded = results.every(r => r.success)
  return { success: allSucceeded, results, warnings }
}
