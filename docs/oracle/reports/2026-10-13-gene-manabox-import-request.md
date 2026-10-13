# Report: manabox-import-request
Role: Gene
Status: DONE
Task as received: "Update Importer — initial imports via ManaBox CSV (collection and decks); deck import needs a format; each import marks cards Original or Proxy (default Original); deck import can convert basic lands to generic." Owner answers: 1. individual cards, do not use the file's Proxy column; 2. pick commander after, one deck at a time; 3. a choice, default to adding new cards; 4. yes (Snow-Covered and Wastes included).

## Summary for the owner
Your import changes are recorded as agreed rules and added to Phase 5 ("Getting cards in") as three tasks: a plan, screen designs for your review, then the build. Nothing has started, because Phase 3 is the current phase.

## Changed files
- docs/oracle/decisions.md — D-044 to D-048 (owner-approved answers)
- docs/oracle/status.md — Phase 5 section with T-53, T-54, T-55
- docs/oracle/samples/manabox/ — the owner's three sample CSVs for agents to test against

## New decisions made (need owner confirmation)
- D-044–D-048, approved in conversation 2026-10-13.

## Assumptions
- Commander and Maybeboard are both set after import, because the ManaBox deck file has neither.

## Challenges to locked decisions
- none. D-045 matches D-019; D-047 matches the existing new_cards mode and D-031.

## Open questions
- Should the basics-to-generic switch be on or off by default? T-54 will propose a default.
- Should Phase 5 start before Phase 3 finishes?

## Verification
- Read the sample CSVs: the 2026-10-13 export has Signed, Proxy and Added columns; the 2026-06-05 export has no Proxy column; the Strix deck export has no Added column and contains 8 basic-land rows.

## Follow-up 2026-10-13 16:06 — ManaBox text exports
Owner asked whether ManaBox deck text exports can be used and how likely they are to miss cards; then approved accepting either format and skipping tokens. Recorded as D-049; T-53/T-54 scope updated; Armageddon.txt and Strixhaven.txt added to the samples folder.
Verification: all 186 lines from the two text files were looked up on Scryfall by set + collector number in batches: 186 found, 0 not found. 3 were tokens (Drake TFDN, Map TLCI, Inkling TSOS). The 6 name differences were double-faced cards listed by their front name only.

## Follow-up 2026-10-13 16:07
Owner: start the importer now, before Phase 3 finishes; basics-to-generic on by default (D-048 updated). T-53 (Architect) and T-54 (Designer) launched in parallel; T-55 waits for both approvals.

## Follow-up 2026-10-13 18:47 — owner answers to T-54 questions
Owner: "1. Yes. Deck and collection imports are different things 2. For a deck import there should be three options: Original, Proxy, Unsleeved. This should cover all options 3. Yes for language, not for condition 4. Yes 5. Straight away 6. After import. We can have a foil checkbox". Recorded: D-047 revised (per-card Original/Proxy/Unsleeved replaces the deck-level switch), D-050 to D-052 added. Gene's reading of answer 6: a Foil checkbox on text-file rows during import review; to be confirmed when the owner sees the revised mockup. Owner also asked about the row checkboxes (bulk selection); explained that generic basics are not physical cards, so there is nothing to mark.
Gene answered T-54 G4 (keep existing non-ManaBox collection CSV layouts) and G5 (spinner is enough) from the repo.

## Follow-up 2026-10-13 19:19 — colours
Owner asked for a teal Original button; Gene flagged the clash with Proxy teal (D-043). Owner: "Isn't proxy blue? Proxy blue and original a mint". Recorded D-053; sent to T-54 Designer. Owner could not find the Foil checkbox: it shows only in the text-file example; asked Designer to make that example easy to find.
