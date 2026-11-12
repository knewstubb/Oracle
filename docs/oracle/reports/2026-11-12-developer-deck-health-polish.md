# Report: Deck health polish (owner feedback after S4/S5)
Role: Developer
Status: DONE (branch `deck-health-polish`, pushed, not merged). One item (scroll bars) could not be reproduced in the test browser; see item 2.

Task as received: Five fixes after the owner tried S4/S5: (1) "Add to deck" on every recommended card in the role detail, using the existing add path; (2) scroll bars still light in the owner's browser, find the real cause and verify with screenshots; (3) do not show how many spares he owns; (4) card preview on hover not showing in the Deck health role detail and in Oracle chat; (5) generic basic land rows: remove +/-, click-to-type count, align with other rows, fix broken thumbnails. No migrations; tests never touch live data.

## Summary for the owner

1. Every card in a role's detail (spare, in another deck, buy idea) now has an "Add to deck" button. It uses the same add call as the Add card box on the deck page. After adding, the row says "Added to deck" and the deck, the pill counts and the panel refresh. A failure shows a red message and the button turns into "Try again".
2. Scroll bars: I found a likely real cause and fixed it, but I could not see the white bar in my test browser (see below).
3. The role detail no longer shows how many spares you own: the heading is just "Spare" and the "x2"-style counts are gone. "See the N cards already in this deck" is unchanged.
4. Card previews: the preview itself works inside the panel (I checked with a screenshot). I fixed two ways it could show nothing or only the small price strip, see below.
5. Basic land rows: no + / - buttons; click the number and type a new one. The count and name line up with the other rows and the art thumbnail (the broken image) is gone.

## Owner check steps

1. Open a deck, Deck health, open a Light role. Click "Add to deck" on a spare card: it says "Added to deck", the pills and the deck list update. Try one that is in another deck: it says "Added to deck · the copy stays in <deck>" (the other deck keeps its copy).
2. Look at the role detail: heading "Spare", no number, no "x2".
3. Hover a card thumbnail in the role detail: the full card appears over the panel. In the Oracle chat, hover a card name in an answer: the card image should show with the owned/price strip.
4. Land group: click the "30" next to Swamp, type 28, press Enter: deck total changes by 2. Escape cancels. Typing letters or a negative number is refused and the old number stays. There are no + / - buttons and no broken image.
5. Scroll bars: check the main page, the chat and the Deck health panel in your browser after a hard refresh (Cmd+Shift+R). If a white track is still there, tell me which browser it is (Safari or Chrome) and its version.

## What "Add to deck" does for each kind of card (existing behaviour, reused)

It calls the same route the Add card box uses (`POST /api/decks/[id]/cards` with the card name). That route only creates a planned slot for the card in the deck and assigns no physical copy.
- Spare owned card: becomes a slot in the deck; no copy is assigned automatically, exactly as when you add it by search.
- Card in another deck: becomes a slot; nothing is stolen or moved, the copy stays in the other deck. The row says so. To move the copy, use the existing swap or allocation flow.
- Unowned buy idea: becomes a planned/unowned slot, as with the existing flow.
The deck, status counts, health (including this panel) and picklist are refreshed afterwards.

## Item 2: scroll bars, honest evidence

- The repo already had the rule you asked for (`scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent` on `*`, plus transparent `::-webkit-scrollbar` rules).
- I ran Chrome for Testing with real classic (always visible) scroll bars on a copy of the app on another port (3200, your server on 3000 untouched; copy and port removed afterwards). Scroll containers found on a deck page with chat and panel open: the deck content column, the Oracle chat message list; the Deck health panel only scrolls when its list is long. In the screenshots every one had a dark transparent track and a grey thumb. No white or light bar anywhere in Chrome. So the Chrome side was already correct.
- Real cause found by testing Safari's engine (WebKit 26.4) with the same page: Safari understands `scrollbar-width` but NOT `scrollbar-color` (`CSS.supports` returned false for scrollbar-color, true for scrollbar-width). As soon as `scrollbar-width` is set, Safari ignores the `::-webkit-scrollbar` rules, so it draws its own native track, which is the light one. My WebKit screenshots would not draw scroll bars at all, so I could NOT see the white bar there; this diagnosis is from the engine's feature check and computed styles, not a picture.
- Fix: the standard properties now apply only where `scrollbar-color` is supported (`@supports (scrollbar-color: auto)`), on `html` and `*`. Safari now uses the transparent `::-webkit-scrollbar` rules instead. Verified: WebKit computed `scrollbar-width` is now `auto`; Chrome still computes `thin` and the transparent track. A test locks the rule in.
- If your browser is Chrome and still shows white after a hard refresh, tell me; that would be something I could not reproduce.

## Item 4: card preview

- Panel thumbnails: with a mocked light role and mocked card images, hovering the thumbnail showed the full card above the panel, not clipped (preview layer is `z-index: 9999` on the page body, the panel is 50). So the layering was not the problem.
- Two real faults fixed in `CardHoverPreview.tsx`: (a) an image that failed once stayed hidden, and a later hover on the same card showed only the small "N owned · $X" strip, which matches what you saw in chat; (b) a printing the image server does not have never recovered. Now a failed image is retried once through the Scryfall API image address, and a later hover retries instead of showing an empty frame.
- Limit: my sandbox cannot reach Scryfall, so I tested with fake images, not real card art. I cannot be sure this was the cause on your machine. If the card still does not show, tell me one card name that fails.

## Item 5: land rows

`GenericLandRow` in `CardGroupSection.tsx`: count is a click-to-edit number in the same column as other rows (same width and alignment), name in the same position, art thumbnail removed (other rows have none; the "Change art…" button and "Sleeved" stay). Enter or leaving the box saves, Escape cancels, only whole numbers 0 or more are accepted. It uses the same queued save as the old +/- (one request after a short pause, deck totals update instantly). Verified in a screenshot: count and name line up with the rows below, and the box in edit mode does not shift the name.

## Changed files

- `src/components/GapDetail.tsx`: Add to deck buttons and states; spare counts removed.
- `src/app/globals.css`: scroll bar rule gated for Safari.
- `src/components/CardHoverPreview.tsx`: `setPreviewImage` helper and image fallback.
- `src/components/CardGroupSection.tsx`: generic land row inline edit and alignment.
- `src/lib/generic-land-count.ts` (new): parse and validate the typed number.
- Tests (new or updated): `GapDetail.add.test.tsx` (new, 6), `CardHoverPreview.image.test.tsx` (new, 6), `GenericLine.test.tsx` (inline edit, 6 replacing 1), `generic-land-count.test.ts` (new), `src/app/scrollbar-css.test.ts` (new, 4), `GapDetail.test.tsx` (small update).
- `docs/oracle/status.md`.

## New decisions made (need owner confirmation)

- Add to deck from the panel adds a planned slot and does not move a copy out of another deck (existing add flow).
- Generic land rows no longer show an art thumbnail; art is changed with "Change art…".

## Assumptions

- The owner's white scroll bars come from Safari. Not confirmed.
- "Keep the deck at its constraints" for the land count means the same checks the old +/- had (not below 0, server decides the rest); no extra cap was added.

## Challenges to locked decisions

- none

## Open questions

- Which browser and version show the white scroll bars?

## Verification

- `npx vitest run`: 2,796 passed, 42 skipped.
- `npx tsc --noEmit`: only the known error in `docs/oracle/contracts/card-state-actions.examples.ts`.
- `npx eslint src`: 0 errors (existing warnings).
- Browser checks on a /tmp copy: scroll bars in Chrome with classic bars (dark), hover preview in the panel with mocked images, land row alignment and edit state. Not run: real card images, real Safari scroll bars, a real add against the live database (tests use fixtures).
- No migrations.

## Process slips

- I changed a macOS preference for the test browser (classic scroll bars) and removed it afterwards; it only affected the Chrome for Testing app.
- A python no-op was run once and wrote nothing. No file was written outside the edit/create tools.
