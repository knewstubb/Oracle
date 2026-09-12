# Implementation Plan: Draft Deck Management

## Overview

This plan implements draft deck lifecycle management in a layered approach: database migration first, then the API endpoint, followed by the two UI components (tile and banner), integration wiring, and finally tests. Each step builds on the previous — no orphaned code.

## Tasks

- [x] 1. Database migration — add `status` column and cascade FK
  - [x] 1.1 Create migration `017-deck-status.sql`
    - Add `status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft'))` to `decks` table
    - Rebuild `brew_sessions` table to change FK from `ON DELETE SET NULL` to `ON DELETE CASCADE`
    - Recreate indexes on `brew_sessions` (`idx_brew_sessions_status`, `idx_brew_sessions_updated`)
    - _Requirements: 1.1, 1.5_

  - [x] 1.2 Update TypeScript types for the new `status` field
    - Add `status: 'active' | 'draft'` to the `DeckRow` interface and any related types
    - Update the `GET /api/decks` response type to include `status` on deck objects
    - _Requirements: 1.1, 1.2_

- [x] 2. API endpoint — `DELETE /api/decks/:id`
  - [x] 2.1 Implement the delete route handler
    - Create `app/api/decks/[id]/route.ts` with a DELETE handler
    - Return 404 if deck not found, 403 if deck is active (with guard message), 200 on successful draft deletion
    - Use `DELETE FROM decks WHERE id = ? AND status = 'draft'` to enforce draft-only deletion at the data layer
    - _Requirements: 5.2, 5.3, 7.1, 7.3, 7.4_

  - [ ]* 2.2 Write property test: Delete guard (Property 3)
    - **Property 3: Delete guard — only draft decks are deletable**
    - Generate a deck with random status ∈ {'active', 'draft'}. Call the delete handler logic. Assert success iff status = 'draft'; assert 403 iff status = 'active'.
    - Use `fast-check` with `{ numRuns: 100 }`
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 3. Checkpoint — migration and API
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Draft tile component — `DraftDeckTile`
  - [x] 4.1 Create the `DraftDeckTile` component
    - Implement `DraftDeckTileProps` interface (id, name, commanderName, commanderScryfallId, colourIdentity, cardCount, brewSessionId)
    - Render with dashed border `border: 0.5px dashed rgba(55,138,221,0.3)`, blue "Draft" badge in place of card count, no health pips
    - Implement three states: `idle`, `hover`, `confirming`
    - Hover state reveals "Continue brewing" and "Delete draft" buttons
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.4_

  - [x] 4.2 Implement `InlineDeleteConfirmation` shared component
    - Create the shared confirmation UI component (`InlineDeleteConfirmation`)
    - Render within parent bounds: `Delete "[Deck Name]"?` text, `This will permanently remove the draft.` subtext, Cancel and Delete buttons
    - Style Delete button with destructive colouring: bg `rgba(226,75,74,0.15)`, border `rgba(226,75,74,0.3)`, text `#E24B4A`
    - Accept props: `deckName`, `onConfirm`, `onCancel`, `isDeleting`
    - _Requirements: 4.1, 4.2, 4.3, 4.6_

  - [x] 4.3 Wire tile confirmation and delete flow
    - On "Delete draft" click, transition tile to confirmation state using `InlineDeleteConfirmation`
    - On Cancel, restore normal hover state
    - On Confirm, call `DELETE /api/decks/:id`, then remove tile from dashboard grid (via TanStack Query invalidation)
    - _Requirements: 3.3, 4.4, 4.5, 7.5_

  - [ ]* 4.4 Write unit tests for `DraftDeckTile`
    - Test: renders dashed border and Draft badge for draft decks
    - Test: hover reveals "Continue brewing" and "Delete draft"
    - Test: confirmation state shows deck name, Cancel restores state
    - _Requirements: 2.1, 2.2, 3.1, 4.4_

- [x] 5. Draft banner component — `DraftBanner`
  - [x] 5.1 Create the `DraftBanner` component
    - Implement `DraftBannerProps` interface (deckId, deckName, cardCount, brewSessionId, onDeleted)
    - Render: ⚠ icon, text "Draft deck — [N] cards · Not synced to Archidekt", "Continue brewing →" button, "Delete draft" button
    - Style with background `rgba(55,138,221,0.06)` and border `rgba(55,138,221,0.2)`
    - Position below the health strip on the deck detail page
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 5.2 Wire banner confirmation and delete flow
    - On "Delete draft" click, transition banner to full-width inline confirmation state (reuse `InlineDeleteConfirmation`)
    - On Confirm, call `DELETE /api/decks/:id`, then navigate to dashboard via `onDeleted` callback
    - On "Continue brewing →", navigate to OracleChat in brew mode for the associated deck
    - _Requirements: 6.4, 6.5, 6.6_

  - [ ]* 5.3 Write unit tests for `DraftBanner`
    - Test: renders all elements (icon, text, card count, buttons)
    - Test: confirmation transition and cancel restore
    - Test: calls onDeleted after successful delete
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

- [x] 6. Checkpoint — UI components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integration wiring — dashboard and detail page
  - [x] 7.1 Update dashboard to use `DraftDeckTile` for draft decks
    - In the dashboard page, conditionally render `DraftDeckTile` when `deck.status === 'draft'` instead of the standard `DeckTile`
    - Ensure active decks continue to render with `DeckTile` (solid border, card count, health pips)
    - Verify no delete action appears on active deck tiles
    - _Requirements: 2.4, 3.4, 5.1_

  - [x] 7.2 Add `DraftBanner` to the deck detail page
    - Conditionally render `DraftBanner` between `HealthStrip` and tabs when `deck.status === 'draft'`
    - Pass `onDeleted` callback that navigates to the dashboard (`router.push('/')`)
    - Wire "Continue brewing" to navigate to `/chat` with brew session context
    - _Requirements: 6.1, 6.4, 6.6_

  - [x] 7.3 Update the `GET /api/decks` response to include `status`
    - Ensure the existing deck fetch query selects the new `status` column
    - Return `status` in each deck object so the dashboard can distinguish active/draft
    - _Requirements: 1.2, 2.4_

- [ ] 8. Property-based tests for data integrity
  - [ ]* 8.1 Write property test: Status constraint validity (Property 1)
    - **Property 1: Status constraint validity**
    - Generate random strings (including 'active', 'draft', edge cases: '', null, 'ACTIVE', 'Draft'). Insert into an in-memory SQLite DB. Assert success iff value ∈ {'active', 'draft'}.
    - Use `fast-check` with `{ numRuns: 100 }`
    - **Validates: Requirements 1.1**

  - [ ]* 8.2 Write property test: Cascade cleanup on delete (Property 2)
    - **Property 2: Cascade cleanup on delete**
    - Generate a random number of brew_sessions (1–10) linked to a draft deck. Delete the deck. Assert `SELECT count(*) FROM brew_sessions WHERE deck_id = ?` returns 0.
    - Use `fast-check` with `{ numRuns: 100 }`
    - **Validates: Requirements 1.5, 7.2**

- [x] 9. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `InlineDeleteConfirmation` component is shared between tile and banner — built once in task 4.2, reused in task 5.2
- No external sync (Archidekt/Notion) is triggered on draft deletion — enforce this in the API handler

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1", "4.2"] },
    { "id": 3, "tasks": ["4.3", "4.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["8.1", "8.2"] }
  ]
}
```
