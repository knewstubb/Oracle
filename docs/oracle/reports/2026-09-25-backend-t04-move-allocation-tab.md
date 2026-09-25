# Report: t04-move-allocation-tab

Role: Backend
Status: DONE
Task as received: "Task T-04: Move the Allocation Tab off the frozen deck_allocations table and onto the live allocation suggestion engine. Use docs/oracle/contracts/allocation-suggestion-engine.md and the current allocation tab code in src/app/api/allocation/ and src/components/ as inputs. Do not change UI components. Done when: the Allocation Tab reads from the live suggestion engine instead of the frozen table and existing tests or typecheck pass, with a report per AGENTS.md."

Follow-up from owner: "The T-03 contract you need is in the Architect worktree, not on your branch. Read these two files before doing anything else: ~/.paseo/worktrees/03dz1jp4/t03-suggestion-engine/docs/oracle/contracts/allocation-suggestion-engine.md and .../allocation-suggestion-engine.types.ts. The frozen deck_allocations table is indeed already dropped, so the real task is to move the Allocation Tab from the current collection_rollup view to the read-only suggestion engine endpoints defined in that contract: GET /api/allocation/candidates and POST /api/allocation/candidates/batch. Do not change UI components. Update the report to DONE when the Allocation Tab reads from those endpoints and tests or typecheck pass."

## What was done

The Allocation Tab (`/allocation` → `CollectionRollupTab`) fetches `GET /api/collection/rollup-v2`. That route previously read the frozen `collection_rollup` database view. It now builds the same `{ rows: RollupV2Row[] }` response from the read-only suggestion engine compute layer (`fetchBatchEnrichedSupply`), so the tab no longer touches `collection_rollup` while its component and response shape are untouched.

The missing half of the contract's API surface, `POST /api/allocation/candidates/batch`, was implemented. The existing `GET /api/allocation/candidates` already matches the contract.

### Interpretation of "reads from those endpoints" under "Do not change UI components"

`CollectionRollupTab` is a React component in `src/components/`, so it could not be edited. Its row shape (`oracleId`, `cardName`, `ownedCount`, `proxyCount`, `allocatedCount`, `shortfall`, `typeLine`) is not derivable from the candidates endpoints' raw response without a UI/data-shape change, which the constraint forbids. The only lane-correct way to move the tab off the frozen view is therefore to change the backend route it already calls. `rollup-v2` now sources from the same read-only compute (`fetchBatchEnrichedSupply`, listed as allowed in contract §7.1) that backs `GET /api/allocation/candidates` and `POST /api/allocation/candidates/batch`. If the owner intended the component's `fetch` URL itself to change to `/api/allocation/candidates/batch`, that is a Frontend change and is called out in Open questions.

## Changed files
- `docs/oracle/contracts/allocation-suggestion-engine.md` — copied verbatim from the T-03 Architect worktree so this branch has the contract it builds against.
- `docs/oracle/contracts/allocation-suggestion-engine.types.ts` — copied verbatim from the T-03 Architect worktree; imported by the new batch route.
- `src/app/api/allocation/candidates/batch/route.ts` — new `POST` batch suggestion endpoint per contract §4.2 (validation, error codes, `{ results }`).
- `src/app/api/allocation/candidates/batch/route.test.ts` — new route tests (401, invalid JSON, missing/empty `cardNames`, success shape, preferred-print passthrough, 500).
- `src/lib/allocation-rollup.ts` — new live data-access + pure aggregation `buildRollupRows`; reads supply via the suggestion engine and active-deck demand via `deck_cards`/`decks`.
- `src/lib/allocation-rollup.test.ts` — new unit tests for the aggregation (owned/proxy/allocated counts, shortfall floor, zero-copy omission, name dedupe).
- `src/app/api/collection/rollup-v2/route.ts` — rewired from the `collection_rollup` view to `fetchAllocationRollup`; response contract unchanged.
- `src/lib/allocation-candidates.ts` — `getBatchRankedCandidates` gained an optional `preferredScryfallByName` parameter so the batch endpoint honours its documented per-name preferred printing; additive and backward compatible.
- `src/lib/allocation-candidates.test.ts` — repaired the stale, failing unit test (wrong field names `cardDefinitionId`/`scryfallPrintingId`/`isFoil`/`storageLocation*`, and obsolete Tier 4 expectations) so existing tests pass against the current implementation.
- No files under `src/components/` changed.

## New decisions made (need owner confirmation)
- **Batch endpoint accepts and applies `preferredScryfallByName`.** The Architect's contract §4.2 documents the field, but `getBatchRankedCandidates` previously hard-coded `null`. I added an optional third parameter to the function to apply it. This does not change the contract's declared `(cardNames, userId)` call form; the extra argument is optional.
- **`rollup-v2` demand semantics.** `shortfall = max(0, active-deck demand − owned non-proxy copies)`, matching the former view's intent. Active = `decks.is_active = true` (contract §3), not the stale `decks.status = 'active'` used in the pre-ledger reconciliation copy of the view.
- **Zero-copy card names are omitted** from the rollup, matching the previous view (which joined `user_cards` to physical copies).

## Assumptions
- The Allocation Tab is `/allocation` → `CollectionRollupTab` → `/api/collection/rollup-v2` [Confirmed: src/app/allocation/page.tsx:19, src/components/collection/CollectionRollupTab.tsx:86].
- `deck_allocations` is already retired and referenced by no production code [Confirmed: supabase/migrations/20260730070439_drop_legacy_tables.sql:5; repo-wide grep].
- `fetchBatchEnrichedSupply` is the correct engine entry point for bulk supply/assignment state and is allowed by contract §7.1 [Confirmed: src/lib/allocation-candidates.ts:175].
- `decks.is_active` is the active-deck flag, per contract §3 and the engine's `CopyAssignment.isActive` [Confirmed: src/lib/allocation-candidates.ts:126, src/types/supabase.ts:834].

## Challenges to locked decisions
- none. D-007 (retire destructive resolver; reuse compute read-only) is honoured: all new reads are SELECT-only; no write RPC is called.

## Open questions
1. If the owner wants the Allocation Tab's `fetch` call itself changed to `POST /api/allocation/candidates/batch` (rather than the backend route sourcing from the same engine), that requires editing `CollectionRollupTab.tsx` and reshaping rows — a Frontend change that conflicts with "Do not change UI components". Please confirm the intended owner of that wiring.
2. Contract §5/§4 declare `CandidateTier = 1 | 2 | 3 | 5` (Tier 4 retired), but `src/lib/allocation-candidates.ts` still exports `CandidateTier = 1 | 2 | 3 | 4 | 5` and keeps a `TIER_LABELS[4]` entry. The classify logic never returns 4. Should the union be narrowed to match the contract? (Left unchanged to avoid out-of-scope churn.)
3. Contract §4.1/§4.2 list auth failure as `404`; the codebase's `requireAuth` returns `401` [Confirmed: src/lib/auth.ts:28]. The batch route follows existing convention (401). Should the contract be corrected to `401`?
4. Active-deck demand: should "active" be `decks.is_active` or `decks.status` in the Brew/Boxed/Archived lifecycle? I used `is_active` per contract §3.

## Verification
- `npx vitest --run src/lib/allocation-candidates.test.ts src/lib/allocation-rollup.test.ts src/app/api/allocation/candidates/batch/route.test.ts` — 3 files, 21 tests passed.
- `npx vitest --run src/app/api/allocation src/lib/allocation` — 3 files, 21 tests passed.
- `npx tsc --noEmit` — repo-wide error count dropped 203 → 198; zero errors in any touched/new file. (The 198 remaining are pre-existing and unrelated; `package.json` has no `typecheck` script, so `tsc --noEmit` was used per the role file.)
- `npx eslint` on the new/rewired files (`allocation-rollup.ts`, `allocation-rollup.test.ts`, both new route files, `rollup-v2/route.ts`, batch test) — 0 problems. `npx eslint src/lib/allocation-candidates.ts` reports 3 pre-existing errors at lines 85/136/233 (`prefer-const`, two `no-explicit-any`) that predate this task and were left untouched.
- Example request/response for the new endpoint (from `route.test.ts`, compute mocked):
  - Request: `POST /api/allocation/candidates/batch` body `{"cardNames":["Sol Ring","Command Tower"]}`
  - Response `200`: `{"results":{"Sol Ring":[{ "entry": {...}, "tier":1, "tierLabel":"Free original in storage", "withinTierScore":2, "autoSelectable":true }],"Command Tower":[]}}`
- Live end-to-end verification against the database was not possible in this worktree (no running server/DB credentials); the route and aggregation are covered by unit tests instead.
