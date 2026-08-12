/**
 * Card Identity & Collection Data Access Layer
 *
 * Manages the two-layer data model for card tracking:
 * - cards: Stable card identity keyed by Scryfall oracle_id
 * - collection: Physical copies table. Each row represents a distinct
 *   physical card instance with its printing, finish, location, etc.
 *
 * Provides CRUD operations for card definitions and collection copies,
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
  createdAt: string | null
}

export interface CollectionCopy {
  id: number
  cardId: number
  printingId: string | null
  finish: string           // 'nonfoil', 'foil', 'etched'
  language: string         // 'en', 'ja', etc.
  isProxy: boolean
  missing: boolean
  proxyForCardId: number | null
  condition: PhysicalCondition | null
  purchasePrice: number | null
  locationId: number | null  // NULL = sorting pile
  acquiredAt: string | null
  createdAt: string
}

/** @deprecated Use CollectionCopy instead */
export type PhysicalCopy = CollectionCopy

export type PhysicalCondition =
  | 'near_mint'
  | 'lightly_played'
  | 'moderately_played'
  | 'heavily_played'
  | 'damaged'

export interface CreateCollectionCopyParams {
  cardId: number
  printingId?: string | null
  finish?: string
  language?: string
  isProxy?: boolean
  proxyForCardId?: number | null
  condition?: PhysicalCondition | null
  purchasePrice?: number | null
  locationId?: number | null
  acquiredAt?: string | null
  userId: string
}

/** @deprecated Use CreateCollectionCopyParams instead */
export type CreatePhysicalCopyParams = CreateCollectionCopyParams

/** Key for the printing-group unique index */
export interface PrintingGroupKey {
  cardId: number
  printingId: string | null
  finish: string
  isProxy: boolean
}

export interface UpsertCollectionCopyParams {
  cardId: number
  printingId?: string | null
  finish?: string
  language?: string
  isProxy?: boolean
  proxyForCardId?: number | null
  condition?: PhysicalCondition | null
  purchasePrice?: number | null
  locationId?: number | null
  quantity?: number        // defaults to 1; creates N rows
  acquiredAt?: string | null
  userId: string
}

/** @deprecated Use UpsertCollectionCopyParams instead */
export type UpsertPhysicalCopyParams = UpsertCollectionCopyParams

export interface CollectionImportParams {
  oracleId: string
  cardName: string
  scryfallPrintingId: string
  finish: string
  language?: string
  quantity: number
  purchasePrice?: number | null
  userId: string
}

export interface CollectionRollupRow {
  cardId: number
  cardName: string
  ownedQuantity: number   // COUNT of non-proxy collection rows
  inUseCount: number      // COUNT of deck_cards referencing this card's copies
}

export interface ProxyRollupRow {
  cardId: number
  cardName: string
  proxyQuantity: number   // COUNT of proxy collection rows
  inUseCount: number      // COUNT of deck_cards referencing this card's proxy copies
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
// Collection Copy — Helpers
// ---------------------------------------------------------------------------

function mapRowToCollectionCopy(row: any): CollectionCopy {
  return {
    id: row.id,
    cardId: row.card_id,
    printingId: row.printing_id ?? null,
    finish: row.finish ?? 'nonfoil',
    language: row.language ?? 'en',
    isProxy: Boolean(row.is_proxy),
    missing: Boolean(row.missing),
    proxyForCardId: row.proxy_for_card_id ?? null,
    condition: row.condition ?? null,
    purchasePrice: row.purchase_price ?? null,
    locationId: row.location_id ?? null,
    acquiredAt: row.acquired_at ?? null,
    createdAt: row.created_at,
  }
}

/** @deprecated Use mapRowToCollectionCopy instead */
const mapRowToPhysicalCopy = mapRowToCollectionCopy

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
    .from('user_cards')
    .select('id')
    .eq('oracle_id', oracleId)
    .maybeSingle()

  if (existing) return existing.id

  // Insert new definition
  const { data, error } = await supabase
    .from('user_cards')
    .insert({ oracle_id: oracleId, card_name: cardName, user_id: userId })
    .select('id')
    .single()

  if (error) {
    // Handle race condition: another request inserted between our select and insert
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('user_cards')
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
    .from('user_cards')
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
    .from('user_cards')
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
// Collection Copy — CRUD
// ---------------------------------------------------------------------------

/**
 * Upsert a collection copy.
 * Inserts N individual rows (one per copy) for the given quantity.
 *
 * Validates: Requirements 2.2, 3.1, 4.3, 8.2
 */
export async function upsertCollectionCopy(params: UpsertCollectionCopyParams): Promise<CollectionCopy> {
  const supabase = createAdminClient()
  const isProxy = params.isProxy ?? false
  const finish = params.finish ?? 'nonfoil'
  const language = params.language ?? 'en'
  const quantity = params.quantity ?? 1
  const userId = params.userId

  // Instance-level model — insert N individual rows (one per copy)
  const insertRows = Array.from({ length: quantity }, () => ({
    card_id: params.cardId,
    printing_id: params.printingId ?? null,
    finish,
    language,
    is_proxy: isProxy,
    proxy_for_card_id: params.proxyForCardId ?? null,
    condition: params.condition ?? null,
    purchase_price: params.purchasePrice ?? null,
    location_id: params.locationId ?? null,
    acquired_at: params.acquiredAt ?? null,
    user_id: userId,
  }))

  const { data, error } = await supabase
    .from('user_copies')
    .insert(insertRows)
    .select('*')

  if (error) throw new Error(`Failed to insert collection copy: ${error.message}`)
  
  // Return the first inserted row (interface expects single CollectionCopy)
  return mapRowToCollectionCopy(data[0])
}

/** @deprecated Use upsertCollectionCopy instead */
export const upsertPhysicalCopy = upsertCollectionCopy

/**
 * Create a new collection copy. Inserts a row into collection.
 *
 * Validates: Requirements 2.1, 8.3
 */
export async function createCollectionCopy(
  params: CreateCollectionCopyParams
): Promise<CollectionCopy | CardIdentityError> {
  const supabase = createAdminClient()
  const isProxy = params.isProxy ?? false
  const finish = params.finish ?? 'nonfoil'
  const language = params.language ?? 'en'
  const userId = params.userId

  const { data, error } = await supabase
    .from('user_copies')
    .insert({
      card_id: params.cardId,
      printing_id: params.printingId ?? null,
      finish,
      language,
      is_proxy: isProxy,
      proxy_for_card_id: params.proxyForCardId ?? null,
      condition: params.condition ?? null,
      purchase_price: params.purchasePrice ?? null,
      location_id: params.locationId ?? null,
      acquired_at: params.acquiredAt ?? null,
      user_id: userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to create collection copy: ${error.message}`)
  return mapRowToCollectionCopy(data)
}

/** @deprecated Use createCollectionCopy instead */
export const createPhysicalCopy = createCollectionCopy

/**
 * Retrieve a collection copy by its primary key.
 */
export async function getCollectionCopy(id: number): Promise<CollectionCopy | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_copies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to get collection copy ${id}: ${error.message}`)
  if (!data) return null
  return mapRowToCollectionCopy(data)
}

/** @deprecated Use getCollectionCopy instead */
export const getPhysicalCopy = getCollectionCopy

/**
 * Delete a collection copy by its primary key.
 * ON DELETE SET NULL cascades to deck_cards.copy_id.
 */
export async function deleteCollectionCopy(id: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('user_copies')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete collection copy ${id}: ${error.message}`)
}

/** @deprecated Use deleteCollectionCopy instead */
export const deletePhysicalCopy = deleteCollectionCopy

/**
 * List collection copies that are not referenced by any deck_cards row.
 */
export async function listUnassignedCollectionCopies(): Promise<CollectionCopy[]> {
  const supabase = createAdminClient()

  // Get all copy_ids that are referenced by deck_cards
  const { data: linkedIds, error: linkedError } = await supabase
    .from('deck_cards')
    .select('copy_id')
    .not('copy_id', 'is', null)

  if (linkedError) throw new Error(`Failed to list linked copies: ${linkedError.message}`)

  const usedIds = new Set((linkedIds ?? []).map(r => r.copy_id))

  // Get all collection copies
  const { data, error } = await supabase
    .from('user_copies')
    .select('*')

  if (error) throw new Error(`Failed to list collection copies: ${error.message}`)

  // Filter to only unassigned ones
  return (data ?? [])
    .filter(row => !usedIds.has(row.id))
    .map(mapRowToCollectionCopy)
}

/** @deprecated Use listUnassignedCollectionCopies instead */
export const listUnassignedPhysicalCopies = listUnassignedCollectionCopies

/**
 * List all collection copies associated with a given card.
 */
export async function listCollectionCopiesForCard(
  cardId: number
): Promise<CollectionCopy[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('user_copies')
    .select('*')
    .eq('card_id', cardId)

  if (error) {
    throw new Error(`Failed to list collection copies for card ${cardId}: ${error.message}`)
  }

  return (data ?? []).map(mapRowToCollectionCopy)
}

/** @deprecated Use listCollectionCopiesForCard instead */
export const listPhysicalCopiesForDefinition = listCollectionCopiesForCard

/**
 * Find a collection copy by its printing-group key.
 * Looks up by the unique combination of (card_id, printing_id, finish, is_proxy).
 *
 * Validates: Requirements 2.2, 2.10
 */
export async function findPrintingGroup(params: PrintingGroupKey): Promise<CollectionCopy | null> {
  const supabase = createAdminClient()

  let query = supabase
    .from('user_copies')
    .select('*')
    .eq('card_id', params.cardId)
    .eq('finish', params.finish)
    .eq('is_proxy', params.isProxy)

  // Handle null printing_id
  if (params.printingId === null) {
    query = query.is('printing_id', null)
  } else {
    query = query.eq('printing_id', params.printingId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(`Failed to find printing group: ${error.message}`)
  if (!data) return null
  return mapRowToCollectionCopy(data)
}

// ---------------------------------------------------------------------------
// Deck Linkage
// ---------------------------------------------------------------------------

/**
 * Validate that a collection copy's card identity matches a deck card's identity.
 * Returns true if the collection copy's card matches the deck card's card_name.
 *
 * Validates: Requirements 5.6
 */
export async function validateCardMatch(collectionCopyId: number, deckCardId: number): Promise<boolean> {
  const supabase = createAdminClient()

  // Get the collection copy's card name
  const { data: cc, error: ccError } = await supabase
    .from('user_copies')
    .select('card_id')
    .eq('id', collectionCopyId)
    .maybeSingle()

  if (ccError) throw new Error(`Failed to validate card match: ${ccError.message}`)
  if (!cc) return false

  const { data: cd, error: cdError } = await supabase
    .from('user_cards')
    .select('card_name')
    .eq('id', cc.card_id)
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
 * Link a collection copy to a deck card slot (many-to-one).
 * Validates card match before updating. Replaces any existing link on the deck card.
 * Multiple deck_cards rows may reference the same copy_id (no UNIQUE constraint).
 *
 * GUARD: This function only updates deck_cards.copy_id (linking metadata).
 * It does NOT modify deck composition (card_name, quantity, categories, is_commander).
 * It does NOT fetch from Archidekt. See: deck-authority-split spec, Req 6.1, 6.2.
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 5.1, 5.4, 5.5, 5.6
 */
export async function linkCollectionCopyToDeckCard(
  collectionCopyId: number,
  deckCardId: number
): Promise<void | CardIdentityError> {
  const isMatch = await validateCardMatch(collectionCopyId, deckCardId)
  if (!isMatch) {
    return {
      error: 'CARD_MISMATCH',
      message: 'Collection copy card does not match the deck card identity',
    }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deck_cards')
    .update({ copy_id: collectionCopyId })
    .eq('id', deckCardId)

  if (error) throw new Error(`Failed to link collection copy to deck card: ${error.message}`)
}

/** @deprecated Use linkCollectionCopyToDeckCard instead */
export const linkPhysicalCopyToDeckCard = linkCollectionCopyToDeckCard

/**
 * Unlink a collection copy from a deck card slot (sets copy_id to NULL).
 * Does not delete the collection copy — it continues to exist independently.
 *
 * Validates: Requirements 5.7
 */
export async function unlinkCollectionCopyFromDeckCard(deckCardId: number): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('deck_cards')
    .update({ copy_id: null })
    .eq('id', deckCardId)

  if (error) throw new Error(`Failed to unlink collection copy from deck card: ${error.message}`)
}

/** @deprecated Use unlinkCollectionCopyFromDeckCard instead */
export const unlinkPhysicalCopyFromDeckCard = unlinkCollectionCopyFromDeckCard

// ---------------------------------------------------------------------------
// Authoritative Collection Copy State (Import Engine)
// ---------------------------------------------------------------------------

/**
 * Set the state on a collection row to exact values (authoritative overwrite).
 * Creates the row if it doesn't exist; updates if it does.
 * Always scoped to is_proxy = FALSE.
 *
 * Used by the Import_Engine for authoritative CSV sync.
 *
 * Action detection via pre-read comparison:
 * - No existing row → INSERT → 'created'
 * - Existing row, condition differs → UPDATE → 'updated_condition'
 * - Existing row, nothing changed → no write → 'unchanged'
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.7
 */
export async function setCollectionCopyState(
  params: {
    cardId: number
    printingId: string
    finish: string
    language?: string
    condition: PhysicalCondition | null
    purchasePrice?: number | null
    locationId?: number | null
    userId: string
  }
): Promise<{ id: number; action: 'created' | 'updated_condition' | 'unchanged' }> {
  const supabase = createAdminClient()
  const userId = params.userId
  const language = params.language ?? 'en'

  // Pre-read: check if a row already exists for this printing group (non-proxy)
  const { data: existing, error: findError } = await supabase
    .from('user_copies')
    .select('id, condition')
    .eq('card_id', params.cardId)
    .eq('printing_id', params.printingId)
    .eq('finish', params.finish)
    .eq('is_proxy', false)
    .maybeSingle()

  if (findError) throw new Error(`Failed to find collection copy state: ${findError.message}`)

  if (!existing) {
    // No row exists — INSERT a new one
    const { data, error } = await supabase
      .from('user_copies')
      .insert({
        card_id: params.cardId,
        printing_id: params.printingId,
        finish: params.finish,
        language,
        is_proxy: false,
        condition: params.condition ?? null,
        purchase_price: params.purchasePrice ?? null,
        location_id: params.locationId ?? null,
        user_id: userId,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create collection copy state: ${error.message}`)
    return { id: data.id, action: 'created' }
  }

  // Row exists — compare pre-state vs desired state
  const conditionChanged = existing.condition !== (params.condition ?? null)

  if (!conditionChanged) {
    // Nothing changed — no write
    return { id: existing.id, action: 'unchanged' }
  }

  // Condition changed — UPDATE the row
  const { error } = await supabase
    .from('user_copies')
    .update({ condition: params.condition ?? null })
    .eq('id', existing.id)

  if (error) throw new Error(`Failed to update collection copy state: ${error.message}`)

  return { id: existing.id, action: 'updated_condition' }
}

/** @deprecated Use setCollectionCopyState instead */
export const setPhysicalCopyState = setCollectionCopyState

// ---------------------------------------------------------------------------
// Collection Import
// ---------------------------------------------------------------------------

/**
 * Import a card into the collection.
 * Handles the full workflow: oracle_id → card → collection copy upsert.
 *
 * 1. Ensures a card exists for the given oracle_id
 * 2. Upserts a collection row using the printing-group key
 *
 * Validates: Requirements 8.2, 8.4, 2.9
 */
export async function importCollectionCard(params: CollectionImportParams): Promise<CollectionCopy> {
  const cardId = await ensureCardDefinition(params.oracleId, params.cardName, params.userId)

  return upsertCollectionCopy({
    cardId,
    printingId: params.scryfallPrintingId,
    finish: params.finish,
    language: params.language ?? 'en',
    isProxy: false,
    quantity: params.quantity,
    purchasePrice: params.purchasePrice ?? null,
    userId: params.userId,
  })
}

// ---------------------------------------------------------------------------
// Computed In-Use Counts
// ---------------------------------------------------------------------------

/**
 * Count how many deck_cards rows reference any collection copy belonging to
 * the given card. This is the card-level in-use count.
 *
 * Returns 0 if no linkages exist.
 *
 * Validates: Requirements 9.1, 9.2, 9.7
 */
export async function getCardLevelInUseCount(cardId: number): Promise<number> {
  const supabase = createAdminClient()

  // Get all copy ids for this card
  const { data: copies, error: copiesError } = await supabase
    .from('user_copies')
    .select('id')
    .eq('card_id', cardId)

  if (copiesError) throw new Error(`Failed to get in-use count: ${copiesError.message}`)
  if (!copies || copies.length === 0) return 0

  const copyIds = copies.map(c => c.id)

  // Count deck_cards referencing any of these copies
  const { count, error } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .in('copy_id', copyIds)

  if (error) throw new Error(`Failed to get in-use count: ${error.message}`)
  return count ?? 0
}

/**
 * Count how many deck_cards rows reference a specific collection copy.
 * This is the subgroup-level in-use count.
 *
 * Returns 0 if no linkages exist.
 *
 * Validates: Requirements 9.1, 9.2, 9.7
 */
export async function getSubgroupInUseCount(copyId: number): Promise<number> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('deck_cards')
    .select('id', { count: 'exact', head: true })
    .eq('copy_id', copyId)

  if (error) throw new Error(`Failed to get subgroup in-use count: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Collection & Proxy Rollups
// ---------------------------------------------------------------------------

/**
 * Card-level rollup for the Collection view (proxies excluded).
 * Returns one row per card that has at least one non-proxy copy,
 * with the total owned count and the number of deck_cards slots referencing
 * any non-proxy copy of that card.
 *
 * Validates: Requirements 9.5, 10.1, 10.2, 10.4
 */
export async function getCollectionRollup(): Promise<CollectionRollupRow[]> {
  const supabase = createAdminClient()

  // Get all non-proxy collection copies with their card info
  const { data: copies, error: copiesError } = await supabase
    .from('user_copies')
    .select('id, card_id')
    .eq('is_proxy', false)

  if (copiesError) throw new Error(`Failed to get collection rollup: ${copiesError.message}`)
  if (!copies || copies.length === 0) return []

  // Get cards for all relevant card_ids
  const cardIds = [...new Set(copies.map(c => c.card_id))]
  const { data: cards, error: cardsError } = await supabase
    .from('user_cards')
    .select('id, card_name')
    .in('id', cardIds)

  if (cardsError) throw new Error(`Failed to get collection rollup: ${cardsError.message}`)

  const cardMap = new Map((cards ?? []).map(d => [d.id, d.card_name]))

  // Count copies per card (each row is one physical copy)
  const quantityMap = new Map<number, number>()
  for (const copy of copies) {
    quantityMap.set(copy.card_id, (quantityMap.get(copy.card_id) ?? 0) + 1)
  }

  // Get in-use counts (deck_cards referencing copies of each card)
  const allCopyIds = copies.map(c => c.id)
  const { data: linkedCards, error: linkedError } = await supabase
    .from('deck_cards')
    .select('copy_id')
    .in('copy_id', allCopyIds)

  if (linkedError) throw new Error(`Failed to get collection rollup: ${linkedError.message}`)

  // Count in-use per card
  const inUseMap = new Map<number, number>()
  for (const link of (linkedCards ?? [])) {
    if (link.copy_id === null) continue
    // Find which card this copy belongs to
    const copy = copies.find(c => c.id === link.copy_id)
    if (copy) {
      inUseMap.set(copy.card_id, (inUseMap.get(copy.card_id) ?? 0) + 1)
    }
  }

  // Build result
  const result: CollectionRollupRow[] = []
  for (const [cardId, ownedQuantity] of quantityMap) {
    const cardName = cardMap.get(cardId)
    if (!cardName) continue
    result.push({
      cardId,
      cardName,
      ownedQuantity,
      inUseCount: inUseMap.get(cardId) ?? 0,
    })
  }

  return result
}

/**
 * Card-level rollup for the Proxy tab (only proxy copies).
 * Returns one row per card that has at least one proxy copy,
 * with the total proxy count and the number of deck_cards slots referencing
 * any proxy copy of that card.
 *
 * Validates: Requirements 9.5, 10.1, 10.2, 10.4
 */
export async function getProxyRollup(): Promise<ProxyRollupRow[]> {
  const supabase = createAdminClient()

  // Get all proxy collection copies with their card info
  const { data: copies, error: copiesError } = await supabase
    .from('user_copies')
    .select('id, card_id')
    .eq('is_proxy', true)

  if (copiesError) throw new Error(`Failed to get proxy rollup: ${copiesError.message}`)
  if (!copies || copies.length === 0) return []

  // Get cards for all relevant card_ids
  const cardIds = [...new Set(copies.map(c => c.card_id))]
  const { data: cards, error: cardsError } = await supabase
    .from('user_cards')
    .select('id, card_name')
    .in('id', cardIds)

  if (cardsError) throw new Error(`Failed to get proxy rollup: ${cardsError.message}`)

  const cardMap = new Map((cards ?? []).map(d => [d.id, d.card_name]))

  // Count proxies per card (each row is one proxy copy)
  const quantityMap = new Map<number, number>()
  for (const copy of copies) {
    quantityMap.set(copy.card_id, (quantityMap.get(copy.card_id) ?? 0) + 1)
  }

  // Get in-use counts (deck_cards referencing proxy copies)
  const allCopyIds = copies.map(c => c.id)
  const { data: linkedCards, error: linkedError } = await supabase
    .from('deck_cards')
    .select('copy_id')
    .in('copy_id', allCopyIds)

  if (linkedError) throw new Error(`Failed to get proxy rollup: ${linkedError.message}`)

  // Count in-use per card
  const inUseMap = new Map<number, number>()
  for (const link of (linkedCards ?? [])) {
    if (link.copy_id === null) continue
    const copy = copies.find(c => c.id === link.copy_id)
    if (copy) {
      inUseMap.set(copy.card_id, (inUseMap.get(copy.card_id) ?? 0) + 1)
    }
  }

  // Build result
  const result: ProxyRollupRow[] = []
  for (const [cardId, proxyQuantity] of quantityMap) {
    const cardName = cardMap.get(cardId)
    if (!cardName) continue
    result.push({
      cardId,
      cardName,
      proxyQuantity,
      inUseCount: inUseMap.get(cardId) ?? 0,
    })
  }

  return result
}
