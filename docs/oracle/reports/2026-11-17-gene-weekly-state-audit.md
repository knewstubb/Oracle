# Report: weekly state audit
Role: Gene
Status: DONE
Task as received: "I have just completed a bunch of random work over the past week that i have not tested properly. Can you do the following: Audit the state of work. I feel that there may be some partially completed work that needs to be tidied up. Write in plain english. Check the backlog and ensure that this work is logged on it so it is not lost. Create a comprehensive testing plan for all the work that has been recently created."

## Summary for the owner
Almost everything from the past week is built, saved and live, and the automatic checks nearly all pass (3,432 of 3,433). What is left is small: one failing check, one file that only exists on an old side-branch, and a lot of screens nobody has clicked through yet. All of it is now on the backlog, and a step-by-step test plan is written.

## Where things stand (what you would see in the app)

**Finished and live**
- Picklist: Add to Picklist, Add all, Found it, Placed it, Can't find it, I checked here, Undo, Cancel, the all-decks page, In your hand and Missing pages. Database parts are live. [Confirmed: supabase/migrations 20261116032532 to 20261116035529, listed on the hosted database]
- Import: deck destination, box or binder destination, and now "Add all to the Picklist" on the result screen (only cards that import put in Unsorted). [Confirmed: commit 01e52f1]
- Storage page fixes, collection value above 1,000 cards, large ManaBox imports. [Confirmed: git log 16 Nov]
- Words: "Sleeved/Unsleeved" now read "In deck/Planned" everywhere you see them. [Confirmed: commits 790b19e, e6cc699]
- Claude connector: read, safe edits with Undo, on/off switch, setup guide, card facts, live deck health (8-second limit with a labelled fallback), collection search and summary, ownership list, set-category tool. Rules recorded as D-034a. [Confirmed: status.md CC-04 to CC-07]
- Deck health now counts cost reducers (like Sapphire Medallion) as ramp. [Confirmed: commit f777102]
- Data protection fixes (CC-03a/b/c/d) are live.

**Partly done or loose ends (all now on the backlog)**
1. One automatic check fails (TIDY-01): it expects Claude's deck description to mention a price estimate; the slimming work removed that.
2. Four type errors in a Picklist test file (TIDY-02). Harmless to users, but they stop a clean check.
3. A live database change (closing last public-access gaps) has its file and undo script only on an old side-branch, not on the main code line (TIDY-03). Risk: it could be lost when the branch is cleaned up.
4. Four old side-branches and four unsaved reports are lying around (TIDY-04).
5. Claude's category tool is built, saved and live in the database, but was only tested on a throwaway copy, never through Claude itself. The backlog did not mention it (CAT-01).
6. Open question to you: should the action word "Sleeve" change too? (WORDS-02). Decisions record also needs the In deck / Planned update after your approval.
7. Deck health ramp count: Basalt Monolith never confirmed, utility-land question unanswered (RC-01).
8. The Claude click-through and live search/health scenarios were never run (TEST-01, TEST-02).
9. The status file had a stale line saying a finished branch was "not merged"; corrected.

**Waiting on you, not forgotten:** category management screen and suggested categories (briefs drafted, not approved), card-facts for ~100 cards (CC-10), game logging (CC-08, last), card-labels overhaul (RQ-12), import cleanup brief, parked older work (shared badges T-26, phase 2 fact checks C-01 to C-07).

## Changed files
- docs/oracle/status.md — corrected CC-04d line; added tidy-up and testing backlog (TIDY-01 to 04, CAT-01, WORDS-02, RC-01, TEST-01/02)
- docs/oracle/test-plan-2026-11-17.md — new plain-English test plan
- docs/oracle/reports/2026-11-17-gene-weekly-state-audit.md — this report

## New decisions made (need owner confirmation)
- IDs TIDY-01..04, CAT-01, WORDS-02, RC-01, TEST-01, TEST-02 chosen by Gene.

## Assumptions
- [Approximate] Hosted migration list lacks CC-03c, CC-03d and connector sign-in migrations; earlier reports say they were applied by another route and tested, so I treated them as live.

## Challenges to locked decisions
- none

## Open questions
- Action word "Sleeve": change or keep?
- Which failing check is right in TIDY-01: restore the price wording, or drop the check?

## Verification
- npx vitest run — 3,432 passed, 1 failed (registry-and-isolation, get_deck description), 46 skipped
- npx tsc --noEmit — only the 4 AddToPicklist.test.tsx errors
- Hosted migration list read (read-only); git branches and logs reviewed
