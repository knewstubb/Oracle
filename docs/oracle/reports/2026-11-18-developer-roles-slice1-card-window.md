# Report: roles-slice1-card-window
Role: Developer
Status: PARTIAL
Task as received: record the owner's five answers on the card roles contract, then build SLICE 1 of the card roles and deck jobs feature (the basic card window). Full text in the handoff.

## Summary for the owner
Clicking (or tapping) a card name in a deck's list now opens a card window with the picture, the name, In deck or Planned, the card's Category (editable) and its roles as the app works them out today (read-only). The same window opens from the card menu as "Card details". Your five answers of 2026-11-18 are recorded as Agree. I could not check the window on Murky Business, Rocco's Secret Sauce or Arti-facts: the saved login on this machine belongs to a test account, not yours. Please try Part A2 in the test plan on those decks.

## Changed files
- docs/oracle/contracts/card-roles-and-deck-jobs.md — section 13 items 1 to 4 and 15.9 marked Answered (Agree) with the chosen option
- docs/oracle/specs/card-roles-and-deck-jobs.md — section 17 items 9 and 10 marked Answered
- docs/oracle/briefs/card-roles-and-deck-jobs.md — 7c note that the smaller behaviours are Answered
- src/components/CardWindow.tsx — new window and host (context), shared by every row
- src/components/CardGroupSection.tsx — card name is now a button that opens the window; "Card details" in the menu and right-click menu; the phone tap falls back to the old picture only when no window host exists
- src/components/CardsTab.tsx — hosts the window above the list; category save uses the existing categoryMutation
- src/app/api/decks/[id]/cards/[cardId]/roles/route.ts — new read-only GET, roles from card text (same function as deck health)
- src/lib/card-window-roles.ts (+ test) — pure helper: roles, land, no data
- src/components/CardWindow.test.tsx — 10 component tests
- docs/oracle/test-plan-2026-11-17.md — new Part A2 Card window

## New decisions made (need owner confirmation)
- Roles use today's four names (Ramp, Draw, Removal, Wipes); the 13-role list arrives in slice 2.
- The Category editor has a "Main" selector plus the existing secondary dropdowns. The existing editor also shows a read-only "Primary" badge, so the main category appears twice while editing.
- Added the spec's "Saved" with a 10-second Undo for category edits.

## Assumptions
- Base: branch roles-slice1 off main 7a55df3, which is origin/main (375ea3e) plus two local commits (7767b52 design v3, 7a55df3 contract and drafts). The Part A commit sits on top.
- The hover picture stays on computer. Grid (picture tiles) view is unchanged and does not open the window.

## Challenges to locked decisions
- none

## Open questions
- Murky Business, Rocco's Secret Sauce and Arti-facts were not checked in a browser (no login for the owner's account). Card pictures were not seen either: the fixture deck has no picture ids.

## Verification
- vitest CardWindow.test.tsx and card-window-roles.test.ts — 14 passed
- npm test (full) — 3680 passed, 1 failed: src/lib/copy-availability.test.ts "card-status.ts filters missing and in_hand". It fails the same way on untouched main. ImportIntentFlow passed here.
- npm run typecheck — only the known AddToPicklist.test.tsx errors
- eslint on changed files — 0 errors (existing warnings only)
- Real browser (Chrome, dev server on port 3457, read only, the test account's "E2E Read-only Snapshot Fixture" deck, 13 cards) at 1280x800 and 390x844: the window opens in about 90 ms. The roles line loaded after it ("No role found" for Edgar Markov, and a clear "Couldn't load roles" message with Try again when the lookup failed). Escape closes it and focus returns to the name. The menu item "Card details" opens it. Edit shows the category editor. The phone window fills the screen with the picture area on top (it shows "No image" for this deck). Screenshots are in /tmp/s1. A category change was not tried in the browser; tests cover it.
