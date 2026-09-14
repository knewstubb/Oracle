# Product Spec: The Oracle

> Last updated: 2026-09-12
> Maintained by: Delivery Lead

## Product Overview

The Oracle is a private MTG Commander deck and collection management application that tracks owned cards at the instance level, allocates specific copies to deck slots, and provides supporting deck-building and card-data tools. It is intended to replace the workflow of maintaining collection and deck state across spreadsheets and external deck platforms, but it is **not yet approved as the sole source of truth for an authoritative collection migration**. See `docs/audits/collection-migration-readiness-2026-09-03.md`.

The current ownership model uses one `user_cards` row per user/card identity and one `user_copies` row per physical or proxy instance. A deck slot in `deck_cards` may reference a specific copy through nullable `copy_id`. Current allocation statuses and storage workflows derive from that relationship. Older sections and historical feature specs may use pre-migration names (`card_definitions`, `physical_copies`, `physical_copy_id`, `scryfall_printings`); the current equivalents are `user_cards`, `user_copies`, `copy_id`, and `ref_printings`/`ref_cards`.

The stack is Next.js 16 (App Router), React 19, Supabase (Postgres + Auth), TanStack Query, Tailwind CSS, and shadcn/ui. AI capabilities use Anthropic Claude, Google Gemini, and DeepSeek via a tool-use loop with EDHREC, Scryfall, and Commander Spellbook integrations. Hosted on Vercel (frontend) + Supabase (database/auth).

## Feature Index

| Feature | Status | Type | Spec Folder | Added |
|---------|--------|------|-------------|-------|
| User Authentication | shipped | Infrastructure | `specs/user-authentication/` | 2026-04 |
| Supabase Migration | shipped | Infrastructure | `specs/supabase-migration/` | 2026-04 |
| E2E Test Isolation | in-progress | Infrastructure | `specs/e2e-test-isolation/` | 2026-09-12 |
| Commander Context Snapshot | in-progress | Architectural | `specs/commander-context-snapshot/` | 2026-09-12 |
| Collection Foundation | in-progress | Architectural | `specs/collection-foundation/` | 2026-09-12 |
| Card Definition Storage | shipped | Architectural | `specs/card-identity-physical-copies/` (Req 1 only) | 2026-07-01 |
| Instance-Level Physical Copy Tracking | shipped | Architectural | `specs/_archive/instance-level-card-tracking/` | 2026-07-07 |
| Collection CSV Import | shipped | User-facing | `specs/collection-csv-upsert/` | 2026-04 |
| Collection Printing View | shipped | User-facing | `specs/collection-printing-view/` | 2026-05 |
| Deck Status Management | shipped | User-facing | `specs/deck-status-management/` | 2026-04 |
| Deck Authority Split | shipped | Architectural | `specs/deck-authority-split/` | 2026-05 |
| Draft Deck Management | shipped | User-facing | `specs/draft-deck-management/` | 2026-05 |
| Proxy Ownership Layer | shipped | Architectural | `specs/proxy-ownership-layer/` | 2026-05 |
| Remove Notion Dependency | shipped | Infrastructure | `specs/remove-notion-dependency/` | 2026-05 |
| UI Overhaul | shipped | Design System | `specs/ui-overhaul/` | 2026-05 |
| UI Token Pass | shipped | Design System | `specs/ui-token-pass/` | 2026-06 |
| Brew Mode V2 | shipped | User-facing | `specs/brew-mode-v2/` | 2026-05 |
| Brew Canvas Redesign | shipped | User-facing | `specs/brew-canvas-redesign/` | 2026-06 |
| Brew AI Tools | shipped | User-facing | `specs/brew-ai-tools/` | 2026-05 |
| Brew Model Selector | shipped | User-facing | `specs/brew-model-selector/` | 2026-06 |
| Brew Session Autosave | shipped | User-facing | `specs/brew-session-autosave/` | 2026-06 |
| Debrief Mode | cut | User-facing | `specs/_archive/debrief-mode/` | 2026-05 |
| Monitor Mode (Deck Health) | shipped | User-facing | `specs/monitor-mode/` | 2026-05 |
| Upgrade Tab Expansion | shipped | User-facing | `specs/upgrade-tab-expansion/` | 2026-06 |
| Precon Mod Tracker | cut | User-facing | `specs/_archive/precon-mod-tracker/` | 2026-06 |
| Generic Basic Lands | shipped | User-facing | `specs/generic-basic-lands/` | 2026-07 |
| Cards Tab Workshop | shipped | User-facing | `specs/cards-tab-workshop/` | 2026-07 |
| Collection Allocation Expansion | shipped | User-facing | `specs/collection-allocation-expansion/` | 2026-07 |
| Nav Split: Collection / Allocation | shipped | User-facing | `specs/nav-split-collection-allocation/` | 2026-07 |
| Card Status Taxonomy Rename | shipped | User-facing | `specs/card-status-taxonomy-rename/` | 2026-07-14 |
| Shared Cards V2 | shipped | User-facing | `specs/shared-cards-v2/` | 2026-07-14 |
| Deck Status Lifecycle Overhaul | shipped | User-facing | `specs/deck-lifecycle-overhaul/` | 2026-07-16 |
| Deck Import Flow V2 | shipped | User-facing | `specs/deck-import-v2/` | 2026-07-16 |
| Picklist 3-Column View | shipped | User-facing | `specs/picklist-v2/` | 2026-07-16 |
| Card Management UX | shipped | Design System | `specs/card-ux-unified/` | 2026-07-16 |
| Basic Lands Overhaul | shipped | User-facing | `specs/card-ux-unified/` | 2026-07-16 |
| Mana Pips & Set Icons | shipped | User-facing | `specs/card-ux-unified/` | 2026-07-16 |
| Collection List Enhancements | shipped | User-facing | `specs/card-ux-unified/` | 2026-07-16 |
| Material Icons Migration | shipped | Design System | `specs/card-ux-unified/` | 2026-07-16 |
| Card Scanning (Camera) | removed | User-facing | Historical record: `tech-debt-register.md#td-017-dhash-camera-matching-fundamentally-unreliable` | 2026-07-21 |
| PWA Installability | shipped | Infrastructure | `specs/pwa-infrastructure/` | 2026-07-22 |
| Price Tracking MVP | shipped | User-facing | `specs/price-tracking/` | 2026-07-22 |
| Collection CSV Export | shipped | User-facing | `specs/price-tracking/` | 2026-07-22 |
| Multi-Platform Deck Import | shipped | User-facing | `specs/deck-import-v2/` | 2026-07-22 |
| Goldfish / Playtesting | deferred | User-facing | `specs/_archive/goldfish-playtesting/` | 2026-07-22 |
| Daily Price Cron | shipped | Infrastructure | `specs/price-tracking/` | 2026-07-22 |
| Deck Dashboard | shipped | User-facing | `specs/decks-dashboard/` | 2026-07-23 |
| Card Category Classification | shipped | Architectural | `specs/card-category-classification/` | 2026-07-26 |
| Scryfall Printings Cache | shipped | Infrastructure | `specs/scryfall-cache/` | 2026-07-26 |

---

## User Authentication

### Summary
Supabase Auth with email/password (PKCE flow). Middleware protects all routes except `/login` and `/auth/callback`. Single-user app in practice — RLS exists but admin client bypasses it for server-side queries.

### Key Decisions
- PKCE flow over implicit grant (more secure for SPAs)
- Admin client (`createAdminClient()`) for all server-side queries — RLS bypassed, user isolation via `.eq('user_id', userId)`
- No social login providers — email/password only

### Acceptance Criteria (Summary)
- All routes except `/login` and `/auth/callback` require valid session
- Unauthenticated API requests return 401
- Session refresh handled transparently in middleware

### Known Limitations & Deferred Scope
- No password reset flow in the UI (Supabase dashboard only)
- No multi-user support (single user, admin client pattern)

### Refs
- Full spec: `specs/user-authentication/requirements.md`

---

## Supabase Migration

### Summary
Migration from SQLite (local dev) to Supabase (hosted Postgres + Auth). All data access through `@supabase/supabase-js`, sequential SQL migrations in `supabase/migrations/`, RLS policies on all user-data tables.

### Key Decisions
- Supabase over raw Postgres (auth, realtime, and hosting bundled)
- Sequential numbered migrations (001–020+)
- RLS enabled but bypassed server-side (admin client pattern)
- Generated TypeScript types via `supabase gen types`

### Acceptance Criteria (Summary)
- All queries use Supabase client (no raw SQL in application code)
- Migration history tracked in `_migrations` table
- RLS policies exist for all user-data tables

### Known Limitations & Deferred Scope
- Local development requires remote Supabase connection (no local emulator configured)
- Type regeneration is manual (`supabase gen types --linked`)

### Refs
- Full spec: `specs/supabase-migration/requirements.md`

---

## Card Definition Storage

### Summary
Stable card identity records keyed by Scryfall `oracle_id`. One row per logical card across all printings. Provides the canonical identity layer that `physical_copies` and allocation logic build on.

### Key Decisions
- `oracle_id` (Scryfall UUID) as the natural key, integer `id` as FK target for joins
- Denormalized `card_name` for display/search without Scryfall API round-trip
- Created on first encounter (import, deck sync, or manual entry)
- ~2400 rows for current collection

### Acceptance Criteria (Summary)
- Global UNIQUE constraint on `oracle_id` (column-level, not scoped per user — harmless today since single-user, but the constraint is global uniqueness not per-user)
- Card definitions created automatically during any import or sync path
- Integer PK used for all FK joins to physical_copies

### Known Limitations & Deferred Scope
- Requirements 2–10 in the same spec folder (`card-identity-physical-copies`) describe a **printing-group model with a quantity column** that was superseded six days later by `instance-level-card-tracking`. Anyone reading `design.md` past Requirement 1 in this folder is reading a discarded draft — the live schema does NOT match Requirements 2–10.

### Refs
- Full spec: `specs/card-identity-physical-copies/requirements.md` (Requirement 1 only)
- Superseded by: `specs/_archive/instance-level-card-tracking/` (Requirements 2+ replaced)

---

## Instance-Level Physical Copy Tracking

### Summary
Normalizes `physical_copies` to one row per physical card instance (no quantity column). Every physical card has its own identity, can be independently assigned to a deck slot via `physical_copy_id`, and can have a storage location. This is the foundational schema decision that enables instance-level allocation, the Picklist, and the six-state taxonomy.

### Key Decisions
- One row per physical card (migration 007 explodes quantity > 1 rows into N individual rows)
- `quantity` column dropped, `idx_physical_copies_group` unique index dropped
- `storage_location_id` FK added for per-instance physical storage tracking
- `source_tag` column added for import provenance (archidekt, moxfield, manual, backfill)
- `deck_cards.physical_copy_id` is a partial unique index (one copy can only back one slot)
- Legacy `collection` table retired to read-only (trigger blocks writes)

### Acceptance Criteria (Summary)
- Physical copies table: exactly one row per physical card, no quantity column
- Collection backfill: every legacy collection row exploded into N instance rows
- Allocation resolver: assigns specific `physical_copy_id` per deck slot
- Legacy tables (`collection`, `deck_allocations`): read-only with write-blocking triggers
- Import pipeline: creates individual rows per CSV quantity

### Known Limitations & Deferred Scope
- Legacy `collection` and `deck_allocations` tables still exist (read-only) — drop migrations deferred
- `card_name` string matching for allocation (not oracle_id FK on deck_cards) — noted in system audit as architectural risk

### Refs
- Full spec: `specs/_archive/instance-level-card-tracking/requirements.md` (all 14 requirements)
- Migration: `supabase/migrations/007_instance_level_physical_copies.sql`
- Note: Spec folder is archived despite being authoritative — "archived" here means "superseded the prior printing-group design and then itself shipped," not "abandoned"

---

## Collection CSV Import

### Summary
CSV import from Archidekt (and other sources) that creates instance-level physical copy rows. Supports multiple modes: `replace` (full wipe + reimport), `add`/`sync` (incremental), and the legacy `upsert` mode.

### Key Decisions
- `import-engine-v2.ts` is the active engine (handles replace, add, sync modes)
- Instance-level: quantity N in CSV → N physical_copies rows
- Source-tag auto-detection from CSV column headers
- Legacy `reallocate` mode removed (returns 410 Gone) — reallocation now via Picklist

### Acceptance Criteria (Summary)
- CSV import creates individual physical_copies rows
- Identity resolution via Scryfall oracle_id
- Duplicate detection by scryfall_printing_id + source_tag
- Failure logging per row without halting the batch

### Known Limitations & Deferred Scope
- **Authoritative migration blocked:** current `replace` deletes live copies before full-file validation and commits large imports in independent chunks.
- Replacement creates new copy IDs and does not preserve deck allocation links.
- Add/sync retry and source reconciliation are not fully idempotent or transactional.
- Export/import is not a complete round trip for missing state, storage, notes, provenance, and allocations.
- Legacy `import-engine.ts` (V1 upsert mode) remains reachable for backward compatibility.
- See `docs/audits/collection-migration-readiness-2026-09-03.md` and TD-026, TD-028, TD-030.

### Refs
- Full spec: `specs/collection-csv-upsert/requirements.md`

---

## Collection Printing View

### Summary
Per-printing-level view of the collection showing individual physical copies with set, condition, foil status, and deck assignment. Available as the "list view" on the Collection page.

### Key Decisions
- Separate API route (`/api/collection/printings`) from the rollup view
- List view is one of two view modes (alongside the grid/rollup view)
- Proxy toggle filters proxy copies in/out

### Acceptance Criteria (Summary)
- Each row shows a physical copy with set name, condition, foil indicator
- Assigned copies show deck name; unassigned show storage location
- Sortable by card name, set, condition

### Known Limitations & Deferred Scope
- The current endpoint paginates, but filtering/sorting/grouping still requires full-collection application work for several sort modes.
- Pagination occurs at copy level before grouping, so printing quantities and global quantity/price order can be incorrect at page boundaries.
- Status filtering and proxy/missing counts are not fully wired as global server-side filters.
- No inline editing of all copy metadata from this view.
- See TD-033 and `docs/audits/collection-migration-readiness-2026-09-03.md`.

### Refs
- Full spec: `specs/collection-printing-view/requirements.md`

---

## Deck Status Management

### Summary
Three-stage deck lifecycle: Brew → Built (display name; DB value: `boxed`) → Archived. Status transition API, visual badges on the Decks Grid, and delete protection (Built decks must archive first).

### Key Decisions
- Three values: `brew`, `boxed`, `archived` (CHECK constraint on `decks.status`)
- "Boxed" displayed as "Built" in the UI (display rename, no enum change)
- Status badge component (`StatusBadge.tsx`) shared across all deck surfaces
- Delete protection: Built decks cannot be deleted without archiving first

### Acceptance Criteria (Summary)
- PATCH `/api/decks/[id]/status` transitions between any two values
- Only active (Built) decks participate in allocation when `allocate = true`
- Status badges: Brew (teal), Built (teal), Archived (grey)

### Known Limitations & Deferred Scope
- No confirmation modal for status transitions (direct toggle)
- `allocate` toggle exists but is separate from lifecycle status

### Refs
- Full spec: `specs/deck-status-management/requirements.md`

---

## Deck Authority Split

### Summary
Architectural decision: Oracle is local-authoritative for deck composition. Deck data imported from Archidekt/Moxfield, but after import, all edits (categories, card swaps, allocation) happen locally. No write-back to external platforms.

### Key Decisions
- `deck-import.ts` and `deck-cards-diff.ts` own the import path with diff-based preservation
- `ownership-resolver.ts` only modifies allocation metadata (ownership_status, proxy_of_deck_id) — never touches composition columns
- Archidekt write-back dormant (referenced in legacy route comments but never active in V2)
- Reimport uses stable-identity diff (`card_name + scryfall_id`) to preserve enriched columns

### Acceptance Criteria (Summary)
- Import preserves existing physical_copy_id, ownership_status, categories on persisting cards
- Ownership resolver guard: never modifies card_name, quantity, categories, is_commander
- No external platform writes from any current code path

### Known Limitations & Deferred Scope
- The `deck-authority-split` spec's Requirements 6.1/6.2 were referenced by the now-deleted `proxy-allocate/route.ts` — that reference is gone (Shared Cards V2 deletion). The guard comment in `ownership-resolver.ts` still references them informationally.

### Refs
- Full spec: `specs/deck-authority-split/requirements.md`

---

## Draft Deck Management

### Summary
Brew sessions surface as draft deck tiles on the Decks Grid. Draft banner on deck detail for in-progress decks. Session tiles for active brew sessions without a saved deck yet.

### Key Decisions
- `DraftDeckTile` for saved brew-status decks, `DraftSessionTile` for unsaved sessions
- `DraftBanner` on deck detail when status = brew
- Dashed border visual treatment for draft content

### Acceptance Criteria (Summary)
- Brew sessions visible on Decks Grid as distinct tiles
- Draft banner visible on deck detail for brew-status decks
- Clicking a session tile navigates to `/new-deck` with that session

### Refs
- Full spec: `specs/draft-deck-management/requirements.md`

---

## Proxy Ownership Layer

### Summary
Per-slot tracking of Original vs Proxy status on `deck_cards.ownership_status`. The ownership resolver pipeline computes and writes this based on physical copy assignment. Proxy badges throughout the UI.

### Key Decisions
- `ownership_status` column: `'original'` | `'proxy'` | `'generic'` | NULL (unresolved)
- Resolver pipeline: buildAllocationInput → computeAllocations → applyAllocationOutput → denormaliseOwnership
- `proxy_of_deck_id` tracks which deck holds the original (for proxy tooltip)
- Taxonomy rename (2026-07-14) removed `'not_owned'` — unresolved slots are now NULL with status computed dynamically

### Acceptance Criteria (Summary)
- Every resolved deck slot has ownership_status = 'original' or 'proxy'
- Proxy badge shows tooltip: "Original held by [Deck Name]"
- Resolver runs on import/assignment, writes ownership metadata only

### Refs
- Full spec: `specs/proxy-ownership-layer/requirements.md`

---

## Remove Notion Dependency

### Summary
Replaced Notion as the storage backend for deck documentation and coaching notes with native Supabase tables (`deck_documentation`, `deck_notes`). Notion SDK removed from dependencies.

### Key Decisions
- `deck_documentation`: one row per deck with structured columns (strategy, synergies, matchups, mulligan)
- `deck_notes`: append-only note store per deck
- Zero `@notionhq` imports — API dependency fully removed
- Legacy naming residue (`notion_logged` column, `notionLogged` field) deferred as TD-006

### Acceptance Criteria (Summary)
- Documentation stored locally in deck_documentation table
- Notes append-only with created_at timestamps
- No third-party service dependency for content access

### Known Limitations & Deferred Scope
- `notion_logged` column name and `notionLogged` field names remain (TD-006) — functional, just misnamed

### Refs
- Full spec: `specs/remove-notion-dependency/requirements.md`

---

## UI Overhaul

### Summary
Design system foundation: `PageHeader` component, shadcn/ui component library (15+ primitives), consistent layout patterns (max-width container, dark background), and shared component conventions across all pages.

### Key Decisions
- shadcn/ui as the component primitive layer (not a full design system — building blocks)
- `PageHeader` shared across Decks, Collection, Allocation, Settings, Shared Cards
- `max-w-[1520px]` content container on all list-view pages
- Two font weights only (400, 500)
- Dark theme only (no light mode)

### Acceptance Criteria (Summary)
- All list-view pages use PageHeader component
- Consistent spacing, typography, and border radius patterns
- shadcn primitives used for all form controls (buttons, inputs, dropdowns, dialogs)

### Refs
- Full spec: `specs/ui-overhaul/requirements.md`

---

## UI Token Pass

### Summary
CSS custom properties (`tokens.css`) defining the complete visual language: spacing scale (7 steps), typography scale (8 sizes), neutral ramp (8 values), status colors (ownership + allocation axes), chart colors, and badge conventions.

### Key Decisions
- 8pt grid spacing (4px–48px in 7 steps)
- Token-based status colors: `--status-owned`, `--status-proxy`, `--status-unowned`, `--status-over`
- Semantic tokens: `--accent-primary` (teal), `--signal-warning` (amber), `--signal-critical` (red)
- Badge background convention: 15%-alpha of the badge color
- No pure white text except on saturated button fills

### Acceptance Criteria (Summary)
- All UI colors reference CSS custom properties (no hardcoded hex in components)
- Status badges use the 15%-alpha background convention
- Typography uses the t-shirt scale tokens consistently

### Refs
- Full spec: `specs/ui-token-pass/requirements.md`
- Steering: `.kiro/steering/oracle-component-layout-spec.md`

---

## Brew Mode V2

### Summary
AI-assisted deck building via a two-phase canvas interface. Phase 1 (Exploring): conversational chat with Oracle AI using tool-use loop. Phase 2 (Building): spatial canvas for card placement and deck skeleton generation.

### Key Decisions
- Two-phase state machine: Exploring → Building (commander commit triggers transition)
- SSE streaming for AI responses with tool-use events surfaced to UI
- Canvas-first layout: `BrewCanvas` (flex:1) | `ChatPanel` (220px)
- Session persistence in `brew_sessions.skeleton_json` (autosaved every 2s)
- Save action creates `deck` + `deck_cards` rows (transition from session to real deck)

### Acceptance Criteria (Summary)
- User can chat with AI during exploration, AI uses tools (EDHREC, Scryfall, Spellbook)
- Commander commit transitions to building phase with canvas
- Cards added via AI or manual search appear on canvas
- Save creates a real deck with status = brew

### Refs
- Full spec: `specs/brew-mode-v2/requirements.md`

---

## Brew Canvas Redesign

### Summary
Spatial card canvas for the deck building phase. Cards render as draggable tiles with art, name, and status indicators. Layout modes: free-form, piled by category, mana curve.

### Key Decisions
- Canvas renders card tiles with full art background
- Three layout modes togglable from toolbar
- Positions stored in session's `skeleton_json` (persisted via autosave)
- Card assessment (fit_score 1–10) rendered as overlay

### Acceptance Criteria (Summary)
- Cards draggable on canvas with position persistence
- Layout modes reorganize cards without losing them
- Card tiles show art + name + category + status dot

### Refs
- Full spec: `specs/brew-canvas-redesign/requirements.md`

---

## Brew AI Tools

### Summary
Tool-use loop giving the AI access to external MTG data sources during brew sessions. Registered tools: EDHREC staples, Scryfall search, Commander Spellbook combos, collection lookup, card fuzzy lookup, commander validation.

### Key Decisions
- Module-level registry pattern (`tool-registry.ts`) — all tools registered at import time
- Direct REST API calls to external services (not MCP — MCP server disabled)
- Tool results formatted as text for AI context, with structured data for UI rendering
- `tool-executor.ts` orchestrates the tool-use loop within SSE streaming

### Acceptance Criteria (Summary)
- AI can call tools during conversation (EDHREC, Scryfall, Spellbook, collection)
- Tool results appear in the chat as formatted blocks
- Collection lookup surfaces owned/proxy/unowned status per card

### Refs
- Full spec: `specs/brew-ai-tools/requirements.md`

---

## Brew Model Selector

### Summary
Multi-model support in the brew interface. Users can switch between AI providers (Claude Sonnet 4, Gemini 2.5/3.5 Flash, DeepSeek V4) during a session.

### Key Decisions
- Model selector in `BrewTopbar` — available in both Exploring and Building phases
- `ai-models.ts` defines available models with display names and provider routing
- Model choice stored per-session, switchable mid-conversation
- Provider adapter pattern normalizes different API shapes

### Acceptance Criteria (Summary)
- Dropdown shows available models with provider labels
- Switching model mid-session continues the conversation with the new model
- Cost tracking per message (shown in UI)

### Refs
- Full spec: `specs/brew-model-selector/requirements.md`

---

## Brew Session Autosave

### Summary
Client-side autosave hook that persists brew session state every 2 seconds to `brew_sessions.skeleton_json`. Debounced, resilient to network failures, with visual save indicator.

### Key Decisions
- `useBrewAutosave` hook with 2s debounce interval
- Saves to `POST /api/brew/save` endpoint
- Retry on failure (one retry, then skip)
- Canvas positions persist through the same mechanism (unified with skeleton)

### Acceptance Criteria (Summary)
- Session state saved within 2s of last change
- Save indicator shows last-saved timestamp
- Network failure doesn't crash the session — retry once, then skip

### Refs
- Full spec: `specs/brew-session-autosave/requirements.md`

---

## Debrief Mode (ARCHIVED — Feature Cut)

> **Status:** Cut during scope reduction. Code deleted. See `specs/_archive/debrief-mode/` for original design.

### Summary
Post-game AI analysis via structured conversation. Was designed to produce recommendations (cut/add card pairs with reasons), which the user could apply or skip.

### Why Cut
Feature was designed and partially implemented but removed during scope reduction. The API routes (`/api/ai/debrief/*`) and UI components were deleted from the codebase.

### Refs
- Archived spec: `specs/_archive/debrief-mode/requirements.md`

---

## Monitor Mode (Deck Health)

### Summary
Health engine that classifies deck cards into functional categories (Ramp, Draw, Removal, etc.), compares counts against configurable thresholds, and produces per-category health status (ok/warn/crit). Rendered as a persistent health strip on deck detail.

### Key Decisions
- `health-engine.ts`: pure computation module with configurable thresholds
- Default thresholds: Ramp 10–12, Draw 10–12, Removal 6–10, etc.
- Per-deck threshold overrides via `deck_strategy.health_overrides`
- Amber margin = 1 (within 1 of threshold = warn)
- `HealthStrip` persistent between topbar and tab nav on all deck detail views
- Clickable pills → navigate to Cards Tab filtered by that category

### Acceptance Criteria (Summary)
- Health strip shows on every deck detail page (persists across tabs)
- Each category pill: ok (teal), warn (amber), crit (red)
- Contextual note for most severe violation
- Clicking a pill scrolls Cards Tab to that category

### Refs
- Full spec: `specs/monitor-mode/requirements.md`

---

## Upgrade Tab Expansion

### Summary
EDHREC-powered upgrade suggestions for each deck. Cut/add card pairs with synergy scores, ownership status, pricing, and a change log.

### Key Decisions
- `UpgradeTab.tsx` on deck detail with priority-ranked suggestions
- Cut/add pairs: each suggestion names a card to remove and one to add
- Ownership badge per suggestion (owned vs. need to buy)
- Price data from Card Kingdom (cached)
- Change log persists applied/skipped decisions in `upgrade_change_log`

### Acceptance Criteria (Summary)
- Upgrade candidates ranked by synergy score
- Each shows: cut card, add card, reason, price, owned status
- "Make change" applies the swap; "Skip" dismisses
- Change log tracks all decisions with timestamps

### Refs
- Full spec: `specs/upgrade-tab-expansion/requirements.md`

---

## Precon Mod Tracker (ARCHIVED — Feature Cut)

> **Status:** Cut during scope reduction. Code deleted. See `specs/_archive/precon-mod-tracker/` for original design.

### Summary
Was designed to track modifications to precon decks against budget and rarity constraints, with swap counter, rarity slots grid, and budget progress.

### Why Cut
Feature was designed but removed during scope reduction. The `PreconModTracker` component and `precon_mod_state` table were deleted from the codebase.

### Refs
- Archived spec: `specs/_archive/precon-mod-tracker/requirements.md`

---

## Generic Basic Lands

### Summary
Basic lands exempt from the allocation taxonomy. Generic by default (no status badge, no allocation tracking). Tracked opt-in only when a specific physical copy is deliberately assigned.

### Key Decisions
- `isBasicLand()` check in `basic-lands.ts` (Forest, Island, Mountain, Plains, Swamp, Wastes, Snow-Covered variants)
- `is_generic_land` boolean on `deck_cards` — marks slots as exempt
- `generic_land` status in `card-status.ts` — skips classification entirely
- Collapsed display in Cards Tab ("Forest ×12" instead of 12 rows)

### Acceptance Criteria (Summary)
- Basic land slots show no status badge (exempt from taxonomy)
- Basic lands excluded from filter chip counts
- Deliberate physical copy assignment drops the exemption (re-enters six-state taxonomy)

### Refs
- Full spec: `specs/generic-basic-lands/requirements.md`

---

## Cards Tab Workshop

### Summary
Merged Cards + List tabs into a single Cards Tab with list/grid view toggle, status filter chips, grouped list view (by category, type, status, CMC, color), Picklist mode for interactive resolution, and category editing.

### Key Decisions
- Single tab with view toggle (list default, grid alternate)
- Six-state filter chips (Original, Proxy, Available, Alternate, Claimed, Unowned)
- Grouped list: collapsible sections with category headers, fill bars, health indicators
- Picklist mode: separate view within the same tab for per-slot resolution
- `CardSlotBadge` component for unified status display
- `CardHoverPreview` + `useCardHoverPreview` hook: portal-based cursor-following card image preview (200ms delay, 220px, viewport-clamped). Used by card rows, picklist rows, and status chip copy rows.
- `CardRowKebab` includes +/- quantity adjuster for non-singleton formats (gated by `maxCopies` from format-config)
- DFC (double-faced card) names resolved via `frontFaceName()` utility — metadata lookups, Scryfall requests, and allocation candidates all handle `" // "` splits

### Acceptance Criteria (Summary)
- Cards grouped by Archidekt category with health indicators
- Status filter chips control visible cards
- Grid view shows card art with status border
- Picklist mode shows candidates ranked by tier with assignment controls
- Picklist: search field filters all columns; cards sorted alphabetically within groups
- Deck export: MTGA-format copy-to-clipboard from deck header
- Deck total value displayed in header stats line
- Mobile responsive: stacks to single column on viewports < 640px
- Empty deck state shows import CTA; empty collection shows import button

### Refs
- Full spec: `specs/cards-tab-workshop/requirements.md`

---

## Collection Allocation Expansion

### Summary
Dedicated `/allocation` page showing cards shared across multiple decks with per-printing allocation detail. Powered by the `CollectionRollupTab` component displaying demand vs. supply per oracle_id.

### Key Decisions
- Separate page at `/allocation` (not a tab within Collection)
- Reuses `CollectionRollupTab` component
- Shows per-card: owned count, allocated count, shortfall, deck assignments

### Acceptance Criteria (Summary)
- `/allocation` page renders allocation rollup data
- Page header, loading/error states consistent with other pages
- Shortfall indicators for cards where demand exceeds supply

### Known Limitations & Deferred Scope
- Page accessible by direct URL only — sidebar link not added (TD-008)

### Refs
- Full spec: `specs/collection-allocation-expansion/requirements.md`

---

## Nav Split: Collection / Allocation

### Summary
Restructured navigation: Collection focuses solely on card browsing, Cards/Allocation surfaces demand and allocation status across decks. Both read from the same `physical_copies` source table but answer fundamentally different questions.

### Data Boundary Rule

**This is a documented architectural rule, not a coincidence of current code:**

| Page | Question it answers | Source of truth | Rollup level | Includes unowned? |
|------|--------------------|-----------------|--------------|--------------------|
| **Collection** (`/collection`) | "What physical cards do I own?" | `physical_copies` (filtered by user) | Per-printing: card + set + foil | **No** — only cards with physical_copies rows |
| **Cards** (`/allocation`) | "What does every active deck demand, and what's the supply status?" | `deck_cards` (all active decks) joined to `physical_copies` for supply | Per-card: card name across all printings | **Yes** — includes demanded-but-not-owned cards (shortfall) |

Both read from `physical_copies` as the ownership source, but:
- Collection starts from supply (what exists) and displays it
- Cards/Allocation starts from demand (what decks want) and computes status against supply

This split is why they're different interaction models: Collection is CRUD-heavy (add, remove, move, edit condition/location per instance). Cards/Allocation is read-mostly rollup that hands off to Picklist for edits when contention exists.

### Key Decisions
- Sidebar: 5 items — Decks, Cards, Collection, Brew Deck, Settings
- "Cards" nav item uses `IdCard` icon, points to `/allocation` — evokes "every card as an individual object"
- "Collection" restored as its own nav item (`Library` icon, `/collection`) — CRUD-heavy per-instance editing warrants top-level access
- "Shared Cards" nav item removed — contention is now surfaced within the Cards/Allocation view
- Routes stay separate (no merge) — only "Shared Cards" was removed from nav

### Acceptance Criteria (Summary)
- Collection page has no tab strip (MET)
- `/allocation` route exists with allocation content (MET)
- Sidebar shows "Cards" nav item linking to `/allocation` (MET)
- Sidebar shows "Collection" nav item linking to `/collection` (MET)
- "Shared Cards" nav item removed (MET)

### Known Limitations & Deferred Scope
- `/shared-cards` route still exists and is functional (accessible by direct URL) — not redirected

### Refs
- Full spec: `specs/nav-split-collection-allocation/requirements.md`
- Tech debt: TD-008 (resolved 2026-07-14)

---

## Card Status Taxonomy Rename

### Summary
Replaced the four-state card-slot classification with a unified six-state taxonomy (Original, Proxy, Available, Alternate, Claimed, Unowned). Introduced Missing at the physical-copy level, Playable/Unplayable as a deck-level badge, and executed a hard rename across stored values, types, and all UI consumers.

### Key Decisions
- Six slot-level states: `original` | `proxy` | `available` | `alternate` | `claimed` | `unowned`
- `available` = free copy exists matching preferred printing
- `alternate` = free copy exists but different printing than preferred
- `claimed` = all copies held by other decks (distinguishes from `unowned`)
- `missing` boolean on `physical_copies` — excludes from availability without deletion
- Playable/Unplayable: derived badge on Built decks (100/100 resolved vs. <100)
- Hard rename: stored `ownership_status` values + `CardSlotStatus` type + all UI consumers migrated together
- `'not_owned'` removed from stored values — unresolved slots have NULL, classified dynamically
- `BuilderStatusBadge` and `builder-card-status.ts` deleted — unified into `CardSlotBadge`
- Progress bar counts combine `available` + `alternate` since both represent owned cards in storage

### Acceptance Criteria (Summary)
- Every slot classified into exactly one of 6 states (verified against computeUnresolvedStatuses logic)
- Claimed detection: PostgREST join on physical_copies → deck_cards, checks free vs. held
- Missing: sets flag + unlinks deck slot + completeness recomputes automatically
- Playable badge: Built decks only, silence when 100/100, orange badge when <100
- Filter chips: 6 chips on Cards Tab (Original, Proxy, Available, Alternate, Claimed, Unowned)
- Zero runtime references to old values (grep sweep verified)

### Known Limitations & Deferred Scope
- Brew vocabulary (`owned`/`proxy_candidate`/`not_owned`) unchanged — separate system for AI context
- `DeckListTable.tsx` references a stale `allocation_role` field name — the component is dead/unused code (not imported by any live page, only referenced in a test file), not an active consumer
- Missing UI (Collection filter toggle) components exist but not yet wired into Collection page

### Refs
- Full spec: `specs/card-status-taxonomy-rename/requirements.md`
- Design: `specs/card-status-taxonomy-rename/design.md`
- Delivery log: `specs/card-status-taxonomy-rename/delivery-log.md`

---

## Shared Cards V2

### Summary
Completed migration from legacy `proxy_allocations` system to V2 instance-level allocation. Removed `ProxyAllocationPanel` (role-toggle UI), fixed proxy detection bug, replaced inline allocation with "Resolve" links to the existing Picklist, and dropped the `proxy_allocations` table.

### Key Decisions
- No new allocation UI on Shared Cards — surfaces contention, links to Picklist for resolution
- Proxy detection fixed: reads `ownership_status` directly instead of string-matching `tags` field
- 9 files deleted (panel, routes, V1 engine, reallocator)
- `proxy_allocations` table dropped (migration 020)
- SharedCardRow rewritten: shows `CardSlotBadge` per deck + "Resolve →" link for contended cards

### Acceptance Criteria (Summary)
- Zero code paths write to or read from `proxy_allocations` (verified by grep sweep)
- Proxy detection uses `ownership_status = 'proxy'` (not tags)
- SharedCardRow expanded view shows per-deck status badges
- "Resolve →" links to `/decks/[id]?tab=cards&mode=picklist`
- Table dropped (migration 020 applied)

### Known Limitations & Deferred Scope
- `allocation-resolver.ts` and `allocation-store.ts` not deleted (4+ other consumers — separate tech debt)
- Dead test files still reference deleted modules (TD-007)

### Refs
- Full spec: `specs/shared-cards-v2/requirements.md`
- Design: `specs/shared-cards-v2/design.md`
- Delivery log: `specs/shared-cards-v2/delivery-log.md`
- Briefing: `docs/shared-cards-v2-briefing.md`


---

## Deck Status Lifecycle Overhaul

### Summary
Renamed the deck lifecycle states from brew/boxed/archived to Brewing/In Rotation/Graveyard. This is a semantic change — "In Rotation" means "committed to my active decks" regardless of whether all cards are physically resolved, replacing the old "Boxed" which implied 100% completion.

### Key Decisions
- Brewing → In Rotation gated by card count validation (exact for Commander, minimum for 60-card formats)
- Graveyard → Brewing (Resurrect) always allowed, always lands in Brewing
- Break-down action: releases all claimed cards when moving to Graveyard (with prompt)
- In Rotation decks show claim completeness as a color-coded dot (green/amber/red) on deck tiles
- Red triangle alert icon on tiles for in-rotation decks with incomplete claims

### Refs
- Migration: `supabase/migrations/` (rename_deck_statuses)
- Components: `StatusControl.tsx`, `StatusBadge.tsx`, `StatusFilter.tsx`, `DeckTile.tsx`

---

## Deck Import Flow V2

### Summary
Unified import dialog with three input methods (URL, Paste List, CSV) followed by a mode picker: "These are new cards" (creates physical copies + fills slots) vs "Match against my collection" (allocation only). All imports start as Brewing status. Removed the old Boxed/Brew status picker from the import flow.

### Key Decisions
- Text paste parser (`text-deck-parser.ts`) with `<qty>[x] <name>` grammar, Commander section support
- "New cards" mode creates physical copies AND assigns them to deck slots
- "Existing collection" mode no longer auto-assigns — manual via Picklist
- Every imported deck starts as `status: 'brewing'`

### Refs
- `DeckImportButton.tsx`, `text-deck-parser.ts`, `deck-import.ts`, `/api/decks/import/route.ts`

---

## Picklist 3-Column View

### Summary
Rebuilt the Picklist as a three-column layout: Available (grouped by storage location), Claimed (grouped by holding deck with status), Unowned (flat list). Promoted from a sub-tab within Cards to a top-level deck tab.

### Key Decisions
- Available column: muted green "Claim" button, instant action
- Claimed column: amber "Claim" button, Tier 4 confirmation for In Rotation decks
- Unowned column: "Proxy" button
- Card hover preview follows cursor, positioned above/below row
- Self-referencing filtered out (deck doesn't show in its own "Claimed" column)
- Progress bar across the top: Original + Proxy + In Storage + In Decks + Unowned breakdown

### Refs
- `PicklistV2.tsx`, deck page tabs

---

## Card Management UX

### Summary
Unified the grouped list view and groups/masonry view into a single `CardGroupSection` component. Both views now share identical row behavior (hover preview, kebab menu, status chips, mana pips, drag handles, checkboxes).

### Key Decisions
- Single shared component (`CardGroupSection.tsx`) with a `compact` prop for the masonry layout
- Column order: drag | checkbox | qty | name | set icon + name | mana pips | status | price | kebab
- Status chips use Material Symbol icons (circle filled, comedy_mask, circle outline, lock, do_not_disturb_on)
- Colors: Original=green, Proxy=blue, Available=grey, Claimed=amber, Unowned=pink
- View mode tooltips: Categories / Table / Gallery

### Refs
- `CardGroupSection.tsx`, `CardSlotBadge.tsx`, `CardsTab.tsx`

---

## Basic Lands Overhaul

### Summary
Two types of basic lands: generic (always "Original", no specific printing) and specific-printing (participates in full allocation system). Imported lands with set codes become specific-printing. Users can convert between types via "Make generic" in the kebab menu.

### Key Decisions
- Generic lands: single row with quantity, always resolved, exempt from Picklist
- Specific-printing lands: individual rows grouped by scryfall_id, full allocation status
- Display: "Forest" (generic) vs "Mountain (DSK)" (specific with set code)
- Kebab menu: +/- quantity stepper with optimistic updates, "Make generic", "Remove all"
- Conversion clears `scryfall_id` and `set_code` via PATCH endpoint

### Refs
- `card-status.ts`, `CardGroupSection.tsx`, `/api/decks/[id]/cards/[cardId]/route.ts` (PATCH)

---

## Mana Pips & Set Icons

### Summary
Added mana cost display (via mana-font) and set expansion icons (via keyrune) to all card views. Card metadata auto-populated from Scryfall on first deck view.

### Key Decisions
- `mana-font` and `keyrune` loaded via CDN (jsDelivr)
- `card_metadata` table stores mana_cost, price_usd, rarity — auto-backfilled from Scryfall
- Set icons use rarity coloring (`ss-common/uncommon/rare/mythic ss-grad`)
- `ManaCost` component parses Scryfall notation (`{2}{W}{U}`) into pip icons
- Batch size limited to 200 for PostgREST `.in()` queries (URL length limit)

### Refs
- `ManaCost.tsx`, `card_metadata` table, `format-config.ts` (validateDeckCount)

---

## Collection List Enhancements

### Summary
Added mana pips, set icon + name, price, and kebab menu to the collection printing list view. Added checkbox column with subtle styling.

### Key Decisions
- Columns: checkbox, qty, name, mana, set icon + name, finish, price, kebab
- Data sourced from `card_metadata` (mana_cost) + `printing_set_info` (set_code, edition_name) + `card_kingdom_prices`
- Batch queries limited to 200 IDs to avoid PostgREST URL length limits
- RLS disabled on `printing_set_info` (reference data, no user ownership)

### Refs
- `PrintingListView.tsx`, `/api/collection/printings/route.ts`

---

## Material Icons Migration

### Summary
Replaced all primary navigation icons and status indicator dots with Google Material Symbols. Sidebar navigation uses a unified `MaterialIcon` wrapper component.

### Key Decisions
- Material Symbols Outlined font loaded with variable axes (fill, weight, opsz, grad)
- Nav icons: grid_view, modeling, newsstand, shelves, science, settings
- Status icons: circle (filled/outline), comedy_mask, lock, do_not_disturb_on
- Icon size: 24px for nav, 14px for status badges, 12px for inline indicators
- Font weight: 300 for nav icons, varies for status (filled vs outline)

### Refs
- `Sidebar.tsx`, `CardSlotBadge.tsx`, `layout.tsx` (font link)


---

## Card Category Classification

### Summary
Functional category classification for the full MTG oracle card database (32,393 cards). Each card in `mtg_cards` has a `default_category` JSONB column storing its primary deckbuilding role (Ramp, Draw, Removal, Engine, etc.) plus secondary categories, confidence level, and notes. Categories are stored on the canonical card table (not user collection) so any new card added to a deck already has its classification. This enables deck health analysis, category-based grouping, and smarter brewing suggestions.

### Key Decisions
- **Source of truth is `mtg_cards.default_category`** — categories are intrinsic card properties, not user-specific data
- JSONB structure: `{ primary: string, secondary: string[], confidence: 'high'|'medium'|'low', notes?: string }`
- Rule-based classifier (`scripts/classify-mtg-cards.ts`) uses oracle text pattern matching — no external LLM API required
- Per-deck overrides planned for `deck_cards.categories` (future) when a card's role differs in a specific deck context

### Category Taxonomy

| Category | Description | Example Cards |
|----------|-------------|---------------|
| Ramp | Mana acceleration — rocks, dorks, land ramp, rituals, cost reduction | Sol Ring, Cultivate, Birds of Paradise |
| Draw | Card advantage — cantrips, impulse draw, big draw spells | Brainstorm, Harmonize, Night's Whisper |
| Engine | Persistent amplification — doublers, untap, triggers | Rhystic Study, Smothering Tithe, Panharmonicon |
| Removal | Spot removal — destroy, exile, stat reduction | Swords to Plowshares, Murder, Beast Within |
| Removal:Mass | Board wipes | Wrath of God, Blasphemous Act, Toxic Deluge |
| Removal:Tempo | Bounce effects | Cyclonic Rift, Chain of Vapor |
| Counterspell | Stack interaction (hard counters) | Counterspell, Mana Drain |
| Counterspell:Conditional | Soft counters | Mana Leak, Spell Pierce |
| Tutor | Library searches (non-land) | Demonic Tutor, Chord of Calling |
| Protection | Preservation — hexproof, indestructible | Heroic Intervention, Swiftfoot Boots |
| Protection:Mass | Fog effects, mass hexproof | Fog, Teferi's Protection |
| Recursion | Graveyard retrieval | Reanimate, Eternal Witness, Regrowth |
| Discard | Hand disruption | Thoughtseize, Hymn to Tourach |
| Finisher | Game-ending threats | Craterhoof Behemoth, Torment of Hailfire |
| Mill | Library-to-graveyard | Mesmeric Orb, Altar of Dementia |
| Creature | Primary creature body (no stronger role) | (generic creatures) |
| Land | Basic/utility lands (no stronger role) | (generic lands) |
| Utility | Catch-all — sub-tags: :Tokens, :Fixing, :Anthem, :Hate, :Lifegain, :Selection, :Sac-Outlet | Various |

### Distribution (32,393 cards)

| Category | Count | % |
|----------|-------|---|
| Creature | 14,728 | 45.5% |
| Utility | 7,128 | 22.0% |
| Ramp | 1,406 | 4.3% |
| Engine | 1,353 | 4.2% |
| Removal | 1,352 | 4.2% |
| Draw | 1,317 | 4.1% |
| Utility:Tokens | 1,026 | 3.2% |
| Utility:Fixing | 848 | 2.6% |
| Other | 3,235 | 10.0% |

Confidence: 27% high, 54% medium, 19% low.

### Acceptance Criteria (Summary)
- All 32,393 cards in `mtg_cards` classified with primary category and confidence
- Categories inform deck health analysis (Ramp/Draw/Removal thresholds)
- New cards added to decks inherit category from `mtg_cards` — no re-classification needed

### Known Limitations & Deferred Scope
- 19% low confidence — may benefit from future LLM pass for edge cases
- Per-deck category overrides not yet implemented (`deck_cards.categories`)
- Combo piece detection is deck-level, not card-level (requires Commander Spellbook integration)
- Some flexible cards (Lightning Bolt) classified as Utility when they function as removal in practice

### Refs
- Taxonomy: `docs/category-taxonomy.md`
- Classifier: `scripts/classify-mtg-cards.ts`
- Migration: `supabase/migrations/20260726140000_add_default_category_to_mtg_cards.sql`
