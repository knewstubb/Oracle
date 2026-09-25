# Report: merge-preparation-all-worktrees

Role: Orchestrator

Status: DONE

Task as received: "All sub-agents are idle. Don't merge anything yet. First, for each worktree: confirm the agent's report exists, run typecheck and tests in that worktree, and commit its changes to its own branch. Then tell me: (1) whether the two T-12 worktrees overlap or duplicate each other, (2) which branches touch the same files, (3) a proposed merge order, one branch at a time with typecheck after each. Main has 50 uncommitted changes — list them and propose how to commit them before any merge. Exclude T-11's migration until I approve it; show me the SQL in plain language. Stop and wait for my go-ahead before merging to main."

## Changed files

- Each worktree is now committed to its own branch (see branch list below).
- `docs/oracle/status.md` — no new change in this session beyond earlier updates.

## New decisions made (need owner confirmation)

- None. Waiting for owner go-ahead on merge order and T-11 migration approval.

## Assumptions

- Pre-existing `tsc` errors in `supabase/reconciliation/pre-ledger/functions/scryfall-sync/index.ts` (Deno module) are baseline and acceptable in every worktree.
- The owner wants logical, grouped commits for main's 50 uncommitted changes before any branch merges.

## Challenges to locked decisions

- None.

## Open questions

- Owner approval of proposed merge order.
- Owner approval of T-11 migration (SQL shown below and in main response).
- How to reconcile the three versions of `docs/oracle/contracts/allocation-suggestion-engine.md` (T-03 API contract, T-11 retired/allowed paths, T-04 copy of T-03).

## Verification

### Reports confirmed

| Branch | Report path | Status |
|---|---|---|
| t02-allocation-resolver | docs/oracle/reports/2026-09-25-architect-t02.md | present |
| t03-suggestion-engine | docs/oracle/reports/2026-09-25-architect-allocation-suggestion-engine-contract.md | present |
| t04-move-allocation-tab | docs/oracle/reports/2026-09-25-backend-t04-move-allocation-tab.md | present |
| t05a-rollup-ids | docs/oracle/reports/2026-09-25-backend-t05a-rollup-ids.md | present |
| t05b-rollup-ids-ui | docs/oracle/reports/2026-09-25-frontend-t05b-rollup-ids-ui.md | present |
| t11-retire-destructive-rpc | docs/oracle/reports/2026-09-25-architect-retire-destructive-allocation-rpc.md | present |
| t12-placement-source | docs/oracle/reports/2026-09-25-architect-placement-source.md | present |
| t12-implement-placement-source | docs/oracle/reports/2026-09-25-backend-placement-source.md | present |
| t14-ai-audit | docs/oracle/reports/2026-09-25-architect-t14.md | present |
| t19-jev-research | docs/oracle/reports/2026-09-25-architect-jev-research.md | present |

### Typecheck results (`npx tsc --noEmit`)

All counts include the same pre-existing Deno scryfall-sync baseline errors.

| Branch | Error count | Note |
|---|---|---|
| t02-allocation-resolver | 203 | baseline |
| t03-suggestion-engine | 203 | baseline (docs only) |
| t04-move-allocation-tab | 198 | 5 fewer than baseline |
| t05a-rollup-ids | 201 | baseline |
| t05b-rollup-ids-ui | 201 | baseline |
| t11-retire-destructive-rpc | 203 | baseline |
| t12-placement-source | 203 | baseline (docs + DRAFT migration) |
| t12-implement-placement-source | 202 | baseline |
| t14-ai-audit | 203 | baseline (docs only) |
| t19-jev-research | 203 | baseline (docs only) |

### Test results

| Branch | Tests | Result |
|---|---|---|
| t02-allocation-resolver | allocation-candidates.test.ts | 5 failed / 4 passed — pre-existing stale test file |
| t04-move-allocation-tab | allocation-rollup.test.ts, allocation-candidates.test.ts | 14 passed |
| t05a-rollup-ids | collection-instance-ids + rollup tests | 19 passed |
| t05b-rollup-ids-ui | CollectionRollupTab.test.tsx + collection-instance-ids | 7 passed |
| t12-implement-placement-source | targeted allocation tests | no test files found; full suite blocked by missing Supabase env |

### Commits created

| Branch | Commit | Message |
|---|---|---|
| t02-allocation-resolver | 960a29f | T-02: validate V2 allocation resolver against real deck data |
| t03-suggestion-engine | e13f582 | T-03: allocation suggestion engine contract |
| t04-move-allocation-tab | c2f461c | T-04: move Allocation Tab to live suggestion engine |
| t05a-rollup-ids | e68cccb | T-05a: replace rollup placeholder IDs with real physical_copy_id values |
| t05b-rollup-ids-ui | 52041d7 | T-05b: update rollup UI to consume real physical_copy_id values |
| t11-retire-destructive-rpc | 477445c | T-11: retire destructive allocation_clear_active_decks RPC |
| t12-placement-source | afcd478 | T-12: placement source contract and draft migration |
| t12-implement-placement-source | 9b56fd3 | T-12: implement placement_source migration and API wiring |
| t14-ai-audit | 502c6b9 | T-14: audit existing AI code for data access and D-016 violations |
| t19-jev-research | 678802f | T-19: research Jev for card recommendation classification |

## (1) T-12 overlap / duplication

The two T-12 worktrees are complementary, not duplicative:

- **t12-placement-source** — contract docs (`placement-source.md`, `placement-source.types.ts`) + DRAFT migration (`20260925220000_placement_source_DRAFT.sql`).
- **t12-implement-placement-source** — code changes to API/data-access + final migration (`20260925220000_placement_source.sql`) + report.

They do **not** share filenames, so there is no git file conflict. The DRAFT migration in the contract branch should be discarded at merge time; the final migration from the implementation branch is the one to keep (owner already approved T-12).

## (2) Branches touching the same files

| File | Branches | Resolution |
|---|---|---|
| `docs/oracle/contracts/allocation-suggestion-engine.md` | t03-suggestion-engine, t04-move-allocation-tab, t11-retire-destructive-rpc | T-03 and T-04 are identical; T-11 is a different high-level contract. Reconcile into one doc that covers both API endpoints and retired/allowed write paths. |
| `docs/oracle/contracts/allocation-suggestion-engine.types.ts` | t03-suggestion-engine, t04-move-allocation-tab | T-03 and T-04 are identical; no conflict after first merge. |
| `src/app/api/collection/instances/[oracleId]/ids/route.ts` | t05a-rollup-ids, t05b-rollup-ids-ui | Merge t05a first, then t05b. |
| `src/app/api/collection/instances/[oracleId]/ids/route.test.ts` | t05a-rollup-ids, t05b-rollup-ids-ui | Merge t05a first, then t05b. |
| `src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts` | t05a-rollup-ids, t05b-rollup-ids-ui | Merge t05a first, then t05b. |
| `src/lib/collection-instance-ids.ts` | t05a-rollup-ids, t05b-rollup-ids-ui | Merge t05a first, then t05b. |
| `src/lib/collection-instance-ids.test.ts` | t05a-rollup-ids, t05b-rollup-ids-ui | Merge t05a first, then t05b. |
| `src/types/supabase.ts` | t11-retire-destructive-rpc, t12-implement-placement-source | Sequential merge; order shown below. |

## (3) Proposed merge order

Merge one branch at a time, run `npx tsc --noEmit` after each, and resolve any conflicts before the next.

1. **t02-allocation-resolver** — independent docs + validation script.
2. **t14-ai-audit** — independent docs.
3. **t19-jev-research** — independent docs.
4. **t03-suggestion-engine** — foundation contract.
5. **t11-retire-destructive-rpc** — reconcile `allocation-suggestion-engine.md` with T-03; migration excluded until you approve.
6. **t04-move-allocation-tab** — depends on T-03 contract.
7. **t05a-rollup-ids** — backend rollup IDs.
8. **t05b-rollup-ids-ui** — depends on T-05a, touches UI.
9. **t12-placement-source** — contract docs (drop the DRAFT migration at this step).
10. **t12-implement-placement-source** — code + final migration; depends on T-12 contract.

## Main's 50 uncommitted changes

Proposed commit groups:

1. **chore: agent orchestration setup and steering docs**
   - `.paseo/agents/orchestrator.md`
   - `AGENTS.md`
   - `paseo.json`
   - `docs/oracle/decisions.md`
   - `docs/oracle/status.md`
   - `docs/oracle/roadmap.md`
   - `docs/oracle/parity-log.md`
   - `docs/oracle/contracts/` (untracked on main)
   - `docs/oracle/reports/` (untracked on main)

2. **docs: Kiro specs and competitive audit**
   - `.kiro/specs/deck-import-conflicts/delivery-log.md`
   - `.kiro/specs/phase-1-parity/`
   - `.kiro/specs/unified-card-filter/`
   - `.kiro/steering/convention-allocation-terminology.md`
   - `docs/COMPETITIVE-AUDIT-FINDINGS.md`
   - `docs/competitive-audit-research.md`
   - `docs/competitive-positioning.md`
   - `docs/feature-matrix.md`

3. **feat: import conflict resolution and allocation state**
   - `src/app/api/onboarding/conflicts/resolve/route.ts`
   - `src/app/api/onboarding/conflicts/route.ts`
   - `src/app/api/onboarding/finalize/route.ts`
   - `src/app/api/onboarding/moxfield/resolve-one/route.ts`
   - `src/app/api/onboarding/moxfield/resolve/route.ts`
   - `src/app/api/onboarding/resolve-one/route.ts`
   - `src/lib/import-sleeve-claims.ts`
   - `src/lib/warm-start-resolve-moxfield.ts`
   - `src/lib/warm-start-resolve.ts`
   - `src/lib/import-allocation-state.ts`
   - `src/lib/import-allocation-state.test.ts`
   - `src/types/supabase.ts`
   - `supabase/migrations/20260920120000_get_import_allocations_unowned_state.sql`
   - `supabase/migrations/20260920140000_import_claim_resolution_columns.sql`
   - `supabase/migrations/20260920140100_set_import_claim_resolution_rpc.sql`
   - `supabase/migrations/20260920140300_finalize_import_claims_honour_resolutions.sql`
   - `supabase/migrations/20260920140500_get_import_allocations_v2_resolutions.sql`
   - `supabase/migrations/20260920140600_get_deck_conflict_counts_rpc.sql`

4. **feat: UI component updates**
   - `src/app/decks/[id]/page.tsx`
   - `src/app/onboarding/page.tsx`
   - `src/app/page.test.tsx`
   - `src/app/page.tsx`
   - `src/app/settings/components/page.tsx`
   - `src/components/CardsTab.tsx`
   - `src/components/DeckImportButton.tsx`
   - `src/components/DeckImportProgressList.tsx`
   - `src/components/DeckTile.tsx`
   - `src/components/PicklistV2.tsx`
   - `src/components/StatusChipPopover.tsx`
   - `src/components/collection/InstanceDetailPanel.tsx`

5. **chore: evaluate tool artifacts for gitignore or commit**
   - `.playwright-mcp/`
   - `semantic-review/`

## T-11 migration SQL (owner gate)

File: `supabase/migrations/20260925000000_retire_destructive_allocation_rpc.sql`

Plain language: this migration deletes the `allocation_clear_active_decks` database function. That function was the old "wipe all copy assignments from active decks" tool. Nothing in the current code calls it, and D-007 says it should no longer exist as a write path.

SQL:

```sql
DROP FUNCTION IF EXISTS public.allocation_clear_active_decks(UUID);
```

**Approve?** Once approved, this migration will be included in the T-11 merge. Until then, T-11 will be merged without its migration file.

## Next step

Waiting for your go-ahead on:
1. The proposed main commits.
2. The merge order.
3. Approval of the T-11 migration.

I will not merge anything until you confirm.
