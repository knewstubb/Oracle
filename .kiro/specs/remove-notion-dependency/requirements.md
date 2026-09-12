# Requirements Document

## Introduction

This feature removes the Notion third-party dependency from The Oracle by giving deck documentation a native home in the local SQLite database. Notion is currently a single-user, external service dependency — if Oracle is ever used by anyone other than the current owner, requiring a personal Notion account is a hard blocker. The migration involves creating new database tables for narrative content (strategy, synergy lines, matchup notes, etc.) and free-text notes, backfilling existing content from Notion, redirecting all write targets from Notion to the local DB, surfacing content in the Strategy tab UI, and fully removing all Notion integration code, routes, and configuration.

## Glossary

- **Documentation_Store**: The `deck_documentation` table storing narrative content (strategy, synergy lines, strengths/weaknesses, matchup notes, mulligan guide) keyed by deck ID.
- **Notes_Store**: The `deck_notes` table storing append-only free-text notes associated with a deck.
- **Strategy_Tab**: The existing UI tab on the deck detail page that will surface documentation and notes content.
- **Notion_Integration**: The collection of modules (`notion-sync.ts`), API routes (`/api/notion/*`), database table (`notion_deck_map`), environment variables (`NOTION_*`), and client interfaces that currently sync deck data to Notion.
- **Backfill_Script**: A one-time migration utility that reads current content from Notion pages and writes it into the Documentation_Store and Notes_Store before removal.
- **AI_Generation_Logic**: The existing AI-driven content generation pipelines (debrief actions, upgrade apply/skip) that currently write results to Notion via `appendNotionNotes`.
- **Decision_Log**: The `brew_sessions.decision_log_json` field that already stores decision history natively in the database.

## Requirements

### Requirement 1: Native Documentation Storage

**User Story:** As a deck owner, I want my deck's narrative documentation stored locally in the database, so that I can access strategy content without any third-party service dependency.

#### Acceptance Criteria

1. WHEN the database is initialized, THE Documentation_Store SHALL create a table with columns strategy_playstyle (TEXT, NULL), synergy_lines (TEXT, NULL), strengths_weaknesses (TEXT, NULL), matchup_notes (TEXT, NULL), and mulligan_guide (TEXT, NULL), keyed by deck_id as INTEGER PRIMARY KEY with a FOREIGN KEY referencing decks(id) ON DELETE CASCADE.
2. WHEN a deck is deleted from the decks table, THE Documentation_Store row with the matching deck_id SHALL be automatically removed via the CASCADE foreign key constraint.
3. THE Documentation_Store SHALL store an updated_at column (DATETIME) that defaults to CURRENT_TIMESTAMP on insert and is set to CURRENT_TIMESTAMP on every UPDATE to any column in the row.
4. IF the synergy_lines column is written with a non-NULL value, THEN THE Documentation_Store SHALL only accept a value that is a valid JSON array (parseable by json_valid() returning 1).
5. IF a query is made for a deck_id that has no corresponding Documentation_Store row, THEN THE system SHALL return NULL or an empty result set rather than raising an error, allowing documentation to be created on first write.

### Requirement 2: Native Notes Storage

**User Story:** As a deck owner, I want my free-text coaching notes stored locally, so that notes appended during debrief and upgrade sessions persist without Notion.

#### Acceptance Criteria

1. WHEN the database is initialized, THE Notes_Store SHALL contain an auto-incrementing id, a deck_id foreign key with CASCADE delete, a content TEXT column (NOT NULL), and a created_at timestamp defaulting to CURRENT_TIMESTAMP.
2. WHEN a note is appended with content containing at least one non-whitespace character and a valid deck_id, THE Notes_Store SHALL insert a new row without modifying or replacing existing notes (append-only behavior).
3. IF a note is appended with empty or whitespace-only content, THEN THE Notes_Store SHALL reject the insert and return an error indicating that content must not be blank.
4. IF a note is appended referencing a deck_id that does not exist in the decks table, THEN THE Notes_Store SHALL reject the insert and return a foreign-key constraint error.
5. WHEN a deck is deleted, THE Notes_Store SHALL automatically remove all associated note rows via CASCADE.
6. WHEN notes are retrieved for a given deck_id, THE Notes_Store SHALL return them ordered by created_at descending (newest first).
7. THE Notes_Store SHALL maintain an index on deck_id for efficient retrieval of notes by deck.

### Requirement 3: Content Backfill from Notion

**User Story:** As a deck owner, I want my existing Notion page content migrated to the local database, so that no documentation is lost during the transition.

#### Acceptance Criteria

1. WHEN the Backfill_Script executes, THE Backfill_Script SHALL read all deck-to-Notion-page mappings from the notion_deck_map table and fetch page content for each mapped deck using the existing NotionClient.getPageContent() method.
2. WHEN page content is retrieved, THE Backfill_Script SHALL parse sections by matching headings (## Strategy & Playstyle, ## Key Synergy Lines, ## Strengths & Weaknesses, ## Matchup Notes, ## Mulligan Guide) and write each matched section's body to the corresponding Documentation_Store column (strategy_playstyle, synergy_lines, strengths_weaknesses, matchup_notes, mulligan_guide).
3. IF a section heading is not found in the retrieved page content, THEN THE Backfill_Script SHALL leave the corresponding Documentation_Store column as NULL for that deck.
4. WHEN appended notes content is identified on a Notion page (content appearing after the last known generated section heading), THE Backfill_Script SHALL insert each distinct note block as a separate row in the Notes_Store with deck_id set to the current deck.
5. IF the Backfill_Script fails to fetch content for a specific deck (network error, page not found, or permission denied), THEN THE Backfill_Script SHALL log the error with the deck ID and deck name, and continue processing remaining decks without aborting.
6. WHEN the Backfill_Script completes, THE Backfill_Script SHALL report a summary including: total decks attempted, decks succeeded (with documentation populated), decks skipped (no Notion mapping), and decks failed (with error messages).
7. IF the Backfill_Script is run multiple times, THEN THE Backfill_Script SHALL use INSERT OR REPLACE semantics for deck_documentation, ensuring idempotent execution without creating duplicate rows.

### Requirement 4: Redirect AI Generation Write Targets

**User Story:** As a deck owner, I want AI-generated content (debrief recommendations, upgrade decisions) written to the local database instead of Notion, so that the generation pipeline functions without any Notion dependency.

#### Acceptance Criteria

1. WHEN the debrief action handler produces coaching notes, THE AI_Generation_Logic SHALL write the notes to the Notes_Store as a new row keyed by deck_id and timestamp, instead of calling appendNotionNotes.
2. WHEN the upgrade apply handler records a swap decision, THE AI_Generation_Logic SHALL write the decision note to the Notes_Store as a new row keyed by deck_id and timestamp, instead of calling appendNotionNotes.
3. WHEN the upgrade skip handler records a skipped recommendation, THE AI_Generation_Logic SHALL write the skip note to the Notes_Store as a new row keyed by deck_id and timestamp, instead of calling appendNotionNotes.
4. THE AI_Generation_Logic SHALL preserve the same note content format and structure previously sent to appendNotionNotes, passing the identical string to the Notes_Store write operation without modifying prompts or generation logic.
5. IF a Notes_Store write fails, THEN THE AI_Generation_Logic SHALL log the failure to the console and continue without blocking the handler response.
6. THE AI_Generation_Logic SHALL NOT import or invoke appendNotionNotes from the debrief action, upgrade apply, or upgrade skip handlers.

### Requirement 5: Strategy Tab UI Display

**User Story:** As a deck owner, I want to view and edit my deck documentation in the Strategy tab, so that narrative content is accessible directly within the app.

#### Acceptance Criteria

1. WHEN a user navigates to the Strategy tab for a deck, THE Strategy_Tab SHALL retrieve and display the deck's documentation from the Documentation_Store, rendering each non-null section (strategy_playstyle, synergy_lines, strengths_weaknesses, matchup_notes, mulligan_guide) as a distinct labeled content block.
2. WHEN a user navigates to the Strategy tab, THE Strategy_Tab SHALL retrieve and display the deck's notes from the Notes_Store in reverse chronological order (newest first), showing each note's created_at timestamp alongside its content.
3. WHEN a user edits a documentation section (strategy_playstyle, synergy_lines, strengths_weaknesses, matchup_notes, or mulligan_guide) and triggers a save action, THE Strategy_Tab SHALL persist the change to the Documentation_Store, update the updated_at timestamp, and display a success confirmation to the user.
4. IF a documentation save request fails, THEN THE Strategy_Tab SHALL display an error indication to the user and preserve the unsaved edits in the editor so the user can retry without data loss.
5. IF retrieval of documentation or notes fails due to a network or server error, THEN THE Strategy_Tab SHALL display an error indication distinguishing the failure from the empty-documentation state.
6. WHEN no documentation exists for a deck, THE Strategy_Tab SHALL display an empty state indicating that no documentation has been generated yet.

### Requirement 6: Stop Redundant Notion Sync of Computed Content

**User Story:** As a system maintainer, I want to stop syncing already-computed content (category breakdown, legality summary, upgrade strategy, precon upgrade) to Notion, so that the sync pathway is eliminated without requiring new storage.

#### Acceptance Criteria

1. THE Notion_Integration SHALL not write category breakdown, legality summary, upgrade strategy, or precon upgrade content to Notion pages via updateDeckNotionAllocation or any other sync function.
2. WHILE the Notion sync for computed content is removed, THE deck detail Analysis tab SHALL continue rendering the category breakdown and legality summary from locally-computed data without error.
3. WHILE the Notion sync for computed content is removed, THE deck detail Strategy tab SHALL continue rendering upgrade strategy content from locally-computed data without error.
4. WHILE the Notion sync for computed content is removed, THE deck detail Strategy tab SHALL continue rendering precon upgrade content (for precon mod decks) from locally-computed data without error.

### Requirement 7: Full Notion Integration Removal

**User Story:** As a system maintainer, I want all Notion integration code, routes, tables, and configuration removed, so that no reference to Notion remains in the codebase.

#### Acceptance Criteria

1. WHEN the removal is complete, THE application SHALL contain no notion_deck_map table in the database schema.
2. WHEN the removal is complete, THE application SHALL contain no `notion-sync.ts` module, no Notion client modules, and no `@notionhq/client` or other Notion SDK packages in `package.json` or the dependency lock file.
3. WHEN the removal is complete, THE application SHALL contain no `/api/notion/*` route handlers.
4. WHEN the removal is complete, THE application SHALL contain no `NOTION_*` environment variable references in source code, configuration files, or documentation.
5. WHEN the removal is complete, THE application SHALL contain no Notion error states referenced in the conversational commands documentation.
6. WHEN the removal is complete, THE application SHALL contain no imports or references to Notion-related functions (appendNotionNotes, syncDecksToNotion, setNotionClient, updateDeckNotionPage, updateDeckNotionAllocation, writeDeckListSection) anywhere in the codebase.

### Requirement 8: Decision Log Continuity

**User Story:** As a deck owner, I want the decision log to continue functioning after Notion removal, so that my brew session decisions remain intact and accessible.

#### Acceptance Criteria

1. WHEN the Notion_Integration removal is complete, THE Decision_Log SHALL support creating new sessions with the default empty log structure, reading decision logs via the session API and repository method, and persisting new decision entries via the extract and save routes, all operating against the brew_sessions.decision_log_json column.
2. WHEN the Notion mirror write for decision log entries is removed, THE Decision_Log read and write operations SHALL continue operating against the existing brew_sessions table with no code changes to the brew session API routes or the sqlite-card-repository getDecisionLog method.
3. WHEN the Notion_Integration removal is complete, THE Decision_Log SHALL preserve all decision_log_json data in existing brew_sessions rows with no data loss or structural modification to previously stored entries.

### Requirement 9: Application Integrity Without Notion

**User Story:** As a deck owner, I want the application to run correctly with no Notion environment variables set, so that the app has zero runtime dependency on Notion.

#### Acceptance Criteria

1. WHEN the application starts with no `NOTION_*` environment variables defined, THE application SHALL start and begin accepting HTTP requests without throwing errors or exiting with a non-zero status code.
2. WHILE the application runs with no `NOTION_*` environment variables defined, THE application SHALL serve all deck detail pages, API routes, sync operations, and AI generation flows returning the same response status codes and content structure as when documentation is stored in the Documentation_Store and Notes_Store.
3. IF any code path that previously relied on Notion client availability is reached, THEN THE application SHALL execute the equivalent operation against the Documentation_Store or Notes_Store and return a successful response to the caller.
4. WHEN the application starts with no `NOTION_*` environment variables defined, THE application SHALL not emit any Notion-related error messages or warnings to the application log.

### Requirement 10: Database Migration

**User Story:** As a system maintainer, I want schema changes applied through a versioned migration, so that the database is updated consistently and reversibly.

#### Acceptance Criteria

1. WHEN the migration runs, THE migration SHALL create the deck_documentation table using IF NOT EXISTS with the specified schema (deck_id INTEGER PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE, strategy_playstyle TEXT, synergy_lines TEXT, strengths_weaknesses TEXT, matchup_notes TEXT, mulligan_guide TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP).
2. WHEN the migration runs, THE migration SHALL create the deck_notes table using IF NOT EXISTS with the specified schema (id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP).
3. WHEN the migration runs, THE migration SHALL create an index idx_deck_notes_deck_id on deck_notes(deck_id) using IF NOT EXISTS.
4. WHEN the Notion removal migration runs, THE migration SHALL drop the notion_deck_map table using DROP TABLE IF EXISTS.
5. WHEN each migration completes successfully, THE migration runner SHALL record the migration filename in the _migrations tracking table so that it is not re-applied on subsequent runs.
6. IF a migration has already been recorded in the _migrations table, THEN THE migration runner SHALL skip that migration file without error.
