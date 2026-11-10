# Report: gene-signoff-amendment
Role: Gene
Status: DONE
Task as received: Sign or return the V-04b and V-06c amendments; decide the Tester's four soft findings (V-04c); update status.md; commit trial work on trial/vector-clean only; copy the 11th import commit to import/review-polish; write handoffs for V-07, V-08 and V-11 onward, plus plain-language A3 and A4 wording. Full plan, no scope cut. No migration, no database write.

## Summary for the owner
The test's look-alike cards are now sealed and the "key cards" rule is fixed, so blind grading can go ahead. I signed both changes and decided the four small points the checker raised; one more small tidy-up (one card swap) is queued for the Architect. The last import-screen change is now copied onto the import branch, and the test work is saved on its own branch. Nothing is needed from you today. The first approval you will be asked for is A3 (adding the similar-card storage online), once one small safety tidy-up is done.

## 1. Sign-off
- **V-06c (seed = top 8 stored cards by synergy):** SIGNED. The rule is deterministic (synergy, then inclusion, then name), ignores the flag, has the under-5 fallback, and the Tester confirmed the contract text matches. [Confirmed: `reports/2026-11-06-tester-v04c-check.md` check 6]
- **V-04b (sealed key, 36 slots, hash in freeze file):** SIGNED. Hash and rules checks pass; sheet has no section column. The key hash is final only until V-04d (one swap), which needs a dated amendment per freeze §9.
- Signature line added to the contract header (Update 6).

## 2. Decisions on the four soft findings (slot ids only; Gene has not opened the key)
- **A. M-T02, reason overstated. Decision: swap.** Replace the M-T02 pick with the M-R03 pick (M-R04 if the Architect finds a fault); the old M-T02 pick is dropped, not kept as a reserve. New key hash and a dated freeze amendment.
- **B. W-T01, arguably useful. Decision: keep as a low-confidence exposed trap.** Mark it `confidence: low` in the key. It is reported separately and counts in no pass/fail gate (neither numerator nor denominator of gate 4).
- **C. Flip contrast rests on trial rankings. Decision: that is the intended meaning.** A contrast pick is not "in the stored build list"; it is a card the style's public data expects and the other style's does not, scored only against the trial's own rankings (contract §5.8 says so). Consequences: (1) reasons for F-01, F-03, F-04, F-05 are reworded to say "public-data contrast", with no claim about stored lists; (2) F-06 sits in both stored lists and the Wilhelt fixture deck, so it cannot contrast anything: replace F-06 with F-R01 (exposed reserve), or F-R02, after the Architect confirms it is in neither stored list nor fixture mainboard; (3) F-04 and F-05 are not on the fixture mainboard, so the earlier note that they are in the deck is corrected to "in the fixture file only"; (4) F-01 and F-03 appear in three public EDHREC test files in the repo; harmless, not owner-facing.
- **D. Stale copies in the original folder. Decision: scrubbed.** The four differing files (contract, freeze file, sheet format, V-04 report) were overwritten there with the scrubbed versions from the clean worktree. They remain uncommitted in the original folder. Other differing copies: none.
- **Extra (Tester's minor observation):** the sheet-format context table says W1 holds "the 10 Wilhelt trap rows" and W2 none. Decision: reword to remove the per-list trap count (done by the Architect in V-04d); trap rows may sit in either Wilhelt list.

## 3. Branch work
- **trial/vector-clean:** the V-04b, V-06c and V-04c edits plus the BR-1 report and this report are committed on that branch only (no push, no merge). The sealed key is committed with them (names inside; the branch must not be pushed or shared without the owner knowing). Note for the record: the earlier docs commit 8174382 holds the old, pre-scrub trap names; they are the already-exposed originals, so blinding is not weakened, but never push that history.
- **import/review-polish:** 11th commit f01ad66 cherry-picked as 649ad52 (3 files, 103 insertions, 36 deletions). Before doing it I checked: that worktree was clean, its tip had not moved, the original folder's tip had not moved over 20 seconds, and no agent processes were running except the Paseo app itself. Nothing else touched. I did not rerun the full check.
- The original folder was left with AGENTS.md and status.md modified and the old copies, uncommitted.

## 4. Handoffs, ready to send (not run). Send from inside the clean worktree
Folder: oracle_app-trial-clean. Order: V-04d and V-09b and V-08 together (different files; the Developer works only in code); then V-07 (with the V-04d re-check) after V-04d is DONE.

```
V-04d
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-04d: In the clean trial worktree, apply Gene's decisions in docs/oracle/reports/2026-11-06-gene-signoff-amendment.md section 2 (swap M-T02 for M-R03, mark W-T01 confidence low, replace F-06 with F-R01 or F-R02 after checking stored lists and fixture mainboards, reword F-01, F-03, F-04, F-05 reasons, remove the per-list trap count from the sheet format), update the key hash with a dated freeze §9 amendment, and name no card in any message or report (slot ids only).
Done when: the key hash in the freeze file matches the new key file, the five changes are made, and one short report lists slot ids, the new hash and the checks you ran.
For Brad (plain words): This asks for one weak look-alike card to be swapped and a few labels fixed in the sealed test file, without showing you any cards.
```

```
V-09b
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-09b: In the clean trial worktree, edit docs/oracle/contracts/drafts/vector-trial/20261106120000_vector_trial_tables.sql as specified under V-09b in docs/oracle/reports/2026-11-06-gene-review-v04-v05-v09.md (plain create policy, no drops, header line about applying that file only, note that a second model needs a new migration); change nothing else, apply nothing.
Done when: the draft contains no drop statements, the reverse script is unchanged, and a short report confirms it.
For Brad (plain words): This asks for one small safety tidy-up to the written storage change before I ask for your approval of it.
```

```
V-08
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-08: In the clean trial worktree, write the unit-tested functions mapping card names and printing ids to oracle_id for the W/U/B pool, the two fixture decks and the three loaded build lists, per V-08 in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3 (read-only on the database; unmatched names listed, never guessed; no trap or sealed name read or printed).
Done when: at least 99% of the pool and of each build resolves, unmatched names are listed, npm run check passes, and one short report states the figures.
For Brad (plain words): This asks for the card-matching step that makes sure every card in the test is the right card.
```

```
V-07
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task V-07: In the clean trial worktree check the loaded build lists read-only (three builds, 50 non-basic cards each, 150 rows, no duplicates, positions 0 to 49, nothing else changed, per docs/oracle/reports/2026-11-06-developer-v06-dry-run.md), and also re-verify after V-04d: key hash against the freeze file, and the swapped slots M-T02 and F-06 (legal, in colours, right wrong-function reason, not in stored lists or fixtures); slot ids only, no card names.
Done when: one short report gives pass or fail per check with evidence and says nothing was written.
For Brad (plain words): This asks for an independent check that the three style lists loaded correctly and that the swapped test cards are sound.
```

**Held until A3 and A4 (not unblocked now, so not sent):**

```
V-10 (send only after A3 is recorded with date and target, and V-09b is DONE)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-10: In the clean trial worktree, rehearse the draft in docs/oracle/contracts/drafts/vector-trial/ and its reverse script on a throwaway database (return any SQL fault to the Architect, do not edit the file), then apply that file alone, never a blanket push, to the target named in A3 in docs/oracle/status.md.
Done when: rehearsal and real apply both succeed, the report lists the new objects, and no existing table changed.
For Brad (plain words): This asks for the approved storage change to be tried safely first and then applied.
```

```
V-11 (send only after V-08 and V-10 are DONE and A4 is recorded)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-11: In the clean trial worktree, load the base card-meaning arm per V-11 in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3, writing only into the new trial tables, and fill the Scryfall and model snapshot fields of the freeze file.
Done when: about 18,850 rows are stored with text hash, model version and snapshot date, a re-run creates no duplicates, and the report lists counts and the unresolved list.
For Brad (plain words): This asks for the trial's card-meaning numbers to be created and stored in the new trial storage.
```

```
V-13 (send only after V-10 is DONE and A4 is recorded; may run beside V-11 only if they touch different files)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-13: In the clean trial worktree, load the Commander Spellbook bulk file per V-13 in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3, writing only into the new trial tables, and fill the Spellbook snapshot field of the freeze file.
Done when: every kept combo's pieces resolve and are legal, stale rows are not deleted, and the report lists counts and the dropped combos.
For Brad (plain words): This asks for the list of known card combos to be loaded into the new trial storage.
```

V-12 (send after V-11 is DONE) and V-14 onward follow the same shape and are written when their predecessor reports DONE; none is unblocked before A3 and A4.

## 5. Owner approvals
**Needed from you now: none.** Next, in this order:

**A3. Add the similar-card storage online.** Ask once V-09b is DONE. The written change lives in the clean trial folder:

`/Users/bradknewstubb/Developer/Personal/oracle_app-trial-clean/docs/oracle/contracts/drafts/vector-trial/`

> **Recommend: approve.** May I add a "similar cards" ability to Oracle's online database, plus a few small storage areas that only the trial uses?
>
> **What you would see.** Nothing changes on any screen. Behind the scenes, three new empty storage areas appear (one for card meanings, two for combos). They hold public card information only. Your collection, decks and the three style lists we loaded are not touched.
>
> **Practice first.** I will try it all on a throwaway copy and show you the result before doing the real one.
>
> **Can it be undone.** Yes, with one prepared undo that removes only these new areas. Using it deletes the trial's storage, so I would ask you again first.
>
> **What could go wrong.** The similar-card ability might not be switched on online; then the change stops with a clear message and nothing is added. Only this one change is applied, never "everything waiting".
>
> **Options.** (1) Recommended: do it online after the practice run. Trade-off: a real change online, with an undo. (2) Run the whole trial on a throwaway copy. You see the same results and the real data is never touched; trade-off: more setup time.

**A4. Download the trial's card data.** Ask after A3 is done.

> **Recommend: approve.** May I download three public data sets and a free similarity tool, and load them into the new trial storage? The sets are Scryfall's card file, Scryfall's card-label file and Commander Spellbook's combo file. The tool is about 130 MB and runs on your computer; nothing about you or your cards is sent anywhere.
>
> **What you would see.** Nothing on any screen. Only the new trial storage fills up.
>
> **Can it be undone.** Yes. Loading again is safe; removing the loaded data is a delete I would ask you about first.
>
> **What could go wrong.** A download could fail part-way (I record each file's date and fingerprint and stop rather than load half a file). Your computer will be busy for a while.
>
> **Why now.** Without these the trial cannot compare any cards and its freeze file cannot be finished.

Later: A5 (where the trial sits beside "Use what I own") and A6 (your grading time, about 2 hours, after the 5-card sample check).

## Changed files
- docs/oracle/status.md — V-04b, V-04c, V-06c DONE; BR-1 PARTIAL; new rows V-04d, V-09b; V-07 and V-08 dependencies
- docs/oracle/contracts/vector-trial-2026-11.md — Gene sign-off line in header
- docs/oracle/reports/2026-11-06-gene-signoff-amendment.md — this report

## New decisions made (need owner confirmation)
- None that change what you see. Test-design calls (swap M-T02, F-06 replaced, W-T01 low-confidence and unscored in gates) are within the scope the owner delegated on 2026-11-06.

## Assumptions
- No agent was committing to import/review-polish or the original folder at cherry-pick time [Confirmed: tips unchanged over 20 s, clean status, only the Paseo app running].
- The Tester's findings about F-06 and fixture mainboards are correct [Approximate: not re-run by Gene].

## Challenges to locked decisions
- none

## Open questions
- Retire the old folder (original checkout) once the owner is happy: needs owner say-so, not done.

## Verification
- git cherry-pick f01ad66 in the import-polish worktree: clean, 3 files
- npm run check was not run on the import branch (Developer's role; the commit is unchanged content)
- No database access, no migration applied
