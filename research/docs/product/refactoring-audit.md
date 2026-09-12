# Refactoring Audit — Ready-to-Act vs. Unknowns

> Generated: 2026-07-13 | Updated: 2026-07-13
> Purpose: Confirm what's dead, what's entangled, and what decisions are needed before refactoring.

---

## Confirmed Dead Code — DELETED

These had zero production imports. Deleted 2026-07-13:

| Item | Type | Notes |
|------|------|-------|
| ~~`src/lib/archidekt-playwright.ts`~~ | Lib | Routes are 501 stubs. Deleted. |
| ~~`src/lib/mtgjson-db.ts`~~ | Lib | Zero imports. Replaced by `mtg_cards` table. Deleted. |
| ~~`src/components/BrewBriefCard.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/BrewConfirmationCard.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/BrewContextPanel.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/BrewPathSelector.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/BrewSaveDialog.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/BrewSkeletonPanel.tsx`~~ | Component | V1 brew. Deleted. |
| ~~`src/components/brew-v2/DraftBanner.tsx`~~ | Component | Duplicate. Deleted. |
| ~~`src/components/brew-v2/DraftDeckTile.tsx`~~ | Component | Duplicate. Deleted. |
| ~~`src/hooks/useBrewSession.ts`~~ | Hook | V1 brew hook. Only stale test imported it. Deleted. |
| `sync_runs` table | DB Table | Zero app code reads/writes. Table left in DB (harmless), removed from types later. |

---

## Resolved Questions

### ✅ Q1: V1 Brew Mode — CONFIRMED DEAD

**Evidence:** `useBrewSession.ts` (the V1 hook) was imported by ZERO pages or components — only a stale test file. The `/new-deck` page uses `brew-v2-session`, `brew-v2-deck-state`, and `useBrewAutosave` exclusively.

**Next step:** Delete the 7 V1 brew API routes (`/api/ai/brew/*`) and `mcp-client.ts` (which is only imported by those routes + old AI routes). This is safe but requires also checking which other `/api/ai/*` routes import `mcp-client.ts` — those need individual assessment.

### ✅ Q2: Shared Cards / ProxyAllocationPanel → Migrate to V2

**Decision confirmed.** Will be specced as its own piece of work. Once migrated:
- Delete: `allocation.ts`, `allocation-resolver.ts`, `allocation-store.ts`, `collection-reallocator.ts`
- Drop: `proxy_allocations` table

### ✅ Q3: Collection Import — ANSWERED

**Finding:** `/api/collection/import` IS the ongoing resync feature (not a onboarding duplicate). It supports multiple modes:
- `replace` — full wipe + reimport from CSV (uses `import-engine-v2.ts`)
- `add` / `sync` — incremental append (uses `import-engine-v2.ts`)
- `upsert` — V1 legacy mode (uses `import-engine.ts`)
- `legacy` — old DELETE+INSERT to `collection` table (gated, uses `csv-import.ts` + `collection-reallocator.ts`)

**Conclusion:** `import-engine-v2.ts` is the winner (handles `replace`, `add`, `sync` — the modes that actually get used). `import-engine.ts` only serves the `upsert` mode, which is labeled "legacy v1 instance mode — kept for backward compatibility."

**Action:** Once `upsert` mode is removed from the route, `import-engine.ts` and its script (`scripts/run-collection-import.ts`) can be deleted. The `legacy` mode path (writes to read-only `collection` table via `csv-import.ts` + `collection-reallocator.ts`) is already dead in practice (the table has a write-blocking trigger).

### ✅ Q4: Rollup vs Rollup-v2 — ANSWERED

**They serve different purposes:**

| Endpoint | Returns | Used By | Purpose |
|----------|---------|---------|---------|
| `/api/collection/rollup` | Fat response: pricing, printing subgroups, deck usage, set info | `useCollectionRollup.ts` → Collection page | Detailed collection UI |
| `/api/collection/rollup-v2` | Lean: owned/proxy/allocated/shortfall counts per oracle_id | Currently unused by any component | Allocation status checking |

**Conclusion:** Both have value. The old rollup powers the Collection page (detailed per-printing data with pricing). rollup-v2 is the lean allocation-aware view that could power status badges and contention detection. Neither replaces the other — they're complementary.

**No deletion needed.** The Collection page stays on the old rollup. rollup-v2 will be wired up when the four-state allocation status is surfaced on the Collection page (separate work).

### ✅ Q5: MCP Client — Downstream of Q1

Confirmed dead once V1 brew routes are removed. `mcp-client.ts` is imported by V1 AI routes + scripts. Take it with the V1 brew deletion.

### ✅ Q6: Deck Reimport — DOES NOT RECONCILE

**Finding:** `deck-import-legacy.ts` does a **blind wipe-and-replace**:
1. Upserts deck metadata
2. `DELETE FROM deck_cards WHERE deck_id = ?` (destroys ALL existing cards)
3. Inserts fresh from Archidekt

**No diffing, no reconciliation.** It destroys physical_copy_id links, ownership_status, category edits — everything.

**Conclusion:** The feature (reconcile against a fresh scan) is valid and wanted. The current implementation does NOT do what's needed. It needs to be rebuilt with proper reconciliation semantics:
- Detect added/removed cards vs. existing
- Preserve physical_copy_id links on cards that still match
- Only unlink cards that were actually removed from the deck

**Flag:** `deck-import-legacy.ts` is NOT safe to delete (it's wired to a live route) but it IS wrong for the intended use case. Needs a rewrite spec.

---

## Noted for Future (Not Part of This Refactor)

**Sorted / Unsorted axis:** Physical cards with/without `storage_location_id` set. Separate from "Unallocated" (which means a deck slot with a free copy available). Will be specced as its own piece of work after this cleanup lands. "Unallocated" retains its current meaning unchanged.


---

## Remaining Refactoring Work (Ordered)

All questions resolved. Here's the execution plan:

### Phase 1: Delete V1 Brew Routes + MCP Client

**Scope:** 7 API routes + `mcp-client.ts` + any now-orphaned imports.

| Delete | Reason |
|--------|--------|
| `src/app/api/ai/brew/start/route.ts` | V1 brew — no page uses it |
| `src/app/api/ai/brew/investigate/route.ts` | V1 brew |
| `src/app/api/ai/brew/confirm/route.ts` | V1 brew |
| `src/app/api/ai/brew/generate/route.ts` | V1 brew |
| `src/app/api/ai/brew/refine/route.ts` | V1 brew |
| `src/app/api/ai/brew/save/route.ts` | V1 brew |
| `src/app/api/ai/brew/session/route.ts` | V1 brew |
| `src/lib/mcp-client.ts` | Only imported by V1 AI routes + scripts |

**Risk:** Other `/api/ai/*` routes (deck-scan, search, build-deck, mana-analysis, recommend) also import `mcp-client.ts`. Need to check if they have a fallback or if they'll break. If they break, either delete them too (if unused) or refactor them to use direct API calls (like tool-registry.ts already does).

### Phase 2: Migrate Shared Cards to V2 Allocation

**Scope:** Rewrite `/shared-cards` page + `ProxyAllocationPanel` to use `physical_copies` + `deck_cards.physical_copy_id` instead of `proxy_allocations`.

Then delete:
- `src/lib/allocation.ts`
- `src/lib/allocation-resolver.ts`
- `src/lib/allocation-store.ts`
- `src/lib/collection-reallocator.ts`
- `src/app/api/proxy-allocate/route.ts`
- `proxy_allocations` table (migration to DROP)

### Phase 3: Consolidate Import Engines

**Keep:** `import-engine-v2.ts` (handles `replace`, `add`, `sync` modes)
**Delete:** `import-engine.ts` + `scripts/run-collection-import.ts`
**Also delete:** The `legacy` and `upsert` mode branches from `/api/collection/import/route.ts`

The `legacy` mode writes to the read-only `collection` table (trigger blocks it anyway). The `upsert` mode calls `import-engine.ts` (V1). Both are dead ends.

### Phase 4: Rebuild Deck Reimport (Not a Delete — a Rewrite)

`deck-import-legacy.ts` does blind wipe-and-replace. The feature is wanted but the implementation is wrong.

**Rewrite to:**
- Fetch fresh deck from source (Archidekt/CSV)
- Diff against existing `deck_cards` rows
- Preserve `physical_copy_id` links on cards that still match
- Only unlink cards actually removed
- Add new cards (unresolved, trigger auto-assign)
- Report what changed (added, removed, preserved)

This is a new spec, not part of the cleanup pass.

---

## Summary

| Phase | Action | Risk | Blocks |
|-------|--------|------|--------|
| ✅ Done | Delete dead code (11 files) | None | — |
| 1 | Delete V1 brew routes + MCP | Low (check other AI routes) | Nothing |
| 2 | Migrate Shared Cards to V2 | Medium (rewrite) | V1 alloc deletion |
| 3 | Consolidate imports | Low | Nothing |
| 4 | Rebuild reimport | Medium (new spec) | Nothing — keep broken impl until rewrite lands |
