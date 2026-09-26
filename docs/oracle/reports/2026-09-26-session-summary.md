# Session Summary — 2026-09-26

## Headline

We finished the maybeboard import fix, locked the last importer decisions, and started the final Milestone 1 fix so copy assignments match exact card printings.

## What changed in the app and why

### Maybeboard and sideboard cards now import correctly
- **What:** When you import a deck from Archidekt, cards marked as Maybeboard or Sideboard now appear in Oracle's maybeboard area instead of being dropped.
- **Why:** Before this fix, those cards were simply lost during import, so your maybeboards in Oracle were incomplete.
- **Impact:** Imported decks now keep their full card list. Maybeboard cards stay on the maybeboard, are not counted as part of the main deck, and are not assigned to physical copies.

### New-cards import keeps maybeboard cards planned only
- **What:** If you import a deck using "I just acquired these cards" mode, maybeboard and sideboard cards are added as planned maybeboard slots but do not create new collection entries.
- **Why:** Maybeboard cards are ideas, not committed deck slots, so they should not be treated as newly owned cards.
- **Impact:** Your collection only grows with cards that are actually in the main deck or command zone.

### The app no longer asks for repeated permission to access agent workspaces
- **What:** opencode now has a config file that allows it to read files inside Paseo worktrees without prompting you every time.
- **Why:** Constant permission dialogs were slowing down work and adding friction.
- **Impact:** When an agent writes a report in its workspace, you can read it smoothly without clicking allow repeatedly.

### You can now trigger a session summary manually
- **What:** Typing `/scribe` tells the Session Scribe to write or update the plain-language summary for the current session.
- **Why:** You should be able to get a recap whenever you want, not just when the Orchestrator decides to close a session.
- **Impact:** You can ask for a fresh summary at any point, like this one.

## Decisions made

- **D-018:** Archidekt maybeboard and sideboard cards both import into Oracle's maybeboard relation.
- **D-019:** Archidekt proxy labels are not automatically honoured during import.
- **D-020:** Import does not run an automatic allocation pass; unassigned slots stay planned.
- **D-021:** Copy assignments must match the exact printing. Instance-level accuracy is a core principle.
- **D-022:** In new-cards import mode, maybeboard and sideboard cards are added as planned maybeboard slots only and do not create collection copies.

## Blockers or risks

- Nothing is blocked. T-21 is the last active task in Milestone 1.

## What's next

- **T-21:** Update the importer so it only assigns a physical copy when the exact printing is owned. If the deck wants a specific edition and you only own a different edition, the slot stays unassigned until you manually place the right copy.
- After T-21, Milestone 1 is complete and work moves to the **AI advisor** in Milestone 2.
