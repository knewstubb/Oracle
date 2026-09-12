# Requirements Document

## Introduction

Add authentication to The Oracle so that each playgroup member can log in and access their own collection, decks, and allocations. The system currently uses a hardcoded `SUPABASE_DEFAULT_USER_ID` environment variable for all database operations. This feature replaces that pattern with real Supabase Auth, enabling ~8 playgroup members to use the deployed app independently. This is a private playgroup tool — not a public SaaS — so the auth model is invite-only (no self-registration).

## Glossary

- **Auth_System**: The Supabase Auth service and associated Next.js middleware/helpers that manage user sessions
- **Session**: A browser-bound authentication session managed via Supabase Auth cookies, representing a logged-in user
- **Protected_Route**: Any page or API route that requires a valid Session to access
- **RLS_Policy**: A Postgres Row Level Security policy that restricts data access based on the authenticated user's ID
- **Anon_Key_Client**: The Supabase client configured with the public anon key, which respects RLS policies
- **Service_Role_Client**: The Supabase client configured with the service role key, which bypasses RLS (used only in trusted server contexts)
- **Invite_Flow**: The process by which an admin creates user accounts and distributes credentials to playgroup members

## Requirements

### Requirement 1: User Login

**User Story:** As a playgroup member, I want to log in with my email and password, so that I can access my personal collection and decks.

#### Acceptance Criteria

1. WHEN an unauthenticated user navigates to any Protected_Route, THE Auth_System SHALL redirect the user to the login page
2. WHEN a user submits valid credentials on the login page, THE Auth_System SHALL create a Session and redirect the user to the home page
3. IF a user submits invalid credentials, THEN THE Auth_System SHALL display an error message indicating the credentials are incorrect without revealing which field was wrong
4. WHILE a Session is active, THE Auth_System SHALL allow the user to access all Protected_Routes
5. WHEN a user clicks the logout button, THE Auth_System SHALL destroy the Session and redirect the user to the login page

### Requirement 2: Session Persistence

**User Story:** As a playgroup member, I want to remain logged in between browser sessions, so that I do not have to re-enter my credentials on every visit.

#### Acceptance Criteria

1. WHEN a user completes login successfully, THE Auth_System SHALL persist the Session using secure HTTP-only cookies
2. WHILE a persisted Session cookie exists and the token has not expired, THE Auth_System SHALL automatically restore the user's authenticated state on page load
3. WHEN a Session token expires, THE Auth_System SHALL attempt a silent refresh using the refresh token
4. IF the refresh token is also expired or invalid, THEN THE Auth_System SHALL redirect the user to the login page

### Requirement 3: Data Isolation via Row Level Security

**User Story:** As a playgroup member, I want to see only my own data, so that my collection and decks are private to me.

#### Acceptance Criteria

1. THE RLS_Policy SHALL restrict SELECT operations on all user-owned tables to rows where `user_id` matches the authenticated user's ID
2. THE RLS_Policy SHALL restrict INSERT operations on all user-owned tables to rows where `user_id` matches the authenticated user's ID
3. THE RLS_Policy SHALL restrict UPDATE operations on all user-owned tables to rows where `user_id` matches the authenticated user's ID
4. THE RLS_Policy SHALL restrict DELETE operations on all user-owned tables to rows where `user_id` matches the authenticated user's ID
5. THE RLS_Policy SHALL allow unrestricted read access to reference tables (sets, card_metadata, precon_cards, card_kingdom_prices, oracle_to_printings)
6. WHEN an API route uses the Service_Role_Client, THE Auth_System SHALL still resolve the current user's ID from the Session for use in write operations

### Requirement 4: Replace Hardcoded User ID

**User Story:** As a developer, I want API routes and library functions to derive the user ID from the authenticated session, so that the system supports multiple users without code changes per user.

#### Acceptance Criteria

1. WHEN an API route handles a request, THE Auth_System SHALL extract the authenticated user's ID from the Session
2. THE Auth_System SHALL pass the authenticated user's ID to all database operations that require a `user_id` value
3. WHEN the authenticated user's ID cannot be resolved from the Session, THE Auth_System SHALL return a 401 Unauthorized response from the API route
4. THE Auth_System SHALL remove all references to `SUPABASE_DEFAULT_USER_ID` from library and route files after migration

### Requirement 5: Invite-Only User Provisioning

**User Story:** As the app admin (Brad), I want to create accounts for my playgroup members, so that only known friends can access the system.

#### Acceptance Criteria

1. THE Auth_System SHALL disable public self-registration (no sign-up page)
2. WHEN the admin creates a user account via the Supabase dashboard or Admin API, THE Auth_System SHALL send an invite email to the new user with a link to set their password
3. WHEN a new user follows the invite link and sets a password, THE Auth_System SHALL activate their account and allow login
4. THE Auth_System SHALL support a minimum of 8 concurrent user accounts

### Requirement 6: Existing Data Migration

**User Story:** As the current sole user (Brad), I want my existing data to remain accessible after auth is enabled, so that I do not lose my collection, decks, or allocations.

#### Acceptance Criteria

1. WHEN authentication is enabled, THE Auth_System SHALL associate all existing rows (currently tagged with the hardcoded UUID) with Brad's new Supabase Auth user ID
2. THE Auth_System SHALL execute the user ID migration in a single database transaction to maintain data consistency
3. IF the migration transaction fails, THEN THE Auth_System SHALL roll back all changes and leave existing data unchanged
4. WHEN the migration completes successfully, THE Auth_System SHALL verify row counts match pre-migration counts for all affected tables

### Requirement 7: Protected Application Shell

**User Story:** As a playgroup member, I want the entire app to be behind login, so that no unauthenticated user can see any data or functionality.

#### Acceptance Criteria

1. THE Auth_System SHALL protect all pages except the login page and the auth callback route
2. THE Auth_System SHALL protect all API routes except the auth callback endpoint
3. WHEN Next.js middleware detects an unauthenticated request to a Protected_Route, THE Auth_System SHALL respond with a redirect to the login page
4. THE Auth_System SHALL not expose any user data, deck data, or collection data in the HTML source of the login page
