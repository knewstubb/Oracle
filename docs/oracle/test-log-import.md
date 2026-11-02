# Import test log

Source of steps: `docs/oracle/test-protocol-import.md` (unchanged; the full wording for each step lives there).
How this works: the tester gives one stage at a time in chat (about 5–8 checks). The owner replies Pass, Fail or Note per step. The tester records the result here straight away, so nothing is tested twice. A Fail stops that stage until it is sorted; other stages that don't depend on it can go on.

Result key: ⬜ not tested · ✅ pass · ❌ fail · 📝 note only · ⏭ skipped

## Stages

| Stage | Covers (protocol steps) | Needs | Depends on | Status |
|---|---|---|---|---|
| 0 Setup | Setup | Purge database, start app | none | ✅ |
| 1 Collection file import | A1–A3 | Save switch OFF | 0 | ✅ |
| 2 Collection save and page | A4–A5 | Save switch OFF | 1 | ✅ |
| 3 Deck import: screens and sources | B1, B2 | Save switch OFF | 2 | ✅ |
| 4 Deck import: links | B3, B3b, B3c, B4 | Save switch OFF, internet | 2 | ❌ |
| 5 Review rules | C0–C7 | Save switch OFF | 2 | ⬜ |
| 6 Other formats and headings | F1–F7 | Save switch OFF | 2 | ⬜ |
| 7 Partners and companions (screens) | G1–G3 | Save switch OFF | 2 | ⬜ |
| 8 Saving: built deck from collection (main scenario) | D1–D5 | Save switch ON | 2, 5 | ⬜ |
| 9 Saving: planned, bought, double click | D6–D8 | Save switch ON | 8 | ⬜ |
| 10 Saving: precon and link | D9–D11 | Save switch ON | 9 | ⬜ |
| 11 Generic basics on deck page | E1–E5 | Deck from D7 | 9 | ⬜ |
| 12 Partners and companions (saved) | G4–G6 | Save switch ON | 7 | ⬜ |
| 13 Clean-up | H | none | all | ⬜ |

Order tip: stages 1–7 need the switch OFF, 8–12 need it ON, so the switch changes only once.

## Step results

| Step | Result | Date | Owner's note / what was seen |
|---|---|---|---|
| Setup | ✅ | 2026-10-29 | Owner confirmed complete |
| A1 | ✅ | 2026-10-29 | |
| A2 | ✅ | 2026-10-29 | Finish control is not shown for Arcane Signet. By design: the app hides finish when a printing has only one. Test wording was wrong, now fixed. |
| A3 | ✅ | 2026-10-29 | |
| A4 | ✅ | 2026-10-29 | |
| A5 | ✅ | 2026-10-29 | |
| B1 | ✅ | 2026-10-29 | |
| B2 | ✅ | 2026-10-29 | Passed after fixes: counts consistent (footer only), loading says 100, file line and collection line removed, Back button added. Colourless icon check dropped by owner. "Change" behaviour replaced by Back. |
| B3 | ❌ | 2026-10-29 | Passed: layout, deck loads, commander, bad links give friendly errors. FAIL: footer said 110 cards · 114 printings · 10 basics, with the 20 maybeboard cards mixed in and nothing marking them. Error for the wrong site named only Archidekt and Moxfield. Both fixed (see queue). |
| B3b | ✅ | 2026-10-29 |  |
| B3c | ⬜ | | New: maybeboard display |
| B4 | ✅ | 2026-10-29 |  |
| C0 | ⬜ | | |
| C1 | ⬜ | | |
| C2 | ⬜ | | |
| C3 | ⬜ | | |
| C4 | ⬜ | | |
| C5 | ⬜ | | |
| C6 | ⬜ | | |
| F1 | ⬜ | | |
| F2 | ⬜ | | |
| F3 | ⬜ | | |
| F4 | ⬜ | | |
| F5 | ⬜ | | |
| F6 | ⬜ | | |
| F7 | ⬜ | | |
| G1 | ⬜ | | |
| G2 | ⬜ | | |
| G3 | ⬜ | | |
| D1 | ⬜ | | |
| D2 | ⬜ | | |
| D3 | ⬜ | | |
| D4 | ⬜ | | |
| D5 | ⬜ | | |
| D6 | ⬜ | | |
| D7 | ⬜ | | |
| D8 | ⬜ | | |
| D9 | ✅ | 2026-10-29 | Done early in stage 3: deck has 100 cards, commander set, collection up by 100 (10 → 110). Not repeated. |
| D10 | ⬜ | | sleeved items / maybeboard handling: |
| D11 | ⬜ | | |
| E1 | ⬜ | | |
| E2 | ⬜ | | |
| E3 | ⬜ | | |
| E4 | ⬜ | | |
| E5 | ⬜ | | |
| G4 | ⬜ | | |
| G5 | ⬜ | | |
| G6 | 📝 | | known gaps: note only |
| H | ⬜ | | |

## Open failures

- B3: maybeboard cards mixed into the main count and unmarked. Fixed in code, awaiting re-test.

## Test-plan corrections

- The save switch only blocks "I built it" and "I'm planning it". "I bought it" always saves, so Import is NOT disabled for precons. Stage 3 should have said so. After the early Eldrazi import, every absolute collection total in later stages is +100 (D's "starts at 10" is now 108 on the collection page; 110 including the 2 proxies). The protocol has been updated, and D9 is marked done.

## Re-test queue

- 2026-10-30: the review screen was rebuilt to the simplified design (Card origin + Type, "What's this deck?" asked after the deck loads, precons not locked). B1, B2 and B3b changed in the protocol and need a re-test. C1–C3, C7 and D1–D5 are rewritten. Earlier passes on B1/B2 cover the parts that didn't change (tabs, modal size, precon list).
- B3c (replaces the earlier B3 re-test): see the updated B3c in the protocol. All = every card, Deck = main deck, Maybeboard = the 20; the footer follows the selected chip.
- Heads-up for F1: the old wording said maybeboard cards "show as maybeboard" but nothing marked them. The tag and chip now do.

## Owner decision needed

- (Replaced 2026-10-30 by the simplified design: no Add tick; each card has Card origin and Type.) (Decided 2026-10-29, option 3) Add to collection tick now shows on every card, unticked by default on built and planned decks. Original and Proxy stay greyed out on a card you don't own until you tick it. Applies to all three choices. Needs re-test in stage 5 (C1).

- Sideboard chip: locked decision D-018 puts sideboard cards in the maybeboard, so the app can't tell them apart. A Sideboard chip would need that decision reopened. Not built.
