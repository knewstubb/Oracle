# Report: data-separation (CC-03a, Gate 4 slice 1)
Role: Architect
Status: DONE
Task as received: Task CC-03a (Gate 4 slice 1, data separation): using docs/oracle/reports/2026-11-16-architect-claude-connector-audit.md (findings H1, H2, H3, section 3), write a contract at docs/oracle/contracts/data-separation.md AND draft (do NOT apply, do NOT run against the live DB; read-only catalog queries are ok) migration SQL in supabase/migrations/ (new timestamped file(s), after 20261113130000) that: (1) enables RLS with own-row policies (user_id = auth.uid()) on decks, deck_cards, user_cards, user_copies and the other per-user tables listed in H1, making sure the app's service-role routes and existing authenticated-client reads keep working (check how the app reads these tables with the anon/authenticated client first and flag any that would break); (2) revokes anon (and PUBLIC) EXECUTE on all destructive/user-data security-definer RPCs taking p_user_id (...), granting only service_role, and confirm no browser-side caller uses them; (3) list the owner-check fixes needed in the deck status and notes routes as an exact Developer task list; also list any other routes found lacking owner checks that touch these tables (list only). Include rollback SQL and plain-language effects for the owner. Done when contract and migration draft exist and the report is written.

## Summary for the owner
The plan to make each person's decks and cards private is written and ready for your approval; nothing has been changed in the live app or data. If approved, the app should look and work the same for you, but other people (or anyone with the public site key) could no longer read or wipe your decks and collection. Both changes can be undone with a ready-made undo script. Decision for you: approve applying them (first on a test copy).

## Changed files
- docs/oracle/contracts/data-separation.md — the contract (current state, design, Developer task list, owner effects, test plan)
- supabase/migrations/20261116100000_rls_own_row_policies.sql — DRAFT: RLS and own-row policies on 22 tables, anon table access removed, rollup view made RLS-aware
- supabase/migrations/20261116100100_revoke_anon_user_data_rpcs.sql — DRAFT: 50 user-data functions limited to the server; default for new functions tightened
- supabase/drafts/20261116100000_rls_own_row_policies.rollback.sql — rollback for the first
- supabase/drafts/20261116100100_revoke_anon_user_data_rpcs.rollback.sql — rollback for the second (restores the exact original grants)
- docs/oracle/reports/2026-11-16-architect-data-separation.md — this report

## Key findings (all Confirmed against live catalog read-only, 2026-11-16, unless noted)
- Nothing in the app reads these tables or calls these functions with a browser or signed-in client. Anon-key clients only do login/session checks. So no breakage is expected (contract section 2).
- New: anon has every table privilege (including TRUNCATE, which ignores RLS) on decks, deck_cards, user_cards, user_copies, deck_notes, sync_runs (other 16 assumed the same). RLS alone would not have stopped a TRUNCATE; the migration revokes it.
- New: the `collection_rollup` view (postgres-owned) ignores RLS and is open to anon. Fixed in migration 1; nothing in src reads it.
- Function counts: 50 user-data functions; anon could run all 50, 13 also via PUBLIC, 18 also via signed-in users. Confirmed none called from a browser.
- Owner-check fixes: status (PATCH) and notes (GET) need the owner filter; `collection/stats` counts all users' rows. 22 further route files touch these tables with no user id in the file (list only, contract 5d).
- Dead functions: `get_collection_rollup` and `get_shared_cards` reference tables that no longer exist and nobody calls them.

## New decisions made (need owner confirmation)
- Use one `FOR ALL` own-row policy per table for the `authenticated` role; no FORCE RLS (it would break the server functions).
- Set default privileges so new functions are server-only unless a migration grants more.
- Keep the public site key fully away from the 22 tables (not just row-filtered).

## Assumptions
- The 16 tables whose grants I did not sample have the same grants as the 6 I did [Approximate]; the migration's revokes are harmless if not, but rollback assumes it.
- `user_id` indexes exist on the hot tables [Approximate]; verify with EXPLAIN after applying.
- Drafts were NOT executed, even in a rolled-back transaction, so SQL syntax is unverified against Postgres. Dry-run on a branch/test DB first.

## Challenges to locked decisions
- AGENTS.md line "get_collection_rollup RPC is live and confirmed working" — the live function body references `card_definitions`, `physical_copies`, `oracle_to_printings`, which do not exist live; nothing in `src/` calls it — suggest correcting that line (Gene owns) and deciding whether to drop the function and the view.

## Open questions
- Approve applying both migrations (test database first)?
- Reference tables (`ref_cards`, `ref_commanders`, etc.) probably still allow anonymous writes; separate hardening slice? (not checked)
- Drop the dead `get_collection_rollup` / `get_shared_cards` / `collection_rollup`? (revoked here, not dropped)

## Verification
- Live read-only catalog queries (pg_class RLS flags, pg_policy, pg_proc.proacl, role_table_grants, view definition) — results as above.
- grep of src and scripts for client construction, `.rpc(`, `.from(` — no browser-side callers.
- Script comparing function lists in migration vs rollback — 50 = 50, identical.
- No migration run, no tests run (docs and SQL drafts only).
