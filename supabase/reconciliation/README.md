# Supabase History Reconciliation

> Last checked: 2026-09-03
> Canonical active path: `supabase/migrations/`
> Hosted project is the source of truth for applied migration history.

## Applied ledger

`supabase migration list --linked` confirmed that the active local chain from `20260730032938` through `20260812220000` matches the hosted ledger, except for the drift documented below. `supabase migration fetch --yes` then refreshed those files from the hosted migration records and recovered two applied migrations that were missing locally:

- `20260907061042_fix_user_cards_unique_constraint.sql`
- `20260907061101_drop_legacy_oracle_id_unique_constraint_v2.sql`

The linked project reported no deployed Edge Functions.

## Local-only migrations

These migrations were not present in the hosted ledger and were removed from the active migration directory so they cannot be mistaken for applied history:

- `pending-local/20260812000000_drop_ref_rulings.sql` — collided with the applied `20260812000000_create_deck_versions.sql` version.
- `pending-local/20260812230000_drop_deck_documentation.sql` — local-only and never applied to the linked project.

They are preserved for review, not approved for deployment. If either change is still wanted, verify the live schema and current callers, assign a new migration version after the latest hosted migration, test it in staging, and only then return it to `supabase/migrations/`.

## Pre-ledger histories

The older and competing migration trees that previously lived outside the Git repository are preserved as inactive evidence:

- `pre-ledger/outer-migrations/` — the former workspace-root `supabase/migrations/` tree.
- `pre-ledger/nested-migrations/` — the former workspace-root `supabase/supabase/migrations/` tree.
- `pre-ledger/functions/` — the former workspace-root function sources; the linked project reported no deployed Edge Functions.

The archives include initial-schema material, exact duplicates, semantic duplicates with different SQL, and version collisions. They are historical evidence, not active migrations. Source and archive directories were compared byte-for-byte before the outer copies were removed.

A clean schema replay remains blocked until a hosted schema-only snapshot can be captured and tested. `supabase db dump --linked` could not run because Docker was unavailable, and native `pg_dump` was not installed.

## Generated state

`supabase/.temp/` is generated link/runtime state and is ignored. It may contain project-identifying connection metadata and must not be committed. Re-link a clone with the Supabase CLI instead.

## Rules

1. Do not copy files from reconciliation archives into the active migration directory by filename alone.
2. Do not delete archived histories until a clean isolated project can be reproduced and compared with the hosted schema.
3. Use unique timestamp versions; duplicate versions are invalid even when filenames differ.
4. Fetch the hosted ledger before migration work: `supabase migration fetch --yes`.
5. Test every new migration in isolated staging before production.
