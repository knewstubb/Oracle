# Report: br1-branch-cleanup
Role: Developer
Status: PARTIAL (both branches built and verified; an 11th import commit landed on the old branch while I worked, so it is not on the new import branch)
Task as received: BR-1 — carry out the branch cleanup in docs/oracle/reports/2026-11-06-gene-blinding-branch-signature.md section 2.3 exactly (new worktrees and cherry-picks only; trial commits to trial/vector-clean, import commits to import/review-polish); stop and report on any conflict or any difference from the listed commits.

## Summary for the owner
The test work and the import-screen work now each have their own clean branch in their own folder. Nothing was deleted, uploaded, merged or changed on the old branch. One thing needs you: the import agent made one more change on the old branch while I was working, and it has not been copied to the new import branch yet. Someone also has unsaved import edits sitting in the original folder. Please tell the import agent to stop working in the original folder and move to the new import folder, then ask for the last change to be copied across.

## Step 0: what is committing to the old branch
- All commits are authored as "Brad Newstubb" (same git identity for every agent), so author does not identify the agent. Every commit is a plain local commit; no hooks, no rebase, no amend.
- Timeline from reflog: the original folder switched from main to the trial branch at 14:28:59 (checkout). Trial commits and import commits are interleaved from 14:29 to 15:17 in one folder. A further import commit (f01ad66, 15:33:46) arrived after my step 1 check.
- No other worktree is on that branch (git worktree list: the original folder is the only one on trial/vector-recommendations).
- Uncommitted edits to two import files (the row editor and import-intent) were being modified at 15:32, so an agent is actively editing in the original folder now.
- Processes with the original folder as working directory (report only, none killed):
  - PID 22418 (npm exec next dev -p 3000, parent) and PIDs 22439, 22440, 22451 (Next dev server and its postcss helper): started 15:23:38. This is a dev server, not a committer.
  - PID 56391 and 56392 (copilot --acp, started Wed Nov 4 08:46): a Copilot agent session, child of Paseo Daemon PID 85158. Likely the import agent, or this session.
  - PID 89022 and 89023 (copilot --acp, started Mon Nov 2 13:54): another Copilot session, also a Paseo child.
  - Which of the two Copilot sessions made the commit is not provable from git data; the owner should confirm. No file watchers or git hooks found.

## Result
Step 1: commit list matched the 3 trial plus 10 import commits exactly at the start. The old tip then was e8f75f4; it is now f01ad66 (one new import commit, listed below).

New branches (cherry-picks get new ids; old id then new id):
- trial/vector-clean, folder oracle_app-trial-clean, from main (8ade9fc):
  - 48c763b then 4e8939a (V-03)
  - f3b22c2 then 833ac48 (V-05 filters, V-06a2)
  - 507eb2c then 14c15b5 (V-06b)
  - new docs commit 8174382 (contract, freeze, sheet format, reports, status)
- import/review-polish, folder oracle_app-import-polish, from main:
  - 1300448 then c874e14
  - 438de92 then ba32006
  - d410e5e then 3766ec7
  - 229339f then 37e471a
  - 01e291d then bae4a02
  - 3f50236 then 3627b53
  - 11e5886 then f276947
  - 005efb6 then 2bc059a
  - 029a404 then e9329a5
  - e8f75f4 then 29f157e

No conflicts. AGENTS.md was not copied and remains modified, uncommitted, in the original folder. The trial docs copied were the files in 2.3 step 4, including the contracts/drafts folder and the current status.md (which carries the uncommitted edits from the original folder).

## Not carried over (needs a decision)
- Commit f01ad66 "Import: only auto-pick Collection for the exact printing; other printing needs a pick" (touches the row editor, import-intent and its test) landed on the old branch after step 1. Per the "differences from the listed commits" rule I did not cherry-pick it. To carry it: from oracle_app-import-polish run git cherry-pick f01ad66 (the import agent may still be changing it; there are also uncommitted import edits in the original folder).
- Step 8 (switching the original folder to main) was not done: the import agent is still using it, and it has uncommitted edits.

## Changed files
- docs/oracle/reports/2026-11-06-developer-br1-branch-cleanup.md — this report (written in the original folder, untracked; not committed on any branch)
- No source changes. New branches and worktrees only.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- Copied status.md as it is in the original folder now (including uncommitted edits), as step 4 says.
- Treated the 11th import commit as out of scope rather than adding it.

## Challenges to locked decisions
- none

## Open questions
- Which agent session is committing in the original folder (see PIDs)? Owner or Gene to tell it to move to oracle_app-import-polish.
- Cherry-pick f01ad66 onto import/review-polish once the import agent is stopped?

## Verification
- git worktree add ../oracle_app-trial-clean -b trial/vector-clean main — ok
- git cherry-pick 48c763b f3b22c2 507eb2c (in trial-clean) — ok, no conflict
- Copied docs by file copy, git add by name, git commit "trial: contract, freeze, sheet format, reports, status" — ok
- git worktree add ../oracle_app-import-polish -b import/review-polish main — ok
- git cherry-pick of the 10 import commits (in import-polish) — ok, no conflict
- git log main..HEAD on trial/vector-clean — 4 commits (3 trial plus docs)
- git log main..HEAD on import/review-polish — 10 commits
- git diff --name-only main..HEAD on trial/vector-clean, filtered to src/ — none
- git diff --stat main..HEAD on trial/vector-clean — 41 files, only scripts/, tests/fixtures/edhrec/, trial/vector/, docs/
- git diff --stat main..HEAD on import/review-polish — 11 files: 10 under src/ plus docs/oracle/specs/import-intent.md
- npm ci in both folders — ok
- npx vitest --run scripts/sync-edhrec-builds on trial/vector-clean — 2 files, 50 tests passed (filters 22, layout 28)
- npm run check on trial/vector-clean — exit 0; 2587 tests passed, 42 skipped; lint 0 errors, 280 warnings
- npm run check on import/review-polish — exit 0; 2537 tests passed, 42 skipped; lint 0 errors, 280 warnings
- Nothing pushed, merged, reset, rebased, forced, deleted or renamed; old branch untouched by me (its tip moved only because of the import agent's commit).
