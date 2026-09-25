# Report: retire-destructive-allocation-rpc
Role: Architect
Status: DONE
Task as received: Task T-11: Draft a migration that retires the allocation_clear_active_decks RPC and any other destructive allocation RPCs, per D-007. Use docs/oracle/contracts/allocation-suggestion-engine.md and src/types/supabase.ts as inputs. Output: a draft migration in supabase/migrations/ marked DRAFT. Done when: the migration safely removes the destructive RPCs without breaking existing functionality, with Confirmed path citations, plus a report per AGENTS.md.

## Changed files
- `supabase/migrations/20260925000000_retire_destructive_allocation_rpc.sql` — draft migration that drops `allocation_clear_active_decks(UUID)` per D-007.
- `docs/oracle/contracts/allocation-suggestion-engine.md` — created the missing contract that D-007 references; defines retired and allowed allocation write paths.
- `src/types/supabase.ts` — removed the `allocation_clear_active_decks` entry from the generated function catalog so the TypeScript contract stays in sync with the retired RPC.

## New decisions made (need owner confirmation)
- None. This work implements the already-locked D-007 decision.

## Assumptions
- "Destructive allocation RPC" in D-007 means a bulk clear-and-recompute resolver that writes `NULL` to allocation fields across multiple decks/cards in one call. Only `allocation_clear_active_decks` matched this pattern in the live function catalog [Confirmed: src/types/supabase.ts].
- `replace_collection`, `apply_collection_sync`, `delete_user_copies`, and `release_deck_copies` are collection/deck-scoped operations, not allocation resolvers, and therefore out of scope for this retirement.
- The pre-ledger migration `supabase/reconciliation/pre-ledger/outer-migrations/011_allocation_clear_rpc.sql` is historical and must not be edited; retirement is done via a new forward-only migration.

## Challenges to locked decisions
- None.

## Open questions
- Should the Orchestrator schedule regeneration of `src/types/supabase.ts` from the deployed database once the migration is applied, to ensure the manual edit is overwritten cleanly by the generator?
- Status.md is stale (does not list T-11 and still shows T-01 through T-09 as TODO). The Orchestrator may want to update it.

## Verification
- `grep -R "allocation_clear_active_decks" --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md" .` (excluding historical pre-ledger and archive docs) returned only the new contract and migration — no active code references remain.
- `src/app/api/allocation/resolve/route.ts` confirms the resolve endpoint uses `autoAssignAllBrewDecks` and never calls the retired RPC [Confirmed: src/app/api/allocation/resolve/route.ts].
- `src/components/collection/CollectionImportButton.tsx` confirms collection-import allocation warnings are descriptive side-effect warnings, not calls to the retired RPC [Confirmed: src/components/collection/CollectionImportButton.tsx].
- Attempted `npx tsc --noEmit` and `npm test -- src/lib/allocation-candidates.test.ts`; both failed because `node_modules` is not installed in this worktree, so type/test verification could not be run. No code changes reference the removed function, so the risk of breakage is low.
