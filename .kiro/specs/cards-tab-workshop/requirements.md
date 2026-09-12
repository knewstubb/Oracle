# Requirements Document

## Introduction

Phase 0 of the Cards Tab & Workshop feature addresses three prerequisite tasks that block all subsequent feature work: unifying the category data model, wiring existing canvas components, and exposing the auto-reset zoom density control. These are integration and data-model tasks with no new UI screens — they clean up tech debt and connect already-built pieces.

## Glossary

- **Category_Utility**: The shared utility module (`src/lib/categoryUtils.ts`) responsible for parsing, serializing, and validating card categories
- **StructuredCategories**: The canonical app-layer type `{ primary_category: string, additional_categories: string[] }` defined in brew-v2-types
- **BrewCanvas**: The spatial canvas component (`src/components/brew-v2/BrewCanvas.tsx`) that renders deck cards in building phase
- **CanvasDeckCard**: The real card rendering component for free-form mode on the canvas
- **PiledColumn**: The Kanban-style column component for piled layout mode on the canvas
- **CanvasToolbar**: The toolbar above the canvas providing zoom, layout, and density controls
- **Auto_Mode**: The zoom-threshold-based automatic view density switching behavior in useCanvasZoom
- **Category_Cap**: The hard limit of 3 total categories per card (1 primary + up to 2 secondary)

## Requirements

### Requirement 1: Unified Category Data Model

**User Story:** As a developer, I want all category consumers to use a single structured type, so that category logic is consistent and bugs from ad-hoc parsing are eliminated.

#### Acceptance Criteria

1. WHEN any component renders card categories, THE Category_Utility SHALL parse the raw database text into StructuredCategories format
2. THE Category_Utility SHALL handle JSON array strings, comma-separated strings, null, undefined, and empty string inputs without throwing
3. THE Category_Utility SHALL strip Archidekt position markers `(top)` and `(bottom)` from all parsed category strings
4. WHEN the Category_Utility parses a null, undefined, or empty string input, THE Category_Utility SHALL return `{ primary_category: 'Other', additional_categories: [] }`
5. THE Category_Utility SHALL produce a serialized JSON array string from any valid StructuredCategories value
6. WHEN a StructuredCategories value is serialized and then parsed, THE Category_Utility SHALL produce an equivalent StructuredCategories value (round-trip)

### Requirement 2: Category Cap Enforcement

**User Story:** As a product owner, I want a hard cap of 3 categories per card enforced at the data layer, so that the UI never has to handle unbounded category lists.

#### Acceptance Criteria

1. WHERE a card's categories are written or modified, THE Category_Utility SHALL truncate any assignment exceeding 1 primary + 2 secondary categories
2. THE Category_Utility SHALL enforce the cap idempotently — applying enforcement twice produces the same result as once
3. WHEN the Category_Utility parses any input, THE parseCategoriesCapped function SHALL return a StructuredCategories with at most 2 additional categories

### Requirement 3: Wire Canvas Components

**User Story:** As a developer, I want BrewCanvas to render the real CanvasDeckCard and PiledColumn components, so that the canvas displays production-quality cards instead of placeholder divs.

#### Acceptance Criteria

1. WHEN BrewCanvas renders cards in free-form mode during building phase, THE BrewCanvas SHALL import and render CanvasDeckCard for each deck card
2. WHEN BrewCanvas renders cards in piled mode during building phase, THE BrewCanvas SHALL import and render PiledColumn for each category group
3. THE BrewCanvas SHALL pass all required props to CanvasDeckCard including card data, position, viewDensity, pointerProps, isDragging, dragOffset, and onDiscuss
4. THE BrewCanvas SHALL pass all required props to PiledColumn including category, cards, healthStatus, onDragIn, and isDragTarget
5. WHEN the existing test suite runs after wiring, THE test suite SHALL pass without failures

### Requirement 4: Auto-Reset Toolbar Control

**User Story:** As a user, I want a visible control to reset view density to automatic zoom-based switching, so that I can return to the default behavior after manually selecting a density.

#### Acceptance Criteria

1. WHEN the user has manually overridden view density, THE CanvasToolbar SHALL display an "Auto" control that re-engages zoom-threshold-based density switching when activated
2. WHEN the "Auto" control is activated, THE CanvasToolbar SHALL call the clearOverride function from useCanvasZoom
3. THE CanvasToolbar SHALL render the "Auto" control as part of the density segmented control section

### Requirement 5: Auto Mode Visual Indicator

**User Story:** As a user, I want the Auto control to visually indicate whether auto mode is active, so that I can tell at a glance which density mode I'm in.

#### Acceptance Criteria

1. WHILE auto-switch is active (no manual override), THE "Auto" control SHALL appear visually selected with the active highlight style
2. WHILE a manual override is active (Card or Name selected), THE "Auto" control SHALL appear visually deselected
3. WHEN the user manually selects Card or Name, THE "Auto" control SHALL transition from selected to deselected state

### Requirement 6: Backward Compatibility

**User Story:** As a user with existing decks, I want my deck data with flat category strings to render correctly through the new parsing utility, so that no existing functionality breaks.

#### Acceptance Criteria

1. WHEN existing deck data contains legacy comma-separated category strings, THE Category_Utility SHALL parse them correctly into StructuredCategories
2. WHEN existing deck data contains JSON array category strings, THE Category_Utility SHALL parse them correctly into StructuredCategories
3. THE existing test suite SHALL pass without modification after all Phase 0 changes are applied
4. THE database schema (deck_cards.categories TEXT) SHALL remain unchanged
