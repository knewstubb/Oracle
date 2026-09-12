# Implementation Plan: Brew Session Autosave

## Overview

This plan implements transparent background persistence for the brew page. The sequencing prioritizes foundational pieces (serializers) first, then the API route, then the client-side hook and loader, and finally wiring everything together in the page component. Each step builds on the previous, and nothing is left orphaned.

## Tasks

- [x] 1. Implement serialization helpers
  - [x] 1.1 Create `src/lib/brew-autosave-serializers.ts` with all serialization/deserialization functions
    - Implement `serializeMessages` — caps at 500 messages, trims content to 50k chars, outputs JSON with role, content, timestamp (ISO 8601), and cost fields
    - Implement `deserializeMessages` — parses JSON string, returns `ChatMessage[]` or empty array on failure
    - Implement `serializeDecisionLog` — serializes full DecisionLog structure as JSON string
    - Implement `deserializeDecisionLog` — parses JSON string, returns DecisionLog or default empty log on failure
    - Implement `serializeDeckState` — serializes cards, suggestions, canvasPositions, explorationArchive; excludes isGenerating
    - Implement `deserializeDeckState` — parses JSON string, returns DeckState with isGenerating always false, or default empty DeckState on failure
    - All deserializers use try/catch with fallback defaults; emit `console.warn` on malformed input
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 2.2, 2.3, 2.4, 3.2, 3.3, 3.4, 4.2_

  - [ ]* 1.2 Write property test: Message Serialization Round-Trip (P1)
    - **Property 1: Message Serialization Round-Trip**
    - Generate arbitrary arrays of `{ role: oneof('user','assistant'), content: string(0..50000), timestamp: nat(), cost: float() }`
    - Assert serialize then deserialize produces matching role, content, timestamp (ISO 8601), and cost
    - Test file: `src/lib/__tests__/brew-autosave-serializers.property.test.ts`
    - **Validates: Requirements 1.2, 1.3**

  - [ ]* 1.3 Write property test: Decision Log Serialization Round-Trip (P2)
    - **Property 2: Decision Log Serialization Round-Trip**
    - Generate arbitrary DecisionLog with random entries per section (strategy, parameters, constraints)
    - Assert serialize then deserialize preserves all entries in order
    - Test file: `src/lib/__tests__/brew-autosave-serializers.property.test.ts`
    - **Validates: Requirements 2.2, 2.4**

  - [ ]* 1.4 Write property test: Deck State Serialization Round-Trip (P3)
    - **Property 3: Deck State Serialization Round-Trip (isGenerating Exclusion)**
    - Generate arbitrary DeckState with random cards, positions, archive items, and random isGenerating boolean
    - Assert serialize then deserialize produces matching cards, suggestions, canvasPositions, explorationArchive AND isGenerating is always false
    - Test file: `src/lib/__tests__/brew-autosave-serializers.property.test.ts`
    - **Validates: Requirements 3.2, 3.4, 4.2, 4.4**

  - [ ]* 1.5 Write property test: Malformed Input Resilience (P4)
    - **Property 4: Malformed Input Resilience**
    - Generate arbitrary strings (unicode, partial JSON, null bytes, empty string, null)
    - Assert `deserializeMessages` returns [], `deserializeDecisionLog` returns default empty log, `deserializeDeckState` returns default DeckState
    - Test file: `src/lib/__tests__/brew-autosave-serializers.property.test.ts`
    - **Validates: Requirements 1.4, 2.3, 3.3**

  - [ ]* 1.6 Write property test: Message Cap Preserves Most Recent (P5)
    - **Property 5: Message Cap Preserves Most Recent**
    - Generate arrays of length 1–1000
    - Assert that when N > 500, serialized output contains exactly the last 500 messages in original order
    - Test file: `src/lib/__tests__/brew-autosave-serializers.property.test.ts`
    - **Validates: Requirements 1.5**

- [x] 2. Checkpoint — Serializers complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement PATCH API route
  - [x] 3.1 Create `src/app/api/brew/session/[id]/route.ts` with PATCH handler
    - Validate `id` path param as a positive integer; return 400 if invalid
    - Validate request body — reject empty body (no fields to update); return 400
    - Accept optional fields: `conversation_json`, `decision_log_json`, `skeleton_json`, `status`, `commander_name`, `colour_identity`, `path_type`
    - For `skeleton_json`: implement read-merge-write — read existing skeleton_json from DB, parse it, deep-merge only the keys present in the request payload, write merged result back
    - Set `updated_at` to current ISO timestamp
    - Return 200 `{ success: true, updated_at }` on success, 404 if session not found, 500 on DB error
    - Use existing `getBrewSession` and `updateBrewSession` from `src/lib/brew-v2-session.ts`
    - _Requirements: 4.3, 6.2_

  - [ ]* 3.2 Write unit tests for skeleton merge logic (P7)
    - **Property 7: Skeleton Merge Preserves Sibling Fields**
    - Test that PATCHing only canvasPositions preserves existing cards, suggestions, and explorationArchive unchanged
    - Test that PATCHing only cards preserves existing canvasPositions, suggestions, and explorationArchive
    - Test various merge combinations with random skeleton objects and random position updates
    - Test file: `src/app/api/brew/session/__tests__/brew-session-patch.property.test.ts`
    - **Validates: Requirements 4.3**

- [x] 4. Implement useBrewAutosave hook
  - [x] 4.1 Create `src/hooks/useBrewAutosave.ts`
    - Accept `UseBrewAutosaveOptions`: sessionId, messages, decisionLog, deckState, phase, commander
    - Return `UseBrewAutosaveReturn`: isSaving, lastSavedAt, flush()
    - Track previous state via `useRef` comparisons — mark dirty fields in a `Set<DirtyField>` on referential inequality
    - Implement 2000ms trailing-edge debounce timer — reset on each new dirty field marking
    - On timer expiry: call `PATCH /api/brew/session/[id]` with only dirty fields serialized using the serialization helpers from task 1.1
    - Map `phase_commander` dirty field to `status`, `commander_name`, `colour_identity`, `path_type` in the request body
    - On `beforeunload` and Next.js route change: flush pending writes via `navigator.sendBeacon` (fallback to `fetch` with `keepalive: true`)
    - Implement single retry on 5xx/network failure after 5000ms using latest state at retry time
    - Skip retry on 4xx — log `console.warn` and continue
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, 6.3, 6.4, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 4.2 Write property test: Debounce Batches Dirty Fields Into Single Write (P6)
    - **Property 6: Debounce Batches Dirty Fields Into Single Write**
    - Generate random sequences of field changes across tracked fields within a 2000ms window
    - Assert exactly one API call fires containing all changed fields, only after 2000ms of inactivity
    - Use fake timers (vi.useFakeTimers) to control debounce
    - Test file: `src/hooks/__tests__/useBrewAutosave.property.test.ts`
    - **Validates: Requirements 1.1, 2.1, 3.1, 6.1, 6.2, 6.4**

  - [ ]* 4.3 Write property test: Phase Transition Serialization (P8)
    - **Property 8: Phase Transition Serialization**
    - Generate random CommittedCommander objects with non-empty name and colourIdentity array
    - Assert that transitioning from exploring to building persists correct status, commander_name, colour_identity, path_type
    - Assert hydration from persisted values reconstructs matching session state
    - Test file: `src/hooks/__tests__/useBrewAutosave.property.test.ts`
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 4.4 Write property test: Recovery After Failed Save (P9)
    - **Property 9: Recovery After Failed Save**
    - Generate random state pairs (failed state S, subsequent state S')
    - Mock failed persistence (5xx), advance past retry exhaustion, then trigger new state change
    - Assert new save attempt uses full current state S', not the previously failed S
    - Test file: `src/hooks/__tests__/useBrewAutosave.property.test.ts`
    - **Validates: Requirements 8.4**

- [x] 5. Checkpoint — Hook complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement session loader and page integration
  - [x] 6.1 Enhance existing `GET /api/brew/session` to return all fields when `id` query param is provided
    - Add handling for `GET /api/brew/session?id=X` — return full session row (conversation_json, decision_log_json, skeleton_json, status, commander_name, colour_identity, path_type)
    - Return 404 if session not found
    - Keep existing POST (create) behavior unchanged
    - _Requirements: 7.1, 7.3_

  - [x] 6.2 Implement session loader logic in `src/app/new-deck/page.tsx`
    - On mount, read `sessionId` from URL searchParams
    - If present: fetch full session row via `GET /api/brew/session?id=X`
    - Hydrate each state slice using deserializers from task 1.1:
      - `conversation_json` → messages state
      - `decision_log_json` → session.decisionLog
      - `skeleton_json` → deckState (cards, suggestions, canvasPositions, explorationArchive) with isGenerating=false
      - `status` + `commander_name` + `colour_identity` → session phase + commander
    - If `status === 'building'` and `commander_name` present: reconstruct CommittedCommander (resolve artUrl from Scryfall)
    - If reconstruction fails: fall back to exploring phase, log console.warn
    - If no `sessionId` in URL: create new session (existing behavior), then replace URL with `?sessionId=X` using `history.replaceState`
    - If session fetch fails (404): create new session and replace URL
    - Show loading indicator while hydrating; do not render chat/canvas in empty state during load
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4_

  - [x] 6.3 Wire `useBrewAutosave` hook into `src/app/new-deck/page.tsx`
    - Import and call `useBrewAutosave` with current sessionId, messages, session.decisionLog, deckState, session.phase, session.commander
    - Remove or bypass the existing `useCanvasPositions` write path (positions now flow through the unified hook)
    - Optionally expose `isSaving` / `lastSavedAt` in UI (e.g., subtle indicator in topbar)
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

- [x] 7. Final checkpoint — Full integration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check via Vitest
- Unit tests validate specific examples and edge cases
- The existing `useCanvasPositions` hook's write path is superseded by `useBrewAutosave` but remains in the codebase for backward compatibility
- All serializers are pure functions with no side effects — easy to test in isolation
- The PATCH route's read-merge-write for skeleton_json prevents data loss when only a subset of skeleton fields are dirty

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "6.1"] },
    { "id": 4, "tasks": ["6.2"] },
    { "id": 5, "tasks": ["6.3"] }
  ]
}
```

