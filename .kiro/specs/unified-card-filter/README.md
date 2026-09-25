# Unified Card Filter System — Complete Design Package

**Status:** Design phase (awaiting approval)

**Timeline:** Phase 1b (after Phase 1 core features complete)

**Objective:** Create a clean, unified filter system that works across all views (collection, deck search, list) with 9+ filter dimensions, mobile-friendly drawer mode, and optional syntax-based search. Make filtering less clunky than Moxfield/Archidekt.

---

## What You'll Get

### For Users

✅ **Filter by 9+ dimensions:**
- Card name (text search)
- Color identity (WUBRG)
- Mana cost (range: 0-10)
- Power (range: 1-20 or wildcard)
- Toughness (range: 1-20 or wildcard)
- Rarity (Any, Common, Uncommon, Rare, Mythic)
- Type (creature, instant, sorcery, etc.)
- Status (Fully Placed, Partial, Unplaced, Over-Allocated)
- Sort (Card Name, Quantity, Price, Date Added, Rarity)
- Syntax (Scryfall: `t:creature c:g cmc:3-4`)

✅ **Better UX:**
- Applied filters shown as removable chips above results
- Mobile-friendly drawer mode (collapses filters on small screens)
- Consistent filter controls across collection, deck search, list views
- Syntax input for power users
- Fast search (<500ms even with complex filters)

✅ **Faster deck building:**
- Filter "3-drop creatures" directly when adding cards (currently impossible)
- Find budget cards by rarity (currently impossible)
- Find creatures by P/T (currently impossible)

### For Developers

✅ **Clean architecture:**
- Reusable `<CardFilterPanel>` component (works in any view)
- Unified `useCardFilters()` hook for state management
- URL-based persistence (filters survive page refresh)
- Backward-compatible API extensions (existing queries still work)

✅ **Extensible:**
- Easy to add new filter types
- Syntax parser is modular and testable
- Component library matches existing Shadcn/Radix patterns

---

## Key Design Decisions

### 1. Toolbar + Drawer Modes
- **Desktop:** Inline toolbar with all filters visible
- **Mobile (<768px):** Collapsible drawer (saves vertical space)
- Rationale: Competitors (Moxfield, Archidekt) use always-visible toolbar; drawer is cleaner on mobile

### 2. Syntax Separate from GUI Filters
- Users can either use GUI controls OR syntax, not both
- When syntax is active, GUI controls are read-only (gray out)
- Rationale: Prevents confusion; users pick one paradigm and commit to it

### 3. Filter Chips Always Visible
- Active filters display as removable chips above results
- Users always see what they're filtering by
- Rationale: Addresses current pain point ("I forgot what filters I applied")

### 4. No Saved Presets (MVP)
- Filters reset when navigating away from view
- URL-based persistence only
- Rationale: Simpler MVP; can add presets in Phase 2 if needed

### 5. Syntax Validation is Pragmatic
- Start with basic parsing (color, type, mana, rarity, power, toughness)
- Not full Scryfall syntax support (too complex for MVP)
- Error messages point to help docs
- Rationale: Good enough for 80% of use cases; full parser can wait

---

## Architecture Overview

```
User Interaction
        ↓
┌─────────────────────────────────────┐
│  <CardFilterPanel>                  │ ← Unified component
│  - Toolbar mode (desktop)           │   (collection, deck search, list)
│  - Drawer mode (mobile)             │
│  - GUI controls + syntax input      │
└────────────────┬────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  useCardFilters() hook              │ ← State management
│  - Manage filter state              │   (URL sync, persistence)
│  - Serialize to query params        │
└────────────────┬────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  API Routes (Extended)              │ ← Backward compatible
│  - /api/collection/rollup?...       │
│  - /api/collection/printings?...    │
│  - /api/cards/search?...            │
│  (Accept new params: manaCost,      │
│   power, toughness, rarity, type)   │
└────────────────┬────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  Database Query                     │
│  (Existing schema, new indexes)     │
└─────────────────────────────────────┘
```

---

## What Competitors Do (And Why We're Better)

### Moxfield (Most Feature-Complete)
| Feature | Moxfield | Oracle Design |
|---------|----------|---------------|
| **Filters shown** | Always visible toolbar | Toolbar (desktop) + drawer (mobile) |
| **Advanced search** | Modal pop-up | Inline filters + syntax |
| **Applied filters visual** | Implicit (buttons highlight) | Explicit chips (removable) |
| **Syntax support** | Yes, but hidden in UI | Explicit toggle + help text |
| **Mobile UX** | Responsive, but cramped | Drawer mode, uncluttered |

**Why cleaner:** Filter chips + drawer mode + explicit syntax toggle makes filtering faster and more discoverable.

### Archidekt
| Feature | Archidekt | Oracle |
|---------|-----------|--------|
| **Filters** | 7 (no mana cost) | 9+ (includes mana cost) |
| **Mobile** | Responsive toolbar | Drawer mode |
| **Syntax** | No | Yes (with help) |

**Why cleaner:** Supports all Archidekt filters plus more, with better mobile UX.

---

## Design Documents

1. **design.md** — Visual UX, component structure, layout mockups, architectural decisions
2. **requirements.md** — Detailed user stories, acceptance criteria, API contracts, success metrics
3. **README.md** (this file) — High-level overview, decision rationale, next steps

---

## Implementation Roadmap

### Phase 1b (Backend + Components)

**Week 1: Backend API**
- [ ] Extend `/api/collection/rollup` with `manaCostMin/Max`, `powerMin/Max`, etc.
- [ ] Extend `/api/collection/printings` with same params
- [ ] Create `/api/cards/search` endpoint (or extend existing)
- [ ] Add database indexes for fast filtering
- [ ] Test API routes with complex filter combinations

**Week 2: React Components**
- [ ] Create `<CardFilterPanel>` component (orchestrator)
- [ ] Create `<ManaCostFilter>` (dual slider)
- [ ] Create `<PowerToughnessFilter>` (dual slider)
- [ ] Create `<RarityFilter>` (multi-select)
- [ ] Create `<TypeFilter>` (text + autocomplete)
- [ ] Create `<SyntaxFilterInput>` (text input)
- [ ] Create `<FilterChips>` (active filter display)

**Week 3: Integration**
- [ ] Integrate `CardFilterPanel` into `CollectionPage`
- [ ] Integrate into `AddCardSearch` (deck building)
- [ ] Integrate into collection list view
- [ ] Test filter state persistence (URL params)
- [ ] Test across desktop/mobile/tablet viewports

**Week 4: Polish + Testing**
- [ ] Add unit tests for filter parsing
- [ ] Add integration tests for API routes
- [ ] Add e2e tests for UX flows
- [ ] Accessibility audit (keyboard, screen reader)
- [ ] Performance testing (<500ms target)
- [ ] Documentation

---

## Questions for Review

### Design Questions
1. **Syntax trigger:** Should it be a toggle button, or always available? (Current: Toggle)
2. **P/T wildcard:** Use "*" or "∞" symbol? (Current: "*")
3. **Mobile drawer:** Slide from right or bottom? (Current: Right)
4. **Rarity default:** Select "Any" or show specific options? (Current: "Any")

### Scope Questions
1. **Rules text search:** In scope for Phase 1b, or defer to Phase 2? (Current: Defer)
2. **Saved presets:** Should we support "Save as Green Creatures"? (Current: Phase 2)
3. **Advanced syntax:** Full Scryfall parser, or basic subset? (Current: Basic subset)
4. **Filter autocomplete:** Suggest filter options as user types? (Current: No, Phase 2)

### Technical Questions
1. **Syntax parser:** Build custom, or use Scryfall client? (Current: Custom parser, simplicity)
2. **Debounce timing:** 300ms (current) or faster? (Current: 300ms matches collection)
3. **Index strategy:** Add indexes pre-emptively, or measure first? (Current: Add indexes now)
4. **Mobile threshold:** 768px or different breakpoint? (Current: 768px, matches Tailwind)

---

## Competitive Moat

This design isn't just catching up to competitors—it has an edge:

1. **Syntax + GUI dual modes** — Moxfield hides syntax; Oracle makes it first-class
2. **Drawer mode** — Cleaner mobile UX than always-visible toolbar
3. **Filter chips** — Explicit filter state (removable chips) vs. Moxfield's implicit highlight
4. **Commander optimization** — Future: Syntax could include commander-specific queries (e.g., `commander:Yawgmoth synergy:high`)

---

## Success Criteria

| Metric | Today | Target |
|--------|-------|--------|
| **Filter dimensions** | 4-5 | 9+ |
| **Clicks for "3-drop green" query** | Manual scan | 3 clicks (or 1 syntax paste) |
| **Mobile UX** | Cramped toolbar | Clean drawer |
| **Filter discoverability** | Low (buttons only) | High (chips + help) |
| **User satisfaction** | "Filter UI is clunky" | "Competitive with Moxfield" |

---

## Next Steps

### Immediate (This Week)
1. **Review this design** — Any feedback, questions, or changes?
2. **Approve scope** — Are Phase 1b timeline and features acceptable?
3. **Assign ownership** — Who leads backend, who leads frontend?

### Short-term (Next Week)
1. **Create tasks.md** — Break design into specific implementation tasks
2. **Design system alignment** — Ensure components match existing Shadcn/Radix patterns
3. **Create Figma mockups** — Visual sign-off before coding
4. **Set up database indexes** — Prepare Postgres for fast filtering

### Implementation (Weeks 1-4)
Follow the roadmap above. Parallel backend/frontend work. Regular integration syncs.

---

## Design Artifacts

- **design.md** — Visual mockups (ASCII + descriptions), component architecture, UX flows
- **requirements.md** — 11 detailed user stories, API contracts, acceptance criteria
- **This README** — High-level overview, rationale, questions, next steps

All in: `.kiro/specs/unified-card-filter/`

---

## Appendix: Example Syntax Queries

```
# Find 3-drop green creatures
t:creature c:g cmc:3

# Find budget removal (common + uncommon)
(t:instant OR t:sorcery) (c:b OR c:r) rarity:common,uncommon

# Find high-power creatures for aggro
t:creature pow:2+ rarity:rare,mythic

# Find ramp spells
t:sorcery "search your library" OR t:land -is:token

# Find creatures with flying
t:creature keyword:flying

# Complex: Yawgmoth-relevant creatures (proxy of archetype matching)
t:creature (keyword:sacrifice OR keyword:persist OR c:b cmc:1-3)
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **Filter Panel** | Container for all filter controls; adapts to toolbar/drawer mode |
| **Filter Chips** | Visual representation of active filters (removable tags above results) |
| **Syntax Input** | Text field for power users to enter Scryfall-style queries |
| **Debounce** | Delay before API request fires (300ms; prevents excessive requests) |
| **Drawer Mode** | Mobile-optimized collapsible panel (slides in from side) |
| **Backward Compatible** | Existing API queries still work with new optional params |

---

**Prepared by:** Kiro AI (Gene, Delivery Lead)  
**Date:** September 15, 2026  
**Version:** 1.0 (Design phase)

Ready for review. Questions?
