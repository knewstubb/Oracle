# Implementation Plan: Proxy Ownership Layer

## Overview

This plan implements the proxy ownership layer by extending the `deck_cards` schema with ownership columns, building an orchestration resolver that bridges `computeAllocations` output into `deck_cards`, integrating it into the sync pipeline, exposing it via API routes, and rendering ownership state across the UI with badges, conflict alerts, and an allocation tab.

## Tasks

- [x] 1. Database migration and schema extension
  - [x] 1.1 Create migration file `db/migrations/012-ownership-columns.sql`
    - Add `ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original', 'proxy', 'not_owned'))` to `deck_cards`
    - Add `proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL` to `deck_cards`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Register the migration in `src/lib/migrate.ts`
    - Ensure the migration runner picks up `012-ownership-columns.sql`
    - Verify the migration applies cleanly on existing data (existing rows get NULL until first resolution)
    - _Requirements: 1.6_

- [x] 2. Ownership resolver orchestration
  - [x] 2.1 Create `src/lib/ownership-resolver.ts`
    - Implement `resolveOwnership(db)` function that orchestrates `buildAllocationInput` → `computeAllocations` → `applyAllocationOutput` → `denormaliseOwnership`
    - Implement `denormaliseOwnership(db, output)` that writes `ownership_status` and `proxy_of_deck_id` to `deck_cards` based on allocation roles
    - Return `DenormalisationResult` and `AllocationDiff` for downstream consumers
    - Rules: `role='original'` → status `'original'`, `proxy_of_deck_id=NULL`; `role='proxy'` → status `'proxy'`, `proxy_of_deck_id=<holder deck>`; no allocation → status `'not_owned'`, `proxy_of_deck_id=NULL`
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property test for ownership status consistency (Property 1)
    - **Property 1: Ownership status and proxy_of_deck_id consistency**
    - Generate random allocation outputs; after `denormaliseOwnership`, verify: original → proxy_of_deck_id is NULL; proxy → proxy_of_deck_id is non-null and references a deck with original for that card; not_owned → proxy_of_deck_id is NULL
    - **Validates: Requirements 1.3, 1.4, 1.5**

  - [ ]* 2.3 Write property test for resolver denormalisation faithfulness (Property 2)
    - **Property 2: Resolver denormalisation faithfulness**
    - Generate random allocation inputs; run `computeAllocations` then `denormaliseOwnership`; verify every deck_cards row has non-null status matching the allocation output
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

  - [ ]* 2.4 Write property test for override cascade completeness (Property 3)
    - **Property 3: Override cascade completeness**
    - Generate random cards in N decks with an override; after `resolveOwnership`, verify all N decks have updated ownership_status consistent with the new allocation
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 3. Sync engine integration
  - [x] 3.1 Integrate `resolveOwnership` into `src/lib/archidekt-sync.ts`
    - Call `resolveOwnership(db)` immediately after delta application
    - Gate recommendation generation and Notion push behind successful resolution
    - On resolver failure: catch error, log `{ deckId, error }`, halt downstream processing for affected decks
    - _Requirements: 2.1, 2.6, 3.1, 3.2, 3.3_

  - [x] 3.2 Implement Archidekt proxy tag interpretation on import
    - When reading deck state from Archidekt, interpret card lines with `#!Proxy` or `[Proxy]` tags as `pin_proxy` overrides
    - Add interpreted overrides to the allocation input's overrides map before running `computeAllocations`
    - _Requirements: 9.5_

  - [ ]* 3.3 Write property test for proxy tag interpretation (Property 9)
    - **Property 9: Proxy tag interpretation on import**
    - Generate random Archidekt import text with proxy tag markers; verify the sync engine produces `pin_proxy` override entries for each tagged card-deck pair
    - **Validates: Requirements 9.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Allocation API routes
  - [x] 5.1 Extend `src/app/api/allocation/route.ts` with GET handler
    - Return all cards appearing in 2+ decks with per-deck ownership status
    - Support optional `deckId` query param to filter to cards in that deck AND at least one other
    - Response shape: `{ cards: AllocationCardGroup[] }` with `cardName`, `decks[]` containing `deckId`, `deckName`, `ownershipStatus`, `proxyOfDeckId`
    - _Requirements: 7.2, 7.3, 7.4, 7.5_

  - [ ]* 5.2 Write property test for allocation tab shared cards (Property 5)
    - **Property 5: Allocation tab shows exactly shared cards**
    - Generate random `deck_cards` data; verify the API returns exactly those card names appearing in 2+ distinct decks
    - **Validates: Requirements 7.2**

  - [ ]* 5.3 Write property test for allocation tab deck filter (Property 6)
    - **Property 6: Allocation tab deck filter correctness**
    - Generate random deck data with a selected deck filter; verify the filtered response contains only cards in the selected deck AND at least one other deck
    - **Validates: Requirements 7.5**

  - [x] 5.4 Create `src/app/api/allocation/reassign/route.ts` for manual override
    - POST handler accepting `{ cardName, targetDeckId }`
    - Call `setPriorityOverride(db, cardName, targetDeckId, 'pin_original')`
    - Call `resolveOwnership(db)` to cascade changes
    - Return updated allocation state for that card across all decks
    - On failure: return 500
    - _Requirements: 4.1, 4.2, 4.3, 8.1, 8.2_

- [x] 6. Archidekt tag write-back integration
  - [x] 6.1 Integrate tag write-back into the resolver output flow
    - After `resolveOwnership` produces a diff, queue Archidekt tag write-backs for changed rows
    - Write `"Proxy"` tag for cards becoming `'proxy'`; remove `"Proxy"` tag for cards becoming `'original'` that previously had the tag
    - No tag operation for `'not_owned'` status
    - On write failure: mark `deck_allocations.written_to_archidekt = 0` for retry next cycle
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [ ]* 6.2 Write property test for tag write operation correctness (Property 8)
    - **Property 8: Tag write operation correctness**
    - Generate random ownership changes from the resolver; verify: write Proxy tag for cards becoming proxy, remove Proxy tag for cards becoming original with prior tag, no operation for not_owned
    - **Validates: Requirements 9.2, 9.3, 9.4**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. OwnershipBadge component
  - [x] 8.1 Create `src/components/OwnershipBadge.tsx`
    - Replace/extend existing `ProxyBadge` with a tri-state badge
    - Render filled circle (●) in teal for `'original'`, half-filled (◐) in amber for `'proxy'`, empty circle (○) in gray for `'not_owned'`
    - Include visible text label alongside glyph (WCAG 1.4.1)
    - Use `aria-label` for assistive technology (WCAG 4.1.2)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 8.2 Write unit tests for OwnershipBadge
    - Test rendering for each status value (original, proxy, not_owned)
    - Verify correct glyph, colour classes, label text, and aria-label
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 9. ConflictAlert component and conflict detection
  - [x] 9.1 Implement `detectConflict` utility in `src/lib/ownership-resolver.ts`
    - Given a cardName and targetDeckId, check collection supply vs. current demand
    - Return `{ hasConflict: boolean, affectedDeckName?: string }`
    - Conflict exists when card is owned, already original elsewhere, and demand would exceed supply
    - _Requirements: 6.1, 6.3_

  - [x] 9.2 Create `src/components/ConflictAlert.tsx`
    - Render inline warning with amber styling on recommendation cards
    - Display affected deck name and card name in the alert message
    - Use `role="alert"` for accessibility
    - _Requirements: 6.2, 6.4, 6.5_

  - [ ]* 9.3 Write property test for conflict detection correctness (Property 4)
    - **Property 4: Conflict detection correctness**
    - Generate random collection quantities, deck allocations, and target cards; verify conflict alert fires iff supply would be exceeded by adding the card
    - **Validates: Requirements 6.1, 6.3**

  - [ ]* 9.4 Write unit tests for ConflictAlert rendering
    - Test that alert renders with correct deck name and card name
    - Test that alert has proper role="alert" attribute
    - _Requirements: 6.2, 6.5_

- [x] 10. AllocationTab and collection page integration
  - [x] 10.1 Create `src/components/AllocationTab.tsx`
    - Client component using TanStack Query with key `['allocation', deckFilter]` and `staleTime: 5 * 60 * 1000`
    - Fetch from `/api/allocation` (with optional `?deckId=` param)
    - Render table with card name rows, deck columns, and OwnershipBadge per entry
    - Include deck filter dropdown to narrow view
    - Include reassign action on each card-deck pair calling POST `/api/allocation/reassign`
    - Use optimistic updates on reassign; revert on failure with error toast
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 10.2 Add tab navigation to `src/app/collection/page.tsx`
    - Add Tabs from shadcn/ui (TabsList, TabsTrigger, TabsContent)
    - "Collection" tab wraps existing card grid
    - "Allocation" tab renders the new AllocationTab component
    - _Requirements: 7.1_

  - [ ]* 10.3 Write property test for allocation API response completeness (Property 7)
    - **Property 7: Allocation API response completeness**
    - Generate random allocation data; verify every card returned includes the card name, all decks containing it, and ownership_status per deck entry
    - **Validates: Requirements 7.3**

- [x] 11. Wire OwnershipBadge into existing card surfaces
  - [x] 11.1 Integrate OwnershipBadge into `DeckListTable`, card grid, and upgrade panel
    - Read `ownership_status` from `deck_cards` data already passed to these components
    - Render OwnershipBadge inline on each card row/tile
    - Wire ConflictAlert into RecommendationsPanel for cards with detected conflicts
    - _Requirements: 5.1, 6.1, 6.2, 6.4_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `ProxyBadge` component is superseded by `OwnershipBadge` — update or remove the old component as part of task 8.1
- The existing `/api/allocation` route already exists — task 5.1 extends it with GET handler logic
- Migration numbering follows the existing pattern (012 is the next after 011-upgrade-extensions.sql)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.1", "3.2"] },
    { "id": 4, "tasks": ["3.3", "5.1", "5.4", "6.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1", "9.2"] },
    { "id": 7, "tasks": ["9.3", "9.4", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3"] },
    { "id": 9, "tasks": ["11.1"] }
  ]
}
```
