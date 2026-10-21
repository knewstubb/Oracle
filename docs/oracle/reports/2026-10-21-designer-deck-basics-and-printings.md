# Report: deck-basics-and-printings
Role: designer
Status: PARTIAL
Task as received: Owner decisions on basic lands, update mockup/spec/report (new mockup file ok), brief summary. (1) The 'Generic basics' toggle is REMOVED from the import review screen; mockups should no longer show it. (2) Generic basics are a permanent, unlimited version of each basic land type, addable to any deck; specific lands are real collection cards; a deck can mix both. (3) Decklist and import review: each distinct printing is its own line and generic basics are their own line with no printing, never merged; generic lines carry a 'Generic' marker and show the default art. (4) Review screen: generic basic row offers a printing picker (optional), finish and, if the Architect confirms storage, language; a specific basic row is a normal editable row. Design the open state for both, the 'Generic' marker and a reusable printing picker. (5) Deck page swap generic ⇄ specific: sketch briefly. Flag open questions.

## Summary for the owner
The Generic basics toggle is gone from the review mockups, and basics now show as separate lines: "Island ×6 Generic", "Island ZNR 267 ×2" and so on. The new mockup shows both open rows, a printing picker that shows which finishes each printing has and works for any card, and a sketch for swapping generic and specific lands on the deck page. Language on generic lines and the swap depend on the Architect confirming how generic basics are stored.

## Changed files
- docs/oracle/mockups/deck-basics-and-printings.html — new: lists, open rows, picker, swap sketch
- docs/oracle/specs/deck-basics-and-printings.md — new spec
- docs/oracle/mockups/import-review-controls.html — toggle removed; Island sample split into generic and specific lines
- docs/oracle/mockups/deck-commander-selector.html — toggle wording removed
- docs/oracle/specs/import-review-controls.md — §14 toggle bullet struck through
- docs/oracle/reports/2026-10-21-designer-deck-basics-and-printings.md — this report

## New decisions made (need owner confirmation)
- A generic line has no Original/Proxy and no Condition; it has printing, finish and (maybe) language, applied to all its copies.
- Picking a specific printing on a generic line turns it into a specific line.
- Swap lives in each line's existing menu; limited to copies you own and that are free.

## Assumptions
- Printing lists and finish availability can come from Scryfall data [Assumption, not checked in code].
- Generic basics count as sleeved (per `vocabulary.md`).

## Challenges to locked decisions
- `manabox-import.md` Generic basics option, tooltip and focus order are superseded by the owner's decision; need marking by Scribe. Also affects `vocabulary.md` wording ("generic basics count") — still true.

## Open questions
- Architect (blocks language and swap): storage of generic basics, finish, language.
- Must you own a specific printing chosen for a generic line?
- Do swaps use only free copies?
- Split the Basics chip into Generic / Specific?

## Verification
- jsdom: review mockup loads with no script errors, one Generic tag shown and no "Generic basics" text. The new mockup is static HTML, only visually unchecked. Not viewed in a real browser.

## Rev 2 (owner answers)
Applied: generics carry art, finish and language; no existing-deck handling; specific→generic returns the copy to storage; sleeved/unsleeved on generics (collapsed tag "◇ 2 Unsleeved", open "Sleeves" line with All sleeved / All unsleeved / Sleeve n of 6; deck page line "4 sleeved · 2 unsleeved" with menu items and "Short: 2 unsleeved basics"); printing picker is image-only with no ownership needed, default art stored from the collection; swaps behave like any other card (the "free copies" assumption removed).
- Files: mockup, spec (§4, §5, §7–9) updated.
- Challenge: `vocabulary.md` "generic basics count as sleeved" is superseded.
- Open: Architect storage for sleeved counts and stored art; empty collection art fallback; number input vs picker for large counts.
- Verification: static HTML, not viewed in a real browser.

## Rev 3 (owner simplifications)
- Plain "11 Plains" starts Sleeved.
- Swap feature removed entirely (menus, panel, spec text); keep generic count +/−, Remove and Add generic basic.
- Generic sleeving is all or nothing per line: Sleeved / Unsleeved control on the review row and deck page; partial counts and "Sleeve n of 6" removed; status "Short: Island generics unsleeved".
- Files: mockup (sections 2a, 4), spec (§3–§9) updated. Verification: static HTML, jsdom-loaded, not seen in a real browser.
- Open: Architect storage (sleeved flag per line); whether the "Short" wording should be one line for all basics.
