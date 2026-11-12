# Report: deck-hover-preload
Role: developer
Status: DONE
Task as received: When a deck opens, preload the hover-preview images in the background so the first hover over a card has no lag (throttled, low priority, cancel on navigate/deck change, skip on save-data/mobile, include basic lands via default-art helper, pure logic unit-tested, branch `deck-hover-preload`, do not merge).

## Summary for the owner
A few seconds after a deck opens, the app quietly downloads the card pictures used by the hover preview, a handful at a time, so the first hover shows the card straight away. It does nothing on phones, data-saver mode or very slow connections, and stops if you leave the deck.

How to check: open a deck, wait a few seconds, then hover a card. The picture should appear instantly. You do not need the browser Network tab.

## Changed files
- src/lib/deck-hover-preload.ts — pure logic: distinct first-choice URL list (same URL the hover uses first), batching, skip rules, throttled runner [Confirmed: uses previewImageSources and getBasicLandDefaultScryfallId]
- src/lib/deck-hover-preload.test.ts — unit tests for the above
- src/hooks/useDeckHoverPreload.ts — hook: waits 1.5 s, then browser idle time, loads with low fetch priority, max 4 at once, 150 ms pause between batches, cancels on unmount/deck change, keeps Image objects referenced until done
- src/app/decks/[id]/page.tsx — calls the hook once the deck's cards are loaded

## New decisions made (need owner confirmation)
- "Mobile" is detected as a device that cannot hover (touch-only), plus save-data and 2g connections.

## Assumptions
- Hover popover uses the large CDN image as first choice, so the same URL gives a browser cache hit. CardGroupSection needed no change since the page-level hook covers the whole deck.
- Preloaded URLs are remembered for the browser session, so reopening a deck does not refetch them. The existing chat preloader keeps its own separate tracking.

## Challenges to locked decisions
- none

## Open questions
- Whether the chat-panel preloader should later share this tracking.

## Verification
- npm run typecheck — one error, in docs/oracle/contracts/card-state-actions.examples.ts (import path ending .ts); in a file I did not touch, not from this change
- npx eslint on changed files — 0 errors (3 existing warnings in the deck page)
- npx vitest --run — 239 files passed, 2823 tests passed, 42 skipped
- Not tested: real-browser cache behaviour (no browser run).
