# CC-15 database drafts: throwaway test evidence (FEAT-001)

Nothing here touched the hosted database. Every run used a brand-new local Postgres 17 cluster on 127.0.0.1:55433 in a temp folder, deleted when the script ends.

Run any of them with `./run.sh <name>` (needs `/opt/homebrew/opt/postgresql@17`). Output is saved next to the script.

| Script | What it proves | Result file | Outcome |
|---|---|---|---|
| `test_a.sh` | DB-A (`20261117200000_cc15a_new_change_kinds`): old kinds still work through the new front doors, the four new kinds are accepted and an invented one is rejected, Claude gets `owner_only` for `deck_create` / `box_*`, running it twice refuses, rollback refuses while new-kind rows exist, rollback restores everything, re-apply works | `test_a.out` | 33 PASS, 0 FAIL |
| `test_b.sh` (+ `test_b_create.sql`, `test_b_setup.sql`, `test_b_undo.sql`, `test_b_iso.sql`) | DB-B (`20261117200100_cc15b_deck_create_setup`): create, setup, Undo of setup, Undo of an empty created deck, refusals, hand-delete of a Claude-made deck, Recent changes blocker, two-user isolation, parallel create, rollback, re-apply | `test_b.out` | 90 PASS, 0 FAIL |
| `test_dep.sh` | DB-B refuses to install without `20261117120000`; with the check removed, Undo of a created deck and a hand delete both fail with `ai_change_log_is_append_only`; after applying `20261117120000` the same Undo works | `test_dep.out` | as described |

Stand-ins (not real tables): `00_base.sql` rebuilds only the base tables the connector needs, with columns from `src/types/supabase.ts`. `deck_strategy` gets a unique key on `deck_id` (assumption: the app upserts `onConflict deck_id`; still Approximate until the owner allows a read-only column check of the live database). `remove_deck_card_with_release` is a plain-delete stand-in. The real migrations applied unmodified are: 20261116130000, 150000, 150100, 150200, 150300, 190000, 20261117100000, 20261117120000, 20261023170100.
