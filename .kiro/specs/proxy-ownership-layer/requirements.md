# Requirements Document

## Introduction

The Proxy Ownership Layer denormalises card ownership status directly into the `deck_cards` table and surfaces it across the entire Oracle UI. Every card slot in every deck receives a definitive ownership classification — original, proxy, or not owned — resolved automatically on every Archidekt sync and on manual allocation actions within The Oracle. This status drives a universal visual badge system, a proactive conflict alert in the upgrade flow, a new Allocation tab on the /collection page, and bidirectional sync back to Archidekt via tag-writing.

The feature builds on the existing allocation resolver (`src/lib/allocation-resolver.ts`) and allocation store (`src/lib/allocation-store.ts`), extending them to write resolved ownership into `deck_cards` directly. It integrates with the Oracle Upgrade Engine to surface proxy conflicts inline before the user acts on a recommendation.

## Glossary

- **Ownership_Resolver**: The orchestration layer that invokes the existing `computeAllocations()` function and writes the resolved `ownership_status` and `proxy_of_deck_id` values into `deck_cards` rows
- **Ownership_Status**: A per-card-per-deck classification stored in `deck_cards.ownership_status` — one of `'original'`, `'proxy'`, or `'not_owned'`
- **Proxy_Of_Deck_ID**: A nullable foreign key on `deck_cards` indicating which deck holds the physical original when the current row is a proxy
- **Ownership_Badge**: A visual indicator rendered on every card surface in the UI, combining a shape glyph, colour, and accessible label to communicate ownership status
- **Conflict_Alert**: An inline warning rendered on a recommendation card in the upgrade panel when acting on that recommendation would create or worsen a proxy conflict
- **Allocation_Tab**: The second tab on the /collection page showing a cross-deck ownership table for cards appearing in two or more decks
- **Archidekt_Tag_Writer**: The component that writes ownership status back to Archidekt as card tags, enabling bidirectional awareness between The Oracle and Archidekt
- **Sync_Cycle**: A full Archidekt deck import followed by allocation resolution, ownership denormalisation, and tag write-back

## Requirements

### Requirement 1: Schema Denormalisation

**User Story:** As the Ownership_Resolver, I want ownership status stored directly on each `deck_cards` row, so that any query or component can read ownership without joining against the `deck_allocations` table.

#### Acceptance Criteria

1. THE Collection_Store SHALL add an `ownership_status` column to the `deck_cards` table with type TEXT and allowed values `'original'`, `'proxy'`, or `'not_owned'`
2. THE Collection_Store SHALL add a `proxy_of_deck_id` column to the `deck_cards` table with type INTEGER, nullable, referencing `decks(id)`
3. WHEN `ownership_status` is `'original'`, THE `proxy_of_deck_id` column SHALL be NULL
4. WHEN `ownership_status` is `'proxy'`, THE `proxy_of_deck_id` column SHALL contain the deck ID that holds the physical original of that card
5. WHEN `ownership_status` is `'not_owned'`, THE `proxy_of_deck_id` column SHALL be NULL
6. THE system SHALL include a numbered migration file that adds both columns with appropriate defaults and constraints

### Requirement 2: Resolver Trigger on Archidekt Sync

**User Story:** As a deck builder, I want ownership resolved automatically every time I sync from Archidekt, so that ownership status stays current without manual intervention.

#### Acceptance Criteria

1. WHEN an Archidekt sync cycle completes delta detection for any deck, THE Ownership_Resolver SHALL execute the allocation resolver immediately after the delta is applied to the local database
2. THE Ownership_Resolver SHALL write the resolved `ownership_status` and `proxy_of_deck_id` to all affected `deck_cards` rows within the same database transaction as the delta application
3. WHEN the allocation resolver output contains a record with role `'original'`, THE Ownership_Resolver SHALL set the corresponding `deck_cards` row to `ownership_status = 'original'` and `proxy_of_deck_id = NULL`
4. WHEN the allocation resolver output contains a record with role `'proxy'`, THE Ownership_Resolver SHALL set the corresponding `deck_cards` row to `ownership_status = 'proxy'` and `proxy_of_deck_id` equal to the deck ID that received the original allocation for that card
5. WHEN a card in `deck_cards` has no matching record in the collection table, THE Ownership_Resolver SHALL set `ownership_status = 'not_owned'` and `proxy_of_deck_id = NULL`
6. THE Ownership_Resolver SHALL process all decks affected by the sync, not only the deck that was directly synced

### Requirement 3: Pipeline Ordering Guarantee

**User Story:** As a deck builder, I want recommendations and Notion pushes to reflect current ownership, so that downstream features operate on resolved allocation data.

#### Acceptance Criteria

1. THE Sync_Engine SHALL complete allocation resolution and ownership denormalisation before triggering any recommendation generation for affected decks
2. THE Sync_Engine SHALL complete allocation resolution and ownership denormalisation before pushing deck data to Notion for affected decks
3. IF the Ownership_Resolver fails during a sync cycle, THEN THE Sync_Engine SHALL halt downstream processing for the affected decks and log the failure with the deck ID and error detail

### Requirement 4: Resolver Trigger on Manual Actions

**User Story:** As a deck builder, I want ownership recalculated when I manually reassign originals or move cards within The Oracle, so that manual actions have immediate effect.

#### Acceptance Criteria

1. WHEN the user submits a manual override via the allocation API, THE Ownership_Resolver SHALL rerun the allocation resolver for all cards affected by the override and update `deck_cards` accordingly
2. WHEN the user reassigns which deck holds the original for a specific card, THE Ownership_Resolver SHALL update both the source deck row (setting it to proxy) and the target deck row (setting it to original) within a single transaction
3. WHEN a manual override changes the allocation for a shared card, THE Ownership_Resolver SHALL cascade the change to all decks containing that card name

### Requirement 5: Ownership Badge Display

**User Story:** As a deck builder, I want a visual badge on every card surface showing its ownership status, so that I can see at a glance which cards are originals, which are proxies, and which are not owned.

#### Acceptance Criteria

1. THE Ownership_Badge SHALL render on every card surface where cards appear in the UI, including the deck list table, card grid, upgrade panel recommendation cards, and allocation tab
2. WHEN `ownership_status` is `'original'`, THE Ownership_Badge SHALL display a filled circle glyph (●) in teal colour with the accessible label "Original"
3. WHEN `ownership_status` is `'proxy'`, THE Ownership_Badge SHALL display a half-filled circle glyph (◐) in amber colour with the accessible label "Proxy"
4. WHEN `ownership_status` is `'not_owned'`, THE Ownership_Badge SHALL display an empty circle glyph (○) in gray colour with the accessible label "Not owned"
5. THE Ownership_Badge SHALL include the text label alongside the glyph, so that the badge does not rely on colour alone to convey meaning (WCAG 1.4.1 Use of Color)
6. THE Ownership_Badge SHALL use `aria-label` or visible text to communicate the ownership status to assistive technologies (WCAG 4.1.2 Name, Role, Value)

### Requirement 6: Conflict Alert in Upgrade Flow

**User Story:** As a deck builder, I want to see a warning when an upgrade recommendation would cause a proxy conflict, so that I can make informed swap decisions before committing.

#### Acceptance Criteria

1. WHEN the upgrade panel loads recommendation cards, THE system SHALL evaluate each recommendation for proxy conflict potential by checking whether the suggested card already appears in another deck as an original
2. WHEN a recommendation would require moving a card's original from another deck (creating a new proxy elsewhere), THE Conflict_Alert SHALL render inline on that recommendation card with a message identifying the affected deck
3. WHEN a recommendation suggests adding a card that the user does not own, THE system SHALL not display a Conflict_Alert (no conflict exists for unowned suggestions)
4. THE Conflict_Alert SHALL render proactively when the upgrade panel loads, without requiring user interaction to reveal the warning
5. THE Conflict_Alert SHALL include the name of the deck that currently holds the original, so the user understands the trade-off

### Requirement 7: Allocation Tab on Collection Page

**User Story:** As a deck builder, I want a dedicated view showing all cards that appear in multiple decks with their ownership allocation, so that I can see the full cross-deck picture in one place.

#### Acceptance Criteria

1. THE /collection page SHALL present two tabs: "Collection" (existing card grid) and "Allocation" (cross-deck ownership table)
2. THE Allocation_Tab SHALL display all cards that appear in two or more decks, sourced from `deck_cards` grouped by `card_name`
3. THE Allocation_Tab SHALL show, for each card row, the card name, all decks containing that card, and the ownership status per deck (using the Ownership_Badge)
4. THE Allocation_Tab SHALL provide a deck filter allowing the user to narrow the view to cards associated with a specific deck
5. WHEN the deck filter is applied, THE Allocation_Tab SHALL show only cards that appear in the selected deck and at least one other deck
6. THE Allocation_Tab SHALL fetch data using TanStack Query with a query key of `['allocation']` and `staleTime: 5 * 60 * 1000`

### Requirement 8: Manual Override to Reassign Originals

**User Story:** As a deck builder, I want to manually choose which deck holds the original for a specific card, so that the system respects my preference when the default priority is not what I want.

#### Acceptance Criteria

1. THE Allocation_Tab SHALL provide an action on each card-deck pair allowing the user to reassign which deck holds the original
2. WHEN the user reassigns an original, THE system SHALL call the allocation API with a `pin_original` override for the target deck and rerun the Ownership_Resolver for all decks containing that card
3. WHEN a reassignment is submitted, THE system SHALL update the UI optimistically and confirm the change with a success indicator
4. IF the reassignment fails, THEN THE system SHALL revert the optimistic update and display an error message

### Requirement 9: Bidirectional Sync to Archidekt

**User Story:** As a deck builder, I want ownership changes in The Oracle to cascade back to Archidekt as tags, so that Archidekt reflects the same proxy/original status without manual tag management.

#### Acceptance Criteria

1. WHEN the Ownership_Resolver writes a new or changed `ownership_status` to a `deck_cards` row, THE Archidekt_Tag_Writer SHALL queue a tag write-back for that card in the affected deck
2. THE Archidekt_Tag_Writer SHALL write the tag `"Proxy"` to cards with `ownership_status = 'proxy'` on Archidekt
3. THE Archidekt_Tag_Writer SHALL remove the `"Proxy"` tag from cards with `ownership_status = 'original'` on Archidekt where the tag previously existed
4. THE Archidekt_Tag_Writer SHALL not write any tag for cards with `ownership_status = 'not_owned'`
5. WHEN reading deck state from Archidekt during a sync cycle, THE Sync_Engine SHALL interpret existing `"Proxy"` tags as manual user intent equivalent to a `pin_proxy` override
6. IF the Archidekt_Tag_Writer fails to write a tag for a specific card, THEN THE system SHALL mark the write as pending in `deck_allocations.written_to_archidekt = 0` and retry on the next sync cycle
