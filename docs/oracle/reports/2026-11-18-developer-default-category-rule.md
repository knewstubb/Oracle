# Report: default-category-rule
Role: Developer
Status: DONE
Task as received: make a new card's starting category follow one clear rule (owner rule decided 2026-11-18: land first, front face for double-faced cards, otherwise the "Group: Type" order; owner-set categories stay as set; no database or stored-category changes; do not touch card window, roles code, Picklist or the roles drafts).

## Summary for the owner
When a card is added to a deck with no category, it now starts in the category of its type. Land comes first, double-faced cards use the front face, and everything else follows the same order as "Group: Type". For example: Mox Amber's cousin "Dockside Chef" style cards aside, an Artifact Land such as Darksteel Citadel starts in Land, and Malakir Rebirth // Malakir Mire starts in Instant. Categories you already set are untouched. Nothing needs your decision.

One change you may notice: cards no longer start in a guessed role such as "Ramp" (Sol Ring now starts in Artifact). Claude adding a card without naming a category now also uses the type instead of "Other".

## What each path did before, and does now
- Add one card (deck page add): before, used the shared card library's stored guess (e.g. Ramp) first, type second. Now type only. [Confirmed: src/app/api/decks/[id]/cards/route.ts]
- Add several cards (AI deck changes): before, stored guess only, no category when none existed. Now type only. [Confirmed: src/app/api/decks/[id]/cards/batch/route.ts]
- Confirming a chat proposal: before, stored guess first, then type. Now type only. [Confirmed: src/lib/chat-proposal-confirm.ts]
- Deck import (Archidekt, Moxfield, ManaBox): already used the shared type rule; unchanged. [Confirmed: src/lib/deck-import.ts, deck-normalizer.ts, manabox-deck-import.ts]
- Claude connector add_cards_to_deck: before, a card sent without a category was filed under "Other". Now it uses the type (falls back to "Other" only if the card's type cannot be looked up). A category Claude names is stored as given. [Confirmed: src/lib/connector/tools/edit-tools.ts]
- The shared rule itself (Land first, front face, Group: Type order) was already in src/lib/type-line.ts (defaultCategoryForTypeLine); no second copy was added.

## Overlap with card roles brief (slice 8)
Section 9 slice 8 lists removal of "the old default-category guess". This job stops using that stored guess in the three add paths above, so it overlaps in behaviour. The stored data (ref_cards.default_category) and the card window's use of it are untouched, so slice 8 still has its removal to do. Slice 8 only needs to delete the stored column, not any more add-path code.

## Changed files
- src/app/api/decks/[id]/cards/route.ts — type rule only, no stored guess
- src/app/api/decks/[id]/cards/batch/route.ts — type rule (printing type line as fallback)
- src/lib/chat-proposal-confirm.ts — type rule only
- src/lib/connector/tools/edit-tools.ts — category-less cards use the type rule
- src/lib/default-category-rule.test.ts — new tests with real type lines
- src/lib/connector/__tests__/edit-tools.test.ts, src/lib/chat-proposal-confirm.test.ts — expectations updated (Sorcery, Land, Artifact instead of Ramp, Other)

## New decisions made (need owner confirmation)
- Claude-added cards with no named category now start by type instead of "Other".

## Assumptions
- "Anything already set stays" covers existing rows (never rewritten) and a category named explicitly in the request.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- npx vitest run (full) — only the known ImportIntentFlow failure after updating two expectations; new tests pass
- npx tsc --noEmit — only the known AddToPicklist errors
- npx eslint on touched files — 0 problems
