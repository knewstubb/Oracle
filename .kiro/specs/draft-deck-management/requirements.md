# Requirements Document

## Introduction

Draft Deck Management covers the lifecycle management for draft decks created in Brew Mode. Currently, draft decks (brew sessions that haven't been saved/finalised) appear on the dashboard but have no delete path and persist indefinitely. This feature adds: a `status` column to the `decks` table distinguishing active from draft decks, distinct hover actions for draft tiles on the dashboard, inline delete confirmation (no modals), active deck deletion guards, and a persistent draft banner on the deck detail page. The goal is to give users a clean, safe way to discard abandoned brew sessions without affecting active (Archidekt-synced) decks.

## Glossary

- **Draft_Deck**: A deck record in the `decks` table with `status = 'draft'` — representing an in-progress brew session that has not been finalised or synced to Archidekt
- **Active_Deck**: A deck record in the `decks` table with `status = 'active'` — representing a finalised deck synced to/from Archidekt
- **Deck_Tile**: An individual card component in the dashboard grid representing one deck
- **Draft_Tile**: A Deck_Tile rendering a Draft_Deck with visually distinct styling (dashed border, blue Draft badge, no health pips)
- **Inline_Confirmation**: A confirmation UI rendered within the bounds of the triggering component (tile or banner) — replacing the component's content rather than opening a modal or overlay
- **Draft_Banner**: A persistent informational bar rendered below the health strip on the deck detail page for Draft_Decks
- **Brew_Session**: The existing database record tracking a deck-building conversation (from the Brew Mode spec), linked to a Draft_Deck via `deck_id` foreign key
- **Dashboard**: The home page at `/` displaying deck tiles in a grid layout

## Requirements

### Requirement 1: Deck Status Data Model

**User Story:** As a developer, I want a `status` column on the `decks` table distinguishing draft from active decks, so that the system can enforce different lifecycle rules for each type.

#### Acceptance Criteria

1. THE `decks` table SHALL include a `status` column of type TEXT with a CHECK constraint limiting values to `'active'` and `'draft'`
2. THE `status` column SHALL default to `'active'` for all existing and new deck records created through the standard save flow
3. WHEN a Brew_Session creates a deck record before finalisation, THE system SHALL set the deck's status to `'draft'`
4. WHEN a Draft_Deck is finalised (Brew_Session save completes), THE system SHALL update the deck's status from `'draft'` to `'active'`
5. THE `brew_sessions` table foreign key on `deck_id` SHALL use `ON DELETE CASCADE` so that deleting a Draft_Deck automatically removes its associated Brew_Session records

### Requirement 2: Draft Tile Visual Distinction

**User Story:** As a user browsing my dashboard, I want draft decks to be visually distinct from active decks, so that I can immediately tell which decks are in-progress versus finalised.

#### Acceptance Criteria

1. WHEN a deck has `status = 'draft'`, THE Draft_Tile SHALL render with a dashed border using style `border: 0.5px dashed rgba(55,138,221,0.3)`
2. WHEN a deck has `status = 'draft'`, THE Draft_Tile SHALL display a blue "Draft" badge in place of the card count
3. WHEN a deck has `status = 'draft'` and fewer than 100 cards, THE Draft_Tile SHALL NOT display health pips
4. WHEN a deck has `status = 'active'`, THE Deck_Tile SHALL render with standard styling (solid border, card count, health pips)

### Requirement 3: Draft Tile Hover Actions

**User Story:** As a user, I want draft tiles to show "Continue brewing" and "Delete draft" on hover, so that I can quickly resume or discard a draft without navigating away from the dashboard.

#### Acceptance Criteria

1. WHEN the user hovers over a Draft_Tile, THE Draft_Tile SHALL reveal two action buttons: "Continue brewing" and "Delete draft"
2. WHEN the user activates "Continue brewing", THE system SHALL navigate to OracleChat in brew mode and restore the associated Brew_Session context if available
3. WHEN the user activates "Delete draft", THE Draft_Tile SHALL transition to the Inline_Confirmation state
4. THE Draft_Tile hover actions SHALL replace the standard active-deck hover actions ("Post-game" and "Open") for draft decks

### Requirement 4: Inline Delete Confirmation on Tile

**User Story:** As a user, I want delete confirmation to appear within the tile itself without opening a modal, so that the interaction stays lightweight and contextual.

#### Acceptance Criteria

1. WHEN the user activates "Delete draft" on a Draft_Tile, THE Draft_Tile face SHALL replace its content with confirmation text: `Delete "[Deck Name]"?` followed by `This will permanently remove the draft.` and two action buttons: "Cancel" and "Delete"
2. THE Inline_Confirmation content SHALL remain within the tile's bounding box without creating a modal, overlay, or tooltip outside the tile
3. THE "Delete" button SHALL be styled with destructive colouring: background `rgba(226,75,74,0.15)`, border `rgba(226,75,74,0.3)`, text colour `#E24B4A`
4. WHEN the user activates "Cancel", THE Draft_Tile SHALL restore its normal hover state
5. WHEN the user activates "Delete", THE system SHALL delete the Draft_Deck record from the `decks` table, remove the tile from the dashboard, and not trigger any Notion or Archidekt push
6. THE confirmation text SHALL use the deck's actual name (e.g., `Delete "Nekusar Wheels"?`) — not a generic label

### Requirement 5: Active Deck Deletion Guard

**User Story:** As a user, I want active decks to be protected from deletion in Oracle, so that I cannot accidentally remove a deck that is managed through Archidekt.

#### Acceptance Criteria

1. THE system SHALL NOT provide a delete action on Deck_Tiles or deck detail pages for decks with `status = 'active'`
2. IF a user attempts to delete an Active_Deck through any path, THEN THE system SHALL display the message: "Active decks are managed in Archidekt. Remove it there and sync to remove it here."
3. THE delete operation at the data layer SHALL only execute against deck records where `status = 'draft'`

### Requirement 6: Draft Banner on Deck Detail Page

**User Story:** As a user viewing a draft deck's detail page, I want a persistent banner indicating the deck is a draft with quick actions, so that I always know the deck's status and can continue brewing or delete it.

#### Acceptance Criteria

1. WHEN the user navigates to a deck detail page for a Draft_Deck, THE system SHALL display a Draft_Banner below the health strip
2. THE Draft_Banner SHALL display: a warning icon (⚠), the text "Draft deck — [N] cards · Not synced to Archidekt", a "Continue brewing →" button, and a "Delete draft" button
3. THE Draft_Banner SHALL be styled with background `rgba(55,138,221,0.06)` and border `rgba(55,138,221,0.2)`
4. WHEN the user activates "Continue brewing →", THE system SHALL navigate to OracleChat in brew mode for the associated deck
5. WHEN the user activates "Delete draft" on the Draft_Banner, THE Draft_Banner SHALL transition to an Inline_Confirmation state using the same confirmation pattern as the tile — but rendered full-width within the banner bounds
6. WHEN the user confirms deletion from the Draft_Banner, THE system SHALL delete the Draft_Deck, cascade-remove the Brew_Session, and navigate the user to the dashboard

### Requirement 7: Draft Deletion Behaviour

**User Story:** As a user, I want draft deletion to be immediate, permanent, and clean — removing the deck and all associated session data without leaving orphaned records.

#### Acceptance Criteria

1. WHEN a Draft_Deck is deleted, THE system SHALL remove the deck record from the `decks` table
2. WHEN a Draft_Deck is deleted, THE database cascade SHALL automatically remove all associated `brew_sessions` records linked by `deck_id`
3. THE deletion operation SHALL be immediate and permanent — no recycle bin, no undo, no soft-delete
4. THE deletion operation SHALL NOT trigger any external sync (no Archidekt push, no Notion push)
5. WHEN deletion completes from the dashboard, THE Draft_Tile SHALL be removed from the dashboard grid without requiring a page reload
6. WHEN deletion completes from the deck detail page, THE system SHALL navigate the user to the dashboard

