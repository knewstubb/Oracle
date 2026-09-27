# Report: O-005 — implement approved import-reconciliation contract
Role: Backend
Status: BLOCKED

Task as received: "Task O-005: Implement the approved import-reconciliation contract in docs/oracle/contracts/import-reconciliation-redesign.md and its .types.ts, using the staged forward migration supabase/migrations/20260927120000_import_reconciliation_slot_states.sql and mirrored src/types/import-reconciliation.ts; preserve the deployed migration and do not author or edit schema migrations. Update server/data-access behavior and tests as required, and identify any Frontend-only work needed to remove the post-finalize deck conflict badge. Done when: the approved contract is implemented without changing the draft migration, the superseded grumpy-snake edit is not used, required targeted tests and typecheck are run, and a Backend report records changed files, verification, and any blocked follow-up."

**Status changed DONE → BLOCKED on owner instruction (2026-09-27, same day):** the owner
identified that `docs/oracle/status.md`'s O-005 entry and the states doc's own wording
require the deck conflict badge to be **removed** after "Allocate Cards", while the
staged contract (§13 Q4, §5, §7.6) and the draft migration's `get_deck_conflict_counts`
still keep it showing. That is a direct contradiction between two owner-sourced
artifacts, not a Backend implementation gap. Per the owner's instruction I have not
edited the migration or any application code, and I am not choosing between the two
rules. See "The badge contradiction — blocking" below for the precise conflict and the
exact follow-up needed before this task can proceed.

## In plain terms

- The database side of this (the draft migration) was already written by the Architect and I left it untouched, as instructed.
- The server code that reads and writes reconciliation data (`src/lib/import-reconciliation.ts`, the four `/api/onboarding/reconciliation*` routes, `finalize`) was already built generically in an earlier task (T-24). It reads whatever fields the database sends back and hands them straight to the screen. That means it already carries the new fields (`slotState`, `alternateAvailable`, `overAllocated`, `competingDemand`) through with no code change required — once the draft migration is approved and applied, the new behaviour shows up automatically.
- I found and avoided the `grumpy-snake` worktree/branch, which contains the earlier, superseded edit that directly changed the already-deployed migration file. That edit was correctly never merged into this branch.
- One small, genuinely Frontend problem remains: a Frontend component test has a hand-built fixture that is missing the four new fields, so the whole-repo type check fails on that one file. That is Frontend's file to fix, not mine.
- Your question about the "post-finalize deck conflict badge" is why this report is now BLOCKED, not DONE — see the dedicated section below. It is not a Backend bug; it is a live contradiction between `docs/oracle/status.md`'s rule ("remove the badge after Allocate Cards") and the staged contract's closed decision ("keep the badge"). I have not picked a side.

## Changed files

None. This task required no Backend code changes. Reasoning below.

## Investigation and why no code changed

1. **`grumpy-snake` identified and excluded.** `git branch -a` shows `grumpy-snake` as a sibling worktree branch (`/Users/bradknewstubb/.paseo/worktrees/03dz1jp4/grumpy-snake`). Diffing it against this branch's history [Confirmed: `git diff HEAD~1 -- supabase/migrations/20260926140000_import_reconciliation_redesign.sql` inside that worktree] shows it contains exactly the in-place edit to the **deployed** migration described in `docs/oracle/reports/2026-09-27-backend-o005-planned-slot-predicate.md` — the one the Architect's report explicitly says "must be thrown away, not merged" (`docs/oracle/reports/2026-09-27-architect-o005-slot-states.md`, Open questions). I did not check out, merge, or read from that worktree for any code decision; I only inspected its diff to confirm what it was, per the task's warning.

2. **The deployed migration is untouched.** `supabase/migrations/20260926140000_import_reconciliation_redesign.sql` shows no modifications in `git status` on this branch. The draft migration `supabase/migrations/20260927120000_import_reconciliation_slot_states.sql` is untracked (new file from the Architect) and I made no edits to it — confirmed by `git status --porcelain` before and after my session showing identical output.

3. **Server library already matches the contract.** [Confirmed: `src/lib/import-reconciliation.ts`] `getImportReconciliation()` calls `get_import_reconciliation` and returns `payload.rows`/`payload.decks`/`payload.counts` verbatim as `ReconciliationView`. It does not destructure or re-shape individual instance fields, so the new `slotState`, `alternateAvailable`, `overAllocated`, `competingDemand` fields the draft migration adds to each instance's JSON pass straight through once the migration is applied. Same for `setClaimState`, `setClaimPrinting`, `setClaimWishlist` — thin RPC wrappers, unchanged signatures needed.

4. **Routes already match the contract.** [Confirmed: `src/app/api/onboarding/reconciliation/route.ts`, `.../instance/route.ts`, `.../instance/printing/route.ts`, `.../instance/wishlist/route.ts`, `src/app/api/onboarding/finalize/route.ts`] All four reconciliation routes and finalize were built in T-24 against the `ReconciliationView`/`ConflictPrintingRow`/`ConflictInstance`/`FinalizeResponse` contract types, which the Architect's O-005 pass already extended with the new fields in both `docs/oracle/contracts/import-reconciliation-redesign.types.ts` and the mirrored `src/types/import-reconciliation.ts`. No route logic branches on the fields that changed, so no route needed editing.

5. **`import-sleeve-claims.ts` already correct.** [Confirmed: lines 66-79] `createSleeveClaimsForDeck` writes `resolution: 'planned' as const` (contract §3.2, checklist Phase 2 item 4). [Confirmed: lines 109-149] `FinalizeResult` has `settledCount`, sourced from `payload?.settled_count`. `finalize/route.test.ts` already asserts `settledCount` passes through. Nothing here depends on the slot-state predicate change — that logic lives entirely inside the SQL functions.

6. **Everything else in the contract (§4-§10) was implemented under T-24, not this task.** The routes, error-token mapping, legacy state acceptance, and `import-reconciliation.ts` presentation helpers (`isRowUnresolved`, `partitionRowsByOwnership`, `normalizeInstanceState`) all pre-date this session and are exercised by the passing test suite below.

## What Frontend needs to do (not done here — outside my role)

`src/components/reconciliation/ConflictCard.tsx` and its test `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` are Frontend-owned and were flagged as needing changes by the Architect's report; I confirmed both are still outstanding:

- **Type error (blocks `npx tsc --noEmit` for the whole repo):** `ReconciliationSummary.test.tsx:39` builds a `ConflictInstance` fixture missing `slotState`, `alternateAvailable`, `overAllocated`, `competingDemand` — `error TS2739` [Confirmed by `npx tsc --noEmit` output, isolated to this one file plus pre-existing unrelated errors]. This is a fixture literal in a Frontend test file; fixing it means adding four fields to a mock object, but I am not the owner of Frontend component tests and did not touch it.
- **Behavioural gap (not a type error, so `tsc` won't catch it):** `ConflictCard.tsx` still branches only on `instance.alreadyClaimed` (lines 41-45, 111, 182) to render the "Already claimed" chip/label, and never reads `slotState`. Under the new predicate `alreadyClaimed` is `true` only for `planned_claimed` (states 3, 9); it used to also cover what is now the separate `planned_alt_available` state (2, 8). Once the draft migration is applied, a row where the requested printing is gone but an alternate printing is free will report `alreadyClaimed: false`, and `ConflictCard.tsx` will render no explanatory chip at all for that state instead of a "switch printing" affordance. The component needs to switch its label/action logic to `slotState`, per the Architect's report recommendation.

Both are Frontend-lane per `AGENTS.md` rule 1 and `.paseo/agents/backend.md` "You do not own: UI components."

## The badge contradiction — blocking

This is the reason status is BLOCKED, not DONE. There are two owner-sourced rules in
force at once, and they disagree:

**Rule A — `docs/oracle/status.md`, O-005 entry / owner instruction (2026-09-27):**
the deck conflict badge must be **removed** after "Allocate Cards". This reading
matches the states doc's own row 13 wording [Confirmed:
`docs/oracle/import-reconciliation-states.md:70`]: *"13. Planned (in the system): The
import is finished without allocating a physical copy. The slot remains Planned in the
deck and is **no longer an outstanding import decision**."* "No longer an outstanding
import decision" reads as "stop flagging it," i.e. no badge.

**Rule B — the staged contract, still standing:**

- §13 Q4 (status: **Closed**, revised O-005) [Confirmed:
  `docs/oracle/contracts/import-reconciliation-redesign.md:929`]: *"Yes, while
  unresolved per §5... A settled `planned_*` slot keeps its badge until it is proxied
  or allocated."*
- §5 / §7.6 describe `get_deck_conflict_counts` as using the identical `slotState`
  predicate as the main reconciliation screen, with every `planned_*` state except
  state 4 (`sleeved_auto`) counted as unresolved and therefore badge-worthy.
- The **draft** migration (`supabase/migrations/20260927120000_import_reconciliation_slot_states.sql`,
  §3, `get_deck_conflict_counts`) implements exactly that: it counts a deck's badge
  from every claim whose slot is still `copy_id IS NULL`, **whether `settled_at` is
  set or not** — i.e. settled `planned_*` claims left over after finalize still
  contribute to the badge.

These cannot both be true for the same card at the same time: Rule A says a settled
`planned_*` slot (e.g. `planned_unowned`, `planned_claimed`, `planned_conflict`,
`planned_alt_available`) shows no badge after finalize; Rule B's contract text and
draft-migration logic say it does, explicitly and by design (that design choice is
recorded as a **closed** decision, not an oversight).

Notably, the Architect's own O-005 report already surfaced this same tension as an
**open question** rather than resolving it [Confirmed:
`docs/oracle/reports/2026-09-27-architect-o005-slot-states.md:55`]: *"Tension with
states-doc row 13 ('no longer an outstanding import decision') is raised as an open
question... Should they stay on the deck badge until you proxy or allocate them, or
disappear once the import finishes?"* That question was never answered before §13 Q4
was marked Closed and the draft migration was written to the "stays" behaviour.

**What I did not do, per your instruction:** I have not edited
`20260927120000_import_reconciliation_slot_states.sql`, not reverted or reinterpreted
§13 Q4, and not written any application code that picks a side (e.g. filtering the
badge count client-side to work around the RPC). Either choice is a real design
decision with downstream effects (see below), and the task explicitly said not to
choose.

### Exact follow-up required before O-005 can resume

This needs the **Architect**, not Backend, because it is a contract change, and it
needs the **owner** to resolve the contradiction, not infer it:

1. Owner confirms which rule is authoritative: badge disappears after finalize
   (Rule A / row 13), or badge persists while any settled `planned_*` claim exists for
   that deck (Rule B / closed §13 Q4). A partial rule ("disappears for `planned_unowned`
   but not `planned_conflict`", for example) is also possible but must be stated
   explicitly — the states doc does not distinguish row 13 by sub-state.
2. Architect updates `docs/oracle/contracts/import-reconciliation-redesign.md` §13 Q4
   (currently marked Closed) and §7.6 to match, and states plainly whether this
   reopens a "closed" decision or the closure was premature.
3. Architect updates `get_deck_conflict_counts` in the **draft** migration (it is
   still unapplied, so this is an edit to a pending file, not a new forward migration)
   to match the resolved rule — most likely, scoping the badge query to
   `settled_at IS NULL` in addition to `copy_id IS NULL`, if Rule A wins; or leaving it
   as-is with an explicit contract note if Rule B wins.
4. Once the contract and draft migration agree with each other and with the owner's
   answer, hand back to Backend to re-verify (no server code changes are expected
   either way, per the "Changed files" section below — the routes and library already
   pass whatever the RPC returns straight through) and to update this report's status.

I am not able to resolve step 1; it requires the owner's decision, and I was
explicitly told not to make it for them.

## New decisions made (need owner confirmation)

None. No code was written, so no new implementation decisions were made.

## Assumptions

- "The approved contract" refers to the version of `docs/oracle/contracts/import-reconciliation-redesign.md` and its `.types.ts` as already updated by the Architect for O-005 (status: APPROVED, per the doc header), not a version I was asked to further edit.
- "Implement... using the staged forward migration" means: build server code that is correct against the RPC shapes the draft migration defines, without applying or editing that migration myself (task explicitly forbids authoring/editing schema migrations). Since the existing T-24 server code was already written generically against the contract types (not against literal SQL), it required no changes to satisfy this.

## Challenges to locked decisions

None. No locked decision in `docs/oracle/decisions.md` is affected.

## Open questions

- **Blocking:** which rule governs the deck conflict badge after "Allocate Cards" —
  status.md/row-13 ("remove it") or the staged contract's closed §13 Q4 ("keep it
  while any settled `planned_*` slot remains")? See "The badge contradiction —
  blocking" above. This must be resolved by the owner and reflected in the contract
  by the Architect before O-005 can be marked DONE.
- Separately, and only once the above is resolved: when is the draft migration
  (`20260927120000_import_reconciliation_slot_states.sql`) approved and applied? Until
  it is, the reconciliation screen in production still runs the older predicate (from
  `20260926140000`), not the states-doc-aligned one described in the contract.

## Verification

- `npx vitest run src/lib/__tests__/import-reconciliation.test.ts src/lib/__tests__/import-reconciliation-rpc.test.ts src/lib/__tests__/import-sleeve-claims.test.ts src/app/api/onboarding/reconciliation/reconciliation.routes.test.ts src/app/api/onboarding/finalize/route.test.ts src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx` — **6 files, 42 tests, all passed.** (Ran with `node_modules` temporarily symlinked from the `t22-import-reconciliation-redesign` worktree, since this worktree has no installed dependencies; the symlink was removed after the run — confirmed by `git status --porcelain` showing no `node_modules` and no other stray changes.)
- `npx tsc --noEmit` — **196 pre-existing errors, none in any reconciliation server file** (`src/lib/import-reconciliation.ts`, `src/lib/import-sleeve-claims.ts`, any `src/app/api/onboarding/reconciliation*` route, `src/app/api/onboarding/finalize/route.ts`). The one reconciliation-adjacent error is `src/components/reconciliation/__tests__/ReconciliationSummary.test.tsx(39,9)` (TS2739, missing new `ConflictInstance` fields) — a Frontend test fixture, described above, not touched. All other errors are unrelated pre-existing issues (mana-analysis, provider-factory, moxfield-client, brew.ts, Supabase edge functions, etc.), matching the baseline both the Backend and Architect O-005 reports already recorded in this environment.
- `git status --porcelain` before and after this session: identical except for this new report file — confirms no migration, library, or route file was modified, and `grumpy-snake` was not used.
