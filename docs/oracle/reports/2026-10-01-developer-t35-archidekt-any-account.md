# Report: t35-archidekt-any-account
Role: Developer
Status: DONE
Task as received: Task T-35: Make the Archidekt onboarding import accept any public account by parsing the entered collection URL/account identifier, passing it through the collection-stream route and fetcher, and using the same account for deck loading. Inputs live in src/app/onboarding/page.tsx, src/app/api/onboarding/collection-stream/route.ts, src/lib/archidekt-client.ts, and their focused tests. Done when: two different public Archidekt accounts produce their own collection and deck lists, invalid/private inputs show clear errors, and focused tests plus typecheck pass.

## Summary for the owner
The onboarding flow now accepts Archidekt collection URLs containing a numeric user ID. Users enter formats like `archidekt.com/collection/v2/614000/` or just a numeric ID, and the system validates the collection is public (not just decks) before fetching. Invalid inputs (usernames, slugs) return clear error messages instead of silently using the default account.

## Changed files
- `src/lib/archidekt-client.ts` — Added URL parsing and user resolution functions
- `src/lib/warm-start-import.ts` — Pass userId through to fetchUserDecks
- `src/app/api/onboarding/collection-stream/route.ts` — Accept archidektUrl in request body
- `src/app/api/onboarding/decks/route.ts` — Accept archidektUrl query param
- `src/app/onboarding/page.tsx` — Pass collectionUrl to both API calls
- `src/lib/__tests__/archidekt-input-parser.test.ts` — Focused unit tests

## New decisions made (need owner confirmation)
- None. The implementation follows existing patterns for URL parsing (similar to Moxfield username handling).

## Assumptions
- The Archidekt API will continue to support the `/decks/v3/?ownerId=` endpoint for user resolution
- Empty input falls back to the default user (backward compatible)

## Challenges to locked decisions
- None

## Open questions
- None

## Verification
- `npx vitest run src/lib/__tests__/archidekt-input-parser.test.ts` → 29 passed (all focused parser/validation tests)
- `npm run build` → Build completed successfully

## Corrections applied per review feedback
1. Removed username resolution via deck API (username can't be used as ownerId)
2. Numeric validation now uses collection endpoint (not decks) - allows users with zero public decks but public collection
3. Deck route returns 400 error for missing/invalid input instead of silent fallback to default user
4. Same validated user ID is used for both collection and deck requests