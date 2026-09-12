# Requirements Document

## Introduction

Reformat the collection page to display individual printings as separate rows rather than rolling up all printings of the same card name into a single row. This mirrors the collection view style used by Archidekt and Moxfield, where each unique combination of card name, set/printing, and finish is its own line item. Each row displays quantity, card name, printing (set), finish (foil/non-foil), a "Used By" count showing deck allocations with hover details, and the current Card Kingdom price.

## Glossary

- **Collection_View**: The main table/list component on the collection page that displays the user's owned cards
- **Printing_Row**: A single row in the Collection_View representing one unique combination of card name, set code, and finish
- **Finish**: The physical treatment of a card — either "Normal" or "Foil"
- **Used_By_Count**: The number of decks that reference a specific Printing_Row via deck allocations
- **Overallocation_Indicator**: A visual amber highlight applied to the Used_By_Count when the number of deck allocations exceeds the owned quantity for that Printing_Row
- **Hover_Tooltip**: A popover element that appears on hover over the Used_By_Count, listing the deck names using that printing
- **Card_Kingdom_Price**: The retail price for a specific printing, sourced from the card_kingdom_prices table keyed by scryfall_printing_id

## Requirements

### Requirement 1: Individual Printing Rows

**User Story:** As a collector, I want each unique printing displayed as its own row, so that I can see exactly which sets and finishes I own without expanding grouped entries.

#### Acceptance Criteria

1. THE Collection_View SHALL display one Printing_Row per unique combination of card name, scryfall_printing_id, and finish, where multiple owned copies of the same combination appear as a single row with a summed quantity
2. THE Collection_View SHALL NOT aggregate multiple printings of the same card name into a single row
3. WHEN the collection data loads, THE Collection_View SHALL render Printing_Rows in a flat list without requiring user interaction to expand or drill down grouped entries, while pagination across the full list is permitted
4. IF a collection entry has no scryfall_printing_id, THEN THE Collection_View SHALL still display a Printing_Row for that entry using the card name and finish, and SHALL leave printing-dependent fields (such as Price) unpopulated

### Requirement 2: Row Column Structure

**User Story:** As a collector, I want each row to show quantity, name, printing, finish, usage, and price at a glance, so that I can assess my collection without clicking into individual cards.

#### Acceptance Criteria

1. THE Printing_Row SHALL display columns in the following left-to-right order: Quantity, Name, Printing, Finish, Used_By_Count, Price
2. THE Printing_Row SHALL display a Quantity column showing the owned count as an integer for that specific printing and finish
3. THE Printing_Row SHALL display a Name column showing the card name, truncated with an ellipsis if it exceeds 40 characters
4. THE Printing_Row SHALL display a Printing column showing the set name, with the three-letter set code displayed as a secondary label
5. THE Printing_Row SHALL display a Finish column indicating whether the card is Normal or Foil
6. THE Printing_Row SHALL display a Used_By_Count column showing the number of decks that reference this printing as an integer
7. THE Printing_Row SHALL display a Price column showing the Card_Kingdom_Price for that specific printing and finish

### Requirement 3: Used By Hover Tooltip

**User Story:** As a collector, I want to hover over the "Used By" count to see which decks are using a printing, so that I can quickly assess allocation without navigating away.

#### Acceptance Criteria

1. WHEN the user hovers over the Used_By_Count for at least 300 milliseconds, THE Collection_View SHALL display a Hover_Tooltip listing the names of all decks using that Printing_Row sorted alphabetically in ascending order
2. WHEN the user moves the cursor away from the Used_By_Count, THE Collection_View SHALL hide the Hover_Tooltip within 100 milliseconds
3. THE Hover_Tooltip SHALL display each deck name on its own line, up to a maximum of 20 deck names, with a trailing indicator showing the remaining count if more than 20 decks reference the Printing_Row
4. IF no decks are using the Printing_Row, THEN THE Collection_View SHALL display "0" for the Used_By_Count and shall not show a Hover_Tooltip on hover

### Requirement 4: Overallocation Visual Indicator

**User Story:** As a collector, I want to see at a glance when a printing is allocated to more decks than I physically own, so that I know where I have proxy dependencies.

#### Acceptance Criteria

1. WHILE the Used_By_Count exceeds the Quantity for a Printing_Row, THE Collection_View SHALL render the Used_By_Count text in amber colour and apply a supplementary non-colour indicator (such as a warning icon or bold weight) so the overallocation state is distinguishable without relying on colour alone
2. WHILE the Used_By_Count is less than or equal to the Quantity for a Printing_Row, THE Collection_View SHALL render the Used_By_Count text in the default body-text colour with no supplementary indicator
3. WHEN allocation data changes (a deck adds or removes a reference to a Printing_Row), THE Collection_View SHALL update the Overallocation_Indicator for the affected Printing_Row within 2 seconds without requiring a full page reload
4. IF the Used_By_Count transitions from exceeding the Quantity to being less than or equal to the Quantity, THEN THE Collection_View SHALL remove the amber colour and supplementary indicator and revert to the default style

### Requirement 5: Pricing Display

**User Story:** As a collector, I want to see the Card Kingdom retail price for each specific printing, so that I can assess the value of my collection at the printing level.

#### Acceptance Criteria

1. THE Printing_Row SHALL display the Card_Kingdom_Price corresponding to the printing's scryfall_printing_id and foil status
2. IF no price data exists in the card_kingdom_prices table for a Printing_Row's scryfall_printing_id and foil status, THEN THE Collection_View SHALL display an em dash "—" in the Price column
3. THE Collection_View SHALL format prices in USD with two decimal places and a leading dollar sign, using a comma as the thousands separator for values at or above $1,000 (e.g., "$1.25", "$1,299.99")
4. IF the Card_Kingdom_Price for a Printing_Row is $0.00, THEN THE Collection_View SHALL display "$0.00" in the Price column

### Requirement 6: Sorting Support

**User Story:** As a collector, I want to sort the printing-level rows by any column, so that I can organize my view by name, set, price, or usage.

#### Acceptance Criteria

1. THE Collection_View SHALL support sorting Printing_Rows by Name in case-insensitive alphabetical ascending and descending order
2. THE Collection_View SHALL support sorting Printing_Rows by Quantity in numeric ascending and descending order
3. THE Collection_View SHALL support sorting Printing_Rows by Printing (set code) in alphabetical ascending and descending order
4. THE Collection_View SHALL support sorting Printing_Rows by Price in numeric ascending and descending order, with Printing_Rows that have no price data sorted last regardless of sort direction
5. WHEN the user activates a column header, THE Collection_View SHALL sort the Printing_Rows by that column in ascending order on the first activation, toggle to descending order on the second consecutive activation of the same column, and re-order the rows without a full page reload
6. THE Collection_View SHALL display a visual indicator on the active column header showing the current sort column and direction (ascending or descending)
7. WHEN the Collection_View first loads, THE Collection_View SHALL sort Printing_Rows by Name in ascending alphabetical order

### Requirement 7: Search and Filter Compatibility

**User Story:** As a collector, I want existing search and colour identity filters to work with the new printing-level view, so that I can narrow down results the same way I do today.

#### Acceptance Criteria

1. WHEN the user enters a search query of at least 1 character, THE Collection_View SHALL filter Printing_Rows to those whose card name contains the query string as a case-insensitive substring match
2. WHEN the user selects one or more colour identity filters, THE Collection_View SHALL filter Printing_Rows using the active matching mode: "exact" mode retains only rows whose colour identity equals the selected set exactly, and "includes" mode retains rows whose colour identity contains at least all of the selected colours
3. THE Collection_View SHALL apply search, colour identity, and status filters simultaneously using AND logic, displaying only Printing_Rows that satisfy every active filter
4. IF the combination of active filters matches zero Printing_Rows, THEN THE Collection_View SHALL display an empty state indicating no results match the current filters
5. WHEN the user clears a filter, THE Collection_View SHALL immediately re-evaluate the remaining active filters and update the displayed Printing_Rows without a full page reload
