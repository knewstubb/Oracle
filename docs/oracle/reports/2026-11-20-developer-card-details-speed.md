# Report: card-details-speed
Role: Developer
Status: DONE

Task as received: Task: make the new card details window open fast in the Oracle app. Reported issue (owner, 2026-11-20, verbatim): 'taking a long time for the card details to come up. We need to make that faster'. Size: medium.
Fix, in order of impact, without changing what the window shows: (1) the window must appear at once with what the page already knows (card name, picture, mana cost, type line, status from the deck or collection row) and fill in the rest as it arrives, with per-section loading placeholders that do not grow the 1080 by 600 window; (2) load only what the open tab needs first (Overview), and fetch Printings, Copies and Rulings when their tab is opened or in the background after Overview, so their counts in the tab labels may arrive slightly later (say how counts are shown meanwhile); (3) run independent database queries in parallel, remove repeated queries, select only needed columns, and use existing indexes; if a missing index would help a lot, describe it as a proposal only (no migration in this job); (4) cache results that rarely change (Tags, rulings, printings) for the session, and reuse data already loaded by the page; (5) prefetch on hover or focus of a card name where cheap. Set a target and report against it: the window visible within 100 ms of the click, Overview content within about 500 ms warm in a production build; say plainly if the hosted database distance makes a target impossible and by how much.
(Constraints, tests and done check as in the handoff: no database change, no hosted write, no layout or wording change beyond loading states, Picklist internals untouched, decisions.md and status.md untouched.)

## Summary for the owner
The card details window now shows its content in about 1 second instead of about 3.7 seconds (deck) and 2.9 seconds (collection), measured on this Mac against the real database. If you rest the pointer on a card name for half a second before clicking, the content is there about 0.3 seconds after the click. The window itself still opens at once (3 to 10 milliseconds). It now shows the card's name, picture, mana cost, type line and rarity from the list straight away, with grey placeholders for the parts still loading.
Printings, Copies and Rulings load right after the Overview, so their numbers in the tab labels appear about 1 second later (nothing is shown until they arrive, as before). Everything is in about 2 seconds.
The 0.5 second goal for the Overview is not reachable from the click alone: it still takes four database round trips in a row, 0.25 seconds each from this Mac. On the live site each trip is about twice as long, because the site runs in Washington DC and the database is in Singapore. You decide whether to move the site's region (see "Decisions").

## Targets and results
| Target | Result |
|---|---|
| Window visible within 100 ms of the click | Met: 3 to 10 ms in every run, dev and production, deck context (browser). Collection context shares the same window code. |
| Overview content within about 500 ms warm, production build | Not met from a cold pointer: about 1.0 s (deck) and about 1.0 s (collection). Met after a half-second hover: about 0.3 s. |

Why 1.0 s is the floor today: the request makes one sign-in check in the middleware (about 0.25 s), one in the route (about 0.25 s) and two database rounds (about 0.25 s each). Each is one network round trip to the hosted database, and nearly all of the time is distance (Supabase's own processing time was 11 ms in the baseline). The 500 ms target would need at most two round trips in a row. On the live site (about 0.5 s per trip) the same four trips cost about 2 s, so the target is out of reach there by about 1.5 s unless the region moves (below).

## Times (seconds, click to content shown; "all tabs" = Overview plus the Printings, Copies and Rulings counts)
BEFORE is from `.agents/tasks/card-details-speed/baseline.md` (code at 9bb83f5). AFTER was measured with the same method (kit in `.agents/tasks/card-details-speed/measure/`, new scripts `apibench-parts.mjs`, `bench-hover.mjs`; `bench.mjs` now also records "all tabs"). Medians of warm runs, ranges in brackets.

| Context | Server | Before cold | Before warm | After cold | After warm | After all tabs (warm) |
|---|---|---|---|---|---|---|
| Deck (browser) | production :3100 | 4.27 | 3.67 | 1.41 | 1.02 (0.93 to 1.07) | 2.1 (2.0 to 2.2) |
| Deck (browser) | dev :3200 (before: :3000) | 4.56 | 3.69 | 1.14 | 1.03 (1.00 to 1.04) | 2.04 |
| Deck (browser), pointer rested 0.7 s on the name | dev :3200 | n/a | n/a | 0.46 | 0.31 (0.29 to 0.33) | 1.3 |
| Deck (request only) | production :3100 | 3.84 | 3.43 | 1.61 | 1.03 (0.97 to 1.10) | 2.0 |
| Deck (request only) | dev :3200 | 3.34 | 3.41 | 2.06 | 0.97 (0.92 to 0.98) | 2.0 |
| Collection (request only) | production :3100 | 4.04 | 2.92 | 1.79 | 1.03 (0.94 to 1.28) | 1.5 |
| Collection (request only) | dev :3200 | 3.60 | 2.97 | 2.04 | 1.01 (0.97 to 1.06) | 1.5 |
| Deck, live site | Vercel iad1 | 14.07 | 7.91 | not measured | about 2 (estimate: 4 trips at about 0.5 s) | about 3.5 (estimate) |
| Collection, live site | | not deployed | not deployed | | | |

Notes:
- Reopening the same card on the same page is still instant (2 to 9 ms, no request).
- The live site runs the old code until this branch is deployed, so the live "after" figures are an estimate from the measured 0.5 s per trip, not a measurement.
- The collection window could not be clicked in the browser (the Cards list on /allocation fails to load, an existing problem noted in the baseline), so it was timed through its request, as in the baseline.
- Single runs vary by up to 0.4 s with the network (one cold collection run took 4.9 s during a connection hiccup and was discarded and re-run).
- Same data check: the new "everything in one answer" route returned exactly the same content as the old code (main checkout, port 3000) for Sol Ring in Rocco's Secret Sauce (18 copies, 145 printings) and for the collection view. Only the key order differs.

## What changed
1. **Window at once.** The deck window header uses the list row's mana cost, type line and rarity until the Overview arrives, then the loaded values. The shell's loading placeholder is a set of fixed-height grey bars inside the fixed 1080 by 600 window. Rail values (Printing, Price, Commander, Collection value, Cheapest) show small grey bars while loading.
2. **Load by tab.** Deck: `?part=overview` (header, facts, Tags, the slot's own printing, Why line), then `?part=collection` (Printings with owned counts, and Copies) and `?part=rulings`, both started as soon as the Overview is in. Collection: `?part=main` (everything except rulings, since the Overview shows copies and waiting decks), then `?part=rulings`. Opening a tab never starts a second request for the same part. With no `part`, the route still answers in the original single shape.
3. **Tab counts while loading.** A count appears in the Printings, Copies and Rulings labels only when its section has arrived. Until then the label shows the name without a number (the same as before, when the whole window was loading). The tab shows a placeholder if it is opened before its section arrives, and a "Couldn't load details ... Try again" message for that tab alone if only that section fails.
4. **Fewer and parallel queries.** Deck Overview: from 14 calls in a row to 2 database rounds. Deck, Printings and Copies: copies are read in one query that includes their card (it was two, one after the other); the deck names and deck slots are read together; the three reads of `decks` became one and the two of `ref_printings` became one. Collection: the user's decks are read once (it was three times), and the slots of decks that hold a copy are read at the same time as the waiting-deck search. The Why-column check no longer costs its own call: the slot read asks for it and falls back if the database says it is missing.
5. **Caching.** Server: card facts and rulings for 10 minutes, printings of a card for 5 minutes (never copies, decks or the Why line). Tags were already cached for 5 minutes. Browser: rulings are kept for the session and are not read again after an edit.
6. **Prefetch.** Resting the pointer on a card name for 120 ms, or focusing it, starts the Overview read. A click after that reuses it (tested: one request, not two).

## Changed files
- `src/lib/card-details/load.ts` — split into Overview, collection (printings and copies) and rulings loaders; parallel reads; one read per table; server cache; fixes the relation name for the copy-to-card join (two relations exist, so the name is required)
- `src/lib/card-details/load-collection.ts` — main part and rulings part, parallel reads, own decks read once
- `src/lib/card-details/ref-cache.ts` — new small in-memory cache for facts, printings, rulings
- `src/lib/card-details/why-column.ts` — remember and peek helpers so the slot read can skip the probe
- `src/app/api/decks/[id]/cards/[cardId]/details/route.ts`, `src/app/api/collection/instances/[oracleId]/details/route.ts` — `part` query for each part, original shape when absent
- `src/components/card-details/useCardDetailsData.ts`, `useCollectionCardDetailsData.ts` — one query per part, rulings kept for the session
- `src/components/card-details/CardDetails.tsx`, `CollectionCardDetails.tsx`, `CardDetailsShell.tsx` — header from list data, per-tab status, placeholders
- `src/components/card-details/CardDetailsProvider.tsx`, `src/components/CardGroupSection.tsx` — prefetch on hover or focus of a card name
- Tests: `CardDetails.test.tsx`, `CollectionCardDetails.test.tsx` (new speed tests, parts), `route.test.ts` (deck route, parts), `load-collection.test.ts`, `why-column.test.ts`, `collection/CollectionRollupTab.test.tsx` (answers per part)

## Decisions (need owner confirmation)
- **Move the live site's region next to the database** (recommended). The site runs in Washington DC (iad1, read from the live response header; nothing in the repo sets it) and the database is in Singapore (not re-checked this time). Moving the site to Singapore (`sin1`) should cut every live round trip from about 0.5 s to a small fraction of that, which is the only way the 0.5 s Overview target can be met on the live site. Cost: the same move affects every other screen, and any other service the site talks to from the US gets slower. This needs your approval in Vercel settings; nothing was changed.
- **Skip the second sign-in check** (optional). The route repeats the check the middleware has already made (about 0.25 s local, 0.5 s live). Reading the identity from the middleware's check would save one trip but touches sign-in handling, so it was left alone.
- **One-round Overview** (optional). The list already knows the card's name and printing, so the Overview could read them at the same time as the slot, with the server checking they match. It would save one more trip (0.25 s local). Not done: it adds a second source of truth to the request.

## New decisions made (need owner confirmation)
- Printings and Copies load together (one shared read of the user's copies), so their counts appear together. Rulings arrive separately.
- Printings, facts and rulings may be up to 5 to 10 minutes old on a warm server (prices change daily, so this is below the refresh rate).

## Index proposal (not applied)
None. In the baseline each database call took 200 to 330 ms, almost entirely network (a trivial query took 250 ms, Supabase's processing time 11 ms), so an index would not change the times. Nothing in this job reads enough rows to need one. If the deck slots read (about 1,700 rows for 17 decks, in the Copies and collection views) ever grows, a composite index on `deck_cards (deck_id)` including `copy_id, is_generic, generic_sleeved, categories` is the candidate; this was not verified against the database's real index list.

## Assumptions
- "Warm" means the server has already answered the same card once. "Cold" is the first open after a server start.
- The 100 ms goal is measured from the click to the window being in the page, as in the baseline.
- Collection copies' names come from the card record linked to the copy, or from the printing when the user owns no copy (the same name in practice).

## Challenges to locked decisions
- none

## Open questions
- Should the live site move to the database's region (see Decisions)?

## 2-minute test
1. Open a deck and click a card name, for example Sol Ring. The window should appear at once with the name, picture, mana cost, type and rarity, and grey bars where the rest will arrive. The Overview should fill in after about a second.
2. Watch the tab labels. Printings, Copies and Rulings should get their numbers about a second after the Overview.
3. Click Printings straight away after opening. You should see grey bars, then the list, with the window staying the same size.
4. Close it, rest the pointer on another card name for half a second, then click. The content should be there almost immediately.
5. Open the Collection card window the same way from Tools, Cards. Same pattern: the name shows first, then everything but the rulings, then the rulings count.
6. Check the Copies tab for a card in a deck: each copy should still show Original, Open, Claimed or Proxy as before, and Sleeve, Assign, Release and Reassign should work as they did.

## Verification
- `npx vitest run` (full, three runs) — 1 known failure each run (ImportIntentFlow env flag test). One run also showed 1 unrelated timing flake in each of the arrow-key tab test and the upgrade-engine property test under load; both pass when run alone and in the other runs. Test count: 4,435 passed, 46 skipped.
- `npx tsc --noEmit` — only the 4 known AddToPicklist errors.
- `npx eslint src` — 1 error (the known PicklistV2 one), no new warnings in changed files beyond ones already there.
- New tests: window at once with list data and placeholder (`CardDetails.test.tsx`); placeholder in a tab while its section is pending, counts after; each part asked for once however many tabs are visited; hover then click reads the Overview once; failed section stays in its own tab (`CardDetails.test.tsx`); collection window at once, rulings after the main part, once (`CollectionCardDetails.test.tsx`); one read per table, one copies query, server cache, part answers and 404/400/500 (route and load tests).
- Live-data check (read-only GETs, signed in): old code on :3000 against new code on :3100, both contexts, identical content.
- Measurements: production build (`npx next build`, about 17 s) on :3100, dev on :3200. Both servers stopped. The owner's dev server on :3000 from the main checkout was not touched and still answers. The sign-in cookie file used by the kit was deleted. No writes: the scripts only sign in, click a card name, press Escape and make GET requests.
