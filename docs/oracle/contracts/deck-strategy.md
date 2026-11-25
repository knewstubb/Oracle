# Contract: deck strategy store (CC-26, strategy items, job-to-strategy link, deck brief)
Role: Architect. Date: 2026-11-18. Status: **DRAFT for owner approval. Nothing here is applied. No code is written.**
Types: `docs/oracle/contracts/deck-strategy.types.ts` (import these; they match this file).
Extends: `docs/oracle/contracts/card-roles-and-deck-jobs.md` (read it first; its section numbers are cited as "roles contract 3.4"). This file is an amendment contract in the same pattern as `claude-connector-cc13-amendment.md`: the roles contract is already 390 lines and DB-6 is its own database change, so it gets its own file. The roles contract gets a one-line pointer in its section 11.
Brief: `docs/oracle/briefs/card-roles-and-deck-jobs.md` (no new brief; how this fits is in the report). Inputs: `reports/2026-11-18-architect-card-info-vs-claude-use.md` (findings 2a-1 to 2a-4, C1 to C4, DB-6a, DB-6b), locked decision D-060, the five drafts `supabase/drafts/20261118120000` to `120400`.
Tags: `[Confirmed: path]` was read in this task. `[Approximate]` was not checked. No database was contacted.

## 0. Plain words
A deck's strategy becomes a short list of separate items, each one sentence, at most 7 per deck: one **Aim**, up to three **What the commander enables**, up to three **Win conditions**, and one optional **Play it like** (a reference commander), plus the strategy points that already exist. Each item says "Set by you" or "Proposed by Claude", and both can add and change them. An item does not have to cover any cards. A proposal from Claude is **unconfirmed** until you accept it: Claude must say "assuming X (not yet confirmed by you)", and each proposal shows the few cards it is based on. The deck's **bracket** is required in the deck brief; when it is empty Claude asks you instead of assuming. Your written win condition is copied into a Win condition item marked "Set by you"; the original text is never deleted. Claude gets one read, the **deck brief**, that returns the deck, the strategy, the health targets, every card and what is waiting, in that order. A card's job can optionally say which strategy item it serves ("Serves: Urza turns artifacts into mana"). Claude can add to your Notes but never replace them. When you change the strategy after Claude set the health numbers, the Strategy tab says so; this is worked out from update times, nothing extra is stored.
The database part (DB-6) is two new tables and some new functions. It adds only. It changes no existing table, row or function body.

## 1. What this contract settles
Items marked **OWNER** are recommendations in section 17 that the owner must confirm; the contract assumes the recommendation.
| # | Settled | Why |
|---|---|---|
| T1 | A strategy item is a row in a new table `deck_strategy_items` with a `kind` of `aim`, `commander_enables` or `win_condition`. Strategy points stay in `deck_strategy_points` unchanged. The deck brief and the Strategy tab show both as one list. | Owner decision (items, plus the existing points). Keeping the old table untouched is the only way to stay additive: `deck_strategy_points.covers_kind` is NOT NULL and its function bodies, wrapped by DB-2, would have to be rewritten to allow "no cards". |
| T2 | Each item is one sentence, 1 to 300 characters, plus an optional reason of at most 200. An item **covers** no cards. A Claude proposal may cite up to 5 **evidence cards** ("based on these cards", `based_on`); evidence cards explain the proposal, cover nothing, and change no count. | Owner decision: an item can exist without naming cards. Review feedback 1: accepting or rejecting must take a second. |
| T3 | Same proposer and state rules as roles, jobs and points: owner rows are `accepted`; Claude rows are `to_look_at` or `dismissed`; Claude can never write an owner row (roles contract S5). | Consistency; one rule everywhere. |
| T4 | **Claude editing an owner's item never overwrites it.** Claude proposes a replacement wording (`replaces_id`), stored as a second row *beside* the owner's item. The owner's item stays in force until the owner accepts the replacement, which rewrites the owner's item in place. Claude may rewrite its own waiting item directly. | "Editable by both" without breaking "Claude never overwrites the owner" (S5). **OWNER** (17, item 5). |
| T5 | Limits per deck (live = not dismissed, not a replacement row): Aim 1, What the commander enables 3, Win condition 3, Play it like 1, **and 7 items in total**. Strategy points stay a separate list at 30 (unchanged). Per request: 7 items. | Review feedback 7: keep it small. **OWNER** (17, item b). |
| T6 | A job-to-strategy link is a row in a new table `deck_job_serves`, keyed like a job (deck + card identity + proposer). It points at exactly one item or exactly one strategy point. It never touches `deck_card_jobs`. A link never changes a health count (roles contract S12, owner decision). | Keeps DB-3's table and hooks untouched. |
| T7 | Items and links are two new change kinds, `strategy_item` and `job_link`. Both are added in DB-6 with one stack of thin front doors. | One extra layer of fronts instead of two. This is why the link is in the same database change (17, item d). |
| T8 | "Strategy changed since Claude set the numbers" is **derived**: the newest update time among the deck's strategy inputs against the newest update time on a Claude-set health target. No column, no table, no snapshot. | Owner decision. |
| T9 | **Win condition** text moves into a Win condition item marked "Set by you" (T15). **Notes** stay untouched. **Playgroup** stays its own deck field (it describes the pod and feeds the bracket question). Budget, frustrations, format and bracket stay where they are. Claude reads all of them in the deck brief. | Review feedback 4. **OWNER** (17, item a; this reverses my first recommendation). |
| T10 | Claude never replaces Notes. It adds a dated paragraph to the end. This is a code change in `set_deck_setup`, with no database change. | Owner decision; finding 2a-2. |
| T11 | Claude uses the seven starting jobs unless asked. A job never changes health counts. A card has one category. These are stated in Claude's tool text (section 8.5), not enforced in the database, because job names are free text by design. | Owner decisions; findings 2c-5, 2c-6. |

| T12 | **Proposed items are unconfirmed.** Every item the brief returns carries `confirmed: true` (owner's) or `confirmed: false` (Claude's, waiting). While `confirmed` is false Claude words it as "assuming X (not yet confirmed by you)" and never as something the owner said or decided. Each unconfirmed item carries `based_on` (up to 5 cards) so the owner can judge it at a glance. | Review feedback 1. |
| T13 | **Bracket is required and comes first.** The deck brief returns `bracket` (1 to 4 or null). Null means Claude **asks the owner** and does not assume. Health targets are set from the bracket plus the strategy. The build's numbers, the commander average and the common guide are a fallback only (section 11a). | Review feedback 2. Changes the earlier fallback order: **owner to confirm**. Live data: bracket is empty on all 21 decks [Approximate: per the owner]. |
| T14 | **"Serves nothing" is computed, never stored, never automatic.** The brief and the Strategy tab can show "These 9 cards serve nothing yet" as a question to the owner. No flag column, no automatic cut. It does not read or write `deck_cards.dead_weight_flag` and does not touch the pet-card flag planned in RQ-04. | Review feedback 3. |
| T15 | **Win condition migration (plain words):** for each deck whose written win condition is not empty and fits in 300 characters, one Win condition item is created with the same words, marked "Set by you". The old text stays in the database untouched and is no longer shown or edited; the Strategy tab edits the item. A longer text is left as it is and shown read-only with a note "Too long to copy: split it into items"; nothing is cut. Nothing is deleted, nothing overwritten, and running it twice makes no second copy. | Review feedback 4. |
| T16 | **Reference commander (RQ-06).** A fourth item kind, `reference_commander`, one per deck, one line (for example "Play it like Norin the Wary"). Read-only use for now: Claude reads it and the Strategy tab shows it; no health number, build or EDHREC lookup uses it yet. | Review feedback 5. No new field type: it is an item. |
| T17 | **Kept small:** at most 7 items per deck, linking a card to an item is optional, and no layer beyond the one thin front-door stack (14.3). What was cut or merged is listed in section 19. | Review feedback 7. |

## 2. What exists today (facts this depends on)
- **Deck Intent** lives in `deck_strategy`, one row per deck: `win_condition`, `table_context` (shown as "playgroup"), `bracket`, `budget_mode`, `budget_ceiling`, `frustration`, `strategy_notes` (the Notes box), `format_rules`, `health_overrides`, `user_id`, `updated_at` [Confirmed: roles contract section 2, `src/app/api/decks/[id]/strategy/route.ts`, which sets `updated_at` on save]. Dated "Earlier notes" are `deck_notes` [Confirmed: `src/app/api/decks/[id]/notes/route.ts`].
- **Claude today cannot read any of it.** `get_deck` returns summary and cards; `loadStrategyBrackets` reads only the bracket [Confirmed: `src/lib/connector/tools/get-deck.ts`, `bracket.ts`].
- **`set_deck_setup` replaces notes.** Its input has `strategy_notes` (max 4000, "Replaces the old notes") and the database function `ai_set_deck_setup` writes the whole value, logging `before` and `after` for 7-day Undo [Confirmed: `src/lib/connector/tools/edit-tools.ts` lines 127 and 360; `supabase/migrations/20261117200100_cc15b_deck_create_setup.sql`].
- **Strategy points** (DB-4 draft): `deck_strategy_points`, `covers_kind` NOT NULL, one sentence per deck, 30 per deck, owner and Claude rows [Confirmed: `supabase/drafts/20261118120300_roles_db4_strategy_points.draft.sql`].
- **Jobs** (DB-3 draft): `deck_card_jobs`, keyed (user, deck, oracle id, proposer), free-text `job` of 1 to 40 characters [Confirmed: `…120200_roles_db3_deck_card_jobs.draft.sql`].
- **Health targets** (DB-5 draft): `deck_health_targets`, one row per deck and group, `set_by` claude or owner, `updated_at` [Confirmed: `…120400_roles_db5_health_targets.draft.sql`]. Its four front doors (`_ai_plan`, `_ai_execute`, `_ai_undo_blocker`, `ai_undo_group`) are the DB-2 fronts replaced in place with one extra line each for `health_target`; their previous text is the `_pre_roles` functions plus DB-2's front [Confirmed: DB-5 header, lines 11 to 14].
- **Status of the drafts.** The files say "DRAFT. NOT APPLIED". The brief for this task calls them applied. DB-6 does not depend on which is true: its guard (section 14.2) checks the objects exist and refuses otherwise. [Approximate: live state not checked.]
- `ref_printings.oracle_id` is `uuid`; `deck_cards` has no `oracle_id`; `deck_slot_oracle_ids(user, deck)` resolves slot to oracle id [Confirmed: roles contract 5.1].

## 3. Data model (DB-6)
Conventions as roles contract section 3: bigint identity key, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, RLS enabled (never FORCE), one `FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))` policy, `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT SELECT … TO authenticated`, `GRANT ALL … TO service_role`. Signed-in users get no write grant; every write is a function.

### 3.1 `deck_strategy_items`
| Column | Type | Notes |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | primary key |
| user_id | uuid NOT NULL | FK auth.users, cascade |
| deck_id | integer NOT NULL | FK decks(id) ON DELETE CASCADE |
| kind | text NOT NULL | CHECK in ('aim','commander_enables','win_condition','reference_commander') |
| statement | text NOT NULL | CHECK (statement = btrim(statement) AND char_length(statement) BETWEEN 1 AND 300) |
| reason | text NULL | CHECK (reason IS NULL OR char_length(reason) <= 200). Claude's one-line why, or the owner's. |
| proposer | text NOT NULL | CHECK in ('owner','claude') |
| state | text NOT NULL | CHECK in ('accepted','to_look_at','dismissed') |
| replaces_item_id | bigint NULL | FK deck_strategy_items(id) ON DELETE SET NULL. Set only on a Claude row that proposes new wording for an owner's item (T4). |
| based_on_oracle_ids | uuid[] NULL | The **oracle ids** of up to 5 evidence cards a Claude proposal is based on (T2). Claude rows only. Covers nothing, changes no count. |
| batch_id | uuid NULL | `ai_change_log.group_id` of the Claude request. Claude rows only. No FK. |
| created_at, updated_at | timestamptz NOT NULL DEFAULT now() | |
Constraints:
- `deck_strategy_items_proposer_state`: `(proposer='owner' AND state='accepted') OR (proposer='claude' AND state IN ('to_look_at','dismissed'))`.
- `deck_strategy_items_claude_only`: `proposer='claude' OR (batch_id IS NULL AND replaces_item_id IS NULL AND based_on_oracle_ids IS NULL)`.
- `deck_strategy_items_based_on`: `based_on_oracle_ids IS NULL OR cardinality(based_on_oracle_ids) BETWEEN 1 AND 5`.
- `deck_strategy_items_not_self`: `replaces_item_id IS NULL OR replaces_item_id <> id`.
- `deck_strategy_items_id_deck UNIQUE (id, deck_id)` (so a link can prove its item is in the same deck, 3.2).
Indexes: UNIQUE `(user_id, deck_id, kind, lower(btrim(statement)))` (one sentence per kind per deck; a dismissed row is the memory of the dismissal, as roles contract S6); `(user_id, deck_id)` for the reader; partial `(user_id, deck_id) WHERE state='to_look_at'`; partial `(user_id, batch_id) WHERE batch_id IS NOT NULL`; `(replaces_item_id) WHERE replaces_item_id IS NOT NULL` (the FK's lookup).
Invariants owned by functions, not constraints (they need other rows): a replacement row has the same `kind` and `deck_id` as the item it replaces; the per-kind caps and the 7-item total (T5); every `based_on` card is a slot of this deck, resolved to an oracle id by `deck_slot_oracle_ids` (else `slot_not_found` or `card_not_identified`); a replacement points at a row that is not itself a replacement. **Owner: the SQL functions, under `pg_advisory_xact_lock(hashtextextended('strategy_item:'||user||':'||deck,0))`, because two parallel requests must not both pass the cap.**
Column comments: `statement` is the owner's or Claude's sentence; `based_on_oracle_ids` holds oracle ids (cards), never scryfall ids (printings), and are evidence only.

### 3.2 `deck_job_serves` (DB-6b)
| Column | Type | Notes |
|---|---|---|
| id | bigint GENERATED ALWAYS AS IDENTITY | primary key |
| user_id | uuid NOT NULL | FK auth.users, cascade |
| deck_id | integer NOT NULL | FK decks(id) ON DELETE CASCADE |
| oracle_id | uuid NOT NULL | the card's **oracle id** (not a printing, not `deck_cards.id`). Same key as `deck_card_jobs`. D-003. |
| card_name | text NOT NULL | snapshot for reading |
| serves_item_id | bigint NULL | composite FK `(serves_item_id, deck_id) REFERENCES deck_strategy_items (id, deck_id) ON DELETE CASCADE` |
| serves_point_id | bigint NULL | FK `deck_strategy_points(id) ON DELETE CASCADE` |
| proposer, state, batch_id | as 3.1 | |
| created_at, updated_at | timestamptz NOT NULL DEFAULT now() | |
Constraints: exactly one target: `CHECK ((serves_item_id IS NULL) <> (serves_point_id IS NULL))`; proposer/state pair and claude-only batch as 3.1. **UNIQUE (user_id, deck_id, oracle_id, proposer)**: one owner link and at most one Claude link per card per deck (a job has one "serves", and the owner's wins, roles contract section 4).
Indexes: partial `(user_id, deck_id) WHERE state='to_look_at'`; partial `(user_id, batch_id) WHERE batch_id IS NOT NULL`; `(serves_item_id) WHERE serves_item_id IS NOT NULL` and `(serves_point_id) WHERE serves_point_id IS NOT NULL` (the cascade lookups).
Invariants owned by functions: the point belongs to the same deck and user (the composite FK proves it for items; for points the function checks, because adding a unique key to `deck_strategy_points` would alter an existing table); **the card has a job in this deck when the link is written** (owner row, or Claude row not dismissed). If the job is later cleared the link row stays but the readers show a link only beside an effective job, so nothing shows; if the job returns the link returns.
A link never changes a health count and is not read by the health function.
Deleting an item or point cascades to its links. The owner delete functions return the deleted links so the route can offer the 10-second Undo by re-saving them (section 9).

### 3.2a The one-time copy of written win conditions (T15)
A separate, idempotent draft file (14.6), applied after DB-6, **inserts only**: for each `deck_strategy` row whose `win_condition` is not null, not blank after trimming, and at most 300 characters after trimming, insert one `deck_strategy_items` row (`kind='win_condition'`, `statement` = the trimmed text, `proposer='owner'`, `state='accepted'`, `user_id` and `deck_id` from that row, `reason` = `Copied from your written win condition.`) unless the deck already has that exact sentence (`ON CONFLICT DO NOTHING` on the sentence index). It never updates or deletes anything, never clears `deck_strategy.win_condition`, never cuts a long text, and prints how many decks it copied and how many it skipped as too long. Multi-line text is copied as one item (no guessing where to split). After the copy the app stops showing and writing the old field (section 9); the column stays as a read-only archive and the deck brief returns it as `legacy_win_condition` only for a deck where the copy was skipped.

### 3.3 What is not stored, and what is not touched
- No table, column or snapshot for "strategy changed" (T8, section 11).
- `deck_strategy`, `deck_strategy_points`, `deck_card_jobs`, `deck_health_targets`, `deck_cards`, `decks` and every existing function body: **not altered**. Notes stay in `deck_strategy.strategy_notes`.
- The only edits to existing objects are the two allow-lists widened by two names each (section 14.1), the same technique DB-2 and DB-5 used.
- Category: no column, function or tool here reads or writes `deck_cards.categories` (roles contract S19).

## 4. How rows combine (readers use these rules)
**Items.** The effective list for a kind: owner rows (`accepted`); plus Claude rows with `state='to_look_at'` and no `replaces_item_id` (they apply at once, labelled, as roles contract 7.3); minus dismissed rows. A Claude row with `replaces_item_id` is **beside**: shown under the owner's item as "Claude suggests this wording instead", with Accept, Change, Dismiss; the owner's item is the one in force.
**Accept** on a normal Claude item turns it into the owner's in place (same id; `proposer='owner'`, `state='accepted'`, `batch_id` NULL). Accept on a replacement row writes the new `statement` and `reason` into the owner's item (same id) and deletes the replacement row. **Dismiss** keeps the row as `dismissed`. **Change** is an owner edit; the row becomes the owner's.
**Claude's propose function** never writes an owner row. For each requested item, in this order: (1) same kind and same sentence (ignoring case and edge spaces) as a row that is not dismissed: skip `already_exists`; as a dismissed Claude row: skip `previously_dismissed`. (2) `replaces_id` given: the target must be in this deck, same kind, not dismissed, not itself a replacement (else refuse `bad_replaces`). Target is the owner's: write or rewrite the one Claude row beside it, result `beside_yours`. Target is Claude's own waiting item: rewrite it in place, result `rewrote_own` (the earlier fields go in the log `before`). (3) No `replaces_id`: if the kind is full, skip `kind_full`; if the deck already has 7 live items, skip `deck_items_full`; else insert (with `based_on` oracle ids resolved from the slots), result `proposed`.
**Links.** The effective link for a card: the owner row, else a Claude row with `state='to_look_at'`. A Claude row that differs from an owner row is beside it. Propose skips: same target already effective (`unchanged`), identical dismissed Claude row (`previously_dismissed`), card has no job (`no_job`). Owner **set** writes or replaces the owner row, and deletes a waiting Claude row with the same target. Owner **clear** deletes the owner row and sets a waiting Claude row to `dismissed`, so clearing really clears.

## 5. Functions (DB-6)
All `SECURITY DEFINER` where they are owner or reader functions, `SET search_path = public`, `p_user_id` first, every read and write filtered by it, every deck checked against `decks.user_id = p_user_id` (miss = `deck_not_found`), `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role`. Refusals use the existing `_roles_fail` (DB-1) and `_ai_fail` conventions. **No existing function body is replaced.**

### 5.1 New, private (Claude path)
| Function | Purpose |
|---|---|
| `_ai_limits_strategy() RETURNS jsonb` IMMUTABLE | `{item_statement_max_chars:300, reason_max_chars:200, items_per_request_max:7, items_per_deck_max:7, aim_max:1, commander_enables_max:3, win_condition_max:3, reference_commander_max:1, based_on_max:5, links_per_request_max:200}`. A new function, because `_ai_limits_roles()` belongs to DB-2. Kept equal to `AI_LIMITS_STRATEGY` in the types file by a test. |
| `_strategy_item_normalize(p_user_id, p_deck_id, p_item jsonb) RETURNS jsonb` STABLE | Validates `{kind, statement, reason?, replaces_id?, based_on?}` and returns the stored form. Trims, length checks, kind check, `replaces_id` shape. |
| `_ai_strategy_item_prepare(p_user_id, p_payload jsonb) RETURNS jsonb` | Takes the deck advisory lock and `_ai_lock_decks`, validates every item, applies section 4 order, returns `{deck_id, deck_name, n, changes:[…], skipped:[…]}`. Used by plan, execute and approve (a held request is re-checked on approval). |
| `_ai_plan_strategy_item`, `_ai_execute_strategy_item`, `_ai_blocker_strategy_item`, `_ai_undo_strategy_item` | Same four-step shape as the strategy point functions in DB-4. Same signatures as `_ai_plan_strategy_point` etc. |
| `_ai_job_link_prepare(p_user_id, p_payload jsonb)`, `_ai_plan_job_link`, `_ai_execute_job_link`, `_ai_blocker_job_link`, `_ai_undo_job_link` | The same for links. Resolves slots with `deck_slot_oracle_ids`, checks the job, checks the target. |
| Four thin fronts (14.3): `_ai_plan(uuid,text,jsonb)`, `_ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)`, `_ai_undo_blocker(uuid, ai_change_log)`, `ai_undo_group(uuid,uuid,text,uuid)` | Each handles `strategy_item` and `job_link` and hands everything else to the renamed `*_pre_strategy` function with the same arguments. |

### 5.2 New, owner side and readers (service role only)
| Function | Purpose |
|---|---|
| `owner_save_strategy_item(p_user_id uuid, p_deck_id integer, p_item_id bigint, p_fields jsonb) RETURNS jsonb` | `p_item_id` NULL creates; otherwise edits, and a Claude row edited by the owner becomes the owner's. `p_fields` = `{kind, statement, reason?}` (kind cannot change on edit). Enforces the caps. Returns `{previous, current}` for the 10-second Undo. Refusals: `deck_not_found`, `item_not_found`, `kind_full`, `bad_statement`, `item_exists`. Owner writes are not logged (roles contract S15). |
| `owner_delete_strategy_item(p_user_id, p_deck_id, p_item_id) RETURNS jsonb` | Deletes the item and its links; returns `{deleted: row, deleted_links: [rows]}`. A Claude replacement row that sat beside it is set to `dismissed` (kept as memory), so no kind goes over its limit; the FK `SET NULL` then clears its pointer. (Changed in the build: the first draft left it as a live waiting proposal, which could put a kind over its limit.) |
| `owner_decide_strategy_item(p_user_id, p_deck_id, p_item_id, p_decision) RETURNS jsonb` | `accept` or `dismiss` on a waiting Claude row (section 4). Returns `{previous, current}`. |
| `owner_accept_strategy_item_proposals(p_user_id, p_deck_id DEFAULT NULL, p_batch_id DEFAULT NULL) RETURNS jsonb` | "Accept all", at least one scope. Accepts waiting Claude items that are not rewordings of an owner's item; a rewording needs its own Accept. Returns `{accepted: n, left_beside: n}`. |
| `get_deck_strategy_items(p_user_id, p_deck_id) RETURNS SETOF deck_strategy_items` STABLE | Every row, dismissed included (Claude needs them so it does not re-propose). The app drops dismissed. |
| `owner_set_job_link(p_user_id, p_deck_id, p_oracle_id uuid, p_action text, p_serves_kind text DEFAULT NULL, p_serves_id bigint DEFAULT NULL) RETURNS jsonb` | `p_action` in `set`, `clear`. `p_serves_kind` in `item`, `point`. Refusals: `deck_not_found`, `card_not_in_deck`, `no_job`, `serves_not_found`, `bad_action`. Returns `{previous, current}`. |
| `owner_decide_job_link(p_user_id, p_deck_id, p_oracle_id, p_decision)`, `owner_accept_job_link_proposals(p_user_id, p_deck_id DEFAULT NULL, p_batch_id DEFAULT NULL)` | As jobs. |
| `get_deck_job_links(p_user_id, p_deck_id) RETURNS TABLE(oracle_id uuid, card_name text, owner_kind text, owner_id bigint, claude_kind text, claude_id bigint, claude_state text, effective_kind text, effective_id bigint, effective_from text, beside boolean, batch_id uuid)` STABLE | Only cards currently in the deck. |
| `get_deck_strategy_staleness(p_user_id, p_deck_id) RETURNS jsonb` STABLE | Returns `{claude_set_at, strategy_changed_at, stale}`; rule in section 11. Reads only. |

### 5.3 Atomicity
Claude requests: one transaction (`ai_submit_change`, or `ai_approve_pending` for a held request). Lock order: connection row `FOR SHARE`, per-user advisory lock, `strategy_item` deck advisory lock, deck row (`_ai_lock_decks`), then the rows. All items of a request are written and logged under one `group_id`, or none. Owner functions: one call is one transaction. Nothing deletes anything except Undo of Claude's own insert, Accept of a replacement row, the owner's own delete, and cascades from a deck, user, item or point.

## 6. Change kinds, the 120-card limit, Undo
- **Kinds:** `strategy_item` (one log row per item) and `job_link` (one log row per card). Both added to `ai_change_log.kind` and `ai_pending_changes.action` allow-lists. `_ai_kind_owner_only` unchanged: Claude may undo its own.
- **Log rows.** `strategy_item`: `deck_id`, `deck_name`, `card_name` = `"<Kind label>: " + first 50 characters of the statement` (labels: `Aim`, `Commander enables`, `Win condition`, `Play it like`), no oracle id. `before` = `{}` for a new row, otherwise the earlier Claude row's fields (`kind, statement, reason, state, batch_id, replaces_item_id, item_id`). `after` = the row's fields plus `item_id`, `state`, `result`. `job_link`: `card_name` = the card, `oracle_id` = the oracle id as text, `printing_id` = the slot's `scryfall_id`, `deck_card_id` = slot id; `before` = `{}` or the earlier Claude row (`serves_kind, serves_id, state, batch_id`); `after` = `{serves_kind, serves_id, state, result}`. Using `card_name` for the kind label avoids replacing `ai_list_recent_changes`; sentences are built in `change-sentences.ts` from `kind` and `card_name` (section 12).
- **The 120-card limit.** The gate counts `n` = rows that actually change. An items request is at most 7, so it always applies at once. A links request is at most 200 cards: 1 to 120 apply at once, 121 to 200 wait for the owner as `over_ten` (the existing rule, 24 hours), above 200 refused `too_many_cards`. A skipped value counts nothing. One request is one kind; a request never mixes items and links. The 30-minute same-deck total (200) and hourly total (500) count these rows like any other (unchanged `_ai_gate`).
- **Undo.** Exactly roles contract 6.3. Claude: all or nothing; any row not as Claude left it gives `changed_since`, nothing changes. Owner: restores rows still as Claude left them, reports the rest in `left_alone`. A new Claude row is deleted by Undo; a rewritten row is restored from `before`. Owner rows are never written by Undo. `undoable_until` is 7 days. Claude cannot undo a group the owner approved or one over 200 rows (`owner_only`, existing). "Still as Claude left it" for an item means: row exists, `proposer='claude'`, `state='to_look_at'`, same `statement`, `reason`, `kind`, `replaces_item_id`. For a link: row exists, same target and state.
- A deleted item cascades its links away. Undo of a `job_link` group then finds the row gone and reports `changed_since` (Claude) or `left_alone` (owner). Accepted.

## 7. Who can write what
| Data | Owner (app routes) | Claude (connector) |
|---|---|---|
| Deck Intent fields (playgroup, frustrations, budget, format, bracket) | write (existing `PUT /api/decks/[id]/strategy`) | **read only** in the deck brief. Bracket only via existing `set_deck_setup` (unchanged); Claude asks the owner when it is empty. |
| Written win condition | now edited as the Win condition item (T15) | read as an item |
| Notes (`strategy_notes`) | write, replace | **add to the end only** (`set_deck_setup.add_to_notes`, section 10); never replace |
| Earlier notes (dated) | write | read only |
| Strategy items (aim, commander enables, win condition) | create, edit, delete, accept, dismiss | propose (new, or a replacement beside an owner's item); rewrite its own waiting item; Undo its own batch |
| Strategy points | as roles contract | as roles contract (`propose_strategy_points`) |
| Job-to-strategy link | set, clear, accept, dismiss | propose; Undo its own batch |
| Health targets | override, hand back | set from the strategy (`set_health_targets`), never an owner-overridden group |
| Category, job names | as today | category as today (one per card); job names: the seven unless asked |
Claude has no tool that accepts, dismisses or deletes anything, and none that edits an owner's value.

## 8. Claude's tools
New or changed in `CONNECTOR_*_TOOLS` and the tool-name snapshot test. Rules common to all: the user comes only from the verified token and the active connection; strict schemas reject `user_id`, `owner`, `connection_id`; every deck and slot is checked against that user and a miss is `deck_not_found` or `slot_not_found`; writes go through `ai_submit_change` (so connection-off, locks, gate, pending and log all apply); `dry_run` supported; strings are trimmed in the tool and again in SQL (SQL is the authority).

### 8.1 `get_deck_brief` (read; new; code only, no database change)
Input `{deck_id: number, after_slot_id?: number, limit?: number (1..150, default 150), include_maybeboard?: boolean (default false), include_rules_text?: boolean (default false)}`. `get_deck` stays as it is.
Output, **in this key order**: `deck`, `strategy`, `targets`, `cards`, `waiting`, plus `next_after_slot_id` and `truncated?`. **Only the first page (no `after_slot_id`) carries `deck`, `strategy`, `targets` and `waiting`.** Later pages carry `cards` and `next_after_slot_id` only, so a big deck pages without repeating the strategy.
1. **`deck`**: `{id, name, format, status, bracket, card_count, main_count, commander: {name, oracle_id, type_line, colours, rules_text}|null, build: {id, archetype}|null}`. Commander rules text is always included (it is what "what the commander enables" is derived from).
2. **`strategy`**:
   - `intent`: `{playgroup, frustrations, budget: {mode, ceiling}, format_rules, legacy_win_condition}`, each a string or null; owner's free text, read only. `legacy_win_condition` is filled only where the copy into an item was skipped as too long (T15).
   - `bracket`: `1|2|3|4|null` (**required**; T13). `ask_owner: ['bracket']` is returned whenever it is null, and `playgroup` is returned beside it because the pod feeds the question. Claude asks, and does not assume.
   - `notes`: `{text, length, max: 4000, updated_at}`; `earlier_notes`: the newest 3 dated notes, each cut at 500 characters (`cut: true` when cut).
   - `items`: `{aim: Item[], commander_enables: Item[], win_condition: Item[], reference_commander: Item[]}`; each `Item` = `{id, kind, statement, reason, from: 'you'|'claude', state: 'accepted'|'to_look_at', confirmed: boolean, based_on: [{name, oracle_id}], replaces_id: number|null, updated_at}` (`confirmed` is true exactly when `from` is `you`; `based_on` is empty for the owner's items). A replacement row is listed in the same array with `replaces_id` set. `limits: {aim:1, commander_enables:3, win_condition:3, reference_commander:1, total:7, points:30}`. `missing: ('aim'|'commander_enables'|'win_condition')[]` (kinds with no live item; the reference commander is optional and never listed).
   - `dismissed`: `[{kind, statement}]` (items and points the owner dismissed, so Claude does not re-propose).
   - `points`: `[{id, statement, covers: {kind:'card_type', card_type} | {kind:'cards', count}, covers_count, effect: null|{kind, group}, reason, from, state, updated_at}]` (a point's full card list is in `get_strategy_points`).
   - `status`: `'ok'` or, per part that failed, `could_not_check` with no data (D-030). Items and points report `not_available_yet` until DB-6 and DB-4 exist.
3. **`targets`**: `{status: 'ok'|'not_available_yet'|'could_not_check', groups: [{group, target, source, reason, set_by: 'claude'|'owner'|null, have, light}], claude_set_at, strategy_changed_at, stale}` for lands, ramp, card_advantage, interaction. It uses the same computation as `get_deck_health` and roles contract 7.2 (`set_by` is null for build, average and common-guide numbers). `have` and `light` arrive with slice 7; until then they are null and `status` says so. `stale` comes from `get_deck_strategy_staleness`.
4. **`cards`**: one row per card (main deck; maybeboard only if asked): `{slot_id, name, oracle_id|null, printing_id (the slot's scryfall_id, for display only), quantity, in_main_deck, type_line, category: string|null, roles: [{role, from: 'standard'|'you'|'claude', state?, beside?}], job: null | {name, reason, from, state?, beside?, serves: null | {kind: 'item'|'point', id, statement, from, state}}, covered_by: [{point_id, statement}], counts_toward: ('lands'|'ramp'|'card_advantage'|'interaction')[]|null, no_card_data: boolean}`. `category` is the first stored category (one category per card is the rule; extra stored names are ignored by this tool, not changed). `roles` and `job` are null-filled until DB-1/DB-3 exist (`labels: 'not_available_yet'` in `counts`). `counts_toward` is null until slice 7.
5. **`waiting`**: `{serving_nothing, roles, jobs, items, points, links}`. `serving_nothing` = `{count, cards: [{slot_id, name}]}`: main-deck cards that are not lands, not the commander, have no effective job, no link and no covering strategy point (computed on read, **never stored**, T14; it is a question for the owner, not a cut list). Other counts: (counts of `to_look_at` rows for this deck; `roles` counts cards in this deck), `replacements` (number of Claude rewordings beside owner items), `recent_batches`: the five newest from `ai_list_recent_changes` for this deck `[{group_id, kind, count, at, undoable_until, can_undo}]`.
Size: the existing `MAX_RESPONSE_BYTES` and `fitRows`; truncation is stated, never silent. A 100-card deck is one page. Refusals: `deck_not_found`, `connection_revoked`, `invalid_request`.

### 8.2 `propose_strategy_items` (write; new)
Input `{deck_id: number, items: [{kind: 'aim'|'commander_enables'|'win_condition'|'reference_commander', statement: string (1..300), reason?: string (<=200), based_on?: [{slot_id: number, name: string}] (0..5), replaces_id?: number}], dry_run?: boolean}`. 1 to 7 items. `based_on` cards must be cards of this deck (slots), stored as oracle ids. Output: the standard envelope `{success, outcome: 'applied'|'would_apply', group_id?, count, plan:{n, changes:[{kind, statement, replaces_id, item_id?, result:'proposed'|'rewrote_own'|'beside_yours'}], skipped:[{kind, statement, why:'already_exists'|'previously_dismissed'|'kind_full'|'deck_items_full'}]}}`. Never `pending` (at most 10 rows). A statement is the owner-facing sentence in plain words.

### 8.3 `propose_job_links` (write; new)
Input `{deck_id: number, links: [{slot_id: number, name: string, serves: {item_id: number} | {point_id: number}}], dry_run?: boolean}`. 1 to 200 cards; each slot at most once; `slot_id` and `name` must match (else `slot_not_found`); the card must already have a job (set a job with `propose_card_labels` first). Output: the standard envelope with `plan.changes:[{slot_id, card_name, serves:{kind,id}, result:'proposed'|'beside_yours'}]` and `skipped:[{slot_id, card_name, why:'unchanged'|'previously_dismissed'|'no_job'}]`. 1 to 120 apply; 121 to 200 give `pending`.

### 8.4 Existing tools that change (code only)
- `set_deck_setup`: the `strategy_notes` field is **removed** and replaced by `add_to_notes` (section 10). Sending `strategy_notes` is refused by the strict schema with the message "Notes can no longer be replaced by Claude. Use add_to_notes to add a paragraph."
- `get_deck`: unchanged. Its description gains: "To judge the deck, call get_deck_brief."
- `add_cards_to_deck`, `set_card_category`: text rewrite per C3 of the earlier report (category is where a card sits, start in its type category, land first, one category per card, never copy a role). Not part of this contract's data but listed so the Developer does it in the same slice.

### 8.5 What Claude is told (goes into the tool descriptions)
1. Read `get_deck_brief` before proposing anything. Reason in order: strategy, jobs, cards, health.
1a. **Unconfirmed means unconfirmed.** An item with `confirmed: false` is your own proposal. Say "assuming {item} (not yet confirmed by you)". Never write that the owner said, wants or decided it, and never use it as the owner's word when setting targets without saying so. Cite `based_on` cards when you propose.
1b. **Bracket first.** If `bracket` is null, ask the owner which bracket the deck is (mention the playgroup if known) before setting targets. Do not guess it. Targets come from the bracket plus the strategy; the build, commander average and common guide are only a fallback.
1c. `serving_nothing` is a question: "These 9 cards serve nothing yet. Do you want to look at them?" Never cut or propose a cut on that list alone.
2. If the strategy has no Aim, no What the commander enables or no Win condition, propose them from the commander's rules text and the owner's written text, then say so, before judging cards. If `reference_commander` is set, treat it as context only for now.
3. Items cover no cards; a strategy point does. `based_on` is evidence (at most 5 cards), not coverage.
4. A job never changes a health count; only a strategy point does. Use the seven starting jobs (Engine, Enabler, Payoff, Win condition, Combo piece, Commander support, Flex) unless the owner asks for another name. A made-up name counts nowhere.
5. A card has one category. Category is where it sits in the list. Never copy a role or a job into it.
6. Never replace the owner's text. Notes: add only. An owner's item: propose a replacement beside it.
7. Health targets come from the strategy. When `targets.stale` is true, offer to refresh them.
8. A role you propose applies to that card in all the owner's decks (earlier report C6).

## 9. The app's routes (what each reads and writes)
All routes: `requireAuth`, `createAdminClient()`, pass `authResult.id` as `p_user_id`, verify the deck against that user first, `404 Deck not found` otherwise; owner writes return `previous` for the 10-second Undo; no route takes a user id from the request.
| Route | Reads | Writes |
|---|---|---|
| `GET /api/decks/[id]/strategy-items` | `get_deck_strategy_items`, `get_deck_strategy_points`, `get_deck_strategy_staleness` | nothing |
| `POST /api/decks/[id]/strategy-items` (create), `PUT …/[itemId]` (edit; a Claude item becomes yours), `DELETE …/[itemId]` (returns the deleted links for Undo), `POST …/[itemId]/decide` | the item | `owner_save_strategy_item`, `owner_delete_strategy_item`, `owner_decide_strategy_item` |
| `PUT /api/decks/[id]/cards/[cardId]/serves` body `{action:'set'|'clear', serves?:{kind,id}}` | slot to oracle id | `owner_set_job_link` |
| `POST /api/decks/[id]/cards/[cardId]/serves/decide` | slot to oracle id | `owner_decide_job_link` |
| `GET /api/decks/[id]/cards/[cardId]/labels` (existing, extended) | adds `get_deck_job_links` and the item or point text for "Serves: …" | nothing |
| `POST /api/decks/[id]/proposals/accept` (existing, extended) | none | adds `owner_accept_strategy_item_proposals` and `owner_accept_job_link_proposals` |
| `GET /api/decks/[id]/health` | adds `get_deck_strategy_staleness` | nothing |
Existing `GET/PUT /api/decks/[id]/strategy` keeps its shape except that, once the copy in 3.2a has run, the form no longer sends `win_condition`, the route ignores it, and `GET` returns the old text only as `legacy_win_condition` where the copy was skipped. It still has the owner-filter gap (roles contract section 9); slice 4 fixes it. Nothing about Deck Intent changes.
Undo of the owner's own delete of an item: the route re-saves the returned item and links through the same functions, in that order, within 10 seconds.

## 10. The Notes safety rule
- **Rule:** Claude never replaces Notes. It adds a paragraph to the end.
- **Mechanism (code only):** `set_deck_setup` takes `add_to_notes` (string, 1 to 2000 characters, trimmed). The tool reads the deck's current Notes for this user, builds `current` + (a blank line if `current` is not empty) + `Claude, YYYY-MM-DD: ` + the text, and sends the whole result as the existing `strategy_notes` patch to `ai_set_deck_setup`. The result must be at most 4000 characters (`AI_LIMITS_NEW.strategy_notes_max_chars`), else it refuses `notes_full` with "Notes have {n} characters left. Ask the owner to shorten them, or shorten your text."
- **Undo:** the existing `deck_setup` Undo restores the earlier text if the owner has not changed Notes since (`changed_since` otherwise). The owner sees the added paragraph, marked "Claude, date", and can delete it.
- **Limit of this design:** the read and the write are two calls. If the owner saves Notes between them, the owner's text is lost from the written value. The window is milliseconds, the old text is in the log (7 days, Undo), and closing it needs a change to `ai_set_deck_setup` (an expected-value check), which is not part of DB-6. **Recommendation: accept; flag to the owner if it ever happens.** [Approximate: single-owner use makes it very unlikely.]
- The owner's own route `PUT /api/decks/[id]/strategy` is unchanged and can replace Notes.

## 11. "Strategy changed since Claude set the numbers"
Computed by `get_deck_strategy_staleness(user, deck)` (used by the Strategy tab, `get_deck_brief` and `GET /api/decks/[id]/health`):
- `claude_set_at` = `max(updated_at)` over this deck's `deck_health_targets` rows with `set_by = 'claude'`; NULL when there are none.
- `strategy_changed_at` = the newest `updated_at` among: this deck's `deck_strategy` row (the Deck Intent fields and Notes); `deck_strategy_items` rows with `state <> 'dismissed'`; `deck_strategy_points` rows with `state <> 'dismissed'`. Jobs, links, roles and categories are not inputs (jobs never set targets, S12 and S19).
- `stale` = `claude_set_at IS NOT NULL AND strategy_changed_at > claude_set_at`.
- If `claude_set_at` is NULL and the deck has any strategy input, the tab says "Claude hasn't set targets for this strategy yet." (no "stale" wording).
- **Known limit:** deleting an item or point leaves no update time, so a delete alone does not mark the numbers stale. The owner-facing text does not promise otherwise. A dismissed row is excluded, so dismissing does not either.
- **Test requirement:** `deck_strategy.updated_at` must move whenever Notes or a Deck Intent field changes, from both the owner's route and `ai_set_deck_setup`. `ai_set_deck_setup` sets it on insert [Confirmed: 20261117200100 line 35]; whether it sets it on update is [Approximate] and is a test in section 16.

## 11a. Health target order with bracket (owner to confirm; replaces the earlier fallback order)
Earlier (D-060, roles contract 7.2): owner override, then Claude's strategy number, then build, all-builds average, common guide. **Proposed now (owner to confirm; decisions.md is not edited here):**
1. Owner override (unchanged; Claude never writes it).
2. **Claude's number, set from the bracket plus the strategy.** A deck with no bracket gets no Claude number: Claude asks the owner for it first (T13).
3. **Fallback only**, used when Claude has not set a group yet: build numbers, then the all-builds average, then the common guide (36/10/10/10), in the same order as before.
What changes for the owner: the source line says "Set by Claude from bracket 3 and your strategy" and the EDHREC numbers appear only as "fallback". What does not change: the fallback order itself, the override, Undo. Code impact: none in the database (`deck_health_targets` already holds Claude's number and reason); the Developer changes the wording and the tool text. The bracket is read from `deck_strategy.bracket` [Confirmed: roles contract section 2, `bracket.ts`].

## 12. Plain-words sentences (built by `change-sentences.ts`, never by the client)
- "Claude proposed the Aim "{text}" for {deck}." / "Claude proposed a Win condition…" / "Claude proposed what the commander enables…" (from `card_name` prefix).
- "Claude proposed that this deck should be played like {name}." (reference commander items)
- "Claude proposed new wording for your {kind} in {deck}." (replacement rows).
- "Claude linked jobs to the strategy for {n} cards in {deck}." / "Claude linked {card}'s job to the strategy in {deck}."
- Pending: "Claude wants to link jobs to the strategy for {n} cards in {deck}."
- Notes: "Claude added a paragraph to the Notes of {deck}." (a new sentence for the existing `deck_setup` kind when only notes changed).
The group, card and sentence rules are those of roles contract 6.3.

## 13. Identifier rules (these have caused real bugs)
- `scryfall_id` (a printing) and `oracle_id` (the card) are never swapped. In this feature **cards are identified only by `oracle_id`** (`deck_job_serves.oracle_id`, uuid). Items store no card ids at all.
- Tools accept `slot_id` plus `name` (the deck slot) for a card; SQL resolves the slot to an oracle id with `deck_slot_oracle_ids`, never in the tool. Unresolved gives `card_not_identified`.
- The deck brief returns both `oracle_id` (the card) and `printing_id` (the slot's `scryfall_id`, for display only). Nothing writes a `printing_id`.
- `serves` ids are row ids of items or points (bigint), not card ids. Finish is not part of any key here.
- Resolution logic stays in the existing small functions; no inline resolution in DB-6.

## 14. The database change DB-6 (draft file written by the next step)
File names: `supabase/drafts/20261118140000_roles_db6_deck_strategy.draft.sql` and `.rollback.sql`. Header "DRAFT. NOT APPLIED. Needs owner approval." One transaction. Order of application: after DB-1 to DB-5, one owner approval, applied by the owner.

### 14.1 What it does, in order (additive only)
1. Guard (14.2).
2. Create `deck_strategy_items` (3.1), then `deck_job_serves` (3.2), with RLS, policies, grants.
3. Create the functions in 5.1 and 5.2.
4. Widen the two allow-lists: find the check constraints by the text `health_target` (the newest name in both lists, so a wrong base is not matched), drop them and re-add them with `strategy_item` and `job_link` added. Every existing name is kept. This is the technique DB-2 and DB-5 used; it checks existing rows against a longer list and cannot fail them. **Flag:** it is a drop-and-re-add of two constraints inside the transaction; no row changes.
5. Rename the four DB-5 fronts and create the new fronts (14.3).
6. `REVOKE`/`GRANT` loop as DB-4.
It contains no `DROP TABLE`, `TRUNCATE`, `DELETE`, `UPDATE` of existing rows, or `ALTER TABLE` on an existing table apart from step 4.

### 14.2 Guard (refuses a second run and a wrong base)
Refuse if `to_regclass('public.deck_strategy_items')` is not null. Refuse unless all exist: `deck_strategy_points`, `deck_card_jobs`, `deck_health_targets` (tables); `_ai_plan_pre_roles(uuid,text,jsonb)`, `_roles_fail(text,jsonb)`, `_ai_plan_health_target(uuid,jsonb)`, `deck_slot_oracle_ids(uuid,integer)` (functions); and `_ai_plan_pre_strategy(uuid,text,jsonb)` must NOT exist. Refuse unless `pg_get_functiondef('public._ai_plan(uuid,text,jsonb)'::regprocedure)` contains `health_target` (so the fronts are DB-5's).

### 14.3 The front doors (thin-front technique; the one place the stack grows)
`ALTER FUNCTION public._ai_plan(uuid,text,jsonb) RENAME TO _ai_plan_pre_strategy`, and the same for `_ai_execute` (`_ai_execute_pre_strategy`), `_ai_undo_blocker(uuid, ai_change_log)` (`_ai_undo_blocker_pre_strategy`), `ai_undo_group(uuid,uuid,text,uuid)` (`ai_undo_group_pre_strategy`). Then create each name again as a short function: if the action or kind is `strategy_item` or `job_link`, call the new handler; otherwise `RETURN` the renamed function called with the same arguments. Grants of the renamed functions are kept as they are; the new fronts get the grants the old ones had (service role only).
**Not rewritten:** DB-2's fronts, DB-5's fronts, and every `*_pre_roles` function stay as they are, renamed one more level down. **Flag for the Architect's review:** the stack is now `front → _pre_strategy (DB-5 front) → _pre_roles (DB-2 front) → CC-15a`. Each layer adds one call per request (negligible). **The DB-5 rollback restores the DB-2 fronts with `CREATE OR REPLACE` and would overwrite DB-6's fronts if run while DB-6 is applied.** Rule: roll back DB-6 first. **Done in the build:** one guard line was added to the DB-5 rollback file (refuses while `_ai_plan_pre_strategy` exists) and one to the DB-3 rollback file (refuses while `deck_job_serves` exists, because links need jobs). Neither changes what those rollbacks restore. The DB-4 rollback already refuses on its own (the link table points at the points table), and the DB-2 rollback already refuses while DB-3, DB-4 or DB-5 tables exist.
No rewriting of DB-2 or DB-5 wrapped functions is needed. If review wants one fewer layer, the alternative is to edit DB-5's fronts to add the two kinds; that rewrites a draft DB-5 owns and is **not recommended**.

### 14.4 Rollback
Refuses while either new table holds rows or `strategy_item`/`job_link` log or pending rows exist, unless `SET oracle.rollback_allow_data_loss = 'yes'` was run first in the session (same rule as DB-1 to DB-5; the rollback never deletes log history). Then: drop the new fronts, rename the `_pre_strategy` functions back, restore both allow-lists to the DB-5 lists, drop the functions, drop `deck_job_serves` then `deck_strategy_items`. Fingerprint test: md5 of the four front functions and both constraint definitions before apply must match after rollback.

### 14.5 What the owner sees after
Strategy tab, Your strategy: the Aim, What the commander enables, Win conditions and strategy points as one list with labels; the card window shows "Serves: …" under the job; Claude can read the whole deck and propose items and links; the health section says when the strategy changed after Claude's numbers.

### 14.6 The win condition copy (separate draft, T15)
`supabase/drafts/20261118140100_roles_db6b_copy_win_conditions.draft.sql`, one transaction, guard: refuses unless `deck_strategy_items` exists. Insert-only as in 3.2a; no rollback needed beyond deleting the rows it made, which the rollback file does by matching owner Win condition items whose reason is exactly `Copied from your written win condition.` (every row the copy makes carries it; an item the owner edits loses it, so an edited copy is never deleted). It refuses while a marked row was changed since (`updated_at <> created_at`) or a card link points at one. The copy also skips a deck that already has 3 live Win conditions or 7 live items, and prints how many decks it copied and skipped. Test: ran twice gives the same row count; a 301-character text is skipped and reported; `deck_strategy.win_condition` is byte-identical afterwards.

## 15. Refusal codes and plain texts (add to roles contract 8.5)
| Code | When | Plain text |
|---|---|---|
| bad_statement | empty or over 300 characters (item) | "A strategy item must be 1 to 300 characters." |
| unknown_kind | kind not aim, commander_enables, win_condition | "{kind} is not a kind of strategy item. Use aim, commander_enables or win_condition." |
| kind_full | owner create, or Claude skip | "{deck} already has {max} of these. Change or remove one first." (Aim: "{deck} already has an Aim. Change it, or propose new wording beside it.") |
| bad_replaces | target missing, other deck, other kind, dismissed, or itself a replacement | "That item can't be replaced. Read the deck brief again and use an item id it lists." |
| too_many_items_in_request | over 7 | "At most 7 strategy items in one request." |
| deck_items_full | deck already has 7 live items | "{deck} already has 7 strategy items. Remove or merge one first." |
| bracket_missing | Claude asked to set targets with no bracket | "This deck has no bracket yet. Ask the owner which bracket it is before setting targets." (a prompt to Claude, not an error for the owner) |
| item_not_found, item_exists | owner functions | "That strategy item is gone." / "This deck already has that sentence." |
| no_job | link for a card with no job | "{card} has no job yet, so it cannot serve anything. Set a job first." |
| serves_not_found | item or point not in this deck, or dismissed | "That strategy item or point is not in {deck}." |
| bad_serves | not exactly one of item_id, point_id | "A job serves exactly one strategy item or one strategy point." |
| notes_full | add_to_notes would pass 4000 characters | "Notes have {n} characters left. Ask the owner to shorten them, or shorten your text." |
| strategy_items_not_available | DB-6 not applied | "Strategy items are not switched on in Oracle yet." |
Reused unchanged: `deck_not_found`, `slot_not_found`, `duplicate_slot`, `card_not_identified`, `nothing_to_change`, `too_many_cards`, `reason_too_long`, `invalid_request`, `connection_revoked`, the Undo refusals, `too_many_waiting`.

## 16. Test plan (throwaway Postgres; the next step writes `test_db6.sh` in `docs/oracle/reports/evidence/roles-db/`)
- **RLS and grants:** user 2 reads none of user 1's rows in either table and cannot insert, update or delete; `anon` is denied; every new function refuses `anon` and `authenticated`.
- **Isolation:** user 2's id against user 1's deck, item or card gives `deck_not_found` or `slot_not_found` and writes nothing; user 2 cannot accept, undo or see user 1's group.
- **Constraints:** bad kind; owner row with `state` other than accepted; Claude row with `replaces_item_id` on an owner row; a link with both targets or neither; a link whose item is in another deck (composite FK); duplicate sentence per kind; statement over 300.
- **Caps:** second Aim refused (`kind_full`) for the owner and skipped for Claude; sixth Win condition refused; a replacement row does not count; two parallel creates cannot both pass the cap (advisory lock).
- **Never overwrite:** Claude proposal with `replaces_id` on an owner item writes a beside row and leaves the owner row byte-identical; owner Accept rewrites the owner row in place and deletes the beside row; Claude rewriting its own waiting item restores on Undo.
- **Links:** no job gives `no_job`; owner link wins over Claude's; clear dismisses a waiting Claude link; deleting an item removes its links and returns them; a point link resolves; deleting a deck cascades both tables.
- **Limits and count rule:** 120 links apply, 121 wait as `over_ten`, 201 refused; 8 items refused, 8th live item in a deck refused (`deck_items_full`), second Reference commander refused; approving a held request re-validates; a stale approval changes nothing.
- **Undo:** Claude undo restores all; refuses with `changed_since` after the owner accepts one; owner undo restores the rest and lists left-alone; second undo `already_undone`; after 7 days `window_closed`.
- **Old kinds untouched:** `deck_add`, `deck_category`, `deck_setup`, `card_label`, `strategy_point`, `health_target` still plan, apply and undo through the new front stack; the append-only log guard still works.
- **Staleness:** targets set at T1, then an item written at T2 gives `stale`; targets set again at T3 clears it; an owner-only override set (no Claude row) gives `claude_set_at` NULL; dismissed items and deleted items do not mark stale (documents the limit); `deck_strategy.updated_at` moves on a Notes change from the owner route and from `ai_set_deck_setup`.
- **Rollback:** with data it refuses; with the override it restores fingerprints exactly; re-apply works; DB-5 rolled back first is refused.
- **Code (unit):** `AI_LIMITS_STRATEGY` equals `_ai_limits_strategy()`; the tool-name snapshot lists `get_deck_brief`, `propose_strategy_items`, `propose_job_links`; `set_deck_setup` refuses `strategy_notes` and builds the right appended text; `notes_full` at 4000; brief order of keys; first page only carries strategy; paging; `could_not_check` per section.
- **Review additions:** an item written by Claude has `confirmed:false` and its `based_on` oracle ids in the brief; a sixth card in `based_on` is refused; the win condition copy (14.6) is idempotent and leaves the old column identical; the brief returns `ask_owner:['bracket']` for a deck with no bracket; `serving_nothing` excludes lands and the commander and is never written anywhere; no code path reads or writes `deck_cards.dead_weight_flag`.
- **Testable only against the running app:** the Strategy tab's stale notice and the card window's Serves line (flagged untested until the separate test account exists, process.md gate 4).

## 17. Open points (recommendation first; the owner confirms)
(The review of 2026-11-18 changed (a) and (b) and added (h) and (i). The wording below is current.)
The report asks these in plain words. Here they are with the choice the contract assumes.
- **(a) Existing Deck Intent fields: move the win condition into a Win condition item, keep the rest where it is. Recommendation, owner to confirm** (it reverses my first recommendation after the review). The written win condition is copied, marked "Set by you", and the old text is kept untouched but no longer shown (T15). Notes untouched. Playgroup stays its own field because it describes the pod and feeds the bracket question. Budget, frustrations and format stay as they are. Plain example: your Murky Business win condition becomes one line under Win conditions, and you edit it there from now on.
- **(b) Counts: at most 7 items per deck: 1 Aim, up to 3 What the commander enables, up to 3 Win conditions, 1 Play it like. Strategy points stay a separate list at 30. Recommendation, owner to confirm.** A deck that needs more than 3 of a kind is usually describing two plans; merge them.
- **(c) Claude's proposed items apply at once, labelled and undoable. Recommendation, owner to confirm** (same as roles, jobs and points). An item changes no count by itself, so applying it early only gives Claude context. The exception is Claude's new wording for your item: it waits beside yours and applies only when you accept it.
- **(d) The job-to-strategy link goes in the same database change (DB-6), not a separate one. Recommendation, owner to confirm.** It adds two tables and one extra layer of request-handling in total. A separate change would add a second layer, make the link depend on an earlier approval, and give one more thing to test and roll back.
- **(e) Claude editing your item: propose beside it (T4). Recommendation, owner to confirm.**
- **(f) A link requires the card to have a job. Recommendation.** Otherwise "Serves" would show under an empty job.
- **(g) Notes: append only, with the small read-then-write gap in section 10. Recommendation: accept.**
- **(h) Bracket required, and the new target order (11a). Recommendation, owner to confirm.** Bracket is empty on all 21 decks, so the first Claude pass asks you for each deck's bracket instead of guessing. EDHREC numbers become a fallback only.
- **(i) Roles: universal everywhere (today), or per deck? Owner decision; recommendation: keep universal, with a change to how Claude's proposals count in other decks.** The 13 roles describe what a card does by its text and are the same in every deck by locked design (D-061 once approved). Jobs are already per deck. Options in plain words:
  - **Option 1, recommended.** Roles stay universal. A role Claude proposes is labelled with the deck it came from and **counts only in that deck until you accept it**; in your other decks it shows as "Proposed by Claude in Murky Business, not counted here yet". Example: working on Murky Business, Claude proposes Ramp for Devoted Druid. Murky Business counts it as ramp at once, labelled. In Arti-facts, which also has Devoted Druid, the card shows the same proposal but does not count it until you accept it once; after that it counts everywhere.
  - **Option 2.** Roles per deck. Example: Devoted Druid is Ramp in Murky Business and "no role" in Arti-facts until someone sets it there. The same card is described again in every deck that holds it, the shared Standard list stops being a starting point for all decks, and roles move from "the card" to "the card in this deck", which is a bigger change to the roles tables than anything in DB-6.
  - **Why Option 1:** it fixes the real worry (a guess made for one deck silently moving another deck's numbers) without repeating work. It is **not part of DB-6**: it changes only how the roles reader decides when a Claude proposal counts (the stored `proposed_in_deck_id` already records the deck), so it amends roles contract section 4 and 7.3 and needs a change to the DB-1 draft's reader or to code. I did not make it silently.

## 18. Developer tasks (after approval; the Architect writes no handlers)
1. After DB-6 is drafted and rehearsed: item routes, link routes, owner functions wiring, `get_deck_strategy_staleness` in the health route.
2. `get_deck_brief` (works before DB-6 for intent, notes, points and targets; reports `not_available_yet` for items and links). **Needs no database change; build first.**
3. `set_deck_setup` `add_to_notes`, tool-text rewrites (8.4, 8.5). **No database change; build first.**
4. `propose_strategy_items`, `propose_job_links`, sentences, snapshot test, `AI_LIMITS_STRATEGY` equality test.
5. After DB-6: the one-time win condition copy (14.6), the form change (section 9), the bracket-first wording in tool text, the "Serves nothing" read.
6. Strategy tab: Your strategy list (spec 8.6); card window: Serves line (spec 6.3a); stale notice (spec 10.4).

## 19. What was cut or merged to stay small (T17)
- **Item caps** went from 1 / 5 / 5 to 1 / 3 / 3 / 1 and 7 in total; items per request 10 to 7; earlier notes in the brief 5 to 3.
- **Win condition text merged into the Win condition item** (T15) instead of living in two places.
- **No stored "dead weight" or "serves nothing" flag** (T14): computed on read.
- **No "evidence cards" table**: up to 5 oracle ids in one column of the item row.
- **No reference-commander table, field or lookup**: one more item kind, read only.
- **No changes to `deck_card_jobs`, `deck_strategy_points`, `deck_strategy`, `deck_health_targets` or any existing function body.**
- **Staleness is one read function**, no stored state.
- **Not cut:** the replacement-beside-your-item rule (T4), because "editable by both" needs it; the link table, because the owner decided a job may say what it serves. Both are optional to use.

## 20. The three corrected decks written with these tables (no new field types, no special case)
The same four item kinds, the same strategy points and the same optional link are used for all three. I did not find the owner's corrected strategy text for Yedora, Rocco or Murky Business in the repository (it is in the owner's Claude chat of 2026-11-16, per `backlog-details.md` RQ-07), so the wording below is **illustrative**, built only from facts already in the specs; the owner's own words replace it. Every item below would show "Proposed by Claude", unconfirmed, with `based_on` cards, until accepted. Bracket is shown as "ask": it is empty on every deck.
| | Yedora the Explorer deck | Rocco's Secret Sauce | Murky Business (Myrkul) |
|---|---|---|---|
| Bracket | empty: Claude asks | empty: Claude asks | empty: Claude asks |
| Aim | one sentence, owner to supply | "Win with a Norin the Wary engine that blinks and re-triggers every enter and leave effect." (spec 13.3) | one sentence, owner to supply |
| What the commander enables | one sentence from the commander's text | "Rocco only fetches Norin, so the commander is support, not the plan." | "Myrkul turns creatures into non-creature enchantments." (spec 13.2) |
| Win condition | owner to supply | owner to supply | owner to supply |
| Play it like (reference commander) | none | "Play it like Norin the Wary" (RQ-06) | none |
| Strategy points (cards named) | as the owner needs | "Cards that blink or flicker are part of the plan", chosen cards, counts nothing (spec 13.3) | "A -1/-1 counter cost is free once the card is a non-creature enchantment", Devoted Druid and Cinderhaze Wretch, counts nothing (spec 13.2) |
| Optional link | any job serves one item | Norin's job Engine serves the Aim; Rocco's job Commander support serves "Rocco only fetches Norin" | Devoted Druid's job Engine serves the strategy point above |
| Why it needs nothing special | | the reference commander is an ordinary item with one sentence | a point that covers cards and counts nothing is an existing point |
Murky Business shows the case the review worried about: Devoted Druid's role Ramp is universal; its job is for this deck only. See open point (i).

