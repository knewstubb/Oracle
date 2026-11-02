# Report: import-row-editing
Role: designer
Status: DONE (rev 2)
Task as received: Design and mock up the import screen row-editing flow for Oracle (the card import list: rows with checkbox, quantity, card name + set code/number, and Original/Proxy counters on the right). Owner-approved direction: per copy Original/Proxy, Finish (non-foil/foil/etched), Condition (NM/LP/MP/HP/DMG), Language; condition stays in import; defaults set once at the top ("Importing as: Non-foil · Near Mint · English" with Change), file values used automatically; collapsed row replaces the counters with a single Edit button plus tags only for values that differ from defaults; expanded row has one line per physical copy (example: 3 Rehearsed Debater = Original NM / Proxy / Original Foil LP), each duplicable or removable, with "Apply to all copies"; bulk "Set finish / condition / language" for ticked rows; goal: not visually complicated. Deliverables: HTML mockup (collapsed default / tags / mixed, one expanded row, defaults bar, bulk bar), short spec, report. Flag open questions. No app code changes.

## Summary for the owner
Rev 4: Duplicate and Remove are gone from every copy line; quantity is fixed by the file and only attributes are editable. Dropping a card and the Undo message no longer exist.

Rev 3: the "From your file" line is replaced by a tiny dot on each value that came from the file (tooltip "From your file"); it adds no height and disappears when you edit the value.

Rev 2 applied: copy lines now read Original/Proxy · Language · Finish · Condition; Proxy shows only Language; the footer row is gone and apply-to-all is a small icon on copy 1; bulk shows "Mixed"; your edits override file values; (the drop-card/Undo part was superseded in rev 4). 

Dropping the counters works: a normal row is just name plus Edit, and only exceptions get small tags ("Foil", "LP", "1 Proxy"). Open the mockup and try Edit on Rehearsed Debater, tick rows for the bulk bar, and press Change on the defaults bar. Please decide the open questions below, mainly what the Original/Proxy buttons show in the bulk bar when ticked rows have mixed copies.

## Changed files
- docs/oracle/mockups/import-row-editing.html — live mockup: defaults bar, collapsed rows (plain, tagged, mixed), expanded row, bulk bar with popover
- docs/oracle/specs/import-row-editing.md — spec with all required sections
- docs/oracle/reports/2026-10-20-designer-import-row-editing.md — this report

## New decisions made (need owner confirmation)
- Rev 3: file marker is a 6 px dot on the field corner; bulk and apply-to-all edits also clear it; collapsed rows have no marker. The dot is a hint only: the tooltip and screen-reader text carry the meaning (colour is not used).
- Rev 2: apply-to-all kept, as a ⇊ icon on copy 1's line only (no extra row).
- Rev 4: Duplicate and Remove are gone; the list is not editable (quantity is fixed by the file). This supersedes the earlier drop-card and Undo decisions.
- Tags are capped at 3, then "+N more"; order is Proxy, finish, condition, language; mixed rows use counts ("1 Proxy").
- Copies you haven't set follow the defaults bar; changing defaults later updates only those.
- Bulk popover fields start at "Leave as is"; bulk finish and condition skip proxies.
- Quick whole-row Proxy becomes: tick row, then Proxy in the header (the per-row Original/Proxy control and stepper are removed).
- Deck imports get "Unsleeved" as a third type on each copy line (carrying D-047 across).

## Assumptions
- Existing stored condition is null for proxies (`CopyCondition` allows null) [Confirmed: docs/oracle/contracts/allocation-suggestion-engine.types.ts].
- Defaults bar also needs a type default (Original, D-045); I left it out of the bar to keep it as the owner worded it.
- Hiding Finish and Condition on proxies is display only; condition is stored as none, and any file-supplied condition or finish on a proxy copy is ignored for display.

## Challenges to locked decisions
- D-051 — rows are split by language, but per-copy language means one row can hold mixed languages — keep file-based splitting, and let the owner's edits stay in the row; owner to confirm.
- D-045/D-047/D-053 — not contradicted; but this redesign supersedes the rev 6 control and inline stepper in `manabox-import.md`, which needs updating after approval.

## Open questions
- Answered: Mixed label, edits override file values, the list is not editable. Still open: does the ⇊ icon read clearly?
- What finish should proxies store (finish is hidden for them)? Architect.
- Does the Architect's import row type need to change from one condition/language per row to per-copy values? Needed field: `copies[]` each with `isProxy`, `finish`, `condition`, `language`. Blocks Developer, not this mockup.
- Strict AA: the set code uses tertiary grey (~3.5:1); switch to secondary?

## Verification
- Rev 4 jsdom check — no Duplicate/Remove buttons anywhere, expanded Rehearsed Debater shows 3 lines with one apply-to-all icon, no script errors. Not checked visually in a browser.
- Rev 3 jsdom check — expanded Rehearsed Debater shows 2 dots (Foil, LP on copy 3), no "From your file" line, and changing Foil clears one dot. Not checked visually in a browser.
- jsdom load of the mockup (rev 2) — no script errors; line fields order lang,finish,cond for Originals and lang only for Proxy; no footer element; bulk demo selection shows Mixed.
- Browser screenshot — not run (Playwright browsers not installed); visual layout not checked in a real browser.
- Contrast ratios computed by hand from token hex values, not a tool.
