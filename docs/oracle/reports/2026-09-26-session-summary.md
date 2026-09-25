# Session Summary — 2026-09-26

## Headline

We merged all finished agent work into Oracle, tested it against the owner's real Archidekt collection, locked four product decisions, and set up tools so future sessions close with a simple summary.

## What changed in the app and why

### Deck card suggestions are now safer
- **What:** The app can no longer run a hidden command that clears every card placement across all active decks at once.
- **Why:** That command was dangerous. A single mistake could undo a lot of careful assignment work.
- **Impact:** When you build or edit a deck, suggestions appear as suggestions only. Nothing moves unless you explicitly choose it.

### The Allocation Tab now shows real suggestions from your collection
- **What:** The Allocation Tab — the screen where you pick which physical copy of a card fills a deck slot — now pulls live suggestions from your actual collection.
- **Why:** It was still using an outdated table that did not reflect your real cards or current deck assignments.
- **Impact:** When you open a card's picklist, you will see free copies in storage, copies already used in other decks, and the option to print a proxy — all ranked in a useful order.

### The collection rollup points to real cards
- **What:** The collection rollup view now links to the actual physical cards you own instead of temporary placeholder IDs.
- **Why:** Placeholder IDs were stand-ins that did not match real cards, so the rollup could be misleading.
- **Impact:** When you click into a card's detail panel from the rollup, you see the real copy and where it is assigned.

### Every deck placement remembers how it got there
- **What:** Each card in a deck is now tagged as manually placed by you, suggested by the AI, or imported from Archidekt or Moxfield.
- **Why:** Without this label, there is no way to tell later whether a placement was your decision, the app's suggestion, or part of an import.
- **Impact:** This is mostly behind the scenes for now, but it will power future features like undoing AI suggestions, filtering by source, or showing why a card is where it is.

### AI features were reviewed for safety
- **What:** We checked what information the AI advisor and brew helper can currently access when helping with decks.
- **Why:** Before expanding AI features, we want to make sure the AI only sees appropriate data and gives reliable, structured advice.
- **Impact:** No visible change yet, but the review cleared the path for the AI advisor work planned next.

### Card recommendation research
- **What:** We looked into a tool called Jev that could speed up card recommendation suggestions.
- **Why:** The upcoming AI advisor will suggest cards for your decks, and Jev might make those suggestions faster and cheaper to run.
- **Impact:** No visible change yet. This is preparation for the advisor feature coming in the next phase.

### The app was tested against real data
- **What:** We imported the owner's real Archidekt collection and all 41 decks into Oracle and compared them card by card.
- **Why:** Milestone 1 is about trustworthy data. Before moving on, we needed to know how Oracle compares to the source of truth.
- **Impact:** We now know collection counts and main-deck lists match perfectly. We also know exactly what still needs work: maybeboard/sideboard cards are missing, and the importer needs to respect exact card printings.

## Decisions made

- Tool logs and temporary review files should be ignored, not saved as part of the project.
- The old bulk-clear assignment function stays removed.
- **D-018:** Archidekt maybeboard and sideboard cards will both import into Oracle's maybeboard relation.
- **D-019:** Archidekt proxy labels will not be automatically honoured during import.
- **D-020:** Import will not run an automatic allocation pass; unassigned slots stay planned.
- **D-021:** Copy assignments must match the exact printing. Instance-level accuracy is a core principle.

## Blockers or risks

- Nothing is blocked. Two small importer fixes are queued but do not prevent the app from being used.

## What's next

- **T-20:** Update the deck importer to bring maybeboard and sideboard cards into Oracle.
- **T-21:** Update the deck importer to assign copies only when the exact printing is owned.
- After those fixes, Milestone 1 can be formally exited and work begins on the **AI advisor** in Milestone 2.
- Future sessions can be summarized at any time by typing `/scribe`.
