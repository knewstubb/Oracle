# Report: card-roles-audit
Role: Architect
Status: DONE
Task as received: DOCUMENTS ONLY. Architect-style AUDIT (process.md gate 2) for the card roles and deck jobs feature: (1) role and category data, (2) deck health counting rules, (3) Claude connector tools, (4) existing card click behaviour and detail modal, (5) multi-user readiness; plus the real current numbers for the three test decks (Myrkul, Rocco, Mendicant), read-only. Do not edit src/, supabase/, decisions.md or status.md; do not commit.

## Summary for the owner
Oracle today knows four roles (ramp, draw, removal, wipes), and it works them out fresh from the card's rules text each time. Nothing about a card's role or job is saved per deck. The categories you see in a deck are free-text labels that mostly just say "Creature", "Land" and so on, so the three test decks show almost no role labels. A click on a card name in a deck does not open anything on desktop, so the test modal is a new screen, not a change to an existing one.

## Test deck numbers (read-only, signed in as the owner, 2026-11-18)
Deck health is as the connector's `get_deck_health` shows it (same code as the app). Higher "typical" numbers come from the EDHREC average deck for that commander.

| | Murky Business (Myrkul, Lord of Bones) | Rocco's Secret Sauce (Rocco, Cabaretti Caterer; a Norin the Wary deck per RQ-06) | Arti-facts (Mendicant Core, Guidelight) |
|---|---|---|---|
| Deck id | 789659812 | 790915275 | 789240763 |
| Card rows | 101 (one over, known RQ-11) | 100 | 84 (16 short, known RQ-11) |
| Maybeboard cards | 0 | 0 | 0 |
| Categories in use (first category, cards) | Creature 43, Land 37, Instant 6, Enchantment 5, Sorcery 4, Artifact 6 | Creature 38, Land 36, Enchantment 11, Sorcery 6, Artifact 5, Instant 4 | Land 31, Creature 26, Artifact 19, Sorcery 3, Enchantment 3, Instant 2 |
| Role-style categories (Ramp, Removal, Card Draw...) | none | none | none |
| Ramp (have / typical) | 17 / 20 (light) | 14 / 22 (light) | 8 / 16 (light) |
| Draw | 8 / 7 | 11 / 7 | 14 / 13 |
| Removal | 7 / 7 | 2 / 5 (light) | 2 / 3 |
| Wipes | 2 / 2 | 2 / 1 | 1 / 1 |
| Lands | 37 / 35 | 36 / 35 | 33 / 34 |
| Cards with no card text (not checked) | 5 | 1 | 3 |
| Verdict | "Light on ramp" | "Light on ramp and removal" | "Light on ramp" |
| Typical numbers from | EDHREC average, 8,090 decks | EDHREC average, 10,195 decks | EDHREC average, 17,739 decks |

Every category on every card in the three decks is a type word (Creature, Land, Artifact...). No card has more than one category. [Confirmed: live read, deck_cards.categories]
All 20 category names used across all 19 decks: Land 660, Creature 613, Instant 146, Artifact 144, Sorcery 121, Enchantment 89, Lands 18, Removal 17, Tap Engine 14, Ramp 11, Counters & Tokens 11, Card Draw 10, Evasion & Beaters 10, Vehicles 9, Landfall 9, Planeswalker 7, Artifact Creatures 6, Payoffs 3, Board Wipes 2, Other 1. Role-style labels appear on about 40 of 1,904 rows, and only in decks Claude built (Test A and Test C [Approximate]). Note "Land" and "Lands" both exist. [Confirmed: live read]

## 1. Role and category data
- **Deck categories**: one text column, `deck_cards.categories`, holding a list as text such as `["Ramp"]`. The app treats the first entry as "primary" and up to two more as "additional" (hard cap 3); the connector allows 1 to 5. Per deck, free text, no shared list. [Confirmed: src/lib/categoryUtils.ts; src/lib/connector/tools/edit-tools.ts]
- **Maybeboard** is also a category value ("Maybeboard"), so categories are overloaded as a zone marker; the name is reserved against Claude. [Confirmed: src/lib/connector/tools/get-deck.ts, edit-tools.ts]
- **CC-22 role categories**: wording only. `add_cards_to_deck` tells Claude to pass a role category per card and reuse the deck's names; with nothing passed the card is filed under "Other". Nothing stored changed, and there is no list of allowed role names. [Confirmed: src/lib/connector/tools/edit-tools.ts, docs/oracle/reports/2026-11-17-developer-cc22-card-categories.md]
- **Default category when the app adds a card**: `ref_cards.default_category` (JSON like `{"primary":"Ramp","secondary":[],"confidence":"high","notes":"Mana rock"}`) is read when a card is added in the app, then the first value is stored as the deck category; fallback is the card type (Creature, Land...). This is why imported and app-added cards show type words. [Confirmed: src/app/api/decks/[id]/cards/route.ts lines 103-125]
- **A global per-card role guess already exists**: `ref_cards.default_category` is filled on 32,393 of 32,533 reference cards (live count). Sol Ring = Ramp, Rhystic Study = Engine with secondary Draw. Values come from the older taxonomy (docs/category-taxonomy.md: Ramp, Draw, Removal, Counterspells, Tutors, Protection, Engine, Finisher, Utility...). Its quality is unaudited; it is a single guess per card, with one "primary", which RQ-02 wants dropped. [Confirmed: live read; docs/category-taxonomy.md]
- **Keyed by card name, not oracle_id**: `ref_cards` has no `oracle_id` column (columns: name, type_line, color_identity, mana_cost, mana_value, oracle_text, power, toughness, edhrec_rank, commander_legal, is_legendary, is_creature, default_category, can_be_commander, keywords). `user_cards` does have `oracle_id` (all 2,832 rows filled). Anything stored per card identity today is keyed by name; D-003 says identity should be oracle_id. [Confirmed: live read of columns]
- **Card tags**: none. No table exists for card tags, card roles, deck jobs or card_metadata (probed live, all absent). `deck_cards.tags` and `dead_weight_flag` columns exist but hold nothing (0 of 1,904 rows used). `card-tagging-pipeline.md` is a proposal only; nothing built (status line: "no implementation, migration, data write..."). `ref_taxonomy` (263 rows) holds archetypes, mechanics, tribes, keywords for commanders, not per-card roles. [Confirmed: live probe; docs/oracle/contracts/card-tagging-pipeline.md; supabase/migrations/20260803100000_create_ref_taxonomy.sql]
- **Computed role per card**: `rolesForCard` (ramp, draw, removal, wipes) is a pure text function, nothing stored. It also drives the connector's `roles` filter and `group_by: role` in `search_collection`. [Confirmed: src/lib/card-roles.ts, src/lib/connector/tools/collection-query.ts line 7 and 105]
- **Owned cards with no card data**: 115 of 2,832 distinct owned card names have no rules text in `ref_cards` (exact name, then front-face fallback). Examples: Dusk // Dawn, Commit // Memory, Part in Friendship, Head of the Hunt, Indomitable Ancients (row exists but no text). Claude quoted 86 (it counts differently, likely copies or a stricter match); status.md says "about 100". The 115 is my count with the app's own lookup rule. [Confirmed: live read; Approximate on why 86 differs]
- **Stored per oracle_id**: only `user_cards.oracle_id` (ownership). Nothing about roles. [Confirmed: live read]

## 2. Deck health counting rules
- Roles come from one function, `rolesForCard`, on the front face only. A card may have several roles. Lands never get a role. A card with no rules text counts as "unclassified", not as "no role". [Confirmed: src/lib/card-roles.ts]
- **Ramp**: land fetched onto the battlefield, extra land drop, Treasure maker, or a non-instant/sorcery permanent whose text says "Add {mana}". Since classifier v2 (commit f777102) static cost reducers for a whole spell type also count ("Blue spells you cast cost {1} less"), except "the first ... each turn" lines and "Max speed" lines. So the owner's once-per-turn reducer request is still not met. [Confirmed: src/lib/card-roles.ts hasCostReducer; git log]
- **Draw**: "draw N cards", or "draw a card" only on a trigger or ability. Opponent draws ignored. **Removal**: targeted destroy/exile/damage/-X/-X/bounce/edict on a board target. **Wipes**: destroy/exile all, mass -X/-X, mass damage, mass bounce, overload. [Confirmed: src/lib/card-roles.ts]
- No role weights: Mana Leak and Rhystic Study, or a one-shot and a repeatable source, count 1 each (RQ-03 gap). [Confirmed: src/lib/deck-health.ts countRoles]
- **Counts** are by quantity, main deck only (not maybeboard, sideboard, or commander). Lands counted from the front-face type line. Targets: the commander's EDHREC average numbers, else a fixed guide (ramp 10, draw 10, removal 6, wipes 2, lands 36). "Light" means 2 or more short. [Confirmed: src/lib/deck-health.ts]
- **Deck categories play no part in counting.** A card the owner files under "Ramp" is not counted as ramp, and a card in "Creature" can still be ramp. Per-deck jobs, commander rules and the owner's own labels cannot change a count today. This matches the Stax on Stax investigation: lands such as Seat of the Synod are excluded on purpose, and the 5 vs 9 gap is partly a definition mismatch with EDHREC. [Confirmed: src/lib/deck-health-server.ts healthCardsFromRows reads only `categories` for the main-deck test; docs/oracle/reports/2026-11-16-developer-stax-ramp-count-investigation.md]
- Card text comes from `ref_cards` by name, so the 115 text-less names (section 1) make health "partial" when over 10% of the main deck is unclassified (none of the three test decks is; they have 1 to 5). [Confirmed: src/lib/deck-health.ts UNCLASSIFIED_PARTIAL_SHARE]
- The Stax investigation report is dated 2026-11-16 (the task named 2026-11-17).

## 3. Claude connector tools
- `add_cards_to_deck`: per card `category` (single string, text only, default "Other", "Maybeboard" refused). No role vocabulary is enforced, and no job, reason or lock field. [Confirmed: src/lib/connector/tools/edit-tools.ts lines 30-41, 241]
- `set_card_category`: changes categories of cards already in a deck by slot, 1 to 5 names each, new names allowed, matches the deck's existing spelling, dry run, up to 120 per call, one-click undo for 7 days. So Claude can already re-file a card. [Confirmed: src/lib/connector/tools/index.ts; supabase/migrations/20261116190000_ai_deck_category.sql]
- `get_deck` returns each card's `categories` list plus card facts. It returns no roles and no jobs. `get_deck_health` returns the four role counts but not which cards are in each role (the app panel has this via `cardsInRole`; the connector does not). [Confirmed: src/lib/connector/tools/get-deck.ts line 93; get-deck-health.ts]
- `search_collection` and `get_collection_summary` accept `roles` and `group_by: role` from the text function. [Confirmed: src/lib/connector/tools/index.ts]
- **Change log and undo**: every edit is written to `ai_change_log` (user_id on each row, indexed by deck and slot) and grouped for undo; the `deck_category` kind may change only `deck_cards.categories`, stores the before value and refuses undo if the deck changed since. A new stored thing (job, reason, lock) would need a new change kind: the RPC wrappers were built by renaming functions to `_v1` and putting a new function in front (pattern used in 20261116190000), and the allow-lists of kinds are CHECK constraints that must be widened. [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql, 20261116190000_ai_deck_category.sql]
- Ownership and card data tools on the connector are read-only handles that must carry the owner's user id. [Confirmed: src/lib/connector/user-client.ts]

## 4. Card click behaviour and detail screens
- **In a deck (desktop)**: the card name does nothing on click. Hovering shows a card image preview. A kebab menu and right-click menu offer category edit, remove and "Edit card instance" (opens `EditCardInstanceDialog`); a status chip opens a small popover. [Confirmed: src/components/CardGroupSection.tsx lines 368-375, 424-470]
- **In a deck (mobile)**: tapping the name opens `MobileCardPreview`, a full-screen image only. [Confirmed: src/components/CardGroupSection.tsx lines 340-345, 524-530; src/components/MobileCardPreview.tsx]
- **`CardPopover`** (image plus which other decks hold the card) is used by `CardGrid`, itself used by the deck page and `WorkbenchTab`. [Confirmed: src/components/CardGrid.tsx line 230; imports in src/app/decks/[id]/page.tsx]
- **`InstanceDetailPanel`** is the collection screen's side panel (physical copies of one card: set, finish, condition, which deck, storage). It is opened from `CollectionRollupTab`, not from decks, and keyed by `oracleId`. It is about copies, not roles. [Confirmed: src/components/collection/CollectionRollupTab.tsx lines 233, 278; InstanceDetailPanel.tsx]
- `DeckCard` rows already carry `categories` and the card name, scryfall id, so a new modal opened from the name has what it needs for category display; role, job, reason and lock need new data. Best extension point: the card name span in `UnifiedCardRow` (desktop currently has hover only). A small Dialog (already imported in the same file) would work. [Confirmed: src/components/CardGroupSection.tsx; Approximate on effort]

## 5. Multi-user readiness
- `decks`, `deck_cards`, `user_cards`, `user_copies`, `ai_change_log`, `ai_pending_changes` all carry `user_id` with own-row-only policies (`user_id = auth.uid()`); anonymous access removed. [Confirmed: supabase/migrations/20261116100000_rls_own_row_policies.sql, 20261116150000_ai_change_log_and_pending.sql]
- `ref_*` tables (cards, taxonomy, commanders, builds) are shared reference data with read for any signed-in user and writes by the service role only. [Confirmed: supabase/migrations/20260803100000_create_ref_taxonomy.sql]
- So the split for this feature is clear: global role per card = shared reference data (no user_id, read-only to users, keyed by oracle_id); per-deck category, job, reason, lock = per-user rows with `user_id` and the same own-row policy, hanging off `deck_cards.id`. Per-commander rules (RQ-05) are the borderline case: shared defaults plus per-user overrides. Per-user custom category names must not be written into shared tables. [Approximate: recommendation, not stored anywhere yet]
- One gap: `ref_cards` by name cannot tell a card's printings or faces apart, and cannot be joined to `user_cards.oracle_id` without a name match. Adding oracle_id to the shared role data needs a join through `ref_printings` or a new column (needs owner-approved migration). [Approximate: `ref_printings` columns not checked]

## Locked decisions touched or in conflict
- D-003 (oracle_id vs scryfall_id): any new global role storage should be keyed by oracle_id; today's `ref_cards.default_category` is keyed by name. Touched, not in conflict.
- D-016 (structured LLM data via tool use, no prose regex): applies to any AI-proposed roles and jobs. Touched.
- D-034 / D-034a (every AI change undoable, 7-day undo for the connector): any new thing Claude can change (job, reason, lock, category) needs the same log and undo path. Touched.
- D-009 (every placement carries a `source`): same pattern would be needed for an AI-proposed role or job so it can be told apart from a hand edit. Touched.
- D-017 (category counts vs curve targets handled with warnings, not a matrix). Touched, relevant to commander rules.
- Nothing in `decisions.md` defines card roles or jobs, so no conflict found.

## What will be deleted or replaced when the new version ships (proposal for the design step)
- The four-role hard-coded list in `card-roles.ts` (`Role`, `ROLE_ORDER`, `ROLE_TEXT_NEEDLES`) and the `GENERAL_GUIDE` and label tables in `deck-health.ts`, if roles become data.
- `ref_cards.default_category` and its use in `src/app/api/decks/[id]/cards/route.ts` and `chat-proposal-confirm.ts`, if the new global role replaces it.
- The unused `deck_cards.tags` and `dead_weight_flag`/`dead_weight_reason` columns (empty); removal is a schema change that needs owner approval (D-006 style).
- The stale text in `docs/category-taxonomy.md` that refers to `card_metadata.default_category` and `deck_cards.categories` as separate stores (the contract notes this); superseded docs get marked at close-out.
- The `Lands` / `Land` duplicate and the `Other` default should be resolved by the new vocabulary.

## Old backlog items this feature touches
RQ-01 (13 universal roles), RQ-02 (taxonomy clean-up), RQ-03 (role modifiers), RQ-04 (deck jobs, why, locked flag), RQ-05 (commander rules), RQ-10 (produces/needs tags), RQ-12 (fundamental rethink), CC-10 (card facts for text-less cards), CC-11 (connector categories), CC-22 (done, wording only). Briefs `category-management.md` and `suggested-categories.md` are DRAFT, unapproved, and overlap.

## Changed files
- docs/oracle/reports/2026-11-18-architect-card-roles-audit.md — this report only (new, untracked). No other file was edited.

## New decisions made (need owner confirmation)
- none

## Assumptions
- "Myrkul" is the deck "Murky Business" (commander Myrkul, Lord of Bones), "Rocco" is "Rocco's Secret Sauce", "Mendicant" is "Arti-facts" (commander Mendicant Core, Guidelight). They are the only decks with those commanders.
- Health numbers were computed with the same code the connector uses; the EDHREC typical numbers were read from the saved or live source without saving anything.
- The local auto-login account is the owner's real account (19 decks, 2,832 distinct owned cards).

## Challenges to locked decisions
- none

## Open questions
- Why does Claude see 86 cards without card data while the app's own lookup finds 115? Likely counting copies vs names; worth settling before CC-10 so the target is clear.
- Should the new global role be stored once per oracle_id (needs a new table or a column on a shared table, owner-approved migration), or computed by the text function with the stored role only as an override? That is a design-step question.
- Is `ref_cards.default_category` good enough to seed the global labels, or is it older, lower quality data? Not checked beyond two sample cards.

## Verification
- Temporary read-only scripts, signed in with the owner's local login (anon key plus the owner's token, row-level security applied): tables and columns probe; deck list; per-deck category counts; `loadConnectorDeckHealth` for the three decks; owned-card text coverage; counts on `ref_cards`. Scripts used only select, then were deleted (`.tmp-audit-probe*.mts` removed). Nothing was written to the database.
- `git status` afterwards: `.agents/tasks/` and `supabase/drafts/cc14-backfill-ref-cards.manifest.json` are untracked and were not created by this task; this report is the only file I added. Nothing was committed.
- Code claims read directly from the files named above; no tests run (documents only).
