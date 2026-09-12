# Supabase Query Gotchas

## First Things to Check When Data is Missing

When debugging "missing data" issues — queries returning fewer results than expected, or specific records not appearing — check these **before** assuming the data doesn't exist.

---

## 1. Default Row Limit (1000)

**The Problem:** Supabase/PostgREST returns a maximum of **1000 rows** by default. If your table has more, you silently get a truncated result.

**Symptoms:**
- Query returns exactly 1000 rows
- Known records don't appear in results
- Works in dev (small dataset), fails in prod (large dataset)

**The Fix:** Paginate large queries:

```typescript
const allRows: Row[] = []
const PAGE_SIZE = 1000
let offset = 0
let hasMore = true

while (hasMore) {
  const { data, error } = await supabase
    .from('table')
    .select('*')
    .range(offset, offset + PAGE_SIZE - 1)
  
  if (data && data.length > 0) {
    allRows.push(...data)
    hasMore = data.length === PAGE_SIZE
    offset += PAGE_SIZE
  } else {
    hasMore = false
  }
}
```

**Real Example:** `searchOwnedByType()` returned 0 curses because user had 2527 cards but query only fetched the first 1000.

---

## 2. URL Length Limit on `.in()` Queries

**The Problem:** The `.in('column', array)` filter encodes all values in the URL. Large arrays hit URL length limits (~8KB) and silently truncate or fail.

**Symptoms:**
- `.in()` with 500+ values returns partial results
- Works with small arrays, fails with large ones
- No explicit error — just missing data

**The Fix:** Batch `.in()` queries:

```typescript
const BATCH_SIZE = 200
const allResults: Row[] = []

for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE)
  const { data } = await supabase
    .from('table')
    .select('*')
    .in('id', batch)
  
  if (data) allResults.push(...data)
}
```

---

## 3. Case Sensitivity in Filters

**The Problem:** `.eq()` is case-sensitive. If your data has mixed case, exact matches fail.

**Symptoms:**
- Record exists but `.eq()` returns null
- Works with some records, not others

**The Fix:** Use `.ilike()` for case-insensitive matching, or normalize case consistently.

```typescript
// Case-sensitive (may fail)
.eq('name', 'Curse of Opulence')

// Case-insensitive
.ilike('name', 'Curse of Opulence')
```

---

## 4. Missing RLS Policies

**The Problem:** Row Level Security may filter out rows the query user doesn't have access to.

**Symptoms:**
- Query works with service role key, fails with anon/user key
- Data exists in Supabase dashboard but not in API response

**The Fix:** Check RLS policies, or use `createAdminClient()` for trusted server-side operations.

---

## 5. Null Handling in Filters

**The Problem:** `.eq('column', null)` doesn't work as expected. Postgres uses `IS NULL`.

**Symptoms:**
- Filtering for null values returns nothing

**The Fix:** Use `.is('column', null)` instead of `.eq()`.

---

## Quick Diagnostic

When data is missing, run this checklist:

1. **Count check:** `select('*', { count: 'exact', head: true })` — does the count match expectations?
2. **Direct lookup:** Query the specific missing record by ID — does it exist?
3. **Row limit:** Is your result exactly 1000? → Pagination issue
4. **Auth context:** Are you using the right client (admin vs user)?
5. **RLS:** Does the policy allow this user to see this row?

---

## Provenance

- Authored: 2026-08-12 by Delivery Lead (Gene)
- Motivated by: `search_owned_cards` returning 0 curses because user_cards query hit 1000-row limit on a 2527-card collection. Cost ~2 hours to diagnose.
