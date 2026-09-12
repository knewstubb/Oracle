# Requirements: Mobile-Friendly Views

## 1. Problem Statement

The Oracle is deployed at `oracle-alpha-two.vercel.app` and has basic PWA scaffolding (installable, hamburger menu, safe area insets), but the core views are desktop-first. At the LGS or when trading, users can't quickly check their collection or deck contents on a phone. This blocks day-to-day usage outside the home office.

## 2. Outcome

Users can open The Oracle on their phone and:
- See what cards they own (collection lookup)
- See what's in each deck (deck contents)
- Quickly search for a specific card

The experience should feel native enough that users reach for the app instead of a spreadsheet or paper list.

## 3. Users

| User | Role |
|------|------|
| Deck owner | Checks collection at LGS to verify ownership before trading |
| Deck owner | Browses deck contents at the table to remember what's in the deck |
| Deck owner | Searches for a specific card to see which decks use it |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Views must be usable on a 375px wide screen (iPhone SE) |
| NFR-2 | Touch targets must be at least 44x44px |
| NFR-3 | No horizontal scrolling on core views |
| NFR-4 | Page should be interactive within 3s on 4G connection |

## 5. User Stories & Acceptance Criteria

### 5.1 Deck List (Home Page)

**US-5.1.1** As a deck owner, I want to see my decks on mobile so I can pick one to view.

#### Acceptance Criteria
- WHEN viewing the home page on mobile, THE SYSTEM SHALL display decks in a single-column list.
- WHEN a deck is tapped, THE SYSTEM SHALL navigate to the deck detail page.
- THE deck cards SHALL show commander image, deck name, and readiness indicator.

### 5.2 Deck Detail

**US-5.2.1** As a deck owner, I want to see a deck's contents on mobile so I can check what's in it.

#### Acceptance Criteria
- WHEN viewing a deck on mobile, THE SYSTEM SHALL display the card list in a compact format (name + quantity + status).
- THE card list SHALL be scrollable vertically without horizontal overflow.
- WHEN a card name is tapped, THE SYSTEM SHALL show a card image popup/modal.
- THE SYSTEM SHALL hide or collapse non-essential UI (parallax art, tabs like Analysis/Strategy/Upgrade).

### 5.3 Collection Browse

**US-5.3.1** As a deck owner, I want to browse my collection on mobile so I can verify what I own.

#### Acceptance Criteria
- WHEN viewing collection on mobile, THE SYSTEM SHALL display cards in a compact list format.
- EACH row SHALL show card name, quantity owned, and total value.
- THE search bar SHALL be prominently positioned and easy to tap.
- WHEN a card is tapped, THE SYSTEM SHALL show card details (printings, which decks use it).

### 5.4 Quick Search

**US-5.4.1** As a deck owner, I want to search for a card by name so I can quickly check ownership/allocation.

#### Acceptance Criteria
- THE global search (Cmd+K on desktop) SHALL be accessible via a prominent search icon on mobile.
- SEARCH results SHALL show card name, owned quantity, and deck usage.
- TAPPING a result SHALL show full card details.

## 6. In Scope

- Responsive adjustments to existing views (not a separate mobile app)
- Home page (deck list)
- Deck detail page (cards tab primarily)
- Collection page (grid/list view)
- Global search modal

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Camera scanner / OCR | Separate feature, needs API key |
| Offline mode | Requires IndexedDB caching — future enhancement |
| Push notifications | Future enhancement |
| Brew canvas mobile | Complex drag-drop UI — desktop-only for now |
| Oracle chat mobile | Already works, no changes needed |

## 8. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should deck detail default to a "cards only" view on mobile, hiding tabs? | Simplifies mobile UX but diverges from desktop |
| 2 | Should we add a dedicated "at the table" mode that shows just decklist + completeness? | Nice to have, but may be v2 |
