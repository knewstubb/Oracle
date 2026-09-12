# Requirements Document

## Introduction

This spec extends the existing Upgrade Tab (covered structurally by `ui-overhaul` Requirement 6) with detailed UX behaviour for debrief integration, recommendation sourcing, conflict handling, change logging, and fresh analysis generation. The Upgrade Tab becomes the primary surface for reviewing, actioning, and tracking deck upgrade recommendations — whether those recommendations originate from a post-game debrief session or a standalone analysis run.

The feature builds on the existing `UpgradeTab.tsx` component, the Oracle Upgrade Engine (compute scripts and API), the Debrief Mode session data, and the Proxy Ownership Layer for conflict detection. Change log entries auto-write to Notion without user intervention.

## Glossary

- **Upgrade_Tab**: The React component at the "Upgrade" tab position on the deck detail page, rendering debrief banner, toolbar, candidate list, fresh analysis prompt, and change log
- **Debrief_Banner**: The top section of the Upgrade_Tab displaying the most recent debrief session summary, review progress, and a resume navigation action
- **Debrief_Session**: A record of a post-game debrief conversation containing recommended fixes, their review status (applied, skipped, pending), and the session timestamp
- **Source_Badge**: A pill-shaped label on each upgrade candidate indicating whether the recommendation originated from a debrief session ("From debrief") or from standalone analysis ("Analysis")
- **Upgrade_Candidate**: A single cut/add card pair recommendation displayed in the candidate list, with priority, impact score, source, reasons, ownership status, and actions
- **Conflict_Alert**: An inline warning rendered below an upgrade candidate when the "add" card is already allocated as an original in another deck, indicating a proxy conflict
- **Change_Log**: A chronological list of previously actioned and skipped upgrade recommendations, rendered at the bottom of the Upgrade_Tab
- **Fresh_Analysis_Prompt**: A dashed-border call-to-action section below the candidate list that triggers a new full model analysis run
- **Notion_Sync**: The automatic background write of change log entries to the user's Notion Commander Decks database without requiring manual user action
- **Impact_Bar**: A horizontal progress bar (0–100) indicating the estimated impact of an upgrade candidate on the deck's performance
- **Sort_Mode**: One of four ordering strategies for the candidate list: Impact (default), Cheapest, Owned, or EDHREC percentage

## Requirements

### Requirement 1: Debrief Banner Display

**User Story:** As a deck owner, I want to see a summary of my last debrief session at the top of the Upgrade Tab, so that I have context on pending fixes and can resume the conversation.

#### Acceptance Criteria

1. WHEN a Debrief_Session record exists for the current deck, THE Upgrade_Tab SHALL display the Debrief_Banner at the top of the tab content
2. THE Debrief_Banner SHALL display the session date, the count of reviewed fixes out of total fixes, and a summary row showing applied count, skipped count, and pending count
3. WHEN the Debrief_Session has pending fixes remaining (reviewed_fixes < total_fixes), THE Debrief_Banner SHALL display a "Resume debrief" button that navigates to OracleChat with the session restored
4. WHEN all fixes in the Debrief_Session have been reviewed (reviewed_fixes = total_fixes), THE Debrief_Banner SHALL display the summary without the "Resume debrief" button
5. IF no Debrief_Session record exists for the current deck, THEN THE Upgrade_Tab SHALL NOT render the Debrief_Banner
6. THE Debrief_Banner SHALL display applied changes as pill-shaped tokens showing the "from → to" card names
7. THE Debrief_Banner SHALL display skipped changes in muted styling with the "Skipped:" prefix and the from/to card names

### Requirement 2: Debrief Banner Styling

**User Story:** As a deck owner, I want the debrief banner to be visually distinct from the rest of the tab, so that I can immediately identify debrief context.

#### Acceptance Criteria

1. THE Debrief_Banner SHALL render with background colour rgba(29,158,117,0.05) and border 0.5px solid rgba(29,158,117,0.2)
2. THE Debrief_Banner SHALL display a sword icon in teal (#1D9E75) preceding the "Last debrief" label
3. THE "Resume debrief" button SHALL render as a ghost button with teal text (#1D9E75) and a right-arrow icon
4. THE applied change pills SHALL render with background rgba(29,158,117,0.1) and teal text (#1D9E75)
5. THE skipped change text SHALL render in muted foreground colour at reduced opacity

### Requirement 3: Toolbar Sort and Filter Controls

**User Story:** As a deck owner, I want to sort and filter upgrade candidates by different criteria, so that I can find the most relevant recommendations for my current needs.

#### Acceptance Criteria

1. THE Upgrade_Tab toolbar SHALL display a segmented control with four Sort_Mode options: Impact, Cheapest, Owned, and EDHREC
2. THE toolbar SHALL default the active Sort_Mode to Impact on initial render
3. WHEN the user activates a Sort_Mode option, THE candidate list SHALL re-sort according to the selected mode without requiring an API call
4. THE toolbar SHALL display toggleable filter chips: "Owned only" and "Under $5"
5. WHEN a filter chip is active, THE chip SHALL render with teal styling (background rgba(29,158,117,0.15), border 0.5px solid rgba(29,158,117,0.4), teal text)
6. WHEN a filter chip is inactive, THE chip SHALL render with neutral styling (background rgba(255,255,255,0.04), border 0.5px solid rgba(255,255,255,0.1), muted text)
7. WHEN the "Owned only" filter is active, THE candidate list SHALL show only candidates where the "add" card has ownership_status of "original" or "proxy"
8. WHEN the "Under $5" filter is active, THE candidate list SHALL show only candidates where the "add" card price is below $5.00

### Requirement 4: Refresh Analysis Button

**User Story:** As a deck owner, I want to trigger a fresh analysis from the toolbar, so that I can get updated recommendations after making deck changes.

#### Acceptance Criteria

1. THE toolbar SHALL display a "Refresh analysis" button right-aligned with muted styling and a refresh icon
2. WHEN the user activates the "Refresh analysis" button, THE Upgrade_Tab SHALL initiate a POST request to `/api/decks/[id]/upgrade/refresh`
3. WHILE the refresh request is in progress, THE refresh button SHALL display a spinning icon and be disabled
4. WHEN the refresh request succeeds, THE Upgrade_Tab SHALL invalidate the upgrade query cache and display a success toast notification
5. IF the refresh request fails, THEN THE Upgrade_Tab SHALL display an error toast notification and re-enable the button

### Requirement 5: Source Badges on Candidates

**User Story:** As a deck owner, I want to see where each upgrade recommendation came from, so that I can distinguish debrief-sourced suggestions from automated analysis.

#### Acceptance Criteria

1. WHEN an Upgrade_Candidate has source "debrief", THE candidate card SHALL display a Source_Badge reading "From debrief" with a sword icon, teal text (#1D9E75), and border 0.5px solid rgba(29,158,117,0.4)
2. WHEN an Upgrade_Candidate has source "analysis", THE candidate card SHALL display a Source_Badge reading "Analysis" with muted text (rgba(255,255,255,0.5)) and border 0.5px solid rgba(255,255,255,0.1)
3. THE Source_Badge SHALL render right-aligned in the candidate card header row, after the impact bar

### Requirement 6: Debrief-Sourced Card Priority

**User Story:** As a deck owner, I want debrief-sourced recommendations to always appear first in the list, so that the suggestions my debrief conversation surfaced take priority.

#### Acceptance Criteria

1. THE Upgrade_Tab SHALL partition candidates into two groups: debrief-sourced and analysis-sourced
2. THE Upgrade_Tab SHALL render all debrief-sourced candidates before all analysis-sourced candidates regardless of the active Sort_Mode
3. WITHIN each partition (debrief and analysis), THE Upgrade_Tab SHALL apply the active Sort_Mode ordering
4. WHEN filter chips reduce the visible candidates, THE debrief-first partitioning rule SHALL still apply to the filtered results

### Requirement 7: Upgrade Candidate Card Layout

**User Story:** As a deck owner, I want each upgrade recommendation displayed as a clear cut/add pair with supporting context, so that I can evaluate the trade-off at a glance.

#### Acceptance Criteria

1. THE Upgrade_Candidate card SHALL display a header row containing: priority number, Impact_Bar, and Source_Badge
2. THE Upgrade_Candidate card SHALL display a two-column layout: "Cut" on the left and "Add" on the right, separated by a vertical divider (0.5px solid rgba(255,255,255,0.05))
3. THE "Cut" column SHALL display: a red minus icon with "CUT" label (#E24B4A), card name (13px/500 weight), reason text framed in win-condition terms, and OwnershipBadge
4. THE "Add" column SHALL display: a teal plus icon with "ADD" label (#1D9E75), card name (13px/500 weight), reason text framed in win-condition terms, OwnershipBadge, EDHREC percentage, and price
5. THE reason text for both cut and add cards SHALL be framed in win-condition terms and SHALL NOT reference mana curve or synergy score alone as justification
6. THE Upgrade_Candidate card SHALL render with border 0.5px solid rgba(255,255,255,0.08) by default
7. WHEN an Upgrade_Candidate has source "debrief", THE candidate card SHALL render with a teal left accent border (0.5px solid rgba(29,158,117,0.2))

### Requirement 8: Upgrade Candidate Actions

**User Story:** As a deck owner, I want to take action on each recommendation directly from the card, so that I can apply changes, skip them, or discuss them further.

#### Acceptance Criteria

1. THE Upgrade_Candidate card SHALL display an action row with three buttons: "Make change" (primary, teal), "Skip" (secondary, neutral), and "Discuss in debrief" (tertiary, small, right-aligned)
2. WHEN the user activates "Make change", THE Upgrade_Tab SHALL POST to `/api/decks/[id]/upgrade/apply` with the cut and add card names and invalidate the upgrade and deck query caches
3. WHEN the user activates "Skip", THE Upgrade_Tab SHALL POST to `/api/decks/[id]/upgrade/skip` with the cut and add card names and invalidate the upgrade query cache
4. WHILE a mutation is in progress, THE "Make change" and "Skip" buttons SHALL be disabled
5. WHEN the user activates "Discuss in debrief", THE Upgrade_Tab SHALL navigate to OracleChat pre-loaded with the upgrade candidate's add card as the conversation topic
6. WHEN "Make change" succeeds, THE Upgrade_Tab SHALL display a success toast and remove the candidate from the visible list
7. WHEN "Skip" succeeds, THE Upgrade_Tab SHALL display a confirmation toast and remove the candidate from the visible list

### Requirement 9: Inline Conflict Alert

**User Story:** As a deck owner, I want to be warned inline when adding a card would create a proxy conflict in another deck, so that I can make an informed decision before committing.

#### Acceptance Criteria

1. WHEN an Upgrade_Candidate's "add" card is allocated as an original in another deck, THE Upgrade_Tab SHALL render a Conflict_Alert inline below the candidate's cut/add columns
2. THE Conflict_Alert SHALL display a warning icon, the text "Adding [Card] here would proxy it out of [Deck]. That deck holds the original.", and two action buttons
3. THE Conflict_Alert SHALL display an "Action anyway" button (secondary styling) and a "Cancel" button (primary styling)
4. THE Conflict_Alert SHALL NOT render as a modal or dialog — the alert is inline within the candidate card
5. IF no proxy conflict exists for the Upgrade_Candidate's "add" card, THEN THE Conflict_Alert SHALL NOT render

### Requirement 10: Fresh Analysis Prompt Section

**User Story:** As a deck owner, I want a visible prompt to run a fresh analysis after significant deck changes, so that I can generate new suggestions when the existing ones are stale.

#### Acceptance Criteria

1. THE Fresh_Analysis_Prompt SHALL render below the upgrade candidate list
2. THE Fresh_Analysis_Prompt SHALL display a sparkles icon, heading text "Run a fresh analysis", description text "Generates new suggestions from scratch — useful after significant deck changes.", and a "Run analysis" button
3. THE Fresh_Analysis_Prompt SHALL render with a dashed border (1px dashed rgba(255,255,255,0.12)), muted background (rgba(255,255,255,0.02)), and centre-aligned content
4. WHEN the user activates "Run analysis", THE Fresh_Analysis_Prompt SHALL trigger the same refresh mutation as the toolbar "Refresh analysis" button
5. WHILE the analysis is running, THE "Run analysis" button SHALL display a spinning icon and be disabled

### Requirement 11: Change Log Display

**User Story:** As a deck owner, I want to see a history of changes I've made and skipped through the Upgrade Tab, so that I can track my deck's evolution over time.

#### Acceptance Criteria

1. THE Change_Log section SHALL render below the Fresh_Analysis_Prompt
2. THE Change_Log SHALL display a heading "Change log" with a count of changes made in the current calendar month
3. WHEN a change was applied, THE Change_Log entry SHALL display a filled teal dot (#1D9E75), the text "Cut [card] → Added [card]", the date, and a one-line reason
4. WHEN a change was skipped, THE Change_Log entry SHALL display an empty/muted dot (rgba(255,255,255,0.15)), the text "Skipped: [card] → [card]" in muted styling, and the date
5. THE Change_Log SHALL sort entries in reverse chronological order (most recent first)
6. IF no change log entries exist for the deck, THEN THE Change_Log section SHALL NOT render

### Requirement 12: Notion Auto-Write for Change Log

**User Story:** As a deck owner, I want change log entries to sync automatically to my Notion deck page, so that my deck documentation stays current without manual effort.

#### Acceptance Criteria

1. WHEN the user applies a change via "Make change", THE system SHALL write a change log entry to the deck's Notion page in the background
2. WHEN the user skips a change via "Skip", THE system SHALL write a skipped entry to the deck's Notion page in the background
3. THE Notion auto-write SHALL execute asynchronously without blocking the UI response to the user
4. IF the Notion write fails, THEN THE system SHALL log the failure to the server console and SHALL NOT display an error to the user
5. THE Notion entry SHALL include: the cut card name, the add card name, the action taken (applied or skipped), the reason, and the date

### Requirement 13: Data Fetching and Caching

**User Story:** As a deck owner, I want the Upgrade Tab to load efficiently and reflect recent changes, so that I see current data without unnecessary network requests.

#### Acceptance Criteria

1. THE Upgrade_Tab SHALL fetch debrief session data using `useQuery` with key `['decks', deckId, 'debrief-session']` and `staleTime: 5 * 60 * 1000`
2. THE Upgrade_Tab SHALL fetch upgrade data using `useQuery` with key `['decks', deckId, 'upgrade']` and `staleTime: 5 * 60 * 1000`
3. WHEN a mutation succeeds (apply, skip, or refresh), THE Upgrade_Tab SHALL invalidate the appropriate query keys so the UI reflects the updated state
4. THE Upgrade_Tab SHALL display skeleton loading states while data is being fetched
5. WHEN the debrief session fetch fails or returns no data, THE Upgrade_Tab SHALL gracefully hide the Debrief_Banner without affecting other sections
