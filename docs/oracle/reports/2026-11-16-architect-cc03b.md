# Report: cc03b-reference-tables-hardening
Role: architect
Status: DONE
Task as received: CC-03b: (1) Write docs/oracle/contracts/reference-tables-hardening.md for the shared card-reference tables (anon holds ALL incl. TRUNCATE on 18 tables; RLS off on 9). Grep src/ and scripts/ for anon-key reads/writes; keep reads for anon where needed, revoke writes/TRUNCATE from anon and authenticated; migration plan with undo, tests, test-copy requirement (branching unavailable). Plan only, no migration file in supabase/migrations/. (2) DRAFT migration supabase/drafts/20261116110000_drop_dead_collection_rollup.sql and .rollback.sql dropping get_collection_rollup(uuid), get_shared_cards(uuid), view collection_rollup; confirm by grep nothing in src/ calls them; rollback recreates them; state ordering vs 20261116100000 and 20261116100100. Report here. Do not touch decisions.md or the live database.

## Summary for the owner
The public website key can currently wipe or rewrite all the shared card-lookup data, but the app itself never uses that key for it, so locking it down should not change anything you see. I wrote the plan for that (nothing applied) and prepared the removal of three unused database items, which also needs your approval. One question for you: should the AI-written commander analysis stay readable with the public key, or be made private?

## Changed files
- docs/oracle/contracts/reference-tables-hardening.md — plan: target access per table, migration steps, undo, tests, test-copy requirement
- supabase/drafts/20261116110000_drop_dead_collection_rollup.sql — DRAFT drop of the two functions and the view
- supabase/drafts/20261116110000_drop_dead_collection_rollup.rollback.sql — DRAFT undo with placeholders to fill from a pre-apply capture
- docs/oracle/reports/2026-11-16-architect-cc03b.md — this report

## Findings
- Part 1: all data access in `src/` goes through the server key (`createAdminClient`); the only anon-key clients do login/session. `[Confirmed: src/lib/supabase.ts, src/lib/supabase-server.ts, grep]` Only three scripts use the anon key (`check-insight-status.js`, `generate-coverage-report.js` read-only; `distill-commander.ts` falls back to it and would write). So the plan keeps SELECT for anon/authenticated on 13 reference tables, and removes all access for the 5 internal ones. Six tables are referenced nowhere in code.
- Part 2: `src/` has no calls to `get_collection_rollup`, `get_shared_cards` or the `collection_rollup` view; only comments (`rollup-v2/route.ts`, `allocation-rollup.ts`) and generated types (`src/types/supabase.ts`). Scripts do not call them. `[Confirmed: grep]` Older definitions live only in `supabase/reconciliation/pre-ledger/`, not in the data-separation contract/report, so the rollback needs a live capture first.
- Ordering: 20261116100000 runs `ALTER VIEW collection_rollup` and 20261116100100 revokes the two functions and raises an error if either is missing. The new file's timestamp (110000) is later, so it runs after both with no edits. Dropping first would require editing both (and the 100100 rollback). Rollback order is reverse. `[Confirmed: supabase/migrations/20261116100000..., 20261116100100..., drafts/*.rollback.sql]`

## New decisions made (need owner confirmation)
- Reference tables: SELECT-only for anon/authenticated on 13 tables; no access on 5 internal tables; RLS on everywhere; default-privilege change for new tables.
- Drop the two functions and the view (destructive; owner approval required before apply).

## Assumptions
- Live facts are as supplied by Gene; I did not query the live database.
- Policies on the 9 RLS-on tables are unknown; the plan captures them before drafting SQL.

## Challenges to locked decisions
- none (the AGENTS.md line that `get_collection_rollup` is "live and confirmed working" was already challenged in the CC-03a report; still needs a Gene correction).

## Open questions
- Should `ref_commander_insights` stay publicly readable with the site key? (contract Open question 1)
- Does the owner have a recent database backup/restore point, and can a throwaway project be created for the test copy? Branching unavailable; contract section 6 gives the minimum and the weaker fallback.
- Keep or later drop the six unreferenced tables? (separate approval)
- Developer task before apply: remove the anon-key fallback in `scripts/distill-commander.ts`.

## Verification
- grep of `src/` and `scripts/` for table names, write operations and anon/service key use — results in contract section 2
- grep for `get_collection_rollup|get_shared_cards|collection_rollup` — only comments, generated types, CC-03a files, pre-ledger archives
- SQL files not executed; no migration added to `supabase/migrations/`; `decisions.md` and live database untouched
