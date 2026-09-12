# Requirements Document

## Introduction

This spec covers expanding the Collection View's Allocation Tab with additional UX refinements from the oracle-ui-spec.md. The existing `ui-overhaul` spec (Requirement 9) defines the basic structure — two tabs, sidebar, table, and reassign button. This spec adds: a stat strip above the tab content, a "Conflicts only" sidebar shortcut with amber styling, table pagination at 100 rows, a legend below the table, deck column header truncation with hover tooltips, the "Not in any deck" sidebar filter, a status column with contextual badges, and toolbar filter chips. These refinements close the gap between the current AllocationTab implementation and the authoritative oracle-ui-spec.md design.

## Glossary

- **Collection_View**: The page at `/collection` showing the user's card collection with Allocation and Collection tabs
- **Allocation_Tab**: The tab in Collection_View displaying cross-deck ownership data in a table with sidebar filtering
- **Stat_Strip**: A horizontal bar of five equal-width statistical cells rendered below the page header and above tab content
- **Sidebar_Filter**: The 180px-wide left panel in Allocation_Tab containing deck filter options and the Conflicts-only shortcut
- **Allocation_Table**: The data table in Allocation_Tab showing card rows with per-deck ownership columns
- **Table_Legend**: A descriptive bar below the Allocation_Table explaining the visual encoding of cell values
- **Table_Footer**: The pagination and summary bar below the Allocation_Table showing counts and page navigation
- **Toolbar**: The horizontal control bar above the Allocation_Table containing search, filter chips, and view toggle
- **Deck_Column_Header**: A table header cell representing a single deck, displaying an abbreviated name with a tooltip for the full name
- **Status_Badge**: An inline label in the Status column indicating a card's aggregate ownership state
- **Reassign_Button**: A contextual action button shown on proxy and conflict rows that opens an inline dropdown to change ownership assignment
- **Conflict_Row**: A table row where a single physical card is claimed as original by more than one deck
- **Proxy_Row**: A table row where a card appears as a proxy in at least one deck but has no multi-original conflict
- **Allocation_Resolver**: The backend process that recalculates ownership states after a reassign action

## Requirements

### Requirement 1: Stat Strip

**User Story:** As a collection owner, I want to see key collection statistics at a glance above the tab content, so that I can quickly understand my collection's allocation state without scrolling.

#### Acceptance Criteria

1. WHEN the Collection_View loads, THE Stat_Strip SHALL render five cells in fixed order: Cards owned, In a deck, Not in any deck, Conflicts, Proxies running
2. THE Stat_Strip SHALL render all five cells at equal width with right-border dividers separating each cell
3. THE Stat_Strip SHALL display the Cards owned count styled in teal (#1D9E75) and the Conflicts count styled in amber (#EF9F27)
4. THE Stat_Strip SHALL render between the page header and the tab navigation bar
5. WHEN allocation data changes due to a reassign action, THE Stat_Strip SHALL update its counts to reflect the new state without requiring a full page reload

### Requirement 2: Sidebar "Not in any deck" Filter

**User Story:** As a collection owner, I want to filter the allocation table to show only cards not assigned to any deck, so that I can identify unallocated cards in my collection.

#### Acceptance Criteria

1. THE Sidebar_Filter SHALL display a "Not in any deck" option positioned between the "All decks" option and the individual deck list, separated by a horizontal divider
2. THE Sidebar_Filter SHALL display the count of unallocated cards next to the "Not in any deck" label
3. WHEN the user activates the "Not in any deck" filter, THE Allocation_Table SHALL display only cards that are not present in any deck
4. WHEN the "Not in any deck" filter is active, THE Sidebar_Filter SHALL highlight the option with a teal right-border accent
5. WHEN the "Not in any deck" filter is active, THE Allocation_Table SHALL render rows with empty deck columns and a "Not in a deck" Status_Badge in muted styling

### Requirement 3: Sidebar "Conflicts only" Shortcut

**User Story:** As a collection owner, I want a quick way to view only allocation conflicts, so that I can focus on resolving cards claimed by multiple decks.

#### Acceptance Criteria

1. THE Sidebar_Filter SHALL display a "Conflicts only" shortcut at the bottom of the sidebar, separated from the deck list by a horizontal divider
2. THE Sidebar_Filter SHALL render the "Conflicts only" label and its count badge in amber (#EF9F27) text
3. WHEN the user activates the "Conflicts only" shortcut, THE Allocation_Table SHALL display only rows where a card has allocation conflicts (multiple originals)
4. WHEN the "Conflicts only" shortcut is active, THE Sidebar_Filter SHALL highlight the option with a teal right-border accent
5. THE Sidebar_Filter SHALL display the total conflict count next to the "Conflicts only" label

### Requirement 4: Deck Column Header Truncation

**User Story:** As a collection owner viewing the allocation table, I want deck column headers to be readable without consuming excessive horizontal space, so that I can see all deck columns without horizontal scrolling.

#### Acceptance Criteria

1. THE Deck_Column_Header SHALL truncate deck names to a maximum of 8 characters, appending an ellipsis character when truncation occurs
2. WHEN the user hovers over a truncated Deck_Column_Header, THE Deck_Column_Header SHALL display a tooltip containing the full deck name
3. THE Deck_Column_Header tooltip SHALL appear within 300ms of hover and dismiss when the cursor leaves the header cell

### Requirement 5: Table Pagination

**User Story:** As a collection owner, I want the allocation table to paginate at 100 rows per page, so that the table remains performant and navigable with large collections.

#### Acceptance Criteria

1. THE Allocation_Table SHALL display a maximum of 100 card rows per page
2. THE Table_Footer SHALL display the text "Showing [N] of [Total] cards" where N is the count of rows on the current page and Total is the total filtered card count
3. THE Table_Footer SHALL display conflict and proxy counts in the format "[N] conflicts · [N] proxies"
4. WHEN the total filtered card count exceeds 100, THE Table_Footer SHALL render page navigation controls with previous/next arrows and numbered page buttons
5. WHEN the user changes the active sidebar filter, THE Allocation_Table SHALL reset to page 1

### Requirement 6: Table Legend

**User Story:** As a collection owner, I want a visual legend below the table explaining the cell symbols, so that I can understand the meaning of O, P, and warning indicators without consulting documentation.

#### Acceptance Criteria

1. THE Table_Legend SHALL render below the Table_Footer as a horizontal bar with three legend entries
2. THE Table_Legend SHALL display: a teal square with "O" labelled "Original in this deck", an amber square with "P" labelled "Proxy in this deck", and a warning triangle icon labelled "Allocation conflict"
3. THE Table_Legend SHALL use 18×18px rounded (4px border-radius) filled squares for the O and P indicators matching the table cell styling

### Requirement 7: Status Column Badges

**User Story:** As a collection owner, I want to see a contextual status badge for each card row, so that I can quickly understand each card's ownership disposition.

#### Acceptance Criteria

1. THE Allocation_Table SHALL include a "Status" column after all deck columns
2. WHEN a card is an original in exactly one deck and has no proxies, THE Status_Badge SHALL display "● Original" in teal styling
3. WHEN a card is a proxy in the currently filtered deck, THE Status_Badge SHALL display "◐ Proxy" in amber styling
4. WHEN a card has one original and one or more proxies across decks (conflict), THE Status_Badge SHALL display "◐ 1 orig · N proxy" in amber conflict styling
5. WHEN a card has multiple owned copies (basics or duplicates), THE Status_Badge SHALL display "● Multiple copies" in teal styling
6. WHEN a card is not in any deck, THE Status_Badge SHALL display "● Not in a deck" in muted styling

### Requirement 8: Toolbar Filter Chips

**User Story:** As a collection owner, I want toolbar filter chips for conflicts, proxies, and unallocated cards, so that I can quickly narrow the table view without using the sidebar.

#### Acceptance Criteria

1. THE Toolbar SHALL render above the Allocation_Table containing: a search input, a Conflicts chip, a Proxies chip, a "Not in deck" chip, and a Table/Grid view toggle
2. THE Toolbar SHALL style the Conflicts chip with amber (#EF9F27) colouring and a warning icon prefix
3. THE Toolbar SHALL style the Proxies chip with teal (#1D9E75) colouring and a half-circle icon prefix
4. WHEN the user activates a Toolbar filter chip, THE Allocation_Table SHALL display only rows matching that filter criterion
5. WHEN a Toolbar filter chip is active, THE Toolbar SHALL render that chip in its active (filled) state; inactive chips SHALL render in their outlined (default) state
6. WHEN a Toolbar filter chip is active simultaneously with a sidebar filter, THE Allocation_Table SHALL apply both filters as an intersection (AND logic)

### Requirement 9: Conflict Row Styling

**User Story:** As a collection owner, I want conflict rows to be visually distinct, so that I can immediately identify cards requiring ownership resolution.

#### Acceptance Criteria

1. WHEN a card row has an allocation conflict, THE Allocation_Table SHALL render that row with a background colour of rgba(239,159,39,0.03)
2. WHEN a card row has an allocation conflict, THE Allocation_Table SHALL display a warning triangle icon to the left of the card name in amber (#EF9F27) colouring
3. WHEN a card row has an allocation conflict or is a proxy row, THE Allocation_Table SHALL display the Reassign_Button on that row
4. WHEN a card row has no conflict and no proxy status, THE Allocation_Table SHALL render the row with a normal background and no Reassign_Button

### Requirement 10: Reassign Inline Dropdown

**User Story:** As a collection owner, I want to reassign card ownership via an inline dropdown on conflict and proxy rows, so that I can resolve allocation issues without leaving the table view.

#### Acceptance Criteria

1. THE Reassign_Button SHALL render as a small muted button that becomes visible on row hover for proxy and conflict rows
2. WHEN the user activates the Reassign_Button, THE Allocation_Tab SHALL display an inline dropdown listing all decks that contain the card
3. WHEN the user selects a deck from the dropdown, THE Allocation_Tab SHALL call the POST /api/allocation/reassign endpoint with the card name and target deck ID
4. WHEN the reassign API responds successfully, THE Allocation_Tab SHALL update the affected table row in place to reflect the new ownership state without a full page reload
5. WHEN the reassign API responds successfully, THE Allocation_Tab SHALL trigger the Allocation_Resolver to recalculate related ownership states
6. IF the reassign API returns an error, THEN THE Allocation_Tab SHALL display a toast notification describing the failure and leave the row unchanged
