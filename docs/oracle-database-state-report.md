# Oracle Database & API Current-State Report

> Generated: 2026-07-06
> Purpose: Factual current-state snapshot for spec work handoff

---

## 1. SCHEMA — Current DDL

### `collection`

```sql
CREATE TABLE collection (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  quantity INTEGER DEFAULT 1,
  foil BOOLEAN DEFAULT FALSE,
  finish TEXT DEFAULT 'Normal',
  condition TEXT DEFAULT 'Near Mint',
  date_added TEXT,
  language TEXT DEFAULT 'English',
  purchase_price NUMERIC DEFAULT 0,
  collector_number TEXT,
  color_identity TEXT,
  types TEXT,
  edition_name TEXT,
  user_id UUID NOT NULL,
  storage_location_id INTEGER REFERENCES storage_locations(id) ON DELETE SET NULL  -- Added via 006
);
-- Indexes: card_name, color_identity, types, user_id, storage_location_id
-- No UNIQUE constraint on (card_name, set_code, foil) — duplicates possible
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
  categories TEXT,                    -- JSON array string
  tags TEXT,                          -- JSON array string
  is_commander BOOLEAN DEFAULT FALSE,
  dead_weight_flag TEXT CHECK(dead_weight_flag IN ('redundant','off_strategy','bracket_mismatch','format_violation')),
  dead_weight_reason TEXT,
  ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original','proxy','not_owned')),
  proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL,
  physical_copy_id INTEGER REFERENCES physical_copies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL
);
-- UNIQUE: none (same card can appear in a deck in multiple rows)
-- Indexes: card_name, deck_id, physical_copy_id, user_id
-- Note: is_generic_land column exists in the original schema but is NOT actively used
```

### `deck_allocations`

```sql
CREATE TABLE deck_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  collector_number TEXT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original','proxy')),
  priority_override BOOLEAN DEFAULT FALSE,
  written_to_archidekt BOOLEAN DEFAULT FALSE,
  written_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE(card_name, deck_id)
);
-- FK: deck_id → decks(id) ON DELETE CASCADE
-- NO FK to collection table
-- Indexes: card_name, deck_id, scryfall_id, user_id
```

### `decks`

```sql
CREATE TABLE decks (
  id INTEGER PRIMARY KEY,             -- From Archidekt, NOT auto-generated
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
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft','inactive')),  -- Updated via 005
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
-- Added via migration 006
-- RLS enabled with user policy + service role bypass
```

### `card_definitions` (EXISTS)

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

### `physical_copies` (EXISTS)

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
  quantity INTEGER NOT NULL DEFAULT 1,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- UNIQUE: (card_definition_id, scryfall_printing_id, is_foil, is_proxy)
```

---

## 2. MIGRATION STATE

| Migration | Status | Notes |
|-----------|--------|-------|
| 001_initial_schema.sql | ✅ Applied | All 31 tables created |
| 002_rpc_functions.sql | ✅ Applied | RPC functions |
| 003_rls_policies.sql | ✅ Applied | RLS policies |
| 003b_rls_reference_tables.sql | ✅ Applied | Reference table RLS |
| 004_migrate_user_id.sql | ✅ Applied | user_id migration |
| 005_deck_status_inactive.sql | ✅ Applied | status CHECK updated to active/draft/inactive |
| 006_storage_locations.sql | ✅ Applied | storage_locations table + FK on collection |

**Both `card_definitions` and `physical_copies` tables exist in Postgres** but are largely unused by the current UI/allocation flow. The app primarily operates against `collection` and `deck_allocations` directly, not through the normalized `physical_copies` path.

---

## 3. ROW GRANULARITY — `collection` Table

**Each row is one-per-unique-printing with a quantity integer.** NOT per-instance.

### Sample rows (from live Supabase):

| id | card_name | set_code | quantity | foil | scryfall_id | collector_number |
|----|-----------|----------|----------|------|-------------|-----------------|
| 1 | Plains | msh | 1 | false | null | null |
| 42 | Swamp | eld | 33 | false | null | 258 |
| 200 | Arcane Signet | tdc | 2 | false | null | 105 |

**Key observation:** The "All Cards" allocation view explodes `quantity` into individual rows client-side (the API loops `for (let i = 0; i < c.quantity; i++)`). The database itself does NOT have per-copy rows.

---

## 4. EXISTING PROXY HANDLING

### Where proxy status is stored:

| Location | Column | Type | Set when |
|----------|--------|------|----------|
| `deck_cards.ownership_status` | TEXT | `'original'` / `'proxy'` / `'not_owned'` | Import/sync from Archidekt tags |
| `deck_allocations.role` | TEXT | `'original'` / `'proxy'` | Computed by allocation resolver OR set manually from Archidekt tags |

### How it flows:
1. **Import time:** When a deck is synced from Archidekt, the `^Have^` / `^Proxy^` colour tags are mapped to `deck_cards.ownership_status`
2. **Allocation resolver:** `buildAllocationInput()` computes demand vs supply, `computeAllocations()` assigns roles, `applyAllocationOutput()` writes to `deck_allocations.role`
3. **UI reads from:** The deck detail API joins `deck_allocations.role` onto cards as `allocation_role`

**Current state is hybrid:** Some decks have allocations computed by the resolver, some (like "A Rot to Process") have allocations set directly from Archidekt tag data without running the resolver.

---

## 5. `deck_allocations` CONTENTS

### Foreign keys in place today:
- `deck_id → decks(id) ON DELETE CASCADE` ✅
- **NO FK to `collection` table** — allocations reference cards by `card_name` + `set_code`, not by collection row ID
- **NO FK to `physical_copies` table** from `deck_allocations`

### Actual columns used for card identity:
```
card_name TEXT NOT NULL       -- matches collection.card_name
set_code TEXT                 -- may be null
scryfall_id TEXT              -- may be null
collector_number TEXT         -- may be null
```

The `UNIQUE(card_name, deck_id)` constraint means one allocation row per card per deck.

---

## 6. IMPORT PIPELINE

### Routes:

| Route | Function | Format |
|-------|----------|--------|
| `POST /api/collection/import?mode=legacy&apply=true` | `applyCollectionImport()` in `csv-import.ts` | DELETE-all + INSERT (first chunk), INSERT-only (subsequent chunks) |
| `POST /api/collection/import?mode=upsert` | `executeCollectionImportAsync()` in `import-engine.ts` | Writes to `physical_copies` table (newer path, not used by main UI) |

### Client orchestration:
- `chunked-import-client.ts` → normalizes CSV (Archidekt/Moxfield/ManaBox) → chunks 500 rows → POSTs sequentially
- "Import CSV" button: chunk_index=0 triggers DELETE, subsequent chunks append
- "Add Cards" button: all chunks use chunk_index > 0 (no DELETE ever)

### Does it expand quantity > 1?
**NO.** The import inserts one row per CSV line with the `quantity` field preserved. A row with `quantity: 33` stays as one row with `quantity: 33` in the `collection` table.

---

## 7. RISK FLAGS — Brew/AI Routes

### Routes that touch collection/allocation tables:

| Route | Touches | Risk |
|-------|---------|------|
| `POST /api/ai/brew/save` | INSERT into `deck_cards` (status: 'draft') | Low — doesn't touch collection or allocations |
| `POST /api/brew/save` | INSERT/UPDATE `deck_cards` + may set deck status | Medium — inserts deck_cards but only with explicit status field |
| `PATCH /api/decks/[id]/status` | DELETE `deck_allocations` + re-resolves | Medium — depends on allocation resolver running correctly |
| `POST /api/collection/import` (legacy mode) | DELETE ALL `collection` rows + re-insert | HIGH — full table wipe on first chunk |
| `POST /api/allocation/reassign` | UPDATE `deck_allocations.role` | Low — single-card reassignment |

### Would a schema change to instance-level tracking affect these?
- **`/api/collection/import`** — YES, heavily. Currently does bulk DELETE + INSERT by card_name. Instance-level tracking would require upsert-by-identity logic.
- **`allocation-store.ts` `buildAllocationInput()`** — YES. Currently groups by `card_name` and counts demand vs `collection.quantity`. Instance-level would need to reference specific collection row IDs.
- **`/api/decks/[id]/status`** — Moderate. Deletes allocations by deck_id then re-resolves. Resolver itself would need updating.
- **Brew routes** — Low risk. They create `deck_cards` rows, not collection data.

---

## 8. STORAGE LOCATION FK

**`storage_location_id` lives on the `collection` row** (added via migration 006).

```sql
ALTER TABLE collection ADD COLUMN storage_location_id INTEGER 
  REFERENCES storage_locations(id) ON DELETE SET NULL;
```

- Column is nullable (most rows are NULL currently)
- One location per collection row (per-printing, not per-instance)
- When a storage_location is deleted, the FK is SET NULL (cards become "unassigned")

**Implication:** Since `collection` is one-row-per-printing-with-quantity, the storage_location applies to ALL copies of that printing. You cannot currently store "1x Sol Ring (TDC) in Binder A" and "1x Sol Ring (TDC) in Box B" — they share the same row and therefore the same location.
