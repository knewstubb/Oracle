# Report: import-review-controls
Role: designer
Status: DONE
Task as received: Owner requests: (1) Deck import review list: SORT control (Name A–Z / Import order; propose placement, default, interaction with the All/Proxies/Unsleeved/Basics chips and Find card; alphabetical at minimum; apply to collection import too if sensible). (2) Dismissing the amber "not matched" warning boxes on the deck review screen (3 stacked boxes eating space, each with Copy); propose a dismiss X per box and/or a collapsed one-line summary ("3 lines not matched · View · Copy all · Dismiss"); define count behaviour, recall, and that the same info shows in the result screen's "Needs a look". (3) Row affordance already decided: subtle grey hover, caret (down collapsed, up expanded) replaces Edit/Done, hand cursor, whole row clickable. (4) Button wording "Import cards" (collection) and "Import deck" (deck); commander selection moves out of the import to the deck edit page with only valid commanders selectable; remove the "Choose a commander" block from the deck result mockup and add a small "No commander yet" hint. Keep copy plain; flag open questions; brief summary.

## Summary for the owner
The review list gets a "Sort" control next to Find card, defaulting to Import order (Name A–Z is the other choice; updated 2026-10-21). Several "not matched" lines collapse into one line with View, Copy all and a dismiss ✕, and a footer link brings dismissed notes back; the result screen still lists them. Rows now show a grey hover with a caret on the right, the buttons read "Import cards" / "Import deck", and the deck result just says "No commander yet. Choose one on the deck page." Please answer the open questions below.

## Changed files
- docs/oracle/mockups/import-review-controls.html — new live mockup: sort, chips, Find, collapsible notes with dismiss/restore, row hover and caret, footer wording; deck and collection toggle
- docs/oracle/mockups/import-stage-screens.html — deck result now shows the "No commander yet" hint (there was no commander block in my earlier mockup to remove)
- docs/oracle/specs/import-review-controls.md — new spec
- docs/oracle/specs/import-stage-screens.md — added §4.5 deck result note
- docs/oracle/specs/import-row-editing.md — rev 5 note: caret replaces Edit/Done
- docs/oracle/reports/2026-10-21-designer-import-review-controls.md — this report

## New decisions made (need owner confirmation)
- Sort sits right of the chips, before Find card; default Import order for deck and collection (owner answer 2026-10-21); not remembered across imports; sort is applied after chips and Find; basics sorted in with the rest.
- One unmatched line = single box with Copy and ✕; two or more = one-line summary with View, Copy all, ✕.
- Dismiss only hides for this review; counts stay in the footer; "Show hidden notes (n)" restores; result screen always shows them.
- Tokens-skipped and value notices also get ✕.
- Caret button is the keyboard control; the whole-row click is a mouse/touch convenience.
- Commander hint is quiet grey info, not amber.

## Assumptions
- Existing chips (All, Proxies, Unsleeved, Basics for deck), Find card and unmatched notices as in `ImportCardList.tsx` and `ImportNoticeLine.tsx` [Confirmed: those files]. Collection shows only All and Proxies in my mockup [Approximate].
- Row file position is available on the review row for Import order sorting [Approximate].

## Challenges to locked decisions
- D-052 (commander picker opens straight after a deck import) — owner has moved commander choice to the deck edit page — supersede D-052; D-046 still holds.

## Open questions
- Answered 2026-10-21: default Import order, not remembered, basics sorted in.
- Collapse threshold is 2 unmatched lines; should it be 3?
- Is the footer "Show hidden notes" link an acceptable way to recall dismissed notes?
- The deck edit page needs its own design (valid commanders only, and how it prompts "No commander yet" after the dialog closes). Not specified here.

## Verification
- jsdom load of both mockups, no script errors: Import order is the default; Name sort gives Aether Gale … Strix Serenade; clicking a row expands it; dismiss shows "24 cards · 3 not matched · Show hidden notes (1)" and restore brings the note back; button reads "Import deck"; the stage mockup's deck result shows the commander hint.
- Not viewed in a real browser; layout and hover not visually confirmed.
