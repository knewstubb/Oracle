# Test Plan — Shared Cards V2 Migration

> Authored by: James (Tester)
> Date: 2026-07-14
> References: `requirements.md`, `design.md`

## Test Strategy

This feature is primarily **deletion + wiring**. The main risks are: (1) breaking the existing Shared Cards listing by removing something it depended on, (2) leaving orphan references to deleted files, and (3) the proxy detection bug fix accidentally changing the meaning of existing data. No new algorithmic logic is introduced — the reallocation mechanism (Picklist) already exists and is tested under the taxonomy spec.

**Testing approach:**
- **Regression** on the shared-cards listing (the V2 route that stays)
- **Deletion verification** (zero references to removed files/table)
- **Bug fix validation** (proxy detection now reads `ownership_status`)
- **Navigation test** ("Resolve" link hits the correct Picklist URL)

---

## 1. Regression — Shared Cards Listing

**Verify the existing `/api/shared-cards` route still returns correct data after the proxy detection fix.**

| Test case | Method | Expected |
|-----------|--------|----------|
| Cards in 2+ decks appear in response | GET `/api/shared-cards` | `groups` array contains entries with `total_deck_count >= 2` |
| Basic lands excluded | GET `/api/shared-cards` | No entry for "Forest", "Island", etc. |
| `owned_total` reflects physical_copies count (non-proxy) | Spot check against DB | `owned_total` matches `SELECT COUNT(*) FROM physical_copies WHERE card_name = X AND is_proxy = false` (via card_definitions join) |
| `needing_proxies` is true when demand > supply | Spot check | Card in 3 decks with 1 owned copy → `needing_proxies: true` |
| Sort by deck count (default) works | GET `/api/shared-cards` | Entries ordered by `total_deck_count` descending |
| Sort by card name works | GET `/api/shared-cards?sort=card_name` | Entries ordered alphabetically |
| Color identity filter works | GET `/api/shared-cards?identity=B,G` | Only B/G cards returned |

## 2. Proxy Detection Bug Fix

| Test case | Setup | Expected |
|-----------|-------|----------|
| Deck with `ownership_status = 'proxy'` | A deck_cards row with `ownership_status = 'proxy'` for a shared card | API returns `is_proxy: true` for that deck entry |
| Deck with `ownership_status = 'original'` | A deck_cards row with `ownership_status = 'original'` | API returns `is_proxy: false` |
| Deck with `ownership_status = NULL` (unresolved) | A deck_cards row with NULL ownership_status | API returns `is_proxy: false` (not a proxy — it's unresolved) |
| Deck with proxy tag but `ownership_status = 'original'` | A deck_cards row with `tags LIKE '%proxy%'` but `ownership_status = 'original'` | API returns `is_proxy: false` (ownership_status takes precedence, tags no longer consulted) |

## 3. Deletion Verification

**Run after all files are deleted. Automated checks.**

```bash
# All deleted files must not be importable
grep -rn "ProxyAllocationPanel" src/ --include="*.ts" --include="*.tsx"
grep -rn "proxy-allocate" src/ --include="*.ts" --include="*.tsx"
grep -rn "shared-cards/allocations" src/ --include="*.ts" --include="*.tsx"
grep -rn "from '@/lib/allocation'" src/ --include="*.ts" --include="*.tsx"
grep -rn "collection-reallocator" src/ --include="*.ts" --include="*.tsx"
grep -rn "proxy_allocations" src/ --include="*.ts" --include="*.tsx"
```

**Gate:** All six greps return zero results.

**TypeScript compiler:**
```bash
npx tsc --noEmit
```
Must not introduce new errors from missing imports. (Pre-existing errors from other sources are acceptable — same standard as taxonomy gate.)

## 4. Migration Verification

**Run after migration 020 is applied.**

```sql
-- Table must not exist
SELECT * FROM proxy_allocations LIMIT 1;
-- Expected: ERROR — relation "proxy_allocations" does not exist
```

## 5. Navigation — "Resolve" Link

| Test case | Action | Expected |
|-----------|--------|----------|
| Click "Resolve →" on a proxy deck entry | Manual (or Playwright) | Navigates to `/decks/[deckId]?tab=cards&mode=picklist` |
| "Resolve →" not shown for non-contended cards | Card with owned >= deck count | No "Resolve" link visible |
| "Resolve →" not shown for original entries | Deck entry with `is_proxy: false` | No "Resolve" link on that row |

## 6. UI Verification (Manual)

| Surface | Check |
|---------|-------|
| Shared Cards page loads without errors | No console errors, no blank page |
| Shared card row expands on click | Shows per-deck list with `CardSlotBadge` |
| No "Apply to Archidekt" button visible | Panel removed entirely |
| No radio buttons (Original/Proxy toggle) visible | Panel removed entirely |
| `CardSlotBadge` shows correct status per deck | Original = teal solid, Proxy = teal dashed |
| "Resolve →" link navigates correctly | Lands on Picklist view for that deck |
| Returning from Picklist shows updated data | After reassignment, shared cards reflects new state |

## 7. Release Gate

- [ ] `npx tsc --noEmit` — no new errors introduced by deletions
- [ ] Deletion grep sweep (Section 3) — zero hits for all six patterns
- [ ] `/api/shared-cards` returns valid data with correct `is_proxy` values (Section 2)
- [ ] Migration 020 applied — `proxy_allocations` table does not exist (Section 4)
- [ ] "Resolve" link navigates to correct Picklist URL (Section 5)
- [ ] Manual UI spot-check passed (Section 6)
