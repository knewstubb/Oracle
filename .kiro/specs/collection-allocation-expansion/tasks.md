# Implementation Plan: Collection Allocation Expansion

## Overview

Extend the existing `collection/page.tsx` with UX refinements from the design spec. All changes are UI-only — no new API routes. Work is structured as: extract pure utility functions → refine inline sub-components → wire everything together and validate with tests.

## Tasks

- [x] 1. Extract pure utility functions into a testable module
  - [x] 1.1 Create `src/lib/collection-utils.ts` with `filterCards`, `paginateCards`, `abbreviate`, `getPaginationRange`, and `determineStatus`
    - Move the existing inline `getPaginationRange` and `abbreviate` functions out of page.tsx
    - Implement `filterCards` per the design's filter composition logic (AND semantics)
    - Implement `paginateCards` slicing logic with PAGE_SIZE=100
    - Implement `determineStatus` returning `{ label, variant }` per the badge state table
    - Export TypeScript interfaces: `FilterFlags`, `StatusResult`
    - _Requirements: 2.3, 3.3, 4.1, 5.1, 7.2–7.6, 8.4, 8.6_

  - [ ]* 1.2 Write property tests for `filterCards`
    - **Property 1: Filter composition correctness**
    - Generate random AllocationRow arrays + random filter flag combinations → verify output satisfies all active predicates simultaneously
    - **Validates: Requirements 2.3, 3.3, 8.4, 8.6**

  - [ ]* 1.3 Write property tests for `abbreviate`
    - **Property 2: Deck name abbreviation**
    - Generate random strings (0–200 chars) + random max values (2–20) → verify output length and ellipsis behaviour
    - **Validates: Requirements 4.1**

  - [ ]* 1.4 Write property tests for `paginateCards`
    - **Property 3: Pagination bounds**
    - Generate random arrays (0–500 items) + random page numbers (1–10) → verify slice bounds and empty-page behaviour
    - **Validates: Requirements 5.1**

  - [ ]* 1.5 Write property tests for `determineStatus`
    - **Property 4: Status badge determination**
    - Generate random card state objects (varying orig/proxy/demand counts) → verify label content and variant classification
    - **Validates: Requirements 7.2, 7.4, 7.5, 7.6**

- [x] 2. Refine StatStrip sub-component
  - [x] 2.1 Update `StatCell` to match design — ensure 5 cells render in fixed order with correct teal/amber variants and 10px uppercase labels
    - Verify "Cards owned" is teal, "Conflicts" is amber, others are default white
    - Stat strip renders between page header and tab navigation
    - Counts update reactively after reassign mutation success (already handled via query invalidation)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. Refine Sidebar filter panel
  - [x] 3.1 Implement sidebar item ordering and "Not in any deck" filter behaviour
    - Order: All decks → Not in any deck → [divider] → deck list → [divider] → Conflicts only
    - "Not in any deck" shows count from `stats.notInDeck`
    - Active state: teal right-border accent (already implemented, verify consistency)
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.2 Refine "Conflicts only" shortcut styling
    - Amber text + amber count badge + warning icon
    - Active state uses teal right-border accent (same pattern as other sidebar items)
    - Display conflict count next to the label
    - _Requirements: 3.1, 3.2, 3.4, 3.5_

- [x] 4. Refine Deck Column Headers with Radix Tooltip
  - [x] 4.1 Replace native `title` attribute with Radix `<Tooltip>` on deck column headers
    - Import from `@/components/ui/tooltip`
    - Set `delayDuration={300}` for consistent timing
    - Truncate at 8 characters (update `abbreviate` call from current 10 to 8)
    - Full deck name shown in tooltip content
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 5. Update pagination to PAGE_SIZE=100
  - [x] 5.1 Change `PAGE_SIZE` constant from 50 to 100
    - Update pagination logic to use the extracted `paginateCards` util
    - Footer shows "Showing [N] of [Total] cards" and "[N] conflicts · [N] proxies"
    - Page nav renders prev/next arrows + numbered buttons when total > 100
    - Sidebar/chip filter changes reset to page 1 (already implemented, verify)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Refine StatusBadge sub-component
  - [x] 6.1 Update `StatusBadge` to use the extracted `determineStatus` function and match all design badge states
    - Accept `totalDemand` prop to handle "Not in a deck" state
    - Display correct symbols: "●" for solid states, "◐" for mixed states
    - Teal for original/multiple-copies, amber for proxy/conflict, muted for not-in-deck
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 7. Refine Legend sub-component
  - [x] 7.1 Update `LegendItem` to use 18×18px (`size-[18px]`) rounded (4px) filled squares
    - Three entries: teal "O" + "Original in this deck", amber "P" + "Proxy in this deck", warning triangle + "Allocation conflict"
    - Render below the table footer as a horizontal bar
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 8. Toolbar FilterChip refinements
  - [x] 8.1 Add half-circle icon prefix to Proxies chip and ensure correct variant colours
    - Conflicts chip: amber + warning icon (already present, verify)
    - Proxies chip: teal + half-circle icon prefix
    - "Not in deck" chip: neutral styling
    - Active: filled with coloured border; Inactive: outlined with muted text
    - Chip filters AND with sidebar filter (already implemented, verify)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 9. Wiring and integration
  - [x] 9.1 Wire extracted utility functions into page.tsx
    - Replace inline `filteredCards` memo with imported `filterCards`
    - Replace inline pagination slice with imported `paginateCards`
    - Replace inline `abbreviate` with imported version (max=8)
    - Replace inline `getPaginationRange` with imported version
    - Use `determineStatus` inside `StatusBadge`
    - Ensure conflict row styling (amber bg + warning icon + reassign button) is preserved
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1–10.6_

  - [ ]* 9.2 Write unit tests for component rendering
    - StatStrip renders 5 cells in correct order
    - Legend renders 3 entries with correct indicators
    - Sidebar renders items in correct order with dividers
    - Conflict rows have amber background and warning icon
    - Reassign button visible on hover for proxy/conflict rows
    - _Requirements: 1.1, 6.1, 2.1, 9.1, 10.1_

- [x] 10. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All changes are within `collection/page.tsx` and the new `src/lib/collection-utils.ts` — no new pages or API routes
- Property tests use `fast-check` (available in project test tooling)
- The design specifies TypeScript throughout — no language selection needed
- Existing Radix Tooltip from `@/components/ui/tooltip` is used for deck headers
- Checkpoints ensure incremental validation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["4.1", "5.1", "6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["9.1"] },
    { "id": 4, "tasks": ["9.2"] }
  ]
}
```
