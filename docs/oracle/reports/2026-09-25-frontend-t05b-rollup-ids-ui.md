# Report: t05b-rollup-ids-ui
Role: Frontend
Status: DONE
Task as received: You are the Frontend agent. Read AGENTS.md and .paseo/agents/frontend.md before anything else. Task T-05b: Update the UI to consume real physical_copy_id values from the rollup API. Use the backend changes from T-05a and the collection rollup components in src/components/collection/ as inputs. Done when: the rollup selection uses real physical_copy_id values and existing tests or typecheck pass, with a report per AGENTS.md.

## Changed files
- `src/components/collection/CollectionRollupTab.tsx` — rollup-level checkbox now filters the instance-resolver response to real integer `physical_copy_id`s before storing them in the selection model; `useIsMobile` initialises from `matchMedia` lazily so it no longer trips `react-hooks/set-state-in-effect` (a pre-existing lint error in this file).
- `src/components/collection/CollectionRollupTab.test.tsx` — new component test proving the rollup checkbox resolves real IDs from `/api/collection/instances/[oracleId]/ids`, stores the full real set (not one placeholder), forwards those exact IDs to bulk actions, and drops non-numeric resolver values.
- `src/lib/collection-instance-ids.ts` — imported unmodified from T-05a: discrete, user-scoped resolver of real `user_copies.id` values for an `oracle_id`.
- `src/lib/collection-instance-ids.test.ts` — imported unmodified from T-05a.
- `src/app/api/collection/instances/[oracleId]/ids/route.ts` — imported unmodified from T-05a: route delegates to the resolver; response shape unchanged.
- `src/app/api/collection/instances/[oracleId]/ids/route.test.ts` — imported unmodified from T-05a.
- `src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts` — imported unmodified from T-05a: repairs the stale, failing rollup test on this branch so rollup tests actually run and assert real `copyId`/`physicalCopyId` values.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- "Rollup-level selection" is the Allocation page (`/allocation` → `CollectionRollupTab`) checkbox flow. It already resolved real IDs via `GET /api/collection/instances/[oracleId]/ids` and stored `Set<physical_copy_id>` in `useSelectionModel` [Confirmed: src/components/collection/CollectionRollupTab.tsx:164-186, src/hooks/useSelectionModel.ts:17-20]. My change hardens that path; it does not re-route it.
- T-05a's backend work was uncommitted in the sibling worktree `t05a-rollup-ids` and was not present on this branch (all T-branches sit at the same base commit `be96d65`). I imported those five files verbatim rather than authoring server logic, because this branch's `src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts` was already failing (11 tests) and T-05a's repair is a stated input.
- `rollup-v2` (used by the Allocation page) returns aggregate counts per `oracle_id`, not IDs; the UI resolves IDs on demand through the T-05a resolver endpoint. I did not change API shape (not my lane).

## Challenges to locked decisions
- none

## Open questions
- `docs/oracle/status.md` lists T-05 as a single Backend + Frontend task, but the work is split across two worktrees whose branches were both cut from `be96d65`; T-05a was never committed. The orchestrator needs to merge T-05a before/with T-05b or this branch carries duplicated backend files. I imported T-05a unmodified and left its report in its own worktree.
- There is no approved spec under `docs/oracle/specs/` for this feature. `getTriState` in `CollectionRollupTab` never returns `indeterminate` (it reports `checked` as soon as any instance is selected); the hook already supports `indeterminate` with a `totalInstances` argument [Confirmed: src/hooks/useSelectionModel.ts:157-166]. The component's own comment defers this to "task 12". I left it alone rather than invent interaction behaviour.
- Rows are deduplicated by `card_name` in `rollup-v2`, so two `oracle_id`s sharing a name collapse to one row and the resolver then returns copies for only the first `oracle_id`. Backend/Architect call, flagged here only.

## Verification
- `node_modules/.bin/vitest --run src/components/collection/CollectionRollupTab.test.tsx src/lib/collection-instance-ids.test.ts 'src/app/api/collection/instances/[oracleId]/ids/route.test.ts' 'src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts' src/hooks/useSelectionModel.test.ts src/app/api/collection/rollup/route.ts` — 5 files, 43 tests passed (includes 3 new component tests).
- `node_modules/.bin/eslint src/components/collection/CollectionRollupTab.tsx src/components/collection/CollectionRollupTab.test.tsx src/lib/collection-instance-ids.ts src/lib/collection-instance-ids.test.ts 'src/app/api/collection/instances/[oracleId]/ids/route.ts' 'src/app/api/collection/instances/[oracleId]/ids/route.test.ts' 'src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts'` — 0 errors, 2 pre-existing warnings (`MockChainOverrides` unused, `panelOpen` unused).
- `node_modules/.bin/tsc --noEmit` — 201 pre-existing repo-wide errors; 0 in any file touched or added here (matches T-05a's baseline).
- `node_modules/.bin/vitest --run src/components/collection` — 42 passed, 2 pre-existing failures (`CollectionToolbar.getPersistedViewMode` expects `list`, implementation returns `grid`); unrelated to this task.
- `node_modules/.bin/vitest --run src/app/api/collection` — 23 passed, 5 pre-existing failures in `assign-location/route.test.ts` (`supabase.rpc is not a function`); unrelated to this task.
- `npm test` (full repo) — did not complete within a 15-minute wall clock; noted as an environment/repo-wide issue, not attributable to the files changed here.

## Spec states
- Loading: rollup list shows `Loading rollup data…` [Confirmed: src/components/collection/RollupListPane.tsx:104-112] — covered by render in the new test.
- Empty: `No cards match the current filters.` [Confirmed: RollupListPane.tsx:239-244] — not exercised by the new test.
- Error: `Failed to load collection rollup.` [Confirmed: RollupListPane.tsx:115-123] — not exercised by the new test.
- Selection: rollup checkbox resolves real IDs, shows `${n} selected`, and bulk actions receive those IDs [Confirmed by new test].
- Not testable here: the `indeterminate` rollup checkbox state (see Open questions).
