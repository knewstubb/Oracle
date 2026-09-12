# Implementation Plan: Remove Notion Dependency

## Overview

Replace all Notion integration in The Oracle with native SQLite storage for deck documentation and notes. The implementation follows a practical order: create tables → add data module → redirect writes → UI → backfill → delete Notion code. This is primarily a plumbing migration — no new algorithms, just redirecting write targets and deleting dead code.

## Tasks

- [x] 1. Create database migration files
  - [x] 1.1 Create migration 024-deck-documentation.sql
    - Create `deck_documentation` table with IF NOT EXISTS (deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE, strategy_playstyle TEXT, synergy_lines TEXT, strengths_weaknesses TEXT, matchup_notes TEXT, mulligan_guide TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)
    - Create `deck_notes` table with IF NOT EXISTS (id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)
    - Create index `idx_deck_notes_deck_id` on deck_notes(deck_id) with IF NOT EXISTS
    - File: `db/migrations/024-deck-documentation.sql`
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.7, 10.1, 10.2, 10.3_

  - [x] 1.2 Create migration 025-drop-notion-deck-map.sql
    - DROP TABLE IF EXISTS notion_deck_map
    - File: `db/migrations/025-drop-notion-deck-map.sql`
    - _Requirements: 7.1, 10.4_

- [x] 2. Implement data access module
  - [x] 2.1 Create `src/lib/deck-documentation-store.ts`
    - Export `getDocumentation(deckId: number): DeckDocumentation | null`
    - Export `upsertDocumentation(deckId: number, fields: Partial<DeckDocumentationFields>): void` — uses INSERT OR REPLACE, sets updated_at to datetime('now'), validates synergy_lines is valid JSON array if non-null
    - Export `getNotes(deckId: number, limit?: number): DeckNote[]` — returns notes ordered by created_at DESC
    - Export `appendNote(deckId: number, content: string): number` — validates content is non-blank (at least one non-whitespace char), inserts row, returns inserted id
    - Define and export `DeckDocumentation`, `DeckDocumentationFields`, and `DeckNote` interfaces
    - Follow existing patterns from `allocation-store.ts` or `health-store.ts` for db access style
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.2 Write property tests for deck-documentation-store
    - **Property 1: synergy_lines JSON validation** — generate random strings, verify valid JSON arrays are accepted and invalid strings are rejected
    - **Property 2: Notes append-only invariant** — generate random sequences of valid notes, verify each appendNote inserts a new row without modifying existing rows
    - **Property 3: Whitespace-only content rejection** — generate random whitespace strings, verify appendNote rejects them
    - **Property 4: Notes retrieval ordering** — insert random numbers of notes, verify getNotes returns them in descending created_at order
    - **Validates: Requirements 1.4, 2.2, 2.3, 2.6**

- [x] 3. Implement new API routes
  - [x] 3.1 Create `GET /api/decks/[id]/documentation` route
    - File: `src/app/api/decks/[id]/documentation/route.ts`
    - Call `getDocumentation(deckId)`, return `{ documentation: result }` (null if none exists)
    - Validate deck ID is a valid number
    - _Requirements: 1.5, 5.1_

  - [x] 3.2 Create `PUT /api/decks/[id]/documentation` route
    - File: `src/app/api/decks/[id]/documentation/route.ts` (same file, PUT handler)
    - Accept partial documentation fields in request body
    - Validate synergy_lines is valid JSON array if provided and non-null
    - Call `upsertDocumentation(deckId, fields)`
    - Return updated documentation or success confirmation
    - _Requirements: 1.3, 1.4, 5.3, 5.4_

  - [x] 3.3 Create `GET /api/decks/[id]/notes` route
    - File: `src/app/api/decks/[id]/notes/route.ts`
    - Accept optional `?limit=N` query param
    - Call `getNotes(deckId, limit)`, return `{ notes: result }`
    - _Requirements: 2.6, 5.2_

  - [x] 3.4 Create `POST /api/decks/[id]/notes` route
    - File: `src/app/api/decks/[id]/notes/route.ts` (same file, POST handler)
    - Validate content is non-blank
    - Call `appendNote(deckId, content)`
    - Return inserted note row with HTTP 201
    - Handle FK violation → 404, blank content → 400
    - _Requirements: 2.2, 2.3, 2.4_

- [x] 4. Redirect AI generation write targets
  - [x] 4.1 Update debrief action route to use appendNote
    - File: `src/app/api/ai/debrief/action/route.ts`
    - Replace `appendNotionNotes(deckId, notionEntry)` with `appendNote(deckId, notionEntry)` from deck-documentation-store
    - Remove the import of `appendNotionNotes` from notion-sync
    - Wrap appendNote call in try/catch — log failure to console, continue without blocking response
    - Preserve existing note content format (formatDebriefNotionEntry output unchanged)
    - _Requirements: 4.1, 4.4, 4.5, 4.6_

  - [x] 4.2 Update upgrade apply route to use appendNote
    - File: `src/app/api/decks/[id]/upgrade/apply/route.ts`
    - Replace `appendNotionNotes(deckId, formattedEntry)` with `appendNote(deckId, formattedEntry)` from deck-documentation-store
    - Remove the import of `appendNotionNotes`
    - Wrap appendNote call in try/catch — log failure, continue
    - Preserve existing formatted entry content (formatChangeLogEntry output unchanged)
    - _Requirements: 4.2, 4.4, 4.5, 4.6_

  - [x] 4.3 Update upgrade skip route to use appendNote
    - File: `src/app/api/decks/[id]/upgrade/skip/route.ts`
    - Replace `appendNotionNotes(deckId, formattedEntry)` with `appendNote(deckId, formattedEntry)` from deck-documentation-store
    - Remove the import of `appendNotionNotes`
    - Wrap appendNote call in try/catch — log failure, continue
    - _Requirements: 4.3, 4.4, 4.5, 4.6_

  - [x] 4.4 Remove Notion fields from sync-engine.ts
    - Remove `notionUpdates` from `SyncCycleResult` interface
    - Remove `notionUpdated` from `DeckSyncResult` interface
    - Remove any code that sets/increments these fields
    - Remove any Notion sync calls from the sync cycle
    - _Requirements: 6.1, 7.6_

- [x] 5. Checkpoint - Verify write target redirection
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm: debrief/action, upgrade/apply, upgrade/skip routes no longer import from notion-sync
  - Confirm: sync-engine no longer references Notion

- [x] 6. Strategy Tab UI updates
  - [x] 6.1 Add documentation and notes sections to Strategy tab
    - Extend the existing Strategy tab component to fetch and display documentation from `GET /api/decks/[id]/documentation`
    - Render each non-null documentation section (strategy_playstyle, synergy_lines, strengths_weaknesses, matchup_notes, mulligan_guide) as a labeled content block
    - Fetch and display notes from `GET /api/decks/[id]/notes` in reverse chronological order with timestamps
    - Display empty state when no documentation exists
    - Display error state distinguishing network failure from empty documentation
    - Use TanStack Query with `staleTime: 5 * 60 * 1000` for documentation/notes queries
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

  - [x] 6.2 Add inline editing for documentation sections
    - Add edit capability for each documentation section (editable text areas)
    - On save, PUT to `/api/decks/[id]/documentation` with the modified fields
    - Use TanStack Query `useMutation` with `onSuccess` invalidating `['decks', deckId, 'documentation']`
    - Show success confirmation on save, preserve unsaved edits on failure
    - _Requirements: 5.3, 5.4_

- [x] 7. Backfill script
  - [x] 7.1 Create `scripts/backfill-notion-to-local.ts`
    - Read all rows from `notion_deck_map` table
    - For each mapping, call existing `NotionClient.getPageContent(pageId)` to fetch page content
    - Parse markdown sections by heading: `## Strategy & Playstyle` → strategy_playstyle, `## Key Synergy Lines` → synergy_lines, `## Strengths & Weaknesses` → strengths_weaknesses, `## Matchup Notes` → matchup_notes, `## Mulligan Guide` → mulligan_guide
    - Write parsed sections to `deck_documentation` using INSERT OR REPLACE (idempotent)
    - Extract trailing note blocks (content after the last known section heading) and insert each as separate rows in `deck_notes`
    - On per-deck fetch failure: log error with deck ID and name, continue processing remaining decks
    - Print summary at completion: total attempted, succeeded, skipped, failed with error details
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 7.2 Write property test for backfill section parsing
    - **Property 5: Backfill section parsing** — generate random markdown with/without known headings, verify correct extraction to corresponding columns and NULL for missing headings
    - **Property 6: Backfill idempotency** — run parser multiple times on same input, verify deck_documentation row state is identical after N runs
    - **Validates: Requirements 3.2, 3.3, 3.7**

- [x] 8. Checkpoint - Verify before Notion deletion
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm: backfill script runs successfully (run it manually)
  - Confirm: all AI write targets point to local DB
  - Confirm: Strategy tab displays documentation and notes

- [x] 9. Delete all Notion integration code
  - [x] 9.1 Delete Notion modules and test files
    - Delete `src/lib/notion-sync.ts`
    - Delete `src/lib/notion-sync.test.ts`
    - Delete `src/lib/deck-list-integration.test.ts`
    - Delete `src/lib/write-deck-list-section.test.ts`
    - _Requirements: 7.2, 7.6_

  - [x] 9.2 Delete Notion API routes
    - Delete `src/app/api/notion/sync/route.ts`
    - Delete `src/app/api/notion/sync/[deckId]/route.ts`
    - Delete `src/app/api/notion/notes/route.ts`
    - Delete the `src/app/api/notion/` directory entirely
    - _Requirements: 7.3_

  - [x] 9.3 Remove Notion environment variables and package dependencies
    - Remove all `NOTION_*` references from `.env.local.example`
    - Remove `@notionhq/client` from `package.json` if present
    - Run `npm install` to update lockfile
    - _Requirements: 7.2, 7.4_

  - [x] 9.4 Remove remaining Notion references from codebase
    - Grep for any remaining imports or references to: `appendNotionNotes`, `syncDecksToNotion`, `setNotionClient`, `updateDeckNotionPage`, `updateDeckNotionAllocation`, `writeDeckListSection`, `notion-sync`, `NotionClient`, `NOTION_`
    - Remove Notion error states from conversational commands documentation if present
    - Remove notion_deck_map test cases from `src/test/migrations.test.ts` or `src/lib/migrate.test.ts`
    - Fix any broken imports or references discovered
    - _Requirements: 7.4, 7.5, 7.6, 9.4_

- [x] 10. Final checkpoint - Verify complete removal and app integrity
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: application starts without NOTION_* env vars and serves all routes without errors
  - Verify: `grep -r "notion" src/` returns no meaningful hits (only this spec or comments)
  - Verify: `grep -r "NOTION_" .` returns no hits in source code
  - Verify: deck detail pages, sync operations, and AI generation flows work correctly
  - Verify: Decision Log operations continue functioning against brew_sessions table
  - _Requirements: 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The backfill script (task 7.1) MUST run BEFORE the Notion code is deleted (task 9) — it depends on the existing NotionClient
- Migration 025 (drop notion_deck_map) should only be applied AFTER confirming the backfill succeeded
- The `formatChangeLogEntry` and `formatDebriefNotionEntry` functions are preserved — only the write target changes
- Computed content (category breakdown, legality summary, upgrade strategy, precon upgrade) already renders from local data — no new storage needed for Requirement 6

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4", "7.1"] },
    { "id": 4, "tasks": ["6.1", "6.2", "7.2"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4"] }
  ]
}
```
