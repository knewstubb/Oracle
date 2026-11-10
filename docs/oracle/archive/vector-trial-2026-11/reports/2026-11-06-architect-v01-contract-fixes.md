# Report: v01-contract-fixes
Role: Architect
Status: DONE (contract stays DRAFT; returned for Gene sign-off; nothing built, run, migrated or committed)
Task as received: Slice V-01. Read AGENTS.md, your role files, docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md (esp. changes C1-C10 and V-01) and docs/oracle/contracts/vector-trial-2026-11.md. Apply C1-C10 to the contract; keep it DRAFT; do not build or run anything; return it for Gene sign-off. Write report docs/oracle/reports/2026-11-06-architect-v01-contract-fixes.md in the standard format with a plain-language owner summary. Owner has confirmed approval A1 (builds Zombies, Aristocrats, Artifacts; Archidekt decks usable as read-only test lists).

## Summary for the owner
Nothing in the app changed. I corrected the vector-trial plan document on ten points Gene raised. The biggest: refreshing the EDHREC build data does replace the stored card list of each build it touches, so it will only be run for the three builds you approved (Zombies, Aristocrats, Artifacts), after a preview showing exactly what would be replaced. Your two Archidekt decks are now written in as read-only test lists. You have no new decision to make now; at the later database approval you will choose between running the trial on the online database or on a throwaway local copy.

## Changed files
- `docs/oracle/contracts/vector-trial-2026-11.md` — C1-C10 applied (still DRAFT). Where each is resolved:
  - **C1** §1.4 first bullet (new); §1.3 Builds row now points to it; §6 item 5. The false "only adds or updates, no delete" wording is gone and withdrawn explicitly. A1 is recorded as covering exactly Zombies and Aristocrats (Wilhelt) and Artifacts (Mendicant).
  - **C2** §1.4 second bullet and the four required steps (commander and theme filters, dry run, dry-run report of rows added/replaced, before/after counts against the V-02 baseline).
  - **C3** §4B.2 (opening decision paragraph and the two seed bullets relabelled), §5.2 (cards-to-label bullet), §5.6 (fixtures feed only that check).
  - **C4** §5.6 seeds bullet (the owner's two Archidekt decks, fixed rule: all non-land, non-commander cards, whole; printing id mapped to `oracle_id`, printing id only for lookup, D-003). Reference in §1.4.
  - **C5** §2.2 (HNSW index statement removed from the sketch; "Index" bullet now "none, exact scan"), §4 step 3, §2.1 correction note, §7 two rows. "~11k" is now ~18,850.
  - **C6** §1.1 migration-backlog row, new §1.5 "Where the trial runs" (ordering rule, option 1, option 2 with feasibility, pgvector result stated as a V-02 finding), §6 item 6 and ordering line, §7 hosted-setup row.
  - **C7** §5.2 "Assistant pre-grading rules" (drafter never sees the arm; drafts hidden for the 10 blind pair comparisons; owner edit rate reported).
  - **C8** new §5.9 Freeze (dated file committed before any pool exists; Gene checks order; full list of contents; harness-computed combo lists appended before results).
  - **C9** §9 replaced by a pointer to the V-01 to V-22 slice list, with the contract sections each slice uses.
  - **C10** §5A Archidekt row (two named public decks, read-only: in scope; bulk pulls of other users' decks: out, terms check first).
  - Header: status line updated (the brief now exists, its own status line still says PROPOSED), and an "Update 4" paragraph maps C1-C10 to sections.
- `docs/oracle/reports/2026-11-06-architect-v01-contract-fixes.md` — this report.

## New decisions made (need owner confirmation)
- None new. A1 is applied as the owner confirmed it. The online-versus-local-copy choice (C6) stays open for the owner at A3.

## Assumptions
- C4 says Gene's "deck planted-combo fixtures" use the owner's decks; §5.7 L-deck fixtures are described as "a fixture deck holding all but one piece". I read these as the owner deck plus planted pieces, and left §5.7's wording as is. Gene to confirm that is intended.
- The Wilhelt "five themes on EDHREC" figure is taken from Gene's plan, tagged `[Approximate]`; I did not re-check EDHREC.
- Delete-then-insert in the sync is described as possibly non-atomic `[Approximate]`; I only read the delete at L594, not the insert that follows. V-05 should confirm and say what happens if it fails midway.
- The vector brief's status line reads "PROPOSED". Gene's plan treats it as approved; I did not assume either way in the contract.

## Challenges to locked decisions
- none

## Open questions
- For Gene: is the brief approved? The contract header now says Gene confirms.
- For Gene at sign-off: should the sync's delete-then-insert be made atomic as part of V-05? Not required by C2, so I did not add it.
- Throwaway local copy (C6 option 2): feasible in principle, but whether the owner's machine has a local database with the similarity extension is unknown. V-02 answers pgvector on hosted; the choice is the owner's at A3.

## Verification
- Read AGENTS.md, both role files, the plan and the contract in full for the sections touched.
- Checked `scripts/sync-edhrec-builds.ts`: flags L51-58, theme cut-off L47/L301, delete at L594, commander selection around L876-889. Confirms C1 and C2 as Gene stated them (grep and view; nothing run).
- Searched the contract for stale phrases (HNSW, ~11k, "no delete", "only adds", "about 30 cards"): remaining hits are the deliberate "withdrawn" statements.
- No build, test, migration or script executed. No git commit made. (One housekeeping slip: I used a scripted edit once to move text within the contract; content was checked afterwards, and all other edits used the edit tool.)
