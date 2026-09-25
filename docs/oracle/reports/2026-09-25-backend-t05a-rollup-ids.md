# Report: t05a-rollup-ids
Role: Backend
Status: DONE
Task as received: You are the Backend agent. Read AGENTS.md and .paseo/agents/backend.md before anything else. Task T-05a: Replace placeholder sequential IDs in the rollup-level selection with real physical_copy_id values in the API and data-access layer. Use src/types/supabase.ts and the rollup-related code in src/lib/ and src/app/api/ as inputs. Do not change frontend components. Done when: the rollup API returns real physical_copy_id values and existing tests or typecheck pass, with a report per AGENTS.md.

## Changed files
- `src/lib/collection-instance-ids.ts` — new unit-tested data-access function `fetchPhysicalCopyIdsForOracleId(oracleId, userId)` that resolves real `user_copies.id` values (no inline logic, per AGENTS identifier rules).
- `src/app/api/collection/instances/[oracleId]/ids/route.ts` — replaced the two inline resolution queries with the data-access function; response shape `{ oracleId, physicalCopyIds }` unchanged.
- `src/lib/collection-instance-ids.test.ts` — new unit tests proving the resolver returns real `user_copies.id` values (and not `[1..N]`), aggregates across `user_cards` rows, scopes to the user, and returns `[]` when nothing is owned.
- `src/app/api/collection/instances/[oracleId]/ids/route.test.ts` — new route tests: 401 unauth, real IDs returned, empty list, 500 on resolution failure.
- `src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts` — repaired a stale, failing rollup test (wrong table names `cards`/`collection`/`printings`, missing auth mock, undefined `seedCollection`, retired aggregate `quantity`) so the rollup API tests actually run and assert real `copyId`/`physicalCopyId` values.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- "Rollup-level selection" is the Allocation `CollectionRollupTab` checkbox flow, which resolves real IDs via `GET /api/collection/instances/[oracleId]/ids` and stores `Set<physical_copy_id>` in `useSelectionModel` [Confirmed: src/components/collection/CollectionRollupTab.tsx:164-180, src/hooks/useSelectionModel.ts:17-20].
- The placeholder sequential IDs described in the task are the ones documented for the now-deleted `RollupView.tsx` ("uses placeholder IDs (sequential 1..N)") [Confirmed: research/docs/archive/oracle-current-state-2026-07-07.md:235]. That component was deleted in commit 42cf497, and the live rollup selection already uses the resolver. No sequential placeholder remains in `src/lib/` or `src/app/api/` (grep verified). My change hardens the real-ID path and adds the missing regression coverage.
- The rollup expand/list APIs already return real IDs in the `copyId` / `physicalCopyId` fields [Confirmed: src/app/api/collection/rollup/route.ts:295-296, src/app/api/collection/rollup/[cardDefinitionId]/route.ts:147-151].

## Challenges to locked decisions
- none

## Open questions
- `docs/oracle/status.md` T-05 is listed as Backend + Frontend. This report covers only the Backend half (T-05a). The Frontend half should be verified separately: `CollectionRollupTab.tsx` already calls the resolver and passes real IDs to `useSelectionModel`, but no one has confirmed it against the acceptance criteria for T-05b.

## Verification
- `npx vitest --run src/app/api/collection/rollup src/lib/collection-instance-ids.test.ts 'src/app/api/collection/instances/[oracleId]/ids/route.test.ts'` — 3 files, 19 tests passed.
- `npx vitest --run src/app/api/collection/instances src/hooks/useSelectionModel.test.ts` — 2 files, 25 tests passed.
- `npx eslint` on all touched files — 0 errors, 1 pre-existing warning (`MockChainOverrides` unused, untouched).
- `npx tsc --noEmit` — no errors in any touched file. (Repo-wide there are 201 pre-existing errors unrelated to this task; 2 of them were in the stale rollup test and are now fixed.)
