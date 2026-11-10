# Report: gene-signoff-next-slices
Role: Gene
Status: DONE (documents only; nothing dispatched, synced, migrated or written to any database)
Task as received: Read AGENTS.md, role files, the 2026-11-04 plan and the V-01/V-02/V-03 reports. (1) Review the revised contract against C1-C10 and sign off or return; (2) set the brief status to approved; (3) fix stale "ten pending migrations" lines in status.md and mark V-01/V-02/V-03 done (V-02 PARTIAL); (4) record the V-03 maybeboard default and the empty-builds finding; (5) write the next handoffs (V-04, V-05, V-09 can start; V-06 needs A2; V-10 needs A3). No sync, migration or database write.

## Summary for the owner
The written trial plan is now signed off and the three first look-only steps are done. Your two decks were copied safely, and the online database already has all the waiting import changes. One finding matters: none of the 1,885 style lists (builds) online has any cards in it, so the three lists the trial needs must be loaded from EDHREC before anything per-build can happen. Nothing has been loaded or changed. I need three answers from you, listed at the end.

## 1. Contract review against C1–C10: SIGNED

| # | Verdict | Where in the contract |
|---|---|---|
| C1 | Resolved. False "no delete" claim withdrawn; delete-and-reinsert named; scope limited to the 3 builds | §1.4, §1.3 Builds row, §6 item 5 |
| C2 | Resolved. Commander and theme filters, dry run, add/replace report, before/after counts required | §1.4 steps 1–4 |
| C3 | Resolved. W1, W2, M1 use the no-deck seed; decks only for §5.6 and planted combos | §4B.2, §5.2, §5.6 |
| C4 | Resolved. Two Archidekt decks, fixed rule (all non-land non-commander cards, whole), printing id only for lookup (D-003) | §5.6 |
| C5 | Resolved. No vector index, exact scan, ~18,850 rows | §2.2, §7 |
| C6 | Resolved as a structure (ordering rule, options 1 and 2). Its facts are now overtaken by V-02 (see condition a) | §1.5, §6 |
| C7 | Resolved. Drafter never sees the arm; drafts hidden for the 10 comparisons; edit rate reported | §5.2 |
| C8 | Resolved. Dated freeze file before any pool exists, full contents list, combo lists appended by harness | §5.9 |
| C9 | Resolved. Pointer to V-01…V-22 | §9 |
| C10 | Resolved. Only the two named decks, read-only; bulk pulls out | §5A |

Stale-phrase search by the Architect shows only deliberate "withdrawn" mentions remain. I accept the design as before.

**Sign-off conditions** (Architect applies them inside V-04/V-09; no re-sign needed; recorded in the contract's status line, which now reads "SIGNED by Gene, 2026-11-06"):
- (a) **Facts overtaken by V-02.** §1.1 "Migration backlog" row, §1.5 ordering rule and the header still describe the ten import migrations as waiting and hosted access as unavailable. Per V-02 §4 all ten are applied; the trial migration sorts after 20261023170200 and there is nothing to wait for. pgvector online is still unverified. V-09 corrects the text in the contract it touches. Until then the V-02 report wins.
- (b) **Sync atomicity.** The delete-then-insert is not atomic as written. V-05 must confirm this and either make each build's replace all-or-nothing or document the recovery (re-run for the same named builds), and report which.
- (c) **L-deck fixtures (§5.7).** Architect's assumption is accepted: the owner's deck plus planted combo pieces.
- (d) **Signing is not authority to run.** A1 covers only Zombies, Aristocrats and Artifacts; A2/A3/A4 remain separate gates.

No challenges to locked decisions.

## 2. Brief status
`docs/oracle/briefs/vector-recommendation-trial.md` line 2 now reads APPROVED by the owner at Gate 1 on 2026-11-04.

## 3. status.md
- Line 8: "ten migrations NOT applied" replaced with "all ten applied (V-02 §4)". T-57's migration is separate and still not applied (it sorts before the ten; its fate is an open item, see below).
- V-10's dependency no longer says "pending import migrations settled".
- V-01 DONE (signed), V-02 PARTIAL (pgvector awaits an owner dashboard look), V-03 DONE. Section header and findings paragraph updated.
- The old plan report (2026-11-04) still contains the stale "ten NOT applied" line; I left it as a dated record. status.md is the current source.

## 4. Findings recorded
- **Empty builds.** V-02: all 1,885 builds have 0 cards (`ref_build_cards` has 0 rows; `ref_edhrec_recommendations` also 0). Build sync (V-05, V-06) is required and per-build work stays blocked until it is done and checked. It is unblocked once V-05 exists and the owner approves A2. Why the table is empty is unknown; since nothing is stored, a first run replaces nothing.
- **Maybeboard default (V-03).** The two decks include maybeboards (52 and 44 cards). Default: when filtering "already in the deck", maybeboard cards are **ignored** (they do not count as in the deck). Not yet confirmed by the owner; asked as Q1 below. The fixtures keep them labelled, so the freeze (V-04) can apply either rule.
- **Name ambiguity (V-02 §5).** 223 card names map to more than one card id, 131 involving real cards. V-08 must use the id, never a bare name, and count ambiguous names as unresolved.
- **Two-faced and masked names (V-03).** One Mendicant card name arrives masked; match by printing id.

## 5. Handoffs, ready to send (not run)
Run each with `paseo run "<text>" --provider <provider/model> --new-workspace worktree --title "<ID>"` after the owner has answered the relevant question. V-04, V-05 and V-09 write to different files (freeze file; sync script; migration draft) and can run at once. V-05 is the only Developer slice and runs on branch `trial/vector-recommendations`.

```
V-04
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-04: Write the dated freeze file (contract §5.9, all nine items) and the grading-sheet format (§5.2), using docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md, docs/oracle/reports/2026-11-06-developer-v03-archidekt-pull.md and the fixtures in trial/vector/fixtures/ as inputs; state the maybeboard rule as "maybeboard cards are ignored" unless Gene tells you otherwise.
Done when: the freeze file is dated, lists every §5.9 item (combo lists marked "appended later by the harness"), and the sheet format shows no arm, rank or source hint.
For Brad (plain words): This asks for the test cards and rules to be written down and locked before any result exists, so the test cannot be bent to suit the answer.
```

```
V-05
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-05: On branch trial/vector-recommendations, add commander and theme filters (only Wilhelt: zombies, aristocrats; Mendicant: artifacts) and a dry-run report of build and card-list rows to be added or replaced to scripts/sync-edhrec-builds.ts per contract §1.4; confirm whether the per-build delete-then-insert is atomic and make it all-or-nothing if that is small, otherwise document the recovery; do not run it against any database.
Done when: a dry run that makes no database writes lists exactly the three target builds and their rows, the atomicity answer is in the report, and npm run check passes.
For Brad (plain words): This asks for the build-loading tool to be made able to load only your three styles, with a preview first, and not to run it yet.
```

```
V-09
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-09: Draft the trial migration, its reverse script and generated types from contract §2.2, §4A.2 and §6 (draft only, apply nothing; the file sorts after 20261023170200, since V-02 showed all ten import migrations are applied) with a plain-language note on what changes, whether it can be undone and what could go wrong, including the case where the similar-card feature is unavailable online; also correct the stale migration and hosted-access text in contract §1.1, §1.5 and the header.
Done when: the migration sorts after every existing one, the reverse script drops only trial objects, the note is written, and the contract text matches the V-02 report.
For Brad (plain words): This asks for the one change to how data is stored to be written up for your approval, not applied.
```

**Held until approved (do not send yet)**
```
V-06  (send only after owner approval A2 is recorded with its date, and V-05 is DONE and checked)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-06: Run the V-05 filtered build sync for exactly Wilhelt (Zombies, Aristocrats) and Mendicant (Artifacts): dry run first with its output attached in your report, then the real run only after Gene has read the dry run and confirmed; owner approval A2 (dated in docs/oracle/status.md) covers only those three builds.
Done when: the three builds have card lists, before and after row counts for every build table match docs/oracle/reports/2026-11-06-architect-v02-kickoff-checks.md §1 except for the three builds, and nothing else changed.
For Brad (plain words): This asks for the three style lists to be loaded into the shared card data, after you have said yes.
```
```
V-10  (send only after owner approval A3 is recorded, V-09 is DONE, and the pgvector check is known)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-10: Rehearse the V-09 migration and its reverse script on a throwaway database, then apply it to the target the owner chose at A3 and report; the A3 approval (dated in docs/oracle/status.md) names the target.
Done when: the rehearsal and the real apply both succeed, the report lists the new objects, and no existing table changed.
For Brad (plain words): This asks for the approved storage change to be tried safely first and then applied.
```
V-10 cannot start until the V-02 pgvector check is done and the answer is yes (or Brad picks the throwaway local copy, which needs new software installed).

## 6. Owner approvals and answers needed now

**Recommend: answer Q1 and Q2 now. A2 and A3 are for later.**

**Q1 (quick). Your wish-list ("maybeboard") cards.** Both decks have a maybeboard (52 and 44 cards). When the trial checks "is this card already in your deck", should the maybeboard cards count as in the deck? My default is **no, they are ignored**: a card sitting on your wish list can still be suggested. If you say yes, those cards would be hidden from suggestions as if already included.

**Q2 (two minutes, your screen). One setting online.** Please open the Supabase website for the Oracle project, go to Database, then Extensions, search for "vector", and tell me whether it is listed and whether it says enabled. **Do not click Enable.** It tells us whether "find similar cards" can work on your online data. If it is missing, we would need a local copy (which means installing extra software) or to pause.

**A2 (needed before the three style lists are loaded; I will ask again with the preview once the loading tool is ready).** "May I replace the card lists of exactly three styles (Wilhelt Zombies, Wilhelt Aristocrats and Mendicant Artifacts) with fresh copies from EDHREC? Those three lists currently hold 0 cards, so nothing that exists today is lost. Nothing else is touched: not your cards, not your decks, not any other commander's styles. You will see the exact list of what changes before the real run. If it goes wrong we simply load them again." Why now: it is the longest wait in the trial and the loading tool takes some time to prepare.

**A3 (not yet; asked with a plain-language note once the Architect has drafted it).** "May I add a few small trial-only storage areas to your online database, switching on the similar-card feature if needed? They hold public card information only, and one prepared undo step removes them (with your approval at the time). Practised on a throwaway copy first." Depends on Q2.

**Also pending from earlier (no change):** A1b skim of the freeze file after V-04 (about 10 minutes); A4 data downloads (later); A5 confirm the trial may run beside "Use what I own"; A6 block about 2 hours for grading.

## Changed files
- docs/oracle/contracts/vector-trial-2026-11.md — status line only: now "SIGNED by Gene, 2026-11-06" with conditions; no design text changed
- docs/oracle/briefs/vector-recommendation-trial.md — status line: owner-approved at Gate 1, 2026-11-04
- docs/oracle/status.md — stale migration lines fixed; V-01, V-02, V-03 marked; findings and dependency update
- docs/oracle/reports/2026-11-06-gene-signoff-next-slices.md — this report

## New decisions made (need owner confirmation)
- Maybeboard cards ignored when filtering "already in deck" (Q1).
- Signing the contract with sign-off conditions rather than another round-trip, because the remaining issues are factual updates the Architect is already touching in V-09.

## Assumptions
- The Architect's V-02 reads are accurate; I did not re-run them. Reads used the existing service key (SELECT only); Tester may repeat them on a read-only role.
- The contract status-line edit is a sign-off marker, not a spec change.

## Challenges to locked decisions
- none

## Open questions
- Why `ref_build_cards` is empty for all builds (cleanup or failed run?); not needed to proceed.
- T-57's migration (sorts before the ten, replaces a function newer work may have superseded): keep, re-date or retire? Separate owner decision, not part of the trial.
- The Tester is not yet scheduled for V-05; its checks (T-1 part) run on the V-05 diff once Developer reports.

## Verification
- Read AGENTS.md, Gene base and project files, the plan, the three reports, and the contract sections for §1.1, §1.3–§1.5, §2.2, §4B.2, §5.2, §5.6, §5.9, §6, §9 (grep for stale phrases and status lines).
- Re-read the edited lines in status.md, the brief and the contract header; confirmed no other "ten pending" wording remains in status.md (grep).
- No sync, migration, script or database access was run.
