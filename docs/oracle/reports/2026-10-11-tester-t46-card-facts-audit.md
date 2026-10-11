# Report: T-46 card-facts audit
Role: Tester
Status: DONE
Task as received:

> Task T-46, READ-ONLY audit of main (change no source file, no migration, no data; do not call real APIs or write to the database; do not run scripts/): (1) Printing: find every place a card's printing (scryfall_id vs oracle_id) is chosen, stored or displayed; list where the wrong printing could show, where a proxy picks the first printing instead of the printing the deck slot asks for (D-038), and where the two IDs are mixed up (D-003). (2) Finish: where nonfoil/foil/etched is stored, passed or dropped (import routes, copies, deck cards, UI); list where it is lost or defaulted (D-004). (3) Prices: every place a price is read, stored, fetched or shown (including src/app/api/collection/prices/refresh/route.ts, archidekt-client, the advisor buy price); list where an unknown or missing price shows as 0 or as a fact instead of an estimate with a label (D-030, D-035), and exactly what remains of the Card Kingdom feed. (4) Where a failed lookup could show as Unowned (D-030) on card-fact screens. (5) Evidence: for each finding give file and line, what the user would see wrong, which phase owns it if not Phase 2 (Phase 3 words/badges, 4 collection, 5 import, 6 deck lists, 7 allocation), and a proposed fix. Group findings into proposed fix batches that share no files, ordered by user impact, with a small/medium/large size each. Mark each finding Confirmed (you read the code path) or Approximate. Do not guess. Report to docs/oracle/reports/2026-10-11-tester-t46-card-facts-audit.md in the AGENTS.md report format, with the 'Summary for the owner' in plain everyday words (no code). Stop when done.

## Summary for the owner

This was a read-only check of every place the app shows a card's printing, finish and price. It found real problems: printing a proxy ignores the printing the deck asked for, the collection's "Refresh Prices" button does not actually change prices, and a failed lookup can make cards look Unowned or a collection look worth $0.00. Nothing was changed; the developers have a prioritised fix list, and a few of the fixes need your decision first (below).

## Owner decisions needed

1. **Card Kingdom prices.** The app still fetches Card Kingdom prices and writes them into the same field the app shows as the card's value, and the refresh screen is half-removed. D-035 already says use Scryfall prices labelled as estimates and defer Card Kingdom. Recommended: remove the Card Kingdom refresh path entirely and label all shown prices as Scryfall estimates. What you'd see: the "Refresh" action stops pretending to update prices; prices on screen are labelled as estimates. Trade-off: no retail-vs-market comparison until Card Kingdom returns.
2. **Unknown prices.** Recommended: show "—" (as the collection list already does) wherever a price is unknown, and never show an unknown price as $0.00 or count it into a total. What you'd see: a collection with no price data shows "—" for value rather than "$0.00". Trade-off: totals look partial until prices load, which is more honest.
3. **"Refresh Prices" button.** Today it fetches card text (mana cost, type) and reports "Updated prices". Recommended: rename it to what it does, or make it actually refresh Scryfall prices. What you'd see: the button tells you the truth. Trade-off: you lose the impression prices updated.

## Scope and method

- Read-only. No source file, migration, test or data was changed. No API was called and no database write was made. No build/test command was run (T-46 forbids it; the project Tester checks apply to changed areas and nothing changed).
- Worktree HEAD is `fe374ac`; local `main` is `ab73750`. The only difference between them is one line in `docs/oracle/status.md` (T-46 marked started). The application code audited is identical to main `[Confirmed: git diff --stat HEAD main]`.
- "Confirmed" below means I opened the code path and read it. "Approximate" means a search surfaced it and the surrounding context is consistent, but I did not open every line.

---

## Area 1 — Printing (D-003, D-021, D-038)

**P1 — Proxy action records the newest printing, not the deck slot's requested printing. (D-038) — Confirmed**
- Evidence:
  - `src/app/api/allocation/add-proxy/route.ts:11-16` documents `printing_id = defaulted from oracle_to_printings (first available)` and `finish = 'nonfoil'`; the route only sends `p_target_deck_card_id`, `p_card_id`, `user_id`, `p_source` (lines 50-55). It never sends the slot's `deck_cards.scryfall_id`.
  - The RPC chooses the newest printing: `supabase/migrations/20260925220000_placement_source.sql:584-589` — `ORDER BY rp.released_at DESC NULLS LAST, rp.scryfall_id LIMIT 1`.
  - Bulk proxy does the same by card name: `supabase/migrations/20260925220000_placement_source.sql:840-845`.
- What the user sees wrong: a deck slot that asks for Borderless Sol Ring gets a proxy recorded as the newest regular Sol Ring instead. D-038 says the proxy must record the printing the slot asked for. The Phase 2 exit test explicitly requires "Proxy records the requested printing".
- Phase: Phase 2.
- Proposed fix: pass the slot's requested `scryfall_id` (set/collector) into `add_proxy_to_slot` / `add_proxies_to_slots` and use it when present; fall back to the oracle default only when the slot has none. Add a regression test with a borderless/alternate printing.
- Related (Confirmed): `src/app/api/collection/instances/add-proxy/route.ts:47-57` creates a collection proxy with `finish: 'nonfoil'` and **no `printing_id` at all** — the proxy has no printing. Phase 2.

**P2 — Moxfield deck import stores a printing id in the canonical-card field. (D-003) — Confirmed**
- Evidence: `src/lib/deck-normalizer.ts:188-201` — "use oracle_id if present, fall back to scryfall_id", `oracleId = card.scryfall_id`. Live: `src/lib/warm-start-resolve-moxfield.ts:130` and `src/app/api/decks/import/preview/route.ts:73` both call `normalizeMoxfieldDeck`. `MoxfieldCardData.oracle_id` is optional (`src/lib/moxfield-client.ts:12`).
- What the user sees wrong: a Moxfield card with no oracle id is filed under a printing id as its "canonical card", so it will not merge with the same card owned from another source. Ownership counts and "do I own this?" can be wrong and it is invisible.
- Phase: Phase 5 (import).
- Proposed fix: never use `scryfall_id` as `oracle_id`; resolve the canonical id from `ref_printings` by printing id, or skip/unmatched with an explicit conflict. Unit-test the fallback path.

**P3 — Archidekt collection import invents/borrows card identity. (D-003) — Confirmed**
- Evidence: `src/lib/warm-start-import.ts:101-103` calls `oracleCard.uid` a "proxy oracle_id", and `:150-154` writes `oracleCard.uid` or the synthetic `archidekt-<id>` into `user_cards.oracle_id`. Same at `src/app/api/onboarding/collection-stream/route.ts:206`.
- What the user sees wrong: cards imported this way can carry a `user_cards.oracle_id` that does not match the real Scryfall canonical id other features use, so cross-feature lookups (prices, tags, other imports) can miss them. The `archidekt-…` fallback is not a real card id.
- Phase: Phase 5 (import).
- Proposed fix: resolve the true oracle id via Scryfall / `ref_printings.oracle_id` at import; never store a printing id or a synthetic string as `oracle_id`.

**P4 — Collection tile uses `oracle_id` as a printing id for card art. (D-003) — Confirmed**
- Evidence: `src/components/collection/CollectionGridView.tsx:178-180` — `const artId = row.printingSubgroups?.[0]?.scryfallPrintingId ?? row.oracleId`, passed to `CardImage scryfallId={artId}` at lines 204-206. The image helper builds a CDN URL from a printing id (`src/lib/scryfall-image.ts`).
- What the user sees wrong: a broken/wrong card image for any card that has no printing subgroup, because an oracle id is used where a printing id is required.
- Phase: Phase 4 (collection).
- Proposed fix: if there is no printing id, show the existing placeholder rather than the oracle id.

**P5 — Hover previews and some detail art use a default printing unrelated to the deck/owned printing. — Confirmed**
- Evidence: `src/components/CardHoverPreview.tsx:335,416` call `/api/cards?name=…&action=scryfall_id`; that action resolves the most recent non-excluded printing by name (`src/lib/card-data.ts:138-212`, exclusion list at 143, `findStandardPrinting` at 148-151). `src/lib/render-card-links.tsx` returns the same default `scryfallId` (Approximate).
- What the user sees wrong: hovering a card in a deck can show different art/printing from the physical card the deck asks for (e.g. a regular Sol Ring when the slot is borderless).
- Phase: Phase 2 (card facts) / Phase 3 (hover language).
- Proposed fix: when a printing is known (deck slot or copy), pass that printing id to the hover preview instead of resolving by name.

**P6 — Manually adding a card picks an arbitrary default printing. — Confirmed**
- Evidence: `src/app/api/decks/[id]/cards/route.ts:64-76` stores whatever Scryfall `/cards/named?exact=` returns as `deck_cards.scryfall_id`; `src/app/api/decks/[id]/cards/batch/route.ts:116-122,147` stores the newest `ref_printings.scryfall_id` by name.
- What the user sees wrong: the deck "asks for" a printing the user never chose. This is the root of the P1 proxy mismatch: the requested printing is arbitrary to start with.
- Phase: Phase 6 (deck lists) / Phase 2.
- Proposed fix: prefer an owned printing (or let the user pick), and only default by name when nothing better exists; expose the chosen printing so the user can see it.

**P7 — New-deck / Brew Canvas use name slugs in a field called `scryfallId`. — Approximate**
- Evidence: `src/app/new-deck/page.tsx:584,597,954` and `src/components/brew-v2/BrewChatView.tsx:223,241` build `scryfallId` from a lowercased name. Currently used only as React keys/position ids (`BrewCanvas.tsx`).
- What the user sees wrong: nothing today, but any future image/printing use of that field would break. Naming hazard.
- Phase: Phase 9 (Brew Canvas) truth-in-naming.
- Proposed fix: rename the field (e.g. `canvasKey`).

---

## Area 2 — Finish (D-004)

**F1 — Archidekt collection import cannot represent "etched" and collapses finish to a boolean. (D-004) — Confirmed**
- Evidence: `src/lib/archidekt-client.ts:203-209` — the collection entry has only `foil: boolean`. `src/lib/warm-start-import.ts:200` and `src/app/api/onboarding/collection-stream/route.ts:254` both do `entry.foil ? 'foil' : 'nonfoil'`.
- What the user sees wrong: an etched Archidekt card is recorded as normal (or foil), so the owner's foil/etched counts and any foil pricing are wrong from import onward.
- Phase: Phase 5 (import).
- Proposed fix: capture a finish string (nonfoil/foil/etched) from Archidekt where available and map it through `mapFinishToFinishString`; otherwise record foil vs nonfoil but never silently invent etched.

**F2 — Deck import drops finish entirely, and `deck_cards` has no requested-finish field. (D-004) — Confirmed**
- Evidence: `src/lib/deck-normalizer.ts:15-28` `NormalizedCard` has no finish field; `:106-129` Archidekt normalizer never sets one; `:181-224` Moxfield normalizer ignores `entry.finish` even though `src/lib/moxfield-client.ts:18-26` captured it. `src/types/supabase.ts` `deck_cards` block has no `finish`/`foil` column (grep: zero finish fields in `deck_cards`).
- What the user sees wrong: a deck slot can never remember or show a requested finish, so foil/etched deck requests are lost. (This also blocks honest D-038 proxy finish.)
- Phase: Phase 5 (import) / Phase 6 (deck lists).
- Proposed fix: decide with the owner whether deck slots need a requested finish; if yes, add it to `deck_cards` and carry it from Moxfield/CSV. If not, say so explicitly so proxy/finish behaviour is defined.

**F3 — Collection list collapses finish to a boolean and labels etched as "Foil". (D-004) — Confirmed**
- Evidence: `src/app/api/collection/rollup/route.ts:307-316` maps `finish` to `isFoil = finish === 'foil' || finish === 'etched'` and drops the real finish string; `src/components/collection/PrintingListView.tsx:447-450` renders `row.isFoil ? 'Foil' : ''` (nonfoil blank, etched shown as "Foil"); `src/components/collection/CollectionGridView.tsx:104-113` shows a "Foil" badge by the same collapsed flag; `src/app/api/collection/route.ts:44` collapses too.
- What the user sees wrong: an etched card is labelled "Foil", a normal card shows nothing, and the actual finish is not shown anywhere in these views.
- Phase: Phase 4 (collection).
- Proposed fix: carry the `finish` string end-to-end and display Nonfoil/Foil/Etched from it.

**F4 — Assigned and claimed copies in the status popover always show nonfoil. (D-004) — Confirmed**
- Evidence: `src/components/StatusChipPopover.tsx:331` (`isFoil={false}` for the assigned copy) and `:432` (`isFoil={false}` for claimed holders). Available copies do use `copy.isFoil` (line 394).
- What the user sees wrong: a foil card assigned to a deck is shown as if normal in the chip; a claimed foil is shown as normal.
- Phase: Phase 7 (allocation) / Phase 2.
- Proposed fix: pass the real finish/`isFoil` for assigned and claimed copies (data already flows from `card-actions`), and render etched distinctly.

**F5 — Advisor's collection lookup always says every owned card is non-foil. (D-004) — Confirmed**
- Evidence: `src/lib/card-repository.ts:167-200` selects only `id, card_id` and hardcodes `foil: false` (line 199), consumed at `src/lib/tool-registry.ts:977` (`foil: owned.foil`).
- What the user sees wrong: the advisor believes none of the owned cards are foil, so any foil-based reasoning is wrong.
- Phase: Phase 8 (AI advisor).
- Proposed fix: select `finish` in the copies query and return the real value.

**F6 — v1 import engine turns etched into foil. (D-004) — Confirmed code path, but engine appears unused. — Approximate impact**
- Evidence: `src/lib/identity-resolver.ts:137-152` `mapFinishToFoil` collapses any non-normal value (including etched) to `true`; `src/lib/import-engine.ts:338` writes `row.isFoil ? 'foil' : 'nonfoil'`. No route imports `import-engine.ts` (only a comment at `import-engine.ts:379` references it); the live routes use `import-engine-v2`.
- What the user sees wrong: only if this path is re-wired — etched becomes foil.
- Phase: Phase 5 (import hygiene).
- Proposed fix: delete or fix the v1 path; add an etched regression test.

---

## Area 3 — Prices (D-030, D-035)

**PR1 — The collection "Refresh Prices" button updates card text, not prices, and reports "Updated prices". — Confirmed**
- Evidence: `src/app/api/collection/refresh-prices/route.ts:1-9,68-102` fetches Scryfall card metadata (`mana_cost`, `cmc`, `type_line`) and upserts `ref_cards`; there is no price read or write anywhere in the route. `src/components/collection/CollectionValueBanner.tsx:32-48` calls it and shows `Updated prices for N cards` (41), and the button title says "Refresh market prices from Scryfall" (112), while the displayed value comes from `/api/collection/value`.
- What the user sees wrong: clicking Refresh Prices looks successful but the card prices do not change.
- Phase: Phase 2 / Phase 4.
- Proposed fix: either make the button refresh real Scryfall prices into `ref_printings`, or rename it to "Refresh card details" and give the price refresh a truthful control (see PR2).

**PR2 — The Card Kingdom feed writes retail prices into `price_usd`, ignores foil, and does not validate price. (D-035) — Confirmed**
- Evidence: `src/app/api/collection/prices/refresh/route.ts:25` still calls `https://api.cardkingdom.com/api/pricelist`; `:96-108` accepts any product with a `scryfall_id` and takes `price_retail` with no `> 0` check; `:133-140` updates `ref_printings.price_usd` per row (ignoring `is_foil`, so CK foil price can overwrite the normal price); update errors are swallowed (`if (!updateErr) totalUpdated++`, line 139) and the response reports `success: true`. The header (4-5) still describes the dropped `card_kingdom_prices` table and a comment at 122-124 contradicts the code below it. The route is live: `src/components/collection/PriceStaleIndicator.tsx:32`.
- What the user sees wrong: prices that Oracle labels (or the advisor treats) as Scryfall estimates can actually be Card Kingdom retail values; a CK `0`/missing price can be stored as a real `0`; foil prices overwrite normal prices.
- Phase: Phase 2 (honest prices) / Phase 3 (labelling).
- Proposed fix: per owner decision, remove/repoint this route to Scryfall estimates and label them; reject non-positive prices; never write foil into the normal column.

**Exactly what remains of the Card Kingdom feed — Confirmed**
- Live: `src/app/api/collection/prices/refresh/route.ts` (whole route) called from `src/components/collection/PriceStaleIndicator.tsx:32`.
- Dead in app: `src/lib/archidekt-client.ts:113-130` (`ArchidektPrices`, `ck`/`ckfoil`), `:141-142` (`ckNormalId`/`ckFoilId`), `:369-398` (`fetchCardKingdomPrices` — defined but no caller found).
- Brew UI: `src/lib/brew-v2-types.ts:136` (`price_ck`), `src/app/api/brew/skeleton/route.ts:491` passes it through, `src/components/brew-v2/CardTooltip.tsx:118-120` displays it. Nothing sets `price_ck`, so it is effectively vestigial.
- Database: the `card_kingdom_prices` table was dropped (`supabase/migrations/20260730070439_drop_legacy_tables.sql:2`); old definitions remain only under `supabase/reconciliation/pre-ledger/`.
- Docs/scripts: references in `docs/` and `.kiro/specs/`, `scripts/transform-data.ts:81`, `scripts/export-sqlite.ts:32` (scripts are out of scope for this read-only task but are remnants to clean).

**PR3 — Unknown prices are summed as $0 and shown as "$0.00" collection value. (D-030, D-035) — Confirmed**
- Evidence: `src/app/api/collection/value/route.ts:65` only keeps truthy prices, `:81-82` (`priceMap.get(...) ?? 0`) adds 0 for unknown, and `:110-111` returns a numeric total; `src/components/collection/CollectionValueBanner.tsx:53-60` defaults missing totals to 0 and only hides the banner when value **and** card count are both 0, then renders `$0.00` (line 72).
- What the user sees wrong: an owner with cards but no known prices sees "Collection Value $0.00" as a fact.
- Phase: Phase 4 (collection) / Phase 3 (labels).
- Proposed fix: distinguish "no price data" from zero; show "—" (the list already has `formatPrice` returning "—" for null, `src/lib/collection-printing-utils.ts:86-94`), and do not include unknown cards in the total (or show "partial").

**PR4 — Unknown price counts as $0 for budget/cheap filtering. (D-030) — Confirmed**
- Evidence: `src/lib/upgrade-candidates.ts:107` `(c.add.price ?? 0) < 5` lets a card with no price pass "under $5"; `:75` sorts missing price as 999. `src/app/api/ai/brew/generate/route.ts:221` `priceMap.get(card.cardName) ?? 0` lets unpriced cards pass a budget ceiling; `:231` and `:286` also use `?? 0`.
- What the user sees wrong: cards with no known price are recommended as cheap / kept inside a budget as if free.
- Phase: Phase 8 (advisor) / Phase 9 (upgrades).
- Proposed fix: treat unknown price as "unknown" (exclude from budget pass, label it, or sort separately), never as 0.

**PR5 — Advisor deck total is an unlabelled number and unknown contributes 0; a real 0 is turned into null. (D-035) — Confirmed**
- Evidence: `src/lib/tool-registry.ts:1082` describes prices with no "estimate" wording; `:1219-1220` `priceInfo?.price_usd || null` (a stored 0 becomes null); `:1224` `totalValue += (priceUsd || 0) * qty`; `:1245` returns `total_value_usd` as a plain number.
- What the user sees wrong: the advisor presents deck value as a fact, not "estimate", and unpriced cards count as $0.
- Phase: Phase 8 (advisor).
- Proposed fix: label the value as a Scryfall estimate (D-035) and exclude/label unknown prices instead of adding 0.

**PR6 — Etched is priced using the foil or normal price column. (D-004, D-035) — Confirmed**
- Evidence: `src/lib/collection-printing-utils.ts:151` groups copies by `isFoil` boolean, and `:218-225` `lookupPrice` keys only `:normal` / `:foil`; `src/app/api/collection/instances/[oracleId]/route.ts:182-183` keeps `finish` but sets the deprecated `isFoil` to foil-or-etched.
- What the user sees wrong: an etched card can be valued at the foil price or the normal price, whichever the boolean implies.
- Phase: Phase 4 (collection).
- Proposed fix: key price lookup by the real finish, or explicitly decide that etched uses the foil price and label it.

**PR7 — Failed/absent price in the collection list shows blank vs "—". — Confirmed (minor)**
- Evidence: `src/components/CardGroupSection.tsx:405,409` (Approximate lines) render blank when `price_usd` is null in the compact view and "—" otherwise; `formatPrice` returns "—" only for exactly `null`.
- What the user sees wrong: inconsistent placeholders. Phase 3 (shared words).
- Proposed fix: use one shared "price unknown" treatment everywhere.

---

## Area 4 — Failed lookups shown as Unowned (D-030)

**U1 — A failed candidate lookup renders every unresolved pick-list card as Unowned. — Confirmed**
- Evidence: `src/app/api/decks/[id]/picklist/route.ts:113-120` catches a candidate-fetch failure and falls back to an empty map; `:137-139` gives each unresolved card `candidates: []`. `src/components/PicklistV2.tsx:71-80` treats `candidates.length === 0` (or tier 5) as the **Unowned** column, and the progress bar counts it.
- What the user sees wrong: if the copy lookup fails, the pick list declares cards Unowned and paints the unowned bar — D-030 forbids translating a failed lookup into Unowned.
- Phase: Phase 7 (pick list is a primary assembly screen) / Phase 3.
- Proposed fix: return an explicit error/unknown state from the route and render an error panel (the reconcile screen already does this, `src/app/reconcile/page.tsx:61-67`), not the Unowned column.

**U2 — Core status computation returns every card "unowned" on a query error. — Confirmed**
- Evidence: `src/lib/card-status.ts:97-100` seeds every name `'unowned'`; `:117-120` returns that map on a `user_cards` error; `:154-157` returns it on a `user_copies` error; `:218` leaves anything unresolved as `'unowned'`. Only `console.error`, no error contract.
- What the user sees wrong: a transient database error turns owned cards into Unowned on deck cards, and cascades. Consumers include `src/app/api/decks/[id]/card-statuses`, `src/app/api/cards/builder-status/route.ts:53` (`?? 'unowned'`, Approximate), and the deck list completeness count (`src/app/api/decks/route.ts` treating unknown as unowned, Approximate) which paints deck tiles red (`src/components/DeckTile.tsx:91`, Approximate).
- Phase: Phase 3 (D-030) / Phase 2.
- Proposed fix: make the function fail loudly on error (throw) or return an explicit `unknown` state, and have screens show an error/retry instead of Unowned.
- Mirror hazard (Confirmed): `src/components/CardsTab.tsx:227` `statusMap.get(card.id) ?? 'available'` shows a missing status as definitively Available — the same class of error in the opposite direction.

**U3 — Ownership-batch (hover/chat) returns "unowned" on a query error. — Confirmed**
- Evidence: `src/app/api/collection/ownership-batch/route.ts:46` `user_cards` query has no error check; `:103-111` swallows the `user_copies` error; the response builder returns `status: 'unowned'` for any name not found (Approximate exact lines 194-203/225).
- What the user sees wrong: after a failed lookup, hover/chat reports owned cards as unowned. Phase 3 / Phase 8.
- Proposed fix: surface the error (as the AI tools already do with `is_error`, `src/lib/tool-registry.ts:108-114`).

**U4 — Commander search ownership failure lists every commander as Unowned. — Confirmed**
- Evidence: `src/app/api/commanders/search/route.ts:415-425` `user_cards` query has no error check; `:431-432` the "unowned" filter keeps everything when `ownedNames` is empty; `:481` `owned: false`. Rendered as "Unowned" in `src/components/CommanderCard.tsx` (Approximate lines 211-215, 263-267).
- What the user sees wrong: the commander browser's Unowned filter shows every commander after a failed lookup. Phase 3 / Phase 6.
- Proposed fix: error-check the query and fail the request or mark ownership unknown.

**U5 — Card detail, card search and owned-printings report not-owned/empty on failure. — Confirmed**
- Evidence: `src/app/api/cards/route.ts:103-120` (no error checks) → `owned: false, quantity: 0` at 150-151; `src/app/api/cards/search/route.ts:164-171` (no error check) → `owned: false` at 192/213; `src/app/api/cards/owned-printings/route.ts:32-40` returns empty on a failed/absent card query and `:46` copies query has no error check.
- What the user sees wrong: cards the owner has show as not owned, and "printings you own" comes back empty. Phase 3 / Phase 4.
- Proposed fix: error-check and surface failure; do not render a definitive ownership answer.

**U6 — AI brew marks every card `not_owned` on collection failure. — Approximate**
- Evidence: `src/app/api/ai/brew/generate/route.ts:509-528` swallow collection error → empty map → cards set `not_owned` (536-547). Other AI routes report `owned: false` on failed ownership queries (`ai/search`, `ai/build-deck`, `ai/recommend`, `ai/mana-analysis`).
- What the user sees wrong: the advisor can think the owner owns nothing. Phase 8.
- Proposed fix: distinguish lookup failure from genuinely not owned.

**Good examples to copy (no failure→Unowned):** `src/lib/reconcile-overuse.ts:108-121` throws, `src/app/reconcile/page.tsx:52-74` shows skeleton/error/empty distinctly, `src/components/reconciliation/ReconciliationSummary.tsx:339-345` error vs empty, and the AI tools flag `is_error`. These show the pattern the failing paths above should adopt.

---

## Proposed fix batches (disjoint files, ordered by user impact)

Each batch touches a distinct set of files, so they can be worked in parallel without conflicts.

### Batch 1 — Proxy records the requested printing (D-038). Size: **medium**. [P1]
- `src/app/api/allocation/add-proxy/route.ts`
- `src/app/api/decks/[id]/cards/bulk/route.ts` (Approximate — passes only `card_name`, `:203-270`)
- new forward migration changing `add_proxy_to_slot` / `add_proxies_to_slots` to use the slot's `deck_cards.scryfall_id` when present, plus a regression test.
- Phase 2. Owner decision not strictly required, but confirm finish handling if F2 adds a slot finish.

### Batch 2 — Deck/pick-list status failures never read as Unowned (or Available). Size: **medium**. [U1, U2, mirror]
- `src/lib/card-status.ts`
- `src/app/api/decks/route.ts`
- `src/app/api/cards/builder-status/route.ts`
- `src/app/api/decks/[id]/picklist/route.ts`
- `src/components/PicklistV2.tsx`
- `src/components/CardsTab.tsx`
- Phase 3 / Phase 7.

### Batch 3 — Other ownership lookups stop guessing. Size: **small**. [U3, U4, U5]
- `src/app/api/collection/ownership-batch/route.ts`
- `src/app/api/commanders/search/route.ts`
- `src/app/api/cards/route.ts`
- `src/app/api/cards/search/route.ts`
- `src/app/api/cards/owned-printings/route.ts`
- Phase 3 / Phase 4 / Phase 6.

### Batch 4 — Collection value and the Refresh Prices button tell the truth. Size: **small**. [PR1, PR3]
- `src/app/api/collection/value/route.ts`
- `src/app/api/collection/refresh-prices/route.ts`
- `src/components/collection/CollectionValueBanner.tsx`
- Phase 2 / Phase 4. Needs owner decision 3.

### Batch 5 — Remove/neutralise the Card Kingdom feed. Size: **small**. [PR2]
- `src/app/api/collection/prices/refresh/route.ts`
- `src/lib/brew-v2-types.ts`
- `src/app/api/brew/skeleton/route.ts`
- `src/components/brew-v2/CardTooltip.tsx`
- Phase 2 / Phase 3. Needs owner decision 1. (The dead `fetchCardKingdomPrices`/`ArchidektPrices` in `archidekt-client.ts` is folded into Batch 6 so the file is touched once.)

### Batch 6 — Archidekt collection keeps finish and real card identity. Size: **medium**. [F1, P3 + dead CK code]
- `src/lib/archidekt-client.ts` (capture finish; remove dead Card Kingdom helpers)
- `src/lib/warm-start-import.ts`
- `src/app/api/onboarding/collection-stream/route.ts`
- Phase 5.

### Batch 7 — Moxfield deck import identity + finish. Size: **small**. [P2, F2-Moxfield]
- `src/lib/deck-normalizer.ts`
- `src/lib/moxfield-client.ts`
- Phase 5. Owner decision needed on whether deck slots store a requested finish (F2).

### Batch 8 — Collection shows finish honestly. Size: **medium**. [F3, PR6, P4]
- `src/app/api/collection/rollup/route.ts`
- `src/app/api/collection/instances/[oracleId]/route.ts`
- `src/app/api/collection/route.ts`
- `src/lib/collection-printing-utils.ts`
- `src/components/collection/PrintingListView.tsx`
- `src/components/collection/CollectionGridView.tsx`
- `src/hooks/useCollectionRollup.ts`
- `src/lib/collection-filters.ts`
- Phase 4. Includes the oracle-as-art fallback (P4) because it is the same component.

### Batch 9 — Status chip and advisor report the real finish. Size: **small**. [F4, F5]
- `src/components/StatusChipPopover.tsx`
- `src/lib/card-repository.ts`
- Phase 7 / Phase 8.

### Batch 10 — Advisor/deck prices are labelled estimates and unknown is not zero. Size: **small**. [PR4, PR5]
- `src/lib/tool-registry.ts`
- `src/app/api/ai/brew/generate/route.ts`
- `src/lib/upgrade-candidates.ts`
- Phase 8 / Phase 9.

### Batch 11 — Manual add and hover previews use a sensible printing. Size: **small**. [P6, P5]
- `src/app/api/decks/[id]/cards/route.ts`
- `src/app/api/decks/[id]/cards/batch/route.ts`
- `src/components/CardHoverPreview.tsx`
- `src/lib/card-data.ts`
- `src/lib/render-card-links.tsx`
- Phase 2 / Phase 6.

### Batch 12 — Delete/fix the dead v1 import finish collapse. Size: **small**. [F6]
- `src/lib/import-engine.ts`
- `src/lib/identity-resolver.ts`
- Phase 5 hygiene.

---

## Changed files

- `docs/oracle/reports/2026-10-11-tester-t46-card-facts-audit.md` — this report (the only file written; per the task).
- No source, migration, test or data file was changed.

## New decisions made (need owner confirmation)

- None. The three decisions in "Owner decisions needed" are proposals, not decisions taken.

## Assumptions

- The audit target is the application code shared by worktree HEAD `fe374ac` and `main` `ab73750`; they differ only in `docs/oracle/status.md`.
- "Card-fact screens" are collection, deck list/detail, pick list/allocation and reconcile, per the task.
- Where an RPC body lives in an already-applied migration, a fix needs a new forward migration (not editing applied history).
- Phase ownership follows `docs/oracle/roadmap.md`; findings on paused Phase 8/9 code are recorded but are not Phase 2 work.

## Challenges to locked decisions

- None. The audit found code that does not yet meet D-003, D-004, D-030, D-035 and D-038; it does not challenge those decisions. D-035 (Scryfall estimates, Card Kingdom deferred) is currently contradicted by the live Card Kingdom route, which supports the decision rather than challenging it.

## Open questions

1. Should Oracle keep any Card Kingdom pricing at all, or remove it entirely per D-035? (Affects Batch 5.)
2. Should deck slots store a requested finish, so a foil/etched deck request is remembered? (Affects Batches 1, 7; D-038 implies yes for printing, D-004 implies finish is independent.)
3. Should unknown prices show "—" and be excluded from totals, or be included with a "partial/estimate" label? (Affects Batches 4 and 10.)
4. For generic basics, is the hardcoded default printing art acceptable, or should the owner's own basic-land printing be preferred? (`src/lib/basic-lands.ts:26-50`, `src/components/CardsTab.tsx:1222`.)

## Verification

- `git diff --stat HEAD main` — only `docs/oracle/status.md` differs (1 line); application code identical.
- Read-only static inspection only: file reads and content searches across `src/`, `supabase/migrations/`. No API called, no database write, no test/build/script run (T-46 read-only constraint; the project Tester checks apply to changed code and nothing was changed).
- Key paths read and confirmed: `src/app/api/allocation/add-proxy/route.ts`; `src/app/api/collection/instances/add-proxy/route.ts`; `supabase/migrations/20260925220000_placement_source.sql` (`add_proxy_to_slot`, `add_proxies_to_slots`); `src/lib/deck-normalizer.ts`; `src/components/collection/CollectionGridView.tsx`; `src/lib/warm-start-import.ts`; `src/app/api/onboarding/collection-stream/route.ts`; `src/lib/archidekt-client.ts`; `src/lib/moxfield-client.ts`; `src/lib/import-engine.ts`; `src/lib/identity-resolver.ts`; `src/app/api/collection/prices/refresh/route.ts`; `src/app/api/collection/refresh-prices/route.ts`; `src/app/api/collection/value/route.ts`; `src/components/collection/CollectionValueBanner.tsx`; `src/lib/upgrade-candidates.ts`; `src/app/api/ai/brew/generate/route.ts`; `src/lib/tool-registry.ts`; `src/lib/collection-printing-utils.ts`; `src/lib/card-status.ts`; `src/app/api/decks/[id]/picklist/route.ts`; `src/components/PicklistV2.tsx`; `src/app/api/cards/route.ts`; `src/app/api/cards/search/route.ts`; `src/app/api/cards/owned-printings/route.ts`; `src/app/api/collection/ownership-batch/route.ts`; `src/app/api/commanders/search/route.ts`; `src/components/StatusChipPopover.tsx`; `src/components/CardsTab.tsx`; `src/lib/card-data.ts`; `src/app/api/collection/rollup/route.ts`; `src/components/collection/PrintingListView.tsx`; `src/app/api/collection/instances/[oracleId]/route.ts`.
