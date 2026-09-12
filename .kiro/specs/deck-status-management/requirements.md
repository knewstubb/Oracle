# Requirements Document

## Introduction

Deck Status Management enables the user to control which decks are considered "active" for the purposes of card allocation. Currently, the allocation resolver (`buildAllocationInput`) counts ALL `deck_cards` rows toward demand regardless of deck status, meaning draft/concept decks that are still being brewed consume physical card assignments and inflate the proxy report. This feature introduces a clear lifecycle for decks (active → draft → inactive) and ensures only active decks participate in allocation calculations. It also provides UI controls to transition deck status and visual indicators on the deck list.

## Glossary

- **Deck_Status_Manager**: The system responsible for managing deck status transitions and enforcing status-based business rules
- **Allocation_Resolver**: The system (`allocation-store.ts` + `allocation-resolver.ts`) that computes which physical cards are assigned to which decks
- **Deck_List_Page**: The UI page that displays all decks with filtering and status indicators
- **Deck_Detail_Page**: The UI page for viewing/editing a single deck's details
- **Active_Deck**: A deck with status 'active' — participates in allocation calculations
- **Draft_Deck**: A deck with status 'draft' — under construction, does not participate in allocation
- **Inactive_Deck**: A deck with status 'inactive' — shelved, does not participate in allocation
- **Allocation_Tab**: The shared cards view at `/api/allocation?view=shared` showing cards used across multiple active decks

## Requirements

### Requirement 1: Schema Migration for Status Values

**User Story:** As a developer, I want the deck status CHECK constraint updated to reflect the actual lifecycle states, so that the database enforces valid status transitions.

#### Acceptance Criteria

1. THE Deck_Status_Manager SHALL support exactly three status values: 'active', 'draft', and 'inactive'
2. WHEN the migration runs, THE Deck_Status_Manager SHALL alter the `decks` table CHECK constraint from `status IN ('active', 'draft', 'concept')` to `status IN ('active', 'draft', 'inactive')`
3. WHEN the migration runs, THE Deck_Status_Manager SHALL update any existing rows with status 'concept' to status 'draft'
4. THE Deck_Status_Manager SHALL preserve the default value of 'active' for the status column

### Requirement 2: Deck Status Transition API

**User Story:** As a user, I want to change a deck's status through an API endpoint, so that I can control which decks are actively consuming my card allocation.

#### Acceptance Criteria

1. WHEN a PATCH request is received at `/api/decks/[id]/status` with a valid status value, THE Deck_Status_Manager SHALL update the deck's status column to the new value
2. WHEN a PATCH request is received with an invalid status value, THE Deck_Status_Manager SHALL return a 400 response with a descriptive error message
3. WHEN a PATCH request is received for a deck that does not exist, THE Deck_Status_Manager SHALL return a 404 response
4. WHEN a PATCH request is received from an unauthenticated user, THE Deck_Status_Manager SHALL return a 401 response
5. THE Deck_Status_Manager SHALL allow transitions between any two status values without restriction

### Requirement 3: Allocation Resolver Filters by Deck Status

**User Story:** As a user, I want only my active decks to count toward card allocation demand, so that draft and inactive decks do not inflate my proxy report or claim physical card assignments.

#### Acceptance Criteria

1. WHEN building the demand map, THE Allocation_Resolver SHALL include only `deck_cards` rows where the associated deck has status 'active'
2. WHILE a deck has status 'draft', THE Allocation_Resolver SHALL exclude all cards in that deck from the demand map
3. WHILE a deck has status 'inactive', THE Allocation_Resolver SHALL exclude all cards in that deck from the demand map
4. WHEN the allocation resolver runs, THE Allocation_Resolver SHALL join `deck_cards` with `decks` to filter by status before computing allocations

### Requirement 4: Allocation Release on Deactivation

**User Story:** As a user, I want my card allocations released when I deactivate a deck, so that those physical cards become available for other active decks.

#### Acceptance Criteria

1. WHEN a deck transitions from 'active' to 'inactive', THE Deck_Status_Manager SHALL delete all `deck_allocations` rows for that deck
2. WHEN a deck transitions from 'active' to 'draft', THE Deck_Status_Manager SHALL delete all `deck_allocations` rows for that deck
3. WHEN allocations are released for a deck, THE Deck_Status_Manager SHALL trigger a re-run of the Allocation_Resolver to redistribute freed physical copies to remaining active decks
4. WHEN a deck transitions from 'draft' to 'active' or from 'inactive' to 'active', THE Deck_Status_Manager SHALL trigger a re-run of the Allocation_Resolver to incorporate the newly active deck's demand

### Requirement 5: Allocation Tab Respects Deck Status

**User Story:** As a user, I want the Allocation tab to only show cards shared across my active decks, so that I get an accurate picture of my proxy needs.

#### Acceptance Criteria

1. WHEN the `/api/allocation?view=shared` endpoint is called, THE Allocation_Tab SHALL return only cards that appear in two or more active decks
2. WHILE a deck has status 'draft' or 'inactive', THE Allocation_Tab SHALL exclude that deck's cards from the shared cards calculation
3. WHEN the `?deckId=X` filter is applied alongside `?view=shared`, THE Allocation_Tab SHALL only include deck X in results if deck X has status 'active'
4. IF deck X referenced by `?deckId=X` has a non-active status, THEN THE Allocation_Tab SHALL return an empty result set with a message indicating the deck is not active

### Requirement 6: Deck List Status Display

**User Story:** As a user, I want to see each deck's status on the deck list page, so that I can quickly identify which decks are active, in draft, or inactive.

#### Acceptance Criteria

1. THE Deck_List_Page SHALL display a status badge next to each deck name indicating its current status
2. THE Deck_List_Page SHALL use visually distinct styles for each status: 'active' (green), 'draft' (amber/yellow), 'inactive' (grey)
3. THE Deck_List_Page SHALL provide a status filter control allowing the user to filter decks by one or more status values
4. WHEN no status filter is applied, THE Deck_List_Page SHALL display all decks regardless of status
5. THE Deck_List_Page SHALL persist the selected status filter in the URL query parameters

### Requirement 7: Deck Status Control on Deck Detail Page

**User Story:** As a user, I want to change a deck's status from the deck detail page, so that I can manage deck lifecycle without navigating away.

#### Acceptance Criteria

1. THE Deck_Detail_Page SHALL display the current deck status with a dropdown or segmented control allowing status changes
2. WHEN the user selects a new status, THE Deck_Detail_Page SHALL call the status transition API and update the displayed status on success
3. WHEN a status transition to 'inactive' is selected, THE Deck_Detail_Page SHALL display a confirmation prompt warning that allocations will be released
4. IF the status transition API returns an error, THEN THE Deck_Detail_Page SHALL display the error message and revert the control to the previous status value

### Requirement 8: Brew Session Integration

**User Story:** As a user, I want decks created by the brew session system to start in 'draft' status, so that they do not claim allocations until I explicitly activate them.

#### Acceptance Criteria

1. WHEN a new deck is created by the brew session system, THE Deck_Status_Manager SHALL set the initial status to 'draft'
2. WHEN a user promotes a brewed deck to active, THE Deck_Status_Manager SHALL transition the deck status from 'draft' to 'active' and trigger allocation
