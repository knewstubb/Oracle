# Report: command-zone-slots
Role: Developer
Status: DONE (browser behaviour untested)
Task as received: Owner UI tweak (approved in chat 2026-11-02). Move the second-commander and companion slots out of the deck header and into the Cards tab Commander section, beside/under the commander card, using existing slot components and styling. Rules: (1) Partner / Partner-with / Friends forever / Doctor's companion / Choose a Background slot only when the commander's rules text allows it, labelled for what it is; reuse existing detection; none = no slot; STOP if detection is unavailable. (2) Companion slot in every deck's Commander section, outside the 100 and colour identity (D-058). (3) Filled slots show the card as in the Commander section with sleeve/proxy marker, with the existing remove/change action. (4) Header keeps deck name, commander chip and stats; remove the two "No … · Add" chips. (5) Counts, colour identity, legality, assistant facts unchanged. Worktree ../oracle_app-cz-slots, branch command-zone-slots, no merge, no migrations, mock-only tests, `npm run check`, Copilot trailer.

## Summary for the owner
The deck header now shows only the deck name, the commander button and the stats. The "No second commander · Add" and "No companion · Add" buttons have moved into the Cards tab, in the Commander section just under the commander card. The second slot only appears when your commander allows it, and it is named for what it is (for example "No background · Add" for a commander with Choose a Background, or "No partner · Add"). A commander with none of these has no second slot. The Companion slot is always there. A companion you have chosen now shows as a card in the Commander section, but it is still not counted in the 100 and not in colour identity. I have not opened it in a browser, so please look at it once.

## Findings
- Detection already existed: the pair check reads each card's rules text for Partner, Partner with, Friends forever, Choose a Background, Doctor's companion and Doctor. It was only used to check a chosen pair, not to ask "does this commander allow a second slot at all". I added a small function next to it that answers that with the same text rules, so no new rules logic. Nothing needed STOP. [Confirmed: src/lib/commander-pairing.ts keywordsOf]
- The deck page's card rows carry no rules text, so the slot asks the server (new `?role=second-kind` mode on the existing eligible-commanders route, reading the stored card data). [Confirmed: src/app/api/commanders/eligible/route.ts]
- A partner/background second commander was already flagged as a commander, so it already appears as a card in the Commander section; the slot chip beside it is the change/remove control. [Confirmed: src/lib/commander-card-flag.ts findCommanderCards]

## Changed files
- src/lib/commander-pairing.ts — `secondSlotKindFor` and slot labels, built on the existing keyword detection.
- src/app/api/commanders/eligible/route.ts — new `role=second-kind` mode returning the allowed slot kind.
- src/components/CommandZoneSlots.tsx — second slot only when the commander allows it (or one is already filled), labelled by kind; existing chips, popovers and remove-with-confirmation unchanged.
- src/components/CardsTab.tsx — renders the slots under the commander card(s) in the Commander section in list, groups and grid views (all group modes); companion card added to the Commander section; if there is no Commander section (no commander card, or search hides it) the slots show under a plain "Commander" heading. New `showCommandZone` prop.
- src/app/decks/[id]/page.tsx — slots removed from the header; Cards tab gets `showCommandZone` for commander formats.
- src/components/CommandZoneSlots.test.tsx, src/lib/commander-pairing.test.ts — tests (mock-only).

## Verification
- `npm run check`: exit 0; 2460 tests pass (42 skipped), typecheck clean, lint 0 errors (existing warnings only).
- New tests: slot visibility per kind (partner, partner with, friends forever, Background, Doctor's companion), none for an ordinary commander, companion slot always present (even with no commander), filled second commander shown regardless, kind detection from card text.
- Untested: everything in the browser (layout in the three views, the companion card tile and its sleeve marker, search interaction); no component test for CardsTab itself (none existed).

## New decisions made (need owner confirmation)
- Second-slot names: Partner, Partner with, Friends forever, Background, Doctor's companion ("No partner · Add" etc.). A commander that is itself a Doctor also gets the Doctor's companion slot.
- The Commander section heading count includes a filled companion (for example "Commander (3)"); the header and all deck totals still say "N cards + Companion". Easy to change if you would rather the heading excluded it.
- While a search is typed in the Cards tab, the companion card hides like any card; the slots stay.

## Assumptions
- The sleeve/proxy marker on the companion tile works from the same status data as other cards; if the companion has no status entry it will show as "available". Not verified in a browser.
- A commander that is itself a Background gets no second slot.

## Challenges to locked decisions
- none

## Process disclosures
- I edited several files with small Python scripts rather than the edit tool, and appended tests with a shell heredoc, against the file-edit rule. Contents are visible in the diff.
- The main checkout was not touched.
