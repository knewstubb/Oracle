# Design: Mobile-Friendly Views

> Last updated: 2026-08-12
> Status: Draft
> Reference implementation: None yet

## Design Goals

- **Mobile-first for core flows**: Collection lookup and deck viewing must feel natural on phone
- **Progressive enhancement**: Desktop keeps current experience; mobile gets compact variants
- **Minimal new components**: Adapt existing components with responsive styles, not rebuild
- **Touch-friendly**: Larger tap targets, no hover-dependent UI on mobile
- **Fast to ship**: Focus on CSS/layout changes over new features

## Design Principles for This Feature

| Principle | Application |
|-----------|-------------|
| Content density adapts | Desktop shows more per row; mobile shows one item per row with essential info |
| Hide, don't remove | Secondary info (set codes, prices) can be hidden on mobile but still accessible |
| Thumb-reachable actions | Primary actions in bottom half of screen on mobile |

---

## Screens & Components

### Home Page (Deck List)

**Current**: 3-column grid on large screens, 2-column on medium

**Mobile change**:
- Single column layout on `< sm` breakpoint
- DeckStatusCard shows: commander thumbnail (40px), deck name, readiness pip
- Remove folder chips row on mobile (or make horizontally scrollable)

```
┌─────────────────────────────┐
│ 🖼️ Korvold, Fae-Cursed King │
│    Korvold Aristocrats      │
│    ● Ready                  │
├─────────────────────────────┤
│ 🖼️ Prosper, Tome-Bound      │
│    Prosper Treasures        │
│    ◐ 2 claimed              │
└─────────────────────────────┘
```

### Deck Detail Page

**Current**: Hero image with parallax, tabs (Cards, Analysis, Combos, etc.), full card grid

**Mobile change**:
- Hide parallax hero (just show commander name + color identity)
- Collapse to single "Cards" tab by default (other tabs in overflow menu or hidden)
- Card list uses compact row format:

```
┌─────────────────────────────┐
│ Search cards...        🔍   │
├─────────────────────────────┤
│ Creatures (24)         ▼    │
├─────────────────────────────┤
│ Blood Artist           ●    │
│ Zulaport Cutthroat     ●    │
│ Viscera Seer           ◐    │
│ ...                         │
├─────────────────────────────┤
│ Instants (12)          ▼    │
├─────────────────────────────┤
│ Dark Ritual            ●    │
│ ...                         │
└─────────────────────────────┘
```

- Card image on tap (modal with card image, tap outside to dismiss)
- Status badge (●/◐/○) replaces detailed status chips

### Collection Page

**Current**: Grid view with card images, or list view with printing details

**Mobile change**:
- Default to list view on mobile (grid is too dense)
- Compact row: Card name | Qty | Total value
- Search bar sticky at top
- Filter chips horizontally scrollable

```
┌─────────────────────────────┐
│ 🔍 Search collection...     │
├─────────────────────────────┤
│ [W] [U] [B] [R] [G] [C]  → │
├─────────────────────────────┤
│ Demonic Tutor      1  $45   │
│ Rhystic Study      2  $80   │
│ Smothering Tithe   1  $28   │
│ ...                         │
└─────────────────────────────┘
```

### Global Search Modal

**Current**: Cmd+K opens search modal

**Mobile change**:
- Add visible search icon in mobile header (hamburger left, search right)
- Search modal is full-screen on mobile
- Results show: card name, owned qty, deck count

---

## Interactions

| Interaction | Desktop | Mobile |
|-------------|---------|--------|
| View card image | Hover preview | Tap to open modal |
| Open search | Cmd+K | Tap search icon in header |
| Switch tabs | Click tab | Tabs hidden; cards-only view |
| Filter by color | Click chips | Horizontally scroll chip bar |

## Accessibility Notes

- All tap targets minimum 44x44px
- Card image modals can be dismissed with swipe-down or tap-outside
- Focus management on modal open/close
- Reduced motion: disable parallax if `prefers-reduced-motion`

## Design Decisions & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Hide tabs on mobile deck view | Yes | Scrollable tab bar | Simplifies UX; other tabs are rarely used at the table |
| Compact status badge (●/◐/○) | Yes | Full StatusChipPopover | Too complex for mobile; simple indicator is enough |
| List view default on mobile collection | Yes | Smaller grid cards | Grid requires too much squinting; list is faster to scan |

---

## Architecture

### Overview

No new API endpoints. All changes are client-side responsive adjustments.

### Components to Modify

| Component | Change |
|-----------|--------|
| `DeckStatusCard` | Add compact mobile variant |
| `CardsTab` | Add compact list mode for mobile |
| `CollectionToolbar` | Stack vertically on mobile |
| `CollectionGridView` | Default to list on mobile |
| `CommanderGrid` | Already uses responsive grid — verify touch targets |
| `GlobalSearch` | Full-screen modal on mobile |
| `Layout` | Add search icon to mobile header |

### Responsive Breakpoints

Use existing Tailwind breakpoints:
- `sm`: 640px — phones in landscape, small tablets
- `md`: 768px — tablets
- `lg`: 1024px — laptops
- `xl`: 1280px — large monitors

Mobile-specific styles use no prefix (default) or `max-sm:` where needed.

### Trade-offs & Alternatives

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| CSS-only changes | Yes | Dedicated mobile routes | Faster to ship, single codebase |
| Hide vs collapse tabs | Hide completely | Accordion collapse | Cleaner UX; tabs can be accessed via menu if needed |

### Open Questions

- Should we detect mobile via user agent or just use CSS media queries?
  - **Recommendation**: CSS only. UA detection is fragile and adds complexity.
