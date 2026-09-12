# Delivery Log: Supabase Migration

## 2026-09-03 — Repository boundary and migration history consolidation

### What Changed

- Made `app/` the canonical Git and Kiro workspace root by relocating durable `.kiro`, research, standalone specs, and editor settings beneath it.
- Refreshed `supabase/migrations/` from the linked project's hosted ledger and recovered the two applied September migrations.
- Moved two local-only migrations to `supabase/reconciliation/pending-local/` so they cannot be mistaken for deployed history.
- Preserved competing pre-ledger migration trees and undeployed Edge Function sources under `supabase/reconciliation/pre-ledger/` after byte-for-byte comparison.
- Removed generated Supabase `.temp` state from Git and updated workspace-relative documentation and script paths.
- Excluded preserved `research/` artifacts from the production ESLint scope so relocating historical scripts does not create application-gate noise.

### Decisions Made

- The linked hosted ledger is authoritative for active migration history; filename similarity is not sufficient to merge competing histories.
- Large/private research exports and the commander-content SQLite database remain outside Git. Scripts can locate the latter through `COMMANDER_CONTENT_DB_PATH`.
- Preserved research remains reviewable and executable on demand, but is not shipped application code and is not part of the production lint gate.
- Clean replay remains open because Docker and native `pg_dump` were unavailable; TD-032 now tracks that narrower residual risk.

### Verification

- `supabase migration list --linked` reported matching local and remote versions from `20260730032938` through `20260907061101`.
- Archived source and destination trees returned no differences with recursive byte comparison before outer copies were removed.
- Repository path assertions, documentation targets, `git diff --check`, moved TypeScript syntax transpilation, JavaScript syntax, and shell syntax checks passed.
- `npm run build` passed. Next.js still skips type validation because of the pre-existing configuration.
- `npm test` remains red at 53 failed files and 277 failed tests; 62 files and 1,073 tests pass, eight more passing tests than the audit baseline with the failure count unchanged.
- `npx tsc --noEmit` still stops on the known CLI text embedded at `src/types/supabase.ts:2075-2076`.
- `npm run lint` remains red at 333 errors and 340 warnings after excluding research, versus the audit baseline of 334 errors and 340 warnings.

### Refs

- Commit: `a668ba0`
- Reconciliation record: `supabase/reconciliation/README.md`
- Readiness audit: `docs/audits/collection-migration-readiness-2026-09-03.md`
- Debt: TD-032

---

## 2026-07-27 — Database Table Cleanup (scryfall_printings consolidation)

### What Changed

Removed 3 redundant database tables after `scryfall_printings` bulk sync provided a comprehensive source of printing metadata (~114K printings). Migrated all consumers to query `scryfall_printings` instead of the legacy tables.

### Why

The `scryfall_printings` table now contains all data previously split across:
- `sets` (set_code → set_name)
- `oracle_to_printings` (oracle_id → scryfall_printing_id mapping)
- `printing_set_info` (scryfall_printing_id → set_code, edition_name)

Consolidating to one authoritative source eliminates redundancy, simplifies queries, and provides additional metadata (released_at, prices, images) that the legacy tables lacked.

### Files Modified

**API Routes (migrated from printing_set_info/sets to scryfall_printings):**
- `src/app/api/collection/rollup/[cardDefinitionId]/route.ts`
- `src/app/api/collection/rollup/route.ts`
- `src/app/api/collection/printings/route.ts`
- `src/app/api/collection/instances/[oracleId]/route.ts`
- `src/app/api/collection/instances/free-proxies/route.ts`
- `src/app/api/decks/[id]/route.ts`
- `src/app/api/decks/[id]/card-actions/[cardName]/route.ts`
- `src/app/api/shared-cards/route.ts`

**Import Engine:**
- `src/lib/import-engine-v2.ts` — Removed fallback queries to `oracle_to_printings`, removed writes to `oracle_to_printings` and `printing_set_info`

**Scripts:**
- `scripts/export-sqlite.ts` — Removed `sets`, `oracle_to_printings` from FK_DEPENDENCY_ORDER
- `scripts/load-postgres.ts` — Same

**Tests:**
- `src/app/api/collection/rollup/[cardDefinitionId]/route.test.ts` — Updated mock to use `scryfall_printings` instead of `collection`/`sets`

**Migrations Created:**
- `20260727010000_drop_sets_table.sql`
- `20260727020000_update_rpc_to_scryfall_printings.sql` — Updates `get_price_to_add()` and `get_bulk_price_to_add()` RPCs
- `20260727030000_drop_legacy_printing_tables.sql` — Drops `oracle_to_printings` and `printing_set_info`

### Root Cause

Tech debt from incremental feature development — each feature added its own reference table for printing/set metadata rather than consolidating. The `scryfall_printings` sync script (run earlier this session) provided the opportunity to unify.

### Deferred Work

**`collection` and `deck_allocations` tables** were originally planned for removal but discovered to have 13+ active consumers including write operations. These tables require a separate migration effort:
- 9+ routes read from `collection`
- `csv-import.ts` and `/api/collection/import` write to `collection`
- 4 routes read from `deck_allocations`

Tracked in TD-024 (updated with accurate consumer list, severity raised to medium).

### Tech Debt Resolved

- TD-019: `oracle_to_printings` → resolved
- TD-020: `printing_set_info` → resolved
- TD-022: `sets` → resolved

### Verification

- `npm run build` passes
- All route changes use typed Supabase queries (removed `as any` casts where possible)
- Migrations are idempotent (use `IF EXISTS` for drops)
- Migrations applied successfully via Supabase MCP tool

### Migration Application Notes (2026-07-27)

During migration application, discovered type mismatches requiring explicit casts:
- `card_definitions.oracle_id` (TEXT) vs `scryfall_printings.oracle_id` (UUID)
- `card_kingdom_prices.scryfall_printing_id` (TEXT) vs `scryfall_printings.scryfall_id` (UUID)

The RPC migration (`20260727020000`) was updated to include `::text` casts on UUID columns for compatibility. Logged as TD-025 in tech debt register.
