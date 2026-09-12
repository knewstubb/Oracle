# Implementation Plan: Monitor Mode

## Overview

Implement a deck health monitoring system that classifies cards into functional categories, compares counts against configurable thresholds, and surfaces a persistent health bar on the deck detail page. The implementation follows the established pattern: compute logic in `src/lib/` → SQLite persistence → Next.js API routes → TanStack Query in client components.

## Tasks

- [x] 1. Database schema and persistence layer
  - [x] 1.1 Create migration `db/migrations/012-deck-health.sql`
    - Add `deck_health` table with `deck_id` (PK, FK → decks(id) ON DELETE CASCADE), `result_json` (TEXT NOT NULL), `overall_status` (TEXT NOT NULL CHECK), `computed_at` (DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)
    - Add `health_overrides` nullable TEXT column to `deck_strategy` table
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

  - [x] 1.2 Implement `src/lib/health-store.ts`
    - `upsertHealthResult(db, result)` — INSERT OR REPLACE into deck_health
    - `getHealthResult(db, deckId)` — SELECT and parse result_json
    - `getHealthOverrides(db, deckId)` — read health_overrides from deck_strategy
    - `saveHealthOverrides(db, deckId, overrides)` — update deck_strategy.health_overrides
    - `clearHealthOverrides(db, deckId)` — set health_overrides to NULL
    - _Requirements: 1.5, 2.1, 2.2, 7.1, 7.4_

  - [ ]* 1.3 Write property test for upsert idempotence
    - **Property 3: Upsert Idempotence**
    - **Validates: Requirements 1.5**

- [x] 2. Category classification engine
  - [x] 2.1 Implement `src/lib/category-classifier.ts`
    - Define `FunctionalCategory` type and `ARCHIDEKT_CATEGORY_MAP` constant
    - Implement `mapArchidektCategory(rawCategories)` — Tier 1 mapping from Archidekt category strings
    - Implement `inferFromOracleText(oracleText, typeLine)` — Tier 2 heuristic rules per the design's pattern table
    - Implement `classifyCard(cardName, archidektCategories, oracleText, typeLine, overrides)` — full three-tier pipeline with priority: override > Archidekt > heuristic
    - Implement `classifyDeck(cards, overrides)` — classify all non-land cards in a deck
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.2 Write property test for classification priority order
    - **Property 5: Classification Priority Order**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [ ]* 2.3 Write property test for classification cardinality invariant
    - **Property 6: Classification Cardinality Invariant**
    - **Validates: Requirements 3.5**

  - [ ]* 2.4 Write unit tests for category classifier
    - Test Archidekt category mapping for known strings (Ramp, Card Draw, Wrath, etc.)
    - Test oracle text heuristic classification for known cards (mana dorks, counterspells, board wipes)
    - Test override takes precedence over both Archidekt and heuristic
    - Test cards with no oracle text or type line classify as 'Other'
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Health computation engine
  - [x] 3.1 Implement `src/lib/health-engine.ts`
    - Define types: `HealthStatus`, `CategoryHealth`, `HealthResult`, `ThresholdEntry`, `ThresholdSet`, `OverrideMap`
    - Define constants: `DEFAULT_AMBER_MARGIN`, `DEFAULT_THRESHOLDS`
    - Implement `mergeThresholds(defaults, overrides)` — merge global defaults with per-deck overrides, overrides take precedence
    - Implement `deriveStatus(actual, min, max, amberMargin)` — green/amber/red per the design's status derivation rules
    - Implement `deriveOverallStatus(categories)` — most severe status across all categories
    - Implement `selectMostSevereViolation(categories)` — prioritise red > amber, then furthest from target range
    - Implement `formatContextualNote(violation)` — plain-language note with category name, actual count, expected range
    - Implement `computeHealth(cards, overrides, healthOverrides)` — orchestrate classification → counting → threshold merge → status derivation
    - _Requirements: 4.4, 4.5, 6.2, 6.3, 6.4_

  - [ ]* 3.2 Write property test for status derivation correctness
    - **Property 7: Status Derivation Correctness**
    - **Validates: Requirements 4.5**

  - [ ]* 3.3 Write property test for overall status derivation
    - **Property 2: Overall Status Derivation**
    - **Validates: Requirements 1.4**

  - [ ]* 3.4 Write property test for threshold merge precedence
    - **Property 4: Threshold Merge Precedence**
    - **Validates: Requirements 2.2, 2.3**

  - [ ]* 3.5 Write property test for silent when healthy
    - **Property 8: Silent When Healthy**
    - **Validates: Requirements 6.1**

  - [ ]* 3.6 Write property test for most severe violation selection
    - **Property 9: Most Severe Violation Selection**
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 3.7 Write property test for contextual note content completeness
    - **Property 10: Contextual Note Content Completeness**
    - **Validates: Requirements 6.4**

  - [ ]* 3.8 Write property test for override removal reverts to default
    - **Property 11: Override Removal Reverts to Default**
    - **Validates: Requirements 7.4**

  - [ ]* 3.9 Write property test for health result JSON round-trip
    - **Property 1: Health Result JSON Round-Trip**
    - **Validates: Requirements 1.2**

  - [ ]* 3.10 Write unit tests for health engine edge cases
    - Test status derivation at exact boundary values (actual == min, actual == max)
    - Test status derivation at exact amber margin (actual == min - margin, actual == max + margin)
    - Test formatContextualNote produces expected string format
    - Test computeHealth with empty card list
    - _Requirements: 4.4, 4.5, 6.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. API routes
  - [x] 5.1 Implement `src/app/api/decks/[id]/health/route.ts` (GET)
    - Validate deck ID (400 if invalid), check deck exists (404 if not), return stored HealthResult from deck_health table (404 if no health data)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 5.2 Implement `src/app/api/decks/[id]/health/recheck/route.ts` (POST)
    - Validate deck ID, fetch deck cards with oracle text/type line/categories, load overrides, call `computeHealth`, upsert result, return updated HealthResult
    - _Requirements: 4.3, 8.2_

  - [x] 5.3 Implement `src/app/api/decks/[id]/health/overrides/route.ts` (GET, PUT, DELETE)
    - GET: return current overrides for the deck
    - PUT: validate and save overrides, trigger recomputation, return updated HealthResult
    - DELETE: clear overrides, trigger recomputation with global defaults, return updated HealthResult
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.1, 7.2, 7.3, 7.4_

- [x] 6. Health Bar UI component
  - [x] 6.1 Implement `src/components/HealthBar.tsx`
    - Fetch health data via TanStack Query with key `['decks', deckId, 'health']` and staleTime 5 minutes
    - Render pill strip: inline-flex row of rounded badges per category showing name + count
    - Apply colour classes: green (`bg-emerald-500/15 text-emerald-700`), amber (`bg-amber-500/15 text-amber-700`), red (`bg-red-500/15 text-red-700`)
    - Show contextual note below pills only when non-green categories exist
    - Implement recheck button (RefreshCw icon) with loading state and mutation that POSTs to `/health/recheck` and invalidates query
    - Implement pill click → `scrollIntoView` to corresponding category section
    - Handle loading/error states gracefully (hide pills on error, show skeleton on load)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 6.2 Write unit tests for HealthBar component
    - Test all-green state renders pills without contextual note
    - Test amber/red states show contextual note with correct message
    - Test recheck button triggers mutation and shows loading state
    - Test pill click calls scrollIntoView
    - _Requirements: 5.2, 5.5, 6.1, 6.2, 8.1, 8.3_

- [x] 7. Integration and wiring
  - [x] 7.1 Integrate HealthBar into deck detail page
    - Import and render `<HealthBar deckId={deckId} />` between the deck header and tab navigation on the deck detail page
    - Ensure it remains visible regardless of active tab
    - _Requirements: 5.1, 5.4_

  - [x] 7.2 Wire health recomputation into sync flow
    - After deck sync completes, call `computeHealth` for the synced deck and upsert the result
    - After manual override changes, trigger recomputation
    - _Requirements: 4.1, 4.2_

  - [ ]* 7.3 Write integration tests for health computation triggers
    - Test sync completion triggers health recomputation
    - Test override save triggers health recomputation
    - Test API routes return correct responses for valid/invalid inputs
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design's 11 formal properties
- Unit tests validate specific examples and edge cases
- The project uses Vitest + fast-check for property-based testing (established pattern in `src/lib/rating-engine.property.test.ts`)
- Migration number is 012, following the existing sequence in `db/migrations/`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2", "2.3", "2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 5, "tasks": ["6.1"] },
    { "id": 6, "tasks": ["6.2", "7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3"] }
  ]
}
```
