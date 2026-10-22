# Contract: deck import intent (I bought it / I built it / I'm planning it)

Author: Architect, 2026-10-23. Status: **DRAFT for owner approval of the two database changes in §6; no code, nothing applied.**
Spec: `specs/import-intent.md` (rev 3, owner-approved; Designer is adding only one-line intent descriptions). Mockup: `mockups/import-intent.html`.
Types: `contracts/import-intent.types.ts`. Builds on `contracts/import-row-editing.md` (+ `.types.ts`), `contracts/generic-basic-lands.md`, `contracts/manabox-import.md`.
Brief: `briefs/import-cleanup.md` (slice 5 is replaced by this; slice 6 and P1 feed into it).

## 0. What this contract does, in one paragraph
A deck import first asks what the deck is. That choice only sets each card's starting state. The review then shows, per card, whether the owner has it, whether it is free or sleeved in another deck, and lets the owner confirm. Saving is one all-or-nothing database call that adds, sleeves, moves and records alerts. Files, pasted lists, links and precons all produce the same review rows, so there is one review and one save path.

## 1. What exists today (confirmed, 2026-10-23)
- **Save path (new):** `importManaBoxDeck` in `src/lib/manabox-deck-import.ts` creates one deck row, upserts `user_cards`, then calls RPC `replace_deck_with_new_cards` (latest body `supabase/migrations/20261021130000_generic_basics_rpcs.sql`, one transaction, takes per-copy advisory locks `collection-copy:<id>`). One RPC row = one copy/slot. It **only creates copies**. Types per copy: Original / Proxy / Unsleeved (no copy; slot `copy_id = NULL`). Generic basics: `is_generic`, `generic_sleeved`. [Confirmed: those files]
- **Preview:** `/api/decks/import/preview` accepts ManaBox CSV/text only (and a legacy URL branch) and builds review rows with `buildDeckPreview` (`src/lib/manabox-import.ts`). `ImportRow`/`ImportCopy`/`copyEdits` are in `import-row-editing.types.ts`. The review is `src/components/manabox-import/ManaBoxDeckImportFlow.tsx`.
- **Existing move machinery to reuse, not rewrite:** `_move_copy_to_slot`, `reassign_to_deck`, `undo_copy_move`, `release_deck_copies` in `20260912150000_atomic_collection_movements.sql`. They use the same advisory lock names and release semantics (the old slot becomes a planned slot; the copy is never deleted).
- **Identity trigger** `validate_deck_card_copy_identity` checks **oracle id** only when a copy is linked to a slot, so a different printing of the same card can be sleeved [Confirmed: `20260916065913_…`]. No unique constraint on `deck_cards.copy_id` was found; "one copy in at most one deck" is kept by the movement functions, so the import must keep to it [Approximate].
- **Free copy**, defined here: a `user_copies` row for this user, not `missing`, and not referenced by any `deck_cards.copy_id`. (A copy in a binder/box is free.)
- **Alert pattern:** the decklist already has dismissible per-card flags (`dead_weight_flag`, route `/api/decks/[id]/dead-weight/dismiss`). **Do not copy that route's auth**: it reads the deck without a `user_id` filter while using the service role. New routes filter by `user_id`.
- **Not existing:** ownership lookup for an import, an Add tick, moves during import, alerts for skipped moves, a link/precon adapter into the review.

## 2. Intents and per-card starting state

Intent is a body field (`intent`) chosen once on the first screen; it never changes on the review. Source (`file | paste | link | precon`) is informational; only the intent sets defaults. Precon presets `purchased`.

| Intent | add | Type | Sleeved? | Matching used? |
|---|---|---|---|---|
| purchased | true | original | new copy sleeved, exact printing | No (not until the owner unticks Add on a card) |
| built | false | by match (original, or proxy if that is the only free copy) | owned copy sleeved; else move prompt; else printing choice; else unsleeved | Yes, for every non-generic card |
| planned | false | unsleeved | nothing sleeved, nothing added | Display only (Owned / Unowned) |

- **Generic basics** (a basic line naming no printing; `printingGiven === false`): never matched, never added, no Add tick. `generic_sleeved = true` for purchased and built, `false` for planned. Ordinary basic lines that name a printing behave like any other card.
- **Commander** is a card like any other; the commander selector is unchanged (D-052 superseded by the selector spec).
- **Partly new, partly owned:** the owner picks purchased or built and changes per-card ticks. There is no fourth intent.
- Precon: `GET /api/precons?q=` and `GET /api/precons/[id]` return the stored list; the client builds a ManaBox CSV and calls the same preview (brief §6a, slice P1). Every card carries set + collector number + finish, so no printing choice or matching is needed. Intent starts as purchased and, per the spec, the first screen is skipped.
- Link: the preview route accepts `{ url }`, fetches via the existing Archidekt/Moxfield clients and returns the **same `ManaBoxPreviewResponse`** as a file. Adapter: `normalizedDeckToPreview(deck)` (new, pure) producing rows with `rowKey = ${scryfallId}|link` and `copies` with empty `file` values; the source's own Proxy flag is ignored (D-045); finish only if the source states it. Commander comes from the source and preselects the commander selector. **Maybeboard/sideboard:** not shown in the review (the Designer has not decided, D-018/D-022); the adapter drops them and the preview carries a counted notice "{n} maybeboard cards weren't imported". Developer must not invent a place for them.

## 3. Ownership matching: what the review needs

**One read-only endpoint.** `POST /api/decks/import/ownership` (auth required; `userId` from the session; never writes; no copy ids in the response). Body and response: `OwnershipRequest` / `OwnershipResponse` in the types file. Per row it returns:
- `free`: groups of free copies by (printing, finish, proxy) with counts;
- `held`: groups of copies sleeved in other decks by (deck, printing, finish, proxy) with counts. Missing copies appear in neither.

Rules: batch by oracle id (two queries total: copies by oracle ids, then holders joined to deck names); cap at 1 000 rows per request; response reflects the moment of the request.
**When it is called:** after the preview, for built and planned, with the loading state "Checking your collection…"; for purchased, lazily the first time the owner unticks Add on any card or uses the bulk Add control. Failure: one amber line with **Try again**; for built, untouched cards stay Unsleeved, nothing is sleeved from a guess (spec §9).

**Matching function** `allocateOwnedCopies(rows, facts, edits)` (pure, shared by browser and server so the preview equals the save). For each row, copies in index order; one owned copy is used once per import; rows processed in `sourceIndex` order. For a copy that needs a source (built, or purchased with Add unticked, or an owner ticked-off Add):
1. **Free, exact printing**: prefer same finish, then any finish; original before proxy. → `sleeve_owned`.
2. **Free, other printing** → `needs_choice_printing` until the owner picks (§4). If the owner picks *Use my CMM 410*, step 1 runs on that printing.
3. **Held elsewhere, exact printing** → move (§4). One holder deck: pre-selected. Several: none selected → `needs_choice_move`.
4. **Held elsewhere, other printing** → `needs_choice_printing`; after "Use my…", step 3 applies on that printing.
5. Nothing owned → `unowned` (planned slot).
Order is free-before-held on purpose: a free copy is used before another deck is disturbed. Assumption; reversible, see report.
A held copy of any type (original or proxy) can be the source of a move; an original is chosen first. A move takes at most one copy per copy index.
**Worked example:** the deck lists Command Tower CLB 351. The owner holds CMM 410 free. Facts: `free = [{CMM,410,original,1}]`. Result: `needs_choice_printing` with `ownedPrinting = CMM 410`. "Use my CMM 410" → `sleeve_owned`, slot `scryfall_id` = CMM 410 (the deck shows what was really sleeved). "Add this printing" → `add = true`, `add_sleeved` with CLB 351; the CMM 410 copy is untouched.

## 4. Per-copy states and how the controls correct each other

`resolveCopyPlan(copy, row, intent, facts, edits, allocation)` returns a `CopyPlan` (types file). Add ✓ always wins first:

| Add | Type chosen | Plan |
|---|---|---|
| ✓ | original / proxy | `add_sleeved` (new copy; type as chosen; finish/condition/language from row editing) |
| ✓ | unsleeved | `add_unsleeved` (new original added, slot planned; "Added, not sleeved") |
| ✗ | original / proxy | whatever §3 returns for that copy: `sleeve_owned` / `move` / `move_skipped` / `needs_choice_*` / else not allowed (see below) |
| ✗ | unsleeved | `owned_unsleeved` if any copy owned (free or held), else `unowned` |

**Consistency rules** (client coerces; server re-applies the same pure function, never trusts the tick):
- `canOriginal` / `canProxy` are enabled for Add ✗ only if a matching free (or held, for original) copy of that kind exists in the allocation. A proxy source is used only when proxy is the kind chosen or the only free kind: if only a free proxy exists, the copy resolves to `sleeve_owned` with `type = proxy`.
- Ticking Add on an Unsleeved copy sets type original. Unticking Add on a copy with no source sets type unsleeved.
- **A card not owned cannot be sleeved unless Add is ticked.** The server enforces it: an `original`/`proxy` copy with Add ✗ and no source at save becomes `unowned`/planned and is listed in `needsALook`, never a phantom copy.
- Move chosen: `{ kind: 'move', fromDeckId }` (owner picks; one holder = preset). The server checks `fromDeckId` is one of the user's decks that holds a copy of that oracle card.
- Skip: `{ kind: 'skip' }` → `move_skipped`: a **new** copy is added and sleeved here (as `add_sleeved`, original, defaults from the bar), nothing moves, and every holder deck that had a candidate copy gets an alert (§5). With several holder decks and Skip, all holders are alerted (Q1 in the report; recommended).
- Printing choice `use_mine` / `add_this` as §3. `add_this` implies Add ✓.
- Multi-copy rows: each copy index is independent (e.g. 3 Mountain, 2 owned free: copies 1–2 `sleeve_owned`, copy 3 `unowned`/`owned_unsleeved` by type).
- Owned-copy values: a sleeved or moved copy **keeps its own finish, condition, language**. The defaults bar and row editor apply to **new** copies only. The slot's `requested_finish` is the row's finish (D-041); a finish mismatch with an owned copy is not blocking.
- Bulk bar: Add tick (mixed), type, finish/condition/language apply per copy through the same functions; "Applied to {a} of {b} copies." where a copy cannot take the change.

## 5. Save semantics

**Import is the source of truth.** The saved deck equals the review, with exactly these side effects on the collection: new copies added, existing free copies linked, existing held copies re-linked (moved). **Nothing is ever deleted** (AGENTS rule 5): a move changes which deck holds a copy; the old deck's slot stays as a planned (unsleeved) slot, exactly as `release_deck_copies` leaves it. Each move is owner-confirmed on the review.

**One RPC, `import_deck_with_intent(p_deck_id, p_user_id, p_rows jsonb)`** (new; `replace_deck_with_new_cards` stays unchanged until the legacy callers are deleted by cleanup slice 6). Route order: auth → validate body → create deck → upsert `user_cards` → **server recomputes ownership and runs `allocateOwnedCopies`/`resolveCopyPlan`** (client plan is advisory only) → one RPC call. Inside the RPC, one transaction:
1. Lock the deck; take advisory locks `collection-copy:<id>` for every involved copy in ascending id order (same names as the movement functions, so concurrent edits serialise).
2. For each row by `action`: `add_sleeved` / `add_unsleeved` as today (insert copy; link or leave planned); `sleeve_owned`: re-verify the copy is the user's, free, not missing; link it; slot printing = copy's printing; `placement_source = 'import'`; `move`: re-verify the copy is held in `from_deck_id`; unlink it there (slot stays planned, `placement_source`/`ownership_status` cleared as `release_deck_copies` does), link it here (reuse the `_move_copy_to_slot` semantics incl. its undo record); `move_skipped`: add as `add_sleeved`, then insert alert rows (below); `planned`/`generic`: as today.
3. **A copy that is no longer valid at lock time** (taken by another deck since the preview, or no longer in `from_deck_id`) is **not** an error: that one slot is saved planned/unsleeved and returned in `needs_a_look` (spec §9). Nothing is sleeved from a guess.
4. Any other failure rolls everything back, **including all moves and alerts**. The route may remove the empty deck row it created in this same request only if the deck has zero slots (owner nod needed; today an empty deck can remain, §8 of the row-editing contract).
Only `add_*` copies are inserted; the RPC never deletes `user_copies` or `deck_cards` of other decks.
Validation (route, before any write): `intent` enum; `copyEdits` indexes < qty; `move.fromDeckId` is the user's; `printing` only where a printing mismatch exists; total new copies ≤ `MAX_IMPORT_COPIES`; a `needs_choice_*` plan anywhere → 400 `needs_choice` listing the rowKeys (the UI blocks Import, this is the backstop).
Idempotence: unchanged (D-050): importing a purchased list twice adds twice. Built/planned add nothing by default, so a repeat adds nothing, but a repeated *move* is a no-op because the copy is already here.

**Alerts (skipped moves).** Table `deck_card_alerts` (DRAFT: `contracts/drafts/DRAFT_20261023140000_deck_card_alerts.sql`): `deck_id`, `deck_card_id` (the other deck's slot still holding the copy), `copy_id`, `card_name`, `caused_by_deck_id`, `status open|fixed|dismissed`, `created_at`, `resolved_at`. One open alert per slot (unique partial index). Created inside the RPC for each `move_skipped` copy and each holder deck. Alerts survive until resolved; the decklist shows **⚠ Accounting error** with "{Card} was sleeved into {deck} without moving this copy." and **Fixed** / **Dismiss**.
- `GET /api/decks/[id]/import-alerts` → `{ alerts: ImportAlert[] }`, open only, deck and alert both filtered by `user_id`. Read-time rule: an alert whose `copy_id` is no longer in that slot is treated as fixed and omitted (and may be closed lazily as `fixed`), so the owner is not nagged about something already corrected.
- `POST /api/decks/[id]/import-alerts/[alertId]` `{ action: 'fixed' | 'dismissed' }` → sets status and `resolved_at`; idempotent; 404 if the alert is not the user's.
- "Fixed" is the owner's statement; the app does not verify the physical cards.

## 6. Generic basics and the 100-card / sleeved status
- Generics create no copy, no Add, never move, never alert, never need ownership (generic-basic-lands contract §3). Under planned `generic_sleeved = false`; otherwise true.
- Status is derived from slots, so nothing new is stored: a generic counts toward the 100 always and toward "sleeved N/100" only when `generic_sleeved`. A planned import with 100 cards is therefore **Assembling**, not Playable, until sleeved (generic-basic-lands §45, §100).
- `add_unsleeved` copies and moves change counts only through their slots: moved-in = sleeved here, planned in the donor deck. The donor's sleeved count drops by one; the alert is the visible signal when the owner chooses Skip.
- Over-allocation cannot arise from import: no copy is linked to two slots (§5 step 2 verifies under lock).

## 7. Migrations (DRAFT; nothing applied)
| # | File | What | Owner approval |
|---|---|---|---|
| M1 | `contracts/drafts/DRAFT_20261023140000_deck_card_alerts.sql` (written) | New table `deck_card_alerts` + 2 indexes + owner-read policy. Additive, reversible (drop the table; it holds only alerts). | **Yes, before it is moved to `supabase/migrations/` and applied** |
| M2 | `import_deck_with_intent` (Developer drafts to §5, as `DRAFT_…_import_deck_with_intent.sql`; Architect reviews) | New function; moves copies between decks (relinks `deck_cards.copy_id`, nothing deleted). `CREATE OR REPLACE` only, service-role grant, `SECURITY DEFINER`, `search_path=public`, same checks as `replace_deck_with_new_cards` (deck and every copy belong to `p_user_id`). | **Yes: it re-points existing copies** |
| (P1) | `ref_precons` card-list column (brief §6a) | Separate, already pending approval. | Yes |
No change to `user_copies`, `deck_cards`, `user_cards` columns. **Apply order:** M1 then M2, both before slice S4. Deploy order matters: unknown JSON keys are ignored by the old function, so a code release that sends `action: move` before M2 would quietly save planned slots; add the read-back test (§9) so a missing migration fails loudly.

## 8. Functions (new `src/lib/import-intent.ts`; pure, no database)
`defaultsForIntent(intent)` · `allocateOwnedCopies(rows, facts, edits)` · `resolveCopyPlan(...)` · `coerceIntentEdit(copy, change)` (the §4 consistency rules; client) · `summariseImportPlan(plans)` · `needsChoice(plans)` · `normalizedDeckToPreview(deck)` (links). Server and browser import the same module so preview = save.

## 9. Tests required
Unit (no DB): each defaults row; matching order (§3 steps 1–5) incl. finish preference, shared copies across rows in import order, 3 Mountain/2 owned, held-in-one vs several decks, printing mismatch for free and held; every consistency rule; Add on generic is ignored; summary counts add up to total; summary text omits zeros and shows "Nothing added to your collection"; link adapter (Proxy flag ignored, maybeboard counted not imported); validation rejects foreign deck id, bad index, `needs_choice`.
Route (fake client): ownership endpoint returns no copy ids and no other user's rows; save recomputes ownership and ignores a forged client plan; copy no longer free → saved planned + `needsALook`; alert routes 404 for another user's alert.
Database (test account only): atomicity (force a failure on the last row: no copy linked, no move, no alert); a move relinks and leaves the donor slot planned; Skip creates one new copy + one alert per holder deck; concurrent import taking the same free copy; never deletes `user_copies`.
Read-back test: M2 present (importing a `move` row on the test account relinks, does not silently plan).

## 10. Developer task order (small slices; each ships alone)
**Test account:** does not exist yet. Until it does, DB tests and any Tester "save" check are **marked UNTESTED**, not guessed; slices S1–S3 need no saving.

| Slice | Work | Tester check (preview-only unless noted) |
|---|---|---|
| S1 | Types + §8 pure functions + unit tests. No UI. | One-command check passes. |
| S2 | First screen (intent cards, heading, "Choose one…" errors), intent in state, precon preset; **purchased = today's save**. Built/planned save only as today for now (disabled with note) or hidden until S4. | Each source tab shows the intent step; file held until chosen; purchased imports as before (preview; save on test account when it exists). |
| S3 | Ownership endpoint + facts in review for built/planned: tags (Owned copy / Unowned / Choose printing), loading and failure states, summary line. **Display only.** | Preview a list containing owned, unowned, other-printing and held cards on the test account (read-only); failure path by blocking the call. |
| S4 | Add tick + intent defaults + save for add/sleeve_owned/planned/generic via M1+M2 (**owner approvals first**). No moves yet: held cards save planned with "Needs a look"/not offered. | Test account: purchased, built and planned each, compare saved deck with the summary; no extra copies; collection counts. |
| S5 | Move row and printing row on the review; moves in the RPC. | Test account: move from one deck; several decks; copy taken between preview and save → "Needs a look"; donor slot planned, nothing deleted. |
| S6 | Skip path + alerts (M1 in use): decklist alert, Fixed/Dismiss, routes. | Test account: Skip → new copy + alert on donor deck; Fixed and Dismiss persist; alert closes itself when the copy is moved by hand. |
| S7 | Links via adapter into the review (cleanup slice 6): then delete the three-choice screen and `new_cards`/`built` modes. | Link import end to end on the test account; File/Paste unchanged; old screen gone. |
| S8 | Result screen counts + "Needs a look" list. | Counts match the summary; read aloud text. |
P1 (Precon tab) can ship after S2 and does not depend on S3–S8.

## 11. Locked decisions touched (proposed wording for Gene; applied only after owner approval)
| ID | Conflict | Proposed wording |
|---|---|---|
| **D-020** | "Import does not run an automatic allocation pass." I built it now sleeves owned copies at import. | "Import never sleeves or moves a copy the owner has not seen: sleeving owned copies and moving copies between decks happen only as per-card results on the review (pre-set by intent, editable) and are saved only when the owner presses Import deck. Slots with no chosen copy stay planned." |
| **D-047** | "Default Original… Existing owned copies are never pulled in automatically." | Replace: "A deck import starts from what the deck is: I bought it (Add ✓, Original), I built it (owned copies sleeved, nothing added), I'm planning it (all Unsleeved). Each card is then Original, Proxy or Unsleeved with an Add to collection tick. A copy sleeved in another deck moves only when the owner picks the deck; Skip adds a new sleeved copy and leaves an alert on the other deck." |
| **D-045** | "Defaulting to Original" | Scope "default Original" to collection import and the I bought it intent. Proxy column still ignored. |
| **D-021** | "Exact printing when possible." | Add: "On import an owned copy of a different printing is used only after the owner chooses Use my {printing}." |
| **D-031** | Superseded earlier. | Mark superseded by D-047 (this). |
| **D-044** | Silent on links. | Add: "Pasted links and precons feed the same review and intent choice as files." |
| **D-050** | "Collection import only adds." | No change (collection unchanged). Note: purchased imports twice add twice. |
| **D-052** | Commander picker after import. | Mark superseded by the commander selector spec. |
| **D-018 / D-022** | Maybeboard on link imports. | Hold: Designer to decide where maybeboard cards go in the review. |
| **D-025** | Placement Sleeved/Unsleeved; Original/Proxy a copy type. | Consistent. Add: a moved copy's old slot becomes Unsleeved in the donor deck. |
| **D-001, D-003** | — | Consistent (one row per copy; printing vs oracle ids kept apart). |
| **Rule 5 (AGENTS)** | A move re-points a copy. | It deletes nothing and each move is owner-confirmed; stated so no one reads D-020's rewording as permission for silent moves. |

## 12. Open for the owner (only what is truly needed)
**Q1. Skip when the card is in several other decks:** which decks show the alert?
- **(Recommended) a)** All of them (each holds a copy that could have been the one); each alert can be dismissed on its own.
- b) None unless you pick a deck (then Skip is not offered without a deck).
- c) Only the deck the review lists first.
