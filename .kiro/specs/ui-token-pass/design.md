# Design Document: UI Token Pass

## Overview

This design defines a three-phase refactoring strategy to eliminate all inline style hardcoding and establish a single-source-of-truth token system across ~80 components in The Oracle. The work is purely structural — CSS token expansion, theme remapping, and per-component inline-to-token migration — with no behavioral or functional changes.

## Architecture

### Token Architecture (3-Layer Model)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Component Styles                                   │
│  Tailwind utilities (bg-[var(--bg-canvas)]) or CSS classes   │
│  referencing Layer 1/2 variables                             │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Theme Variables (globals.css .dark)                │
│  shadcn/ui semantic vars (--background, --card, --border)   │
│  mapped to Layer 1 tokens                                    │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Design Tokens (tokens.css)                         │
│  Primitive values: spacing, typography, neutral ramp,        │
│  status colors, layout tokens                                │
└─────────────────────────────────────────────────────────────┘
```

All visual values flow **downward** — components never hardcode primitives. The token file is the single source of truth; the theme layer aliases tokens for shadcn/ui consumption; components reference either theme variables (via Tailwind semantic classes) or tokens directly (via `var(--token-name)` in arbitrary-value utilities).

### Execution Phases

| Phase | Description | Files Changed |
|-------|-------------|---------------|
| 1 — Token Expansion | Add spacing, typography, neutral ramp, status, and layout tokens to `tokens.css` | 1 file |
| 2 — Theme Remapping | Update `.dark` selector in `globals.css` to alias tokens | 1 file |
| 3 — Component Migration | Replace inline `style={{ }}` and hardcoded values in all components | ~80 files |

## Components and Interfaces

### Token File (`src/styles/tokens.css`)

The expanded token file defines five categories of primitive values:

```css
:root {
  /* ─── Spacing (8pt grid) ─────────────────────────────────────── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  /* ─── Typography – Sizes ─────────────────────────────────────── */
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 24px;
  --text-3xl: 28px;

  /* ─── Typography – Weights ───────────────────────────────────── */
  --font-normal: 400;
  --font-medium: 500;

  /* ─── Neutral Ramp ───────────────────────────────────────────── */
  --bg-canvas: #131316;
  --bg-surface: #1A1A1E;
  --bg-surface-hover: #212126;
  --border-subtle: #262629;
  --border-default: #35353A;
  --text-tertiary: #6E6E76;
  --text-secondary: #9C9CA3;
  --text-primary: #E8E8EA;

  /* ─── Status – Ownership Axis ────────────────────────────────── */
  --status-owned: #5F5E5A;
  --status-proxy: #4A93A0;
  --status-unowned: #F0339E;

  /* ─── Status – Allocation Axis ───────────────────────────────── */
  --status-unallocated: #5F5E5A;
  --status-partial: #8A8A92;
  --status-full: #5F5E5A;
  --status-over: #FF5F1F;

  /* ─── Table Layout ───────────────────────────────────────────── */
  --row-height: 44px;
  --row-h-pad: var(--space-3);
  --row-v-pad: var(--space-2);
  --status-slot-width: 24px;

  /* ─── Layout – Master-Detail ─────────────────────────────────── */
  --detail-panel-width: 320px;

  /* ─── Existing Tokens (preserved) ────────────────────────────── */
  --color-teal: #1D9E75;
  --color-amber: #EF9F27;
  --color-red: #E24B4A;
  --color-blue: #378ADD;
  --color-teal-bg: rgba(29, 158, 117, 0.15);
  --color-amber-bg: rgba(239, 159, 39, 0.15);
  --color-red-bg: rgba(226, 75, 74, 0.15);
  --color-blue-bg: rgba(55, 138, 221, 0.15);
  --bg-page: #0f0f0f;
  --bg-card: rgba(255, 255, 255, 0.04);
  --border-emphasis: rgba(255, 255, 255, 0.1);
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
}
```

**Migration note on existing tokens:**
- `--bg-page` (#0f0f0f) is close to `--bg-canvas` (#131316). Per Requirement 10.3, `--bg-page` will be updated to `#131316` and all references migrated to `--bg-canvas`.
- `--bg-surface` (#161616) already exists but will be updated to `#1A1A1E` to match the spec neutral ramp.
- `--border-default` (rgba(255,255,255,0.06)) will be updated to `#35353A`. The old value maps closer to `--border-subtle` — references using the old value for faint dividers will be remapped to `--border-subtle`.

### Theme Layer (`src/app/globals.css` — `.dark` selector)

The `.dark` selector will be updated to alias tokens rather than define oklch values directly:

```css
.dark {
  --background: var(--bg-canvas);
  --foreground: var(--text-primary);
  --card: var(--bg-surface);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-surface);
  --popover-foreground: var(--text-primary);
  --muted-foreground: var(--text-secondary);
  --border: var(--border-default);
  --input: var(--border-default);
  /* ... remaining variables with appropriate token mappings */
}
```

The light-mode `:root` values remain unchanged — no modifications to the light theme.

### Component Migration Pattern

For each component, the refactoring follows this transformation:

**Before (inline styles):**
```tsx
<div
  className="flex items-center px-4 py-2.5"
  style={{
    background: '#0f0f0f',
    borderBottom: '0.5px solid rgba(255,255,255,0.06)',
  }}
>
  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px' }}>
    Subtitle text
  </span>
</div>
```

**After (token references):**
```tsx
<div className="flex items-center px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)]">
  <span className="text-[var(--text-xs)] text-[var(--text-tertiary)]">
    Subtitle text
  </span>
</div>
```

### Table Row Template

All table/list view components (PrintingListView, DeckListTable, SharedCardRow, RollupRow, CollectionListView, brew-v2/CardRow, CurveCardRow) will converge on a shared row structure:

```tsx
<div
  className="grid w-full items-center h-[var(--row-height)] px-[var(--row-h-pad)] py-[var(--row-v-pad)] border-b border-[var(--border-subtle)]"
  style={{ gridTemplateColumns: '/* column defs */ var(--status-slot-width)' }}
>
  {/* Name column — flex-grow */}
  <span className="flex-1 truncate text-[var(--text-sm)] font-[var(--font-medium)] text-[var(--text-primary)]">
    {name}
  </span>

  {/* Numeric columns — right-aligned, tabular */}
  <span className="text-right text-[var(--text-xs)] tabular-nums text-[var(--text-secondary)]">
    {value}
  </span>

  {/* Status slot — always 24px, empty placeholder when no status */}
  <div className="w-[var(--status-slot-width)] flex items-center justify-center">
    {status ? <StatusBadge status={status} /> : null}
  </div>
</div>
```

### Neutral Ramp Mapping (rgba → token)

The existing codebase uses many `rgba(255,255,255,X)` values. The mapping to spec tokens:

| Inline Value | Token |
|---|---|
| `rgba(255,255,255,0.04)` / `#0f0f0f` | `--bg-canvas` (backgrounds) |
| `rgba(255,255,255,0.06)` | `--border-subtle` (faint dividers) |
| `rgba(255,255,255,0.1)` | `--border-default` (visible borders) |
| `rgba(255,255,255,0.25)` / `rgba(255,255,255,0.3)` | `--text-tertiary` (muted labels) |
| `rgba(255,255,255,0.35)` | `--text-tertiary` (secondary captions) |
| `rgba(255,255,255,0.5)` | `--text-secondary` (body text) |
| `#e8e8e6` / `#e8e8ea` | `--text-primary` (headings, names) |

### Master-Detail Panel Layout

Detail panels (e.g., the allocation detail panel in the allocation page) will use:

```tsx
<div className="flex min-h-0 flex-1">
  {/* Main content — shrinks when panel open */}
  <div className="flex-1 overflow-hidden">
    {/* table/grid content */}
  </div>

  {/* Detail panel — fixed width, pushes content */}
  {isPanelOpen && (
    <aside className="w-[var(--detail-panel-width)] shrink-0 border-l border-[var(--border-subtle)] overflow-y-auto">
      {/* panel content */}
    </aside>
  )}
</div>
```

### Token Consumption Patterns

Components consume tokens through two mechanisms:

1. **Tailwind arbitrary-value utilities** (preferred for one-off values):
   ```tsx
   className="bg-[var(--bg-canvas)] text-[var(--text-primary)]"
   ```

2. **Tailwind theme extension** (for frequently-used values):
   The `@theme inline` block in globals.css already maps some values. Post-migration, the most common tokens can optionally be added to the theme for shorter class names.

### Status Color Interface

Components rendering status indicators receive a status enum and map it to the token:

```typescript
type OwnershipStatus = 'owned' | 'proxy' | 'unowned'
type AllocationStatus = 'unallocated' | 'partial' | 'full' | 'over'

const ownershipTokenMap: Record<OwnershipStatus, string> = {
  owned: 'var(--status-owned)',
  proxy: 'var(--status-proxy)',
  unowned: 'var(--status-unowned)',
}

const allocationTokenMap: Record<AllocationStatus, string> = {
  unallocated: 'var(--status-unallocated)',
  partial: 'var(--status-partial)',
  full: 'var(--status-full)',
  over: 'var(--status-over)',
}
```

## Data Models

No data model changes. This refactor is purely visual — no schema, API, or state management changes.

## Error Handling

### Migration Errors

- **Token name collision**: If a new token name collides with an existing one (e.g., `--bg-surface`), the existing value is updated to match the spec, and all component references are verified to work with the new value.
- **Visual regression**: Each component migration should be visually verified against the current rendering. The refactor must produce identical pixel output (within the tolerance of hex vs rgba approximation).
- **Missing token coverage**: If an inline style value doesn't map to any defined token (e.g., a one-off `rgba(107,138,255,0.4)` for a specific accent), it remains as-is with a comment indicating it's intentionally not tokenized.

### Rollback Strategy

Each phase is independently deployable:
- Phase 1 (token expansion) is additive-only — no risk of regression.
- Phase 2 (theme remapping) changes dark-mode values — rollback is reverting globals.css.
- Phase 3 (component migration) is the bulk of changes — can be done incrementally per-component.

## Testing Strategy

### Static Analysis (Primary Verification)

Since this is a pure CSS/styling refactor with no runtime logic, the primary testing approach is **static analysis of source files**:

- **Token completeness**: Parse `tokens.css` and assert all required custom properties exist with correct values.
- **Inline style elimination**: Grep all `.tsx` files for `style={{` patterns containing token-equivalent values — the count must be zero post-migration.
- **Font weight constraint**: Grep for disallowed weights (600, 700, `font-bold`) — must be zero.
- **Typography scale**: Extract all font-size values and assert each is in the allowed set.
- **Status color hardcoding**: Grep for hex values matching status colors in inline styles — must be zero.

### Visual Regression (Secondary Verification)

- Manual spot-check of each migrated page in the browser to confirm no visual differences.
- The refactor produces identical rendered output — if any pixel difference is observed, it indicates a token value mismatch that must be corrected.

### Unit Tests

- Token file parsing tests to verify structural correctness of the expanded token file.
- No behavioral tests needed — no logic changes.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Token file completeness — spacing, typography, and neutral ramp

*For any* token name in the defined spec set (spacing: `--space-1` through `--space-7`; typography sizes: `--text-xs` through `--text-3xl`; neutral ramp: `--bg-canvas` through `--text-primary`), parsing `tokens.css` SHALL yield that custom property with the spec-mandated value.

**Validates: Requirements 1.1, 1.2, 1.4**

### Property 2: No inline hardcoded token-equivalent values in components

*For any* component file (`.tsx`) in `src/components/` or `src/app/`, the file SHALL NOT contain an inline `style={{ }}` attribute with a `background`, `color`, `borderBottom`, `borderTop`, or `border` value that matches any value in the neutral ramp token set (the rgba(255,255,255,*) series or the hex equivalents #131316, #1A1A1E, #212126, #262629, #35353A, #6E6E76, #9C9CA3, #E8E8EA).

**Validates: Requirements 3.1, 3.3**

### Property 3: Font weight constraint

*For any* component file (`.tsx`) in `src/components/` or `src/app/`, the file SHALL NOT contain `fontWeight: 600`, `fontWeight: 700`, `font-weight: 600`, `font-weight: 700`, or the Tailwind class `font-bold`. Only weights 400 and 500 (via `--font-normal`/`--font-medium` or `font-normal`/`font-medium` classes) are permitted.

**Validates: Requirements 3.4, 3.5, 5.3**

### Property 4: Typography scale adherence

*For any* component file (`.tsx`) in `src/components/` or `src/app/`, all `fontSize` or `font-size` values (whether inline, in Tailwind arbitrary-value brackets, or via text-[Xpx] classes) SHALL be one of: 11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px.

**Validates: Requirements 5.1, 5.2**

### Property 5: Table row height uniformity

*For any* table view component (PrintingListView, DeckListTable, SharedCardRow, RollupRow, CollectionListView, brew-v2/CardRow, CurveCardRow), each data row element SHALL reference `var(--row-height)` or the equivalent 44px height value via token, and numeric columns SHALL have `text-align: right` and `font-variant-numeric: tabular-nums` (or Tailwind equivalents `text-right` and `tabular-nums`).

**Validates: Requirements 4.1, 4.3**

### Property 6: Status slot reservation

*For any* table view component, each row template SHALL contain a trailing element with width `var(--status-slot-width)` (24px). When no status is displayed, the element SHALL still render as an empty placeholder preserving column alignment.

**Validates: Requirements 4.5, 4.6**

### Property 7: No hardcoded status colors when a token exists

*For any* component file that renders ownership or allocation status indicators, the file SHALL NOT contain hardcoded hex/rgb/rgba values matching the status color set (#5F5E5A, #4A93A0, #F0339E, #8A8A92, #FF5F1F). Instead, it SHALL reference the corresponding `--status-*` token.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 8: Detail panel width via token

*For any* component file rendering a master-detail panel, the panel width SHALL reference `var(--detail-panel-width)` rather than a hardcoded `320px` value.

**Validates: Requirements 8.1, 8.3**

### Property 9: Backward-compatible token preservation

*For any* token name in the pre-existing set (`--color-teal`, `--color-amber`, `--color-red`, `--color-blue`, `--bg-page`, `--bg-surface`, `--bg-card`, `--border-default`, `--border-emphasis`), the expanded `tokens.css` SHALL still define that custom property (value may be updated per spec, but the name SHALL exist).

**Validates: Requirements 10.2**
