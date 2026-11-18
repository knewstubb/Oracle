# Contract: CC-07 Filterable collection search (Claude connector)

Status: DRAFT. Amended 2026-11-16 (role search, section 13; no further database change). Owner decisions 2026-11-16: (1) applying the view APPROVED in principle (the developer applies it; see section 12 for the amended view that must be what gets applied); (2) colourless cards appear when searching a colour APPROVED; (3) subtype and keyword search REQUIRED (section 12). Nothing is built. **No migration is applied by the Architect.**
Author: Architect, 2026-11-16. Brief (approved with defaults): `docs/oracle/briefs/connector-collection-search.md`. Types: `docs/oracle/contracts/connector-collection-search.types.ts`. Draft migration: `supabase/drafts/20261116200000_connector_collection_copies_view.draft.sql` (rollback next to it). Audit and slice plan: `docs/oracle/reports/2026-11-16-architect-cc07-audit-and-slices.md`.
Builds on: `claude-connector-slice-a.md`, `connector-card-facts-and-deck-health.md` (card facts, CC-06, already live).
Tags: `[Confirmed: path]` = read in the repo. `[Live]` = read-only query on the hosted project on 2026-11-16.

## 1. What Claude gets (plain words)

Claude can ask for "green creatures I own that are free", "everything in the Unsorted box", or "how is my collection split by colour", and get exactly that, with a true total and a clear "N more" when there is more. Whole-collection questions take one or two calls instead of about 113.

## 2. What exists today (audit summary)

- `search_collection` takes only name, free-only, include-proxies, limit, offset. [Confirmed: `src/lib/connector/tools/search-collection.ts`]
- With free-only or no-proxies it reads every matching card, 200 at a time, and filters in the app. It stops after **3,000 cards** (`SCAN_CAP`) and says so in a note. [Confirmed: same file] Live: **2,832 distinct cards**, so the owner is 168 cards (about 6%) from the cap. After that, free-only totals would be wrong and later cards would be invisible. [Live]
- "Free" today means "in no deck". It does **not** leave out In your hand or Missing copies, which breaks the app-wide supply rule (status.md, Picklist slice 1). Copies read from `user_copies` do not even select the in-hand flag, so an in-hand copy shows location "unknown". [Confirmed: `search-collection.ts` `copyCols`, `copyViews`]
- Type, mana value and colours are not on the user's own cards: `user_cards.type_line` and `color_identity` are **empty on all 2,832 live cards**. [Live] They exist only in the shared card library `ref_cards`, matched by exact card name (no id link). [Confirmed: `src/types/supabase.ts`, `card-facts.ts`] Today facts are fetched for the 25 cards on a page only.
- The connector's database handle can only `select` (no functions, no writes) and only supports equals, in-list, name-like, is-null, not, order, range, limit. [Confirmed: `src/lib/connector/user-client.ts`] Greater-than and less-than do not exist yet.
- Wishlist: **no collection wishlist exists.** The only wishlist is a yes/no on an import claim, deliberately inert. [Confirmed: `src/app/api/onboarding/reconciliation/instance/wishlist/route.ts`] Not cheap, not read-only data: **deferred** (section 9).

## 3. Does it need a database change? Yes: one read-only view

Why the app alone is not enough: to filter by type or colour the app would have to look up facts for all 2,832 cards (about 29 requests of 100 names) on every question, on top of the copy and deck lookups, and would still hit the 3,000 ceiling. Counting by type or colour would need the same. Rejected options:
- **Fill in `user_cards.type_line` / `color_identity`** (a data write): two sources of truth that drift, needs a backfill of live data and a change to every import path. Rejected.
- **A stored function (RPC) for search**: works, but the connector handle is deliberately select-only (contract slice A section 7.3); adding function calls weakens that guarantee for every tool. Keep as the fallback if the view is ever too slow at multi-user scale.
- **View (chosen)**: stores nothing, reversible by dropping it, keeps the select-only handle, runs as the signed-in user so row protection applies.

### 3.1 The view: `connector_collection_copies` (one row per copy)

DRAFT file: `supabase/drafts/20261116200000_connector_collection_copies_view.draft.sql`. Primary key of the view: `copy_id` (`user_copies.id`). Joins: `user_copies` to `user_cards` (card_id), `ref_cards` (exact name, left join), `deck_cards` (unique on copy_id, so no duplicate rows), `decks`, `user_locations`. Indexes used: `user_copies(user_id, card_id)`, the unique `deck_cards(copy_id)`, `ref_cards` primary key (name). **No new index.** Measured live: a join with a type and colour filter ran in about 160 ms at 4,550 copies and 32,533 library cards. [Live]

| Column | Meaning |
|---|---|
| `user_id`, `copy_id`, `card_id` | owner, copy, `user_cards.id` |
| `oracle_id` | oracle_id (card across printings) |
| `card_name`, `printing_id`, `finish`, `is_proxy`, `missing`, `in_hand` | as on the copy. `printing_id` is a scryfall_id |
| `place_kind` | `missing`, `in_hand`, `deck`, `storage`, or `unplaced`, first match wins in that order |
| `deck_id`, `deck_name`, `location_id`, `storage_name` | where it is |
| `is_free` | not in a deck, not In your hand, not Missing |
| `facts_available` | the card name was found in the card library |
| `type_line`, `mana_value` | from the library; null when no facts |
| `colour_letters` | letters in the order W U B R G, `''` = colourless, null = no facts. Hides the library's two spellings ("R, W" and "BW") [Live] |
| `has_w/u/b/r/g`, `is_colourless` | one yes/no per colour |
| `t_creature`, `t_instant`, `t_sorcery`, `t_artifact`, `t_enchantment`, `t_planeswalker`, `t_land`, `t_battle` | type line contains the word. A two-faced card counts for every type on either face |
| `primary_type` | one type per card for counting: Land, Creature, Planeswalker, Battle, Instant, Sorcery, Artifact, Enchantment, Other. Front face only. "Artifact Creature" counts as Creature |

Access: `security_invoker = true`, so the existing own-row policies on the underlying tables apply; `anon` has no access; `authenticated` can select. Every connector query still adds the owner id (slice A rule). **Write path: none. Atomic: n/a. Reversible: drop the view.**

Live check of the view's logic (select only, nothing created), 2026-11-16: 4,550 copies; 1,780 in decks, 2,770 in storage, 0 unplaced; 124 copies (100 distinct cards) have no library facts; 392 green-only creature copies. [Live]

### 3.2 Known data limits (state them in answers, never hide)

1. **100 owned cards (3.5%) have no library facts** (exact-name match fails; 57 of them are two-faced "A // B" names). [Live] They cannot match a type, colour or mana value filter. Rule: the answer says how many such cards exist whenever one of those filters is used (`filterCoverage`), and the summary shows them as one "No facts" group. Never counted as colourless. Fixing the library gap is a separate data task (flag to Gene), not part of this build.
2. ~~The library's type line drops subtypes on many cards (11,237 rows end in a bare dash).~~ **WRONG, corrected 2026-11-16 (owner decision 3).** A type line ending in a dash means the card has no subtypes (an Instant, a Sorcery, Sol Ring), not that they were dropped. Subtypes are present wherever the card has them. Subtype and keyword search is in scope: see section 12.
3. `primary_type` is by front face; `types` filter is by either face. Counts by type therefore add up to the total (one type each), while a type filter can return a card that is counted under a different type in the summary. Stated in the tool description.

## 4. Owner approval (migration gate): APPROVED 2026-11-16 (view applied by the developer, not the Architect; amended version, section 12.3)

The view is not applied. Before the build slice that uses it can be merged, the owner approves applying it to the hosted database (additive, stores nothing, one-line undo). Per standing rule: no blanket `db push`; apply this one file only; then a read-only check as a normal signed-in user (not the admin key) that it returns only the owner's rows and that `anon` is refused.

## 5. `search_collection` (changed)

Input and output types: `connector-collection-search.types.ts`. Strict input: unknown fields rejected.

### 5.1 New and changed inputs
- (Role filter: section 13.) `types[]` (any of eight), `colours[]` with `colour_match` (`within` default, `exact`, `includes`), `colourless`, `mana_value_min/max`, `location`, `only_proxies`, `include_rules_text`.
- **Colour meaning (default `within`)**: "green" returns cards you could put in a green-only deck, which includes colourless. `exact` with `["G"]` returns mono-green only. `includes` with `["G"]` returns anything containing green. `colourless: true` = no colours at all. Cannot combine `colourless` with `colours`.
- **`location`** matches a deck name, box or binder name, or "In your hand" / "Missing", case-insensitive, exact. If nothing matches, the answer is `ok` with zero results, a note, and `knownPlaces` (up to 50 names) so Claude can retry. A name shared by a deck and a box returns both (each row shows where it is).
- **`only_free` (behaviour change, per approved default 2)**: a copy counts only if it is in no deck and is not In your hand and not Missing. Same rule as the rest of the app. Old behaviour (only "in no deck") is gone, not kept alongside.
- `only_proxies` and `include_proxies=false` together is `INVALID_INPUT`.
- All filters apply to the same copy: "free proxies in the Unsorted box" means copies that are all of those at once.

### 5.2 Rows and paging (per approved default 3)
- **One row = one card + one kind (original or proxy).** A card with 2 originals and 1 proxy is two rows (`kind: original, copyCount 2` and `kind: proxy, copyCount 1`). New field `kind` on each row; everything else on a row is unchanged (facts, up to 20 copies, `copiesTruncated`). Only copies that match the filters are counted and listed.
- Sort: card name A to Z, original before proxy.
- `total` = matching rows (exact), plus new `totalCopies` = matching copies (exact). Paging as today (`limit` 1 to 25, `offset`); the existing note "Showing N of T. Ask for the next page with offset X." stays. Byte cap 40 KB and `fitRows` stay.
- `CopyView.location` gains `in_hand` and `missing` kinds, so an In your hand copy no longer reads "unknown". Slice A types file gets this one additive change.

### 5.3 How it reads the data (no scan cap)
1. One database query on the view, owner id plus all filters pushed down, narrow columns (`card_id, card_name, is_proxy, copy_id`), ordered, read in pages of 1,000 by the existing `fetchAll`. At 4,550 copies that is at most 5 small requests. The 3,000-card cap and `SCAN_CAP` are deleted.
2. Group those rows in the app into card+kind rows; total, totalCopies and the page window come from this; the count is exact because every matching row was read.
3. For the page's rows only, fetch full copy detail (existing `copyViews` logic, replaced by the view's `deck_name`, `storage_name`, `place_kind`) and card facts (existing `fetchCardFacts`, rules text per `include_rules_text`).
4. **Failure is loud**: if more than the read ceiling (20 pages = 20,000 matching copies, existing `fetchAll` limit) would be needed, or any request fails, return `LOOKUP_FAILED` (D-030), never a short list. 20,000 copies is 4 times today's collection; revisit with the RPC fallback if the collection ever approaches it.
5. A database error is never an empty result.

### 5.4 Reads need additions to the handle (amended: also `contains` and `overlaps`, section 12.5)
`gte` and `lte` on `ReadQuery` (for mana value). Still select-only. A small unit test proves the handle exposes no write or function call (existing registry-and-isolation test updated).

## 6. Summary view: `get_collection_summary` gains optional input

- No input: answer unchanged (counts as today). With input: the same filters as search plus `group_by` = `type` | `colour` | `location` | `kind`.
- Answer: `groups` (label, copies, distinctCards), largest first, at most 60 (`groupsTruncated` says when cut), plus overall `totalCopies` and `distinctCards`. About 1 to 2 KB, no paging.
- Reads narrow columns from the same view (`fetchAll`), grouped in the app. Grouping by `type` uses `primary_type`; by `colour` uses `colour_letters` and labels like Green, Black/Red, Colourless (5-colour = "Five colour"); by `location` uses deck name, storage name, "In your hand", "Missing"; cards with no facts show as "No facts" in the type and colour groupings, so groups always add up to the total.
- Example (S2): `group_by: colour` returns one list, for example Colourless 446, Green 380, and so on, in one call.

## 7. Locked decisions touched

- **D-001 / D-003**: unchanged. Read-only; `oracle_id` and `printing_id` labelled in the view.
- **D-030** (a failure is never "none"): enforced in 5.3 and in the cards-without-facts coverage note.
- **D-035** (outside data labelled): prices keep their "Estimate from Scryfall" label; nothing new is shown.
- **Slice A rules**: select-only handle (extended with gte/lte only), user id on every query, strict input, tool-count snapshot (no new tool; the registry test changes only for new input fields).
- **Supply rule (status.md, Picklist slice 1)**: this build brings `only_free` into line. No conflict.
- No decision is in conflict. Nothing needs changing in `decisions.md`.

## 8. What gets deleted when this ships
`SCAN_CAP`, the 200-card batch scan, the in-app free filter and `copyViews` helper (replaced by view columns) in `search-collection.ts`; the "Only the first 3000 matching cards" note; the old "only copies that are not in any deck" wording in the tool descriptions (tool registry and slice A contract line 106 get a "superseded by connector-collection-search.md" mark). The fast path (no filters) is also replaced by the view path so there is only one way to search.

## 9. Wishlist (default 4): deferred, not cheap
Needs a new wishlist concept (table, owner screen, import link), none of which exists. Not read-only. It is a separate brief; no work here.

## 10. Role search (ramp, draw, removal, wipes)
**SUPERSEDED 2026-11-16: the earlier deferral is reversed by owner decision. Role search is IN scope for CC-07. See section 13.** (Old text said a stored tagging pipeline was needed; the decision is the opposite: nothing is stored, roles are computed live.)

## 11. Test plan summary
Unit tests on the mock database for every filter and the free rule; live read-only checks by the Tester against the owner's collection (no separate test account exists yet, so the save path is not involved; this build writes nothing). Acceptance checks per slice are in the report.

## 12. AMENDMENT 2026-11-16: search by subtype and by keyword (owner decision 3)

### 12.1 Audit: where subtypes and keywords come from (all `[Live]` read-only, 2026-11-16, unless tagged)
- **Subtypes are NOT dropped.** The earlier finding was a misreading. The library (`ref_cards`) writes the type line as "types, comma separated, dash, subtypes" (for example "Creature — Elf, Druid", "Artifact, Land —"). 11,237 rows end in a bare dash because those cards genuinely have no subtype (Instants, Sorceries, Sol Ring, Mox Pearl). Cross-check with the downloaded card data file (MTGJSON `AllPrintings.sqlite`): Ancient Den has types "Artifact, Land" and empty subtypes. Of 17,937 creature rows, exactly 1 has a bare dash (Nameless Race, which really has no subtype). On the owner's 2,832 cards, 0 creature/Equipment/Aura/Vehicle/Saga cards have an empty subtype list. [Confirmed: scripts/sync-card-keywords.ts and `data/AllPrintings.sqlite` read-only]
- **Keywords are stored**: `ref_cards.keywords` is a list column (803 distinct keywords, 16,121 cards filled; the rest are null, which is how the source marks "no keywords", for example Llanowar Elves, Sol Ring). Filled by `scripts/sync-card-keywords.ts` from MTGJSON, which carries the same list Scryfall calls `keywords`. Cross-check: 17,148 of 34,633 card names in the source have keywords; library has 16,121 (the gap is name matching and the 132 two-faced names, 118 of which are filled). Test: only 2 library cards show a keyword word at the start of a rules-text line while the list is null; **0 of the owner's cards**. [Confirmed: same script; Live]
- **What is NOT on the owner's own cards**: `user_cards.type_line` and `color_identity` are empty on all 2,832 (known); there is no keywords column there. So subtypes and keywords come only from the library, joined by exact card name, same as type and colour. Same 100 owned cards (3.5%) have no library match and cannot match any of these filters.
- Scryfall bulk data stores `type_line` and a `keywords` array too, so a re-pull is possible, but **it is not needed**: nothing is missing for the owner's cards.
- "Kinship" is not a creature type; it is an ability word. It exists as a keyword on 12 library cards and in rules text. Searching keyword "kinship" works for those 12; searching subtype Kithkin/Elf etc. works as normal. The tool description tells Claude this so it picks the right filter.

### 12.2 Result: NO backfill, NO data change needed
Live dry run of the exact logic (select only): 2,832 owned cards; 69 Elf, 38 Equipment, 3 Kithkin, 213 flying, 37 haste, 42 deathtouch, 6 flying and haste; 8 cards with multi-word subtypes (such as Time Lord, kept as one word group). Nothing to repair. The only schema change is two more columns on the same read-only view (below). This is why the "backfill / owner approval / N cards unsearchable until done" path is **not triggered**; it is specified in 12.6 as a standing fallback in case the later live check disagrees.

### 12.3 View amendment (still ONE read-only view; same approval, same rollback)
Draft file updated: `supabase/drafts/20261116200000_connector_collection_copies_view.draft.sql`. Two new columns:
- `subtypes` (list of lower-case words): everything after the dash on either face, split on commas. `{}` = the card has no subtypes. null = no library row (never read as "none").
- `keywords` (list of lower-case words): the library list, lower-cased. `{}` = none. null = no library row.
No new table, column on a user table, or index. Still `security_invoker`, `anon` refused, drop view to undo. A two-faced card matches subtypes and keywords of either face (same either-face rule as types).
**Important for the developer**: the owner approved applying the view; the version to apply is this amended one. If the earlier version was already applied, apply the amended file as `create or replace view` (adds two columns at the end of the column list; no data effect). Apply that one file only, then the S0 check, then add one read check: 69 distinct Elf cards, 213 distinct flying cards in the owner's collection.

### 12.4 Search inputs (see types file)
> **PENDING OWNER ANSWER, proposed defaults in use until answered:** several keywords = card must have ALL of them (`keywords_match` default `all`); several creature types/subtypes = card may have ANY of them. Both are one-word changes if the owner decides otherwise.
- `subtypes[]` (1 to 10 words): case-insensitive, exact word ("elf" does not match "Elfhame"-style words; matching is on whole list entries, not text). Card matches if it has ANY listed subtype. Multi-word subtypes are one entry ("Time Lord").
- `keywords[]` (1 to 10 words) with `keywords_match` = `all` (default: "flying haste" means both) or `any`. Whole-entry match, case-insensitive.
- Both combine with every other filter by AND, apply to the same copy, and appear in the summary tool as filters too. No new `group_by` (not requested; "how many Elves" is the total of a filtered search).
- Rows now show the card's `keywords` so Claude can confirm a match without a second call.
- Unknown word: not an error. Zero results plus a note "No owned card has the subtype 'x'". When a word has no exact match but is a near spelling of a known one (for example "elves" vs "elf", "first-strike" vs "first strike"), the note suggests the real spelling. Suggestions come from the owner's own distinct subtypes/keywords (one small narrow read on the view; ceiling 500 words).
- `filterCoverage` now also fires for subtype and keyword filters: "100 owned cards have no card facts yet, so they cannot be matched."
- Input validation: words trimmed, 1 to 40 characters, no empty entries; otherwise `INVALID_INPUT`.

### 12.5 Reads (handle) and honesty rules
- The read handle gains `contains` (list has all of these) and `overlaps` (list has any of these), next to `gte`/`lte`. Still select-only; the registry/isolation test proves no write or function call is exposed.
- Total and page counts stay exact (same one read of the view). Failure is `LOOKUP_FAILED`, never an empty list (D-030).
- Keyword caveat to state in the tool description: keywords are the card's printed keyword abilities (Flying, Haste, Landfall...), not words that merely appear in rules text ("target creature gains flying" does not make a card a flying creature). Claude can still use `query`/rules text for the rest.

### 12.6 Standing fallback (only if the live check in S0 disagrees): additive backfill, FLAGGED for owner approval
Not needed today. If the S0 check finds owned cards with empty subtypes or keywords that should have some, the fix is a script, not a migration, and it is **additive and non-destructive**:
- Re-run `scripts/sync-card-keywords.ts` style update, but only set `keywords` where it is currently null, and only for names that exist in the source (never overwrites a filled value, never deletes). For type lines, only fill a type line where the library one is empty (today: 0 rows).
- Dry run first (prints counts and 20 samples, writes nothing), owner approves the numbers, then a real run in batches of 50 with a log of every name changed so it can be undone by name. Needs the admin key, so it is run by the owner/Gene, not the connector. No drop, truncate or recompute.
- Until it runs: the answer carries `filterCoverage` stating exactly how many owned cards are unsearchable for that filter ("N cards have no subtype or keyword data yet, so they are not in these results"), and counts still add up. N is computed live, never hard-coded.


## 13. AMENDMENT 2026-11-16: search by ROLE (owner decision; reverses deferral in section 10)

### 13.1 What the owner gets (plain words)
Claude can ask for "removal I own that is free", "green ramp not in a deck", "how many wipes do I have", or see a role breakdown of the collection. The roles are exactly the ones Deck health shows (ramp, draw, removal, wipes), worked out from rules text at the moment of the question. Nothing is stored, so a rule fix in Deck health changes search the same day.

### 13.2 Audit [Confirmed: src/lib/card-roles.ts, src/lib/deck-health.ts, src/lib/spare-copy-browse.ts]
- Roles come from ONE pure function, `rolesForCard({name, typeLine, oracleText})`, returning any of ramp, draw, removal, wipes (a card can have several; Damn = removal + wipes). Role list is `ROLE_ORDER`; rules version is `CLASSIFIER_VERSION` (now 2 after the cost-reducer fix; Sapphire Medallion etc. count as ramp). [Confirmed: ramp-cost-reducers report]
- Lands (front face a land) never have a role. Cards with empty or missing rules text have no role and Deck health counts them as "unclassified". Only the FRONT face's text is read; the back face of a two-faced card is ignored. Deck health's "Lands" row is a type count, not a role, so it is NOT a search role (use `types: ["land"]`).
- Deck health reads only the main deck and skips the commander; collection search covers every copy. So a role count in search is "copies of cards that have the role", not "copies the deck counts". Stated in the tool description.
- An existing precedent already does what is proposed: the spare-copy browse asks the database for cards whose text contains a cheap "needle" (`ROLE_TEXT_NEEDLES`), then calls `rolesForCard` for the real decision. [Confirmed: spare-copy-browse.ts]
- Live check (the Developer runs it in S2, read-only): number of owned cards per role, and the number of owned cards with a library row but no rules text.

### 13.3 Design decision: how to match (Architect, recommended and chosen)
| Option | Verdict | Why |
|---|---|---|
| A. Duplicate the rules in SQL (in the view or a function) | Rejected | About 170 lines of text rules with normalisation would exist twice; the first rule fix (the ramp one just happened) would make search and Deck health disagree. Also a function weakens the select-only rule. |
| B. Stored role column (on the library or the user's cards) | Rejected | Owner said nothing stored. Needs a backfill and a rewrite whenever rules change (stale-tag risk, destructive recompute). Library is shared across users. |
| **C. Classify in the app, only the already-filtered candidate set, with the same function** | **CHOSEN** | One source of truth by construction, no database change, always current, and the candidate set is at most about 2,832 distinct cards. |

How C works (extends 5.3; the role step sits between "read matching copies" and "group and page"):
1. Query the view with every OTHER filter pushed down (owner id, types, colours, location, free, etc.), narrow columns, as in 5.3. Add `facts_available` to the narrow columns.
2. Take the distinct card names of the matching copies. Fetch `name, type_line, oracle_text` for them from the card library in batches of 200 names (the existing card-facts pattern; primary key lookup), at most 15 small reads today. Hard ceiling: 5,000 distinct names (25 batches); above that return `LOOKUP_FAILED`, never a partial list (D-030).
3. Run `rolesForCard` per distinct card (once per card, not per copy). Keep copies whose card has the wanted role(s). Cards with no library row, or no rules text, cannot be classified: they are NOT matched and are counted in the coverage note.
4. Group, total and page as before. Totals stay exact because the role step happens before paging.
5. Optional later speed-up (not built now): add the library text to the database read with the needle prefilter. It would only narrow candidates; `rolesForCard` still decides. No view change is needed for it.

**Single source of truth rules (acceptance-tested):**
- The connector imports `rolesForCard`, `ROLE_ORDER` and `CLASSIFIER_VERSION` from the shared role module. No second copy of any role rule, regex or word list anywhere in `src/lib/connector/`, and none in SQL. The valid role names in the input come from `ROLE_ORDER` (not retyped).
- A parity test feeds the same saved fixture cards through search's role step and through Deck health's `classifyDeckCard`; role sets must be identical for every non-land card. A guard test fails if the connector folder contains the classifier's phrases.
- Lands excluded as today (the function returns no role for them); a role filter never returns a land.
- The answer carries `roleRulesVersion` (the `CLASSIFIER_VERSION` used), so a Tester can tell which rules produced a number.

### 13.4 Inputs and answer (see types file)
- `roles?: Role[]` (1 to 4 of ramp, draw, removal, wipes). `roles_match?: 'any' | 'all'`, default `any`. **PENDING OWNER ANSWER (new, proposed default): several roles = card has ANY of them.** "Removal and wipes" as `all` returns only cards that are both (Damn).
- Combines with every other filter by AND on the same copy. Also accepted by `get_collection_summary`.
- Each result row shows `roles` (computed with the same function from the facts already fetched for the page), so Claude can confirm why a card matched.
- `filterCoverage` (when a role filter or role grouping is used) gains `cardsWithoutText`: owned cards in the candidate set that have a library row but no rules text. Together with `cardsWithoutFacts` (no library row; about 100 today, 3.5%) the note says exactly how many owned cards could not be checked, for example: "100 owned cards have no card facts and N have no rules text, so they cannot be matched by role." Both numbers are computed live within the cards that pass the other filters (so a "free green" search reports only those that matter). Never hard-coded, never hidden.
- Honest limits stated in the tool description: roles are a best guess from rules text, same as Deck health; front face only; lands never have a role; cost reducers count as ramp; roles are not the same as EDHREC categories.
- Unknown role value: `INVALID_INPUT` listing valid roles.

### 13.5 `get_collection_summary` role grouping (cheap: yes)
`group_by: 'role'` is added. It reuses the same role step, then groups: Ramp, Draw, Removal, Wipes, "No role" (checked, none of the four; includes lands), "No facts" (not checked: no library row or no rules text). Because a card can have several roles, role groups OVERLAP, so group totals can add up to more than `totalCopies`; the answer's `note` says so, and "No role" plus "No facts" plus "any role" is the identity. The first-class counts `totalCopies` and `distinctCards` stay exact and unduplicated. Lands appear under "No role" (they are not a role); a land is therefore still countable via `group_by: type`.
Cost: one extra step of at most 15 small reads; answer stays about 1 to 2 KB.

### 13.6 Database change
**None.** The approved read-only view is unchanged (no new column, no new index); the amended draft in `supabase/drafts` stays the one to apply. Nothing to flag for owner approval for roles. Re-evaluate only if the collection passes about 5,000 distinct cards (the ceiling above), when the fallback is the needle prefilter in the database read (still no stored role).

### 13.7 Slice amendments (replace/extend slices in the audit report; order S0, S1, S2, S3, S4 unchanged)
- **S0, S1**: unchanged.
- **S2 (Developer) grows**: add `roles`, `roles_match`; the role step (13.3), `roles` on rows, `cardsWithoutText`, `roleRulesVersion`; tool description lines (13.4). Accept: (a) "free removal" total equals an independent count made by running `rolesForCard` over the same cards in a throwaway script; (b) role + colour + type + location combine on the same copy; (c) `roles: [removal, wipes], roles_match: all` returns only dual-role cards and a known one (Damn) is in it if owned; (d) a land never appears under any role; (e) a card with no library row is never matched and the note count equals the live number of such cards in the candidate set; (f) parity test with Deck health and the guard test pass; (g) a card changed by a rule edit (bump the version in a test) changes search with no other change; (h) over the ceiling or any failed read gives `LOOKUP_FAILED`; (i) unknown role gives `INVALID_INPUT`; (j) registry snapshot shows the new inputs only.
- **S3 (Developer)**: summary accepts `roles`, `roles_match` and `group_by: 'role'`. Accept: filtered totals equal search totals; role groups carry the overlap note; "No role", "No facts" present; no input still identical to today.
- **S4 (Tester)**: add role scenarios: ramp, draw, removal, wipes counts against an independent direct count; Sol Ring (ramp) and a known wipe appear; a land is absent; the coverage note's numbers match direct counts; the Sapphire Medallion type of cost reducer appears under ramp (current rules). Scribe: tool description lists the role limits.

### 13.8 Locked decisions touched
None in conflict. D-030 enforced (ceiling and failures are loud; unclassifiable cards are counted, not hidden). D-001/D-003 unchanged (read-only, oracle_id/printing_id as before).

## 14. AMENDMENT 2026-11-18 (CC-14): better search for Claude, no database change
### 14.1 What changes, in plain words
Claude can search the words on a card ("put a +1/+1 counter"), ask for Legendary cards or commander candidates, list the owned cards that have no card data, sort results by mana value, and count the collection by creature type or by mana value in one call. Search results no longer include rules text unless Claude asks for it.
### 14.2 Decisions (owner approved 2026-11-18)
1. **Rules text.** `text` (1 to 100 characters, at most 8 words) with `text_match`: `all_words` (default) = every word appears somewhere in the rules text of either face, any order, not case sensitive, partial words count; `phrase` = the exact words in that order, never across the gap between two faces. A search with no result carries a hint that rules text says "put" not "puts" and "this creature" not the card's name.
2. **Two-faced cards.** Text covers both faces. Cards with no stored text cannot match and are counted in `filterCoverage.cardsWithoutText`.
3. **Legendary.** `legendary: true` = Legendary on either face of the type line; `false` = on neither face. `can_be_commander` is a separate filter on the library's own flag (`false` = cannot be one). Both need card facts.
4. **Cards with no data.** Never matched by a type, colour, mana value, subtype, keyword, role, legendary, commander or text filter, and always counted in `filterCoverage`. `no_card_facts: true` lists exactly those cards. It cannot be combined with any filter that needs card data (INVALID_INPUT).
5. **Sort (search only).** `sort_by` `name` (default) or `mana_value`; `sort_order` `asc` (default) or `desc`. Ties by name. Cards with no data come last in both directions. Sorting happens before paging.
6. **Counts.** `get_collection_summary` `group_by` gains `subtype` (a card counts under every subtype, so groups overlap and the note says so; no subtype = "No subtype"; no data = "No facts") and `mana_value` (labels "0", "1", "2"... in number order, "No facts" last). At most 60 groups; `groupsTruncated` stays honest.
7. **Rules text off by default** in search results (`include_rules_text` default false).
### 14.3 Speed
Text and commander checks reuse the one batched read of the card library that role search makes (100 names a request, 4 at a time) and only run after the database-side filters have narrowed the list. A role, text and commander filter used together share that single read. A test pins the number of requests (250 names = 3 reads). A later optional speed-up (add rules text and the commander flag to the view so one request does it) is NOT built; it would need an owner-approved view change.
### 14.4 Why 100 owned cards have no card data (live audit 2026-11-18, read-only)
| Cause | Cards |
|-------|------:|
| A. Single-faced cards released after the card library was loaded | 43 |
| B. Two-faced cards from a new set (layout "prepare") | 22 |
| C. Older two-faced cards (adventure 11, modal 9, transform 9, split 6) the loader skipped | 35 |
| Total with no card library row (124 copies) | 100 |
Name matching is not the cause (checked: full name, front name and "Front // %" all miss). Also, all 132 two-faced library rows have no rules text. The fix is a prepared data script (FEAT-002) that needs owner approval; it is not run here.
### 14.5 Database change
None. No migration. The live database was only read.
