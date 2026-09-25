# Design: Unified Card Filter System

**Objective:** Create a cleaner, less clunky filter UX that works across collection view, deck search, and collection list. Support both quick-click filters and advanced syntax-based search. Prioritize discoverability and ease of use.

**Scope:** Design only (Phase 1). Implementation planned for Phase 1b after this design is approved.

---

## Current State Analysis

### Problems with Current Approach

1. **Fragmented UI Components**
   - CollectionToolbar (collection view)
   - AddCardSearch (deck search)
   - StatusFilter (decks page)
   - Each implements filters differently; no shared API
   - Users must learn different patterns in each view

2. **Limited Filter Vocabulary**
   - Collection view: search, color, status, sort (4 dimensions)
   - Deck search: search only (1 dimension) ← **Severely limited**
   - Missing: mana cost, P/T, rarity, set code, syntax
   - All three competitors have 7–9 filter dimensions

3. **Toolbar Permanence**
   - Filters always visible, take 120px vertical space
   - On mobile, this is cramped and non-collapsible
   - No way to hide filters when not needed

4. **No Filter Visualization**
   - Applied filters aren't shown as chips/tags
   - Users can't see at a glance what's active
   - No quick way to toggle a filter off (must click button again)

5. **Syntax Hidden**
   - Scryfall syntax works on the backend (`t:creature c:bg cmc<=3`)
   - Only exposed to AI; not available to users
   - Users can't type complex queries like Moxfield users can

6. **Deck Search Is Painfully Limited**
   - `AddCardSearch` has no color, type, mana cost, or rarity filtering
   - Searching for "3-drop creatures" requires manually scanning results
   - Makes deck building slower than competitors

---

## Design Goals

1. **Unified across all views** — Same filter component, same UX, works in collection, deck search, and list view
2. **Mobile-friendly** — Collapsible on mobile; expandable toolbar on desktop
3. **Quick + Advanced** — Quick-click buttons for common filters; syntax input for power users
4. **Discoverable** — Applied filters shown as removable chips; filter state is always visible
5. **Extensible** — Easy to add new filter types (mana cost, rarity, P/T) without redesigning
6. **Non-intrusive** — Filters don't dominate the UI; users can collapse when done filtering

---

## Proposed UX: Hybrid Filter Bar

### Desktop Layout

```
┌─ Collection ───────────────────────────────────────────────────┐
│                                                                 │
│  [≡] Search: Urza        [Filter icon]  [Sort ▼]  [View ◊▣]   │
│                                                                 │
│  Active filters: [Green X] [Unplaced X] [3-4 Mana X] [+More]  │
│                                                                 │
│  ┌─ Filter Panel (Collapsed) ──────────────────────────────────┐
│  │ ▼ Filters | Search Syntax Help                             │
│  │ ┌─────────────────────────────────────────────────────────┐│
│  │ │ Color:     ◯W ◯U ◯B ◯R ◯G   Mode: [Exact ▼]           ││
│  │ │ Mana:      [0  ▬  10] (CMC range)                       ││
│  │ │ Power:     [1  ▬   *] (P/T)                             ││
│  │ │ Toughness: [1  ▬   *]                                    ││
│  │ │ Rarity:    ○ Any  ○ Common  ○ Uncommon ○ Rare ○ Mythic ││
│  │ │ Type:      [Text search: "creature", "instant", ...]   ││
│  │ │ Status:    ☐ Fully Placed ☐ Partial ☐ Unplaced ☐ Over  ││
│  │ │ Sort:      [Card Name ▼]  [Asc ▼]                       ││
│  │ │ [Or Use Syntax: "t:creature c:g cmc:3-4 rarity:rare"]  ││
│  │ │ [Clear All]  [Apply Filters]                            ││
│  │ └─────────────────────────────────────────────────────────┘│
│  └─────────────────────────────────────────────────────────────┘
│                                                                 │
│  Results: 1,247 cards (filtered from 2,540)                   │
│  [Previous] [1] [2] [3] ... [Next]                            │
│
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout

```
┌─ Collection ──────────────────────┐
│ Search: [Urza       🔍] [≡ Filters│
│ Active: [Green X] [Unplaced X]    │
│                                   │
│ Results: 1,247 cards              │
│ ┌──────────────────────────────┐  │
│ │ Card 1 | Card 2 | Card 3     │  │
│ │ ...                          │  │
│ └──────────────────────────────┘  │
│                                   │
│ ┌─ Filters ◄────────────────────┐ │ ← Drawer opens
│ │ Color:    ◯W ◯U ◯B ◯R ◯G      │ │   on hamburger click
│ │ Mana:     [0 ▬ 10]            │ │
│ │ Rarity:   ○ Any ○ Common ...   │ │
│ │ [Clear] [Apply]               │ │
│ └───────────────────────────────┘ │
│                                   │
└───────────────────────────────────┘
```

---

## Filter Components & Architecture

### 1. Unified Filter Panel (`<CardFilterPanel>`)

**Responsibility:** Render all filter controls in a consistent layout. Support both inline (toolbar) and drawer (mobile) modes.

**Props:**
```typescript
interface CardFilterPanelProps {
  // Which filters to show in this context
  availableFilters: FilterDefinition[]
  
  // Current filter state
  activeFilters: FilterState
  
  // Callbacks
  onFilterChange: (filters: FilterState) => void
  onClear: () => void
  
  // UI modes
  mode: 'toolbar' | 'drawer'
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  
  // Optional: advanced syntax mode
  enableSyntax?: boolean
}

interface FilterDefinition {
  type: 'search' | 'color' | 'mana-cost' | 'power' | 'toughness' | 'rarity' | 'type' | 'status' | 'sort'
  label: string
  description?: string
  // ...type-specific config
}

interface FilterState {
  search?: string
  colors?: string[]
  colorMode?: 'exact' | 'includes' | 'at_most'
  manaCost?: { min: number; max: number }
  power?: { min: number; max: number | '*' }
  toughness?: { min: number; max: number | '*' }
  rarity?: string[]  // ['common', 'uncommon', 'rare', 'mythic']
  type?: string      // substring search: "creature", "instant", etc.
  status?: string[]  // ['fullyPlaced', 'partial', 'unplaced', 'overAllocated']
  sort?: string      // 'cardName', 'quantity', 'price', 'dateAdded'
  sortDir?: 'asc' | 'desc'
  syntax?: string    // Scryfall syntax: "t:creature c:g cmc:3-4"
}
```

### 2. Active Filters Display (`<FilterChips>`)

**Responsibility:** Show applied filters as removable chips above search results.

**Display:**
```
Active filters: [Green ×] [Unplaced ×] [3-4 Mana ×] [+ More Filters]
```

**Behavior:**
- Click `×` to remove a single filter
- Click `+ More Filters` to show all active filters (collapsible)
- Chips only show if any filter is active
- Updated immediately when filter changes

### 3. Syntax Input (`<SyntaxFilterInput>`)

**Responsibility:** Allow power users to enter Scryfall-style syntax directly.

**Example Syntax:**
```
t:creature c:bg cmc:3-4 rarity:rare
type:creature color:black color:green mana:3-4 rarity:rare
-is:token pow>2  (negative queries, special operators)
```

**Design:**
```
┌─────────────────────────────────────────────────┐
│ Or use syntax: [t:creature c:g cmc:3-4]         │
│ Help: t: type, c: color, cmc: cost, rarity     │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- Input field with autocomplete/suggestions
- Help link explains syntax (points to Scryfall docs)
- When user enters syntax, other filter controls gray out / become read-only
- Parse syntax into `FilterState` on blur/enter
- If syntax is invalid, show error (e.g., "Invalid color: X")

### 4. Mana Cost Slider (`<ManaCostFilter>`)

**Design:**
```
Mana Cost: [0 ←────●────→ 10] (showing: 3-4)
           ↑                ↑
          Min              Max
```

**Behavior:**
- Dual-handle slider, 0-10 range
- Default: no constraint (full range)
- Can set min/max independently
- Shows selected range below slider
- Updates `filterState.manaCost: { min, max }`

### 5. Power / Toughness Filters (`<PowerToughnessFilter>`)

**Design:**
```
Power:     [1 ←────●────→ *] (showing: 2+)
           ↑                ↑
Toughness: [1 ←────●────→ *] (showing: 1+)
```

**Behavior:**
- Similar to Mana Cost slider
- Range: 1-20, plus wildcard option ("*" means "any")
- Default: no constraint
- Users can set "2+" (min 2, max wildcard) for flexibility
- Updates `filterState.power` and `filterState.toughness`

### 6. Rarity Filter (`<RarityFilter>`)

**Design:**
```
Rarity:
○ Any
○ Common
○ Uncommon
○ Rare
○ Mythic
```

**Behavior:**
- Radio buttons (single select) or multi-select checkboxes
- Default: "Any"
- When "Any" selected, other options become disabled (visual feedback)
- If "Any" is unchecked, at least one rarity must be selected
- Updates `filterState.rarity: ['rare', 'mythic']`

### 7. Type Filter (`<TypeFilter>`)

**Design:**
```
Type: [Search: "creature", "instant", ...]
```

**Behavior:**
- Text input (substring search on type_line)
- Autocomplete suggestions: common types (Creature, Instant, Sorcery, etc.)
- OR logic: typing "creature instant" finds cards that are either
- Works server-side via `.ilike('type_line', '%creature%')` or similar
- Updates `filterState.type: string`

---

## Implementation Locations

### New Components
```
src/components/filters/
  ├── CardFilterPanel.tsx          (orchestrator)
  ├── FilterChips.tsx              (active filters display)
  ├── SyntaxFilterInput.tsx         (power-user syntax input)
  ├── ManaCostFilter.tsx            (dual slider)
  ├── PowerToughnessFilter.tsx      (dual slider)
  ├── RarityFilter.tsx              (radio/checkbox group)
  ├── TypeFilter.tsx                (text input + autocomplete)
  ├── ColorIdentityFilter.tsx       (existing, refactored)
  ├── StatusFilter.tsx              (existing, refactored)
  └── types.ts                      (shared FilterState, FilterDefinition)
```

### Refactored Components
```
src/components/collection/
  ├── CollectionToolbar.tsx         (use CardFilterPanel instead of inline UI)
  ├── CollectionRollupTab.tsx       (apply filters)
  
src/components/
  ├── AddCardSearch.tsx             (extend with CardFilterPanel for deck search)
  
src/app/api/
  ├── collection/printings/route.ts (add mana_cost, power, toughness, rarity support)
  ├── collection/rollup/route.ts    (add mana_cost, power, toughness, rarity support)
  ├── cards/search/route.ts         (new? or extend existing)
```

---

## API Contract Changes

### Extend `/api/collection/rollup` Query Params

**New params:**
```
?manaCostMin=3&manaCostMax=4
?powerMin=2&powerMax=*
?toughnessMin=1&toughnessMax=*
?rarity=rare,mythic
?type=creature
?syntax=t:creature c:g cmc:3-4  (if provided, ignore other filters)
```

**Response:** Same as current (no change needed)

### Extend `/api/collection/printings` Query Params

**Same new params as above**

---

## Filter State Management

### Context/Hook for Sharing State

```typescript
// src/hooks/useCardFilters.ts

interface UseCardFiltersReturn {
  filters: FilterState
  setFilters: (filters: FilterState) => void
  addFilter: (key: string, value: any) => void
  removeFilter: (key: string) => void
  clearAll: () => void
  appliedCount: number
}

export function useCardFilters(initialFilters?: FilterState): UseCardFiltersReturn {
  // Manage filter state
  // Sync to URL params
  // Persist to localStorage if needed
}
```

### Integration Points

1. **Collection Page**
   ```typescript
   const { filters, setFilters } = useCardFilters()
   const { rows } = useCollectionRollup({ ...filters })
   ```

2. **Deck Search**
   ```typescript
   const { filters, setFilters } = useCardFilters()
   const { results } = useCardSearch({ ...filters })
   ```

3. **Collection List**
   ```typescript
   const { filters, setFilters } = useCardFilters()
   const { rows } = useCollectionPrintings({ ...filters })
   ```

---

## UX Flow Example: User Applies "3-Drop Green Creatures"

### Scenario 1: Quick-Click UI (Desktop)

1. User opens collection view
2. Clicks green mana symbol → `filters.colors = ['G']`
3. Clicks Mana Cost slider → sets min=3, max=4 → `filters.manaCost = { min: 3, max: 4 }`
4. Starts typing "creature" in Type field → `filters.type = 'creature'`
5. Results update immediately (debounced)
6. Active filters display: `[Green ×] [3-4 Mana ×] [Creature ×]`
7. User clicks `×` on Green to remove it

### Scenario 2: Syntax Input (Power User)

1. User opens filter panel
2. Clicks "Use Syntax" toggle
3. Types: `t:creature c:g cmc:3-4`
4. System parses → sets `colors=['G']`, `manaCost={min:3, max:4}`, `type='creature'`
5. Other filter controls gray out (read-only)
6. Results update

### Scenario 3: Mobile

1. User opens collection view
2. Clicks [≡ Filters] button → drawer opens
3. Interacts with filters as desktop (same controls)
4. Clicks [Apply] → drawer closes, results update
5. Active filters show above results: `[Green ×] [3-4 Mana ×]`

---

## Accessibility & Mobile Considerations

### Keyboard Navigation
- Tab through filter controls in logical order
- Enter to apply, Escape to close drawer
- Arrow keys for sliders
- Filter state is keyboard-accessible

### Screen Reader
- Filter panel is labeled: `<fieldset aria-label="Card Filters">`
- Each filter control has `<label>`
- Active filters are announced: "Active filters: Green, 3 to 4 mana, Creature"
- Error messages are announced live (e.g., invalid syntax)

### Mobile
- Drawer mode on < 768px viewport width
- Touch-friendly sliders (48px minimum height)
- Filter chips wrap gracefully
- No horizontal scroll needed

---

## Known Limitations & Trade-Offs

| Limitation | Rationale | Future |
|-----------|-----------|--------|
| **Syntax validation is basic** | Scryfall syntax is complex; start with simple parsing | Phase 2: Full Scryfall parser |
| **No saved filter presets** | Out of scope for MVP | Phase 2: "Green creatures" preset, etc. |
| **No rules text search** | Requires full-text index; deferred | Phase 3: Index ref_cards.oracle_text |
| **Syntax + UI exclusive** | Prevents confusion; users choose one or the other | Could be unified later with smart parsing |

---

## Design Review Checklist

- [ ] Filter vocabulary matches competitors (9 dimensions: search, color, mana, P/T, rarity, type, status, sort, syntax)
- [ ] Mobile UX is uncluttered (drawer collapse + active chip display)
- [ ] Syntax input is discoverable (link to help, toggle option)
- [ ] Applied filters are visible (chips above results, always visible)
- [ ] API contracts are backward-compatible (new params are optional)
- [ ] State management is consistent (single source of truth for filters)
- [ ] Accessibility passes (keyboard, screen reader, WCAG 2.1 AA)

---

## Next Steps

1. **Approve this design** — Any feedback on UX, terminology, or scope?
2. **Create tasks.md** — Break into implementation tasks (backend API, components, integration)
3. **Design system alignment** — Ensure components match existing Shadcn/Radix UI patterns
4. **Mock ups** — Create Figma/wireframe for visual sign-off before coding
