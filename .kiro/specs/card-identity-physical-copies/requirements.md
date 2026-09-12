# Requirements Document

## Introduction

This feature introduces a two-layer data model for card identity and physical copy tracking. The current schema treats card ownership as aggregate quantities (`collection.quantity`) with no concept of individual physical objects. This works for fungible bulk but breaks down when a card needs to be referred to individually — because it is a proxy, a foil, a distinguishable printing, or otherwise binder-tracked. The Card Identity & Physical Copy Model adds stable card identity (`card_definitions`) and printing-group-level tracking (`physical_copies`) without disturbing the existing aggregate ownership layer.

**Addendum (v2):** The `physical_copies` table is redefined as a **printing group** table — one row per distinct combination of `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)` — with a `quantity` column tracking how many physical cards match that group. This replaces the original per-object model. Deck assignment via `deck_cards.physical_copy_id` becomes many-to-one (multiple deck slots can reference the same printing group row). Availability is computed, not enforced by uniqueness constraints.

## Glossary

- **Card_Definition**: A stable card identity record keyed by Scryfall oracle_id. Represents a single logical card across all printings (e.g. "Forest" regardless of art or set).
- **Physical_Copy**: A printing-group row representing one or more identical physical cards. Each row corresponds to a distinct combination of card identity, printing, foil status, and proxy status. The `quantity` column tracks how many physical cards exist in this group.
- **Printing_Group**: The unique combination of `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)` that defines a single physical_copies row. Multiple identical cards collapse into one row with quantity > 1.
- **Deck_Cards**: The existing table representing card slots within a deck. Each row is a position in a deck list.
- **Collection**: The existing table tracking aggregate owned quantities of cards. Remains the source of truth for fungible bulk.
- **Proxy_Allocations**: The existing resolver output ledger tracking which decks hold originals vs proxies.
- **Allocation_Resolver**: The existing system that determines which deck holds the original copy and which decks use proxies.
- **Scryfall_Oracle_Id**: A Scryfall-issued UUID that identifies a card across all printings (same name, same oracle text).
- **Scryfall_Printing_Id**: A Scryfall-issued UUID that identifies a specific printing of a card (set + collector number + art).
- **Fungible_Bulk**: Cards that never need individual identification (generic basics, commons not individually tracked).
- **Governing_Rule**: A card gets a Physical_Copy row for every distinct printing group it belongs to. All owned cards that have been explicitly registered (via collection import or manual entry) receive rows — one per distinct printing group.
- **In_Use_Count**: A computed value representing the number of deck_cards rows referencing a given physical_copies row or card_definition. Never stored; always derived via COUNT query.
- **Attention_State**: A UI display condition where card-level in-use count exceeds owned quantity. This is expected correct behaviour (proxy usage pushes usage over owned count) — not an error.
- **Migration_System**: The existing sequential SQL migration mechanism (`db/migrations/NNN-*.sql`).

## Requirements

### Requirement 1: Card Definition Storage

**User Story:** As a deck manager, I want stable card identity records independent of printing, so that I can reference a logical card (e.g. "Forest") without coupling to a specific set or art.

#### Acceptance Criteria

1. THE Card_Definition table SHALL store a unique row per Scryfall_Oracle_Id (stored as TEXT(36) in UUID format) with a denormalized card_name (maximum 256 characters) for display and search
2. WHEN a card is first encountered during deck sync, collection sync, or Physical_Copy creation, THE system SHALL create a Card_Definition row with the card's Scryfall_Oracle_Id and card_name if no matching row exists
3. IF a duplicate Scryfall_Oracle_Id is inserted, THEN THE Card_Definition table SHALL reject the insertion with a unique constraint violation
4. THE Card_Definition table SHALL use an integer primary key for efficient joins with Physical_Copy records

### Requirement 2: Physical Copy Tracking (Printing Group Model)

**User Story:** As a collection owner, I want to record groups of identical physical cards (same printing, same foil/proxy status), so that I can track owned quantities per printing group and compute availability across decks.

**CHANGED (v2):** physical_copies is now a printing-group table with a `quantity` column. One row per distinct combo of `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)`, NOT one row per individual card.

#### Acceptance Criteria

1. THE Physical_Copy table SHALL store printing-group rows with a mandatory (NOT NULL) card_definition_id foreign key referencing Card_Definition, and a quantity column (INTEGER NOT NULL DEFAULT 1) representing how many physical cards exist in that group
2. WHEN a Physical_Copy row is created or updated via collection import, THE system SHALL use an upsert keyed on the UNIQUE INDEX `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)` — incrementing quantity for duplicates rather than creating separate rows
3. THE Physical_Copy table SHALL record whether the cards in the group are proxies via an is_proxy boolean flag defaulting to FALSE
4. IF a Physical_Copy has is_proxy = TRUE, THEN THE Physical_Copy table SHALL accept an optional proxy_for_definition_id referencing the Card_Definition the proxy represents
5. THE Physical_Copy table SHALL accept an optional condition field constrained to the values: 'near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged'
6. THE Physical_Copy table SHALL accept optional is_foil (boolean, default FALSE) and acquired_at (ISO 8601 date) metadata fields
7. THE Physical_Copy table SHALL allow creation of records with no deck assignment (no deck_id dependency)
8. IF the Card_Definition referenced by proxy_for_definition_id is deleted, THEN THE Physical_Copy table SHALL set proxy_for_definition_id to NULL (ON DELETE SET NULL)
9. WHEN importing 10 copies of a card across 6 distinct printings, THE system SHALL produce exactly 6 physical_copies rows with quantities summing to 10 (one row per distinct printing group)
10. THE Physical_Copy table SHALL enforce a UNIQUE INDEX on `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)` to guarantee one row per printing group

### Requirement 3: Unassigned Proxy Creation

**User Story:** As a deck builder, I want to create a proxy that exists independently of any deck, so that I can print proxies speculatively or for testing before committing them to a deck.

**CHANGED (v2):** Proxy rows collapse to one row per card_definition_id with is_proxy = TRUE and scryfall_printing_id = NULL. Quantity tracks how many proxy copies exist.

#### Acceptance Criteria

1. WHEN a proxy is created, THE Physical_Copy table SHALL store or update a record with is_proxy = TRUE, scryfall_printing_id = NULL, a valid card_definition_id, and quantity reflecting the total proxy count for that card
2. WHILE a Physical_Copy record with is_proxy = TRUE has no Deck_Cards rows referencing its id, THE system SHALL include that record in proxy list query results and SHALL NOT delete or invalidate it
3. WHEN an unassigned proxy group is linked to a deck slot, THE Deck_Cards row SHALL set its physical_copy_id to the Physical_Copy's id
4. IF the target Deck_Cards row already has a non-NULL physical_copy_id, THEN THE system SHALL replace the existing reference with the new Physical_Copy id
5. THE system SHALL allow multiple Deck_Cards rows to reference the same Physical_Copy record (many-to-one linkage)
6. FOR ALL proxy Physical_Copy rows, THE scryfall_printing_id column SHALL be NULL — proxies always collapse to one row per card_definition_id regardless of which printing they represent

### Requirement 4: Special Printing Registration

**User Story:** As a collector, I want to record special-printing basic lands (and other distinguishable printings) as individual groups, so that I can track them in my binder regardless of deck assignment.

**CHANGED (v2):** Multiple copies of the same printing increment quantity on the existing row rather than creating separate rows.

#### Acceptance Criteria

1. WHEN a special printing is registered, THE Physical_Copy table SHALL store or update a record with is_proxy = FALSE, the Scryfall_Printing_Id identifying the exact printing, and a card_definition_id referencing the corresponding Card_Definition
2. THE Physical_Copy record for a special printing SHALL exist independently of any deck assignment (physical_copy_id is not constrained by a deck_cards reference)
3. WHEN multiple physical copies of the same printing and same foil status are added, THE system SHALL increment the quantity on the existing Physical_Copy row rather than creating additional rows (upsert on the unique index)
4. IF a special printing is registered with a Scryfall_Printing_Id that does not resolve to a valid Scryfall printing, THEN THE system SHALL reject the registration and return an error indicating the printing identifier is invalid

### Requirement 5: Deck Card Linkage

**User Story:** As a deck builder, I want to optionally link a deck card slot to a specific Physical_Copy printing group, so that I can track which printing fills each slot.

**CHANGED (v2):** The UNIQUE constraint on `deck_cards.physical_copy_id` is DROPPED. Multiple deck_cards rows (across decks or within the same deck) can reference the same physical_copies row. Availability is computed, not enforced by database uniqueness.

#### Acceptance Criteria

1. THE Deck_Cards table SHALL include a nullable physical_copy_id column referencing Physical_Copy records
2. WHEN a card is added to a deck without an associated Physical_Copy, THE Deck_Cards row SHALL have physical_copy_id = NULL
3. WHEN a Physical_Copy is deleted, THE Deck_Cards physical_copy_id reference SHALL be set to NULL (ON DELETE SET NULL)
4. WHEN a Physical_Copy is linked to a Deck_Cards row, THE Deck_Cards row SHALL retain the existing values of ownership_status and proxy_of_deck_id without modification
5. THE Deck_Cards table SHALL allow multiple rows to reference the same physical_copy_id value (NO unique constraint on physical_copy_id) — enabling many-to-one linkage from deck slots to printing groups
6. IF a Physical_Copy is linked to a Deck_Cards row whose card does not match the Physical_Copy's card_definition_id, THEN THE system SHALL reject the linkage
7. WHEN a physical_copy_id is set to NULL on an existing Deck_Cards row without deleting the Physical_Copy, THE Physical_Copy record SHALL continue to exist independently
8. WHEN a Physical_Copy is assigned to a deck slot, THE Physical_Copy quantity column SHALL NOT be decremented — quantity reflects total owned/proxied count independent of deck assignment

### Requirement 6: Backward Compatibility

**User Story:** As an existing user, I want all current views and queries to continue working after migration, so that existing proxy and shared-card workflows are unaffected.

#### Acceptance Criteria

1. THE shared_cards view (querying proxy_allocations) SHALL continue returning identical results after the migration
2. THE Proxy_Allocations table SHALL remain unchanged (no schema modifications, no new columns, no altered constraints)
3. THE Collection table quantity column SHALL remain the source of truth for fungible bulk cards — no rows added to or removed from collection as part of this migration
4. WHEN a query reads deck_cards.ownership_status or proxy_of_deck_id, THE query SHALL return the same values as before migration (columns preserved as read-cache)
5. THE Allocation_Resolver (computeAllocations) SHALL continue functioning without modification — no changes to its input, output, or logic

### Requirement 7: Migration and Backfill

**User Story:** As a system administrator, I want the migration to be safe, additive, and reversible, so that existing data integrity is maintained during rollout.

**CHANGED (v2):** Migration now also adds the `quantity` column and the unique index on the printing group key. The UNIQUE constraint on `deck_cards.physical_copy_id` is dropped.

#### Acceptance Criteria

1. THE Migration_System SHALL create the card_definitions table and backfill one row per distinct Scryfall_Oracle_Id found across the deck_cards and collection tables, populating card_name from the source row
2. THE Migration_System SHALL create the physical_copies table with a `quantity INTEGER NOT NULL DEFAULT 1` column and no bulk backfill — only deck_cards rows with ownership_status = 'proxy' and Physical_Copy records explicitly registered via the special-printing workflow receive rows
3. THE Migration_System SHALL alter deck_cards to add a nullable physical_copy_id column with a foreign key referencing physical_copies(id) and ON DELETE SET NULL behavior, with NO unique constraint on physical_copy_id
4. WHEN a deck_cards row has ownership_status = 'proxy', THE Migration_System SHALL create a Physical_Copy row with is_proxy = TRUE, card_definition_id referencing the matching Card_Definition, and proxy_for_definition_id set to the Card_Definition of the proxied card, then set deck_cards.physical_copy_id to the new row's id
5. THE Migration_System SHALL preserve ownership_status and proxy_of_deck_id columns as read-cache (no removal) with existing CHECK constraints and foreign key references unchanged
6. IF the migration encounters an error, THEN THE Migration_System SHALL roll back all changes within the same transaction, leaving the schema and data in their pre-migration state
7. THE Migration_System SHALL support a corresponding down-migration script that drops the physical_copies and card_definitions tables and removes the physical_copy_id column from deck_cards, restoring the schema to its prior state
8. THE Migration_System SHALL create the UNIQUE INDEX `idx_physical_copies_group` ON physical_copies(card_definition_id, scryfall_printing_id, is_foil, is_proxy) to enforce the printing-group upsert key

### Requirement 8: Aggregate Ownership Preservation (Printing Group Governing Rule)

**User Story:** As a collection manager, I want all owned cards to be tracked as printing groups with quantities, so that collection import produces one row per distinct printing and availability is always computable.

**CHANGED (v2):** The Governing Rule no longer prevents creation of "undistinguished" physical_copies. ALL owned cards get physical_copies rows — one per printing group — during collection import. The previous rejection logic (is_proxy=FALSE, is_foil=FALSE, printing_id=NULL → reject) is REMOVED. The governing rule now simply means: every registered card has a printing-group row.

#### Acceptance Criteria

1. THE Collection table quantity column SHALL remain unmodified — physical_copies tracks per-printing-group quantities independently of collection.quantity
2. WHEN a collection import processes a card, THE system SHALL create or update a physical_copies row for the card's printing group using the upsert key (card_definition_id, scryfall_printing_id, is_foil, is_proxy), setting quantity to the imported count
3. THE system SHALL allow creation of Physical_Copy rows with is_proxy = FALSE, is_foil = FALSE, and scryfall_printing_id set to the card's actual printing UUID — the previous Governing_Rule rejection for "undistinguished" cards is removed
4. WHEN a previously unregistered card is imported from a collection export, THE system SHALL create a Physical_Copy row linked to the corresponding Card_Definition with the printing's Scryfall_Printing_Id and the imported quantity

### Requirement 9: Computed In-Use Overlay

**User Story:** As a collection manager, I want to see how many copies of each card are currently assigned to decks, so that I can identify which cards are available and which are over-committed.

#### Acceptance Criteria

1. THE system SHALL compute card-level in-use count as: `SELECT COUNT(deck_cards.id) FROM deck_cards JOIN physical_copies ON deck_cards.physical_copy_id = physical_copies.id WHERE physical_copies.card_definition_id = :card_definition_id`
2. THE system SHALL compute printing-subgroup-level in-use count as: `SELECT COUNT(deck_cards.id) FROM deck_cards WHERE deck_cards.physical_copy_id = :physical_copy_id`
3. WHEN a card-level in-use count exceeds the total owned quantity (sum of non-proxy physical_copies.quantity), THE system SHALL display the result as an Attention_State ("X of Y" where X > Y) — this is expected correct behaviour, not an error
4. THE printing-subgroup in-use count SHALL NOT exceed that row's own quantity under normal operation — subgroup in-use counts sum to the card-level in-use count
5. WHEN the Collection screen displays a card-level rollup, THE system SHALL query: owned_quantity as `SUM(CASE WHEN pc.is_proxy = 0 THEN pc.quantity ELSE 0 END)` and in_use_count as `(SELECT COUNT(*) FROM deck_cards dc JOIN physical_copies pc2 ON dc.physical_copy_id = pc2.id WHERE pc2.card_definition_id = cd.id)` grouped by card_definition
6. WHEN expanding a card-level row to show printing subgroups, THE system SHALL display each printing group's own quantity and its own in-use count, and the subgroup in-use counts SHALL sum to the card-level in-use count
7. THE in-use count SHALL never be stored as a column — it is always computed at query time via COUNT of referencing deck_cards rows

### Requirement 10: Collection Screen Proxy Separation

**User Story:** As a collection manager, I want proxies shown in a separate tab from owned cards, so that the default Collection view shows only real owned inventory.

#### Acceptance Criteria

1. WHEN the Collection screen queries card data for the default view, THE system SHALL filter with `WHERE pc.is_proxy = 0` to exclude all proxy rows from the owned collection display
2. THE system SHALL provide a separate Proxies tab that displays only Physical_Copy rows where is_proxy = TRUE, grouped by card_definition with quantity and in-use counts
3. WHEN a proxy row is created or updated, THE proxy row SHALL NOT appear in the default Collection view — only in the Proxies tab
4. THE Collection screen default view SHALL show only real owned cards with their printing subgroups, owned quantities, and computed in-use counts
5. WHEN basic lands are displayed in the Collection screen, THE system SHALL aggregate them by default (showing total quantity across all printings) with an expandable detail view showing individual printing groups — this is a UI display default only, with no schema difference from other cards

## Change Log (v2 Addendum)

| Requirement | What Changed |
|-------------|-------------|
| 2 (Physical Copy Tracking) | Redefined as printing-group model with quantity column and unique index on group key |
| 3 (Proxy Creation) | Proxies collapse to one row per card_definition_id (scryfall_printing_id always NULL for proxies) |
| 4 (Special Printing) | Same-printing duplicates increment quantity instead of creating separate rows |
| 5 (Deck Card Linkage) | UNIQUE constraint on physical_copy_id DROPPED — many-to-one linkage allowed; quantity never decremented |
| 7 (Migration) | Added quantity column ALTER, unique index creation, removed UNIQUE on deck_cards.physical_copy_id |
| 8 (Governing Rule) | Removed rejection of "undistinguished" cards — all imported cards get printing-group rows |
| 9 (NEW) | Computed In-Use Overlay — card-level and subgroup-level in-use counts, attention state |
| 10 (NEW) | Collection Screen Proxy Separation — default view excludes proxies; separate Proxies tab |

## Compatibility Notes (Existing Tasks 1-3, 6)

The migration SQL (task 1), store module (task 2), and tests (task 3/6) were built against the original per-object model. The following adjustments are needed:

1. **Migration (task 1.1):** Needs a follow-up migration adding the `quantity` column and unique index, and dropping the UNIQUE constraint on `deck_cards.physical_copy_id`
2. **Store module (task 2):** `createPhysicalCopy` needs upsert semantics; `linkPhysicalCopyToDeckCard` no longer enforces uniqueness; Governing Rule rejection logic is removed
3. **Property tests (task 4):** Property 7 (uniqueness across deck slots) is now INVALID — remove or replace. Property 13 (Governing Rule rejection) is now INVALID — remove or replace with printing-group upsert test
4. **Unit tests (task 5):** Tests asserting UNIQUE constraint on physical_copy_id need updating; tests asserting Governing Rule rejection need removal
