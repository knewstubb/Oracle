# Implementation Plan: UI Overhaul

## Overview

This plan restructures the deck detail page from an 8-tab layout to a focused 5-tab layout with a persistent header and health strip. It also updates dashboard tiles, adds an Allocation tab to the collection view, introduces reusable shared components (OwnershipBadge, ConflictAlert), and formalises design system tokens as CSS custom properties. All work is UI-only — existing APIs serve all required data.

## Tasks

- [x] 1. Design system tokens and shared primitives
  - [x] 1.1 Create CSS custom properties file for design system tokens
    - Create `src/styles/tokens.css` defining all colour, spacing, border-radius, and typography tokens from oracle-ui-spec.md
    - Tokens: `--color-teal`, `--color-amber`, `--color-red`, `--color-blue`, `--bg-page`, `--bg-surface`, `--bg-card`, `--border-default`, `--border-emphasis`, `--border-radius-md` (8px), `--border-radius-lg` (12px)
    - Import tokens.css in the global stylesheet
    - _Requirements: 12.1, 12.2, 12.4, 12.6_

  - [x] 1.2 Implement OwnershipBadge component
    - Create `src/components/OwnershipBadge.tsx` with three visual states: original (● teal), proxy (◐ amber), not_owned (○ muted)
    - Proxy state renders an interactive tooltip showing "Original held by [Deck Name]"
    - Ensure colour is never the sole differentiator — symbols always accompany colour coding
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 12.5_

  - [x] 1.3 Implement ConflictAlert component
    - Create `src/components/ConflictAlert.tsx` rendering an inline amber warning with conflicting deck name
    - Renders only when a proxy conflict exists for an upgrade recommendation
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 1.4 Implement HealthPill component
    - Create `src/components/HealthPill.tsx` as a stateless pill rendering icon + category name + count
    - Three states: ok (Check icon, teal), warn (AlertTriangle icon, amber), crit (AlertCircle icon, red)
    - Each pill is a button with an onClick handler
    - _Requirements: 3.3, 3.4, 3.5, 12.5_

  - [ ]* 1.5 Write property tests for OwnershipBadge
    - **Property 8: OwnershipBadge renders correct symbol and styling for any status**
    - **Property 9: Proxy OwnershipBadge tooltip contains holder deck name**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

  - [ ]* 1.6 Write property tests for HealthPill
    - **Property 2: HealthPill renders correct icon and colour for any status**
    - **Validates: Requirements 3.3, 3.4, 3.5, 12.5**

- [x] 2. Persistent header and health strip
  - [x] 2.1 Implement PersistentHeader component
    - Create `src/components/PersistentHeader.tsx` with sticky positioning
    - Renders: commander avatar (36px circle), deck name (16px/500), precon mod badge (conditional amber pill), card/proxy/bracket stats, "Post-game debrief" button (teal styled), "Open in Archidekt" link
    - Uses `position: sticky; top: 0` for persistence across tab scrolling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 Implement HealthStrip component
    - Create `src/components/HealthStrip.tsx` rendering one HealthPill per category
    - Fetches from `['decks', id, 'health']` query
    - Renders contextual note (right-aligned) when at least one violation exists; most severe wins
    - Strip uses sticky positioning below PersistentHeader
    - onPillClick triggers tab change to Cards and sets scroll target
    - _Requirements: 3.1, 3.2, 3.6, 3.7, 3.8_

  - [ ]* 2.3 Write property tests for PersistentHeader and HealthStrip
    - **Property 1: PersistentHeader renders all required deck information**
    - **Property 3: HealthStrip renders one pill per category**
    - **Property 4: Contextual note appears if and only if a violation exists**
    - **Property 5: HealthPill click navigates to the correct category**
    - **Validates: Requirements 2.2, 3.2, 3.6, 3.7, 3.8**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Cards tab — merged list and grid
  - [x] 4.1 Implement CardsTab component with toolbar and view toggle
    - Create `src/components/CardsTab.tsx` managing local state: view mode (list/grid), search filter, ownership filter, sort
    - Toolbar: search input (max-width 260px), "Proxies only" chip, sort chip, list/grid toggle
    - Ownership filter chips below toolbar: All, Originals, Proxies, Not owned — each with count
    - Active chip highlighted with teal accent; default to list view
    - Summary footer with counts: originals, proxies, not owned
    - _Requirements: 4.1, 4.2, 4.3, 4.8, 4.9_

  - [x] 4.2 Implement list view within CardsTab
    - Cards grouped by Archidekt category with collapsible section headers
    - Category header: name (11px/500 uppercase muted), count, fill bar, health warning icon, chevron
    - Card row: card name (12px), type (muted 10px), CMC (muted 10px right), OwnershipBadge
    - Accepts `scrollToCategory` prop for health pill navigation
    - _Requirements: 4.4, 4.5_

  - [x] 4.3 Implement grid view within CardsTab
    - 5-column grid grouped by category with category label above each group
    - Full art backgrounds using CardImage component
    - Corner dot: teal filled (original), amber filled (proxy), empty circle (not owned)
    - Hover overlay reveals card name and ownership dot label
    - _Requirements: 4.6, 4.7_

  - [ ]* 4.4 Write property tests for CardsTab
    - **Property 6: Ownership filter chip counts are correct**
    - **Property 7: List view groups cards correctly by category**
    - **Validates: Requirements 4.2, 4.4, 4.9**

- [x] 5. Analysis tab
  - [x] 5.1 Implement AnalysisTab component
    - Create `src/components/AnalysisTab.tsx` consolidating Overview + Mana content
    - Top row: 4 stat cards (Total Cards, Avg CMC, Proxies in amber, Bracket)
    - Two-column layout: left — attribute ratings + colour pips; right — mana curve chart + category distribution
    - Mana curve: teal bars, buckets 1, 2, 3, 4, 5, 6+
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 5.2 Write property tests for AnalysisTab
    - **Property 10: Mana curve correctly buckets cards by CMC**
    - **Property 11: Stat cards compute correct values**
    - **Validates: Requirements 5.1, 5.3**

- [x] 6. Upgrade tab — expanded
  - [x] 6.1 Implement expanded UpgradeTab component
    - Rewrite `src/components/UpgradePanel.tsx` as `src/components/UpgradeTab.tsx`
    - Top: last debrief banner (conditional on session existence)
    - Toolbar with sort, filter chips, refresh button
    - Upgrade candidate cards: cut/add pairs with priority number, impact bar, source badge, names (13px/500), reasons, OwnershipBadge, EDHREC %, price
    - Action buttons: "Make change", "Skip", "Discuss in debrief"
    - ConflictAlert renders inline below candidates with proxy conflicts
    - Bottom: fresh analysis prompt, change log section
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Write property test for ConflictAlert in Upgrade context
    - **Property 12: ConflictAlert renders if and only if a proxy conflict exists**
    - **Validates: Requirements 11.1, 11.2, 11.4**

- [x] 7. Strategy tab — expanded
  - [x] 7.1 Implement expanded StrategyTab component
    - Create `src/components/StrategyTab.tsx` consolidating Strategy + Categories
    - Section 1 (conditional): Precon mod tracker — swaps used (10 pips, pip 1 locked), rarity slots grid, budget progress bar, Sol Ring row
    - Section 2: Deck intent — two-column field grid (win condition, bracket, table context, frustrations, budget mode, format type, strategy notes)
    - Section 3: Category manager — locked core categories (Ramp, Draw, Removal, Lands, Win Condition), editable custom categories, overlap detection, "Sync to Archidekt" button with confirmation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [~] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Deck detail page rewrite (5-tab layout)
  - [x] 9.1 Rewrite deck detail page with new layout
    - Rewrite `src/app/decks/[id]/page.tsx` to use PersistentHeader, HealthStrip, and 5-tab TabNavigation
    - Tab order fixed: Cards, Analysis, Combos, Upgrade, Strategy
    - Default active tab: Cards
    - Remove old Overview, List, Categories, Mana tabs
    - PersistentHeader + HealthStrip sticky at top; tab content scrolls independently beneath
    - Wire HealthStrip pill clicks to CardsTab scroll-to-category
    - Retain existing error/loading states and skeleton patterns
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 9.2 Write unit tests for tab navigation and layout
    - Test that exactly 5 tabs render in correct order
    - Test that Cards is the default active tab
    - Test that health pill click navigates to Cards tab with scroll target
    - _Requirements: 1.1, 1.4, 3.6_

- [x] 10. Dashboard DeckTile enhancements
  - [x] 10.1 Enhance DeckTile component
    - Update `src/components/DeckTile.tsx` to accept new props: `healthStatus`, `proxyCount`, `isDraft`
    - Add health pips row (small coloured dots: teal/amber/red)
    - Add proxy count text below pips
    - Add hover overlay with "Post-game" and "Open" action buttons
    - Add dashed border when `isDraft` is true
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ]* 10.2 Write property test for DeckTile health pips
    - **Property 15: DeckTile health pips reflect status array**
    - **Validates: Requirements 8.1**

- [x] 11. Collection page — Allocation tab
  - [x] 11.1 Add tab navigation to collection page
    - Update `src/app/collection/page.tsx` to render two tabs: "Collection" (existing grid) and "Allocation" (new)
    - _Requirements: 9.1_

  - [x] 11.2 Implement AllocationTab component
    - Create `src/components/AllocationTab.tsx` fetching from `GET /api/allocation?view=shared`
    - Sidebar filter by deck (180px width)
    - Main table: card rows with deck columns — cells show "O" (teal) for original, "P" (amber) for proxy, empty for null
    - "Reassign" button on proxy/conflict rows calling `POST /api/allocation/reassign`
    - Pagination at 100 rows per page
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 11.3 Write property tests for AllocationTab
    - **Property 13: Allocation table cells show correct status indicator**
    - **Property 14: Reassign button appears if and only if row has conflict**
    - **Validates: Requirements 9.3, 9.4**

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all components are React 19 functional components
- Existing OwnershipBadge/HealthBar from earlier specs may need restyling to match the design system tokens defined in task 1.1
- The CombosPanel is unchanged in functionality — only restyled to match design system (handled implicitly by token adoption in task 1.1)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6", "2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "4.1", "5.1", "7.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2", "6.1"] },
    { "id": 5, "tasks": ["4.4", "6.2", "9.1", "10.1"] },
    { "id": 6, "tasks": ["9.2", "10.2", "11.1"] },
    { "id": 7, "tasks": ["11.2"] },
    { "id": 8, "tasks": ["11.3"] }
  ]
}
```
