# Requirements: Deck Import Flow V2

## 1. Problem Statement

Importing decks from external platforms (Archidekt, Moxfield, etc.) required clarity about what happens to the imported cards. Users needed to distinguish between "I just bought this precon" (create physical copies) vs "Match against my existing collection" (allocation only).

## 2. Outcome

Unified import dialog with clear input methods and import mode selection.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Imports decks from external platforms or text lists |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Import parses and validates within 3 seconds |
| NFR-2 | Supports all major deckbuilding platforms |

## 5. User Stories & Acceptance Criteria

### 5.1 Input Methods

**US-5.1.1** As a deck builder, I want multiple ways to import a deck.

#### Acceptance Criteria
- WHEN importing, THE SYSTEM SHALL offer three input methods: URL, Paste List, CSV.
- WHEN pasting a URL, THE SYSTEM SHALL auto-detect platform (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox).
- WHEN pasting text, THE SYSTEM SHALL parse `<qty>[x] <name>` format with Commander section support.
- WHEN uploading CSV, THE SYSTEM SHALL accept Archidekt, Moxfield, and generic formats.

### 5.2 Import Modes

**US-5.2.1** As a deck builder, I want to choose what happens to imported cards.

#### Acceptance Criteria
- WHEN import is parsed, THE SYSTEM SHALL present two modes: "These are new cards" and "Match against my collection".
- WHEN "These are new cards" is selected, THE SYSTEM SHALL create physical copies AND assign them to deck slots.
- WHEN "Match against my collection" is selected, THE SYSTEM SHALL NOT create physical copies; allocation happens via Picklist.

### 5.3 Initial Status

**US-5.3.1** As a deck builder, I want imported decks to start in a consistent state.

#### Acceptance Criteria
- WHEN a deck is imported via any method, THE SYSTEM SHALL set status to Brewing.
- WHEN a deck is imported, THE SYSTEM SHALL NOT auto-assign allocation (unless "new cards" mode).

## 6. In Scope

- URL import from 5 platforms
- Text paste parser with Commander section
- CSV import
- Mode picker: new cards vs match collection
- All decks start as Brewing

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Auto-assign on "match collection" | Deferred to Picklist workflow |
| Sideboard import | Low priority for Commander |

## 8. Open Questions

None — shipped.
