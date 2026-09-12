# Requirements: Scryfall Printings Cache

## 1. Problem Statement

Calling Scryfall API on every card lookup was slow and risked rate limits. A local cache enables instant lookups and eliminates external dependencies for common operations.

## 2. Outcome

Local database cache of all Scryfall printings with daily automated sync.

## 3. Users

| User | Role |
|------|------|
| System | Performs card lookups without API latency |
| Deck builder | Sees card images, prices, and set info instantly |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Card lookups complete in < 50ms from cache |
| NFR-2 | Daily sync completes within 15 minutes |

## 5. User Stories & Acceptance Criteria

### 5.1 Cache Storage

**US-5.1.1** As a system, I want all Scryfall printings stored locally.

#### Acceptance Criteria
- THE SYSTEM SHALL store `ref_printings` with columns: scryfall_id, oracle_id, name, set_code, set_name, collector_number, rarity, mana_cost, type_line, color_identity, image URLs, prices.
- THE SYSTEM SHALL store ~100K card printings.
- THE SYSTEM SHALL store four image URL variants per card.

### 5.2 Lookup Service

**US-5.2.1** As a system, I want fast local-first lookups.

#### Acceptance Criteria
- WHEN looking up a card, THE SYSTEM SHALL check ref_printings first.
- WHEN card not found locally, THE SYSTEM SHALL fall back to Scryfall API.
- WHEN fallback succeeds, THE SYSTEM SHALL optionally cache the result.

### 5.3 Daily Sync

**US-5.3.1** As a user, I want the cache to stay current.

#### Acceptance Criteria
- THE SYSTEM SHALL run daily sync via Vercel cron.
- THE SYSTEM SHALL sync at 10:00 UTC.
- THE SYSTEM SHALL catch new set releases within 24 hours.

### 5.4 Cheapest Printing

**US-5.4.1** As a deck builder, I want to find budget alternatives.

#### Acceptance Criteria
- WHEN querying for cheapest printing, THE SYSTEM SHALL return the lowest price_usd printing.
- WHEN multiple printings have same price, THE SYSTEM SHALL prefer newer releases.

## 6. In Scope

- ref_printings table with full Scryfall data
- Daily cron sync
- Local-first lookup chain
- Cheapest printing query
- Four image URL variants
- Four price columns (USD/EUR, regular/foil)

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Real-time sync | Daily sufficient, avoids rate limits |
| Full card rules text | Stored separately in ref_cards |

## 8. Open Questions

None — shipped.
