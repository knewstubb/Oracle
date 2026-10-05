# Report: Show competing deck names in reconciliation
Role: Frontend
Status: DONE
Task as received: In deck view this is confusing because there are two menu options but I dont know what they are for. It should have the name of the other deck that wants the card too

## Summary for the owner
Each set of card choices in the Decks tab now shows the deck that wants that card, including other decks competing for the same printing. This makes it clear which deck each choice applies to.

## Changed files
- `src/components/reconciliation/ConflictCard.tsx` — keep the deck name visible beside every card-instance choice.
- `src/components/reconciliation/DeckList.tsx` — stop hiding deck names in the Decks tab.
- `src/components/reconciliation/__tests__/DeckList.test.tsx` — verify the other deck name and its choices are visible.
- `docs/oracle/specs/import-reconciliation-redesign.md` — update the Decks-tab behavior to match the requested labels.
- `docs/oracle/reports/2026-10-05-frontend-show-competing-deck-names.md` — record the task and verification.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- The repeated choice groups represent separate deck-card instances, and showing each instance's deck name beside its controls resolves the ambiguity.

## Challenges to locked decisions
- none

## Open questions
- None.

## Verification
- `pnpm exec vitest run src/components/reconciliation/__tests__/DeckList.test.tsx src/components/reconciliation/__tests__/ConflictCard.test.tsx` — 5 passed.
- `pnpm exec eslint src/components/reconciliation/ConflictCard.tsx src/components/reconciliation/DeckList.tsx src/components/reconciliation/__tests__/DeckList.test.tsx` — passed with one existing `<img>` warning.
- `git diff --check` — passed.
