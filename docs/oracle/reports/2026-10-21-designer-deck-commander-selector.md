# Report: deck-commander-selector
Role: designer
Status: PARTIAL
Task as received: Owner answers: sort default is Import order (for both deck and collection; change mockup/spec). Sort not remembered across imports. Basics sort in with the rest. Q4 (collapse threshold) pending owner explanation; keep 2. Commander picker on the deck page: it's the screen where cards are marked original/proxy; add a commander selector next to the deck name (valid commanders only, searchable list from the deck's cards, with a clear "No commander" state, and partner/background handling if second commander applies). Add this to a short spec + mockup; flag if the existing deck page needs a different spot. Brief summary.

## Summary for the owner
The review list now sorts by Import order by default, with Name A–Z as the alternative. The deck page gets a commander selector under the deck name: click it, search the deck's cards (only valid commanders are listed), pick one, or choose "No commander". Partner and Background pairs are designed, but can't be built until the Architect confirms how a second commander is stored, so the status is partial.

## Changed files
- docs/oracle/mockups/deck-commander-selector.html — new live mockup: selector states, popover, partner and background slots
- docs/oracle/specs/deck-commander-selector.md — new spec
- docs/oracle/mockups/import-review-controls.html — sort default Import order, option order swapped
- docs/oracle/specs/import-review-controls.md — default, copy and questions updated; commander pointer
- docs/oracle/reports/2026-10-21-designer-import-review-controls.md — sort default updated
- docs/oracle/reports/2026-10-21-designer-deck-commander-selector.md — this report

## New decisions made (need owner confirmation)
- Selector sits under the deck name beside the format badge; the old "Choose commander" action button goes away. This is a different spot from today (the far-right action group), so the header's name block changes.
- The deck opens with the selector visible but not auto-opened after an import.
- A second slot appears only for Partner or Choose a Background commanders; it lists compatible cards only; changing the first commander drops an incompatible second one.
- "No commander" is a plain grey outline state, not amber.
- Step 2 opens automatically after picking a partner-capable commander.

## Assumptions
- Existing picker already searches the deck and checks eligibility, and the deck page only stores a single commander [Confirmed: `CommanderPicker.tsx`, `src/app/decks/[id]/page.tsx`].
- A leadership schema (partners, backgrounds) exists in migrations; whether it is deployed is unknown [Confirmed: migrations present; deployment not checked].

## Challenges to locked decisions
- D-052 (picker opens straight after a deck import) — owner moved commander choice to the deck page and wants only a hint on the result — supersede D-052.

## Open questions
- Architect (BLOCKS partner/background build): deployed state of `deck_leaderships`, how a second commander is saved and read, and what eligibility returns for partner pairing.
- Should the import's "Open deck" auto-open the selector (D-052 behaviour) or leave it closed (proposed)?
- Should "Search all cards" add a commander who is not in the deck to the deck, as the current picker does?
- Collapse threshold for not-matched notes remains 2 until the owner explains the preference.

## Verification
- jsdom load of the selector mockup, no script errors: opening lists 4 valid commanders plus No commander; choosing Thrasios shows "Add partner" and a partner-only list (Tymna); choosing Tymna shows two slots; No commander clears both.
- Review mockup now starts on Import order.
- Not viewed in a real browser.
E

## Rev 2 (owner correction and additions)
Task: selector belongs on the import review screen next to the deck name (reusable on the deck page later); on deck review: move Generic basics into the "Importing as" bar, "N rows not matched", remove the subtitle and the "131/100 · commander picked next" line, replace the finish banner with inline markers.
- Updated: `specs/deck-commander-selector.md` (§3 placement), `mockups/deck-commander-selector.html` (now shows the review header), `specs/import-review-controls.md` (§14, wording), `mockups/import-review-controls.html` (basics toggle, commander chip beside name, dashed ↻ finish markers, "rows not matched").
- Supersedes my earlier deck-page placement and the "commander on the deck page" hint; D-052 still to be superseded.
- Open: what 131/100 warned about; touch devices have no tooltip; Developer to confirm eligibility can run before the deck exists; result-screen hint now only when no commander chosen.
- Verified in jsdom only (no script errors; basics toggle, 4 finish markers, "rows not matched" present). Not seen in a real browser.
