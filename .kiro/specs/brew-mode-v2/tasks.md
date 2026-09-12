# Implementation Plan: Brew Mode V2

## Overview

This plan implements the two-phase brew architecture (Exploration → Building), replacing the current single-phase brew flow. Tasks are sequenced to build the data layer first, then core state management, then UI components for each phase, and finally integration wiring. The existing `new-deck` page, `BrewContextPanel`, and brew session API routes will be refactored/replaced.

## Tasks

- [x] 1. Database migrations and data model
  - [x] 1.1 Create migration 020 to add `decision_log_json` and `assessment_cache_json` columns to `brew_sessions`, and update `brew_sessions.status` CHECK to include `exploring`, `building`, `complete`, `abandoned`
    - Add `decision_log_json TEXT DEFAULT '{"strategy":[],"parameters":[],"constraints":[]}'`
    - Add `assessment_cache_json TEXT DEFAULT '{}'`
    - Rebuild CHECK constraint on `brew_sessions.status`
    - _Requirements: 10.8, 4.5_

  - [x] 1.2 Create migration 021 to add `concept` value to `decks.status` CHECK constraint
    - Rebuild `decks` table CHECK to allow `'active', 'draft', 'concept'`
    - Ensure default remains `'active'`
    - _Requirements: 10.7_

  - [x] 1.3 Create TypeScript interfaces for Brew Mode V2 state in `src/lib/brew-v2-types.ts`
    - Define `BrewPhaseV2`, `BrewSessionState`, `DecisionLog`, `DecisionEntry`, `CommanderOption`, `CommittedCommander`, `DeckState`, `DeckCard`, `CardAssessment`, `CategoryHealth`
    - Export all interfaces for use across components and API routes
    - _Requirements: 2.1, 3.2, 8.1_

- [x] 2. Decision extraction and category logic
  - [x] 2.1 Implement decision categorization function in `src/lib/brew-v2-decisions.ts`
    - `categorizeDecision(entry)` maps decision types to sections: strategy-related → "Strategy", measurable → "Parameters", limitations → "Constraints"
    - Export decision type constants and section mapping
    - _Requirements: 4.3, 4.5_

  - [ ]* 2.2 Write property test for decision categorization
    - **Property 2: Decision Categorization**
    - Generate random decision entries with recognized types, verify correct section assignment
    - **Validates: Requirements 4.3, 4.5, 12.2**

  - [x] 2.3 Implement Archidekt category mapping in `src/lib/brew-v2-categories.ts`
    - `toArchidektCategories(card: DeckCard): string[]` — primary first, then additional
    - `fromArchidektCategories(categories: string[]): { primary: string, additional: string[] }` — first is primary, rest are additional
    - _Requirements: 8.4, 8.5_

  - [ ]* 2.4 Write property test for Archidekt category round-trip
    - **Property 3: Archidekt Category Round-Trip**
    - Generate random primary + additional category arrays, verify export→import identity
    - **Validates: Requirements 8.4, 8.5**

- [x] 3. Deck state management
  - [x] 3.1 Implement deck state reducer in `src/lib/brew-v2-deck-state.ts`
    - Actions: `addCard`, `removeCard`, `dragReassign`, `addSuggestion`, `setGenerating`
    - Reducer maintains cards array, suggestions array, counts per category, and total count
    - Health status calculation per category based on primary_category counts only
    - _Requirements: 6.6, 6.7, 7.7, 8.2, 8.3, 9.5, 9.6, 9.7, 13.3_

  - [ ]* 3.2 Write property test for primary category placement
    - **Property 4: Primary Category Determines Placement**
    - Generate random deck states, verify card counts match section counts per primary_category
    - **Validates: Requirements 8.2, 6.6**

  - [ ]* 3.3 Write property test for additional categories isolation
    - **Property 5: Additional Categories Don't Affect Health**
    - Generate random additional_categories mutations, verify health unchanged
    - **Validates: Requirements 8.3**

  - [ ]* 3.4 Write property test for drag reassign
    - **Property 6: Drag Reassign Updates Primary Category Only**
    - Generate random source/target category pairs, verify state mutations
    - **Validates: Requirements 9.5, 9.7**

  - [ ]* 3.5 Write property test for same-category drop idempotence
    - **Property 7: Drag to Same Category Is Idempotent**
    - Generate random cards, drop on own category, verify no state change
    - **Validates: Requirements 9.6**

  - [ ]* 3.6 Write property test for card removal count invariant
    - **Property 8: Card Removal Maintains Count Invariant**
    - Generate random removals, verify total decreases by 1 and card disappears
    - **Validates: Requirements 7.7, 6.7**

  - [ ]* 3.7 Write property test for suggestion transfer
    - **Property 10: Adding Suggestion Transfers Between Lists**
    - Generate random suggestions, verify list transfer and count updates
    - **Validates: Requirements 13.3**

  - [ ]* 3.8 Write property test for footer count invariant
    - **Property 11: Footer Count Invariant**
    - Generate random deck operations (add, remove, drag), verify footer equals sum of all sections
    - **Validates: Requirements 6.7**

- [x] 4. Session state machine and phase transition
  - [x] 4.1 Implement session state machine in `src/lib/brew-v2-session.ts`
    - `createSession()`, `commitCommander(session, commander)`, `saveConcept(session)`, `saveDraft(session)`
    - Phase transition logic: `exploring` → `building` on commander commit (never reverts)
    - _Requirements: 2.1, 2.3, 2.4, 5.5, 14.1, 14.2_

  - [ ]* 4.2 Write property test for phase transition
    - **Property 1: Phase Transition on Commander Commit**
    - Generate random valid commanders, verify transition from exploring→building, verify never reverts
    - **Validates: Requirements 2.3, 2.4, 5.5, 14.1**

  - [x] 4.3 Implement assessment cache logic in `src/lib/brew-v2-assessment-cache.ts`
    - `getCachedAssessment(sessionId, cardName): CardAssessment | null`
    - `cacheAssessment(sessionId, cardName, assessment): void`
    - Cache is per-session, stored in `brew_sessions.assessment_cache_json`
    - _Requirements: 7.6_

  - [ ]* 4.4 Write property test for assessment cache
    - **Property 9: Assessment Cache Prevents Duplicate Calls**
    - Generate random card names, verify cache hit returns identical result without model call
    - **Validates: Requirements 7.6**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. API routes
  - [x] 6.1 Create `/api/brew/chat` route (POST, SSE) for Sonnet exploration conversation
    - Stream Sonnet responses to client
    - After response complete, fire extraction call to Haiku (non-blocking)
    - Use `cache_control: { type: 'ephemeral' }` on system prompt
    - _Requirements: 11.1, 11.5, 4.1_

  - [x] 6.2 Create `/api/brew/extract` route (POST) for Haiku decision extraction
    - Accept Sonnet response text, invoke Haiku to extract decisions
    - Return extracted `DecisionEntry[]` with section assignments
    - Use `cache_control: { type: 'ephemeral' }` on system prompt
    - Persist extracted decisions to `brew_sessions.decision_log_json`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 11.2, 11.6_

  - [x] 6.3 Create `/api/brew/commit` route (POST) for commander commit and phase transition
    - Validate commander against Scryfall (existence, legality, colour identity)
    - Update session phase to `building`, store committed commander data
    - Return committed commander details
    - _Requirements: 5.6, 14.1, 14.4_

  - [x] 6.4 Create `/api/brew/skeleton` route (POST, SSE) for Sonnet skeleton generation
    - Accept session ID, use decision log context for card selection
    - Generate deck skeleton with primary_category and additional_categories per card
    - Stream progress to client
    - _Requirements: 11.3, 14.4, 14.5_

  - [x] 6.5 Create `/api/brew/assess` route (POST) for Haiku card assessment
    - Accept card name + deck context, return `CardAssessment` (pros, cons, fit_score, fit_note)
    - Check assessment cache before calling Haiku; cache result after
    - Use `cache_control: { type: 'ephemeral' }` on system prompt
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 11.4, 11.6_

  - [x] 6.6 Create `/api/brew/save` route (POST) for saving concept/draft/active deck
    - Handle three save modes: concept (exploring phase, no commander), draft (building phase, incomplete), active (building phase, complete)
    - Persist decision log for concepts, deck cards for drafts/active
    - _Requirements: 3.8, 10.7, 10.8_

- [x] 7. Exploration phase UI components
  - [x] 7.1 Create `BrewTopbar` component with `ExplorationTopbar` variant
    - Display: back navigation "[← Decks]", title "New brew", blue "Brew" badge, phase label "Exploring", green "● Session active" indicator
    - _Requirements: 2.2_

  - [x] 7.2 Create `DecisionLogPanel` component (260px right panel)
    - Render three sections: "Strategy", "Parameters", "Constraints"
    - Each `DecisionEntry`: key (9px uppercase muted), value (11px #d4d4d0), source quote (9px italic rgba(255,255,255,0.18))
    - Entry container: background rgba(255,255,255,0.04), border 0.5px solid rgba(255,255,255,0.07), rounded-md
    - New entry animation: blue tint (rgba(55,138,221,0.06)) fading to neutral over 3 seconds
    - "Commit to commander" button (disabled until commander surfaced)
    - "Save concept · decide later" button
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 7.3 Create `CommanderOptionsCard` component for inline chat rendering
    - Container: background rgba(55,138,221,0.05), border 0.5px solid rgba(55,138,221,0.18)
    - Each commander row: 32×44px art, name, colour pips, description, ownership status, "✓" commit button
    - Ownership: "You own this" (teal) or "Not in collection" (muted)
    - Commit button triggers phase transition
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 8. Building phase UI components
  - [x] 8.1 Create `BuildingTopbar` variant for `BrewTopbar`
    - Display: back navigation "[← Decks]", commander name, blue "Brew" badge, metadata strip (colour pips, bracket, archetype muted), green "● Session active"
    - _Requirements: 2.5_

  - [x] 8.2 Create `DeckWorkspacePanel` component (280px right panel)
    - Header: commander art (36×50px), name (12px/500), type line (10px muted), colour pips, archetype strip, blue-tinted background
    - Sub-tabs: "Deck list" (with count) and "Suggestions" (with count in blue)
    - Footer: "[N] / 100 cards" and "Save draft" button
    - _Requirements: 6.1, 6.2, 6.3, 6.7_

  - [x] 8.3 Create `DeckListTab` with pinned win condition sections and category sections
    - "Win conditions" pinned section with teal gradient accent
    - "Alt win conditions" pinned section with amber gradient accent
    - `CategorySection` per unique primary_category with header (name, count, health status)
    - _Requirements: 6.4, 6.5, 6.6_

  - [x] 8.4 Create `CardRow` component with ownership dot, name, pills, and CMC
    - Left to right: grip icon, ownership dot (6px: teal=owned, amber=proxy, faint+border=not owned), card name (11px, ellipsis), "also:" pills (blue), CMC (10px muted, right-aligned)
    - _Requirements: 7.1_

  - [x] 8.5 Create `CardTooltip` component (hover, positioned left of panel)
    - Display: card art, name, type line, oracle text, ownership badge, EDHREC %, price, hint text
    - _Requirements: 7.2_

  - [x] 8.6 Create `InlineAssessment` component (expand on card click, accordion)
    - Loading state: "● ● ● Assessing for this deck..."
    - Result: pros (green +), cons (red −), fit score bar (teal 8-10, amber 5-7, red 1-4), fit note, "Remove" and "Discuss" buttons
    - Collapse any previously expanded assessment on new click
    - _Requirements: 7.3, 7.4, 7.5, 7.7, 7.8_

  - [x] 8.7 Create `SuggestionsTab` component
    - Group suggestions by suggested primary_category
    - Each row: ownership dot, card name, "also:" pills, "+" add button, reason line (9px muted)
    - Hover shows CardTooltip
    - "+" click: add to deck list, remove from suggestions, update counts
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 9. Drag-to-reassign interaction
  - [x] 9.1 Implement drag-to-reassign on `CardRow` and `CategorySection` headers
    - Grip icon initiates drag on mousedown/touchstart
    - Source card renders at 0.4 opacity while dragging
    - Only `CategorySection` headers are valid drop targets (blue dashed border on hover)
    - On drop: update primary_category, recount sections, recalculate health, show Sonner toast "[Card] moved to [Category]" with teal check for 2.2s
    - Drop on same category → no-op
    - Drop outside valid target → cancel, restore opacity
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Dashboard tiles and deletion
  - [x] 11.1 Create `ConceptTile` component for dashboard
    - Display saved exploration sessions (no commander committed)
    - Hover reveals "Continue exploring" and "Delete concept" actions
    - Delete triggers inline confirmation (reuse `InlineDeleteConfirmation`)
    - _Requirements: 10.4_

  - [x] 11.2 Update `DraftDeckTile` for brew drafts
    - Dashed blue border, "Draft" badge
    - Hover reveals "Continue brewing" and "Delete draft" actions
    - Delete triggers inline confirmation
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 11.3 Update `DraftBanner` on deck detail page
    - Persistent banner between health strip and tabs: "Continue brewing" and "Delete draft" buttons
    - Only shown for draft-status decks
    - _Requirements: 10.5_

  - [x] 11.4 Implement active deck delete protection
    - Ensure no delete action is rendered anywhere for decks with status 'active'
    - Applies to dashboard tiles, detail page, and any panel context
    - _Requirements: 10.6_

  - [ ]* 11.5 Write property test for active deck delete protection
    - **Property 12: Active Decks Never Show Delete**
    - Generate random deck statuses, verify active never renders delete action
    - **Validates: Requirements 10.6**

- [x] 12. Entry point and colour identity picker removal
  - [x] 12.1 Update entry point labels to "+ Brew Deck"
    - Dashboard button: change label from "+ New Deck" to "+ Brew Deck"
    - Sidebar navigation: change label from "+ New Deck" to "+ Brew Deck"
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 12.2 Remove colour identity picker from brew flow
    - Remove any standalone colour identity picker UI component from the session
    - Colour identity is captured via conversation extraction into Decision Log "Parameters" section
    - Building phase derives colour identity from committed commander's Scryfall data
    - _Requirements: 12.1, 12.2, 12.3_

- [x] 13. Page wiring and phase transition integration
  - [x] 13.1 Refactor `src/app/new-deck/page.tsx` into Brew Mode V2 two-phase page
    - Use `BrewSessionState` to manage phase, decision log, deck state, and assessment cache
    - Render `ExplorationTopbar` or `BuildingTopbar` based on phase
    - Render `DecisionLogPanel` (260px) or `DeckWorkspacePanel` (280px) based on phase
    - Integrate `OracleChat` with `CommanderOptionsCard` rendering in message list
    - Phase transition: immediate panel swap + topbar update on commander commit (no loading screen)
    - _Requirements: 2.1, 2.3, 2.4, 2.6, 14.1, 14.2, 14.3_

  - [x] 13.2 Wire skeleton generation on phase transition
    - After phase transition, begin async skeleton generation via `/api/brew/skeleton`
    - Show loading state in DeckWorkspacePanel while generating
    - Populate deck list and suggestions when skeleton completes
    - _Requirements: 14.4, 14.5_

  - [x] 13.3 Wire decision extraction pipeline
    - After each Sonnet response, fire non-blocking extraction to `/api/brew/extract`
    - On extraction response, animate new entries into Decision Log panel
    - Silent failure — if extraction fails, panel simply doesn't update
    - _Requirements: 4.1, 4.2_

  - [x] 13.4 Wire card assessment flow
    - On card row click, check assessment cache
    - If cached, show immediately; if not, call `/api/brew/assess` and show loading state
    - Cache result in session state on completion
    - "Remove" button removes card, "Discuss" button pre-fills chat input with card name
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate the 12 universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- The existing `BrewContextPanel`, `BrewBriefCard`, `BrewConfirmationCard`, `BrewPathSelector`, and `BrewSkeletonPanel` components will be superseded by the new V2 components — they can be removed or deprecated after migration is complete
- Migration 016 (`brew-sessions`) and 017 (`deck-status`) already exist; new migrations extend rather than conflict with them

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.3", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.1", "4.3"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "4.2", "4.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.5", "6.6"] },
    { "id": 5, "tasks": ["6.4", "7.1", "7.2", "7.3"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 7, "tasks": ["8.6", "8.7", "9.1"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4", "12.1", "12.2"] },
    { "id": 9, "tasks": ["11.5", "13.1"] },
    { "id": 10, "tasks": ["13.2", "13.3", "13.4"] }
  ]
}
```
