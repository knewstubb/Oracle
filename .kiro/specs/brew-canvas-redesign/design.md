# Design Document: Brew Canvas Redesign

## Architecture Overview

The canvas-first redesign replaces the current panel-centric layout (chat left + workspace panels right) with a spatial canvas that occupies all remaining screen width (flex:1), pushing chat to a narrow 220px fixed column on the right. Cards become true spatial objects positioned via CSS `transform: translate(x, y)` within a zoomable/pannable viewport.

The refactor targets the existing `brew-v2` component set in-place. No parallel component directories are created. The entry point remains `src/app/new-deck/page.tsx`.

### Key Architectural Decisions

1. **Custom CSS transforms + pointer handlers** — No react-flow or similar spatial library. Cards use `transform: translate3d(x, y, 0)` for GPU-accelerated positioning. Drag is handled via `pointerdown`/`pointermove`/`pointerup` with `setPointerCapture`.
2. **Single data source, two rendering strategies** — Free-form and piled modes both read from the same `DeckCard[]` array. Free-form uses persisted `CanvasCardPosition` data; piled computes positions from category groupings at render time.
3. **Canvas positions stored in `skeleton_state`** — The existing JSONB column `brew_sessions.skeleton_state` gains a `canvasPositions` key containing a `Record<string, CanvasCardPosition>`. No schema changes.
4. **Zoom as CSS scale transform** — The canvas viewport applies `transform: scale(zoomLevel)` to a content layer. Zoom range is 40–150% in 10% steps.

---

## Component Architecture

### Layout Hierarchy (Refactored)

```
src/app/new-deck/page.tsx
├── BrewTopbar (unchanged — session controls)
└── main (flex row)
    ├── BrewCanvas (flex:1) ← NEW component, replaces DecisionLogPanel + DeckWorkspacePanel
    │   ├── CanvasViewport (zoom/pan container)
    │   │   ├── CandidateCard[] (Phase 1)
    │   │   ├── DecisionCard[] (Phase 1)
    │   │   ├── DeckCard[] (Phase 2 — Card_View or Name_View)
    │   │   └── PiledColumns[] (Phase 2 — Piled_Mode only)
    │   ├── CanvasToolbar (zoom controls, mode toggle, view toggle)
    │   └── ExplorationArchive (collapsed tray, bottom-right)
    └── ChatPanel (w-[220px]) ← Refactored from DecisionLogPanel chat portion
```

### Component Responsibilities

| Component | File | Role |
|-----------|------|------|
| `BrewCanvas` | `src/components/brew-v2/BrewCanvas.tsx` | Canvas container, owns viewport state (zoom, pan, mode) |
| `CanvasViewport` | `src/components/brew-v2/CanvasViewport.tsx` | Applies zoom/pan transforms, handles scroll-zoom |
| `CandidateCard` | `src/components/brew-v2/CandidateCard.tsx` | Phase 1 commander option (refactored from CommanderOptionsCard) |
| `DecisionCard` | `src/components/brew-v2/DecisionCard.tsx` | Phase 1 decision entry (new) |
| `CanvasDeckCard` | `src/components/brew-v2/CanvasDeckCard.tsx` | Phase 2 deck card with Card_View/Name_View rendering |
| `PiledColumn` | `src/components/brew-v2/PiledColumn.tsx` | Kanban column for piled mode |
| `CanvasToolbar` | `src/components/brew-v2/CanvasToolbar.tsx` | Zoom, mode toggle, view density toggle |
| `ExplorationArchive` | `src/components/brew-v2/ExplorationArchive.tsx` | Collapsed archive tray |
| `ChatPanel` | `src/components/brew-v2/ChatPanel.tsx` | Compact 220px chat column (refactored) |
| `useCanvasDrag` | `src/components/brew-v2/useCanvasDrag.ts` | Pointer-based spatial drag hook (replaces useDragReassign) |
| `useCanvasZoom` | `src/components/brew-v2/useCanvasZoom.ts` | Zoom state, clamping, auto-switch logic |

### Components Removed/Absorbed

- `DecisionLogPanel` → absorbed into `BrewCanvas` (decisions become spatial cards) + `ChatPanel` (messages)
- `DeckWorkspacePanel` → absorbed into canvas (cards rendered spatially)
- `CommanderOptionsCard` → replaced by individual `CandidateCard` instances on canvas
- `useDragReassign` → replaced by `useCanvasDrag` (pointer-based instead of HTML5 DnD)

---

## Data Model

### New Interface: CanvasCardPosition

```typescript
/** Position and metadata for a card on the canvas */
export interface CanvasCardPosition {
  /** Card identifier — card_name for DeckCards, id for candidates/decisions */
  id: string
  /** Horizontal position in canvas-space pixels */
  x: number
  /** Vertical position in canvas-space pixels */
  y: number
  /** Card type determines rendering strategy */
  type: 'candidate' | 'decision' | 'deck'
  /** Timestamp of last position update (for conflict resolution) */
  updatedAt: number
}
```

### Extended skeleton_state Shape

```typescript
/** Structure stored in brew_sessions.skeleton_state JSONB column */
interface SkeletonState {
  /** Existing fields — deck card data */
  cards: DeckCard[]
  suggestions: DeckCard[]
  /** New field — spatial positions for canvas cards */
  canvasPositions: Record<string, CanvasCardPosition>
  /** New field — archived Phase 1 items (post-commit) */
  explorationArchive: ArchivedItem[]
}

interface ArchivedItem {
  type: 'candidate' | 'decision'
  data: CommanderOption | DecisionEntry
}
```

### Canvas State (Component-Level)

```typescript
/** Local state for the BrewCanvas component */
interface CanvasState {
  /** Current zoom level: 40–150, step 10 */
  zoomLevel: number
  /** Pan offset in viewport pixels */
  panOffset: { x: number; y: number }
  /** Active layout mode */
  layoutMode: 'free-form' | 'piled'
  /** Active card density view */
  viewDensity: 'card' | 'name'
  /** Whether the user manually selected a view (prevents auto-switch) */
  viewOverride: boolean
  /** Currently dragged card id (null if idle) */
  draggingId: string | null
  /** Exploration archive expanded state */
  archiveExpanded: boolean
}
```

---

## Drag System Design

### Pointer-Based Drag (useCanvasDrag)

The existing `useDragReassign` uses HTML5 Drag and Drop API which doesn't support spatial repositioning well. The new `useCanvasDrag` hook uses the Pointer Events API:

```typescript
interface UseCanvasDragReturn {
  draggingId: string | null
  dragOffset: { x: number; y: number } | null
  getPointerProps: (id: string) => {
    onPointerDown: (e: React.PointerEvent) => void
  }
}
```

**Drag Flow:**
1. `pointerdown` on a card → capture pointer, record start position and card's current transform
2. `pointermove` → compute delta from start, apply `transform: translate3d(startX + dx, startY + dy, 0)` directly
3. `pointerup` → release capture, compute final position, dispatch position update
4. In piled mode: on `pointerup`, detect which column the card center is over → if different column, dispatch `dragReassign`; if same column, no-op

**Ghost rendering:** While dragging, the card at its original position renders at `opacity: 0.4`. The dragged card follows the pointer at full opacity as a sibling element with higher z-index.

---

## Positioning Algorithm

When Oracle introduces a new card (candidate, decision, or deck card), the canvas needs to place it at the "next open position" — a position that doesn't overlap existing cards.

```typescript
/** Computes the next non-overlapping position for a new card */
function getNextOpenPosition(
  existingPositions: CanvasCardPosition[],
  cardWidth: number,
  cardHeight: number,
  canvasWidth: number,
  gap: number = 16
): { x: number; y: number }
```

**Algorithm:** Grid-scan approach:
1. Define a virtual grid with cell size = `(cardWidth + gap) × (cardHeight + gap)`
2. Mark cells occupied by existing cards
3. Scan left-to-right, top-to-bottom for the first unoccupied cell
4. Return the cell's top-left corner as the position

This guarantees no overlaps for newly placed cards. User-dragged cards may overlap (intentional — spatial freedom).

---

## Zoom System Design

### useCanvasZoom Hook

```typescript
interface UseCanvasZoomReturn {
  zoomLevel: number
  zoomIn: () => void
  zoomOut: () => void
  handleWheel: (e: WheelEvent) => void
  /** The currently effective view density (accounting for auto-switch) */
  effectiveView: 'card' | 'name'
  /** Whether auto-switch is active (no manual override) */
  isAutoSwitched: boolean
  /** Manually override the view density */
  setManualView: (view: 'card' | 'name') => void
  /** Clear the manual override */
  clearOverride: () => void
}
```

**Zoom-View Coupling Rules:**
- Zoom ≤ 70% → auto-switch to Name_View (unless manual override)
- Zoom > 70% → auto-switch to Card_View (unless manual override)
- Manual selection of either view sets `viewOverride = true`
- Override persists until explicitly cleared or session resets

**Clamping:** `Math.max(40, Math.min(150, newZoom))` with step enforcement via `Math.round(newZoom / 10) * 10`.

---

## Phase Transition Animation

When the user commits a commander (Phase 1 → Phase 2):

1. All `CandidateCard` and `DecisionCard` elements receive a CSS class triggering:
   - Scale down to 60%
   - Translate toward bottom-right corner (archive position)
   - Fade opacity to 0
   - Duration: 400ms ease-out
2. After animation completes (via `onTransitionEnd`):
   - Remove Phase 1 cards from canvas
   - Move data into `explorationArchive`
   - Render `ExplorationArchive` tray with count badge
   - Begin skeleton generation

```css
.phase-transition-out {
  transition: transform 400ms ease-out, opacity 300ms ease-out;
  transform: translate3d(var(--archive-x), var(--archive-y), 0) scale(0.6);
  opacity: 0;
}
```

---

## Mode Toggle: Free-Form ↔ Piled

Both modes render the same `DeckCard[]` data — they differ only in how positions are computed:

| Aspect | Free-Form | Piled |
|--------|-----------|-------|
| Positions | From `canvasPositions` (persisted) | Computed from category groupings |
| Drag behavior | Spatial reposition (category unchanged) | Column-to-column reassignment |
| View density | Respects Card/Name toggle | Always Name_View |
| Card width | 140px (Card) or 168px (Name) | 150px column, name-view cards |

**Position preservation:** When switching to piled mode, free-form positions are retained in state. Switching back restores them. If a card's category changed while in piled mode, it keeps its new category but gets a fresh position via `getNextOpenPosition`.

---

## Chat Panel (Compact)

The `ChatPanel` is a minimal 220px column:

```typescript
interface ChatPanelProps {
  messages: ChatMessage[]
  onSend: (text: string) => void
  inputRef: React.RefObject<HTMLInputElement>
}
```

**Styling rules:**
- Font size: 10px
- No avatars, no name labels
- Oracle messages: `bg-[rgba(255,255,255,0.03)]` + `border-l-2 border-[#378ADD]`
- User messages: `bg-[rgba(55,138,221,0.08)]` + right-aligned text
- Input at bottom with minimal padding

**"Discuss" integration:** When a deck card's "Discuss" action fires, it calls `inputRef.current.focus()` and sets the input value to the card name.

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Scryfall validation fails for candidate | Card not rendered; toast error "Card not found: {name}" |
| Canvas positions exceed viewport | Auto-pan to show new card; no position clamping |
| Drag to invalid area (outside canvas) | Cancel drag, restore original position |
| skeleton_state JSON parse failure | Fall back to empty positions, log error |
| Re-commit with existing deck | Destructive confirmation modal showing card count |
| Zoom at boundary (40% or 150%) | Button disabled state, no-op on further scroll |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Positioning non-overlap invariant

*For any* sequence of N card introductions (candidates, decisions, or deck cards) placed by the positioning algorithm, no two cards shall have overlapping bounding boxes.

**Validates: Requirements 2.1, 3.1, 14.2**

### Property 2: Candidate_Card renders all required elements

*For any* valid `CommanderOption` data, the rendered `CandidateCard` shall contain: card art, name text, colour identity pips, description text, and an ownership indicator that reads "You own this" when `owned === true` or "Not in collection" when `owned === false`.

**Validates: Requirements 2.2, 2.3**

### Property 3: Decision_Card renders KEY and Value

*For any* valid `DecisionEntry`, the rendered `DecisionCard` shall contain the entry's `key` in uppercase and the entry's `value` as visible text content.

**Validates: Requirements 3.2**

### Property 4: Commit transfers all Phase 1 cards to archive

*For any* non-empty set of Phase 1 cards (candidates and decisions) on the canvas, executing a commit action shall result in: zero Phase 1 cards on the canvas AND the exploration archive containing exactly those same items.

**Validates: Requirements 4.2, 4.3**

### Property 5: Re-commit warning displays current card count

*For any* `DeckState` where `cards.length > 0`, attempting a re-commit shall display a destructive warning that contains the numeric value of the current card count.

**Validates: Requirements 5.3**

### Property 6: Archive displays correct count and all items

*For any* list of N archived items, the `ExplorationArchive` count badge shall display the number N, and when expanded, shall render exactly N items in a read-only (non-draggable) state.

**Validates: Requirements 6.2, 6.3**

### Property 7: Free-form drag preserves category

*For any* `DeckCard` dragged to any new position in Free_Form_Mode, the card's `primary_category` shall remain identical to its value before the drag operation.

**Validates: Requirements 7.3**

### Property 8: Canvas position persistence round-trip

*For any* collection of `CanvasCardPosition` entries, serializing them into `skeleton_state` JSON and then deserializing shall produce a collection equivalent to the original (same ids, same x/y coordinates, same types).

**Validates: Requirements 7.4, 15.1**

### Property 9: Piled mode groups cards by category

*For any* set of `DeckCard` entries with varying `primary_category` values, rendering in Piled_Mode shall produce columns where every card in a given column shares the same `primary_category` as the column header.

**Validates: Requirements 8.1**

### Property 10: Piled drag behavior — cross-column updates, same-column is no-op

*For any* `DeckCard` dragged in Piled_Mode: if dropped on a column with a different category, the card's `primary_category` shall update to the target column's category; if dropped within its own column, the deck state shall remain unchanged.

**Validates: Requirements 8.4, 8.5**

### Property 11: Free-form position restoration after mode toggle

*For any* set of deck cards with persisted free-form positions, toggling from Free_Form_Mode → Piled_Mode → Free_Form_Mode shall restore each card to its prior free-form x/y position (excluding cards whose category changed during piled mode, which receive a fresh position).

**Validates: Requirements 9.3**

### Property 12: Zoom level clamping

*For any* zoom operation (increment, decrement, or scroll-delta), the resulting zoom level shall be an integer multiple of 10 within the inclusive range [40, 150].

**Validates: Requirements 11.1**

### Property 13: Zoom-view auto-switch coupling

*For any* zoom level Z where no manual view override is active: if Z ≤ 70 then the effective view shall be Name_View; if Z > 70 then the effective view shall be Card_View. *For any* sequence of zoom changes after a manual view selection, the effective view shall remain at the manually selected value regardless of zoom level.

**Validates: Requirements 11.4, 11.5, 11.6**

### Property 14: Discuss action pre-fills card name

*For any* `DeckCard` in the deck, triggering the "Discuss" action shall result in the chat input field containing exactly that card's `card_name` value.

**Validates: Requirements 13.1**
