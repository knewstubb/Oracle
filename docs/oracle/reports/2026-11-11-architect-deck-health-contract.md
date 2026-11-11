# Report: deck-health-contract
Role: Architect
Status: DONE
Task as received: Write the Phase 2 technical contract for 'Deck health' (no app code, no migrations applied, no hosted-database writes; read-only DB queries ok; write only the contract and your report). Contract must define: (1) per-commander role target data and its derivation, cache, refresh rules and thin-data fallback; (2) verdict rules (Light at 2 or more short; generic roles until a strategy exists; Strategy row 'Not set yet'); (3) per-card role result, colour-identity filter, groups (spare, in another deck, buy ideas) and price rules; (4) API shapes for the panel and chat, reusing check_owned_copies and browse_spare_copies; (5) health route fix (user filter, stop passing oracleText: null) and what is replaced or deleted; (6) locked decisions touched and conflicts; (7) tests per slice incl. separate test account rule; (8) a 3 to 5 slice plan, first smallest, with plain-language acceptance checks. Save to docs/oracle/contracts/deck-health-phase2.md and this report.

## Summary for the owner
The contract is written. Two things I found change the plan: the code that reads EDHREC's popular cards is broken against the live site (it returns nothing), and the current card-role guesser mislabels many cards, so the contract replaces both. It needs one new small table, which I have only drafted; it must not be applied until you approve. One behaviour question for you is below.

## Changed files
- docs/oracle/contracts/deck-health-phase2.md — the Phase 2 contract (new)
- docs/oracle/reports/2026-11-11-architect-deck-health-contract.md — this report (new)

## New decisions made (need owner confirmation)
- Four roles only in Phase 2: ramp, draw, removal, wipes. Other roles hidden until Phase 4 (matches spec).
- General guide numbers: ramp 10, draw 10, removal 6, wipes 2 (the low end of today's built-in ranges).
- Thin data starting rule: under 50 EDHREC decks, or under 60 usable cards, or under 40% coverage, or not found. Needs a 15-commander sample before it ships.
- Deck verdict is computed on request, not stored; old `deck_health` rows are ignored, not deleted.
- New shared reference table `ref_commander_role_targets` (no `user_id`, deliberate; public data).

## Assumptions
- [Confirmed] EDHREC live JSON shape, slug rule (front face only) and coverage numbers come from read-only fetches of 7 commanders on 2026-11-11.
- [Approximate] Partner-pair slug order (both orders returned 200), thin thresholds, the Atraxa example numbers, and "typical 0" wording.
- I did not open the mockup HTML; the spec and designer report were used.
- `ref_cards.default_category` was not used as a source, because the owner chose card-text classification.

## Challenges to locked decisions
- none. Notes: D-034 would allow undoable direct AI changes; Phase 2 stays read-only per the brief. status.md says `ref_build_cards` has 150 rows; the database has 450 (Scribe to fix).

## Open questions
**Q1. How should "typical number" be worked out?** EDHREC only lists cards in at least about 5% of decks, so counting listed removal cards for Atraxa gives about 3, though a full deck holds more.
1. (Recommended) Scale up to a full deck. Example: Atraxa shows "Removal 3 of 4 typical", and 2 of 4 is Light. Labelled as an estimate from EDHREC.
2. Count only the popular cards listed. Example: Atraxa "typical 3"; Light almost never triggers.
3. Use the general guide for roles (removal 6) and use EDHREC only for type counts. Example: every commander shows "Removal 6".

**Q2. When EDHREC can't be reached (not "no data"), what should the panel say?**
1. (Recommended) Show the last saved numbers marked "may be out of date"; if none, the general guide with "Couldn't reach EDHREC, using the general guide".
2. Always show the general guide.
Example: you open a deck while EDHREC is down.

Also for the Designer: wording for a role whose typical number is 0, and "Average is N" vs "General guide".

## Verification
- Read-only SQL on hosted project (`ref_cards`, `ref_commander_builds`, `decks`, `deck_health`, etc.) — counts recorded in the contract.
- Read-only public EDHREC fetches (7 commanders, 3 slug probes) — shapes and coverage recorded.
- No app code changed, no migration applied, no database writes. Tests not run (nothing built).
