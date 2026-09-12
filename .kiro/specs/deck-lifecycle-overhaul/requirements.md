# Requirements: Deck Lifecycle Overhaul

## 1. Problem Statement

The original deck status terminology (brew/boxed/archived) was confusing. "Boxed" implied 100% physical completion, but the real distinction is commitment: "Is this deck in my active rotation, regardless of whether every card is physically resolved?"

Users need clearer lifecycle states that reflect intent, not allocation status.

## 2. Outcome

Decks have a clear three-stage lifecycle with intuitive names and appropriate gating between transitions.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Manages deck lifecycle from brewing through active play to retirement |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Status transitions complete in < 500ms |
| NFR-2 | Visual feedback immediate on state change |

## 5. User Stories & Acceptance Criteria

### 5.1 Lifecycle States

**US-5.1.1** As a deck builder, I want clear lifecycle states so that I understand where each deck stands.

#### Acceptance Criteria
- WHEN viewing a deck, THE SYSTEM SHALL show one of: Brewing, In Rotation, or Graveyard.
- WHEN a deck is Brewing, THE SYSTEM SHALL display it with a dashed border treatment.
- WHEN a deck is In Rotation, THE SYSTEM SHALL display claim completeness (green/amber/red dot).
- WHEN a deck is in Graveyard, THE SYSTEM SHALL display it with desaturated styling.

### 5.2 Brewing → In Rotation

**US-5.2.1** As a deck builder, I want to activate a deck when it's ready for play.

#### Acceptance Criteria
- WHEN transitioning Brewing → In Rotation, THE SYSTEM SHALL validate card count (100 for Commander, 60+ for others).
- WHEN card count is invalid, THE SYSTEM SHALL block the transition with a clear error message.
- WHEN transition succeeds, THE SYSTEM SHALL compute and display claim completeness.

### 5.3 Any → Graveyard

**US-5.3.1** As a deck builder, I want to retire a deck and optionally release its cards.

#### Acceptance Criteria
- WHEN moving a deck to Graveyard, THE SYSTEM SHALL prompt to release claimed cards.
- WHEN user confirms release, THE SYSTEM SHALL unassign all physical copies.
- WHEN user declines release, THE SYSTEM SHALL keep cards assigned (available for pull by other decks).

### 5.4 Graveyard → Brewing (Resurrect)

**US-5.4.1** As a deck builder, I want to bring back a retired deck.

#### Acceptance Criteria
- WHEN resurrecting a deck, THE SYSTEM SHALL always transition to Brewing (not directly to In Rotation).
- WHEN resurrected, THE SYSTEM SHALL preserve all previous card data and categories.

## 6. In Scope

- Rename brew → Brewing, boxed → In Rotation, archived → Graveyard
- Card count validation on activation
- Break-down action with card release prompt
- Claim completeness indicator on In Rotation deck tiles
- Red alert triangle for incomplete In Rotation decks

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Multiple resurrection paths | Complexity — always land in Brewing |
| Automatic card release | User should confirm — cards may be proxied in other decks |

## 8. Open Questions

None — shipped.
