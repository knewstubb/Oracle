# Requirements Document

## Introduction

The Card Status Taxonomy Rename & Expansion replaces the existing four-state card-slot classification (`allocated`, `allocated_proxy`, `unallocated`, `unowned`) with a unified five-state taxonomy (`original`, `proxy`, `unallocated`, `claimed`, `unowned`) that applies identically in the Cards tab and the deck-builder search — eliminating the current split where two parallel vocabularies describe the same underlying data.

Additionally, this feature introduces **Missing** as a physical-copy-level marker (lost/sold/damaged copies excluded from availability without row deletion), promotes **Playable/Unplayable** from a silent completeness badge to a named, visible state on the Decks Grid for Built decks, and executes a hard rename across stored values, types, and all UI consumers in a single migration pass.

**Value proposition (the Gitrog scenario):** One owned copy of a card split across two Built decks. Moving it from Deck A to Deck B is driven entirely from Deck B's Picklist — the user sees it as "Claimed by Deck A," reassigns it (Tier 4, confirmation required), Deck B becomes Playable, Deck A automatically becomes Unplayable. No action needed on the giving side. Claimed surfaces contention at the point of action; Playable/Unplayable surfaces the consequence without a manual step.

**Migration approach:** Hard rename. The old enum values (`allocated`, `allocated_proxy`, `unallocated`, `unowned`, `over-allocated`) are removed from the codebase entirely — stored column values, the `CardSlotStatus` type, and every UI consumer migrate together. No display-only skin over old values.

## Glossary

- **Card_Status_Engine**: The system (`src/lib/card-status.ts`) responsible for computing per-slot status — the single source of truth for the five-state taxonomy
- **Deck_Cards_Row**: A single card slot in a deck (`deck_cards` table row), linked to a physical copy via `physical_copy_id`
- **Physical_Copy**: A specific physical card instance (`physical_copies` table row), with `card_definition_id`, `is_proxy`, `storage_location_id`, and the new `missing` flag
- **Picklist**: The interactive resolution UI that bridges "100 cards chosen" to "100 cards resolved" — ranks candidates by tier and commits assignments per row
- **Decks_Grid**: The main deck list view at `/` showing all decks with lifecycle, completeness, and status information
- **Cards_Tab**: The per-deck card list showing each slot's resolution status with filter chips and summary counts
- **Completeness**: The computed ratio of resolved slots (`physical_copy_id IS NOT NULL`) to total slots in a deck
- **Built_Deck**: A deck in the "Built" lifecycle stage (display rename of "Boxed") — always Allocate-on, the only stage where Playable/Unplayable applies
- **Available_Copy**: A physical copy with no `deck_cards.physical_copy_id` link — floating in the collection, eligible for assignment

## Requirements

### Requirement 1: Five-State Slot-Level Taxonomy

**User Story:** As a user, I want each card slot in my deck classified into one of five clear states, so that I can immediately understand what action (if any) is needed for each card.

#### Acceptance Criteria

1. THE Card_Status_Engine SHALL classify every Deck_Cards_Row into exactly one of: `original`, `proxy`, `unallocated`, `claimed`, `unowned`
2. WHEN a Deck_Cards_Row has a non-null `physical_copy_id` linked to a Physical_Copy where `is_proxy = false`, THE Card_Status_Engine SHALL classify it as `original`
3. WHEN a Deck_Cards_Row has a non-null `physical_copy_id` linked to a Physical_Copy where `is_proxy = true`, THE Card_Status_Engine SHALL classify it as `proxy`
4. WHEN a Deck_Cards_Row has a null `physical_copy_id` AND at least one Available_Copy of that card exists (not held by any deck, not marked Missing), THE Card_Status_Engine SHALL classify it as `unallocated`
5. WHEN a Deck_Cards_Row has a null `physical_copy_id` AND every owned/proxied copy of that card is currently linked to another deck's Deck_Cards_Row (none free, but copies exist), THE Card_Status_Engine SHALL classify it as `claimed`
6. WHEN a Deck_Cards_Row has a null `physical_copy_id` AND no Physical_Copy of that card exists anywhere in the user's collection, THE Card_Status_Engine SHALL classify it as `unowned`
7. THE Card_Status_Engine SHALL treat `claimed` and `unallocated` as mutually exclusive — a slot cannot be both
8. WHEN a card has multiple Physical_Copies and some are free while others are held, THE Card_Status_Engine SHALL classify the slot as `unallocated` (a free candidate exists)

### Requirement 2: Generic Land Exemption

**User Story:** As a user, I want basic lands to remain exempt from the status taxonomy, so that they don't clutter my allocation view with irrelevant statuses.

#### Acceptance Criteria

1. WHEN a Deck_Cards_Row contains a generic basic land (Forest, Island, Mountain, Plains, Swamp, Wastes) with no specific Physical_Copy assigned, THE Card_Status_Engine SHALL skip status computation and return `generic_land`
2. WHEN a user deliberately assigns a specific Physical_Copy to a basic land slot, THE Card_Status_Engine SHALL drop the `generic_land` exemption and classify the slot through the standard five-state taxonomy
3. THE `generic_land` exemption SHALL NOT appear in filter chips, summary counts, or status badge UI — exempt slots are simply absent from the taxonomy display

### Requirement 3: Missing — Physical Copy Marker

**User Story:** As a user, I want to mark a physical card as "Missing" when I no longer have it (lost, damaged, sold), so that the system stops treating it as available without losing the historical record.

#### Acceptance Criteria

1. THE system SHALL support a `missing` boolean flag (default `false`) on each Physical_Copy row
2. WHEN a Physical_Copy is marked as Missing, THE system SHALL set `missing = true` on that row without deleting it
3. WHEN a Physical_Copy is marked as Missing AND it is currently linked to a Deck_Cards_Row (`physical_copy_id` references it), THE system SHALL unlink that Deck_Cards_Row by setting `physical_copy_id = null`
4. WHEN a Deck_Cards_Row is unlinked due to its Physical_Copy being marked Missing, THE Card_Status_Engine SHALL reclassify that slot through the standard five-state logic (may become `unowned`, `claimed`, or `unallocated` depending on other copies)
5. WHEN a Physical_Copy is marked Missing, THE system SHALL exclude it from all candidate pools — it SHALL NOT appear as an Available_Copy or as a Picklist candidate at any tier
6. WHEN a previously-Missing Physical_Copy is found (un-marked), THE system SHALL set `missing = false`, returning it to the Available_Copy pool — it does NOT automatically re-link to its prior deck slot
7. THE Missing marker SHALL be reversible — marking and un-marking are both supported without data loss
8. WHEN computing deck Completeness, THE system SHALL NOT count a slot whose Physical_Copy was unlinked due to Missing — the completeness count drops by one immediately

### Requirement 4: Playable / Unplayable — Deck-Level Badge

**User Story:** As a user, I want to see at a glance on the Decks Grid whether each Built deck is ready to play (all cards resolved) or has gaps, so that I can grab the right deck without opening it.

#### Acceptance Criteria

1. THE Decks_Grid SHALL display a Playable/Unplayable badge on every Built_Deck
2. WHEN a Built_Deck has Completeness = 100/100 (every Deck_Cards_Row has a non-null `physical_copy_id`), THE Decks_Grid SHALL display the **Playable** badge
3. WHEN a Built_Deck has Completeness < 100/100, THE Decks_Grid SHALL display the **Unplayable** badge
4. THE Playable/Unplayable badge SHALL NOT be stored as a database field — it is derived from Completeness on read
5. THE Playable/Unplayable badge SHALL only apply to Built_Decks — Brew decks (expected to be incomplete) and Archived decks SHALL NOT display this badge
6. THE Unplayable badge SHALL display alongside the raw N/100 count as supporting detail (available on hover or in the deck detail view) so the user can distinguish "99/100" from "60/100"
7. WHEN a Physical_Copy is marked Missing and a Built_Deck's slot is unlinked (Requirement 3), THE badge SHALL flip from Playable to Unplayable immediately without user action
8. WHEN a Tier 4 reassignment pulls a card from a Built_Deck (the Gitrog scenario), THE source deck's badge SHALL flip from Playable to Unplayable immediately

### Requirement 5: Hard Rename — Schema Migration

**User Story:** As a developer, I want the old status enum values replaced with the new taxonomy in a single migration, so that the codebase has one vocabulary with no legacy drift.

#### Acceptance Criteria

1. THE migration SHALL rename stored values in `deck_cards.ownership_status`: `'original'` replaces any value that previously indicated an owned non-proxy link, `'proxy'` replaces any value that indicated a proxy link
2. THE migration SHALL add a `missing` boolean column to `physical_copies` with a default of `false`
3. THE migration SHALL NOT rename or alter the `deck_cards.physical_copy_id` column — resolution mechanics are unchanged
4. AFTER the migration, THE `CardSlotStatus` TypeScript type SHALL be exactly: `'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned' | 'generic_land'`
5. THE migration SHALL remove the old values (`'allocated'`, `'allocated_proxy'`) from any CHECK constraint or application-level validation
6. THE migration SHALL be accompanied by a codemod pass updating every file that references the old `CardSlotStatus` values — stored values, type definitions, switch/case branches, UI labels, filter logic, and query parameters

### Requirement 6: Unified Vocabulary Across Cards Tab and Builder Search

**User Story:** As a user, I want the same status terms used in my deck's Cards tab and in the deck-builder card search, so that I don't have to translate between two naming systems.

#### Acceptance Criteria

1. THE Cards_Tab SHALL display status badges using the five-state taxonomy: Original, Proxy, Unallocated, Claimed, Unowned
2. THE deck-builder search (Brew mode card lookup) SHALL use the same five terms when showing a card's availability status relative to the user's collection
3. THE old builder-search vocabulary (`Owned`, `Proxy`, `Over-allocated`, `Unowned`) SHALL be removed — no UI path shall display those labels after this work ships
4. WHEN a card in builder search has all copies held by other decks, THE system SHALL label it `Claimed` — the same term the Cards tab uses for the equivalent state

### Requirement 7: Claimed Detection Logic

**User Story:** As a user, I want to know when a card I need is held by other decks (not absent from my collection entirely), so that I can decide whether to reassign or print a proxy.

#### Acceptance Criteria

1. THE Card_Status_Engine SHALL distinguish `claimed` from `unowned` by checking whether Physical_Copies of the card exist in the user's collection (excluding Missing copies)
2. WHEN at least one non-Missing Physical_Copy exists but ALL such copies have a `deck_cards.physical_copy_id` link to another deck, THE status SHALL be `claimed`
3. WHEN zero non-Missing Physical_Copies exist for the card, THE status SHALL be `unowned`
4. THE `claimed` classification SHALL account for multiple copies — if the user owns 3 copies and all 3 are held by other decks, the slot is `claimed` (not `unowned`)
5. THE `claimed` classification SHALL NOT consider the current deck's own resolved slots — only slots in OTHER decks count as "holding" a copy

### Requirement 8: Cards Tab Summary and Filters

**User Story:** As a user, I want the Cards tab header to show counts per status and let me filter by status, so that I can focus on cards that need attention.

#### Acceptance Criteria

1. THE Cards_Tab header SHALL display summary counts for each of the five states: Original, Proxy, Unallocated, Claimed, Unowned
2. THE Cards_Tab SHALL provide filter chips corresponding to each state — clicking a chip filters the card list to that status only
3. THE `generic_land` slots SHALL NOT appear in summary counts or filter chips
4. WHEN all filters are cleared, THE Cards_Tab SHALL display all cards (including generic lands in their collapsed display)
5. THE filter state SHALL be reflected in the URL or component state so it persists across tab switches within the same deck view

## Success Metrics

- **Vocabulary unification:** Zero UI paths display the old terms (`allocated`, `allocated_proxy`, `over-allocated`) after migration
- **Claimed accuracy:** Every slot classified as `claimed` has verifiably zero free copies of that card (all held by other decks or Missing)
- **Playable badge accuracy:** Every Built deck showing "Playable" has exactly 100/100 resolved slots; every "Unplayable" has < 100
- **Missing exclusion:** No Missing-flagged copy appears in any Picklist candidate list or Available_Copy count
- **Migration completeness:** No runtime references to old enum values remain in the deployed application

## Out of Scope

- **Ordered/Unordered (storage placement axis):** Confirmed separate work, definition unchanged from `refactoring-audit.md`. Only the terminology is renamed here (from Sorted/Unsorted); implementation is its own spec.
- **Shared Cards V2 migration:** Confirmed separate, per `refactoring-audit.md` Phase 2. Does not block this work.
- **Reconciliation scan (the trigger for Missing):** The mechanism that *detects* missing cards (deck reimport rebuild) is separate. This spec defines what Missing *means* and what happens when it's applied — not how it's detected.
- **Format legality ("Legal" badge):** Explicitly not this. Playable measures physical resolution only. A format-legality engine (banned lists, singleton rules, count minimums) is future work with its own taxonomy. The term "Legal" is reserved, not built here.
- **Reserve/Release/Break Down actions on Built decks:** These are lifecycle transitions defined in `oracle-deck-lifecycle-picklist-spec.md`. This spec consumes their effects (e.g., Break Down triggers unlinks which triggers reclassification) but does not redefine them.
- **Picklist UI redesign for "Claimed by [deck]" row treatment:** Dieter's domain — will be handled in design.md after requirements are accepted. This spec defines the data semantics, not the visual treatment.

## Risks

| Risk | Category | Mitigation |
|------|----------|------------|
| `claimed` requires knowing which copies are held by OTHER decks — potentially expensive query | Feasibility | Margaret to verify: can the existing supply-pool query (`buildAllocationInputV2` pattern) distinguish free vs held without a new expensive join? If not, scope a lightweight "held count" materialization. |
| Hard rename touches every consumer of `CardSlotStatus` — broad blast radius | Feasibility | Codemod pass with grep verification. James gates release on zero runtime references to old values. TypeScript compiler will catch most — runtime string comparisons (API responses, URL params) need manual audit. |
| "Claimed" may confuse users unfamiliar with the allocation model | Usability | Dieter to validate label in context. Fallback: tooltip "All copies of this card are in other decks" on the badge. |
| Missing-triggered unlink + recompute chain has multiple side effects (completeness drop, badge flip, picklist re-rank) | Feasibility | James to write integration test covering the full chain: mark Missing → unlink → completeness drops → badge flips → slot reclassifies. |
| Playable badge on grid could be misread as format legality | Usability | Naming constraint documented (Q4 in briefing). Badge label is "Playable" not "Legal." Tooltip clarifies "All 100 cards physically resolved." |

## Dependencies

- `src/lib/card-status.ts` — the file being rewritten (current single source of truth)
- `docs/oracle-deck-lifecycle-picklist-spec.md` Section 5 — defines the completeness computation this feature promotes
- `docs/oracle-deck-lifecycle-picklist-spec.md` Section 6c — defines Tier 4 confirmation (the Gitrog reassignment path)
- `deck_cards.ownership_status` column — stored values being renamed
- `physical_copies` table — gaining the `missing` column

## References

- Settled spec: `the-oracle/docs/taxonomy-work-briefing.md`
- Current implementation: `the-oracle/src/lib/card-status.ts`
- Lifecycle & Picklist: `the-oracle/docs/oracle-deck-lifecycle-picklist-spec.md`
- System audit: `the-oracle/docs/system-summary-and-audit.md`
- Refactoring audit: `the-oracle/docs/refactoring-audit.md`
