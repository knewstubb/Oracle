# Report: O-005 correction round 2 — import reconciliation slot states
Role: Architect
Status: DONE

Task as received: "Task O-005 (correction round 2): docs/oracle/import-reconciliation-states.md is the owner-approved source of truth for card slot states during import reconciliation. Reconcile docs/oracle/contracts/import-reconciliation-redesign.md sections 5, 7.6 and 13 Q3 against it. Read docs/oracle/reports/2026-09-27-backend-o005-planned-slot-predicate.md for what Backend already tried and found. Two concrete gaps to fix: (1) sleeved_intent/printing_demand in get_import_reconciliation and get_deck_conflict_counts (in supabase/migrations/20260926140000_import_reconciliation_redesign.sql, already deployed to production) must count resolution IN ('sleeved','planned') as competing demand, not just 'sleeved', so overallocated planned slots show as conflicts before anyone clicks Sleeve; (2) the already_claimed flag must split into two distinct states (claimed by another deck with no free alternate printing, vs claimed but an alternate printing is available), matching states 2/3/8/9 in the states doc. Since the migration is already deployed, author a NEW forward migration rather than editing the deployed file in place, and update the contract and its .types.ts to match. Done when: the contract and types match every state in the states doc, a new forward migration implements the corrected demand-counting and available-alternate distinction, and your report states which existing tests need updating as a result."

## In plain terms

- The screen now works out one clear state for each card slot, using the names in your states table. For example: "Planned (conflict)", "Planned (alt printing available)" or "Planned (claimed by another deck)".
- If two decks want your one Felothar, both now show as a conflict the moment the import lands. Before, that only happened after someone clicked Sleeve.
- "Claimed by another deck" and "another printing is free" are now two separate states, so the screen can offer the right button for each.
- Every Planned state now counts as unresolved. The only exception is state 4: the card fits every deck that wants it, so it's allocated automatically when you press Allocate Cards.
- The fix is a new database migration. The one already live in production has not been touched. The new migration is a DRAFT and needs your approval before it's applied.

## Changed files
- `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` — NEW forward migration (DRAFT). Replaces the bodies of `get_import_reconciliation`, `get_deck_conflict_counts` and `finalize_import_claims`. Function signatures are unchanged, so existing access permissions carry over. No table or data changes.
- `docs/oracle/contracts/import-reconciliation-redesign.md` — Status header points to the states doc and the new migration. Adds `competingDemand` and `remaining` to §2.4. The §4.2 instance shape gains the new fields. §5 is rewritten as a state table mapped row by row to the states doc. §7.6 is rewritten. New §7.7 covers automatic allocation at finalize. Adds properties P13 and P14 and test scenario 11. §13 Q3 and Q4 are revised.
- `docs/oracle/contracts/import-reconciliation-redesign.types.ts` — adds `SlotState`, `SLOT_STATES` and `RESOLVED_SLOT_STATES`. `ConflictInstance` gains `slotState`, `alternateAvailable`, `overAllocated` and `competingDemand`. `alreadyClaimed` is redefined, and the `resolved` and row `overAllocated` notes are updated.
- `src/types/import-reconciliation.ts` — the same edits, mirrored.

## How the states doc maps to the data
| States doc | `slotState` | Resolved |
|---|---|---|
| 1 | `planned_unowned` | no |
| 2, 8 | `planned_alt_available` | no |
| 3, 9 | `planned_claimed` | no |
| 4 | `sleeved_auto` (stored as planned; finalize allocates it) | yes |
| 5, 6 | `planned_conflict` (6 = `alternateAvailable: true`) | no |
| 7 | `sleeved_owned` | yes |
| 10 | `planned_alternate_selected` | no |
| 11 | `sleeved_alternate` | yes |
| 12 | `proxy` | yes |
| 13, 14 | events: settle at finalize / recalculate after any write | — |
| — | `sleeved_unsatisfiable` (not in the doc; Sleeve reservation lost supply) | no |

Two rules make this work [Confirmed: new migration §1]:
- **Competing demand** = slots set to Planned + slots set to Sleeved for the same printing. This decides "overallocated" and state 4.
- **Whether Sleeve is enabled** still compares only Sleeve reservations with free copies. That is what lets you choose the winner in a conflict. `set_import_claim_state` is already correct for this and was not changed [Confirmed: 20260926140000 §4].

## New decisions made (need owner confirmation)
- **State 4 is applied at "Allocate Cards".** When a Planned slot's printing fits every deck that wants it, finalize now gives it the real copy. Without this, the screen would say "Sleeved (owned)" and the card would still end up Planned. The check runs once per card, under the existing per-card lock. It only applies when every deck wanting that printing fits the free supply, so it can never take a copy from a deck where you clicked Sleeve.
- **Picking an alternate printing never allocates automatically.** State 10 stays unresolved until you click Sleeve (state 11). This follows the doc's options column.
- **A new `sleeved_unsatisfiable` state.** It covers a case the doc doesn't list: you Sleeved a card, then the copy was taken through normal deck actions outside this screen. It is shown as unresolved.
- **"Alternate" means any owned printing other than the one the slot currently uses.** So after switching, the original printing counts as an alternate if you own it. An alternate counts as "available" only if it has a free copy that no Sleeve decision has reserved.

## Assumptions
- States 2 and 8 share one state name, and so do 3 and 9. The doc's options are identical within each pair; the only difference is how the slot got there. The row's `printingMismatch` flag already tells the screen whether you own the requested printing at all.
- A slot in state 1 counts as overallocated (the doc says "Yes — zero requested copies exist"). So on the Unowned tab every row gets the amber `overAllocated` flag. This only affects sort order there, because every row on that tab gets the same flag.

## Challenges to locked decisions
- None to the decisions register.
- **Conflicts with the states doc's process rule — not fixed here.** `reconcile_built_deck` still gives out free copies one deck at a time during import [Confirmed: `supabase/migrations/20260926130000_exact_printing_import.sql`, the exact-printing `SELECT … LIMIT 1 FOR UPDATE` followed by `UPDATE deck_cards SET copy_id`]. If two built decks are imported one after another and both want your one Felothar, the first deck takes it before reconciliation runs. The second deck shows state 9 instead of both showing state 5. That breaks "Neither deck should receive it automatically". The fix belongs in the import pipeline: hold import-time assignment until the whole batch has been assessed. That needs its own task.

## Open questions
- **Deck badge after "Allocate Cards".** The deck-list badge (§7.6) still counts Planned slots that were left undecided at finalize. That matches your earlier Q4 answer. But states-doc row 13 says these are "no longer an outstanding import decision". Should they stay on the deck badge until you proxy or allocate them, or disappear once the import finishes?
- **Backend's in-place edit.** Backend's O-005 changes to `20260926140000_import_reconciliation_redesign.sql` are in an unmerged worktree. They must be thrown away, not merged. The deployed file must stay identical to what production ran, and this new migration replaces that work.

## Tests that need updating
- `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — the fixture instance (line 39) is missing `slotState`, `alternateAvailable`, `overAllocated` and `competingDemand`. The test still passes at runtime, but the type check now fails with 1 new error (TS2739). Frontend lane.
- `src/components/reconciliation/ConflictCard.tsx` — not a test, but its behaviour changes. `alreadyClaimed` is now false in states 2 and 8, and newly true in state 3, where the requested printing isn't owned at all. The component should switch to `slotState` for its label and buttons. Frontend lane.
- No existing test checks the SQL logic that decides slot states. P1/P7/P8 property tests don't exist, as Backend found. A seeded Postgres integration test for contract §12 scenario 11 should be added, extending `src/lib/__tests__/deck-import-integration.test.ts`. Backend lane.
- `src/types/supabase.ts` does not need regenerating: no RPC signature changed.

## Verification
- Ran the deployed migration, then the new one, against an in-memory Postgres (PGlite 0.2.17 in a temporary directory, since deleted) with a minimal schema. I scripted scenarios for doc states 1, 2, 3, 4 (including finalize assigning the copy), 5, 6, 7, 8, 9, 10, 11, 12, 13 (finalize on an open conflict assigns nothing), and "proxy frees supply → other slot becomes `sleeved_auto`". I checked `slotState`, `resolved`, `canSleeve`, `overAllocated`, `alreadyClaimed`, `alternateAvailable`, the view counts and the `get_deck_conflict_counts` badges. Result: **23/23 PASS**. PGlite is a real Postgres build, but this was not the production schema. The advisory locks and grants were only exercised in a single session.
- `npx vitest run` on the reconciliation, sleeve-claims, reconciliation-routes, finalize and components/reconciliation tests (node_modules borrowed from the t22 worktree, link removed afterwards) — **47 passed (7 files)**.
- `npx tsc --noEmit` — 196 errors versus Backend's 195 baseline in the same environment. The single new error is the `ReconciliationSummary.test.tsx` fixture listed above. There are no errors in the contract types or `src/types/import-reconciliation.ts`.
- Nothing was applied to any hosted database.

## Contract files for hand-on
- `docs/oracle/contracts/import-reconciliation-redesign.md`
- `docs/oracle/contracts/import-reconciliation-redesign.types.ts`
- `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` (DRAFT)
