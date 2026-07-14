/**
 * Allocation Persistence Layer
 *
 * Bridge between the Supabase database and the pure allocation resolver.
 * Reads DB state to build AllocationInput, writes AllocationOutput back atomically,
 * and provides query functions for reading allocation state.
 *
 * Validates: Requirements 1.3, 1.4, 7.2, 7.3
 */

import { createAdminClient } from '@/lib/supabase'
import type {
  AllocationInput,
  AllocationOutput,
  AllocationRecord,
  PrintingSupply,
  ProxyReportEntry,
} from './allocation-resolver'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AllocationDiff {
  added: AllocationRecord[]            // new records (card didn't have allocation before)
  removed: AllocationRecord[]          // records removed (card no longer in deck)
  originalToProxy: AllocationRecord[]  // was original, now proxy
  proxyToOriginal: AllocationRecord[]  // was proxy, now original
  unchanged: AllocationRecord[]        // no change
}

// ---------------------------------------------------------------------------
// Build Input
// ---------------------------------------------------------------------------

/**
 * Build AllocationInput from the database state.
 * Reads: deck_cards (demand), collection (supply), deck_priority, deck_allocations (overrides).
 *
 * @param externalOverrides - Optional map of external overrides (e.g. from Archidekt proxy tags)
 *   that are merged into the overrides map. DB-persisted overrides take precedence over external ones.
 */
export async function buildAllocationInput(
  externalOverrides?: Map<string, 'pin_original' | 'pin_proxy'>
): Promise<AllocationInput> {
  const supabase = createAdminClient()

  // 1. Build demandMap: card_name → list of deck IDs (active decks only)
  const demandMap = new Map<string, number[]>()
  const { data: deckCardsRows, error: deckCardsErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id, decks!deck_cards_deck_id_fkey(status)')
    .eq('decks.status', 'active')

  if (deckCardsErr) throw new Error(`Failed to fetch deck_cards: ${deckCardsErr.message}`)

  for (const row of deckCardsRows || []) {
    // Skip non-active decks (PostgREST returns null for filtered joins)
    if (!row.decks) continue

    const existing = demandMap.get(row.card_name)
    if (existing) {
      if (!existing.includes(row.deck_id)) {
        existing.push(row.deck_id)
      }
    } else {
      demandMap.set(row.card_name, [row.deck_id])
    }
  }

  // 2. Build supplyMap: card_name → list of PrintingSupply
  const supplyMap = new Map<string, PrintingSupply[]>()
  const { data: collectionRows, error: collectionErr } = await supabase
    .from('collection')
    .select('card_name, scryfall_id, set_code, collector_number, quantity, foil')

  if (collectionErr) throw new Error(`Failed to fetch collection: ${collectionErr.message}`)

  for (const row of collectionRows || []) {
    if (!row.scryfall_id) continue // skip entries without scryfall_id
    const printing: PrintingSupply = {
      scryfallId: row.scryfall_id,
      setCode: row.set_code || '',
      collectorNumber: row.collector_number || '',
      quantity: row.quantity,
      isFoil: Boolean(row.foil),
    }
    const existing = supplyMap.get(row.card_name)
    if (existing) {
      existing.push(printing)
    } else {
      supplyMap.set(row.card_name, [printing])
    }
  }

  // 3. Build deckPriority: deck_id → priority
  const deckPriority = new Map<number, number>()
  const { data: priorityRows, error: priorityErr } = await supabase
    .from('deck_priority')
    .select('deck_id, priority')

  if (priorityErr) throw new Error(`Failed to fetch deck_priority: ${priorityErr.message}`)

  for (const row of priorityRows || []) {
    deckPriority.set(row.deck_id, row.priority)
  }

  // 4. Build overrides: "card_name|deck_id" → 'pin_original' | 'pin_proxy'
  // Start with external overrides (e.g. from Archidekt proxy tags), then layer DB overrides on top
  const overrides = new Map<string, 'pin_original' | 'pin_proxy'>(externalOverrides)
  const { data: overrideRows, error: overrideErr } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role')
    .eq('priority_override', true)

  if (overrideErr) throw new Error(`Failed to fetch deck_allocations overrides: ${overrideErr.message}`)

  // DB-persisted overrides take precedence over external ones
  for (const row of overrideRows || []) {
    const key = `${row.card_name}|${row.deck_id}`
    overrides.set(key, row.role === 'original' ? 'pin_original' : 'pin_proxy')
  }

  // 5. Build preferredPrintings: "card_name|deck_id" → scryfall_id
  const preferredPrintings = new Map<string, string>()
  const { data: preferredRows, error: preferredErr } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id, scryfall_id')
    .not('scryfall_id', 'is', null)

  if (preferredErr) throw new Error(`Failed to fetch preferred printings: ${preferredErr.message}`)

  for (const row of preferredRows || []) {
    if (row.scryfall_id) {
      const key = `${row.card_name}|${row.deck_id}`
      preferredPrintings.set(key, row.scryfall_id)
    }
  }

  return { demandMap, supplyMap, deckPriority, overrides, preferredPrintings }
}

// ---------------------------------------------------------------------------
// Apply Output
// ---------------------------------------------------------------------------

/**
 * Write AllocationOutput to deck_allocations atomically.
 * Computes the diff against previous state and returns it.
 */
export async function applyAllocationOutput(output: AllocationOutput): Promise<AllocationDiff> {
  const supabase = createAdminClient()

  const diff: AllocationDiff = {
    added: [],
    removed: [],
    originalToProxy: [],
    proxyToOriginal: [],
    unchanged: [],
  }

  // Read existing allocations
  const { data: existingRows, error: existingErr } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role, scryfall_id, set_code, collector_number, priority_override, written_to_archidekt, assigned_at, user_id')

  if (existingErr) throw new Error(`Failed to fetch existing allocations: ${existingErr.message}`)

  // Build lookup map: "card_name|deck_id" → existing record
  const existingMap = new Map<string, (typeof existingRows)[number]>()
  for (const row of existingRows || []) {
    existingMap.set(`${row.card_name}|${row.deck_id}`, row)
  }

  // Track which existing records are still in the new output
  const newKeys = new Set<string>()

  // Process all new allocations - upsert each one
  for (const alloc of output.allocations) {
    const key = `${alloc.cardName}|${alloc.deckId}`
    newKeys.add(key)

    const existing = existingMap.get(key)

    if (!existing) {
      diff.added.push(alloc)
    } else if (existing.role !== alloc.role) {
      if (existing.role === 'original' && alloc.role === 'proxy') {
        diff.originalToProxy.push(alloc)
      } else if (existing.role === 'proxy' && alloc.role === 'original') {
        diff.proxyToOriginal.push(alloc)
      }
    } else {
      diff.unchanged.push(alloc)
    }

    // Determine whether to reset written_to_archidekt and assigned_at
    const roleChanged = existing && (existing.role !== alloc.role || existing.scryfall_id !== alloc.scryfallId)

    const { error: upsertErr } = await supabase
      .from('deck_allocations')
      .upsert(
        {
          card_name: alloc.cardName,
          scryfall_id: alloc.scryfallId,
          set_code: alloc.setCode,
          collector_number: alloc.collectorNumber,
          deck_id: alloc.deckId,
          role: alloc.role,
          priority_override: alloc.priorityOverride,
          written_to_archidekt: roleChanged ? false : (existing?.written_to_archidekt ?? false),
          assigned_at: roleChanged ? new Date().toISOString() : (existing?.assigned_at ?? new Date().toISOString()),
          user_id: existing?.user_id ?? '',
        },
        { onConflict: 'card_name,deck_id' }
      )

    if (upsertErr) throw new Error(`Failed to upsert allocation for ${alloc.cardName}: ${upsertErr.message}`)
  }

  // Find removed records (in existing but not in new output) and delete them
  for (const [key, existing] of existingMap) {
    if (!newKeys.has(key)) {
      diff.removed.push({
        cardName: existing.card_name,
        deckId: existing.deck_id,
        role: existing.role as 'original' | 'proxy',
        scryfallId: existing.scryfall_id,
        setCode: existing.set_code,
        collectorNumber: existing.collector_number,
        priorityOverride: Boolean(existing.priority_override),
      })

      const { error: deleteErr } = await supabase
        .from('deck_allocations')
        .delete()
        .eq('card_name', existing.card_name)
        .eq('deck_id', existing.deck_id)

      if (deleteErr) throw new Error(`Failed to delete allocation: ${deleteErr.message}`)
    }
  }

  return diff
}

// ---------------------------------------------------------------------------
// Query Functions
// ---------------------------------------------------------------------------

/**
 * Get all allocations for a specific deck.
 */
export async function getAllocationsForDeck(deckId: number): Promise<AllocationRecord[]> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role, scryfall_id, set_code, collector_number, priority_override')
    .eq('deck_id', deckId)

  if (error) throw new Error(`Failed to fetch allocations for deck ${deckId}: ${error.message}`)

  return (rows || []).map(rowToAllocationRecord)
}

/**
 * Get all allocations for a specific card name (across all decks).
 */
export async function getAllocationsForCard(cardName: string): Promise<AllocationRecord[]> {
  const supabase = createAdminClient()

  const { data: rows, error } = await supabase
    .from('deck_allocations')
    .select('card_name, deck_id, role, scryfall_id, set_code, collector_number, priority_override')
    .eq('card_name', cardName)

  if (error) throw new Error(`Failed to fetch allocations for card ${cardName}: ${error.message}`)

  return (rows || []).map(rowToAllocationRecord)
}

/**
 * Get the proxy report: all cards where demand exceeds supply.
 */
export async function getProxyReport(): Promise<ProxyReportEntry[]> {
  const supabase = createAdminClient()

  // Get all cards that have at least one proxy allocation
  const { data: proxyCards, error: proxyErr } = await supabase
    .from('deck_allocations')
    .select('card_name')
    .eq('role', 'proxy')

  if (proxyErr) throw new Error(`Failed to fetch proxy cards: ${proxyErr.message}`)

  // Deduplicate card names
  const uniqueCardNames = [...new Set((proxyCards || []).map(r => r.card_name))]

  const report: ProxyReportEntry[] = []

  for (const cardName of uniqueCardNames) {
    const { data: allocations, error: allocErr } = await supabase
      .from('deck_allocations')
      .select('deck_id, role')
      .eq('card_name', cardName)

    if (allocErr) throw new Error(`Failed to fetch allocations for ${cardName}: ${allocErr.message}`)

    const totalDemand = (allocations || []).length
    const proxyDecks = (allocations || [])
      .filter(a => a.role === 'proxy')
      .map(a => a.deck_id)
      .sort((a, b) => a - b)
    const originalDecks = (allocations || [])
      .filter(a => a.role === 'original')
      .map(a => a.deck_id)
      .sort((a, b) => a - b)

    // Get supply from collection
    const { data: supplyRows, error: supplyErr } = await supabase
      .from('collection')
      .select('quantity')
      .eq('card_name', cardName)

    if (supplyErr) throw new Error(`Failed to fetch collection supply for ${cardName}: ${supplyErr.message}`)

    const totalSupply = (supplyRows || []).reduce((sum, r) => sum + r.quantity, 0)

    report.push({
      cardName,
      totalDemand,
      totalSupply,
      deficit: Math.max(0, totalDemand - totalSupply),
      proxyDecks,
      originalDecks,
    })
  }

  return report
}

// ---------------------------------------------------------------------------
// Priority Management
// ---------------------------------------------------------------------------

/**
 * Set deck priority ordering.
 */
export async function setDeckPriority(deckId: number, priority: number, userId: string): Promise<void> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('deck_priority')
    .upsert(
      {
        deck_id: deckId,
        priority,
        updated_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: 'deck_id' }
    )

  if (error) throw new Error(`Failed to set deck priority for deck ${deckId}: ${error.message}`)
}

/**
 * Set a manual priority override for a specific card-deck pair.
 */
export async function setPriorityOverride(
  cardName: string,
  deckId: number,
  override: 'pin_original' | 'pin_proxy',
  userId: string
): Promise<void> {
  const supabase = createAdminClient()
  const role = override === 'pin_original' ? 'original' : 'proxy'

  const { error } = await supabase
    .from('deck_allocations')
    .upsert(
      {
        card_name: cardName,
        deck_id: deckId,
        role,
        priority_override: true,
        written_to_archidekt: false,
        assigned_at: new Date().toISOString(),
        user_id: userId,
      },
      { onConflict: 'card_name,deck_id' }
    )

  if (error) throw new Error(`Failed to set priority override for ${cardName} in deck ${deckId}: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToAllocationRecord(row: {
  card_name: string
  deck_id: number
  role: string
  scryfall_id: string | null
  set_code: string | null
  collector_number: string | null
  priority_override: boolean
}): AllocationRecord {
  return {
    cardName: row.card_name,
    deckId: row.deck_id,
    role: row.role as 'original' | 'proxy',
    scryfallId: row.scryfall_id,
    setCode: row.set_code,
    collectorNumber: row.collector_number,
    priorityOverride: Boolean(row.priority_override),
  }
}

// ---------------------------------------------------------------------------
// Archidekt Proxy Tag Interpretation
// ---------------------------------------------------------------------------

/**
 * Extract pin_proxy overrides from deck_cards data by detecting Archidekt proxy tags.
 *
 * Detects proxy intent from two sources:
 * 1. Tags JSON containing a tag with name "Proxy" (e.g., `#!Proxy` format stored as tag)
 * 2. Categories JSON containing "Proxy" as a category (e.g., `[Proxy]` format)
 *
 * Returns a map of "card_name|deck_id" → 'pin_proxy' for all detected proxy-tagged cards.
 *
 * Validates: Requirements 9.5
 */
export async function extractProxyOverridesFromDecks(): Promise<Map<string, 'pin_original' | 'pin_proxy'>> {
  const supabase = createAdminClient()
  const overrides = new Map<string, 'pin_original' | 'pin_proxy'>()

  const { data: rows, error } = await supabase
    .from('deck_cards')
    .select('card_name, deck_id, tags, categories')

  if (error) throw new Error(`Failed to fetch deck_cards for proxy override extraction: ${error.message}`)

  for (const row of rows || []) {
    if (hasProxyTag(row.tags) || hasProxyCategory(row.categories)) {
      const key = `${row.card_name}|${row.deck_id}`
      overrides.set(key, 'pin_proxy')
    }
  }

  return overrides
}

/**
 * Check if the tags JSON contains a "Proxy" tag.
 * Tags are stored as JSON array: [{ "name": "Proxy", "color": "#e158ff" }]
 * or as a raw string containing "Proxy".
 */
function hasProxyTag(tags: string | null): boolean {
  if (!tags) return false

  try {
    const parsed = JSON.parse(tags)
    if (Array.isArray(parsed)) {
      return parsed.some(
        (tag: { name?: string }) =>
          typeof tag.name === 'string' && tag.name.toLowerCase() === 'proxy'
      )
    }
  } catch {
    // Not valid JSON — check raw string for proxy markers
  }

  // Fallback: check raw string for #!Proxy or ^Proxy patterns
  return /(?:#!Proxy|\^Proxy)/i.test(tags)
}

/**
 * Check if the categories JSON contains "Proxy" as a category.
 * Categories are stored as JSON array: ["Ramp", "Proxy"]
 */
function hasProxyCategory(categories: string | null): boolean {
  if (!categories) return false

  try {
    const parsed = JSON.parse(categories)
    if (Array.isArray(parsed)) {
      return parsed.some(
        (cat: string) => typeof cat === 'string' && cat.toLowerCase() === 'proxy'
      )
    }
  } catch {
    // Not valid JSON — check raw string
  }

  // Fallback: check raw string for [Proxy] pattern
  return /\bProxy\b/i.test(categories)
}
