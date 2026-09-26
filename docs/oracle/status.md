# Oracle — status and backlog

Maintained by the Orchestrator. One line per task. Status: TODO / IN PROGRESS / REVIEW / DONE / BLOCKED / PARKED.
Read `docs/oracle/roadmap.md` first. Only tasks in the **current milestone** may be started.

**Owner note (2026-09-25):** Until Oracle reaches MVP, live data can be easily replaced. Migrations do not need to be overly cautious; clean-slate or drop-and-rebuild approaches are acceptable with owner approval.

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

## M2 — AI advisor v0 (CURRENT)
| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-14 | Audit existing AI code (`src/app/api/brew/*`, `src/app/api/ai/brew/*`, `src/app/api/decks/[id]/chat`, `src/lib/tool-registry.ts`, `src/lib/adapters/*`): what data can the AI see today, and where is D-016 violated | Architect (read-only) | T-01 | DONE |
| T-15 | Contract: advisor tools (collection availability, deck contents, structured suggestions grouped owned-free / owned-in-other-deck / buy with price) | Architect | T-13, T-14 | TODO |
| T-16 | Spec + HTML mockup: advisor chat beside deck view, suggestion cards per availability group (D-012–D-014) | UX/UI | T-14 | TODO |
| T-17 | Implement advisor backend against T-15 | Backend | T-15 | TODO |
| T-18 | Implement advisor frontend against T-16 | Frontend | T-16 approved, T-17 | TODO |
| T-19 | Research Jev (TypeSafe AI System One model) for fast card-recommendation classification | Architect (read-only research) | T-14 | TODO |
| T-22 | Redesign import reconciliation flow: tabbed layout, state-based conflict resolution, wishlist, printing selection, and hover previews | UX/UI | T-13 | REVIEW — revised mockup ready for owner input |

## M3–M5 — parked until their milestone is current
| ID | Task | Milestone | Status |
|---|---|---|---|
| T-06 | Spec the bulk actions in `BulkActionBar.tsx` | M4 (re-check against parity log) | PARKED |
| T-07 | Implement bulk actions | M4 | PARKED |
| T-08 | Brew Canvas interaction spec + HTML mockup (D-008–D-011) | M4 | PARKED |
| T-09 | Build Brew Canvas | M4 | PARKED |
| — | Accept-suggestion flow, maybeboard, undo | M3 | not yet broken into tasks |

## Open items
- O-001 Moxfield import — routes exist under `src/app/api/onboarding/moxfield/`; confirm status in M5
- O-002 Multi-user scale validation — M5
- O-003 Mana curve slider — candidate for M2/M3 advisor feature, not specced
- O-004 Debrief / deck health — after M3
