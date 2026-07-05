# Rollback Procedure: Supabase → SQLite

> Last updated: 2025-01-01
> Status: Safety net — use only if Supabase is unrecoverable

## When to Rollback vs. When to Fix Forward

**Fix forward** (preferred) when:
- A single table or query is broken — patch the Supabase query or RPC function
- Edge Function (CK price refresh) fails — redeploy or fix the function code
- Data inconsistency in a few rows — correct directly in Supabase dashboard
- Environment variable misconfiguration — fix in Vercel project settings
- Supabase service degradation — wait for Supabase status recovery (typically <1hr)

**Rollback** (last resort) when:
- Supabase project is permanently inaccessible (account locked, data loss, billing failure)
- Fundamental schema corruption that cannot be repaired in-place
- Critical data integrity failure across many tables with no backup available
- Vercel deployment is completely blocked and cannot be unblocked with Supabase

A rollback is expensive — it reverts weeks of migration work. Exhaust all fix-forward options first.

---

## Prerequisites

Before starting the rollback, confirm you have:

- [ ] Access to the git repository with full history
- [ ] The source SQLite database file (`data/oracle.db`) — preserved and never modified during migration
- [ ] Node.js 18+ installed locally
- [ ] A terminal with git CLI available
- [ ] (Optional) Any data created in Supabase post-migration that needs to be preserved

### Verify Source Database Integrity

```bash
# From the project root (the-oracle/)
# Confirm the SQLite file exists and is valid
ls -la data/oracle.db
sqlite3 data/oracle.db "SELECT count(*) FROM sqlite_master WHERE type='table';"
```

If `data/oracle.db` is missing or corrupted, the rollback cannot proceed without a backup copy.

---

## Step-by-Step Rollback Procedure

### Step 1: Export Any New Data from Supabase (if applicable)

If new data was created in Supabase after the initial migration (new decks, collection additions, price updates, brew sessions), export it before reverting:

```bash
# Option A: Use the Supabase dashboard
# Navigate to Table Editor → Select table → Export as CSV

# Option B: Use the Supabase CLI (if configured)
# For each table with new data:
supabase db dump --data-only -t collection > supabase-export/collection.sql
supabase db dump --data-only -t decks > supabase-export/decks.sql
supabase db dump --data-only -t deck_cards > supabase-export/deck_cards.sql
# ... repeat for any table with post-migration changes
```

Store exports in a temporary directory outside the project for safekeeping.

### Step 2: Identify the Pre-Migration Git Commit

Find the last commit before the Supabase migration began:

```bash
# Look for the commit that introduced the Supabase client or removed SQLite
git log --oneline --all | grep -i "supabase\|sqlite\|migration"

# Or find the commit that last modified src/lib/db.ts (the SQLite module)
git log --oneline -- src/lib/db.ts

# Note the commit hash of the last SQLite-based state
# Example: abc1234 — "last commit before supabase migration"
```

### Step 3: Create a Rollback Branch

```bash
# Create a new branch from the pre-migration commit
git checkout -b rollback/sqlite-restore <pre-migration-commit-hash>
```

### Step 4: Restore SQLite Dependencies

```bash
# Install better-sqlite3 (the version used before migration)
npm install better-sqlite3
npm install -D @types/better-sqlite3

# Verify it installs cleanly
npx tsc --noEmit
```

### Step 5: Verify the SQLite Database File

```bash
# Confirm the database is readable
node -e "
const Database = require('better-sqlite3');
const db = new Database('data/oracle.db', { readonly: true });
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
console.log('Tables found:', tables.length);
console.log(tables.map(t => t.name).join(', '));
db.close();
"
```

Expected output: 30+ tables including `collection`, `decks`, `deck_cards`, `card_definitions`, etc.

### Step 6: Restore SQLite Migration Files (if needed)

The `db/migrations/` directory was removed during the Supabase migration but exists in git history:

```bash
# Restore the migrations directory from the pre-migration commit
git checkout <pre-migration-commit-hash> -- db/migrations/
```

### Step 7: Update Environment Configuration

```bash
# Remove Supabase environment variables from .env.local
# Restore the SQLite database path reference if needed

# .env.local should NOT have:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...

# The SQLite version typically has no DB env vars (hardcoded path to data/oracle.db)
```

### Step 8: Remove Supabase Dependencies

```bash
npm uninstall @supabase/supabase-js
# Remove any Supabase type files
rm -f src/types/supabase.ts
```

### Step 9: Build and Test Locally

```bash
# Run the build
npm run build

# If there are type errors, they likely indicate files that were changed
# during the migration that conflict with the restored SQLite code.
# Resolve by checking out those files from the pre-migration commit:
# git checkout <pre-migration-commit-hash> -- src/lib/<conflicting-file>.ts

# Start the dev server
npm run dev

# Test key functionality:
# - Collection page loads
# - Deck list displays
# - Individual deck detail works
# - Price data displays
```

### Step 10: Re-import Post-Migration Data (if exported in Step 1)

If you exported new data from Supabase that doesn't exist in the SQLite file:

```bash
# This requires manual SQL insertion into SQLite
# For each exported table, transform the data back to SQLite format:
# - Booleans: true/false → 1/0
# - Remove user_id column values
# - Timestamps remain as ISO strings

sqlite3 data/oracle.db <<EOF
-- Example: insert new collection entries
INSERT OR IGNORE INTO collection (card_name, quantity, ...)
VALUES ('New Card', 1, ...);
EOF
```

> ⚠️ This step requires manual effort and careful data transformation. For small amounts of new data, manual re-entry through the UI may be simpler.

---

## Verification After Rollback

Run these checks to confirm the rollback was successful:

- [ ] `npm run build` completes without errors
- [ ] `npm run dev` starts the dev server successfully
- [ ] Collection page loads and displays cards with correct quantities
- [ ] At least 3 deck pages load with full card lists
- [ ] Price data displays on collection cards (may be stale — acceptable)
- [ ] No references to Supabase remain in the active codebase:
  ```bash
  grep -r "supabase" src/ --include="*.ts" --include="*.tsx"
  grep -r "@supabase" package.json
  ```
- [ ] No references to the removed SQLite modules are broken:
  ```bash
  grep -r "better-sqlite3" src/ --include="*.ts"
  # Should find imports in src/lib/db.ts and stores
  ```
- [ ] The SQLite file is still intact after running the app:
  ```bash
  sqlite3 data/oracle.db "SELECT count(*) FROM collection;"
  ```

---

## Post-Rollback Deployment

After rolling back, the app returns to local-filesystem mode. This means:

- **Vercel deployment will NOT work** — SQLite requires local filesystem access
- Run the app locally or on a VPS/dedicated server with filesystem persistence
- If you need Vercel deployment again, the Supabase migration must be re-attempted (on a new branch, fixing whatever caused the rollback)

---

## Important Notes

1. **Source DB was never modified.** The `data/oracle.db` file was treated as read-only throughout the entire Supabase migration. It contains all data as of the migration start date.

2. **Git history preserves everything.** All SQLite-specific code (`src/lib/db.ts`, `src/lib/init-db.ts`, `src/lib/migrate.ts`, `db/migrations/`), the `better-sqlite3` dependency, and all synchronous query patterns exist in git history and can be restored.

3. **Data gap risk.** Any data created exclusively in Supabase after migration (new decks, collection changes, brew sessions) will NOT be in `data/oracle.db`. Step 1 of this procedure addresses exporting that data, but the re-import is manual and error-prone for large datasets.

4. **Supabase project cleanup.** After a successful rollback, the Supabase project can be paused or deleted to avoid ongoing costs. Do this only after confirming the rollback is stable.
