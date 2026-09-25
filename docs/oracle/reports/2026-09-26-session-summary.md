# Session Summary — 2026-09-26

## Headline

We made Oracle's card assignment features safer and more accurate, added clearer tracking for how cards end up in decks, and set up an automatic note-taker for future sessions.

## What changed in the app and why

### Deck card suggestions no longer risk wiping your work
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

### Sessions will now get automatic plain-language summaries
- **What:** We added a Session Scribe whose only job is to write summaries like this one at the end of each session.
- **Why:** You should not need to read developer reports to understand what happened.
- **Impact:** Future sessions will end with a short, app-focused summary explaining what changed and why it matters.

## Decisions made

- Tool logs and temporary review files should be ignored, not saved as part of the project.
- The hidden bulk-clear assignment function stays removed.
- The Moxfield importer will keep its current safer flow for now. Placement-source labels for Moxfield will be added later.

## Blockers or risks

- Nothing is blocked. The Moxfield importer does not yet record placement sources, but that is intentional and can be addressed when the importer is next worked on.

## What's next

- The next step is the **M1 exit test**: import your real Archidekt collection and decks, then compare the results to Archidekt to confirm card counts, deck lists, and assignments match.
- After that, work begins on the **AI advisor**.
- Future sessions will close with a Session Scribe summary.
