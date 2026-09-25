# Requirements: Unified Card Filter System

**Epic:** Create a clean, unified filter system that works across collection view, deck search, and list view. Support quick filters and advanced syntax. Less clunky than competitors.

**Phase:** 1b (after MVP Phase 1 — mana cost, P/T, rarity field additions)

**Scope:** 
- Unified filter component architecture
- Extend API routes to support new filter dimensions
- Refactor existing filter UIs to use unified component
- Add syntax input for power users
- Add filter chips display

**Out of Scope:**
- Full rules text search (requires full-text indexing)
- Saved filter presets
- Advanced Scryfall syntax validation
- Real-time filter suggestions/autocomplete

---

## Problem Statement

**Current State:**
- Collection view has 4 filter types (search, color, status, sort)
- Deck search has 1 filter type (search only)
- Collection list has same as collection view plus "Include Proxies/Missing"
- No syntax-based search exposed to users
- Toolbar is always visible, takes permanent space
- No visualization of applied filters
- Missing 3 critical filter dimensions (mana cost, P/T, rarity)

**User Pain Points:**
1. Can't filter by mana cost when building decks → Manual scanning
2. Can't filter by rarity when budgeting → Manual scanning
3. Can't see what filters are active → Users forget what they filtered
4. Filters take up too much space on mobile → Cramped UX
5. Power users can't use Scryfall syntax → Limited discoverability

**Expected Outcome:**
- Users can filter by 9+ dimensions (search, color, mana, P/T, rarity, type, status, sort, syntax)
- Applied filters are visible as removable chips
- Mobile-friendly drawer mode
- Syntax input available for power users
- Consistent UX across all views
- Faster deck building with full filtering during search

---

## Users & Outcomes

| User | Role | Need | Outcome |
|------|------|------|---------|
| **Brad** | Brewer | Filter collection by mana cost when building | Find "3-drop green creatures" in <10 seconds |
| **Future Tester** | Evaluator | Compare to Moxfield/Archidekt | "Filter UI feels cleaner and faster than Moxfield" |
| **Power User** | Experienced brewer | Use Scryfall syntax | Type `t:creature c:g cmc:3-4 rarity:rare` and get exact results |
| **Mobile User** | On-the-go brewer | Filter without cramped UI | Collapse filters to drawer; see results clearly |

---

## User Stories & Acceptance Criteria

### Story 1: Unified Filter Component

**US-1.1** As a developer, I want a reusable `<CardFilterPanel>` component so I can use the same filter UI across collection, deck search, and list views.

**Acceptance Criteria:**
- WHEN I import `CardFilterPanel` in any view, THE SYSTEM SHALL render a filter control set matching the provided `availableFilters` array
- WHEN I pass `mode="toolbar"`, THE SYSTEM SHALL render filters inline (horizontal layout)
- WHEN I pass `mode="drawer"`, THE SYSTEM SHALL render filters in a collapsible drawer (mobile mode)
- WHEN user changes any filter, THE SYSTEM SHALL call `onFilterChange` with updated `FilterState`
- WHEN user clicks "Clear All", THE SYSTEM SHALL call `onFilterChange` with empty `FilterState`

---

### Story 1.2: Filter State Management

**US-1.2** As a developer, I want a `useCardFilters` hook so that filter state is consistent across all views and syncs with URL params.

**Acceptance Criteria:**
- WHEN I call `useCardFilters()`, THE SYSTEM SHALL return `{ filters, setFilters, clearAll, appliedCount }`
- WHEN user modifies a filter, THE SYSTEM SHALL update the filter state and sync to URL query params (e.g., `?colors=G&manaCost=3-4`)
- WHEN page is refreshed, THE SYSTEM SHALL restore filters from URL params
- WHEN user navigates to collection/deck/list, THE SYSTEM SHALL preserve filter state if same view
- WHEN user navigates between views (collection → deck → collection), THE SYSTEM SHALL clear filters (new context)

---

### Story 2: Mana Cost Filtering

**US-2.1** As a brewer, I want to filter cards by mana cost range (e.g., "3-4 mana") so I can find mid-game plays.

**Acceptance Criteria:**
- WHEN I click the Mana Cost filter control, THE SYSTEM SHALL display a dual-slider (min/max)
- WHEN I set min=3, max=4, THE SYSTEM SHALL update `filters.manaCost = { min: 3, max: 4 }`
- WHEN I search in collection, THE SYSTEM SHALL return only cards where `cmc >= 3 AND cmc <= 4`
- WHEN I search in deck, THE SYSTEM SHALL return only cards matching the range
- WHEN I click the slider, THE SYSTEM SHALL update results immediately (debounced, no need to click "Apply")
- WHEN I reset the slider to full range, THE SYSTEM SHALL treat as "no constraint" (equivalent to filter disabled)

---

### Story 2.2: Power / Toughness Filtering

**US-2.2** As a brewer building an aggro deck, I want to filter creatures by power and toughness (e.g., "2+ power, 1+ toughness") so I can find aggressive bodies.

**Acceptance Criteria:**
- WHEN I click the Power filter, THE SYSTEM SHALL display a slider with range 1-20 plus wildcard ("*")
- WHEN I set Power min=2, max="*", THE SYSTEM SHALL update `filters.power = { min: 2, max: '*' }`
- WHEN I search, THE SYSTEM SHALL return only creatures where `power >= 2`
- WHEN I set Toughness min=1, max=3, THE SYSTEM SHALL return only creatures where `1 <= toughness <= 3`
- WHEN both Power and Toughness are set, THE SYSTEM SHALL AND them together (both must match)
- WHEN I apply P/T filters on a non-creature card in search results, THE SYSTEM SHALL gracefully skip (no error)

---

### Story 2.3: Rarity Filtering

**US-2.3** As a budget brewer, I want to filter cards by rarity so I can build decks with only commons and uncommons.

**Acceptance Criteria:**
- WHEN I click the Rarity filter, THE SYSTEM SHALL display 5 options: Any, Common, Uncommon, Rare, Mythic
- WHEN I select "Common, Uncommon", THE SYSTEM SHALL update `filters.rarity = ['common', 'uncommon']`
- WHEN I search, THE SYSTEM SHALL return only cards matching the selected rarities
- WHEN I select multiple rarities, THE SYSTEM SHALL OR them together (any of the selected)
- WHEN I select "Any", THE SYSTEM SHALL treat as no constraint (equivalent to filter disabled)

---

### Story 3: Filter Visualization

**US-3.1** As a user, I want to see what filters are currently active so I understand why my search results look different.

**Acceptance Criteria:**
- WHEN any filter is active, THE SYSTEM SHALL display a "Active Filters" section above results
- WHEN multiple filters are active, THE SYSTEM SHALL display each as a removable chip: `[Green ×] [3-4 Mana ×] [2+ Power ×]`
- WHEN I click the `×` on a chip, THE SYSTEM SHALL remove that filter and update results
- WHEN all filters are disabled, THE SYSTEM SHALL hide the "Active Filters" section entirely
- WHEN filters are applied but result count is 0, THE SYSTEM SHALL display "0 cards match your filters" with link to "Clear All"

---

### Story 3.2: Mobile Drawer Mode

**US-3.2** As a mobile user, I want to collapse the filter panel so I can see search results without scrolling past a giant filter toolbar.

**Acceptance Criteria:**
- WHEN viewport width < 768px, THE SYSTEM SHALL render filter controls in a collapsible drawer (not inline toolbar)
- WHEN I click [≡ Filters], THE SYSTEM SHALL open a slide-in drawer from the right (or bottom)
- WHEN drawer is open, THE SYSTEM SHALL display all filter controls in a vertical list
- WHEN I click a filter option or "Apply", THE SYSTEM SHALL close the drawer and show results
- WHEN I click outside the drawer, THE SYSTEM SHALL close it (standard drawer behavior)
- WHEN drawer is closed, THE SYSTEM SHALL still show active filter chips above results (for context)

---

### Story 4: Syntax-Based Search

**US-4.1** As a power user, I want to enter Scryfall syntax (e.g., `t:creature c:g cmc:3-4`) so I can express complex queries without clicking multiple filters.

**Acceptance Criteria:**
- WHEN I click "Use Syntax" toggle in filter panel, THE SYSTEM SHALL display a text input field
- WHEN I enter valid syntax (e.g., `t:creature c:g cmc:3-4`), THE SYSTEM SHALL parse the query and update `filters` accordingly
- WHEN syntax parses successfully, THE SYSTEM SHALL show "3 interpreted: type=creature, color=green, mana=3-4"
- WHEN I enter invalid syntax, THE SYSTEM SHALL show error message (e.g., "Invalid color: X") and keep previous filters
- WHEN syntax is active, THE SYSTEM SHALL gray out other filter controls (visual indication they're ignored)
- WHEN I clear the syntax input, THE SYSTEM SHALL re-enable other filter controls and return to GUI mode
- SUPPORTED SYNTAX:
  - `t:creature` or `type:creature` → filter to creatures
  - `c:wubrg` or `color:white,blue` → color filter
  - `cmc:3-4` or `mana:3-4` → mana cost range
  - `pow:2+` or `power:2+` → power >= 2
  - `toughness:1-3` or `tgh:1-3` → toughness range
  - `rarity:rare,mythic` → rarity filter
  - `-is:token` → exclude tokens

---

### Story 4.2: Syntax Help & Discovery

**US-4.2** As a user, I want to learn how to use Scryfall syntax so I can write complex queries.

**Acceptance Criteria:**
- WHEN "Use Syntax" is active, THE SYSTEM SHALL display a help text: "Learn syntax: [link to help]"
- WHEN I click the help link, THE SYSTEM SHALL open a tooltip or modal showing:
  ```
  Common syntax patterns:
  - t:creature → cards that are creatures
  - c:g → cards with green color
  - cmc:3-4 → cards costing 3-4 mana
  - rarity:rare → rare and mythic only
  - pow:2+ → creatures with power 2 or more
  - (Full docs: https://scryfall.com/docs/syntax)
  ```
- WHEN I hover over the help icon, THE SYSTEM SHALL display a quick-reference tooltip

---

### Story 5: Collection List Integration

**US-5.1** As a user, I want to filter the collection printings list (list view) using the same filter controls as collection grid.

**Acceptance Criteria:**
- WHEN I open the collection list view, THE SYSTEM SHALL display the `CardFilterPanel` with same filters as grid view
- WHEN I apply filters, THE SYSTEM SHALL pass them to `/api/collection/printings?...` (extended with new params)
- WHEN results update, THE SYSTEM SHALL show active filter chips above the card list
- WHEN I switch between grid and list view, THE SYSTEM SHALL preserve applied filters

---

### Story 5.2: Deck Search Integration

**US-5.2** As a brewer, I want to filter cards when adding to my deck so I can quickly find specific cards without manual scanning.

**Acceptance Criteria:**
- WHEN I open the deck card search (AddCardSearch), THE SYSTEM SHALL display `CardFilterPanel` with: search, color, mana cost, rarity, type
- WHEN I set mana cost to 3-4, THE SYSTEM SHALL filter available cards to only 3-4 drops
- WHEN I set color to green, THE SYSTEM SHALL filter to green cards (or cards with green)
- WHEN I select a card from filtered results, THE SYSTEM SHALL add it to the deck and keep the filter panel open
- WHEN I close the search panel, THE SYSTEM SHALL remember filters for the next time I open it (session-only, not persistent)

---

## API Contract Extensions

### GET /api/collection/rollup (Existing Route — Extend)

**New Optional Query Params:**

| Param | Type | Example | Behavior |
|-------|------|---------|----------|
| `manaCostMin` | number | `3` | Filter cards where `cmc >= 3` |
| `manaCostMax` | number | `4` | Filter cards where `cmc <= 4` |
| `powerMin` | number | `2` | Filter creatures where `power >= 2` |
| `powerMax` | number \| "*" | `*` | Filter creatures where `power <= max` (or any if "*") |
| `toughnessMin` | number | `1` | Filter creatures where `toughness >= 1` |
| `toughnessMax` | number \| "*" | `3` | Filter creatures where `toughness <= max` |
| `rarity` | string (comma-sep) | `rare,mythic` | Filter to specified rarities |
| `type` | string | `creature` | Filter where type_line includes substring |
| `syntax` | string | `t:creature c:g cmc:3-4` | If provided, ignore other filters and parse syntax |

**Backward Compatibility:**
- All new params are optional
- If not provided, no constraint applied (equivalent to no filter)
- Existing queries without new params work unchanged

---

### GET /api/collection/printings (Existing Route — Extend)

**New Optional Query Params:** Same as `/api/collection/rollup` above

---

### GET /api/cards/search (New or Extend)

**Purpose:** Unified card search for deck building with full filtering.

**Query Params:**
- `search`: text (substring on card name)
- `colors`: comma-separated WUBRG
- `colorMode`: exact | includes | at_most
- `manaCostMin`, `manaCostMax`: number
- `powerMin`, `powerMax`: number | "*"
- `toughnessMin`, `toughnessMax`: number | "*"
- `rarity`: comma-separated (common, uncommon, rare, mythic)
- `type`: substring on type_line
- `syntax`: Scryfall syntax string
- `owned`: boolean (if true, only cards in user's collection)
- `inDeck`: boolean (if true, only cards not yet in this deck)

**Response:**
```json
{
  "results": [
    {
      "name": "Lightning Bolt",
      "oracle_id": "...",
      "colors": ["R"],
      "mana_cost": "{R}",
      "cmc": 1,
      "type_line": "Instant",
      "rarity": "common",
      "owned_count": 5,
      "image_uri": "...",
      "scryfall_id": "..."
    }
  ],
  "total": 1247,
  "page": 1,
  "pageSize": 50
}
```

---

## Data Model & Database

### No Schema Changes Required

Existing tables already have the data:
- `ref_printings`: `cmc`, `rarity`, `type_line`
- `ref_cards`: `oracle_text`, `color_identity` (for rules text search in future)
- Physical copies: no new fields needed

### Index Requirements

To support fast filtering on new dimensions, ensure indexes exist:
```sql
-- ref_printings table
CREATE INDEX idx_ref_printings_cmc ON ref_printings(cmc);
CREATE INDEX idx_ref_printings_rarity ON ref_printings(rarity);
CREATE INDEX idx_ref_printings_type_line ON ref_printings USING gin(to_tsvector('english', type_line));

-- Composite index for common filters
CREATE INDEX idx_ref_printings_cmc_rarity ON ref_printings(cmc, rarity);
```

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Search latency** | <500ms for filtered query on 2,500-card collection |
| **Debounce delay** | 300ms (between filter change and API request) |
| **Syntax parsing** | <50ms to parse and validate syntax string |
| **Mobile responsiveness** | Drawer mode on <768px viewport, touch-friendly (48px min tap targets) |
| **Accessibility** | WCAG 2.1 AA (keyboard nav, screen reader, color contrast) |
| **Browser support** | Chrome, Firefox, Safari, Edge (latest 2 versions) |

---

## Known Limitations & Trade-Offs

| Limitation | Reason | Future Option |
|-----------|--------|---------------|
| **Basic syntax validation** | Full Scryfall syntax is very complex; start simple | Phase 2: Full parser |
| **No full-text search on rules** | Requires expensive full-text index | Phase 3: If needed |
| **Syntax and GUI mutually exclusive** | Prevents confusion; pick one or other | Could be unified later |
| **No filter presets** | Out of scope for MVP | Phase 2: "Green creatures" preset |

---

## Acceptance Criteria (Epic Level)

- [ ] `CardFilterPanel` component renders all filter types in toolbar and drawer modes
- [ ] `useCardFilters` hook syncs state to URL params and persists across navigation
- [ ] Mana cost, P/T, rarity filters work on collection/list/deck views
- [ ] Filter chips display above results and are removable
- [ ] Syntax input parses valid Scryfall syntax and updates filter state
- [ ] Invalid syntax shows helpful error messages
- [ ] Mobile drawer mode collapses filters on small screens
- [ ] API routes extend to accept new filter params (backward compatible)
- [ ] All tests pass: unit (filters), integration (API), e2e (UX flows)
- [ ] Accessibility audit passes (keyboard, screen reader, contrast)
- [ ] Performance: <500ms query time on 2,500-card collection with complex filters

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| **Filter options available** | 4-5 | 9+ |
| **Clicks to apply complex filter** | 5-7 | 2-3 |
| **Mobile filter UX** | Cramped toolbar | Collapsible drawer |
| **Filter discoverability** | Implicit (buttons only) | Explicit (chips + syntax help) |
| **User feedback** | "Filter UI is clunky" | "Filter UI is cleaner than Moxfield" |

---

## Out of Scope (Future Phases)

- Advanced Scryfall syntax support (Phase 2+)
- Rules text search (requires indexing; Phase 3+)
- Saved filter presets (Phase 2+)
- Filter auto-complete suggestions (Phase 2+)
- Full-text rules search (Phase 3+)
- Cross-format filter templates (Phase 3+)

---

## Questions for Design Review

1. **Syntax vs. GUI:** Should syntax completely replace GUI filters, or should they be mergeable? (Current design: exclusive for clarity)
2. **Mobile drawer:** Slide-in from right, or from bottom? (Mobile UX convention varies)
3. **Rarity default:** Should "Any" be default, or should specific rarities be pre-selected? (Current: "Any")
4. **P/T wildcard:** Use "*" or "∞" or "Max" to represent "any value"? (Current: "*" for simplicity)
5. **Filter persistence:** Should filters persist across sessions, or reset on page refresh? (Current: URL-based, reset if tab closed)

---

## Next Steps

1. **Design Review** — Feedback on above? Any changes before proceeding?
2. **Create tasks.md** — Break into implementation tasks (backend API, components, tests)
3. **Visual Design** — Figma mockup of toolbar + drawer modes, filter chips
4. **Implementation** — Parallel: API route extensions + React component development
