# Oracle — status and backlog

Maintained by the Orchestrator. One line per task. Status: TODO / IN PROGRESS / REVIEW / DONE / BLOCKED / PARKED.
Read `docs/oracle/roadmap.md` first. Only tasks in the **current milestone** may be started.

**Owner note (2026-09-25):** Until Oracle reaches MVP, live data can be easily replaced. Migrations do not need to be overly cautious; clean-slate or drop-and-rebuild approaches are acceptable with owner approval.

## Roadmap change 2026-10-11 — foundation-first phases

The owner replaced milestones M1–M5 with ten phases (see roadmap.md). **Phase 1 — Safety net is CURRENT.** Everything in the M2 and quality-pass sections below is paused until its phase. Mapping:
- Phase 1: T-39, T-40–T-45.
- Phase 3: T-25, T-26.
- Phase 4: T-27, T-38.
- Phase 6/7: T-28.
- Phase 7: T-29, T-30, T-37.
- Phase 8: T-14–T-19, T-36.
- Phase 9: T-06–T-09.

### Phase 1 — Safety net (CURRENT)
Owner direction 2026-10-11: Oracle runs on his computer against the hosted Supabase database, with no Vercel for now. Vercel and the scheduled/E2E GitHub jobs are low priority; T-43 means checks that run locally (one command) first, with GitHub automation optional.
| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-39 | Fix the randomly failing deck-list completeness property test | Developer | — | DONE — merged to main 1b8d9ae (2026-10-11) on owner approval; 20/20 passes re-verified |
| T-40 | Triage every failing check: 134 failing unit tests in 34 files, 141 type errors, 270 lint errors and the failing scheduled jobs (Sync Commanders, Shared Read-only Smoke, e2e). Classify each as an out-of-date check, a real app bug (name its phase), or belonging to paused work. Confirm no test writes to real data. Propose fix batches that share no files | Tester (read-only) | — | REVIEW — Tester agent ac55dd41 DONE: all 134 failing tests are out of date or need mock fixes (no real app bug found); 139 type errors and 264 lint errors are code-quality debt; no unit test can touch real data; hosted-app jobs fail from missing setup. Proposed batches A1–A6, B (paused Phase 8/9 tests), C (online jobs, last). Report is in worktree task-t40-check-triage, not yet in main |
| T-41 | Fix out-of-date checks batch by batch per T-40; real app bugs go to their phase, not fixed here | Developer | T-40 | TODO |
| T-42 | Fix the type errors, then stop the build ignoring them (`ignoreBuildErrors`) | Developer | T-40 | TODO |
| T-43 | Make unit tests, type checking and lint one command that is easy to run locally (and before each merge); GitHub automation only if cheap | Developer | T-41, T-42 | TODO |
| T-44 | Recovery plan: what a full backup must cover (copies, storage locations, deck assignments, history), what the hosted database already provides, and a restore test proposal | Architect (read-only) | — | REVIEW — Architect agent e09a16af DONE: plan in worktree task-t44-recovery-plan (contracts/recovery-plan.md), not yet in main; owner decisions pending (backup approach, frequency, where to keep .env.local and source files) |
| T-45 | (done) Bring the online copy (origin/main, last updated 2026-09-28; local main is 24+ commits ahead) and the live app up to date with main | Gene → Owner | Owner approval to push; confirm what the live app deploys from | DONE — main pushed 3b0998d→1a39d6f on owner approval 2026-10-11; Vercel built it successfully, but Vercel is not used for now; the E2E Tests workflow failed on the new commit (covered by T-40) |

## M1 — Trustworthy data (COMPLETE — migrations deployed 2026-09-26)
| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-01 | Audit current schema and code against docs/oracle/decisions.md; list every mismatch | Architect | — | DONE |
| T-02 | Validate the V2 allocation resolver against real deck data (read-only) | Architect | T-01 | DONE |
| T-10 | Owner decision pack: for each T-01 mismatch, present "fix the code" vs "update the decision" in plain language; owner decides | Orchestrator → Owner | T-01, T-02 | DONE |
| T-03 | Contract: allocation suggestion engine (reuse resolver compute, no writes) — D-007 | Architect | T-02, T-10 | DONE |
| T-11 | Draft migration retiring `allocation_clear_active_decks` and any other destructive allocation RPC — D-007 | Architect | T-03 | DONE — migration deployed 2026-09-26 |
| T-12 | Contract + draft migration adding a `source` parameter (`manual` / `ai` / `import`) to every placement write — D-009 | Architect | T-10 | DONE — migration deployed 2026-09-26 |
| T-04 | Move the Allocation Tab off the frozen `deck_allocations` table | Backend | T-03 | DONE |
| T-05a | Replace placeholder sequential IDs in rollup-level selection with real `physical_copy_id` values (API / data-access) | Backend | T-01 | DONE |
| T-05b | Update UI to consume real `physical_copy_id` values from rollup API | Frontend | T-05a | DONE |
| T-13 | M1 exit test: import owner's real Archidekt collection and decks; reconcile counts, deck lists and copy assignments against Archidekt; report differences | Architect (read-only report) | T-04, T-05, T-11, T-12 | DONE — owner decisions locked as D-018 to D-021 |
| T-20 | Update deck importer to import Archidekt maybeboard and sideboard cards into Oracle's maybeboard relation | Backend | T-13, D-018 | DONE — migration deployed 2026-09-26 |
| T-21 | Update deck importer to assign copies only when the exact printing (`scryfall_id`) is owned; otherwise leave the slot unassigned | Backend | T-13, T-20, D-021 | DONE — migration deployed 2026-09-26 |

## M2 — AI advisor v0 (PAUSED 2026-10-11 — now Phase 8; see mapping above)
| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-14 | Audit existing AI code (`src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`): what data can the AI see today, and where is D-016 violated | Architect (read-only) | T-01 | DONE |
| T-15 | Contract: advisor tools, verified commander/deck/card context, structured read-only proposals and safe confirmation boundary; incorporate T-19 and approved availability meanings | Architect | T-13, T-14; T-19 as research input; reviewed T-28 interface before acceptance | REVIEW — Astra agent c99e3ba7 returned DONE: advisor contract/types, 43 reference checks and safeguard proposals; coordinator verification, owner choices and T-28 reconciliation pending; 2026-10-10: owner answered O1–O5 (D-034–D-036). O1 differs from the contract (direct apply + undo, not read-only), so the contract needs revision under T-36 |
| T-16 | Spec + HTML mockup: advisor chat beside deck view, suggestion cards per availability group (D-012–D-014) | UX/UI | T-14 | TODO |
| T-17 | Implement advisor backend against T-15 | Backend | T-15 | TODO |
| T-18 | Implement advisor frontend against T-16 | Frontend | T-16 approved, T-17 | TODO |
| T-19 | Assess the existing AI recommendation system end to end; verify Jev's identity/suitability against alternatives and design evidence-backed commander-specific mechanics/archetype coverage using existing data | Architect (read-only research) | T-14; owner-expanded scope 2026-09-29 | REVIEW — agent 7d860b27 returned DONE: existing-system gaps, Jev not recommended yet, 16-commander matrix and evaluation plan; implementation proposals/tests not yet fully accepted; assessment and report saved to main 2026-10-10 (workspace archived) |
| T-22 | Redesign import reconciliation flow: tabbed layout, state-based conflict resolution, wishlist, printing selection, and hover previews | UX/UI / Frontend | T-13 | DONE — spec, mockup, contract, and Frontend implementation merged |
| T-23 | Define import reconciliation API contract and data model (per-instance state, alternate printing, persistence) | Architect | T-22 | CANCELLED — superseded by contract in T-22 |
| T-24 | Implement Backend reconciliation API routes (`/api/onboarding/reconciliation/*`) per T-22 contract | Backend | T-22 | DONE — routes, Frontend label, and Architect migration all aligned; migration remains DRAFT pending owner approval before deploy (draft note superseded: migration deployed 2026-09-28 per O-005) |
| T-35 | Make onboarding import any public Archidekt account from the entered collection URL/account identifier, including that account's collection and decks | Backend | Owner confirmation 2026-09-30; current onboarding import flow | DONE — merged to main in 6768d34 (2026-10-05); 32 focused tests and build pass |

**AI assessment authorisation (2026-09-29):** T-19 now includes a fresh, source-backed review of the existing AI and its data inputs, rather than assuming the previous audit is still current or Jev is already a suitable recommendation engine. It runs independently of T-27/T-28 and must produce a Jev verdict, coverage/gap examples across different commanders, a measurable evaluation plan, and prioritised improvement recommendations. Copilot Opus 5.5/high agent `7d860b27-5910-40ee-8e49-b816812dff92` is launched in its own worktree; its initial read-only briefing request was approved. Scope and handoff: [AI assessment dispatch](reports/2026-09-29-orchestrator-dispatch-ai-assessment.md). T-15 through T-18 are not started by this instruction.

### Quality pass — preparation returned; first implementation batch in review

Added by the 2026-09-29 state-of-the-nation review. The owner subsequently approved the readiness/terminology direction and resolved the main state-model gaps: see D-002, D-005 and D-025 through D-033. The latest clarification is recorded in `docs/oracle/reports/2026-09-29-orchestrator-original-shortages.md`. These decisions supersede incompatible earlier recommendations, notably Plan proxy, manual full-list Draft, Missing, Archive as an action, manual confirmation for generic basics, and treating proxies as supply that cancels original shortages. Approval of these rules is not approval of a UI mockup, migration, deployment, or milestone change.

**Owner review plans (2026-09-29):** [Behaviour and actions](plans/01-behaviour-and-actions.md), [Components and screens](plans/02-components-and-screens.md), and [Faster loading](plans/03-loading-performance.md). B1-B3, revised U1, U2, clarified U3, and P1-P3 direction are approved. U3 is original-copy shortages, including requirements already covered by proxies; proxy supply never cancels that shortfall. O-009 is resolved.

**Dispatch authorisation (2026-09-29):** the owner said "Okay. Allocate work as you see fit" and authorised stronger models than the role defaults. T-28 contract preparation and T-27 source-backed investigation may run independently; T-27 first verifies the measurement prerequisite and must not take runtime timings without a verified safe target. T-25/T-29/T-30 follow the reviewed T-28 contract as a coherent pick-list-first UX preparation slice. T-26 follows owner approval of T-25. No app implementation, migration, merge, deployment or milestone transition is authorised by this dispatch.

**Initial returned handoffs (2026-09-29):** all three original agents returned and were idle when inspected. T-28 and T-19 returned DONE reports for coordinator/owner review; T-27 completed its source investigation but returned BLOCKED on safe runtime measurement. See [returned work and actionable next steps](reports/2026-09-29-orchestrator-agent-returns-actionable.md). Those outputs remain unmerged and unapproved for implementation. The newer Astra follow-ups below supersede the earlier idle snapshot; the original Opus agents are not being resumed. The dependent UX agent has not been launched.

**Astra solution-design authorisation (2026-09-29):** the owner's subsequent instruction authorises focused T-15 advisor architecture, T-28 draft correction/hardening, and T-27 loading solutions. This is not another broad audit or permission to implement. The original T-19 assessment remains REVIEW; new work must verify the claims it depends on. The measurement blocker remains even while T-27 can design source-backed solutions. Scope, output ownership and actual launch records: [Astra solutions dispatch](reports/2026-09-29-orchestrator-dispatch-astra-solutions.md).

**Astra returns (2026-09-29, checked after 21:14 NZDT):** all three agents have returned and are idle with no pending permissions. T-15 and T-27 report their architecture assignments DONE. T-28 completed its bounded revisions but reports PARTIAL for implementation acceptance because product choices and Maybeboard representation remain gated. All three outputs are now REVIEW, not approved implementation; runtime timing remains blocked. See [Astra completion status](reports/2026-09-29-orchestrator-astra-completion-status.md).

**First implementation authorisation (2026-09-29):** the owner subsequently instructed "Delegate work to implement". The Orchestrator reviewed T-27 F1/F2/B1 and the confirmed T-15 native-stream accumulator defect and is dispatching only these behaviour-preserving slices. New UI designs, the full advisor protocol, T-28 data/action changes, owner choices, safe runtime measurement, merges and deployment remain gated. [Implementation dispatch and complete briefs](reports/2026-09-29-orchestrator-dispatch-first-implementation.md).

| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-25 | Spec approved card/deck vocabulary and imports, with the pick list as a primary assembly screen showing physical sources and consistent Sleeve/Move/Proxy actions | UX/UI | T-28 | TODO — B1-B3 and pick-list direction approved; spec not started |
| T-26 | Specify reuse of status badges, pick-list/card rows, primary actions/menus, filters, scoped spinners and correctly shaped loading skeletons | UX/UI | T-25 approved | TODO — U2 and P3 direction approved |
| T-27 | Investigate Collection, deck list/detail, pick-list assembly and reconciliation loading; design bounded improvements while preserving correct copy locations and post-transfer refresh | Architect | P1-P3 approved; verified measurement environment before runtime timings | REVIEW — Astra agent 43a8b166 returned loading-solutions architecture DONE; three bounded Collection changes and safe measurement proposal; runtime baseline remains BLOCKED; F1/F2/B1 delivered via T-32/T-33 (merged 863d4b3); baseline/solutions docs saved to main 2026-10-10 (workspace archived); pick-list location findings and safe measurement remain open |
| T-28 | Contract approved readiness, supply, movement, Proxy, Maybeboard release, generic-land coverage and original-copy shortages including proxy-filled slots; identify the safe Missing transition | Architect | D-002, D-005, D-025–D-033 | REVIEW — Astra successor bb0c8bd5 returned bounded revisions complete, acceptance PARTIAL; revised types and 127 reference assertions reported; product, Maybeboard-representation and integration gates remain; 2026-10-10: owner answered Q1 (all decks count, no retired concept: D-029/D-037), G-M3 (D-038), G-D2/G-D3 (D-039); later the same day G-D1 (no transition needed, owner will reimport: D-028) and G-O1 (Casual counts as a complete list: D-002) |
| T-29 | Spec original-copy shortages and actual proxy usage across decks, accounting for owned original supply and without affecting readiness or assignments | UX/UI | T-28 (for this scope, D-027/D-037 supply the rules) | REVIEW — Designer agent 37d94a68 DONE (spec, mockup and a current-state card-management overview, all in worktree task-t29-reconcile-shortage-spec); owner review when Phase 7 starts. O-009 answered; scope approved, spec not started; 2026-10-10: D-037 makes the Reconcile page this view, so the spec now covers the existing Reconcile page |
| T-30 | Spec generic basics as automatically Sleeved, with quantity controls and no outstanding pulls; retain normal assignment controls for tracked basics | UX/UI | T-28; D-032 | TODO — revised U1 behaviour approved; mockup still needs approval |

### First implementation batch — isolated work, review before merge

| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-32 | Implement Collection active-view loading and a single search pause with coherent query/page transitions, preserving existing UI/defaults and honest states | Frontend | Reviewed T-27 F1/F2 scope; explicit owner implementation instruction | DONE — merged to main in 863d4b3 (2026-10-05); I-01 combined check report saved; workspace archived 2026-10-10 |
| T-33 | Eliminate duplicate Collection price-freshness reads while preserving valid payloads, null/error semantics and the 48-hour boundary | Backend | Reviewed T-27 B1 scope; explicit owner implementation instruction | DONE — merged to main in 863d4b3 (2026-10-05); workspace archived 2026-10-10 |
| T-34 | Fix first-delta duplication in DeepSeek native streamed tool-call argument accumulation with focused mocked regressions | Backend | Verified source defect and T-15 S3 native-accumulation invariant; explicit owner implementation instruction | DONE — merged to main in 863d4b3 (2026-10-05); not the full AI safeguards; workspace archived 2026-10-10 |

**Implementation returns (2026-09-29, checked after 21:42 NZDT):** all three agents are idle with no pending permissions. Their completion reports and scoped changed-file inventories exist in their isolated worktrees. The Orchestrator has read the reports, but has not yet completed code acceptance or independently rerun their checks. Nothing from this batch has been merged or deployed. See [first implementation completion status](reports/2026-09-29-orchestrator-first-implementation-status.md).

**Implementation review (2026-09-29, after owner "Please review"):** supersedes the return-only snapshot above. The coordinator reviewed all three diffs, reran focused tests/lint/typechecks and reproduced five uncovered acceptance failures. T-32 and T-33 have bounded corrections sent to their original agents; T-34 is accepted within scope pending owner approval before merge. The broader baseline remains red and hosted loading targets remain unmeasured. See [findings, exact corrections and independent evidence](reports/2026-09-29-orchestrator-first-implementation-review.md).

**Correction returns (2026-09-29, checked after 22:37 NZDT):** T-32 and T-33 are now idle with no pending permissions and revised DONE reports. Their claimed fixes and expanded checks still require coordinator re-review; they are not yet accepted or merged. T-34 remains accepted pending owner merge approval. See [next steps after correction returns](reports/2026-09-29-orchestrator-next-after-corrections.md).

**Final correction review (2026-09-29, after owner "Continue"):** all three scoped implementations are now coordinator-accepted and await owner merge approval. The original reproduced failures pass, and additional same-agent test-only follow-ups made Collection regression coverage permanent and corrected a false-positive pagination setup. No new type/lint diagnostics were introduced; the existing baseline remains red. No main-source merge, commit, deployment or live timing measurement occurred. See [final acceptance and merge recommendation](reports/2026-09-29-orchestrator-first-batch-acceptance.md).

### Owner answers 2026-10-10: follow-up tasks (T-29, T-36, T-38, T-39 started 2026-10-10; all returned DONE; T-39 now listed under Phase 1)

| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-36 | Revise the T-15 advisor contract for D-034 (direct apply, undo for every AI change with `source = 'ai'`), D-035 (Scryfall estimate prices) and D-036 (advisor defaults), and reconcile its shared interface with the T-28 card-state contract | Architect | T-15, T-28 owner answers (D-037–D-039) | REVIEW — agent bed535bb DONE; review paused with Phase 8 |
| T-37 | Change the Reconcile overuse calculation to D-037: original copies are the only supply, every main-deck slot (including Sleeved-proxy slots) counts as demand, cards with no original owned appear, card-level matching, all decks count, generic basics excluded | Developer | T-29 approved (owner answers on no-original cards and matching received 2026-10-10) | TODO — waits on T-29 spec approval |
| T-38 | Remove Missing (D-028) and legacy Graveyard/retired labels (D-029) from screens and filters; existing Missing-marked copies may behave as ordinary owned copies (owner will reimport); no migration | Developer | Owner answer 2026-10-10 (D-028) | DONE — merged to main 1a39d6f (2026-10-11) on owner approval; focused tests 71/71 pass, no new type errors, same failing test files as before; Missing-flagged copies still cannot be sleeved until reimport (assign_physical_copy guard, no migration) |

### Owner-requested portfolio review

| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-31 | Audit documented feature families against current implementation and competing apps; report pros/cons, essential versus optional capabilities and a proposed delivery roadmap | Orchestrator | Owner request 2026-09-29; current decisions and source evidence | DONE — [full audit](reports/2026-09-29-orchestrator-feature-portfolio-audit.md), with 503-file inventory; priorities/roadmap are proposals, not implementation or milestone approval |

**Portfolio scope:** the audit distinguishes source-wired, partial, proposed and removed/deferred capabilities. It does not certify every historical acceptance criterion or hosted workflow. It preserves T-19/T-27/T-28 as separate handoffs and makes no completion claim about their results. Current decisions and owner gates remain unchanged; older comparison documents and the older broad roadmap now point to the evidence-qualified audit.

## M3–M5 — parked until their milestone is current
| ID | Task | Milestone | Status |
|---|---|---|---|
| T-06 | Spec the bulk actions in `BulkActionBar.tsx` | M4 (re-check against parity log) | PARKED |
| T-07 | Implement bulk actions | M4 | PARKED |
| T-08 | Brew Canvas interaction spec + HTML mockup (D-008–D-011) | M4 | PARKED |
| T-09 | Build Brew Canvas | M4 | PARKED |
| — | Accept-suggestion flow, maybeboard, undo | M3 | not yet broken into tasks |

## Open items
- O-006 RESOLVED (2026-10-10) — owner confirmed M2 as current; roadmap now marks M1 COMPLETE and M2 CURRENT, and the T-24 draft note is marked superseded.
- O-007 Integration readiness — the 2026-09-29 review found collection status filters are not connected to the displayed results, status lookup failures can become "Unowned", and existing component expectations disagree with current wording/defaults. Type checking also fails in application code, while builds are configured to ignore type errors. Triage alongside T-25–T-27 before broad component replacement; do not weaken checks or silently change behaviour. See the state-of-the-nation report.
- O-008 Missing retirement and basic-land transition — existing excluded-copy handling remains unapproved: do not delete records or automatically restore eligibility. Generic basics are now explicitly approved to count as Sleeved without physical assignment (D-032); stop requesting manual confirmation for them. Preserve actual owned copies when designing any conversion between tracked and generic lands. **2026-10-10:** owner re-confirmed removal of Missing for now (T-38) and said existing data does not matter because he will reimport (D-028); no data conversion is needed.
- O-009 RESOLVED (2026-09-29) — the list identifies original-copy shortfalls and proxy usage to inform buying additional originals, not assembly coverage. One original plus one proxy for two deck requirements remains an original shortfall of one. Include Sleeved proxy slots, not just Unsleeved requests; proxies never reduce original demand. T-29 is unblocked for specification after T-28.
- O-010 Break down has no on-screen button: the breakdown route exists but its only caller (StatusControl) is not mounted anywhere. The card-management overview §5.4 describes it as available. Phase 7.
- O-001 Moxfield import — routes exist under `src/app/api/onboarding/moxfield/`; confirm status in M5
- O-002 Multi-user scale validation — M5
- O-003 Mana curve slider — candidate for M2/M3 advisor feature, not specced
- O-004 Debrief / deck health — after M3
- O-005 Fix T-22/T-24 reconciliation predicate — default `planned` instances are incorrectly treated as resolved, hiding owned and unowned conflicts from the reconciliation screen. See report `docs/oracle/reports/2026-09-27-orchestrator-import-reconciliation-empty.md`.
  **Owner-confirmed rule (2026-09-27):** a slot is resolved only when a real matching instance can be slotted in. A `planned` slot is a **conflict** (unresolved) whenever: more slots want a printing than there are available instances of it, the card is unowned, or the card is owned but not in the specified printing. This reverses the current contract §5 rule, which treats "no printing option has room" as resolved.
  **Round 2 correction (2026-09-27):** Backend's first fix only counted already-`sleeved` claims as competing demand, so two `planned` claims contesting one free copy still showed as resolved. Owner clarified competing demand must include `planned` claims too, and requested the `already_claimed` flag split into two distinct states (claimed with no alternate vs. claimed with an alternate available) — see `docs/oracle/import-reconciliation-states.md` (owner-approved states table, 14 states). Architect (Kiro Opus 5.5) produced a corrected DRAFT forward migration `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` plus updated contract/types; Backend's earlier in-place edit on the unmerged `grumpy-snake` worktree is superseded and must be discarded, not merged. Report: `docs/oracle/reports/2026-09-27-architect-o005-slot-states.md`.
  **Owner decisions (2026-09-27):**
  - State 4 (auto-allocate at finalize when a printing fits every competing slot) — **approved as designed.**
  - `reconcile_built_deck` sequential-import gap (first deck imported can claim a contested copy before reconciliation runs) — **not a bug.** Reconciliation only happens at import time, so the first deck imported is expected to be allocated first. No follow-up task needed.
  - Deck conflict badge (`get_deck_conflict_counts`, contract §7.6) after "Allocate Cards" — **remove it.** Once finalize runs, anything left is just a normal Planned slot, not a conflict; the badge should no longer surface leftover Planned claims as unresolved.
  **Deployment complete (2026-09-28):** `20260927120000_import_reconciliation_slot_states.sql` applied successfully; remote migration history now matches local. Live all-unsettled and latest-batch RPC checks both succeed in ~4.9s, returning 1,500 total rows, 322 unresolved rows (223 owned / 99 unowned), and 18 decks.
  DONE for the database fix. **Follow-up verification (2026-09-28):** the remote migration is confirmed applied; live all-unsettled reconciliation succeeds in 2.6s (1,039 rows, 211 unresolved, 12 decks), and the historical batch succeeds in 0.3s. The delegated route review found no second timeout path or app-side timeout setting; targeted reconciliation tests (44) and the live-sized performance harness pass. No code change was warranted. If the owner still sees the error after a hard refresh, capture the deployed app URL/commit and approximate time for a deployment-specific investigation.
