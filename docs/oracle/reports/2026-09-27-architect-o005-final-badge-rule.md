# Report: o005-final-badge-rule
Role: Architect
Status: DONE
Task as received: Task O-005: Reconcile docs/oracle/contracts/import-reconciliation-redesign.md §§5, 7.6 and 13 Q4 and the DRAFT supabase/migrations/20260927120000_import_reconciliation_slot_states.sql with the owner's final rule recorded in docs/oracle/status.md: after Allocate Cards, the deck conflict badge disappears, while leftover Planned slots remain normal Planned deck slots. Do not alter the deployed migration or deploy anything; preserve the owner-approved slot-state rules and update the contract/types or draft migration only where needed.
Done when: the contract, draft migration, and any mirrored types consistently implement the final badge rule, the report states exactly what changed and why, and validation confirms the draft remains unapplied.

## In plain terms

- Pressing "Allocate Cards" now clears the conflict badge on every deck from that import.
- Cards you left Planned stay in the deck as ordinary Planned cards. Nothing is deleted, and the record of what the import asked for is kept.
- While an import is still open, the badge works exactly as before. Two decks fighting over one copy both show a badge. Unowned cards show a badge too.
- The slot states themselves (the 14-row states table) are unchanged. The only change is that the badge no longer looks at imports you have already finished.
- Nothing was deployed. The already-deployed migration was not touched.

## The rule, precisely

Finalize already marks every card it can't allocate as settled (it stamps `settled_at`) [Confirmed: `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` §2, planned / leftOpen branches]. The badge function, `get_deck_conflict_counts`, now reads only claims that have not been settled. So the badge clears when the import is finished. This matches states-doc row 13, which says the slot "remains Planned in the deck and is no longer an outstanding import decision" [Confirmed: `docs/oracle/import-reconciliation-states.md`].

## Changed files

- `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` (DRAFT, still untracked and unapplied):
  - `get_deck_conflict_counts` now reads only unsettled claims. One added filter, `AND c.settled_at IS NULL`, in its `scope` CTE.
  - The section 3 header comment was rewritten to match.
  - The file header gains fix #5, covering the owner decision and how it differs from the deployed version.
  - Not changed: the function signature, the grants, `get_import_reconciliation`, `finalize_import_claims`, or any table.
- `docs/oracle/contracts/import-reconciliation-redesign.md`:
  - Status header records the revision.
  - §5 notes: the state 13 event now says the slot leaves the deck conflict badge. A new note says slot states are evaluated for unsettled claims only, and the states table is unchanged.
  - §5 badges table: new "Deck list" row.
  - §7.5: `settled_at` is described as what takes a claim off the badge, no longer "the record behind the badge".
  - §7.6: rewritten to add the unsettled-only scope and the owner rule, with updated consequences and scope note. The stale pointer to the open question was removed.
  - §8: P13 is narrowed to unsettled claims, and a new P15 says there is no badge after finalize and the Planned slot still exists.
  - §12 scenario 11 item 13 now asserts that the badge clears.
  - §13 Q4 flips to **No**. It records that the earlier "Closed: yes" answer was closed before the row-13 tension reached the owner, and that it is now withdrawn.
- `docs/oracle/contracts/import-reconciliation-redesign.types.ts` and mirrored `src/types/import-reconciliation.ts`: comment-only change to the `SlotState` doc block. State 13 now reads "off this screen and off the deck conflict badge, but still a normal Planned deck slot". No wire shapes changed, and the two files still differ only in their pre-existing header comment and `ReconciliationTab`. The badge payload has no type in these files, and its shape is unchanged.
- `docs/oracle/reports/2026-09-27-architect-o005-final-badge-rule.md`: this report.

## New decisions made (need owner confirmation)

- If an import finalize could not fill a slot because another deck took the copy outside the screen (`sleeved_unsatisfiable`), that slot also leaves the badge. The same `settled_at` rule covers it. This follows directly from "the badge disappears after Allocate Cards", but I'm flagging it because it applies to a Sleeve decision, not only to Planned ones.

## Assumptions

- "Deck conflict badge" means the deck-tile badge fed by `get_deck_conflict_counts` [Confirmed: `src/app/api/decks/route.ts:102`, `src/components/DeckTile.tsx:283`]. It does not mean the reconciliation screen's tab badges. The Orchestrator's final-decision report makes the same assumption.
- I edited the files in this worktree (`evil-tiger`). The owner's rule is recorded in the main checkout's uncommitted `docs/oracle/status.md` (lines 57–58), not in this worktree's copy. Before my edits, the main checkout's copies of the contract, types and draft migration were byte-identical to this worktree's (checked with `cmp`). The Orchestrator needs to carry these edits across.

## Challenges to locked decisions

- None. No entry in `docs/oracle/decisions.md` is affected. §13 Q4 was a contract-level answer, not a locked decision. It is reversed here on the owner's explicit instruction.

## Open questions

- Backend follow-up (not my lane): the comment at `src/app/api/decks/route.ts:99-100` still says "claims the user chose to leave unresolved on Go to Decks". That describes the old behaviour. No code change is needed, because the route passes the RPC result straight through.
- UX follow-up (not my lane): the deck-tile tooltip "needs a copy you don't have" [Confirmed: `src/components/DeckTile.tsx:287`] now only appears for an import that is still open. The wording may be worth revisiting.

## Verification

- PGlite 0.2.17 in a temporary directory (`/tmp/o005-badge`, deleted afterwards), minimal schema, running the full draft migration. Scenario: one copy of Felothar wanted by Decks A and B, an unowned card in Deck C, and a one-copy-one-slot card in Deck C (state 4). Then a second import that is not yet finished.
  - Before finalize, slot states are `planned_conflict`, `planned_conflict`, `planned_unowned`, `sleeved_auto`. This is the approved states table, unchanged. PASS
  - Before finalize, the badge shows A=1, B=1, C=1, and the state-4 card is not counted. PASS
  - P13: before finalize, the badge per deck equals the view's unresolved-printing count per deck (view read without `batchId`). PASS
  - Finalize: 1 copy auto-allocated and 3 claims settled. PASS
  - After finalize, the badge is empty. PASS
  - After finalize, slots 1–3 still exist with `copy_id NULL` (still Planned), and slot 4 holds its copy. PASS
  - After finalize, the 3 leftover claims are kept as `planned` and settled. PASS
  - A second, unfinished import still shows its badge (Deck B = 1, only the new card), and the finished import contributes nothing. PASS. After its finalize, the badge is empty. PASS
- Negative control: I ran the same script against a copy of the draft with the new `settled_at` filter removed, which is the old behaviour. Exactly the three post-finalize checks FAIL, so the test genuinely detects the rule.
- Draft remains unapplied:
  - `git status --short`: `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` is `??` (untracked), and `git ls-files --error-unmatch` confirms it is not tracked.
  - `git diff --stat -- supabase/migrations/20260926140000_import_reconciliation_redesign.sql` is empty, so the deployed migration is unchanged.
  - The DRAFT header on line 1 is intact.
  - I ran no `supabase` CLI, `db push` or remote SQL command this session.
  - Not verified: I did not query the remote database's migration history. The project is not linked in this worktree (there is no `supabase/.temp`), and a remote query was outside the task.
- `npx tsc --noEmit` was not run. The types change is comment-only, and this worktree has no `node_modules`.
