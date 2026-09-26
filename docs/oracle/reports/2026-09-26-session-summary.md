# Session Summary — 2026-09-26

## Headline

We completed Milestone 1 by deploying all pending database changes, and Oracle is now ready to move into the AI advisor phase.

## What changed in the app and why

### Maybeboard and sideboard cards now import correctly
- **What:** When you import a deck from Archidekt, cards marked as Maybeboard or Sideboard now appear in Oracle's maybeboard area instead of being dropped.
- **Why:** Before this fix, those cards were simply lost during import, so your maybeboards in Oracle were incomplete.
- **Impact:** Imported decks now keep their full card list. Maybeboard cards stay on the maybeboard, are not counted as part of the main deck, and are not assigned to physical copies.

### Exact printing matching is now enforced
- **What:** When the importer assigns a physical card to a deck slot, it now checks that the owned copy is the exact same printing listed in the Archidekt deck. If not, the slot stays unassigned.
- **Why:** A core principle of Oracle is instance-level accuracy: you should know exactly which physical copy is in which deck.
- **Impact:** Your deck assignments now match your real cards edition-for-edition. Basic lands are treated as fungible, so any Forest/Mountain/etc. of the same name works.

### The app now tells you when a printing is mismatched
- **What:** If you own a card but not in the edition the imported deck wants, the conflict reason now says `printing_mismatch` instead of a generic shortfall.
- **Why:** This makes it clear whether you are missing a card entirely or just need to assign a different edition.
- **Impact:** Easier to spot and fix edition mismatches when importing decks.

### All database changes were deployed
- **What:** Nine pending migrations were applied to the live database, including the fixes for maybeboard import, exact printing, placement source tracking, and removal of the old bulk-clear function.
- **Why:** The code and the live database had drifted apart; the new features could not work until the database was updated.
- **Impact:** Oracle's live data now matches the app's current behaviour. Milestone 1 is complete.

## Decisions made

- **D-018:** Archidekt maybeboard and sideboard cards both import into Oracle's maybeboard relation.
- **D-019:** Archidekt proxy labels are not automatically honoured during import.
- **D-020:** Import does not run an automatic allocation pass; unassigned slots stay planned.
- **D-021:** Copy assignments must match the exact printing. Instance-level accuracy is a core principle.
- **D-022:** In new-cards import mode, maybeboard and sideboard cards are added as planned maybeboard slots only and do not create collection copies.
- **D-023:** Basic lands are fungible during import; exact-printing matching does not apply to them.
- **D-024:** A `printing_mismatch` conflict reason distinguishes edition mismatches from true missing cards.

## Blockers or risks

- Nothing is blocked. Milestone 1 is complete.

## What's next

- **Milestone 2 — AI advisor v0** is now the current milestone.
- The first M2 tasks are:
  - **T-15:** Contract for advisor tools (what data the advisor can see and how suggestions are grouped)
  - **T-16:** UX/UI spec and mockup for the advisor chat beside the deck view
  - **T-19:** Finish Jev research for fast card recommendations
- Future sessions can be summarized at any time by typing `/scribe`.
