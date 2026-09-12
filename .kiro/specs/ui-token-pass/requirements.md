# Requirements Document

## Introduction

A comprehensive UI consistency pass across The Oracle application, replacing all inline `style={{ }}` values and ad-hoc color/spacing literals with CSS custom property references (design tokens) or Tailwind utilities mapped to spec tokens. The goal is a single source of truth for the visual language: spacing (8pt grid), typography (11–28px, weights 400/500), neutral UI ramp, status colors, and table/row patterns — applied uniformly to every page and component.

## Glossary

- **Token_System**: The CSS custom properties defined in `src/styles/tokens.css` that encode the design spec's spacing, typography, color, and layout values.
- **Theme_Layer**: The shadcn/ui theme variables defined in `globals.css` (`:root` and `.dark` selectors) that are consumed by shadcn primitives.
- **Component**: Any React component file (`.tsx`) within `src/components/` or `src/app/` that renders UI.
- **Inline_Style**: A JSX `style={{ }}` attribute containing hardcoded pixel, color, or opacity values.
- **Table_View**: Any list-based UI rendering rows of data (DeckListTable, SharedCardRow, PrintingListView, RollupRow, CollectionListView, brew-v2/CardRow, CurveCardRow).
- **Spec_Tokens**: The canonical design values from the Component & Layout Spec and Status Color Token Spec documents.
- **Neutral_Ramp**: The eight-step neutral color scale: --bg-canvas through --text-primary.
- **Ownership_Axis**: Status colors for ownership state: owned, proxy, unowned.
- **Allocation_Axis**: Status colors for allocation state: unallocated, partial, full, over-allocated.

## Requirements

### Requirement 1: Token File Expansion

**User Story:** As a developer, I want all design spec values defined as CSS custom properties in one file, so that every component can reference them by name instead of hardcoding values.

#### Acceptance Criteria

1. THE Token_System SHALL define spacing tokens `--space-1` through `--space-7` corresponding to the 8pt grid values (4px, 8px, 12px, 16px, 24px, 32px, 48px).
2. THE Token_System SHALL define typography size tokens `--text-xs` (11px), `--text-sm` (12px), `--text-base` (13px), `--text-md` (14px), `--text-lg` (16px), `--text-xl` (20px), `--text-2xl` (24px), `--text-3xl` (28px).
3. THE Token_System SHALL define typography weight tokens `--font-normal` (400) and `--font-medium` (500) with no other weight values.
4. THE Token_System SHALL define the full neutral UI ramp: `--bg-canvas` (#131316), `--bg-surface` (#1A1A1E), `--bg-surface-hover` (#212126), `--border-subtle` (#262629), `--border-default` (#35353A), `--text-tertiary` (#6E6E76), `--text-secondary` (#9C9CA3), `--text-primary` (#E8E8EA).
5. THE Token_System SHALL define ownership axis tokens: `--status-owned` (#5F5E5A), `--status-proxy` (#4A93A0), `--status-unowned` (#F0339E).
6. THE Token_System SHALL define allocation axis tokens: `--status-unallocated` (#5F5E5A), `--status-partial` (#8A8A92), `--status-full` (#5F5E5A), `--status-over` (#FF5F1F).
7. THE Token_System SHALL define table layout tokens: `--row-height` (44px), `--row-h-pad` (var(--space-3)), `--row-v-pad` (var(--space-2)), `--status-slot-width` (24px).
8. THE Token_System SHALL define a master-detail panel width token: `--detail-panel-width` (320px).

### Requirement 2: Theme Variable Remapping

**User Story:** As a developer, I want shadcn/ui theme variables to resolve to spec tokens, so that primitives like Button, Dialog, and Popover render with spec-compliant colors without per-component overrides.

#### Acceptance Criteria

1. THE Theme_Layer SHALL map `--background` to the Token_System value `--bg-canvas`.
2. THE Theme_Layer SHALL map `--card` to the Token_System value `--bg-surface`.
3. THE Theme_Layer SHALL map `--border` to the Token_System value `--border-default`.
4. THE Theme_Layer SHALL map `--foreground` to the Token_System value `--text-primary`.
5. THE Theme_Layer SHALL map `--muted-foreground` to the Token_System value `--text-secondary`.
6. THE Theme_Layer SHALL map `--popover` to the Token_System value `--bg-surface`.
7. THE Theme_Layer SHALL map `--popover-foreground` to the Token_System value `--text-primary`.
8. WHEN the Theme_Layer dark-mode variables are updated, THE Theme_Layer SHALL retain the light-mode `:root` values unchanged for future light-theme support.

### Requirement 3: Inline Style Elimination

**User Story:** As a developer, I want zero inline `style={{ }}` attributes containing hardcoded color, spacing, or typography values, so that visual consistency is enforced at the token level.

#### Acceptance Criteria

1. THE Component SHALL NOT contain inline `style` attributes with hardcoded `background`, `color`, `border`, `borderBottom`, or `borderTop` values that correspond to Spec_Tokens.
2. THE Component SHALL reference Token_System custom properties via CSS `var()` in class-based stylesheets or Tailwind arbitrary-value utilities (e.g., `bg-[var(--bg-canvas)]`).
3. THE Component SHALL NOT contain inline `style` attributes with hardcoded `rgba(255,255,255,...)` opacity values when an equivalent neutral ramp token exists.
4. THE Component SHALL NOT contain hardcoded `font-weight: 600` or `font-weight: 700` values — only weights 400 and 500 are permitted.
5. IF a Component uses Tailwind class `font-bold`, THEN THE Component SHALL replace the class with `font-medium` (weight 500).

### Requirement 4: Table and Row Pattern Compliance

**User Story:** As a user, I want all list/table views to render with uniform row height, padding, column alignment, and status badge sizing, so that scanning data is consistent across pages.

#### Acceptance Criteria

1. THE Table_View SHALL render each data row at exactly 44px height (var(--row-height)).
2. THE Table_View SHALL apply horizontal padding of var(--row-h-pad) and vertical padding of var(--row-v-pad) to each row.
3. THE Table_View SHALL render numeric columns with `text-align: right` and `font-variant-numeric: tabular-nums`.
4. THE Table_View SHALL render the name/title column as a flex-grow column that consumes remaining horizontal space.
5. THE Table_View SHALL reserve a trailing 24px-wide slot (var(--status-slot-width)) for status badge rendering on every row.
6. WHEN a Table_View row has no status to display, THE Table_View SHALL render the trailing slot as an empty 24px placeholder preserving column alignment.

### Requirement 5: Typography Scale Enforcement

**User Story:** As a user, I want text across all pages to use the defined type scale consistently, so that hierarchy is clear and visual noise is reduced.

#### Acceptance Criteria

1. THE Component SHALL only use font sizes from the typography token scale (11px, 12px, 13px, 14px, 16px, 20px, 24px, 28px).
2. THE Component SHALL NOT use `font-size` values outside the defined scale (e.g., 10px, 15px, 18px, 22px).
3. THE Component SHALL only use font weights 400 (`--font-normal`) or 500 (`--font-medium`).
4. WHEN a heading element (h1, h2, h3) is rendered, THE Component SHALL use weight 500 and a size from the upper scale (20px, 24px, or 28px).

### Requirement 6: Spacing Grid Compliance

**User Story:** As a user, I want all spacing (padding, margin, gap) to follow the 8pt grid, so that layout rhythm is consistent across pages.

#### Acceptance Criteria

1. THE Component SHALL use spacing values exclusively from the token scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px.
2. THE Component SHALL NOT use arbitrary spacing values outside the scale (e.g., 5px, 10px, 14px, 20px, 18px).
3. THE Component SHALL reference spacing tokens via Tailwind utilities mapped to the token scale or via `var(--space-N)` in CSS.

### Requirement 7: Status Color Token Usage

**User Story:** As a user, I want ownership and allocation status indicators to use the spec-defined colors, so that status is immediately recognizable by color without reading labels.

#### Acceptance Criteria

1. WHEN a Component renders an ownership status indicator, THE Component SHALL use the Ownership_Axis token matching the state (--status-owned, --status-proxy, or --status-unowned).
2. WHEN a Component renders an allocation status indicator, THE Component SHALL use the Allocation_Axis token matching the state (--status-unallocated, --status-partial, --status-full, or --status-over).
3. THE Component SHALL NOT use hardcoded hex, rgb, or rgba values for status colors when a corresponding axis token exists.

### Requirement 8: Master-Detail Panel Layout

**User Story:** As a user, I want detail panels to have a consistent fixed width that pushes main content aside, so that the layout remains predictable when panels open or close.

#### Acceptance Criteria

1. WHEN a master-detail panel is open, THE Component SHALL render the detail panel at exactly var(--detail-panel-width) (320px).
2. WHEN a master-detail panel is open, THE Component SHALL push adjacent content to accommodate the panel width rather than overlaying.
3. THE Component SHALL reference `--detail-panel-width` from the Token_System rather than hardcoding 320px.

### Requirement 9: Full Page Coverage

**User Story:** As a user, I want every page in the application to follow the token system, so that navigating between sections feels cohesive.

#### Acceptance Criteria

1. THE Token_System SHALL be applied to the Decks dashboard page (page.tsx root).
2. THE Token_System SHALL be applied to the Deck detail page and all its tab panels (Cards, Strategy, Analysis, Upgrade, Brew).
3. THE Token_System SHALL be applied to the Collection page and all child components.
4. THE Token_System SHALL be applied to the Allocation page and all child components.
5. THE Token_System SHALL be applied to the Settings page.
6. THE Token_System SHALL be applied to the Brew page and all brew-v2 child components.
7. THE Token_System SHALL be applied to the Sidebar component.
8. THE Token_System SHALL be applied to all 17 shadcn/ui primitive components via Theme_Layer remapping.

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want the token pass to preserve existing component behavior and layout, so that the refactor is purely visual-token driven with no functional regressions.

#### Acceptance Criteria

1. WHEN tokens are applied to a Component, THE Component SHALL maintain identical rendered dimensions, positions, and interactive behaviors.
2. THE Token_System expansion SHALL NOT remove or rename existing tokens already referenced by components (`--color-teal`, `--color-amber`, `--color-red`, `--color-blue`, `--bg-page`, `--bg-surface`, `--bg-card`, `--border-default`, `--border-emphasis`).
3. IF an existing token value conflicts with the new Spec_Tokens, THEN THE Token_System SHALL update the value to match Spec_Tokens and update all references in components to avoid visual regression.
