# Report: owner-answers-2026-10-10
Role: Gene
Status: DONE
Task as received:
1. There should be undo but no need for explicit confirmation
2. Scryfall is fine for now
3. Yes to all three
4. Reconsile should be for original prints only. I want to know if i am using a card in multiple decks with proxies but inly have one original copy.
5. I think we need to remove the retired concept for now
6. Lets remove missing for now
7. Yes
8. Yes. Any physical card removed from a deck list should return to storage
9. Not sure what the casual concept is
10. Yes if they are important
11. yes
12. I have not clicked through

## Summary for the owner
Your answers are now recorded as decisions. The roadmap shows the AI advisor stage as current, with undo for AI changes and Scryfall prices included. All the important planning notes are now saved. Four follow-up tasks are on the to-do list but not started, and three small questions remain.

## Changed files
- docs/oracle/decisions.md — new D-034 to D-039; D-029 changed (retired concept removed for now); D-028 and D-002 notes updated.
- docs/oracle/roadmap.md — M1 marked COMPLETE and M2 CURRENT; M2 now uses labelled Scryfall prices and includes undo for AI changes; M3 wording adjusted to match.
- docs/oracle/status.md — owner answers noted on T-15, T-28 and T-29; T-24 draft note marked superseded; O-006 resolved; O-008 updated; new TODO tasks T-36 to T-39.
- docs/oracle/reports/2026-10-10-gene-owner-answers.md — this report.
- Saved to history together with the main folder's previously unsaved docs (answer 10): decisions D-025 to D-033, the three review plans, the card-tagging plan and taxonomy, the 2026-09-29 to 2026-10-02 reports, and labels marking older comparison and roadmap docs as historical.

## New decisions made (need owner confirmation)
- Recorded from the owner's answers, so already confirmed: D-034 (direct AI changes plus undo), D-035 (Scryfall estimate prices), D-036 (advisor defaults), D-037 (Reconcile is the original-copy shortage view), D-038 (proxy records the requested printing), D-039 (removed copies return to storage). D-029 was changed to remove the retired concept.
- Gene interpretation, please check: "original prints only" was read as **original copies, not proxies**, rather than "one particular printing". Matching per printing is left as an open question.

## Assumptions
- Answer 10 ("if they are important"): every unsaved file in the main folder was a planning, decision or report document, and all were judged important. No app code was among them.
- The Developer task to change Reconcile (T-37) waits for the Designer spec (T-29), because showing originals owned, proxies used and originals needed changes what the page looks like (owner gate 2).

## Challenges to locked decisions
- none (D-029 change and the new decisions are owner-directed)

## Open questions
1. Copies already marked Missing (T-38, T-28 G-D1): after Missing is removed, should they count as owned and available again, or be removed from the collection?
2. Reconcile (D-037): should cards you own **no** original of, but use as proxies in two or more decks, also appear? Should matching be per printing?
3. Casual decks (T-28 G-O1): in the app, "Casual" is a format choice on the New Deck screen meaning "no rules — just a container for cards", with no size limit and no commander [Confirmed: src/lib/format-config.ts]. Should a Casual deck simply always count as a complete list, so it is Playable once every card is sleeved?
- Owner still to do: the Collection click-through checklist in the I-01 report.

## Verification
- Read-back of the edited lines in decisions.md, roadmap.md and status.md.
- `git status` after saving: no docs left unsaved.
