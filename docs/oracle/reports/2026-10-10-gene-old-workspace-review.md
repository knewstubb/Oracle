# Report: old-workspace-review
Role: Gene
Status: DONE
Task as received: Please review the work sitting in my old Oracle workspaces and recommend what to do with each piece. This is a review only: do not change, merge, commit, delete or archive anything, and do not start other agents. The only file you may create is your report.

The workspaces are the folders in ~/.paseo/worktrees/03dz1jp4/: grand-dodo, t15-advisor-contract-astra, t19-ai-assessment, t27-loading-baseline, t28-contract-hardening-astra, t28-state-contract, t32-collection-client, t33-price-freshness, t34-native-stream-fragments. Each has files that were never saved to history (and grand-dodo also has one saved change that is not in main).

For each workspace work out:
1. What was the job? Match it to the task in docs/oracle/status.md and the reports in docs/oracle/reports/.
2. What is in it: documents only, or changes to the app's code?
3. Is it already in main? Compare against both the saved main branch and the files currently in the main project folder, which has its own unsaved files, so some work may be duplicated there.
4. Is it still wanted, given the current milestone in docs/oracle/roadmap.md and the locked decisions in docs/oracle/decisions.md? Is it out of date or replaced by later work?
5. If it changes code, would it clash with what is in main now?

Then recommend ONE of these for each workspace: "Bring into main", "Keep for later" (say what it is waiting on), or "Throw away" (say why it is safe to). Put the easy "throw away" ones first and the risky ones last.

Write the report to docs/oracle/reports/2026-10-10-gene-old-workspace-review.md. I am a designer, not a developer, so write it in simple everyday words: say what each piece of work is for in terms of the app (for example "this makes the collection screen load faster"), avoid technical terms, and keep each workspace to 3 or 4 short sentences plus your recommendation. Start with a short summary table of recommendations.

When you reply to me, give the summary in plain words and ask which ones I want to act on. Do not act until I answer.

For Brad (plain words): This looks through all the old workspaces, says what each was for, and recommends whether to keep, merge or drop it, without changing anything.

## Summary for the owner
Every app change in these workspaces is already in the main project, word for word, so nothing will clash. Four workspaces can be thrown away now. Three hold finished write-ups worth saving into the main project. Two hold the plans for the AI advisor and the card rules, and both are waiting on your answers. Nothing was changed.

## Recommendations at a glance

| # | Workspace | What it was for | Recommendation |
|---|---|---|---|
| 1 | t32-collection-client | Makes the Collection screen load faster and wait for you to stop typing before searching | Throw away |
| 2 | t33-price-freshness | Collection checks once, not twice, whether prices are out of date | Throw away |
| 3 | t34-native-stream-fragments | Stops the AI assistant garbling its card look-ups | Throw away |
| 4 | t28-state-contract | First draft of the card rules (Sleeved, Playable, Move, Proxy) | Throw away |
| 5 | grand-dodo | A combined test of 1–3 before they went live | Bring into main (write-up only) |
| 6 | t27-loading-baseline | Study of why screens load slowly; 1 and 2 came from it | Bring into main |
| 7 | t19-ai-assessment | Review of how good the AI's card suggestions are | Bring into main |
| 8 | t28-contract-hardening-astra | Final draft of the card rules | Keep for later |
| 9 | t15-advisor-contract-astra | Blueprint for the AI advisor | Keep for later |

Two points apply throughout:
- **"Bring into main" means copying in only the new write-ups.** Every workspace also has an old copy of the to-do list and roadmap. Those copies are out of date and must not replace the newer ones in the main project.
- **Save first, then delete.** Some throw-away workspaces hold spare copies of the write-ups in 5–9, so deal with those five before deleting anything.

## Workspace by workspace

### 1. t32-collection-client: Throw away
Task T-32. This changed the app so the Collection screen loads only the view you are looking at, and search waits for one pause in your typing instead of two. Those changes went live in the main project on 5 October, exactly as they are here, with their write-up. The other files are spare copies of documents in workspace 6, or old copies of the to-do list.
**Throw away:** safe. Nothing here is missing from the main project or from workspace 6.

### 2. t33-price-freshness: Throw away
Task T-33. The Collection screen used to check twice whether prices were more than 48 hours old; this makes it check once, with no visible change for you. The app change and its write-up are already in the main project, exactly as here. The rest are spare or old copies.
**Throw away:** safe, for the same reasons as 1.

### 3. t34-native-stream-fragments: Throw away
Task T-34. This fixed a fault where the AI assistant doubled the start of a card look-up, which could garble its reply. The fix and its write-up are already in the main project, exactly as here. It also holds a spare copy of the AI advisor blueprint, identical to the one in workspace 9.
**Throw away:** safe, as long as workspace 9 is kept.

### 4. t28-state-contract: Throw away
Task T-28, first round, and documents only. It was the first write-up of the rules for Sleeved/Unsleeved, the five availability labels, Draft/Assembling/Playable, the pick list and the shortage list. None of it is in the main project, but workspace 8 holds the improved second round, which replaces it, along with a copy of this round's write-up.
**Throw away:** safe. Everything useful is carried forward in workspace 8.

### 5. grand-dodo: Bring into main (write-up only)
A one-off check (named I-01) run before the T-32/T-33/T-34 fixes went live. Its one saved change is a second copy of the "import from any public Archidekt account" work (T-35), which is already in the main project word for word. Its unsaved file is the write-up of that check. It shows the three fixes worked together, gives a short click-through checklist for the Collection screen, and notes one test that fails at random.
**Bring into main:** copy in only the write-up, as the record of why those fixes were judged safe. Leave the saved change behind; it adds nothing new.

### 6. t27-loading-baseline: Bring into main
Task T-27, documents only. It studies why the Collection, deck and pick-list screens are slow and proposes three Collection fixes; two of them became workspaces 1 and 2 and are now live. Two things are still open: the pick list can sometimes hide where a card really is, and real speed tests are waiting on a safe test copy of the app. None of it is in the main project, although the main project's notes already link to these documents.
**Bring into main:** documents only, so nothing can clash. This keeps the record of the loading problems that are still open.

### 7. t19-ai-assessment: Bring into main
Task T-19, documents only. It reviews the AI's card suggestions. It found that the AI gives much the same advice to very different commanders (for example Prosper and Korvold), that it can suggest banned cards, and that Jev is not worth adopting yet. It is not in the main project, yet the card-tagging plan saved there on 2 October builds directly on it, so the main project refers to a document it does not have.
**Bring into main:** the review and its write-up only. It also leaves you one question: the sidebar assistant currently adds and removes deck cards without asking you first.

### 8. t28-contract-hardening-astra: Keep for later
Task T-28, second round, documents only. It sets out the tightened rules for where cards sit, when a deck is Playable, and the Move and Proxy actions. It also covers the shortage list and includes worked examples. It still matches your locked decisions. The later Reconcile "overused cards" page sits alongside it rather than replacing it.
**Keep for later:** it is waiting on your answers. Which decks count towards shortages (for example, retired ones)? What happens to cards once marked missing? What printing should a new proxy use? How should generic and tracked basic lands switch over? What does "complete" mean for Casual decks? The pick list, shortage list and basic-land screens (T-25, T-29, T-30) cannot be designed until then.

### 9. t15-advisor-contract-astra: Keep for later
Task T-15, documents only. This is the blueprint for the AI advisor, the main job of the current milestone. It covers how the advisor reads your real collection and decks, how it sorts suggestions into owned and free, in another deck, or buy, and how it shows honest errors without changing a deck behind your back. It does not clash with anything in the main project, and the one small fix it called for is already live (workspace 3).
**Keep for later:** it is waiting on your five advisor choices. The first is that suggestions are look-only until undo exists. The second is that old Upgrade suggestions stay visible when a refresh fails. The third is that the advisor asks before suggesting infinite combos. The fourth is fewer, better-explained suggestions. The fifth is to show labelled Scryfall prices until Card Kingdom prices are available. It also waits on workspace 8 being settled, because both use the same card rules. This is the most important unsaved work. If you would rather not leave it in an old workspace, it can be saved into the main project marked as a draft.

## Other things noticed
- There is a tenth folder, task-t35-archidekt-any-account, that was not on your list. It has no unsaved files, and its work is already in the main project.
- The main project's to-do list is behind. It still shows T-32/T-33/T-34 as waiting for your approval to merge, although they went live on 5 October, and it lists T-35 twice. I'll tidy it when you next ask me to act.
- The roadmap still marks M1 as current while the to-do list says M2 (the known mismatch O-006).

## Changed files
- docs/oracle/reports/2026-10-10-gene-old-workspace-review.md — this report (the only file created; nothing else changed).

## New decisions made (need owner confirmation)
- None. The recommendations above are proposals; no merge, deletion or archive was done.

## Assumptions
- "In main" was checked against both the saved `main` (0628121) and the unsaved files in the main project folder.
- Workspace copies of `docs/oracle/status.md` / `roadmap.md` are older snapshots (dated 29 Sep, before the main folder's 5 Oct / 9 Oct copies). Their only differing lines are superseded status text and an old role-file path. Workspace `decisions.md` and `docs/oracle/plans/*` are identical to the main folder's unsaved copies.
- Dispatch reports duplicated in workspaces (`orchestrator-dispatch-ai-assessment`, `-astra-solutions`, `-first-implementation`) are equal to or older than the main folder's copies.

## Challenges to locked decisions
- none

## Open questions
- Which recommendations should Gene act on?
- T-15 owner choices O1–O5 (advisor-tools.md §owner choices) and T-28 owner pack Q1, G-D1, G-M3, G-D2/G-D3, G-O1 (card-state-actions.md §14.4).
- T-19: should the sidebar assistant stop adding/removing deck cards without confirmation?

## Evidence (technical)
- Code: every modified/new `src/` file in t32 (5), t33 (6) and t34 (2) is byte-identical to `main` (merged in 863d4b3 "Merge T-32/T-33/T-34"). The main folder has no unsaved `src/` changes.
- grand-dodo HEAD 0c0abc8 is a merge of c490352 into 0a74e8e. Its tree is identical to 1f15656 (`git diff 1f15656 0c0abc8` empty), and 1f15656 is in `main`. The untracked file is `2026-09-30-architect-i01-first-batch-integration.md` (unique).
- Unique documents (not in `main` nor the main folder), with the latest copy in each case:
  - T-15: `contracts/advisor-tools.{md,types.ts,examples.ts}` and `reports/2026-09-29-architect-t15-advisor-solutions.md`. These are identical in t15 and t34.
  - T-19: `contracts/ai-recommendations-assessment-2026-09.md` and `reports/2026-09-29-architect-t19-ai-recommendations.md`. These are identical in t15, t19, t27 and t28-hardening.
  - T-27: `contracts/collection-loading-solutions.md` and `reports/…-t27-loading-solutions.md` (identical in t27, t32 and t33), plus `reports/…-t27-loading-baseline.md` (identical in t15, t27 and t28-hardening).
  - T-28: the hardened `contracts/card-state-actions.{md (1007 lines),types.ts (810 lines),examples.ts}` and `reports/…-t28-contract-hardening.md` exist only in t28-contract-hardening-astra. The first draft (671/566 lines) and `reports/…-t28-card-state-actions.md` are in t15, t27, t28-hardening and t28-state-contract.
- References in the main folder to missing documents: dispatch/status reports link to all of the above. `contracts/card-tagging-pipeline.md` (2 Oct) builds on the T-19 16-commander matrix.

## Verification
- `git status --porcelain -uall`, `git rev-list main..HEAD`, `git merge-base` in each workspace — states as described above.
- Byte comparison (`diff`/`md5`) of every changed workspace file against `git show main:<path>` and the main folder copy — results as listed under Evidence.
- `git log 0a74e8e..main` and `git diff --stat 0a74e8e main -- src supabase` — no later main change touches the T-15/T-28 subject areas beyond the merged T-32/33/34 files. The Reconcile overused view (0191662) is a separate read-only page.
