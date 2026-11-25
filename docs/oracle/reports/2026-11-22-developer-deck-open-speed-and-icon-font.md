# Report: deck open speed and icon font (UX-09, UX-10)
Role: Developer
Status: DONE (awaiting owner click-through; not merged)
Task as received: Build fixes for UX-09 (slow deck open) and UX-10 (icons shown as text). Owner approved option A plus the icon fix (2026-11-22): 1. remove the unused Picklist request from the Cards tab; 2. make the server's deck route ask the database in parallel, results identical; 3. serve the Material Symbols icon font from the app, preload it, hide icons until the font is ready, ship a reduced font if safe. Option B (starting Deck health and other panels with the deck, changing Deck health loading, auth changes) is out of scope. Worktree branch ux-09-10-deck-speed-icons, base 0b471b1, no push, no merge.

## Summary for the owner
Opening a deck is faster: the server now reads the deck's data in two rounds instead of about nine, and the Cards tab no longer asks for the whole Picklist it never used. For deck "Elfball" the real deck appears at about 1.4 to 1.8 seconds (was 1.9 to 2.3) and everything finishes filling in at about 2.4 to 3.0 seconds (was 4.7 to 5.1). Icons are now served by the app itself (330 KB instead of 4 MB from Google) and stay invisible until the icon font is ready, so an icon's name should never show as words. The deck screen still waits for card statuses before it shows, which now sets the pace; speeding that up is part of option B and needs your go-ahead.

## Changed files
- src/components/CardsTab.tsx — removed the unused Picklist request and its now-unused type import
- src/app/api/decks/[id]/route.ts — GET reads the deck, cards and brew session together, then card data, printings, commander, synergy and copies together; one printings read now feeds prices, rarity and editions; removed an unused variable (allocationMap, assigned but never read)
- src/app/api/decks/[id]/route.get.test.ts — new tests for the deck route (data, other user's copy, one printings read, parallel reads, 450-card batching and order, 404/400)
- public/fonts/material-symbols-outlined-subset.woff2 — icon font cut to the icon names in the code, all four axes kept
- public/fonts/material-symbols-outlined-subset.names.txt, public/fonts/README.md — list of icons in the font and how to rebuild it
- src/lib/icon-font-subset.test.ts — fails if code names an icon missing from the font
- src/app/globals.css — font declared (font-display: block) plus the Google icon class copied verbatim; icons hidden until the page is marked ready
- src/app/layout.tsx — removed the Google stylesheet link; added font preload and a small script that marks the page when the font is ready
- src/middleware.ts — font files skip the login check (like images)
- next.config.ts — fonts cached for a year
- docs/oracle/status.md — UX-09 and UX-10 rows

## New decisions made (need owner confirmation)
- Icons are hidden (not words) if the font never loads. Blank is judged better than words.
- Opening the Picklist tab now starts its own load (it has a loading state) instead of finding data pre-fetched by the Cards tab.
- Icon font subset keeps every name that appears anywhere in the source (about 360 of 4,300), so it is slightly larger than a strict minimum but safe for names held in lists. New icon names need the font rebuilt (README; the test catches names written directly in `name=`, `icon:` and span forms).

## Assumptions
- Commit 8a6fb2f removed the same redundant Picklist query from the Cards tab; this change is consistent with it. Nothing reads that query's data; Picklist tab, status popover and refresh code use the same key only to invalidate or to load their own copy.
- Names built in code at run time (not written as text) are not covered by the font subset scan; a search found none.
- mana-font and keyrune (jsdelivr) stylesheets are unchanged and still load from outside.

## Challenges to locked decisions
none (loading, "Checking…" and Retry states untouched, D-030).

## Open questions
- Do you want option B (start Deck health, legality and other panels with the deck, and speed up card statuses, which now gate the deck screen)?

## Verification
Same method as the investigation: production build, `next start`, Playwright (headless Chromium), click deck tile "Elfball" (1127550923) from the library, 4 runs each on this laptop against the hosted database (reads only). Milliseconds from click.

| | real deck shown | last data request finished (excl. 30-second-style marker poll) | deck route |
|---|---|---|---|
| before | 2326, 1927, 1936, 2316 | 4911, 4667, 4668, 5133 | 1504, 1413, 1403, 1747 |
| after | 1809, 1818, 1443, 1412 | 4336*, 2979, 2448, 2423 | 680, 756, 617, 622 |

*first run after server start. Picklist request: present before (about 2.8 s, 70 KB), gone after. Real deck now waits on the card-statuses request (about 0.9 to 1.2 s), not on the deck route.
- Deck route payload: byte-identical before and after (96,441 bytes, compared with cmp).
- Throttled icon check (cache off, 150 ms latency, 1600 and 400 kbps, deck page, 50 ms sampling): 0 frames with a visible icon before the font was ready; icons appeared the moment the font finished (6.7 s and 25.6 s). Screenshot at 1600 kbps shows all status chips and row icons as pictures.
- Font size: 4,026,232 bytes to 334,352 bytes. All 358 names the code mentions are present.
- npm test (NEXT_PUBLIC_IMPORT_INTENT_SAVE empty): before 4675 pass; after 4682 pass, 1 fail = known flaky property test (upgrade-engine.property, "invalid bracket values"), which also fails intermittently on the unchanged base (3 reruns each). New tests: 7.
- tsc --noEmit: 0 errors before and after.
- eslint: 1 error before and after (pre-existing, `<a>` link in PicklistV2).
- No migrations, no writes to the database. Servers on port 3002 stopped.

## Owner click-through
1. Open the library and click "Elfball". The real deck should show in about 1.5 s and the Deck health numbers shortly after.
2. Check the card list: order, prices, editions, finishes and status circles look as before.
3. Open the Picklist tab: it shows its loading state briefly, then the list.
4. Reload with the browser cache cleared (or on a slow connection): no icon names as words appear; icons appear together once loaded.
5. Look at nav, deck status chips, row status icons, picklist, mobile menu: all icons look the same size and weight as before.
