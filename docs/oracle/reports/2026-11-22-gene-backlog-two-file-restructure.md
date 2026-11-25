# Report: backlog two-file restructure
Role: Gene
Status: DONE
Task as received: Docs-only task: the backlog becomes two files. `docs/oracle/backlog.md` is the short plain-words view of unfinished work (was backlog-simple.md). `docs/oracle/backlog-details.md` is the full task table and history (was status.md). Rename with `git mv`, update live references, bring the details file up to date as of 2026-11-22, rewrite the short file, write this report, commit on main, do not push.

## Summary for the owner
The backlog is now two files: a short one you can read in two minutes, and a full one with the task table and history. The full one is brought up to date through 2026-11-22, and it records that the next priority is still open. Three Figma spacing fixes are logged as a pending choice for you.

## Changed files
- docs/oracle/backlog.md — renamed from backlog-simple.md; rewritten: unfinished work only, open next-priority question, Figma polish item, pointer to the full file
- docs/oracle/backlog-details.md — renamed from status.md; new title and "Maintained by Gene" line; stale rows fixed; new priority section and POLISH-01
- AGENTS.md — repo layout now lists both files
- README-SETUP.md, docs/README.md, docs/roadmap.md, docs/oracle/process.md, roadmap.md, owner-checklist.md — old name replaced
- docs/oracle/briefs/ (4 files), contracts/ (9 files), specs/reconcile-original-shortages.md — old name replaced
- .agents/project/gene.md, scribe.md, .opencode/commands/scribe.md — old name replaced (these are in the repo)

## Rows changed in backlog-details.md (all checked against git log and reports)
- UX-03, UX-05: MERGED 2026-11-22 (0b471b1), owner click-through passed, migration 20261122120000 applied and in migrations; polish not built listed. [Confirmed: git log 57cd016, 80a62fc, 11ca722, 0b471b1; supabase/migrations/20261122120000_deck_order.sql]
- UX-09, UX-10: MERGED 2026-11-22 (89430e0), results as given by the owner; option B not built. [Confirmed: git log 89430e0]
- TIDY-04 DONE (local branches gone: git branch shows none of the four). TIDY-03 and RC-01 got the owner decisions. CC-12 date corrected to 2026-11-19 (commit 51c3a8e), marked done 2026-11-20. WORDS-02 note confirmed. TIDY-01, TIDY-02 were already DONE.
- DV-01 to DV-04 were still "PROPOSED, not built" but are built on main: DV-01 rail (89d2fc0 and later Figma redesign), DV-02 Strategy window (8c029a2), DV-03 chat pause (b360339), DV-04 change reason (5bb312a). Updated to BUILT.
- Added: section "Owner priority conversation 2026-11-22" and POLISH-01 (PROPOSED).
- Section headings that said "nothing started" for the tidy-up and usability lists were corrected.

## New decisions made (need owner confirmation)
- Item ID POLISH-01 for the Figma spacing item (name chosen by Gene).

## Assumptions
- Owner statements in the task text are taken as true for the 2026-11-22 events (click-through passed, pushes, results).
- "Maintained by" wording: Gene (the Orchestrator role was renamed).

## Could not verify (left as written)
- Whether stored-data drafts S3, S4, S5 (Strategy window fields, Claude change reason, Claude replacing Strategy text) are applied to the hosted database. They are still in the drafts folder, so the DV-02 and DV-04 rows say "not verified".
- HC-01 and HC-02 appear built in git (893d512, 1836005) although the file says PROPOSED. Left as PROPOSED on instruction; Gene or owner should decide how to record it.
- Owner approval of the DV-01 to DV-04 briefs and owner click-through of the rail are not recorded in the repo; rows say BUILT only.
- The three remote copies of the deleted branches (cc04b-edits, cc04d-guide-switch, import-destination) still appear in origin's branch list; not touched.
- Many older rows (Phase sections, RQ-01 to RQ-11, CC-08 to CC-11, CAT-01) were not re-audited.
- Dozens of "Update" lines in the Claude connector and Picklist sections were not re-verified individually.

## Challenges to locked decisions
- none

## Open questions
- Which next priority? (open, see the new section.)
- Which Figma spacing fixes, if any?
- Should the three owner-level decisions in the details file (Deck health HC rows) now be updated given HC-01 and HC-02 exist in code?

## References intentionally left (old names)
- docs/oracle/reports/, docs/oracle/archive/, .agents/tasks/: historical, not edited.
- Code comments in applied or draft stored-data files (supabase/migrations/20260927120000..., 20261116130000..., 20261122120000_deck_order.sql; supabase/drafts/20261116130000..., 20261118120100...; tests/db-perf/fixtures/20260927120000...): left so applied files are not changed.
- backlog-details.md lines naming two old report files ending in "-status.md" (orchestrator-astra-completion-status, orchestrator-first-implementation-status): real file names, not this file.

## Outside the repo (not edited)
- ~/agents-shared/*.md and ~/agents-shared/README.md: grep for "status.md" and "backlog" found no matches.

## Verification
- git mv done; old two files absent, new two present.
- grep for "status.md|backlog-simple" outside historical folders, node_modules, .worktrees: only the items listed above remain.
- No tests run (docs only).
