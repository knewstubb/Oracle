/**
 * Generic Land Store
 *
 * Data access module for generic land slots — deck_cards rows that represent
 * a basic land of a given type without referencing any physical copy or
 * participating in the ownership/allocation system.
 *
 * This file exports types, constants, validation functions, CRUD operations
 * for generic land preferences and slots, and conversion helpers.
 *
 * Uses Supabase client for all database operations (async).
 *
 * Validates: Requirements 1.4, 2.1, 2.2
 */

import { createServerClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASIC_LAND_TYPES = [
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'
] as const

export type BasicLandType = typeof BASIC_LAND_TYPES[number]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenericLandPreference {
  cardDefinitionId: number
  cardName: string            // denormalized from card_definitions
  scryfallPrintingId: string
  updatedAt: string
}

export interface CreateGenericLandSlotParams {
  deckId: number
  cardDefinitionId: number    // must reference a basic land type
}

export interface ConvertToSpecificParams {
  deckCardId: number
  physicalCopyId: number
}

export interface ConvertToGenericParams {
  deckCardId: number
}

export type GenericLandErrorCode =
  | 'NOT_BASIC_LAND'
  | 'PHYSICAL_COPY_SET'
  | 'NO_MATCHING_COPY'
  | 'CARD_MISMATCH'
  | 'NOT_GENERIC_SLOT'
  | 'INVALID_PRINTING'

export interface GenericLandError {
  error: GenericLandErrorCode
  message: string
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that a card_name is one of the six basic land types (case-sensitive).
 */
export function isBasicLandType(cardName: string): cardName is BasicLandType {
  return (BASIC_LAND_TYPES as readonly string[]).includes(cardName)
}

/**
 * Check whether a card_definition_id maps to one of the six basic land types.
 * Queries card_definitions to verify the card_name is a basic land type.
 */
export async function isBasicLandDefinition(cardDefinitionId: number): Promise<boolean> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('card_definitions')
    .select('card_name')
    .eq('id', cardDefinitionId)
    .maybeSingle()

  if (error) throw new Error(`Failed to check basic land definition: ${error.message}`)
  if (!data) return false
  return isBasicLandType(data.card_name)
}

// ---------------------------------------------------------------------------
// Preferences CRUD
// ---------------------------------------------------------------------------

/**
 * Get all 6 generic land art preferences.
 * Returns rows joined with card_definitions for the card_name.
 */
export async function getAllPreferences(): Promise<GenericLandPreference[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('generic_land_preferences')
    .select('card_definition_id, scryfall_printing_id, updated_at, card_definitions(card_name)')

  if (error) throw new Error(`Failed to get all generic land preferences: ${error.message}`)
  if (!data) return []

  return data.map((row: any) => ({
    cardDefinitionId: row.card_definition_id,
    cardName: row.card_definitions?.card_name ?? '',
    scryfallPrintingId: row.scryfall_printing_id,
    updatedAt: row.updated_at,
  }))
}

/**
 * Get the preference for a specific basic land type.
 * Returns null if no row found for the given cardDefinitionId.
 */
export async function getPreference(cardDefinitionId: number): Promise<GenericLandPreference | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('generic_land_preferences')
    .select('card_definition_id, scryfall_printing_id, updated_at, card_definitions(card_name)')
    .eq('card_definition_id', cardDefinitionId)
    .maybeSingle()

  if (error) throw new Error(`Failed to get generic land preference: ${error.message}`)
  if (!data) return null

  return {
    cardDefinitionId: data.card_definition_id,
    cardName: (data as any).card_definitions?.card_name ?? '',
    scryfallPrintingId: data.scryfall_printing_id,
    updatedAt: data.updated_at,
  }
}

/**
 * Update the art preference for a basic land type.
 * Validates that cardDefinitionId references a basic land type and that
 * scryfallPrintingId is non-empty.
 */
export async function updatePreference(
  cardDefinitionId: number,
  scryfallPrintingId: string
): Promise<void | GenericLandError> {
  if (!await isBasicLandDefinition(cardDefinitionId)) {
    return {
      error: 'NOT_BASIC_LAND',
      message: 'Only basic land types support generic slots: Plains, Island, Swamp, Mountain, Forest, Wastes',
    }
  }

  if (!scryfallPrintingId || scryfallPrintingId.trim() === '') {
    return {
      error: 'INVALID_PRINTING',
      message: 'The provided scryfall_printing_id is not a valid printing of this basic land type',
    }
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('generic_land_preferences')
    .update({ scryfall_printing_id: scryfallPrintingId, updated_at: new Date().toISOString() })
    .eq('card_definition_id', cardDefinitionId)

  if (error) throw new Error(`Failed to update generic land preference: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Generic Land Slot CRUD
// ---------------------------------------------------------------------------

/**
 * Create a generic land slot in a deck.
 * Validates that card_definition_id references a basic land type.
 * Creates a deck_cards row with is_generic_land=TRUE, physical_copy_id=NULL.
 *
 * Returns the new deck_cards.id on success, or a GenericLandError on failure.
 *
 * Validates: Requirements 7.1, 7.2, 1.3, 1.4
 */
export async function createGenericLandSlot(
  params: CreateGenericLandSlotParams
): Promise<number | GenericLandError> {
  // Validate that card_definition_id references a basic land type
  if (!await isBasicLandDefinition(params.cardDefinitionId)) {
    return {
      error: 'NOT_BASIC_LAND',
      message: 'Only basic land types support generic slots: Plains, Island, Swamp, Mountain, Forest, Wastes'
    }
  }

  const supabase = createServerClient()

  // Look up the card_name from card_definitions
  const { data: defRow, error: defError } = await supabase
    .from('card_definitions')
    .select('card_name')
    .eq('id', params.cardDefinitionId)
    .single()

  if (defError) throw new Error(`Failed to look up card definition: ${defError.message}`)

  // INSERT deck_cards row with is_generic_land=TRUE, physical_copy_id=NULL
  const { data, error } = await supabase
    .from('deck_cards')
    .insert({
      card_name: defRow.card_name,
      deck_id: params.deckId,
      card_definition_id: params.cardDefinitionId,
      is_generic_land: true,
      physical_copy_id: null,
      user_id: process.env.SUPABASE_DEFAULT_USER_ID ?? '00000000-0000-0000-0000-000000000000',
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create generic land slot: ${error.message}`)
  return data.id
}

/**
 * Remove a generic land slot from a deck.
 * Deletes the deck_cards row. No side effects on other tables.
 *
 * Validates: Requirements 7.4
 */
export async function removeGenericLandSlot(deckCardId: number): Promise<void> {
  const supabase = createServerClient()
  const { error } = await supabase
    .from('deck_cards')
    .delete()
    .eq('id', deckCardId)

  if (error) throw new Error(`Failed to remove generic land slot: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a generic land slot to a specific printing.
 * Atomically sets physical_copy_id and is_generic_land=FALSE.
 * Validates: physical_copies row exists with matching card_definition_id.
 * Does NOT create physical_copies rows.
 *
 * Preserves ownership_status and proxy_of_deck_id (does not update them).
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.5, 5.6
 */
export async function convertToSpecific(
  params: ConvertToSpecificParams
): Promise<void | GenericLandError> {
  const supabase = createServerClient()

  // 1. SELECT the deck_cards row by deckCardId
  const { data: deckCard, error: dcError } = await supabase
    .from('deck_cards')
    .select('id, is_generic_land, card_definition_id')
    .eq('id', params.deckCardId)
    .maybeSingle()

  if (dcError) throw new Error(`Failed to look up deck card: ${dcError.message}`)

  if (!deckCard) {
    return {
      error: 'NOT_GENERIC_SLOT',
      message: 'Row is not currently a generic land slot',
    }
  }

  // If is_generic_land=FALSE, return NOT_GENERIC_SLOT error
  if (!deckCard.is_generic_land) {
    return {
      error: 'NOT_GENERIC_SLOT',
      message: 'Row is not currently a generic land slot',
    }
  }

  // 2. SELECT the physical_copies row by physicalCopyId
  const { data: physicalCopy, error: pcError } = await supabase
    .from('physical_copies')
    .select('id, card_definition_id')
    .eq('id', params.physicalCopyId)
    .maybeSingle()

  if (pcError) throw new Error(`Failed to look up physical copy: ${pcError.message}`)

  if (!physicalCopy) {
    return {
      error: 'NO_MATCHING_COPY',
      message: 'No physical_copies row found with that id',
    }
  }

  // 3. If physical_copies.card_definition_id !== deck_cards.card_definition_id, return CARD_MISMATCH
  if (physicalCopy.card_definition_id !== deckCard.card_definition_id) {
    return {
      error: 'CARD_MISMATCH',
      message: 'Physical copy belongs to a different card definition',
    }
  }

  // 4. UPDATE deck_cards SET is_generic_land=FALSE, physical_copy_id=physicalCopyId
  //    Preserves ownership_status and proxy_of_deck_id (don't update them)
  const { error: updateError } = await supabase
    .from('deck_cards')
    .update({ is_generic_land: false, physical_copy_id: params.physicalCopyId })
    .eq('id', params.deckCardId)

  if (updateError) throw new Error(`Failed to convert to specific: ${updateError.message}`)
}

/**
 * Convert a specific printing back to a generic land slot.
 * Atomically sets is_generic_land=TRUE and physical_copy_id=NULL.
 * Does NOT modify the previously-referenced physical_copies row.
 *
 * Preserves card_definition_id, ownership_status, and proxy_of_deck_id.
 *
 * Validates: Requirements 5.4, 5.5
 */
export async function convertToGeneric(
  params: ConvertToGenericParams
): Promise<void | GenericLandError> {
  const supabase = createServerClient()

  // 1. SELECT the deck_cards row by deckCardId
  const { data: deckCard, error: dcError } = await supabase
    .from('deck_cards')
    .select('id, is_generic_land')
    .eq('id', params.deckCardId)
    .maybeSingle()

  if (dcError) throw new Error(`Failed to look up deck card: ${dcError.message}`)

  if (!deckCard) {
    return {
      error: 'NOT_GENERIC_SLOT',
      message: 'Row is not currently a generic land slot',
    }
  }

  // If is_generic_land=TRUE, return NOT_GENERIC_SLOT error (already generic)
  if (deckCard.is_generic_land) {
    return {
      error: 'NOT_GENERIC_SLOT',
      message: 'Row is already a generic land slot',
    }
  }

  // 2. UPDATE deck_cards SET is_generic_land=TRUE, physical_copy_id=NULL
  //    Preserves card_definition_id, ownership_status, and proxy_of_deck_id
  const { error: updateError } = await supabase
    .from('deck_cards')
    .update({ is_generic_land: true, physical_copy_id: null })
    .eq('id', params.deckCardId)

  if (updateError) throw new Error(`Failed to convert to generic: ${updateError.message}`)
}

/**
 * List physical_copies rows eligible as conversion targets for a generic slot.
 * Returns rows where card_definition_id matches the slot's card_definition_id.
 *
 * Validates: Requirements 5.2
 */
export async function listConversionTargets(
  deckCardId: number
): Promise<Array<{ id: number; scryfallPrintingId: string | null; isProxy: boolean; isFoil: boolean; quantity: number }>> {
  const supabase = createServerClient()

  // 1. SELECT the deck_cards row by deckCardId to get card_definition_id
  const { data: deckCard, error: dcError } = await supabase
    .from('deck_cards')
    .select('card_definition_id')
    .eq('id', deckCardId)
    .maybeSingle()

  if (dcError) throw new Error(`Failed to look up deck card: ${dcError.message}`)
  if (!deckCard || deckCard.card_definition_id === null) {
    return []
  }

  // 2. SELECT from physical_copies where card_definition_id matches
  const { data: rows, error } = await supabase
    .from('physical_copies')
    .select('id, scryfall_printing_id, is_proxy, is_foil, quantity')
    .eq('card_definition_id', deckCard.card_definition_id)

  if (error) throw new Error(`Failed to list conversion targets: ${error.message}`)
  if (!rows) return []

  return rows.map(row => ({
    id: row.id,
    scryfallPrintingId: row.scryfall_printing_id,
    isProxy: Boolean(row.is_proxy),
    isFoil: Boolean(row.is_foil),
    quantity: row.quantity,
  }))
}
