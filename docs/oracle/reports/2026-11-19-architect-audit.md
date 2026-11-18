# Report: architect audit for the 2026-11-19 owner direction (strategy modal, tags, chat pause, reason on Claude changes)
Role: Architect
Status: DONE
Task as received: "You act as the Architect. PLANNING ROUND, DOCS ONLY." Read the owner direction dated 2026-11-19 (its OUT OF SCOPE list is binding), AGENTS.md, docs/oracle/process.md and the READ FIRST files. Hard constraints: no build; no migration applied; no hosted write of any kind (read-only live Supabase queries allowed); no code changes; do not edit docs/oracle/decisions.md or the card-roles spec; do not touch Picklist components; do not delete or change in-app chat code; do not use EDHPowerLevel.com. Deliverable (a): this read-only audit, covering (1) deck fields and a mapping onto the new Strategy modal, (2) bracket empty on all decks, (3) Why and Keep columns on the deck-card record, (4) deck page History versus Recent changes, the change-log reason column and what DV-04 needs, (5) in-app chat dependencies and a safe pause plan (DV-03), (6) Game Changers in Scryfall data and what else RQ-14 can count, (7) tag coverage on the 2,832-card collection, (8) where the EDHREC build picker, guide and category manager live long term, (9) state of CC-26 drafts DB-1 to DB-5, (10) slice 2 editable-roles code, (11) the DB-6 draft and the v4 mockup, (12) a sketch of the stored-data changes as drafts for owner approval (no migration files). Plus open points for the owner, recommendation first.

Tags: `[Confirmed: path]` = read in this task. `[Confirmed: live]` = read-only query on the live database on 2026-11-19. `[Approximate]` = not checked. Nothing was written to any database. No code or other docs were changed. The only file added is this report.

## Summary for the owner
Almost everything the new Strategy window needs already has a home, and nothing has to be moved or deleted: no deck has any strategy, bracket, playgroup or note saved, so the new window starts clean. Three things are new work: a one-line summary field, a fifth bracket (cEDH; today the app stops at four), and a place for Claude to read your strategy (today Claude can read only the bracket). The History button on the deck page is not the same screen as Recent changes by Claude, so "See in History" needs a decision from you (point 3 below). Pausing the in-app chat is a small job with no database change, but it touches more places than your list (the new-deck brewing chat also calls the paid service). Tags can start from Scryfall's own tags: about 98% of your 2,832 cards have at least one, but only about 39% fall into one of the 13 broad tags with today's mapping, so the gaps need the AI fallback and your spot checks.

## 0. Corrections to the brief's numbers
- The live database holds **22 decks**, not 21 [Confirmed: live]. All 22 are Commander. The backlog says 21.
- `docs/oracle/status.md` has no CC-26 row of its own. CC-26 is named only inside the DV-02 line [Confirmed: docs/oracle/status.md line 321]; its content lives in the brief, spec, contract and drafts. Step (f) should add the row before marking it partly superseded.
- The change log (`ai_change_log`) has **no `reason` column**. The `reason` column with the four values (over_ten, recent_total, busy, card_move) is on the waiting-requests table `ai_pending_changes` [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql line 31; live column list]. The owner direction and DV-04 say "ai_change_log reason". The conclusion stands (do not reuse it) but the table name changes the stored-data draft, see section 12.

## 1. What the deck record stores today, and the mapping onto the Strategy modal

### 1.1 Where each thing lives today
| Today's item | Stored in | Notes |
|---|---|---|
| Bracket | `deck_strategy.bracket` (whole number 1 to 4) and an older text column `decks.bracket` | The app reads the strategy one first, then the deck-row one, else "not set" [Confirmed: src/lib/connector/tools/bracket.ts]. Everything rejects 5: the page route (`bracket < 1 \|\| > 4`, src/app/api/decks/[id]/strategy/route.ts), the connector tool (`.min(1).max(4)`, src/lib/connector/tools/edit-tools.ts line 128), and the database function (`~ '^[1-4]$'`, supabase/migrations/20261117200100_cc15b_deck_create_setup.sql line 107). Today's labels are "Casual / Precon, Focused, Optimised, Competitive" [Confirmed: src/components/StrategyTab.tsx lines 127 to 132], not the owner's Exhibition, Core, Upgraded, Optimized, cEDH. |
| Playgroup | `deck_strategy.table_context`, shown as "Table context" with the hint "Describe your playgroup or meta" | [Confirmed: src/components/StrategyTab.tsx lines 807 to 811]. A separate, never-built global idea (`playgroup_description` in src/lib/user-preferences.ts) points at a table `user_preferences` that does not exist live [Confirmed: live], so that file is dead code for this purpose. |
| Win condition | `deck_strategy.win_condition` | Shown in the Deck Intent form. Not in the new modal. |
| Strategy notes (the "Notes" text box) | `deck_strategy.strategy_notes`, max 4000 characters | Claude's `set_deck_setup` can write it today and **replaces** the whole text [Confirmed: edit-tools.ts line 127]. |
| Dated "Earlier notes" list | `deck_notes` (deck, text, date) | The Strategy tab "Notes" section reads it [Confirmed: src/components/StrategyTab.tsx lines 898 to 935, src/app/api/decks/[id]/notes/route.ts]. Only the Upgrade apply and skip routes write to it, as change-log lines [Confirmed: src/app/api/decks/[id]/upgrade/apply/route.ts line 18]. It is not hand-written notes. |
| Budget | `deck_strategy.budget_mode` (collection / budget / unrestricted) and `budget_ceiling` | Also `frustration`, `format_rules`, `health_overrides` on the same row. |
| Last changed | `deck_strategy.updated_at` only | No "by whom". Claude changes to bracket and notes are logged in the change log under kind `deck_setup` with before/after for 7-day Undo [Confirmed: supabase/migrations/20261117200100_cc15b_deck_create_setup.sql]. Owner edits through the page are not logged. |

Live counts [Confirmed: live]: 22 decks; `decks.bracket` filled on 0; `deck_strategy` rows 0 (so bracket, win condition, table context, strategy notes, budget mode, budget ceiling, frustration, format rules and health overrides are all filled on 0); `deck_notes` rows 0.

### 1.2 Recommended mapping (recommendation first)
**Recommendation: keep every existing column where it is, add two small fields, and move nothing.** The window reads and writes the existing strategy row. Because the live data is empty, there is nothing to convert, copy or delete.

| Strategy window field | Stored in | Change needed |
|---|---|---|
| Target bracket (1 Exhibition to 5 cEDH) | `deck_strategy.bracket` | Allow 5 in the page route, the connector tool and the database function; change labels. Meaning stays "a whole number". Existing 1 to 4 values (none exist) would keep their number; their names change (1 Casual becomes 1 Exhibition and so on), so say so in the release note. |
| One-line summary (max 120) | **New** `deck_strategy.summary` (text, length check 120) | Stored-data change, section 12 S3. |
| Strategy (free text) | `deck_strategy.strategy_notes` | None for storage. Window label becomes "Strategy". The 4000 limit stays. Claude's replace-all behaviour on this field needs a decision (open point 6). |
| Playgroup (optional) | `deck_strategy.table_context` | Label only. |
| "Last changed by you or Claude, date" | `deck_strategy.updated_at` plus **new** `deck_strategy.updated_by` ('owner' or 'claude') | Small additive column; see S3. Without it the "by whom" would have to be guessed by comparing times with the change log, which is approximate. |
| See in History | link | Depends on point 3 (section 4). |

**Not shown in the new window and left as they are:** win condition, budget mode and ceiling, frustration, format rules, health overrides. Win condition is replaced by the Strategy free text ("how it wins"). If you later want Claude to know a budget, it can be a one-line addition to the window. The existing Deck Intent form and its Notes list go away from the page when the old Strategy tab is replaced (see section 8); the stored columns stay. The Upgrade engine and the chat prompt builder still read budget and bracket [Confirmed: src/lib/format-strategy-prompt.ts, src/lib/user-preferences.ts]; the chat one is paused.

**Earlier notes (`deck_notes`) are preserved exactly.** Nothing writes new rows except the Upgrade log. Recommendation: keep showing the list read-only (see section 8 for where), and do not fold it into the Strategy text.

**No data is migrated or deleted.** The only stored-data changes are two additive columns, and they need your approval first (section 12).

### 1.3 What Claude reads today (matters for "deck, strategy, health, cards")
`get_deck` returns the bracket only. It does not return strategy notes, win condition, playgroup or budget [Confirmed: src/lib/connector/tools/get-deck.ts and bracket.ts; no other connector reader touches `strategy_notes` or `table_context`]. `set_deck_setup` can write commander, strategy notes and bracket only [Confirmed: edit-tools.ts lines 127 to 131]. So "Claude reads the strategy through get_deck" is new code (a read-only change, no stored-data change), and writing the summary or playgroup through `set_deck_setup` is new code plus a change to the database function `ai_set_deck_setup` (stored-data change, rehearse first). The deck brief order "deck, strategy, health, cards" is a code-only reordering of the `get_deck` output.

## 2. Bracket is empty on every deck (verified)
**Confirmed.** Live read-only query, 2026-11-19: 22 decks, `decks.bracket` not empty on 0, `deck_strategy.bracket` not empty on 0, `deck_strategy` has 0 rows [Confirmed: live]. It is 22 decks, not 21.

## 3. Why and Keep on the deck-card record
**Neither exists.** Live column list of `deck_cards` [Confirmed: live]: id, deck_id, card_name, scryfall_id, set_code, quantity, categories, tags, is_commander, dead_weight_flag, dead_weight_reason, ownership_status, proxy_of_deck_id, copy_id, user_id, placement_source, requested_finish, is_generic, generic_sleeved, requested_language, command_zone_role.

Near-misses, none of which fits:
- `tags` (text) is empty on all 1,917 deck cards [Confirmed: live]. The name now collides with the new word "Tag", which is global and per card, not per deck slot. Recommendation: do not reuse it, and note it as a candidate for the later cleanup.
- `dead_weight_flag` and `dead_weight_reason` are filled on 0 rows [Confirmed: live]. They were meant for "cut candidates", the opposite of Keep. The DB-6 contract already says it will not touch them [Confirmed: docs/oracle/contracts/deck-strategy.md T14].
- `categories` is the owner's Category (1,914 of 1,917 filled). `command_zone_role` is the commander/partner/companion marker (D-058).

So Why (one line, optional) and Keep (optional flag) are **new columns on `deck_cards`** and go into the stored-data draft (section 12 S2). The CC-26 job table `deck_card_jobs` (applied, empty) has a `reason` column but it is keyed per deck and card identity with a proposer and job name; it is more than Why needs and is on the "drop" list.

## 4. History button versus Recent changes; the reason column; what DV-04 needs
**They are different screens.**
- The deck page History button opens `VersionHistoryPanel`, a dialog titled "Version History" that saves and restores whole-deck snapshots ("Save Current State", versions v1, v2, restore) [Confirmed: src/components/VersionHistoryPanel.tsx lines 135 to 175; mounted at src/app/decks/[id]/page.tsx line 289]. It knows nothing about Claude.
- "Recent changes by Claude" is a tab in the Claude connector settings page, with Undo for 7 days [Confirmed: src/components/connector/RecentChangesTab.tsx, src/app/settings/claude-connector/page.tsx]. It lists all decks together and has no per-deck entry from the deck page.

So the owner's wording "See in History" in the modal footer, and "History" in the "..." menu, are ambiguous. Options for the owner (recommendation first, open point 3): (A) make the deck page History show two sections, Claude's changes for this deck (with Undo and the reason) above the existing saved versions; (B) keep History as it is and make "See in History" open Recent changes filtered to this deck; (C) rename the existing button "Versions" and add a new "Claude changes" item. Recommendation is A: one place per deck, the reason sits beside "Changed by Claude", and no second history is built (the data and Undo already exist; only a per-deck filter and a placement are new).

**The reason column, correctly placed.** `ai_pending_changes.reason` (CHECK in over_ten, recent_total, busy, card_move) holds why a big edit or a card move is waiting for approval [Confirmed: supabase/migrations/20261116150000_ai_change_log_and_pending.sql line 31]. It is empty today (0 rows) [Confirmed: live]. `ai_change_log` has these columns [Confirmed: live]: id, user_id, group_id, connection_id, client_name, kind, deck_id, deck_name, other_deck_id, other_deck_name, card_name, oracle_id, printing_id, deck_card_id, other_deck_card_id, copy_id, before, after, pending_id, approved_by_owner, created_at, undoable_until, undone_at, undone_by. Live it holds 183 rows (181 deck_add, 2 deck_create), none undone [Confirmed: live].

**What DV-04 needs (stored-data change, section 12 S4):**
1. One new nullable text column on `ai_change_log`, named so it cannot be confused with the hold reason (suggestion `claude_reason`, max 200 characters). The table is append-only except undo fields, enforced by a trigger [Confirmed: migrations 20261116150000 and 20261117120000]; adding a column is allowed, and the 183 existing rows stay empty (shown as no reason).
2. A way to carry the reason from the tool to the log. Every Claude write tool takes a `reason` input and passes it inside the existing request. There are 11 places that insert into `ai_change_log` across the functions `_ai_execute` (latest body in 20261116190000_ai_deck_category.sql), the deck-create and deck-setup functions (20261117200100) and the CC-26 front doors; each must write the reason. The widened-kind front-door functions `_ai_plan`, `_ai_execute`, `_ai_undo_blocker`, `ai_undo_group` exist today in renamed `*_pre_roles` form (section 9), so the function edits must be made against the live bodies, not the old migration text, and rehearsed on a throwaway copy.
3. For requests that wait for approval, the reason can ride inside the stored request (`ai_pending_changes.payload` is JSON), so no second column is needed there.
4. Code: a required-looking `reason` field on each edit tool (short, one line), `ai_list_recent_changes` returns it, the Recent changes row shows it beside "Changed by Claude", and the same list feeds the deck History section.
5. Rule to decide: "every Claude write has a reason" is enforced by the tool schema (required field), not by the database (so old rows and any internal writer still insert).

## 5. In-app chat: dependencies, entry points, and a safe pause plan (DV-03)

### 5.1 What exists [Confirmed: file reads and searches in the worktree]
**Live entry points a user can reach**
| Entry point | Where | What it does |
|---|---|---|
| Oracle side panel (the "Oracle side tab") | `OracleSidebar` mounted for every page in src/app/layout.tsx line 63 | Chat panel, session history (`SessionHistoryPanel`), proposals (`ChatProposalCards`). |
| Oracle button in the top bar (desktop and phone) and keyboard shortcut ⌘⇧O | src/components/TopNav.tsx lines 203 to 235; src/contexts/OracleContext.tsx line 189 | Opens and closes the panel. |
| "Chat about this" on the footer health strip | src/components/HealthStrip.tsx lines 41 to 49 | Closes the health panel, opens the chat and **sends a question** (this is the "fills the chat" link). |
| New-deck commander page opens the panel on load | src/app/decks/new/page.tsx lines 102 to 105 | Calls open() when the page mounts. |
| Explore page | src/app/explore/page.tsx lines 15 to 23, 67 | Calls open() and reads sessions. |
| Pages that set chat context | src/app/page.tsx line 89, src/app/collection/page.tsx line 35, src/app/decks/[id]/page.tsx line 77 | Only set context (no paid call by themselves). |
| New-deck brewing chat (Brew v2) | src/app/new-deck/page.tsx (calls `/api/brew/chat`, `/api/brew/skeleton`, `/api/brew/extract`, `/api/brew/assess`, `/api/ai/brew/*`), `BrewChatView`, `ChatPanel`, `ModelSelector` | A second chat, not in the owner's list, that also calls the paid service. |

**Not reachable today (orphans; keep, nothing to hide)**
- `OracleChat` (src/components/OracleChat.tsx): no page imports it; only a test mocks it [Confirmed: search of src/app/new-deck/page.test.tsx and import search].
- `DeckChatTab` (src/components/DeckChatTab.tsx) and its hook `useDeckChat`: not imported by any page. The deck page has no chat tab [Confirmed: no "chat" in src/app/decks/[id]/page.tsx].
- `OraclePromptCard`: defined, used by no page.

**Calls to the paid AI service.** Provider code is `src/lib/provider-factory.ts` and the adapters; the Anthropic key is required at load. Routes that call it [Confirmed: search for the factory and adapter imports]:
`/api/oracle/chat`, `/api/oracle/sessions/[id]/generate-name`, `/api/decks/[id]/chat`, `/api/brew/chat`, `/api/brew/extract`, `/api/brew/assess`, `/api/brew/skeleton`, `/api/ai/brew/start`, `/api/ai/brew/generate`, `/api/ai/brew/investigate`, `/api/ai/brew/refine` (11 routes). `scripts/distill-single-commander.ts` is a manual script, not part of the app. The `/api/ai/search`, `/api/ai/recommend`, `/api/ai/build-deck` and `/api/ai/mana-analysis` routes do not use the provider code (0 matches) and are out of the pause. Other chat-adjacent routes (`/api/oracle/sessions`, `/api/oracle/history`, `chat-proposals/*`) read or write our own database only; they stay.

### 5.2 Safe plan: one switch, nothing deleted (scopes DV-03 as a small task)
**Recommendation:** one setting, default OFF, checked in one place.
1. Add one small module with the setting (suggestion: an environment value `NEXT_PUBLIC_AI_CHAT_ENABLED`, unset or anything but "true" means paused). One module is the only place that reads it.
2. **Screens (hide):** the Oracle button and ⌘⇧O shortcut; the `OracleSidebar` mount; the health strip's "Chat about this" (it already hides itself when no chat is available, so pass "no chat"); the auto-open on the new-deck commander page and the Explore page open(). Pages keep setting context harmlessly.
3. **Server (stop the spend):** the 11 routes above return a short "paused" answer (HTTP 503, plain message) before touching the provider. This is the part that really stops charges, and it also covers an old browser tab left open.
4. **Brew v2 decision (open point 7):** include the new-deck brewing chat in the pause (recommended: it is a paid chat too) or leave it running.
5. No file is deleted. `OracleChat`, `DeckChatTab`, `useDeckChat`, `OracleContext`, the routes, adapters and tests stay. Existing tests that open the chat will need the switch turned on in their setup or an added "paused" test; this is the main work. Bringing the chat back is one setting change and a redeploy (a public setting is read at build time).
6. No database change. No change to the connector, Undo or Recent changes.
7. Size: small (about 6 screen touches, 11 one-line route guards, a few tests). Can run in parallel with everything else.

## 6. Game Changers and what else RQ-14 can count
- **Scryfall exposes it, we do not store it.** Scryfall's card record has a boolean `game_changer`. A live read-only call (card "Rhystic Study") returned `game_changer: true`, and the search `is:gamechanger` returned **53 cards** today [Confirmed: Scryfall API, 2026-11-19]. Of those, **9 are in the owner's collection** [Confirmed: live collection against that list].
- **Our stored copy drops it.** The bulk sync keeps only a fixed set of printing fields and does not read `game_changer` [Confirmed: src/lib/card-data-sync.ts lines 52 to 58 and 150 to 190]. The printings table `ref_printings` has no such column [Confirmed: live column list]. The local Scryfall Tagger files have no Game Changer tag [Confirmed: search of data/scryfall-tags/oracle-tags.jsonl]. So RQ-14 needs either one added true/false column on the card reference table filled by the sync (stored-data change, rehearsed first), or a dated list kept in code or data (the Daily-use brief already says "stored as dated data, not hard-coded" [Confirmed: docs/oracle/briefs/daily-use-deck-advisor.md line 130]). Recommendation: the column, because Scryfall keeps it current and no list needs hand upkeep. The list changes (a next possible change is noted as 2026-11-30).
- **What else is countable now from Scryfall Tagger data we already hold** (local file dated 2026-08-07; counts are cards in the whole tag file) [Confirmed: data/scryfall-tags/oracle-tags.jsonl]: mass land denial (tag `mass-land-denial`, 111 cards; 7 in the owner's collection), extra turns (tag `extra-turn`, 64 cards), extra combat (`extra-combat-phase`, 54). Two-card combos need Commander Spellbook (not built; status.md notes two known bugs in `spellbook-client.ts`). Tutor density and intent are not countable, as the direction says. The tag file is old, so the counts need refreshing from Scryfall's daily Oracle Tags file before use.
- The bracket rules themselves (limits per bracket) are not stored anywhere and should be written down in the RQ-14 brief with a source and date.

## 7. Tag coverage on the owner's collection (2,832 cards)
Method [Confirmed: read-only run on 2026-11-19; temporary script, deleted afterwards, nothing written]: all 2,832 `user_cards` rows read from the live database (all have an oracle id, all distinct); joined by oracle id to the local Scryfall Tagger file (4,524 oracle tags, snapshot 2026-08-07); the existing mapping `TAG_TO_CATEGORY` in src/lib/scryfall-category-mapping.ts (72 mapped tag names) applied.

| Measure | Cards | Share of 2,832 |
|---|---:|---:|
| Carry at least one Scryfall oracle tag | 2,788 | 98.4% (trial on all 38,705 cards: 93.1%) |
| Carry at least one tag the current mapping knows (any category, including the catch-all "Utility") | 1,689 | 59.6% (trial draft map: 58.3%) |
| Carry at least one of the **broad** tags the mapping supports today (ramp, card draw, targeted removal, board wipe, tutor, counterspell, protection, recursion, hand disruption) | 1,115 | 39.4% |
| No mapped tag at all | 1,143 | 40.4% |

Per category on the owner's cards (a card can count in several): removal 459, card draw 350, ramp 135, recursion 88, protection 82, tutor 68, counterspell 30, hand disruption (discard) 21; board wipe 50 (as a secondary label); sacrifice outlet 111 (secondary label); catch-all "Utility" 909 (not a tag worth showing).

Gaps seen:
- **No mapping exists for four of the 13 broad tags**: fixing, card selection, graveyard hate, stax/tax. Scryfall does hold related tags with owned hits (for example `surveil` 53, `scry` 40, `loot` 13, `repeatable-loot` 16, `hate-graveyard` 21, `mana-fix` 6), so a mapping can be written; counts are small because the tag names are narrow.
- Mechanic tags with owned hits and no mapping: repeatable creature tokens 167, repeatable Treasures 19, sacrifice outlets for artifacts 25 and lands 24.
- Ten mapped tag names have zero owned cards (bounce, counterspell-hard, tutor-sorcery, protects-player, reanimate-any, recursion, hand-disruption, token-generator, sacrifice-outlet, etb); some of those names probably do not match Scryfall's current names and need checking.
- The Tagger file is from August; the 2026-11 trial used newer data. Refresh before the real mapping run.
- The app's own prepared index (`data/scryfall-tags/oracle-id-tags.json`, used by `scryfall-tags-data.ts`) holds only 16,243 cards with synergy-style tags and covers just 1,350 of the owner's cards. It is not the right source for Tags; the full Tagger file is.
- Lands: `user_cards.type_line` held no "Land" text in this read, so land fixing (dual lands and so on) could not be checked here. Land tags need their own check.

Planning figure: for the owner's own collection, Scryfall tags via an extended mapping should reach roughly 55 to 70% of cards with at least one useful tag [Approximate: 39.4% today with 4 of 13 broad tags unmapped and no mechanic layer]. The remaining 30 to 45% (about 850 to 1,250 cards) are the AI fallback list, plus EDHREC candidate cards. That list is small enough for a one-time run with owner spot checks.

## 8. Where the build picker, guide and category manager live long term
**Recommendation: a tab named "Build" on the deck page, holding the build picker, its guide and the category manager, and the "Strategy" name goes to the left rail block and its window.** Reasons: the owner's three words need one meaning each; "Strategy" now means the owner's own plan (the modal); the build picker and guide are "what other players do with this commander", which is a reference, not the owner's plan. Today all of them sit in the old Strategy tab (build picker, "Build Strategy" guide, "Categories" manager, then Deck Intent and Notes) [Confirmed: src/components/StrategyTab.tsx sections 1 to 6; `BuildSelector`, `StrategyGuide`, `CategoryTagEditor`].
- Right now (this direction): **leave them where they are, in the existing Commander guide area** (as the direction says), and only remove the Deck Intent form and the Notes box from that tab once the modal exists, so nothing is lost in between.
- Long term: the tab gets the name "Build". The category manager is the one piece that acts on the owner's Category in the Cards tab (D-015: controls sit inside the scope they act on), so a later option is a "Manage categories" entry next to "Group: Category" on the Cards tab. Recommendation: do not move it yet; it depends on the selected build (it only shows when a build is selected), so keep it with Build until that dependency is understood.
- Earlier notes (`deck_notes`, written by the Upgrade log): keep a read-only list under the Build tab for now. Later they fit better in History (section 4) or on the Upgrade tab, because they are Upgrade log lines.
- CC-26 slice 4 (moving these three into a "Build layer" inside a three-layer Strategy tab) is superseded by this; none of it was built [Confirmed: git history shows only slices 1 and 2 shipped, commits 984228f and 63bde94].

## 9. State of the CC-26 database drafts DB-1 to DB-5
All five are **applied live and empty** [Confirmed: live]. Their files still sit in supabase/drafts/ with "DRAFT. NOT APPLIED" headers; none is in supabase/migrations/ (the last file there is 20261117200100). That is drift: anyone reading the repo would think they are not applied. Recommendation: Gene records "applied live" in status.md and adds a note to each draft header; no file move now.

| Draft | Live objects | Rows | Under the new direction |
|---|---|---:|---|
| DB-1 (20261118120000) | `ref_card_roles` (13-value CHECK, columns oracle_id, role, proposer system/claude, basis), `user_card_roles`, functions `get_effective_card_roles`, `owner_set_card_role`, `owner_decide_card_role`, `_roles_fail`, others | 0 / 0 | `ref_card_roles` is close to what the Tag table needs (global, keyed by oracle id, read-only for users, empty). See S1 for why a new table is still recommended. `user_card_roles` and the owner functions become **unused** (no per-user tags, no accept or dismiss). |
| DB-2 (20261118120100) | Change kinds `card_label`, `strategy_point`, `health_target` added to the allowed lists on `ai_change_log.kind` and `ai_pending_changes.action`; the four connector functions `_ai_plan`, `_ai_execute`, `_ai_undo_blocker`, `ai_undo_group` renamed to `*_pre_roles` with thin front doors in front; handlers `_ai_*_card_label`, `_ai_*_strategy_point`, `_ai_*_health_target` | n/a | The widened allowed lists are harmless and **must stay** (removing a value from a CHECK while the front doors exist is a function-by-function change). The front doors **must stay**: they are in the live path of every connector edit today. Any DV-04 function edit has to target these live bodies. The `card_label`, `strategy_point` and `health_target` handlers become unused. |
| DB-3 (20261118120200) | `deck_card_jobs` and its functions (`get_deck_card_jobs`, `owner_set_card_job`, `owner_decide_card_job`, `owner_accept_job_proposals`, job hooks) | 0 | **Unused.** Jobs are dropped. |
| DB-4 (20261118120300) | `deck_strategy_points` and its functions (`owner_save_strategy_point`, `owner_decide_strategy_point`, `owner_delete_strategy_point`, `owner_accept_strategy_point_proposals`, `get_deck_strategy_points`) | 0 | **Unused.** Strategy points are dropped. |
| DB-5 (20261118120400) | `deck_health_targets` and its functions (`owner_set_health_target`, `owner_hand_back_health_target`, `get_deck_health_targets`) | 0 | **Unused.** D-060 Claude-set targets are out of scope. |

**What to leave in place:** everything above, untouched. They are empty, private (only the server can write), and not read by any screen or connector tool [Confirmed: search of src finds only the slice 2 card-window files, section 10]. Leaving them costs nothing and keeps the Undo chain for DB-2 intact.
**What removal would need (a separate, owner-approved cleanup, never part of this round):** (1) owner approval naming each object; (2) a throwaway rehearsal that applies the rollbacks in the stated reverse order (DB-5, DB-4, DB-3, DB-2, DB-1; the files exist as `*.rollback.sql`); (3) DB-2's rollback is the delicate one, because it restores the four connector functions that every Claude edit passes through, and it removes three values from the allowed lists, so it must first check that no log row uses them (live: none, kinds in use are deck_add and deck_create); (4) the rollbacks refuse while data exists, by design, so the check passes today only while the tables stay empty. Decision: do the cleanup only after the DV-04 function work, so the functions are edited once.
Nothing is dropped or changed this round.

## 10. Slice 2 editable-roles code in the card window, under read-only Tags
What exists [Confirmed: src/components/CardWindow.tsx lines 259 to 420; src/app/api/decks/[id]/cards/[cardId]/roles/route.ts (GET line 16, PUT line 66); src/lib/card-window-stored-roles.ts and -server.ts; tests CardWindow.test.tsx, card-window-stored-roles.test.ts, roles/route.test.ts]: a "Universal roles" section with chips, the source labels "Set by you / Standard / Proposed by Claude / Worked out from card text", an "Add role" picker, a remove button on each chip, and "Restore" for a removed standard role. A save goes through the PUT route to `owner_set_card_role` (stored in `user_card_roles`). Reads go through `get_effective_card_roles`, which merges the shared and personal layers. There is also a text-reading stand-in for the four old roles (ramp, draw, removal, wipes) shown when nothing is stored.

Under the new direction:
- **Remove:** "Set by you", "Proposed by Claude", Add role, remove and Restore, the PUT route and `writeOwnerRole`, their tests. Retire the word "role" in the window ("Tags").
- **Keep, adapted:** the GET path and the chip display, now reading the new global Tag table only, at most five chips with the rest searchable (as the direction says). The "Standard" label is dropped (a tag has no author in the window).
- **The text-reading stand-in:** keep until the Tag table is filled; show it only where no stored tag exists. Open point: show it or stay empty? Recommendation: stay empty once the table is filled for that card, so the same card is not described two ways.
- Old data to preserve: none. `user_card_roles` is empty; if the owner had added roles in slice 2 they would be there, but there are 0 [Confirmed: live].
- This is a Gate 4 slice of its own (card tags slice), not part of DV-03.

## 11. DB-6 draft, the contract and the v4 mockup
Files: supabase/drafts/20261118140000_roles_db6_deck_strategy.draft.sql and its rollback, 20261118140100_roles_db6b_copy_win_conditions.draft.sql and rollback, docs/oracle/contracts/deck-strategy.md and .types.ts, docs/oracle/reports/2026-11-18-db6-approval-pack.md, docs/oracle/reports/2026-11-18-architect-deck-strategy-design.md, mockup v4 under docs/oracle/mockups/ (the card-roles-and-deck-jobs file), test evidence under docs/oracle/reports/evidence/roles-db/. **Not applied** [Confirmed: live; no `deck_strategy_items` or `deck_job_serves` table, no `*_pre_strategy` functions].

Recommendation, item by item:
| Part | Verdict | Why |
|---|---|---|
| DB-6 draft (`deck_strategy_items`, `deck_job_serves`, new kinds `strategy_item`, `job_link`) | **Discard** (keep the file for history; mark SUPERSEDED, never apply) | Strategy items, links to jobs and the "Proposed by Claude" strategy flow are replaced by one summary and one free-text Strategy. Applying it would add two more empty tables and two more allowed change kinds for features that are dropped. |
| DB-6b (copy win conditions into items) | **Discard** | Live data is empty (0 win conditions), so there is nothing to copy; the target table is not wanted. |
| contract deck-strategy.md | **Supersede**, keep two ideas | Keep (a) "Claude adds a dated paragraph to Notes instead of replacing them" (T10, a code-only change) as an option for point 6, and (b) the deck brief idea with bracket first and "unconfirmed" wording. Drop items, serves links, strategy-changed check. |
| approval pack | **Supersede** | Its decision list (win condition move, "bracket first") is mostly answered by the 2026-11-19 direction. |
| v4 mockup and the three-layer Strategy tab in the card-roles mockup and spec | **Supersede** | Replaced by the left-rail block and the Strategy window (Gate 3 proposals). Keep the card window parts (Category field, Why) as input to the Designer. |
| Test harness evidence/roles-db | **Keep** | The throwaway-database approach and scripts are reusable for rehearsals in section 12. |
Nothing applied.

## 12. Stored-data changes the new direction needs (drafts for owner approval; no files written)
Every item below is **additive** (new table or new nullable column; nothing existing is altered in meaning), needs your approval first, and is rehearsed on a throwaway copy of the database before any live run, with a matching undo script. Order and sizes are suggestions. Existing rows are never changed or deleted. The existing evidence harness (supabase/drafts and docs/oracle/reports/evidence/roles-db) is the rehearsal pattern.

**S1. Shared Tag tables (for the card tags slice).**
- `ref_tag_list`: the curated allow-list (30 to 60 rows): tag name, display label, layer (broad or mechanic), sort order, and the Scryfall tag names mapped to it. Read for signed-in users, written only by the server.
- `ref_card_tags`: oracle id, tag name (must exist in `ref_tag_list`), source (Scryfall or AI), source note (Scryfall tag name or model and prompt version), dates. Key: oracle id plus tag. No user attached, no per-deck tags, read for signed-in users, written only by the server. Starts empty; filled by a separately approved run.
- Why a new table and not `ref_card_roles`: `ref_card_roles` has a closed 13-value CHECK (no mechanic tags), a proposer column (system or claude) and a basis column meant for the old three-layer model. Widening a CHECK on an applied table is possible but a new table with a list table avoids editing applied objects and lets the list grow by a row, not a migration. Leave `ref_card_roles` unused (section 9).
- Also needed later and not stored data: a refresh job that downloads the daily Scryfall Oracle Tags file and fills `ref_card_tags` (code, hosted write, separate approval).
- Optional, to decide at the brief: a tag filter on `search_collection` and the collection page reads `ref_card_tags` through a plain join. No extra tables.

**S2. Why and Keep on deck cards.**
- `deck_cards.why` (text, nullable, one line, max 200) and `deck_cards.keep` (boolean, default false). Two additive columns on a table with 1,917 rows; the default makes existing rows "not kept", nothing else changes.
- Rule from the direction: Claude may fill an empty Why; changing a Why the owner wrote goes through History with Undo. That needs a new change kind (for example `slot_note`) in the allowed lists on `ai_change_log.kind` and `ai_pending_changes.action`, and a handler (plan, execute, undo, blocker) behind the existing front doors. That is a function change on live bodies: rehearse with the Claude-edit test suite. Open point: does Claude also set Keep? Recommendation: no, only the owner sets Keep.
- The Why must survive re-import; `deck_cards` rows are replaced on import in some paths, so confirm at the brief whether Why and Keep belong on the slot or on (deck, oracle id) as DB-3's design did. Recommendation: on the slot for simplicity, with the import behaviour tested.

**S3. Strategy fields on the deck.**
- `deck_strategy.summary` (text, nullable, check length at most 120).
- `deck_strategy.updated_by` (text, nullable, 'owner' or 'claude'), set by the owner save route and by `ai_set_deck_setup`. Existing rows: none.
- Widen the bracket to 1 to 5: change the check in `ai_set_deck_setup` (live function body), and the page route and tool schema in code. Does the column carry a CHECK? Not seen in the draft migration text; confirm against the live table at rehearsal [Approximate].
- `ai_set_deck_setup` accepts `summary` and `playgroup` (existing `table_context`) in the patch, with before/after logged for Undo.
- If the owner prefers no new column for "last changed by", the alternative is to derive it from the change log (approximate; owner edits are not logged).

**S4. Reason on every Claude write.**
- One new nullable column on `ai_change_log` (suggested name `claude_reason`, max 200 characters), not the pending table's existing `reason`. For waiting requests the reason travels inside the stored request.
- The 11 insert sites and the CC-26 front doors write it; the list function returns it. Same rehearsal.
- No back-fill: the 183 existing rows show no reason.

**S5. Game Changers (for the bracket check slice).** One true/false column on the card reference table (or on `ref_printings`), filled by the existing Scryfall sync (code change to the sync field list, then a hosted write run). Alternative: a small dated list table. Separate brief (RQ-14).

**Nothing in S1 to S5 is a drop or a change to existing data.** The CC-26 objects stay in place (section 9).

## Changed files
- docs/oracle/reports/2026-11-19-architect-audit.md: this audit (new, docs only). No code, migration, decision, spec, status or backlog file was edited.

## New decisions made (need owner confirmation)
- Keep every existing strategy column and add only `summary` and `updated_by` (recommended mapping, section 1.2).
- Discard DB-6, DB-6b and the strategy-items contract (section 11).
- Leave DB-1 to DB-5 applied and unused; cleanup later and separately (section 9).
- New Tag tables rather than reusing `ref_card_roles` (S1).
- One switch for the chat pause, with server routes also refusing (section 5.2).

## Assumptions
- "Paused" means the owner does not want any paid call from the app at all, including the new-deck brewing chat; to be confirmed (open point 7).
- The live database is the single owner's data (22 decks, 2,832 cards); no second user exists, so only the owner's rows were checked.
- The Scryfall tag file in the main checkout's gitignored data folder (dated 2026-08-07) represents Scryfall's data for the coverage numbers; the 2026-11 trial used newer data, so figures will shift slightly after a refresh.

## Challenges to locked decisions
- **D-060** (Claude sets health targets from strategy; every card has a job) — the 2026-11-19 direction drops jobs, strategy points and Claude-set targets — suggested change: amend D-060 to "Deck health keeps today's groups and target sources (commander average, estimate, general guide); the owner or Claude may state a bracket and strategy in words only". Owner approval needed; decisions.md not edited.
- **CC-26 brief answers D-a to D-d and Q1 to Q10** (in docs/oracle/briefs/card-roles-and-deck-jobs.md; these are owner answers, not entries in decisions.md, which stops at D-060): D-a (Category versus Job), D-b (three-layer Strategy tab, build picker moves in), D-c ("rules" become "strategy points"), D-d (health numbers, jobs and points adjust counts), Q4/Q5 (jobs and strategy points), Q6 (health sources adjusted by points), Q8 (proposals applied at once with batch Undo), Q10 (build order that includes jobs and points) — all assume parts that are dropped. Q1, Q2, Q3, Q7, Q9 survive in changed words (roles become Tags; Q8's "Claude never overwrites what the owner set" becomes the Why rule). A full conflict table is deliverable (b) and is not part of this report.
- **D-034 and D-034a** (undoable Claude changes, recent-changes list) — not in conflict; DV-04 extends them with a reason.
- **D-015** (controls sit inside the scope they act on) — relevant to where the category manager lives (section 8).
- Hold reason (`over_ten` and others) — no conflict; stays as is.

## Open questions
Each has a recommendation first.
1. **Strategy window fields beyond your list.** Recommendation: leave win condition, budget and frustration out of the window and keep their stored values untouched (all empty today). You would see: no budget field anywhere in the app until you ask. Alternative: add a budget line. Trade-off: a simpler window now, a later addition if wanted.
2. **Bracket names and the fifth bracket.** Recommendation: use your names (1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH) everywhere and allow 5 for Claude too. You would see: the old labels "Casual / Focused / Optimised / Competitive" disappear; nothing is lost because no bracket is saved. Note: your sample shows "3 Upgraded"; the official name is "Upgraded"; confirm spelling "Optimized" (US) versus the app's current "Optimised".
3. **What does "History" mean on the deck page?** Recommendation A: one History per deck with two parts, Claude's changes (with reason and Undo) first, then saved versions. B: keep History as it is and send "See in History" to the Claude changes list filtered to the deck. C: rename the old button "Versions". You would see: A, one dialog with both lists; B, two different screens; C, a new menu item. Trade-off: A is a little more build; B is the smallest.
4. **Why and Keep survive re-import?** Recommendation: store on the card slot and keep them when a deck is re-imported (tested). You would see: a note you wrote stays after re-import. Alternative: store per card per deck so it can never be lost, at the cost of a second table.
5. **Does Claude ever set Keep?** Recommendation: no, only you. You would see: Claude can suggest in words but never marks a card as protected.
6. **Claude and the Strategy text.** Recommendation: Claude adds a dated paragraph to the end instead of replacing your text (the earlier approved CC-26 idea, a code-only change). You would see: Claude's additions appear under yours, with "Claude, date", and Undo works. Alternative: Claude may replace the whole Strategy, as it can today. Trade-off: safer for your writing, longer text over time.
7. **Pause scope.** Recommendation: pause the new-deck brewing chat too (it is a second paid chat not on your list). You would see: the new-deck page offers no chat; picking a commander by search still works. Alternative: leave that one running.
8. **Where Game Changers come from.** Recommendation: store Scryfall's own flag (kept up to date by the sync). Alternative: a dated list in the app. Trade-off: one stored column versus manual list upkeep.
9. **Text-reading stand-in on card details.** Recommendation: once a card has stored tags, show only those. You would see: no mix of "worked out from text" and stored tags on one card.
10. **Tag allow-list size and the AI fallback batch.** Recommendation: start with your 13 broad tags plus about 15 mechanic tags (sacrifice outlet, token generator, Treasure generator and similar), fill from Scryfall first, and send only the remaining 850 to 1,250 of your cards (plus EDHREC candidates) to the AI pass, with you checking a sample of about 100. Cost and run need your separate approval.
11. **Repo drift.** Recommendation: Gene marks DB-1 to DB-5 "applied live, empty" in status.md and adds a CC-26 row.

## Verification
- Read: owner direction, AGENTS.md, docs/oracle/process.md, decisions.md, status.md (all relevant sections), CC-26 brief headings and answers, the card-tagging-pipeline contract (sections 1 to 5), the DB-1 to DB-6 draft headers, the DB-6 approval pack and contract header, the strategy route, notes route, StrategyTab, VersionHistoryPanel, RecentChangesTab, CardWindow roles section, connector tools (bracket, edit-tools), the chat components, routes and context, and the category mapping and tags data layer.
- Live read-only SQL (counts, column lists, CHECK definitions, function names): decks 22; bracket set 0; deck_strategy 0 rows; deck_notes 0; ai_change_log 183 rows, kinds deck_add 181 and deck_create 2; ai_pending_changes 0 rows; CC-26 tables all 0 rows; deck_cards 1,917 rows with `tags` empty on all; user_cards 2,832 rows, user_copies 4,550; `user_preferences` table absent; DB-6 objects absent — result as stated above.
- Coverage run: Node script (temporary, outside the repo, deleted) reading `user_cards` through the app's read-only API key and the local Tagger file; no writes. Result as in section 7. Game Changer count: Scryfall search `is:gamechanger` = 53 cards, 9 owned.
- No build, test run, migration or hosted write was done (docs-only round). `git status` before the report showed a clean worktree.
