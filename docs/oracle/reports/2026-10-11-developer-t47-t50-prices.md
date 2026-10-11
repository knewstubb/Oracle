# Report: t47-t50-prices (T-47 Card Kingdom removal + T-50 collection value / Refresh Prices)
Role: Developer
Status: DONE
Task as received:
> Task: T-47 + T-50 (audit Batches 5 and 4; the audit items PR1, PR2, PR3 and the Card Kingdom remnants). Files you own: src/app/api/collection/prices/refresh/route.ts, src/app/api/collection/refresh-prices/route.ts, src/app/api/collection/value/route.ts, src/components/collection/CollectionValueBanner.tsx, src/components/collection/PriceStaleIndicator.tsx, src/lib/brew-v2-types.ts, src/app/api/brew/skeleton/route.ts, src/components/brew-v2/CardTooltip.tsx, src/lib/archidekt-client.ts (remove ONLY the dead Card Kingdom parts: ArchidektPrices ck/ckfoil, ckNormalId/ckFoilId, fetchCardKingdomPrices), plus tests. Required behaviour: (a) D-040: remove the Card Kingdom feed completely (route, button wiring, price_ck field, tooltip line, dead helpers); (b) D-042: the Refresh Prices button really refreshes prices from Scryfall into the same price field the app shows, never overwriting a normal price with a foil price, rejecting non-positive or missing prices rather than storing 0, and reporting truthfully how many prices were updated and how many failed (never success when updates failed); no real Scryfall call in tests; (c) owner decision on unknown prices: the collection value total still counts unknown prices as 0, but the banner shows the total plus the number of cards with no price, for example '$412.00 (20 cards have no price yet)', and only shows plain '$0.00' when every owned card truly has a known price of 0 or the collection is empty; each individual unpriced card shows an em dash. Label prices as Scryfall estimates where the value is shown. Keep the look unchanged otherwise.

## Summary for the owner

The old Card Kingdom prices are gone, including the half-broken "refresh" behind the pricing warning. The Refresh Prices button now genuinely re-fetches prices from Scryfall and tells you the truth — including when some cards could not be priced — and the collection value now says, for example, "$412.00 (20 cards have no price yet)" instead of pretending missing prices are worth nothing, with the value labelled as a Scryfall estimate. Nothing needs your decision; one small wording choice is noted under Open questions.

## Changed files

- `src/app/api/collection/prices/refresh/route.ts` — deleted: the live Card Kingdom pricelist fetch (D-040).
- `src/app/api/collection/refresh-prices/route.ts` — rewritten: refreshes Scryfall USD prices for owned printings into `ref_printings` (`price_usd`, `price_usd_foil`), rejects non-positive/missing prices, never writes foil into the normal column, reports `updated`/`failed`/`total` and `success` only when nothing failed (D-042).
- `src/app/api/collection/value/route.ts` — adds `unpricedCardCount`, keeps unknown prices at 0 in the total, and returns `null` (em dash) instead of $0.00 for unpriced top cards (PR3, owner decision).
- `src/components/collection/CollectionValueBanner.tsx` — shows the total plus "(N cards have no price yet)", labels the value "Scryfall estimate", and reports refresh results truthfully.
- `src/components/collection/PriceStaleIndicator.tsx` — repointed from the deleted Card Kingdom route to the real Scryfall refresh, with truthful success/failure wording.
- `src/lib/brew-v2-types.ts` — removed the vestigial `price_ck` field from `DeckCard` (D-040).
- `src/app/api/brew/skeleton/route.ts` — removed the `price_ck` pass-through.
- `src/components/brew-v2/CardTooltip.tsx` — removed the Card Kingdom price line and now-unused `formatPrice` import (D-040).
- `src/lib/archidekt-client.ts` — removed only the dead Card Kingdom parts: `ArchidektPrices.ck`/`ckfoil`, `ArchidektCard.ckNormalId`/`ckFoilId`, and `fetchCardKingdomPrices`.
- `src/app/api/collection/refresh-prices/route.test.ts` — new: pure price parsing + handler (validation, foil separation, truthful counts, no real network).
- `src/app/api/collection/value/route.test.ts` — new: unknown-price counting, null top-card prices, proxy skipping, stored-0 treated as unknown.
- `src/components/collection/CollectionValueBanner.test.tsx` — new: total + "(N cards have no price yet)", estimate label, singular wording, em dash, hidden when empty.
- `src/components/collection/PriceStaleIndicator.test.tsx` — added: hits the new route, reports partial failure, never claims success on request failure.
- `src/components/brew-v2/CardTooltip.test.tsx` — updated: removed `price_ck` fixture/tests, added a "never shows a Card Kingdom price" test.

## New decisions made (need owner confirmation)

- None. Implemented the owner decisions already recorded as D-040 and D-042 and the owner decision on unknown prices.

## Assumptions

- "The same price field the app shows" means `ref_printings.price_usd` (normal) and `ref_printings.price_usd_foil` (foil), which is what the collection value and list read. The refresh targets the printings the user owns via `user_copies.printing_id`.
- A stored `price_usd` of exactly `0` is treated as "unknown", not as a real $0.00. The new refresh never writes 0, and the audit found Card Kingdom previously stored missing prices as 0; treating legacy 0s as unknown is the honest reading. Consequence: the "known price of 0" case only shows plain `$0.00` when no card is unknown.
- The value banner stays hidden for an empty collection (existing behaviour). The owner wording "only shows plain $0.00 when ... the collection is empty" is read as "a plain figure is only truthful in that case", not as a requirement to add a banner to an empty page; keeping the look unchanged otherwise.
- No migration was written: the refresh only writes to existing `ref_printings` columns; no schema change was needed.

## Challenges to locked decisions

- None.

## Open questions

- The separate daily cron route `src/app/api/cron/refresh-prices/route.ts` (out of my owned files) is named "refresh-prices" but still refreshes card text, not prices. Should a later task make it refresh Scryfall prices too, or rename it? Left untouched per file ownership.
- Remnants outside my files: `scripts/transform-data.ts` and `scripts/export-sqlite.ts` still mention Card Kingdom, and `.kiro/specs/brew-mode-v2/requirements.md` still lists `price_ck`. They are not app code; a hygiene task could sweep them.
- PR7 (a card with no price shows blank vs "—" in one compact list view) lives in `CardGroupSection.tsx`, which is not in this batch; the collection list's shared `formatPrice` already returns "—" for null.

## Verification

- `NODE_DISABLE_COMPILE_CACHE=1 npm run check` — EXIT 0: 133 test files passed / 4 skipped; 1550 tests passed / 40 skipped; `tsc --noEmit` clean (0 type errors); ESLint 0 errors, 262 pre-existing warnings.
- New/updated focused run: `npx vitest --run` on the five touched test files — 5 files, 50 tests passed.
- One full-suite run failed a single collection-page search-debounce test under parallel load; it passes in isolation and on immediate re-runs (pre-existing fake-timer flake, unrelated to these files). Report: `[Approximate]`.
- No real Scryfall/Card Kingdom call and no database write was made. Tests mock `fetch`, `requireAuth` and Supabase.
- No migration applied; no destructive database operation performed.

### Illustrative endpoint shapes (from the mocked route tests, not live calls)

- `POST /api/collection/refresh-prices`, all prices valid: `{ "success": true, "updated": 2, "failed": 0, "total": 2, "errors": 0 }`.
- `POST /api/collection/refresh-prices`, some unpriceable: `{ "success": false, "updated": 8, "failed": 2, "total": 10, "errors": 1 }`.
- `GET /api/collection/value`, two owned cards, one priced: `{"totalMarketValue":5,"cardCount":2,"unpricedCardCount":1,"topCards":[{"cardName":"Sol Ring","copies":1,"pricePerCopy":5,"totalValue":5},{"cardName":"Mana Crypt","copies":1,"pricePerCopy":null,"totalValue":null}]}`.
