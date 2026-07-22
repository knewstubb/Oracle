# Rollback Procedure: Supabase → SQLite

> Use only if Supabase is unrecoverable. Fix-forward is always preferred.

---

## Prerequisites

| Item | Location | Notes |
|------|----------|-------|
| Source SQLite database | `data/oracle.db` | Never modified during migration — read-only throughout |
| SQLite application code | Git history | `src/lib/db.ts`, `src/lib/init-db.ts`, `src/lib/migrate.ts` all preserved in commits |
| `better-sqlite3` dependency | Git history (`package.json`) | Exact version pinned in pre-migration commits |
| Node.js 18+ | Local machine | Required for `better-sqlite3` native compilation |

### Verify Source DB Before Starting

```bash
cd the-oracle
ls -la data/oracle.db
sqlite3 data/oracle.db "SELECT count(*) FROM sqlite_master WHERE type='table';"
# Expected: 30+ tables
```

If `data/oracle.db` is missing or returns errors, the rollback cannot proceed.

---

## Rollback Steps

### 1. Find the pre-migration commit

```bash
git log --oneline -- src/lib/db.ts
# Identify the last commit where src/lib/db.ts used better-sqlite3
```

### 2. Create a rollback branch

```bash
git checkout -b rollback/sqlite-restore <pre-migration-commit>
```

### 3. Restore `better-sqlite3` dependency

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

### 4. Restore SQLite application modules

```bash
# These were removed in task 17.2 — restore from pre-migration commit
git checkout <pre-migration-commit> -- src/lib/db.ts
git checkout <pre-migration-commit> -- src/lib/init-db.ts
git checkout <pre-migration-commit> -- src/lib/migrate.ts
```

### 5. Switch environment variables

Remove from `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The SQLite version uses a hardcoded path (`data/oracle.db`) — no env vars needed for DB access.

### 6. Remove Supabase dependencies

```bash
npm uninstall @supabase/supabase-js
rm -f src/types/supabase.ts
```

### 7. Build and verify

```bash
npm run build
npm run dev
```

Verify:
- [ ] Collection page loads with card data
- [ ] Deck list displays all decks
- [ ] Individual deck detail pages work
- [ ] No Supabase references remain: `grep -r "supabase" src/ --include="*.ts" --include="*.tsx"`
- [ ] SQLite imports present: `grep -r "better-sqlite3" src/ --include="*.ts"`
- [ ] DB file unmodified: `sqlite3 data/oracle.db "SELECT count(*) FROM collection;"`

---

## When to Rollback

**Rollback** (last resort):
- Supabase project permanently inaccessible (account locked, billing failure, data loss)
- Unrecoverable schema corruption across multiple tables
- Critical data integrity failure with no viable repair path
- Persistent connection failures that cannot be resolved with Supabase support

**Do NOT rollback** (fix forward instead):
- Single broken query or RPC function — patch the code
- Edge Function failure — redeploy the function
- A few rows with bad data — correct in Supabase dashboard
- Environment variable misconfiguration — fix in Vercel settings
- Transient Supabase outage — wait for recovery (typically <1hr)
- Test failures or type errors — fix the code
- Minor bugs in the application layer — standard bugfix workflow

---

## Data Considerations

### The gap problem

`data/oracle.db` is a snapshot from migration day. Any data created in Supabase **after** migration will not exist in the SQLite file:

- New decks added
- Collection changes (cards added/removed)
- Brew sessions created
- Price cache updates
- Debrief sessions and notes

### Handling post-migration data

**Option A — Export before rollback (recommended if time allows):**
```bash
# From Supabase dashboard: Table Editor → Select table → Export CSV
# Or via CLI:
supabase db dump --data-only -t <table_name> > exports/<table>.sql
```

**Option B — Manual re-entry:**
For small amounts of new data, re-enter through the application UI after rollback.

**Option C — Accept the loss:**
If the data gap is minimal (hours/days of usage), it may not be worth the effort to export and re-import.

> ⚠️ Re-importing Supabase data into SQLite requires manual transformation:
> - Booleans: `true`/`false` → `1`/`0`
> - Remove `user_id` column values
> - Timestamps remain as ISO 8601 strings (compatible)

---

## Stabilization Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| Active monitoring | Days 1–7 | Monitor Supabase for errors, query performance, data integrity |
| Stabilization | Days 8–14 | Confirm all features work correctly under normal usage |
| Archive decision | Day 14+ | If stable, `data/oracle.db` may be archived (moved to cold storage or compressed) |

**Do NOT delete `data/oracle.db` before the 2-week stabilization period.**

After stabilization:
```bash
# Archive (recommended over deletion)
gzip -k data/oracle.db
mv data/oracle.db.gz backups/oracle-pre-supabase.db.gz
```

The uncompressed `data/oracle.db` can remain in the repo as a safety net indefinitely — it costs nothing in a local git repo and provides insurance against late-discovered issues.

---

## Post-Rollback Notes

- **Vercel deployment will not work** after rollback — SQLite requires filesystem persistence
- Run locally or on a VPS with persistent storage
- The Supabase project can be paused/deleted after confirming rollback stability
- To re-attempt the migration later, create a fresh branch from `main` and address whatever caused the rollback
