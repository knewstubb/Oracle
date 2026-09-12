# Implementation Plan: Supabase Migration

## Overview

This plan migrates The Oracle from SQLite (better-sqlite3) to Supabase (Postgres) for Vercel deployment. The work is phased: infrastructure setup → schema + data migration scripts → application layer swap (by module) → long-running ops → cleanup. Each phase has a checkpoint to verify before proceeding.

## Tasks

- [x] 1. Supabase project setup and client infrastructure
  - [x] 1.1 Install `@supabase/supabase-js` and create `src/lib/supabase.ts` with `createServerClient()` and `createBrowserClient()` functions
    - Replace `src/lib/db.ts` as the primary database module
    - Export both server-side (service role key) and client-side (anon key) client factories
    - Include typed `Database` generic from auto-generated types
    - _Requirements: 5.1, 5.3, 8.1_

  - [x] 1.2 Create environment configuration for Supabase
    - Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to `.env.local.example`
    - Add fail-fast validation at client creation (throw descriptive errors for missing vars)
    - Update `.gitignore` if needed for new env patterns
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 1.3 Generate TypeScript types from Supabase schema
    - Run `supabase gen types typescript` after DDL is applied (or create placeholder `src/types/supabase.ts`)
    - Types provide full type safety on all query builder calls
    - _Requirements: 5.1_

- [x] 2. Schema translation and DDL application
  - [x] 2.1 Create the Postgres DDL migration file (`supabase/migrations/001_initial_schema.sql`)
    - Include all 31 tables from the design document in FK_Dependency_Order
    - Include all indexes, CHECK constraints, UNIQUE constraints
    - Include the `shared_cards` view translation
    - Exclude `sqlite_sequence` and `notion_deck_map`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10_

  - [x] 2.2 Add `user_id UUID NOT NULL` column and indexes to all user-owned tables in the DDL
    - 24 user-owned tables get the column per the design document's user_id strategy
    - 7 reference/system tables excluded
    - Add `CREATE INDEX idx_<table>_user_id ON <table>(user_id)` for each
    - _Requirements: 3.1, 3.6_

  - [x] 2.3 Create Postgres functions for complex queries (called via `.rpc()`)
    - `get_price_to_add(card_def_id)` — multi-table price lookup
    - `get_bulk_price_to_add()` — bulk price lookup for all definitions
    - `get_collection_rollup(p_user_id)` — collection with physical copies + prices
    - `get_shared_cards(p_user_id)` — shared cards across decks
    - _Requirements: 5.2, 5.4_

  - [ ]* 2.4 Write property tests for DDL type translation (Property 1)
    - **Property 1: DDL Type Translation Correctness**
    - Verify INTEGER PRIMARY KEY AUTOINCREMENT → INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY
    - Verify DATETIME DEFAULT CURRENT_TIMESTAMP → TIMESTAMPTZ DEFAULT now()
    - **Validates: Requirements 2.1, 2.4, 2.10**

  - [ ]* 2.5 Write property test for schema completeness (Property 2)
    - **Property 2: Schema Completeness**
    - For any table/index in Schema_Inventory (excluding sqlite_sequence and dropped tables), a corresponding CREATE TABLE/INDEX exists in Postgres DDL
    - **Validates: Requirements 2.7, 2.8**

  - [ ]* 2.6 Write property test for user_id column presence (Property 3)
    - **Property 3: user_id Column Presence and Indexing**
    - For any user-owned table, DDL includes `user_id UUID NOT NULL` and an index on that column
    - **Validates: Requirements 3.1, 3.6**

- [x] 3. Checkpoint — Schema verified
  - Ensure DDL applies cleanly to Supabase (run migration). Ensure all property tests pass. Ask the user if questions arise.

- [x] 4. Data migration scripts
  - [x] 4.1 Create `scripts/export-sqlite.ts` — export all tables from SQLite to JSON
    - Export in FK_Dependency_Order (7 waves per design)
    - Preserve all column values as-is (transformation happens in next step)
    - Compute SHA-256 checksum of source DB before and after export
    - _Requirements: 4.1, 9.4_

  - [x] 4.2 Create `scripts/transform-data.ts` — apply type mapping and add user_id
    - Boolean 0/1 → native `true`/`false` for all boolean columns
    - Inject fixed UUID for `user_id` on all user-owned table rows
    - Pass through ISO 8601 datetime strings (valid for TIMESTAMPTZ)
    - Halt on any transformation error with table + row + error detail
    - _Requirements: 4.2, 4.4, 4.8_

  - [x] 4.3 Create `scripts/load-postgres.ts` — bulk insert into Supabase
    - Load tables in FK_Dependency_Order (parent before child)
    - Use service role key for direct inserts
    - Handle duplicate key violations (log and skip for re-runs)
    - Halt on FK constraint violations with detailed error
    - _Requirements: 4.3, 4.8_

  - [x] 4.4 Create `scripts/verify-migration.ts` — post-migration verification
    - Row count comparison for all tables (source vs target)
    - FK integrity scan (query for orphans on every FK relationship)
    - Random sample comparison (10 rows per table, field-by-field after transformation)
    - user_id consistency check (all user-owned rows have the fixed UUID)
    - SHA-256 checksum comparison (source DB unchanged)
    - _Requirements: 4.5, 4.6, 4.7, 9.4_

  - [ ]* 4.5 Write property test for user_id population consistency (Property 4)
    - **Property 4: user_id Population Consistency**
    - For any row in any user-owned table post-migration, user_id equals the fixed UUID (no NULLs, no mismatches)
    - **Validates: Requirements 3.2, 4.4**

  - [ ]* 4.6 Write property test for row count integrity (Property 5)
    - **Property 5: Data Migration Row Count Integrity**
    - For any table, row count in Target equals row count in Source
    - **Validates: Requirements 4.1, 4.5**

  - [ ]* 4.7 Write property test for value preservation (Property 6)
    - **Property 6: Data Migration Value Preservation (Round-Trip)**
    - For any randomly selected row, field values match after type transformation (lossless mapping)
    - **Validates: Requirements 4.2, 4.7**

  - [ ]* 4.8 Write property test for source DB immutability (Property 7)
    - **Property 7: Source Database Immutability**
    - SHA-256 of source DB is identical before and after migration
    - **Validates: Requirements 9.4**

- [x] 5. Checkpoint — Data migration verified
  - Run full migration against test Supabase instance. Run verification script. Ensure all property tests pass. Ask the user if questions arise.

- [x] 6. Application layer swap — Core stores and utilities
  - [x] 6.1 Refactor `src/lib/card-identity-store.ts` to use Supabase client
    - Replace `better-sqlite3` imports with `createServerClient()`
    - Convert synchronous queries to async Supabase query builder calls
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 6.2 Refactor `src/lib/price-store.ts` to use Supabase client
    - Replace raw SQL with `.rpc('get_price_to_add')` and `.rpc('get_bulk_price_to_add')`
    - Convert sync to async
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 6.3 Refactor `src/lib/allocation-store.ts` and `src/lib/allocation.ts` to use Supabase client
    - Convert allocation queries to Supabase query builder
    - Replace `group_concat` with `string_agg` or array aggregation via `.rpc()`
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 6.4 Refactor `src/lib/allocation-resolver.ts` and `src/lib/ownership-resolver.ts`
    - Convert sync DB calls to async Supabase calls
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 6.5 Refactor `src/lib/card-repository.ts` and `src/lib/sqlite-card-repository.ts`
    - Replace SQLite card repository with Supabase-backed implementation
    - Remove `sqlite-card-repository.ts` or consolidate into single async repository
    - _Requirements: 5.1, 5.5_

  - [x] 6.6 Refactor `src/lib/collection-utils.ts` and `src/lib/collection-filters.ts`
    - Convert collection queries to Supabase query builder
    - _Requirements: 5.1, 5.5_

- [x] 7. Application layer swap — Deck and documentation stores
  - [x] 7.1 Refactor `src/lib/deck-documentation-store.ts` to use Supabase client
    - Convert all deck documentation CRUD to Supabase query builder
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 7.2 Refactor `src/lib/health-store.ts` and `src/lib/health-engine.ts`
    - Convert health check storage and engine queries to async Supabase calls
    - _Requirements: 5.1, 5.2, 5.5_

  - [x] 7.3 Refactor `src/lib/dead-weight-classifier.ts`
    - Convert dead weight queries to Supabase query builder
    - _Requirements: 5.1, 5.5_

  - [x] 7.4 Refactor `src/lib/generic-land-store.ts`
    - Convert generic land preference storage to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 7.5 Refactor `src/lib/precon-mod-store.ts` and `src/lib/precon-mod-engine.ts`
    - Convert precon mod state storage to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 7.6 Refactor `src/lib/upgrade-candidates.ts`, `src/lib/upgrade-changelog.ts`, `src/lib/upgrade-pairing.ts`, `src/lib/upgrade-strategy-data.ts`
    - Convert all upgrade-related queries to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 7.7 Refactor `src/lib/rating-engine.ts`
    - Convert deck rating storage to Supabase
    - _Requirements: 5.1, 5.5_

- [x] 8. Application layer swap — Sync, import, and movement engines
  - [x] 8.1 Refactor `src/lib/sync-engine.ts` and `src/lib/sync.ts`
    - Convert deck sync logic to async Supabase calls
    - Replace `json_group_array` with `json_agg` via `.rpc()` where needed
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 8.2 Refactor `src/lib/csv-import.ts` and `src/lib/import-engine.ts`
    - Convert import logic to Supabase upserts
    - Implement chunked processing (500 rows per batch) for Vercel timeout compatibility
    - _Requirements: 5.1, 5.5, 6.5_

  - [x] 8.3 Refactor `src/lib/card-movement.ts`
    - Convert card movement transactions to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 8.4 Refactor `src/lib/identity-resolver.ts`
    - Convert oracle_id / printing lookups to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 8.5 Refactor `src/lib/archidekt-sync.ts` and `src/lib/archidekt-client.ts`
    - Convert Archidekt sync DB operations to Supabase (data read/write only — Playwright remains dormant)
    - _Requirements: 5.1, 5.5, 7.4_

- [x] 9. Application layer swap — Brew and debrief sessions
  - [x] 9.1 Refactor `src/lib/brew-v2-session.ts`, `src/lib/brew-v2-deck-state.ts`, `src/lib/brew-v2-assessment-cache.ts`, `src/lib/brew-v2-decisions.ts`
    - Convert brew session CRUD and state management to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 9.2 Refactor `src/lib/debrief-actions.ts`
    - Convert debrief session and action storage to Supabase
    - _Requirements: 5.1, 5.5_

- [x] 10. Checkpoint — Library layer complete
  - Ensure all `src/lib/` store modules compile with zero `better-sqlite3` imports. Run existing unit tests (expect some to need async updates). Ask the user if questions arise.

- [x] 11. Application layer swap — API routes (Collection & Cards)
  - [x] 11.1 Refactor `src/app/api/collection/route.ts` and sub-routes (allocation, import, prices, rollup, stats)
    - Convert all collection API routes to use `createServerClient()`
    - Import endpoint uses chunked processing pattern
    - Prices refresh becomes a trigger for Edge Function (task 14)
    - _Requirements: 5.1, 5.3, 5.5, 6.5_

  - [x] 11.2 Refactor `src/app/api/cards/[name]/decks/` route
    - Convert card lookup queries to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 11.3 Refactor `src/app/api/shared-cards/route.ts` and allocations sub-route
    - Convert shared cards queries to `.rpc('get_shared_cards')` or Supabase query builder
    - _Requirements: 5.1, 5.4, 5.5_

- [x] 12. Application layer swap — API routes (Decks)
  - [x] 12.1 Refactor `src/app/api/decks/route.ts` and `src/app/api/decks/[id]/route.ts`
    - Convert deck list and detail queries to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 12.2 Refactor deck sub-routes: combos, dead-weight, documentation, health, mana, notes, overview, ratings, strategy, upgrade
    - Convert all deck content CRUD routes to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 12.3 Refactor deck sub-routes: debrief-session, generic-lands, precon-diff, precon-mod-state, push, reimport
    - Convert remaining deck operation routes to Supabase
    - _Requirements: 5.1, 5.5_

- [x] 13. Application layer swap — API routes (Allocation, Sync, Brew, AI)
  - [x] 13.1 Refactor `src/app/api/allocation/` routes (root, move, priority, reassign)
    - Convert allocation API routes to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 13.2 Refactor `src/app/api/proxy-allocate/route.ts`
    - Convert proxy allocation to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 13.3 Refactor `src/app/api/sync/` routes (root, full, status)
    - Convert sync operations to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 13.4 Refactor `src/app/api/brew/` routes (assess, chat, commit, extract, positions, save, session, skeleton)
    - Convert brew API routes to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 13.5 Refactor `src/app/api/brew-sessions/[id]/route.ts`
    - Convert brew session lookup to Supabase
    - _Requirements: 5.1, 5.5_

  - [x] 13.6 Refactor `src/app/api/ai/` routes (brew sub-routes, build-deck, debrief sub-routes, deck-scan, mana-analysis, recommend, search)
    - Convert AI route DB dependencies to Supabase (AI model calls unchanged)
    - _Requirements: 5.1, 5.5_

  - [x] 13.7 Refactor `src/app/api/settings/generic-land-preferences/route.ts`
    - Convert settings storage to Supabase
    - _Requirements: 5.1, 5.5_

- [x] 14. Checkpoint — Application layer swap complete
  - Ensure zero remaining imports of `better-sqlite3` across the entire codebase. Ensure zero references to local SQLite file path. Run `grep -r "better-sqlite3" src/` and `grep -r "oracle.db" src/` to confirm. Ask the user if questions arise.

- [x] 15. Long-running operations — CK Price Refresh Edge Function
  - [x] 15.1 Create Supabase Edge Function for Card Kingdom price refresh
    - Deno-based edge function under `supabase/functions/ck-price-refresh/`
    - Fetches CK API, processes entries, writes directly to `card_kingdom_prices` table
    - Preserves existing retry logic (3 attempts, 30s delay)
    - No Vercel timeout constraint (runs on Supabase infrastructure)
    - _Requirements: 6.1, 6.3, 6.4_

  - [x] 15.2 Create trigger endpoint in Next.js for invoking the Edge Function
    - Thin API route that invokes the Edge Function URL
    - Can be triggered by Vercel Cron or manually from the UI
    - Returns status/progress rather than blocking
    - _Requirements: 6.4_

- [x] 16. Long-running operations — Chunked CSV Import
  - [x] 16.1 Implement chunked CSV import client-side orchestration
    - Parse CSV client-side (pure string processing)
    - POST chunks of ~500 rows per request to the import API
    - Sequential chunk processing with progress reporting
    - Per-chunk Postgres transaction (individual failures are recoverable)
    - _Requirements: 6.3, 6.5_

- [x] 17. Playwright decommission and cleanup
  - [x] 17.1 Remove any automatic/scheduled triggers of Playwright automation
    - Scan for cron jobs, scheduled invocations, or auto-triggers of `archidekt-playwright.ts`
    - Remove triggers but retain the dormant code file
    - Ensure no feature depends on Playwright for normal operation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 17.2 Remove `src/lib/db.ts`, `src/lib/init-db.ts`, `src/lib/migrate.ts` and SQLite dependencies
    - Delete or deprecate SQLite-specific modules
    - Remove `better-sqlite3` from `package.json` dependencies
    - Remove SQLite migration files (retain as archive in git history)
    - _Requirements: 5.5, 8.2_

- [x] 18. End-to-end verification and environment finalization
  - [-] 18.1 Run end-to-end verification against Supabase
    - Collection data loads correctly
    - Deck lists display correctly
    - Price cache queries function
    - All CRUD operations work against Target_Database
    - _Requirements: 9.1_

  - [x] 18.2 Verify Vercel deployment compatibility
    - No local filesystem access required
    - Environment variables sourced from Vercel config
    - All API routes respond correctly in serverless context
    - _Requirements: 5.6, 6.1, 8.4_

  - [x] 18.3 Document rollback procedure
    - Source DB preserved (not deleted)
    - Document steps to revert to SQLite if critical failure discovered
    - _Requirements: 9.2, 9.3_

- [x] 19. Final checkpoint — Migration complete
  - Ensure all tests pass. Confirm zero `better-sqlite3` references. Confirm Vercel deployment works. Confirm Source_Database preserved as rollback safety net. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between phases
- The application layer swap (tasks 6–14) is the largest body of work — broken by module to allow incremental progress
- Task 15 (Edge Function) can be built in parallel with the application layer swap (tasks 6–14)
- Task 17 (Playwright decommission + SQLite cleanup) is independent and low-risk
- Property tests validate universal correctness properties from the design document
- The Source_Database (`data/oracle.db`) is NEVER modified — it remains read-only throughout

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3", "6.5", "6.6", "15.1"] },
    { "id": 8, "tasks": ["6.4", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "15.2"] },
    { "id": 9, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "9.1", "9.2", "17.1"] },
    { "id": 10, "tasks": ["11.1", "11.2", "11.3", "12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3", "13.1", "13.2", "13.3"] },
    { "id": 12, "tasks": ["13.4", "13.5", "13.6", "13.7", "16.1"] },
    { "id": 13, "tasks": ["17.2"] },
    { "id": 14, "tasks": ["18.1", "18.2", "18.3"] }
  ]
}
```
