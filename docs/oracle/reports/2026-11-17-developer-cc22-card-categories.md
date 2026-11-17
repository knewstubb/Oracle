# Report: cc22-card-categories
Role: Developer
Status: DONE
Task as received: CC-22: in the Claude connector, change the add_cards_to_deck tool text (src/lib/connector/tools/index.ts and the category field in edit-tools.ts) so Claude gives every card a role category (for example Ramp, Card Draw, Removal, Board Wipes, Lands) and reuses the category names the deck already shows in get_deck, instead of leaving cards under the default "Other"; keep the default "Other" for cards where Claude passes nothing, and change no stored data. Small wording fix only: do not redesign card labels (that is RQ-12).

## Summary for the owner
When Claude adds cards to a deck, it is now told to give each card a role such as Ramp, Card Draw, Removal, Board Wipes or Lands, and to reuse the category names the deck already shows. Cards sent with no category still go under "Other". Nothing stored was changed.

## Changed files
- src/lib/connector/tools/index.ts — new instruction in add_cards_to_deck description
- src/lib/connector/tools/edit-tools.ts — category field description reworded (default "Other" behaviour unchanged)
- src/lib/connector/__tests__/edit-tools.test.ts — description test checks new instruction; new test that per-card categories are stored as given and "Other" when none

## New decisions made (need owner confirmation)
- none

## Assumptions
- node_modules in the worktree is a symlink to the main checkout's (untracked, ignored).

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npm run check — 2 test failures, both also fail on main without my change (ImportIntentFlow "keeps Import disabled"; registry-and-isolation get_deck "estimate" wording); typecheck errors in AddToPicklist.test.tsx and lint errors are pre-existing. No new failures. The new tests pass.
