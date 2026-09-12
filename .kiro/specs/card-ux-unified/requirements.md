# Requirements: Card UX Unified

## 1. Problem Statement

Multiple features (Card Management UX, Basic Lands Overhaul, Mana Pips & Set Icons, Collection List Enhancements, Material Icons Migration) shipped together to create a unified card display experience. This spec consolidates them.

## 2. Outcome

Consistent card display across all surfaces with unified status indicators, metadata, and interactions.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Views and manages cards across decks and collection |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Card metadata loads within deck load time (no additional latency) |
| NFR-2 | Icons render without layout shift |

## 5. User Stories & Acceptance Criteria

### 5.1 Unified Card Row

**US-5.1.1** As a deck builder, I want consistent card display across all views.

#### Acceptance Criteria
- WHEN viewing a card row, THE SYSTEM SHALL show: drag handle, checkbox, qty, name, set icon + name, mana pips, status, price, kebab menu.
- WHEN hovering over a card name, THE SYSTEM SHALL show card image preview following cursor.
- WHEN clicking the kebab menu, THE SYSTEM SHALL show contextual actions (remove, change printing, etc.).

### 5.2 Status Indicators

**US-5.2.1** As a deck builder, I want clear visual status for each card slot.

#### Acceptance Criteria
- THE SYSTEM SHALL use Material Symbols icons for status:
  - Original: filled green circle
  - Proxy: blue comedy_mask
  - Available: grey outline circle
  - Alternate: grey swap arrows
  - Claimed: amber lock
  - Unowned: pink do_not_disturb_on
- WHEN clicking a status chip, THE SYSTEM SHALL open a contextual popover with actions.

### 5.3 Mana Pips

**US-5.3.1** As a deck builder, I want to see mana costs at a glance.

#### Acceptance Criteria
- WHEN a card has a mana cost, THE SYSTEM SHALL display colored pip icons.
- THE SYSTEM SHALL use mana-font for accurate MTG mana symbols.
- WHEN mana cost is absent, THE SYSTEM SHALL show nothing (not "0").

### 5.4 Set Icons

**US-5.4.1** As a deck builder, I want to see which set a card is from.

#### Acceptance Criteria
- WHEN a card has a set, THE SYSTEM SHALL display the expansion symbol.
- THE SYSTEM SHALL use keyrune font with rarity coloring.
- WHEN hovering set icon, THE SYSTEM SHALL show full set name.

### 5.5 Basic Lands

**US-5.5.1** As a deck builder, I want basic lands handled without clutter.

#### Acceptance Criteria
- WHEN a deck has generic basic lands, THE SYSTEM SHALL show them collapsed ("Forest ×12").
- WHEN a deck has specific-printing lands, THE SYSTEM SHALL show them with set code ("Mountain (DSK)").
- WHEN editing quantity, THE SYSTEM SHALL provide +/- stepper in kebab menu.
- WHEN converting, THE SYSTEM SHALL allow "Make generic" action.

## 6. In Scope

- Unified `CardGroupSection` component
- Material Symbols icon migration
- Mana-font and keyrune integration
- Basic land display modes
- Status chip popovers

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Light mode colors | Dark mode only for now |
| Drag-and-drop reordering | Deferred |

## 8. Open Questions

None — shipped.
