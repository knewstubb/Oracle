# Implementation Plan: Collection CSV Upsert

## Overview

Replace the destructive DELETE+INSERT collection import with a 5-stage upsert pipeline that writes to `physical_copies`. The pipeline resolves printing identities via cached Scryfall bulk data, performs authoritative overwrites, and soft-deletes absent rows — all within a single SQLite transaction.

## Tasks

- [x] 1. Database migration and store extension
  - [x] 1.1 Create migration 028-physical-copies-game-column.sql
    - Add `game TEXT NOT NULL DEFAULT 'paper'` column with CHECK constraint to physical_copies
    - Add partial index `idx_physical_copies_game` on (game, is_proxy) WHERE is_proxy = 0
    - Wrap in BEGIN/COMMIT
    - _Requirements: 4.1_

  - [x] 1.2 Add `setPhysicalCopyState` function to card-identity-store.ts
    - Implement authoritative-overwrite INSERT ... ON CONFLICT DO UPDATE SET quantity, condition
    - Return `{ id, action }` where action is 'created' | 'updated_quantity' | 'updated_condition' | 'unchanged'
    - Compare pre-state vs post-state in TypeScript for action detection
    - Scope to is_proxy = FALSE, game = 'paper'
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7_

  - [ ]* 1.3 Write unit tests for setPhysicalCopyState
    - Test create new row, update quantity, update condition, no-op unchanged, paper-only invariant
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. Scryfall bulk data cache
  - [x] 2.1 Create src/lib/scryfall-bulk-cache.ts
    - Implement `ensureBulkData(options?)` — downloads Scryfall "default_cards" bulk JSON if not cached or stale (>7 days)
    - Cache location: `data/scryfall-bulk-default-cards.json`
    - Implement `buildIndexFromFile(filePath)` — streams JSON to build `ScryfallBulkIndex` with `byPrintingId` and `bySetCollector` maps
    - _Requirements: 2.5_

  - [ ]* 2.2 Write unit tests for scryfall-bulk-cache
    - Test cache freshness check, index building from fixture file, map correctness
    - _Requirements: 2.5_

- [x] 3. Identity resolver
  - [x] 3.1 Create src/lib/identity-resolver.ts with types and pure resolution logic
    - Define `ParsedCSVRow`, `ResolvedRow`, `PhysicalCondition`, `ResolutionResult`, `ScryfallBulkIndex` interfaces
    - Implement `resolveIdentities(rows, index)` — primary key resolution (Scryfall ID), fallback (set+collector), oracle_id extraction
    - Implement `mapCondition(csvCondition)` — case-insensitive condition mapping with wasUnrecognized flag
    - Implement `mapFinishToFoil(finish)` — "Normal" → false, non-empty non-"Normal" → true, empty → false
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3_

  - [ ]* 3.2 Write property tests for identity resolution (Properties 1–4)
    - **Property 1: Printing Identity Direct Resolution**
    - **Property 2: Fallback Resolution Chain**
    - **Property 3: Unresolvable Rows Never Create Physical Copies**
    - **Property 4: Unmatched Row Reporting Completeness**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [ ]* 3.3 Write property tests for finish and condition mapping (Property 7)
    - **Property 7: Finish-to-Foil Mapping**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Import engine orchestrator
  - [x] 5.1 Create src/lib/import-engine.ts with types and pipeline orchestration
    - Define `ImportOptions`, `ImportSummary`, `UnmatchedRowDetail`, `UnmatchedReason` types
    - Implement `executeCollectionImport(db, options)`:
      - Stage 1: Parse CSV (reuse `parseCollectionCSV` from csv-import.ts or adapt for the new row format)
      - Stage 2: Load bulk index, call `resolveIdentities`
      - Stage 3: Ensure card_definitions exist (reuse/create), then call `setPhysicalCopyState` for each resolved row
      - Stage 4: Soft-delete scan — UPDATE quantity=0 for paper/non-proxy rows not matched
      - Stage 5: Build and return `ImportSummary`
    - Wrap stages 3–4 in a single SQLite transaction (BEGIN/COMMIT/ROLLBACK on error)
    - Track timing for durationMs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 5.1, 5.2, 5.6, 6.1, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 9.1, 9.2, 9.3, 9.4, 10.1, 10.4_

  - [ ]* 5.2 Write property tests for oracle ID and card definition linkage (Properties 5–6)
    - **Property 5: Oracle ID Resolution Reuses Existing Card Definitions**
    - **Property 6: Oracle ID Resolution Creates Missing Card Definitions**
    - **Validates: Requirements 2.1, 2.3, 2.4**

  - [ ]* 5.3 Write property tests for authoritative overwrite and no-op detection (Properties 8–9)
    - **Property 8: Authoritative Quantity Overwrite**
    - **Property 9: No-Op Detection**
    - **Validates: Requirements 5.2, 5.3, 7.1, 7.3**

  - [ ]* 5.4 Write property tests for soft-delete and no-hard-delete invariants (Properties 10–12)
    - **Property 10: Soft-Delete Scope**
    - **Property 11: No Hard Deletes**
    - **Property 12: Soft-Deleted Row Reactivation**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 7.4**

  - [ ]* 5.5 Write property tests for isolation and immutability (Properties 13–14)
    - **Property 13: Deck Isolation**
    - **Property 14: Proxy Immutability**
    - **Validates: Requirements 8.1, 8.2, 8.3, 9.3, 9.4**

  - [ ]* 5.6 Write property tests for summary and validation (Properties 15–17)
    - **Property 15: Import Summary Arithmetic**
    - **Property 16: Invalid Quantity Rejection**
    - **Property 17: Paper-Only and Non-Proxy Invariant**
    - **Validates: Requirements 4.2, 5.6, 5.7, 7.2, 7.3, 10.1, 10.4**

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. API route integration
  - [x] 7.1 Modify src/app/api/collection/import/route.ts to support ?mode=upsert
    - Add `mode` query param parsing: 'upsert' (new engine) | 'legacy' (existing DELETE+INSERT)
    - Default mode: 'upsert'
    - When mode=upsert: call `executeCollectionImport(db, { csvInput })` and return ImportSummary as JSON
    - When mode=legacy: preserve existing behavior (parseCollectionCSV → applyCollectionImport)
    - Return 400 for CSV parse errors, 500 for DB errors
    - Handle SQLITE_BUSY with retry (up to 3 attempts, exponential backoff)
    - _Requirements: 4.2, 4.3, 4.4, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 7.2 Write integration tests for API route
    - Test mode=upsert returns ImportSummary with correct HTTP 200
    - Test mode=legacy still works (backward compatibility)
    - Test missing CSV returns 400
    - Test transaction rollback on simulated DB failure returns 500
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 8. Unit tests for full pipeline
  - [ ]* 8.1 Write example-based unit tests for import-engine
    - Full import of 5-row CSV: verify created/updated/soft-deleted counts
    - Re-import identical CSV: verify totalWriteCount=0
    - Import with invalid quantity (0): verify unmatched with reason
    - Import with missing Scryfall ID + valid set+collector: verify fallback
    - Condition update without quantity change: verify updatedCondition count
    - Soft-delete preserves deck_cards references
    - Previously soft-deleted row reactivated by re-import
    - ImportSummary includes durationMs > 0
    - _Requirements: 5.2, 5.3, 5.6, 6.1, 6.3, 7.1, 7.3, 8.3, 10.1, 10.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 17 universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- The existing `parseCollectionCSV` from `csv-import.ts` can be reused/adapted for Stage 1 parsing
- All property tests use fast-check with `numRuns: 100` and run against in-memory SQLite (`:memory:`)
- The `scryfall-bulk-cache.ts` module downloads ~500MB of bulk data; tests should use small fixture files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["7.1", "8.1"] },
    { "id": 7, "tasks": ["7.2"] }
  ]
}
```
