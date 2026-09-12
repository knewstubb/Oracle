# List Views Design Document

> Last updated: 2026-07-27
> Status: Draft — pending review
> Author: Product Manager (Marty)

---

## Executive Summary

This document defines the design direction for all list views in The Oracle, based on product vision alignment and user workflow analysis. The Oracle's USP is **instance-level allocation** — knowing exactly where every card is and resolving conflicts when one card is needed in multiple decks.

**Primary user:** Commander player with 10+ decks and a large collection who has lost track of what's where.

**Moment of delight:** "I can see exactly which deck has my Dockside Extortionist right now, and I can pull it for tonight's deck with one click."

---

## Product Principles (for list view design)

1. **Deck-centric, not collection-centric.** Users work from decks, not from their collection. The Decks List is the home base.

2. **Allocation status is king.** The unique value is knowing "where is this card" and "can I play this deck tonight" — not card stats, not prices.

3. **Context-aware information density.** Show different columns/data based on whether the user is brewing (card function, categories) vs playing (allocation, proxy status).

4. **Pricing is secondary.** Present but not prominent. Don't clutter the core allocation workflow with dollar signs.

5. **Status chips are buttons.** Any indicator that represents an actionable state must look interactive.

---

## View Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  DECKS LIST (home base)                                      │
│  "Which deck do I play tonight?"                             │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  DECK DETAIL                                                 │
│  ├── Cards Tab (grouped list of cards in deck)              │
│  │   "What's in this deck? Is it ready?"                    │
│  ├── Picklist Tab (unresolved items only)                   │
│  │   "What do I need to do to make this playable?"          │
│  └── [Other tabs: Analysis, Strategy, etc.]                 │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPPORTING VIEWS (occasional use)                           │
│  ├── Collection (audit, valuation)                          │
│  ├── Shared Cards (diagnostic — "where am I stretched?")    │
│  └── Global Search (find card X across everything)          │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Decks List View

### Purpose
The starting point for every session. Answer: "Which deck do I want to play tonight? Is it ready?"

### Information Architecture

**Required columns/data:**
| Data | Display | Priority |
|------|---------|----------|
| Deck name | Primary text | P0 |
| Commander | Name + thumbnail image | P0 |
| Playability indicator | Badge: "Ready" / "3 cards to resolve" | P0 |
| Deck status | Chip: Brewing / Active / Graveyard | P0 |
| Color identity | WUBRG pips | P1 |
| Format/bracket | Text or badge | P1 |
| Last played date | Relative time ("2 weeks ago") | P2 |

**Explicitly excluded from default view:**
- Total deck value ($ amount)
- Card count
- Last modified date (use last *played* instead)

### Sorting

**Default sort:** Playability (ready first) → Last modified (most recent first)

**Available sort options:**
- Playability → Last modified (default)
- Alphabetical (A-Z)
- Last played
- Last modified

### Filtering

**Filter options:**
- Status: Brewing / Active / Graveyard / All
- Color identity: WUBRG multi-select
- Playability: Ready / Needs work / All
- Folder (when folders are implemented)

### Grouping

**Default:** None (flat list, sorted)

**Future:** Group by folder/category

### Future Enhancement: Folders

Add folder/category organization for users with many decks. Folders are organizational only — no allocation behavior.

---

## 2. Deck Cards View (Cards Tab)

### Purpose
Show all cards in a deck with their allocation status. Answer: "What's in this deck? Is each card accounted for?"

### Context-Aware Modes

The view should adapt based on deck status:

**Playing mode (Active decks):**
- Primary info: Allocation status, ownership, proxy status
- User question: "Is this card physically in this deck right now?"

**Brewing mode (Brewing decks):**
- Primary info: Card function (hover preview), category/role, ownership
- User question: "What does this card do? Do I own it?"

### Information Architecture

**Card row data:**
| Data | Playing Mode | Brewing Mode | Notes |
|------|--------------|--------------|-------|
| Card name | ✅ Primary | ✅ Primary | Always visible |
| Quantity | ✅ | ✅ | "×2" for multiples |
| Status chip | ✅ Prominent | ✅ Visible | Open/Claimed/Proxied/Original |
| Hover preview | ✅ | ✅ Prominent | Card image on hover |
| Category | ✅ (grouping) | ✅ Prominent | User-defined role |
| Ownership | ✅ | ✅ | Badge if not owned |
| Mana cost | Visible | ✅ Prominent | Mana pips |
| Price | Hidden | Optional | De-emphasized |
| Set/printing | Hidden | Hidden | Available on detail |

### Grouping Options

**Available groupings:**
- Type (Creature, Instant, Sorcery, etc.) — **default**
- Category (user-defined: Ramp, Draw, Removal, etc.)
- CMC / Mana value
- Color
- Allocation status (In Deck, Claimed, Needs Resolution)

**Persistence:** Remember the user's last-used grouping per session (localStorage).

### Sorting (within groups)

**Default:** Alphabetical by name

**Available:**
- Name (A-Z)
- CMC (ascending)
- Price (high to low) — hidden by default

### Status Chip Design Requirements

**Critical UX issue:** Status chips must look like buttons because they ARE buttons.

**Design requirements:**
1. Visual affordance: border, shadow, or hover state that signals "clickable"
2. Cursor: `pointer` on hover
3. Tooltip: "Click to manage this card's assignment"
4. Clear iconography: different icons for each status

**Status definitions:**
| Status | Meaning | Chip appearance | Action on click |
|--------|---------|-----------------|-----------------|
| Original | You own this exact card, it's in this deck | Green, solid | Opens detail popover |
| Open | You own a copy, it's available in storage | Blue, outlined | Assign to deck |
| Claimed | Card is borrowed from another deck | Yellow/orange | Shows source, option to release |
| Proxied | Slot filled with a proxy | Gray, dashed | Mark as real / find original |
| Unowned | You don't own this card | Red, outlined | Add to buy list / mark proxy |

### View Modes

**Available modes:**
1. **Grouped List** (default) — cards grouped by selected criterion, collapsible sections
2. **Grid** — card images in responsive grid, minimal text
3. **Flat List** — ungrouped, sortable table-like view

**Persistence:** Remember user's last-used view mode.

---

## 3. Picklist View

### Purpose
A focused "action queue" showing ONLY cards that need attention. Answer: "What do I need to do to make this deck playable?"

### Scope
Show only cards with unresolved status:
- Unowned (not in collection at all)
- Unclaimed (owned but not assigned to this deck)
- Claimed by another deck (conflict)
- Currently proxied (could be upgraded to real)

Do NOT show: Cards with status "Original" (fully resolved).

### Information Architecture

**Card row data:**
| Data | Display | Notes |
|------|---------|-------|
| Card name | Primary | With hover preview |
| Current status | Badge | Why it's on the list |
| Current location | Text | "In Prosper" / "In Staples Binder" / "Not owned" |
| Actions | Buttons | Context-specific |

### Actions per Status

| Status | Available Actions |
|--------|-------------------|
| Unowned | "Add to Buy List", "Mark as Proxy" |
| In Storage | "Assign to Deck" |
| In Another Deck | "Pull from [Deck]", "Mark as Proxy" |
| Proxied | "Find Original" (opens search), "Keep as Proxy" |

### Grouping

**Default:** By resolution type
- "Need to Buy" (unowned)
- "Available in Storage" (can assign)
- "Claimed Elsewhere" (need to pull from other deck)
- "Currently Proxied" (optional upgrade)

### Export Feature

**"Export Buy List"** button:
- Generates text/CSV of unowned cards
- Format: `1 Card Name (SET)` per line
- Compatible with TCGPlayer mass entry

---

## 4. Collection View

### Purpose
Occasional audit and valuation view. NOT part of the core workflow.

### Primary Use Cases
1. "What's the total value of my collection?" (valuation)
2. "What do I own?" (inventory audit)
3. Import/export operations

### Information Architecture

**Summary header:**
- Total cards owned
- Total unique cards
- Total collection value (secondary, not hero)
- Value by storage location (breakdown)

**Card list (when drilling in):**
| Data | Display |
|------|---------|
| Card name | Primary |
| Set | Icon + code |
| Quantity | Number |
| Location | Where it lives (deck or storage) |
| Price | Per-card value |
| Foil indicator | Badge |
| Condition | Badge |

### Global Search (Hero Feature)

A search bar available from the nav/header that answers: "Where is card X?"

**Behavior:**
1. User types card name
2. Autocomplete from Scryfall names
3. Results show: "Card X: 3 copies — 1 in Prosper, 1 in Korvold, 1 in Staples Binder"
4. Each result row is clickable → navigates to that location

**This is more important than the Collection list view itself.**

---

## 5. Collection View Tabs (ClickUp-style)

### Purpose
Allow users to create and save filtered views of their collection without losing context. Similar to ClickUp's view tabs pattern.

### Design Decision
User requested (2026-07-27): "I quite like the way ClickUp does it with the views in the bar at the top and the ability to add more views."

Resolved as: Persistent view tabs across the top of Collection, with built-in system views and user-created custom views (saved filters).

### Built-in Views (Always Present)
| View | Purpose | Default Filter |
|------|---------|----------------|
| All Cards | Full collection | None |
| Storage | Physical locations (binders, boxes) | `location_type = storage` |
| Proxy List | Owned proxies (excluded from value calc) | `is_proxy = true` |

**Note:** Wishlist is NOT a tab under Collection — it's a peer-level section (see §8).

### Custom Views (User-Created)
Users can create saved views via "+ View" button:

**From template:**
- High Value (>$20)
- By Language
- Foils Only
- Reserved List
- Shared Cards (cross-deck conflicts)

**Custom filter builder:**
- Filter by: Language, Price, Foil, Set, Color, Type, Location, Status
- Multiple conditions with AND logic
- Optional icon (emoji) for tab display
- Default sort order

### Tab Bar UX
- Tabs scroll horizontally if many views exist
- Active tab has underline indicator
- Badges show counts for action-oriented views
- Kebab menu on hover for custom views (Rename, Edit Filters, Duplicate, Delete)
- Filter/Sort controls on right side affect only current view
- View mode toggle (List/Grid) available per view

### Data Model Implications
Custom views are stored per-user:
```typescript
interface SavedView {
  id: string
  name: string
  icon?: string // emoji
  filters: FilterCondition[]
  sortBy: string
  sortDirection: 'asc' | 'desc'
  viewMode: 'list' | 'grid'
  isBuiltIn: boolean
  order: number // tab position
}
```

### Wireframe Reference
See `research/docs/ui-design/list-views/09_collection_with_views.html`

---

## 6. Shared Cards View

### Purpose
Diagnostic view: "Where am I stretched thin?" Identifies cards to buy duplicates of.

### Primary Use Case
"Show me my most-shared staples so I know what to buy duplicates of."

### Information Architecture

**Card list:**
| Data | Display |
|------|---------|
| Card name | Primary |
| # of decks using | Number (sorted high to low) |
| Decks list | Comma-separated deck names |
| Copies owned | Number |
| Shortage | "Need 2 more to have 1 per deck" |
| Price | Per-card (for buy decision) |

**Default sort:** By "# of decks using" descending (most-shared first)

### Call to Action

**"Generate Buy Suggestions"** button:
- Creates prioritized list of cards to purchase
- Criteria: frequency of proxy use, claim conflicts, brewing needs
- Exportable as buy list

---

## 7. Storage Locations View

### Purpose
Manage physical storage locations (binders, boxes, etc.) and see their contents.

### Information Architecture

**Location list:**
| Data | Display |
|------|---------|
| Location name | Primary (e.g., "Commander Staples Binder") |
| Card count | Number |
| Total value | $ amount |
| Last modified | Relative time |

**Drilling into a location:** Shows standard card list (same columns as Collection).

---

## 8. Wishlist (Peer-Level Section)

### Purpose
Track cards you want but don't own. Separate from Collection because wishlist items are not physical inventory.

### Design Decision
User clarified (2026-07-27): "Wishlist, by definition, includes cards that are not part of the collection. It needs to be its own primary section."

### Navigation
```
Decks | Collection | Wishlist | Tools
```
Wishlist is peer-level with Collection, not a tab within it.

### Wishlist Sources
| Source | Description | Badge Color |
|--------|-------------|-------------|
| Deck need | Unowned cards in decklists (auto-detected) | Blue |
| Unowned proxy | Cards you're proxying but don't own | Amber |
| Manual add | Added via global search | Purple |
| Imported | From TCGPlayer, Moxfield, etc. | Cyan |

### Built-in Views
| View | Purpose |
|------|---------|
| All Cards | Flat list of everything wanted |
| By Deck | Grouped by which deck wants the card, with "View Picklist" link |
| Unowned Proxies | Auto-populated: cards proxied in decks where you don't own a real copy |

### Key Behaviors

**Auto-removal:** When a wishlist card is added to Collection (via "Mark Owned", import, or any other path), it's automatically removed from Wishlist.

**Unowned Proxies:** Any card that appears as a proxy in a deck, where you don't own a real copy, is automatically added to the "Unowned Proxies" view. These are prime purchase candidates.

**Deck links:** "Decks Wanting" column shows clickable links to each deck. "By Deck" view includes "View Picklist →" action to jump directly to that deck's action queue.

**Export:** "Export Buy List" generates TCGPlayer/CardKingdom compatible format.

### Information Architecture

**All Cards view:**
| Data | Display |
|------|---------|
| Card name | Primary |
| Source | Badge (Deck need / Unowned proxy / Manual / Imported) |
| Decks Wanting | Comma-separated deck links, or "—" if manual/imported |
| Price | Per-card market price |
| Actions | "Mark Owned" button, remove button |

**By Deck view:**
- Grouped by deck (commander thumbnail + name)
- Each group shows: cards needed, total cost
- "View Picklist →" link per group
- Cards listed within each group

**Unowned Proxies view:**
| Data | Display |
|------|---------|
| Card name | Primary |
| Proxied In | Deck links |
| # Proxies | Badge count |
| Price | Per-card market price |

### Wireframe Reference
See `research/docs/ui-design/list-views/10_wishlist.html`

---

## Implementation Priority

Based on user interview, the priority order is:

### Sprint 1: Deck Cards View Enhancement
1. Add grouping options (Type, Category, CMC, Color, Status)
2. Persist user's grouping preference
3. Redesign status chips to look like buttons
4. Add view mode toggle (Grouped List, Grid)

### Sprint 2: Decks List Enhancement
1. Add playability indicator ("Ready" vs "3 cards to resolve")
2. Add sorting (Playability → Last Modified default)
3. Add filtering (Status, Color Identity, Playability)
4. Add color identity pips

### Sprint 3: Global Search
1. Add global search bar to nav
2. Scryfall autocomplete
3. Results show card locations across all decks/storage

### Sprint 4: Picklist Improvements
1. Group by resolution type
2. Clear action buttons per status
3. Export buy list feature

### Future: Collection & Shared Cards
- Collection valuation summary
- Shared Cards "buy suggestions" feature
- Deck folders

---

## Appendix: Competitor Comparison

See `research/competitor-list-views-analysis.md` for detailed competitive analysis.

**Key takeaways applied to this design:**
- Grouping options (Type, CMC, Color, Set, Rarity) are table stakes — we need them
- Scryfall syntax filtering is a power-user feature — defer for now
- Value tracking is important to many users — include but de-emphasize
- ManaBox's "combinable grouping" is interesting — consider for future

---

## Provenance

- **Interview conducted:** 2026-07-27
- **Interviewee:** Product owner (user)
- **Key insight:** The Oracle is deck-centric, not collection-centric. Allocation status is the hero data.
