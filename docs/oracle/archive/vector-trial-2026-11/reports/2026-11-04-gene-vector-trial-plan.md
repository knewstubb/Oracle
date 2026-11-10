# Report: gene-vector-trial-plan
Role: Gene
Status: DONE (plan only; nothing dispatched, built or migrated)
Task as received: Read AGENTS.md and role files, docs/oracle/process.md, the approved brief `docs/oracle/briefs/vector-recommendation-trial.md`, the draft contract `docs/oracle/contracts/vector-trial-2026-11.md` and the 2026-11-04 architect and product reports. Plan the sliced build/orchestration of the vector recommendation trial; write this report; update `docs/oracle/status.md` (not `decisions.md`). Do not build or run any migration. Cover: (1) Design gate skip; (2) contract sign-off or return; (3) ordered slices with owner role, dependencies and handoff text; (4) Tester tasks; (5) exact owner approvals, in non-technical wording.

## Summary for the owner
The trial can start, but I need five yes/no answers from you first (listed in plain words at the end of this report). Nothing is touched until you give them: no screens change, and your collection and decks are never written to. The first steps only look: which builds already exist, whether the online database can do "find similar cards", and a read-only copy of your two Archidekt decks. The first step that changes anything is reloading the Zombies, Aristocrats and Artifacts build lists from EDHREC, because everything per-build waits on it. The contract is sent back to the Architect for a short list of fixes. The biggest: it said reloading builds never deletes anything, but the reload does replace the old card list of each build it touches. After all the preparation you grade about 2 hours of cards, blind, and then read one go / iterate / stop result.

## Changed files
- `docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md` — this plan
- `docs/oracle/status.md` — new "Vector recommendation trial" section (slices V-01 to V-22, all TODO, none started)

`decisions.md` not edited. No product code, migration or database access.

---

## 1. Design gate (Gate 3): SKIP — confirmed
**Skipped.** The trial adds no screen, route, component or change to chat or the advisor (brief §6 "Out"; contract §2.1). There is nothing to design or mock up. This is conditional on two things:
1. The grading sheet is a plain standalone file the owner opens outside the app (no route, no app component). If it ever turns into an app screen, Gate 3 comes back.
2. Instead of a mockup, the owner sees a **5-card sample sheet** (V-18) and confirms it is readable before the 2-hour session. This is a layout check, not a design approval.

**Gate 2 (Audit):** treated as satisfied by the contract plus the five 2026-11-04 Architect reports, *provided* the kickoff data check (V-02) confirms the facts they could not verify (hosted database state). What would be deleted when the trial ends: nothing in the app. The trial's own tables and files are removed only with separate approval (contract §6). The old local legacy database is not touched.

**Gate 4 variation:** a "slice" here is one data step or one behaviour of the offline harness. The owner sees results only at three points: the build/deck check (V-02/V-03), the sample sheet (V-18), the verdict (V-20). All trial code lives on one trial branch and is **not merged to main** until the owner approves at Gate 5 (or the trial is archived on a "stop").

## 2. Contract sign-off: NOT YET — returned to Architect with 10 specific changes
The contract is thorough and I accept its design (three signals, per-build lists, combos from a dated bulk file, local free model, hard gates, pre-set go/stop numbers; they match the approved brief §7). It must not be signed until these are fixed. It stays DRAFT; Architect makes the changes in V-01; I re-read and sign in that task's review.

| # | Where | Change required | Why |
|---|---|---|---|
| C1 | §1.3 "Builds" row; §6 | Remove "only adds or updates ref_* rows (no delete)". Say instead: the build sync **deletes and re-inserts the card list of each build it touches** `[Confirmed: scripts/sync-edhrec-builds.ts L594]`. Scope it to named builds only | The statement is wrong, and AGENTS rule 5 needs destructive steps named and approved |
| C2 | §1.3 "Builds" | The sync script has **no per-commander option** (only `--limit/--offset/--min-decks`) and would process every commander with 300+ decks, and recreate every theme above 2% (Wilhelt has five on EDHREC today, not two) `[Confirmed: scripts/sync-edhrec-builds.ts L51-58, L301, L882]`. Require a small Developer change adding commander and theme filters (zombies, aristocrats, artifacts only), a dry run first (`--dry-run` exists), and a dry-run report listing exactly which rows would be replaced | Prevents a whole-database re-sync |
| C3 | §4B.2, §5.2, §5.6 | State which seed each list uses. Decision: the three graded lists (W1, W2, M1) use the **no-deck seed** (0.5 commander + 0.5 build signature cards). The owner's deck lists are used **only** for §5.6 (deck-dependent cards) and the "deck" planted-combo fixtures | One Wilhelt deck cannot sit in both Zombies and Aristocrats lists without making them look alike |
| C4 | §5.6, §1.3 | Fixtures are the owner's two Archidekt decks (read-only), not "about 30 cards from a sample". Fixed rule, written before results: all non-land, non-commander cards, used whole. Archidekt returns printing ids; map to `oracle_id` through the same mapping as everything else (D-003: printing id used only to look up) | Owner supplied real lists; rule must not be tuned |
| C5 | §2.2 | Drop the HNSW index. At ~18,850 rows an exact scan is fast, and the contract itself says to prefer exact scan (§4.3) because an approximate index with colour filters can return too few cards. Fix "~11k rows" in §7 to ~18,850 | Internal contradiction |
| C6 | §1.1, §6 | Spell out ordering vs the ten waiting import changes: the trial change sorts after them; it may not be applied out of order. Add a section "Where the trial runs": option 1, online database after the ten are settled (as drafted); option 2, a throwaway local copy so the online database is never changed. Architect states feasibility of option 2 and the pgvector check result from V-02 | Real blocker on timing |
| C7 | §5.2 | Assistant pre-grading: the drafter must not see which arm a card came from; drafts are **not shown** for the 10 blind pair comparisons; the owner's edit rate on drafts is reported (high edit rate = drafts were anchoring or wrong) | Keeps "blind" honest |
| C8 | new §5.9 "Freeze" | One dated freeze file, committed **before any evaluation pool exists**: approved builds; the infinite-result name list (§4A.5); tag allow-list and weight cutoff (§2.4.3); staple threshold (§5.3); trap cards; the 12 deck-dependent cards; multi-feature cards with their features; flip cards; frozen combo lists are computed by the harness from the dated snapshot and appended before results. Gene checks the freeze precedes pool generation | The contract says "fixed before the test" many times but names no moment |
| C9 | §9 | Replace the handoffs with this plan's slice list (V-01 to V-22). Product's brief is done | Stale |
| C10 | §5A Archidekt row | Add: reading the owner's two named public decks, read-only, is in scope; bulk pulls of other users' decks stay out and need a terms check | Avoids a contradiction with the new fixtures |

No challenges to locked decisions. Proposed wording for the register (not applied): *D-036(b) clarified 2026-11-04: the infinite-combo "ask first" rule covers any suggestion carrying a combo label that is a piece of an infinite combo; combo labels can be switched off per deck.* Needs owner approval and is not required for the trial.

## 3. Slices (ordered)
Conventions: Architect = Kimi K2.7 Code; Developer and Tester = DeepSeek v4.1 Flash (escalate one tier on BLOCKED, say so). Developer slices run **one at a time on a single trial worktree** (branch `vector-trial`), so no two agents edit the same file; Architect and Tester slices are read-only or write only their own docs. Every approval marked **[A#]** is in section 5. Hosted-database *reads* are used for checks; **writes** happen only in V-06, V-10, V-11, V-12b and V-13, each after its approval.

### Phase 0 — Prepare (parallel, no approvals except A1 for the deck pull)
**V-01 Contract fixes (Architect, depends on —).** Apply C1–C10 to the contract; stay DRAFT; return for Gene sign-off.
**V-02 Kickoff data checks (Architect, read-only, depends on —).** Report, with evidence for each:
1. Which builds exist now for Mendicant Core and Wilhelt (and Guidelight under that name, "Rotcleaver" is Wilhelt), the card count per build, signature cards that resolve to `oracle_id`, and row counts of every build table **before** any sync (a baseline for V-07). Confirm both commanders have rows and enough EDHREC decks to be picked by the sync.
2. Whether pgvector is available on the hosted database (read the list of available extensions; do not enable it).
3. The identifier question: the old local database `data/oracle.db` stores printing ids under a column named `oracle_id` (and the same-name risk in `card_definitions`). List every place in `src/` and `scripts/` that reads it, say whether any live path (collection, deck cards, import, brew) uses that column as card identity, and compare the hosted `ref_printings.oracle_id` for both commanders against Scryfall (`b20d74a4-0e08-4779-972a-499f1a2be15a`, `eada96a1-4964-4ad0-b0e3-2df08d6ae188`). Verdict: live app affected or not.
4. The pending import migrations: list which of the ten (20261020120000 to 20261023170200) and T-57's migration are applied on hosted, and what sorts after.
5. Count of distinct name → `oracle_id` pairs and any duplicate names in `ref_printings`.

**V-03 Pull the owner's two Archidekt decks (Developer, depends on A1 for the links being used as read-only fixtures).** A standalone script fetches https://archidekt.com/decks/15628123/artifacts (Mendicant) and https://archidekt.com/decks/19277239/a_rot_to_process (Wilhelt), once each, and writes two JSON fixtures in a trial folder: name, quantity, board, printing id, plus the commander. **No database connection, no writes to any user table, nothing goes through the import routes**; reuse only the existing Archidekt fetch helper, not the deck-saving code. Output also lists cards that cannot be matched later.

**V-04 Freeze document and sheet format (Architect, depends on V-01, V-02, A1/A1b).** Write the freeze file (C8) and the grading-sheet format: one card per row, plain card text (name, type line, rules text), the 4-point scale, sheet order randomised within each list, no arm, rank, build-source or combo hints except the allowed "combo" chip in the *combo-only* part, as the brief states. Includes the proposed pre-grader instructions (C7). Owner skims and edits the freeze (about 10 minutes, part of A1b).

### Phase 1 — Builds (BLOCKS all per-build work)
**V-05 Sync script filters (Developer, depends on V-01, V-02).** Add commander and theme filters to the build sync so it can run for only the named builds, plus a dry-run output listing exactly which rows would be added and which replaced; no other behaviour changes; `npm run check` green. Not run against the database here.
**V-06 Run the build sync (Developer, depends on V-05, V-02 baseline, A2).** Dry run first, Gene reads the list, then the real run for Wilhelt (Zombies, Aristocrats) and Mendicant (Artifacts). Only skipped if V-02 shows all three builds exist and are healthy. **If this fails, per-build work stays BLOCKED; nothing is simulated.**
**V-07 Check the sync (Tester, depends on V-06).** See section 4. Owner approves the final build choice here (A1 covers it; any difference from the plan is shown plainly).

### Phase 2 — Identity (parallel with Phase 3 migration drafting)
**V-08 `oracle_id` mapping (Developer, depends on V-03, V-06).** Offline function and unit tests: name → `oracle_id` from `ref_printings`; printing id → `oracle_id` for the Archidekt fixtures; unmatched names listed and excluded, never guessed; pass gate ≥ 99% of the W/U/B pool and of each build's cards. Discrete, unit-tested resolution functions (AGENTS identifier rules).

### Phase 3 — Storage (waits for approval)
**V-09 Draft the trial migration (Architect, depends on V-01, V-02).** One forward migration plus a reverse script and generated types, as drafted in contract §2.2, §4A.2 and §6 (embeddings table, similar-cards function, combo variants and pieces tables, security: read for signed-in users, write for the service account only). Includes the plain-language "what changes, can it be undone, what could go wrong" note for Gene to present. **Draft only; nothing is applied.** Gene presents it at A3.
**V-10 Apply the migration (Developer, depends on V-09, A3, V-02 item 4).** First rehearse on a throwaway database and run the reverse script there; then, only after A3, apply to the chosen target and record the result. Gene does not run it.

### Phase 4 — Data loads (writes go only into the new trial tables; each after A4)
**V-11 Embeddings, base arm (Developer, depends on V-08, V-10, A4).** Download the Scryfall Oracle Cards file (dated, kept outside the repo), build the face text per contract §2.3, embed ~18,850 face rows with the free local model, store with text hash, model version and snapshot date; idempotent.
**V-12 Scryfall oracle tags (Developer, depends on V-04 freeze allow-list, V-11).** (a) Read the dated Oracle Tags bulk file, join by `oracle_id` only, expand parent tags, apply the allow-list and cutoff, report coverage; (b) embed the `v2-tagged` arm (A4 covers the write).
**V-13 Commander Spellbook bulk (Developer, depends on V-10, A4; parallel with V-11).** Stream the gzipped bulk file (about 31 MB), keep variants with at least one card in the W/U/B pool, load variants and pieces one variant per transaction, verify every piece's `oracle_id` against `ref_printings`; drop and list any combo with an unresolved or illegal piece; never delete older rows.

### Phase 5 — Retrieval and combos (offline harness, no routes)
**V-14 Retrieval and two-signal fusion (Developer, depends on V-08, V-11, V-04).** Colour and legality filters (commander's own identity, partner-aware), build-conditioned seed, exact-scan ranking, EDHREC join by `oracle_id` with "no data" never zero, arms B1, B2, V, F2, tagged and base. Read-only.
**V-15 Combo arm, labels, switch and gates (Developer, depends on V-13, V-14).** Tiers, label text with the "Commander Spellbook" credit, the cap of 20, on / off / unknown per-deck state (off = exactly F2), validation gates 1–8, the frozen L-lists, L-cross. Read-only; the combo state lives in the harness only.
**V-16 Tester gate run (Tester, depends on V-15).** See section 4. **The owner's grading session does not start until every mechanical gate passes**, so the owner's 2 hours are not spent on a broken run.

### Phase 6 — Evaluation material
**V-17 Pool, sheet and sealed key (Developer, depends on V-16, V-04).** Generate the pooled lists (about 40 per list for W1, W2, M1), look-alike traps, multi-feature, deck-dependent, build-flip and combo-only cards; write the grading sheet, and a **separate sealed key file** mapping each card to the arms that surfaced it; also the 10 pairwise situations (A/B position randomised). Also builds the scoring script (nDCG@10, precision@10, novel finds, specificity, combo harm, pair ordering, build separation).
**V-18 Sample sheet check and drafted grades (Gene + owner; Architect drafts).** Owner sees 5 sample cards and confirms the layout. Architect (not shown the key) drafts grades for the pooled cards per C7.
**V-19a Tester check of sheet and scoring (Tester, depends on V-17)** — section 4, before V-19.

### Phase 7 — Owner session and verdict
**V-19 Owner grading (Owner, ~2 hours, ~230 grades, blind; depends on V-18, V-19a).** Recommend two sittings of about an hour (order: pooled lists, then traps and combo-only, then the 10 comparisons last). The owner may stop at the Wilhelt-only cut (about 1.2 hours) if time is short; that is a recorded limit, not a silent change.
**V-20 Score and verdict report (Architect, depends on V-19).** Run the scoring script against the sealed key, apply the pre-set go / iterate / stop rules exactly as in brief §7, state small-sample caution, report the A/B tag result separately, the combo harm check, and the direction check (inconclusive if fewer than 8 pairs). Plain-language owner summary first.
**V-21 Verification of the verdict (Tester, depends on V-20)** — numbers recomputed on a sample, hard gates restated.
**V-22 Close-out (Scribe, then Gene + owner at Gate 5).** Scribe records the session; Gene (only with approval) updates vocabulary and, if approved, D-036(b); the owner approves what happens to the trial branch (merge, archive) and the trial tables (keep, or drop with separate approval per contract §6). On "stop", the current EDHREC-based approach stays.

### Dependency map
```
V-01 ─┬─> V-04 ─────────────────────────────┐
V-02 ─┼─> V-05 ─> V-06 ─> V-07 ─> V-08 ─────┤
V-03 ─┘ (A1)        (A2)                     ├─> V-11 ─> V-12 ─┐
V-02, V-01 ─> V-09 ─> V-10 (A3) ─────────────┤                 ├─> V-14 ─> V-15 ─> V-16 ─> V-17 ─> V-18, V-19a ─> V-19 ─> V-20 ─> V-21 ─> V-22
                                              └─> V-13 ─────────┘
```
V-01, V-02 and V-03 start together. V-09 can be drafted while the sync runs. V-11 and V-13 can run in either order.

### Handoff text (exact shape from the Gene additions; dispatch only after the owner approves this plan; none has been run)
```
V-01
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-01: Apply the ten changes C1-C10 in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 2 to docs/oracle/contracts/vector-trial-2026-11.md (keep it DRAFT) and report.
Done when: each of C1-C10 is visibly resolved in the contract and your report lists the section for each.
For Brad (plain words): This asks the Architect to fix ten specific problems in the written trial plan before anything is built.

V-02
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-02: Read-only kickoff checks listed in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3 V-02 (builds present, pgvector availability, printing-id-in-oracle_id question, pending migrations, name-to-oracle_id counts); write nothing to any database and do not enable any extension.
Done when: the report answers all five items with evidence tags and a before-sync row count baseline.
For Brad (plain words): This asks the Architect to look, without changing anything, at which builds already exist and whether the online database can do similar-card search.

V-03
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-03: Write a standalone read-only script that fetches the two Archidekt decks (15628123 Mendicant, 19277239 Wilhelt, see plan section 3 V-03) into JSON fixtures in the trial folder, with no database access and no use of the import routes.
Done when: both fixtures exist with commander, card names, quantities and printing ids, and the report lists any unreadable cards.
For Brad (plain words): This asks for a read-only copy of your two Archidekt decks to be saved as test lists, with nothing added to your collection or decks.

V-04
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-04: Write the pre-test freeze file and the grading sheet format described in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3 V-04 and contract section 5.9, using V-01, V-02 reports as inputs.
Done when: the freeze file is dated, lists every item named in C8, and the sheet format shows no arm or rank hint.
For Brad (plain words): This asks for the list of test cards and rules to be written down and locked before any results exist, so the test cannot be bent to suit the answer.

V-05
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-05: Add commander and theme filters and a dry-run list of rows to be added or replaced to scripts/sync-edhrec-builds.ts per plan C2 (zombies, aristocrats, artifacts only); do not run it against any database.
Done when: a dry run with no database writes lists the exact target builds and rows, and npm run check passes.
For Brad (plain words): This asks for the build-loading tool to be made able to load only three builds instead of everything.

V-06  (after approval A2 only)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-06: Run the build sync from V-05 for Wilhelt (Zombies, Aristocrats) and Mendicant (Artifacts), dry run first and attach its output; owner approval A2 dated in the plan is cited for the real run.
Done when: the three builds exist with their card lists and the report shows before and after row counts for all build tables.
For Brad (plain words): This asks for the three build lists to be loaded into the shared card data.

V-07, V-16, V-19a, V-21
You are the Tester agent. Read AGENTS.md, ~/agents-shared/tester.md and .agents/project/tester.md before anything else.
Task <ID>: Run the checks listed for <ID> in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 4 against the finished slice and report failures without fixing them.
Done when: every listed check has a pass, fail or "could not test" with the actual output.
For Brad (plain words): This asks the checker to confirm the finished step really works and changed nothing it should not.

V-08
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-08: Write the unit-tested functions mapping card names and printing ids to oracle_id for the trial pool, the two deck fixtures and the build cards, per plan section 3 V-08; unmatched names are listed, never guessed.
Done when: at least 99% of the pool and each build resolves, unmatched names are listed, and tests pass.
For Brad (plain words): This asks for the card-matching step that makes sure every card is the right card.

V-09
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-09: Draft the trial migration, reverse script and types from the corrected contract sections 2.2, 4A.2 and 6 (draft only, apply nothing), with a plain-language note on what changes, whether it can be undone and what could go wrong.
Done when: the migration sorts after every pending one, the reverse script drops only trial objects, and the note is written.
For Brad (plain words): This asks for the one change to how data is stored to be written up for your approval, not applied.

V-10  (after approval A3 only)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task V-10: Rehearse the V-09 migration and its reverse script on a throwaway database, then apply it to the target the owner chose in A3 and report; the owner approval is cited in the plan.
Done when: the rehearsal and the real apply both succeed, and the report shows the new objects and no changes to existing tables.
For Brad (plain words): This asks for the approved storage change to be tried safely first and then applied.

V-11, V-12, V-13  (after approval A4 only)
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task <ID>: Run the data load described for <ID> in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3, writing only into the new trial tables; approval A4 is cited in the plan.
Done when: row counts, snapshot dates and the unresolved list are in the report and the load can be re-run without duplicates.
For Brad (plain words): This asks for the trial's card data (similarity numbers, labels and known combos) to be loaded into the new trial storage.

V-14, V-15, V-17
You are the Developer agent. Read AGENTS.md, ~/agents-shared/developer.md and .agents/project/developer.md before anything else.
Task <ID>: Build the offline piece described for <ID> in docs/oracle/reports/2026-11-04-gene-vector-trial-plan.md section 3 against the corrected contract, with no routes, no UI and no writes to any user table.
Done when: the listed behaviours exist with unit tests, npm run check passes, and the report lists what you could not test.
For Brad (plain words): This asks for the card-suggestion test run, the combo labels and the blind grading sheet to be built.

V-18 (drafts)
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-18: Draft grades for the cards on the grading sheet using only the sheet and the freeze file, never the sealed key, per plan C7.
Done when: every card has a draft grade and one short reason.
For Brad (plain words): This asks for a first-pass grade on each card so you only have to confirm or change it.

V-20
You are the Architect agent. Read AGENTS.md, ~/agents-shared/architect.md and .agents/project/architect.md before anything else.
Task V-20: Score the owner's grades with the V-17 script and write the verdict report using exactly the go, iterate and stop rules in docs/oracle/briefs/vector-recommendation-trial.md section 7.
Done when: the report gives the verdict first in plain words, the numbers per list, the small-sample caution and every inconclusive check.
For Brad (plain words): This asks for your grades to be turned into a single go, iterate or stop answer.
```

## 4. Tester tasks that apply
Tester is read-only and works on fixtures or the test account only, never the owner's live data. No UI exists, so the "UI state" and "endpoint example" checks in the Tester role file do **not** apply; the standing `npm run typecheck`, `lint`, `test` runs and the D-003 / D-001 checks do.

| Task | Slice | Checks |
|---|---|---|
| T-1 | V-07 | Each of the three builds exists, has ≥ 50 cards and ≥ 5 signature cards resolving to `oracle_id`; unknown-synergy and "no data" cards counted, not zero; row counts for every other commander's builds equal the V-02 baseline (nothing else replaced); user tables untouched. Also `npm run check` on the sync-script change (V-05) |
| T-2 | V-08 | ≥ 99% mapping, unmatched list present, no printing id stored as card identity (D-003); the two deck fixtures resolve; spot-check 20 cards against Scryfall |
| T-3 | V-10 (before apply, on the rehearsal) | Migration sorts after all pending ones; reverse script drops trial objects only; read for signed-in users, write for service account only; vector size matches; no existing table changed; user tables' row counts equal before and after |
| T-4 | V-11, V-12, V-13 | Embedding rows ≈ 18,850; every `oracle_id` exists in the printings table; no printing ids; re-run creates no duplicates; the load reads no user table (search); Spellbook: every kept combo's pieces 100% resolve and are legal; stale rows not deleted; tag join by `oracle_id` only, coverage figure reported |
| T-5 | V-16 | Hard gates 1–8 and frozen lists: every shown card identified, legal and in the **asking commander's own** colours (Wilhelt's four W/U/B combos must be unlabelled in Wilhelt lists); L-cmd, L-deck, L-negative (using the synthetic fixture rows), L-label recomputation, L-cross; template combo never "completes"; 5-piece combo never tier 3; combo state on / off / unknown (off list identical to F2); ownership labels correct on synthetic fixtures (a failed lookup is not "Unowned", D-030); missing build data shown as "no data", never 0; fallback seeds stated. Ownership with real data and the "separate test account" are not available, so this is flagged **untested on a real account** rather than guessed |
| T-6 | V-19a | Blind integrity of the sheet: no arm name, rank, score, EDHREC number or build-source hint; order shuffled; no duplicate card within a list; the key file is separate and not referenced in the sheet; A/B positions randomised; sample 10 cards match the key |
| T-7 | V-19a | The scoring script on a small synthetic grade set with hand-worked answers (nDCG@10, precision, novel finds, specificity, pair ordering, combo harm) matches exactly; inconclusive handling when fewer than 8 pairs |
| T-8 | V-21, V-22 | Verdict numbers recomputed for a sample of lists; D-001 / locked tables unchanged (row counts and no migration touching them); no route, page or UI file changed in the diff; reverse script still present |

## New decisions made (need owner confirmation)
- Gate 3 skipped, with the two conditions in §1.
- Gate 2 treated as satisfied by the contract and the kickoff check.
- The trial code stays on a trial branch and is not merged to main until the owner approves at Gate 5.
- Graded lists use the no-deck seed; owner decks are for the deck-dependent checks only (C3).
- Combo-only suggestions on a Mendicant list may be few (10 known combos); accepted, per the Architect.
- Proposed (not applied) register wording for D-036(b).

## Assumptions
- Mendicant's deck link (artifacts) and Wilhelt's (a rot to process) are the decks the Architect referred to as the local copies "Arti-facts" and "A Rot to Process".
- The owner reads Zombies, Aristocrats and Artifacts as the builds he actually plays (brief §9 q2); he confirms at A1.
- Hosted reads for V-02/V-07 are available to the Architect and Tester with the existing read access. If not, V-02 is BLOCKED and returns the question.
- The trial counts as work outside the current milestone ("Use what I own" slice); it is read-only and off-roadmap, so I treat the owner's Gate 1 approval as permission to run alongside it. Roadmap placement is unconfirmed (see A5).

## Challenges to locked decisions
- none.

## Open questions
1. Is the throwaway-local-copy option (C6 option 2) practical? V-02/V-01 answer it; the owner chooses at A3.
2. Is pgvector available online? V-02 answers. If not, A3 changes: the trial would run on the local copy or be paused.
3. Will the sync for Wilhelt recreate the extra builds (Tokens, Reanimator, Combo) that August's dedup merged away? V-05's theme filter should prevent this; V-06's dry run must show it.

## Verification
- Read AGENTS.md, Gene base and project files, process.md, brief, contract (all sections), status.md, decisions.md (D-001, D-003, D-006, D-007, D-028, D-036), the five 2026-11-04 reports.
- Read `scripts/sync-edhrec-builds.ts` (flags L51-58, theme cut-off L301, delete-then-insert L594, commander selection L882): confirms C1 and C2.
- Listed `supabase/migrations/` (ten import migrations 20261020120000-20261023170200 present locally) and `git status` (only the trial documents are new).
- Documentation only. No code, migration, database or dispatch run.

---

## 5. Owner approvals needed before anything runs (plain words)
Gene recommends **yes to A1 now** so the looking-only steps can start; A2 to A4 are asked later, when each step is ready, with exact results of the step before.

**A1. Builds and test lists (needed now).**
- "Are Wilhelt's Zombies and Aristocrats, and Mendicant's Artifacts, the three deck styles you actually play? And may I save a read-only copy of your two Archidekt decks (Artifacts and A Rot to Process) to use as test lists? Nothing is added to your collection or your decks in Oracle. If your answer is no on either, say which style differs."
- **A1b (small, about 10 minutes, after the Architect writes it):** "Here is the list of test cards and rules I will lock before any results exist. Skim it and tick or change anything that doesn't match how you play."

**A2. Reload the three build lists (asked after the first check shows what is missing).**
- "Oracle's shared card data may not hold your three style lists any more. May I reload them from EDHREC? It adds the lists if they are missing; if a list already exists it is replaced by a fresh copy. It touches only shared card data, never your cards or decks, and nothing else is changed. I will show you the exact list of what changes before the real run. If it goes wrong we reload again or restore the previous copy."

**A3. A new way of storing card data online (asked with a plain-language note once the Architect has drafted it).**
- "To compare cards by meaning we need to switch on a similar-card feature in the online database and add four small new storage areas that only the trial uses. They hold public card information, nothing of yours. It is one change, can be undone by one prepared undo step (the undo deletes only these trial areas, which needs your approval at the time), and I will practise it on a throwaway copy first. What could go wrong: the feature might not be available online, or it may have to wait behind the ten import changes still waiting for your approval (I will not skip the queue). Options: (1) recommended: do it online once the ten are settled; (2) run the whole trial on a throwaway copy so the online data is never touched, at the cost of a little extra setup."

**A4. Load the trial's card data (asked after A3, one yes for the group).**
- "May I download Scryfall's and Commander Spellbook's public card, label and combo files, and a free similarity tool that runs on your computer (about 130 MB, nothing about you or your cards is sent anywhere), and fill the new trial storage with them? It only writes to the new trial storage, and can be re-run safely."

**A5. Where the trial sits and what happens to the code.**
- "This trial runs beside 'Use what I own'. It changes no screen. Is that OK to run now? All trial work stays on a separate trial copy of the code and is not added to the main app unless you approve it at the end."

**A6. Your time (confirm when the sample sheet is ready).**
- "Can you block about 2 hours, ideally as two sittings of an hour, for grading? You will see plain card text only, with no hint where each came from, plus about 10 side-by-side comparisons at the end. A first-guess grade will be pre-filled; you confirm or change it. If time is short we can cut to Wilhelt only (about 1.2 hours) and the result will say so."

**Not needed now, offered at the end:** whether to record the wording clarification about combo suggestions in the decisions list.
