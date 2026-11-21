# Report: mana-by-turn audit
Role: Architect
Status: DONE
Task as received: Audit what exists to build a "mana available by turn" chart in the deck rail.

## Summary for the owner
Everything needed already exists except the card rules text on the deck page, which is added to the existing card lookup. No database change is needed. The chart will count ramp and draw the same way the Deck health section does, so the two agree.

## Changed files
- none (audit only)

## New decisions made (need owner confirmation)
- Ramp and draw are identified with the same card-reading classifier as Deck health. [Confirmed: src/lib/card-roles.ts]
- Mana made is read from card text; unreadable or variable amounts have no effect.
- One-shot mana (Treasure makers, rituals) counts only on the turn it is cast.

## Assumptions
- The rail receives the main deck only. [Confirmed: src/components/deck-rail/DeckRail.tsx]

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- Read the rail, deck API and card-roles code. The card library has oracle text but no produced-mana column [Confirmed: src/app/api/decks/[id]/route.ts].
