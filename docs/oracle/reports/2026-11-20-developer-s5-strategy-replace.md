# Report: s5-strategy-replace
Role: Developer
Status: DONE
Task as received: Write the owner approval note for S5, the database change that lets Claude replace the Strategy text.

## Summary for the owner
S5 lets Claude replace the whole Strategy text of a deck, so it can keep refining one clean Strategy instead of adding paragraphs. It changes no existing data. It is not applied yet. Until you apply it, Claude's rewrite is refused with a plain message that the update has not been applied yet.

## What it changes
- Claude may replace the Strategy text. Today Claude may only add to it.
- Claude's rewrite is still refused if the Strategy changed after Claude last read it, so your edits are not overwritten by an out-of-date rewrite.
- Claude's rewrites are still logged and can still be undone from History. Undo restores the earlier Strategy, and is blocked if the text changed since.
- Size limit stays at 4000 characters.

## What it does not touch
No decks, cards, or saved Strategy text change when it is applied. It only changes the rule for what Claude may do from then on.

## How to undo
A rollback file puts the add-only rule back. Roll S5 back before rolling back S3, because the S3 rollback would overwrite it.

The rollback file:

`supabase/drafts/20261119120000_s5_strategy_replace.rollback.sql`

## Who applies it
You apply it. Nothing has been applied by the agent.

The change itself:

`supabase/drafts/20261119120000_s5_strategy_replace.draft.sql`

## Rehearsal result
On a throwaway database: 34 checks passed, 0 failed. The earlier S3 and S4 rehearsals still pass (38 and 38), and the chain test passes (16).

## Changed files
- supabase/drafts/20261119120000_s5_strategy_replace.draft.sql — the change, not applied
- supabase/drafts/20261119120000_s5_strategy_replace.rollback.sql — the undo
- docs/oracle/reports/evidence/roles-db/test_s5.sh — rehearsal script
- docs/oracle/reports/evidence/roles-db/test_s5.out — rehearsal output

## New decisions made (need owner confirmation)
- Approve S5.

## Assumptions
- S3 and S4 stay applied.

## Challenges to locked decisions
- none

## Open questions
- Do you approve applying S5?

## Verification
- test_s5 — 34 pass, 0 fail
