# Implementation Plan: Deck Authority Split

## Overview

This implementation establishes Oracle as the sole source of truth for deck contents after import. The work modifies existing sync infrastructure (replacing `syncAllDecks` with `syncNewDecksOnly`, renaming `syncDeck` to `importDeck`), removes the AutoSync component, creates new API routes for explicit re-import and push actions, and wires a new PushToArchidekt UI component into the deck detail page. All changes are conservative — no schema migrations, only code path changes that gate deck writes behind explicit user action.

## Tasks

- [x] 1. Modify sync core to import-only behavior
  - [x] 1.1 Refactor `src/lib/sync.ts` — replace `syncAllDecks` with `syncNewDecksOnly`, rename `syncDeck` to `importDeck`
    - Replace `syncAllDecks` with `syncNewDecksOnly` that only imports decks not already in the `decks` table
    - Rename `syncDeck` to `importDeck` (same logic, clearer intent)
    - Remove the old `syncAllDecks` export
    - `syncNewDecksOnly` must fetch user decks, diff against existing IDs, and only call `importDeck` for new ones
    - Collection sync (`syncCollection`) continues unchanged within the function
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Modify `src/lib/sync-engine.ts` — `runSyncCycle` no longer auto-reconciles existing decks
    - When no `deckIds` argument is provided, only process new decks (discovery mode)
    - When `deckIds` are explicitly provided, treat as user-triggered re-import
    - Remove any code path that auto-reconciles existing deck data
    - _Requirements: 1.2, 1.3, 2.1, 6.2, 6.4_

  - [ ]* 1.3 Write property test for sync cycle deck protection
    - **Property 2: Sync Cycle Deck Protection**
    - Verify that for any set of previously-imported decks, executing `syncNewDecksOnly` leaves `deck_cards` rows byte-for-byte identical
    - Use fast-check with in-memory SQLite, seeding arbitrary deck data before sync
    - **Validates: Requirements 1.2, 1.4, 2.1, 2.4, 6.1, 6.2, 6.4**

  - [ ]* 1.4 Write property test for import faithfulness
    - **Property 1: Import Faithfulness**
    - Verify that for any valid ArchidektDeckFull payload, after `importDeck` completes, `deck_cards` rows exactly match the payload
    - Use fast-check arbitraries for deck card generation
    - **Validates: Requirements 1.1**

  - [ ]* 1.5 Write property test for failed import atomicity
    - **Property 3: Failed Import Atomicity**
    - Verify that if `importDeck` throws (network failure, malformed response), DB state is unchanged
    - Inject failures at various points and assert rollback
    - **Validates: Requirements 1.5**

- [x] 2. Remove AutoSync and update sync route
  - [x] 2.1 Delete `src/components/AutoSync.tsx` and remove all references from root layout
    - Delete the component file
    - Remove the import and usage from the root layout (likely `app/layout.tsx`)
    - Remove any related hooks or utilities that only served AutoSync
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Modify `GET /api/sync/route.ts` to call `syncNewDecksOnly` instead of `syncAllDecks`
    - Update the import to use `syncNewDecksOnly`
    - Ensure the route response reflects the new behavior (imported count vs synced count)
    - _Requirements: 1.4, 7.4_

  - [x] 2.3 Modify/audit `POST /api/sync/full/route.ts` to not auto-reconcile
    - Either require explicit `deckIds` in the request body (error if none provided)
    - Or repurpose as collection-only sync
    - Must not reconcile existing decks without explicit user intent
    - _Requirements: 6.2, 6.4_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Create explicit re-import route
  - [x] 4.1 Create `POST /api/decks/[id]/reimport/route.ts` with confirmation gate
    - Accept `{ confirmed: boolean }` in request body
    - Return 409 Conflict with `{ requiresConfirmation: true, warning: "..." }` if `confirmed !== true`
    - On confirmation: fetch deck from Archidekt, clear `deck_cards` for that deck, re-insert, update `last_synced_at`
    - On failure: return error, leave existing data unchanged (transaction rollback)
    - Validate that the deck ID exists and was previously imported
    - _Requirements: 1.1, 1.2, 6.2, 6.3_

  - [ ]* 4.2 Write unit tests for reimport route
    - Test 409 response when `confirmed` is false or missing
    - Test successful re-import with mocked Archidekt fetch
    - Test error handling when Archidekt API fails (no data loss)
    - Test validation for non-existent deck IDs
    - _Requirements: 1.5, 6.3_

- [x] 5. Create Manual Push route and UI
  - [x] 5.1 Create `POST /api/decks/[id]/push/route.ts` for Manual Push
    - Load deck from Oracle DB
    - If deck has `last_synced_at` (imported from Archidekt): call existing `/api/archidekt/write-tags` with current proxy tags
    - If deck is Oracle-native (`last_synced_at IS NULL AND raw_json IS NULL`): call existing `/api/archidekt/create-deck` with full card list
    - Return `{ success, action: 'created' | 'updated', error? }`
    - Push is read-only from Oracle's perspective — never modify `decks` or `deck_cards`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Write property test for failed push safety
    - **Property 5: Failed Push Safety**
    - Verify that if `POST /api/decks/[id]/push` fails (Playwright error, auth failure), `decks` and `deck_cards` are unchanged
    - Inject failures at the Playwright call layer and assert DB state equality
    - **Validates: Requirements 3.5**

  - [x] 5.3 Create `src/components/PushToArchidekt.tsx` client component
    - Button text: "Push to Archidekt" for imported decks, "Create on Archidekt" for Oracle-native decks
    - States: idle → loading → success/error
    - Use `useMutation` from TanStack Query
    - Invalidate `['decks', deckId]` on success
    - Display error message on failure with retry option
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.4 Wire PushToArchidekt into the deck detail page
    - Import and render the component on the deck detail page
    - Pass deck ID and deck source (imported vs Oracle-native) as props
    - Ensure it does not appear in any automated workflow or background process
    - _Requirements: 4.1, 4.4_

  - [ ]* 5.5 Write unit tests for PushToArchidekt component
    - Test correct button text for imported vs native decks
    - Test loading/success/error state transitions
    - Test that mutation calls the correct endpoint
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Oracle-native deck creation isolation and collection protection
  - [x] 7.1 Audit and ensure Oracle-native deck creation (brew/save) doesn't touch Archidekt
    - Verify the brew/save route inserts into `decks` and `deck_cards` only
    - Confirm no imports of `fetchDeck`, `fetchUserDecks`, `updateProxyTags`, or `createDeck` from Archidekt modules
    - Confirm `last_synced_at` and `raw_json` are null for Oracle-native decks
    - Add guard comments if needed to prevent future accidental coupling
    - _Requirements: 5.1, 5.2, 5.4_

  - [ ]* 7.2 Write property test for deck creation isolation
    - **Property 4: Deck Creation Isolation**
    - Verify that deck creation via brew/save never invokes Archidekt client functions
    - Mock Archidekt modules and assert zero calls during deck creation
    - **Validates: Requirements 5.1, 5.4**

  - [ ]* 7.3 Write property test for collection-deck isolation
    - **Property 6: Collection-Deck Isolation**
    - Verify that after `syncCollection` or CSV import completes, `decks` and `deck_cards` tables are unchanged
    - Seed arbitrary deck data, run collection sync with arbitrary CSV content, assert deck tables identical
    - **Validates: Requirements 7.3, 7.4**

- [ ] 8. Code audit and existing test updates
  - [x] 8.1 Audit all code paths — verify no remaining auto-overwrite of `deck_cards`
    - Check `GET /api/sync` only imports new decks
    - Check `POST /api/sync/full` requires explicit deckIds or is collection-only
    - Confirm AutoSync.tsx is deleted and no references remain
    - Check for any `useEffect` or background timer that calls sync endpoints
    - Confirm allocation routes don't trigger Archidekt fetch as side effect
    - Confirm brew commit/save doesn't auto-push to Archidekt
    - Document audit findings as code comments where protective assertions are added
    - _Requirements: 6.1, 6.2, 6.4_

  - [x] 8.2 Update existing tests to match new sync behavior
    - Update any tests that call `syncAllDecks` to use `syncNewDecksOnly`
    - Update any tests that reference `syncDeck` to use `importDeck`
    - Remove tests for AutoSync component
    - Ensure existing sync-related test suites pass with the new function signatures
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use fast-check with in-memory SQLite (`:memory:`) for fast iterations
- Unit tests use Vitest (project's existing test runner)
- The design requires no schema changes — all modifications are to code paths only
- Oracle-native deck detection: `last_synced_at IS NULL AND raw_json IS NULL`
- Push operations are always read-only from Oracle's perspective

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1", "7.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.2", "7.3"] },
    { "id": 5, "tasks": ["5.4", "5.5"] },
    { "id": 6, "tasks": ["8.1", "8.2"] }
  ]
}
```
