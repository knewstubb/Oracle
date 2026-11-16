# Report: set-card-category
Role: Developer
Status: BLOCKED
Task as received: Add an edit tool (e.g. set_card_category) to the Oracle connector to change the category of cards already in a deck, by slot, following the existing edit-tool pattern (dry_run, <=10 immediate + undoable 7 days, >10 owner approval, change-log wording, write-gateway, tests). Categories only; never set/clear 'Maybeboard'. Ignore tags. If it needs a database/schema change or new brief, stop and report BLOCKED.

## Summary for the owner
Nothing was built. Letting Claude change a card's category needs a change to how Oracle's database stores and approves Claude's edits, and that is the Architect's job, not the Developer's. Once that is done, the rest is small.

## Changed files
- docs/oracle/reports/2026-11-16-developer-set-card-category.md — this report only

## Why blocked
Every Claude edit goes through one database function (`ai_submit_change`) that only accepts eight fixed action names. The same eight names are hard-coded in database CHECK constraints on the pending-approval table and the change-log table, and in the undo and approve functions. [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql lines 29-30, 79-80, 103; supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql]. A "set category" action is a ninth name, so it needs a new migration. The undo must also store previous categories, the "deck changed since" check must compare categories, and the approve path must apply them. Doing this in app code alone would bypass the transactional/undo guarantees, so I did not attempt it.

## Needed from Architect
A contract addition (claude-connector-slice-b.md and .types.ts) and a migration that:
- adds action/kind `deck_category` to both CHECK constraints and the RPC allow-list;
- validates slots (id + card_name), rejects the 'Maybeboard' marker as new or existing category value, and leaves zone/quantity untouched;
- applies up to 10 slots immediately, over 10 goes to pending (reason over_ten);
- logs previous categories per row for undo, refuses undo if the slot changed since;
- applies on approve.

## Developer work once unblocked (no decisions needed)
- set_card_category input + handler in tools/edit-tools.ts and registration in tools/index.ts
- 'deck_category' in write-types / gateway ChangeAction, sentences in change-sentences.ts and grouping in change-groups.ts
- tests in src/lib/connector/__tests__

## New decisions made (need owner confirmation)
- none

## Assumptions
- The working tree already had uncommitted changes from other work (ownership tool, picklist); I touched nothing.

## Challenges to locked decisions
- none

## Open questions
- Should a category be allowed to be set to any free text (as add-card allows), or only existing deck categories? (Architect to decide with the contract.)

## Verification
- No code changed; tests/typecheck not run.
