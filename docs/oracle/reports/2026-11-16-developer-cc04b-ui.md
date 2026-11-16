# Report: CC-04b UI half (Claude connector screens)
Role: Developer (screens)
Status: PARTIAL (all screens built and tested against the server's documented shapes; not yet seen against live routes, and the full build is currently blocked by the server half's unfinished files)
Task as received: build the UI half of `docs/oracle/specs/claude-connector.md` (page Settings > Claude connector with Connection / Recent changes / Setup guide tabs, header chip, moved-card state in the original deck's Cards tab), using the cookie-only routes from the server Developer.

## Summary for the owner
There is now a "Claude connector" page under Settings with three tabs. Connection shows whether Claude is on, has the on/off switch and the "what Claude can and can't do" list. Recent changes shows requests waiting for your yes first (with Approve and Decline), then what Claude changed, newest first, each with Undo. Setup guide is a "coming next" placeholder. A small chip in the top bar says "N Claude is waiting for your yes" only while something waits, and opens Recent changes. In the deck where a card was moved away, the card stays as an Unsleeved slot marked Unavailable, "In {other deck}", with an "Open {deck}" link and one line saying Claude moved it.

## What the owner can click
- Settings page: new "Claude connector" box with an "Open Claude connector" button.
- Page tabs (arrow keys work; the tab strip scrolls sideways on a phone). Address `/settings/claude-connector?tab=changes` opens Recent changes directly.
- Connection: the "Let Claude use Oracle" switch (off takes effect at once, no confirm; Try again when the status can't be read; "Show me how to reconnect" opens the Setup guide).
- Recent changes: Approve move / Approve all N / Decline on waiting cards; "See the N cards"; Undo on each row; Try again on errors; Dismiss on a stale request.
- Header chip: links to Recent changes, waiting section.
- Deck Cards tab (list view): "Open {deck}" on a moved slot.

## Changed files
- `src/app/settings/claude-connector/page.tsx`: the page and tabs (tab kept in the address).
- `src/components/connector/api.ts`: the only place that talks to the routes; one adapter for wire shapes.
- `src/components/connector/ConnectionTab.tsx`: status, switch, notices, capabilities panel, "where it's connected".
- `src/components/connector/RecentChangesTab.tsx`: pending section, day-grouped applied rows, Undo/Approve/Decline flows, live region, focus move.
- `src/components/connector/PendingCard.tsx`, `ChangeRow.tsx`, `SetupGuideTab.tsx`, `PendingChip.tsx`, `MovedSlotNote.tsx`, `format.ts`, `index.ts`.
- `src/components/PageHeader.tsx`: renders the chip on every screen (now a client component).
- `src/components/CardGroupSection.tsx`: moved-slot note under a row whose slot Claude moved.
- `src/app/settings/page.tsx`: link to the new page.
- Tests: `src/components/connector/{RecentChangesTab,ConnectionTab,api,small}.test.*`, `src/components/CardGroupSection.moved.test.tsx`.

## State coverage (spec section by section)
- Connection: active, off, loading (switch disabled, "Checking…"), status error (never shows Off), switch failed (switch stays On, loud alert), switched-off notice + toast, expired alert + reconnect button: all tested. Expired is built but the status route cannot report it yet (see Open questions).
- Recent changes: loading (aria-busy), empty (only after a successful empty answer), error with Try again (never "none"; pending and changes fail independently), pending-first order, move card (losing deck first, "(loses/gains a card)", size / Sleeved / deck status before to after via the existing readiness calculation, "Nothing is lost or duplicated"), big edit card (scrollable focusable list, "The copies go back to storage, not deleted.", "See the N cards"), Approve (toast + live region, card leaves waiting), Decline (card shows Declined), stale approval ("Couldn't apply... Ask Claude again" + Dismiss), expired, cancelled, failed, applied rows grouped by day with 7-day caption, Undo success (row becomes Undone and stays), Undo refused (aria-disabled, reason in the row linked by aria-describedby, "Open {deck}"), Undo refused already known on load, technical failure ("Nothing was changed. Try again."), multi-card request as one row with disclosure.
- Moved card: Unavailable badge, "In {deck}", "Open {deck}", one history line, only on the moved slot (integration test in the real Cards list).
- Accessibility: no emoji (lucide icons, `aria-hidden`), 44px minimum on buttons/links/switch/tabs, polite live region for results, `role="alert"` for errors, switch is a real `role="switch"` button, reduced-motion respected on the switch, layouts stack on phone. Not checked in a browser (see below).

## New decisions made (need owner confirmation)
- Header chip sits in the shared page header, so it shows on every screen.
- When the switch is Off and the owner flips it on, the page explains they must reconnect from Claude (there is no route to re-enable an ended link).

## Assumptions
- Deck size for the before/after status words is 100 (Commander), the same default the deck state badge uses; the server's preview carries no format.
- Moved slot id equals the deck card row id shown in the Cards list.
- Changes route returns one element per request (as in `api-types.ts`); I still group by `group_id` defensively.

## Challenges to locked decisions
- none

## Open questions
- The status route reports only connected true/false, so the "Needs reconnecting" (expired) state is built but can never appear; the server needs an "expired" value (or the owner accepts it for now).
- No route turns an ended connection back on. Spec 3.1 says on-from-off re-enables; I show a reconnect instruction instead.
- My `api.ts` mirrors the wire types instead of importing `src/lib/connector/api-types.ts`, because that file is not committed yet and does not compile (it imports `UndoRefusal` from `write-types`, which does not export it). Swap to the shared import once it does.

## Verification
- `npx vitest --run src/components`: 758 passed, 9 skipped (all my tests green).
- `npx vitest --run` (whole repo): 3142 passed; 3 failures, all in the server half's in-progress files (`mcp-request.test.ts`, `registry-and-isolation.test.ts`), none in files I touched.
- `npx tsc --noEmit`: only 2 errors, both in the server half's `api-types.ts` and `change-sentences.ts` (missing `UndoRefusal` export). No errors in my files.
- `npx next build --webpack`: compiles, then stops at the same `api-types.ts` type error. Not green until the server Developer fixes it; my files introduce no errors.
- `npx eslint src/components/connector src/app/settings`: no errors, no warnings in my files.
- Unverified: nothing has run against the real routes (they did not exist when I finished: `src/app/api/connector` only has `revoke`), so the wire adapters are tested with mocked responses only. Not checked in a browser at 360px, with a screen reader, or for real contrast ratios. Tester should run those once routes land.
