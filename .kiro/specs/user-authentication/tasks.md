# Implementation Plan: User Authentication

## Overview

Add Supabase Auth to The Oracle using `@supabase/ssr` for cookie-based session management, Next.js middleware for route protection, and Postgres RLS for data isolation. The implementation installs the auth package, creates the session-aware client utilities and auth helpers, adds middleware for token refresh and redirects, builds the login page and auth callback, applies RLS policies to all 24 user-owned tables, migrates existing data to Brad's auth user ID, and finally migrates all ~40+ API routes from the hardcoded `SUPABASE_DEFAULT_USER_ID` pattern to session-derived user IDs.

## Tasks

- [x] 1. Install dependencies and set up auth infrastructure
  - [x] 1.1 Install `@supabase/ssr` package and update `src/lib/supabase.ts`
    - Run `npm install @supabase/ssr`
    - Add `createAuthServerClient()` factory function that uses `@supabase/ssr`'s `createServerClient` with cookie-based session handling
    - Rename existing `createServerClient()` to `createAdminClient()` to clarify it uses the service role key
    - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY` to environment variable validation
    - Update all existing imports of `createServerClient` across the codebase to use `createAdminClient`
    - _Requirements: 4.1, 4.2_

  - [x] 1.2 Create `src/lib/auth.ts` helper module
    - Implement `getAuthUser()` — calls `createAuthServerClient()` then `supabase.auth.getUser()`, returns `User | null`
    - Implement `requireAuth()` — calls `getAuthUser()`, returns 401 Response if no user, otherwise returns the user object
    - _Requirements: 4.1, 4.3_

  - [x] 1.3 Create Next.js middleware (`src/middleware.ts`)
    - Create Supabase client with cookie read/write access via request/response
    - Define `PUBLIC_ROUTES` array: `['/login', '/auth/callback']`
    - Allow public routes to pass through without auth check
    - Call `supabase.auth.getUser()` to refresh tokens and validate session
    - Redirect unauthenticated requests to `/login`
    - Set matcher config to exclude static assets (`_next/static`, `_next/image`, favicons, images)
    - _Requirements: 1.1, 2.3, 7.1, 7.3_

- [x] 2. Build login and auth callback pages
  - [x] 2.1 Create login page (`src/app/login/page.tsx`)
    - Server component wrapper with no user data in HTML source
    - Client component login form with email and password fields
    - Call `supabase.auth.signInWithPassword()` on form submit
    - Display generic error message on failure: "Invalid email or password"
    - Redirect to home (`/`) on successful login
    - Style consistently with the existing app design (Tailwind, shadcn patterns)
    - _Requirements: 1.2, 1.3, 7.4_

  - [x] 2.2 Create auth callback route (`src/app/auth/callback/route.ts`)
    - Handle GET request with `code` query parameter
    - Exchange auth code for session using `supabase.auth.exchangeCodeForSession(code)`
    - Redirect to home on success, redirect to `/login` on failure
    - _Requirements: 2.1, 5.2, 5.3_

  - [x] 2.3 Add logout functionality
    - Create a server action or API route that calls `supabase.auth.signOut()`
    - Add a logout button to the app shell/navigation
    - Redirect to `/login` after sign-out
    - _Requirements: 1.5_

- [x] 3. Checkpoint — Verify auth flow works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Apply Row Level Security policies
  - [x] 4.1 Create RLS migration for user-owned tables (`supabase/migrations/003_rls_policies.sql`)
    - Enable RLS on all 24 user-owned tables: `card_definitions`, `decks`, `collection`, `physical_copies`, `deck_cards`, `deck_allocations`, `deck_documentation`, `brew_sessions`, `brew_session_cards`, `dead_weight_dismissals`, `upgrade_candidates`, `upgrade_changelog`, `generic_land_preferences`, `deck_health_cache`, `health_run_log`, `precon_mod_tracking`, `card_ratings`, `card_rating_history`, `deck_synergy_scores`, `commander_recommendations`, `recommendation_history`, `deck_upgrade_summary`, `deck_category_targets`, `deck_category_analysis`
    - Create SELECT policy: `USING (auth.uid() = user_id)`
    - Create INSERT policy: `WITH CHECK (auth.uid() = user_id)`
    - Create UPDATE policy: `USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`
    - Create DELETE policy: `USING (auth.uid() = user_id)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Create RLS migration for reference tables
    - Add permissive SELECT policy for `authenticated` role on: `sets`, `card_metadata`, `precon_cards`, `card_kingdom_prices`, `oracle_to_printings`, `sync_meta`, `_migrations`
    - Policy: `USING (true)` for SELECT, TO `authenticated`
    - _Requirements: 3.5_

  - [ ]* 4.3 Write property test for RLS data isolation (Property 1)
    - **Property 1: RLS Data Isolation**
    - Generate random user ID pairs and table names from the 24 user-owned tables
    - Verify that mocked RLS behavior rejects CRUD operations where `auth.uid()` does not match the row's `user_id`
    - Minimum 100 iterations
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 5. Migrate API routes to session-based auth
  - [x] 5.1 Migrate core data routes to use `requireAuth()`
    - Update `src/app/api/collection/route.ts` — replace `SUPABASE_DEFAULT_USER_ID` with `requireAuth()` user ID
    - Update `src/app/api/decks/route.ts` — same pattern
    - Update `src/app/api/shared-cards/route.ts` — same pattern
    - Update `src/app/api/allocation/route.ts` — same pattern
    - Update `src/app/api/proxy-allocate/route.ts` — same pattern
    - For routes that need service-role client (bypassing RLS): keep `createAdminClient()` but derive `user_id` from session
    - _Requirements: 4.1, 4.2, 4.3, 3.6_

  - [x] 5.2 Migrate brew and AI routes to use `requireAuth()`
    - Update all routes under `src/app/api/brew/` (assess, chat, commit, extract, positions, save, session, skeleton)
    - Update all routes under `src/app/api/ai/` (brew, build-deck, debrief, deck-scan, mana-analysis, recommend, search)
    - Update `src/app/api/brew-sessions/[id]/route.ts`
    - Each route: import `requireAuth`, call at top of handler, use returned user ID for DB operations
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Migrate remaining routes to use `requireAuth()`
    - Update `src/app/api/cards/[name]/route.ts`
    - Update routes under `src/app/api/collection/` (allocation, import, prices, rollup, stats)
    - Update routes under `src/app/api/decks/[id]/` (all sub-routes)
    - Update `src/app/api/settings/generic-land-preferences/` routes
    - Update `src/app/api/archidekt/` routes (create-deck, write-tags)
    - Update `src/app/api/sync/` routes (full, status, route.ts)
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.4 Remove all references to `SUPABASE_DEFAULT_USER_ID`
    - Search entire `src/` for `SUPABASE_DEFAULT_USER_ID` and remove all occurrences
    - Remove the env var from `.env.local` / `.env.example` if present
    - Verify no hardcoded user UUIDs remain in route or lib files
    - _Requirements: 4.4_

  - [ ]* 5.5 Write property test for unauthenticated API requests (Property 3)
    - **Property 3: Unauthenticated API Requests Return 401**
    - Generate random API route paths from the known route list (excluding `/auth/callback`)
    - Verify each returns 401 when no valid session exists
    - Minimum 100 iterations
    - **Validates: Requirements 4.3, 7.2**

  - [ ]* 5.6 Write property test for service-role writes using session user ID (Property 2)
    - **Property 2: Service Role Writes Use Session User ID**
    - Generate random session user IDs; for each simulated write operation via service-role client, verify the `user_id` written matches the session user's ID
    - Minimum 100 iterations
    - **Validates: Requirements 3.6, 4.1, 4.2**

- [x] 6. Checkpoint — Verify all route migrations and RLS policies
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Data migration and final wiring
  - [x] 7.1 Create data migration script (`supabase/migrations/004_migrate_user_id.sql`)
    - Wrap entire migration in a single transaction (`BEGIN` / `COMMIT`)
    - Update `user_id` from the old hardcoded UUID to Brad's new Supabase Auth user ID across all 24 user-owned tables
    - Log row counts per table using `RAISE NOTICE`
    - On any failure, roll back the entire transaction
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Create post-migration verification script
    - Write a SQL or TypeScript script that compares pre- and post-migration row counts for all 24 tables
    - Verify all rows now have the correct new user ID
    - Verify no rows still have the old hardcoded UUID
    - _Requirements: 6.4_

  - [x] 7.3 Disable self-registration in Supabase project settings
    - Document the steps: Supabase Dashboard → Authentication → Settings → disable "Allow new users to sign up"
    - Add a comment/README note that user provisioning is admin-only via Supabase Dashboard invite
    - _Requirements: 5.1, 5.4_

  - [ ]* 7.4 Write property test for unauthenticated page redirects (Property 4)
    - **Property 4: Unauthenticated Page Requests Redirect to Login**
    - Generate random page paths (excluding `/login` and `/auth/callback`)
    - Verify middleware produces a redirect response to `/login` with no user data in body/headers
    - Minimum 100 iterations
    - **Validates: Requirements 1.1, 7.1, 7.3, 7.4**

  - [ ]* 7.5 Write unit tests for auth helpers and middleware
    - Test `getAuthUser()` returns user when session valid, returns null when not
    - Test `requireAuth()` returns user object or 401 Response
    - Test middleware allows public routes through without redirect
    - Test middleware redirects unauthenticated requests to `/login`
    - _Requirements: 1.1, 4.3, 7.1_

- [x] 8. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The project uses Vitest for unit tests and fast-check for property-based tests
- RLS policies provide defense-in-depth on top of API-level auth checks
- The existing `createServerClient()` is renamed to `createAdminClient()` — all existing imports must be updated
- The data migration (task 7.1) requires Brad's actual Supabase Auth user ID — this will be available after creating the first account via Supabase Dashboard
- Disabling self-registration (task 7.3) is a Supabase Dashboard setting, not code — the task documents the steps

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "4.1", "4.2"] },
    { "id": 3, "tasks": ["4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3"] },
    { "id": 7, "tasks": ["7.4", "7.5"] }
  ]
}
```
