# Report: local-auto-signin
Role: Developer
Status: DONE
Task as received: "I am only running this locally for now. Can you remove the login requirement" → owner chose "Auto sign in please" (local-only automatic sign-in with the owner's own account).

## Summary for the owner
When you run Oracle on your own computer, it can now sign you in automatically, so you never see the login screen. It is off until you add your account email and password to your private local settings file and restart the app. The live site is unchanged.

## Changed files
- src/lib/local-auto-login.ts — small function deciding if auto sign-in is active (development only, both settings present) and performing the sign-in
- src/lib/local-auto-login.test.ts — tests: active, inactive, production guard, sign-in failure, password never logged
- src/middleware.ts — signs in automatically when there is no session; /login redirects to the home page when active; falls back to the normal login on failure
- README-SETUP.md — how to switch it on
- .env.local.example — documents the two settings (file is git-ignored by `.env*`, so not part of the commit)

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The owner has a Supabase email/password account. [Approximate]
- A real session is required because data access depends on it [Confirmed: src/lib/auth.ts, src/middleware.ts], so auth was not removed.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx vitest run src/lib/local-auto-login.test.ts — 6/6 pass
- npm run typecheck — clean
- eslint on the three changed source files — no output (clean)
- Not verified: an actual sign-in against the hosted Supabase (needs the owner's credentials)
