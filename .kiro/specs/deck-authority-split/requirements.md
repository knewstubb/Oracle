# Requirements Document

## Introduction

This feature establishes a clean authority split between Oracle and Archidekt: Oracle becomes the sole source of truth for deck contents once imported, while Archidekt remains the sole source of truth for collection data. The existing live sync mechanism (`GET /api/sync`) is reframed as a one-time import — pulling a deck from Archidekt creates or overwrites Oracle's local copy at that moment, with no subsequent automatic re-pulls. AutoSync is stripped of all deck-related triggers, and Playwright write-back automation (tag writes, deck creation on Archidekt's side) becomes exclusively user-triggered. This eliminates the risk of background resyncs silently overwriting Oracle-side edits to deck contents, proxy allocations, printing selections, and category structures.

## Glossary

- **Deck_Import**: The mechanism (replacing the former live sync) that performs a one-time pull of a deck's data from Archidekt into Oracle's local SQLite database. After import, Archidekt's copy of that deck is not referenced again unless the user explicitly triggers a re-import.
- **AutoSync_Component**: The client-side React component (`AutoSync.tsx`) mounted in the root layout that checks sync staleness on page load and triggers background data refresh.
- **Playwright_WriteBack**: The server-side Playwright automation routes (`/api/archidekt/write-tags`, `/api/archidekt/create-deck`) that push Oracle state (proxy tags, deck creation) to Archidekt via browser automation.
- **Oracle_Deck**: A deck record in Oracle's local SQLite database (`decks` + `deck_cards` tables) that is authoritative from the moment of import onward.
- **Collection_Import**: The existing CSV-based upsert mechanism for syncing Archidekt collection data into Oracle's `collection` table — unaffected by this change.
- **Manual_Push**: A user-initiated action that triggers Playwright_WriteBack to update or create a deck on Archidekt's side, reflecting Oracle's current state for that specific deck.

## Requirements

### Requirement 1: Deck Import Replaces Live Sync

**User Story:** As a deck owner, I want pulling a deck from Archidekt to be a one-time import action, so that Oracle's local copy is never silently overwritten by subsequent automatic re-pulls.

#### Acceptance Criteria

1. WHEN a user triggers a deck import for a specific Archidekt deck ID, THE Deck_Import SHALL fetch the deck's current state from the Archidekt API, upsert the deck record into the `decks` table, clear and re-insert all card entries in `deck_cards`, and record the import timestamp in `last_synced_at`.
2. WHEN a deck has already been imported (a row exists in `decks` with the matching Archidekt deck ID), THE Deck_Import SHALL only re-fetch and overwrite Oracle's copy if the user explicitly triggers a re-import action for that specific deck.
3. THE Deck_Import SHALL NOT schedule, queue, or trigger any automatic re-pull of deck data from Archidekt for any previously-imported deck.
4. WHEN the `GET /api/sync` route is invoked, THE Deck_Import SHALL only sync collection data and newly-added decks (decks present on Archidekt that have no corresponding row in Oracle's `decks` table) — previously-imported decks SHALL NOT have their `deck_cards` data overwritten.
5. IF a deck import fails due to a network error or Archidekt API unavailability, THEN THE Deck_Import SHALL return an error response to the caller and leave the existing Oracle deck data unchanged.

### Requirement 2: AutoSync Deck Trigger Removal

**User Story:** As a deck owner, I want the AutoSync component to stop triggering any deck resync, so that my Oracle-side edits are never overwritten by a background process.

#### Acceptance Criteria

1. WHEN the AutoSync_Component executes its staleness check on page load, THE AutoSync_Component SHALL NOT trigger any operation that re-fetches or overwrites deck data (`decks` or `deck_cards` rows) from Archidekt.
2. WHILE the AutoSync_Component remains mounted in the root layout, THE AutoSync_Component SHALL NOT invoke any endpoint or function that causes previously-imported deck data to be overwritten with Archidekt-sourced data.
3. WHEN the AutoSync_Component is audited for remaining purpose after deck trigger removal, THE AutoSync_Component SHALL either retain functionality limited to collection-staleness indication, or be flagged for deprecation if no remaining triggers exist.
4. THE AutoSync_Component SHALL NOT modify the `deck_cards` table content for any deck that has already been imported into Oracle.

### Requirement 3: Manual-Only Playwright Write-Back

**User Story:** As a deck owner, I want Archidekt write-back automation (tag writes, deck creation) to fire only when I explicitly request it, so that no automatic side effect pushes data to Archidekt without my intent.

#### Acceptance Criteria

1. WHEN the user triggers a Manual_Push action for a specific deck, THE Playwright_WriteBack SHALL execute the tag-writing or deck-creation automation for that deck on Archidekt's side.
2. THE Playwright_WriteBack SHALL NOT fire automatically as a side effect of any sync, import, save, or allocation action within Oracle.
3. WHEN a deck exists in Oracle but has no corresponding Archidekt deck, THE Manual_Push action SHALL use the create-deck automation to create the deck on Archidekt's side at the user's explicit request.
4. WHEN a deck exists both in Oracle and on Archidekt, THE Manual_Push action SHALL update Archidekt's copy with Oracle's current proxy tags and category structure.
5. IF the Playwright_WriteBack automation fails (browser error, authentication failure, or Archidekt unavailability), THEN THE Manual_Push SHALL report the failure to the user with a descriptive error message and leave Oracle's data unchanged.

### Requirement 4: Manual Push UI Action

**User Story:** As a deck owner, I want an explicit UI control on a deck's page to push updates to Archidekt, so that I have clear visibility and control over when Archidekt's copy is updated.

#### Acceptance Criteria

1. WHEN a user views a deck detail page, THE deck page SHALL display a clearly labeled action (such as "Update in Archidekt" or "Push to Archidekt") that initiates the Manual_Push for that deck.
2. WHEN the user activates the Manual_Push action, THE deck page SHALL display a loading state while the Playwright_WriteBack executes and a success confirmation upon completion.
3. IF the Manual_Push action fails, THEN THE deck page SHALL display an error message describing the failure and allow the user to retry.
4. THE Manual_Push action SHALL NOT appear in any automated workflow, scheduled task, or background process — only in user-facing UI surfaces where the user explicitly clicks or activates the control.

### Requirement 5: Oracle-Native Deck Creation

**User Story:** As a deck owner, I want to create new decks directly in Oracle without any automatic push to Archidekt, so that Archidekt visibility for new decks is opt-in and per-deck.

#### Acceptance Criteria

1. WHEN a user creates a new deck in Oracle (via Brew Mode or manual creation), THE deck creation flow SHALL insert the deck into Oracle's local `decks` and `deck_cards` tables without invoking any Archidekt API call or Playwright automation.
2. WHEN a deck is created natively in Oracle, THE Oracle_Deck SHALL be fully functional (viewable, editable, allocatable) with no corresponding Archidekt deck ever created.
3. WHEN a user wishes to make an Oracle-native deck visible on Archidekt, THE user SHALL use the Manual_Push action to create the deck on Archidekt's side — this creation is never automatic.
4. THE deck creation flow SHALL NOT import, invoke, or depend on the Playwright_WriteBack automation as part of Oracle-native deck creation.

### Requirement 6: Oracle Edit Protection

**User Story:** As a deck owner, I want my Oracle-side deck edits (card changes, proxy allocations, printing selections, category structures) to be permanently protected from silent overwrite, so that no background process can revert my work.

#### Acceptance Criteria

1. WHEN a user edits any deck data in Oracle (adding/removing cards, changing proxy allocations, selecting printings, modifying categories or tags), THE edited data SHALL persist in the `deck_cards` table until the user explicitly modifies it again or triggers a manual re-import.
2. THE application SHALL NOT contain any code path that overwrites `deck_cards` data for a previously-imported deck without explicit user initiation (manual re-import via a distinct UI action with clear confirmation).
3. IF a user triggers a manual re-import for a deck that has been edited in Oracle, THEN THE Deck_Import SHALL warn the user that re-importing will overwrite local edits before proceeding.
4. WHILE the application is running, THE application SHALL NOT invoke any scheduled, timed, or event-driven process that fetches deck data from Archidekt and writes it to the `decks` or `deck_cards` tables for previously-imported decks.

### Requirement 7: Collection Import Continuity

**User Story:** As a deck owner, I want collection import (CSV upsert) to continue functioning exactly as before, so that this authority split does not disrupt my collection workflow.

#### Acceptance Criteria

1. WHILE the deck authority split is in effect, THE Collection_Import SHALL continue to accept CSV exports from Archidekt and upsert card data into the `collection` table using the existing mechanism.
2. WHILE the deck authority split is in effect, THE Collection_Import SHALL remain the sole mechanism for updating collection data — no new automatic collection sync pathway SHALL be introduced.
3. THE Collection_Import SHALL NOT modify any data in the `decks` or `deck_cards` tables.
4. WHEN the `GET /api/sync` route handles collection data, THE sync route SHALL continue syncing collection entries from Archidekt without affecting previously-imported deck data.

### Requirement 8: Existing Deck Data Preservation

**User Story:** As a deck owner, I want all my existing deck data (decks, deck_cards, categories, proxy allocations) to remain intact and functional after this change, so that only the sync behavior changes — not my data.

#### Acceptance Criteria

1. WHEN the deck authority split is deployed, THE application SHALL retain all existing rows in the `decks` and `deck_cards` tables without any data migration, deletion, or structural modification.
2. WHEN the deck authority split is deployed, THE application SHALL continue to serve deck detail pages, Analysis tab, Strategy tab, and all deck-related API routes using the existing `decks` and `deck_cards` schema.
3. THE proxy allocation logic, precon mod tracker, and deck detail tab functionality SHALL remain unaffected by the deck authority split — operating against the same tables and schema as before.
4. WHEN a user navigates to any previously-imported deck, THE deck detail page SHALL render correctly with no data loss or behavioral regression compared to the pre-change state.
