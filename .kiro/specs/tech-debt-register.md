# Technical Debt Register

> Last updated: 2026-09-12
> Owned by: Delivery Lead
> Prioritised by: Product Manager

## Summary

- **Total items:** 36
- **Open severity:** **Critical:** 3 | **High:** 5 | **Medium:** 4 | **Low:** 2
- **Resolved:** 17 (TD-001–TD-004, TD-006–TD-013, TD-016, TD-017, TD-019, TD-020, TD-022) | **Accepted-risk:** 5 (TD-005, TD-015, TD-018, TD-028, TD-036) | **Deferred:** 0 | **Open:** 14 (TD-014, TD-021, TD-023–TD-027, TD-029–TD-035)
- **Oldest unresolved:** TD-014 — Pricing data limited and potentially stale
- **Immediate paydown candidates:** TD-026, TD-027, and TD-029 before authoritative collection rebuild

---

## TD-001: Deck reimport destroys allocation data on write
- **Category:** Architecture
- **Severity:** critical
- **Logged:** 2026-07-13 by Delivery Lead (retroactive — this work happened outside the team workflow; see note below)
- **Feature origin:** cross-cutting — `deck-import-legacy.ts` (`importDeck()`) and `deck-import.ts` (`importDeckExistingCollection()`). No feature spec folder exists for this work.
- **Description:** Both deck-write paths do an unconditional delete-all-then-reinsert on `deck_cards` instead of diffing against existing rows. This destroys `physical_copy_id` allocation, `ownership_status`, and Oracle-edited `categories` on every reimport, including migration reruns. Confirmed by direct code review, not inference.
- **Impact if unresolved:** Any deck reimported after being worked on inside Oracle silently loses real allocation/ownership data — no warning, no partial preservation.
- **Proposed fix:** Shared diff-based upsert primitive used by both write paths; preserve fields on rows that persist; wrap in a transaction.
- **Blocked by:** none — in progress.
- **Status:** resolved
- **Resolved:** 2026-07-14 — Verified by code review. `src/lib/deck-cards-diff.ts` (`diffDeckCards()`/`applyDeckCardsDiff()`) replaces delete-then-reinsert in both `deck-import-legacy.ts` and `deck-import.ts` with a stable-identity `(card_name, scryfall_id)` diff that preserves `physical_copy_id`, `ownership_status`, `categories`, `proxy_of_deck_id`, `dead_weight_flag`/`dead_weight_reason` on persisting rows. Applied atomically via `apply_deck_cards_diff` RPC (single Postgres transaction). Spec folder `.kiro/specs/deck-reimport-dataloss-fix/` shows property-based tests that explicitly proved the bug on unfixed code before confirming the fix. Could not independently execute the test suite in this session (sandbox has a native-binding architecture mismatch unrelated to this code — `@rolldown/binding-linux-arm64-gnu` missing); run `npx vitest --run` locally to get a live pass/fail confirmation.

---

## TD-002: Migration/onboarding resolution does N+1 sequential queries
- **Category:** Architecture
- **Severity:** high
- **Logged:** 2026-07-13 by Delivery Lead (retroactive)
- **Feature origin:** cross-cutting — `warm-start-resolve.ts` (`resolveDeckBatch()`, `fetchEnrichedSupply()`)
- **Description:** Allocation resolution during migration fetches supply-pool data per unique card name (2 Supabase queries each) instead of loading the full pool once. ~1,200+ sequential round-trips observed across a 9-deck migration batch. Independent of TD-001 — fires in full on a first-ever migration where there's nothing to diff against.
- **Impact if unresolved:** Migration/onboarding remains far slower than manual import; compounds further on any migration rerun because TD-001 currently forces full re-resolution each time.
- **Proposed fix:** Load full supply pool + card definitions once, resolve in memory, batch the resulting assignment writes; keep deck-processing order for pool-contention correctness but drop per-card round-trips.
- **Blocked by:** none — resolved alongside TD-001 in the same spec.
- **Status:** resolved
- **Resolved:** 2026-07-14 — Verified by code review. `src/lib/supply-pool.ts` adds a `SupplyPool` in-memory class: `loadSupplyPool()` does one paginated bulk fetch of `physical_copies` + `card_definitions` (handles PostgREST's 1000-row limit correctly), replacing the per-card `fetchEnrichedSupply()` calls; `batchAssignDeck()` writes all of a deck's assignments in one atomic RPC call (`batch_assign_deck`, migration `018_batch_assign_deck_rpc.sql`) instead of one UPDATE per card; contention detection now reads in-memory pool state instead of re-querying. Sequential deck-processing order is preserved for pool-contention correctness, per requirement. On assignment-write failure, the batch halts rather than continuing against pool state it can no longer trust — matches the atomicity concern raised when this was scoped. Unit tests cover the pool logic directly; integration tests reportedly cover end-to-end atomicity including simulated RPC failure. Same test-suite caveat as TD-001 — not independently executed in this session.

---

## TD-003: No signal distinguishes Oracle-edited category from untouched Archidekt default
- **Category:** Architecture
- **Severity:** medium
- **Logged:** 2026-07-13 by Delivery Lead (retroactive)
- **Feature origin:** cross-cutting — surfaced while speccing the TD-001 fix
- **Description:** The planned "preserve category if non-null" rule can't distinguish a user-edited category from Archidekt's original value, because every row gets a non-null category on creation. As written, the rule would either always preserve (never refresh from Archidekt) or never distinguish correctly.
- **Impact if unresolved:** The TD-001 fix ships with category-preservation logic that doesn't do what it claims to.
- **Proposed fix:** Decide explicitly — add a signal (edited flag, timestamp, or source field) to distinguish edited vs. untouched, or accept sticky-on-creation semantics and document it as intentional.
- **Blocked by:** none — decided.
- **Status:** resolved
- **Resolved:** 2026-07-14 — Decided as sticky-on-creation, deliberately: `diffDeckCards()` treats every persisting row's `categories` (and other enriched columns) as untouched by reimport, full stop — no edited/unedited distinction is attempted. New rows get Archidekt's category as the initial value once, on creation only. This is documented behavior in `tasks.md`/`design.md`, not an accidental side effect of a null check — the ambiguity this ticket flagged has been closed by picking one of the two options named in the original description.

---

## TD-004: `collection_rollup` / `shared_cards` live-vs-materialized status unconfirmed
- **Category:** Documentation
- **Severity:** medium
- **Logged:** 2026-07-13 by Delivery Lead (retroactive)
- **Feature origin:** cross-cutting — affects taxonomy work and the TD-001 fix's "free `physical_copy_id` back to the pool on card removal" behavior
- **Description:** Neither confirmed as a live view or materialized. Any feature assuming one or the other risks the exact stale-availability bug the taxonomy work exists to prevent.
- **Impact if unresolved:** Silent incorrect assumptions get built into new features (taxonomy, TD-001 fix) without anyone deciding it on purpose.
- **Proposed fix:** Confirm against actual schema before any dependent feature proceeds.
- **Blocked by:** none — checked.
- **Status:** resolved
- **Resolved:** 2026-07-14 — Verified by direct migration read. Both are plain `CREATE OR REPLACE VIEW` — live, not materialized (`supabase/migrations/012_collection_rollup_view.sql`, further tuned in `014_fix_collection_rollup_demand.sql`; `shared_cards` view in `001_initial_schema.sql`, plus a scoped `get_shared_cards()` RPC in `002_rpc_functions.sql`). No staleness risk exists — both always reflect current data on query. Safe to build the taxonomy work against them as live sources.

---

## TD-005: `card_definition_id` backfill completion/failure-reporting unconfirmed
- **Category:** Testing
- **Severity:** medium
- **Logged:** 2026-07-13 by Delivery Lead (retroactive)
- **Feature origin:** cross-cutting
- **Description:** Unconfirmed whether the backfill of `card_definition_id` on `deck_cards` completed with failure reporting, or could have left silent nulls.
- **Impact if unresolved:** Anything treating `card_definition_id` as reliably populated may be silently wrong for some rows.
- **Proposed fix:** Confirm backfill completion status and add failure reporting if it doesn't already exist.
- **Blocked by:** none.
- **Status:** accepted-risk (moot — premise doesn't apply to current schema)
- **Resolved:** 2026-07-14 — Verified by direct schema read (`supabase/migrations/001_initial_schema.sql`). `deck_cards` has no `card_definition_id` column at all — it references cards via `card_name`/`scryfall_id` directly. `card_definition_id` exists only on `physical_copies`, where it's `NOT NULL REFERENCES card_definitions(id)` — enforced at the database level, cannot be silently null by construction. The backfill concern in the original audit appears to describe an earlier or planned schema shape that doesn't match what's actually deployed. No action needed; closing as moot rather than resolved, in case the original concern referred to something not visible in the migrations.

---

**Note on retroactive logging:** TD-001 through TD-005 were surfaced through direct conversation and code review outside the standard PM → Designer → Developer → Tester flow — the team workflow had gone unused since it was set up. Going forward, route new feature and bugfix work through Gene (Delivery Lead) rather than ad hoc chat, so debt gets logged at the moment it's created rather than reconstructed after the fact.

<!-- Add entries below using the template from convention-tech-debt-register.md. IDs are sequential: TD-006, TD-007, etc. -->

---

## TD-006: `notion_logged` / `notionLogged` naming cleanup
- **Category:** Documentation
- **Severity:** low
- **Logged:** 2026-07-14 by Delivery Lead
- **Feature origin:** `remove-notion-dependency` — `specs/remove-notion-dependency/`
- **Description:** The `remove-notion-dependency` spec shipped successfully — Notion API SDK is removed from `package.json`, `deck_documentation` and `deck_notes` tables replace Notion storage, and zero `@notionhq` imports exist. However, the `debrief_actions` table still has a `notion_logged` column, `debrief-types.ts` has a `notionLogged` field, `debrief-actions.ts` references `notion_logged`, and `useDebriefSession.ts` sets `notionLogged`. These are stale names from the pre-removal era — the column tracks "was this action applied" (a boolean), not anything Notion-specific.
- **Impact if unresolved:** Confusing naming for anyone reading the debrief code. No functional impact — the field works correctly, it's just misnamed.
- **Proposed fix:** Rename column to `action_applied` or `logged` via migration + codemod (column rename, type rename, 3 file updates). Low effort, low risk.
- **Blocked by:** nothing
- **Status:** resolved
- **Resolved:** 2026-07-14 — Migration applied: `ALTER TABLE debrief_actions RENAME COLUMN notion_logged TO action_applied`. Updated `debrief-actions.ts` (parameter + insert key), `debrief-types.ts` (field renamed to `actionApplied`), `useDebriefSession.ts` (field reference), `deck-documentation-store.ts` (comment cleaned), `debrief-prompts.ts` (deprecated `formatDebriefNotionEntry` alias removed), `debrief-prompts.test.ts` (updated to use `formatDebriefNoteEntry`). Supabase types regenerated. Zero "notion" matches remain in `src/` (excluding dead `migrations.test.ts` — TD-007).

---

## TD-007: Dead test files referencing deleted modules
- **Category:** Testing
- **Severity:** low
- **Logged:** 2026-07-14 by Delivery Lead
- **Feature origin:** cross-cutting — surfaced during Shared Cards V2 and taxonomy release gates
- **Description:** Three test files reference modules that no longer exist and depend on `better-sqlite3` which is not in `package.json`: `src/test/integration/pilot-validation.test.ts` (imports `collection-reallocator`, `allocation-resolver`, `allocation-store`, `card-movement`), `src/lib/allocation.test.ts` (imports deleted `allocation.ts`, creates `proxy_allocations` table in SQLite), `src/test/migrations.test.ts` (tests `proxy_allocations` schema which is dropped). These tests cannot run and have never been executable in the current environment (no native SQLite binding installed).
- **Impact if unresolved:** `npx tsc --noEmit` reports errors from these files. `vitest --run` would fail on import. No production impact — they're dead weight that makes the build noisier.
- **Proposed fix:** Delete all three files. They test V1 allocation logic against a SQLite mock DB — that entire system is decommissioned. No replacement needed (V2 allocation logic has its own tests using Supabase mocks).
- **Blocked by:** nothing
- **Status:** resolved
- **Resolved:** 2026-07-14 — Deleted all 3 files: `pilot-validation.test.ts`, `allocation.test.ts`, `migrations.test.ts`. Note: 7 additional test files also use `better-sqlite3` but test live modules (`card-movement`, `allocation-store`, `rating-engine`, `proxy-tag-interpretation`, etc.) — those are a separate concern (wrong harness, not dead code) and not part of this cleanup.

---

## TD-008: `nav-split-collection-allocation` sidebar update never landed
- **Category:** Code
- **Severity:** medium
- **Logged:** 2026-07-14 by Delivery Lead
- **Feature origin:** `nav-split-collection-allocation` — `specs/nav-split-collection-allocation/`
- **Description:** The spec's Requirement 2 (add "Allocation" to sidebar, remove "Shared Cards") was never implemented. The `/allocation` page exists and works (Req 3 met), tabs were removed from Collection (Req 1 met), but `Sidebar.tsx` still shows "Shared Cards" at `/shared-cards` instead of "Allocation" at `/allocation`. The page is accessible by direct URL only — not discoverable in the UI.
- **Impact if unresolved:** Users can't find the Allocation page without knowing the URL. The Shared Cards page (now just a contention listing with Resolve links) still has its own nav entry despite being conceptually subordinate to the Allocation view.
- **Proposed fix:** Update `Sidebar.tsx` nav items: replace `{ label: 'Shared Cards', icon: Copy, href: '/shared-cards' }` with `{ label: 'Allocation', icon: GitCompare, href: '/allocation' }`. One-line change + icon import. Consider whether `/shared-cards` should redirect to `/allocation` or remain as a deep-link.
- **Blocked by:** nothing — product decision on whether to keep both pages or merge them
- **Status:** resolved
- **Resolved:** 2026-07-14 — Sidebar updated: "Shared Cards" nav item removed. Replaced with "Cards" entry (icon: `IdCard`, href: `/allocation`) representing the instance-level card management view. "Collection" retained as its own nav item (user decision: CRUD-heavy interaction model warrants top-level access). Product decision: both routes stay separate (different interaction models), "Shared Cards" removed from nav.

---

## TD-009: Collection rollup expand endpoint referenced dropped `quantity` column
- **Category:** Code
- **Severity:** high (endpoint returns 400, feature broken)
- **Logged:** 2026-07-14 by Delivery Lead
- **Feature origin:** `instance-level-card-tracking` — migration 007 dropped `physical_copies.quantity`
- **Description:** `src/app/api/collection/rollup/[cardDefinitionId]/route.ts` (the "expand printings" subgroup endpoint for the Collection grid view) selected `quantity` from `physical_copies` in its Supabase query and read `pc.quantity` in the response builder. Migration 007 dropped this column — PostgREST returns 400 ("column does not exist") when this endpoint is called. The Collection grid's printing-level expansion was broken.
- **Impact if unresolved:** Clicking a card in the Collection grid to see its per-printing breakdown returns a 400 error. The grid-level rollup still works (different endpoint), but drill-down is broken.
- **Proposed fix:** Remove `quantity` from the select clause, hardcode `1` in the response (instance-level model: one row = one card). Response shape unchanged (field still exists, value always 1).
- **Blocked by:** nothing
- **Status:** resolved
- **Resolved:** 2026-07-14 — Removed `quantity` from the `.select()` clause on `physical_copies`. Response field `quantity` hardcoded to `1` (correct for instance-level model where each row IS one card). No schema or response-shape change needed — consumers already handle the field, they'll just always see `1` instead of the previously-broken undefined/null.


---

## TD-010: Mark-as-Missing is not atomic
- **Category:** Architecture
- **Severity:** high
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** cross-cutting — `src/lib/missing.ts`
- **Description:** Sets `physical_copies.missing = true` then unlinks `deck_cards` rows in sequential calls. If crash between, card is "missing" but still appears assigned to a deck.
- **Impact if unresolved:** Data inconsistency — card shows as both missing and assigned.
- **Proposed fix:** Single Postgres RPC that does both in one transaction (same pattern as `assign_physical_copy`).
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-21 — Created `mark_copy_missing` RPC with advisory lock. Updated `src/lib/missing.ts` to call `supabase.rpc('mark_copy_missing', ...)` instead of sequential updates.

---

## TD-011: Card preview hover not standardized across views
- **Category:** Code
- **Severity:** low
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** cross-cutting — `CardHoverPreview.tsx`, `CardGroupSection.tsx`, `PicklistV2.tsx`
- **Description:** Three separate implementations of card hover preview (CardHoverPreview component, inline in CardGroupSection name hover, inline in PicklistV2 rows). Each has slightly different positioning logic, delay behavior, and image sizing. Should be unified into one shared component.
- **Impact if unresolved:** Inconsistent UX across views; maintenance burden when changing preview behavior.
- **Proposed fix:** Unify into a single `CardPreview` component with standardized above/below positioning, 200ms delay, fixed 220px width with 5:7 aspect ratio. Use in all card name/row hovers.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-21 — Created `useCardHoverPreview` hook + portal-based `CardHoverPreview` component. All 3 inline implementations replaced (CardGroupSection, PicklistV2, StatusChipPopover).

---

## TD-012: StatusControl.test.tsx and StatusFilter.test.tsx reference stale display labels
- **Category:** Testing
- **Severity:** low
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** Deck Status Lifecycle Overhaul
- **Description:** Test files reference old display labels ("Brew", "Built", "Archived") and old color classes after the rename to "Brewing"/"In Rotation"/"Graveyard" and the Material Icon migration. Tests will fail if run.
- **Impact if unresolved:** Test suite fails; blocks CI if tests are ever enforced.
- **Proposed fix:** Update assertions to match current labels/icons, or rewrite tests to match the new component behavior.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-27 — Updated both test files: replaced status values (`active`/`draft`/`inactive` → `brewing`/`in_rotation`/`graveyard`) and labels (`Brew`/`Built`/`Archived` → `Brewing`/`Active`/`Graveyard`). All 25 tests pass.

---

## TD-013: DFC/split cards don't resolve mana pips or images
- **Category:** Code
- **Severity:** low
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** Mana Pips & Set Icons
- **Description:** Cards with `//` in their name (double-faced cards like "Avenger of Zendikar // Something") fail to match in `card_metadata` and fail Scryfall named-image URLs. Affects ~48 cards across a typical collection.
- **Impact if unresolved:** Small number of cards show no mana pips and broken image previews in the Picklist.
- **Proposed fix:** Split on `//`, use the front face name for lookups. Or use the card's `scryfall_id` (from `deck_cards`) to fetch metadata directly.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-27 — Added `frontFaceName()` helper to `src/lib/basic-lands.ts` (extracts front face from DFC names). Updated 5 files: `collection/printings/route.ts` (mana cost map building + lookup), `SmartSearch.tsx` (image URL), `BrewCanvas.tsx` (2 image URL constructions), `new-deck/page.tsx` (5 Scryfall named API calls + image URLs). All DFC lookups now use front face for Scryfall named API and image URLs.

---

## TD-014: Pricing data limited and potentially stale
- **Category:** Data
- **Severity:** medium
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** Mana Pips & Set Icons, Collection List Enhancements
- **Description:** `card_kingdom_prices` table only has ~5000 entries (vs 3400+ physical copies). `card_metadata.price_usd` is populated from Scryfall at backfill time but never refreshed. No automated refresh mechanism exists.
- **Impact if unresolved:** Many cards show "—" for price; prices drift from market value over time.
- **Proposed fix:** Scheduled job to refresh `card_metadata.price_usd` weekly from Scryfall bulk data. Consider deprecating `card_kingdom_prices` in favor of the unified `card_metadata` table.
- **Blocked by:** none
- **Status:** open

---

## TD-015: PostgREST URL length limit requires batch-size workaround
- **Category:** Infrastructure
- **Severity:** low
- **Logged:** 2026-07-19 by Delivery Lead
- **Feature origin:** Collection List Enhancements
- **Description:** Supabase PostgREST `.in()` queries with >200 UUIDs (36 chars each) exceed the URL length limit and silently return empty results. The collection printings API and deck API both had to be reduced from 1000 to 200 batch size as a workaround.
- **Impact if unresolved:** Silently missing data if batch sizes are increased above ~200 for UUID-typed columns. Non-obvious failure mode.
- **Proposed fix:** Document the 200-item limit in the Supabase steering file. Consider using POST-based RPC for large `.in()` queries, or server-side filtering.
- **Blocked by:** Supabase PostgREST configuration (not user-configurable on hosted plans)
- **Status:** accepted-risk


---

## TD-016: TanStack Query key type fragility (string vs number deckId)
- **Category:** Code
- **Severity:** medium
- **Logged:** 2026-07-21 by Delivery Lead
- **Feature origin:** cross-cutting — deck detail page + all child components
- **Description:** The deck page gets `deckId` from `useParams()` (always a string), but passes `deck.id` (number) to child components. TanStack Query keys end up using inconsistent types: page uses `['decks', "123"]`, children use `['decks', 123, 'card-statuses']`. Invalidations must hedge by firing both variants. This has caused silent stale-data bugs multiple times (AddCardSearch, GenericLandRow, PicklistV2 mutations).
- **Impact if unresolved:** Every new mutation handler must remember to invalidate BOTH key variants. Forgetting causes UI stale-data bugs that only manifest after interaction (not on load). Pattern compounds as more features are added.
- **Proposed fix:** Create a `useDeckQueryKeys(deckId: string | number)` hook that returns standardized query key factories. All components use this hook instead of constructing keys inline. Key format standardizes on string (matching the URL param). Alternatively, normalize deckId to string at the CardsTab boundary. Estimated effort: 2-3 hours.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-27 — Created `src/hooks/useDeckQueryKeys.ts` with `deckKeys` factory (normalizes deckId to number) and `createDeckInvalidators()` helper. Refactored 7 components: `CardGroupSection.tsx`, `AddCardSearch.tsx`, `StatusControl.tsx`, `PicklistV2.tsx`, `StatusChipPopover.tsx`, `CardsTab.tsx`, `decks/[id]/page.tsx`. All now use `deckKeys.detail(id)`, `deckKeys.cardStatuses(id)`, `deckKeys.picklist(id)`, etc. instead of inline arrays. No more double-invalidation patterns needed.


---

## TD-017: dHash camera matching fundamentally unreliable
- **Category:** Architecture
- **Severity:** high
- **Logged:** 2026-07-22 by Delivery Lead
- **Feature origin:** card-scanning — historical `scripts/build-hash-db.ts`, `src/lib/scanner/scan-pipeline.ts`
- **Description:** Real-device testing showed that dHash could not reliably identify cards from noisy camera frames. Camera background, lighting, resampling differences, and perspective fallback made the low-resolution hashes too fragile for authoritative collection writes.
- **Impact if unresolved:** An unreliable scanner could add the wrong printing or card to the collection and create a second, poorly validated mutation path beside CSV/text import.
- **Proposed fix:** Remove the scanner subsystem. If physical capture is revisited, it must produce the same validated CSV/text import contract rather than write collection state directly.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-09-03 — Removed the remaining dHash database, stale `/scan` navigation, camera permission, and local OCR Edge Function source. Verified the linked Supabase project had no deployed Edge Functions before deleting the OCR source. Historical research remains for context; no scanner runtime or archived source tree remains.


---

## TD-018: Edge Function memory limits for Scryfall bulk sync
- **Category:** Infrastructure
- **Severity:** medium
- **Logged:** 2026-07-26 by Delivery Lead
- **Feature origin:** Scryfall Printings feature — `supabase/functions/scryfall-sync/index.ts`
- **Description:** The Supabase Edge Function for daily Scryfall sync downloads and decompresses the full Default Cards JSONL (~100MB compressed → ~600MB decompressed). This may exceed Edge Function memory limits on the initial full load. Daily incremental updates are smaller and typically succeed.
- **Impact if unresolved:** Initial data load may fail if run via Edge Function. Daily syncs should work for incremental updates (only changed cards).
- **Proposed fix:** Use the local script (`scripts/sync-scryfall-printings.ts`) for initial bulk load. Edge Function handles daily refresh only. If Edge Function consistently fails, consider chunked processing or a GitHub Actions workflow instead.
- **Blocked by:** none — workaround documented (use local script for initial load)
- **Status:** accepted-risk


---

## TD-019: Legacy oracle_to_printings table redundant with scryfall_printings
- **Category:** Data
- **Severity:** low
- **Logged:** 2026-07-26 by Delivery Lead
- **Feature origin:** Scryfall Printings feature
- **Description:** The new `scryfall_printings` table (~100K rows) contains a superset of the data in `oracle_to_printings` (oracle_id, scryfall_printing_id, card_name, set_code, collector_number) plus prices, images, metadata. The import engine now checks `scryfall_printings` first, falling back to `oracle_to_printings`. The legacy table could be dropped once `scryfall_printings` is confirmed reliable.
- **Impact if unresolved:** Two tables with overlapping data. Minor storage overhead and slight complexity in lookup code (fallback chain).
- **Proposed fix:** After `scryfall_printings` is in production for 2+ weeks with no issues, migrate any consumers still using `oracle_to_printings` directly, then drop the table.
- **Blocked by:** Confidence in scryfall_printings stability (2-week observation period)
- **Status:** resolved
- **Resolved:** 2026-07-27 — All consumers migrated to `scryfall_printings`. Table dropped in migration `20260727030000_drop_legacy_printing_tables.sql`.


---

## TD-020: printing_set_info table redundant with scryfall_printings
- **Category:** Data
- **Severity:** low
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Scryfall Printings feature
- **Description:** `printing_set_info` maps scryfall_printing_id → (set_code, edition_name). This is now redundant with `scryfall_printings` which has scryfall_id, set_code, set_name for all ~100K printings. Multiple API routes query printing_set_info for set display names.
- **Impact if unresolved:** Two tables with overlapping data. Storage overhead and query complexity (separate joins for different metadata).
- **Proposed fix:** Migrate consumers to query `scryfall_printings` instead. Drop `printing_set_info` table.
- **Blocked by:** Confidence in scryfall_printings stability (2-week observation period)
- **Status:** resolved
- **Resolved:** 2026-07-27 — All 8 API route consumers migrated to `scryfall_printings`. Table dropped in migration `20260727030000_drop_legacy_printing_tables.sql`.


---

## TD-021: card_metadata overlaps with mtg_cards and scryfall_printings
- **Category:** Data
- **Severity:** medium
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Historical — predates scryfall_printings
- **Description:** `card_metadata` stores per-card-name data: rarity, price_usd, set_code, type_line, mana_cost, cmc, default_category. This overlaps with: (1) `mtg_cards` — same card-name key, has type_line, mana_cost, oracle_text, default_category; (2) `scryfall_printings` — has prices, rarity, mana_cost per printing. Multiple routes read card_metadata for mana costs and prices; the refresh-prices cron writes to it.
- **Impact if unresolved:** Three tables with overlapping card data. Maintenance burden — must keep card_metadata, mtg_cards, and scryfall_printings in sync. Unclear which is source of truth for which field.
- **Proposed fix:** Consolidate: (1) mana_cost/type_line → read from `mtg_cards` or `scryfall_printings`; (2) price_usd → read from `scryfall_printings` (Scryfall prices) or keep card_metadata for aggregate "market price" if needed; (3) default_category → migrate to `mtg_cards` only (already has it). May be able to drop card_metadata entirely if all consumers migrated.
- **Blocked by:** Audit of all consumers + decision on "market price" source of truth
- **Status:** open
- **Consumers:** `/api/decks/[id]`, `/api/collection/printings`, `/api/collection/value`, `/api/collection/refresh-prices`, `/api/cron/refresh-prices`, `/api/decks/[id]/cards`, `/api/decks/[id]/precon-diff`, `precon-mod-store.ts`, multiple backfill scripts


---

## TD-022: sets table appears unused
- **Category:** Data
- **Severity:** low
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Initial schema
- **Description:** `sets` table (code TEXT PK, name TEXT) was created in initial schema but has zero consumers in application code. No `.from('sets')` queries exist. Set codes and names are now available in `scryfall_printings` per-printing and in `printing_set_info`.
- **Impact if unresolved:** Dead table taking up space in schema. Potential confusion about data model.
- **Proposed fix:** Confirm no queries, then drop table.
- **Blocked by:** none
- **Status:** resolved
- **Resolved:** 2026-07-27 — Migrated 2 consumers (`collection/rollup/[cardDefinitionId]`, `shared-cards`) to `scryfall_printings`. Table dropped in migration `20260727010000_drop_sets_table.sql`.


---

## TD-023: card_kingdom_prices may be redundant with scryfall_printings
- **Category:** Data
- **Severity:** low
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Price Tracking MVP
- **Description:** `card_kingdom_prices` stores Card Kingdom retail prices by scryfall_printing_id. `scryfall_printings` now has `price_usd` (Scryfall's aggregated market price). These are different data sources — CK is one vendor, Scryfall aggregates across TCGPlayer and others. The question is whether vendor-specific pricing adds value.
- **Impact if unresolved:** Two price sources to maintain. CK refresh runs separately from Scryfall sync.
- **Proposed fix:** Product decision: (1) keep both if vendor comparison is valuable, (2) drop CK table and use Scryfall prices only (simpler, one sync), (3) keep CK for buy-list arbitrage features.
- **Blocked by:** Product decision on pricing strategy
- **Status:** open
- **Consumers:** `price-store.ts`, `ck-price-refresh` edge function, `/api/collection/prices/refresh`


---

## TD-024: Legacy collection and deck_allocations tables still have active consumers
- **Category:** Data
- **Severity:** medium
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Instance-level migration (007)
- **Description:** `collection` and `deck_allocations` tables were intended to be superseded by `physical_copies` and `deck_cards.physical_copy_id`. However, they still have active consumers: `collection` is read by 9+ routes and written by `csv-import.ts` and `/api/collection/import`. `deck_allocations` is read by 4 routes for allocation role lookup.
- **Impact if unresolved:** Dual data sources for collection data. Some routes read from `collection`, others from `physical_copies`. Inconsistency risk.
- **Proposed fix:** Migrate all `collection` readers to aggregate from `physical_copies`. Migrate `deck_allocations` readers to use `deck_cards.ownership_status`. Then drop both tables.
- **Blocked by:** Full consumer audit and migration of 13+ routes
- **Status:** open
- **Consumers:** `/api/collection/stats`, `/api/collection/printings`, `/api/ai/brew/generate`, `/api/ai/brew/refine`, `/api/decks/[id]/upgrade`, `card-repository.ts`, `csv-import.ts`, `verify-e2e.ts`, `backfill-collection-to-physical-copies.ts` (collection); `/api/decks/[id]`, `/api/decks/[id]/upgrade`, `/api/collection/printings`, `legacy-allocation-transfer.ts` (deck_allocations)


---

## TD-025: oracle_id type mismatch across tables (TEXT vs UUID)
- **Category:** Architecture
- **Severity:** low
- **Logged:** 2026-07-27 by Delivery Lead
- **Feature origin:** Scryfall Printings feature — discovered during RPC migration
- **Description:** `card_definitions.oracle_id` is TEXT, but `scryfall_printings.oracle_id` is UUID. Similarly, `card_kingdom_prices.scryfall_printing_id` is TEXT but `scryfall_printings.scryfall_id` is UUID. This requires explicit `::text` casts in any query joining these tables. The RPC functions `get_price_to_add()` and `get_bulk_price_to_add()` now include these casts.
- **Impact if unresolved:** Any new query joining these tables will fail with "operator does not exist: text = uuid" unless developers remember to cast. Non-obvious error — the fix is to add `::text` to the UUID column.
- **Proposed fix:** Standardize on one type. Either: (1) migrate `card_definitions.oracle_id` and `card_kingdom_prices.scryfall_printing_id` to UUID (preserves index efficiency), or (2) keep TEXT everywhere (easier but less type-safe). Option 1 is preferable but requires data migration + consumer updates.
- **Blocked by:** none — low priority, workaround in place
- **Status:** open


---

## TD-026: Collection replace deletes live data before validation
- **Category:** architecture
- **Severity:** critical
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** Collection CSV Import — `.kiro/specs/collection-csv-upsert/`
- **Description:** `mode=replace` deletes all user copies before the complete file is parsed, resolved, and validated. Large browser imports commit the first chunk as replace and later chunks as add, so interruption or a failed batch leaves an empty or partial collection without rollback.
- **Impact if unresolved:** Authoritative collection migration can cause irreversible data loss or a partially reconstructed collection; replacement also assigns new copy IDs and breaks deck allocations.
- **Proposed fix:** Stage the complete import under an import-run ID, validate and reconcile counts/metadata, then apply the approved cutover in one Postgres transaction/RPC while preserving or relinking allocations. Estimated effort: large.
- **Blocked by:** Product decisions on source-of-truth model, required metadata fidelity, and allocation preservation.
- **Status:** open

---

## TD-027: Authenticated E2E tests mutate production
- **Category:** infrastructure
- **Severity:** critical
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** E2E Test Isolation — `.kiro/specs/e2e-test-isolation/`
- **Description:** CI previously restored a reusable authenticated browser session and ran Playwright against the production Vercel URL. On 2026-09-12, containment removed the production literal and added fail-closed CI and Playwright guards that require an explicitly attested isolated HTTPS target and reject production/loopback hosts. A dedicated test environment, deterministic fixtures, and cleanup do not yet exist.
- **Impact if unresolved:** Production targeting is now blocked by code, but E2E cannot provide release evidence until isolated infrastructure is operational. The prior browser session may remain valid, and historical runs may have changed real allocations.
- **Proposed fix:** Provision isolated Vercel/Supabase test infrastructure with seeded data and deterministic reset/cleanup; create a dedicated test user/session; rotate or revoke the prior production session; review possible historical allocation mutations; then re-enable the workflow. Estimated remaining effort: medium.
- **Blocked by:** Isolated Supabase/Vercel resources and credentials.
- **Status:** in-progress

---

## TD-028: No verified database backup and restore path
- **Category:** infrastructure
- **Severity:** critical
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** cross-cutting
- **Description:** Supabase Free does not provide the managed daily-backup/PITR posture recommended for an authoritative system, and Oracle has no complete relational backup/restore tool. The MVP will instead reset and deterministically rebuild from retained collection and deck input files.
- **Impact if unresolved:** Oracle-only changes made after the retained source files—including manual copy metadata, storage changes, and allocation work—can be lost after operator error, corruption, or a hosted-service incident and must be recreated.
- **Proposed fix:** Upgrade the recovery posture and add a versioned relational backup/restore path if Oracle-only state becomes costly to recreate or before public/multi-user release.
- **Blocked by:** Supabase plan and future risk posture.
- **Status:** accepted-risk
- **Accepted risk:** 2026-09-03 — User explicitly accepts deleting and rebuilding instead of preserving database state for the private Free-plan MVP. Rebuild inputs must be retained and the deterministic rebuild rehearsed. Review by 2026-12-03 or before public/multi-user release, whichever comes first.

---

## TD-029: Allocation undo is unscoped and non-atomic
- **Category:** security
- **Severity:** critical
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** Collection Allocation — `.kiro/specs/collection-allocation-expansion/`
- **Description:** The undo route uses the RLS-bypassing admin client but does not scope copy/slot reads and writes to the authenticated user. Restore clears the current slot and fills the prior slot in separate calls; add-proxy has a related insert-then-assign crash window.
- **Impact if unresolved:** A logged-in user able to supply row IDs could affect another user's state, and crashes/races can orphan copies or leave inconsistent slots.
- **Proposed fix:** Move undo/add-proxy invariants into ownership-checking advisory-locked Postgres RPCs and add two-user/concurrency integration tests. Estimated effort: medium.
- **Blocked by:** Canonical migration tree must be established so RPC source is deployable.
- **Status:** open

---

## TD-030: Collection export is not a complete round-trip backup
- **Category:** architecture
- **Severity:** high
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** Price Tracking / Collection Export — `.kiro/specs/price-tracking/`
- **Description:** Export omits missing state, storage location, language, source provenance, notes, proxy target, copy identity, decks, and allocations. Import does not preserve all exported fields, and no clean export→restore test exists.
- **Impact if unresolved:** Users may believe they have a full backup but cannot reconstruct the state that matters after loss or migration.
- **Proposed fix:** Define a versioned Oracle backup package with manifest, checksums, all required tables/relationships, restore tool, and round-trip integration test; keep CSV as a separate portable format. Estimated effort: large.
- **Blocked by:** Required fidelity product decision.
- **Status:** open

---

## TD-031: Quality gates are broken or bypassed
- **Category:** testing
- **Severity:** high
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** cross-cutting
- **Description:** Audit validation found 277 failed unit tests, TypeScript parse failure caused by CLI output appended to generated Supabase types, and 334 lint errors. `next.config.ts` ignores TypeScript build errors, and CI does not run unit tests, lint, typecheck, build, or migration replay.
- **Impact if unresolved:** Build/CI success cannot distinguish known breakage from regressions in migration-critical behavior.
- **Proposed fix:** Repair generated types and auth test harness, establish a ratcheted lint baseline, remove build-error bypass, and enforce critical validation in CI before isolated E2E. Estimated effort: medium-large.
- **Blocked by:** None.
- **Status:** open

---

## TD-032: Clean Supabase schema replay is not yet proven
- **Category:** process
- **Severity:** high
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** Supabase Migration — `.kiro/specs/supabase-migration/`
- **Description:** The repository boundary and hosted migration ledger are now consolidated under `app/`: `supabase/migrations/` matches the linked project, generated CLI state is ignored, and competing histories are preserved under `supabase/reconciliation/`. However, migrations that predate the hosted ledger have not been proven to recreate the current schema from an empty project.
- **Impact if unresolved:** A clone has authoritative applied history but still cannot guarantee full schema reproduction from zero; disaster recovery and staging bootstrap remain partly manual.
- **Proposed fix:** Capture a hosted schema-only snapshot, establish a baseline for pre-ledger objects, and rehearse a clean replay in an isolated Supabase project. Estimated effort: medium.
- **Blocked by:** Docker or native `pg_dump`, plus an isolated Supabase test project.
- **Status:** in-progress

---

## TD-033: Collection list pagination and sorting are not database-native
- **Category:** architecture
- **Severity:** high
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** Collection Printing View — `.kiro/specs/collection-printing-view/`
- **Description:** The API fetches all matching copies, sorts in application memory, paginates physical copies, then groups rows. Copies of one printing can split across pages; grouped quantity/price ordering can be page-local; parallel full-collection fetches create latency and load.
- **Impact if unresolved:** Results can be incorrect at page boundaries and performance degrades as the collection grows.
- **Proposed fix:** Add a database projection/view or RPC that applies filters, grouping, sort, count, and pagination in Postgres with supporting indexes. Estimated effort: medium.
- **Blocked by:** Canonical schema/migration source.
- **Status:** open

---

## TD-034: Product and feature documentation contradict live behavior
- **Category:** documentation
- **Severity:** medium
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** cross-cutting
- **Description:** The living spec and collection-import requirements use superseded table names and a non-destructive quantity-group model. The delivery log says sync preserves allocations; roadmap docs call CSV export a full backup. These claims are not true of current implementation.
- **Impact if unresolved:** Product decisions and future changes are based on guarantees the app does not provide, increasing migration and cleanup risk.
- **Proposed fix:** Update current-state summaries, mark superseded requirements explicitly, link the readiness audit, and archive dated audits only after unique decisions are transferred. Estimated effort: small-medium.
- **Blocked by:** None.
- **Status:** open

---

## TD-035: No durable mutation audit or production alerting
- **Category:** observability
- **Severity:** high
- **Logged:** 2026-09-03 by Delivery Lead
- **Feature origin:** cross-cutting
- **Description:** Collection imports and allocation changes rely on HTTP responses/console logs. There is no durable record of actor, source hash, before/after counts, affected IDs, partial failures, or alerts for sudden count drops and failed imports.
- **Impact if unresolved:** Data corruption may go unnoticed and cannot be reconstructed confidently after the fact.
- **Proposed fix:** Persist mutation/import audit events, add correlation IDs and structured error tracking, alert on partial failures/count anomalies, and monitor route/database latency. Estimated effort: medium.
- **Blocked by:** Observability platform choice.
- **Status:** open

---

## TD-036: E2E smoke tests temporarily share the production backend
- **Category:** infrastructure
- **Severity:** high
- **Logged:** 2026-09-12 by Delivery Lead
- **Feature origin:** E2E Test Isolation — `.kiro/specs/e2e-test-isolation/`
- **Description:** The account's two active free Supabase project slots are required, so a separate E2E frontend and dedicated test identity will temporarily use the production Oracle Supabase project. The exception is restricted to an explicitly allowlisted read-only smoke project; mutating allocation, import, reset, cron, deck-creation, and direct write-API tests remain disabled.
- **Impact if unresolved:** The environment cannot prove mutation safety or tenant isolation, and service-role routes retain a non-zero blast radius even for a dedicated user. Expanding the allowlist carelessly could expose real collection state to test writes.
- **Proposed fix:** Move the complete E2E suite to a separate Supabase project as soon as a free project slot becomes available; recreate deterministic fixtures there, rotate the shared-backend test session, and remove shared-readonly mode. Estimated effort: medium.
- **Blocked by:** A free hosted project slot or approval for a paid persistent branch.
- **Status:** accepted-risk
- **Accepted risk:** 2026-09-12 — User chose to retain both active free projects and temporarily use the Oracle backend. Only read-only smoke coverage is permitted. Review by 2026-10-12 or when an alternate database becomes available, whichever comes first.
