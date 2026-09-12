# Design: Card UX Unified

> Last updated: 2026-07-16
> Status: Final
> Reference implementation: `src/components/CardGroupSection.tsx`

## Design Goals

- Single shared component for all card list views
- Consistent row behavior across deck and collection
- Clear status indicators without learning curve
- Rich metadata without clutter

## Component Architecture

```
CardGroupSection
├── SectionHeader (category name, count, health indicator)
├── CardRow[] (shared row component)
│   ├── DragHandle (optional)
│   ├── Checkbox (optional)
│   ├── Quantity
│   ├── CardName + HoverPreview
│   ├── SetIcon + SetName
│   ├── ManaCost
│   ├── StatusChip (clickable)
│   ├── Price
│   └── KebabMenu
└── EmptyState (when no cards)
```

## CardRow Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ⠿  □  1  Sol Ring           MH2 · Modern Horizons 2  {1}  ● $4.50  ⋮  │
│ ↑  ↑  ↑  ↑                   ↑                        ↑   ↑   ↑     ↑  │
│ dr ch qty name               set icon + name          mana st price kb │
└─────────────────────────────────────────────────────────────────────────┘
```

## Status Icons (Material Symbols)

| Status | Icon | Symbol Name | Color |
|--------|------|-------------|-------|
| Original | ● | circle (filled, weight 700) | Green #1D9E75 |
| Proxy | 🎭 | comedy_mask | Blue #6B8AFF |
| Available | ○ | circle (outline) | Grey |
| Alternate | ⇆ | swap_horiz | Grey |
| Claimed | 🔒 | lock | Amber #F5A623 |
| Unowned | ⊘ | do_not_disturb_on | Pink #FF6B8A |

## Hover Preview

```tsx
const { previewRef, showPreview, previewPosition, previewCard } = 
  useCardHoverPreview()

// 200ms delay before showing
// 220px width, 5:7 aspect ratio
// Positioned near cursor, viewport-clamped
// Uses portal to render above all content
```

## Basic Land Display

### Generic (Collapsed)

```
Forest ×12                          [no status] [no price]  ⋮
```

Kebab menu: +1, -1, Remove all

### Specific Printing (Individual)

```
Mountain (DSK)        DSK · Duskmourn  {—}  ●  $0.25  ⋮
```

Kebab menu: +1, -1, Make generic, Remove

## Font Resources

```html
<!-- Mana symbols -->
<link href="//cdn.jsdelivr.net/npm/mana-font@latest/css/mana.css" rel="stylesheet">

<!-- Set symbols (keyrune) -->
<link href="//cdn.jsdelivr.net/npm/keyrune@latest/css/keyrune.css" rel="stylesheet">

<!-- Material Symbols -->
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet">
```

## Key Decisions

| Decision | Chosen | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Single shared component | Yes | View-specific components | Feature parity by default |
| Material Symbols | Yes | Custom SVGs | Consistent, Google-supported |
| CDN fonts | Yes | Self-hosted | Simpler, cached across sites |
| 200ms hover delay | Yes | No delay | Prevents accidental triggers |

## Components

- `CardGroupSection.tsx` — Shared section with rows
- `CardSlotBadge.tsx` — Unified status indicator
- `StatusChipPopover.tsx` — Contextual actions
- `ManaCost.tsx` — Mana pip rendering
- `CardHoverPreview.tsx` — Cursor-following preview
- `CardRowKebab.tsx` — Context menu with quantity adjuster

## Provenance

- Authored: 2026-07-16
- Shipped: 2026-07-16
