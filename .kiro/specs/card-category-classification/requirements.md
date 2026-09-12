# Requirements: Card Category Classification

## 1. Problem Statement

Deck health analysis requires knowing each card's functional role (Ramp, Draw, Removal, etc.). Without classification, there's no way to know if a deck has enough ramp or removal.

## 2. Outcome

Every card in the database has a functional category classification enabling deck health analysis and category-based grouping.

## 3. Users

| User | Role |
|------|------|
| Deck builder | Views cards grouped by function, sees deck health |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Classification stored on canonical card table (not per-user) |
| NFR-2 | New cards auto-inherit from `mtg_cards` |

## 5. User Stories & Acceptance Criteria

### 5.1 Classification Storage

**US-5.1.1** As a system, I want cards to have intrinsic categories.

#### Acceptance Criteria
- WHEN a card exists in `mtg_cards`, THE SYSTEM SHALL have a `default_category` JSONB column.
- THE SYSTEM SHALL store: primary category, secondary categories, confidence, notes.
- WHEN a card is added to a deck, THE SYSTEM SHALL inherit the category from `mtg_cards`.

### 5.2 Category Taxonomy

**US-5.2.1** As a deck builder, I want meaningful functional categories.

#### Acceptance Criteria
- THE SYSTEM SHALL support these primary categories: Ramp, Draw, Engine, Removal, Removal:Mass, Removal:Tempo, Counterspell, Counterspell:Conditional, Tutor, Protection, Protection:Mass, Recursion, Discard, Discard:Mass, Finisher, Mill, Creature, Land, Utility.
- THE SYSTEM SHALL support Utility sub-tags: :Tokens, :Fixing, :Anthem, :Hate, :Lifegain, :Selection, :Sac-Outlet.
- THE SYSTEM SHALL assign confidence level (high/medium/low).

### 5.3 Deck Health Integration

**US-5.3.1** As a deck builder, I want deck health based on categories.

#### Acceptance Criteria
- WHEN viewing deck health, THE SYSTEM SHALL count cards by primary category.
- WHEN category count is below threshold, THE SYSTEM SHALL show warning.
- WHEN grouping cards, THE SYSTEM SHALL use primary category.

## 6. In Scope

- `default_category` JSONB on `mtg_cards`
- Rule-based classifier script
- 12+ primary categories
- Confidence levels
- Utility sub-tags

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Per-deck overrides | Future enhancement |
| LLM-based classification | Rule-based sufficient for MVP |
| Combo detection | Deck-level via Commander Spellbook |

## 8. Open Questions

None — shipped.
