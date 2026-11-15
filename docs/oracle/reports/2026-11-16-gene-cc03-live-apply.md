# Report: cc03-live-apply
Role: Gene
Status: DONE
Task as received: Apply the two prepared data-separation changes (CC-03a) and the CC-03b reference-table fix plus removal of the unused collection-summary objects directly to the LIVE Supabase database (project "The Oracle"), on explicit owner approval (no test copy; overrides the earlier "test copy first" condition only; no row data deleted or altered). Verify, run advisors, record, update status.md. Do not change commander-analysis readability. Do not edit decisions.md.

## Summary for the owner
Your decks, cards and copies are now private to each account at the database itself, and the public site key can no longer see or change them or run the wipe-style functions. The shared card-reference tables can no longer be edited with the public key, and the unused collection-summary pieces were removed. Nothing in your data changed (same counts before and after). One open question remains: whether the AI commander analysis should stay readable with the public key (left as is).

## What was applied (live project udocxsyzzvrceiuupprj, 2026-11-16, in this order)
1. `rls_own_row_policies` (file 20261116100000): row-level security on for 22 per-user tables with an own-rows policy; anon lost all table privileges; signed-in users lost TRUNCATE/TRIGGER/REFERENCES. Captured pre-state confirmed all 22 had identical wide-open grants, so the undo script is exact. Collection summary view set to run as the caller and closed to anon.
2. `revoke_anon_user_data_rpcs` (file 20261116100100): 50 functions now service_role only; default function privileges changed so new functions are not auto-granted to anon.
3. `reference_tables_hardening` (new file 20261116110100): 18 reference tables. 13 card-reference tables: SELECT only for anon and signed-in (all write, truncate, trigger, references removed); RLS on, with a public read policy added where RLS had been off (ref_cards, ref_commander_cards, ref_commanders, ref_commander_insights). 5 internal tables (_migrations, sync_meta, commander_content, commander_strategies, precon_cards): all access removed from anon and signed-in, RLS on. Existing policies on the nine tables that already had RLS were not touched.
4. `drop_dead_collection_rollup`: dropped view collection_rollup and functions get_collection_rollup(uuid), get_shared_cards(uuid), without CASCADE, after capturing their live definitions.

Each applied as one transaction through the Supabase tool (a failure would have rolled it back); none failed.

## Changed files
- supabase/migrations/20261116110100_reference_tables_hardening.sql: new, the SQL applied for CC-03b (the plan had no SQL)
- supabase/drafts/20261116110100_reference_tables_hardening.rollback.sql: new, exact undo from the captured pre-state
- supabase/drafts/20261116110000_drop_dead_collection_rollup.applied.rollback.sql: new, undo with the real captured definitions (supersedes the placeholder rollback)
- docs/oracle/status.md: CC-03a and CC-03b rows
- Existing undo scripts for 20261116100000 and 20261116100100 were used as written; their migration files' "NOT APPLIED" header comments are now out of date (not edited).

## New decisions made (need owner confirmation)
- Reference-table default-privileges change (plan section 3) NOT applied: it would also affect future user tables. Needs its own yes/no.
- Anonymous read was kept only on the 13 card-reference tables; the 5 internal tables are closed to everyone except the server.

## Assumptions
- Undo order if ever needed: drop-undo first, then reference-tables undo, then the two CC-03a undos (the CC-03a undo grants on the view and functions, which must exist).
- The restored view works; the two restored functions cannot run (they point at tables that no longer exist).

## Challenges to locked decisions
- none (AGENTS.md line claiming get_collection_rollup is "live and confirmed working" is wrong; the function was dead and is now removed; owner-approved earlier).

## Open questions
- Should the AI commander analysis (ref_commander_insights) stay readable with the public key? Left unchanged by instruction. Making it private later means the two helper scripts need the server key.
- One of the 9 decks belongs to a different account (3 accounts exist). Expected, but worth knowing if the owner only uses one.
- Leftover advisor items, not caused by this work: view v_commander_archetypes runs with its creator's rights (ERROR); validate_deck_card_copy_identity is still callable by anon (trigger function, deliberately left alone); 14 functions without a fixed search path; pg_trgm in the public schema; leaked-password protection off. Several functions outside the 50 (price lookups, version number, diff helper, location triggers) are still open to anon; they were not in the approved list.
- Not done: live two-user test through the real app, Playwright smoke path, build, and the Developer's cross-user route tests beyond what the existing suite covers. Route fixes (5c and 5d list) remain.

## Verification
- Pre-apply capture (grants, RLS flags, policies, function ACLs, definitions, row counts): done, matched the contract.
- Anon key probes over the REST API: SELECT on all 22 tables and the view returns permission denied; DELETE on decks and user_copies denied; delete_deck_with_release, get_collection_rollup, get_deck_conflict_counts, get_import_conflicts denied. (replace_collection probe used wrong parameter names, so it returned "not found"; catalog shows it is service_role only.) After CC-03b: anon SELECT on the 4 card-reference tables with scripts returns 200; sync_meta, _migrations, commander_content denied.
- Catalog: none of the 50 functions is executable by anon, authenticated or PUBLIC; RLS on for all 22 tables; anon has no SELECT/TRUNCATE on sampled tables.
- Server role (simulated in SQL): reads decks (9), copies (4259), reference cards, sync_meta and runs get_deck_conflict_counts fine. Signed-in owner session sees own 8 decks, all 4259 copies and 2650 cards; an unrelated account sees 0 of everything.
- Row counts before/after: decks 9, deck_cards 795, user_cards 2650, user_copies 4259 (unchanged).
- npx vitest --run: 255 files passed, 5 skipped; 3001 tests passed, 42 skipped. (Tests use mocks, so they do not prove live behaviour on their own.)
- Supabase security advisors after apply: no table-without-protection errors remain; 5 INFO notes "RLS on, no policy" are the intentional internal tables; remaining items listed above.
