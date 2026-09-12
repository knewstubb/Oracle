# The Oracle — Current State Report

> Generated: 2026-07-07
> Purpose: Handoff/planning reference — facts only, no recommendations

---

## 1. FEATURE INVENTORY

### Collection

| Feature | Status | File(s) |
|---------|--------|---------|
| Collection grid view (card images, quantity, color identity) | Fully working | `src/components/collection/CollectionGridView.tsx`, `src/app/collection/page.tsx` |
| Printing list view (per-printing rows with set/foil/condition) | Fully working | `src/components/collection/PrintingListView.tsx` |
| Collection search, color identity filter, status filter, sort | Fully working | `src/lib/collection-filters.ts`, `src/components/collection/CollectionToolbar.tsx` |
| Grid → subgroup expansion (printings per oracle_id) | Fully working | `src/hooks/useCollectionRollup.ts` |
| CSV import (Archidekt/Moxfield/ManaBox format detection) | Fully working | `src/lib/csv-normalizer.ts`, `src/lib/chunked-import-client.ts` |
| "Import CSV" button in collection page | Fully working | `src/components/collection/CollectionImportButton.tsx` |
| Price display (CardKingdom via Supabase) | Fully working | `src/lib/price-store.ts`, `src/components/collection/PriceStaleIndicator.tsx` |
| Instance-level RollupView (oracle_id grouping, shortfall, tri-state selection) | Built, not wired to any page | `src/components/collection/RollupView.tsx` |
| Instance-level InstancePanel (per-copy detail, storage location selector) | Built, not wired to any page | `src/components/collection/InstancePanel.tsx` |
| BulkActionBar (selection-driven actions) | Built, not wired to any page | `src/components/collection/BulkActionBar.tsx` |
| StorageLocationSelect (per-instance assignment widget) | Built, not wired to any page | `src/components/collection/StorageLocationSelect.tsx` |
| Proxy toggle in printing list view | Fully working | `src/app/collection/page.tsx` (inline chip) |

### Decks

| Feature | Status | File(s) |
|---------|--------|---------|
| Deck list page with cards, categories, tags | Fully working | `src/app/decks/[id]/page.tsx` |
| Deck status management (active/draft/inactive) | Fully working | `src/app/api/decks/[id]/status/route.ts`, `src/lib/deck-status.ts` |
| Deck priority ordering | Fully working | `deck_priority` table, `allocation-store.ts` |
| Deck health engine (category analysis) | Fully working | `src/lib/health-engine.ts`, `src/lib/health-store.ts` |
| Deck documentation (strategy/synergy/matchup) | Fully working | `src/lib/deck-documentation-store.ts` |
| Deck ratings engine | Fully working | `src/lib/rating-engine.ts` |
| Dead weight detector | Fully working | `src/lib/dead-weight-classifier.ts` |
| Precon mod tracker | Fully working | `src/lib/precon-mod-engine.ts`, `src/lib/precon-mod-store.ts` |
| New deck page | Fully working | `src/app/new-deck/page.tsx` |

### Allocation / Resolver

| Feature | Status | File(s) |
|---------|--------|---------|
| V1 resolver (card-name level, reads `collection` table quantities) | Fully working, reads read-only `collection` table | `src/lib/allocation-resolver.ts` |
| V1 store (writes `deck_allocations` table) | **BROKEN** — `deck_allocations` is now read-only (migration 010 blocks writes) | `src/lib/allocation-store.ts` |
| V2 resolver (oracle_id level, reads `physical_copies`) | Built, partially working | `src/lib/allocation-resolver-v2.ts` |
| V2 store (writes `deck_cards.physical_copy_id` + `ownership_status`) | Built, partially working | `src/lib/allocation-store-v2.ts` |
| Allocation tab (shared cards + all cards views) | Fully working (reads `deck_allocations` — stale after 010) | `src/components/AllocationTab.tsx`, `src/components/AllCardsAllocationView.tsx` |
| Manual resolve endpoint `POST /api/allocation/resolve` | Built, unverified against real data | `src/app/api/allocation/resolve/route.ts` |
| Auto-trigger on deck status change | Built — runs BOTH V1 and V2 | `src/app/api/decks/[id]/status/route.ts` |
| Auto-trigger on import completion | Built (V2 only, async) | `src/app/api/collection/import/route.ts` |

### Brew Mode

| Feature | Status | File(s) |
|---------|--------|---------|
| Brew v2 canvas (chat, card list, curve view, category breakdown) | Fully working | `src/components/brew-v2/` directory (20+ files) |
| Commander and concept path selection | Fully working | `src/lib/brew-v2-session.ts` |
| Multi-model AI support (Claude, GPT, Gemini) | Fully working | `src/lib/ai-models.ts`, `src/lib/provider-factory.ts` |
| Session autosave | Fully working | `src/lib/brew-autosave-serializers.ts` |
| Decision logging | Fully working | `src/lib/brew-v2-decisions.ts` |
| Assessment cache (card evaluation persistence) | Fully working | `src/lib/brew-v2-assessment-cache.ts` |

### Storage

| Feature | Status | File(s) |
|---------|--------|---------|
| Storage locations CRUD | Fully working | `src/app/api/settings/storage-locations/route.ts` |
| Collection-level location assignment (legacy — per printing group) | Fully working | `src/app/api/collection/assign-location/route.ts` (POST) |
| Instance-level location assignment (per physical copy) | Built, not connected to main UI | `src/app/api/collection/assign-location/route.ts` (PATCH) |
| Location filter in collection toolbar | Fully working | `src/components/collection/CollectionToolbar.tsx` |

### Import / Export

| Feature | Status | File(s) |
|---------|--------|---------|
| Legacy CSV import (DELETE-ALL + INSERT, gated with `confirm_delete=true`) | Fully working | `src/app/api/collection/import/route.ts` mode=legacy |
| V1 "upsert" import (to physical_copies) | Fully working | `src/lib/import-engine.ts` |
| V2 "add" mode (instance-level append) | Built, unverified end-to-end | `src/lib/import-engine-v2.ts` |
| V2 "sync" mode (source-scoped upsert) | Built, unverified end-to-end | `src/lib/import-engine-v2.ts` |
| CSV source format auto-detection (Archidekt/Moxfield/ManaBox) | Fully working | `src/lib/csv-normalizer.ts` (`detectSourceTag`) |
| Archidekt deck sync (Playwright automation) | Fully working | `src/lib/archidekt-playwright.ts`, `src/lib/archidekt-sync.ts` |

---

## 2. SCHEMA STATE

### `physical_copies` (post-migration 007)

```sql
CREATE TABLE physical_copies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_definition_id INTEGER NOT NULL REFERENCES card_definitions(id),
  scryfall_printing_id TEXT,
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_for_definition_id INTEGER REFERENCES card_definitions(id) ON DELETE SET NULL,
  condition TEXT CHECK (condition IS NULL OR condition IN ('near_mint','lightly_played','moderately_played','heavily_played','damaged')),
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TEXT,
  -- quantity column DROPPED by migration 007
  storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL,  -- Added by 007
  source_tag TEXT CHECK (source_tag IS NULL OR length(source_tag) <= 100),          -- Added by 007
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- idx_physical_copies_group DROPPED by 007
-- New indexes: user_definition, source_printing, storage
```

### `card_definitions`

```sql
CREATE TABLE card_definitions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oracle_id TEXT NOT NULL UNIQUE,
  card_name TEXT NOT NULL,
  color_identity TEXT DEFAULT '',
  type_line TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### `deck_cards`

```sql
CREATE TABLE deck_cards (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  quantity INTEGER DEFAULT 1,
  categories TEXT,
  tags TEXT,
  is_commander BOOLEAN DEFAULT FALSE,
  dead_weight_flag TEXT,
  dead_weight_reason TEXT,
  ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original','proxy','not_owned')),
  proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL,
  physical_copy_id INTEGER REFERENCES physical_copies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL
);
```

### `decks`

```sql
CREATE TABLE decks (
  id INTEGER PRIMARY KEY,  -- Archidekt-sourced, not auto-generated
  name TEXT NOT NULL,
  commander_name TEXT,
  commander_scryfall_id TEXT,
  colour_identity TEXT,
  card_count INTEGER,
  last_synced_at TIMESTAMPTZ,
  raw_json TEXT,
  precon_url TEXT,
  deck_type TEXT DEFAULT 'Custom',
  bracket TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft','inactive')),
  is_precon_mod BOOLEAN DEFAULT FALSE,
  user_id UUID NOT NULL
);
```

### `storage_locations`

```sql
CREATE TABLE storage_locations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, user_id)
);
```

### Legacy Table State

| Table | Present | State |
|-------|---------|-------|
| `collection` | Yes | **READ-ONLY** — migration 010 revokes all writes (anon, authenticated, service_role) and adds trigger that raises exception on INSERT/UPDATE/DELETE |
| `deck_allocations` | Yes | **READ-ONLY** — same treatment as `collection` via migration 010 |

Both tables are still queryable via SELECT. The V1 `allocation-store.ts` still attempts to WRITE to `deck_allocations` on deck status changes, which will now fail.

---

## 3. VERIFICATION OF PRIOR MIGRATION

### 3a. Legacy Allocation Transfer Conflicts

The `scripts/legacy-allocation-transfer.ts` script has **not been run against production data**. It exists as code only. Here is how it handles conflicts:

- If `deck_cards.ownership_status` is already non-null AND differs from the mapped `deck_allocations.role`, the script **preserves the existing deck_cards value** and logs the conflict (card_name, deck_id, existing value, incoming value).
- The script outputs a summary with: rows mapped, rows skipped (no match), conflicts preserved, physical_copy_id assignments made.
- No output file from a prior run exists in the repo. **No conflicts have been reported because the script has not been executed.**

### 3b. Parallel-Run Comparison

**No parallel-run comparison has been performed.** There is no script, output file, or documentation showing a side-by-side comparison of V1 (`collection` + `deck_allocations`) output versus V2 (`physical_copies` + `deck_cards.physical_copy_id`) output for any deck.

The two systems coexist but have not been cross-validated.

### 3c. Import Engine V2 Sync Mode — Source Scoping Logic

The actual logic (`src/lib/import-engine-v2.ts`, function `executeSyncMode`):

1. Detects `sourceTag` from CSV headers (e.g., `'archidekt'`)
2. Fetches ALL existing `physical_copies` WHERE `user_id = userId AND source_tag = [detected tag]`
3. Compares CSV demand vs DB supply **scoped by that source_tag**:
   - Match key: `scryfall_printing_id`
   - If CSV has more copies than DB → insert the deficit
   - If DB has more copies than CSV → remove the surplus
4. **Rows with a different `source_tag` are never fetched, never matched, never touched.**

Example: Re-importing a Moxfield CSV with `source_tag = 'moxfield'` will ONLY compare against existing `physical_copies` rows WHERE `source_tag = 'moxfield'`. Rows tagged `'archidekt'` or `'backfill'` are completely untouched.

Before removing assigned copies, the engine unlinks them from `deck_cards` (sets `physical_copy_id = NULL`, `ownership_status = 'not_owned'`).

### 3d. Selection Model + Filter Behavior

From `src/components/collection/RollupView.tsx`:

When the rollup-level checkbox is clicked:
- The `handleSelectAll` function iterates over `sortedRows` — which is the **post-filter** list (already filtered by the Basic Land toggle and any active filters)
- It calls `toggleAllRollupRows(rows)` with only the currently visible rows
- **Hidden rows (e.g., basic lands when the filter is on) are not selected**

At the instance level, the selection model uses placeholder IDs (sequential 1..N) at the rollup level since actual `physical_copy_id` values aren't available without an API call. The BulkActionBar would need to resolve actual IDs when executing.

When the Instance Panel is open and `isSelected`/`toggleInstance` props are provided, individual checkboxes toggle against the shared selection Map using real `physicalCopyId` values from the API response.

**There is no "active filter" concept within the Instance Panel itself** — it displays all copies for the oracle_id. The rollup-level checkbox only applies to what's visible in the rollup list.

---

## 4. UI COMPONENT STATE

### RollupView (`src/components/collection/RollupView.tsx`)

| Interaction | Status |
|-------------|--------|
| Display one row per oracle_id with counts | Implemented |
| Sort by any column (name, owned, proxy, allocated, shortfall) | Implemented |
| Hide Basic Lands toggle | Implemented |
| Shortfall highlighting (amber border + icon) | Implemented |
| Tri-state checkbox per row (hover-revealed) | Implemented |
| Select All checkbox in header | Implemented |
| Row click → `onRowSelect(oracleId)` callback | Implemented |
| **Wired to the collection page** | **NOT WIRED** — collection page uses `CollectionGridView` / `PrintingListView` |

### InstancePanel (`src/components/collection/InstancePanel.tsx`)

| Interaction | Status |
|-------------|--------|
| Display copies with set, collector#, foil, condition, proxy badges | Implemented |
| Show deck name for allocated copies | Implemented |
| Storage location selector for unallocated copies | Implemented |
| "Add Proxy" button (calls `/api/collection/instances/add-proxy`) | Implemented |
| "Reassign" button | **STUBBED** — renders a button but no click handler / flow |
| Per-instance selection checkboxes | Implemented (when selection props provided) |
| Sort by set release date DESC | Implemented (depends on `scryfall_cards` table data) |

### BulkActionBar (`src/components/collection/BulkActionBar.tsx`)

| Action | Status |
|--------|--------|
| Shows/hides based on `selectedCount > 0` | Implemented |
| "Assign Location" button | **SHELL ONLY** — fires `onBulkAssignLocation` callback, no implementation wired |
| "Create Proxy" button | **SHELL ONLY** — fires `onBulkCreateProxy` callback, no implementation wired |
| "Toggle Proxy" button | **SHELL ONLY** — fires `onToggleProxy` callback, no implementation wired |
| "Remove" button | **SHELL ONLY** — fires `onRemoveFromCollection` callback, no implementation wired |
| "Clear" / deselect all | Implemented (calls `onClearAll`) |
| Keyboard accessible | Implemented (native buttons, role=toolbar) |

**BulkActionBar does NOT support "assign to deck"** — only the four listed actions.

---

## 5. KNOWN GAPS / TODOs

### In code comments

| Location | Note |
|----------|------|
| `src/app/api/decks/[id]/upgrade/refresh/route.ts:43` | `// TODO: Re-run upgrade engine (EDHREC staples...)` |
| `src/app/new-deck/page.tsx:345` | `// TODO: Show user-facing error toast` |

### Architectural gaps

| Gap | Description |
|-----|-------------|
| **V1 allocation writes are broken** | `allocation-store.ts → applyAllocationOutput()` tries to UPSERT into `deck_allocations` which is now read-only (migration 010). The deck status change route calls V1 first, catches the error, then runs V2. |
| **New UI components not wired to a page** | `RollupView`, `InstancePanel`, `BulkActionBar`, `StorageLocationSelect` exist as standalone components but no page imports them. The collection page still uses the older grid/list views. |
| **BulkActionBar callbacks are stubs** | The four action buttons accept callback props but nothing in the codebase provides implementations. No API routes handle bulk proxy creation, bulk removal, or bulk toggle. |
| **`useSelectionModel` uses placeholder IDs at rollup level** | When selecting at the rollup level, sequential numbers (1..N) are used instead of real `physical_copy_id` values. Actual resolution would require an API call per oracle_id. |
| **Legacy allocation transfer not run** | `scripts/legacy-allocation-transfer.ts` exists but has never been executed. Deck_cards.ownership_status may be partially populated (from Archidekt tag imports) but not systematically from deck_allocations. |
| **Backfill script not run** | `scripts/backfill-collection-to-physical-copies.ts` exists but depends on migration 007 being applied. Unknown if 007 has been applied to the live Supabase instance. |
| **Migrations 007–012 deployment status unknown** | The SQL files exist in `supabase/migrations/` but there is no evidence they've been applied to the live database. The `physical_copies` table may still have the `quantity` column and unique index in production. |
| **`collection_rollup` view (012) depends on 007** | If migration 007 hasn't run, the view will fail because it references `physical_copies` without a `quantity` column. |
| **InstancePanel "Reassign" button is a stub** | Renders visually but has no click handler or navigation flow. |
| **V2 import route is now the default** | The API route defaults `mode` to `'sync'` — if this is deployed before migrations 007+ are applied, imports will attempt to use `import-engine-v2.ts` against a schema that still has the `quantity` column. |

### Deferred features (from spec, not built)

| Feature | Status |
|---------|--------|
| Proxy allocation → deck assignment (Req 13.5: "assign new proxy to deck that triggered shortfall") | Not implemented — "Add Proxy" creates the row but doesn't auto-assign |
| Proxy removal → re-resolve (Req 13.6) | Not implemented |
| Instance Panel "Reassign" flow (Req 10.7) | Stubbed button, no flow |

---

## 6. OWNERSHIP BADGE STATE

**Ownership badges have NOT been implemented.** No component renders a per-card badge showing "original" / "proxy" / "not_owned" status in the deck detail view or collection views.

The data exists:
- `deck_cards.ownership_status` contains `'original'`, `'proxy'`, or `'not_owned'` values (populated by Archidekt tag import and/or the V1 resolver)
- `deck_cards.physical_copy_id` is populated by the V2 resolver when it runs
- The V2 resolver computes `ShortfallEntry[]` with overallocation/shortfall data

But no UI consumes this data for badging. The Allocation Tab shows shared cards with proxy/original roles from `deck_allocations` (V1 data), not from `deck_cards.ownership_status` or physical_copy_id assignments.
