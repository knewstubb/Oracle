# Handoffs for CC-21, CC-22, CC-23 (written by Gene, 2026-11-17)

Why this file exists: Gene's settings only allow it to start Kiro agents, so the owner is starting these by hand with any agent that can read the repo. Order: start CC-21 and CC-23 together (different roles, no shared files). Start CC-22 only after CC-21 is merged, because both change `src/lib/connector/tools/edit-tools.ts` and `src/lib/connector/tools/index.ts`.

Owner decision (2026-11-17): when Claude adds a card outside the commander's colours, warn and still add. Never refuse.

Each handoff is a separate paste. Use a worktree for the Developer ones.

## 1. CC-21 (Developer)

```
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task CC-21: in the Claude connector (src/lib/connector/tools/), make list_decks and get_deck return each deck's commander colours (from decks.colour_identity, one format everywhere, for example "R" or "WU"), and make add_cards_to_deck still add every card but return a warning naming each added card whose colour identity is outside the deck's colours (reuse the card facts lookup in card-facts.ts; owner decided: warn and still add, never refuse); no database change, and if one seems needed stop and report BLOCKED. Also update the tool descriptions in tools/index.ts and the connector contract only where they describe these fields.
Done when: unit tests cover a mono-red deck given a black card (added with a warning), an in-colour card and a colourless card (no warning), and a deck with no colours set (no warning, says so); npm run check shows no new failures beyond the known TIDY-01/TIDY-02.
For Brad (plain words): Claude will be told each deck's colours and will warn you when it adds a card that does not fit them.
```

## 2. CC-23 (Tester, read-only)

```
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task CC-23 (read-only): find out why Claude said there is no deck called TEST B when the owner has both TEST A and TEST B; check read-only (same signed-in, row-level-security path as docs/oracle/reports/2026-11-17-gene-cc18-live-check.md, delete any temporary script) that the list_decks tool returns TEST B for the owner today, and read src/lib/connector/tools/list-decks.ts and the tool text for anything that could hide or stale a newly created deck; do not edit product code.
Done when: your report says whether list_decks returns TEST B (with the deck id and the number of decks returned), the most likely cause, and a recommended fix or none needed.
For Brad (plain words): This asks a checker to find out why Claude could not see your TEST B deck.
```

## 3. CC-22 (Developer) — start only after CC-21 is merged

```
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task CC-22: in the Claude connector, change the add_cards_to_deck tool text (src/lib/connector/tools/index.ts and the category field in edit-tools.ts) so Claude gives every card a role category (for example Ramp, Card Draw, Removal, Board Wipes, Lands) and reuses the category names the deck already shows in get_deck, instead of leaving cards under the default "Other"; keep the default "Other" for cards where Claude passes nothing, and change no stored data. Small wording fix only: do not redesign card labels (that is RQ-12).
Done when: the tool description test shows the new instruction, a unit test shows a category passed per card is stored as given, and npm run check shows no new failures beyond the known TIDY-01/TIDY-02.
For Brad (plain words): Claude will sort the cards it adds into proper groups like Ramp and Removal instead of putting everything in Other.
```

## After they report
Send the reports back to Gene. Gene reviews, hands each to the Tester, and updates `docs/oracle/backlog-details.md`.
