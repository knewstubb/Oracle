# Report: rail-art-crop
Role: Developer
Status: DONE
Task as received: In the deck page left rail, show only the commander's art (Scryfall art_crop) instead of the full card, for single commanders, partners and backgrounds, front face for double-faced cards; keep alt text and the no-image placeholder; equal 12px corners on all four corners at all times including loading and the placeholder; check the phone bar and skeleton; test; screenshots at 1280 and 390 on "A rot to process" and "Yedora the Explorer".

## Summary for the owner
The commander picture at the top of the deck summary column now shows only the artwork, as a wide picture with evenly rounded corners, instead of the whole card. A deck with two commanders shows both artworks side by side, each half the column width. Nothing changed on other pages.

## Changed files
- src/components/deck-rail/DeckRail.tsx — uses the existing art-crop image option; wide 272px crop; 12px corners on the wrapper, the image and the "No image" box; optional second commander image
- src/app/decks/[id]/page.tsx — passes the second commander's printing id to the rail
- src/components/deck-rail/DeckRail.test.tsx — tests: art crop URL (not the full card), rounded corners, partner pair, fallback box on image error
- docs/oracle/reports/evidence/rail-art-crop/ — screenshots

## New decisions made (need owner confirmation)
- Partner pair: side by side, each about 132px wide (stacked would make the column about 400px tall).
- Corner radius 12px, same as the mockup's art box and the app's standard large radius.

## Assumptions
- The saved commander printing id already points at the front face, and the art-crop address always uses "front", so double-faced commanders show the front art. No new Scryfall lookups; the app's existing art-crop address is built from the saved id.
- The "Commander card art" dashed box exists only in the mockup. The app's real fallback is the grey "No image" box (shown when the image fails or has no id), kept and given the same corners. With no commander, the rail still shows "Choose a commander" and no picture, as before.
- No partner deck was available locally, so the pair layout is covered by the unit test only, not by a screenshot.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- DeckRail.test.tsx — 14 passed
- Full vitest — 4105 passed, 0 failed
- tsc — only the 4 known AddToPicklist errors
- eslint — only the 1 known PicklistV2 error (plus existing warnings)
- Browser (Chrome, 1280 and 390, both decks): image is the art_crop URL, 271–272 x ~198px, all four corners 12px. With Scryfall blocked, the "No image" box also has 12px on all four corners. Phone compact bar already used the art crop (40px square) and is unchanged. Screenshots: *-1280.png, *-390-collapsed.png, *-390-expanded.png, yedora-1280-no-image.png.
