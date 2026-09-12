# Implementation Plan: Upgrade Tab Expansion

## Overview

This plan extends the existing `UpgradeTab.tsx` with debrief integration, source-aware recommendation cards, toolbar sort/filter controls, a change log with Notion auto-sync, and a fresh analysis prompt. Implementation follows the structure: database migration → utility functions → API routes → component extensions → Notion integration → wiring.

## Tasks

- [ ] 1. Database migration for upgrade_change_log table
  - [x] 1.1 Create migration `017-upgrade-change-log.sql`
    - Add `upgrade_change_log` table with columns: `id`, `deck_id`, `cut_card`, `add_card`, `reason`, `skipped` (INTEGER 0/1), `date` (TEXT, default date('now'))
    - Add index on `deck_id` for efficient queries
    - Add `debrief_fixes` table if not already present (with `session_id`, `cut_card`, `add_card`, `status`, `reason`)
    - Verify migration integrates with the existing `runMigrations()` pattern in `src/lib/migrate.ts`
    - _Requirements: 11.1, 11.3, 11.4, 12.1, 12.2_

- [ ] 2. Sort and filter utility functions
  - [x] 2.1 Extract `sortCandidates` and `filterCandidates` into `src/lib/upgrade-candidates.ts`
    - Move existing `sortCandidates` from `UpgradeTab.tsx` into a standalone module
    - Implement sort modes: `impact` (descending), `cheapest` (price ascending), `owned` (ownership tier ascending), `edhrec` (percentage descending)
    - Implement `filterCandidates` supporting `owned_only` (ownership_status is 'original' or 'proxy') and `under_5` (price < 5)
    - Implement debrief-first partitioning: after filter and sort, all `source === 'debrief'` candidates precede all `source === 'analysis'` candidates
    - Export `SortMode`, `FilterChip`, `sortCandidates`, `filterCandidates`, and `partitionBySource` types/functions
    - _Requirements: 3.3, 3.7, 3.8, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 2.2 Write property tests for sort correctness (Property 4)
    - **Property 4: Sort function produces correctly ordered output**
    - Use `fast-check` with `fc.array(arbitraryCandidate())` and `fc.constantFrom('impact', 'cheapest', 'owned', 'edhrec')`
    - Verify consecutive pairs satisfy the mode's ordering invariant
    - Minimum 100 iterations
    - **Validates: Requirements 3.3**

  - [ ]* 2.3 Write property tests for owned-only filter (Property 5)
    - **Property 5: Owned-only filter excludes non-owned candidates**
    - Verify output contains only candidates with `add.ownership_status` of `'original'` or `'proxy'`
    - **Validates: Requirements 3.7**

  - [ ]* 2.4 Write property tests for under-$5 filter (Property 6)
    - **Property 6: Under-$5 filter excludes expensive candidates**
    - Verify no candidate with `add.price >= 5` appears in output
    - **Validates: Requirements 3.8**

  - [ ]* 2.5 Write property tests for debrief-first partition (Property 7)
    - **Property 7: Debrief-first partition ordering**
    - Verify all `source === 'debrief'` candidates appear before all `source === 'analysis'` candidates after the full pipeline (filter → sort → partition)
    - **Validates: Requirements 6.1, 6.2, 6.4**

  - [ ]* 2.6 Write property tests for within-partition sort (Property 8)
    - **Property 8: Within-partition sort ordering**
    - Verify that within each partition (debrief and analysis), consecutive pairs satisfy the active SortMode comparator
    - **Validates: Requirements 6.3**

- [x] 3. Implement `formatChangeLogEntry` and change log utilities
  - [x] 3.1 Create `src/lib/upgrade-changelog.ts`
    - Implement `formatChangeLogEntry(cut: string, add: string, action: 'applied' | 'skipped', reason: string, date: string): string` that produces Notion-compatible markdown
    - Implement `computeThisMonthCount(entries: ChangeLogEntry[]): number` that counts applied entries from the current calendar month
    - _Requirements: 11.2, 12.5_

  - [ ]* 3.2 Write property test for month count accuracy (Property 9)
    - **Property 9: Change log month count accuracy**
    - Verify `thisMonthCount` equals count of entries where `skipped === false` and `date` is in the current month/year
    - **Validates: Requirements 11.2**

  - [ ]* 3.3 Write property test for change log ordering (Property 10)
    - **Property 10: Change log reverse chronological order**
    - Verify for adjacent pairs (i, i+1): `new Date(entries[i].date) >= new Date(entries[i+1].date)`
    - **Validates: Requirements 11.5**

  - [ ]* 3.4 Write property test for Notion entry format (Property 11)
    - **Property 11: Notion entry format completeness**
    - Verify `formatChangeLogEntry` output contains all five fields: cut card name, add card name, action type, reason, and date
    - **Validates: Requirements 12.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. API route: POST `/api/decks/[id]/upgrade/apply`
  - [x] 5.1 Create `src/app/api/decks/[id]/upgrade/apply/route.ts`
    - Accept `{ cut: string, add: string }` request body
    - Validate deck exists and request body is well-formed
    - DELETE the cut card from `deck_cards` for this deck
    - INSERT the add card into `deck_cards` for this deck
    - INSERT into `upgrade_change_log` with `skipped = 0`
    - Fire-and-forget: call `appendNotionNotes` with formatted entry (don't await/block response)
    - Return `{ success: true, change_log_id: number }`
    - _Requirements: 8.2, 12.1, 12.3, 12.4_

  - [ ]* 5.2 Write unit tests for apply route
    - Test successful apply with valid body returns 200 and change_log_id
    - Test invalid deck ID returns 400
    - Test missing body fields returns 400
    - Test Notion failure does not block the response
    - _Requirements: 8.2, 12.3, 12.4_

- [x] 6. API route: POST `/api/decks/[id]/upgrade/skip`
  - [x] 6.1 Create `src/app/api/decks/[id]/upgrade/skip/route.ts`
    - Accept `{ cut: string, add: string }` request body
    - Validate deck exists and request body is well-formed
    - INSERT into `upgrade_change_log` with `skipped = 1`
    - Remove candidate from active `deck_upgrades` content
    - Fire-and-forget: call `appendNotionNotes` with formatted skip entry
    - Return `{ success: true }`
    - _Requirements: 8.3, 12.2, 12.3, 12.4_

  - [ ]* 6.2 Write unit tests for skip route
    - Test successful skip returns 200
    - Test candidate removed from deck_upgrades active list
    - Test change log entry has `skipped = 1`
    - _Requirements: 8.3, 12.2_

- [x] 7. API route: POST `/api/decks/[id]/upgrade/refresh`
  - [x] 7.1 Create `src/app/api/decks/[id]/upgrade/refresh/route.ts`
    - Validate deck exists
    - Clear existing candidates from `deck_upgrades` for this deck
    - Re-run upgrade engine (EDHREC staples, dead weight, debrief fixes merge)
    - Write new candidates to `deck_upgrades`
    - Return `{ success: true, candidate_count: number }`
    - _Requirements: 4.2, 4.4, 4.5_

  - [ ]* 7.2 Write unit tests for refresh route
    - Test successful refresh returns candidate_count
    - Test failure returns error toast-compatible response
    - _Requirements: 4.4, 4.5_

- [x] 8. API route: GET `/api/decks/[id]/debrief-session`
  - [x] 8.1 Create `src/app/api/decks/[id]/debrief-session/route.ts`
    - Query `debrief_sessions` for the most recent session by deck ID (status = 'complete' or 'recommending')
    - Join with `debrief_actions` to compute `total_fixes`, `reviewed_fixes`, `applied`, `skipped`, `pending` counts
    - Build `changes` array from actions: `{ from, to, skipped }`
    - Return `DebriefSession` object or `null` if no session exists
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 13.1_

  - [ ]* 8.2 Write unit tests for debrief-session route
    - Test returns null/404 when no session exists
    - Test returns correct aggregated counts from debrief_actions
    - Test returns changes array with skipped status
    - _Requirements: 1.1, 1.5, 13.5_

- [x] 9. Extend GET `/api/decks/[id]/upgrade` route
  - [x] 9.1 Modify existing `src/app/api/decks/[id]/upgrade/route.ts`
    - Extend response to include `change_log` array from `upgrade_change_log` (ordered by date DESC)
    - Ensure each candidate in `content` JSON includes `source` field ('debrief' or 'analysis')
    - Enrich candidates with ownership status from `collection` + `deck_cards` tables
    - Detect proxy conflicts using existing proxy allocation layer
    - Return `{ candidates: UpgradeCandidate[], change_log: ChangeLogEntry[] }`
    - _Requirements: 5.1, 5.2, 9.1, 9.5, 11.5, 13.2_

- [x] 10. Checkpoint - Ensure all API tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Extend DebriefBanner component
  - [x] 11.1 Update `DebriefBanner` in `src/components/UpgradeTab.tsx`
    - Render banner conditionally: only when debrief session query returns non-null
    - Display session date, reviewed/total counts, applied/skipped/pending counts
    - Render applied changes as teal pill tokens with "from → to" card names
    - Render skipped changes in muted styling with "Skipped:" prefix
    - Conditionally show "Resume debrief" button only when `reviewed_fixes < total_fixes`
    - Apply styling: background rgba(29,158,117,0.05), border 0.5px solid rgba(29,158,117,0.2), sword icon in teal
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 11.2 Write property tests for banner conditional rendering (Properties 1, 2, 3)
    - **Property 1: Debrief banner conditional rendering** — banner present iff session is non-null
    - **Property 2: Resume button conditional on pending fixes** — button present iff `reviewed_fixes < total_fixes`
    - **Property 3: Banner displays all session fields and changes** — all fields rendered, skipped items have "Skipped:" prefix
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

- [x] 12. Extend Toolbar component
  - [x] 12.1 Update `Toolbar` in `src/components/UpgradeTab.tsx`
    - Ensure segmented control renders four SortMode options (Impact, Cheapest, Owned, EDHREC)
    - Default active sort to 'impact' on initial render
    - Render toggleable filter chips: "Owned only" and "Under $5" with active/inactive styling
    - Active chip: background rgba(29,158,117,0.15), border 0.5px solid rgba(29,158,117,0.4), teal text
    - Inactive chip: background rgba(255,255,255,0.04), border 0.5px solid rgba(255,255,255,0.1), muted text
    - Render "Refresh analysis" button right-aligned with spinning icon when loading
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3_

- [x] 13. Extend UpgradeCard component
  - [x] 13.1 Update `UpgradeCard` in `src/components/UpgradeTab.tsx`
    - Add `onDiscuss` prop: navigates to OracleChat with the candidate's add card as topic
    - Render teal left accent border when `source === 'debrief'`
    - Ensure header row shows priority, ImpactBar, and SourceBadge
    - Ensure two-column layout: Cut (red minus, card name, reason, ownership badge) | Add (teal plus, card name, reason, ownership badge, EDHREC %, price)
    - Render action row: "Make change" (teal primary), "Skip" (neutral secondary), "Discuss in debrief" (tertiary right-aligned)
    - Disable buttons while mutation is in progress
    - Render `ConflictAlert` inline when `candidate.conflict` is truthy
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4_

- [x] 14. Extend ChangeLogSection component
  - [x] 14.1 Update `ChangeLogSection` in `src/components/UpgradeTab.tsx`
    - Display heading "Change log" with month count (applied entries in current month)
    - Applied entries: filled teal dot, "Cut [card] → Added [card]", date, reason
    - Skipped entries: empty/muted dot, "Skipped: [card] → [card]" in muted styling, date
    - Sort entries reverse chronological (most recent first)
    - Conditionally hide section if no entries exist
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 15. Extend FreshAnalysisPrompt component
  - [x] 15.1 Update `FreshAnalysisPrompt` in `src/components/UpgradeTab.tsx`
    - Render dashed border section with sparkles icon, heading, description text
    - "Run analysis" button triggers same refresh mutation as toolbar
    - Button shows spinning icon and disabled state while running
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 16. Checkpoint - Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Notion integration wiring
  - [x] 17.1 Wire `appendNotionNotes` calls into apply and skip route handlers
    - Import `appendNotionNotes` from `src/lib/notion-sync.ts`
    - Import `formatChangeLogEntry` from `src/lib/upgrade-changelog.ts`
    - Apply route: fire-and-forget with `.catch(err => console.error('[Notion sync failed]', err))`
    - Skip route: same fire-and-forget pattern
    - Verify Notion failure logs to console but does not propagate to client
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 17.2 Write integration test for Notion fire-and-forget
    - Mock `appendNotionNotes` in apply route test
    - Verify it's called with correct formatted entry
    - Verify failure does not throw or block the response
    - _Requirements: 12.3, 12.4_

- [x] 18. Wire data fetching and mutations in UpgradeTab
  - [x] 18.1 Connect TanStack Query hooks in `UpgradeTab` root component
    - `useQuery(['decks', deckId, 'debrief-session'])` with staleTime 5 min
    - `useQuery(['decks', deckId, 'upgrade'])` with staleTime 5 min
    - `useMutation` for apply: POST `/api/decks/[id]/upgrade/apply`, invalidate `['decks', deckId, 'upgrade']` and `['decks', deckId]`
    - `useMutation` for skip: POST `/api/decks/[id]/upgrade/skip`, invalidate `['decks', deckId, 'upgrade']`
    - `useMutation` for refresh: POST `/api/decks/[id]/upgrade/refresh`, invalidate `['decks', deckId, 'upgrade']`
    - Show skeleton loading states while data fetches
    - Pass sort/filter state through `sortCandidates` → `filterCandidates` → `partitionBySource` pipeline before rendering
    - Wire "Discuss in debrief" navigation via `router.push` to OracleChat with card name param
    - Display success/error toasts on mutation completion
    - Gracefully hide DebriefBanner when session fetch fails or returns null
    - _Requirements: 4.4, 4.5, 8.2, 8.3, 8.5, 8.6, 8.7, 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `UpgradeTab.tsx` already has substantial structure (interfaces, sort/filter, sub-components) — tasks extend in-place rather than rewriting
- The existing `appendNotionNotes` in `src/lib/notion-sync.ts` provides the fire-and-forget Notion write pattern
- Migration naming follows the existing `NNN-description.sql` convention (next: `017-`)
- All API routes follow the existing `src/app/api/decks/[id]/...` pattern

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["5.1", "6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["5.2", "6.2", "7.2", "8.2", "9.1"] },
    { "id": 4, "tasks": ["11.1", "12.1", "13.1", "14.1", "15.1"] },
    { "id": 5, "tasks": ["11.2", "17.1"] },
    { "id": 6, "tasks": ["17.2", "18.1"] }
  ]
}
```
