# Requirements Document

## Introduction

This feature redesigns the Brew Mode UI from a panel-centric layout (chat + side panels) to a canvas-first layout. The canvas becomes the primary workspace (flex:1) where commander candidates, decision cards, and deck cards are spatially positioned, draggable objects. The chat column collapses to a fixed 220px secondary panel. The refactor occurs in-place within the existing `brew-v2` component set — no parallel components.

## Glossary

- **Canvas**: The primary workspace area (flex:1) where cards are rendered as spatially-positioned, draggable objects using CSS transforms and custom drag handlers.
- **Chat_Panel**: The fixed-width (220px) secondary column displaying compact Oracle conversation messages.
- **Candidate_Card**: A 168px-wide card object rendered on the Canvas during Phase 1, representing a commander option Oracle has surfaced. Contains art, name overlay with colour pips, description, ownership status, and a Commit button.
- **Decision_Card**: A 152px-wide card object rendered on the Canvas during Phase 1, representing a key decision extracted from conversation. Has a dashed border, no art, displays KEY + Value only.
- **Deck_Card**: A card object rendered on the Canvas during Phase 2 (Building), representing a card in the deck skeleton.
- **Exploration_Archive**: A collapsed tray (bottom-right of Canvas) that stores all Phase 1 cards after commander commit, providing read-only historical access.
- **Free_Form_Mode**: Phase 2 default layout where Deck_Cards occupy arbitrary spatial positions with a category tag above the art.
- **Piled_Mode**: Phase 2 alternate layout where Deck_Cards are arranged in kanban-style columns (150px wide) grouped by primary_category.
- **Card_View**: Deck_Card rendering at 140px width showing category tag + art + name overlay.
- **Name_View**: Deck_Card rendering at 168px width showing ownership dot + name + CMC + category text.
- **Zoom_Level**: The current canvas scale factor, ranging from 40% to 150% in 10% steps.
- **Canvas_Position**: The x/y coordinate and metadata for a card's placement on the Canvas, stored in `brew_sessions.skeleton_state`.
- **CanvasCardPosition**: The TypeScript interface representing a card's spatial state within `skeleton_state`.

## Requirements

### Requirement 1: Canvas-Primary Layout

**User Story:** As a brewer, I want the canvas to be the dominant workspace so that I have maximum spatial area for exploring and organizing cards.

#### Acceptance Criteria

1. THE Canvas SHALL occupy all remaining horizontal space using flex:1 layout.
2. THE Chat_Panel SHALL render as a fixed 220px-wide column to the right of the Canvas with a left border separator.
3. WHEN the Brew page loads, THE Canvas SHALL be the primary visual element and the Chat_Panel SHALL be the secondary element.

### Requirement 2: Phase 1 — Candidate Cards on Canvas

**User Story:** As a brewer, I want commander candidates to appear as draggable card objects on the canvas so that I can spatially explore my options.

#### Acceptance Criteria

1. WHEN Oracle introduces a commander candidate, THE Canvas SHALL render a Candidate_Card at the next open position.
2. THE Candidate_Card SHALL be 168px wide and display: card art (90px height), name overlay with colour pips, 1-2 line description, and ownership status.
3. THE Candidate_Card SHALL display ownership status as "You own this" (teal) or "Not in collection" (muted).
4. THE Candidate_Card SHALL include a Commit button that triggers commander commitment and phase transition.
5. THE Candidate_Card SHALL be a draggable object using custom CSS transforms and drag handlers.
6. WHEN a Candidate_Card is introduced, THE Canvas SHALL confirm the card exists via Scryfall before rendering.

### Requirement 3: Phase 1 — Decision Cards on Canvas

**User Story:** As a brewer, I want extracted decisions to appear as card objects on the canvas so that I can see my strategy forming spatially.

#### Acceptance Criteria

1. WHEN a decision is extracted from conversation, THE Canvas SHALL render a Decision_Card at the next open position.
2. THE Decision_Card SHALL be 152px wide, display a dashed border, contain no art, and show only KEY (uppercase) and Value text.
3. THE Decision_Card SHALL be a draggable object using custom CSS transforms and drag handlers.

### Requirement 4: Phase 1 — Free-Flowing Conversation

**User Story:** As a brewer, I want to explore ideas freely without commit gates so that the conversation flows naturally.

#### Acceptance Criteria

1. THE Canvas SHALL allow conversation to proceed without requiring any commit action to advance.
2. WHEN a Candidate_Card Commit button is pressed, THE Canvas SHALL clear all Phase 1 cards immediately.
3. WHEN the first commit occurs, THE Canvas SHALL transfer all Phase 1 Candidate_Cards and Decision_Cards into the Exploration_Archive.

### Requirement 5: Commit Behavior

**User Story:** As a brewer, I want the commit action to live on the candidate card itself so that I commit directly from the canvas.

#### Acceptance Criteria

1. THE Commit button SHALL be rendered on the Candidate_Card itself, not in a separate panel.
2. WHEN the Commit button is pressed for the first time, THE Canvas SHALL clear all Phase 1 cards and fire skeleton generation immediately.
3. WHEN a re-commit is attempted after a skeleton already exists, THE Canvas SHALL display a destructive warning showing the current card count that will be replaced.
4. THE phase transition from exploration to building SHALL be accompanied by an animated transition where Phase 1 cards morph into the Exploration_Archive tray.

### Requirement 6: Exploration Archive

**User Story:** As a brewer, I want to review my exploration history after committing so that I can reference past decisions.

#### Acceptance Criteria

1. THE Exploration_Archive SHALL render as a collapsed tray in the bottom-right of the Canvas.
2. THE Exploration_Archive SHALL display a count badge showing the number of archived cards.
3. WHEN expanded, THE Exploration_Archive SHALL display Phase 1 cards in a read-only historical view.
4. THE Exploration_Archive SHALL appear only after the first commander commit.

### Requirement 7: Phase 2 — Free-Form Mode (Default)

**User Story:** As a brewer, I want deck cards at arbitrary positions on the canvas so that I can spatially organize my deck freely.

#### Acceptance Criteria

1. WHEN the building phase begins, THE Canvas SHALL render Deck_Cards in Free_Form_Mode by default.
2. THE Canvas SHALL display a category tag above the art for each Deck_Card in Free_Form_Mode.
3. WHEN a Deck_Card is dragged in Free_Form_Mode, THE Canvas SHALL reposition the card spatially without changing its primary_category.
4. THE Canvas SHALL persist card positions in `brew_sessions.skeleton_state` using the CanvasCardPosition interface.

### Requirement 8: Phase 2 — Piled by Category Mode

**User Story:** As a brewer, I want to view my deck organized by category in columns so that I can assess category health at a glance.

#### Acceptance Criteria

1. WHEN Piled_Mode is active, THE Canvas SHALL arrange Deck_Cards in kanban-style columns of 150px width, one column per primary_category.
2. THE Canvas SHALL display health icons per column in Piled_Mode.
3. THE Canvas SHALL render cards within columns in a compact name-view format.
4. WHEN a Deck_Card is dragged to a different column in Piled_Mode, THE Canvas SHALL snap the card to the target column and update the card's primary_category.
5. WHEN a Deck_Card is dragged within its own column in Piled_Mode, THE Canvas SHALL treat the drop as a no-op.

### Requirement 9: Mode Toggle

**User Story:** As a brewer, I want to switch between free-form and piled views so that I can use whichever spatial arrangement is most useful.

#### Acceptance Criteria

1. THE Canvas SHALL provide a segmented control for switching between Free_Form_Mode and Piled_Mode.
2. WHEN the mode toggle is activated, THE Canvas SHALL switch the entire board layout between the two modes.
3. WHEN switching from Piled_Mode to Free_Form_Mode, THE Canvas SHALL restore each card's prior free-form position.

### Requirement 10: Card Density — Card/Name View Toggle

**User Story:** As a brewer, I want to switch between detailed card view and compact name view so that I can balance information density with spatial overview.

#### Acceptance Criteria

1. THE Canvas SHALL provide a segmented control for switching between Card_View and Name_View.
2. WHEN Card_View is active, THE Canvas SHALL render each Deck_Card at 140px width showing category tag + art + name overlay.
3. WHEN Name_View is active, THE Canvas SHALL render each Deck_Card at 168px width showing ownership dot + name + CMC + category.

### Requirement 11: Zoom Controls

**User Story:** As a brewer, I want to zoom the canvas in and out so that I can see the full deck or focus on individual cards.

#### Acceptance Criteria

1. THE Canvas SHALL support a Zoom_Level range of 40% to 150% in 10% increments.
2. THE Canvas SHALL provide zoom-in and zoom-out buttons for Zoom_Level control.
3. THE Canvas SHALL support Ctrl/Cmd+scroll for Zoom_Level control.
4. WHEN Zoom_Level drops to 70% or below, THE Canvas SHALL auto-switch to Name_View unless a manual override is active.
5. WHEN Zoom_Level rises above 70%, THE Canvas SHALL auto-switch to Card_View unless a manual override is active.
6. WHEN the user manually selects a view (Card_View or Name_View), THE Canvas SHALL set a persistent override that prevents auto-switching.
7. WHILE a zoom-triggered auto-switch to Name_View is active, THE Canvas SHALL display an "Auto" tag on the Name button in the segmented control.

### Requirement 12: Chat Panel — Compact Layout

**User Story:** As a brewer, I want the chat panel to be compact and unobtrusive so that it doesn't compete with the canvas for attention.

#### Acceptance Criteria

1. THE Chat_Panel SHALL use 10px font size with no avatars and no name labels.
2. THE Chat_Panel SHALL render Oracle messages with a muted background and blue left border.
3. THE Chat_Panel SHALL render user messages with a blue-tinted background, right-aligned.
4. THE Chat_Panel SHALL have a minimum width of 220px with a left border separator.
5. THE Chat_Panel SHALL provide a draggable resize handle on its left edge that allows the user to widen the panel beyond the 220px minimum.

### Requirement 13: Card "Discuss" Action

**User Story:** As a brewer, I want to quickly discuss a specific card with Oracle so that I can get contextual assessment without breaking flow.

#### Acceptance Criteria

1. WHEN a Deck_Card "Discuss" action is triggered, THE Chat_Panel SHALL focus the chat input and pre-fill it with the card name.

### Requirement 14: Canvas Positioning and Drag System

**User Story:** As a brewer, I want cards to be true draggable spatial objects so that I can arrange them intuitively on the canvas.

#### Acceptance Criteria

1. THE Canvas SHALL implement card dragging using custom CSS transforms and drag event handlers without external library dependencies (no react-flow).
2. WHEN Oracle introduces a new card, THE Canvas SHALL place it at the next available open position using a positioning algorithm.
3. THE Canvas SHALL support pointer-based drag (mousedown/touchstart) for all card types (Candidate_Card, Decision_Card, Deck_Card).
4. WHILE a card is being dragged, THE Canvas SHALL render the card at reduced opacity (0.4) at its original position.

### Requirement 15: Data Constraints

**User Story:** As a developer, I want to understand the data boundary constraints so that I avoid schema drift.

#### Acceptance Criteria

1. THE Canvas SHALL store all card positions in the existing `brew_sessions.skeleton_state` column using the CanvasCardPosition interface.
2. THE Canvas SHALL introduce no new database tables or columns.
3. THE Canvas SHALL make no changes to the DeckCard interface, category model, or Archidekt sync logic.

### Requirement 16: In-Place Refactor

**User Story:** As a developer, I want to refactor the existing brew-v2 components in place so that there is no parallel component set to maintain.

#### Acceptance Criteria

1. THE Canvas redesign SHALL be implemented by refactoring existing components in `src/components/brew-v2/` — not by creating a parallel component set.
2. THE refactored page SHALL continue to use `src/app/new-deck/page.tsx` as its entry point.
