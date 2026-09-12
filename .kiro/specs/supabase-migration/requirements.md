# Requirements Document

## Introduction

This feature migrates The Oracle application from a local SQLite database (better-sqlite3, `data/oracle.db`) to Supabase (Postgres) hosted on Vercel. Vercel's serverless execution model has no persistent local filesystem, making the current SQLite-based architecture incompatible with deployment. This is a port of the existing schema, data, and application queries — not a redesign. Every entity, rule, and relationship decided in prior specs (card-identity-physical-copies, collection-screen-pricing, deck-authority-split, generic-basic-lands, collection-csv-upsert) holds unchanged. Only the storage engine and hosting model change.

**Scope explicitly excludes:** new features, schema redesign, revisiting prior design decisions, Supabase Auth, RLS policies, multi-user sign-up/login flows, and Playwright/Archidekt write-back automation.

**Dependencies:** All prior schema specs (migrations 001–029), better-sqlite3 application-layer queries, Vercel deployment target.

## Glossary

- **Source_Database**: The current local SQLite file (`data/oracle.db`) containing all production data, accessed via the better-sqlite3 Node.js library.
- **Target_Database**: The Supabase-managed Postgres instance that will replace the Source_Database after migration.
- **Schema_Inventory**: A complete dump of every table, index, view, trigger, and constraint in the Source_Database, obtained via `sqlite3 <db_file> ".schema"`.
- **Schema_Translation**: The process of converting SQLite DDL syntax and types to valid Postgres DDL with equivalent semantics.
- **Data_Migration**: The process of exporting all rows from the Source_Database, transforming values per the type mapping, and loading them into the Target_Database.
- **User_Id_Column**: A UUID column added to all user-owned tables for future multi-user support, populated with a single fixed UUID for the current sole user.
- **Supabase_Client**: The `@supabase/supabase-js` library (or equivalent Postgres driver) replacing better-sqlite3 in the application layer.
- **Vercel_Function**: A serverless function executed on Vercel's infrastructure with no persistent filesystem and default execution timeout limits.
- **Playwright_Automation**: The existing dormant Archidekt write-back code using Playwright for browser automation, explicitly excluded from this migration.
- **Background_Job_Pattern**: An architectural approach for operations exceeding Vercel's serverless function timeout (e.g., Supabase Edge Functions, external task queues, or chunked processing).
- **FK_Dependency_Order**: The sequence in which tables must be loaded during Data_Migration to satisfy foreign key constraints (parent tables before child tables).

## Requirements

### Requirement 1: Schema Inventory

**User Story:** As a system administrator, I want a complete inventory of the current SQLite schema before translation begins, so that no table, index, or constraint is missed during the port.

#### Acceptance Criteria

1. WHEN the migration process begins, THE system SHALL produce a Schema_Inventory by executing `sqlite3 <db_file> ".schema"` against the live Source_Database file
2. THE Schema_Inventory SHALL include every table, index, view, trigger, and constraint present in the Source_Database — including tables not explicitly discussed in prior spec sessions
3. THE Schema_Inventory SHALL serve as the sole authoritative input for Schema_Translation — the translation step SHALL NOT rely on spec documents or memory as a substitute for the actual database schema
4. IF the Schema_Inventory reveals tables or columns not documented in any prior spec, THEN THE migration process SHALL include those structures in the translation without modification to their semantics

### Requirement 2: Schema Translation (SQLite to Postgres)

**User Story:** As a developer, I want every SQLite table translated to valid Postgres DDL with equivalent types, constraints, and defaults, so that the Target_Database faithfully reproduces the Source_Database structure.

#### Acceptance Criteria

1. WHEN translating a table with `INTEGER PRIMARY KEY AUTOINCREMENT`, THE Schema_Translation SHALL convert it to `INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY` in the Target_Database
2. WHEN translating a column stored as TEXT that represents a UUID, THE Schema_Translation SHALL use `UUID` type in the Target_Database
3. WHEN translating a column stored as INTEGER representing boolean values (0/1), THE Schema_Translation SHALL convert it to native `BOOLEAN` type in the Target_Database
4. WHEN translating a `DATETIME DEFAULT CURRENT_TIMESTAMP` column, THE Schema_Translation SHALL convert it to `TIMESTAMPTZ DEFAULT now()` in the Target_Database
5. WHEN translating a `REAL` column, THE Schema_Translation SHALL convert it to `NUMERIC` or `DOUBLE PRECISION` in the Target_Database with equivalent precision
6. WHEN translating CHECK constraints, THE Schema_Translation SHALL verify each constraint remains valid under Postgres's stricter type enforcement and adjust syntax where necessary while preserving semantics
7. THE Schema_Translation SHALL produce valid Postgres DDL for every table in the Schema_Inventory — zero untranslated tables
8. WHEN translating indexes, THE Schema_Translation SHALL preserve all existing index definitions with equivalent Postgres syntax
9. WHEN a table was explicitly removed in a prior spec (e.g., `notion_deck_map` dropped in migration 025), THE Schema_Translation SHALL NOT include that table in the Target_Database
10. THE Schema_Translation SHALL apply a consistent primary key strategy across all tables — either integer identity or UUID — decided once and applied uniformly

### Requirement 3: User ID Column Addition

**User Story:** As a system administrator, I want a user_id column on all user-owned tables prepopulated with a fixed UUID, so that future multi-user support can be added without a costly schema retrofit.

#### Acceptance Criteria

1. THE Schema_Translation SHALL add a `user_id UUID NOT NULL` column to every user-owned table identified in the Schema_Inventory (including but not limited to: collection, decks, deck_cards, physical_copies, card_definitions, brew_sessions, debrief_sessions, proxy_allocations)
2. THE Data_Migration SHALL populate the user_id column on every existing row with a single fixed UUID value (generated once, used consistently across all tables)
3. THE application layer SHALL NOT include Supabase Auth integration, sign-up flows, login flows, or session management as part of this migration
4. THE application layer SHALL NOT include Row Level Security (RLS) policies as part of this migration
5. THE application SHALL continue to operate as a single-user, unauthenticated system at the application layer — identical to current behavior
6. THE user_id column SHALL be indexed on tables where it will be used as a query filter in future multi-user scenarios

### Requirement 4: Data Migration

**User Story:** As a collection owner, I want all existing data migrated from SQLite to Postgres with verified integrity, so that zero data is lost or corrupted during the platform change.

#### Acceptance Criteria

1. THE Data_Migration SHALL export all rows from every table in the Source_Database
2. THE Data_Migration SHALL transform exported values per the type mapping defined in the Schema_Translation (boolean 0/1 to native boolean, datetime strings to timestamptz, etc.)
3. THE Data_Migration SHALL load transformed data into the Target_Database respecting FK_Dependency_Order — parent tables loaded before child tables that reference them
4. THE Data_Migration SHALL populate the user_id column on every row per Requirement 3
5. WHEN the Data_Migration completes, THE verification step SHALL confirm row counts match between Source_Database and Target_Database for every table
6. WHEN the Data_Migration completes, THE verification step SHALL confirm all foreign key relationships hold in the Target_Database with zero orphaned references
7. WHEN the Data_Migration completes, THE verification step SHALL perform spot-check correctness validation on a sample of rows comparing source and target values
8. IF the Data_Migration encounters a transformation error on any row, THEN THE migration process SHALL halt and report the table, row, and error rather than silently skipping or corrupting data

### Requirement 5: Application Layer Client Swap

**User Story:** As a developer, I want all database access replaced from better-sqlite3 to a Supabase/Postgres client, so that the application functions correctly in Vercel's serverless environment.

#### Acceptance Criteria

1. THE application layer SHALL replace all imports and usage of `better-sqlite3` with the Supabase client library (`@supabase/supabase-js`) or a compatible Postgres driver
2. WHEN any existing query uses SQLite-specific syntax, THE application layer SHALL rewrite that query to equivalent Postgres/Supabase syntax
3. THE application layer SHALL read database connection configuration from environment variables (Supabase URL and anon/service key) rather than a local file path
4. WHEN a query uses SQLite-specific functions (e.g., `json_group_array`, `group_concat`, SQLite's loose type coercion), THE application layer SHALL replace them with Postgres equivalents (`json_agg`, `string_agg`, explicit casts)
5. THE application layer SHALL contain zero remaining references to `better-sqlite3`, the local SQLite file path, or SQLite-specific query patterns after migration is complete
6. WHEN the application is deployed to Vercel, THE application SHALL connect to the Target_Database via the Supabase client without requiring any local filesystem access

### Requirement 6: Vercel Execution Compatibility

**User Story:** As a system administrator, I want long-running operations confirmed compatible with Vercel's serverless timeout limits, so that critical features (bulk import, price refresh) continue functioning after deployment.

#### Acceptance Criteria

1. WHEN a serverless function operation exceeds Vercel's default timeout (varies by plan: 10s on Hobby, 60s on Pro), THE system SHALL have an identified fallback strategy for that operation
2. THE migration process SHALL identify all operations that may exceed Vercel's timeout limit, including but not limited to: Card Kingdom bulk price refresh, collection CSV import, and any batch data processing
3. FOR EACH operation identified as potentially exceeding the timeout, THE system SHALL document a Background_Job_Pattern solution (Supabase Edge Functions, chunked processing, external queue, or Vercel Cron with smaller batches)
4. THE Card Kingdom price refresh (currently configured with a 120-second timeout) SHALL have a confirmed execution strategy compatible with Vercel's function timeout limits
5. THE collection CSV import SHALL have a confirmed execution strategy compatible with Vercel's function timeout limits

### Requirement 7: Playwright Automation Decommission

**User Story:** As a system administrator, I want Playwright write-back automation confirmed dormant and not blocking the migration, so that incompatible browser automation does not complicate the Vercel deployment.

#### Acceptance Criteria

1. THE migration SHALL NOT attempt to port Playwright browser automation to Vercel's serverless environment
2. THE existing Playwright automation code SHALL be retained in the codebase as dormant/dead code rather than deleted
3. IF any automatic or scheduled triggers of Playwright automation remain in the codebase, THEN THE migration SHALL remove those triggers
4. THE application SHALL function correctly on Vercel with Playwright automation dormant — no feature SHALL depend on Playwright execution for normal operation
5. WHEN a user needs to update Archidekt, THE system SHALL rely on manual copy-paste of deck lists rather than automated browser write-back

### Requirement 8: Environment Configuration

**User Story:** As a developer, I want environment configuration updated for Supabase/Vercel deployment, so that the application can be deployed without local filesystem dependencies.

#### Acceptance Criteria

1. THE application SHALL read Supabase connection details from environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-side access, and `SUPABASE_SERVICE_ROLE_KEY` for server-side operations
2. THE application SHALL remove or deprecate environment variables referencing the local SQLite file path
3. THE application SHALL provide a `.env.local.example` file documenting all required Supabase environment variables
4. WHEN deployed to Vercel, THE application SHALL source environment variables from Vercel's environment configuration (not from a local .env file)
5. THE application SHALL support both local development (against a local or remote Supabase instance) and production deployment (against the hosted Supabase instance) via environment variable switching

### Requirement 9: Migration Verification and Rollback

**User Story:** As a system administrator, I want the migration verified end-to-end with a rollback plan, so that failures can be recovered from without data loss.

#### Acceptance Criteria

1. WHEN the full migration (schema + data + application swap) is complete, THE system SHALL pass an end-to-end verification confirming: collection data loads correctly, deck lists display correctly, price cache queries function, and all CRUD operations work against the Target_Database
2. THE Source_Database file SHALL be preserved (not deleted) after migration as a rollback safety net until the Target_Database is confirmed stable in production
3. IF a critical failure is discovered post-migration in production, THEN THE system SHALL have a documented rollback procedure to revert to the Source_Database
4. THE migration SHALL NOT modify the Source_Database during the migration process — the Source_Database remains a read-only source of truth throughout
5. WHEN all verification checks pass and the application has operated successfully against the Target_Database for a defined stabilization period, THE Source_Database file may be archived or removed

