# Report: hover-preview-fix
Role: Developer
Status: PARTIAL
Task as received: Fix the unreliable card hover preview in the deck list (some previews appear; some flash a blank popover then vanish; some do nothing). Investigate root cause, check real image URLs, add a name-based Scryfall fallback for null-id rows or failed loads, never show a blank popover, add focused tests, run typecheck/lint/tests, commit and push to `deck-health-polish`.

## Summary for the owner
Hovering a card in the deck list now only shows the preview once the card picture has actually arrived, and quietly shows nothing if it can't be found. Cards that have no saved picture link (13 rows, for example Sol Ring or Command Tower in the Edgar Markov deck) used to do nothing on hover; they now look the picture up by card name. I could not watch the app in a browser or reach Scryfall's image servers from here, so I have not seen the original symptom happen myself; please hover a few cards and tell me if any still misbehave.

## Changed files
- src/lib/card-preview-image.ts — new pure helpers: ordered list of image sources (CDN, Scryfall by id, Scryfall by exact name), next-source step, hover-request key, and the "may the popover show" rule
- src/lib/__tests__/card-preview-image.test.ts — tests for those helpers
- src/components/CardHoverPreview.tsx — uses the helpers; one "requested row" token replaces the old card-name tracking; null-id rows now load by name; legacy component and `showCardPreview` go through the same loader; mouse-leave clears the token
- src/components/CardHoverPreview.image.test.tsx — updated and extended (null id by name, full fallback chain, late load after leaving stays hidden)

## Findings
- Data is not the cause. [Confirmed: Supabase deck_cards] 793 rows, 13 null `scryfall_id` (Arcane Signet, Blood Artist, Captivating Vampire, Command Tower, Cordial Vampire, Edgar Markov, Legion Lieutenant, Mountain, Plains, Sol Ring, Stromkirk Captain, Swamp, Welcoming Vampire), 0 malformed ids, 530 distinct ids.
- Image URL format is correct. [Confirmed: ref_printings] For 527 of the 530 distinct ids present in `ref_printings`, the URL the component builds is identical to the stored `image_uri_large`; 0 differ. 3 ids are not in `ref_printings` (not checked further, they fall to the API/name fallbacks).
- Null-id rows did nothing: [Confirmed: src/components/CardHoverPreview.tsx, original `onMouseEnter` returned early when no id]. This matches "some do nothing".
- Race/blank logic: the original showed the popover from stale state (card-name match on `img.alt`, a shared name token cleared by hide) and a failed image left the frame visible/hidden inconsistently. This is the likely cause of "flash then disappear" and "stuck blank", but see the honesty note below.
- Not a cause: printing-vs-oracle id mix-ups (all deck rows pass the printing id; basic lands fall back to a default art id) and off-screen positioning (`calculatePosition` already clamps to the viewport).
- Starting state: the branch already held an uncommitted half-finished edit of this file (removed `currentCardName` but left references to it, which would not compile). I completed it rather than discarding it.

## Honesty note on reproduction
I did NOT reproduce the symptom in a real browser. In this environment `cards.scryfall.io` was unreachable and `api.scryfall.com` returned an "Offline for Maintenance" page, so I could not check which image URLs actually 404. The diagnosis is from code reading, the database checks above, and unit tests that simulate load/error/leave orderings. The "never blank" and fallback behaviour is covered by tests; real-world confirmation by hovering is still needed.

## New decisions made (need owner confirmation)
- A card with no saved picture link now shows a preview found by exact card name (may show a different printing than the deck's).

## Assumptions
- A hook given a null id is no longer meant to mean "preview disabled"; no caller relied on that (null-id hover previously just did nothing).

## Challenges to locked decisions
- none

## Open questions
- Are 3 deck printing ids missing from `ref_printings` expected (new sets)?

## Verification
- `npm run typecheck` — one error, in docs/oracle/contracts/card-state-actions.examples.ts (TS5097); identical with my changes stashed, so pre-existing and unrelated
- `npx eslint` on touched files — 0 errors; 1 pre-existing warning (unused `createPortal`)
- `npx vitest run` (full) — 238 files passed, 2812 tests passed, 42 skipped
- Real-browser hover test — NOT done (Scryfall unreachable from here)
