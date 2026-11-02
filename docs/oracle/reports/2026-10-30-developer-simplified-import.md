# Report: simplified-import
Role: Developer
Status: PARTIAL
Task as received: "This is good. Just use the existing components when you rebuild" (rebuild the deck-import review to the approved simplified wireframe, docs/oracle/mockups/import-simplified-wireframe.html).

## Summary for the owner
The deck import now asks "What's this deck?" after the deck loads. Each answer shows real numbers for this deck, and one answer is suggested. Each card then has just two controls: Card source (None, Collection, New) and Type (Original, Proxy). Precons are no longer locked to "I bought it". A card whose only copy is already in another deck is flagged, but the import can't be saved yet: that needs a change to how data is stored, and you need to approve it.

## Changed files
- docs/oracle/contracts/import-intent.types.ts: CardSource, `source` edit, `share` plan, `short` / `sharedWith`.
- src/lib/import-intent.ts: new defaults, allocation order, share / short plans, copy views, coerce rules, summary, tags, `intentChoiceStats`. (The test pass also fixed the type kept when switching New to Collection.)
- src/lib/import-intent-save.ts: short copies count as needs-choice; adds SharedCopyError and `sharedRowKeys`; validates `source`.
- src/lib/manabox-deck-import.ts: guards for share and short. (The test pass also fixed the "ownership unavailable" listing.)
- src/app/api/decks/import/route.ts: returns 400 `shared_copy_unsupported`.
- src/components/manabox-import/ImportRowEditor.tsx: Card source / Type controls; the Add tick, question rows and locking are removed.
- src/components/manabox-import/ImportCardList.tsx: new header columns, maybeboard rows, bulk Card source / Type.
- src/components/manabox-import/ImportIntentChoice.tsx: shows stats, headline and suggestion.
- src/components/manabox-import/ManaBoxDeckImportFlow.tsx: question stage after load; Back returns to the question; footer blocks.
- src/components/manabox-import/import-copy.ts: new strings.
- src/components/manabox-import/IntentDecisionRows.tsx: deleted.
- src/components/DeckImportButton.tsx: intent is no longer asked before load; precon not locked; origin tab stays highlighted while choosing.
- Tests: import-intent(.views), import-intent-save, route, ImportIntentReview, ImportIntentFlow, DeckImportButton(.precon). Rewritten for the new model.
- docs/oracle/specs/import-intent.md: rev 4, §15.
- docs/oracle/test-protocol-import.md and docs/oracle/test-log-import.md: B1, B2, B3b, C1–C3, C7 and D1–D5 updated.

## New decisions made (need owner confirmation)
- Suggestion rule: a precon suggests "I bought it"; owning at least half the cards suggests "I built it"; otherwise "I'm planning it".
- Short copies (Collection with nothing left) block Import until each is set to None or New.
- The question replaces the input area. The pasted text or link itself isn't shown again, only a line naming the deck.
- Generic basics in a collapsed row show None / Sleeved.

## Assumptions
- Choices made under one answer are dropped when the owner goes Back and picks a different answer.
- With the save switch off, a purchased deck saves only if every copy is New, because the old save path can't use collection copies.

## Challenges to locked decisions
- D-021 / D-027: the owner rule "allocate to both decks and flag both" needs one physical copy linked to several decks, which these decisions forbid. The import is blocked rather than faked. Suggest: an Architect contract plus a migration approved by the owner, then deck-page actions (Pull from X / Send to Y / New copy here / Proxy here).
- D-047: owned copies are now used automatically (Collection is the default for built decks) with no per-card question. Wording to update after owner sign-off.
- D-043: wording for tags and controls changed (Card source / Type, "Also in", "short").
- Spec rev 3's precon lock is removed at the owner's request (2026-10-30).

## Open questions
- Should a card already in another deck be saveable (shared) now, through the database change above?
- Sideboard chip (blocked by D-018), and chips for collection import.
- After Korvold sends its copy away, should Korvold show "short"?
- A deck with no checkable cards (for example, only basics) gets no suggestion, so Continue waits for a pick.

## Verification
- npx tsc --noEmit: 0 errors.
- npx vitest run src/lib src/components: 1925 passed, 14 skipped, 0 failed (developer test pass).
- npx eslint on the changed components: 0 errors (existing warnings only).
