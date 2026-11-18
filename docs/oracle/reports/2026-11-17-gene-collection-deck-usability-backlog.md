# Report: collection-deck-usability-backlog
Role: Gene
Status: DONE
Task as received:
> I have some more things to add to the backlog:
> - Select storage location in the collection page. There should be a row of 'locations' above the list that can be switched between with a fixed 'all cards' option. Proxies should be here too
> - Clicking on a card should open a modal where key details can be updated
> - I should be able to drag and reorder decks
> - Audit the header bar for decks. It could be better refined
> - Add the ability to click on a deck name and rename
> - Reviwe the icons used on decks in the library
> - Standardise buttons systemwide
> - Audit the tools menu
> - Speed up deck loading
> - Status icons are text when they first load in a new deck
> - Move deck health to bar next to the slot usage bar and remove the footer
> - Show locations of cards in the collection view
> - Audit the deck pages (workbench/analysis/etc)
> - Shift the header to a side bar in the deck view
> - Allow card count to be edited
> - Incorporate sideboard

## Summary for the owner
All 16 requests are on the backlog, including the location row with All cards and Proxies. Nothing has been started or changed in the app; the related deck-layout requests are linked so they can be designed together.

## Changed files
- docs/oracle/status.md — added UX-01 through UX-16, with phase filing, responsible roles and approval notes; preserved existing uncommitted content.
- docs/oracle/reports/2026-11-17-gene-collection-deck-usability-backlog.md — recorded the request and its disposition.

## New decisions made (need owner confirmation)
- None. IDs and phase filing are administrative, not approval of designs, implementation or priority changes.

## Assumptions
- This request is for backlog capture only, not permission to start work.
- The click-to-edit modal is filed under Collection, following its placement immediately after the collection request; confirm broader scope when briefing.
- Card-count editing remains open as to collection quantity, deck quantity, or both; no behaviour chosen.
- Related layout requests are cross-referenced, not given artificial execution dependencies.

## Challenges to locked decisions
- None raised or changed. UX-16 notes that distinct sideboard behaviour may require an owner-approved amendment to D-018/D-022, which currently route imported sideboard cards to Maybeboard. [Confirmed: docs/oracle/decisions.md]

## Open questions
- For the future brief: which key details belong in the card modal?
- For the future brief: where should editable card quantities be available?
- For the future brief: what should Sideboard do differently from Maybeboard?
- No answers are required to retain these items in the backlog.

## Verification
- Read the existing backlog and current roadmap before filing; no priority or phase transition made.
- Checked all 16 owner requests map one-to-one to UX-01 through UX-16, retaining the explicit All cards, Proxies, slot-usage placement and footer-removal requirements.
- Documentation only; no application or database changes, tests not needed.
