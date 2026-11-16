# Contract: Claude connector, ninth change kind `deck_category` (set card category)

Extends `claude-connector-slice-b.md` (read it first). Owner approved on 2026-11-16: Claude may change the category of cards already in a deck, including inventing new category names (for example to sort a deck by archetype). Types: `docs/oracle/contracts/claude-connector-deck-category.types.ts`. Migration: DRAFT `supabase/drafts/20261116190000_ai_deck_category.draft.sql` (+ `.rollback.sql`), NOT applied.

## 0. Plain words
Claude can file each card in a deck under a list of up to 5 category names of its own choosing (for example "Ramp" and "Good Stuff"), different deck by deck, and can edit the list again later. Up to 10 cards go straight through; more than 10 wait for the owner's yes. Every change appears in Recent changes with Undo for 7 days. Claude can never use this to move a card to or from the Maybeboard, and it never changes how many copies a deck holds or which physical copy sits in a slot.

## 1. What it changes
- Writes exactly one column: `deck_cards.categories` (text, a JSON list such as `["Ramp"]`) `[Confirmed: src/lib/connector/tools/get-deck.ts parseCategories; edit-tools.ts line 150 writes JSON.stringify([category])]`.
- Never touches: zone, quantity, `copy_id`, ownership, placement, commander flags, tags, set/printing.
- The slot's whole category list is REPLACED by the list Claude sends (owner decision 2026-11-16). A card may hold several categories; max **5** per card (proposed; the app writes lists of any length today, 5 keeps the card view readable). Order is kept; the first is the group the card shows under. Repeats (any letter case) are dropped. Spelling follows section 3a. Undo restores the previous raw value exactly.
- Claude can edit a card again at any time: a new request simply replaces the list again. (Undoing an EARLIER change after a later one is refused, see section 6.)
- Commanders are allowed. Commander status lives in the separate `is_commander` and `command_zone_role` columns, which are never written `[Confirmed: src/app/api/ai/recommend/route.ts reads them separately from categories]`. Imported commanders also carry a `Commander` entry inside `categories` as a display group `[Confirmed: src/lib/deck-normalizer.ts lines 114, 208; src/components/CardsTab.tsx 301]`. That entry is PRESERVED: if a commander has it and the request omits it, it is put back at the front (counts toward the 5). `Commander` as a requested name is refused on a card that is not a commander, so Claude cannot make an ordinary card look like one.

## 2. Tool
`set_card_category` (exact name, add to the fixed allow-list and the tool-name snapshot test).

| Arg | Rule |
|---|---|
| `deck_id` | integer, from `list_decks` |
| `slots` | 1 to 60 items `{slot_id, name, categories}`; each card has its own list; same shape rule as `set_card_zone` plus `categories` |
| `categories` | 1 to 5 names; each trimmed, 1 to 60 characters (same limit as `add_cards_to_deck`); any free text, new names allowed |
| `dry_run` | optional; returns `would_apply` / `would_wait` with the plan |

Annotations: `readOnlyHint false`, `destructiveHint false` (it is reversible and removes nothing). Result shapes are the slice-B ones (`applied` + `group_id` + `count`, `pending_approval`, `would_*`). Dry-run and pending previews also carry `changes[]` (`slot_id`, name, `from` list, `to` list) and `skipped[]`.

## 3. Rules (all enforced in SQL, `_ai_plan`, re-run under the deck lock every time including at approve)
| Rule | Result |
|---|---|
| Deck not the user's | `deck_not_found` |
| Slot id and card name must both match a slot in that deck | `slot_not_found` |
| Same slot twice | `duplicate_slot` |
| Commander or command-zone slot | allowed; `Commander` entry preserved; flags untouched |
| Any name is `Maybeboard` in any letter case, after trimming | `category_reserved` |
| Any name is `Commander` (any case) on a card that is not a commander | `category_reserved` |
| Slot is on the maybeboard (Maybeboard is ANY of its categories, case-insensitive) | `slot_in_maybeboard` |
| A name empty after trim or over 60 characters; list empty or over 5 | `invalid_request` (field `categories`) |
| Slot already has exactly that list, in that order | skipped and listed in `skipped`, not an error |
| Every slot skipped | `nothing_to_change` |
| More than 60 slots | `too_many_cards` |

Trimming happens in both the tool (zod) and SQL (SQL is the authority).

### 3a. Matching names to the deck's existing categories (owner decision 2026-11-16)
**Where: in the database, inside `_ai_plan`. The tool does NOT match, normalise case or look anything up; it only trims and length-checks, then sends the names as Claude wrote them.** Reason: one place, runs under the deck lock, and is identical for dry run, direct apply and owner approval (approval re-matches against the deck as it is then).
- Each sent name (trimmed) is compared case-insensitively with every category already used by any card in THIS deck (other decks are never consulted). A match is stored with the deck's existing spelling: sending "ramp" when the deck has "Ramp" stores "Ramp".
- If the deck already holds several spellings of one name ("Ramp" on 20 cards, "ramp" on 2), the most used wins, then the lowest slot id, then alphabetical.
- A name not in the deck is a new category and is stored as given (trimmed). Within one request the first spelling sent wins, so sending "Tokens" for one card and "tokens" for another gives both "Tokens".
- Matching happens before the 5-name limit, the repeat check and the skip check, so a list that differs only in case from what the card has is a skip, not a change.
- The plan returned by `dry_run` and by pending previews carries `matched: [{card, sent, used}]` for every name whose spelling was changed, so Claude and the owner can see it. Only plain-words text built from this is shown; the Developer should show it in the tool result as a warning ("stored 'ramp' as 'Ramp', which this deck already uses").
- The log row stores the final stored list, not what was sent.

## 4. Gate
Unchanged `_ai_gate`. The count is the number of slots that will actually change (skipped ones do not count). Up to 10 apply immediately (subject to the existing 30-minute same-deck total of 10 and hourly cap of 40, which queue as `recent_total` / `busy`); more than 10 queue as `over_ten`. A waiting request is an `ai_pending_changes` row with `kind 'big_edit'`, `action 'deck_category'`, `card_count` = changing slots, expires in 24 h, approved only from the owner's signed-in Oracle session. Approve re-plans: if a slot moved to the maybeboard or disappeared since, the request fails with `failed` and a reason and changes nothing.

## 5. Atomicity
One transaction per request (the `ai_submit_change` / `ai_approve_pending` call). Either every changing slot is updated and logged under one `group_id`, or nothing is. Failure halfway rolls everything back. Locks: connection row, then the deck row, then the log rows (this kind touches no copies, so no copy locks).

## 6. Log and Undo
- One `ai_change_log` row per changed slot: `kind 'deck_category'`, `deck_id`, `deck_name`, `card_name`, `printing_id` = the slot's `scryfall_id` (a printing, D-003; no `oracle_id` written), `deck_card_id`, `copy_id` NULL, `before {categories: <raw previous text or null>}`, `after {categories: '["Ramp","Good Stuff"]', category_list: ["Ramp","Good Stuff"]}`.
- Undo (all or nothing per `group_id`, 7 days): pass 1 checks every row, pass 2 writes each slot's `before.categories` back byte for byte.
- Refused (nothing changes) with `slot_edited` if that slot's categories are no longer exactly what Claude wrote (the owner, another Claude edit, or a zone move changed it); `slot_gone`, `deck_gone`, `window_closed`, `already_undone` as for other kinds. "On {date}" comes from the later log row on that slot, as before. The refusal is per slot, not whole deck: a card added elsewhere in the deck does not block undo. 
- Who: Claude or the owner. Claude only for groups of 10 rows or fewer that the owner did not approve (existing rule); bigger or owner-approved groups are `owner_only` for Claude. Not in `OWNER_ONLY_UNDO` (it deletes nothing).
- `ai_list_recent_changes` adds `categories_from` and `categories_to` (lists) so the sentence can read "Claude changed Sol Ring from Ramp to Ramp, Good Stuff"; the client never builds its own text.

## 7. Sentences (for `change-sentences.ts`, Developer)
- One card: "Claude changed the categories of {card} in {deck} from {from list} to {to list}." (from empty: "from no category").
- Several: "Claude changed the categories of {n} cards in {deck}." with the list underneath.
- Pending: "Claude wants to change the categories of {n} cards in {deck}." Before/after deck counts are identical (nothing about size or sleeving changes); the card list shows from -> to.
- Group card in `change-groups.ts` by `group_id` like `deck_zone`.

## 8. Security
`p_user_id` from the verified token only; all functions service_role only, SECURITY DEFINER where they were; no new table, no new route. No tool path can set or clear the maybeboard marker, change quantity or copies. No delete anywhere. The kind is added to both CHECK constraints (the lists of allowed names). The existing `ai_submit_change` unknown-action guard keeps rejecting everything else.

## 9. Migration approach (why wrappers)
The live eight-kind functions are not copied. `_ai_plan`, `_ai_execute`, `_ai_undo_blocker`, `ai_undo_group` are renamed `*_v1` and a thin function with the old name handles `deck_category` and passes every other action straight to the `_v1` original. Because every group holds one action, undo can dispatch on the group's kind. Existing kinds therefore run exactly the code that is live now. Cost: one extra function layer, which a later tidy-up can fold in. `ai_list_recent_changes` is replaced in full (small, read only). Details and guard against running twice are in the draft header.

## 10. Test plan (Tester, throwaway user, never owner data)
Unit: schema (trim, 60 limit, 1 to 5 categories per slot, strict, no user id); tool-name snapshot includes `set_card_category`; gateway sends the payload shape in the types file; sentence snapshots; limits unchanged.
Live: 1 card applies and logs; 10 apply, 11 queue `over_ten`; 10 + 10 within 30 min queues `recent_total`; approve applies, approve after a slot moved to the maybeboard fails with nothing changed; `Maybeboard`/`maybeboard`/` Maybeboard ` refused inside a list; slot with `["Ramp","Maybeboard"]` refused; untouched columns (quantity, `copy_id`, ownership, `is_commander`, `command_zone_role`) identical before/after; a card with 2 categories saved and edited again; 6 categories refused; commander keeps its `Commander` entry when the request omits it; `Commander` refused on a non-commander; skip-if-same; undo restores a NULL and a two-category value exactly; undo refused after the owner edits the card's category by hand; Claude cannot undo an 11-row group; 8 old kinds still pass their existing live tests (regression, because four functions were wrapped); two submits racing on one deck; switch-off cancels a waiting category request.

## 11. Developer tasks (after owner applies the migration)
1. `set_card_category` input and handler in `tools/edit-tools.ts`, registered in `tools/index.ts`; payload mapping `slot_id` -> `id`, `name` -> `card_name`.
2. Add `'deck_category'` to `write-types` / gateway `ChangeAction`; sentences; grouping; pending-card from/to list.
3. Update the allow-list snapshot test and the TS/SQL limits test if touched.

## 12. Separate small note for the Developer: `add_cards_to_deck` must refuse `Maybeboard` (owner approved 2026-11-16)
Independent of the migration; can ship before it. Today `add_cards_to_deck` accepts `category: 'Maybeboard'` `[Confirmed: src/lib/connector/tools/edit-tools.ts lines 28 and 150]` and writes `["Maybeboard"]`, which would put a new slot on the maybeboard by a back door. Change: in the tool (zod refine, after trim) reject any category whose trimmed lower-case form is `maybeboard`, with a plain-words error telling Claude to use `set_card_zone`. Add a test for `Maybeboard`, `maybeboard` and ` Maybeboard `. Because the check is in the tool only, also note the SQL function `_ai_plan_v1` does not check it; if the owner wants it enforced in SQL too, that is a later small migration (not requested).
