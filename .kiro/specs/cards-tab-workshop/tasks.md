# Implementation Plan: Cards Tab Workshop — Phase 0 Prerequisites

## Overview

Three blocking prerequisites implemented in sequence: (1) category utility + consumer migration, (2) BrewCanvas component wiring, (3) Auto-reset toolbar control. Each prerequisite is self-contained and testable independently.

## Tasks

- [x] 1. Create the category utility module
  - [x] 1.1 Create `src/lib/categoryUtils.ts` with parseCategories, serializeCategories, enforceCategoryCap, and parseCategoriesCapped
    - Parse JSON array strings (`'["Ramp","Draw"]'`) — first element is primary, rest are additional
    - Parse comma-separated strings (`'Ramp, Draw'`) — first token is primary
    - Handle null/undefined/empty → `{ primary_category: 'Other', additional_categories: [] }`
    - Strip `(top)` and `(bottom)` markers from all category strings
    - enforceCategoryCap truncates additional_categories to max 2 entries
    - serializeCategories outputs JSON array format: `'["Primary","Secondary1","Secondary2"]'`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1_

  - [ ]* 1.2 Write property tests for categoryUtils
    - **Property 1: Category round-trip preservation**
    - **Property 2: Category cap enforcement is idempotent**
    - **Property 3: Parsed output always satisfies the cap invariant**
    - **Property 4: Primary category is never empty after parse**
    - **Property 5: Position markers are always stripped**
    - Use fast-check to generate arbitrary strings and StructuredCategories values
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3**

  - [ ]* 1.3 Write unit tests for categoryUtils edge cases
    - Test specific inputs: `null`, `undefined`, `''`, `'[]'`, `'["Ramp (top)"]'`, `'Ramp, Draw, Removal, Finisher'` (exceeds cap)
    - Test malformed JSON: `'[invalid'`, `'{"key": "value"}'`
    - Test backward compatibility with existing deck data patterns
    - _Requirements: 1.2, 1.4, 6.1, 6.2_

- [x] 2. Migrate category consumers to use categoryUtils
  - [x] 2.1 Refactor CardGrid.tsx to use parseCategoriesCapped instead of inline parsePrimaryCategory
    - Remove the local `parsePrimaryCategory` and `groupByType` functions
    - Import and use `parseCategoriesCapped` from `@/lib/categoryUtils`
    - Update `groupByType` to use `structured.primary_category` for grouping
    - Ensure the DeckCard interface in CardGrid still works for its existing callers (or re-export from categoryUtils)
    - _Requirements: 1.1, 6.1, 6.2_

  - [x] 2.2 Refactor CardsTab.tsx to use parseCategoriesCapped
    - Replace any inline category parsing with the shared utility
    - _Requirements: 1.1, 6.1, 6.2_

  - [x] 2.3 Refactor CategoriesPanel.tsx to use parseCategoriesCapped
    - Replace any inline category parsing with the shared utility
    - _Requirements: 1.1, 6.1, 6.2_

- [x] 3. Checkpoint — Category model unified
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [x] 4. Wire CanvasDeckCard and PiledColumn into BrewCanvas
  - [x] 4.1 Replace free-form mode placeholder with CanvasDeckCard
    - Import CanvasDeckCard into BrewCanvas.tsx
    - Replace the inline `<div>` in `renderPhase2Content()` free-form branch with `<CanvasDeckCard>`
    - Pass props: card, position (from canvasPositions), viewDensity (effectiveView), pointerProps (from getPointerProps), isDragging, dragOffset, onDiscuss (onDiscussCard)
    - _Requirements: 3.1, 3.3_

  - [x] 4.2 Replace piled mode placeholder with PiledColumn
    - Import PiledColumn into BrewCanvas.tsx
    - Replace the inline `<div>` in `renderPhase2Content()` piled branch with `<PiledColumn>`
    - Pass props: category, cards (grouped array), healthStatus (default 'unmonitored' for now), onDragIn (onDragReassign), isDragTarget (false for now — drag target detection is a later task)
    - _Requirements: 3.2, 3.4_

  - [ ]* 4.3 Write integration smoke tests for BrewCanvas wiring
    - Test that CanvasDeckCard renders (by data-testid) when phase='building' and layoutMode='free-form'
    - Test that PiledColumn renders (by data-testid) when phase='building' and layoutMode='piled'
    - _Requirements: 3.1, 3.2, 3.5_

- [x] 5. Checkpoint — Canvas components wired
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [ ] 6. Add Auto-reset control to CanvasToolbar
  - [x] 6.1 Extend CanvasToolbar with Auto button and onClearViewOverride prop
    - Add `onClearViewOverride: () => void` to CanvasToolbarProps
    - Add "Auto" as a third option in the view density SegmentedControl (values: 'auto' | 'card' | 'name')
    - When Auto is selected (isAutoSwitched === true), render it with the active highlight style
    - When Card or Name is manually selected, Auto appears deselected
    - Clicking Auto calls `onClearViewOverride`
    - Clicking Card or Name calls `onViewDensityChange` (existing behavior)
    - _Requirements: 4.1, 4.2, 4.3, 5.1, 5.2, 5.3_

  - [x] 6.2 Wire the new prop in BrewCanvas
    - Pass `clearOverride` from the useCanvasZoom hook as `onClearViewOverride` to CanvasToolbar
    - _Requirements: 4.1, 4.2_

  - [ ]* 6.3 Write tests for Auto-reset toolbar behavior
    - **Property 6: Auto mode re-engagement via clearOverride**
    - Test: render CanvasToolbar with isAutoSwitched=true → Auto button has active class
    - Test: render CanvasToolbar with isAutoSwitched=false → Auto button is deselected
    - Test: clicking Auto button calls onClearViewOverride
    - Test useCanvasZoom: after setManualView('card'), clearOverride() makes effectiveView match autoViewForZoom(currentZoom)
    - **Validates: Requirements 4.1, 4.2, 5.1, 5.2, 5.3**

- [x] 7. Final checkpoint — All Phase 0 prerequisites complete
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["3"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "5"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["6.3", "7"] }
  ]
}
```

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The category utility is the foundation — subsequent tasks depend on it
- BrewCanvas wiring (task 4) is purely mechanical — the components are already built and tested in isolation
- The Auto button (task 6) requires a small refactor of the SegmentedControl to support a 3-option density toggle
- No database schema changes are required — the TEXT field stays as-is
- Property tests use fast-check for randomized input generation


---

# Implementation Plan: Cards Tab Workshop — Phase 1 Tagging Model

## Overview

Phase 1 delivers the category tagging UI and data path: (1) a reusable CategoryTagEditor component with constrained dropdowns, (2) an API route to persist category changes, (3) integration into CardsTab per-card rows, and (4) integration into BrewCanvas card context. All pieces use the categoryUtils module from Phase 0.

## Tasks

- [x] 8. Create the CategoryTagEditor component
  - [x] 8.1 Create `src/components/CategoryTagEditor.tsx` — the reusable editor widget
    - Props: `primaryCategory: string`, `additionalCategories: string[]`, `availableCategories: string[]`, `onChange: (updated: StructuredCategories) => void`, `disabled?: boolean`
    - Render primary category as a read-only badge (non-editable display — primary is set at import time)
    - Render two secondary category dropdowns using shadcn Popover + Command (combobox pattern)
    - Each dropdown's option list = `availableCategories` minus the primary category minus the other dropdown's current selection
    - Each dropdown allows clearing (selecting "None" / empty) to remove a secondary category
    - Enforce: maximum 2 secondary categories structurally (only 2 dropdowns exist, no way to add a third)
    - Call `onChange` with the full StructuredCategories whenever either dropdown changes
    - Keyboard accessible: Tab between dropdowns, Enter/Space to open, Escape to close
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [x] 8.2 Create the `useDeckCategories` hook — derives available category vocabulary from deck cards
    - Input: `cards: DeckCard[]` (CardGrid type) or `cards: { primary_category: string }[]` (brew-v2 type)
    - Output: `string[]` — sorted, deduplicated list of all distinct primary_category values used in the deck
    - Use `parseCategoriesCapped` for CardGrid DeckCard[] input; direct field access for brew-v2
    - Memoize with useMemo keyed on the cards array reference
    - _Requirements: 1.5, 2.1_

  - [ ]* 8.3 Write unit tests for CategoryTagEditor
    - Test: renders primary category as non-editable display
    - Test: both dropdowns exclude the primary category from options
    - Test: selecting a value in dropdown 1 removes it from dropdown 2's options
    - Test: selecting a value in dropdown 2 removes it from dropdown 1's options
    - Test: clearing a dropdown calls onChange with that secondary removed
    - Test: onChange payload always has additional_categories.length <= 2
    - Test: disabled prop prevents interaction
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 9. Create the categories update API route
  - [x] 9.1 Create `src/app/api/decks/[id]/cards/[cardId]/categories/route.ts` — PUT handler
    - Parse `id` (deck ID) and `cardId` from route params
    - Accept JSON body: `{ primary_category: string, additional_categories: string[] }`
    - Validate: `primary_category` is non-empty string
    - Validate: `additional_categories.length <= 2` — return 400 if violated
    - Validate: no duplicates between primary and additional — return 400 if violated
    - Use `serializeCategories` from categoryUtils to produce the JSON array string
    - Write to `deck_cards.categories` via Supabase update WHERE `id = cardId` AND `deck_id = deckId`
    - Return 404 if card not found in that deck
    - Return the updated card row on success
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [ ]* 9.2 Write tests for the categories API route
    - Test: valid payload updates the card and returns 200
    - Test: additional_categories with 3+ entries returns 400
    - Test: duplicate between primary and additional returns 400
    - Test: empty primary_category returns 400
    - Test: non-existent cardId returns 404
    - Test: cardId belonging to a different deck returns 404
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 10. Integrate CategoryTagEditor into CardsTab
  - [x] 10.1 Add a category edit trigger to CardRow in CardsTab.tsx
    - Add a small "tag" icon button (lucide `Tags` icon) to each CardRow, visible on hover
    - Clicking the icon opens a Popover containing the CategoryTagEditor
    - Pass the card's parsed categories (via `parseCategoriesCapped`) as initial values
    - Pass `availableCategories` from the `useDeckCategories` hook (called at the CardsTab level)
    - _Requirements: 1.1, 1.5, 2.1_

  - [x] 10.2 Wire the mutation: CategoryTagEditor onChange → API → cache invalidation
    - Use `useMutation` from TanStack Query to call `PUT /api/decks/[deckId]/cards/[cardId]/categories`
    - On success: invalidate `['decks', deckId]` query key to refresh the card list
    - Optimistic update: immediately reflect the new categories in the local card data
    - Show a subtle toast (sonner) on error
    - Close the popover on successful save
    - _Requirements: 1.1, 2.1, 6.1_

  - [ ]* 10.3 Write integration test for CardsTab category editing flow
    - Test: clicking tag icon on a card row opens the CategoryTagEditor popover
    - Test: changing a secondary category triggers the mutation
    - Test: after successful mutation, the card's displayed category updates
    - _Requirements: 1.1, 2.1, 6.1_

- [x] 11. Integrate CategoryTagEditor into BrewCanvas
  - [x] 11.1 Add category editing to CanvasDeckCard context menu or double-click
    - Add a "Edit Categories" option to the existing card context/action surface in CanvasDeckCard
    - Opening it renders a Dialog (shadcn Dialog) containing the CategoryTagEditor
    - The brew-v2 DeckCard already has `primary_category` and `additional_categories` — pass directly
    - Available categories derived from `deckState.cards` via `useDeckCategories`
    - _Requirements: 1.1, 1.5, 2.1_

  - [x] 11.2 Wire the BrewCanvas mutation path
    - On CategoryTagEditor onChange: update the local deckState card in-place (optimistic)
    - If the brew session is persisted (sessionId exists), also call the categories API to persist
    - If the brew session is draft-only (no DB-backed deck_cards row yet), local-only update is sufficient
    - Use `onDragReassign` callback pattern for primary category changes (triggers piled-mode re-grouping)
    - _Requirements: 1.1, 2.1, 3.1, 3.2_

  - [ ]* 11.3 Write integration test for BrewCanvas category editing
    - Test: "Edit Categories" action opens the dialog with correct initial values
    - Test: changing categories updates the card's display in piled mode (re-grouped)
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 12. Programmatic/bulk tagging cap enforcement
  - [x] 12.1 Add `applyCategoryBulk` helper to categoryUtils.ts
    - Input: `suggestions: string[]` (proposed categories from AI), `primaryCategory: string`
    - Behaviour: filter out the primary category from suggestions, then keep only the first 2. No error, no prompt.
    - Output: `StructuredCategories` — ready to serialize
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 12.2 Write property tests for applyCategoryBulk
    - Property: output always has additional_categories.length <= 2
    - Property: primary_category is never in additional_categories
    - Property: order of kept secondaries matches input order (first 2 non-primary)
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 13. Final checkpoint — Phase 1 Tagging Model complete
  - Ensure all tests pass (`vitest --run`), ask the user if questions arise.
  - Verify CategoryTagEditor works in both CardsTab and BrewCanvas contexts.
  - Verify the API route correctly persists and round-trips category data.

## Phase 1 Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["8.1", "8.2", "9.1", "12.1"], "note": "Component, hook, API, and bulk helper are independent" },
    { "id": 1, "tasks": ["8.3", "9.2", "12.2"], "note": "Tests for wave 0 deliverables" },
    { "id": 2, "tasks": ["10.1", "11.1"], "note": "Integration shells — both depend on 8.1 + 8.2" },
    { "id": 3, "tasks": ["10.2", "11.2"], "note": "Mutation wiring — depends on 9.1 + respective 10.1/11.1" },
    { "id": 4, "tasks": ["10.3", "11.3", "13"], "note": "Integration tests and final checkpoint" }
  ]
}
```


---

# Implementation Plan: Cards Tab Workshop — Phase 2 Curve View

## Overview

Phase 2 delivers the Curve View layout mode: a mana curve chart rendered as named card rows stacked bottom-up in CMC-bucketed columns. Lands excluded, X-cost gets a dedicated bucket, 7+ cap applies. Net new code — no existing implementation to reconcile against.

## Tasks

- [x] 14. Extend layout mode type and toolbar to support 'curve'
  - [x] 14.1 Add `'curve'` to the layout mode union type across all touchpoints
    - Update `CanvasState.layoutMode` in `brew-v2-types.ts`: `'free-form' | 'piled' | 'curve'`
    - Update `CanvasToolbarProps.layoutMode` and `onLayoutModeChange` to accept the new union
    - Update `BrewCanvas.tsx` local state and refs to include `'curve'`
    - Gate piled-to-free-form position recovery to exclude curve transitions

  - [x] 14.2 Add 'Curve' option to CanvasToolbar's layout SegmentedControl
    - Add `{ value: 'curve', label: 'Curve' }` to the `layoutOptions` array
    - Widen the SegmentOption generic to include `'curve'`

- [x] 15. Create `useCurveBuckets` — grouping/filtering utility hook
  - [x] 15.1 Create `src/components/brew-v2/useCurveBuckets.ts`
    - Input: `cards: DeckCard[]`
    - Output: `CurveBuckets` — record keyed by `'0'`..`'6'`, `'7+'`, `'X'` with DeckCard arrays
    - Filter out lands (type_line contains 'Land')
    - X-cost detection: oracle_text contains `{X}` → goes to 'X' bucket
    - CMC 0-6 → respective bucket, CMC >= 7 → '7+'
    - Sort alphabetically within each bucket
    - Export `BUCKET_ORDER`: `['0','1','2','3','4','5','6','7+','X']`
    - Memoize with useMemo

- [x] 16. Create `CurveCardRow` component
  - [x] 16.1 Create `src/components/brew-v2/CurveCardRow.tsx`
    - Fixed-height row (22px): ownership dot + card name (truncated) + CMC + secondary category dots
    - Secondary dots: always visible, hover shows tooltip with full category name(s)
    - Export `ROW_HEIGHT` constant
    - Match existing dark-theme palette

- [x] 17. Create `CurveColumn` component
  - [x] 17.1 Create `src/components/brew-v2/CurveColumn.tsx`
    - Props: `bucketLabel: string`, `cards: DeckCard[]`
    - Header: CMC label + persistent count
    - Rows: stacked bottom-up (flex-direction: column-reverse)
    - Height: uncapped (card count * ROW_HEIGHT), no overflow/scroll
    - Export `CURVE_COLUMN_WIDTH` constant
    - Empty columns still render header with count "0"

- [x] 18. Create `CurveView` orchestrator component
  - [x] 18.1 Create `src/components/brew-v2/CurveView.tsx`
    - Props: `cards: DeckCard[]`, `zoomLevel: number`
    - Calls `useCurveBuckets(cards)`, renders CurveColumns in BUCKET_ORDER
    - Scales via zoomLevel (compose correctly with CanvasViewport — avoid double-applying zoom)
    - No internal scroll — relies on parent pan/zoom

- [x] 19. Integrate CurveView into BrewCanvas
  - [x] 19.1 Add `'curve'` branch to `renderPhase2Content()` in BrewCanvas.tsx
    - Import and render `<CurveView cards={deckState.cards} zoomLevel={zoomLevel} />`
    - data-testid: `curve-view`

  - [x] 19.2 Disable view density controls when in Curve mode
    - When layoutMode === 'curve', disable or hide the density SegmentedControl
    - Curve View is always name-only — density toggle is meaningless in this mode

- [x] 20. Secondary category dot indicator with hover tooltip
  - [x] 20.1 Implement dots + tooltip in CurveCardRow
    - Each additional_category gets a small coloured dot (4-5px)
    - Colour: hash category name to pick from a muted palette
    - Always visible (no hover-to-reveal for existence)
    - Hover: native title attribute or lightweight tooltip with full name(s)

- [x] 21. Final checkpoint — Phase 2 Curve View complete
  - Verify Curve mode renders in toolbar and canvas
  - Verify lands excluded, X-cost in rightmost column
  - Verify columns grow unbounded, pan/zoom is only navigation
  - Verify secondary category dots visible with hover tooltip

## Phase 2 Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["14.1", "15.1", "16.1"], "note": "Type extension, bucket utility, row component — independent" },
    { "id": 1, "tasks": ["14.2", "17.1"], "note": "Toolbar option needs 14.1; Column needs 16.1" },
    { "id": 2, "tasks": ["18.1", "20.1"], "note": "CurveView needs 15.1+17.1; Dots enhance 16.1" },
    { "id": 3, "tasks": ["19.1", "19.2"], "note": "BrewCanvas integration needs 14.1+18.1" },
    { "id": 4, "tasks": ["21"], "note": "Final checkpoint" }
  ]
}
```


---

# Implementation Plan: Cards Tab Workshop — Phase 3 Visual Encoding System

## Overview

Phase 3 delivers the visual encoding layer: category colours as primary ring/spine and secondary letter-in-badge across all views. Full-frame card at 180px, 16-char cap, soft-cap warning at 8 categories.

## Locked Decisions Applied:
1. Full-frame at 180px wide (Scryfall `normal` image)
2. Fixed dark collar (2px rgba(0,0,0,0.6))
3. Letter-in-badge at 8px
4. 16-character name cap
5. Soft cap at 8 with UI warning
6. Inline toggle in CardsTab (Phase 4)
7. Middle ground graduation (Phase 4)

## Tasks

- [x] 22. Create shared category colour utility
  - [x] 22.1 Create `src/lib/categoryColour.ts`
    - Export `PRIMARY_PALETTE`: 8-10 saturated colours for primary ring/spine
    - Export `SECONDARY_PALETTE`: 8 muted colours for secondary badges
    - Export `categoryPrimaryColour(category: string): string`
    - Export `categorySecondaryColour(category: string): string`
    - Export `categoryInitial(category: string): string` — first char uppercase
    - Hash function: char-code shift accumulator, abs mod palette length

  - [x] 22.2 Migrate CurveCardRow to use `categoryColour` utility
    - Remove inline DOT_PALETTE and categoryDotColor
    - Import categorySecondaryColour from @/lib/categoryColour

- [x] 23. Upgrade CanvasDeckCard Card_View to full-frame with category ring
  - [x] 23.1 Update Card_View constants and image source
    - CARD_VIEW_WIDTH: 140 → 180
    - Image: art_crop → normal (full frame)
    - Height: 180 * (3.5/2.5) = 252px

  - [x] 23.2 Rework CardView rendering
    - Outer: 3px border = categoryPrimaryColour(primary_category) [the ring]
    - Inside ring: 2px rgba(0,0,0,0.6) [dark collar]
    - Full-frame img filling inner space
    - Secondary badges: bottom-left, 8px circles, coloured bg, white letter
    - Remove old art+scrim+name overlay approach

  - [x] 23.3 Update CanvasDeckCard props and drag shadow for 180px size
    - Adjust hover button positions for larger card
    - Adjust drag shadow spread

- [x] 24. Add primary category left-spine to PiledCardRow
  - [x] 24.1 Add 3px coloured left border using categoryPrimaryColour

- [x] 25. Upgrade CurveCardRow secondary dots to 8px letter-in-badge
  - [x] 25.1 Replace 5px dots with 8px circles containing white letter (categoryInitial)

- [x] 26. Add primary left-spine and secondary badges to CardsTab CardRow
  - [x] 26.1 Add 3px left-spine to CardRow using categoryPrimaryColour
  - [x] 26.2 Add 8px letter badges inline after card name
  - [x] 26.3 Enforce uniform row height (min-height 36px, empty spacer for zero-tag cards)

- [x] 27. Enforce 16-character category name cap
  - [x] 27.1 Add maxLength guard to CategoryTagEditor (for future free-text input)
  - [x] 27.2 Add truncation in useDeckCategories hook (slice to 16 before adding to Set)
  - [x] 27.3 Add truncation in parseCategoriesCapped (defensive backstop)

- [x] 28. Add soft-cap warning at 8 categories
  - [x] 28.1 Add amber warning badge to CategoriesPanel when distinct categories > 8

- [x] 29. Final checkpoint — Phase 3 Visual Encoding System complete

## Phase 3 Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["22.1"], "note": "Shared colour utility — everything depends on this" },
    { "id": 1, "tasks": ["22.2", "23.1", "27.2", "27.3"], "note": "Migrations and truncation guards" },
    { "id": 2, "tasks": ["23.2", "24.1", "25.1", "26.1", "26.2", "26.3", "27.1", "28.1"], "note": "All visual encoding consumers" },
    { "id": 3, "tasks": ["23.3", "29"], "note": "Polish and final checkpoint" }
  ]
}
```
