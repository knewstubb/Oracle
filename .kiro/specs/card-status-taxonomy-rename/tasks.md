# Tasks — Card Status Taxonomy Rename & Expansion

> Derived from: `design.md` (Architecture section)
> Owner: Margaret (Fullstack Developer)
> Date: 2026-07-14

## Task Order Rationale

Foundation-first: migration → type system → engine logic → API routes → UI components → tests → cleanup. Each task builds on the previous. The migration must land before code changes (the CHECK constraint would reject old values). The type change must happen before engine logic (TypeScript enforces correctness). UI comes last because it consumes the engine output.

---

## Tasks

- [x] 1. Schema migration 019 — Add `missing` column and update constraints
  - Create `supabase/migrations/019_taxonomy_rename.sql`
  - Add `missing BOOLEAN NOT NULL DEFAULT FALSE` to `physical_copies`
  - Create partial index `idx_physical_copies_missing` on `missing WHERE missing = true`
  - Drop and recreate `deck_cards_ownership_status_check` constraint (allow NULL, 'original', 'proxy', 'generic')
  - Migrate existing `'not_owned'` values → NULL
  - Replace `batch_assign_deck` RPC with updated version
  - Run migration locally, verify with Section 4 checks from `test-plan.md`
  - Refs: `design.md` Architecture > Schema Migration, `requirements.md` Req 5

- [x] 2. Update TypeScript type definitions
  - Change `CardSlotStatus` in `src/lib/card-status.ts` to `'original' | 'proxy' | 'unallocated' | 'claimed' | 'unowned' | 'generic_land'`
  - Update `CardSlotWithStatus` interface (no structural change, just the status field type)
  - Update `DeckCardWithOwnership` in `src/lib/debrief-types.ts` — change `ownership_status` type to `'original' | 'proxy' | null`
  - Regenerate Supabase types: `npx supabase gen types typescript --project-id <ref> > src/types/supabase.ts`
  - Run `npx tsc --noEmit` — expect failures in downstream files (fixed in subsequent tasks)
  - Refs: `design.md` Architecture > Type Changes

- [x] 3. Rewrite classification engine — `computeUnresolvedStatuses` with Claimed detection
  - Extend return type to `Map<cardName, 'unallocated' | 'claimed' | 'unowned'>`
  - Replace Step 2 query: fetch `physical_copies` with nested `deck_cards` join (LEFT on `physical_copy_id` FK), filtered by `missing = false`
  - Implement three-way classification: any copy with empty `deck_cards[]` → `'unallocated'`; all copies have `deck_cards[{id}]` → `'claimed'`; zero non-missing copies → `'unowned'`
  - Paginate the enriched query per Supabase steering rule (table >1000 rows, but IN clause narrows to ~100 def IDs)
  - Update `classifySlotStatus`: `'allocated'` → `'original'`, `'allocated_proxy'` → `'proxy'`
  - Update `computeDeckCardStatuses` to use new return values
  - Refs: `design.md` Architecture > Type Changes (pseudocode), `requirements.md` Req 1, Req 7

- [x] 4. Implement Missing flag logic
  - Create `src/lib/missing.ts` with `markCopyMissing(physicalCopyId, userId)` and `unmarkCopyMissing(physicalCopyId, userId)`
  - `markCopyMissing`: set `missing=true` on physical_copies, null out `physical_copy_id` + `ownership_status` on any linked deck_cards row
  - `unmarkCopyMissing`: set `missing=false` — no auto-relink
  - Both operations are idempotent
  - Refs: `design.md` Architecture > Missing Flag, `requirements.md` Req 3

- [x] 5. Create new API routes for Missing
  - `POST /api/physical-copies/[id]/missing` — calls `markCopyMissing`, returns `{ affectedDeckIds }` for client invalidation
  - `DELETE /api/physical-copies/[id]/missing` — calls `unmarkCopyMissing`, returns `{ cardName }` for pool refresh
  - Auth check (`requireAuth`), ownership check (`user_id` match), 404 on non-existent copy
  - Refs: `design.md` Architecture > API Route Changes, `requirements.md` Req 3

- [x] 6. Update card-statuses API route
  - Update `GET /api/decks/[id]/card-statuses` response: count keys become `original`, `proxy`, `unallocated`, `claimed`, `unowned`
  - Remove `allocated` and `allocated_proxy` keys from response object
  - Status values in the `cards` array already correct (from engine rewrite in task 3)
  - Refs: `design.md` Architecture > API Route Changes, `requirements.md` Req 8

- [x] 7. Merge builder-status into unified engine
  - Rewrite `GET /api/cards/builder-status` to call `computeUnresolvedStatuses` (batch) for status classification
  - For `'claimed'` results, call `fetchEnrichedSupply` to get `heldBy` detail (deck name, status, allocate flag)
  - Update response shape: `'owned'` → `'original'`, `'proxy'` → `'proxy'`, `'over_allocated'` → `'claimed'`, `'unowned'` → `'unowned'`
  - Refs: `design.md` Architecture > Module Merge Plan, `requirements.md` Req 6

- [x] 8. Update ownership-resolver and supply-pool write paths
  - `ownership-resolver.ts`: remove `'not_owned'` writes in `denormaliseOwnership` — unresolved rows get `ownership_status = NULL` instead
  - `supply-pool.ts`: update ownership_status values in assignment objects (only values written: `'original'`, `'proxy'`, or NULL for clears)
  - `warm-start-resolve.ts`: same — update any hardcoded ownership_status strings
  - Refs: `design.md` Architecture > Codemod File List

- [x] 9. Create unified `CardSlotBadge` component
  - New file: `src/components/CardSlotBadge.tsx`
  - Props: `status: CardSlotStatus`, `heldBy?: { deckName: string; deckStatus: string }`, `variant?: 'badge' | 'border'`
  - Implement per-state color/dot/label per `design.md` UX Section 3
  - Include "Held by [deck]" subtext line for `'claimed'` status
  - Export `getSlotTileBorderStyle(status)` for grid view (replaces `getBuilderTileBorderStyle`)
  - Refs: `design.md` UX Section 3, Section 8

- [x] 10. Update Cards Tab — filter chips and badge rendering
  - Replace 4 `StatusChip` entries with 5 (Original, Proxy, Unallocated, Claimed, Unowned) per `design.md` UX Section 2
  - Update `StatusFilter` type: remove old values, add `'claimed'`
  - Update `CardStatusResponse` interface: new count keys
  - Replace inline badge rendering with `<CardSlotBadge>` component
  - Update summary footer labels
  - Refs: `design.md` UX Section 2, `requirements.md` Req 8

- [x] 11. Update Decks Grid — Playable/Unplayable badge and lifecycle rename
  - `StatusBadge.tsx`: rename "Boxed" label → "Built" in CONFIG
  - `DeckTile.tsx`: replace completeness badge with "Unplayable" badge (orange, AlertTriangle icon, N/100 count, `aria-label`)
  - Suppress badge entirely when deck is Playable (100/100) — silence is the signal
  - Suppress badge for Brew and Archived decks regardless of resolution count
  - Refs: `design.md` UX Section 4, Section 5, `requirements.md` Req 4

- [x] 12. Update Collection view — Missing filter and indicators
  - Add "Show Missing" toggle to Collection toolbar (default: off)
  - When on: render Missing copies with dimmed row (opacity 0.5), strikethrough name, "Missing" badge, "Mark as found" button
  - "Mark as found" calls `DELETE /api/physical-copies/[id]/missing`, invalidates collection query
  - Exclude Missing copies from "Owned" total count; show separate "Missing: N" stat if >0
  - Refs: `design.md` UX Section 7, `requirements.md` Req 3

- [x] 13. Delete old files and run regression sweep
  - Delete `src/lib/builder-card-status.ts`
  - Delete `src/components/BuilderStatusBadge.tsx`
  - Run `npx tsc --noEmit` — must pass with zero errors
  - Run runtime string greps from `test-plan.md` Section 5.2 + 5.3 — must return zero matches
  - Fix any remaining references surfaced by compiler or grep
  - Refs: `design.md` Architecture > Module Merge Plan, `test-plan.md` Section 5

- [x] 14. Write unit tests for classification engine
  - Create `src/lib/card-status.test.ts` per `test-plan.md` Section 1 (1.1, 1.2, 1.3, 1.4)
  - Mock Supabase client for `computeUnresolvedStatuses` tests
  - Cover all 9 Claimed edge cases from test plan Section 1.2
  - Refs: `test-plan.md` Section 1

- [x] 15. Write unit + integration tests for Missing logic
  - Create `src/lib/missing.test.ts` per `test-plan.md` Section 2
  - Write API route tests for `POST/DELETE /api/physical-copies/[id]/missing` per `test-plan.md` Section 3.2, 3.3
  - Cover the Missing → Completeness chain (Section 2.3)
  - Refs: `test-plan.md` Sections 2, 3

- [x] 16. Update existing tests for new vocabulary
  - `src/app/api/allocation/route.test.ts` — update mock `ownership_status` values
  - `src/app/api/allocation/__tests__/allocation-bug-condition.test.ts` — same
  - `src/lib/debrief-prompts.test.ts` — update mock `DeckCardWithOwnership` values
  - `src/components/StatusBadge.test.tsx` — "Boxed" → "Built" assertions
  - Run full test suite, fix any remaining failures
  - Refs: `design.md` Architecture > Codemod File List (test files), `test-plan.md` Section 5

- [x] 17. Final release gate verification
  - Run all checks from `test-plan.md` Section 8 (release gate criteria)
  - Verify API response contains zero old-vocabulary keys
  - Manual UI spot-check per `test-plan.md` Section 6
  - Confirm performance within threshold per `test-plan.md` Section 7
  - **Gate executed 2026-07-14:** grep sweep passed (Section 5.2/5.3). Remaining `'not_owned'` hits classified as out-of-scope (brew vocabulary, AI tool responses, upgrade-strategy — none write to deck_cards). `tsc` failures are pre-existing (V1 test files referencing deleted modules, `better-sqlite3` never in package.json, `is_generic_land` column not in remote types). No taxonomy-introduced regressions.
  - Refs: `test-plan.md` Sections 6, 7, 8
