/**
 * Card Identity & Physical Copies Data Access Layer (v2 — Printing Group Model)
 *
 * Manages the two-layer data model for card tracking:
 * - card_definitions: Stable card identity keyed by Scryfall oracle_id
 * - physical_copies: Printing-group table. Each row represents a distinct
 *   combination of (card_definition_id, scryfall_printing_id, is_foil, is_proxy)
 *   with a quantity column tracking count.
 *
 * Provides CRUD operations for card definitions and physical copies,
 * deck slot linkage (many-to-one), and card match validation.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 2.1, 2.5, 8.3
 */

import { createAdminClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CardDefinition {
  id: number
  oracleId: string        // Scryfall oracle_id (UUID)
  cardName: string        // denormalized display name
  createdAt: string
}

export interface PhysicalCopy {
  id: number
  cardDefinitionId: number
  scryfallPrintingId: string | null
  isProxy: boolean
  quantity: number         // count of physical cards in this group
  proxyForDefinitionId: number | null
  condition: PhysicalCondition | null
  isFoil: boolean
  acquiredAt: string | null
  createdAt: string
}

export type PhysicalCondition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

export interface CreatePhysicalCopyParams {
  cardDefinitionId: number
  scryfallPrintingId?: string | null
  isProxy?: boolean
  proxyForDefinitionId?: number | null
  condition?: PhysicalCondition | null
  isFoil?: boolean
  acquiredAt?: string | null
  userId: string
}

/** Key for the printing-group unique index */
export interface PrintingGroupKey {
  cardDefinitionId: number
  scryfallPrintingId: string | null
  isFoil: boolean
  isProxy: boolean
}

export interface UpsertPhysicalCopyParams {
  cardDefinitionId: number
  scryfallPrintingId?: string | null
  isProxy?: boolean
  proxyForDefinitionId?: number | null
  condition?: PhysicalCondition | null
  isFoil?: boolean
  quantity?: number        // defaults to 1; increments on upsert
  acquiredAt?: string | null
  userId: string
}

export interface CollectionImportParams {
  oracleId: string
  cardName: string
  scryfallPrintingId: string
  isFoil: boolean
  quantity: number
  userId: string
}

export interface CollectionRollupRow {
  cardDefinitionId: number
  cardName: string
  ownedQuantity: number   // SUM of non-proxy physical_copies.quantity
  inUseCount: number      // COUNT of deck_cards referencing this card's physical_copies
}

export interface ProxyRollupRow {
  cardDefinitionId: number
  cardName: string
  proxyQuantity: number   // SUM of proxy physical_copies.quantity
  inUseCount: number      // COUNT of deck_cards referencing this card's proxy physical_copies
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

/**
 * Application-level error codes for card identity operations.
 *
 * - CARD_MISMATCH: Attempted to link a physical copy to a deck card with
 *   different card identity.
 * - INVALID_PRINTING: Provided scryfall_printing_id doesn't resolve to a valid printing.
 */
export type CardIdentityErrorCode =
  | 'CARD_MISMATCH'
  | 'INVALID_PRINTING'

export interface CardIdentityError {
  error: CardIdentityErrorCode
  message: string
}

// ---------------------------------------------------------------------------
// Physical Copy — Helpers
// ---------------------------------------------------------------------------

function mapRowToPhysicalCopy(row: any): PhysicalCopy {
  return {
    id: row.id,
    cardDefinitionId: row.card_definition_id,
    scryfallPrintingId: row.scryfall_printing_id ?? null,
    isProxy: Boolean(row.is_proxy),
    quantity: row.quantity ?? 1,
    proxyForDefinitionId: row.proxy_for_definition_id ?? null,
    condition: row.condition ?? null,
    isFoil: Boolean(row.is_foil),
    acquiredAt: row.acquired_at ?? null,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Card Definition CRUD
// ---------------------------------------------------------------------------

/**
 * Ensure a card definition exists. Upserts by oracle_id.
 * If the oracle_id already exists, returns the existing row's id.
 * If new, inserts and returns the new id.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */
export async function ensureCardDefinition(oracleId: string, cardName: string, userId: string): Promise<number> {
  const supabase = createAdminClient()

  // Try to find existing first
  const { data: existing } = await supabase
    .from('card_definitions')
    .select('id')
    .eq('oracle_id', oracleId)
    .maybeSingle()

  if (existing) return existing.id

  // Insert new definition
  const { data, error } = await supabase
    .from('card_definitions')
    .insert({ oracle_id: oracleId, card_name: cardName, user_id: userId })
    .select('id')
    .single()

  if (error) {
    // Handle race condition: another request inserted between our select and insert
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('card_definitions')
        .select('id')
        .eq('oracle_id', oracleId)
        .single()
      if (retry) return retry.id
    }
    throw new Error(`Failed to ensure card definition for ${oracleId}: ${error.message}`)
  }

  return data.id
}

/**
 * Retrieve a card definition by its Scryfall oracle_id.
 *
 * Validates: Requirements 1.1, 1.2
 */
export async function getCardDefinitionByOracleId(oracleId: string): Promise<CardDefinition | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('card_definitions')
    .select('id, oracle_id, card_name, created_at')
    .eq('oracle_id', oracleId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get card definition by oracle_id ${oracleId}: ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id,
    oracleId: data.oracle_id,
    cardName: data.card_name,
    createdAt: data.created_at,
  }
}

/**
 * Retrieve a card definition by its integer primary key.
 *
 * Validates: Requirements 1.4
 */
export async function getCardDefinitionById(id: number): Promise<CardDefinition | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('card_definitions')
    .select('id, oracle_id, card_name, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to get card definition by id ${id}: ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id,
    oracleId: data.oracle_id,
    cardName: data.card_name,
    createdAt: data.created_at,
  }
}

// ---------------------------------------------------------------------------
// Physical Copy — CRUD
// ---------------------------------------------------------------------------

/**
 * Upsert a physical copy using the printing-group model.
 * Inserts a new row or increments quantity on an existing row matching the
 * unique key (card_definition_id, scryfall_printing_id, is_foil, is_proxy).
 *
 * Defaults quantity to 1 when not provided. On conflict, the existing row's
 * quantity is incremented by the provided (or default) quantity.
 *
 * Validates: Requirements 2.2, 3.1, 4.3, 8.2
 */
export async function upsertPhysicalCopy(params: UpsertPhysicalCopyParams): Promise<PhysicalCopy> {
  const supabase = createAdminClient()
  const isProxy = params.isProxy ?? false
  const isFoil = params.isFoil ?? false
  const quantity = params.quantity ?? 1
  const userId = params.userId

  // Check if a row already exists for this printing group
  const existing = await findPrintingGroup({
    cardDefinitionId: params.cardDefinitionId,
    scryfallPrintingId: params.scryfallPrintingId ?? null,
    isFoil,
    isProxy,
  })

  if (existing) {
    // Increment quantity on existing row
    const newQuantity = existing.quantity + quantity
    const { data, error } = await supabase
      .from('physical_copies')
      .update({ quantity: newQuantity })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) throw new Error(`Failed to update physical copy: ${error.message}`)
    return mapRowToPhysicalCopy(data)
  }

  // Insert new row
  const { data, error } = await supabase
    .from('physical_copies')
    .insert({
      card_definition_id: params.cardDefinitionId,
      scryfall_printing_id: params.scryfallPrintingId ?? null,
      is_foil: isFoil,
      is_proxy: isProxy,
      quantity,
      proxy_for_definition_id: params.proxyForDefinitionId ?? null,
      condition: params.condition ?? null,
      acquired_at: params.acquiredAt ?? null,
      user_id: userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to insert physical copy: ${error.message}`)
  return mapRowToPhysicalCopy(data)
}

/**
 * Create a new physical copy. Inserts a row into physical_copies.
 * No governing rule validation — all cards with valid card_definition_id are accepted.
 *
 * @deprecated Use `upsertPhysicalCopy` for v2 printing-group semantics.
 * Validates: Requirements 2.1, 8.3
 */
export async function createPhysicalCopy(
  params: CreatePhysicalCopyParams
): Promise<PhysicalCopy | CardIdentityError> {
  const supabase = createAdminClient()
  const isProxy = params.isProxy ?? false
  const isFoil = params.isFoil ?? false
  const userId = params.userId

  const { data, error } = await supabase
    .from('physical_copies')
    .insert({
      card_definition_id: params.cardDefinitionId,
      scryfall_printing_id: params.scryfallPrintingId ?? null,
      is_proxy: isProxy,
      proxy_for_definition_id: params.proxyForDefinitionId ?? null,
      condition: params.condition ?? null,
      is_foil: isFoil,
      acquired_at: params.acquiredAt ?? null,
      user_id: userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create physical copy: ${error.message}`)
  return mapRowToPhysicalCopy(data)
}

/**
 * Retrieve a physical copy by its primary key.
 */
export async function getPhysicalCopy(id: number): Promise<PhysicalCopy | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('physical_copies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to get physical copy ${id}: ${error.message}`)
  if (!data) return null
  return mapRowToPhysicalCopy(data)
}

/**
 * Delete a physical copy by its primary key.
 * ON DELETE SET NULL cascades to deck_cards.physical_copy_id.
 */
export async function deletePhysicalCopy(id: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('physical_copies')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete physical copy ${id}: ${error.message}`)
}

/**
 * List physical copies that are not referenced by any deck_cards row.
 */
export async function listUnassignedPhysicalCopies(): Promise<PhysicalCopy[]> {
  const supabase = createAdminClient()

  // Get all physical_copy_ids that are referenced by deck_cards
  const { data: linkedIds, error: linkedError } = await supabase
    .from('deck_cards')
    .select('physical_copy_id')
    .not('physical_copy_id', 'is', null)

  if (linkedError) throw new Error(`Failed to list linked copies: ${linkedError.message}`)

  const usedIds = new Set((linkedIds ?? []).map(r => r.physical_copy_id))

  // Get all physical copies
  const { data, error } = await supabase
    .from('physical_copies')
    .select('*')

  if (error) throw new Error(`Failed to list physical copies: ${error.message}`)

  // Filter to only unassigned ones
  return (data ?? [])
    .filter(row => !usedIds.has(row.id))
    .map(mapRowToPhysicalCopy)
}

/**
 * List all physical copies associated with a given card definition.
 */
export async function listPhysicalCopiesForDefinition(
  cardDefinitionId: number
): Promise<PhysicalCopy[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('physical_copies')
    .select('*')
    .eq('card_definition_id', cardDefinitionId)

  if (error) {
    throw new Error(`Failed to list physical copies for definition ${cardDefinitionId}: ${error.message}`)
  }

  return (data ?? []).map(mapRowToPhysicalCopy)
}

/**
 * Find a physical copy by its printing-group key.
 * Looks up by the unique combination of (card_definition_id, scryfall_printing_id, is_foil, is_proxy).
 *
 * Validates: Requirements 2.2, 2.10
 */
export async function findPrintingGroup(params: PrintingGroupKey): Promise<PhysicalCopy | null> {
  const supabase = createAdminClient()

  let query = supabase
    .from('physical_copies')
    .select('*')
    .eq('card_definition_id', params.cardDefinitionId)
    .eq('is_foil', params.isFoil)
    .eq('is_proxy', params.isProxy)

  // Handle null scryfall_printing_id
  if (params.scryfallPrintingId === null) {
    query = query.is('scryfall_printing_id', null)
  } else {
    query = query.eq('scryfall_printing_id', params.scryfallPrintingId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(`Failed to find printing group: ${error.message}`)
  if (!data) return null
  return mapRowToPhysicalCopy(data)
}

// ---------------------------------------------------------------------------
// Deck Linkage
// ---------------------------------------------------------------------------

/**
 * Validate that a physical copy's card identity matches a deck card's identity.
 * Returns true if the physical copy's card_definition matches the deck card's card_name.
 *
 * Validates: Requirements 5.6
 */
export async function validateCardMatch(physicalCopyId: number, deckCardId: number): Promise<boolean> {
  const supabase = createAdminClient()

  // Get the physical copy's card definition name
  const { data: pc, error: pcError } = await supabase
    .from('physical_copies')
    .select('card_definition_id')
    .eq('id', physicalCopyId)
    .maybeSingle()

  if (pcError) throw new Error(`Failed to validate card match: ${pcError.message}`)
  if (!pc) return false

  const { data: cd, error: cdError } = await supabase
    .from('card_definitions')
    .select('card_name')
    .eq('id', pc.card_definition_id)
    .single()

  if (cdError) throw new Error(`Failed to validate card match: ${cdError.message}`)

  // Get the deck card's name
  const { data: dc, error: dcError } = await supabase
    .from('deck_cards')
    .select('card_name')
    .eq('id', deckCardId)
    .maybeSingle()

  if (dcError) throw new Error(`Failed to validate card match: ${dcError.message}`)
  if (!dc) return false

  return cd.card_name === dc.card_name
}

/**
 * Link a physical copy to a deck card slot (many-to-one).
 * Validates card match before updating. Replaces any existing link on the deck card.
 * Multiple deck_cards rows may reference the same physical_copy_id (no UNIQUE constraint).
 *
 * GUARD: This function only updates deck_cards.physical_copy_id (linking metadata).
 * It does NOT modify deck composition (card_name, quantity, categories, is_commander).
 * It does NOT fetch from Archidekt. See: deck-authority-split spec, Req 6.1, 6.2.
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 5.1, 5.4, 5.5, 5.6
 */
export async function linkPhysicalCopyToDeckCard(
  physicalCopyId: number,
  deckCardId: number
): Promise<void | CardIdentityError> {
  const isMatch = await validateCardMatch(physicalCopyId, deckCardId)
  if (!isMatch) {
    return {
      error: 'CARD_MISMATCH',
      message: 'Physical copy card_definition does not match the deck card identity',
    }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deck_cards')
    .update({ physical_copy_id: physicalCopyId })
    .eq('id', deckCardId)

  if (error) throw new Error(`Failed to link physical copy to deck card: ${error.message}`)
}

/**
 * Unlink a physical copy from a deck card slot (sets physical_copy_id to NULL).
 * Does not delete the physical copy — it continues to exist independently.
 *
 * Validates: Requirements 5.7
 */
export async function unlinkPhysicalCopyFromDeckCard(deckCardId: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deck_cards')
    .update({ physical_copy_id: null })
    .eq('id', deckCardId)

  if (error) throw new Error(`Failed to unlink physical copy from deck card: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Authoritative Physical Copy State (Import Engine)
// ---------------------------------------------------------------------------

/**
 * Set the quantity and condition on a physical_copies row to exact values
 * (authoritative overwrite). Unlike upsertPhysicalCopy which INCREMENTS,
 * this SETS quantity to the provided value.
 *
 * Used by the Import_Engine for authoritative CSV sync.
 * Creates the row if it doesn't exist; updates if it does.
 * Always scoped to is_proxy = FALSE.
 *
 * Action detection via pre-read comparison:
 * - No existing row → INSERT → 'created'
 * - Existing row, quantity differs → UPDATE → 'updated_quantity'
 * - Existing row, condition differs (quantity same) → UPDATE → 'updated_condition'
 * - Existing row, nothing changed → no write → 'unchanged'
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7
 */
export async function setPhysicalCopyState(
  params: {
    cardDefinitionId: number
    scryfallPrintingId: string
    isFoil: boolean
    quantity: number
    condition: PhysicalCondition | null
    userId: string
  }
): Promise<{ id: number; action: 'created' | 'updated_quantity' | 'updated_condition' | 'unchanged' }> {
  const supabase = createAdminClient()
  const userId = params.userId

  // Pre-read: check if a row already exists for this printing group (non-proxy)
  const { data: existing, error: findError } = await supabase
    .from('physical_copies')
    .select('id, quantity, condition')
    .eq('card_definition_id', params.cardDefinitionId)
    .eq('scryfall_printing_id', params.scryfallPrintingId)
    .eq('is_foil', params.isFoil)
    .eq('is_proxy', false)
    .maybeSingle()

  if (findError) throw new Error(`Failed to find physical copy state: ${findError.message}`)

  if (!existing) {
    // No row exists — INSERT a new one
    const { data, error } = await supabase
      .from('physical_copies')
      .insert({
        card_definition_id: params.cardDefinitionId,
        scryfall_printing_id: params.scryfallPrintingId,
        is_foil: params.isFoil,
        is_proxy: false,
        quantity: params.quantity,
        condition: params.condition ?? null,
        user_id: userId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create physical copy state: ${error.message}`)
    return { id: data.id, action: 'created' }
  }

  // Row exists — compare pre-state vs desired state
  const quantityChanged = existing.quantity !== params.quantity
  const conditionChanged = existing.condition !== (params.condition ?? null)

  if (!quantityChanged && !conditionChanged) {
    // Nothing changed — no write
    return { id: existing.id, action: 'unchanged' }
  }

  // Something changed — UPDATE the row
  const { error } = await supabase
    .from('physical_copies')
    .update({ quantity: params.quantity, condition: params.condition ?? null })
    .eq('id', existing.id)

  if (error) throw new Error(`Failed to update physical copy state: ${error.message}`)

  // Per Requirement 7.2: if both changed, count as 'updated_quantity'
  if (quantityChanged) {
    return { id: existing.id, action: 'updated_quantity' }
  }

  return { id: existing.id, action: 'updated_condition' }
}

// ---------------------------------------------------------------------------
// Collection Import
// ---------------------------------------------------------------------------

/**
 * Import a card into the physical collection.
 * Handles the full workflow: oracle_id → card_definition → physical_copy upsert.
 *
 * 1. Ensures a card_definition exists for the given oracle_id
 * 2. Upserts a physical_copy row using the printing-group key
 *
 * Validates: Requirements 8.2, 8.4, 2.9
 */
export async function importCollectionCard(params: CollectionImportParams): Promise<PhysicalCopy> {
  const cardDefinitionId = await ensureCardDefinition(params.oracleId, params.cardName, params.userId)

  return upsertPhysicalCopy({
    cardDefinitionId,
    scryfallPrintingId: params.scryfallPrintingId,
    isFoil: params.isFoil,
    isProxy: false,
    quantity: params.quantity,
    userId: params.userId,
  })
}

// ---------------------------------------------------------------------------
// Computed In-Use Counts
// ---------------------------------------------------------------------------

/**
 * Count how many deck_cards rows reference any physical_copy belonging to
 * the given card_definition. This is the card-level in-use count.
 *
 * Returns 0 if no linkages exist.
 *
 * Validates: Requirements 9.1, 9.2, 9.7
 */
export async function getCardLevelInUseCount(cardDefinitionId: number): Promise<number> {
  const supabase = createAdminClient()

  // Get all physical_copy ids for this card definition
  const { data: copies, error: copiesError } = await supabase
    .from('physical_copies')
    .select('id')
    .eq('card_definition_id', cardDefinitionId)

  if (copiesError) throw new Error(`Failed to get in-use count: ${copiesError.message}`)
  if (!copies || copies.length === 0) return 0

  const copyIds = copies.map(c => c.id)

  // Count deck_cards referencing any of these physical copies
  const { count, error } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .in('physical_copy_id', copyIds)

  if (error) throw new Error(`Failed to get in-use count: ${error.message}`)
  return count ?? 0
}

/**
 * Count how many deck_cards rows reference a specific physical_copy.
 * This is the subgroup-level in-use count.
 *
 * Returns 0 if no linkages exist.
 *
 * Validates: Requirements 9.1, 9.2, 9.7
 */
export async function getSubgroupInUseCount(physicalCopyId: number): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .eq('physical_copy_id', physicalCopyId)

  if (error) throw new Error(`Failed to get subgroup in-use count: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Collection & Proxy Rollups
// ---------------------------------------------------------------------------

/**
 * Card-level rollup for the Collection view (proxies excluded).
 * Returns one row per card_definition that has at least one non-proxy physical_copy,
 * with the total owned quantity and the number of deck_cards slots referencing
 * any non-proxy physical_copy of that card.
 *
 * Validates: Requirements 9.5, 10.1, 10.2, 10.4
 */
export async function getCollectionRollup(): Promise<CollectionRollupRow[]> {
  const supabase = createAdminClient()

  // Get all non-proxy physical copies with their card definition info
  const { data: copies, error: copiesError } = await supabase
    .from('physical_copies')
    .select('id, card_definition_id, quantity')
    .eq('is_proxy', false)

  if (copiesError) throw new Error(`Failed to get collection rollup: ${copiesError.message}`)
  if (!copies || copies.length === 0) return []

  // Get card definitions for all relevant card_definition_ids
  const defIds = [...new Set(copies.map(c => c.card_definition_id))]
  const { data: defs, error: defsError } = await supabase
    .from('card_definitions')
    .select('id, card_name')
    .in('id', defIds)

  if (defsError) throw new Error(`Failed to get collection rollup: ${defsError.message}`)

  const defMap = new Map((defs ?? []).map(d => [d.id, d.card_name]))

  // Sum quantities per card_definition
  const quantityMap = new Map<number, number>()
  const copyIdsByDef = new Map<number, number[]>()
  for (const copy of copies) {
    quantityMap.set(copy.card_definition_id, (quantityMap.get(copy.card_definition_id) ?? 0) + copy.quantity)
    const ids = copyIdsByDef.get(copy.card_definition_id) ?? []
    ids.push(copy.id)
    copyIdsByDef.set(copy.card_definition_id, ids)
  }

  // Get in-use counts (deck_cards referencing physical copies of each definition)
  const allCopyIds = copies.map(c => c.id)
  const { data: linkedCards, error: linkedError } = await supabase
    .from('deck_cards')
    .select('physical_copy_id')
    .in('physical_copy_id', allCopyIds)

  if (linkedError) throw new Error(`Failed to get collection rollup: ${linkedError.message}`)

  // Count in-use per card definition
  const inUseMap = new Map<number, number>()
  for (const link of (linkedCards ?? [])) {
    if (link.physical_copy_id === null) continue
    // Find which card_definition this physical_copy belongs to
    const copy = copies.find(c => c.id === link.physical_copy_id)
    if (copy) {
      inUseMap.set(copy.card_definition_id, (inUseMap.get(copy.card_definition_id) ?? 0) + 1)
    }
  }

  // Build result
  const result: CollectionRollupRow[] = []
  for (const [defId, ownedQuantity] of quantityMap) {
    const cardName = defMap.get(defId)
    if (!cardName) continue
    result.push({
      cardDefinitionId: defId,
      cardName,
      ownedQuantity,
      inUseCount: inUseMap.get(defId) ?? 0,
    })
  }

  return result
}

/**
 * Card-level rollup for the Proxy tab (only proxy physical_copies).
 * Returns one row per card_definition that has at least one proxy physical_copy,
 * with the total proxy quantity and the number of deck_cards slots referencing
 * any proxy physical_copy of that card.
 *
 * Validates: Requirements 9.5, 10.1, 10.2, 10.4
 */
export async function getProxyRollup(): Promise<ProxyRollupRow[]> {
  const supabase = createAdminClient()

  // Get all proxy physical copies with their card definition info
  const { data: copies, error: copiesError } = await supabase
    .from('physical_copies')
    .select('id, card_definition_id, quantity')
    .eq('is_proxy', true)

  if (copiesError) throw new Error(`Failed to get proxy rollup: ${copiesError.message}`)
  if (!copies || copies.length === 0) return []

  // Get card definitions for all relevant card_definition_ids
  const defIds = [...new Set(copies.map(c => c.card_definition_id))]
  const { data: defs, error: defsError } = await supabase
    .from('card_definitions')
    .select('id, card_name')
    .in('id', defIds)

  if (defsError) throw new Error(`Failed to get proxy rollup: ${defsError.message}`)

  const defMap = new Map((defs ?? []).map(d => [d.id, d.card_name]))

  // Sum quantities per card_definition
  const quantityMap = new Map<number, number>()
  for (const copy of copies) {
    quantityMap.set(copy.card_definition_id, (quantityMap.get(copy.card_definition_id) ?? 0) + copy.quantity)
  }

  // Get in-use counts (deck_cards referencing proxy physical copies)
  const allCopyIds = copies.map(c => c.id)
  const { data: linkedCards, error: linkedError } = await supabase
    .from('deck_cards')
    .select('physical_copy_id')
    .in('physical_copy_id', allCopyIds)

  if (linkedError) throw new Error(`Failed to get proxy rollup: ${linkedError.message}`)

  // Count in-use per card definition
  const inUseMap = new Map<number, number>()
  for (const link of (linkedCards ?? [])) {
    if (link.physical_copy_id === null) continue
    const copy = copies.find(c => c.id === link.physical_copy_id)
    if (copy) {
      inUseMap.set(copy.card_definition_id, (inUseMap.get(copy.card_definition_id) ?? 0) + 1)
    }
  }

  // Build result
  const result: ProxyRollupRow[] = []
  for (const [defId, proxyQuantity] of quantityMap) {
    const cardName = defMap.get(defId)
    if (!cardName) continue
    result.push({
      cardDefinitionId: defId,
      cardName,
      proxyQuantity,
      inUseCount: inUseMap.get(defId) ?? 0,
    })
  }

  return result
}
