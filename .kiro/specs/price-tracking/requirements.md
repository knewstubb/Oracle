# Requirements: Price Tracking

## 1. Problem Statement

Users wanted to know the value of their collection and individual decks. This includes market prices, gain/loss tracking, and easy price refresh.

## 2. Outcome

Market price display across collection and decks, with value summaries and manual refresh capability.

## 3. Users

| User | Role |
|------|------|
| Collector | Tracks collection value and investments |
| Deck builder | Views per-deck value and card prices |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Price refresh completes within 60 seconds for full collection |
| NFR-2 | Cached prices serve without API latency |

## 5. User Stories & Acceptance Criteria

### 5.1 Collection Value Banner

**US-5.1.1** As a collector, I want to see my total collection value.

#### Acceptance Criteria
- WHEN viewing Collection page, THE SYSTEM SHALL display: Collection Value, Gain/Loss, Card Count.
- WHEN cards have purchase prices, THE SYSTEM SHALL calculate gain/loss vs. current market.
- WHEN viewing banner, THE SYSTEM SHALL show most valuable card.

### 5.2 Per-Card Prices

**US-5.2.1** As a collector, I want to see individual card prices.

#### Acceptance Criteria
- WHEN viewing a card row (deck or collection), THE SYSTEM SHALL display USD market price.
- WHEN price is unavailable, THE SYSTEM SHALL show nothing (not $0.00).
- WHEN displaying price, THE SYSTEM SHALL right-align in fixed width column.

### 5.3 Per-Deck Value

**US-5.3.1** As a deck builder, I want to see total deck value.

#### Acceptance Criteria
- WHEN viewing a deck, THE SYSTEM SHALL show total value in the header stats.
- THE SYSTEM SHALL sum (price × quantity) for all cards in deck.

### 5.4 Price Refresh

**US-5.4.1** As a collector, I want to update prices on demand.

#### Acceptance Criteria
- WHEN viewing Collection page, THE SYSTEM SHALL show a "Refresh Prices" button.
- WHEN clicking refresh, THE SYSTEM SHALL show a spinner while updating.
- WHEN refresh completes, THE SYSTEM SHALL show success toast.

### 5.5 Daily Cron

**US-5.5.1** As a user, I want prices to stay current automatically.

#### Acceptance Criteria
- THE SYSTEM SHALL run a daily cron job to refresh all prices.
- THE SYSTEM SHALL run at 10:00 UTC.
- THE SYSTEM SHALL update `ref_printings.price_usd` from Scryfall.

## 6. In Scope

- Collection value banner
- Per-card price display
- Per-deck value
- Manual refresh button
- Daily automated cron

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Price history / charts | Complexity — current value sufficient |
| Currency conversion | USD only for now |

## 8. Open Questions

None — shipped.
