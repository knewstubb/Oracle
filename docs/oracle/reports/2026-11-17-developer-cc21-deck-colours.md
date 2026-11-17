# Report: cc21-deck-colours
Role: Developer
Status: DONE
Task as received: Task CC-21: in the Claude connector (src/lib/connector/tools/), make list_decks and get_deck return each deck's commander colours (from decks.colour_identity, one format everywhere, for example "R" or "WU"), and make add_cards_to_deck still add every card but return a warning naming each added card whose colour identity is outside the deck's colours (reuse the card facts lookup in card-facts.ts; owner decided: warn and still add, never refuse); no database change, and if one seems needed stop and report BLOCKED. Also update the tool descriptions in tools/index.ts and the connector contract only where they describe these fields.

## Summary for the owner
Claude is now told each deck's colours (for example "R" or "WU") when it lists or opens a deck. When Claude adds a card outside the deck's colours, the card is still added and Claude gets a warning naming it. If a deck has no colours set, cards are added and the result says colours were not checked.

## Changed files
- src/lib/connector/tools/deck-colours.ts — new: one colour format (WUBRG order) and the "outside the deck's colours" check
- src/lib/connector/tools/list-decks.ts — reads decks.colour_identity; summary now has colourIdentity (used by list_decks and get_deck)
- src/lib/connector/tools/edit-tools.ts — add_cards_to_deck checks colours via fetchCardFacts; warnings never block; `colour_check` note when deck has no colours or the check could not run
- src/lib/connector/tools/index.ts — list_decks, get_deck, add_cards_to_deck descriptions
- docs/oracle/contracts/claude-connector-slice-a.types.ts, claude-connector-slice-a.md, claude-connector-slice-b.md — the new field and warning, only where they describe these tools
- src/lib/connector/__tests__/edit-tools.test.ts — new CC-21 tests

## New decisions made (need owner confirmation)
- A deck whose stored colours are empty is treated the same as "not set" (no warning, "no colours set" note). A true colourless commander therefore gets no colour check.
- A card whose facts cannot be found is not warned about (colours unknown).

## Assumptions
- Stored deck colours may be "WU" or "W,U"; both come out as "WU". Card library colours are letters ("UR").
- No database change was needed.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx vitest run src/lib/connector — 257 passed, 1 failed (registry-and-isolation "estimate" wording on get_deck; fails identically before my change)
- npm test — 3454 passed, 1 failed (same pre-existing failure)
- npm run typecheck — 4 errors, all in src/components/AddToPicklist.test.tsx (not touched)
- npm run lint — 4 errors, none from new code (tools.test.ts any x2, list-decks.ts prefer-const on an untouched line, PicklistV2.tsx)
- Note: the worktree had no node_modules; a local symlink to the main repo's was used (not committed).
