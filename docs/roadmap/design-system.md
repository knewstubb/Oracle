# Roadmap: Design System & UI

## Built

- **Token System** — Custom spacing (8pt grid), typography (9 sizes), status colors, WUBRG, layout tokens.
- **shadcn/ui** — Base-nova style, Radix primitives, CSS variable theming.
- **Material Symbols** — Icon set for all UI actions.
- **Mana Font + Keyrune** — MTG-specific mana pips and set symbols.
- **Dark Mode** — Primary theme, comprehensive color system.
- **Deck Tile Redesign** — Icon badges, dashed brewing border, desaturated graveyard, proportional color bar.
- **Figma Variables** — 30 colors, 7 spacing, 9 type, 5 radius pushed via API.

## Planned

### Figma Component Library
**Priority:** Medium | **Effort:** Ongoing

Build key components in Figma: Button (started), StatusChip, CardRow, DeckTile, Popover, etc. Enables faster design iteration before coding.

### Code Connect
**Priority:** Low (after components exist) | **Effort:** Low per component

Map each Figma component to its React code file. Shows live code in Figma Dev Mode.

### Light Mode
**Priority:** Low | **Effort:** Medium

CSS variables defined but unused. Would need visual testing of every component. Low priority for a single-user app.

## Ideas

- **Component Storybook** — Isolated component development + visual regression testing
- **Animation System** — Consistent motion tokens (duration, easing, enter/exit patterns)
- **Responsive Breakpoint System** — Formalized mobile/tablet/desktop layouts
- **Accessibility Audit** — WCAG 2.1 AA compliance check across all views
- **Color Contrast Verification** — Automated checks that all text meets 4.5:1 ratio
- **Dark/Light Toggle** — If light mode is ever built, add a toggle in settings
