# Report: Archidekt import URL handling
Role: orchestrator
Status: DONE
Task as received: Im trying to test import with another archidekt link but keep getting my other collection. Is the URL hardcoded?

## Summary for the owner
Yes. The Archidekt import currently ignores the collection link typed into the screen and always fetches the same saved Archidekt account. That is why testing another collection keeps returning the previous collection; the import flow needs to be changed to pass the entered link or account through to the server.

## Changed files
- None — investigation only.
- docs/oracle/reports/2026-09-30-orchestrator-archidekt-import-url.md — recorded the confirmed behavior.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The user is testing the current onboarding Archidekt collection import flow at `/onboarding`.

## Challenges to locked decisions
- none

## Open questions
- Should the field accept a full Archidekt collection URL, an Archidekt username/account ID, or both?
- Should the same entered account also determine which public decks are shown afterward?

## Verification
- Searched `src/app/onboarding/page.tsx`: the form stores the entered URL, but the POST request contains no body and does not include it.
- Read `src/app/api/onboarding/collection-stream/route.ts`: the route accepts no URL input and calls the collection fetcher without arguments.
- Read `src/lib/archidekt-client.ts`: collection and deck requests use the fixed `USER_ID = 614000`.
- Searched the repository for Archidekt user configuration: no active environment/configuration value was found for this ID.
