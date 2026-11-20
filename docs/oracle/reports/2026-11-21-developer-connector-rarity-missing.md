# Report: connector-rarity-missing
Role: Developer
Status: DONE
Task as received: Reproduce and fix "Claude sees no rarity field in get_deck, search_collection or list_deck_cards_by_ownership on Drake Expectations (example Mind Stone, printing cb3d470d-e0f0-44c2-97f7-f31c02cdfbd3)". Find the real cause through the actual connector code. Also add the rarity of each copy's printing to search_collection and list_deck_cards_by_ownership (field `rarity`, batched, read-only, no Pauper field). Tests that fail before and pass after. Do not push.

## Summary for the owner
The deck tool was already working: run against your real Drake Expectations deck, it gives every one of its 100 cards a rarity, and Mind Stone shows as common. Claude most likely checked before the new version went live. The update finished going live at 11:24 am NZ time on 21 November, and the change had only been pushed shortly before that. The collection search and the proxy / not-owned list had no rarity at all, so they now show the rarity of each copy (or each deck slot's printing). Claude can see them once this change is pushed.

## Changed files
- src/lib/connector/tools/card-printing-facts.ts — option to read rarity without the Pauper read; `rarityField` helper (rarity only)
- src/lib/connector/tools/search-collection.ts — each listed copy gets `rarity` of its printing (one batched read per page)
- src/lib/connector/tools/list-deck-cards-by-ownership.ts — each row gets `rarity` of the slot's printing (proxy copy's printing, else the printing the slot asks for), batched
- src/lib/connector/tools/index.ts — tool descriptions tell Claude about `rarity` and `rarity_unavailable`
- src/lib/connector/__tests__/view-db.ts — test helper can answer card library printing reads
- src/lib/connector/__tests__/rarity-in-tools.test.ts — new tests

## Investigation
- I ran get_deck's code on the live Drake Expectations deck with a read-only service key (no writes). All 100 cards came back with a rarity and 0 were marked unavailable. Mind Stone `cb3d470d-…` came back as `rarity: "common", pauperLegal: true`. [Confirmed: src/lib/connector/tools/get-deck.ts]
- The connector reads with the owner's own sign-in, as the `authenticated` role. On the live database, `ref_printings` has a SELECT policy for `authenticated` (`using true`) and a column grant on `rarity`. As `authenticated`, all 120,272 rows can be read, Mind Stone included. The Tags Claude already sees are read from the same table with the same kind of query, which also shows these reads work. [Confirmed: live pg_policies / information_schema]
- get_deck builds its answer in a single place. The size limit drops whole cards and never single fields, so nothing removes `rarity`. [Confirmed: src/lib/connector/limits.ts]
- On GitHub, Vercel's Production deployment of c8011d5 (which contains 48dac11) was marked successful at 2026-11-20 22:24 UTC. The deployment before it was b69ef65, at 03:35 UTC, and it does not contain the rarity change. Claude's report that search_collection and list_deck_cards_by_ownership have no rarity was correct: they never had it.
- One weakness, which is not the cause: anonymous (signed-out) reads of `ref_printings` return nothing, and in that case get_deck leaves rarity out without saying so. The connector never reads anonymously, so this does not affect Claude.

## New decisions made (need owner confirmation)
- In the proxy / not-owned list, a proxy shows the rarity of the proxy copy's printing. A card that isn't owned shows the rarity of the printing the deck slot asks for.

## Assumptions
- A rarity read that fails is marked `rarity_unavailable` on each copy or row, and the rest of the answer still comes back. This matches get_deck.

## Challenges to locked decisions
- none

## Open questions
- After the push, ask Claude to run get_deck on Drake Expectations again. If rarity is still missing, the next thing to check is whether Claude's connection is reaching the latest deployment.

## Verification
- Live read-only run of get_deck's code on Drake Expectations: 100/100 cards with rarity, and Mind Stone is `common` (the temporary script was deleted afterwards)
- npx vitest run rarity-in-tools.test.ts: 5 passed. With the tool changes removed, 4 fail (the search and ownership ones). The get_deck test passes before and after, because get_deck had no fault.
- npm test: 4543 passed, 3 failed. The failures are ImportIntentFlow, CardDetails "Why reopened" and upgrade-engine bracket. They fail on and off, and also fail with my changes removed. None of them touch the connector.
- npx tsc --noEmit: only the 4 known AddToPicklist.test.tsx errors (8 lines)
- npx eslint src/lib/connector: clean
