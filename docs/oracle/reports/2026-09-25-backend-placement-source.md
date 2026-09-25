# Report: placement-source

Role: Backend
Status: DONE (with a required deviation from the approved draft — see below)
Task as received: Task T-12 implementation: Apply the approved placement-source migration and update the API and data-access layer to pass source values manual, ai, or import on every placement write. Use the draft migration at ~/.paseo/worktrees/03dz1jp4/t12-placement-source/supabase/migrations/20260925220000_placement_source_DRAFT.sql and the contract at ~/.paseo/worktrees/03dz1jp4/t12-placement-source/docs/oracle/contracts/placement-source.md as inputs. The owner has approved this migration and noted that data is replaceable until MVP, so prefer simple, clean implementations. Done when: the migration is in supabase/migrations/, the API routes pass source correctly, and existing tests or typecheck pass, with a report per AGENTS.md.

## Changed files
- `supabase/migrations/20260925220000_placement_source.sql` — final applied migration: adds `deck_cards.placement_source`, backfills `manual`, adds `p_source` to every placement RPC, clears the column on every release path. Function bodies are taken from the **latest** migration that defines each function, not from the draft (see "Deviation" below).
- `src/types/placement-source.ts` — mirror of the Architect's contract types (`PlacementSource`, request bodies, RPC payloads, helpers) so app code can import via `@/types/placement-source`.
- `src/types/supabase.ts` — generated types updated: `deck_cards.placement_source`, `p_source` on the 8 placement RPC args, and `p_proxy_storage_location_id` widened to `number | null` (fixes a pre-existing type error on the file this task touches).
- `src/lib/supply-pool.ts` — `Assignment.source?` plus a batch-level `source` argument on `batchAssignDeck`, forwarded as the RPC element `source`.
- `src/lib/auto-assign.ts` — passes `'ai'` to `batchAssignDeck`.
- `src/lib/warm-start-resolve.ts` — passes `'ai'` to `batchAssignDeck`.
- `src/lib/warm-start-resolve-moxfield.ts` — passes `'ai'` to `batchAssignDeck`.
- `src/lib/card-identity-store.ts` — `linkCollectionCopyToDeckCard` passes `p_source: 'manual'`.
- `src/app/api/allocation/assign/route.ts` — uses contract `AssignBody`, passes `p_source: 'manual'`.
- `src/app/api/allocation/claim-from-deck/route.ts` — passes `p_source: 'manual'`.
- `src/app/api/allocation/assign-free-copy/route.ts` — passes `p_source: 'manual'`.
- `src/app/api/allocation/reassign-to-deck/route.ts` — uses contract `ReassignToDeckBody`, passes `p_source: 'manual'`.
- `src/app/api/allocation/undo/route.ts` — uses contract `UndoBody`, passes `p_source: 'manual'`.
- `src/app/api/allocation/add-proxy/route.ts` — uses contract `AddProxyBody`, passes `p_source: 'manual'`.
- `src/app/api/allocation/replace-with-original/route.ts` — uses contract `ReplaceWithOriginalBody`, passes `p_source: 'manual'`.
- `src/app/api/decks/[id]/cards/bulk/route.ts` — bulk add-proxy passes `p_source: 'manual'` to `add_proxies_to_slots`.

## New decisions made (need owner confirmation)
- **Corrected stale function bodies in the approved draft.** The draft's `add_proxies_to_slots`, `finalize_import_claims`, and `resolve_import_conflict_proxy` were copied from *older* migrations and would have regressed live behaviour:
  - `add_proxies_to_slots`: draft raised `card_not_found` where the current function upserts a `user_cards` row (`[Confirmed: supabase/migrations/20260912162000_atomic_collection_boundary.sql:506]`).
  - `finalize_import_claims`: draft used the superseded by-printing implementation; current is by-card-identity and also retags `scryfall_id` (`[Confirmed: supabase/migrations/20260917102526_finalize_import_claims_by_card_identity.sql]`).
  - `resolve_import_conflict_proxy`: draft re-added an advisory lock and an auto-finalize call that the current "no autofinalize" migration removed (`[Confirmed: supabase/migrations/20260917205945_resolution_rpcs_no_autofinalize.sql]`).
  The final migration keeps the current bodies and only adds `placement_source = 'import'`. **This is a substantive edit to owner-approved SQL and should be confirmed.**
- **Dropped the pre-source RPC signatures** with `DROP FUNCTION IF EXISTS` before recreating each with `p_source` (`supabase/migrations/20260925220000_placement_source.sql:51`). Adding a parameter creates an overload; dropping avoids ambiguity for calls that omit `p_source` and avoids a stale body silently leaving the column NULL.
- **Added `placement_source = NULL` to `apply_collection_sync` and `delete_user_copies`.** The contract's clearing list omitted these two bulk-detach paths; without it they would leave non-null `placement_source` on rows whose `copy_id` was cleared.
- **Tightened grants.** The draft granted the new signatures to `authenticated` and did not revoke `PUBLIC`. Since these functions take `p_user_id` and do not check `auth.uid()`, the final migration `REVOKE`s `PUBLIC, authenticated` and `GRANT`s `service_role` only, matching the existing pattern (`[Confirmed: supabase/migrations/20260912162000_atomic_collection_boundary.sql:1062]`).
- **Warm-start batch resolution records `'ai'`.** `resolveDeckBatch` and its Moxfield variant write through `batch_assign_deck`; per D-007 the allocation resolver is a suggestion engine, so these batch writes are `'ai'`.
- **Manual routes ignore `body.source`** and always pass `'manual'`, per contract validation rule 2.

## Assumptions
- The latest migration for each function is the deployed truth. I verified each draft body against the newest migration file that defines it.
- `'ai'` is correct for warm-start/auto-assign (allocation resolver writes via `batch_assign_deck`), and `'import'` is reserved for the four import RPCs that hard-code it.
- No caller invokes the placement RPCs directly from the browser; all go through Next route handlers using the service-role client, so `service_role`-only grants are sufficient.
- The migration cannot be applied from this environment (no database credentials available). It is committed in `supabase/migrations/` for the normal deploy path.

## Challenges to locked decisions
- D-009 — none. The implementation follows the decision. The drift noted above is against the Architect's draft, not the decision.

## Open questions
- Please confirm the three corrected function bodies and the `service_role`-only grants are acceptable. If the draft's older bodies were in fact live in the database (i.e. migrations lag reality), the correction direction flips and the draft should be applied instead.
- Should `placement_source` be returned by the standard `deck_cards` select so the UI can show an "AI-placed" badge? (Architect's open question; not implemented here.)

## Verification
- `npx tsc --noEmit` (before vs after, base worktree at `be96d65`) — base 301 error lines, after 299. No new errors. The single delta is the pre-existing `replace-with-original` nullability error, fixed by widening `p_proxy_storage_location_id` to `number | null`. (The repo has a large pre-existing error baseline unrelated to this task.)
- `npx eslint <all changed files>` — identical to base: 14 errors / 3 warnings, all pre-existing `no-explicit-any` / unused-var findings; zero new lint issues. `src/types/placement-source.ts` is clean.
- `npx vitest --run` — base `50 failed files / 263 failed tests`, after `51 / 265`. The only delta is `upgrade-engine.property.test.ts`, which is flaky because fast-check randomly selects properties and every failure is the missing `NEXT_PUBLIC_SUPABASE_URL` env var; re-running that file alone produced 5/4/4 failures. All suite failures are the missing-env baseline.
- `npx vitest --run src/lib/__tests__/supply-pool.test.ts src/lib/allocation-candidates.test.ts` — identical to base (5 env failures, 17 pass).
- Migration structural check — 21 `AS $function$` blocks, 21 `$function$;` terminators, 9 `DROP FUNCTION IF EXISTS`, no remaining `DRAFT`/`p_printing_id`/`import-printing` references.
