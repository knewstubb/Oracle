# The Oracle — System Summary & Redundancy Audit

> Last updated: 2026-07-13
> Purpose: Full system context for planning future development phases.

---

## What This Is

The Oracle is a single-user MTG Commander deck management app. It tracks physical card ownership at the instance level, allocates specific physical copies to deck slots, and provides AI-assisted deck building and analysis.

**Stack:** Next.js 16 (App Router), React 19, Supabase (Postgres + Auth), TanStack Query, Tailwind CSS, shadcn/ui. AI: Anthropic Claude, Google Gemini, DeepSeek.

**Hosting:** Vercel (frontend) + Supabase (database/auth).

---

## Core Architecture

### The Three Axes

Every deck has three independent states:

| Axis | Values | Column |
|------|--------|--------|
| **Lifecycle** | Brew → Boxed → Archived | `decks.status` |
| **Allocate** | On / Off | `decks.allocate` |
| **Completeness** | N/100 (computed) | Count of `deck_cards.physical_copy_id IS NOT NULL` |

### The Resolution Model

Each card slot in a deck (`deck_cards` row) links to a specific physical card instance (`physical_copies` row) via `physical_copy_id`. This is "resolution" — saying which exact physical card backs which deck slot.

```
deck_cards.physical_copy_id → physical_copies.id → card_definitions.oracle_id
```

A partial unique index ensures no physical copy can be claimed by two deck slots simultaneously.

### Card Status Taxonomy (5 states)

| Status | Meaning |
|--------|---------|
| `allocated` | Resolved with an owned original |
| `allocated_proxy` | Resolved with a proxy |
| `unallocated` | Not resolved, but resolvable (candidate exists) |
| `unowned` | Not resolved, no candidate exists |
| `generic_land` | Basic land — exempt from tracking |

---

## Database Schema (31 tables + 2 views)

### Reference Tables (no user_id)

| Table | Purpose |
|-------|---------|
| `_migrations` | Migration tracking |
| `sets` | MTG set codes + names |
| `sync_meta` | System state (last sync timestamps) |
| `card_metadata` | Card attributes cache (rarity, price, type_line, cmc) |
| `precon_cards` | Known precon decklists |
| `card_kingdom_prices` | Price cache keyed by scryfall_printing_id |
| `oracle_to_printings` | oracle_id ↔ scryfall_printing_id mapping |
| `printing_set_info` | Set/edition per printing |
| `mtg_cards` | Full card database for AI tools (name, type, CI, oracle_text, edhrec_rank, legality) |

### Core User Data

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `card_definitions` | Canonical card identity (~2400 rows) | oracle_id (unique), card_name, color_identity, type_line |
| `physical_copies` | Every physical card instance (~3400 rows) | card_definition_id (FK), scryfall_printing_id, is_proxy, condition, is_foil, storage_location_id |
| `decks` | Deck metadata | status, allocate, commander_name, card_count |
| `deck_cards` | Card slots per deck | card_name, physical_copy_id (FK), ownership_status, categories |
| `storage_locations` | Physical storage locations | name, user_id |

### Deck Metadata Tables (all keyed by deck_id)

`deck_strategy`, `deck_health`, `deck_documentation`, `deck_notes`, `deck_overview_content`, `deck_combos`, `deck_mana_analysis`, `deck_upgrades`, `deck_ratings`, `deck_priority`

### AI Session Tables

| Table | Purpose |
|-------|---------|
| `brew_sessions` | Deck building sessions (phases: exploring → building) |
| `debrief_sessions` | Post-game analysis sessions |
| `debrief_actions` | Actions taken from debrief recommendations |

### Other

`dead_weight_dismissals`, `precon_mod_state`, `upgrade_change_log`, `sync_runs`

### Legacy / Read-Only (migration 010 locked these)

| Table | Status | Replaced By |
|-------|--------|-------------|
| `collection` | READ-ONLY (trigger blocks writes) | `physical_copies` |
| `deck_allocations` | READ-ONLY (trigger blocks writes) | `deck_cards.physical_copy_id` |
| `proxy_allocations` | Likely dead — V1 system | `deck_cards.physical_copy_id` + `ownership_status` |

### Views

- `shared_cards` — Cards appearing in 2+ decks with owned copy count
- `collection_rollup` — Per-oracle_id aggregation: owned_count, proxy_count, allocated_count, shortfall

### RPC Functions

- `get_price_to_add(card_def_id)` — Min CK price for a card
- `get_bulk_price_to_add()` — Bulk pricing
- `get_collection_rollup(user_id)` — Collection + prices
- `get_shared_cards(user_id)` — Shared cards per user
- `allocation_clear_active_decks(user_id)` — Transactional clear with advisory lock

---

## Pages & UI

| Path | Purpose |
|------|---------|
| `/` | Decks grid (Brew / Boxed / Archived tabs) |
| `/decks/[id]` | Deck detail — Cards, Analysis, Combos, Upgrade, Strategy tabs |
| `/collection` | Collection management (rollup view, printings, instances) |
| `/allocation` | Global allocation management |
| `/new-deck` | Brew mode — AI-assisted deck building (canvas-based) |
| `/onboarding` | First-time collection + deck import |
| `/settings` | Storage locations, generic land art preferences |
| `/shared-cards` | Cards shared across decks |
| `/login` | Authentication |

---

## Key Features (What's Built)

### 1. Collection Import & Management
- CSV import from Archidekt (collection + decks)
- Instance-level tracking: every physical card has its own row
- Storage locations (binders, boxes)
- Rollup view with pricing
- Collection stats

### 2. Deck Management
- Import from Archidekt URL or Moxfield URL
- Import from CSV file
- Lifecycle states (Brew → Boxed → Archived) with status control
- Allocate toggle (controls whether deck's cards compete for supply)
- Card count, commander, colour identity
- Categories/tags from Archidekt preserved
- Delete protection (Boxed decks must archive first)

### 3. Card Allocation System (V2 — Instance-Level)
- 5-tier candidate ranking (Free in storage → Free proxy → From Brew → From Boxed → Print proxy)
- Interactive Picklist UI with per-row assignment
- Auto-assign on import (Tier 1–2 only, fire-and-forget)
- Undo with exact-restore semantics
- Tier 4 confirmation modal (stealing from Boxed decks)
- Basic lands exempt from allocation (generic by default)

### 4. Four-State Card Status
- Every card slot shows: Allocated / Proxy / Unallocated / Unowned
- Summary counts in Cards tab header
- Status filter chips
- Generic lands show no badge (exempt from taxonomy)
- Collapsed basic land display ("Forest ×12")

### 5. AI Brew Mode (Canvas-Based Deck Builder)
- Two-phase: Exploring (chat) → Building (canvas)
- Multi-model support: Claude Sonnet 4, Gemini 3.5/2.5 Flash, DeepSeek V4
- Tool-use loop: EDHREC staples, Scryfall search, Commander Spellbook combos, collection lookup, fuzzy card lookup
- Decision log extraction (archetype, constraints, win conditions)
- Commander candidate cards on canvas
- Deck skeleton generation
- Card assessment (fit score, pros/cons)
- Canvas layouts: free-form, piled by category, mana curve
- Cost tracking per message

### 6. AI Debrief (Post-Game Analysis)
- Structured analysis → recommendations → apply/skip actions
- Cut/add suggestions with reasons
- Session persistence

### 7. Deck Analysis
- Health engine (category balance: ramp, draw, removal targets)
- Health strip with clickable pills (link to category in Cards tab)
- Mana curve analysis
- Combo detection (Commander Spellbook)
- Dead weight classification

### 8. Deck Upgrades
- EDHREC-powered upgrade suggestions
- Cut/add pairing
- Owned-vs-buy status
- Price data from Card Kingdom
- Upgrade change log

### 9. Shared Cards / Contention
- Identifies cards in 2+ decks
- Shows owned copy count vs demand
- Allocation conflict visibility

### 10. Optimistic UI
- Status changes (Brew/Boxed/Archived) feel instant
- AllocateToggle with optimistic state + rollback on error
- Fresh import delayed refetch (3s after navigation)
- Picklist mutations invalidate card-statuses query

---

## External Integrations

| Service | Purpose | Client |
|---------|---------|--------|
| Supabase | Database + Auth | `@supabase/supabase-js` |
| Scryfall | Card data, images, search, rulings, bulk data | Direct REST API |
| EDHREC | Commander staples, synergy scores | `json.edhrec.com` JSON API |
| Commander Spellbook | Combo lookup | Direct API |
| Archidekt | Collection source, deck import | REST API + Playwright |
| Moxfield | Alternative deck import | REST API |
| Anthropic | Primary AI (Claude Sonnet 4) | `@anthropic-ai/sdk` |
| Google | Alternative AI (Gemini) | `@google/generative-ai` |
| DeepSeek | Budget AI option | OpenAI-compatible API |
| Card Kingdom | Pricing | Cached in `card_kingdom_prices` |

---

## Auth

- Supabase Auth with email/password (PKCE flow)
- Middleware protects all routes except `/login` and `/auth/callback`
- API routes get 401 for unauthenticated requests
- Single-user app in practice — RLS exists but admin client bypasses it
- User isolation via `.eq('user_id', userId)` in queries

---

## Allocation System (V2) — How It Works

```
User imports deck → deck_cards rows created (physical_copy_id = NULL)
                         ↓
               Auto-assign fires (Tier 1–2 only)
                         ↓
               deck_cards.physical_copy_id = physical_copies.id
                         ↓
               Remaining unresolved → Picklist UI (manual, Tier 1–5)
```

**Candidate Resolution:** `card_name` → `card_definitions.id` → `physical_copies` (enriched with assignment status, storage location, condition, foil status).

**Tiers:** 1 = Free original in storage, 2 = Free proxy in storage, 3 = Reassign from Brew deck, 4 = Reassign from Boxed deck (confirmation required), 5 = Print new proxy.

---

## Brew Mode V2 — How It Works

```
Session created → Phase: Exploring
       ↓
User chats with Oracle AI (SSE streaming + tool-use loop)
       ↓
AI uses tools: EDHREC, Scryfall, Spellbook, collection_lookup
       ↓
Decision log accumulates (archetype, colours, constraints)
Commander candidates displayed on canvas
       ↓
User commits commander → Phase: Building
       ↓
AI shifts to deck-building mode
Cards added via [[bracket]] notation or add_cards_to_deck tool
       ↓
Canvas: free-form / piled / curve layouts
Card assessments (fit_score 1-10)
       ↓
Save → Creates deck + deck_cards rows
```

---

## Known Technical Debt / Redundancy

### 🔴 Tables to Drop or Consolidate

| Item | Status | Action |
|------|--------|--------|
| `collection` table | READ-ONLY since migration 010 | Drop once all reads are migrated to `physical_copies` / `collection_rollup` |
| `deck_allocations` table | READ-ONLY since migration 010 | Drop — fully superseded by `deck_cards.physical_copy_id` |
| `proxy_allocations` table | Written by V1 `allocation.ts` | Audit if any live code still writes here; likely droppable |
| `deck_priority` table | Used by old allocation priority system | Check if V2 still uses this; may be dead |
| `sync_runs` table | Tracks sync runs | May be dead if sync capability was removed |

### 🔴 Lib Files to Remove (V1 Allocation System)

| File | Replaced By |
|------|-------------|
| `allocation.ts` | V2 pipeline (`allocation-candidates.ts` + `auto-assign.ts` + Picklist) |
| `allocation-resolver.ts` | `allocation-resolver-v2.ts` |
| `allocation-store.ts` | `allocation-store-v2.ts` |
| `collection-reallocator.ts` | V2 approach (direct physical_copy_id writes) |

### 🟡 API Routes to Audit/Remove

| Route | Concern |
|-------|---------|
| `/api/ai/brew/*` (7 routes) | V1 brew mode — likely superseded by `/api/brew/*` (V2) |
| `/api/proxy-allocate` | V1 proxy allocation — superseded by `/api/allocation/assign` |
| `/api/collection` (GET) | Reads from legacy read-only `collection` table |
| `/api/collection/rollup` | May be superseded by `/api/collection/rollup-v2` |

### 🟡 Import Path Duplication

| File | Concern |
|------|---------|
| `import-engine.ts` vs `import-engine-v2.ts` | Two import engines |
| `deck-import.ts` vs `deck-import-legacy.ts` | Two deck import paths |
| `warm-start-import.ts` / `warm-start-resolve.ts` / `warm-start-resolve-moxfield.ts` | May be dead if onboarding was rewritten |

### 🟡 Component Duplication

| Component | Concern |
|-----------|---------|
| `DraftBanner.tsx` (root) vs `brew-v2/DraftBanner.tsx` | Two versions |
| `DraftDeckTile.tsx` (root) vs `brew-v2/DraftDeckTile.tsx` | Two versions |
| Brew V1 components (`BrewBriefCard`, `BrewConfirmationCard`, `BrewContextPanel`, `BrewPathSelector`, `BrewSaveDialog`, `BrewSkeletonPanel`) | May be dead if V2 canvas is the active system |

### 🟡 Architectural Risks

| Risk | Detail |
|------|--------|
| **card_name as join key** | Allocation candidates resolve via `card_name` → `card_definitions.id` (string equality). Mismatches between sources (Archidekt, Scryfall, EDHREC) silently fail. Should use `oracle_id` as the join key. |
| **MCP server disabled** | The MTG MCP server in `.kiro/settings/mcp.json` is `disabled: true`. All tool-registry.ts tools use direct API calls instead. The MCP client code (`mcp-client.ts`) is dead weight. |
| **Archidekt Playwright** | `archidekt-playwright.ts` exists for browser automation but is dormant (decommissioned per spec). |
| **MTGJSON SQLite** | `mtgjson-db.ts` exists but the system primarily uses `mtg_cards` Supabase table and Scryfall API. May be unused. |

### 🟢 Clean Architecture (No Action Needed)

| Area | Status |
|------|--------|
| Card status taxonomy | Clean — single source of truth in `card-status.ts` |
| TanStack Query patterns | Consistent — proper invalidation, stale times |
| Design tokens | Spec'd and partially applied (ui-token-pass spec exists) |
| Auth middleware | Clean — single path through Supabase |
| Brew V2 state machine | Well-structured with clear phase transitions |
| Basic land handling | Implemented — exempt from taxonomy, collapsed display |

---

## What's Planned / In-Progress

### Specs in `.kiro/specs/`:

| Spec | Status |
|------|--------|
| `ui-token-pass` | Has requirements + design + tasks (design token unification) |
| `remove-sync-capability` | Has requirements + design + tasks (remove Archidekt sync) |

### Addendum (oracle-allocation-picklist-addendum.md):

- **Chunk 11:** Basic lands (implemented) — generic by default, tracked opt-in
- **Chunk 12:** Add/remove cards with search — card_fuzzy_lookup, status borders, land stepper

### Next Session Requirements (docs/next-session-requirements.md):

The active working document for planned improvements.

---

## Recommended Refactoring Priority

1. **Drop dead V1 allocation code** — `allocation.ts`, `allocation-resolver.ts`, `allocation-store.ts`, `collection-reallocator.ts`. These write to read-only tables.
2. **Remove V1 brew API routes** — `/api/ai/brew/*` if V2 (`/api/brew/*`) is the active system.
3. **Consolidate import engines** — Determine which of `import-engine.ts` / `import-engine-v2.ts` / `deck-import-legacy.ts` is active. Remove the others.
4. **Delete MCP client** — `mcp-client.ts` and related code. The MCP server is disabled; all tools use direct API calls now.
5. **Audit `proxy_allocations` writes** — If nothing writes to it, drop the table.
6. **Address card_name join risk** — Add `card_definition_id` to `deck_cards` during import, use FK for allocation resolution instead of string matching.
