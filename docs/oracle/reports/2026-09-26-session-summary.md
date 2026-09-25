# Session Summary — 2026-09-26

## What happened

We took all the work the agents had finished in their separate workspaces and brought it back into the main Oracle app. This means the app now has the latest fixes and features for managing your card collection and decks.

## What changed in the app and why

### Card assignment suggestions are now safer
- **What:** The app can suggest which physical card copy should fill a slot in a deck, but it no longer has a hidden "wipe all assignments and start over" function.
- **Why:** That old function was risky — it could undo a lot of careful placement decisions at once. Removing it protects your deck assignments.
- **Impact:** When you build or edit a deck, the suggestions you see are read-only until you explicitly choose one. Nothing gets reassigned unless you say so.

### The Allocation Tab uses live suggestions
- **What:** The Allocation Tab (where you pick which copy of a card goes into a deck) now uses the live suggestion engine instead of an old frozen table.
- **Why:** The old table did not reflect your actual collection or current deck assignments.
- **Impact:** When you open a card's picklist, you will see real options: free copies in storage, copies already used in other decks, or the option to print a proxy. The ranking is clearer and matches your actual cards.

### Collection rollup shows real cards
- **What:** The collection rollup view no longer uses fake placeholder IDs. It now shows the real IDs of your physical cards.
- **Why:** Placeholder IDs were temporary stand-ins that did not match real cards, which made the rollup unreliable.
- **Impact:** When you look at a card in your collection rollup and open its detail panel, the app points to the actual copy you own.

### Every card placement now remembers its source
- **What:** The app now tracks whether a card was placed in a deck manually by you, suggested by the AI, or brought in from an import.
- **Why:** This makes it possible to tell at a glance why a particular copy is where it is, and it supports future features like undoing AI suggestions or filtering by how cards were assigned.
- **Impact:** Deck assignments are now labeled with their source. This is mostly behind the scenes today, but it unlocks smarter advice and clearer history later.

### AI features were audited
- **What:** We reviewed what data the AI advisor and brew helper can currently access.
- **Why:** Before expanding AI features, we need to make sure the AI only sees what it should and returns structured, trustworthy suggestions.
- **Impact:** No immediate visible change, but the audit identified what needs to be tightened before the AI advisor work begins.

### Jev research for card recommendations
- **What:** We looked into a tool called Jev that could help classify card recommendations quickly.
- **Why:** The AI advisor will eventually suggest cards for your deck, and Jev might make those suggestions faster and cheaper.
- **Impact:** No visible change yet. This is background research for the advisor feature coming in Milestone 2.

### New Session Scribe agent
- **What:** We added a new agent whose only job is to write these plain-language session summaries.
- **Why:** You should not need to decode developer reports to understand what happened in a session.
- **Impact:** From now on, every session should end with a simple summary like this one, focused on what changed in the app and why it matters to you.

## Decisions made

- Local tool logs and review files should be ignored by git, not saved as part of the project.
- The old bulk-clear assignment function stays removed.
- The Moxfield importer keeps its newer, safer flow for now. Placement-source labels for Moxfield imports will be added later.

## What's next

- The next major step is the **M1 exit test**: we will import your real Archidekt collection and decks, then compare the results to Archidekt to confirm counts, deck lists, and card assignments match.
- After that, work begins on the **AI advisor** in Milestone 2.
- Future sessions will close with a Session Scribe summary.
