# Report: cc03a-owner-checks
Role: Developer
Status: DONE

Task as received: CC-03a build: implement the Developer task list in docs/oracle/contracts/data-separation.md (owner checks on the deck status and notes routes, and the collection stats route that counts every user's cards), with tests where the project's test setup allows; do NOT edit or apply the migrations and NEVER run anything against the live/hosted database. Do not touch the 22 'list only' routes. Done when committed on branch, lint/typecheck/unit tests pass, report written.

## Summary for the owner
The deck status, deck notes and collection stats screens now only show and change the signed-in person's own data. Asking for someone else's deck gives "Deck not found", the same as a deck that doesn't exist. Nothing for you to decide.

## Changed files
- `src/app/api/decks/[id]/status/route.ts` — owner filter on deck lookup and update (5a)
- `src/app/api/decks/[id]/notes/route.ts` — owner deck check (404) plus owner filter on notes (5b)
- `src/app/api/collection/stats/route.ts` — owner filter on both counts (5c)
- `src/test/fake-owned-db.ts` — small in-memory database stand-in for these tests
- `src/app/api/decks/[id]/status/route.test.ts`, `src/app/api/decks/[id]/notes/route.test.ts`, `src/app/api/collection/stats/route.test.ts` — cross-user tests (other user gets 404 and row unchanged; stats count only own rows)

Commit `33d9a2d` on branch `import-destination`. Migrations and the 22 list-only routes untouched.

## New decisions made (need owner confirmation)
- none

## Assumptions
- Notes route returns 500 "Failed to fetch notes" if the deck lookup itself errors.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- `npm run typecheck` — one error, `docs/oracle/contracts/card-state-actions.examples.ts` (TS5097); identical with my changes stashed, so pre-existing, not from this work.
- `npm run lint` — 0 errors, 276 warnings (pre-existing).
- Unit tests (`vitest --run`, excluding `*.live.test.ts` and e2e): 255 files, 3000+ tests pass after the test fix; touched areas (`src/app/api/decks`, `src/app/api/collection`) 215/215 pass. A plain `npm test` hangs here because the live tests need the hosted database, so I excluded them and did not run them.
- Endpoint example requests against a running server: not done (would need the hosted database). Covered by mocked route tests instead.
- Migration SQL syntax check: not done, no local Postgres available (no psql/postgres/initdb/docker found).
- Nothing was run against the live database.
