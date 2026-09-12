# Implementation Plan: Collection Printing View

## Overview

This plan implements the flat printing-level collection view. The sequencing starts with pure utility functions (formatters, filters, sorters), then the API endpoint, then the client-side hook, and finally the UI components. Each step builds on the previous — nothing is left orphaned. The existing `CollectionListView` and rollup-based flow remain untouched; the new `PrintingListView` is added alongside.

## Tasks

- [x] 1. Implement printing-level utility functions
  - [x] 1.1 Create `src/lib/collection-printing-utils.ts` with pure helper functions
    - Implement `formatPrice(price: number | null): string` — returns "$X.XX" with comma thousands separator for ≥$1,000, or "—" for null
    - Implement `truncateName(name: string, maxLength?: number): string` — returns original if ≤40 chars, else first 40 + "…"
    - Implement `isOverallocated(quantity: number, usedByCount: number): boolean` — returns true iff usedByCount > quantity
    - Implement `getTooltipContent(decks: DeckReference[]): { visibleDecks: string[], remainingCount: number }` — sorts alphabetically, caps at 20, computes remaining
    - Implement `groupPhysicalCopiesToPrintingRows(copies: RawPhysicalCopy[]): PrintingRowResponse[]` — groups by (cardName, scryfallPrintingId, isFoil), sums quantities
    - Implement `lookupPrice(priceMap: Map<string, number>, scryfallPrintingId: string, isFoil: boolean): number | null` — returns matching price or null
    - Export `PrintingRowResponse`, `DeckReference`, `RawPhysicalCopy` types
    - _Requirements: 1.1, 1.2, 2.3, 2.6, 3.3, 4.1, 4.2, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 1.2 Write property test: Name Truncation (Property 2)
    - **Property 2: Name Truncation**
    - Generate arbitrary strings of length 0–200
    - Assert: if length ≤ 40 → result equals original; if length > 40 → result equals first 40 chars + "…"
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 2.3**

  - [ ]* 1.3 Write property test: Tooltip Content Capping (Property 4)
    - **Property 4: Tooltip Content Capping**
    - Generate arrays of DeckReference with length 0–100
    - Assert: visibleDecks.length ≤ 20, sorted alphabetically, remainingCount = max(0, total - 20)
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 3.3**

  - [ ]* 1.4 Write property test: Overallocation Detection (Property 5)
    - **Property 5: Overallocation Detection**
    - Generate pairs of non-negative integers (quantity, usedByCount)
    - Assert: isOverallocated returns true iff usedByCount > quantity
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.4**

  - [ ]* 1.5 Write property test: Price Formatting (Property 7)
    - **Property 7: Price Formatting**
    - Generate non-negative floats and null values
    - Assert: null → "—"; 0 → "$0.00"; values < 1000 → "$X.XX" (no comma); values ≥ 1000 → "$X,XXX.XX" (with comma)
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 5.3, 5.4**

  - [ ]* 1.6 Write property test: Row Grouping Correctness (Property 1)
    - **Property 1: Row Grouping Correctness**
    - Generate arrays of RawPhysicalCopy with varying (cardName, scryfallPrintingId, isFoil) combinations
    - Assert: output row count equals number of unique (cardName, scryfallPrintingId, isFoil) combos; each row's quantity equals sum of matching input quantities
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 1.7 Write property test: Price Lookup Correctness (Property 6)
    - **Property 6: Price Lookup Correctness**
    - Generate price maps and (scryfallPrintingId, isFoil) key pairs
    - Assert: returns matching price when key exists, null when key doesn't exist
    - Test file: `src/lib/__tests__/collection-printing-utils.property.test.ts`
    - **Validates: Requirements 5.1**

- [x] 2. Implement printing-level sort and filter functions
  - [x] 2.1 Add printing-specific sort and filter functions to `src/lib/collection-filters.ts`
    - Add `PrintingSortField` type: `'cardName' | 'quantity' | 'setCode' | 'price' | 'usedByCount'`
    - Add `PrintingCardRow` interface with fields: id, cardName, colorIdentity, quantity, usedByCount, price, setCode, isFoil
    - Implement `sortPrintingRows(rows: PrintingCardRow[], field: PrintingSortField, direction: SortDirection): PrintingCardRow[]` — null-price rows sort last regardless of direction
    - Reuse existing `filterBySearch`, `filterByColorIdentity`, `filterByStatus` (they accept the same shape constraints via `cardName`, `colorIdentity`, computed status)
    - Adapt `computeStatus` to work with `PrintingCardRow` by mapping `quantity` → `ownedQuantity` and `usedByCount` → `inUseCount`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 7.1, 7.2, 7.3_

  - [ ]* 2.2 Write property test: Sorting Correctness (Property 8)
    - **Property 8: Sorting Correctness**
    - Generate arrays of PrintingCardRow and a random sortable field + direction
    - Assert: every adjacent pair satisfies the ordering constraint; null-price rows appear last
    - Test file: `src/lib/__tests__/collection-printing-filters.property.test.ts`
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 2.3 Write property test: Search Filter Correctness (Property 9)
    - **Property 9: Search Filter Correctness**
    - Generate arrays of PrintingCardRow and a non-empty search query string
    - Assert: filtered result contains exactly those rows whose cardName includes the query (case-insensitive)
    - Test file: `src/lib/__tests__/collection-printing-filters.property.test.ts`
    - **Validates: Requirements 7.1**

  - [ ]* 2.4 Write property test: Color Identity Filter Correctness (Property 10)
    - **Property 10: Color Identity Filter Correctness**
    - Generate arrays of PrintingCardRow and a non-empty color selection with mode ("exact" or "includes")
    - Assert: in exact mode, result contains only rows whose colorIdentity set equals selected set; in includes mode, result contains only rows whose colorIdentity is a superset of selected
    - Test file: `src/lib/__tests__/collection-printing-filters.property.test.ts`
    - **Validates: Requirements 7.2**

  - [ ]* 2.5 Write property test: Combined Filter AND Logic (Property 11)
    - **Property 11: Combined Filter AND Logic**
    - Generate arrays of PrintingCardRow with random search + color + status filters applied
    - Assert: combined filter result equals intersection of each individual filter applied independently
    - Test file: `src/lib/__tests__/collection-printing-filters.property.test.ts`
    - **Validates: Requirements 7.3**

- [x] 3. Checkpoint — Pure functions complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement API endpoint
  - [x] 4.1 Create `src/app/api/collection/printings/route.ts` with GET handler
    - Call `requireAuth()` for authentication (returns 401 if unauthenticated)
    - Query `physical_copies` joined with `card_definitions` (filter `is_proxy = false`, `quantity > 0`)
    - Query `deck_cards` + `decks` to compute per-physical_copy deck usage (distinct deck_ids + deck names)
    - Query `card_kingdom_prices` for price lookup by scryfall_printing_id + is_foil
    - Query `collection` table for set_code and edition_name by scryfall_id
    - Use `groupPhysicalCopiesToPrintingRows` from task 1.1 to produce the flat row list
    - Return `CollectionPrintingsResponse` shape: `{ rows: PrintingRowResponse[], lastPriceRefresh, isPriceStale }`
    - Handle entries with no scryfall_printing_id: include row with null price, empty set info
    - Return 500 with error message on database failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1, 5.2_

  - [ ]* 4.2 Write unit tests for the printings API endpoint
    - Test: authenticated request returns correct `CollectionPrintingsResponse` shape
    - Test: unauthenticated request returns 401
    - Test: entries with no scryfall_printing_id return null price and empty set info
    - Test: deck usage is correctly computed as distinct deck count
    - Test file: `src/app/api/collection/printings/__tests__/route.test.ts`
    - _Requirements: 1.4, 2.6, 5.2_

- [x] 5. Implement TanStack Query hook
  - [x] 5.1 Create `src/hooks/useCollectionPrintings.ts`
    - Export `useCollectionPrintings()` hook using `useQuery`
    - Query key: `['collection', 'printings']`
    - Query function: `fetch('/api/collection/printings').then(r => r.json())`
    - Set `staleTime: 5 * 60 * 1000` (5 minutes — collection data only changes on sync)
    - Return typed `UseQueryResult<CollectionPrintingsResponse>`
    - _Requirements: 1.3, 4.3_

- [x] 6. Checkpoint — Data layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement UI components
  - [x] 7.1 Create `src/components/collection/UsedByCell.tsx`
    - Accept props: `usedByCount`, `quantity`, `decks: DeckReference[]`
    - Display usedByCount as integer
    - When overallocated (usedByCount > quantity): render text in amber colour + warning icon (non-colour indicator per WCAG)
    - When not overallocated: render in default text colour with no indicator
    - Use shadcn `HoverCard` with 300ms open delay for tooltip
    - Tooltip content: deck names sorted alphabetically (via `getTooltipContent`), max 20 with remaining count
    - If usedByCount is 0: display "0", no tooltip on hover
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.4_

  - [x] 7.2 Create `src/components/collection/PrintingListView.tsx`
    - Accept props: `rows: PrintingRowResponse[]`, `sortField`, `sortDirection`, `onSort`
    - Render flat table with columns: Quantity, Name, Printing, Finish, Used By, Price
    - Column headers are clickable — invoke `onSort(field)` which toggles asc/desc
    - Display sort direction indicator (arrow icon) on the active column header
    - Name column: truncated with ellipsis at 40 chars via `truncateName`
    - Printing column: set name as primary text, set code as secondary label
    - Finish column: "Normal" or "Foil"
    - Price column: formatted via `formatPrice`
    - Used By column: renders `UsedByCell` component
    - Empty state when rows array is empty: "No cards match your filters."
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.3, 5.4, 6.5, 6.6, 7.4_

  - [x] 7.3 Adapt `src/components/collection/CollectionToolbar.tsx` for printing view
    - Add printing-view sort field options: cardName, quantity, setCode, price, usedByCount
    - Keep existing search input and colour identity filter unchanged (they operate on the same shape)
    - Ensure sort field dropdown reflects the active view (printing vs rollup)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.5_

  - [ ]* 7.4 Write unit tests for PrintingListView and UsedByCell
    - Test: sort direction toggles on column header click
    - Test: default sort is name ascending on load
    - Test: overallocation renders amber text + warning icon
    - Test: normal allocation renders default text, no icon
    - Test: tooltip appears (hover card open state) when usedByCount > 0
    - Test: no tooltip interaction when usedByCount is 0
    - Test: price displays "$0.00" for zero, "—" for null
    - Test: entries with no scryfall_id show "—" for price and empty set
    - Test file: `src/components/collection/__tests__/PrintingListView.test.tsx`
    - _Requirements: 3.4, 4.1, 4.2, 5.3, 5.4, 6.5, 6.6_

- [x] 8. Wire components into collection page
  - [x] 8.1 Update `src/app/collection/page.tsx` to integrate PrintingListView
    - Import and call `useCollectionPrintings` hook
    - Apply client-side filtering (search, colour identity, status) using functions from task 2.1
    - Apply client-side sorting using `sortPrintingRows` from task 2.1
    - Manage sort state: field defaults to `'cardName'`, direction defaults to `'asc'`
    - Implement sort toggle: first click → ascending, second consecutive click → descending
    - Render `PrintingListView` with filtered+sorted rows
    - Show loading state while query is pending (existing loading pattern)
    - Show error state with retry on query error (existing `ErrorState` component)
    - Show empty collection state: "No cards in your collection yet." when rows are empty before filtering
    - Show `PriceStaleIndicator` banner when `isPriceStale` is true
    - Handle allocation changes via TanStack Query invalidation (within 2 seconds)
    - _Requirements: 1.3, 4.3, 5.3, 6.5, 6.7, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 8.2 Write unit tests for collection page integration
    - Test: initial load shows loading state, then renders PrintingListView
    - Test: search filter narrows displayed rows
    - Test: colour identity filter in exact and includes modes works correctly
    - Test: combined filters apply AND logic
    - Test: clearing a filter immediately re-evaluates and updates displayed rows
    - Test file: `src/app/collection/__tests__/page.test.tsx`
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 9. Final checkpoint — Full integration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check via Vitest
- Unit tests validate specific examples and edge cases
- The existing `CollectionListView` and `useCollectionRollup` remain untouched — the printing view is additive
- All utility functions in task 1 are pure with no side effects — independently testable
- The API endpoint reuses existing `requireAuth()` and Supabase client patterns from the project
- Client-side sorting/filtering is appropriate for ~2,700 entries — no server pagination needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4", "8.1"] },
    { "id": 6, "tasks": ["8.2"] }
  ]
}
```
