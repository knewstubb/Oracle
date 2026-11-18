# Report: dfc-front-face
Role: Developer
Status: DONE
Task as received: Owner rule (decided 2026-11-18): for double-faced cards, every place that groups, sorts, counts or filters by type uses the FRONT face's type line only. Single-faced 'Artifact Land' is still a Land first. Check the shared type-line parser and all readers, reproduce with tests, fix every reader through the shared parser, state what the card window shows and flag it. Basic and Snow filters stay as they are.

## Summary for the owner
Thousand Moons Smithy // Barracks of the Thousand now counts as an Artifact and Malakir Rebirth // Malakir Mire as an Instant, everywhere you group, sort, count or filter by type. Group: Type and Sort: Type on the deck page, the deck health type counts and the Claude collection summary already did this, and tests now prove it. What changed is the places that still looked at both faces: Claude's collection type filter, spare-copy browsing by type, the card-type word search, and the deck rating counts (counterspells, artifacts). One decision for you: the card window's Card types list still shows both faces (see Open questions).

## Changed files
- src/lib/rating-engine.ts — counterspell, artifact and land checks read the front face only
- src/lib/connector/tools/collection-query.ts — `types` filter reads the front face; Legendary, Basic and Snow filters unchanged
- src/lib/spare-copy-browse.ts — type words (and free-text type/supertype/subtype words) match the front face only
- src/lib/card-repository.ts — type keyword search matches the front face only
- src/lib/type-line-dfc-front.test.ts — new tests with the real type lines from the task
- src/lib/connector/__tests__/collection-search-cc14.test.ts, collection-search-filters.test.ts — two old expectations said "either face counts"; updated to the new rule (Spell Land 'Instant // Land' no longer matches land; Murderous Rider no longer matches instant)

## Findings (readers checked) [Confirmed: src/lib/type-line.ts]
- Parser: splits on ' // ' and `primaryType` already reads the front face with Land first. 'Legendary Artifact // Legendary Artifact Land' gives Artifact, so the previous job's claim that Smithy sits under Land is not reproduced in the current code. No parser change was needed.
- Already front face: deck page Group/Sort: Type (CardsTab, DeckEditor), deck health type counts, connector summary group by type, collection list short type, default category on add/import, basic-land check, card roles, curve land check, commander eligibility.
- Fixed (were reading either face): rating-engine, connector `types` filter, spare-copy browse, card-repository type search.
- Left as is on purpose: Basic and Snow filters (earlier owner request), collection Basic filter, Legendary filter, commander eligibility/resolver and the Legendary-Creature rule (not type grouping), card window Card types.
- Card window [Confirmed: src/lib/card-window-roles.ts]: shows the union of card types from both faces, e.g. Smithy shows "Artifact, Land"; supertypes and subtypes also from both faces. Unchanged.

## New decisions made (need owner confirmation)
- A type filter for "Artifact" still returns an Artifact Land (the card has the type); only counts and groups put Land first. Say so if filters should also drop artifact lands from Artifact.

## Assumptions
- "Filters" includes Claude's collection type filter, spare-copy browsing and type keyword search; free-text supertype and subtype words there also read the front face.

## Challenges to locked decisions
- none

## Open questions
- Card window Card types shows both faces ("Artifact, Land" for Smithy). Should it show only the front face ("Artifact") to match the rule, or keep both so you can see the card is also a land on its back?

## Verification
- npx vitest run — 3860 passed, 1 failed (known ImportIntentFlow env flag test)
- new tests src/lib/type-line-dfc-front.test.ts — pass
- npx tsc --noEmit — 4 known AddToPicklist errors plus the pre-existing generated .next validator error; none new
- npx eslint on changed files — 0 errors (1 existing warning in spare-copy-browse.ts)
