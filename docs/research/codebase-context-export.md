# The Oracle — Full Codebase Context Export

> Generated: 2026-07-02
> Purpose: As-built reference for The Oracle application

## 1. Architecture Overview

**Stack:**
- **Frontend:** Next.js 16 (App Router), React 19, TanStack Query v5, Tailwind CSS v4, shadcn/ui
- **Backend:** Next.js API routes (serverless), Supabase Edge Functions (Deno)
- **Database:** Supabase Postgres (hosted) — migrated from local SQLite
- **AI Providers:** Anthropic (Claude Sonnet 4, Haiku 4.5), Google Gemini (3.5/2.5 Flash), DeepSeek (V4 Pro/Flash)
- **External APIs:** Archidekt (deck/collection), Card Kingdom (pricing via Edge Function), Scryfall (card data)
- **Testing:** Vitest + fast-check (property-based), Testing Library, Playwright (E2E — dormant for deployment)
- **Deployment target:** Vercel (frontend) + Supabase (database + edge functions)

**Key architectural decisions:**
- Multi-user operation using Supabase Auth — user ID derived from authenticated session
- Server-side uses service role key (bypasses RLS); client-side uses anon key
- Playwright browser automation is **dormant** — decommissioned for serverless deployment. Push-to-Archidekt requires manual copy-paste.
- Notion integration has been **removed** — no Notion API routes or sync remain in the codebase
- Price data refreshed via Supabase Edge Function (`ck-price-refresh`) triggered by Vercel Cron or manual POST

---

## 2. Database Schema (Supabase Postgres)

### Reference/System Tables (no user_id)

| Table | Purpose |
|-------|---------|
| `_migrations` | Migration tracking |
| `sets` | Set code → name mapping |
| `sync_meta` | Key-value store for sync timestamps |
| `card_metadata` | Card rarity, price, type, CMC (populated by script) |
| `precon_cards` | Official precon deck contents (precon_url + card_name) |
| `card_kingdom_prices` | CK price cache (scryfall_printing_id → price_retail, is_foil) |
| `oracle_to_printings` | Oracle ID → Scryfall printing ID mapping |

### User-Owned Tables (all have user_id UUID NOT NULL)

| Table | Purpose |
|-------|---------|
| `card_definitions` | Canonical card identity (oracle_id, card_name, color_identity, type_line) |
| `decks` | Deck metadata (id from Archidekt, name, commander, status, deck_type) |
| `collection` | Raw collection entries (from CSV import) |
| `physical_copies` | Physical card instances (links to card_definitions, tracks foil/condition/proxy) |
| `deck_cards` | Cards in each deck (with categories, tags, ownership_status, physical_copy_id) |
| `deck_allocations` | Allocation resolver output (card_name + deck → original/proxy role) |
| `proxy_allocations` | Legacy allocation table (preserved, mostly unused) |
| `deck_priority` | Per-deck priority for allocation resolver |
| `deck_strategy` | Win condition, bracket, budget mode, constraints per deck |
| `deck_health` | Computed health status (green/amber/red) with result_json |
| `deck_documentation` | Structured deck docs (strategy, synergy lines, strengths, matchups, mulligan) |
| `deck_notes` | Timestamped notes per deck |
| `deck_overview_content` | Cached AI-generated overview |
| `deck_combos` | Cached AI-generated combo analysis |
| `deck_mana_analysis` | Cached AI-generated mana base analysis |
| `deck_upgrades` | Cached upgrade candidates (content JSON) |
| `deck_ratings` | Computed ratings (consistency, resilience, interaction, speed) |
| `dead_weight_dismissals` | Cards the user dismissed from dead-weight alerts |
| `precon_mod_state` | Precon modification compliance tracking (swaps, budget, rarity) |
| `upgrade_change_log` | History of applied/skipped upgrade swaps |
| `sync_runs` | Audit log of sync operations |
| `debrief_sessions` | Debrief mode session state |
| `debrief_actions` | Actions taken during debrief (applied/skipped/disagreed) |
| `brew_sessions` | Brew mode session state (exploring → building → complete) |

### RPC Functions (Postgres)

| Function | Purpose |
|----------|---------|
| `get_price_to_add(card_def_id)` | Min CK price across all printings for a card |
| `get_bulk_price_to_add()` | Bulk version — all card_definitions at once |
| `get_collection_rollup(p_user_id)` | Collection with physical copies + pricing |
| `get_shared_cards(p_user_id)` | Cards appearing in 2+ decks with owned copy counts |

### View: `shared_cards`

Cards in 2+ decks with deck_count, deck_ids (comma-separated), owned_copies.

---

## 3. API Routes

### Collection

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/collection` | GET | List collection cards with search/sort/filter |
| `/api/collection/import` | POST | Import CSV, optionally reallocate |
| `/api/collection/stats` | GET | Summary stats (total, unique, last import) |
| `/api/collection/allocation` | GET | Allocation matrix (cards × decks with ownership status) |
| `/api/collection/rollup` | GET | Full card-level rollup with pricing (tab=collection\|proxies) |
| `/api/collection/prices/refresh` | GET/POST | Trigger CK price refresh edge function (GET=Cron, POST=manual) |

### Decks

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/decks` | GET | List all decks + draft sessions |
| `/api/decks/[id]` | GET | Single deck detail with cards + allocation status |
| `/api/decks/[id]` | DELETE | Delete draft deck (active decks protected) |
| `/api/decks/[id]/overview` | GET | Cached overview content |
| `/api/decks/[id]/combos` | GET | Cached combo analysis |
| `/api/decks/[id]/mana` | GET | Cached mana analysis |
| `/api/decks/[id]/ratings` | GET | Computed deck ratings |
| `/api/decks/[id]/strategy` | GET/PUT | Read/write deck strategy |
| `/api/decks/[id]/health` | GET | Health monitoring status |
| `/api/decks/[id]/health/recheck` | POST | Recompute health |
| `/api/decks/[id]/health/overrides` | GET/PUT/DELETE | Per-deck threshold overrides |
| `/api/decks/[id]/dead-weight` | GET | Dead-weight flagged cards |
| `/api/decks/[id]/documentation` | GET/PUT | Structured deck documentation (strategy, synergy, matchups) |
| `/api/decks/[id]/generic-lands` | GET | Generic land art preferences for this deck |
| `/api/decks/[id]/notes` | POST | Add notes to deck |
| `/api/decks/[id]/upgrade` | GET | Upgrade candidates + change log |
| `/api/decks/[id]/upgrade/apply` | POST | Apply a cut/add swap |
| `/api/decks/[id]/upgrade/skip` | POST | Skip a recommendation |
| `/api/decks/[id]/upgrade/refresh` | POST | Regenerate upgrade candidates (stubbed) |
| `/api/decks/[id]/precon-diff` | GET | Diff current deck vs original precon |
| `/api/decks/[id]/precon-mod-state` | GET | Precon mod compliance state |
| `/api/decks/[id]/debrief-session` | GET | Latest debrief session summary |
| `/api/decks/[id]/reimport` | POST | Re-import deck from Archidekt (destructive, requires confirmation) |
| `/api/decks/[id]/push` | POST | **DORMANT** — returns 501 (Playwright decommissioned) |

### Allocation

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/allocation` | GET | Allocation state (shared view, by deck, by card, or proxy report) |
| `/api/allocation/move` | POST | Preview/confirm card movement between decks |
| `/api/allocation/priority` | PUT | Update deck priority |
| `/api/allocation/reassign` | POST | Pin original to target deck, rerun resolver |
| `/api/proxy-allocate` | POST | Legacy: commit allocation decisions |
| `/api/shared-cards` | GET | Cards in 2+ decks with printing details |
| `/api/shared-cards/allocations` | GET | Legacy proxy_allocations data |
| `/api/shared-cards/allocations/preview` | POST | Preview allocation change |

### Sync

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/sync` | GET | Legacy deck sync from Archidekt |
| `/api/sync/full` | POST | Full sync cycle (reconcile + allocate + health) |
| `/api/sync/status` | GET | Last sync timestamp |

### Settings

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/settings/generic-land-preferences` | GET | All generic land art preferences |

### Brew Mode

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/brew/chat` | POST | SSE-streamed conversation with tool-use loop + decision extraction |
| `/api/brew/session` | POST/GET | Create/retrieve brew session |
| `/api/brew/skeleton` | POST | SSE-streamed deck skeleton generation via Sonnet |
| `/api/brew/assess` | POST | Per-card assessment via Haiku (cached) |
| `/api/brew/commit` | POST | Commit commander, transition to building phase |
| `/api/brew/extract` | POST | Decision extraction from response text (Haiku) |
| `/api/brew/positions` | POST | Persist canvas positions to session |
| `/api/brew/save` | POST | Save session as concept/draft/active deck |
| `/api/brew-sessions/[id]` | DELETE | Delete incomplete session |

### AI / Analysis

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai/search` | POST | Commander search via MCP bulk_card_search |
| `/api/ai/recommend` | POST | Add/cut recommendations via MCP |
| `/api/ai/build-deck` | POST | Full deck generation via MCP |
| `/api/ai/deck-scan` | POST | Deck analysis via MCP |
| `/api/ai/mana-analysis` | POST | Mana base analysis via MCP |
| `/api/ai/debrief/start` | POST | Start debrief session |
| `/api/ai/debrief/investigate` | POST | SSE-streamed investigation (Haiku) |
| `/api/ai/debrief/analyse` | POST | Generate recommendations (Sonnet) |
| `/api/ai/debrief/action` | POST | Apply/skip/disagree with recommendation |
| `/api/ai/debrief/complete` | POST | Complete debrief session |

### Archidekt Integration (Dormant)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/archidekt/create-deck` | POST | Create deck via Playwright automation (**dormant**) |
| `/api/archidekt/write-tags` | POST | Update proxy tags via Playwright (**dormant**) |

### Cards

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/cards/[name]/decks` | GET | Which decks contain a given card |

---

## 4. Key Data Flows

### Collection Import (CSV → Postgres)
- **Trigger:** `POST /api/collection/import?apply=true&reallocate=true`
- **Input:** `data/collection.csv` (Archidekt CSV export)
- **Process:** Parse CSV → replace `collection` table → recompute allocations → recompute health → denormalise ownership_status onto deck_cards
- **Output:** `ImportAndReallocateResult` with delta, newly fulfilled/broken slots

### Allocation Resolver
- **Trigger:** After sync cycle, collection import, or manual reassign
- **Reads:** `deck_cards` (demand), `collection` (supply), `deck_priority`, `deck_allocations` (overrides)
- **Writes:** `deck_allocations` (upsert), `deck_cards.ownership_status` + `proxy_of_deck_id` (denormalised)
- **Algorithm:** Deterministic priority-based — higher priority decks get originals first; printing selection respects exact match preferences

### Price Refresh
- **Trigger:** Vercel Cron (daily via `GET /api/collection/prices/refresh`) or manual `POST`
- **Process:** Next.js route fires POST to Supabase Edge Function `ck-price-refresh` → Edge Function fetches Card Kingdom bulk pricelist → upserts `card_kingdom_prices` table
- **Retries:** 3 attempts, 30s delay between
- **No Vercel timeout risk:** Heavy work runs on Supabase Edge Function infrastructure

### Brew Mode Session
- **Trigger:** User enters `/new-deck`, creates session via `POST /api/brew/session`
- **Phases:** selecting → exploring → building → complete
- **AI loop:** Brew chat uses tool-use loop (Sonnet/Gemini/DeepSeek) with inline decision extraction (Haiku)
- **Skeleton generation:** `POST /api/brew/skeleton` generates 99-card deck list via Sonnet
- **Save:** Commits to `decks` + `deck_cards` tables

### Debrief Mode
- **Trigger:** `POST /api/ai/debrief/start` for a specific deck
- **Two-model pipeline:** Haiku investigates (streamed conversation) → Sonnet analyses (generates 1-5 card swap recommendations) → user applies/skips/disagrees

### Deck Reimport
- **Trigger:** `POST /api/decks/[id]/reimport` with `{ confirmed: true }`
- **Process:** Fetches fresh data from Archidekt API → completely replaces local deck_cards (destructive)
- **Safety:** Returns 409 with warning if `confirmed !== true`

---

## 5. AI/Model Integration

### Configured Models (`src/lib/ai-models.ts`)

| ID | Label | Provider | Model ID | Input $/M | Output $/M |
|----|-------|----------|----------|-----------|------------|
| sonnet-4 | Claude Sonnet 4 | anthropic | claude-sonnet-4-6 | $3.00 | $15.00 |
| gemini-35-flash | Gemini 3.5 Flash | gemini | gemini-3.5-flash | $0.15 | $0.60 |
| gemini-25-flash | Gemini 2.5 Flash | gemini | gemini-2.5-flash-preview-05-20 | $0.15 | $0.60 |
| deepseek-v4-pro | DeepSeek V4 Pro | deepseek | deepseek-chat | $0.27 | $1.10 |
| deepseek-v4-flash | DeepSeek V4 Flash | deepseek | deepseek-chat | $0.07 | $0.28 |

### Call Sites

| Call Site | Model | Purpose |
|-----------|-------|---------|
| `/api/brew/chat` | User-selected (default: sonnet-4) | Exploration conversation with tool-use loop |
| `/api/brew/chat` (inline) | claude-haiku-4-5-20251001 | Decision extraction from assistant response |
| `/api/brew/extract` | claude-haiku-4-5-20251001 | Standalone decision extraction |
| `/api/brew/assess` | claude-haiku-4-5-20251001 | Per-card fit assessment (cached per session) |
| `/api/brew/skeleton` | claude-sonnet-4-6 | Full 99-card deck skeleton generation |
| `/api/ai/debrief/investigate` | claude-haiku-4-5-20251001 | Debrief investigation conversation (streamed) |
| `/api/ai/debrief/analyse` | claude-sonnet-4-6 | Heavy analysis → 1-5 card swap recommendations |

### Provider Adapter Pattern
- `ProviderAdapter` interface: `sendMessage()`, `formatToolResults()`
- Implementations: `AnthropicAdapter`, `GeminiAdapter`, `DeepSeekAdapter`
- Factory: `createProviderAdapter(config)` reads env vars
- Tool-use loop: `runToolLoop()` in `tool-executor.ts` handles multi-turn tool calls

### Cost Tracking
- Per-message cost calculated via `calculateCost(modelId, inputTokens, outputTokens)`
- Emitted as SSE event `{ type: 'cost', inputTokens, outputTokens, estimatedCost }`
- Displayed per-message on client — no server-side aggregation or budget enforcement

---

## 6. Frontend Structure

### Pages

| Route | Page File | Key Components |
|-------|-----------|----------------|
| `/` | `app/page.tsx` | DeckTile, DraftDeckTile, DraftSessionTile, SyncStatus |
| `/decks/[id]` | `app/decks/[id]/page.tsx` | PersistentHeader, HealthStrip, CardsTab, AnalysisTab, CombosPanel, UpgradeTab, StrategyTab, DebriefPanel |
| `/collection` | `app/collection/page.tsx` | AllocationTab, allocation matrix table, filter sidebar |
| `/shared-cards` | `app/shared-cards/page.tsx` | Expandable card groups with printing details |
| `/new-deck` | `app/new-deck/page.tsx` | BrewTopbar, BrewCanvas, ChatPanel (Brew Mode V2) |
| `/settings` | `app/settings/page.tsx` | GenericLandArtSettings |

### Layout & Providers
- `app/layout.tsx`: Dark theme, Sidebar nav, SmartSearch overlay, SyncStatus, TanStack QueryClientProvider, Sonner toasts
- All pages are client components using TanStack Query for data fetching
- `staleTime: 5 * 60 * 1000` (5 min) for Archidekt-sourced data

### Key Component Groups
- **Brew V2** (`components/brew-v2/`): BrewTopbar, BrewCanvas, ChatPanel, useCanvasPositions
- **UI primitives** (`components/ui/`): Tabs, Button, Skeleton, Badge, Switch, Tooltip, DropdownMenu, Sonner
- **Deck detail tabs**: CardsTab, AnalysisTab, CombosPanel, UpgradeTab, StrategyTab
- **Settings** (`components/settings/`): GenericLandArtSettings
- **Collection** (`components/collection/`): Collection page components
- **Shared components**: CardImage, CardPopover, ColourPips, ManaCost, OwnershipBadge, ProxyBadge, HealthPill

---

## 7. Environment Variables

| Variable | Required | Scope | Purpose |
|----------|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client + Server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client | Supabase anon key (respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server only | Bypasses RLS for API routes |
| `ANTHROPIC_API_KEY` | Yes | Server | Required for brew chat + decision extraction |
| `GEMINI_API_KEY` | Optional | Server | Required only if Gemini models selected |
| `DEEPSEEK_API_KEY` | Optional | Server | Required only if DeepSeek models selected |
| `SUPABASE_EDGE_FUNCTION_URL` | Optional | Server | Override edge function URL (derived from project URL if not set) |
| `CRON_SECRET` | Optional | Server | Auth for Vercel Cron price refresh trigger |

---

## 8. Scripts

| Script | Purpose |
|--------|---------|
| `data/check-delta.ts` | Compare current vs previous collection CSV export |
| `scripts/backfill-notion-to-local.ts` | Backfill data from Notion (legacy) |
| `scripts/build-card-metadata.ts` | Populate card_metadata table from Scryfall |
| `scripts/compute-deck-ratings.ts` | Batch compute deck ratings |
| `scripts/detect-dead-weight.ts` | Run dead-weight classifier on all decks |
| `scripts/export-sqlite.ts` | Export SQLite to JSON for migration |
| `scripts/generate-mana-data.ts` | Generate mana analysis per deck |
| `scripts/generate-upgrade-data.ts` | Generate upgrade candidates per deck |
| `scripts/import-notion-content.ts` | Import content from Notion (legacy) |
| `scripts/load-postgres.ts` | Load exported data into Postgres |
| `scripts/transform-data.ts` | Transform SQLite data for Postgres schema |
| `scripts/verify-e2e.ts` | E2E verification of migration |
| `scripts/verify-migration.ts` | Verify migration completeness |

---

## 9. Supabase Edge Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `ck-price-refresh` | Vercel Cron (daily) or manual POST | Fetch Card Kingdom bulk pricelist, upsert `card_kingdom_prices` table. 3 retries, 30s delay. |

---

## 10. Built vs. Stubbed vs. Removed

| Feature | Status | Notes |
|---------|--------|-------|
| Collection sync (CSV import) | **Built** | Full flow: parse → import → reallocate → health recompute |
| Collection rollup with pricing | **Built** | Joins physical_copies → card_definitions → card_kingdom_prices |
| Price refresh (CK via Edge Function) | **Built** | Cron-triggered, fire-and-forget from Next.js |
| Allocation resolver | **Built** | Deterministic algorithm, printing selection, priority overrides |
| Ownership denormalisation | **Built** | Resolves and writes ownership_status to deck_cards |
| Shared cards view | **Built** | Full UI with printing-level detail, proxy badges |
| Deck detail page (5 tabs) | **Built** | Cards, Analysis, Combos, Upgrade, Strategy |
| Health monitoring (Monitor Mode) | **Built** | Category thresholds, amber/red/green, per-deck overrides |
| Deck ratings engine | **Built** | Pure scoring (consistency, resilience, interaction, speed) |
| Deck documentation store | **Built** | Structured fields (strategy, synergy lines, strengths, matchups, mulligan) |
| Brew Mode V2 (canvas-first) | **Built** | Exploring → Building phases, decision extraction, skeleton gen, model selector |
| Debrief Mode | **Built** | Two-model pipeline (Haiku → Sonnet → card swaps) |
| Precon Mod Tracker | **Built** | Compliance calculation, precon diff, trade-down logic |
| Card movement | **Built** | Plan/execute pattern with allocation cascade |
| Deck reimport | **Built** | Destructive re-fetch from Archidekt with confirmation gate |
| Generic land art preferences | **Built** | Settings page + per-deck API |
| Upgrade Engine | **Partial** | GET works (reads persisted candidates), `refresh` endpoint is **stubbed** |
| Dead weight classifier | **Partial** | Schema + API exist; no automated trigger wired to sync |
| Archidekt Playwright integration | **Dormant** | Routes exist but return 501 — decommissioned for Vercel deployment |
| Notion sync | **Removed** | No Notion API routes remain; `notion_deck_map` table dropped |
| Product spec (living spec) | **Empty** | Template exists, no features documented |

---

## 11. Known Tech Debt

1. **Dual allocation tables**: `proxy_allocations` (legacy) and `deck_allocations` (current) both exist. Legacy table preserved but mostly unused.
2. **Upgrade refresh stubbed**: `POST /api/decks/[id]/upgrade/refresh` writes empty candidates. Engine logic in scripts, not extracted to callable module.
3. **card_metadata populated by external script**: No migration creates data — `scripts/build-card-metadata.ts` populates it.
4. **Haiku bypasses provider adapter**: Decision extraction always uses Anthropic SDK directly regardless of user's model selection.
5. **No cost aggregation**: Per-message cost displayed but no cumulative tracking or budget caps.
6. **sync_runs unbounded**: No TTL or rotation.
7. **Brew session cleanup**: Abandoned sessions never auto-cleaned.
8. **Playwright routes retained but dormant**: Could be removed entirely or gated behind environment flag.
9. **oracle_to_printings population**: Needs periodic refresh from Scryfall bulk data to stay current.
