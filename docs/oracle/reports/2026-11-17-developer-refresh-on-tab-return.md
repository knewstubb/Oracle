# Report: refresh-on-tab-return
Role: Developer
Status: DONE
Task as received: Add 'refresh when the user returns to the Oracle tab' (visibilitychange / window focus): data refreshes in place without reload or losing UI state; covers deck list, deck page, Recent changes, Pending, Picklist, Collection; one shared hook; throttled to once per ~5s; skipped while save/delete/import in flight; do not break useDeleteDeck; no polling, realtime or database changes.

## Summary for the owner
When you switch back to the Oracle tab, the screen you are on now updates itself with whatever Claude changed, with no page reload. Open dialogs, scroll position and half-typed text stay as they are. Quick tab flicking refreshes at most once every 5 seconds, and nothing refreshes while a save, delete or import is running.

## Changed files
- src/hooks/useRefreshOnTabReturn.ts — new shared hook: on tab visible or window focus, refetches on-screen data; 5s throttle; skipped while a mutation runs
- src/hooks/useRefreshOnTabReturn.test.tsx — unit tests: refreshes on visible and on focus, not on hidden, throttled, skipped while busy
- src/components/providers.tsx — mounts the hook once for the whole app
- docs/oracle/test-plan-2026-11-17.md — new Part F step 6 (untracked in the owner's checkout, edited in place, not in the commit)

## New decisions made (need owner confirmation)
- none

## Assumptions
- All listed pages load through react-query [Confirmed: src/app/page.tsx, src/app/decks/[id]/page.tsx, src/components/connector/RecentChangesTab.tsx, src/components/PicklistV2.tsx, src/components/collection/CollectionRollupTab.tsx], so one app-wide invalidate covers them. Only queries on screen refetch immediately; others refetch when next shown.
- "In flight" means a react-query mutation. useDeleteDeck is one [Confirmed: src/hooks/useDeleteDeck.ts], so a refresh cannot restore a deck mid-delete. Imports or saves that use a bare fetch outside a mutation are not detected.
- A refresh skipped because of a running mutation does not use up the 5s allowance, so it happens on the next focus or visibility event.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx vitest --run src/hooks/useRefreshOnTabReturn.test.tsx — 4 passed
- npm run check — tests: 2 failed (ImportIntentFlow env-flag, known; registry-and-isolation "estimate" wording in get_deck description, exists on main without this change), 3497 passed
- npm run typecheck — only existing errors in AddToPicklist.test.tsx
- npm run lint — 4 existing errors (storage/missing link, tools.test.ts any, list-decks prefer-const); none in changed files
- Not tested in a real browser.
