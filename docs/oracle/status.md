# Oracle — status and backlog

Maintained by the Orchestrator. One line per task. Status: TODO / IN PROGRESS / REVIEW / DONE / BLOCKED.

## Known outstanding work (seeded from last known state — verify against code before acting)
| ID | Task | Owner role | Depends on | Status |
|---|---|---|---|---|
| T-01 | Audit current schema and code against docs/oracle/decisions.md; list every mismatch | Architect | — | TODO |
| T-02 | Validate the V2 allocation resolver against real deck data (database was flushed; never re-validated) | Architect | T-01 | TODO |
| T-03 | Contract: allocation suggestion engine (reuse resolver compute, no writes) — D-007 | Architect | T-02 | TODO |
| T-04 | Move the Allocation Tab off the frozen `deck_allocations` table | Backend | T-03 | TODO |
| T-05 | Replace placeholder sequential IDs in rollup-level selection with real `physical_copy_id` values | Backend + Frontend | T-01 | TODO |
| T-06 | Spec the bulk actions in `BulkActionBar.tsx` (currently stubs) | UX/UI | T-01 | TODO |
| T-07 | Implement bulk actions | Backend + Frontend | T-06, T-05 | TODO |
| T-08 | Brew Canvas interaction spec (D-008 to D-011) with HTML mockup for owner review | UX/UI | T-01 | TODO |
| T-09 | Build Brew Canvas | Frontend | T-08 approved | TODO |

## Parked (needs owner decision first)
- O-001 Moxfield import
- O-002 Multi-user scale validation
- O-003 Mana curve slider
- O-004 Debrief / deck health
