# Requirements Document

## Introduction

This spec covers the comprehensive UI overhaul of The Oracle's deck detail page and related views. The existing 8-tab deck detail layout is restructured into a 5-tab layout with a persistent header and health strip. Dashboard tiles, collection view, and shared UI components (OwnershipBadge, ConflictAlert) are updated to align with the oracle-ui-spec.md design system. All backend APIs are already built and ready — this spec is UI implementation only.

## Glossary

- **Deck_Detail_Page**: The primary view for a single deck at `/decks/[id]`, containing the persistent header, health strip, and tabbed content panels
- **Persistent_Header**: The non-scrolling topbar area containing commander avatar, deck name, stats, and actions
- **Health_Strip**: The non-scrolling bar between the topbar and tabs showing category health pills and contextual notes
- **Cards_Tab**: The merged Cards + List tab with list/grid toggle and ownership filter chips
- **Analysis_Tab**: The merged Overview + Mana tab showing consolidated analytics and stat cards
- **Upgrade_Tab**: The expanded upgrade view with debrief integration, sort/filter toolbar, and change log
- **Strategy_Tab**: The expanded strategy view incorporating Categories content, deck intent, and precon mod tracker
- **Dashboard**: The home page at `/` showing deck tiles in a grid layout
- **Deck_Tile**: An individual card in the dashboard grid representing one deck
- **Collection_View**: The page at `/collection` showing the user's card collection with Allocation tab
- **Allocation_Tab**: The new tab in Collection_View displaying cross-deck ownership data in a table
- **OwnershipBadge**: A three-state component (Original/Proxy/Not owned) displayed on card surfaces
- **ConflictAlert**: An inline warning component shown on upgrade recommendations when proxy conflicts exist
- **Health_Pill**: A clickable chip in the health strip representing one category's health status (ok/warn/crit)
- **Design_System**: The set of colours, spacing, typography, and accessibility rules defined in oracle-ui-spec.md

## Requirements

### Requirement 1: Tab restructuring

**User Story:** As a deck owner, I want to see my deck detail page organised into 5 focused tabs, so that related information is consolidated and navigation is simpler.

#### Acceptance Criteria

1. WHEN the Deck_Detail_Page loads, THE Deck_Detail_Page SHALL render exactly 5 tabs in fixed order: Cards, Analysis, Combos, Upgrade, Strategy
2. WHEN the deck has deck_type "Precon Mod", THE Strategy_Tab SHALL include the precon mod tracker section at the top of its content
3. THE Deck_Detail_Page SHALL NOT render Overview, List, Categories, or Mana as separate tabs
4. WHEN a user navigates to the Deck_Detail_Page, THE Deck_Detail_Page SHALL display the Cards_Tab as the default active tab

### Requirement 2: Persistent header

**User Story:** As a deck owner, I want to see my deck's key information always visible at the top, so that I have context regardless of which tab I'm viewing.

#### Acceptance Criteria

1. THE Persistent_Header SHALL remain fixed at the top of the viewport and not scroll with tab content
2. THE Persistent_Header SHALL display the commander avatar (36px circle), deck name (16px/500 weight), card count, proxy count, and bracket number
3. WHEN the deck has deck_type "Precon Mod", THE Persistent_Header SHALL display an amber "Precon mod" badge with background rgba(239,159,39,0.15) and text colour #EF9F27
4. THE Persistent_Header SHALL display a "Post-game debrief" button with teal styling (background rgba(29,158,117,0.15), border 0.5px solid rgba(29,158,117,0.4), teal text, sword icon)
5. THE Persistent_Header SHALL display an "Open in Archidekt" link that opens the deck's Archidekt page in a new browser tab
6. WHEN the user activates the "Post-game debrief" button, THE Persistent_Header SHALL navigate to the OracleChat interface in debrief mode

### Requirement 3: Health strip

**User Story:** As a deck owner, I want to see at a glance which deck categories are healthy and which need attention, so that I can quickly identify problems.

#### Acceptance Criteria

1. THE Health_Strip SHALL render between the Persistent_Header and the tab navigation bar, fixed and non-scrolling
2. THE Health_Strip SHALL display one Health_Pill per tracked category (Ramp, Draw, Removal, Lands, Win conditions) showing the category name and current count
3. WHEN a category count meets or exceeds its threshold, THE Health_Pill SHALL render in teal (colour #1D9E75) with a checkmark icon
4. WHEN a category count is within 1 of its threshold, THE Health_Pill SHALL render in amber (colour #EF9F27) with a triangle warning icon
5. WHEN a category count is outside its threshold by more than 1, THE Health_Pill SHALL render in red (colour #E24B4A) with a circle-alert icon
6. WHEN the user activates a Health_Pill, THE Deck_Detail_Page SHALL navigate to the Cards_Tab and scroll to the corresponding category section
7. WHEN at least one category violates its threshold, THE Health_Strip SHALL display a single contextual note right-aligned describing the most severe violation
8. WHEN all categories are healthy, THE Health_Strip SHALL display pills in muted teal without a contextual note

### Requirement 4: Cards tab — merged list and grid

**User Story:** As a deck owner, I want to view my cards in either a categorised list or a visual grid without switching tabs, so that I can choose the view that suits my current task.

#### Acceptance Criteria

1. THE Cards_Tab SHALL display a toolbar with a search input (max-width 260px), a "Proxies only" filter chip, a sort chip, and a list/grid view toggle
2. THE Cards_Tab SHALL display ownership filter chips below the toolbar: "All" (with total count), "Originals" (with count), "Proxies" (with count), "Not owned" (with count)
3. WHEN the active chip is selected, THE Cards_Tab SHALL highlight it with a teal accent; inactive chips SHALL render in neutral style
4. WHEN "List" view is active, THE Cards_Tab SHALL group cards by Archidekt category with collapsible section headers showing category name, count, fill bar, health warning icon (if applicable), and chevron
5. WHEN "List" view is active, each card row SHALL display: card name (12px), type (muted 10px), CMC (muted 10px right-aligned), and OwnershipBadge
6. WHEN "Grid" view is active, THE Cards_Tab SHALL render cards in a 5-column grid grouped by category with full art backgrounds
7. WHEN "Grid" view is active, each card tile SHALL display a corner dot indicator: teal filled (original), amber filled (proxy), empty circle (not owned)
8. THE Cards_Tab SHALL default to list view on initial render
9. THE Cards_Tab SHALL display a summary footer showing counts: originals, proxies, not owned

### Requirement 5: Analysis tab

**User Story:** As a deck owner, I want to see consolidated analytics about my deck's composition, so that I can evaluate its strengths and mana base at a glance.

#### Acceptance Criteria

1. THE Analysis_Tab SHALL display a top row of 4 stat cards: Total Cards, Average CMC, Proxies (amber-styled), and Bracket
2. THE Analysis_Tab SHALL display attribute ratings for: Consistency, Resilience, Interaction, Speed, and Card Advantage
3. THE Analysis_Tab SHALL display a mana curve bar chart with teal bars labelled 1, 2, 3, 4, 5, 6+
4. THE Analysis_Tab SHALL display a colour pips panel showing colour distribution with land recommendations
5. THE Analysis_Tab SHALL display a category distribution panel

### Requirement 6: Upgrade tab — expanded

**User Story:** As a deck owner, I want to see upgrade recommendations integrated with debrief data, so that I can make informed decisions about card changes.

#### Acceptance Criteria

1. WHEN a previous debrief session exists for the deck, THE Upgrade_Tab SHALL display a "Last debrief" banner at the top with session date and summary
2. THE Upgrade_Tab SHALL display a toolbar with sort options, filter chips, and a refresh button
3. THE Upgrade_Tab SHALL display upgrade candidates as cut/add card pairs with: priority number, impact bar, source badge, card names (13px/500), reasons, OwnershipBadge, EDHREC percentage, and price
4. WHEN a card in the upgrade candidates has an OwnershipBadge of "Proxy", THE Upgrade_Tab SHALL display the original deck holder in a tooltip
5. THE Upgrade_Tab SHALL display action buttons per candidate: "Make change", "Skip", and "Discuss in debrief"
6. THE Upgrade_Tab SHALL display a "Fresh analysis" prompt section when no recent analysis exists
7. THE Upgrade_Tab SHALL display a change log section showing previously applied upgrades

### Requirement 7: Strategy tab — expanded

**User Story:** As a deck owner, I want my strategy intent, category management, and precon tracking all in one place, so that I can manage deck direction holistically.

#### Acceptance Criteria

1. WHEN the deck has deck_type "Precon Mod", THE Strategy_Tab SHALL display the precon mod tracker section showing: swaps used (pip visualisation, 10 pips, pip 1 locked for Sol Ring), rarity slots grid (4 columns: Mythic, Rare, Uncommon, Common), budget progress bar, and Sol Ring confirmation row
2. THE Strategy_Tab SHALL display the deck intent section as a two-column field grid containing: win condition, bracket, table context, frustrations, budget mode, format type, and strategy notes
3. THE Strategy_Tab SHALL display a category manager with locked core categories (Ramp, Draw, Removal, Lands, Win Condition) and editable custom categories
4. WHEN a custom category overlaps with another category by sharing cards, THE Strategy_Tab SHALL display an overlap detection warning
5. THE Strategy_Tab SHALL provide a "Sync to Archidekt" button that confirms before pushing category changes

### Requirement 8: Dashboard tile updates

**User Story:** As a user browsing my decks, I want dashboard tiles to show health status and proxy count, so that I can quickly identify which decks need attention.

#### Acceptance Criteria

1. THE Deck_Tile SHALL display health pips (small teal/amber/red dots) indicating the deck's overall health status
2. THE Deck_Tile SHALL display the proxy count when the deck has proxies (e.g., "27 proxies")
3. WHEN the user hovers over a Deck_Tile, THE Deck_Tile SHALL reveal a hover state with "Post-game" and "Open" action buttons
4. WHEN a deck is in draft status, THE Deck_Tile SHALL render with a dashed border to visually distinguish it from published decks

### Requirement 9: Collection allocation tab

**User Story:** As a collection owner, I want to see which decks share cards and manage ownership assignments, so that I can resolve proxy conflicts.

#### Acceptance Criteria

1. THE Collection_View SHALL display two tabs: "Collection" (existing card grid) and "Allocation" (new ownership table)
2. WHEN the Allocation_Tab is active, THE Allocation_Tab SHALL display a sidebar filter (180px width) listing all decks for filtering
3. WHEN the Allocation_Tab is active, THE Allocation_Tab SHALL display a table with card rows and deck columns, where each cell shows: "O" in teal (original), "P" in amber (proxy), or empty
4. WHEN a card row shows a proxy or conflict state, THE Allocation_Tab SHALL display a "Reassign" button on that row
5. WHEN the user activates "Reassign", THE Allocation_Tab SHALL call the POST /api/allocation/reassign endpoint and update the table to reflect the new ownership state
6. THE Allocation_Tab SHALL paginate results at 100 rows per page

### Requirement 10: OwnershipBadge component

**User Story:** As a deck owner viewing cards, I want a clear visual indicator of each card's ownership status, so that I know which cards are originals, proxies, or unowned.

#### Acceptance Criteria

1. WHEN a card's allocation_role is "original", THE OwnershipBadge SHALL render as "● Original" with background rgba(29,158,117,0.15) and teal text
2. WHEN a card's allocation_role is "proxy", THE OwnershipBadge SHALL render as "◐ Proxy" with background rgba(239,159,39,0.15) and amber text
3. WHEN a card's allocation_role is "not_owned", THE OwnershipBadge SHALL render as "○ Not owned" with background rgba(255,255,255,0.05) and muted text
4. WHEN the user activates a Proxy-state OwnershipBadge, THE OwnershipBadge SHALL display a tooltip reading "Original held by [Deck Name]"
5. THE OwnershipBadge SHALL meet WCAG 2.1 AA contrast requirements (minimum 4.5:1 for text) in all three states against the Design_System dark background

### Requirement 11: ConflictAlert component

**User Story:** As a deck owner reviewing upgrades, I want to be warned when adding a card would create a proxy conflict, so that I can make informed decisions about shared cards.

#### Acceptance Criteria

1. WHEN an upgrade recommendation's "add" card is already allocated as an original in another deck, THE ConflictAlert SHALL render inline below the recommendation card
2. THE ConflictAlert SHALL display the conflicting deck name and a brief explanation that adding this card will create a proxy in the other deck
3. THE ConflictAlert SHALL render with amber warning styling consistent with the Design_System amber colour (#EF9F27)
4. IF no proxy conflict exists for an upgrade recommendation, THEN THE ConflictAlert SHALL NOT render

### Requirement 12: Design system compliance

**User Story:** As a user of The Oracle, I want a consistent dark-themed interface with accessible colour and typography, so that the application is visually cohesive and usable.

#### Acceptance Criteria

1. THE Design_System SHALL use #0f0f0f as the page background, #161616 as the sidebar surface, and rgba(255,255,255,0.04) as the elevated card surface
2. THE Design_System SHALL use 8pt grid spacing for all component internal gaps (8px, 12px, 16px)
3. THE Design_System SHALL use sentence case for all labels and limit font weights to 400 (regular) and 500 (medium)
4. THE Design_System SHALL use border-radius 8px (--border-radius-md) for controls and 12px (--border-radius-lg) for cards and panels
5. THE Design_System SHALL ensure no UI state is distinguished by colour alone — icons or symbols SHALL always accompany colour coding (WCAG 1.4.1 compliance)
6. THE Design_System SHALL use #1D9E75 (teal) for selected states, primary actions, and health indicators; #EF9F27 (amber) for warnings and proxies; #E24B4A (red) for critical violations and cut cards
