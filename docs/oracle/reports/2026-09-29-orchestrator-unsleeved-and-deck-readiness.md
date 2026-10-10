# Report: unsleeved-and-deck-readiness
Role: Orchestrator
Status: DONE
Task as received:
> Maybe swap considering to unsleeved, that says its in the mix but hasn't been physically added yet
> There needs to a difference between a deck that is playable (all sleeved) and one that isnt (all slots filled but not necessarily all sleeved), Maybel that is playable and "something that says ther eis an issue without it feeling like a warning"
> Then there is a deck that is being built which i guess is draft. Maybe theorycrafted is too much
> When a deck is imported the option should be to choose wheter it is sl;eeved or unsleeved (rather then built or draft)
>
> Does that make sense?

## Summary for the owner
Unsleeved is clearer than Considering because it describes physical readiness without suggesting that the card is merely an optional idea. Recommend Draft for an unfinished list, Assembling for a full list that is not fully sleeved, and Playable for a full list that is fully sleeved. Import should ask about Sleeved or Unsleeved separately from whether the decklist is complete.

## Changed files
- `docs/oracle/reports/2026-09-29-orchestrator-unsleeved-and-deck-readiness.md` - recorded the refined vocabulary and recommended readiness/import interpretation.

## Recommended model

### Card facts
- Placement: **Sleeved / Unsleeved**, replacing the proposed Considering label.
- Copy type: **Original / Proxy**; a proxy can be sleeved.
- Availability remains the owner's preferred **Available / Unavailable / Alt available / Unowned**.
- Maybeboard remains the separate home for optional ideas. Unsleeved describes a deck-list entry with no assigned physical copy, not a replacement for Maybeboard.

The current placement type is Planned/Sleeved and the main card list handles Maybeboard separately; the naming change must preserve that separation. [Confirmed: src/lib/card-status.ts] [Confirmed: src/components/CardsTab.tsx] [Confirmed: docs/oracle/decisions.md]

### Deck readiness

| Recommended label | Meaning | Example for a standard Commander deck |
|---|---|---|
| Draft | The intended list is still being put together. | 82 cards chosen. |
| Assembling | The intended list is full, but at least one main-deck slot is unsleeved. | 100 cards chosen, 92 sleeved. |
| Playable | The intended list is full and all required main-deck slots are sleeved, using originals or accepted proxies. | 100 cards chosen, 100 sleeved. |

Assembling should be a neutral progress label, not an amber/red warning or an error icon. Pair it with an explicit count such as "92/100 sleeved"; card-level exceptions retain their specific explanations. It does not promise that every needed copy is owned or free, unlike "Ready to sleeve".

These counts are explanatory examples, not a new hard-coded format rule. The eventual contract must use the deck's format, exclude Maybeboard, handle approved basic-land exceptions, and define what list completeness means. A short draft with every existing card sleeved must not become Playable merely because assigned count equals current card count.

Current deck tiles use green/amber/red readiness; the green branch permits missing completeness data or equal assigned/total counts, without proving a full list. Do not simply rename that colour result to Playable. [Confirmed: src/components/DeckTile.tsx] [Confirmed: src/app/api/decks/route.ts]

The recommendation is to derive physical readiness from recorded assignments rather than allow an import choice alone to assert Playable. Whether Draft is inferred only from list completeness or can be kept as an owner's intent remains to be specified; no automatic lifecycle rules were implemented here.

### Import

Recommended question: **"Is this deck sleeved?"**
- **Sleeved:** "This deck is physically assembled." Match and reconcile the actual physical copies; do not silently steal another deck's copy, invent ownership, or treat this choice alone as verified readiness.
- **Unsleeved:** "Import the decklist without assigning physical copies." A full imported list is Assembling rather than Draft; an unfinished list remains Draft.

This separates physical state from deck-list completeness. Both standalone deck import and onboarding/batch import need the same language and meaning.

Current standalone import offers New cards / Built / Theorycrafted; onboarding uses Active / Brew language. The new wording therefore needs coordinated flow changes, not one local button rename. [Confirmed: src/components/DeckImportButton.tsx] [Confirmed: src/app/onboarding/page.tsx] [Confirmed: src/lib/deck-import.ts]

Preserve the separate ability to record genuinely new collection copies. Existing `new_cards` mode adds physical copies, whereas the other modes use existing supply or import only a list. A Sleeved/Unsleeved selector must not silently delete that capability or make Unsleeved mean Unowned. Decide how that separate collection question is presented in the later import spec. [Confirmed: src/lib/deck-import.ts] [Confirmed: src/components/DeckImportButton.tsx]

### Actions

The previous recommended distinction still fits:
- Unsleeve releases the physical copy but keeps the entry in the list.
- Remove takes the entry out of the list without deleting the owned copy.
- Break down releases the deck's copies and keeps the list; a retained full list would be Assembling under the proposed model.

## New decisions made (need owner confirmation)
- No application or locked-decision changes enacted.
- Recorded the owner's preference for Unsleeved instead of Considering, and Sleeved/Unsleeved as the import physical-state choice.
- **Assembling** and its proposed neutral presentation are recommendations awaiting owner approval. Theorycrafted is not being treated as final terminology.

## Assumptions
- The user is refining the proposed model, not requesting implementation or deployment.
- "All sleeved" applies to the required deck list, not Maybeboard.
- Playable here describes a complete, physically assembled deck; it does not silently replace separate legality or format validation.

## Challenges to locked decisions
- D-002 - as raised in the preceding vocabulary report, Draft / Assembling / Playable would replace the earlier Brew / Boxed / Archived scheme. Confirm terminology, readiness behaviour, and separate retirement handling before updating the register. [Confirmed: docs/oracle/decisions.md]
- No challenge to allocation or import-copy rules: the new labels must preserve reconciliation, exact-printing/basic-land rules, and explicit owner choices rather than introduce an automatic allocation policy.

## Open questions
- Owner approval of Assembling as the neutral middle label.
- Later contract/spec: list-completeness rules, manual Draft intent versus derived readiness, retirement/archive handling, and how the existing new-cards import capability sits alongside the physical-state selector.

## Verification
- Read the standalone import option labels and descriptions in `src/components/DeckImportButton.tsx`.
- Read import mode definitions in `src/lib/deck-import.ts`; searched onboarding for Active/Brew and physical-copy wording.
- Read `getReadinessTier` in `src/components/DeckTile.tsx` and searched deck-list completeness calculation.
- Re-read the locked decisions. Discussion/report only; no application, database, contract, or spec changes and no runtime validation required.
