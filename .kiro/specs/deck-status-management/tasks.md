# Implementation Plan: Deck Status Management

## Overview

Implement a three-state lifecycle (`active`, `draft`, `inactive`) for decks, ensuring only active decks participate in card allocation. This involves a database migration, a status transition API with allocation side effects, modifications to the allocation resolver and shared cards endpoint, UI components for status display and control, and brew session integration.

## Tasks

- [x] 1. Database migration and type definitions
  - [x] 1.1 Create migration `005_deck_status_inactive.sql`
    - Migrate existing `concept` rows to `draft`
    - Drop the existing `decks_status_check` constraint
    - Add new constraint: `CHECK (status IN ('active', 'draft', 'inactive'))`
    - Preserve the default value of `'active'` for the status column
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Add shared TypeScript types for deck status
    - Create `src/lib/deck-status.ts` with the `DeckStatus` type (`'active' | 'draft' | 'inactive'`), valid status list, and validation helper
    - Export `StatusUpdateRequest` and `StatusUpdateResponse` interfaces as defined in the design
    - _Requirements: 1.1, 2.1_

- [x] 2. Status transition API endpoint
  - [x] 2.1 Implement `PATCH /api/decks/[id]/status` route handler
    - Create `src/app/api/decks/[id]/status/route.ts`
    - Use `requireAuth()` for authentication (401 on failure)
    - Validate request body status value (400 on invalid)
    - Verify deck exists (404 if not found)
    - Update deck status column in the database
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Implement allocation side effects on status transition
    - When transitioning away from `active` (to `draft` or `inactive`): delete all `deck_allocations` rows for the deck, then trigger re-resolve (`buildAllocationInput` → `resolveAllocations` → `applyAllocationOutput`)
    - When transitioning to `active` (from `draft` or `inactive`): trigger re-resolve to incorporate new demand
    - Return `allocationRerun: true/false` in the response to signal success/failure of the re-resolve
    - If re-resolve fails, commit the status change but log the error and return `allocationRerun: false`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 2.3 Write property test for status validation (Property 1)
    - **Property 1: Status validation rejects invalid values**
    - For any string not in `['active', 'draft', 'inactive']`, the endpoint rejects with 400; for any valid value, it accepts
    - Use `fc.string()` for invalid inputs and `fc.constantFrom('active', 'draft', 'inactive')` for valid inputs
    - **Validates: Requirements 1.1, 2.2**

  - [ ]* 2.4 Write property test for valid transitions (Property 2)
    - **Property 2: All valid status transitions persist correctly**
    - For any pair of valid statuses (from, to), transitioning succeeds and the DB reflects the new value
    - Use `fc.record({ from: fc.constantFrom(...), to: fc.constantFrom(...) })` for all 9 pairs
    - **Validates: Requirements 2.1, 2.5**

  - [ ]* 2.5 Write property test for allocation release (Property 4)
    - **Property 4: Allocations are released when a deck leaves active status**
    - For any deck with status `active` that transitions to `draft` or `inactive`, all `deck_allocations` rows for that deck are deleted
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Allocation resolver filters by deck status
  - [x] 4.1 Modify `buildAllocationInput()` in `src/lib/allocation-store.ts`
    - Change the `deck_cards` query to join with `decks` via foreign key and filter by `status = 'active'`
    - Use Supabase's nested select: `.select('card_name, deck_id, decks!deck_cards_deck_id_fkey(status)')` with `.eq('decks.status', 'active')`
    - Filter out rows where the joined `decks` is null in the loop (non-active decks)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 4.2 Write property test for active-only demand (Property 3)
    - **Property 3: Only active decks contribute to allocation demand**
    - For any set of decks with mixed statuses and any card appearing in those decks, the demand map contains that card only if at least one active deck contains it
    - Use `fc.array(fc.record({ deckId, status, cards }))` with mixed statuses
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 5. Allocation tab respects deck status
  - [x] 5.1 Modify `getSharedCardsAllocation()` in `src/app/api/allocation/route.ts`
    - Update the paginated deck_cards query to join with `decks` and filter by `status = 'active'`
    - Only count cards shared across active decks in the shared cards result
    - _Requirements: 5.1, 5.2_

  - [x] 5.2 Implement deckId filter status check in allocation route
    - When `?deckId=X` is provided alongside `?view=shared`, check if deck X has status `active`
    - If deck X is not active, return an empty result set with `message: "Deck is not active"`
    - _Requirements: 5.3, 5.4_

  - [ ]* 5.3 Write property test for shared cards active-only (Property 5)
    - **Property 5: Shared cards endpoint only counts active decks**
    - For any configuration of decks and cards, shared cards results only contain cards appearing in 2+ active decks
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 5.4 Write property test for deckId filter respects status (Property 6)
    - **Property 6: Shared cards deckId filter respects status**
    - For any deck with status `draft` or `inactive`, querying with that deck's ID returns empty results
    - **Validates: Requirements 5.3**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. UI components for status display
  - [x] 7.1 Create `StatusBadge` component
    - Create `src/components/StatusBadge.tsx` as a client component
    - Accept a `status` prop of type `DeckStatus`
    - Render a chip with color coding: active (green), draft (blue), inactive (grey) per design
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Create `StatusControl` component for deck detail page
    - Create `src/components/StatusControl.tsx` as a client component
    - Render a segmented button group for the three statuses
    - On status change, call `PATCH /api/decks/[id]/status` via `useMutation`
    - Show confirmation dialog when transitioning to `inactive` (warns about allocation release)
    - On error, revert the control to previous status and display error
    - Invalidate `['decks']`, `['decks', deckId]`, `['shared-cards']`, `['allocation', deckId]`, `['proxy-report']` query keys on success
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.3 Add status filter to deck list page
    - Add chip/toggle buttons for filtering by status values on the deck list page
    - Support multi-select (e.g., show active + draft)
    - Persist selected filter in URL query parameters (`?status=active,draft`)
    - When no filter is applied, display all decks
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 8. Integrate status components into pages
  - [x] 8.1 Add `StatusBadge` to deck list page
    - Import and render `StatusBadge` next to each deck name in the deck list
    - Pass the deck's current status to the badge
    - _Requirements: 6.1_

  - [x] 8.2 Add `StatusControl` to deck detail page
    - Import and render `StatusControl` on the deck detail page
    - Pass the current deck status and deck ID as props
    - _Requirements: 7.1_

  - [x] 8.3 Wire deck list status filter to API query
    - Read status filter from URL search params
    - Pass status filter to the decks API query (or filter client-side from cached data)
    - Ensure the deck list responds to filter changes
    - _Requirements: 6.3, 6.4, 6.5_

- [x] 9. Brew session integration
  - [x] 9.1 Update brew session deck creation to set `status: 'draft'`
    - Locate the brew session deck creation code (API route for brew sessions)
    - Ensure new decks created by brew sessions explicitly set `status: 'draft'` on insert
    - _Requirements: 8.1_

  - [ ]* 9.2 Write unit test for brew session draft status
    - Verify that decks created via brew session have `status = 'draft'`
    - Verify that promoting a brewed deck to active triggers allocation
    - _Requirements: 8.1, 8.2_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- The allocation resolver modification (task 4.1) is the core behavioral change — it ensures only active decks contribute demand
- Side effects on the status transition API (task 2.2) ensure allocations are released/recalculated atomically with status changes
- TanStack Query cache invalidation patterns follow the project's existing conventions (staleTime: 5min for Archidekt-sourced data)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "4.1", "7.2"] },
    { "id": 3, "tasks": ["2.5", "4.2", "5.1", "7.3"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "8.1", "8.2"] },
    { "id": 5, "tasks": ["8.3", "9.1"] },
    { "id": 6, "tasks": ["9.2"] }
  ]
}
```
