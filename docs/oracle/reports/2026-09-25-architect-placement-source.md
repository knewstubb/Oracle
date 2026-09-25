# Report: placement-source

Role: Architect
Status: DONE
Task as received: Task T-12: Write the contract and draft migration for adding a source parameter with values manual, ai, or import to every placement write. Use docs/oracle/decisions.md D-009, docs/oracle/contracts/audit-2026-09.md, and the assignment and proxy APIs in src/app/api/allocation/ as inputs. Output: docs/oracle/contracts/placement-source.md, docs/oracle/contracts/placement-source.types.ts, and a draft migration in supabase/migrations/ marked DRAFT. Done when: every placement write path has a documented source parameter and the draft migration adds the needed column or RPC changes, with Confirmed path citations, plus a report per AGENTS.md.

## Changed files

- `docs/oracle/contracts/placement-source.md` — Human-readable contract defining `PlacementSource` (`manual` | `ai` | `import`), the `deck_cards.placement_source` schema change, every placement write path, API request bodies, RPC signature changes, validation rules, and backwards-compatibility notes.
- `docs/oracle/contracts/placement-source.types.ts` — Shared TypeScript types for request bodies, RPC payloads, and helper functions.
- `supabase/migrations/20260925220000_placement_source_DRAFT.sql` — Draft migration adding `deck_cards.placement_source`, backfilling existing rows to `manual`, and updating all placement/clearing RPCs to read/write it.
- `docs/oracle/reports/2026-09-25-architect-placement-source.md` — This report.

## New decisions made (need owner confirmation)

- Store placement source on `deck_cards.placement_source` as current-state metadata, not in a separate audit-log table. Rationale: the source describes the current assignment; it is read/written in the same atomic RPC and requires no extra join for the UI. A separate audit history is left as a possible follow-up.
- Existing filled slots are backfilled to `manual` because their original source is unknown.
- Clearing operations (release, unassign, mark missing, deck delete) set `placement_source = NULL` alongside `copy_id = NULL` and `ownership_status = NULL`, keeping the column semantically tied to a filled slot.
- `undo_copy_move` restore-to-deck records the new placement with `p_source` (default `manual`). The previous source of the cleared slot is intentionally not preserved, consistent with current-state semantics.

## Assumptions

- The `source` parameter is optional at the API layer and defaults to `manual`; existing callers continue to work.
- RPC signatures can be safely extended with a `p_source text DEFAULT 'manual'` parameter because Postgres default arguments preserve backwards compatibility for existing callers.
- `batch_assign_deck` is the only path where the caller legitimately passes `ai`; the auto-assign caller will set it, and any future batch UI caller will set `manual`.
- Composition-only RPCs (`apply_deck_cards_diff`, `apply_ai_deck_delta`) that insert planned slots without copies are out of scope because they are not placement writes.

## Challenges to locked decisions

- None.

## Open questions

- Should `placement_source` be exposed in the standard `deck_cards` select response so the UI can show an "AI-placed" badge? Recommended: yes.
- Should clearing operations record the previous source in a separate audit table? This contract keeps only current-state source.
- The referenced input `docs/oracle/contracts/audit-2026-09.md` does not exist in the repository. I proceeded using the live allocation code and D-009 as the authoritative sources.

## Verification

- `ls supabase/migrations/20260925220000_placement_source_DRAFT.sql` — file created.
- `ls docs/oracle/contracts/placement-source.md` — file created.
- `ls docs/oracle/contracts/placement-source.types.ts` — file created.
- Confirmed path citations included in `placement-source.md` for every placement write path.
