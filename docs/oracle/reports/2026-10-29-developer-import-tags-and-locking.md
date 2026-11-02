# Report: import-tags-and-locking
Role: Developer
Status: DONE

Task as received: Owner redefined the import row tags (Unowned, Original/Proxy, Alt printing available / in use, Overallocated); an unanswered question locks Original/Proxy/language/finish/condition; alt printing in use asks both questions; Unowned + Add becomes Original.

## Summary for the owner
Each card now shows one tag that says what the import found. If a card has an open question (use an alternate printing, or pull a copy from another deck) it is locked until you answer. Nothing is pre-picked any more, even when only one deck holds the card.

## Changed files
- src/lib/import-intent.ts — questions stay open until answered; new tags; `unresolved` flag on each copy
- src/components/manabox-import/IntentDecisionRows.tsx — "Use my / Add this printing" buttons back
- src/components/manabox-import/ImportRowEditor.tsx — locks controls while a question is open
- docs/oracle/contracts/import-intent.types.ts — `printingInUse` on the copy plan
- docs/oracle/specs/import-intent.md — new section 9
- tests updated: import-intent.test.ts, import-intent.views.test.ts, ImportIntentReview.test.tsx

## New decisions made (need owner confirmation)
- Rows 5 and 9 of the earlier state list (owned but not in deck) show Original; no separate tag yet.

## Assumptions
- Add stays usable while locked, because ticking it answers the question.

## Challenges to locked decisions
- D-043 — retires the word "Over-allocated" (collection view becomes "Short N"); the owner now wants "Overallocated" on import rows — confirm the word is fine here.
- Spec section 5 ("one deck is pre-selected") and section 6 (default Use my printing) are superseded by the owner's 2026-10-29 request.

## Open questions
- Should "owned but not in deck" get its own tag?

## Verification
- npx tsc --noEmit — clean
- npx vitest run src/lib src/components — all pass
