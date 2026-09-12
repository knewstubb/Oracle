# Implementation Plan: Card Identity & Physical Copies

## Overview

This plan implements the two-layer data model (card_definitions + physical_copies) and the deck_cards linkage column as a purely additive, data-layer change. The implementation proceeds in phases: migration SQL, TypeScript types and data access module, unit/integration tests, and wiring verification. All code is TypeScript using better-sqlite3 against SQLite.

**v2 Addendum:** Tasks 1–3 and 6 were completed against the original per-object model. Tasks 7+ bring the schema and store module to v2 (printing-group model) with quantity column, unique index, upsert semantics, computed in-use counts, and removal of Governing Rule rejection.

## Tasks

- [x] 1. Create migration and down-migration SQL files
  - [x] 1.1 Create forward migration `db/migrations/023-card-identity-physical-copies.sql`
    - Create `card_definitions` table with id, oracle_id (UNIQUE), card_name, created_at
    - Create `physical_copies` table with all columns, CHECK constraint on condition, FK to card_definitions
    - ALTER `deck_cards` to add nullable `physical_copy_id` column with UNIQUE constraint and FK ON DELETE SET NULL
    - Add index on `card_definitions.card_name`
    - Add indexes on `physical_copies.card_definition_id` and `physical_copies.is_proxy`
    - Backfill `card_definitions` from DISTINCT card_name/scryfall_id across deck_cards and collection
    - Backfill `physical_copies` for deck_cards rows with `ownership_status = 'proxy'`
    - Update backfilled deck_cards rows to set `physical_copy_id`
    - Wrap all statements in BEGIN/COMMIT for transactional safety
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.3, 2.5, 2.6, 5.1, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 1.2 Create down-migration `db/down/023-card-identity-physical-copies-down.sql`
    - Create `db/down/` directory
    - Rebuild `deck_cards` without `physical_copy_id` using table-rebuild approach (SQLite <3.35 safety)
    - Recreate existing indexes on deck_cards
    - DROP `physical_copies` table
    - DROP `card_definitions` table
    - _Requirements: 7.7_

- [x] 2. Implement card-identity-store data access module
  - [x] 2.1 Create TypeScript types in `src/lib/card-identity-store.ts`
    - Define `CardDefinition`, `PhysicalCopy`, `PhysicalCondition`, `CreatePhysicalCopyParams` interfaces
    - Define error types: `GOVERNING_RULE_VIOLATION`, `CARD_MISMATCH`, `INVALID_PRINTING`
    - _Requirements: 2.5, 8.3_

  - [x] 2.2 Implement Card Definition CRUD functions
    - `ensureCardDefinition(oracleId, cardName)` — INSERT OR IGNORE + SELECT pattern, returns integer id
    - `getCardDefinitionByOracleId(oracleId)` — returns CardDefinition | null
    - `getCardDefinitionById(id)` — returns CardDefinition | null
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.3 Implement Physical Copy CRUD functions
    - `createPhysicalCopy(params)` — validates governing rule, inserts row, returns PhysicalCopy
    - `getPhysicalCopy(id)` — returns PhysicalCopy | null
    - `deletePhysicalCopy(id)` — deletes row (ON DELETE SET NULL cascades to deck_cards)
    - `listUnassignedPhysicalCopies()` — returns physical copies with no deck_cards reference
    - `listPhysicalCopiesForDefinition(cardDefinitionId)` — returns all copies for a card definition
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 3.1, 3.2, 4.1, 4.2, 4.3, 8.2, 8.3, 8.4_

  - [x] 2.4 Implement Deck Linkage functions
    - `linkPhysicalCopyToDeckCard(physicalCopyId, deckCardId)` — validates card match, sets physical_copy_id
    - `unlinkPhysicalCopyFromDeckCard(deckCardId)` — sets physical_copy_id to NULL
    - `validateCardMatch(physicalCopyId, deckCardId)` — checks card_definition_id matches deck_card's card
    - `validateGoverningRule(params)` — checks at least one distinguishing attribute present
    - _Requirements: 3.3, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [x] 3. Checkpoint - Verify migration and data access module
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Write property-based tests (v1 — SUPERSEDED by v2 properties in task 9)
  - [ ]* 4.1 Write property test for Card Definition Idempotence
    - **Property 1: Card Definition Idempotence**
    - Generate random oracle_id and card_name pairs; call ensureCardDefinition multiple times; assert same id returned and no duplicate rows
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 4.2 Write property test for Physical Copy Creation Validity
    - **Property 2: Physical Copy Creation Validity**
    - Generate valid card_definition_id and at least one distinguishing attribute; assert creation succeeds with correct fields stored
    - **Validates: Requirements 2.1, 2.2, 2.4, 8.4**

  - [ ]* 4.3 Write property test for Condition Constraint Enforcement
    - **Property 3: Condition Constraint Enforcement**
    - Generate arbitrary strings for condition; assert only valid enum values or NULL are accepted
    - **Validates: Requirements 2.5**

  - [ ]* 4.4 Write property test for Proxy-For Cascade
    - **Property 4: Proxy-For Cascade (ON DELETE SET NULL)**
    - Create physical copy with proxy_for_definition_id; delete the referenced card_definition; assert proxy_for_definition_id becomes NULL and physical copy persists
    - **Validates: Requirements 2.8**

  - [ ]* 4.5 Write property test for Unassigned Copy Persistence
    - **Property 5: Unassigned Copy Persistence**
    - Create physical copies without deck linkage; assert all appear in listUnassignedPhysicalCopies results
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 4.6 Write property test for Deck Slot Linkage
    - **Property 6: Deck Slot Linkage**
    - Link a physical copy to a compatible deck_card; assert physical_copy_id is set; relink with different copy; assert replacement
    - **Validates: Requirements 3.3, 3.4, 5.1**

  - [ ]* 4.7 Write property test for Physical Copy Uniqueness Across Deck Slots
    - **Property 7: Physical Copy Uniqueness Across Deck Slots — INVALID under v2 (many-to-one allowed)**
    - ~~Link a physical copy to one deck_card; attempt to link same copy to a second deck_card; assert rejection via UNIQUE constraint~~
    - **REMOVED: v2 drops the UNIQUE constraint. See task 9.3 for the replacement property.**
    - **Validates: N/A**

  - [ ]* 4.8 Write property test for Non-Unique Printing Identifiers
    - **Property 8: Non-Unique Printing Identifiers**
    - Create multiple physical copies with same scryfall_printing_id and card_definition_id; assert each gets a distinct primary key
    - **Validates: Requirements 4.3**

  - [ ]* 4.9 Write property test for Deck Card Cascade
    - **Property 9: Deck Card Cascade (ON DELETE SET NULL)**
    - Link a physical copy to a deck_card; delete the physical copy; assert deck_card.physical_copy_id is NULL and deck_card still exists
    - **Validates: Requirements 5.3**

  - [ ]* 4.10 Write property test for Linkage Preserves Existing Columns
    - **Property 10: Linkage Preserves Existing Columns**
    - Record ownership_status and proxy_of_deck_id before linkage; link/unlink; assert those columns unchanged
    - **Validates: Requirements 5.4, 5.7**

  - [ ]* 4.11 Write property test for Card Match Validation
    - **Property 11: Card Match Validation**
    - Attempt to link a physical copy to a deck_card with mismatched card identity; assert rejection
    - **Validates: Requirements 5.6**

  - [ ]* 4.12 Write property test for Unlinking Preserves Physical Copy
    - **Property 12: Unlinking Preserves Physical Copy**
    - Unlink a physical copy from a deck_card; assert physical copy still exists in table
    - **Validates: Requirements 5.7**

  - [ ]* 4.13 Write property test for Governing Rule Rejection
    - **Property 13: Governing Rule Rejection — INVALID under v2 (Governing Rule removed)**
    - ~~Attempt createPhysicalCopy with is_proxy=FALSE, is_foil=FALSE, scryfall_printing_id=NULL; assert rejection with GOVERNING_RULE_VIOLATION error~~
    - **REMOVED: v2 removes the Governing Rule. See task 9.7 for the replacement property.**
    - **Validates: N/A**

- [ ] 5. Write unit and integration tests (v1 — SUPERSEDED by v2 tests in task 10)
  - [ ]* 5.1 Write unit tests for card-identity-store
    - Test file: `src/lib/__tests__/card-identity-store.test.ts`
    - Smoke test: schema structure after migration (tables exist, columns correct)
    - Default values: is_proxy defaults to FALSE, is_foil defaults to FALSE
    - Special printing registration workflow (Requirement 4.1)
    - Unassigned proxy creation workflow (Requirement 3.1)
    - Edge case: physical copy with all optional fields NULL
    - Edge case: card_name at exactly 256 characters
    - _Requirements: 1.4, 2.3, 2.6, 3.1, 4.1, 5.1, 8.1_

  - [ ]* 5.2 Write integration tests for migration
    - Test file: `src/lib/__tests__/card-identity-migration.integration.test.ts`
    - Migration up/down roundtrip (Requirement 7.7)
    - shared_cards view returns identical results pre/post migration (Requirement 6.1)
    - computeAllocations produces identical output pre/post migration (Requirement 6.5)
    - Backfill creates correct physical_copies for proxy rows (Requirement 7.4)
    - Collection table unchanged after migration (Requirement 6.3)
    - proxy_allocations table unchanged (Requirement 6.2)
    - deck_cards.ownership_status and proxy_of_deck_id preserved (Requirement 6.4)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.4, 7.6, 7.7_

- [x] 6. Final checkpoint - Verify all tests pass and backward compatibility
  - Ensure all tests pass, ask the user if questions arise.
  - Verify that existing allocation-store and allocation-resolver continue to work without modification
  - Confirm shared_cards view and computeAllocations produce identical results post-migration

- [x] 7. Create v2 migration and down-migration
  - [x] 7.1 Create forward migration `db/migrations/026-physical-copies-v2.sql`
    - Add `quantity INTEGER NOT NULL DEFAULT 1` column to physical_copies
    - Create UNIQUE INDEX `idx_physical_copies_group` ON physical_copies(card_definition_id, scryfall_printing_id, is_foil, is_proxy)
    - Drop the UNIQUE INDEX `idx_deck_cards_physical_copy_id` on deck_cards
    - Create a non-unique INDEX `idx_deck_cards_physical_copy_id` on deck_cards(physical_copy_id) WHERE physical_copy_id IS NOT NULL
    - Wrap in BEGIN/COMMIT
    - _Requirements: 2.1, 2.2, 2.10, 5.5, 7.3, 7.8_

  - [x] 7.2 Create down-migration `db/down/026-physical-copies-v2-down.sql`
    - Drop non-unique index on deck_cards.physical_copy_id
    - Restore UNIQUE index on deck_cards.physical_copy_id
    - Drop unique index `idx_physical_copies_group`
    - Remove `quantity` column via table rebuild (CREATE backup → DROP → RENAME)
    - Recreate indexes on physical_copies (card_definition_id, is_proxy)
    - _Requirements: 7.7_

- [x] 8. Update card-identity-store for v2 semantics
  - [x] 8.1 Update types and remove Governing Rule
    - Add `quantity: number` field to `PhysicalCopy` interface
    - Add `PrintingGroupKey`, `UpsertPhysicalCopyParams`, `CollectionImportParams`, `CollectionRollupRow`, `ProxyRollupRow` interfaces
    - Remove `GOVERNING_RULE_VIOLATION` from `CardIdentityErrorCode`
    - Remove `validateGoverningRule` function
    - Remove governing rule check from `createPhysicalCopy` (or replace function entirely)
    - Update `mapRowToPhysicalCopy` to include `quantity` field
    - _Requirements: 8.3, 2.1_

  - [x] 8.2 Implement `upsertPhysicalCopy` with ON CONFLICT DO UPDATE
    - Replace `createPhysicalCopy` with `upsertPhysicalCopy(params: UpsertPhysicalCopyParams): PhysicalCopy`
    - Use `INSERT ... ON CONFLICT (card_definition_id, scryfall_printing_id, is_foil, is_proxy) DO UPDATE SET quantity = physical_copies.quantity + excluded.quantity RETURNING *`
    - Default quantity to 1 when not provided
    - _Requirements: 2.2, 3.1, 4.3, 8.2_

  - [x] 8.3 Update `linkPhysicalCopyToDeckCard` for many-to-one semantics
    - Remove try/catch for UNIQUE constraint errors (no longer applicable)
    - Remove comment about UNIQUE constraint enforcement
    - Keep `validateCardMatch` check (still required)
    - Allow multiple deck_cards rows to reference the same physical_copy_id
    - _Requirements: 3.5, 5.5_

  - [x] 8.4 Add `findPrintingGroup` lookup function
    - `findPrintingGroup(db, params: PrintingGroupKey): PhysicalCopy | null`
    - SELECT by the unique key (card_definition_id, scryfall_printing_id, is_foil, is_proxy)
    - _Requirements: 2.2, 2.10_

  - [x] 8.5 Add computed in-use count query functions
    - `getCardLevelInUseCount(db, cardDefinitionId): number` — COUNT of deck_cards referencing any physical_copy for that card_definition
    - `getSubgroupInUseCount(db, physicalCopyId): number` — COUNT of deck_cards referencing that specific physical_copy
    - _Requirements: 9.1, 9.2, 9.7_

  - [x] 8.6 Add collection and proxy rollup query functions
    - `getCollectionRollup(db): CollectionRollupRow[]` — card-level rollup with owned_quantity (non-proxy sum) and in_use_count, filtered WHERE is_proxy = 0
    - `getProxyRollup(db): ProxyRollupRow[]` — proxy tab rollup with proxy_quantity and in_use_count, filtered WHERE is_proxy = 1
    - _Requirements: 9.5, 10.1, 10.2, 10.4_

  - [x] 8.7 Add `importCollectionCard` function
    - `importCollectionCard(db, params: CollectionImportParams): PhysicalCopy`
    - Calls `ensureCardDefinition` then `upsertPhysicalCopy` with the printing group key
    - Handles the full workflow: oracle_id → card_definition → physical_copy upsert
    - _Requirements: 8.2, 8.4, 2.9_

- [x] 9. Checkpoint - Verify v2 migration and updated store
  - Ensure migration 026 applies cleanly on top of 023
  - Ensure down-migration 026 reverses cleanly
  - Verify upsert creates one row per printing group and increments quantity
  - Verify multiple deck_cards can reference the same physical_copy_id
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Write v2 property-based tests
  - [ ]* 10.1 Write property test for Printing-Group Upsert Quantity Accumulation
    - **Property 2 (v2): Printing-Group Upsert Quantity Accumulation**
    - For any sequence of upserts targeting the same group key, assert exactly one row exists and quantity equals sum of all upsert quantities
    - **Validates: Requirements 2.2, 3.1, 4.3, 8.2**

  - [ ]* 10.2 Write property test for Many-to-One Deck Linkage
    - **Property 6 (v2): Many-to-One Deck Linkage**
    - For any N compatible deck_cards rows, linking all N to the same physical_copy SHALL succeed without constraint violation
    - **Validates: Requirements 3.5, 5.5**

  - [ ]* 10.3 Write property test for Quantity Immutable During Linkage
    - **Property 9 (v2): Quantity Immutable During Linkage**
    - For any physical_copy with quantity Q, linking/unlinking deck_cards SHALL leave quantity unchanged at Q
    - **Validates: Requirements 5.8**

  - [ ]* 10.4 Write property test for Computed In-Use Count Correctness
    - **Property 12 (v2): Computed In-Use Count Correctness**
    - For any configuration of linkages, card-level in-use count SHALL equal sum of subgroup-level in-use counts for the same card_definition
    - **Validates: Requirements 9.1, 9.2, 9.5, 9.6**

  - [ ]* 10.5 Write property test for Proxy Separation Completeness
    - **Property 13 (v2): Proxy Separation Completeness**
    - Collection rollup (is_proxy=0) and proxy rollup (is_proxy=1) form a complete partition — every physical_copies row appears in exactly one
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

  - [ ]* 10.6 Write property test for Undistinguished Cards Accepted
    - **Property 14 (v2): Undistinguished Cards Accepted**
    - Creating a physical_copy with is_proxy=FALSE, is_foil=FALSE, and a non-null scryfall_printing_id SHALL succeed (Governing Rule removed)
    - **Validates: Requirements 8.3**

  - [ ]* 10.7 Write property test for Linkage Replacement Semantics
    - **Property 15 (v2): Linkage Replacement Semantics**
    - Relinking a deck_card to a different physical_copy SHALL succeed and the previously-referenced physical_copy SHALL continue to exist
    - **Validates: Requirements 3.4**

- [ ] 11. Write v2 unit and integration tests
  - [ ]* 11.1 Write unit tests for v2 card-identity-store
    - Test file: `src/lib/__tests__/card-identity-store.test.ts`
    - Schema verification: no UNIQUE on physical_copy_id, quantity column exists, unique index on group key exists
    - Default values: quantity defaults to 1
    - Upsert workflow: import same printing twice → quantity = 2
    - Proxy creation: one row with scryfall_printing_id = NULL per card_definition
    - Collection import: 10 cards across 6 printings → 6 rows, quantities sum to 10
    - In-use count queries: set up known linkages, verify computed counts
    - Attention state: in-use > owned → still returns (not an error)
    - Collection rollup excludes proxies; proxy rollup includes only proxies
    - _Requirements: 2.1, 2.2, 2.9, 2.10, 3.1, 5.5, 8.2, 9.1, 9.2, 9.5, 10.1, 10.2_

  - [ ]* 11.2 Write integration tests for v2 migration roundtrip
    - Test file: `src/lib/__tests__/card-identity-migration.integration.test.ts`
    - Migration 023 + 026 both apply cleanly in sequence
    - Down-migration 026 reverses cleanly (restores UNIQUE, removes quantity)
    - shared_cards view still returns identical results after both migrations
    - computeAllocations still produces identical output
    - Existing physical_copies rows from 023 get quantity = 1 (DEFAULT)
    - proxy_allocations unchanged
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.7, 7.8_

- [ ] 12. Final checkpoint - Verify all v2 tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify that existing allocation-store and allocation-resolver continue to work without modification
  - Confirm upsert accumulates quantity correctly
  - Confirm many-to-one linkage works (multiple deck_cards → same physical_copy)
  - Confirm in-use count queries return correct computed values

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Tasks 1–3, 6 are completed (original v1 implementation)
- Tasks 4–5 are v1 optional tests — properties 4.7 and 4.13 are now INVALID under v2 and should be skipped
- Tasks 7–12 implement the v2 printing-group model on top of the existing v1 foundation
- The migration uses BEGIN/COMMIT for transactional safety as recommended in the design
- `fast-check` is already installed as a dev dependency — no new packages needed
- All tests run against in-memory SQLite (`:memory:`) for speed and isolation
- The `db/down/` directory already exists from task 1.2

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["7.1", "7.2"] },
    { "id": 1, "tasks": ["8.1"] },
    { "id": 2, "tasks": ["8.2", "8.3", "8.4"] },
    { "id": 3, "tasks": ["8.5", "8.6", "8.7"] },
    { "id": 4, "tasks": ["10.1", "10.2", "10.3", "10.6", "10.7"] },
    { "id": 5, "tasks": ["10.4", "10.5"] },
    { "id": 6, "tasks": ["11.1", "11.2"] }
  ]
}
```
