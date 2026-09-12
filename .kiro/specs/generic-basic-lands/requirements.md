# Requirements Document

## Introduction

Most players don't track every basic land they own — they just know they can get one if needed. Forcing ownership tracking on basics creates friction with no benefit. This feature adds a "generic land" option: a deck slot that represents "a basic land of this type," deliberately exempted from ownership checks entirely — not owned, not unowned, just outside the system. A user-chosen art represents it wherever it renders.

Generic land slots are scoped exclusively to the six basic land types (Plains, Island, Swamp, Mountain, Forest, Wastes). This is not a general mechanism for other fungible or bulk cards — the restriction is enforced at the UI level, not just by convention. A global art preference (one per basic type) controls rendering across all decks.

## Glossary

- **Generic_Land_Slot**: A deck_cards row with `is_generic_land = TRUE` and `physical_copy_id = NULL`. Represents a basic land of a known type without referencing any physical copy or ownership record.
- **Deck_Cards**: The existing table representing card slots within a deck. Each row is a position in a deck list.
- **Card_Definition**: A stable card identity record keyed by Scryfall oracle_id. One row per logical card across all printings.
- **Physical_Copies**: The printing-group table tracking owned cards. Each row represents a distinct combination of card identity, printing, foil status, and proxy status with a quantity column.
- **Generic_Land_Preferences**: A table storing one row per basic land type (6 rows total), mapping each Card_Definition to a Scryfall printing whose art is displayed for all generic slots of that type. Global, not per-deck.
- **Basic_Land_Types**: The six card types eligible for generic land slots: Plains, Island, Swamp, Mountain, Forest, Wastes.
- **Ownership_Status**: The existing resolution logic that classifies a deck_cards row as original, proxy, or not_owned based on physical_copy_id presence and physical_copies data.
- **Ownership_Resolver**: Any code path that reads a deck_cards row and determines its ownership state for highlighting, health checks, or completeness warnings.
- **Allocation_Resolver**: The system that computes which deck holds the original copy and which use proxies (`computeAllocations`). Generic land slots are excluded from its input.
- **CSV_Import**: The Archidekt CSV export/import process that is the sole writer of real (non-proxy) physical_copies rows. Oracle never originates or edits owned quantity or printing assignment.
- **Conversion**: The act of changing a generic land slot to a specific printing (or vice versa) — toggling `is_generic_land` and `physical_copy_id` on the same deck_cards row.

## Requirements

### Requirement 1: Schema Extension for Generic Land Slots

**User Story:** As a deck builder, I want deck slots that represent a basic land type without referencing any physical copy, so that I can fill land slots without ownership tracking friction.

#### Acceptance Criteria

1. THE Deck_Cards table SHALL include a nullable `card_definition_id` column (INTEGER, REFERENCES card_definitions(id)) that identifies the logical card a slot represents when no physical_copy_id is set
2. THE Deck_Cards table SHALL include an `is_generic_land` column (BOOLEAN NOT NULL DEFAULT FALSE) that marks a slot as a generic land excluded from Allocation_Resolver processing — the Allocation_Resolver SHALL skip any Deck_Cards row where is_generic_land = TRUE when computing allocations
3. IF `is_generic_land` is TRUE on a Deck_Cards row, THEN THE system SHALL enforce that `physical_copy_id` remains NULL — any attempt to set physical_copy_id to a non-NULL value on a row where is_generic_land = TRUE SHALL be rejected with an error indicating generic lands cannot reference physical copies
4. IF `is_generic_land` is TRUE on a Deck_Cards row, THEN THE system SHALL require `card_definition_id` to reference a Card_Definition whose card_name is one of the six basic land types: Plains, Island, Swamp, Mountain, Forest, or Wastes — any other card_definition_id SHALL be rejected with an error indicating the card is not a basic land type
5. THE Generic_Land_Preferences table SHALL store exactly one row per basic land type (Plains, Island, Swamp, Mountain, Forest, Wastes — 6 rows total) with columns: `card_definition_id` (INTEGER PRIMARY KEY, REFERENCES card_definitions(id)) and `scryfall_printing_id` (TEXT NOT NULL)
6. IF a Deck_Cards row with a non-NULL physical_copy_id is updated to set is_generic_land = TRUE, THEN THE system SHALL reject the update with an error indicating the physical_copy_id must be cleared before marking a slot as a generic land

### Requirement 2: Basic Land Type Restriction

**User Story:** As a system designer, I want the generic land option restricted to the six basic land types only, so that the feature does not become a general mechanism for other cards.

#### Acceptance Criteria

1. THE system SHALL restrict Generic_Land_Slot creation to Deck_Cards rows whose card_definition_id references a Card_Definition whose card_name matches one of the six Basic_Land_Types: Plains, Island, Swamp, Mountain, Forest, Wastes (case-sensitive exact match against card_definition.card_name)
2. IF a user attempts to create a Generic_Land_Slot for a card whose card_definition.card_name is not one of the six Basic_Land_Types, THEN THE system SHALL reject the operation without creating or modifying any Deck_Cards row and return an error indicating only basic lands support generic slots
3. THE system SHALL enforce the Basic_Land_Types restriction at the UI level by not displaying the generic land option for any card whose card_definition.card_name is not one of the six Basic_Land_Types — the option SHALL be absent from the interface rather than shown in a disabled state

### Requirement 3: Ownership Exemption

**User Story:** As a deck builder, I want generic land slots to be entirely outside the ownership system, so that they never appear as "not owned" and never affect supply calculations.

#### Acceptance Criteria

1. WHEN the Ownership_Resolver encounters a Deck_Cards row with `is_generic_land = TRUE`, THE Ownership_Resolver SHALL return a 'generic' status immediately without falling through to existing original/proxy/not_owned resolution logic
2. THE 'generic' ownership status SHALL be treated as a neutral state distinct from 'not_owned' — it SHALL NOT trigger any "not owned" highlighting, health check warnings, or deck completeness alerts anywhere in the UI
3. THE system SHALL apply the `is_generic_land` check at every call site that currently resolves ownership state from physical_copy_id — including but not limited to: canvas card highlighting, deck health check queries, deck completeness warning calculations, and the `denormaliseOwnership` function in ownership-resolver.ts
4. WHILE a Deck_Cards row has `is_generic_land = TRUE`, THE system SHALL exclude that row from all Physical_Copies in-use count calculations and supply queries — generic slots do not reference a physical_copies row and SHALL NOT affect any owned card's availability or the `getCardLevelInUseCount` / `getSubgroupInUseCount` results
5. A Generic_Land_Slot SHALL NOT require any physical_copies row to exist for that basic land type — the slot functions independently of whether the user owns any copies of that land
6. WHEN `buildAllocationInput` constructs the demandMap from deck_cards, THE function SHALL exclude any row where `is_generic_land = TRUE` — generic slots do not participate in allocation resolution and SHALL NOT appear in demand calculations
7. THE existing CHECK constraint on deck_cards.ownership_status SHALL be extended to include 'generic' as a valid value, OR the ownership_status column SHALL remain NULL for generic land slots (implementation may choose either approach as long as no CHECK constraint violation occurs)

### Requirement 4: Rendering with Global Art Preference

**User Story:** As a user, I want generic land slots to display a chosen art for each basic type globally, so that generic slots render consistently across all decks.

#### Acceptance Criteria

1. WHEN a Generic_Land_Slot is rendered on the canvas or in a card list, THE system SHALL resolve the art image using the `scryfall_printing_id` from the Generic_Land_Preferences row whose `card_definition_id` matches the slot's `card_definition_id`
2. THE system SHALL display a visible badge or indicator overlay on rendered generic land slots that is not present on ownership-tracked slots, enabling users to distinguish slot type without inspecting metadata
3. WHEN the art preference for a basic land type is changed in Settings, THE system SHALL update the displayed art for every Generic_Land_Slot of that type across all open deck views without requiring a page reload or manual refresh
4. THE Generic_Land_Preferences table SHALL contain exactly six rows (one per Basic_Land_Type) once initialized — no more, no fewer
5. IF a Generic_Land_Slot is rendered and the matching Generic_Land_Preferences row has no valid `scryfall_printing_id` (row missing or printing unresolvable), THEN THE system SHALL display a placeholder image indicating no art is configured, rather than failing to render the slot
6. THE system SHALL seed the Generic_Land_Preferences table with six rows (one per Basic_Land_Type) during the migration that creates the table — each row initialized with a default `scryfall_printing_id` for that land type so that rendering never encounters an empty-preference state post-migration

### Requirement 5: Conversion Between Generic and Specific Printing

**User Story:** As a deck builder, I want to swap a generic land slot for a specific owned printing (and vice versa) without losing the deck slot, so that I can upgrade lands to tracked copies or downgrade them back to generic.

#### Acceptance Criteria

1. WHEN a user converts a Generic_Land_Slot to a specific printing, THE system SHALL atomically set `physical_copy_id` to the selected physical_copies row and set `is_generic_land` to FALSE on the same Deck_Cards row — the row identity (primary key) persists through conversion and both fields update within a single transaction
2. THE system SHALL only allow conversion from generic to specific if a physical_copies row already exists for that printing with a `card_definition_id` matching the Deck_Cards row's `card_definition_id` — the picker SHALL present only physical_copies rows (real or proxy) whose card_definition_id matches the slot's basic land type
3. IF no physical_copies row exists for the chosen printing, or the physical_copies row's card_definition_id does not match the Deck_Cards row's card_definition_id, THEN THE system SHALL reject the conversion and return an error indicating the printing is unavailable — Oracle SHALL NOT create a new physical_copies row for non-proxy cards during conversion
4. WHEN a user converts a specific printing back to a Generic_Land_Slot, THE system SHALL atomically set `is_generic_land` to TRUE, set `physical_copy_id` to NULL, and retain the existing `card_definition_id` value on the same Deck_Cards row — without modifying the previously-referenced physical_copies row's quantity or any other column on that physical_copies row
5. WHEN converting a Generic_Land_Slot to a specific printing, THE system SHALL preserve the existing values of `ownership_status` and `proxy_of_deck_id` on the Deck_Cards row — conversion does not alter ownership-resolution cache columns
6. IF a user converts a Generic_Land_Slot to a specific proxy printing (physical_copies row with is_proxy = TRUE), THEN THE system SHALL allow the conversion provided the proxy physical_copies row exists and its card_definition_id matches the slot's card_definition_id — proxy rows created within Oracle are valid conversion targets unaffected by the CSV-import-is-sole-writer rule

### Requirement 6: Settings UI for Generic Land Art

**User Story:** As a user, I want a Settings section where I can choose which printing's art represents each basic land type globally, so that I control how my generic land slots look.

#### Acceptance Criteria

1. THE Settings UI SHALL include a "Generic land art" section displaying six rows — one for each Basic_Land_Type (Plains, Island, Swamp, Mountain, Forest, Wastes)
2. WHEN a user selects a new printing for a basic land type, THE system SHALL update the corresponding Generic_Land_Preferences row's `scryfall_printing_id` with the chosen printing's identifier and display a confirmation that the preference was saved within 2 seconds
3. THE art selection interface SHALL allow searching Scryfall printings of the corresponding basic land type by set name, and SHALL display results as a scrollable list of card art thumbnails the user can select from
4. THE Settings UI SHALL display the currently selected printing's art for each basic land type as a card art thumbnail, and IF the art image fails to load, THEN THE system SHALL display a placeholder image with the land type name
5. IF a user selects a printing whose Scryfall_Printing_Id does not resolve to a valid printing of that basic land type, THEN THE system SHALL reject the selection and display an error indicating the printing is invalid without modifying the existing preference

### Requirement 7: Adding Generic Land Slots to Decks

**User Story:** As a deck builder, I want to add generic land slots to a deck without needing to own any copy of that land, so that I can fill my mana base freely.

#### Acceptance Criteria

1. WHEN a user adds a generic land slot to a deck, THE system SHALL create a Deck_Cards row with `is_generic_land = TRUE`, `card_definition_id` set to the appropriate basic land Card_Definition, `physical_copy_id = NULL`, and `ownership_status` set to NULL or 'generic' (consistent with Requirement 3 criterion 7)
2. THE system SHALL allow adding a Generic_Land_Slot regardless of whether any physical_copies row exists for that basic land type — no ownership prerequisite applies
3. WHEN multiple generic land slots of the same type are added to a deck (e.g. 30 Forests), THE system SHALL create individual Deck_Cards rows per slot OR a single row with quantity > 1, following the existing deck_cards conventions for that deck's card representation — the choice SHALL be consistent with how the deck currently represents other repeated cards
4. WHEN a generic land slot is removed from a deck, THE system SHALL delete the Deck_Cards row without affecting any other table — no physical_copies rows are modified, no Generic_Land_Preferences rows are affected
