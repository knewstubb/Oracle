# Report: categories-health-audit
Role: Architect (Gene's Architect/Designer pass; Gate 1 brief plus Gate 2 audit, read-only)
Status: DONE
Task as received: "Planning round only ... Act as Gene's Architect/Designer for a Gate 1 brief plus a Gate 2 audit ... Do NOT build anything, do NOT change code or data, and do NOT apply any migration or make any hosted write (read-only live database queries are allowed). Stop at the Gate 2 summary; the owner will respond." Make deck health driven by the deck's own categories, with a per-deck target for each category (six generic categories with Command Zone default ranges, strategy categories, proposed/confirmed targets, health from categories not rules text, multiple categories per card, lands with mana sources, odds read-out, Claude connector surface). Full owner text, both messages, verbatim: `.agents/tasks/categories-health/owner-direction.md`. Message 2 replaces requirement 1 and the default-target rule.

## Summary for the owner
**Recommendation: approve the brief and let the work start with a first step that stores nothing.** That step shows the six Command Zone ranges on your real decks, using today's card reading, so you can judge the numbers before any stored-data change is approved.

What you would see on day one: Yedora the Explorer moves from "Well covered" to Light on Card Advantage (6 against 10 to 12), Targeted Removal (6) and Board Wipes (0), and Heavy on Ramp (18) and Game Plan (34). A rot to process: Ramp 9 light, Card Advantage 7 light, Targeted Removal 7 light, Board Wipes 3 ok, Game Plan 37 heavy. Game Plan is whatever no other category claims, so on 14 of your 19 full decks it starts Heavy. That is the main thing for you to decide (question 1 in the brief).

Three things I found that you did not ask about. First, no card in your real decks sits in more than one category today, and the app cuts category names at 16 characters and keeps only three per card, so "Game Plan & Win Conditions" would be damaged. This must be fixed before any card gets a second category. Second, your real decks use only the type groups (Land, Creature, Instant and so on), so there are no custom names to convert; the 14 custom names live in two test decks and a test fixture. Third, your odds example is right: 2 cards in a 99-card library, 12 seen, is 22.9%. The 12 cards by turn 5 is correct for a four-player game (everyone draws on turn 1). Playing first in a two-player game gives 11 cards and 21.1%.

The six ranges fit a 99-card deck: the minimums add to 93 and the maximums to 110, and the middle values add to about 101.5, so a deck that sits mid-range in everything needs two or three cards counted in two places. Nothing in the ranges contradicts itself. If every other row sits exactly at its minimum with 35 lands, Game Plan comes to 31, one over its range.

Nothing was built, changed or applied. The decision file is untouched; the brief lists the one locked decision (D-060) that needs your word.

## Tag key
`[Confirmed: path]` read in this task. `[Live: query]` read-only query against the live database on 2026-11-20. `[Approximate]` not checked or inferred.

## a. What health computes today, and where
Five rows (Ramp, Draw, Removal, Wipes, Lands). Computed on request, nothing stored.
- **Role rules:** `rolesForCard` in `src/lib/card-roles.ts` reads the front face's card text with fixed patterns. Ramp: land fetched to the battlefield, extra land drop, Treasure, "add mana" on a permanent (not an instant or sorcery), cost reducers for whole spell types. Draw: draws two or more, or one on a repeating or triggered line. Removal: targeted destroy, exile, damage, shrink, bounce, edicts. Wipes: destroy or exile all, overload, mass shrink, damage to each creature. Lands have no roles and are decided by the front-face type line (`isLandTypeLine`). A card with no text gives no roles and counts as unclassified. [Confirmed: src/lib/card-roles.ts]
- **Counting:** `classifyDeckCard`, `countRoles`, `cardsInRole`, `buildDeckHealth` in `src/lib/deck-health.ts`. Main deck means not a commander and a first category that is not Maybeboard or Sideboard, not a companion (`isMainListCard` in `src/lib/commander-card-actions.ts`). [Confirmed]
- **Loading:** `loadDeckHealth`, `healthCardsFromRows` in `src/lib/deck-health-server.ts` (app route `src/app/api/decks/[id]/health/route.ts`); the connector uses the same pure functions via `loadConnectorDeckHealth` in `src/lib/connector/deck-health-loader.ts`. [Confirmed]
- **Where targets come from:** `getCommanderTargets` (`src/lib/commander-targets.ts`, `commander-targets-server.ts`): EDHREC average deck, else an estimate, else `GENERAL_GUIDE` (ramp 10, draw 10, removal 6, wipes 2, lands 36). Cached in `ref_commander_role_targets`, tagged with `classifier_version`. EDHREC's own cards are classified by the same `rolesForCard`. [Confirmed]
- **Verdict:** `roleState`: light only when 2 or more below the typical number; one short, or any amount over, is "ok". There is no heavy state. Copy in `composeHealthCopy`. [Confirmed: deck-health.ts]
- **Screens:** left rail `src/components/deck-rail/RailHealth.tsx` (rows "have / typical", "Short" or "Met") and `DeckHealthPanel.tsx`. [Confirmed]
- **Connector tools and role wording.** `get_deck_health` "runs the same Deck health check the Deck health screen shows" against typical numbers. `search_collection` and `get_collection_summary` expose "Role groups are Ramp, Draw, Removal, Wipes and No role", guessed from rules text, lands never. The "derived live from rules text by the same rules Deck health uses" claim is true today and becomes false once health reads categories. [Confirmed: src/lib/connector/tools/index.ts lines 41, 42, 45]
- **Live numbers, two decks, today's rules** (computed read-only with the real functions; `[Live]` card rows plus `ref_cards` text): Yedora the Explorer, 101 main cards: lands 37, ramp 18, draw 6, removal 6, wipes 0; EDHREC average ramp 15, draw 6, removal 4, wipes 0, lands 36, so today's verdict is "Well covered". A rot to process, 99: lands 38, ramp 9, draw 7, removal 7, wipes 3; EDHREC average ramp 9, draw 7, removal 2, wipes 2, lands 35, also "Well covered".
- **Other category-health code (dead or stubbed):** `getCategoryHealth` in `src/lib/brew-v2-deck-state.ts` and `DeckListTab.tsx` count first categories against a single number with low/healthy/high, but `DeckListTab` is mounted nowhere (only its test) [Confirmed: grep]. The Strategy tab "Categories" section (`StrategyTab.tsx`) lists first categories with `CORE_CATEGORIES` = Ramp, Draw, Removal, Lands, Win Condition matched by first word; its Add, Edit and Delete buttons have no handlers [Confirmed: lines 109, 288 to 330, 412 to 545]. Three more "core category" vocabularies exist (health roles, this list, the Win Condition pinned section).

## b. Stored-data change (PROPOSAL, nothing applied)
**Reuse check.** `deck_health_targets` (applied live, 0 rows [Live]) holds one integer per deck per fixed group (lands, ramp, card_advantage, interaction), set by claude or owner, with a `previous` number. It has no minimum and maximum, no proposed/confirmed status, no link to a category, and four groups that do not match six kinds. Its functions (`_ai_plan_health_target`, `owner_set_health_target`, and so on) encode D-060 ("applied at once, owner override"). Altering it would mean rewriting both table and functions, which sit inside the four live "front door" functions. **Recommendation: new storage; leave the old table unused.** Other empty tables: `ref_card_roles`, `user_card_roles`, `deck_card_jobs`, `deck_strategy_points` (0 rows [Live]): none fits; they stay for the separate cleanup task. `ai_change_log` and `ai_change_reasons` (7 reasons [Live]) are reused as they are. The S3 fields and S5 strategy replace stay. CC-25 (trade places) is an unapplied draft and unrelated.

**Alternative considered and rejected:** one JSON column on decks holding categories and targets. One small change and easy Undo, but no database-level guards, so "Claude cannot confirm" would rest on code only, and a rename would still rewrite cards.

**Plain words.**
1. *Category list per deck* (`deck_categories`): one row for each category that health tracks. It records the deck, the category's name, which of the six generics it is (blank for strategy categories), order, and who created it. A name carried on cards but without a row is just a filing name (Creature, Instant) and is not a health category. The kind is what health uses, so renaming Ramp to Mana changes the name only.
2. *Range per category* (`deck_category_targets`): minimum, optional maximum, status proposed or confirmed, who set it, a reason (required for Claude), when confirmed. No row means "use the default for this kind" (defaults live in code, not rows, so changing a default never needs a migration) or "count only" for a strategy category.
3. *One-time backup* (`deck_categories_backup_20261120`, name provisional): each card's old category text before day-one setup, so setup can be reversed exactly.
4. *Two new kinds of Claude change* in the change log's allowed list: `category_save` (create or rename) and `category_target` (propose), using the same "front door" pattern DB-2 and DB-5 used.
5. Memberships stay where they are: the existing categories text on each deck card. No second membership table.

**Technical sketch.**
```
deck_categories(id bigint identity pk, user_id uuid not null -> auth.users, deck_id int not null -> decks on delete cascade,
  name text not null check (btrim(name)=name and char_length(name) between 1 and 60),
  kind text null check (kind in ('lands','ramp','card_advantage','targeted_removal','board_wipes','game_plan')),
  sort_order int not null default 0, created_by text not null check (created_by in ('system','owner','claude')),
  created_at timestamptz not null default now())
  unique (deck_id, lower(name)); unique (deck_id, kind) where kind is not null
  reserved names refused: Maybeboard, Sideboard, Commander
deck_category_targets(id bigint identity pk, user_id uuid not null, deck_id int not null,
  category_id bigint not null unique -> deck_categories on delete cascade,
  min_count int not null check (min_count between 0 and 99), max_count int null check (max_count is null or max_count >= min_count),
  status text not null check (status in ('proposed','confirmed')), set_by text not null check (set_by in ('owner','claude')),
  reason text null check (reason is null or char_length(reason) between 1 and 200),
  batch_id uuid null, confirmed_at timestamptz null, updated_at timestamptz not null default now(),
  check (set_by <> 'claude' or (status = 'proposed' and reason is not null and confirmed_at is null)),
  check (status <> 'confirmed' or (set_by = 'owner' and confirmed_at is not null)))
```
RLS as in DB-5: owner can select own rows; all writes through service-role functions only. Owner functions: `owner_set_category_target` (writes confirmed), `owner_confirm_category_target` (proposed becomes confirmed, `set_by` becomes owner), `owner_clear_category_target` (back to default). Claude functions run inside `ai_submit_change`: `category_target` refuses (`left_alone`) when the row is confirmed; `category_save` rejects the reserved names and a kind change.

**Who may confirm, enforced in three places.** (1) Database: the check constraints make "Claude-set and confirmed" impossible. (2) Functions: only `owner_confirm_category_target` writes `confirmed`, granted to the service role and called only from a signed-in-owner route (the same cookie session as the existing owner Undo). (3) Connector: no tool with confirm exists, and a registry test asserts none is added. Owner confirm and range edits are logged by `confirmed_at` and `updated_at`, not by the Claude change log, and need no Undo beyond "Use default" and re-editing.

**Claude changes** go through `ai_submit_change` with `claude_reason` stored by `ai_record_change_reason` as today; each logs `before` and `after` JSON per row, with a placeholder card name because `ai_change_log.card_name` is not null [Live: column list]; 7-day Undo through `ai_undo_group`, with the existing "refuse if changed since" rule. A rename logs one row per card whose list changed, so one Undo restores the old name on exactly those cards. A deck holds at most about 100 cards, under the 120-card request limit.

**Day-one setup** (one-time function, run after approval and rehearsal on a throwaway copy): creates the six rows per deck, adopting existing names (Land or Lands for lands, Ramp, Card Draw for card advantage, Removal, Board Wipes), writes the backup, then appends generic names to each main-list card's categories without touching the first entry. See f.

## c. Per-deck or shared; existing custom names
**Per deck.** Strategy categories are specific to a deck's plan, memberships are already stored per deck card, and ranges differ per deck. Defaults are shared in code. Nothing is global to a user, so a public multi-user version is not blocked. The older category-management brief (merge across decks, rename everywhere) is a separate, unbuilt backlog item (CC-11, `briefs/category-management.md`); this work does not conflict, but its cross-deck merge stays later and its per-deck rename is covered by the Claude rename tool here.

**Live count.** 2,017 deck cards in 23 decks [Live]. 21 distinct first-category names. 2,014 rows hold exactly one name in a JSON list; 3 rows are null or empty; no row holds two or more.

| Name | Cards | Decks | Maps onto |
|---|---|---|---|
| Land | 697 | 19 | Lands (adopt; matches today's land rule on every row except 4 in the test fixture) |
| Creature | 655 | 19 | filing name (no health row) |
| Instant | 158 | 18 | filing name |
| Artifact | 139 | 18 | filing name |
| Sorcery | 132 | 19 | filing name |
| Enchantment | 92 | 19 | filing name |
| Lands | 18 | 2 | Lands (adopt) |
| Removal | 17 | 2 | Targeted Removal (adopt) |
| Tap Engine | 14 | 1 | strategy category |
| Other | 13 | 2 | filing name, not a health category |
| Counters & Tokens | 11 | 1 | strategy category (17 characters; already cut in the app) |
| Ramp | 11 | 2 | Ramp (adopt) |
| Evasion & Beaters | 10 | 1 | strategy category (17 characters) |
| Card Draw | 10 | 2 | Card Advantage (adopt) |
| Vehicles | 9 | 1 | strategy category |
| Landfall | 9 | 1 | strategy category |
| Planeswalker | 7 | 6 | filing name |
| Artifact Creatures | 6 | 1 | strategy category (18 characters) |
| Payoffs | 3 | 1 | strategy category |
| Board Wipes | 2 | 2 | Board Wipes (adopt) |
| Commander | 1 | 1 | not counted (commander) |

All 134 non-type rows sit in four decks: TEST A, Test C, the E2E fixture and a one-card deck. **None are in the owner's 19 full decks**, which use the seven type names only. Names compare without regard to capitals (21 either way). Nothing is changed.

## d. Requirement 5: how many categories a card can hold
- **Stored form:** `deck_cards.categories`, a text column holding a JSON list; the first entry is the primary. Plain comma text is also read. [Confirmed: src/lib/categoryUtils.ts `parseCategories`] `brew/save` writes a comma-joined text, not JSON [Confirmed: src/app/api/brew/save/route.ts line 163].
- **The limit differs by path.** Card window and list save route: 1 primary + at most 2 more = 3 [Confirmed: `src/app/api/decks/[id]/cards/[cardId]/categories/route.ts`]. Bulk "move-category": at most 2 more [Confirmed: bulk/route.ts]. All reading code (`parseCategoriesCapped`: card window, list grouping, workbench, category vocabulary) keeps only the first 3 and cuts each name to 16 characters (`MAX_CATEGORY_LENGTH`) [Confirmed: categoryUtils.ts, CardWindow.tsx line 109, useDeckCategories.ts]. Claude's `set_card_category`: 1 to 5 names, each up to 60 characters, replacing the whole list; the database function caps at 5 (`c_max_cats`) [Confirmed: edit-tools.ts, supabase/migrations/20261116190000_ai_deck_category.sql].
- **A damage path exists today.** The card window saves by rebuilding the list from the cut version, so editing a card's category there would write names cut to 16 characters and drop entries 4 and 5. [Confirmed: CardWindow.tsx lines 109, 135 to 138; Approximate: not run]. It must be fixed before cards get second and third memberships. Live evidence: three names are already over 16 characters (Counters & Tokens, Evasion & Beaters, Artifact Creatures).
- **Does the first one decide the list group? Yes.** The list groups by `parseCategoriesCapped(...).primary_category` (CardsTab.tsx line 189) and a card appears once in the list, under its first category. [Confirmed]
- **What else depends on order.** (1) The first entry decides whether a card is Maybeboard or Sideboard, hence in or out of the 100 and out of health (`isMainListCard`). (2) The commander's own "Commander" entry is kept by the connector. (3) Deck export and Archidekt sync use only the first (`deck-export.ts` `parsePrimaryCategory`) [Approximate: sync path not read]. (4) The card window shows only the first. (5) Health today ignores categories except point 1.
- **Double count?** Counting a card once in every category it belongs to makes category counts add to more than the card total. Example, live: A rot to process has 99 cards but 26 role memberships for 24 cards (two cards hold two roles), so rows add to 101 with Game Plan. **Safe way to show totals:** the deck total is always the number of different main-list cards (`mainListCount`, quantity-weighted); each row says "cards in this category"; one line shows "Some cards sit in more than one" with the number; "Not in any category" counts different cards with no health membership. Never sum the rows. Quantity: every live row has quantity 1 [Live], so basics are separate rows; quantity-weighting stays as today anyway.

## e. Requirement 1 and the sums
- Minimums: 35 + 10 + 10 + 10 + 3 + 25 = 93. Maximums: 38 + 12 + 12 + 12 + 6 + 30 = 110. Midpoints: 36.5 + 11 + 11 + 11 + 4.5 + 27.5 = 101.5. A 99-card list sits inside 93 to 110.
- **Overlap rule.** Day-one seeding gives Game Plan only to cards with no other generic, so the six overlap nowhere except classifier cards with two roles (Damn: removal and wipes). Later, a card may legitimately sit in Ramp and Game Plan.
- **Typical total.** Mid-range in all six adds to 101.5, 2.5 over 99, so an on-template deck carries two or three cards counted twice, or sits a little under the middle somewhere. Not inconsistent.
- **Is any default internally inconsistent?** No. One corner is tight: with 35 lands and every other generic at its minimum, Game Plan = 99 − 35 − 33 = 31, one above its range. Because Game Plan is the remainder, the five numbers and Game Plan are linked: Game Plan = 99 − lands − the four role rows (when no overlap). Game Plan lands inside 25 to 30 only when lands plus the four role rows come to 69 to 74.
- **Live check.** Yedora: 37 + 18 + 6 + 6 + 0 + 34 = 101, equal to its 101 main cards (no overlap; it is 2 over 100). A rot to process: 38 + 9 + 7 + 7 + 3 + 37 = 101 for 99 cards (overlap 2).
- **Strategy categories beside Game Plan work with the existing model with no hierarchy.** A category is a name in a card's list; a card can hold several; counting is by name; nothing says one name contains another. A card in [Artifact, Game Plan & Win Conditions, Payoffs] counts once in each of the two health rows and once in the deck total. The fit needs three code changes, none structural: raise the 3-entry cap to 5, lift the 16-character cut, make health read memberships by name through the definition rows. [Confirmed: model above; Approximate: Archidekt sync of extra categories]
- **Card cap at 5.** Setup gives a card its type name plus its roles (Game Plan only when it has none), so at most 5 in the worst case (four roles); the two-role cards seen live (for example Damn-like cards) end at 3. A strategy category on top of a multi-role card can reach 5 or 6. Recommend keeping 5 (already built in the database function and tool) and revisiting if a real card hits it. I did not count the most roles on any live card. [Approximate]

## f. Seeding
- **Lands, Ramp, Card Advantage, Targeted Removal, Board Wipes:** from `rolesForCard` and `isLandTypeLine`: ramp→Ramp, draw→Card Advantage, removal→Targeted Removal, wipes→Board Wipes, land→Lands. Same numbers as health shows today, so no count drops on day one. Lands need no writes on real decks: the existing "Land" first category equals the classifier on all 719 live land rows except 4 in the test fixture [Live plus run of the real classifier].
- **Game Plan & Win Conditions:** proposed rule: every main-list nonland card that has card text and received no other generic category. This is a remainder, not a classifier, as you asked.
- **Uncategorised:** nonland main-list cards with no card text (today's "unclassified") and any card on the main list in no health category. Live: 0 for most decks; Stax on Stax 1, Felothar 1, Elfball with Partners 4 [Live plus run]. Health shows "Not in any category: N". The existing 10% "partial check" warning stays.
- **Where the first entry stays.** Appended names go after the card's existing first entry, so the list looks the same after setup. A card changed by setup is never one marked Maybeboard or Sideboard, never a commander.
- **How setup runs:** one function over all 23 decks after approval and a throwaway rehearsal, with the backup table; reversal restores the old text. Alternative: a per-deck "Set up categories" button. Rejected as the default because it leaves two health modes alive. Both are possible; the owner's wording "on day one" favours the bulk run.
- **The classifier is replaceable.** After Tags (RQ-12) exist, new decks could be seeded from Tags instead; nothing else changes. Existing decks are not re-seeded. The classifier stays for seeding and EDHREC's reference figures.

## g. How defaults show on an existing deck with no targets set
The six default ranges come from code, so a deck with no stored ranges shows them at once, each row marked "Default". A range the owner sets shows "You set". A range from Claude shows "Claude proposes, not confirmed" beside the default; the default keeps the verdict (open question 2).

Two real decks (counts are the classifier's, ranges are the owner's template, the Game Plan count is my proposed remainder rule):

| Row | Range | Yedora the Explorer | A rot to process |
|---|---|---|---|
| Lands | 35 to 38 | 37 ok | 38 ok |
| Ramp | 10 to 12 | 18 heavy (+6) | 9 light (−1) |
| Card Advantage | 10 to 12 | 6 light (−4) | 7 light (−3) |
| Targeted Removal | 10 to 12 | 6 light (−4) | 7 light (−3) |
| Board Wipes / Mass Disruption | 3 to 6 | 0 light (−3) | 3 ok |
| Game Plan & Win Conditions | about 25 to 30 | 34 heavy (+4) *proposal* | 37 heavy (+7) *proposal* |
| Not in any category | | 0 | 0 |
| Main cards / sum of rows | | 101 / 101 | 99 / 101 (2 overlap) |
| Today's verdict (EDHREC) | | Well covered | Well covered |
| EDHREC average (reference) | | ramp 15, draw 6, removal 4, wipes 0, lands 36 | ramp 9, draw 7, removal 2, wipes 2, lands 35 |

**What the owner sees for Game Plan on day one:** a count equal to the number of nonland cards that no generic role claimed, shown against 25 to 30. Across the 19 live decks of about 100 cards, Game Plan seeds to above 30 on 14, inside 25 to 30 on 4 (Ureni 28, Veloci-ramp-tor 27, Elfball 29, Arti-facts 26) and below 25 on 1 (World Breaker 21) [Live plus run]. So the first screen mostly says Heavy. It is the leftover, not a verdict about the plan; that is why question 1 offers a count-only alternative. Rule change to flag: today 1 short is "ok"; the new rule makes any count under the minimum "light" (Rot's Ramp 9 against 10).

## h. Lands, mana sources, MDFC
- Lands get a range like any category (default 35 to 38).
- **Mana sources** = lands + Ramp members. The Ramp classifier also includes cost reducers and Treasure makers, so the figure is an approximation; RQ-13 can refine it. [Approximate] Yedora: 37 + 18 = 55; Rot: 38 + 9 = 47.
- **MDFC.** Today a double-faced card whose front is a spell is not a land (front face rule, `isLandTypeLine`) [Confirmed: card-roles.ts]. No code in `src` counts double-faced cards as lands [Confirmed: grep "modal_dfc" finds only a test fixture]. `ref_cards` has no layout column; `ref_printings.layout` does [Live: column list]. **Recommendation:** a land-capable card is one whose layout is modal double-faced and whose other face is a land (checked on printings, with the type line "A // Land" as a fallback). It is shown as a derived addition to the land line ("37 lands + 2 double-faced") and added to mana sources, not stored as a Lands membership, so it never creates overlap or changes the deck total. Live: Elfball with Partners 3, Rocco's Secret Sauce 1, The Fairmaker 1, Arti-facts 1, Murky Business 1, All gas no brakes 1 (by the type-line fallback) [Live plus run]. Yedora and Rot have none.
- **RQ-13 status.** **No RQ-13 maths exists in `src`.** There is no hypergeometric or draw-odds function and no land count that includes double-faced cards. `src/lib/mana-analysis.ts` has colour-pip and land-by-name helpers (used by the Analysis tab and `deck-rail-stats.ts`), not odds or double-faced awareness. [Confirmed: grep of src and migrations] **Therefore requirement 7 and this item define the single shared implementation that RQ-13 will reuse, not a second one.**

## i. Odds read-out
- **Formula.** P(at least one) = 1 − C(N−K, n) / C(N, n), computed as a running product to avoid large numbers. N = cards in the library at the start = main-list cards without the commander (99 in a standard deck; use the actual main count otherwise, Yedora 101). K = cards in the category (different cards, quantity-weighted). n = cards seen.
- **Cards seen by turn T.** Opening hand 7. Pod (3 or more players): everyone draws on turn 1, n = 7 + T. Two players on the play: n = 7 + T − 1; on the draw: 7 + T. I rely on my knowledge of the Comprehensive Rules (103.8: only the starting player of a two-player game skips the first draw) and did not look it up in this round. [Approximate] Mulligans, extra draws, free-spell and tutor effects ignored. Shown as "Estimate. Ignores mulligans and extra draws."
- **Verified example.** 2 cards in 100, 12 seen: 1 − (88 × 87) / (100 × 99) = 22.7%. The correct library is 99 (the commander is in the command zone): 1 − (87 × 86) / (99 × 98) = 22.9%. Both are "about 23%": **right.** n = 12 at turn 5 holds for a pod, and for a two-player game on the draw. Other values (N = 99, n = 12): 1 card 12.1%; 3 cards 32.4%; 4 cards 40.9%; 10 cards 74.3%. On the play in a two-player game (n = 11): 2 cards 21.1%.
- **Where the function lives:** `src/lib/draw-odds.ts` (pure, no database): `chanceOfAtLeastOne({libraryCount, copiesInLibrary, cardsSeen})` and `cardsSeenByTurn({turn, players: 'pod' | 'two_on_play' | 'two_on_draw'})`. RQ-13's "chance of too few, too many or about right lands" calls `chanceOfAtLeastOne`/a sibling in the same file; the app and the connector import it. Unit tests: the example above plus edge cases (K = 0 gives 0, K = N gives 100%, n above N − K gives 100%, n = 0 gives 0). Integration: one test that the rail and `get_deck_health` print the same figure.
- **Display.** In the category detail and in the connector's reply, not on every rail row. One turn selector (default 5).

## j. MCP surface and the write gateway
The gateway: each Claude edit tool calls `ctx.gateway.submit` with an action to `ai_submit_change`, which plans, executes, logs to `ai_change_log` and allows Undo, with `reason` required by the tool schema and stored by `ai_record_change_reason` [Confirmed: src/lib/connector/tools/edit-tools.ts, write-gateway.ts].

| Need | Tool | Gateway | Notes |
|---|---|---|---|
| List a deck's categories and ranges; read health | `get_deck_health` (rewritten, one call) | read-only handle, no write | Returns, per category: name, kind, count, range, source (default, owner, Claude proposed), status, verdict, odds with assumptions; plus not-in-any-category, deck total, mana sources, double-faced count. The old EDHREC fields stay only as a reference line. Rewrite the description (see below). One read tool, not two, so numbers cannot disagree. |
| Assign cards to categories | `set_card_category` (existing) | `deck_category` (existing) | Unchanged mechanics. Description fixed: it replaces a card's whole list, so send the existing names plus the new one; the first name is the list group; use the exact names from `get_deck_health`. Add a note in the reply for any name that matches no category of the deck, with a near-match ("'Card Draw' is not a category here; did you mean 'Card Advantage'?"). A small synonym table per kind (Draw, Card Draw → Card Advantage; Removal → Targeted Removal; Wipes, Board Wipes → Board Wipes / Mass Disruption; Win Condition(s) → Game Plan) resolves to the generic and says so, like the existing case-matching. |
| Create or rename a category | `save_deck_category` (new): `deck_id`, `reason`, `name`, optional `category_id` and `new_name` | new change kind `category_save` | Create: adds a row. Rename: updates the row and rewrites the name on every card in that deck in one step, logged per card for one Undo. Cannot change a generic's kind, cannot delete, refuses Maybeboard, Sideboard, Commander. |
| Propose a range | `propose_category_target` (new): `deck_id`, `category_id`, `min`, optional `max`, `reason` | new change kind `category_target` | Always stored proposed. Refused with `left_alone` when the owner already confirmed one. Result text tells Claude "proposed, the owner must confirm in Oracle". |
| Confirm a range | none, by design | owner route only | Owner-only functions (section b). |

**Tool-wording problem (found in `reports/2026-11-18-architect-card-info-vs-claude-use.md`; the handoff dated it 2026-11-19).** `add_cards_to_deck` says "Give every card a role category (for example Ramp, Card Draw, Removal, Board Wipes, Lands) ... only a card sent without one is filed under 'Other'", and the `category` field says "Role category for this card". Both are stale (new cards start in the type's category since 2026-11-18) and will push Claude to coin loose names such as "Card Draw" that health would not count. Replace with: a card starts in its type's category; to count it as ramp, removal and so on, use the exact category names from `get_deck_health`. Same fix for `set_card_category` ("any names; new ones are fine, for example to sort a deck by archetype": new names are fine only through `save_deck_category`, so health knows them) and for the collection tools' "role" sentences (add "guessed from rules text, not from the deck's categories"). `get_deck_health`'s own description is rewritten (it still says "ramp, draw, removal and board wipes against the commander's typical numbers"). Add three plain lines to the tool texts: Game Plan is the home of cards that fit no other generic; strategy categories sit beside it; a proposed range has no verdict until the owner confirms.
- **Delta tool option.** `set_card_category` replaces whole lists, so Claude can drop a membership by mistake. A small `categorise_cards` (add or remove one category, keep the rest) would be safer. Not proposed now; add only if the slice 5 Claude test shows dropped memberships.

## k. Conflicts with locked decisions and the 2026-11-19 plan (recommendation first)
1. **D-060 "Claude sets and maintains a deck's health targets ... the owner does not manage them" [Confirmed: decisions.md line 77].** Conflict is partial. The 2026-11-19 conflict list (C1) recommends superseding it with "Claude does not set, store or change health numbers" [Confirmed: reports/2026-11-19-architect-conflict-list.md]. This direction reverses that half: Claude proposes ranges, the owner confirms. **Recommendation: supersede D-060 with new wording and drop C1's wording.** Proposed text: "Deck health counts the deck's own categories against a range per category. Every deck starts with six categories and the Command Zone ranges, which the owner can change. Claude may add categories and propose ranges with a reason, undoable for 7 days; only the owner confirms a range, and a proposed range gives no verdict. Category, Tag and Why stay separate." Trade-off: Claude's proposals are visible but slower than D-060's "apply at once"; this matches the owner's current wish and the earlier "proposals apply at once" answer (Q8) already being superseded.
2. **Tags (RQ-12 slice 4).** A category is not a Tag. Tag: what a card does in any deck, global, read-only. Category: this deck's grouping, per deck, writable. The owner's three words stay Tag, Category, Why. **Recommendation: keep them separate and never write one into the other** (conflict list C8, brief section 6). Two consequences: (1) the RQ-12 brief's use "(c) inputs to Deck health counts" is withdrawn, since health now counts categories; (2) Tags can later help Claude find candidates ("owned cards tagged ramp not in a deck") and seed new decks, but a person or Claude still assigns categories. The one-time setup here copies the text-reading result into categories, not Tags, so it does not break the rule. Collision points: the card window must show Tags and Categories as separate sections; the collection tools' "role" filter is replaced by the Tag filter in slice 4.
3. **Card window shows one category.** The 2026-11-18 owner decision (one chip with Edit) [Confirmed: reports/2026-11-18-architect-card-info-vs-claude-use.md section 2c.3; D-010 "secondary shown as a badge"] hides memberships health now counts. **Recommendation: show all memberships as read chips, with Edit unchanged,** after Gate 3. Needs owner approval.
4. **Category-management brief and CC-11** (unbuilt backlog): overlap on rename. Keep cross-deck merge there; per-deck rename comes from this work.
5. **CC-22** (Claude files cards under role categories): superseded by the wording fix above.
6. **D-001, D-005 (maybeboard is separate), D-030 (a failure is never a pass):** no conflict. Health errors stay real errors. Categories stay in `deck_cards`.
7. **Plan of 2026-11-19 (slices 1 to 4 and CC-26):** DV-01 (rail), DV-04 (reason) built; this builds on both [Confirmed: git log, plan]. The 2026-11-19 plan said "Deck health keeps today's groups and sources" for slices 1 to 3. This work changes that and is its own feature (new IDs HC-01 to HC-08, section l). The unused CC-26 tables stay; the owner decides cleanup separately.
8. **Bracket:** nothing here refuses, blocks or filters by bracket.

## l. Risks, and the Gate 4 slice plan
**Risks.**
- Day-one shock: Yedora goes from "Well covered" to five off-range rows. Mitigation: bridge slice first, owner reads real numbers before stored data.
- Damaged names and lost memberships through the 16-character and 3-entry caps (section d). Mitigation: slice 2 before any second category is stored.
- Game Plan as a remainder inflates on every deck whose other rows are light. Mitigation: label it; question 1.
- Claude invents near-duplicate names. Mitigation: exact names in the read tool, synonyms and near-match notes.
- Rename rewrites many cards: must be one transaction with one Undo; test on a throwaway copy.
- Re-import resets categories: [Approximate] import paths set categories from the source list. Needs a rule in slice 3 (re-import keeps definitions and re-appends generics for cards with none). Not designed here.
- Concurrent owner and Claude edits: live refresh exists (`useLiveRefresh`); the Undo "changed since" rule covers it.
- Connector tool count grows by two; both are small.
- The six ranges are a template, not a measure. A Commander deck with 40 lands and a different plan reads Heavy until the owner sets a range; that is intended.

**Slice plan** (owner sees each before the next; stored-data steps need approval and a rehearsal on a throwaway copy first; tests on a separate test account).

| Slice | Size | Stored-data change | What the owner can test | Depends on |
|---|---|---|---|---|
| HC-01 Six default ranges with Light, Ok, Heavy, in the rail and `get_deck_health`, computed from today's card reading; Game Plan as the remainder; "Not in any category"; EDHREC as a reference line | M | none | Open Yedora and A rot to process: the rows in section g. Claude reads the same | Gate 3 for the Heavy state and Game Plan row |
| HC-02 Category plumbing: up to 5 per card everywhere, names up to 60 characters, card window shows every category, tool wording fixes (j) | M | none | Give a card three categories with a long name in the card window and the list: nothing cut, nothing lost | Gate 3 (card window) |
| HC-03 Stored categories: category list table, backup, one-time setup, health reads from stored categories; old text-reading verdict path removed | L | `deck_categories`, backup table, setup function | Rename Ramp to Mana: counts unchanged. Totals line and "sits in more than one". Reverse the setup on the copy | HC-01, HC-02 |
| HC-04 Ranges you set: ranges table, Set my own range, Use default, strategy categories you add by hand in the rail | M | `deck_category_targets`, owner functions | Set Ramp 14 to 18 on Yedora: "ok", "You set". Add Payoffs with no range: count only | HC-03 |
| HC-05 Claude's side: `save_deck_category`, `propose_category_target`, rewritten `get_deck_health`, Confirm control, History rows with reason and Undo | L | two new change kinds in the allowed list, functions behind the front doors | Ask Claude to add Protection and propose 3 to 5: shows "Proposed", no verdict, History with reason and Undo; Claude cannot overwrite your confirmed range | HC-04, DV-04 (built) |
| HC-06 Lands: double-faced count and mana sources | S | none | Elfball with Partners: "32 lands + 3 double-faced", sources shown | HC-03 |
| HC-07 Odds read-out and shared maths | S | none | Category detail: 2 cards in 99, turn 5, "about 23%, estimate"; Claude returns the same | HC-03 (the maths file can land earlier) |
| HC-08 Remove dead code: unmounted category-health in the deck list, the Strategy tab's stub category section and its fuzzy core names, `GENERAL_GUIDE`, `roleState` | S | none | Nothing visible | HC-05 |

HC-01 is the smallest useful slice. If HC-01 is skipped, start at HC-02, then HC-03.
**What gets deleted when the new version ships:** the "2 short" verdict and the EDHREC-as-target path in `buildDeckHealth`, the Strategy tab category block, the unmounted `DeckListTab` category health, stale tool sentences. The classifier file stays (seeding, EDHREC reference, collection search until Tags).

## m. Anything in the requirements wrong or too heavy
- **Req 3 "five generic categories keep EDHREC as default"** is replaced by message 2 (six categories, template ranges). Done.
- **Req 4 "health reads from categories" in one step is heavy.** Smaller alternative: HC-01 first (no stored data).
- **Req 5 "counts once in each category ... confirm no double count":** impossible to hold both. Counts per category are per category; the deck total is separate (section d).
- **Req 7 "odds for each category"** on every rail row is noise. Put it in the detail and the connector.
- **Req 8 "create or rename" by Claude:** rename is the costly part (rewrites cards, one Undo). Allowed, but last, and question 5 offers owner-only rename.
- **Game Plan seeding rule** makes its verdict a symptom of the other rows. Offered a count-only alternative (question 1).
- **"Targeted Disruption / Mass Disruption"** from the first message: the classifier finds only board wipes, not counterspells or stax. The Mass Disruption half of Board Wipes / Mass Disruption starts empty and is filled by hand or by Claude.
- **Per-card Why and Keep, bracket, chat:** untouched, as instructed.

## Changed files
- docs/oracle/briefs/categories-drive-deck-health.md — new Gate 1 brief
- docs/oracle/reports/2026-11-20-architect-categories-health-audit.md — this report
- docs/oracle/status.md — new section marked PROPOSED (HC-01 to HC-08); no existing row edited

## New decisions made (need owner confirmation)
- IDs HC-01 to HC-08 for this feature.
- Recommended supersede wording for D-060 (section k), replacing the conflict list's C1 wording.
- Show all categories on a card in the card window (reverses the one-chip rule).
- Recommended: new tables, not the unused `deck_health_targets`.
- Cap stays at 5 categories per card; names up to 60 characters.

## Assumptions
- The ranges are 25 to 30 for Game Plan ("about" is not a soft edge in the verdict).
- Commander, companion, Maybeboard and Sideboard are outside every count, as in today's health.
- "Light" is any count below the minimum, as the owner's rule states, replacing today's "2 or more short".
- A deck's library is its main-list card count (99 normally).
- The owner's own category names in future decks are adopted by exact name (case-insensitive) onto generic kinds.

## Challenges to locked decisions
- D-060 — owner's 2026-11-20 direction (Claude proposes, owner confirms; categories drive health); partly opposite to the 2026-11-19 conflict list C1 — supersede with the wording in section k.

## Open questions
Seven, with recommendations, in the brief section 9 (Game Plan day one; proposed range beside default; double-faced land counting; cards seen by turn; Claude rename; always show six rows; bridge slice first).

## Verification
Read-only live queries (Supabase `execute_sql`, SELECT only): column lists for `deck_health_targets`, `deck_cards`, `ai_change_log`, `ai_change_reasons`, `ref_cards`, and columns named layout/card_faces/produced_mana; row counts of `ref_card_roles`, `user_card_roles`, `deck_card_jobs`, `deck_strategy_points`, `deck_health_targets` (all 0), `ai_change_reasons` (7), decks (23), deck cards (2,017); change-kind allow-list (includes card_label, strategy_point, health_target); names of live functions; category-shape counts (2,014 single-entry, 3 empty); first-category names with card and deck counts; decks using non-type names; EDHREC cache rows for Yedora and Wilhelt.
A read-only script outside the repo (`/tmp/ohealth/run.ts`, `run2.ts`, not saved in the project, only SELECTs) called the real `rolesForCard`, `classifyDeckCard` and `healthCardsFromRows` over all 23 live decks to produce the counts above, and compared the Land category with the classifier. Odds figures computed with a one-line script, checked by hand.
Files read: docs/oracle/process.md, status.md, decisions.md, AGENTS.md rules, briefs/card-tags-and-deck-slot-why.md, briefs/category-management.md, docs/category-taxonomy.md, reports/2026-11-18-architect-card-info-vs-claude-use.md, 2026-11-18-developer-default-category-rule.md, 2026-11-19-architect-conflict-list.md, plans/2026-11-19-deck-page-tags-slice-plan.md, specs/deck-rail-strategy-tags.md (first part), supabase/drafts/20261118120400_roles_db5_health_targets.draft.sql, supabase/migrations/20261116190000_ai_deck_category.sql, and the source files cited above.
No code, data or migration changed; no hosted write; no build or test run. The handoff cited the tool-wording report as dated 2026-11-19; the file is dated 2026-11-18 (untracked in the repo, not committed here).
