# Implementation Plan: Generic Basic Lands

## Overview

This plan implements the "generic land slot" concept — deck_cards rows that represent a basic land of a given type without referencing any physical copy or participating in ownership/allocation. The implementation proceeds from schema changes through data access, existing module modifications, API routes, and finally React components.

## Tasks

- [x] 1. Database migration
  - [x] 1.1 Create migration 027-generic-basic-lands.sql
    - Add `card_definition_id` (INTEGER, nullable FK → card_definitions) to deck_cards
    - Add `is_generic_land` (BOOLEAN NOT NULL DEFAULT FALSE) to deck_cards
    - Create triggers `trg_deck_cards_ownership_status_check` and `trg_deck_cards_ownership_status_check_insert` enforcing extended ownership_status values ('original', 'proxy', 'not_owned', 'generic')
    - Create `generic_land_preferences` table (card_definition_id PK FK, scryfall_printing_id TEXT NOT NULL, updated_at DATETIME)
    - Seed 6 rows into generic_land_preferences using known Scryfall printing UUIDs for default basic land art
    - Create partial index `idx_deck_cards_generic_land` on (deck_id, is_generic_land) WHERE is_generic_land = TRUE
    - Create partial index `idx_deck_cards_card_definition_id` on (card_definition_id) WHERE card_definition_id IS NOT NULL
    - _Requirements: 1.1, 1.2, 1.5, 4.4, 4.6_

  - [x] 1.2 Create down-migration 027-generic-basic-lands-down.sql
    - DROP generic_land_preferences table
    - DROP both indexes
    - DROP both triggers
    - Document SQLite >= 3.35 DROP COLUMN approach for card_definition_id and is_generic_land
    - _Requirements: 1.1, 1.2_

- [x] 2. Data access module — generic-land-store.ts
  - [x] 2.1 Create `src/lib/generic-land-store.ts` with types, constants, and validation functions
    - Export `BASIC_LAND_TYPES` array and `BasicLandType` type
    - Export all interfaces: GenericLandPreference, CreateGenericLandSlotParams, ConvertToSpecificParams, ConvertToGenericParams, GenericLandErrorCode, GenericLandError
    - Implement `isBasicLandType(cardName)` — case-sensitive check against the 6 types
    - Implement `isBasicLandDefinition(db, cardDefinitionId)` — query card_definitions to verify card_name is a basic land type
    - _Requirements: 2.1, 2.2, 1.4_

  - [x] 2.2 Implement generic land slot CRUD functions
    - Implement `createGenericLandSlot(db, params)` — validate card_definition_id is basic land, INSERT deck_cards row with is_generic_land=TRUE, physical_copy_id=NULL, return new id or error
    - Implement `removeGenericLandSlot(db, deckCardId)` — DELETE deck_cards row, no side effects
    - _Requirements: 7.1, 7.2, 7.4, 1.3, 1.4_

  - [x] 2.3 Implement conversion functions
    - Implement `convertToSpecific(db, params)` — validate deck_cards row is generic, validate physical_copies row exists with matching card_definition_id, atomically set is_generic_land=FALSE + physical_copy_id=target
    - Implement `convertToGeneric(db, params)` — validate row is not already generic, atomically set is_generic_land=TRUE + physical_copy_id=NULL, preserve card_definition_id
    - Implement `listConversionTargets(db, deckCardId)` — query physical_copies where card_definition_id matches the slot's card_definition_id
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 2.4 Implement preferences CRUD functions
    - Implement `getAllPreferences(db)` — SELECT all 6 rows joined with card_definitions for card_name
    - Implement `getPreference(db, cardDefinitionId)` — SELECT single preference row
    - Implement `updatePreference(db, cardDefinitionId, scryfallPrintingId)` — validate cardDefinitionId is a basic land type, UPDATE scryfall_printing_id and updated_at
    - _Requirements: 6.1, 6.2, 6.5, 4.1_

  - [ ]* 2.5 Write property test: Allocation Exclusion (Property 1)
    - **Property 1: Allocation Exclusion**
    - Generate random deck_cards configurations with mix of generic and non-generic rows, verify demandMap from buildAllocationInput contains zero entries from generic rows
    - **Validates: Requirements 1.2, 3.6**

  - [ ]* 2.6 Write property test: Basic Land Type Restriction (Property 2)
    - **Property 2: Basic Land Type Restriction**
    - Generate random card_definition_ids (basic and non-basic names), verify createGenericLandSlot succeeds only for the 6 basic types and rejects all others with NOT_BASIC_LAND error
    - **Validates: Requirements 1.4, 2.1, 2.2**

  - [ ]* 2.7 Write property test: Generic–Physical Mutual Exclusion (Property 3)
    - **Property 3: Generic–Physical Mutual Exclusion**
    - Generate deck_cards rows with is_generic_land=TRUE, verify physical_copy_id is always NULL; generate attempts to violate mutual exclusion via convertToSpecific/convertToGeneric, verify all invariants hold
    - **Validates: Requirements 1.3, 1.6**

  - [ ]* 2.8 Write property test: Conversion Round-Trip (Property 5)
    - **Property 5: Conversion Round-Trip**
    - Generate generic slots with valid physical_copies targets, perform convertToSpecific then convertToGeneric, verify row returns to is_generic_land=TRUE + physical_copy_id=NULL + same card_definition_id + same PK; verify physical_copies row is unchanged
    - **Validates: Requirements 5.1, 5.4**

  - [ ]* 2.9 Write property test: Conversion Requires Existing Matching Copy (Property 6)
    - **Property 6: Conversion Requires Existing Matching Copy**
    - Generate conversion attempts with matching, non-matching, and missing physical_copies targets; verify success only when row exists with matching card_definition_id; verify no new physical_copies rows are created on failure
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 2.10 Write property test: Conversion Preserves Unrelated Columns (Property 7)
    - **Property 7: Conversion Preserves Unrelated Columns**
    - Generate conversions (both directions) with pre-set ownership_status and proxy_of_deck_id values, verify these columns are unchanged after conversion
    - **Validates: Requirements 5.5**

  - [ ]* 2.11 Write property test: Preference Update Persistence (Property 8)
    - **Property 8: Preference Update Persistence**
    - Generate random valid card_definition_ids (from 6 basic types) and random non-empty scryfall_printing_id strings, call updatePreference then getPreference, verify returned value matches the set value
    - **Validates: Requirements 6.2**

- [x] 3. Modify existing modules
  - [x] 3.1 Modify `src/lib/allocation-store.ts` — buildAllocationInput excludes generic rows
    - Change the demand query from `SELECT card_name, deck_id FROM deck_cards` to `SELECT card_name, deck_id FROM deck_cards WHERE is_generic_land = FALSE`
    - _Requirements: 1.2, 3.6_

  - [x] 3.2 Modify `src/lib/ownership-resolver.ts` — denormaliseOwnership handles 'generic' status
    - Add early-exit UPDATE that sets ownership_status='generic' and proxy_of_deck_id=NULL for all rows where is_generic_land=TRUE
    - Exclude generic rows from the "mark unallocated as not_owned" loop
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.3 Write property test: Ownership Resolver Generic Status (Property 4)
    - **Property 4: Ownership Resolver Generic Status**
    - Generate mixed deck configurations with generic and non-generic rows, run denormaliseOwnership, verify every is_generic_land=TRUE row has ownership_status='generic' and proxy_of_deck_id=NULL; verify no generic row has status 'original', 'proxy', or 'not_owned'
    - **Validates: Requirements 3.1, 3.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. API routes
  - [x] 5.1 Create POST `/api/decks/[deckId]/generic-lands` route handler
    - Parse request body for cardDefinitionId, call createGenericLandSlot, return 201 with new id or 400/422 with error
    - _Requirements: 7.1, 7.2, 2.1, 2.2_

  - [x] 5.2 Create DELETE `/api/decks/[deckId]/generic-lands/[id]` route handler
    - Call removeGenericLandSlot, return 204 on success
    - _Requirements: 7.4_

  - [x] 5.3 Create POST `/api/decks/[deckId]/generic-lands/[id]/convert-to-specific` route handler
    - Parse physicalCopyId from body, call convertToSpecific, return 200 or 400/422 with error
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.4 Create POST `/api/decks/[deckId]/generic-lands/[id]/convert-to-generic` route handler
    - Call convertToGeneric, return 200 or 400/422 with error
    - _Requirements: 5.4_

  - [x] 5.5 Create GET `/api/settings/generic-land-preferences` route handler
    - Call getAllPreferences, return 200 with array of 6 preferences
    - _Requirements: 6.1, 4.4_

  - [x] 5.6 Create PUT `/api/settings/generic-land-preferences/[cardDefinitionId]` route handler
    - Parse scryfallPrintingId from body, call updatePreference, return 200 or 400/422 with error
    - _Requirements: 6.2, 6.5_

  - [ ]* 5.7 Write unit tests for API route handlers
    - Test successful responses and error mapping for each route
    - Test request validation (missing/invalid params)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 7.1, 7.4_

- [x] 6. React components
  - [x] 6.1 Create `src/components/generic-land-badge.tsx`
    - Render a visual badge/indicator overlay distinguishing generic land slots from ownership-tracked slots
    - Accept props for the basic land type name and preference art URL
    - _Requirements: 4.2_

  - [x] 6.2 Create `src/components/settings/generic-land-art-settings.tsx`
    - Display 6 rows (one per basic land type) showing current art preference thumbnail
    - Provide a "Change" action per row that opens the ScryfallPrintingPicker
    - Use TanStack Query to fetch/mutate preferences via API routes
    - Handle loading, error, and placeholder states
    - _Requirements: 6.1, 6.3, 6.4, 4.3_

  - [x] 6.3 Create `src/components/settings/scryfall-printing-picker.tsx`
    - Allow searching Scryfall printings of a specific basic land type by set name
    - Display results as a scrollable list of card art thumbnails
    - On selection, call the PUT preference API and confirm save
    - _Requirements: 6.3, 6.2_

- [x] 7. Integration wiring
  - [x] 7.1 Wire GenericLandBadge into deck card rendering
    - Where deck_cards are rendered on canvas/card lists, check is_generic_land flag and render GenericLandBadge overlay when true
    - Resolve art from generic_land_preferences based on card_definition_id
    - Handle missing/unresolvable art with placeholder image
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 7.2 Wire GenericLandArtSettings into the Settings page
    - Add "Generic land art" section to the existing settings layout
    - _Requirements: 6.1_

  - [ ]* 7.3 Write integration tests
    - Test full ownership pipeline: resolveOwnership with generic land rows → 'generic' status
    - Test buildAllocationInput excludes generic land rows from demandMap
    - Test Settings API round-trip: GET → PUT → GET returns updated value
    - _Requirements: 3.1, 3.2, 3.6, 6.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The migration (task 1.1) depends on migration 023 (card_definitions table) being present
- All conversion functions are atomic (single transaction) to prevent partial state

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "3.3"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 5, "tasks": ["5.7", "6.1", "6.2", "6.3"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3"] }
  ]
}
```
