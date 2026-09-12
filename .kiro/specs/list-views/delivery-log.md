# List Views — Delivery Log

## 2026-07-27: Card Management Detail Modal + By Card View

### Summary
Added "By Card" as a Collection view tab and created the Card Management Detail modal wireframe.

### What Changed

**Wireframe created:**
- `11_card_management_detail.html` — Modal showing all copies of a single card (grouped by oracle_id), all deck slots using it, wishlist status, and inline actions

**Wireframe updated:**
- `09_collection_with_views.html` — Added "By Card" tab to Collection view tabs
- `00_index.html` — Added entry for Card Management Detail modal

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| "By Card" as Collection view tab | Card name rollup (oracle_id) is a view of collection data, not a separate section. Collection already has ClickUp-style tabs. |
| Card Management as modal, not page | You arrive at it by clicking a card from anywhere. It's a drill-down, not a destination. Modal keeps your place in the originating context. |
| All Cards = by printing, By Card = by oracle_id | Two complementary views: "What exact versions do I own?" vs "Where is Sol Ring in my world?" |

### Collection View Tabs (Updated)

| Tab | Grouped By | Shows |
|-----|-----------|-------|
| All Cards (default) | card_definition_id | "Sol Ring (CMM, Foil) × 2" |
| By Card | oracle_id | "Sol Ring — 4 owned, 2 proxied, 1 wanted" |
| Storage | storage_location | Cards grouped by physical location |
| Proxy List | proxy copies | All proxies, excluded from value calc |

---

## 2026-07-27: Wireframe Design Sprint

### Summary
Created comprehensive wireframe suite for list view redesign across Decks, Collection, and Wishlist navigation areas.

### What Changed

**Wireframes created** (`research/docs/ui-design/list-views/`):
- `00_index.html` — Index page linking all wireframes
- `01_decks_list.html` — Decks landing page with status breakdown
- `02_deck_cards_grouped.html` — Deck detail with category grouping
- `03_deck_cards_grid.html` — Grid view for deck cards
- `04_picklist.html` — Shopping/pull list for deck completion
- `05_collection.html` — Full collection browser
- `06_shared_cards.html` — Cards used across multiple decks
- `07_storage_locations.html` — Physical storage tracking
- `08_global_search.html` — Cross-collection search
- `09_collection_with_views.html` — ClickUp-style view tabs (By Set, By Color, By Deck, Proxy List)
- `10_wishlist.html` — Peer-level Wishlist section

**Design spec created** (`.kiro/specs/list-views/design.md`):
- 8 sections covering navigation structure, view patterns, interaction models
- Collection View Tabs section documenting the ClickUp-style approach
- Wishlist section documenting peer-level placement and auto-population logic

**Steering doc created** (`.kiro/steering/convention-allocation-terminology.md`):
- Codifies status terms (Original, Open, Claimed, Proxy, Unowned)
- Codifies action terms (Pull, Assign, Release, Reassign)
- Prevents terminology confusion in UI copy and code

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Wishlist as peer-level nav item | Wishlist contains cards not in collection — doesn't belong as tab under Collection |
| Proxy List under Collection | Proxies are owned items, just excluded from value calculation |
| By Deck view includes "View Picklist →" | Direct path from "which decks use this card" to "what do I need to buy" |
| Unowned proxies auto-populate Wishlist | Proxied-but-not-owned = purchase candidates — surface these automatically |
| Auto-remove from Wishlist on acquisition | When card enters collection, remove from Wishlist to prevent stale entries |

### Deferred Work

- Card Management View wireframe — awaiting user feedback on current allocation page pain points
- Detailed interaction specs for hover previews, drag-drop, keyboard navigation

### Files Modified
- `research/docs/ui-design/list-views/*.html` (11 files created)
- `.kiro/specs/list-views/design.md` (created)
- `.kiro/steering/convention-allocation-terminology.md` (created)

### Root Cause / Notes
This is design-phase work. No code changes. Wireframes are static HTML for visual reference during implementation planning.
