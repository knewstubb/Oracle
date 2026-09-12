# Requirements: Picklist 3-Column View

## 1. Problem Statement

Resolving card allocation one slot at a time was tedious. Users needed a batch view to see all unresolved cards, grouped by resolution path (storage, other decks, need to buy).

## 2. Outcome

Three-column layout showing all resolution options at once, with quick actions.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Resolves card allocation across decks |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Progress bar updates in real-time as cards are resolved |
| NFR-2 | Claim actions complete in < 500ms |

## 5. User Stories & Acceptance Criteria

### 5.1 Column Layout

**US-5.1.1** As a deck builder, I want to see all unresolved cards organized by resolution path.

#### Acceptance Criteria
- WHEN viewing Picklist, THE SYSTEM SHALL show three columns: Available (storage), Claimed (other decks), Unowned.
- WHEN a card has multiple copies in storage, THE SYSTEM SHALL show it in Available column with count.
- WHEN a card is held by another deck, THE SYSTEM SHALL show the holding deck name and status.
- WHEN a card is not owned, THE SYSTEM SHALL show it in Unowned column.

### 5.2 Available Column

**US-5.2.1** As a deck builder, I want to quickly claim cards from storage.

#### Acceptance Criteria
- WHEN viewing Available column, THE SYSTEM SHALL group cards by storage location.
- WHEN clicking "Claim" on an Available card, THE SYSTEM SHALL instantly assign the physical copy.
- WHEN claimed, THE SYSTEM SHALL move the card out of the Available column.

### 5.3 Claimed Column

**US-5.3.1** As a deck builder, I want to see which decks hold the cards I need.

#### Acceptance Criteria
- WHEN viewing Claimed column, THE SYSTEM SHALL group by holding deck with status indicator.
- WHEN the holding deck is In Rotation, THE SYSTEM SHALL show a confirmation dialog before claiming.
- WHEN the holding deck is Brewing or Graveyard, THE SYSTEM SHALL allow direct claim.
- WHEN claimed, THE SYSTEM SHALL update both decks' allocation.

### 5.4 Unowned Column

**US-5.4.1** As a deck builder, I want to mark unowned cards as proxies.

#### Acceptance Criteria
- WHEN viewing Unowned column, THE SYSTEM SHALL show cards with no physical copies.
- WHEN clicking "Proxy", THE SYSTEM SHALL create a proxy copy and assign it.
- WHEN proxied, THE SYSTEM SHALL move the card out of Unowned column.

### 5.5 Progress Bar

**US-5.5.1** As a deck builder, I want to see overall deck resolution progress.

#### Acceptance Criteria
- WHEN viewing Picklist, THE SYSTEM SHALL show a progress bar with color-coded segments.
- WHEN cards are resolved, THE SYSTEM SHALL update the progress bar in real-time.
- THE SYSTEM SHALL show: Original (green) + Proxy (blue) + In Storage (light grey) + In Decks (amber) + Unowned (pink).

## 6. In Scope

- Three-column layout
- Card hover preview
- Instant claim for Available
- Confirmation for In Rotation decks
- Proxy creation
- Progress bar with segments

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Bulk select and claim | Complexity — individual actions sufficient |
| Alternative printing selection | Use printing picker separately |

## 8. Open Questions

None — shipped.
