# Report: gene-blinding-branch-signature
Role: Gene
Status: DONE (documents only; nothing dispatched, no git command run, no database touched)
Task as received: Three owner-approved items (2026-11-06): (1) BLINDING: the assistant revealed to the owner which cards in the freeze file are trap cards and why; owner agreed to drop card-by-card approval of traps (A1b), verify traps by rule through the Tester (Scryfall legality, colour identity, wrong function), replace about half of the traps per commander with agent-chosen picks the owner must not see, keep trap identities in a sealed key referenced from the freeze file by hash, make A1b a 5-card sample of the blank rating sheet, and record the owner's exposure to the original trap list and the deck-dependent, multi-feature and flip lists (decide whether those need partial replacement). Define the Architect and Tester tasks. (2) BRANCH: trial/vector-recommendations carries unrelated import commits; clean branch from main with only trial commits (V-03 48c763b, sync f3b22c2 and 507eb2c, docs); import work on its own branch; nothing merged or pushed; no force-push or history deletion without explicit owner approval; give exact safe steps and who does them; do not run destructive git. (3) SIGNATURE CARDS: V-06 shows 33 to 41 of 50 cards flagged is_signature; the seed uses the top 8 by synergy (tie-break inclusion) among the stored list, not the flag; hand to the Architect as a contract amendment. Also record V-05 and V-06 done and A2 approved with basics excluded in status.md, write the handoffs, and write this report with a plain-language owner summary and A3/A4 wording, without trap names in the owner summary.

## Summary for the owner

**Three things are decided, and none of them needs a yes from you right now.**

1. **Blind grading is being repaired.** You will no longer approve test cards one by one. A check agent will verify the tricky "look-alike" cards against the printed card text instead. About half of those cards are being swapped for new picks chosen by an agent, and you will never be shown them. The full list moves into a locked file that only the test tool opens. What you will see: when the grading sheet is ready, five blank sample rows, just to tell me whether the card text is readable. I found one more leak while doing this: the sheet had a column that labelled some rows as look-alikes. That column is being removed.
2. **The trial's code is getting its own clean branch.** It currently shares a branch with the import-screen work, and someone is still adding import changes to it. Trial work gets a fresh branch from main with only the trial changes; the import work gets its own branch. Nothing is merged, uploaded or deleted. If anyone later wants the old mixed branch deleted, I will ask you first.
3. **The "signature cards" rule is being tightened.** The loaded lists mark 33 to 41 of every 50 cards as "signature", which is too many to mean anything. The test will instead use each list's top 8 cards by how strongly they fit that deck style.

**Also recorded:** the three style lists are loaded (50 cards each, no basic lands, 150 cards in total, deck counts refreshed), with your approval.

**Exposure you should know about.** You have seen the original look-alike list and the lists of deck-dependent, multi-feature and flip cards. That is recorded as a known exposure. Remedy: the 5 look-alike cards per commander that stay are marked "seen" and will be scored separately from the unseen ones; the "seen" flip cards are partly replaced (3 of 6); the other two lists stay, with reasons below.

**What I need from you next:** nothing today. In order, the next asks are A3 (the new storage online) and A4 (the downloads); the exact wording is in section 5. Before the grading, you will be asked to look at five sample rows (A1b).

## 1. Blinding

### 1.1 Known exposure (record)
On 2026-11-06 in the main chat the assistant told the owner which freeze-file cards are look-alike traps, and why, which compromises blind grading of those cards. Recorded as a known exposure, not a hidden one.

| What the owner has seen | Count | Decision | Why |
|---|---|---|---|
| Original look-alike (trap) list with reasons | 10 per commander, 20 total | **Replace 5 per commander** (10 total) with unseen picks. The 5 kept per commander are flagged `exposed` in the sealed key | Owner decision (about half). Kept ones remain recognisable, so they cannot be treated as blind |
| Deck-dependent cards | 12 | **Keep** (exposed, recorded) | Famous staples, five of them named in the signed contract; grading is per list on the card text; replacing them would break the contract's named candidates. Weak priming risk. The existing post-grading replacement rule (§5.6) still applies |
| Multi-feature cards and their features | 10 | **Keep** (exposed, by design) | The owner must know the features, because the grader grades each feature. It is not a hidden-answer test |
| Flip cards (6 Wilhelt-only contrast picks plus 5 controls) | 6 + 5 | **Replace 3 of the 6 contrast picks** (1 from the sacrifice-and-drain side, 2 from the Zombie-typal side or the reverse, Architect's choice) with unseen picks; keep the 5 controls | The owner knows which side each contrast card was picked for, so he could grade by build label instead of by card text, which would inflate the build-direction test (§5.8). Controls are universal staples and are not hidden-answer cards |

**Consequence for the scoring (Architect amends contract §5.2 rule 4, §5.4 stop rule, §5.8):** gates that use traps ("no trap in an arm's top 10 without being flagged", "V returns mostly traps") are computed on the **unexposed** traps first (10 cards) and the exposed 10 are reported beside them. A result that depends only on exposed cards cannot decide go or stop. Flip pairs are computed on all 12 contrast cards with the 3 sealed replacements reported separately.

Further hardening if the owner wants it (not needed for the decision, optional): replace all 20 traps. I recommend not doing this: the exposure is recorded and the scoring treats exposed cards separately.

### 1.2 A1b is now the 5-card sample check (owner-facing)
- **Dropped:** card-by-card owner approval of trap cards. The "owner skim before the freeze is valid" condition in the Gene V-04 review is replaced by: (a) the Tester's rule check passes (V-04c), (b) the sealed key hash is in the freeze file, (c) the four snapshot fields are filled, (d) the commit order holds.
- **New A1b (V-18, once the sheet exists):** the owner views 5 rows of the blank rating sheet, with the real card text (type line, cost, rules text, power/toughness), not just names, and says whether the text is readable. Rows are drawn by a fixed seed from rows whose real source is ordinary pool cards only (never trap, flip, multi-feature or deck-dependent), so the sample never shows a card the owner recognises as a trap. The sample file is produced by Developer in V-17 and is only the sheet's own columns.
- **Open item (Gene's proposal, not new owner policy):** the freeze file says the owner confirms the ten multi-feature feature lines. That confirmation is not blind-sensitive. Proposal: Gene shows those ten lines in plain words together with the A3 request (about 2 minutes). Tell me if you would rather skip it.

### 1.3 Sealed key
- **File:** `trial/vector/sealed/gold-key.json` on the clean trial branch (BR-1), committed in the same commit as the freeze file edits, never printed.
- **Contents:** per commander, 10 trap slots (`W-T01` to `W-T10`, `M-T01` to `M-T10`): card name, `oracle_id`, one-line wrong-function reason, `exposed` (true or false), `origin` (original or new), plus an ordered reserve line (at least 4 unseen reserves per commander); 3 flip-contrast slots (`F-01` to `F-03`) with the same fields; a 32-byte random `salt` (so the hash cannot be guessed by trying card names).
- **Hash:** SHA-256 of the exact file bytes, written in the freeze file §5 and §8 as "Sealed key SHA-256: `<hex>`". A later change to the key changes the hash and needs a dated amendment and a fresh gold set (§5.9).
- **Who may open it:** the Architect (V-04b, to write it), the Tester (V-04c, to verify), and the harness code (V-17, by path, never printing names). **Not Gene, not Designer, not Scribe, not the owner, and not the grade drafter.** Reports and messages refer to slots by id only (for example "W-T04 failed colour identity"), never by card name. The Gene review of this work is done from the Tester's table, not from the key.
- **Drafter caveat:** the Architect who writes the key must not also draft grades in V-18; V-18 uses a fresh agent that has not read the key, the old freeze file text or this task.

### 1.4 The sheet itself leaked (found while writing this)
`contracts/vector-trial-grading-sheet-format.md` emits a `section` column with the value `trap` and a "Traps" section heading, and says the grader can see which cards are traps in principle. Even after the freeze file is cleaned, the owner would see trap rows labelled as such. Amendment (in the Architect task): remove `section` and the type-specific headings from the owner's sheet; show each trap row inside the first list of its commander (W1 for Wilhelt, M1 for Mendicant) in the shuffled order, with the same context block as the other rows; keep `section` only in the sealed result key. The `feature_ask` column stays for multi-feature rows because it is part of the question.

### 1.5 Scrub
Trap names currently appear in `docs/oracle/contracts/vector-trial-freeze-2026-11-06.md` (§5) and `docs/oracle/reports/2026-11-06-architect-v04-freeze-sheet.md`. The Architect removes them from both, leaving "10 per commander, sealed, see hash" in §5. The Tester greps the docs, trial and scripts folders for every key name and reports only the count of leftover files. (Unrelated card-name matches in `src/lib/rating-engine` are not trial files; ignore.) Earlier chat history cannot be scrubbed; that is the recorded exposure.

### 1.6 Task definitions

**Architect task V-04b (inputs and outputs, exact)**
- Reads: the freeze file, the grading sheet format, the V-04 report, contract §5.2, §5.4, §5.8, §5.9, this report.
- Writes only: `trial/vector/sealed/gold-key.json` (new), the freeze file (§5, §8, §9 hash line, §11 dated amendment), the sheet format file, the contract amendments in §1.1 above (§5.2 rule 4, §5.4 stop wording, §5.8), and a report `docs/oracle/reports/2026-11-06-architect-v04b-sealed-key.md`.
- Steps: (1) keep 5 original traps per commander (Architect's choice; record as `exposed: true`), replace 5 per commander with new traps chosen by the Architect; (2) replace 3 of the 6 flip contrast picks; (3) 4 or more unseen reserves per commander; (4) write the key with salt; compute the hash; (5) rewrite freeze §5 and §8 without names; (6) fix the sheet format as in 1.4; (7) scrub the V-04 report; (8) amend the contract wording on exposed and unexposed traps.
- Rules for new picks: legal in Commander; colour identity inside the asking commander's (Wilhelt: blue and black; Mendicant: white and blue); shares vocabulary with the commander's job but does a different job; not in any stored build list (50-card) for that commander; not already a deck-dependent, multi-feature or flip card, nor in the owner's two fixture decks (mainboard); not a card the assistant named in the main chat today (the original 20 are excluded as new picks); one-line reason per card.
- **The Architect's report and final message must not name any new card** and must not name the kept ones: slot ids and counts only. Done when: the key exists, its hash is in the freeze file, no trap or sealed flip name appears in any non-sealed file, and the report states counts and the hash only.

**Tester task V-04c (inputs and outputs, exact)**
- Reads: the sealed key, the freeze file (hash line), the sheet format file, Scryfall (public lookup by exact name, dated, rate-limited), the hosted card data read-only (colour identity and Commander legality columns), the three stored build lists read-only, the two fixture decks.
- Checks per slot, for all 20 trap slots, 3 sealed flip slots and every reserve: (a) resolves to exactly one `oracle_id`; (b) legal in Commander; (c) colour identity inside the commander's; (d) wrong function: the Scryfall rules text matches the key's one-line reason and the card is not plausibly a good pick for that commander's job (pass or fail with one short reason, no names); (e) not in that commander's stored build lists; (f) no duplicates across traps, flips, deck-dependent, multi-feature, controls and fixture mainboards; (g) counts: 10 per commander, at least 5 unexposed per commander, at least 4 reserves per commander, 3 sealed flips; (h) the key's SHA-256 matches the freeze file; (i) no key name appears in any non-sealed file (report the count of files).
- Output: `docs/oracle/reports/2026-11-06-tester-v04c-trap-verification.md` as a table by slot id with pass or fail per check, and a list of failing slot ids. **No card names anywhere in the report or the final message.** The Architect swaps a failed slot from the sealed reserve line and the Tester re-verifies only the swapped slots. Done when every slot passes or the report lists every failing slot with its failed check.

## 2. Branch cleanup

### 2.1 Findings (read-only)
- `trial/vector-recommendations` is **13 commits ahead of main** (main is at 8ade9fc), not 4: **3 trial commits** (48c763b V-03; f3b22c2 V-05 filters plus V-06a2; 507eb2c V-06b basics) and **10 import-screen commits** (1300448, 438de92, d410e5e, 229339f, 01e291d, 3f50236, 11e5886, 005efb6, 029a404, e8f75f4). The import commits touch about eleven files under `src/` (import review components and tests, `import-intent`, `import-copy`, the deck import route and `manabox-deck-import`) and one spec in `docs/`. 438de92 is the one that changed "ignore basics" to off by default.
- They are being added right now (the last import commit is minutes old). Cause: the main checkout folder sits on the trial branch, and whichever agent is doing import work uses that same folder, so its commits land on the checked-out branch. It is not a trial agent.
- The trial docs (contract, freeze file, grading format, briefs, reports, `contracts/drafts/`) are **uncommitted and untracked** in that folder. `AGENTS.md` also shows as modified there; not trial work, so do not carry it over without asking.
- The data already loaded in the online database does not depend on any branch.

### 2.2 Decision
- **Clean trial branch:** `trial/vector-clean`, from main, only the three trial commits cherry-picked, plus one docs commit. Worktree folder: a sibling of the repo, `oracle_app-trial-clean`.
- **Import branch:** `import/review-polish`, from main, only the ten import commits cherry-picked, in its own worktree folder `oracle_app-import-polish`. The import agent works only there from now on.
- **Old branch `trial/vector-recommendations` is left exactly as it is**, as a safe record. It is not rewritten, reset, renamed, deleted or pushed. Retiring it is a separate owner decision (see 2.4).
- All of this creates new branches only. Cherry-picking happens on the new branches. Nothing is merged to main and nothing is pushed to origin (origin/main is at a different commit and is not involved).

### 2.3 Exact safe steps
Who: **Developer** executes (a git-only task; Gene does not run git writes and does not edit code). The owner approves nothing here, because no step is destructive. Anything marked STOP needs the owner.

0. **Owner or Gene tells the import agent to stop committing** until step 8 and to say when it has stopped. No commit on the old branch after that point.
1. Record the starting state, read-only: `git status --short`, `git --no-pager log --oneline main..trial/vector-recommendations`, and note the branch tip. If the list differs from the 3 + 10 commits above, STOP and report; do not guess.
2. `git worktree add ../oracle_app-trial-clean -b trial/vector-clean main`
3. In that folder: `git cherry-pick 48c763b f3b22c2 507eb2c` (oldest first). On a conflict: `git cherry-pick --abort`, STOP and report.
4. Copy the trial docs in (plain file copy, not a git operation), from the original folder to the same relative paths: `docs/oracle/briefs/vector-recommendation-trial.md`, `docs/oracle/contracts/drafts/`, `docs/oracle/contracts/vector-trial-2026-11.md`, `docs/oracle/contracts/vector-trial-freeze-2026-11-06.md`, `docs/oracle/contracts/vector-trial-grading-sheet-format.md`, every untracked `docs/oracle/reports/2026-11-0[46]-*` listed by `git status`, and the current `docs/oracle/status.md`. Do **not** copy `AGENTS.md`. Copy after Gene has saved this report and after any Architect work that is already finished. Then `git add` those paths by name and commit "trial: contract, freeze, sheet format, reports, status".
5. `git worktree add ../oracle_app-import-polish -b import/review-polish main`
6. In that folder: `git cherry-pick 1300448 438de92 d410e5e 229339f 01e291d 3f50236 11e5886 005efb6 029a404 e8f75f4` (oldest first). On a conflict: abort, STOP, report. Tell the import agent to continue only in `oracle_app-import-polish` on `import/review-polish`.
7. Verify, in each new folder (`npm ci` first if there is no `node_modules`): `git --no-pager diff --stat main..HEAD` lists only the expected files (clean trial: `scripts/`, `tests/fixtures/edhrec/`, `trial/vector/`, `docs/`; import: `src/` and the one spec); `npm run check` passes; the clean trial branch has no file under `src/`.
8. Optional, only after the import agent confirms it has moved: in the original folder `git switch main` so nothing else can commit to the mixed branch. Not destructive (uncommitted docs stay as files). If it refuses because of local changes, STOP and report.
9. Write the report with the old and new commit ids (cherry-picks get new ids; Gene updates references in status.md) and the exact commands run. Never run: `git push`, `git push --force`, `git reset --hard`, `git branch -D`, `git rebase`, `git gc`, `git clean`, `git checkout -- .`, `git worktree remove`.

### 2.4 Approvals
- Nothing in 2.3 needs approval.
- **Needs explicit owner approval, with the exact command shown first:** deleting or resetting `trial/vector-recommendations`, any force-push, any push at all, any merge to main (Gate 5). I recommend keeping the old branch until the trial is finished, then asking once.
- After BR-1 all Gene and Tester work on the trial happens in `oracle_app-trial-clean`; the original folder is not used for trial work.

## 3. Signature cards (contract amendment for the Architect)
Finding [Confirmed: `reports/2026-11-06-developer-v06-dry-run.md`, V-06 load]: 33 to 41 of the 50 stored cards per build carry `is_signature` (Wilhelt Zombies 40, Wilhelt Aristocrats 41, Mendicant Artifacts 33), because the rule (synergy over 0.15 and inclusion over 0.4) is loose on a top-50 list.

Amendment to contract §4B.2 (and the kickoff builds check in §1.3, the circularity note and §5.2/§5.4 references to "signature cards"):
1. **Seed picks, per build:** from the stored 50 cards of the build (`ref_build_cards`), keep only cards with synergy greater than 0 that resolve to one `oracle_id`, are Commander-legal, are inside the commander's colour identity and are not the commander. Sort by synergy descending; **tie-break by inclusion descending, then card name ascending** so the pick is deterministic. Take the first **8**. The `is_signature` flag is **ignored** by the trial; the stored data is not changed.
2. A card with missing synergy (stored as 0) never qualifies; negative synergy never qualifies.
3. Fewer than 5 qualifying cards: the seed falls back to the commander seed and says "no build signal" (unchanged).
4. The cards used are removed from the candidate list and listed in the report (unchanged).
5. Kickoff check (§1.3 builds row): replace "at least 5 signature cards" with "at least 5 cards meeting the rule in 1."
6. The rule is fixed now and is not tuned on results. Weights stay 0.5 commander and 0.5 mean of the 8 picks.
7. Add a dated line in the contract header. Because this changes a signed contract, Gene signs the amendment after reading it; no owner decision is needed (the owner approved the rule on 2026-11-06).

## 4. Handoffs, ready to send (not run)
Send with `paseo run "<text>" --provider <provider/model> --new-workspace worktree --title "<ID>"`, using the strings from `paseo provider models` (Architect `opencode-go/kimi-k2.7-code`, Tester and Developer `opencode-go/deepseek-v4.1-flash`). **Send BR-1 first and wait for it to finish; then send V-04b and V-06c from inside `oracle_app-trial-clean`** (otherwise they would branch from a commit that lacks the contract files). V-04b and V-06c touch different files and may run in parallel. V-04c waits for V-04b. V-07 can start now. Gene does not open the sealed key or the Architect's or Tester's name-bearing material, so V-04b and V-04c are written to return ids only.

```
BR-1
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task BR-1: Carry out the branch cleanup in docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md section 2.3 exactly (new worktrees and cherry-picks only; trial commits to trial/vector-clean, import commits to import/review-polish); stop and report on any conflict or any difference from the listed commits.
Done when: both new branches exist with only the listed commits, git diff --stat main..HEAD and npm run check are reported for each, nothing was pushed, merged, reset, rebased or deleted, and the old branch is untouched.
For Brad (plain words): This asks for the trial's code to be copied onto its own clean branch, and the import-screen work onto its own, without deleting or uploading anything.
```

```
V-04b
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-04b: Do the sealed-key task in docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md sections 1.1 to 1.6 (new trap picks, sealed key with hash, freeze file and sheet format cleanup, contract wording on exposed and unexposed traps); name no trap or sealed flip card in any report or message, slot ids and counts only.
Done when: trial/vector/sealed/gold-key.json exists with its SHA-256 written in the freeze file, no trap or sealed flip name appears in any other file, and your report states slot counts and the hash only.
For Brad (plain words): This asks for the look-alike test cards to be partly replaced and locked away in a sealed file, so you can still grade blind.
```

```
V-06c
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-06c: Amend docs/oracle/contracts/vector-trial-2026-11.md as specified in section 3 of docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md (build seed uses the top 8 stored cards by synergy, tie-break inclusion then name, and ignores the is_signature flag; update the kickoff check and the fallback and circularity wording), with a dated line in the contract header.
Done when: every use of "signature cards" in the contract follows the new rule, the pick procedure is deterministic as written, and your report lists the sections changed.
For Brad (plain words): This asks for the test's "key cards" rule to be changed so it uses each style's eight strongest cards, not the loose label that marks most of them.
```

```
V-04c
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task V-04c: Verify every trap, sealed flip pick and reserve in trial/vector/sealed/gold-key.json by rule, using the checks (a) to (i) in docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md section 1.6 against Scryfall and read-only hosted data; open no other sealed file and run nothing that writes.
Done when: docs/oracle/reports/2026-11-06-tester-v04c-trap-verification.md holds a pass or fail table by slot id with no card names, and lists every failing slot id with its failed check.
For Brad (plain words): This asks for an independent check that each look-alike test card is legal, in the right colours and really does the wrong job, without showing you the cards.
```

```
V-07
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task V-07: Check the loaded build lists read-only: the three trial builds hold 50 non-basic cards each (150 rows), no duplicates, positions 0 to 49, deck counts refreshed, no other build or table changed (compare against docs/oracle/reports/2026-11-06-developer-v06-dry-run.md), and rerun npm run check on the trial branch.
Done when: your report states pass or fail for each check with the evidence, and says nothing was written.
For Brad (plain words): This asks for an independent check that the three style lists were loaded correctly and nothing else was touched.
```

## 5. Next owner approvals (wording ready; ask in this order, each only when its pre-condition holds)

**A3. Add the similar-card storage online.** Pre-condition: the V-09b tidy-up is done and V-10 will rehearse on a throwaway copy first.

> **Recommend: approve.** May I add a "similar cards" feature to Oracle's online database, plus three small storage areas that only the trial uses?
>
> **What changes.** The online database gains one switch (the similar-card ability, if it is not already on), three new empty storage areas (one for card meanings, two for combos) and one look-up tool. They hold public card information, nothing of yours. Your collection, decks and the style lists we just loaded are not touched. No screen in the app changes.
>
> **First, a practice run.** I will rehearse the whole thing on a throwaway copy before the real one, and I will show you the result of the practice.
>
> **Can it be undone.** Yes, with one prepared undo step that removes only these new areas. Using it is a delete, so I would ask you again first. The switch itself stays on unless you say otherwise.
>
> **What could go wrong.** The similar-card ability may not be available online yet; then the change stops with a clear message and nothing is added. The ten import changes that were waiting earlier are already applied, so nothing queues ahead of this one. One import-related change prepared earlier is not applied; I will apply only this file, never "everything pending".
>
> **Options.** (1) Recommended: do it on the online database after the practice run. You would see the trial run on the real data. Trade-off: it is a real change online, with an undo. (2) Run the whole trial on a throwaway copy. You would see the same results and the online data is never touched. Trade-off: a bit more setup time.

**A4. Download the trial's card data.** Pre-condition: A3 done.

> **Recommend: approve.** May I download three public data sets, plus a free similarity tool, and load them into the new trial storage? They are Scryfall's card file, Scryfall's card-label file and Commander Spellbook's combo file. The similarity tool is about 130 MB and runs on your computer; nothing about you or your cards is sent anywhere.
>
> **What changes.** Only the new trial storage areas are filled. Nothing existing is changed, and no screen changes.
>
> **Can it be undone.** Yes. Loading again is safe, and removing the loaded data is a delete that I would ask you about first.
>
> **What could go wrong.** A download could change or fail part-way (I record each file's date and fingerprint, and stop rather than load a half file). It uses your computer for a while to compute the card meanings.
>
> **Why now.** Without these the trial cannot compare any cards, and the test's freeze file cannot be finished.

Later, as before: A5 (where the trial sits beside "Use what I own") and A6 (your grading time, about 2 hours, after the sample check A1b).

## Changed files
- docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md — this report
- docs/oracle/status.md — V-05 and V-06 DONE (A2 approved, basics excluded, 150 rows), new rows V-04b, V-04c, V-06c, BR-1, A1b change, V-07 can start

## New decisions made (need owner confirmation)
- Replace 5 of 10 traps per commander (the exposed 5 kept are scored separately) and 3 of 6 flip contrast cards; keep deck-dependent and multi-feature lists. Owner asked me to decide; shown for confirmation in section 1.1.
- Remove the `section` column and trap heading from the owner's rating sheet (section 1.4).
- Clean-branch plan and branch names (section 2). No gate; for awareness.
- Gene proposal: confirm the ten multi-feature feature lines together with A3 (section 1.2).

## Assumptions
- The 13 commits listed by `git log main..trial/vector-recommendations` are the complete difference at the time of writing; the owner's "4 commits, 8 files" was an earlier snapshot [Confirmed: git log, 2026-11-06 15:xx]. BR-1 step 1 rechecks.
- The active import committer is another agent using the main checkout folder [Approximate]; I did not identify it.
- Scryfall and read-only hosted data are enough for the Tester's rule checks before the V-11 snapshot exists.
- Stored synergy values are numeric, with 0 meaning "no data" [Confirmed: contract §1.1 sync notes].

## Challenges to locked decisions
- none (no entry in `decisions.md` is touched; the changes are to the signed trial contract and the freeze file, which carry dated amendments)

## Open questions
- Does the owner want all 20 traps replaced instead of 10? Recommendation: no.
- Does the owner want to skip the 2-minute multi-feature confirmation?
- Which agent is committing import work to the checked-out branch? BR-1 step 0 depends on reaching it.

## Verification
- `git branch`, `git log main..trial/vector-recommendations`, `git show --stat` per commit, `git status --short`, `git worktree list` (read-only) — findings in section 2.1
- grep of docs, trial, scripts, src, tests for trial card names — only the freeze file, the V-04 report and unrelated `rating-engine` files match
- Read: the four named files, the grading sheet format, status.md; no git write, no database access, no agent started
