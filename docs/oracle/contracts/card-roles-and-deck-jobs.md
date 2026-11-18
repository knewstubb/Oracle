# Contract: card roles, deck jobs, strategy points and deck health (CC-26)
Role: Architect. Date: 2026-11-18. Status: **DRAFT for owner approval. Nothing here is applied. No code is written.**
Types: `docs/oracle/contracts/card-roles-and-deck-jobs.types.ts` (import these; they match this file).
Inputs: brief `briefs/card-roles-and-deck-jobs.md` (v3, 7d answered), spec `specs/card-roles-and-deck-jobs.md` (v3), audit `reports/2026-11-18-architect-card-roles-audit.md`, contracts `claude-connector-slice-b`, `claude-connector-deck-category`, `claude-connector-cc15-deck-create`, `claude-connector-cc13-amendment`, `card-tagging-pipeline` (proposal only, not built).
Draft migrations (written 2026-11-18, never applied; test record: `docs/oracle/reports/2026-11-18-architect-card-roles-contract-test-results.md`): `supabase/drafts/20261118120000_roles_db1_card_roles`, `…120100_roles_db2_change_kinds`, `…120200_roles_db3_deck_card_jobs`, `…120300_roles_db4_strategy_points`, each `.draft.sql` plus `.rollback.sql`.
Tags: `[Confirmed: path]` was read in this task. `[Confirmed live]` was read from the hosted database's table and column list only (read-only, 2026-11-18). `[Approximate]` was not checked.

## 0. Plain words
Four database changes, each small and separate. DB-1 stores a card's universal roles (one shared list for everyone, plus your own changes on top). DB-2 lets Claude's role proposals go through the existing change log with one-click Undo. DB-3 stores each card's job and reason in a deck. DB-4 stores a deck's strategy points. Deck health stores nothing: it is worked out each time you open it. Every change here is written to be undone by one click, and none can touch another person's data.

## 1. What this contract settles (read this first)
Decisions already made by the owner are in the brief (Q1 to Q10, D-a to D-d, 7d-1, 7d-2). The items below are the Architect's settlements of things the brief left to the Architect. Items marked **OWNER** are in section 13 for a yes or no.

| # | Settled | Why |
|---|---|---|
| S1 | Roles are stored per `oracle_id` (type `uuid`), never `scryfall_id`. | D-003. `ref_printings.oracle_id` is `uuid` [Confirmed live]; same type means a direct join and a malformed value is rejected at the door. |
| S2 | Two role tables: shared baseline `ref_card_roles` (no user) and personal `user_card_roles` (per user, add or remove). A card's roles for a user are the baseline, then that user's changes on top. | Multi-user ready; custom data never shared. |
| S3 | **Claude's first role proposals (the 285 cards) go ONLY into the owner's personal layer, never into the baseline.** The baseline is empty after DB-1 and is written only by a service-role job in slice 8 with its own approval. See section 10. | A bad guess must never reach shared data. |
| S4 | Proposer and state live on the personal rows (`proposer` owner or claude; `state` accepted, to_look_at, dismissed). The shared baseline carries `proposer` (system or claude) but no "still to look at" state: looking at a proposal is a personal act. | State is per person. |
| S5 | One personal row per proposer: the owner's row and Claude's row for the same thing can exist side by side (unique on user, card, role, proposer). The owner's row wins. Claude can only write Claude rows, so it can never overwrite the owner's value; a different Claude value sits beside it. | Brief Q8. |
| S6 | **Remembered dismissals are not a separate table.** A dismissed proposal stays as the Claude row with `state = 'dismissed'` and its value, and the proposing function skips an identical value. | Fewer tables; one rule for roles, jobs and strategy points. This replaces the brief's "a memory of dismissed proposals" line inside DB-3. |
| S7 | A job is stored per deck and per card identity (`deck_id` + `oracle_id`), not per `deck_cards.id`. | Re-imports and re-adds replace `deck_cards` rows; a job must survive. `deck_cards` has no `oracle_id` column [Confirmed live], so the card identity is resolved by one helper (section 5.1). |
| S8 | Category stays exactly as it is on `deck_cards.categories` (a JSON list in a text column). Job and category are separate fields in separate tables; no function copies one into the other. | D-a. |
| S9 | **One request that proposes a role and a job for the same card counts once toward the 120-card direct limit** (and once toward the 200 hard cap, the 30-minute same-deck total and the hourly total). The change log gets ONE row per card per request. | Settled here, confirming the brief's assumption. The gate counts log rows and the plan's `n`; both are "cards that actually change". |
| S10 | Two new change kinds only: `card_label` (roles and/or job, one log row per card) and `strategy_point` (one log row per point). Both are added to the log's allowed-kind list in DB-2, so the list is widened once. | CC-15a did the same to avoid repeated swaps. |
| S11 | Deck health stores nothing. All numbers are worked out when the screen or Claude asks. The exact inputs are in section 7.3. | Brief. |
| S12 | A job has no effect on health counts. Only a strategy point can say "counts as" or "does not count as". Jobs feed only the Plan and win conditions line. | The task's data model gives effect to strategy points only; the spec's "or job" in 10.3 would need a stored field. **OWNER** (section 13, item 3). |
| S13 | Owner-side Undo all: undoes every card still as Claude left it and leaves owner-touched cards alone, saying which. Claude-side `undo_change`: all or nothing, as today. | Spec 17-10 recommendation. **OWNER** (section 13, item 1). |
| S14 | Health target order is build, then all-builds average, then common guide (7d-1, answered). Common guide numbers are unchanged and still need a source check. | Owner answer 2026-11-18. |
| S15 | The owner's own edits (set, clear, accept, dismiss, change) are NOT written to `ai_change_log`. They are plain writes with a 10-second client-side Undo that replays the `previous` value each function returns. | Spec 7.7; the log is "made by AI". |

## 2. What exists today (facts this design depends on)
- Change log and pending: `ai_change_log` (append-only; only `undone_at`/`undone_by` may change; the guard also lets `deck_id`/`other_deck_id` become NULL when the deck is deleted) and `ai_pending_changes`, both with `user_id`, RLS select-own, writes by service role through SECURITY DEFINER functions [Confirmed: supabase/migrations/20261116150000, 20261117120000].
- Live function stack for requests, from the hosted list [Confirmed live]: `_ai_plan` and `_ai_execute` (deck_category front doors) over `_ai_plan_v1` and `_ai_execute_v1`; `_ai_undo_blocker` (CC-15a front) over `_ai_undo_blocker_prev` over `_ai_undo_blocker_v1`; `ai_undo_group` (CC-15a front) over `_ai_undo_group_prev` over `_ai_undo_group_v1`; `_ai_blocker_new`, `_ai_limits_new`, `_ai_kind_owner_only`, `_ai_gate`, `_ai_limits` (direct_max 120, split_window_minutes 30, split_max 200, hourly_max 500, max_request 200, max_waiting 20, pending_hours 24, undo_days 7, claude_undo_max 200), `_ai_lock_decks`, `_ai_fail`, `ai_submit_change`, `ai_approve_pending`, `ai_list_recent_changes`.
- The log's allowed kinds today (13): deck_add, deck_remove, deck_zone, sleeve_copy, make_original, create_proxy, collection_add, copy_move, deck_category, deck_create, deck_setup, box_create, box_move. Pending's allowed actions (9) are the first nine [Confirmed: supabase/migrations/20261116190000, 20261117200000].
- How a new Claude change kind is added with Undo (the pattern reused here): widen the two CHECK lists (found by their text), rename the live function to a suffixed name, put a thin function with the old name in front that handles the new kinds and hands everything else to the renamed original unchanged, fill per-kind helpers, add the kind to `_ai_kind_owner_only` only if Claude must not undo it [Confirmed: 20261116190000, 20261117200000, 20261117200100].
- Writer pattern: SECURITY DEFINER, `SET search_path = public`, every read and write filtered by `p_user_id`, `FOR SHARE` on the connection row so the off-switch works, deck row `FOR UPDATE` through `_ai_lock_decks`, `pg_advisory_xact_lock(hashtextextended('<name>:'||user,0))` for per-user rate rules, `_ai_fail(code, detail)` for refusals, `REVOKE ALL … FROM PUBLIC, anon, authenticated; GRANT EXECUTE … TO service_role` [Confirmed: 20261117200100].
- The app and connector use the service role and pass the signed-in user's id (`createAdminClient()`); direct table access by signed-in users is blocked or read-own only [Confirmed: 20261116100000 header, src/app/api/decks/[id]/route.ts].
- `deck_cards` (live columns): id, deck_id, card_name, scryfall_id (text), set_code, quantity, categories (text), tags, is_commander, dead_weight_flag, dead_weight_reason, ownership_status, proxy_of_deck_id, copy_id, user_id, placement_source, requested_finish, is_generic, generic_sleeved, requested_language, command_zone_role. **No `oracle_id`.** [Confirmed live]
- `ref_printings`: `scryfall_id uuid`, `oracle_id uuid`, index on `oracle_id`, primary key on `scryfall_id` [Confirmed live; index: supabase/migrations/20260730044951]. `user_cards.oracle_id` is `text`; `ai_change_log.oracle_id` is `text` [Confirmed live]. `decks.commander_id` and `decks.build_id` are `uuid`; `ref_commander_builds` has numeric `avg_lands`, `avg_ramp`, `avg_draw`, `avg_removal`, `avg_wipes` [Confirmed live].
- `deck_strategy` (one row per deck): win_condition, table_context, bracket, budget_mode, budget_ceiling, frustration, strategy_notes, format_rules, health_overrides, user_id, updated_at. The "Notes" box is `strategy_notes`; "Earlier notes" is `deck_notes` [Confirmed live; src/app/api/decks/[id]/notes/route.ts]. Neither changes.
- No tables exist for roles, jobs or strategy points [Confirmed live: probed names containing role, job, strategy_point; only `ref_commander_role_targets` matched].
- Today's health: four text-read roles plus lands, targets from the commander's EDHREC average, then estimate, then a guide (ramp 10, draw 10, removal 6, wipes 2, lands 36); reads `ref_cards` by card name [Confirmed: src/lib/deck-health.ts, deck-health-server.ts].
- The three test decks have no commander record and no build linked, so the Build layer is empty for them [Confirmed: brief section 3, read on 2026-11-18].

## 3. Data model
Conventions for every new table: bigint identity primary key unless stated; `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` on every user table; RLS enabled (never FORCE, so the definer functions keep working); one policy `FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))`; `REVOKE ALL … FROM PUBLIC, anon, authenticated`; `GRANT SELECT … TO authenticated`; `GRANT ALL … TO service_role`. Signed-in users get **no** insert, update or delete grant: every write goes through a function (stricter than the older own-all policies, same as `ai_change_log`).
Identifier rule on every column below: `oracle_id` columns hold an oracle id (the card), never a printing. Column comments say so.

### 3.1 DB-1: `ref_card_roles` (shared baseline, no user)
| Column | Type | Notes |
|---|---|---|
| oracle_id | uuid NOT NULL | oracle id. |
| role | text NOT NULL | CHECK in the 13 slugs (below). |
| proposer | text NOT NULL | CHECK in ('system','claude'). `system` = produced by the text-reading rules; `claude` = Claude, written only by the approved slice 8 job. |
| basis | text NULL | Where it came from, at most 200 characters, for example `text_rules:v2`. |
| created_at, updated_at | timestamptz NOT NULL DEFAULT now() | |
Primary key (oracle_id, role). Index on (role) for "all cards with this role". No foreign key (no table has a unique oracle id). RLS on; policy `ref_card_roles_read_signed_in FOR SELECT TO authenticated USING (true)`. **Writes: service role only.** `anon` has no access. No user is attached to any row.

The 13 role slugs (locked by D-061 once approved): `ramp, fixing, card_draw, card_selection, tutor, targeted_removal, board_wipe, counterspell, protection, recursion, graveyard_hate, stax_tax, hand_disruption`. A CHECK lists them in both role tables; the types file holds the same list and a test asserts equality. Adding a role later is a one-line CHECK change.

### 3.2 DB-1: `user_card_roles` (personal layer, per user)
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | primary key |
| user_id | uuid NOT NULL | FK auth.users, cascade |
| oracle_id | uuid NOT NULL | oracle id |
| role | text NOT NULL | CHECK in the 13 slugs |
| effect | text NOT NULL | CHECK in ('add','remove'). `remove` hides a baseline role for this user. |
| proposer | text NOT NULL | CHECK in ('owner','claude') |
| state | text NOT NULL | CHECK in ('accepted','to_look_at','dismissed') |
| proposed_in_deck_id | integer NULL | FK decks(id) ON DELETE SET NULL. The deck Claude was working in. Claude rows only. |
| batch_id | uuid NULL | The `ai_change_log.group_id` of the request that wrote the row. Claude rows only. No FK (a group id is not a key). |
| created_at, updated_at | timestamptz NOT NULL DEFAULT now() | |
Constraints: `CHECK ((proposer='owner' AND state='accepted') OR (proposer='claude' AND state IN ('to_look_at','dismissed')))`; `CHECK (proposer='claude' OR (proposed_in_deck_id IS NULL AND batch_id IS NULL))`; **UNIQUE (user_id, oracle_id, role, proposer)** (this index also serves "all roles of these cards for this user").
Indexes: partial (user_id, proposed_in_deck_id) WHERE state='to_look_at' (the proposals bar); partial (user_id, batch_id) WHERE batch_id IS NOT NULL (accept or undo by batch).
Which queries need the indexes: `get_effective_card_roles` (unique index), proposals bar count (partial index), accept-all-by-batch and Undo (batch index).

### 3.3 DB-3: `deck_card_jobs` (per deck, per card, per user)
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | primary key |
| user_id | uuid NOT NULL | FK auth.users, cascade |
| deck_id | integer NOT NULL | FK decks(id) **ON DELETE CASCADE** (a deleted deck takes its jobs) |
| oracle_id | uuid NOT NULL | oracle id of the card |
| card_name | text NOT NULL | snapshot for reading |
| job | text NULL | free text, trimmed, 1 to 40 characters. NULL on an **owner** row means "the owner says no job". NOT NULL on Claude rows (CHECK). |
| reason | text NULL | "Why it is here", at most 200 characters |
| proposer | text NOT NULL | CHECK in ('owner','claude') |
| state | text NOT NULL | same CHECK rule as 3.2 |
| batch_id | uuid NULL | Claude rows only |
| created_at, updated_at | timestamptz NOT NULL DEFAULT now() | |
UNIQUE (user_id, deck_id, oracle_id, proposer). Indexes: partial (user_id, deck_id) WHERE state='to_look_at'; partial (user_id, batch_id) WHERE batch_id IS NOT NULL.
Job names are free text so the list can grow. The starting seven are an app constant, not a table: Engine, Enabler, Payoff, Win condition, Combo piece, Commander support, Flex. A deck's picker list is the seven plus every distinct job name used in that deck. Spelling is matched case-insensitively (a deck's seven first, then the most used spelling already in the deck) and stored with the matched spelling, the same rule `set_card_category` uses for categories.
A card removed from a deck leaves its job row behind (it is keyed by card identity, not slot). The Card jobs layer and counts always join to the deck's current cards, so a leftover row shows nowhere; it comes back if the card is re-added.

### 3.4 DB-4: `deck_strategy_points` (per deck, per user)
| Column | Type | Notes |
|---|---|---|
| id | bigint identity | primary key |
| user_id | uuid NOT NULL | FK auth.users, cascade |
| deck_id | integer NOT NULL | FK decks(id) ON DELETE CASCADE |
| statement | text NOT NULL | 1 to 200 characters, trimmed |
| covers_kind | text NOT NULL | CHECK in ('card_type','cards') |
| card_type | text NULL | CHECK in ('artifact','creature','enchantment','instant','sorcery','land','planeswalker','battle'); set when covers_kind='card_type' |
| covers_oracle_ids | uuid[] NULL | oracle ids; set when covers_kind='cards'; 1 to 100 entries at write time |
| effect_kind | text NULL | CHECK in ('counts_as','does_not_count_as') |
| effect_group | text NULL | CHECK in ('ramp','card_advantage','interaction') |
| reason | text NULL | at most 200 characters |
| proposer, state, batch_id, created_at, updated_at | as 3.3 | |
Constraints: kind consistency (`card_type` kind needs `card_type` and no id list; `cards` kind needs the id list and no `card_type`); `effect_kind` and `effect_group` are both set or both NULL (NULL = the point changes no count, like the Murky Business counter-cost example). **UNIQUE INDEX (user_id, deck_id, lower(btrim(statement)))** so the same sentence is one row (a dismissed row is the memory of a dismissal).
"Does not count as removal" is stored as `does_not_count_as` + `interaction` (removal is part of the Interaction group). A land is never moved out of Lands and a land never counts as Ramp, even if a point covers it; health ignores a land in a counts-as effect and the editor says so (spec 13.1).
Coverage by card type is worked out when health or the card window reads it (front-face type line, same test as `countDeckTypes`); nothing is stored per covered card.

### 3.5 Nothing else is stored
- No health table, no health snapshot, no count cache (S11). The unused `deck_health` table is not written by this feature [Approximate: not checked whether anything still reads it].
- No separate dismissals table (S6). No job-name list table. No change to `deck_cards`, `deck_strategy` or `decks`.
- The spec's "change notice" is derived, not stored: it lists cards whose state is `to_look_at` (stored) plus differences the open screen saw this session (client). A notice that must survive a reload for the owner's own edits would need a small snapshot table; not proposed. **OWNER** (section 13, item 4).

## 4. How the layers combine (one rule, used by every reader)
**Roles of a card for user U:** for each role that appears in any layer: the owner row decides if there is one (`add` = has it, `remove` = does not); else a Claude row with `state='to_look_at'` decides (it counts straight away, labelled); else the baseline row means has it. A Claude row with `state='dismissed'` is ignored for counting. A Claude row that disagrees with an owner row is "proposed beside yours" (`beside = true`); the owner row stays in force.
**A card's job in a deck for user U:** the owner row if one exists (a NULL job means none), else a Claude row with `state='to_look_at'`, else none. Same "beside" rule.
**Strategy points:** every row except `state='dismissed'`. Claude's `to_look_at` points apply straight away, labelled.
**Accept** turns a Claude value into the owner's: the owner row is written with the Claude row's values (replacing an existing owner row), and the Claude row is deleted. **Dismiss** keeps the Claude row with `state='dismissed'` (the memory). **Change** is an owner write of the new value, which also deletes a Claude row holding the same value. The owner's own `set` and `clear` never touch the Claude row unless it holds the identical value (then it is deleted, so the bar count drops).
**Claude's propose function** never writes an owner row. For each requested value, in this order: equal to the effective value, or an identical Claude row is already waiting (`to_look_at`), skip as `unchanged`; Claude row `dismissed` with the identical value, skip as `previously_dismissed`; owner row with a different value, write the Claude row beside it, reported `beside_yours`; otherwise write or update the Claude row, state `to_look_at`, reported `proposed`. There is one Claude row per card and role (per deck for jobs), so a later request for the same card **replaces** Claude's own earlier waiting value; Undo of the earlier batch is then refused (`changed_since`) because the row is no longer as that batch left it. **Strategy points** are different in one way: the sentence is unique per deck whatever its proposer, so Claude proposing the sentence of an owner point is skipped (`already_exists`), never written beside it; Claude's own waiting or dismissed point with different fields is rewritten (the earlier version goes into the log's `before`).
**Owner `set` / `clear` and the Claude row** (clarifies the line above): `set` deletes a Claude row only when it is still waiting and holds the identical value; a dismissed Claude row is kept (it is the memory). For a strategy point, Accept and Change convert the Claude row into the owner's **in place** (same row id), because the sentence key allows only one row.

## 5. Functions
All are `SECURITY DEFINER`, `SET search_path = public`, take `p_user_id` as their first argument, filter every table they read or write by it, and are executable **by `service_role` only** (`REVOKE ALL … FROM PUBLIC, anon, authenticated`). A reader or writer never trusts an id from the caller as proof of ownership: every deck id is checked against `decks.user_id = p_user_id`, and a miss is `deck_not_found`.

### 5.1 DB-1
| Function | Purpose |
|---|---|
| `deck_slot_oracle_ids(p_user_id uuid, p_deck_id integer) RETURNS TABLE(slot_id integer, oracle_id uuid, resolved_by text)` STABLE | One query for the whole deck. Resolution order: (1) `deck_cards.scryfall_id` cast to uuid (a bad value gives NULL, never an error) joined to `ref_printings` by its primary key; `resolved_by='printing'`; (2) else the owner's own `user_cards` where `lower(card_name)` matches the slot's name and exactly one distinct oracle id results; `resolved_by='name'`; (3) else `oracle_id` NULL, `resolved_by` NULL. Never matches by name across other users' cards. Refuses `deck_not_found` for a deck that is not the user's. |
| `_slot_oracle_id(p_user_id uuid, p_deck_id integer, p_slot_id integer) RETURNS uuid` STABLE | The same, for one slot. NULL when unresolved. |
| `get_effective_card_roles(p_user_id uuid, p_oracle_ids uuid[]) RETURNS TABLE(oracle_id uuid, role text, in_baseline boolean, baseline_proposer text, owner_effect text, claude_effect text, claude_state text, effective boolean, effective_from text, beside boolean)` STABLE | One row per (card, role) present in any layer, for these cards, for this user only. `effective_from` is `'owner'`, `'claude'`, `'baseline'` or NULL. Up to 500 oracle ids per call. This is the only function health, the card window and Claude's read tool use for roles. |
| `_roles_fail(p_code text, p_detail jsonb DEFAULT '{}') RETURNS void` | Private. Raises a coded refusal (`RAISE EXCEPTION '<code>'`, SQLSTATE P0001, detail as JSON), the same shape as `_ai_fail`. DB-1 has its own so that it depends on no `ai_*` object; every later change reuses it. This is the fifth DB-1 function. |
| `owner_set_card_role(p_user_id uuid, p_oracle_id uuid, p_role text, p_action text) RETURNS jsonb` | `p_action` in `add`, `remove`, `clear`. Upserts or deletes the owner row, and deletes a Claude row holding the same effect. Returns `{previous: {owner_effect, claude_effect, claude_state}, current: {…}}` so the route can offer a 10-second Undo. Refusals: `unknown_role`, `bad_action`, `unknown_card` (no `ref_printings` row has this oracle id, which also stops a printing id being passed as a card id). One statement block, atomic. |

### 5.2 DB-2
| Function | Purpose |
|---|---|
| `_ai_limits_roles() RETURNS jsonb` IMMUTABLE | The numbers for these kinds (section 6.4). Kept in step with `AI_LIMITS_ROLES` in the types file by a test. |
| `_ai_plan(uuid,text,jsonb)` (front door), `_ai_execute(uuid,uuid,text,text,jsonb,uuid,boolean)` (front door) | The live functions are renamed `_ai_plan_pre_roles` and `_ai_execute_pre_roles`; the new function with the old name handles `card_label` and `strategy_point` and passes every other action to the renamed original unchanged. |
| `_ai_undo_blocker(uuid, ai_change_log)` (front door), `ai_undo_group(uuid,uuid,text,uuid)` (front door) | Renamed to `_ai_undo_blocker_pre_roles` and `_ai_undo_group_pre_roles`; the new fronts handle the two new kinds and hand the rest on (the CC-15a front door and everything under it keep working, including the CC-16 box kinds). |
| `_ai_plan_card_label(p_user_id uuid, p_payload jsonb) RETURNS jsonb`, `_ai_execute_card_label(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb`, `_ai_undo_card_label(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb`, `_ai_blocker_card_label(p_user_id uuid, r ai_change_log) RETURNS jsonb` | The role part and the shared logic of `card_label`. The job part calls the four job hooks below. |
| Job hooks (stubs in DB-2, real in DB-3): `_ai_label_job_plan(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_request jsonb) RETURNS jsonb`, `_ai_label_job_apply(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb, p_batch_id uuid) RETURNS void`, `_ai_label_job_restore(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_before jsonb, p_after jsonb) RETURNS boolean`, `_ai_label_job_unchanged(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_after jsonb) RETURNS boolean` | In DB-2 the first two refuse with `jobs_not_available` and the last two return false/true harmlessly (no job row can exist yet). Same stub technique as `_ai_blocker_new` in CC-15a. |
| Strategy point hooks (stubs in DB-2, real in DB-4): `_ai_plan_strategy_point(p_user_id uuid, p_payload jsonb) RETURNS jsonb`, `_ai_execute_strategy_point(p_user_id uuid, p_connection_id uuid, p_client_name text, p_payload jsonb, p_pending_id uuid, p_approved boolean) RETURNS jsonb`, `_ai_undo_strategy_point(p_user_id uuid, p_group_id uuid, p_actor text) RETURNS jsonb`, `_ai_blocker_strategy_point(p_user_id uuid, r ai_change_log) RETURNS jsonb` | DB-2 versions refuse `strategy_points_not_available` (plan, execute) or return NULL blocker. |
| `ai_list_recent_changes(p_user_id uuid) RETURNS jsonb` | Replaced with the live body from 20261117100000 plus one field, `label_detail` (jsonb), filled only for the two new kinds: for `card_label` `{roles:[{role,effect}], job: <name|null>, beside: <bool>}`; for `strategy_point` `{statement, covers_kind, card_type, effect_kind, effect_group}`. Reasons are not included. The rollback restores the 20261117100000 body. |
| `owner_decide_card_role(p_user_id uuid, p_oracle_id uuid, p_role text, p_decision text) RETURNS jsonb` | `p_decision` in `accept`, `dismiss`. Needs a Claude row in `to_look_at` (else `no_proposal`). Accept: owner row written with the Claude row's effect (replacing any owner row), Claude row deleted. Dismiss: Claude row to `dismissed`. Returns `previous`. |
| `owner_accept_role_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb` | "Accept all". With a deck: every `to_look_at` role row for the cards in that deck. With a batch: every such row with that `batch_id`. At least one scope or `invalid_request`. Returns `{accepted: n}`. One transaction. |

### 5.3 DB-3
`deck_card_jobs` plus: the four job hooks replaced with real bodies; `owner_set_card_job(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_action text, p_job text DEFAULT NULL, p_reason text DEFAULT NULL) RETURNS jsonb` (`p_action` in `set`, `clear_job`, `clear`; `clear_job` writes an owner row with a NULL job, meaning "no job, on purpose"; `clear` deletes the owner row); `owner_decide_card_job(p_user_id uuid, p_deck_id integer, p_oracle_id uuid, p_decision text) RETURNS jsonb`; `owner_accept_job_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb`; `get_deck_card_jobs(p_user_id uuid, p_deck_id integer) RETURNS TABLE(oracle_id uuid, card_name text, owner_job text, owner_reason text, owner_set boolean, claude_job text, claude_reason text, claude_state text, effective_job text, effective_reason text, effective_from text, beside boolean, batch_id uuid)`; `deck_job_names(p_user_id uuid, p_deck_id integer) RETURNS text[]` (the seven first, then other names in use, most used first). `_job_canonical_name(p_user_id uuid, p_deck_id integer, p_name text) RETURNS text` (private helper).

### 5.4 DB-4
`deck_strategy_points` plus: the four strategy point hooks replaced; `owner_save_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint, p_fields jsonb) RETURNS jsonb` (`p_point_id` NULL creates; set edits and, for a Claude row, turns it into the owner's: "Change"); `owner_delete_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint) RETURNS jsonb` (returns the deleted row so the route can offer the 10-second Undo by re-saving it); `owner_decide_strategy_point(p_user_id uuid, p_deck_id integer, p_point_id bigint, p_decision text) RETURNS jsonb`; `owner_accept_strategy_point_proposals(p_user_id uuid, p_deck_id integer DEFAULT NULL, p_batch_id uuid DEFAULT NULL) RETURNS jsonb`; `get_deck_strategy_points(p_user_id uuid, p_deck_id integer) RETURNS SETOF deck_strategy_points`. Limits and errors in 6.4 and 8.5. Creating or saving takes `pg_advisory_xact_lock(hashtextextended('strategy_point:'||p_user_id||':'||p_deck_id, 0))` so two parallel saves cannot pass the per-deck cap together.

### 5.5 Atomicity (every write path)
- Claude's `card_label` and `strategy_point` requests: one transaction (the `ai_submit_change` call, or `ai_approve_pending` for a held request). Order of locks: connection row (`FOR SHARE`), the per-user advisory lock `ai_card_label:<user>` (or the strategy lock), deck row (`_ai_lock_decks`), then the rows. Either every changing card is written and logged under one `group_id`, or nothing is. A failure halfway rolls back all of it; nothing is "partly proposed".
- Owner writes: one function call is one transaction. Accept-all is one transaction over all matching rows.
- Undo: one transaction per call (below).
- Nothing in this feature deletes anything except: Undo of a Claude insert (its own row), Accept (the Claude row it converts), the owner's own Clear and Delete, and the cascade when a deck or user is deleted.

## 6. Change kinds, the log, Undo, limits
### 6.1 Wiring (DB-2)
1. Widen `ai_change_log` kind list and `ai_pending_changes` action list (constraints found by the text `deck_zone`, as in 20261116190000 and 20261117200000) with `card_label` and `strategy_point`. `ai_pending_changes.kind` stays `big_edit`; `reason` values unchanged (`over_ten` still means "over the one-request limit").
2. Rename, front-door and hand-on as in 5.2. A guard at the top refuses a second run (`to_regprocedure('public._ai_plan_pre_roles(uuid,text,jsonb)') IS NOT NULL`) and refuses to run on the wrong base (CC-15a objects and `direct_max = 120` must exist).
3. `_ai_kind_owner_only` is unchanged: Claude **can** undo its own role and job proposals and strategy points (it deletes no owner data).
4. Pending: the existing `ai_submit_change` already queues anything over `direct_max` (120) as `over_ten` and up to `max_request` (200) waits 24 hours; above 200 is refused `too_many_cards`. Approval re-plans under the locks, so a stale request is refused, not applied.

### 6.2 Log row shapes
**`card_label`: one row per card per request.** `deck_id`, `deck_name`, `card_name`, `oracle_id` (text copy of the uuid), `printing_id` = the slot's `scryfall_id`, `deck_card_id` = the slot id.
`before` = `{roles: [{role, row: null | {effect, state, batch_id, proposed_in_deck_id}}], job: null | {row: null | {job, reason, state, batch_id}}}` (the Claude row as it was, or null if there was none). `after` = `{roles: [{role, effect, state:'to_look_at', result}], job: null | {job, reason, state:'to_look_at', result}, beside: [..]}` where `result` is `proposed`, or `beside_yours`. Only roles and jobs that were actually written appear. Skipped values never appear in the log.
**`strategy_point`: one row per point.** `deck_id`, `deck_name`, `card_name` = the first 60 characters of the statement, no oracle id. `before` = `{}` (new point) or the earlier Claude row's fields; `after` = the full point fields plus `point_id`.

### 6.3 Undo and Recent changes
- `ai_undo_group(user, group, actor, connection)` for these kinds: Claude may undo (not owner-only) a group of 200 rows or fewer that the owner did not approve; otherwise `owner_only` for Claude (the existing rule). The connection must be on (`connection_revoked`).
- Pass 1 (a pure read, `_ai_blocker_*`): for each log row, is every row it wrote **still exactly what Claude left**? For roles: the Claude row for each (user, card, role) exists with the same effect and `state='to_look_at'`. For the job: the Claude row for (user, deck, card) exists with the same job, reason, state. For a strategy point: the row exists with the same fields and state. A card or deck that is gone gives `slot_gone` or `deck_gone`.
- **Claude as actor: all or nothing.** Any row not as Claude left it gives `{success:false, refused:{code:'changed_since', card, deck, on}}` and nothing changes.
- **Owner as actor: rows still as Claude left them are restored; rows the owner has since touched are left alone.** Returns `{success:true, undone: n, left_alone: [{card, deck, what}]}`. If nothing could be restored: `{success:false, refused:{code:'nothing_to_undo'}}`. Left-alone log rows keep `undone_at` NULL (the log is append-only), so they keep showing their reason.
- Pass 2 (restore, per log row, in one transaction): `before` null means delete the Claude row; otherwise write the earlier Claude row back. Then set `undone_at`/`undone_by` on every restored log row only. Owner rows are never written by Undo.
- `undoable_until` is 7 days. Refusal codes: `already_undone`, `window_closed`, `deck_gone`, `slot_gone`, `changed_since`, `nothing_to_undo`, `owner_only`, `connection_revoked`, `invalid_actor`.
- Recent changes: the existing screen and `list_recent_changes` tool already list every kind by group; they gain `label_detail` for the sentence (plain-words sentences below, built by `change-sentences.ts`, never by the client).
- Sentences: "Claude proposed the role {role} for {card}." / "Claude proposed roles for {n} cards in {deck}." / "Claude proposed the job {job} for {card} in {deck}." / "Claude proposed jobs and roles for {n} cards in {deck}." / "Claude proposed the strategy point "{statement}" for {deck}." / pending: "Claude wants to propose roles or jobs for {n} cards in {deck}." Group card by `group_id` like `deck_zone`.

### 6.4 Limits and rate rules
Reused unchanged: `_ai_gate` (the count `n` is the number of cards or points that actually change; 1 to 120 apply at once; 121 to 200 wait; 30-minute same-deck total 200; hourly total 500; max 20 waiting requests per user).
New, in `_ai_limits_roles()` and `AI_LIMITS_ROLES`: `job_name_max_chars` 40; `reason_max_chars` 200; `statement_max_chars` 200; `strategy_points_per_deck_max` 30; `strategy_points_per_request_max` 10; `point_cards_max` 100; `roles_per_card_max` 13 (all of them); `labels_page_max` 150 (read page size, same as `DECK_CARDS_PAGE_MAX`).
Per-user fairness: the per-user advisory lock serialises one user's label writes; the deck lock serialises one deck; every function filters by the user, so one user cannot use up another's limits.

### 6.5 The count rule, spelled out (S9)
`n` for `card_label` = the number of distinct cards (slots) in the request for which at least one role or the job really changes (written, or written beside the owner's). A card with a new role and a new job is 1. A card whose every value was skipped is 0 and is listed in `skipped`. If `n` is 0 the request is `nothing_to_change`. The request's total `cards` length is capped at 200 before any skipping (`too_many_cards`). The same `n` feeds the gate, the log row count (one per card), the pending `card_count` and the split and hourly windows.

## 7. Deck health
### 7.1 Groups and roll-up (unchanged from the brief, restated as the contract)
| Group | Fed by | Common guide (not changed; source check still open) |
|---|---|---|
| lands | any main-deck card whose front-face type line has Land (or is a basic by name when no type line). A land never counts in another group. | 36 |
| ramp | role `ramp` | 10 |
| card_advantage | role `card_draw` | 10 |
| interaction | roles `targeted_removal`, `board_wipe`, `counterspell`, `hand_disruption`. Graveyard hate and stax/tax are outside Interaction. | 10 |
| plan (shown only when jobs exist; no target) | jobs Engine, Enabler, Payoff, Combo piece (plan cards) and Win condition (win conditions), matched case-insensitively. Commander support, Flex and invented names feed nothing. | none |
Not counted in any group: fixing, card_selection, tutor, protection, recursion, graveyard_hate, stax_tax. A card counts once per group even when two of its roles feed the group. Main deck only (not maybeboard, sideboard, companion, commander), by quantity, using the existing `isMainListCard` [Confirmed: src/lib/deck-health-server.ts]. "Light" = 2 or more short; a target under 2 is never Light (unchanged).

### 7.2 Target source order (per group, not per deck)
1. **build**: `decks.build_id` → `ref_commander_builds`. lands = `avg_lands`; ramp = `avg_ramp`; card_advantage = `avg_draw`; interaction = `avg_removal + avg_wipes`, used **only when both are not NULL**. Rounded to the nearest whole number (half up) after summing. Source label "from the {archetype} build".
2. **all-builds average** (answered 7d-1): today's `getCommanderTargets` result when `status = 'ok'` (source `edhrec_average` or `edhrec_estimate`): lands = `landsTypical`; ramp, card_advantage (the old "draw"), interaction = old removal + old wipes (both present). Label "from the all-builds average for {commander}" (or "from the EDHREC estimate for {commander}").
3. **common guide**: 36 / 10 / 10 / 10. Label "common guide".
A group takes the first source that has a number for that group; a deck can mix sources. A build row with every average NULL ("General") gives no numbers and falls through. The numbers 36/10/10/10 are the app's current guide plus the brief's Interaction 10 [Not confirmed against Rachel Weeks or the Command Zone; do not change them in this feature].

### 7.3 The exact data the health function reads (nothing else)
Run for one deck and one signed-in user, all reads scoped to that user:
1. `decks` row: `id, user_id, commander_name, commander_id, build_id`; refuse `deck_not_found` unless `user_id` matches.
2. `deck_cards` for the deck: `id, card_name, scryfall_id, quantity (NULL = 1), categories, is_commander, command_zone_role`.
3. `deck_slot_oracle_ids(user, deck)`: `slot_id → oracle_id` (NULL means unidentified).
4. `ref_cards` by exact `card_name`: `type_line, oracle_text` (today's lookup, unchanged; the 115 cards with no text stay "not checked").
5. `get_effective_card_roles(user, oracle_ids)`: roles per card (layers merged by section 4).
6. `get_deck_card_jobs(user, deck)` (once DB-3 exists): `effective_job`, `effective_from`, `claude_state`.
7. `get_deck_strategy_points(user, deck)` (once DB-4 exists): all non-dismissed rows.
8. Targets: the build row (`ref_commander_builds` by `decks.build_id`: `archetype, avg_lands, avg_ramp, avg_draw, avg_removal, avg_wipes`) and today's `getCommanderTargets(commanderNames)` result.
If a step fails, the answer is `could_not_check` with no numbers (D-030). If steps 6 or 7 fail but 1 to 5 succeed, health returns roles-only counts and says so (`partial_inputs`). Before DB-3 or DB-4 exist the steps are skipped, not failed.

Algorithm for each main-deck row (quantity q):
1. Land? (front-face type line, else basic by name) → `lands += q`; stop.
2. Roles: the card is **labelled** when it has any row in any layer for its oracle id (including a `remove` row). Labelled → use its effective roles (`effective = true`), source "role". Not labelled → use today's text reading (`rolesForCard`), mapped ramp→ramp, draw→card_draw, removal→targeted_removal, wipes→board_wipe, source "card text". No card text and not labelled → `unclassified += q`. (A card with a `remove` row but no other roles is labelled and counts in no group, as the owner intended.)
3. Groups from roles via 7.1, deduplicated per card.
4. Strategy points: for each non-dismissed point that **covers** the card (card_type matches the front-face type line word, or the card's oracle id is in `covers_oracle_ids`) and has an effect: `counts_as g` adds g (once); `does_not_count_as g` removes g. Where one card gets both for the same group, `does_not_count_as` wins. Lands are skipped. Record each add or remove with the point's id for the "adjusted by your strategy point" line and the card list.
5. Add `q` to each group the card is finally in. Plan line: count the card's `effective_job` as a plan card or a win condition (7.1), by quantity 1 per card.
6. Output per group: have, target, targetSource (`build` | `all_builds_average` | `edhrec_estimate` | `common_guide`), light flag, per-card reasons (role, strategy point id, job, card text, proposed), count note ("N from roles, M from card text, +K by strategy point(s)"), and `proposedCount` (cards whose contribution depends on a `to_look_at` Claude row, the "2 are still Proposed by Claude" line).
Proposed (to_look_at) Claude values count (brief 7c-2 recommendation), and Undo removes them.

### 7.4 What does not change
The common guide numbers, the Light rule, the card-text reading as a stand-in, the connector's `get_deck_health` shape until slice 7 changes it deliberately (Developer updates `get_deck_health` and the app health together so they give one answer, as today).

## 8. Claude's tools (connector)
Added to `CONNECTOR_WRITE_TOOLS` / read tools and the tool-name snapshot test: **`get_card_labels`** (read), **`get_strategy_points`** (read), **`propose_card_labels`** (write), **`propose_strategy_points`** (write). Existing `undo_change`, `list_recent_changes` and `get_change_status` work for the new kinds without a change. Accept, change and dismiss are **owner-side only** in the app (section 9); Claude has no tool to accept, dismiss or clear anything, and none that edits an owner value.
Rules common to all four:
- **Isolation.** The user comes only from the verified token and the active connection. No tool accepts a `user_id`, `owner`, `connection_id` or any id of that kind (strict schemas reject it, like CC-15). Every database call passes the token's user as `p_user_id`; every deck and slot id is checked against that user. Someone else's deck or slot is `deck_not_found` or `slot_not_found`, never "forbidden", so existence is not revealed. Reads return only that user's personal rows plus the shared baseline (which holds no user data).
- Writes go through `ai_submit_change` (so connection-off, locks, gate, pending, log all apply). `dry_run` is supported and returns `would_apply` or `would_wait` with the plan.
- Strings are trimmed in the tool and again in SQL (SQL is the authority).

### 8.1 `get_card_labels`
Input: `{deck_id: number, only?: 'all'|'unlabelled'|'to_look_at', after_slot_id?: number, limit?: number (1..150, default 150)}`.
Output: `{deck: {id, name}, cards: CardLabelsView[], next_after_slot_id: number|null, counts: {cards, with_roles, with_jobs, to_look_at}, truncated?: string}`. Each card: `slot_id, name, oracle_id|null, quantity, categories (string[]), in_main_deck, no_card_data, roles: [{role, effective, from: 'standard'|'you'|'claude', state?: 'to_look_at'|'dismissed', beside?: {from:'claude', effect}}], text_roles: RoleSlug[] (what today's text reading says, as a hint when roles is empty), job: null | {name, reason, from:'you'|'claude', state?, beside?: {name, reason}}, legacy_hint: RoleSlug|null`. `legacy_hint` is the old `ref_cards.default_category` primary mapped to the new list (Ramp, Draw→card_draw, Removal→targeted_removal, Counterspells→counterspell, Tutors→tutor, Protection→protection; Engine, Finisher, Utility and anything else → null). It is a read-only hint, flagged unreliable, and is never written anywhere (section 10). Size cap `MAX_RESPONSE_BYTES` with the existing `fitRows`; truncation is stated, never silent (D-030). Job and strategy fields are empty (`job: null`) until DB-3 exists, and the tool says `jobs: 'not_available_yet'` in `counts`.
Refusals: `deck_not_found`, `connection_revoked`, `invalid_request`.

### 8.2 `get_strategy_points`
Input: `{deck_id: number}`. Output: `{deck: {id, name}, points: [{id, statement, covers: {kind:'card_type', card_type} | {kind:'cards', cards:[{name, oracle_id}]}, covers_count, effect: null | {kind, group}, reason, from:'you'|'claude', state:'accepted'|'to_look_at'|'dismissed'}], limit: 30}`. Dismissed points are included (so Claude does not re-propose them), marked `state:'dismissed'`. `covers_count` is worked out against the deck's current cards. Refusals: `deck_not_found`, `connection_revoked`, `strategy_points_not_available`.

### 8.3 `propose_card_labels`
Input: `{deck_id: number, cards: [{slot_id: number, name: string, add_roles?: RoleSlug[], remove_roles?: RoleSlug[], job?: {name: string, reason?: string}}], dry_run?: boolean}`. 1 to 200 cards; each card needs at least one of `add_roles`, `remove_roles`, `job`; a role may not be in both lists; roles are the 13 slugs; job name 1 to 40 characters; reason at most 200.
Output: `{success: true, outcome: 'applied'|'pending'|'would_apply'|'would_wait', group_id?, count, pending_id?, expires_at?, reason?, plan: {n, changes: [{slot_id, card_name, oracle_id, roles: [{role, effect, result}], job: null|{name, reason, result}}], skipped: [{slot_id, card_name, what, why: 'unchanged'|'previously_dismissed'}]}}`. `result` is `proposed` or `beside_yours`. Applied at once up to 120 cards; 121 to 200 give `pending` (waits for the owner, 24 hours); above 200 is refused `too_many_cards`.
A role or job proposed for a card that already holds the owner's different value is stored beside it (`beside_yours`); the owner's value stays in force and nothing of the owner's is written (S5). Claude's role proposals are personal to this user and are never written to the shared baseline (S3).

### 8.4 `propose_strategy_points`
Input: `{deck_id: number, points: [{statement: string, covers: {card_type: CardType} | {cards: [{slot_id: number, name: string}]}, effect?: {kind: 'counts_as'|'does_not_count_as', group: 'ramp'|'card_advantage'|'interaction'}, reason?: string}], dry_run?: boolean}`. 1 to 10 points per request; at most 30 points per deck; a hand-picked list is 1 to 100 cards, each an existing slot in the deck (stored as oracle ids).
Output: same envelope as 8.3 with `plan.changes: [{statement, covers_count, effect, result: 'proposed'}]` and `skipped` for `already_exists` and `previously_dismissed`. Each point is one log row and counts as one toward the limits.

### 8.5 Refusal codes and plain texts
The text is returned in `error.message`; `change-sentences.ts` holds the same wording. `{x}` are filled from the detail.
| Code | When | Plain text |
|---|---|---|
| connection_revoked | connection off (existing) | "This connection was switched off in Oracle. Reconnect it from Claude to allow it again." |
| deck_not_found | deck missing or not the user's | "No deck with that id in your Oracle." |
| slot_not_found | slot id and name do not match a card in that deck | "{card} is not in {deck} under that slot. Read the deck again and use the slot number it gives." |
| duplicate_slot | same slot twice | "{card} is listed twice in this request. Send it once." |
| duplicate_card | two slots resolve to one card | "{card} appears under two slots in this request. Send it once." |
| card_not_identified | slot cannot be resolved to a card identity | "Oracle cannot tell which card {card} is yet, so it cannot save a role or job for it." |
| unknown_role | role not one of the 13 | "{role} is not one of Oracle's roles. The roles are ramp, fixing, card_draw, card_selection, tutor, targeted_removal, board_wipe, counterspell, protection, recursion, graveyard_hate, stax_tax, hand_disruption." |
| conflicting_roles | a role both added and removed | "{card} has {role} in both the add and the remove list." |
| bad_job_name | empty or over 40 characters | "A job name must be 1 to 40 characters." |
| reason_too_long | over 200 characters | "A reason can be at most 200 characters." |
| slot_in_maybeboard | job for a maybeboard card | "{card} is on the maybeboard, so it cannot be given a job. Roles can still be set." |
| nothing_to_change | every value skipped | "Nothing to change: everything you sent is already set, or the owner dismissed it." |
| too_many_cards | over 200 cards | "A request can cover at most 200 cards." |
| invalid_request | wrong shape, empty list, unknown field | "That request was not valid: check {field}." |
| jobs_not_available | DB-3 not applied | "Jobs are not switched on in Oracle yet." |
| strategy_points_not_available | DB-4 not applied | "Strategy points are not switched on in Oracle yet." |
| bad_statement | empty or over 200 characters | "A strategy point must be 1 to 200 characters." |
| bad_covers | not exactly one of card type or card list; list empty or over 100 | "A strategy point covers either one card type or a list of 1 to 100 cards." |
| unknown_card_type | not in the list | "{type} is not a card type Oracle uses here." |
| bad_effect | kind or group invalid, or one given without the other | "An effect needs both a kind (counts as, does not count as) and a group (ramp, card advantage, interaction)." |
| too_many_points_in_request | over 10 | "At most 10 strategy points in one request." |
| too_many_strategy_points | deck already has 30 | "{deck} already has 30 strategy points. Remove one first." |
| too_many_waiting | existing | "Too many requests are waiting for the owner. Ask them to approve or decline some." |
| already_undone, window_closed, deck_gone, slot_gone, changed_since, nothing_to_undo, owner_only | Undo refusals | "Already undone." / "Undo is only possible for 7 days." / "The deck is gone." / "The card is gone from the deck." / "The owner changed {card} since, so it was not undone." / "Nothing was left to undo." / "Only the owner can undo this." |
Pending outcomes keep the existing reasons (`over_ten` meaning "over the one-request limit", `recent_total`, `busy`).

## 9. The app's routes (what each reads and writes)
All routes: require a signed-in session (`requireAuth`), use `createAdminClient()` and pass `authResult.id` as `p_user_id`; every deck id is verified against that user first; return `404 Deck not found` otherwise. Owner writes return `previous` for the 10-second Undo. No route takes a user id from the request.
**Existing routes that stay as they are (reused):** category edit `PATCH /api/decks/[id]/cards/[cardId]/categories` (the only writer of `deck_cards.categories`); link a commander `PATCH /api/decks/[id]` (`commander_id`, `commander_name`, `commander_scryfall_id`, scoped to the user) with the lookup `GET /api/commanders/search`; pick a build `POST /api/decks/[id]/build` (`build_id`) and its `GET`; Strategy fields and Notes `GET/PUT /api/decks/[id]/strategy`; dated notes `GET/POST /api/decks/[id]/notes`; Undo of a Claude batch `POST /api/connector/changes/[id]/undo` (already kind-agnostic); the change list `GET /api/connector/changes`; held requests `/api/connector/pending…`; health `GET /api/decks/[id]/health` (changed in slice 7, section 7).
**Gap found, not part of the database work:** `GET` and `PUT /api/decks/[id]/strategy` look up the deck by id without an owner filter [Confirmed: src/app/api/decks/[id]/strategy/route.ts lines 25 to 38 and 97 to 172]. With one user this is invisible; for multi-user it must filter by user. Slice 4 (the Strategy tab) fixes it.
**New routes:**
| Route | Reads | Writes |
|---|---|---|
| `GET /api/decks/[id]/cards/[cardId]/labels` (card window) | `deck_cards` (the slot, owner-checked); `_slot_oracle_id`; `get_effective_card_roles`; `get_deck_card_jobs` and `deck_job_names` (from slice 5); `get_deck_strategy_points` plus the card-type coverage test (from slice 6); `ref_cards` text for "computed from card text" and the "counts as" explanation | nothing |
| `PUT /api/decks/[id]/cards/[cardId]/roles` body `{role, action:'add'|'remove'|'clear'}` | slot → oracle id | `owner_set_card_role` |
| `POST /api/decks/[id]/cards/[cardId]/roles/decide` body `{role, decision:'accept'|'dismiss'}` | slot → oracle id | `owner_decide_card_role` |
| `PUT /api/decks/[id]/cards/[cardId]/job` body `{action:'set'|'clear_job'|'clear', job?, reason?}` (slice 5) | slot → oracle id | `owner_set_card_job` |
| `POST /api/decks/[id]/cards/[cardId]/job/decide` `{decision}` (slice 5) | slot → oracle id | `owner_decide_card_job` |
| `GET /api/decks/[id]/jobs` (Card jobs layer, Group by Job; slice 5) | `get_deck_card_jobs`, `deck_job_names`, `deck_cards` (current cards only), counts per job and per proposer | nothing |
| `GET /api/decks/[id]/strategy-points` and `POST` (create) , `PUT /api/decks/[id]/strategy-points/[pointId]` (edit; a Claude point becomes yours), `DELETE …/[pointId]`, `POST …/[pointId]/decide` (slice 6) | `get_deck_strategy_points`, coverage counts, live preview ("Covers 19 cards", "Ramp would go from 8 to 11") computed from section 7.3 with the draft point included | `owner_save_strategy_point`, `owner_delete_strategy_point`, `owner_decide_strategy_point` |
| `GET /api/decks/[id]/proposals` (the Claude's proposals bar) | counts of `to_look_at` rows for roles (cards in this deck), jobs, strategy points; batches from `ai_list_recent_changes` for this deck with their blocker | nothing |
| `POST /api/decks/[id]/proposals/accept` body `{scope:'all'}` or `{scope:'batch', group_id}` | none | `owner_accept_role_proposals`, and from slices 5 and 6 `owner_accept_job_proposals`, `owner_accept_strategy_point_proposals`, in one request (each is its own transaction; the route reports how many of each were accepted; a failure in a later one does not undo an earlier one, which is safe because accepting is idempotent and reversible by the 10-second Undo) |
| "Undo all" | uses the existing `POST /api/connector/changes/[id]/undo` with the batch's `group_id`, actor owner (partial rule, S13) | |
| `GET /api/decks/[id]/health` (slice 7) | section 7.3 | nothing |
Link commander step: no new route, no new stored data. The Build layer calls the existing commander search, then `PATCH /api/decks/[id]`, then the existing build list and `POST /api/decks/[id]/build`. If linking finds no match the layer says so and nothing changes.

## 10. The "default category" guess and the 285 cards (settled)
**Where Claude's first role proposals go: the owner's personal layer (`user_card_roles`, proposer `claude`, state `to_look_at`), never the shared baseline.** For the three test decks (about 285 cards) Claude calls `propose_card_labels` with `add_roles`; every row is written for this owner only, labelled "Proposed by Claude", counted in health straight away, and undone by one click as a batch. Nothing Claude writes can reach another user, because the baseline is only written by a service-role job and DB-1 ships it empty.
**In plain words:** Claude's first guesses are written on your own copy of the card list, in pencil. The shared master list is separate and locked, and starts empty. If Claude guesses wrong, only your copy is affected, you fix it or press Undo, and nobody else is ever shown it.
**Later, after the owner is happy (slice 8, its own approval):** a script run with the service role may write the baseline (`proposer='system'` from the text-reading rules, `basis='text_rules:v2'`) and may promote roles the owner accepted into the baseline as `proposer='claude'` rows, after the owner reviews the list. That is a data job, not an app feature, and it is outside the four database changes.
**`ref_cards.default_category` (the old guess):** not copied into the baseline, not used to fill any table. It is keyed by card name, allows one main label, and its quality is unchecked (audit section 1). It appears only as `legacy_hint` in `get_card_labels` (read-only). It stays until slice 8 removes it.
**Cards with no card data (115):** Claude's tool still accepts a role for them (it may know the card); the response marks `no_card_data: true` so the owner knows it was not checked against the rules text. The owner can set a role by hand in the card window as for any card.

## 11. The four database changes (small, separate, each needs the owner's approval)
Every one: DRAFT header "DRAFT. NOT APPLIED. Needs owner approval"; one transaction; additive; a guard that refuses a second run and refuses a wrong base; `.rollback.sql` beside it; tried on a **throwaway local Postgres** (the CC-15 harness) before any live run; applied by the owner, one at a time, in this order. None is applied by an agent. Rollbacks refuse while the new tables hold rows (the owner's labels), unless the session first sets `oracle.rollback_allow_data_loss` to `yes`; they never delete log history, and DB-2's rollback refuses while any `card_label` or `strategy_point` log or pending row exists.
| | Contents | Depends on | Rollback | What the owner sees after |
|---|---|---|---|---|
| **DB-1** `20261118120000_roles_db1_card_roles` | `ref_card_roles`, `user_card_roles`, RLS and grants, the 5.1 functions | CC-15 base only (no ai_* object) | Drops the two tables and five functions; refuses with data unless overridden | Slice 2: add and remove universal roles on a card in the window ("Set by you"). Claude does nothing yet. |
| **DB-2** `20261118120100_roles_db2_change_kinds` | Widened kind and action lists, `_ai_limits_roles`, the front doors and the `card_label` and `strategy_point` handlers, job and strategy hook stubs, `ai_list_recent_changes` with `label_detail`, `owner_decide_card_role`, `owner_accept_role_proposals` | DB-1 and CC-15a (and CC-13) applied | Drops the new functions, renames the `_pre_roles` functions back, restores both constraint lists and the CC-13 `ai_list_recent_changes`; refuses while new-kind rows exist | Slice 3: Claude can propose roles for a deck, applied at once up to 120 cards, labelled, Accept/Change/Dismiss, Undo all from Recent changes. Jobs and strategy points refuse with "not switched on yet". |
| **DB-3** `20261118120200_roles_db3_deck_card_jobs` | `deck_card_jobs`, the job hooks with real bodies, 5.3 functions | DB-1, DB-2 | Restores the stub hooks, drops the table and functions; refuses with data unless overridden or while job log rows exist | Slice 5: set a job and reason in the window and in Card jobs; Claude proposes jobs (counted once with its roles); Group by Job. |
| **DB-4** `20261118120300_roles_db4_strategy_points` | `deck_strategy_points`, the strategy hooks with real bodies, 5.4 functions | DB-1, DB-2 (not DB-3; may run before it) | Restores the stub hooks, drops the table and functions; refuses with data unless overridden or while strategy log rows exist | Slice 6: strategy points in Your strategy and the card window; Claude proposes them; they adjust health counts once slice 7 is built. |
The brief's DB-3 "memory of dismissed proposals" is not a table (S6) and so is not in any of the four. DB-3 and DB-4 stay separate (brief: "may be combined"); combining them would save one approval but make a failed test harder to isolate.
Order of application relative to other drafts: after CC-15a and CC-15b (applied). The CC-16, CC-17 and CC-18 drafts are independent; if CC-16 is applied later it still works because its undo helpers sit behind the CC-15a front door that this contract keeps behind its own.

## 12. Test plan (throwaway Postgres only; the next step writes and runs it)
Harness: copy of `docs/oracle/reports/evidence/cc15-db/` (`run.sh`, `00_base.sql`, `01_seed.sql`) into `docs/oracle/reports/evidence/roles-db/`, adding stand-ins for `ref_printings(scryfall_id uuid, oracle_id uuid, name)` and `ref_cards`, and applying the real migrations 20261116130000 through 20261117200100 unmodified (CC-15a and 15b come from `supabase/migrations/`). Two users, one connection each. Never the hosted project.
Each DB's test must prove, and record PASS/FAIL counts:
- **RLS**: user 2 (role `authenticated` with the user 2 token) reads none of user 1's rows in any new table; cannot insert, update or delete any row (permission denied); `anon` is denied everywhere; the baseline is readable by any signed-in user and writable by nobody but the service role; every function refuses `anon` and `authenticated`.
- **Isolation in the functions**: user 2's id against user 1's deck, card or point gives `deck_not_found`/`slot_not_found` and writes nothing; user 2 cannot undo, accept or see user 1's group.
- **Constraints**: bad role, bad proposer/state combination, a Claude row with no job, overlong text, bad covers, duplicate unique keys all rejected.
- **Append-only guard still works** (DB-2 onward): updating any log column other than `undone_at`/`undone_by` fails with `ai_change_log_is_append_only`; the owner Undo sets only those two; deleting a deck that has new-kind log rows and cascaded job/point rows succeeds (the deck-clear exception still passes).
- **Old kinds untouched** (DB-2): `deck_add`, `deck_category`, `deck_create`, `deck_setup`, `box_create` still plan, apply and undo through the new front doors; limits unchanged.
- **Layering and the never-overwrite rule**: owner role/job/point survives a Claude proposal of a different value, which appears beside it; accept, change, dismiss behave as section 4; a dismissed value is skipped; Claude never writes an owner row.
- **Limits and the count rule**: a request of 120 cards with a role and a job each applies and logs 120 rows; 121 waits as `over_ten`; 201 is refused; approving a held request applies it and re-validates; a stale approval is refused with nothing changed; 11 strategy points refused; the 31st point in a deck refused.
- **Undo of a batch**: Claude undo restores every card; Claude undo refuses with `changed_since` and changes nothing when the owner accepted one card; owner undo restores the rest and reports the left-alone card; window closed after 7 days; second undo `already_undone`.
- **Health inputs**: `deck_slot_oracle_ids` resolves by printing, by name, and leaves an unknown card NULL; `get_effective_card_roles` merges the three layers exactly as section 4.
- **Rollback restoring the previous state**: before applying, record md5 of every affected function definition, both constraint definitions and the list of tables; apply DB-1 to DB-4; roll back DB-4, DB-3, DB-2, DB-1 in reverse (empty tables); the recorded fingerprints must match exactly; rollback refuses with rows present and works with the override; re-apply works.
The Tester repeats the isolation checks against the running app with two real test accounts before any live step (the Developer flags save-path tests as untested until the separate test account exists, per process.md).

## 13. For the owner (plain words, each with a recommendation)
1. **When you press "Undo all" on Claude's batch and you have already accepted some of its cards, what should happen?** Recommendation: undo every card you have not touched and leave your accepted ones alone, telling you which. (You would see "Undone 40 cards. 3 you had already accepted were left as they are.") The alternative is to refuse the whole undo with a reason, which is simpler but means one accepted card blocks the rest. This only affects your own button; Claude's own undo stays all-or-nothing.
2. **If you dismiss a Claude suggestion for a role, should Claude stay quiet about it in every deck or only in that deck?** Recommendation: every deck (a role is the same everywhere). Jobs and strategy points are remembered per deck.
3. **Should a job ever change the health counts?** Recommendation: no. Only a strategy point does, for example "these artifacts count as ramp". Jobs only feed the Plan and win conditions line. (The design spec hints jobs could too; that would need one more stored field.)
4. **Should the "what changed" notice on the health section survive a page reload?** Recommendation: no for now. It would list Claude's unlooked-at suggestions after a reload, and show your own changes only while the page is open. Keeping your own changes across reloads needs one small extra table.
5. **Common guide numbers**: 36 lands, 10 ramp, 10 card advantage, 10 interaction are unchanged and unchecked against the two sources. Someone should check them before they are locked as D-064.
Everything else in this contract follows decisions you already made.

## 14. Developer tasks (after approval; Architect writes no handlers)
1. After DB-1: roles functions behind the card window routes; replace the four-role constant with the 13 slugs; stand-in text mapping.
2. After DB-2: the four tools, registered with the snapshot test; `write-types` and gateway actions `card_label`, `strategy_point`; sentences and grouping; tests that assert `AI_LIMITS_ROLES` equals `_ai_limits_roles()`.
3. After DB-3 and DB-4: job and strategy point routes, the Card jobs layer, Group by Job.
4. Slice 7: health per section 7, one function shared by the app route and `get_deck_health`.
5. Slice 4: owner-filter the Strategy GET and PUT.

## 15. As built in the drafts (2026-11-18): exact shapes the migrations use, and the changes this made to sections above
Where this section and an earlier one differ, this section wins; the throwaway tests (`docs/oracle/reports/evidence/roles-db/`) check every line.
**15.1 Payloads sent to `ai_submit_change`** (the tool maps its `slot_id`/`name` to `id`/`card_name`, as `set_card_category` does; the types file has the same shapes as `CardLabelPayload` and `StrategyPointPayload`).
- `card_label`: `{deck_id, cards:[{id, card_name, add_roles?:[slug], remove_roles?:[slug], job?:{name, reason?}}]}`. `id` is `deck_cards.id` and must match `card_name` exactly (else `slot_not_found`). Each card needs at least one of the three (else `invalid_request`).
- `strategy_point`: `{deck_id, points:[{statement, covers:{card_type}|{cards:[{id, card_name}]}, effect?:{kind, group}, reason?}]}`. The owner function `owner_save_strategy_point` takes `p_fields` in the same shape and, for the owner's route that already holds oracle ids, also `covers:{oracle_ids:[uuid]}` (1 to 100, each must exist, else `unknown_card`). Exactly one of `card_type`, `cards`, `oracle_ids` (else `bad_covers`).
- Plan (returned by dry run and in `plan` of every outcome): `{action, deck_id, deck_name, n, cards, changes, skipped, preview}`. `changes[]` for roles/jobs: `{slot_id, card_name, oracle_id, roles:[{role, effect, result}], job: null | {name, reason, result}}`; for points: `{statement, covers_kind, card_type, covers_count, effect: null|{kind,group}, result:'proposed'}`. `skipped[]`: `{slot_id, card_name, what, why}` (`what` = the role slug or `job`) or `{statement, why}`. `why` is `unchanged`, `previously_dismissed` or `already_exists`. A job name is returned with the starting seven's spelling (`engine` becomes `Engine`) or the deck's most used spelling.
**15.2 Log row shapes as built.** `card_label`: `before = {roles:[{role, row:null|{effect,state,batch_id,proposed_in_deck_id}}], job: null | {row: null|{job,reason,state,batch_id}}}`; `after = {roles:[{role,effect,state,result}], job: null|{job,reason,state,result}, beside:[{what:'role',role}|{what:'job'}]}`. Only values that really changed appear: a role Claude asked to remove that the card never had is skipped, not logged. `strategy_point`: `before` = `{}` for a new point, otherwise the earlier row's fields (statement, covers_kind, card_type, covers_oracle_ids, effect_kind, effect_group, reason, state, batch_id, point_id); `after` = the point's fields (covers as sorted oracle ids) plus `point_id` and `state`. No oracle id or slot on a strategy point's log row.
**15.3 Functions added beyond the lists in 5.1 to 5.4 (all private, service role only):** `_roles_fail` (DB-1), `_job_canonical_name` (DB-3), `_strategy_point_normalize` and `_ai_strategy_point_prepare` (DB-4; the plan, execute and approve paths all go through the same validation, so a held request is re-checked when it is approved). The four hooks keep the signatures in 5.2; `_ai_label_job_plan` returns `{result:'proposed'|'beside_yours'|'skipped', why, job, reason, before}`. `get_deck_strategy_points` returns **every** row of the deck, dismissed ones included (Claude's read tool needs them); health and the editor drop `state = 'dismissed'` (this replaces "all non-dismissed rows" in 7.3 step 7). `get_deck_card_jobs` returns only cards currently in the deck (a job left by a removed card is not listed).
**15.4 What each owner function returns.** Roles and jobs: `{previous:{...}, current:{...}}` with `owner_effect`/`claude_effect`/`claude_state` (jobs: `owner_set`, `owner_job`, `owner_reason`, `claude_job`, `claude_state`). Strategy points: `{previous: row|null, current: row}`, `{deleted: row}`. Accept-all: `{accepted: n}`. No `success` key; the route adds its own envelope.
**15.5 Undo as built.** A `card_label` or `strategy_point` group is undone by `ai_undo_group` for both actors. Claude: first blocker refuses with `{success:false, refused:{code, card, deck, what}}`, nothing changes. Owner: untouched rows restored; touched rows reported in `left_alone:[{card, deck, what}]` (`what` = the role slug, `job` or `point`); if nothing could be restored `refused.code = 'nothing_to_undo'`. The previous Claude row is restored exactly, including a dismissed row Claude had overwritten (the memory survives Undo). Claude cannot undo a group the owner approved, or one over 200 rows (`owner_only`). A deck deleted afterwards gives `deck_gone`. `ai_pending_changes` rows for the new kinds can wait for `over_ten` (roles and jobs), `recent_total` and `busy` (both kinds); a strategy-point request is at most 10 points so it never reaches `over_ten`.
**15.6 Extra codes the functions raise** (add to 8.5 and `LabelErrorCode`): `bad_decision` (decision not accept/dismiss), `card_not_in_deck` (owner job for a card not in the deck), `point_exists` (the sentence is already a point in this deck), `change_not_found`, `invalid_actor`. `unknown_card` is also raised for an oracle id with no printing (so a printing id passed as a card id is refused, D-003). `slot_not_found` and `card_not_identified` also apply to strategy points that cover a hand-picked list.
**15.7 Grants.** Every new function is `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role`. The four renamed `*_pre_roles` functions keep exactly the grants the live functions had (the DB-2 rollback therefore restores them byte for byte, which the fingerprint test proves).
**15.8 Rollback order.** 4 and 3 in either order, then 2, then 1. Each refuses out of order, while the new kinds' log or pending rows exist (DB-2, DB-3 for job rows, DB-4), and while its tables hold rows unless `SET oracle.rollback_allow_data_loss = 'yes'` is run first in the same session. The DB-2 rollback does not touch the role tables.
**15.9 Open point for the owner (not a database change).** Because Claude holds one waiting row per card and role, a second Claude batch that touches the same card replaces the first batch's value for it, and Undo of the first batch is then refused with `changed_since` ("the card was changed since"), although the owner did nothing. The alternative (one waiting row per batch) needs a bigger table key and was not built. Recommendation: leave it; the second batch's Undo restores the first batch's value, so nothing is lost.
