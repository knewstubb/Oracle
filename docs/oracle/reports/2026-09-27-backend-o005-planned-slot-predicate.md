# Report: O-005 — planned-slot resolved predicate

Role: Backend
Status: DONE

Task as received: "Task O-005: fix the instance_resolved predicate for resolution='planned' in the instance_flags CTE of supabase/migrations/20260926140000_import_reconciliation_redesign.sql, per docs/oracle/contracts/import-reconciliation-redesign.md section 5, so a planned slot is unresolved (a conflict) whenever demand exceeds available instances, the card is unowned, or the card is owned but not in the specified printing (the exact opposite of the current 'no room = resolved' rule); update contract section 5 and section 13 Q3 to match, update get_deck_conflict_counts (section 7.6) since it shares the same predicate, and check whether existing tests including property tests P1/P7/P8 need updating, and separately investigate whether the 'Failed to update allocation' toast in ReconciliationSummary.tsx line 169 and the 'Deck imported with allocation warnings' toast in DeckImportButton.tsx line 214 share this same root cause or are a second bug. Done when: the migration's planned-slot predicate matches the owner's rule, get_deck_conflict_counts is consistent with it, affected tests pass, the contract doc is updated, and your report states whether the two toasts are the same root cause or a separate bug."

## Changed files
- `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` — flipped the `planned` branch of `instance_resolved` in `get_import_reconciliation` and `get_deck_conflict_counts` from "no room anywhere = resolved" to "room on the effective printing = resolved"; removed the now-unused `printing_room` / `instance_room_anywhere` CTEs in both functions; updated the surrounding comments.
- `docs/oracle/contracts/import-reconciliation-redesign.md` — rewrote §5 (slot-level resolved), §7.6 (badge wording), §13 Q3 and Q4, and the `resolved` JSDoc inside the §4.2 type block, to the new rule.
- `docs/oracle/contracts/import-reconciliation-redesign.types.ts` — updated the `ConflictInstance.resolved` JSDoc.
- `src/types/import-reconciliation.ts` — mirrored the same JSDoc change (contract-mirrored type).

## The predicate now
`planned` is resolved only while the instance's **effective** printing has room, i.e. `eff_available_supply > eff_sleeved_intent` (equivalently `sleevedIntent < availableSupply` on the effective printing). Otherwise it is unresolved — including when demand meets/exceeds supply, the card is unowned (`owned = 0`), or the card is owned only in a different printing (`printingMismatch`). This is the exact inverse of the old `NOT has_room_anywhere`. `proxy` and `sleeved`-with-supply remain resolved. Both functions now use the identical expression [Confirmed: lines 286 and 1327 of the migration].

## New decisions made (need owner confirmation)
- None beyond the owner's stated rule. One interpretation is recorded under Assumptions.

## Assumptions
- "Specified printing" = the instance's **effective** printing (`selected_printing_id ?? printing_id`), consistent with contract §2.3. An owned alternative printing does not auto-resolve a planned slot; the user must switch the effective printing.
- "Demand" is `sleevedIntent` on the effective printing (the migration's existing measure), and "room" is the strict `availableSupply > sleevedIntent`. This is the literal reading of "the exact opposite of the current 'no room = resolved' rule". Consequence to confirm: two `planned` instances competing for one free copy with none yet sleeved (`sleevedIntent = 0`) are reported **resolved** under this reading, because a free copy still exists. If the owner meant the requirements brief's broader definition ("not enough free copies for *every* instance"), the predicate should instead compare total non-proxy instance demand to `availableSupply`; that is a different change and needs a new `instance_demand` measure. Flagged as an open question.
- No finish/condition dimension is involved (D-004, contract §3.4).

## Challenges to locked decisions
- None to the locked decisions register.
- Process note: this migration was already applied to production [Confirmed: `docs/oracle/reports/2026-09-26-orchestrator-t24-apply-deploy.md`]. Editing the file in place does not change the live database and leaves the file differing from the recorded migration. A forward migration (or an approved re-apply) is required for the fix to reach production. New migrations are outside my role; flagged below.

## Open questions
- Interpretation of "demand" (see Assumptions). Please confirm whether two planned instances with one free copy should be a conflict or resolved.
- Deployment: who creates the follow-up migration, and when is it applied?

## Investigation: the two toasts — same root cause or separate?
**Verdict: neither toast is the predicate bug, and they are not the same root cause as each other. The predicate is read-only and cannot make a write fail.**

- "Failed to update allocation" (`ReconciliationSummary.tsx:169`) is a **write-path** toast. It fires only when `PATCH /api/onboarding/reconciliation/instance` returns non-OK, i.e. `set_import_claim_state` raised `sleeve_supply_exhausted` / `claim_not_found` / `invalid_state`, or the RPC itself errored [Confirmed: `src/app/api/onboarding/reconciliation/instance/route.ts:45-55`; `src/components/reconciliation/ReconciliationSummary.tsx:155-169`]. The failed predicate lives only in `get_import_reconciliation` / `get_deck_conflict_counts`, which are read-only SELECTs. The client's `canSleeve` (which disables the Sleeved button) is computed from the same supply maths as the RPC check, so the two agree [Confirmed: migration `instance_flags` `can_sleeve` vs `set_import_claim_state` `v_sleeved >= v_available`]. The only real defect here is message quality: the toast surfaces the raw token (e.g. `sleeve_supply_exhausted`) rather than a human sentence.
- "Deck imported with allocation warnings" (`DeckImportButton.tsx:214`) is an **import-path** toast. It fires when `allocationSummary.errors` is non-empty, which only happens in `built` mode from `reconcile_built_deck` conflicts [Confirmed: `src/lib/deck-import.ts:431-446`; `src/app/api/decks/import/route.ts:80-83`]. `reconcile_built_deck` is a different RPC, in a different migration (`20260926130000_exact_printing_import.sql`), reached by `/api/decks/import`; it never calls the reconciliation predicate. It is expected warning behaviour for genuinely unowned / already-claimed / `printing_mismatch` cards (D-021/D-024 warn-only).
- Because the predicate does not feed either path, the two toasts are not caused by this bug. They are also not a shared second bug: one is import-time allocation warnings, the other is a reconciliation write error. If a shared fix is wanted, it is a UI-messaging task (friendly text for both), not a database change.

## Verification
- `npm test -- src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/lib/__tests__/import-sleeve-claims.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts src/app/api/onboarding/finalize/route.test.ts src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — **42 passed (6 files)**.
- Property tests P1/P7/P8: **do not exist** for reconciliation. The only property-test files are `deck-list-generator`, `deck-cards-diff`, `upgrade-engine`, `rating-engine` and `deck-cards-diff.preservation`; no reconciliation property test references the predicate. No test needed updating. The contract §12 calls for these property tests against pure helpers that were never built; the SQL predicate itself has no automated coverage. Recommend a seeded integration test (extend `deck-import-integration.test.ts`) as a follow-up.
- `npx tsc --noEmit` — **195 primary `error TS` messages on this worktree's environment**, unchanged with and without my edits (verified by stashing the four files). No errors in any touched file. (This worktree borrows `node_modules` from the `t22-import-reconciliation-redesign` worktree; the 195 count is environment-specific and differs from the 158 baseline cited in earlier reports.)
- SQL was reviewed by hand (no local Postgres available): both CTEs compile-shape-checked, no remaining references to the removed CTE names — `grep -n "ira|instance_room_anywhere|printing_room|has_room_anywhere"` returns nothing.
