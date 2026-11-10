# Report: Gate 2 audit, Daily-use deck advisor

**Role:** Architect
**Status:** DONE (read-only; nothing in code, migrations or the database was changed)
**Task as received:** Gate 2 audit of the approved brief `docs/oracle/briefs/daily-use-deck-advisor.md` (sections 3 to 12a), plus the section 15 questions, a recommended slice order and owner decisions.

## Summary for the owner

Much more exists than the brief assumes, but almost all of it is a "first draft" that is not yet good enough to rely on. The deck health strip, the owned-or-spare lookup, the storage screen, the card locator and the combo, upgrade and strategy tabs are all there. The "what's missing" view is the clearest gap: it uses one fixed set of targets for every deck and, as built, reads no card text, so all 8 stored health results say "red". Per-commander numbers exist for card types (lands, creatures and so on) for 1,880 community builds, but not for roles like removal or draw, and only 3 builds have card lists. Nothing exists yet for "in your hand", the move checklist, goal sentences, fit bands, tokens, import undo or new-cards-per-set. Scrollvault has no public data access and its terms forbid automated requests, so Oracle should compute brackets itself. Your bracket numbers are mostly right, but two need correcting (see section 15e).

## Evidence base and honesty notes

- Read: AGENTS.md, process.md, decisions.md, status.md, both briefs, the earlier UWIO audit and slice reports, the import-history audit and the vector-trial archive.
- Code was read directly. The hosted project ("The Oracle") was queried read-only on 2026-11-11. `src/types/supabase.ts` may lag the hosted database; where they disagree, the hosted database is quoted.
- Tag key: `[Confirmed: path]` = I opened it. `[Approximate]` = inferred from names or counts, not read line by line.
- Test coverage was only spot-checked by searching test files. Tests exist for the owned/spare lookup (`src/lib/owned-copy-lookup.test.ts`, `src/lib/spare-copy-browse.test.ts`), the import modal layout and the MCP client. I found none for the health engine, the category classifier, `CardLocator` or the Spellbook client [Approximate].

## Data facts that shape everything (hosted DB, 2026-11-11)

- 9 decks imported so far (owner says 17 will exist). All Custom type, status "brewing", bracket empty. Only 1 of 9 has a commander id and build id; the rest have a commander name only.
- `deck_cards`: 792 rows, 678 tied to a physical copy, `tags` empty on every row, `categories` holds only card types (Creature, Land, etc.), never roles.
- `user_copies`: 4,259 copies, 12 proxies, 0 marked missing, `purchase_price_usd` empty on all. The 678 copies in decks have no storage location (a deck is the copy link, not a location). 3,581 sit in the default "Unsorted" location.
- `user_locations`: free-form named places (Unsorted, Trade Binder, Bulk Box, Blue Cards) plus one per deck. No "kind" such as lands box or valuable binder.
- No `user_preferences` table (the migration was never pushed; `src/lib/user-preferences.ts` says so). No import-history table. No pgvector.
- `deck_strategy` 0 rows. `deck_health` 8 rows, all red. `deck_combos` 0 rows.

## Per-area findings

Each area answers (1) exists, (2) half-built or dead, (3) decisions touched, (4) schema change, (5) deleted or replaced.

### 3. What's-missing view, commander and build tailored targets

1. **Exists.**
   - Health engine with fixed global targets (Ramp 10-12, Draw 10-12, Removal 6-10 and so on) [Confirmed: `src/lib/health-engine.ts`].
   - Role classifier with a card-text tier [Confirmed: `src/lib/category-classifier.ts`].
   - Health route that saves a verdict into `deck_health` [Confirmed: `src/app/api/decks/[id]/health/route.ts`].
   - `HealthStrip` / `HealthPill` on the deck page; clicking a pill jumps to the Cards tab [Confirmed: `src/components/HealthStrip.tsx`].
   - Chat can already say what a deck has (`deck_context`, `get_deck_cards`, `check_owned_copies`, `browse_spare_copies`) [Confirmed: `src/lib/tool-registry.ts`].
2. **Half-built.**
   - The route passes `oracleText: null`, so the card-text tier never runs. Counts come only from the Archidekt-style `categories`, which on this data are types, not roles. That is why all 8 health rows are red [Confirmed: health route].
   - The route does not filter decks by user (a multi-user risk, brief section 13 / O-002) [Confirmed].
   - Targets are never tailored to a commander. Nothing links a gap to owned fillers yet.
3. **Decisions.** D-017 (category-count warnings vs curve), D-016 (structured tool results), D-007 (suggest only), D-029 (all decks count for ownership), D-025 and D-030 (honest labels, failed lookup is not "Unowned").
4. **Schema.** No new table for the view itself. A role-per-card source is needed (see tags, area 9). If targets are stored per deck (custom override, brief section 5), one nullable column on `deck_strategy` or a new small table.
5. **Replaced.** `DEFAULT_THRESHOLDS` becomes the fallback only. The `oracleText: null` shortcut goes.

### 3b. Where "typical numbers per commander" come from
See section 15a.

### 4. Owned and buy suggestions

1. **Exists (merged UWIO slices a, b, c).**
   - `check_owned_copies`: SPARE / IN_ANOTHER_DECK / UNOWNED, proxies and planned slots not counted, unknown price is "no price" [Confirmed: `src/lib/owned-copy-lookup.ts`].
   - `browse_spare_copies` [Confirmed: `src/lib/spare-copy-browse.ts`].
   - Commander-deck 100-card rule [Confirmed: `src/lib/deck-chat-facts.ts`].
   - Both tools registered for deck chat; edit tools gated off so chat is suggest-only [Confirmed: `src/lib/tool-registry.ts`].
   - Prices are Scryfall estimates from `ref_printings` (87,245 of 119,985 have a USD price) [Confirmed: `src/lib/price-store.ts`].
   - Tests for both lookups.
2. **Half-built / dead.** The older `card-repository` ownership methods are still used by the sidebar chat and are blind to proxies and exact printings [Approximate: `src/lib/card-repository.ts`]. Two answers to "do I own it" therefore exist. The advisor contract tasks T-15 to T-19 and T-36 are parked per status.md.
3. **Decisions.** D-001, D-021, D-025, D-027, D-030, D-035 and D-040 (Scryfall estimate, no Card Kingdom), D-007, D-034 (apply later).
4. **Schema.** None.
5. **Replaced.** Retire the old card-repository ownership methods from the sidebar chat once the new tools cover it.

### 5. Card locations and the move checklist (incl. "in your hand")

1. **Exists.**
   - Storage screen "Binders" and its API [Confirmed: `src/app/storage/page.tsx`, `src/app/api/storage/*`].
   - Move machinery: `move_copy_to_storage`, `move_copies_to_storage`, `assign_physical_copy`, `unassign_copy_to_storage`, `reassign_to_deck`, `force_claim_copy`, `release_deck_copies`, `undo_copy_move` [Confirmed: `supabase/migrations/`; undo route `src/app/api/allocation/undo`].
   - Pick list: `/api/decks/[id]/picklist` and `PicklistV2`, with D-033 making it the primary assembly screen [Confirmed].
   - `LocationPickerModal`, `StorageLocationSelect`, `StorageLocationsSettings`.
   - Unique index stops one copy sitting in two deck slots (`idx_deck_cards_unique_physical_copy`).
   - `mark_copy_missing` / `unmark_copy_missing` RPCs and `user_copies.missing`.
2. **Half-built.** The pick list is per deck; there is no cross-deck combined checklist. The `missing` flag has no owner-facing screen (D-028 retired it).
3. **Decisions.**
   - **D-028 conflicts** with S8 "can't find it, flagged missing": the owner-facing Missing concept was retired. Needs an owner decision (question Q5).
   - D-039 (a removed copy returns to storage), D-033, D-001, D-029, D-059 (states), D-043 (vocabulary: "In your hand" is already listed as a new word in brief section 16).
4. **Schema: yes.** See 15b. A move-plan table (plan, items, two ticks, state) is needed. Location "kind" and an in-hand state do not fit today without either a convention or a column.
5. **Replaced.** The per-deck pick list stays; the combined checklist sits above it and reuses the existing move RPCs.

### 6. Proxy ranking

1. **Exists.**
   - 12 proxies tracked with `is_proxy` plus `proxy_of_deck_id` on `deck_cards` [Confirmed: hosted schema].
   - Add-proxy routes [Confirmed: `src/app/api/allocation/add-proxy/route.ts`, `src/app/api/collection/instances/add-proxy/route.ts`], `free-proxies` and `bulk-assign` routes.
   - "Which decks use this card": `/api/cards/[name]/decks` [Confirmed: route exists; contents Approximate].
   - Reconcile (D-037, card-level shortage matching) [Approximate].
2. **Missing / half-built.** No ranking, no tier, no reason line, no "a real copy exists but another deck needs it more" flag. Needs a score that depends on goal fit (area 8) to be meaningful; without it, rank only by "role the card plays in the deck" and the owner's confirmed core cards.
3. **Decisions.** D-001, D-027, D-037, D-059 (Use proxies toggle), D-029.
4. **Schema.** None required to compute on the fly. Optional cache table later.
5. **Replaced.** Nothing.

### 7. Search (name, effect, plain description, ownership and fit on results)

1. **Exists.**
   - Cmd+K `SmartSearch` calls `/api/ai/search`, which passes the text straight to Scryfall search syntax and decorates results with ownership [Confirmed: `src/components/SmartSearch.tsx`, `src/app/api/ai/search/route.ts`].
   - Name search `/api/cards/search` (local first, ranked, then Scryfall) used by `AddCardSearch`; `autocomplete` proxies Scryfall [Confirmed].
   - `search_owned_cards`, `scryfall_search`, `card_fuzzy_lookup` chat tools [Confirmed: `src/lib/tool-registry.ts`].
   - `ref_cards.oracle_text` on 32,401 cards; `pg_trgm` is installed.
2. **Half-built.** Effect search works only if the owner knows Scryfall syntax. No plain-description search ("rewards me for making tokens"). The vector trial is closed and pgvector is gone; do not rebuild it for this. No fit band or "other deck wants it more" on results.
3. **Decisions.** D-007, D-030, D-035; brief section 14 parks "similar-card search outside his collection (vector trial closed)".
4. **Schema.** None for owned-first results. Plain description needs either an AI translation into Scryfall syntax (no schema, suggested) or the Scryfall oracle-tag files already in `data/scryfall-tags/` (only about 14% of cards carry any of the 15 usable tags per the V-12 report, so tag-only search will be thin).
5. **Replaced.** `SmartSearch`'s raw-Scryfall request is extended, not replaced.

### 8. Tags (auto tags, multi-tag counting)

1. **Exists.**
   - Up to 3 categories per card: one primary plus two additional, stored in `deck_cards.categories` as text/JSON [Confirmed: `src/lib/categoryUtils.ts`, `src/components/CategoryTagEditor.tsx`].
   - Category edit route [Confirmed: `src/app/api/decks/[id]/cards/[cardId]/categories/route.ts`].
   - Suggest from Scryfall tags [Confirmed: `src/app/api/cards/suggest-categories/route.ts`, `src/lib/scryfall-category-mapping.ts`, `src/lib/scryfall-tags-data.ts`].
   - `deck_cards.tags` column exists but is empty everywhere and nothing reads it [Approximate].
2. **Half-built.** Two fields doing near-the-same job. "Counts in every group while the deck total stays 100" is not implemented: group counts need to be checked against the 3-category cap, which would fight the brief ("several tags"). No "auto" vs "his own" marker, so a re-tag could overwrite edits. That breaks the brief's never-overwrite rule (section 13).
3. **Decisions.** D-017 (category counts vs curve), D-032 (generic basics), D-007.
4. **Schema: yes (small).** Decide one home for role tags (`tags`) with an origin per tag (auto / own). Either `tags` becomes structured JSON, or a small `deck_card_tags` table. Types stay in `categories`.
5. **Replaced.** The 3-category cap UI (CategoryTagEditor) is likely replaced by a multi-tag editor; a migration of existing `categories` values is trivial (types only).

### 9. Goal sentence, fit bands, drift check

1. **Exists (partial analogues only).**
   - `deck_strategy` table (`win_condition`, `strategy_notes`, `bracket`) with 0 rows; Strategy tab [Confirmed: `src/components/StrategyTab.tsx`, `src/app/api/decks/[id]/strategy/route.ts`].
   - Dead-weight classifier (format violation, redundant, off-strategy, bracket mismatch via EDHREC synergy) at `/api/decks/[id]/dead-weight` [Confirmed: `src/lib/dead-weight-classifier.ts`].
   - Upgrade tab and candidate code [Approximate: `UpgradeTab`, `src/lib/upgrade-candidates`].
   - `ref_commander_insights` (6,459 rows, 1,462 commanders) and `ref_taxonomy` / `ref_commander_taxonomy` (64,045 links) as raw material for a draft sentence.
2. **Half-built.** `deck_strategy` has no rows because nothing writes a goal. The classifier uses live EDHREC synergy, which exists only for popular cards and says nothing for the owner's own non-meta plans.
3. **Decisions.** D-007 (suggest only: draft and confirm), D-034, brief section 13 (never overwrite his sentence).
4. **Schema: yes (small).** A goal-sentence field (owner-confirmed flag) and a per-card fit band store if cached. Fit bands can be computed on demand at first.
5. **Replaced.** The Strategy tab's free-text win condition is the natural home for the sentence; `dead-weight` stays as one signal.
- **Can fit be judged reliably?** Not proven. Test: pick 3 to 5 of the owner's decks, have him label every card core / supports / loose / off-plan, then score Oracle's bands against his labels and agree an accepted rate before it ships. Ship bands behind "beta" until then.

### 10. Power ceiling, optimisation level, upgrade vs optimise, brackets

1. **Exists.**
   - Bracket select on the Strategy tab and "Bracket N" on the header [Confirmed: `src/components/StrategyTab.tsx`, `src/components/PersistentHeader.tsx`].
   - `mtg_commander_brackets` chat tool: static text for the old 4-bracket scheme, partly wrong [Confirmed: `src/lib/tool-registry.ts`, near lines 719-752].
   - Spellbook client with one function, `findCombosForCard` [Confirmed: `src/lib/spellbook-client.ts`]; `deck_combos` cache read by `/api/decks/[id]/combos` and a Combos tab (`CombosPanel`).
   - Local `mtg-mcp-server` bridge for bracket/combo analysis [Confirmed: `src/lib/mcp-client.ts`], local only, not usable on a hosted site.
   - `ref_commanders.salt_score` shown on the deck header.
2. **Half-built / wrong.**
   - Bracket API accepts 1 to 4 only; the brief needs 1 to 5 [Confirmed: strategy route]. The dead-weight `bracket_mismatch` also uses 1 to 4.
   - No Game Changers data anywhere (no column, no table, no list).
   - Spellbook known bugs, now re-verified against the live API: the code reads `u.name`, but the card name is nested at `uses[].card.name`; and `ordering=popularity` returns least popular first. The live API also returns `bracketTag` per combo (for example "E"), plus `popularity`, `salt`, `status` and `identity` [Confirmed by fetching `backend.commanderspellbook.com/variants/`].
   - Goldfish clock, instant-speed ratio and tutor density: nothing built.
3. **Decisions.** D-007, D-034 (labelled upgrade/optimise only matters once apply is on), brief sections 10 and 13. D-059 untouched.
4. **Schema: yes (small).** A `ref_game_changers` table (card, added date, source, removed date), seeded from the official list and refreshed on each official announcement. Deck bracket and target bracket are already columns on `deck_strategy` / `decks`; widen the check to 1 to 5. Combo cache: reuse `deck_combos`.
5. **Replaced.** The static `mtg_commander_brackets` text is replaced by live data from the new tables. The 1 to 4 validation is replaced.
- Verified thresholds: see section 15e.

### 11. Tokens list

1. **Exists.** Nothing that lists tokens. Importers deliberately skip tokens (D-049, D-051) [Confirmed: decisions.md]. `ref_cards` and `ref_printings` hold no token or `all_parts` data.
2. **Half-built.** None.
3. **Decisions.** D-049, D-051 (tokens never become copies). Brief parks token ownership.
4. **Schema.** None if fetched on demand from Scryfall (`all_parts`) and cached. A cached `ref_card_tokens` table is optional.
5. **Replaced.** Nothing. Note: oracle text alone cannot reliably say which token appears ("create two 1/1 Goblins" is text, but copy-token and "treasure" cases vary), so use Scryfall's structured token links.

### 12. Import small-batch fast path; import history and undo

1. **Exists.**
   - ManaBox modal is the live path, with many `manabox-import` components and `import-*` libraries and the `import_deck_with_intent` RPCs [Confirmed: `src/components/manabox-import/`, `src/lib/import-copies.ts`, `src/lib/import-result.ts`].
   - `ImportSummary` shows totals live; `ImportNoticeLine` lists unmatched lines.
   - `user_copies.source_tag` marks origin (`manabox`, `deck-import`, `manual`) [Confirmed: `src/lib/import-copies.ts`].
   - `import_sleeve_claims` has a `batch_id` but for sleeve claims only.
2. **Dead / old.** Per the 2026-10-22 import-history audit: `import-engine.ts` v1, `csv-import.ts`, `chunked-import-client.ts` are dead. Still live but older: URL/Precon tabs, the onboarding Archidekt/Moxfield flow, and `replace_collection` (API-only). `import-engine-v2.ts` is used by onboarding.
3. **Decisions.** D-044 to D-058 (import), D-049/D-051 (tokens), D-043, D-001 (new copies, never merge). UWIO addendum section 10 says "no undo for now"; the daily-use brief now overrides that for the scope of the new slice.
4. **Schema: yes.** An `import_batches` table plus a nullable `batch_id` on `user_copies` (and deck_cards created by deck imports), so undo can remove exactly what a batch added. Undo rules: never delete a copy that has since been moved into a deck without telling the owner.
5. **Replaced.** Small-batch fast path is a new step in the existing modal (one-line preview and confirm), not a new flow. Dead v1 files can be deleted as cleanup in the same slice.

### 12a. Store quick lookup (S9)

1. **Exists.** `CardLocator` overlay (Cmd+Shift+K) mounted globally, backed by `/api/cards/locate?q=` using fuzzy name lookup; shows decks and slot status [Confirmed: `src/components/CardLocator.tsx`, `src/app/api/cards/locate/route.ts`, `src/app/layout.tsx`].
2. **Half-built.** No box or binder shown, no per-copy proxy flag, no price, no "which decks want it", not phone-sized and keyboard-shortcut-only. Related: `owned-printings` route [Approximate].
3. **Decisions.** D-025, D-030 (a failed lookup is not "Unowned"), D-035, D-040, D-021 (exact printing), D-029.
4. **Schema.** None.
5. **Replaced.** Extends `CardLocator`; no deletion.

### 12b. New cards per set (S6)

1. **Exists.** Printings sync (`printings_last_sync`, `src/lib/card-data-sync.ts`) and `ref_printings.released_at` / `set_code`; Settings has a card data refresh [Confirmed: `src/lib/card-data-sync.ts`, `src/components/CardDataSection.tsx`].
2. **Half-built.** None; no "new" badge or per-set list.
3. **Decisions.** None locked. Depends on the fit band (area 9), otherwise lists are noise.
4. **Schema.** None to start (compute from `released_at`). Optional "seen sets" marker for the quiet badge.
5. **Replaced.** Nothing.

### 12c. Commander discovery (S5)

1. **Exists.**
   - `/explore` page with `CommanderBrowser` and `SuggestedCommanders` [Confirmed: `src/app/explore/page.tsx`, `src/components/explore/`].
   - `/api/commanders/*` (search, featured, eligible, `[id]/insights`, `[id]/builds`) [Confirmed].
   - Data: 7,242 commanders, 64,045 taxonomy links, `v_commander_archetypes` view, `similar_commanders` and `salt_score` columns.
   - Brew flows (`/api/brew/*`, `/api/ai/brew/*`, `src/components/brew-v2/*`) and `new-deck` (about 1,189 lines) [Approximate].
2. **Half-built.** Brew-v2 and `new-deck` are large and mostly parked. Nothing computes "overlap with my 17 decks", "playstyles I don't cover", or "how much I already own" (the S5 asks).
3. **Decisions.** D-007, D-029, brief section 8 (AI asks, does not push the template).
4. **Schema.** None (computed from `ref_commander_taxonomy` and the owner's deck commanders). Only 1 of 9 decks has a commander id; the other 8 have a name only, so match by name first, id later.
5. **Replaced.** Nothing now. Candidate for later pruning of unused brew code, not this brief.

## Section 15 answers

### 15a. Where per-commander "typical numbers" come from

- `ref_commander_builds`: 1,885 builds across 499 commanders. Type counts (lands, creatures, artifacts, enchantments, instants, sorceries, planeswalkers) are filled for 1,880 builds (average about 34.8 lands, 26.0 creatures). [Confirmed: hosted DB, `src/lib/commander-build-data.ts`, `scripts/sync-edhrec-builds.ts`]
- **Role counts are empty for every build** (`avg_ramp`, `avg_draw`, `avg_removal`, `avg_wipes`): EDHREC gives card types, not roles. "Decks built around this commander usually run about 8 removal" cannot be quoted from what is stored today.
- `ref_build_cards` has **450 rows**, 150 each for 3 builds (Wilhelt zombies, Wilhelt aristocrats, Mendicant artifacts). **status.md says "150 rows"; this is a discrepancy to correct in status.md.** The other 1,882 builds have 0 cards, as stated.
- `ref_edhrec_recommendations` is empty. EDHREC top cards are fetched live per commander [Confirmed: `src/lib/edhrec-client.ts`, `getCommanderTopCards`].
- `ref_commander_cards` (11,082 rows) is commander/partner roles, not build data. `ref_commander_insights` is text notes.
- **Recommendation:** derive role counts by classifying the live EDHREC top cards with card text and tags (the classifier's tier-2 path, once it is actually fed card text), cache the result per commander (new small table or JSON on `ref_commander_builds`), and say "based on N cards from EDHREC" in the reason line. If there are fewer than a threshold of classifiable cards, show type targets only and say "no role data for this commander". Never invent a number.
- The vector-trial archive (`docs/oracle/archive/vector-trial-2026-11`) holds the 106k Spellbook combo ingest and tag coverage numbers but nothing about build card lists that would fill the gap.

### 15b. Do the locations fit the data model?

- **In a deck:** yes. A deck slot with `copy_id` is the truth (678 copies are in decks and have no `location_id`).
- **Alphabetical box, lands box, valuable binder:** they can exist today only as free-form named locations. There is no kind or rule behind them, so "put lands in the lands box" and "binder threshold" have nothing to read. **A small schema change is advisable:** a nullable `kind` on `user_locations` (alphabetical / lands / valuable / other). Without it, matching by name is brittle.
- **Valuable-binder threshold:** needs a setting. `user_preferences` does not exist on the hosted DB (migration never pushed), so either push that migration or store the threshold on a settings table.
- **In your hand:** does not fit. A copy is either in a deck slot or in a location. A third state needs a column (for example `user_copies.in_hand_since`) or an item state on the move-plan table. Recommended: state lives on the move-plan item (planned / found / placed), and "in hand" is derived. That way a half-finished plan never leaves a copy in limbo in the main data, which also avoids the D-039 problem.
- **Missing:** `user_copies.missing` exists (0 rows set) but D-028 retired it for owners; see Q5.
- **Slot or page numbers:** parked in the brief; no change.

### 15c. What bracket, Game Changers and combo data exists

- **Game Changers: none** in the database or code. Source options: official list (Wizards) maintained by hand as data; Scryfall also exposes a Game Changers flag in its card search (`is:gamechanger`) [Approximate; not tested here]. Recommend a seed table plus a check against the official page on each Wizards announcement. The next Banned and Restricted announcement is dated November 30, 2026, so the list must be data, not hard-coded.
- **Brackets:** only the owner-set number on `deck_strategy` (0 rows), validated 1 to 4, and the stale static tool text.
- **Combos:** Commander Spellbook client (single function, two known bugs, confirmed against the live API above). The live API also gives a `bracketTag` per combo (for example "E"), which is a ready-made bracket signal and the best reason to fix the client first. `deck_combos` is empty; the Combos tab renders only the cache. Bulk Spellbook ingest (106k combos) exists only in the closed trial's archive.
- **Not available:** mass land denial list, extra-turn list, tutor density, instant-speed share. Each can be derived from card text/tags but needs its own small, tested classifier.
- **Goldfish clock:** nothing exists; this is a simulator project in its own right. Recommend parking it behind everything else (see Q4).

### 15d. Scrollvault (scrollvault.net)

- **No public API found.** I found no developer or API page, and the site's robots.txt disallows `/api/` and the bracket tool's helper endpoints.
- **Terms of Service (updated April 6, 2026):** tools are for personal, non-commercial use; you may use them on your own decks, share results and link. You may **not** "scrape, crawl, or make automated bulk requests to the Site or its APIs".
- **Conclusion:** using Scrollvault as a data source for Oracle is not permitted. Checking a deck by hand in a browser is fine; wiring it into Oracle is not. I did not scrape or call any non-public endpoints. Their own numbers rely on the same public inputs we have (Wizards' Game Changers list and Spellbook), so Oracle should compute its own bracket. If a partnership is wanted, the owner would have to ask them by email (support address is on their site); I would not rely on that.

### 15e. Verifying the owner's bracket thresholds against current Wizards rules

Sources read: Wizards "Introducing Commander Brackets Beta" (Feb 11, 2025), "Commander Brackets Beta Update, October 21, 2025", "Update, February 9, 2026", and the Wizards B&R page of October 12, 2026 (no Game Changers change reported in the snippet). The brackets are still labelled beta. Third-party trackers (commanderbrackets.com, tabletopmeta.com, scrollvault.net's guide) agree the list is **53 cards** as of the February 9, 2026 update, with no Commander bracket changes at the March, May, June, August or October 2026 announcements. I could not fetch the Wizards format page directly, so confirm against `magic.wizards.com/en/formats/commander` before seeding.

| Owner threshold | Current official rule | Verdict |
|---|---|---|
| Game Changers: none in 1-2, up to 3 in 3, unlimited in 4-5 | Same. Bracket 1: none. Bracket 2: none. Bracket 3: up to three. Bracket 4: no restrictions (banned list only). Bracket 5: cEDH. | **Matches.** Note Bracket 1 is a theme bracket and rule zero may allow thematic Game Changers; treat as warnings, not hard blocks. |
| "About 40% instant-speed interaction" | **Not in the official rules.** Wizards publishes no interaction ratio. | **Not an official figure.** Keep it only as a labelled Oracle opinion in "optimisation level", not as a bracket rule. |
| Two-card combo that can win before turn 6 | Bracket 1: no intentional two-card infinite combos. Bracket 2: same. Bracket 3: no intentional early-game two-card infinite (about the first six turns); players "expect to be able to play at least six turns before you win or lose", so the first allowed win is turn 7. Bracket 4: 4 turns; Bracket 5: any turn. | **Partly different.** The combo rule is per bracket, not one global cutoff, and for brackets 1 and 2 any intentional two-card infinite combo counts, not just early ones. Use "wins on or before turn 6" for bracket 3 and "any intentional two-card infinite" for 1 and 2. |
| (Missing from owner list) Mass land denial | Not expected in Brackets 1 to 3 (Armageddon, Ruination, Sunder, Winter Orb, Blood Moon style effects). | **Add.** Hard trigger. |
| (Missing) Extra turns | Bracket 1: none intentional. Brackets 2 and 3: low quantity, not chained or looped. | **Add.** Hard trigger. |
| (Missing) Tutors | Tutor restrictions **removed** in October 2025; Game Changers catch the efficient ones. | **Drop** any tutor limit as a bracket trigger. Tutor density is still fine as an optimisation measure. |
| (Missing) Turn expectations | 9+ turns (B1), 8+ (B2), 6+ (B3), 4+ (B4), any (B5). | **Add** as the reference for the goldfish clock and the combo-turn rule. |

Other flags: the October 2025 change removed 10 cards from the list (Expropriate, Jin-Gitaxias Core Augur, Sway of the Stars, Vorinclex Voice of Hunger, Kinnan, Urza Lord High Artificer, Winota, Yuriko, Deflecting Swat, Food Chain); February 2026 added Farewell and Biorhythm. Any copy of the old list in `tool-registry.ts` or training data is out of date. Wizards said a further bracket-level change would wait until after at least one MagicCon and that dropping "beta" could come later in 2026, so the data layer must be easy to update.

## Locked decisions touched or challenged

- **D-028 (Missing retired)** conflicts with S8 "flagged missing". Needs owner decision Q5.
- **D-059 and D-043**: the brief renames "Assembling" to "Under construction". That is an amendment of D-059's label and the vocabulary file; it does not change D-059's behaviour (Unowned cards / Under construction / Playable, Use proxies toggle).
- **D-034 / D-009 / D-007**: the brief is suggest-only, so apply with undo is out of scope; any "move" in the checklist writes to the physical plan only after the owner ticks.
- **D-049, D-051**: tokens are not copies; the token list must not create any.
- **D-029** (all decks count): proxy ranking and "wanted elsewhere" must count every deck.
- **O-002 (multi-user scale)** and brief section 13: the health route has no user filter; fix as part of any slice that touches it.
- **status.md correction (not a locked decision):** `ref_build_cards` is 450 rows, not 150.

## Challenges to locked decisions
- D-028 (see above). Challenge is narrow: reuse the existing missing flag, or create a new "can't find it" note on the checklist item. Recommended in Q5.

## Recommended build order (smallest first; owner sees each)

1. **Slice 1: Bracket data foundation (small).**
   - Fix the two Spellbook bugs, widen bracket to 1-5, add `ref_game_changers` seeded from the official list (53 cards), replace the stale bracket tool text, show the bracket on the deck page from Game Changers count only.
   - Owner sees: a count of Game Changers and the bracket range the deck can be in.
   - Dependency: none. Risk: list drift; mitigate by a date stamp on the page.
2. **Slice 2: Store lookup upgrade (small).** Phone layout, boxes and binders, per-copy proxy, estimated price, "decks that want it". Needs no schema. Owner sees: type a name in a shop and read the answer. Can run before or alongside slice 1.
3. **Slice 3: What's-missing view v1 (medium).** Feed card text to the classifier, per-commander type targets from the 1,880 builds, honest "no data" fallback for roles, clickable gaps leading to spare cards then buy ideas. Fixes the all-red health result. Dependency: none beyond the fix. Risk: role counts for most commanders come from live EDHREC, which is not stored; keep the cache small and labelled.
4. **Slice 4: Locations and move checklist (medium-large; schema).** Location kind, move-plan table, two ticks, "in your hand" derived from item state, "can't find it" per Q5. Depends on owner answers Q3 and Q5. Risk: a move that leaves another deck short must always say so (section 13).
5. **Slice 5: Tags (medium; schema).** One home for role tags with auto vs own origin, multi-tag counting. Feeds slices 3 and 7. Could move earlier if role counts in slice 3 need tags.
6. **Slice 6: Proxy ranking (medium).** Ranked decks with tier and reason; flags on proxies. Better after slice 7 fit bands exist, but can ship first using roles and confirmed core cards only.
7. **Slice 7: Goal sentence, drift, fit bands (large; needs a test set).** Run the golden-deck test with the owner's own labels first. Risk: highest; do not rely on bands until the agreed hit rate is met.
8. **Slice 8: Search by plain description and ownership/fit on results (medium).** AI translates a description into a Scryfall-style search, results ordered by fit (needs slice 7) with an "owned first" switch.
9. **Slice 9: Power ceiling and optimisation level, upgrade vs optimise labels (large).** Needs slice 1, slice 5 and combo cache. Goldfish clock last or parked (Q4).
10. **Slice 10: Import small-batch fast path and history/undo (medium; schema).** Independent; can be pulled forward if imports are the daily pain (17 decks are still to import).
11. **Slice 11: New cards per set, tokens list, commander discovery additions.** Each small and independent; tokens can use Scryfall's structured links on demand.

Cross-cutting risks: no role data for most commanders; the fit-band reliability; list drift on Game Changers; a second source of truth for ownership (old card-repository vs new tools); testing must use the test account only.

## Open questions (behaviour, recommendation first)

1. **When a deck has no stored role numbers for its commander, what should the "what's missing" view say?**
   Example: Korvold has no removal count stored.
   a) (Recommended) Show type counts only and write "no role data for this commander yet", and show the generic target labelled "general guide". b) Hide the role rows. c) Estimate from similar commanders and label it.
2. **Should the "optimise" suggestions ever show a bracket warning on their own?**
   Example: a deck at bracket 2 with target 2, and the owner views a Demonic Tutor.
   a) (Recommended) Only upgrade-labelled cards warn; optimise cards never do. b) Warn on anything that changes the bracket, however labelled. c) Warn only when a target bracket is set.
3. **How should "in your hand" look when you stop partway?**
   Example: you ticked "found" on Sol Ring but never "placed" and close the app.
   a) (Recommended) It stays as "in your hand" on the checklist and in Oracle until you tick placed or put back, nothing else changes. b) After a day it goes back to where Oracle last had it. c) Ask each time you reopen.
4. **Is the goldfish clock (a solo test of how fast a deck wins) worth doing now?**
   Example: a deck's median win turn 8, best case turn 5.
   a) (Recommended) Park it and show only the official bracket triggers plus Oracle's own ratios first. b) Build a rough estimate from curve and combos. c) Build a real simulator later.
5. **When a card is not where Oracle says, what happens?**
   Example: the checklist says Sol Ring is in the lands box; it isn't.
   a) (Recommended) Add a "can't find it" note on that checklist item only, keep the card in the last known place and ask where to look next; no use of the old Missing label. b) Reuse the old Missing flag and bring Missing back (reverses D-028). c) Move it to Unsorted until found.
6. **Where does the valuable-binder price limit apply?**
   Example: limit set at $20 and a $25 card is in a deck.
   a) (Recommended) A suggestion only: the checklist says "this is above your binder limit" but deck cards stay where they are. b) Prompt a move to the binder anyway. c) Ignore decks entirely.
7. **When the official Game Changers list changes, how should existing decks behave?**
   Example: a card is added and a bracket 3 deck now has four Game Changers.
   a) (Recommended) Keep the deck and show a banner "bracket may now be 4". b) Recompute silently. c) Require you to confirm every time.

## Changed files
- Created: `docs/oracle/reports/2026-11-11-architect-daily-use-audit.md` (this report). Nothing else.

## New decisions
- None locked. Proposed for the owner to confirm: Oracle computes brackets itself (Scrollvault not usable); Game Changers stored as dated data; brackets 1 to 5; "instant-speed 40%" kept as an Oracle opinion, not a rule; "in your hand" derived from a move-plan item state.

## Assumptions
- The owner's 17 decks will be imported into the same schema, so numbers will change.
- Scryfall is still a permitted live source for token and tag lookups (existing practice).
- The 53-card Game Changers count comes from Wizards' February 2026 article and third-party trackers; the official format page was not readable here.

## Verification
- Read-only SQL counts on the hosted project; code read directly for tagged paths; Wizards articles and Scrollvault terms and robots.txt read online; Commander Spellbook variants endpoint fetched once (one call, no bulk access). No code, migration or database change. Tests were not run (read-only audit).
