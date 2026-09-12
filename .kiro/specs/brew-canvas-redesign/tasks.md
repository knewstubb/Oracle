# Implementation Plan: Brew Canvas Redesign

## Overview

Replace the current panel-centric Brew Mode layout (DecisionLogPanel + DeckWorkspacePanel) with a canvas-first spatial layout. The canvas becomes the primary workspace (flex:1) with cards as draggable CSS-transform-positioned objects. The chat collapses to a fixed 220px right column. Refactor happens in-place within `src/components/brew-v2/` — no parallel components.

## Tasks

- [x] 1. Core canvas infrastructure and data model
  - [x] 1.1 Create `CanvasCardPosition` interface and extend `SkeletonState` type
    - Add `CanvasCardPosition` interface to `src/lib/brew-v2-types.ts`
    - Add `canvasPositions: Record<string, CanvasCardPosition>` and `explorationArchive: ArchivedItem[]` fields to skeleton state type
    - Add `CanvasState` interface for component-level canvas state (zoom, pan, mode, view density, overrides)
    - _Requirements: 15.1, 15.2_

  - [x] 1.2 Implement `useCanvasDrag` hook
    - Create `src/components/brew-v2/useCanvasDrag.ts`
    - Implement pointer-based drag using `pointerdown`/`pointermove`/`pointerup` with `setPointerCapture`
    - Return `draggingId`, `dragOffset`, and `getPointerProps(id)` factory
    - Handle drag cancellation when pointer leaves canvas bounds
    - Ghost rendering: original card at opacity 0.4 while dragging
    - _Requirements: 14.1, 14.3, 14.4_

  - [x] 1.3 Implement `useCanvasZoom` hook
    - Create `src/components/brew-v2/useCanvasZoom.ts`
    - Zoom range 40–150% in 10% steps with clamping
    - Ctrl/Cmd+scroll handler for zoom control
    - Auto-switch logic: zoom ≤ 70% → Name_View, zoom > 70% → Card_View (unless manual override)
    - Expose `effectiveView`, `isAutoSwitched`, `setManualView`, `clearOverride`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 1.4 Implement `getNextOpenPosition` positioning algorithm
    - Add to a shared utility file (e.g., `src/components/brew-v2/canvas-utils.ts`)
    - Grid-scan approach: define virtual grid cells, mark occupied, scan for first unoccupied
    - Accept `existingPositions`, `cardWidth`, `cardHeight`, `canvasWidth`, `gap` parameters
    - _Requirements: 14.2, 2.1, 3.1_

  - [ ]* 1.5 Write property test for positioning non-overlap invariant
    - **Property 1: Positioning non-overlap invariant**
    - For any sequence of N card placements, no two cards shall have overlapping bounding boxes
    - **Validates: Requirements 2.1, 3.1, 14.2**

  - [ ]* 1.6 Write property test for zoom level clamping
    - **Property 12: Zoom level clamping**
    - For any zoom operation, resulting zoom level is an integer multiple of 10 within [40, 150]
    - **Validates: Requirements 11.1**

  - [ ]* 1.7 Write property test for zoom-view auto-switch coupling
    - **Property 13: Zoom-view auto-switch coupling**
    - For any zoom level Z with no manual override: Z ≤ 70 → Name_View, Z > 70 → Card_View; manual override persists regardless of zoom
    - **Validates: Requirements 11.4, 11.5, 11.6**

- [x] 2. Checkpoint — Core hooks and utilities pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Canvas container and viewport components
  - [x] 3.1 Create `CanvasViewport` component
    - Create `src/components/brew-v2/CanvasViewport.tsx`
    - Apply `transform: scale(zoomLevel)` to a content wrapper div
    - Handle Ctrl/Cmd+scroll events for zoom via `useCanvasZoom`
    - Render children (cards) within the scaled container
    - _Requirements: 11.1, 11.3_

  - [x] 3.2 Create `BrewCanvas` component
    - Create `src/components/brew-v2/BrewCanvas.tsx`
    - Canvas container (flex:1) that owns `CanvasState` (zoom, pan, mode, viewDensity, viewOverride, draggingId, archiveExpanded)
    - Renders `CanvasViewport`, `CanvasToolbar`, and `ExplorationArchive`
    - Conditionally renders Phase 1 cards (CandidateCard[], DecisionCard[]) or Phase 2 cards (CanvasDeckCard[], PiledColumn[])
    - _Requirements: 1.1, 1.3_

  - [x] 3.3 Create `CanvasToolbar` component
    - Create `src/components/brew-v2/CanvasToolbar.tsx`
    - Zoom-in/zoom-out buttons (disabled at boundaries)
    - Segmented control: Free-Form / Piled mode toggle
    - Segmented control: Card / Name view density toggle with "Auto" tag when zoom-triggered
    - _Requirements: 9.1, 10.1, 11.2, 11.7_

- [x] 4. Phase 1 canvas cards
  - [x] 4.1 Create `CandidateCard` component (refactor from `CommanderOptionsCard`)
    - Create `src/components/brew-v2/CandidateCard.tsx`
    - 168px wide, displays: card art (90px), name overlay with colour pips, 1-2 line description, ownership status, Commit button
    - Positioned via CSS `transform: translate3d(x, y, 0)` from `canvasPositions`
    - Integrates `useCanvasDrag` for pointer-based spatial dragging
    - Ownership: "You own this" (teal) or "Not in collection" (muted)
    - Scryfall validation before rendering (toast error on failure)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1_

  - [x] 4.2 Create `DecisionCard` component
    - Create `src/components/brew-v2/DecisionCard.tsx`
    - 152px wide, dashed border, no art, displays KEY (uppercase) + Value text
    - Positioned via CSS `transform: translate3d(x, y, 0)` from `canvasPositions`
    - Integrates `useCanvasDrag` for pointer-based spatial dragging
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ]* 4.3 Write property test for CandidateCard required elements
    - **Property 2: Candidate_Card renders all required elements**
    - For any valid CommanderOption, the rendered card contains art, name, colour pips, description, and correct ownership indicator
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 4.4 Write property test for DecisionCard KEY and Value
    - **Property 3: Decision_Card renders KEY and Value**
    - For any valid DecisionEntry, the rendered card contains key in uppercase and value as visible text
    - **Validates: Requirements 3.2**

- [x] 5. Phase transition and exploration archive
  - [x] 5.1 Implement commit phase transition logic
    - On first commit: animate Phase 1 cards (scale 0.6, translate toward archive position, fade out over 400ms)
    - After animation: clear Phase 1 cards from canvas, move to `explorationArchive`, fire skeleton generation
    - On re-commit (skeleton exists): show destructive warning modal with current card count before proceeding
    - CSS class `.phase-transition-out` with `onTransitionEnd` handler
    - _Requirements: 4.2, 4.3, 5.2, 5.3, 5.4_

  - [x] 5.2 Create `ExplorationArchive` component
    - Create `src/components/brew-v2/ExplorationArchive.tsx`
    - Collapsed tray positioned bottom-right of canvas
    - Count badge showing number of archived items
    - Expandable to show Phase 1 cards in read-only (non-draggable) state
    - Only visible after first commit
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.3 Write property test for commit transfers all Phase 1 cards to archive
    - **Property 4: Commit transfers all Phase 1 cards to archive**
    - For any non-empty set of Phase 1 cards, commit results in zero canvas cards and archive containing all items
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 5.4 Write property test for re-commit warning card count
    - **Property 5: Re-commit warning displays current card count**
    - For any DeckState where cards.length > 0, re-commit displays warning containing the numeric card count
    - **Validates: Requirements 5.3**

  - [ ]* 5.5 Write property test for archive count and items
    - **Property 6: Archive displays correct count and all items**
    - For any N archived items, count badge shows N, expanded view renders exactly N non-draggable items
    - **Validates: Requirements 6.2, 6.3**

- [x] 6. Checkpoint — Phase 1 flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 2 deck cards — Free-Form and Piled modes
  - [x] 7.1 Create `CanvasDeckCard` component
    - Create `src/components/brew-v2/CanvasDeckCard.tsx`
    - **Card_View**: 140px width, category tag above art, name overlay
    - **Name_View**: 168px width, ownership dot + name + CMC + category text
    - Positioned via CSS `transform: translate3d(x, y, 0)` from `canvasPositions` (free-form) or computed position (piled)
    - Integrates `useCanvasDrag`; in free-form mode, drag repositions without changing `primary_category`
    - "Discuss" action triggers chat pre-fill
    - _Requirements: 7.1, 7.2, 7.3, 10.2, 10.3, 13.1_

  - [x] 7.2 Implement Free-Form mode positioning and persistence
    - On drag end in free-form: update `canvasPositions` in local state and persist to `skeleton_state`
    - Drag does NOT change `primary_category`
    - New deck cards placed via `getNextOpenPosition`
    - _Requirements: 7.3, 7.4, 15.1_

  - [x] 7.3 Create `PiledColumn` component and implement Piled mode
    - Create `src/components/brew-v2/PiledColumn.tsx`
    - Kanban-style columns 150px wide, one per `primary_category`
    - Health icons per column
    - Cards rendered in compact name-view format within columns
    - Cross-column drag updates `primary_category`; same-column drag is no-op
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 7.4 Implement mode toggle (Free-Form ↔ Piled) with position preservation
    - Segmented control switches between modes
    - When switching to piled: retain free-form positions in state
    - When switching back to free-form: restore prior positions; cards whose category changed get fresh position via `getNextOpenPosition`
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 7.5 Write property test for free-form drag preserves category
    - **Property 7: Free-form drag preserves category**
    - For any DeckCard dragged in Free_Form_Mode, `primary_category` remains unchanged
    - **Validates: Requirements 7.3**

  - [ ]* 7.6 Write property test for canvas position persistence round-trip
    - **Property 8: Canvas position persistence round-trip**
    - Serialize/deserialize CanvasCardPosition entries through JSON produces equivalent data
    - **Validates: Requirements 7.4, 15.1**

  - [ ]* 7.7 Write property test for piled mode groups by category
    - **Property 9: Piled mode groups cards by category**
    - For any set of DeckCards, piled mode columns contain only cards matching the column's category
    - **Validates: Requirements 8.1**

  - [ ]* 7.8 Write property test for piled drag behavior
    - **Property 10: Piled drag — cross-column updates, same-column is no-op**
    - Cross-column drop updates `primary_category`; same-column drop leaves state unchanged
    - **Validates: Requirements 8.4, 8.5**

  - [ ]* 7.9 Write property test for free-form position restoration after mode toggle
    - **Property 11: Free-form position restoration after mode toggle**
    - Toggle Free-Form → Piled → Free-Form restores prior positions (unless category changed)
    - **Validates: Requirements 9.3**

- [x] 8. Checkpoint — Phase 2 canvas modes pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Chat panel refactor
  - [x] 9.1 Create `ChatPanel` component (refactored from DecisionLogPanel chat portion)
    - Create `src/components/brew-v2/ChatPanel.tsx`
    - Minimum 220px width, left border separator
    - Draggable resize handle on left edge (pointer-based, same pattern as `useCanvasDrag`)
    - Store width in local state, persist to session if desired
    - 10px font, no avatars, no name labels
    - Oracle messages: muted background + blue left border
    - User messages: blue-tinted background, right-aligned
    - Input at bottom with minimal padding
    - Accept `messages`, `onSend`, `inputRef` props
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 9.2 Implement "Discuss" action integration
    - When a DeckCard "Discuss" action fires, focus chat input and pre-fill with card name
    - Wire `inputRef.current.focus()` and set input value to card name
    - _Requirements: 13.1_

  - [ ]* 9.3 Write property test for discuss action pre-fills card name
    - **Property 14: Discuss action pre-fills card name**
    - For any DeckCard, triggering "Discuss" results in chat input containing exactly that card's `card_name`
    - **Validates: Requirements 13.1**

- [x] 10. Wire everything together — page layout refactor
  - [x] 10.1 Refactor `src/app/new-deck/page.tsx` layout to canvas-first
    - Replace `DecisionLogPanel` + `DeckWorkspacePanel` with `BrewCanvas` (flex:1) + `ChatPanel` (w-[220px])
    - Main container becomes flex-row: `BrewCanvas` (flex:1) | `ChatPanel` (fixed 220px)
    - Wire session state, deck state, and handlers through to new canvas components
    - Remove old imports for `DecisionLogPanel`, `DeckWorkspacePanel`
    - Keep `BrewTopbar` unchanged
    - _Requirements: 1.1, 1.2, 1.3, 16.1, 16.2_

  - [x] 10.2 Remove deprecated components
    - Remove `DecisionLogPanel.tsx` (absorbed into BrewCanvas + ChatPanel)
    - Remove `DeckWorkspacePanel.tsx` (absorbed into canvas)
    - Remove `CommanderOptionsCard.tsx` (replaced by CandidateCard)
    - Remove `useDragReassign.ts` (replaced by useCanvasDrag)
    - Clean up associated test files
    - _Requirements: 16.1_

  - [x] 10.3 Ensure conversation flows without commit gates
    - Conversation proceeds freely in Phase 1 without requiring any commit action
    - Commit lives on CandidateCard only, not in a separate panel
    - _Requirements: 4.1, 5.1_

- [x] 11. Final checkpoint — Full integration passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The refactor is in-place — existing `brew-v2` components are modified/replaced, no parallel set
- No new database tables or columns — positions stored in existing `skeleton_state` JSONB
- Custom CSS transforms + pointer handlers — no react-flow dependency
- Language: TypeScript (Next.js App Router)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "1.7", "3.1", "3.3"] },
    { "id": 3, "tasks": ["3.2", "4.1", "4.2", "9.1"] },
    { "id": 4, "tasks": ["4.3", "4.4", "5.1", "5.2", "9.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5", "7.1", "9.3"] },
    { "id": 6, "tasks": ["7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4", "7.5", "7.6", "7.7"] },
    { "id": 8, "tasks": ["7.8", "7.9", "10.1"] },
    { "id": 9, "tasks": ["10.2", "10.3"] }
  ]
}
```
