# Report: hc-01-default-ranges
Role: Developer
Status: DONE
Task as received: Build slice HC-01 of categories-drive-deck-health: the six rows and verdicts in the rail and in Claude's health read, computed from today's card-reading classifier with no stored data, using the shared health code; Game Plan as the remainder with no range and no verdict; EDHREC as an optional reference line; remove the old "Well covered" / "N short" verdict path and EDHREC-as-target only where the audit's HC-01 row says; update connector tool wording only as far as HC-01 and HC-02 require; Claude's health read returns the same six rows as the rail. Double-faced land line, uncategorised note. No migration, no hosted write.

## Summary for the owner
The Deck health part of the deck page rail now shows six rows: Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes / Mass Disruption and Game Plan & Win Conditions. The first five say Light, Ok or Heavy against the Command Zone ranges; Game Plan is a plain total. Yedora the Explorer reads Lands 37 Ok, Ramp 18 Heavy, Card Advantage 6 Light, Targeted Removal 6 Light, Board Wipes 0 Light, Game Plan 34. A rot to process reads 38 Ok, 9 Light, 7 Light, 7 Light, 3 Ok, 37. Claude's health read returns the same six rows and numbers. Nothing is stored; no decision is needed from you, but see "New decisions" below.

## Changed files
- src/lib/deck-health.ts — six rows, default ranges, Light/Ok/Heavy, Game Plan remainder, notes, double-faced lands, mana sources; the old "Well covered" copy is gone
- src/lib/deck-health-gap.ts, deck-health-chat.ts, deck-chat-prompt.ts — follow the new row shape (chat code kept, wording fixed)
- src/components/deck-rail/RailHealth.tsx, DeckHealthPanel.tsx, deck-health-parts.tsx (new), GapDetail.tsx, HealthStrip.tsx, HealthPill.tsx — rail rows, details panel, embedded gap list
- src/lib/connector/tools/get-deck-health.ts, index.ts, edit-tools.ts, deck-strategy-read.ts — one shared health object; tool wording
- docs/oracle/contracts/connector-card-facts-and-deck-health.types.ts — note comment
- tests: deck-health, chat, gap, connector live, strategy-window, edit-tools, DeckRail, deck page, panel, strip, gap detail
- docs/oracle/reports/evidence/hc-01-rail/ — screenshots, Yedora and A rot to process at 1280 and 390 px

## New decisions made (need owner confirmation)
- Overlap note reads "2 cards count in more than one row, so the rows add to 101" (the design said "in two rows"; a card can be in three).
- Notes order: mana sources, ranges line, could-not-place, overlap (spec order).
- Cards with no card text go in Game Plan with a note (your direction; the audit differed). "Couldn't fully check" warning at over 10% stays.
- Double-faced land detection uses the type line ("Spell // Land"), skipping cards whose text says "transform". It can still miss or wrongly include a rare card, because no layout column exists.
- Mana sources count a double-faced card once even if it is also ramp.

## Assumptions
- Light is any count below the minimum (old rule needed two short).
- Header line counts the five ranged rows only.

## Challenges to locked decisions
- none

## Flags: audit vs code
- Audit says remove `GENERAL_GUIDE` and `roleState` in HC-08; they are kept, marked deprecated, and no longer read by health.
- HealthStrip (footer strip) is mounted nowhere; adapted to the new shape rather than deleted (not in the HC-01 delete list).
- Design report said double-faced lands could not show until HC-06; built now as the task asks.
- The gap list is shown inside a Light row's panel (the design said "unchanged"); I added an embedded mode that hides its duplicate heading and back button.
- Connector still waits up to 8 s for EDHREC (reference only now). Could be dropped later.
- In-app chat prompt wording lightly updated; the chat is still paused.

## Open questions
- Header line "1 of 5 in range" and shared amber for Light/Heavy were built as designed; confirm in the design review.

## 5-minute test (Yedora the Explorer, then A rot to process)
1. Open the deck. In the left rail under Deck health, read six rows. Yedora: 37 Ok, 18 Heavy, 6 Light, 6 Light, 0 Light, 34 Total. A rot: 38 Ok, 9 Light, 7 Light, 7 Light, 3 Ok, 37 Total, plus the note "99 cards in the list. 2 cards count in more than one row, so the rows add to 101."
2. Open a row (for example Ramp): range, "Default. The Command Zone template.", first six cards and "and 12 more". Open Card Advantage: a list of cards that could fill it appears. Press Escape: focus returns to the row.
3. Open Game Plan: no range, no verdict, quiet "about 25 to 30" note.
4. Ask Claude "how is the deck health": it should list the same six rows and numbers, say Game Plan has no verdict, and treat EDHREC as reference only.

## Verification
- Full vitest in worktree: 337 files passed, 4223 tests passed, 0 failed. Main baseline: 1 failure (upgrade-engine property test, flaky; passed on rerun).
- tsc: only the 4 known AddToPicklist errors. eslint: 249 problems (1 error, the known PicklistV2) on both main and this branch.
- Browser (headless Chromium, dev server from the worktree on port 3000, restarted): both decks at 1280 and 390 px, 0 console errors, rail 304 px at desktop, no rail button under 44 px, focus goes to the panel title on open and back to the row on Escape. Numbers match the audit section g. Screenshots in evidence/hc-01-rail/.
- Not run: screen reader pass; no migration or hosted write.
