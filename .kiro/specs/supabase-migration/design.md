# Design Document: Supabase Migration

## Overview

This design covers the platform migration of The Oracle from a local SQLite database (`better-sqlite3`) to Supabase (managed Postgres), enabling deployment on Vercel's serverless infrastructure. The migration is a 1:1 port — no schema redesign, no new features, no auth/RLS.

**Key decisions:**
- **Database client:** `@supabase/supabase-js` for the application layer (query builder + connection pooling via Supabase's PostgREST proxy)
- **Sync → Async:** All 84 files importing the synchronous `db` singleton get replaced with an async Supabase client
- **Long-running ops:** Supabase Edge Functions for CK price refresh; chunked processing for CSV import
- **user_id column:** Added to user-owned tables only; reference/lookup tables excluded

The migration preserves every entity, relationship, and business rule from the existing schema (migrations 001–029).

## Architecture

### Current Architecture (SQLite)

```
┌─────────────────────────────────────────────────────┐
│  Next.js App (API Routes + React Client)            │
│                                                     │
│  src/lib/db.ts → better-sqlite3 (synchronous)      │
│       ↓                                             │
│  data/oracle.db (local filesystem)                  │
└─────────────────────────────────────────────────────┘
```

### Target Architecture (Supabase on Vercel)

```
┌──────────────────────────────────────────────────────────────────┐
│  Next.js App on Vercel (Serverless Functions)                    │
│                                                                  │
│  src/lib/supabase.ts → @supabase/supabase-js (async)            │
│       ↓                                                          │
│  Supabase PostgREST (connection pooling, REST API)               │
│       ↓                                                          │
│  Supabase Postgres (managed, cloud-hosted)                       │
│                                                                  │
│  ┌────────────────────────────────────┐                          │
│  │  Supabase Edge Function            │                          │
│  │  - CK price refresh (120s budget)  │                          │
│  └────────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
```

### Design Rationale: `@supabase/supabase-js` over raw Postgres driver

| Factor | Supabase JS Client | Raw Postgres (postgres.js / pg) |
|--------|-------------------|-------------------------------|
| Connection pooling | Built-in via PostgREST | Must configure pgBouncer or Supabase pooler URL |
| Serverless fit | Stateless HTTP calls, no connection management | Connection overhead per invocation |
| Query builder | Typed, chainable `.from().select().eq()` | Raw SQL strings |
| Realtime/Storage | Available if needed later | N/A |
| Migration effort | Medium — rewrite queries to builder syntax | Lower — keep SQL, just make async |
| Type safety | Auto-generated types from schema | Manual typing |

**Decision:** Use `@supabase/supabase-js` with auto-generated TypeScript types. The PostgREST layer eliminates connection management in serverless — critical for Vercel where each function invocation is ephemeral. For complex queries that don't map cleanly to the query builder (e.g., multi-join price lookups), use `.rpc()` calling Postgres functions.

## Components and Interfaces

### 1. Supabase Client Module (`src/lib/supabase.ts`)

Replaces `src/lib/db.ts`. Provides two clients:

```typescript
// Server-side client (API routes, server components)
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export function createServerClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Client-side client (React components via TanStack Query)
export function createBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### 2. Database Type Generation

Use `supabase gen types typescript` to auto-generate `src/types/supabase.ts` from the live schema. This provides full type safety on all query builder calls.

### 3. Data Access Layer Pattern

Each existing store module (e.g., `price-store.ts`, `card-identity-store.ts`, `allocation-store.ts`) is refactored from:

```typescript
// Before: synchronous, takes Database instance
export function getPriceToAdd(db: Database.Database, id: number): number | null {
  const row = db.prepare(`SELECT ...`).get(id)
  return row?.min_price ?? null
}
```

To:

```typescript
// After: async, uses Supabase client
export async function getPriceToAdd(id: number): Promise<number | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('get_price_to_add', { card_def_id: id })
  if (error) throw error
  return data
}
```

### 4. Complex Query Strategy

Queries that involve multi-table JOINs or aggregations that the Supabase query builder handles awkwardly will be implemented as **Postgres functions** called via `.rpc()`:

| Current Query Pattern | Postgres Function |
|----------------------|-------------------|
| Price_To_Add (card_definitions → oracle_to_printings → card_kingdom_prices) | `get_price_to_add(card_def_id)` |
| Bulk Price_To_Add for all definitions | `get_bulk_price_to_add()` |
| Collection rollup with physical copies + prices | `get_collection_rollup(p_user_id)` |
| Shared cards across decks | `get_shared_cards(p_user_id)` |

### 5. API Route Migration Pattern

All 60+ API routes follow the same transformation:

```typescript
// Before
import db from '@/lib/db'
export async function GET() {
  const rows = db.prepare('SELECT * FROM decks').all()
  return Response.json(rows)
}

// After
import { createServerClient } from '@/lib/supabase'
export async function GET() {
  const supabase = createServerClient()
  const { data, error } = await supabase.from('decks').select('*')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
```

### 6. Long-Running Operations

#### CK Price Refresh (currently 120s timeout)

**Solution:** Supabase Edge Function

- Deployed as a Deno-based edge function on Supabase's infrastructure (no Vercel timeout constraint)
- Triggered via Vercel Cron Job hitting the Edge Function URL, or manually from the UI
- The edge function fetches the CK API, processes entries, and writes directly to Postgres
- The Next.js API route becomes a thin trigger/status-check endpoint

#### CSV Collection Import (variable duration, potentially 2700+ rows)

**Solution:** Chunked processing within Vercel timeout

- Parse CSV client-side (already fast — pure string processing)
- POST chunks of ~500 rows per request to the API
- Each chunk runs an upsert batch within Vercel's timeout window
- Client orchestrates chunks sequentially, showing progress
- Atomic rollback via Postgres transaction per chunk (individual chunk failures are recoverable)

## Data Models

### Schema Translation: SQLite → Postgres

The following is the complete Postgres DDL translated from the Schema_Inventory (obtained via `sqlite3 data/oracle.db ".schema"`). Tables are ordered by FK_Dependency_Order (parent tables first).

#### Type Mapping Rules Applied

| SQLite Type | Postgres Type | Notes |
|-------------|--------------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` | Sequences managed by Postgres |
| `INTEGER PRIMARY KEY` (non-auto) | `INTEGER PRIMARY KEY` | Manual IDs (e.g., `decks.id` from Archidekt) |
| `TEXT` | `TEXT` | No change for general text |
| `TEXT` (UUID values) | `UUID` | Where column stores UUIDs |
| `REAL` | `NUMERIC` or `DOUBLE PRECISION` | `NUMERIC` for prices, `DOUBLE PRECISION` for CMC |
| `BOOLEAN` (INTEGER 0/1) | `BOOLEAN` | Native Postgres boolean |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT now()` | Timezone-aware |
| `datetime('now')` | `now()` | SQLite function → Postgres function |
| `date('now')` | `CURRENT_DATE` | Date-only columns |

#### user_id Column Strategy

**Added to (user-owned tables):**
- `collection`, `decks`, `deck_cards`, `deck_allocations`, `deck_priority`, `deck_strategy`, `deck_health`, `deck_documentation`, `deck_notes`, `deck_overview_content`, `deck_combos`, `deck_mana_analysis`, `deck_upgrades`, `deck_ratings`, `dead_weight_dismissals`, `debrief_sessions`, `debrief_actions`, `brew_sessions`, `proxy_allocations`, `physical_copies`, `card_definitions`, `precon_mod_state`, `upgrade_change_log`, `sync_runs`

**Excluded from (reference/system tables):**
- `_migrations`, `sets`, `sync_meta`, `precon_cards`, `card_metadata`, `card_kingdom_prices`, `oracle_to_printings`

### Complete Postgres DDL

```sql
-- ============================================================
-- Schema Translation: The Oracle (SQLite → Postgres)
-- Generated from live Schema_Inventory
-- ============================================================

-- 1. _migrations (system table, no user_id)
CREATE TABLE _migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT now()
);

-- 2. sets (reference table, no user_id)
CREATE TABLE sets (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- 3. sync_meta (system table, no user_id)
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. card_metadata (reference table, no user_id)
CREATE TABLE card_metadata (
  card_name TEXT PRIMARY KEY,
  rarity TEXT,
  price_usd NUMERIC,
  set_code TEXT,
  type_line TEXT,
  mana_cost TEXT,
  cmc DOUBLE PRECISION,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. precon_cards (reference table, no user_id)
CREATE TABLE precon_cards (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  precon_url TEXT NOT NULL,
  card_name TEXT NOT NULL,
  UNIQUE(precon_url, card_name)
);
CREATE INDEX idx_precon_cards_url ON precon_cards(precon_url);

-- 6. card_kingdom_prices (reference/cache table, no user_id)
CREATE TABLE card_kingdom_prices (
  scryfall_printing_id TEXT PRIMARY KEY,
  price_retail NUMERIC NOT NULL CHECK(price_retail >= 0.0 AND price_retail <= 999999.99),
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. oracle_to_printings (reference table, no user_id)
CREATE TABLE oracle_to_printings (
  oracle_id TEXT NOT NULL,
  scryfall_printing_id TEXT NOT NULL,
  UNIQUE(oracle_id, scryfall_printing_id)
);
CREATE INDEX idx_oracle_to_printings_oracle_id ON oracle_to_printings(oracle_id);

-- 8. card_definitions (user-owned, gets user_id)
CREATE TABLE card_definitions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  oracle_id TEXT NOT NULL UNIQUE,
  card_name TEXT NOT NULL,
  color_identity TEXT DEFAULT '',
  type_line TEXT DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_card_definitions_card_name ON card_definitions(card_name);
CREATE INDEX idx_card_definitions_user_id ON card_definitions(user_id);

-- 9. decks (user-owned, gets user_id — note: id is NOT auto-generated, comes from Archidekt)
CREATE TABLE decks (
  id INTEGER PRIMARY KEY,
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
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'draft', 'concept')),
  is_precon_mod BOOLEAN DEFAULT FALSE,
  user_id UUID NOT NULL
);
CREATE INDEX idx_decks_user_id ON decks(user_id);

-- 10. collection (user-owned, gets user_id)
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
  user_id UUID NOT NULL
);
CREATE INDEX idx_collection_name ON collection(card_name);
CREATE INDEX idx_collection_identity ON collection(color_identity);
CREATE INDEX idx_collection_types ON collection(types);
CREATE INDEX idx_collection_user_id ON collection(user_id);

-- 11. physical_copies (user-owned, gets user_id)
CREATE TABLE physical_copies (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_definition_id INTEGER NOT NULL REFERENCES card_definitions(id),
  scryfall_printing_id TEXT,
  is_proxy BOOLEAN NOT NULL DEFAULT FALSE,
  proxy_for_definition_id INTEGER REFERENCES card_definitions(id) ON DELETE SET NULL,
  condition TEXT CHECK (condition IS NULL OR condition IN ('near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged')),
  is_foil BOOLEAN NOT NULL DEFAULT FALSE,
  acquired_at TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_physical_copies_card_definition_id ON physical_copies(card_definition_id);
CREATE INDEX idx_physical_copies_is_proxy ON physical_copies(is_proxy);
CREATE INDEX idx_physical_copies_user_id ON physical_copies(user_id);
CREATE UNIQUE INDEX idx_physical_copies_group
  ON physical_copies(card_definition_id, scryfall_printing_id, is_foil, is_proxy);

-- 12. deck_cards (user-owned, gets user_id)
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
  dead_weight_flag TEXT CHECK(dead_weight_flag IN ('redundant', 'off_strategy', 'bracket_mismatch', 'format_violation')),
  dead_weight_reason TEXT,
  ownership_status TEXT DEFAULT NULL CHECK (ownership_status IN ('original', 'proxy', 'not_owned')),
  proxy_of_deck_id INTEGER DEFAULT NULL REFERENCES decks(id) ON DELETE SET NULL,
  physical_copy_id INTEGER REFERENCES physical_copies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL
);
CREATE INDEX idx_deck_cards_name ON deck_cards(card_name);
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);
CREATE INDEX idx_deck_cards_physical_copy_id ON deck_cards(physical_copy_id) WHERE physical_copy_id IS NOT NULL;
CREATE INDEX idx_deck_cards_user_id ON deck_cards(user_id);

-- 13. deck_allocations (user-owned, gets user_id)
CREATE TABLE deck_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  scryfall_id TEXT,
  set_code TEXT,
  collector_number TEXT,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
  priority_override BOOLEAN DEFAULT FALSE,
  written_to_archidekt BOOLEAN DEFAULT FALSE,
  written_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE(card_name, deck_id)
);
CREATE INDEX idx_deck_alloc_card ON deck_allocations(card_name);
CREATE INDEX idx_deck_alloc_deck ON deck_allocations(deck_id);
CREATE INDEX idx_deck_alloc_scryfall ON deck_allocations(scryfall_id);
CREATE INDEX idx_deck_alloc_user_id ON deck_allocations(user_id);

-- 14. proxy_allocations (user-owned, gets user_id)
CREATE TABLE proxy_allocations (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_name TEXT NOT NULL,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('original', 'proxy')),
  assigned_at TIMESTAMPTZ DEFAULT now(),
  written_to_archidekt BOOLEAN DEFAULT FALSE,
  written_at TIMESTAMPTZ,
  user_id UUID NOT NULL,
  UNIQUE(card_name, deck_id)
);
CREATE INDEX idx_proxy_alloc_card ON proxy_allocations(card_name);
CREATE INDEX idx_proxy_alloc_deck ON proxy_allocations(deck_id);
CREATE INDEX idx_proxy_alloc_user_id ON proxy_allocations(user_id);

-- 15. deck_priority (user-owned, gets user_id)
CREATE TABLE deck_priority (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_priority_user_id ON deck_priority(user_id);

-- 16. deck_strategy (user-owned, gets user_id)
CREATE TABLE deck_strategy (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  win_condition TEXT,
  table_context TEXT,
  bracket INTEGER CHECK(bracket >= 1 AND bracket <= 4),
  budget_mode TEXT CHECK(budget_mode IN ('collection', 'budget', 'unrestricted')),
  budget_ceiling NUMERIC,
  frustration TEXT,
  strategy_notes TEXT,
  format_rules TEXT,
  health_overrides TEXT,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_strategy_user_id ON deck_strategy(user_id);

-- 17. deck_health (user-owned, gets user_id)
CREATE TABLE deck_health (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  overall_status TEXT NOT NULL CHECK(overall_status IN ('green', 'amber', 'red')),
  user_id UUID NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deck_health_user_id ON deck_health(user_id);

-- 18. deck_documentation (user-owned, gets user_id)
CREATE TABLE deck_documentation (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  strategy_playstyle TEXT,
  synergy_lines TEXT,
  strengths_weaknesses TEXT,
  matchup_notes TEXT,
  mulligan_guide TEXT,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_documentation_user_id ON deck_documentation(user_id);

-- 19. deck_notes (user-owned, gets user_id)
CREATE TABLE deck_notes (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_deck_notes_deck_id ON deck_notes(deck_id);
CREATE INDEX idx_deck_notes_user_id ON deck_notes(user_id);

-- 20. deck_overview_content (user-owned, gets user_id)
CREATE TABLE deck_overview_content (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- 21. deck_combos (user-owned, gets user_id)
CREATE TABLE deck_combos (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- 22. deck_mana_analysis (user-owned, gets user_id)
CREATE TABLE deck_mana_analysis (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- 23. deck_upgrades (user-owned, gets user_id)
CREATE TABLE deck_upgrades (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  owned BOOLEAN DEFAULT FALSE,
  suggested_cut TEXT,
  cut_flag TEXT,
  price NUMERIC,
  synergy_score DOUBLE PRECISION,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- 24. deck_ratings (user-owned, gets user_id)
CREATE TABLE deck_ratings (
  deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- 25. dead_weight_dismissals (user-owned, gets user_id)
CREATE TABLE dead_weight_dismissals (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  user_id UUID NOT NULL,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deck_id, card_name)
);
CREATE INDEX idx_dw_dismissals_deck ON dead_weight_dismissals(deck_id);
CREATE INDEX idx_dw_dismissals_user_id ON dead_weight_dismissals(user_id);

-- 26. debrief_sessions (user-owned, gets user_id)
CREATE TABLE debrief_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'investigating'
    CHECK(status IN ('investigating', 'analysing', 'recommending', 'complete', 'abandoned')),
  brief_json TEXT,
  recommendations_json TEXT,
  current_rec_index INTEGER DEFAULT 0,
  conversation_json TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_debrief_sessions_deck ON debrief_sessions(deck_id, status);
CREATE INDEX idx_debrief_sessions_user_id ON debrief_sessions(user_id);

-- 27. debrief_actions (user-owned, gets user_id)
CREATE TABLE debrief_actions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES debrief_sessions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK(action_type IN ('applied', 'skipped', 'disagreed', 'error')),
  cut_card TEXT NOT NULL,
  add_card TEXT NOT NULL,
  reason TEXT NOT NULL,
  notion_logged BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_debrief_actions_session ON debrief_actions(session_id);
CREATE INDEX idx_debrief_actions_user_id ON debrief_actions(user_id);

-- 28. brew_sessions (user-owned, gets user_id)
CREATE TABLE brew_sessions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER REFERENCES decks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'selecting'
    CHECK(status IN ('selecting', 'investigating', 'confirming', 'generating', 'refining', 'saving', 'complete', 'abandoned', 'exploring', 'building')),
  path_type TEXT CHECK(path_type IN ('commander', 'concept')),
  commander_name TEXT,
  colour_identity TEXT,
  concept_description TEXT,
  brief_json TEXT,
  skeleton_json TEXT,
  refinement_history_json TEXT DEFAULT '[]',
  conversation_json TEXT DEFAULT '[]',
  decision_log_json TEXT DEFAULT '{"strategy":[],"parameters":[],"constraints":[]}',
  assessment_cache_json TEXT DEFAULT '{}',
  model_id TEXT DEFAULT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brew_sessions_status ON brew_sessions(status);
CREATE INDEX idx_brew_sessions_updated ON brew_sessions(updated_at DESC);
CREATE INDEX idx_brew_sessions_user_id ON brew_sessions(user_id);

-- 29. precon_mod_state (user-owned, gets user_id)
CREATE TABLE precon_mod_state (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  swaps_used INTEGER DEFAULT 1,
  sol_ring_removed BOOLEAN DEFAULT FALSE,
  rarity_mythic_used INTEGER DEFAULT 0,
  rarity_rare_used INTEGER DEFAULT 0,
  rarity_uncommon_used INTEGER DEFAULT 0,
  rarity_common_used INTEGER DEFAULT 0,
  budget_spent NUMERIC DEFAULT 0.0,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deck_id)
);
CREATE INDEX idx_precon_mod_state_deck ON precon_mod_state(deck_id);
CREATE INDEX idx_precon_mod_state_user_id ON precon_mod_state(user_id);

-- 30. upgrade_change_log (user-owned, gets user_id)
CREATE TABLE upgrade_change_log (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  cut_card TEXT NOT NULL,
  add_card TEXT NOT NULL,
  reason TEXT DEFAULT '',
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX idx_upgrade_change_log_deck ON upgrade_change_log(deck_id);
CREATE INDEX idx_upgrade_change_log_user_id ON upgrade_change_log(user_id);

-- 31. sync_runs (user-owned, gets user_id)
CREATE TABLE sync_runs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  trigger TEXT NOT NULL CHECK(trigger IN ('csv_import', 'manual', 'card_movement', 'scheduled')),
  decks_processed INTEGER DEFAULT 0,
  decks_succeeded INTEGER DEFAULT 0,
  decks_failed INTEGER DEFAULT 0,
  details TEXT,
  user_id UUID NOT NULL
);
CREATE INDEX idx_sync_runs_user_id ON sync_runs(user_id);
```

### View Translation

```sql
-- shared_cards view (translated from SQLite GROUP_CONCAT → Postgres array_agg/string_agg)
CREATE OR REPLACE VIEW shared_cards AS
SELECT
  dc.card_name,
  COUNT(DISTINCT dc.deck_id) AS deck_count,
  string_agg(DISTINCT dc.deck_id::TEXT, ',') AS deck_ids,
  (SELECT COALESCE(SUM(c.quantity), 0)
   FROM collection c
   WHERE c.card_name = dc.card_name) AS owned_copies
FROM deck_cards dc
GROUP BY dc.card_name
HAVING COUNT(DISTINCT dc.deck_id) > 1;
```

### Tables Explicitly Excluded

- `sqlite_sequence` — SQLite internal, not needed in Postgres (sequences are managed natively)
- `notion_deck_map` — Dropped in migration 025, confirmed excluded per Requirement 2.9

### Data Migration Script Architecture

```
scripts/
├── migrate-to-supabase.ts       # Main orchestrator
├── export-sqlite.ts             # Export all tables to JSON (FK order)
├── transform-data.ts            # Apply type mapping + add user_id
├── load-postgres.ts             # Bulk insert into Supabase via service role
└── verify-migration.ts          # Row count + FK integrity + spot checks
```

#### FK_Dependency_Order (load sequence):

1. `_migrations`, `sets`, `sync_meta`, `card_metadata`, `precon_cards`, `card_kingdom_prices`, `oracle_to_printings`
2. `card_definitions`
3. `decks`
4. `collection`, `physical_copies`
5. `deck_cards`, `deck_allocations`, `proxy_allocations`, `deck_priority`, `deck_strategy`, `deck_health`, `deck_documentation`, `deck_notes`, `deck_overview_content`, `deck_combos`, `deck_mana_analysis`, `deck_upgrades`, `deck_ratings`, `dead_weight_dismissals`, `precon_mod_state`, `upgrade_change_log`, `sync_runs`
6. `debrief_sessions`
7. `debrief_actions`, `brew_sessions`

#### Data Transformation Rules:

| Field Pattern | Transformation |
|--------------|---------------|
| `BOOLEAN` columns stored as 0/1 | Convert to native `true`/`false` |
| `DATETIME` / `created_at` / `updated_at` | Pass through (ISO 8601 strings are valid for `TIMESTAMPTZ`) |
| `notion_logged` (INTEGER 0/1) | Convert to boolean |
| `user_id` | Inject fixed UUID on every user-owned row |
| `skipped` (INTEGER 0/1 in upgrade_change_log) | Convert to boolean |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: DDL Type Translation Correctness

*For any* SQLite column definition in the Schema_Inventory, the translated Postgres DDL SHALL apply the correct type mapping: `INTEGER PRIMARY KEY AUTOINCREMENT` → `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `DATETIME DEFAULT CURRENT_TIMESTAMP` → `TIMESTAMPTZ DEFAULT now()`, and all auto-generated primary keys SHALL use a consistent strategy (INTEGER GENERATED ALWAYS AS IDENTITY).

**Validates: Requirements 2.1, 2.4, 2.10**

### Property 2: Schema Completeness

*For any* table or index present in the SQLite Schema_Inventory (excluding `sqlite_sequence` and tables dropped in prior migrations), a corresponding `CREATE TABLE` or `CREATE INDEX` statement SHALL exist in the translated Postgres DDL with equivalent semantics.

**Validates: Requirements 2.7, 2.8**

### Property 3: user_id Column Presence and Indexing

*For any* table classified as user-owned, the Postgres DDL SHALL include a `user_id UUID NOT NULL` column AND an index on that column.

**Validates: Requirements 3.1, 3.6**

### Property 4: user_id Population Consistency

*For any* row in any user-owned table in the Target_Database after Data_Migration, the `user_id` column SHALL contain the single fixed migration UUID, with zero rows having a NULL or different UUID value.

**Validates: Requirements 3.2, 4.4**

### Property 5: Data Migration Row Count Integrity

*For any* table present in both the Source_Database and Target_Database, the row count in the Target_Database SHALL equal the row count in the Source_Database.

**Validates: Requirements 4.1, 4.5**

### Property 6: Data Migration Value Preservation (Round-Trip)

*For any* randomly selected row from any table, the field values in the Target_Database SHALL match the Source_Database values after applying the defined type transformations (0/1 → boolean, datetime strings → timestamptz, REAL → numeric). The transformation is a lossless mapping.

**Validates: Requirements 4.2, 4.7**

### Property 7: Source Database Immutability

*For any* execution of the Data_Migration process, the SHA-256 checksum of the Source_Database file SHALL be identical before and after the migration completes.

**Validates: Requirements 9.4**

## Error Handling

### Data Migration Errors

| Error Type | Handling Strategy |
|-----------|-------------------|
| Type transformation failure (e.g., non-numeric in REAL column) | Halt migration, report table + row + column + value. No partial load. |
| FK constraint violation during load | Halt migration, report the FK relationship and offending row. Indicates incorrect load order. |
| Supabase connection failure during load | Retry with exponential backoff (3 attempts). On exhaustion, halt and report progress checkpoint. |
| Duplicate key violation | Log and skip (indicates re-run of partially completed migration). Report count of skipped rows. |

### Application Layer Errors

| Error Type | Handling Strategy |
|-----------|-------------------|
| Supabase client connection timeout | Return 503 with retry-after header. Log the query that timed out. |
| PostgREST query error (invalid filter, type mismatch) | Return 500 with sanitized error message. Log full Supabase error for debugging. |
| Edge function timeout (price refresh) | Existing retry logic preserved (3 attempts, 30s delay). On exhaustion, return stale cache. |
| Chunked CSV import — single chunk failure | Halt remaining chunks, report progress (X of Y chunks complete). Client can retry from last successful chunk. |

### Environment Configuration Errors

| Error Type | Handling Strategy |
|-----------|-------------------|
| Missing `NEXT_PUBLIC_SUPABASE_URL` | Fail fast at app startup with clear error message naming the missing variable. |
| Missing `SUPABASE_SERVICE_ROLE_KEY` | Fail on first server-side DB call with clear error. Client-side operations may still work with anon key. |
| Invalid Supabase URL format | Fail fast at client creation with descriptive error. |

## Testing Strategy

### Dual Testing Approach

**Unit tests (example-based):**
- Verify specific SQLite → Postgres type translations for known columns
- Verify specific CHECK constraints translate to valid Postgres syntax
- Verify `notion_deck_map` is excluded from output
- Verify known boolean columns (is_foil, is_commander, etc.) map to BOOLEAN
- Verify Supabase client creation reads correct env vars
- Test error handling paths (missing env vars, connection failures)

**Property tests (universal properties via `fast-check`):**
- Minimum 100 iterations per property test
- Tag format: `Feature: supabase-migration, Property {N}: {title}`
- Properties 1–7 above are implemented as property-based tests

**Integration tests:**
- End-to-end migration against a test Supabase instance
- All API routes return 200 against Postgres
- CK price refresh edge function completes successfully
- Chunked CSV import processes all rows
- FK constraint integrity after full data load
- Vercel deployment smoke test (no filesystem dependencies)

### Property Test Configuration

- Library: `fast-check` (already in devDependencies)
- Minimum iterations: 100
- Each property test references its design document property number
- Generators: SQLite CREATE TABLE statements, random row data for each table schema, random table selections

### What NOT to Property Test

- Supabase client connection behavior (external service — integration test only)
- Edge function deployment (infrastructure — smoke test only)
- Vercel timeout behavior (platform — manual verification)
- Playwright dormancy (code presence check — smoke test only)

### Migration Verification Script (`scripts/verify-migration.ts`)

Automated post-migration verification:
1. Row count comparison for all tables
2. FK integrity scan (query for orphans on every FK relationship)
3. Random sample comparison (10 rows per table, field-by-field)
4. user_id consistency check (all user-owned tables, all rows have the fixed UUID)
5. Source DB checksum comparison (SHA-256 before vs after)
