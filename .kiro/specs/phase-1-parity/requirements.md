# Requirements: Phase 1 Parity Features

**Epic:** Bring The Oracle to feature parity with Archidekt, Moxfield, and Manabox for MVP credibility

**Scope:** Three focused features (search filters, price display, legality lock) that close gaps identified in competitive audit

**Out of Scope:** 
- Global collection sync (Phase 2)
- Commander insights (Phase 2)
- Playtest simulator (Phase 3+)
- Public sharing or collaboration (out of personal-app scope)

---

## Problem Statement

The Oracle is 70% feature-complete vs. competitors. Users comparing tools will notice three specific gaps:

1. **Search limitations:** Can't filter by mana cost, power/toughness, or rarity — forcing manual scanning at 2,500+ card collection
2. **Price opacity:** TCGPlayer data exists but isn't surfaced; users can't see deck cost or card value
3. **Format flexibility:** No option to enforce format legality despite having the data

These gaps are **not blockers** for MVP (users can work around them), but they **signal immaturity** compared to alternatives.

**Expected outcome:** Phase 1 completion closes all three gaps and brings The Oracle to credibility parity.

---

## Users

| User | Role | Need |
|------|------|------|
| **Brad (the user)** | Curator | "I want to search my 2,500-card collection by mana cost to find mid-game plays. I want to see deck cost. I want to lock my Commander deck to legal cards if I choose." |
| **Future testers** | Evaluators | "This tool feels complete compared to Moxfield/Archidekt. I can discover cards, see what I'm spending, and build correctly." |

---

## Outcomes & Success Metrics

| Outcome | How to Measure |
|---------|---------------|
| Users can search by mana cost range | Search form includes "Mana Cost (CMC)" field; filter works on collection/deck search |
| Users can search by P/T range | Search form includes "Power/Toughness" field; creature search respects range |
| Users can search by rarity | Search form includes "Rarity" selector; works on all card searches |
| Users see deck price | Deck statistics panel shows "Total Cost (Non-Foil)" and "(Foil)" |
| Users see price per card | Each card row in deck view shows price (optional foil badge) |
| Users can enable/disable legality lock | Deck settings include "Format Lock" toggle; when on, adding illegal cards shows error |
| MVP parity achieved | Audit matrix shows The Oracle at 90%+ on standard features |

---

## User Stories & Acceptance Criteria

### Story 1: Search by Mana Cost Range

**US-1.1** As a brewer, I want to filter cards by mana cost range (e.g., "3-4 mana") so I can find mid-game plays and balance my mana curve.

**Acceptance Criteria:**
- WHEN I open the card search in a deck, THE SYSTEM SHALL display a "Mana Cost" filter with range inputs (e.g., "from 3 to 4")
- WHEN I select a range (e.g., "3-4"), THE SYSTEM SHALL return only cards with CMC in that range
- WHEN no range is selected, THE SYSTEM SHALL show all cards (default behavior)
- WHEN I search in the collection view, THE SYSTEM SHALL apply the same mana cost filter

---

### Story 1.2: Search by Power/Toughness Range

**US-1.2** As a brewer, I want to filter creatures by power/toughness (e.g., "2+ power") so I can find creatures for aggressive strategies.

**Acceptance Criteria:**
- WHEN I open the card search, THE SYSTEM SHALL display "Power" and "Toughness" filter inputs
- WHEN I set "Power >= 2", THE SYSTEM SHALL return only creatures with power 2 or more
- WHEN I set "Toughness >= 3", THE SYSTEM SHALL return only creatures with toughness 3 or more
- WHEN both are set (e.g., "Power 2+, Toughness 2+"), THE SYSTEM SHALL return creatures matching both criteria
- WHEN I search on non-creatures, THE SYSTEM SHALL not apply P/T filters (gracefully ignore)

---

### Story 1.3: Search by Rarity

**US-1.3** As a brewer, I want to filter cards by rarity so I can find bulk commons or chase mythics.

**Acceptance Criteria:**
- WHEN I open the card search, THE SYSTEM SHALL display "Rarity" selector with options (Common, Uncommon, Rare, Mythic)
- WHEN I select "Uncommon", THE SYSTEM SHALL return only uncommon printings
- WHEN I select multiple (e.g., "Rare, Mythic"), THE SYSTEM SHALL return cards matching any selected rarity
- WHEN no rarity is selected, THE SYSTEM SHALL show all cards

---

### Story 2: Display Price Information in Deck View

**US-2.1** As a brewer, I want to see the total cost of my deck so I can stay within budget.

**Acceptance Criteria:**
- WHEN I open a deck, THE SYSTEM SHALL display in the statistics panel "Total Deck Cost (Non-Foil)" and "(Foil)" with USD totals
- WHEN I add a card to the deck, THE SYSTEM SHALL update the total cost immediately
- WHEN I remove a card, THE SYSTEM SHALL update the total cost
- WHEN price data is stale (>30 days), THE SYSTEM SHALL display "Price data updated: [date]" with a refresh option
- WHEN a card has no price data, THE SYSTEM SHALL show "—" (not $0)

---

### Story 2.2: Display Price Per Card

**US-2.2** As a brewer, I want to see the price of each card in my deck list so I can identify expensive cards to swap.

**Acceptance Criteria:**
- WHEN I view a deck card list, THE SYSTEM SHALL display price next to each card (e.g., "$2.50" for the chosen printing)
- WHEN the card has multiple printings, THE SYSTEM SHALL show the price of the currently selected printing
- WHEN I hover/click a card, THE SYSTEM SHALL show price options for all printings ("Foil: $5.00" vs. "Non-Foil: $1.50")
- WHEN I change the printing, THE SYSTEM SHALL update the displayed price and recalculate deck total

---

### Story 2.3: Price Comparison in Printing Selector

**US-2.3** As a brewer, I want to see prices for all printings of a card so I can choose the cheapest option.

**Acceptance Criteria:**
- WHEN I open the printing selector, THE SYSTEM SHALL display all printings with (set, rarity, price)
- THE SYSTEM SHALL sort printings by price (cheapest first) by default
- WHEN I select a different printing, THE SYSTEM SHALL update both the deck display and deck total cost

---

### Story 3: Optional Format Legality Lock

**US-3.1** As a brewer, I want to optionally lock my deck to the selected format so I can't accidentally add illegal cards.

**Acceptance Criteria:**
- WHEN I open deck settings, THE SYSTEM SHALL display "Format Lock" toggle (default: off)
- WHEN I enable "Format Lock", THE SYSTEM SHALL prevent adding cards illegal for the selected format
- WHEN I attempt to add an illegal card, THE SYSTEM SHALL display error message: "Card [name] is not legal in [format]"
- WHEN I disable "Format Lock", THE SYSTEM SHALL allow any card regardless of legality
- WHEN I select a new format, THE SYSTEM SHALL validate all deck cards against the new format (if lock is on)

---

### Story 3.2: Legality Warning (Always On)

**US-3.2** As a brewer, I want to see legality warnings on my deck so I know which cards are problematic.

**Acceptance Criteria:**
- WHEN I have illegal cards in my deck, THE SYSTEM SHALL display a warning banner (e.g., "3 cards are not legal in Commander")
- WHEN I click the warning, THE SYSTEM SHALL highlight the illegal cards (visual indicator, e.g., red border)
- WHEN all cards are legal, THE SYSTEM SHALL not display the warning
- THIS BEHAVIOR SHALL remain active regardless of the Format Lock setting

---

## Non-Functional Requirements

| Requirement | Details |
|-------------|---------|
| **Performance** | Search filters shall return results in <500ms for collection size up to 3,000 cards |
| **Data Accuracy** | Price data shall be current within 7 days (sync job runs weekly) |
| **Accessibility** | Search form and price display shall be keyboard-navigable and screen-reader compatible |
| **Mobile** | Filters shall render on mobile viewport (<768px) without horizontal scroll |

---

## Out of Scope

- **Global collection sync** — Deferred to Phase 2 (feature: show which decks own/use each card across all decks)
- **Advanced stat analysis** — Deferred to Phase 2 (feature: threat density, removal count)
- **Commander-specific insights** — Deferred to Phase 2+ (feature: EDHREC sync, build archetypes, synergy scoring)
- **Playtest simulator** — Deferred to Phase 3+ (feature: draw simulator, mulligan tracking)
- **Public sharing** — Out of scope per personal-app convention

---

## Known Limitations & Design Decisions

### Mana Cost Filtering
- **Decision:** Use CMC (Converted Mana Cost) as the filtering dimension, not mana composition
- **Rationale:** CMC is simpler (1 number) and matches competitor behavior (Archidekt, Moxfield)
- **Future:** Color-based mana filtering (e.g., "2R" = 2 red mana) is Phase 2+ if needed

### Price Stale Detection
- **Decision:** Show "Price data updated: [date]" when data is >7 days old
- **Rationale:** Weekly sync job; stale data is better than no data, but users should know
- **Future:** Real-time price alerts (Moxfield-style) are Phase 2+

### Format Lock Default (Off)
- **Decision:** Default to off to match Archidekt's behavior (Moxfield defaults on)
- **Rationale:** Less restrictive for personal app; users can enable if they prefer
- **Future:** Add user preference to set default

---

## Questions & Risks

| # | Question | Impact | Resolution |
|---|----------|--------|-----------|
| 1 | Should P/T filter work for non-creatures? | Low | Gracefully ignore (no error, just no results) |
| 2 | Should rarity filter include "Timeshifted" and other special rarities? | Low | Include in selector; Scryfall is source of truth |
| 3 | Should price display show both non-foil and foil in one row or separate? | Medium | One row with "(Foil)" badge; user can toggle |
| 4 | Should price come from TCGPlayer mid, high, or low? | High | Use TCGPlayer low (most conservative); document in app |
| 5 | Should Format Lock warn or error on illegal cards? | Low | Error (prevents add); warning also shows elsewhere |

---

## Acceptance Criteria (Epic Level)

- [ ] Mana cost, P/T, rarity search filters implemented and tested on collection + deck search
- [ ] Deck total cost and per-card price display wired to UI
- [ ] Format Lock toggle tested (on/off behavior, format validation)
- [ ] All new features tested on mobile viewport (<768px)
- [ ] Audit matrix updated: The Oracle shows 90%+ feature parity
- [ ] No regressions: existing search, deck-building, statistics features unchanged
- [ ] Documentation updated with filter definitions and price accuracy notes
