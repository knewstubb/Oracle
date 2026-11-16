# Report: set-card-category-built
Role: Developer
Status: DONE
Task as received: Build the connector tool set_card_category per docs/oracle/contracts/claude-connector-deck-category.md (+ .types.ts); tool only trims and length-checks (1-5 names, 1-60 chars), never changes capitals or matches (database does, section 3a); surface plan 'matched' as a warning; follow the edit-tool pattern; make add_cards_to_deck refuse 'Maybeboard' in any case; focused tests; do not touch the database; typecheck/tests; report.

## Summary for the owner
Claude can now change the categories of cards already in a deck, one list per card, up to 10 at once (more waits for your yes, undo for 7 days). If Claude writes "ramp" and the deck already uses "Ramp", Claude is told it was saved as "Ramp". Claude can also no longer add a card straight into "Maybeboard" through the add-cards tool.

## Changed files
- src/lib/connector/tools/edit-tools.ts — new setCategoryInput + setCardCategory (trim/length only; matched -> warnings; changes/skipped shown on dry run and pending); Maybeboard refused (any case, after trim) in add_cards_to_deck
- src/lib/connector/tools/index.ts — registers set_card_category (not destructive)
- src/lib/connector/edit-config.ts — adds the tool to the fixed allow-list
- docs/oracle/contracts/claude-connector-slice-b.types.ts — ChangeAction 'deck_category', tool name, optional from/to on preview cards, categories_from/to on log rows (as the contract section 11 asks)
- src/lib/connector/change-sentences.ts — sentences, pending title, error text for category_reserved / slot_in_maybeboard / nothing_to_change, stale text for approve
- src/components/connector/PendingCard.tsx — pending list shows "from -> to" for category requests (one small line)
- src/lib/connector/__tests__/edit-tools.test.ts — focused tests (payload mapping, limits, warnings, errors, sentences, Maybeboard refusal)

change-groups.ts needed no edit (it groups by group_id and calls describeGroup). write-gateway.ts needed none (sends action through unchanged).

## New decisions made (need owner confirmation)
- Warning wording: "Stored 'ramp' as 'Ramp' on Sol Ring, which this deck already uses."

## Assumptions
- The live ai_submit_change returns the plan under `plan` for dry run, pending and applied results (confirmed in the migration source); the SubmitOutcome type does not declare it, so it is read loosely. Not verified against live (not allowed).
- Pending-card UI line was added as the smallest change; Designer has not specced it.

## Challenges to locked decisions
- none

## Open questions
- Collapsed summary for several cards says only the count; the from -> to list appears on the pending card, not in the recent-changes group line (per contract section 7).

## Verification
- npx vitest run src/lib/connector src/components/connector — 21 files passed, 240 tests passed, 4 skipped (pre-existing)
- npm run typecheck — 5 errors, all in files I did not touch (AddToPicklist.test.tsx, import-deck-result.test.ts)
- No live call made; database not touched. Not run: live tests (Tester's plan).
