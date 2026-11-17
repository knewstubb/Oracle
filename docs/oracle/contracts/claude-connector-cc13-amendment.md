# Contract amendment: Claude connector edit limits (CC-13)

Owner 2026-11-17: threshold is 120 (not 100); owner undoes moves; no new fill-deck tool (section 5 gap 2 dropped; Claude groups a deck build into one add_cards_to_deck call).
Status: DRAFT for Gene to record after owner approval (owner approved the numbers 2026-11-17). Author: Architect. Amends `docs/oracle/contracts/claude-connector-slice-b.md` sections 0, 1 (rows 1, 3), 3.1, 4, 6 and the pending rules in 5. Types: `docs/oracle/contracts/claude-connector-cc13-amendment.types.ts`. Draft SQL: `supabase/drafts/20261117100000_cc13_loosen_limits.draft.sql` (+ rollback). Nothing is applied.
Tags: `[Confirmed: path]` = read in code or SQL.

## 1. Plain words

- Claude may change up to **120 cards in one request** without asking (was about 10). Whole new decks can be built in one go.
- Claude may make up to **500 changes an hour** (was 40).
- Moving a card from one deck to another **goes straight through**, with Undo for 7 days. No approval.
- **Undo is one click**, whatever the size of the request. Claude can undo its own requests up to 200 cards; you can undo any size in Oracle.
- Building from "unused cards" only ever uses copies that are free. A copy that sits in another deck moves only if Claude is asked to move that copy.
- Still true: Claude can never delete cards, copies or decks; it can't approve anything; 7-day Undo window; Undo is refused with a reason if the deck changed since.
- Requests of 121 to 200 cards, or a very busy hour, still wait for your yes (24 hours). Over 200 in one request is refused ("send a smaller request").

## 2. New values (replace section 4 table values)

| Constant | Was | Now | Note |
|---|---|---|---|
| `direct_max` | 10 | **120** | cards per request that go straight through |
| `split_window_minutes` | 30 | 30 | unchanged |
| `split_max` | (used direct_max) | **200** (new key) | one deck, un-approved Claude changes in the window plus this request; over it waits (`recent_total`) |
| `hourly_max` | 40 | **500** | all decks; counts changes Claude undid in that hour too |
| `max_request` | 60 | **200** | over `direct_max` waits (`over_ten`, name kept, now means "over the one-request limit"); over 200 refused `too_many_cards` |
| `claude_undo_max` | 10 | **200** | equals `max_request`, so every group Claude can make it can also undo |
| `max_waiting`, `pending_hours`, `undo_days` | 20, 24, 7 | unchanged | pending is now rare (only 121-200 cards, `recent_total`, `busy`); 20 and 24 h still fit |

Why `split_max` and `max_request` moved: with `direct_max` 120 the old rule "this request + last 30 minutes in this deck > direct_max" would make "build a 100-card deck, then add 5 tweaks" wait. 200 keeps a ceiling against splitting without hurting normal use. 200 for `max_request` keeps a working approval path for unusually big requests and fits one request body (about 200 x 150 bytes, under the 32 KB request cap [Confirmed: src/lib/connector/limits.ts]). Both are Architect proposals inside the owner's numbers; see open question 1.

Where the constants must agree (a test asserts all three equal): `_ai_limits()` in SQL, `AI_LIMITS` in `src/lib/connector/edit-config.ts` [Confirmed], and the amendment types file.

## 3. Card moves (replaces tool row `request_card_move` and gate rule `copy_move`)

- `_ai_gate` no longer returns `card_move`. A move is one row, counted by the same split/hourly rules. Result `applied` with `group_id`. [Confirmed gate today: supabase/migrations/20261116150100_ai_connector_edit_rpcs.sql section 3]
- All safety checks stay in `_ai_plan` (commander refused, same deck refused, source unchanged since the request, open non-maybeboard slot required, copy must be in a deck). A move still fills a slot that already exists in the destination; it never creates one.
- Source slot stays planned and shows "Unavailable · In {deck}"; the history line now says "Claude moved this copy" with no "you approved it" (`approved_by_owner` is false).
- Undo of a move: **owner only** stays (kind list `OWNER_ONLY_UNDO` unchanged) because it restores a copy to another deck; refusals unchanged (`copy_moved_again`, `source_slot_filled`, `source_slot_gone`). Open question 2 asks whether Claude may undo its own moves.
- Tool name stays `request_card_move` (renaming churns every Claude client); its description changes to "moves straight away; the owner can undo for 7 days". Result handler must treat `applied` (the tool already does via `shapeOutcome`).
- `copy_move` rows already waiting at the moment of release stay valid and can be approved, declined or expire (Approve/Decline code and the "Moving a card" pending card are kept).
- Source deck and destination deck are both counted in the log as before (`deck_id` source, `other_deck_id` destination).

## 4. One-click Undo for big requests

Findings:
1. Oracle-side Undo has **no size cap** and undoes a whole `group_id` all-or-nothing in one call. [Confirmed: `ai_undo_group`, p_actor 'owner', 150100 section 8; route `/api/connector/changes/[groupId]/undo`]
2. Claude-side `undo_change` is capped by `claude_undo_max` read from `_ai_limits()` in both `ai_undo_group` definitions [Confirmed: 150100 line ~730; 190000 line ~285]. Raising the constant to 200 is enough; no function replacement.
3. A request is one group only when it is one tool call. Today "build a deck from free copies" is 1 `add_cards_to_deck` group + one `sleeve_free_copy` group per card (the tool takes one copy). That is 100+ Undo clicks. **Fix: section 5.**
4. **The Recent changes list reads at most 300 rows** (`LIMIT 300`) [Confirmed: 190000 section 7]. With 100-row groups a group can be cut in half (wrong count and card list, Undo still undoes the whole group server-side) and older, still-undoable groups vanish from the screen. **Fix in the draft migration**: limit by groups (newest 50, row safety cap 2000, never cut a group), blocker computed once per group (also keeps the list fast).
5. The `list_recent_changes` tool shows 50 groups with at most 20 card names each and `claude_can_undo` uses `card_count <= claude_undo_max` [Confirmed: src/lib/connector/tools/edit-tools.ts]. Works unchanged with the new constant; text must say "about" for long lists.
6. Undo of one group locks the decks and each copy in order; 200 rows is well inside one transaction. Perf must be measured (Tester, section 7).

## 5. "Build from unused cards" uses only free copies

- Already enforced in SQL: `sleeve_copy` refuses a copy that is already in a deck (`copy_already_in_deck`) or missing (`copy_missing`) and only fills open non-maybeboard slots [Confirmed: 150100 `_ai_plan` sleeve_copy]. A copy in another deck therefore moves only through `request_card_move`.
- **Gap 1:** the plan does not check "in your hand"; `search_collection only_free` does (free = in no deck, not In your hand, not Missing) [Confirmed: src/lib/connector/tools/collection-filters.ts; the plan code has no hand check]. Developer/Architect to confirm how "In your hand" is stored and add the same check (Tester case below). If it is only a view flag, the check goes in `_ai_plan` for sleeve and move targets.
- **Gap 2 (needs owner OK):** add one tool, `sleeve_free_copies` (types file), that takes up to `max_request` free copy ids and fills open slots in ONE request and ONE group, so a whole deck build is one Undo. Same checks per copy as `sleeve_copy`, all-or-nothing, log rows kind `sleeve_copy` sharing one `group_id` (existing undo logic already handles that kind per row). SQL for this is NOT in the draft migration: it should wrap `_ai_plan`/`_ai_execute` the way 190000 did, and I will write it as CC-13b once the owner confirms the tool. Without it the limits work but a deck build is many Undo clicks.
- Tool text for `add_cards_to_deck`, `sleeve_free_copy` and the new tool: "Uses free copies only. A copy that is in another deck is never taken unless you call request_card_move for it."

## 6. Text that must change (full list in the report)

Tool descriptions (`src/lib/connector/tools/index.ts`: add_cards_to_deck, remove_cards_from_deck, set_card_zone, sleeve_free_copy, request_card_move, undo_change; every "Up to 10" and "more than 10 waits"), `ConnectionTab.tsx` Can/Can't lists, `change-sentences.ts` (copy_move sentence, `too_many_cards` "60", `group_too_big` "10 cards", `too_many_waiting` "20" stays), `shapeOutcome` messages, `RecentChangesTab` empty text, spec `docs/oracle/specs/claude-connector.md` sections 0, 4, 5, mockup, vocabulary, briefs (history, leave), slice-B contract sections 0/1/3.1/4/6 (add an "Amended by CC-13" pointer), D-034a (Gene, wording in report).

## 7. Test plan additions (Tester)

Unit: limits equality (SQL last definition = edit-config = types); gate at 120/121/200/201, split 200, hourly 500/501; move applies (no pending); `max_request` zod bound; sentences.
Live (throwaway user, cleanup): 100-card add goes through and one Undo (Oracle) restores; Claude `undo_change` on 120 and 200 rows; 121 waits, 201 refused; move goes straight and owner Undo returns it; move with filled destination refused; free-copy build never touches a copy that is in a deck; recent-changes with 3 groups of 100 rows shows all three complete; time of 200-row submit, undo and list (must stay well under the request timeout; report numbers); a pending move created before release still approves.

## 8. Rollout and rollback

Apply the SQL first (loosens nothing until code asks for it: with old code the zod bound still blocks > 60), then ship code, in one release window. Code-only rollback is not enough (the equality test). Rollback script restores old bodies, no data changes.
