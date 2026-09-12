# Requirements Document

> **Implementation status notice (2026-09-03):** This document describes the superseded printing-group/quantity design and must not be treated as the current import contract. The live schema uses `user_cards` + instance-level `user_copies`, and the live replace/sync implementation does not satisfy the non-destructive, allocation-preserving guarantees below. Current migration decision and remediation requirements are in `docs/audits/collection-migration-readiness-2026-09-03.md` and TD-026/TD-030/TD-034.

## Introduction

This feature replaces the current destructive collection import (DELETE + INSERT on every run) with an upsert-based import against the `physical_copies` table, matched by printing identity. The current approach risks orphaning `deck_cards.physical_copy_id` references and losing per-printing state (proxy, foil, condition) that a wholesale replace cannot reconstruct.

The import process reads an Archidekt CSV export and reconciles it against existing `physical_copies` rows — creating new rows for new printings, updating quantity/condition for changed rows, and soft-deleting (quantity = 0) rows that no longer appear. No row is ever hard-deleted. The CSV is the sole writer of real (non-proxy) `physical_copies` rows, per the rule established in the generic-basic-lands spec.

**Dependencies:** card_definitions table, physical_copies table (printing-group model from card-identity-physical-copies spec), the CSV-import-is-sole-writer rule (generic-basic-lands spec), and the collection-deck isolation property (deck-authority-split spec Property 6).

## Glossary

- **Import_Engine**: The server-side module that parses the Archidekt CSV export, resolves printing identities, and executes upsert logic against the physical_copies table.
- **Physical_Copies**: The printing-group table from the card-identity-physical-copies spec. One row per distinct combination of `(card_definition_id, scryfall_printing_id, is_foil, is_proxy)` with a quantity column.
- **Card_Definition**: A stable card identity record keyed by Scryfall oracle_id. One row per logical card across all printings.
- **Scryfall_Printing_Id**: A Scryfall-issued UUID identifying a specific printing of a card (set + collector number + art). Present as `Scryfall ID` in the CSV export.
- **Scryfall_Oracle_Id**: A Scryfall-issued UUID identifying a card across all printings (same name, same oracle text). Present as `Scryfall Oracle ID` in the CSV export.
- **Matching_Key**: The identity tuple used to locate an existing physical_copies row for a CSV row. Primary: scryfall_printing_id. Fallback: (set_code, collector_number) resolved to a printing ID.
- **Soft_Delete**: Setting `physical_copies.quantity = 0` on a row rather than deleting it, preserving referential integrity with deck_cards.
- **Unmatched_Row**: A CSV row that cannot be resolved to a confident scryfall_printing_id via either the primary key or fallback mechanism.
- **Sole_Writer_Rule**: The invariant that no code path other than the CSV import process creates or modifies real (is_proxy = FALSE) physical_copies rows. Proxy rows are managed by Oracle independently.
- **Game_Column**: A TEXT column on physical_copies indicating the card's game context ('paper', 'mtgo', 'arena'), defaulting to 'paper'.
- **Batch_Lookup**: Resolving oracle_id for multiple scryfall_printing_ids in a single operation using Scryfall's bulk data, rather than per-card API calls.
- **Import_Summary**: The structured result returned after an import operation, containing counts of created, updated, unchanged, soft-deleted, and unmatched rows.
- **Deck_Cards**: The existing table representing card slots within a deck. Each row references physical_copies via physical_copy_id.

## Requirements

### Requirement 1: Printing Identity Resolution

**User Story:** As a collection manager, I want the import process to resolve each CSV row to a specific scryfall_printing_id, so that rows can be accurately matched against existing physical_copies records.

#### Acceptance Criteria

1. WHEN a CSV row contains a non-empty `Scryfall ID` column value that matches a printing in the Scryfall bulk data, THE Import_Engine SHALL use that value directly as the scryfall_printing_id for matching without further resolution
2. IF a CSV row contains a non-empty `Scryfall ID` column value that does not match any printing in the Scryfall bulk data, THEN THE Import_Engine SHALL attempt fallback resolution using the row's `Edition Code` and `Collector Number` before classifying the row as unmatched
3. WHEN a CSV row has an empty or missing `Scryfall ID` column and both the `Edition Code` and `Collector Number` columns are non-empty, THE Import_Engine SHALL attempt to resolve a scryfall_printing_id using that combination against Scryfall bulk data, selecting the first match if multiple printings share the same set code and collector number
4. IF neither the `Scryfall ID` column nor the (Edition Code, Collector Number) fallback resolves to a scryfall_printing_id present in the Scryfall bulk data, THEN THE Import_Engine SHALL add the row to the unmatched list and SHALL NOT create or modify any physical_copies row for that entry
5. THE Import_Engine SHALL surface all unmatched rows to the user in the Import_Summary with the original CSV row data (card name, edition code, collector number) and the resolution failure reason (invalid Scryfall ID, missing fallback fields, or no bulk data match for set code and collector number) so the user can manually resolve the entries

### Requirement 2: Oracle ID Resolution and Card Definition Linkage

**User Story:** As a collection manager, I want newly encountered printings to be linked to the correct card_definitions row, so that all printings of the same logical card (e.g. all Forests) collapse under a single card identity.

#### Acceptance Criteria

1. WHEN the Import_Engine encounters a scryfall_printing_id that already has a physical_copies row, THE Import_Engine SHALL skip oracle_id resolution for that printing and use the existing card_definition_id linkage
2. WHEN the Import_Engine encounters a scryfall_printing_id not present in any existing physical_copies row, THE Import_Engine SHALL resolve the oracle_id by first reading the CSV row's `Scryfall Oracle ID` column, and IF that column is empty or missing, THE Import_Engine SHALL resolve the oracle_id via Scryfall bulk data Batch_Lookup using the scryfall_printing_id as the lookup key
3. WHEN the resolved oracle_id corresponds to an existing card_definitions row, THE Import_Engine SHALL link the new physical_copies row to that existing Card_Definition
4. WHEN the resolved oracle_id does not correspond to any existing card_definitions row, THE Import_Engine SHALL create a new Card_Definition row using the resolved oracle_id and the card_name from the CSV row's `Name` column before creating the physical_copies row
5. THE Import_Engine SHALL perform oracle_id resolution via Batch_Lookup (using locally cached Scryfall bulk data) rather than individual per-card API calls, processing all unresolved printings in a single pass
6. IF the CSV row's `Scryfall Oracle ID` column is empty and the Batch_Lookup fails to resolve an oracle_id for the scryfall_printing_id, THEN THE Import_Engine SHALL add the row to the unmatched list with a reason indicating oracle_id resolution failure and SHALL NOT create or modify any physical_copies or card_definitions row for that entry

### Requirement 3: Finish-to-Foil Mapping

**User Story:** As a collection manager, I want the import to interpret the CSV Finish column into the physical_copies is_foil boolean, so that foil printings are tracked as distinct printing groups.

#### Acceptance Criteria

1. WHEN a CSV row has a `Finish` column value that is exactly the case-sensitive string "Normal", THE Import_Engine SHALL set is_foil = FALSE on the corresponding physical_copies row
2. WHEN a CSV row has a `Finish` column value that is a non-empty string other than "Normal" (including but not limited to "Foil", "Etched", "Glossy"), THE Import_Engine SHALL set is_foil = TRUE on the corresponding physical_copies row
3. IF a CSV row has an empty, missing, or whitespace-only `Finish` column value, THEN THE Import_Engine SHALL default is_foil to FALSE for that row
4. THE Import_Engine SHALL treat a "Normal" copy and a non-"Normal" copy of the same scryfall_printing_id as two distinct printing groups (separate physical_copies rows) due to the differing is_foil value in the unique index

### Requirement 4: Paper-Only Scoping

**User Story:** As a collection manager, I want the import restricted to paper cards only, so that MTGO and Arena entries do not pollute the physical collection.

#### Acceptance Criteria

1. THE Physical_Copies table SHALL include a `game` column (TEXT NOT NULL DEFAULT 'paper') with a CHECK constraint restricting values to 'paper', 'mtgo', and 'arena'
2. WHEN processing a CSV export, THE Import_Engine SHALL import only rows representing paper cards and SHALL write game = 'paper' on every physical_copies row it creates or updates
3. IF the CSV export contains rows identifiable as MTGO or Arena entries (via a game/platform column or other indicator), THEN THE Import_Engine SHALL exclude those rows from processing and report the count of excluded rows in the Import_Summary
4. WHEN no game/platform indicator exists in the CSV to distinguish paper from digital, THE Import_Engine SHALL treat all rows as paper (the user is expected to export only their paper collection tab from Archidekt)

### Requirement 5: Upsert Logic for Matched Rows

**User Story:** As a collection manager, I want the import to create new printing groups and update existing ones to match the CSV, so that my physical_copies table accurately reflects my current collection without losing deck references.

#### Acceptance Criteria

1. WHEN a CSV row resolves to a printing group (card_definition_id + scryfall_printing_id + is_foil + is_proxy=FALSE) that has no existing physical_copies row and the CSV quantity is an integer greater than or equal to 1, THE Import_Engine SHALL create a new physical_copies row with the quantity from the CSV
2. WHEN a CSV row resolves to a printing group that has an existing physical_copies row with a different quantity, THE Import_Engine SHALL update the existing row's quantity to match the CSV value exactly (authoritative overwrite, not a delta/increment)
3. WHEN a CSV row resolves to a printing group that has an existing physical_copies row with identical quantity and condition, THE Import_Engine SHALL perform no write to that row (no-op detection)
4. WHEN a CSV row includes a Condition value that differs from the existing physical_copies row's condition field, THE Import_Engine SHALL map the CSV Condition value to the physical_copies condition enum (near_mint, lightly_played, moderately_played, heavily_played, damaged) using case-insensitive matching with whitespace and underscore normalization, and update the condition to the mapped value using authoritative-overwrite semantics
5. IF a CSV row contains a Condition value that cannot be mapped to any valid physical_copies condition enum value, THEN THE Import_Engine SHALL default the condition to near_mint and include the row in the Import_Summary with a warning indicating the unrecognized condition value
6. IF a CSV row contains a quantity value that is less than 1 or is not a valid integer, THEN THE Import_Engine SHALL add the row to the unmatched list in the Import_Summary with a reason indicating the invalid quantity and SHALL NOT create or modify any physical_copies row for that entry
7. THE Import_Engine SHALL set is_proxy = FALSE on every physical_copies row it creates or updates — the import process exclusively manages real (non-proxy) printing groups per the Sole_Writer_Rule

### Requirement 6: Soft Delete for Removed Printings

**User Story:** As a collection manager, I want printings that disappear from the CSV to be soft-deleted rather than removed, so that deck slots referencing those printings remain valid.

#### Acceptance Criteria

1. WHEN all CSV rows have been processed (created or updated) in the current import, THE Import_Engine SHALL identify every physical_copies row where is_proxy = FALSE AND game = 'paper' AND the row was not matched by any row in the current CSV, and SHALL set each such row's quantity to 0
2. THE Import_Engine SHALL NOT delete any physical_copies row under any circumstance — rows are only ever created or updated, preserving all deck_cards.physical_copy_id references
3. WHEN a printing that was previously soft-deleted (quantity = 0) reappears in a subsequent CSV import, THE Import_Engine SHALL update the existing physical_copies row's quantity to the new CSV value rather than creating a duplicate row
4. WHILE a deck_cards row references a physical_copies row with quantity = 0, THE system SHALL display that deck slot with the same visual state as a slot where the linked physical_copy has quantity > 0 but is not owned (i.e., "not owned" indicator) and SHALL exclude that physical_copies row from availability counts used by the allocation resolver
5. THE Import_Engine SHALL NOT soft-delete any physical_copies row that was created or updated during the current import operation — only rows that existed before the import and were not matched by any CSV row are candidates for soft-deletion

### Requirement 7: No-Op Detection for Unchanged Imports

**User Story:** As a collection manager, I want re-importing an unchanged CSV to produce zero database writes, so that reimport is safe and efficient to run at any time.

#### Acceptance Criteria

1. WHEN every resolved CSV row matches an existing physical_copies row (is_proxy = FALSE, game = 'paper') with identical quantity and condition, AND no physical_copies rows with is_proxy = FALSE, game = 'paper', and quantity > 0 are absent from the CSV, THE Import_Engine SHALL execute zero INSERT or UPDATE statements
2. THE Import_Summary SHALL report the count of rows in each category: created, updated (quantity changed), updated (condition changed), unchanged (no-op), soft-deleted (quantity set to 0), and unmatched — where a row with both quantity and condition changed SHALL be counted once in the "updated (quantity changed)" category only
3. WHEN the Import_Engine completes with zero rows in the created, updated, and soft-deleted categories, THE Import_Summary SHALL report a total_writes_count of 0 regardless of how many rows are in the unchanged or unmatched categories
4. WHEN a physical_copies row with quantity = 0 (previously soft-deleted) remains absent from the current CSV, THE Import_Engine SHALL NOT issue a write to that row — the row is already in its correct soft-deleted state

### Requirement 8: Collection-Deck Isolation

**User Story:** As a deck builder, I want the CSV import to never modify decks or deck_cards, so that my deck compositions remain under Oracle's sole authority.

#### Acceptance Criteria

1. THE Import_Engine SHALL NOT execute any INSERT, UPDATE, or DELETE statement against the deck_cards table during any import operation
2. THE Import_Engine SHALL NOT execute any INSERT, UPDATE, or DELETE statement against the decks table during any import operation
3. WHEN a physical_copies row referenced by one or more deck_cards rows has its quantity updated or set to 0, THE Import_Engine SHALL leave all referencing deck_cards rows unchanged — the deck_cards.physical_copy_id value and all other deck_cards columns SHALL be preserved exactly as they were before the import
4. THE database schema SHALL NOT define ON UPDATE CASCADE or ON DELETE CASCADE constraints on any foreign key from deck_cards to physical_copies — ensuring that no Import_Engine operation on physical_copies can propagate modifications to deck_cards rows at the database level

### Requirement 9: Sole Writer Enforcement

**User Story:** As a system architect, I want the CSV import to be the only process that creates or modifies real physical_copies rows, so that there is a single authoritative source for owned-card data.

#### Acceptance Criteria

1. THE Import_Engine SHALL be the only code path that creates physical_copies rows with is_proxy = FALSE — no other module, API route, or background process SHALL insert rows where is_proxy = FALSE
2. THE Import_Engine SHALL be the only code path that modifies the quantity or condition columns on physical_copies rows where is_proxy = FALSE
3. WHEN a physical_copies row has is_proxy = TRUE, THE Import_Engine SHALL NOT modify that row under any circumstance — proxy rows are managed exclusively by Oracle's internal proxy creation workflows
4. THE Import_Engine SHALL leave physical_copies rows where is_proxy = TRUE completely untouched during soft-delete processing — only rows with is_proxy = FALSE and game = 'paper' are candidates for soft-deletion

### Requirement 10: Import Summary and Reporting

**User Story:** As a collection manager, I want a clear summary of what the import did, so that I can verify the operation and investigate any unmatched rows.

#### Acceptance Criteria

1. WHEN the Import_Engine completes, THE system SHALL return an Import_Summary containing: count of rows created, rows updated (with breakdown by field changed), rows unchanged, rows soft-deleted, rows excluded (non-paper), and rows unmatched
2. THE Import_Summary SHALL include the list of unmatched rows with their original CSV data (card name, edition code, collector number, quantity) to support manual resolution
3. WHEN unmatched rows exist, THE Import_Summary SHALL present them in a format that allows the user to understand why each row failed to resolve (missing Scryfall ID, unresolvable set+collector combination)
4. THE Import_Summary SHALL include the total duration of the import operation in milliseconds
