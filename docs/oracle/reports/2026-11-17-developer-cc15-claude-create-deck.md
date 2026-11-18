# Report: cc15-claude-create-deck
Role: Developer
Status: DONE
Task as received: CC-15, let Claude create a new deck and set it up in Oracle (plan: `.agents/tasks/cc-15/plan.md`, features FEAT-001 to FEAT-003).

## Summary for the owner
Claude can now create a deck (name, format, commander) and set its commander, bracket and strategy notes. All of it is built and tested on a throwaway database, but nothing is live yet. Three database changes need your approval, in a fixed order, before Claude can use it. Claude has no way to delete a deck. Only you can Undo a creation, and only while the deck is empty.

## Changed files
Branch `cc-15-claude-create-deck` (3 commits on d14e9b0):
- `supabase/drafts/20261117200000_cc15a_new_change_kinds.{draft,rollback}.sql` (DB-A foundation) and `20261117200100_cc15b_deck_create_setup.{draft,rollback}.sql` (DB-B create/setup). Not applied.
- `docs/oracle/reports/evidence/cc15-db/` scripts and outputs of the throwaway runs.
- `src/lib/connector/` : `edit-config.ts`, `write-types.ts`, `write-gateway.ts`, `change-sentences.ts`, `tools/edit-tools.ts`, `tools/index.ts`, `tools/bracket.ts`, and tests (`edit-tools`, `bracket`, `registry-and-isolation`).
- `docs/oracle/contracts/claude-connector-cc15-deck-create.{md,types.ts}`: contract for the two tools.
- `docs/oracle/test-plan-2026-11-17.md` (main checkout, untracked): section G2 and the status line rewritten to match.

## What was built
- Two separate database changes, each with its own rollback and its own throwaway test (DB-A 33/33 checks, DB-B 90/90, plus a run proving DB-B refuses without migration 20261117120000).
- Tools `create_deck` and `set_deck_setup`. The user is taken only from the signed-in connection; any `user_id` in the input is rejected.
- Undo of a Claude-created deck is owner only. It is refused with a plain reason once a card, a copy, a Picklist step or a folder is on the deck.
- Recent changes screen needed no change.
- Isolation: new unit tests call both tools as owner A against owner B's deck id and expect "deck not found" with no write. The throwaway two-user SQL check (FEAT-001) found B could not use or read A's deck, Undo or log rows.

## Live steps (all need owner approval, applied one at a time, in this order)
1. `supabase/migrations/20261117120000_ai_change_log_allow_deck_delete.sql` (commit d14e9b0, NOT applied live yet). Also fixes the owner's manual delete error.
2. DB-A foundation.
3. DB-B create/setup. Must come after steps 1 and 2.
4. Save the matching code to main in the same window as step 3.
Rollback order is the reverse: DB-B, then DB-A.
Optional, read-only: allow a look at the column list of the `decks` and `deck_strategy` tables (no data read) to confirm two assumptions below.

## New decisions made (need owner confirmation)
- DB-A also adds the two Storage-box change kinds (`box_create`, `box_move`) that belong to CC-16. They do nothing until CC-16 (no row of those kinds can exist; their Undo helpers do not exist yet). Reason: avoids a third swap of the same log rule later.
- Claude-made decks and hand-made decks are identical (commander row has no categories).
- Undo of creation is owner only and only while the deck is empty (owner-approved earlier).
- A commander swap by Claude adds the new commander as a Planned slot and keeps partner/background/companion.

## Assumptions
- `deck_strategy` has a unique key on `deck_id`, and `decks.status` defaults to active. Both are stand-ins on the throwaway database, not checked live [Approximate].
- Two-user check was done in SQL, not through the running app.

## Challenges to locked decisions
- D-034a "never delete a deck" vs the owner-approved narrow delete (Undo of an empty Claude-created deck, owner only). Suggested change: Gene records an amendment (wording in the Architect report, section 2). Not edited by me.

## Open questions
- Does the owner approve the four live steps above, and the optional read-only column check?
- The "set up" line in Recent changes is generic ("commander, bracket or strategy notes") because the list does not expose which fields changed.

## Verification
- `npm run check` in the worktree: tests 3488 passed, 2 failed (known: ImportIntentFlow "keeps Import disabled" and get_deck "estimate" wording; both fail on the base too, TIDY-01 and the earlier reports' known items). Typecheck: 4 errors (known TIDY-02). Lint: 4 errors (known, including PicklistV2.tsx:672), 281 warnings. No new failures.
- `npx vitest run src/lib/connector`: 288 pass, 1 known fail (before the isolation tests were added); `registry-and-isolation.test.ts`: 13 pass, 1 known fail.
- Throwaway Postgres 17 runs: see `docs/oracle/reports/evidence/cc15-db/`.
- Hosted database never connected to.
