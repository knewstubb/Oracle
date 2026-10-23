# Contract: Command-zone roles — Companion slot (T-61)

## Status
DRAFT for build. Owner approved N-6 (a Companion slot only, no full sideboard) on 2026-10-23.
Migration draft (not applied): `supabase/migrations/20261023170000_deck_cards_command_zone_role.sql`.
Extends `import-formats.md` §9 N-2 and slice S-7.

## 1. The model
One nullable column, `deck_cards.command_zone_role`: `partner | background | companion`.

| Row | `is_commander` | `command_zone_role` |
|---|---|---|
| Ordinary card | false | NULL |
| Primary commander | true | NULL (unchanged, no backfill) |
| Second commander (Partner) | true | `partner` |
| Second commander (Background) | true | `background` |
| Companion | **false** | `companion` |

Database rules (enforced by the migration, not just the UI): at most one companion per deck; a companion is never
`is_commander`; partner/background rows are always `is_commander`; at most one partner-or-background row per deck.
Existing code that reads `is_commander` keeps working unchanged `[Confirmed: legality/route.ts line 125 skips
colour check for is_commander rows; create/route.ts lines 79-103 already writes two commander rows]`.
The companion row is a real card: it can be owned, proxied and sleeved like any other (copy allocation unchanged).
`decks.commander_name` / `commander_scryfall_id` keep describing the primary commander only; the companion has no
column on `decks`.

## 2. Counting, colour identity, legality
- **The 100.** The companion is not one of the 100. Existing counts are **category-driven** and skip rows whose first category is `Maybeboard` or `Sideboard` `[Confirmed: src/app/decks/[id]/page.tsx 218-221; src/app/api/decks/route.ts 38-41, 147; src/app/api/decks/[id]/card-statuses/route.ts 90-93; src/components/AnalysisTab.tsx 53; src/components/CardGrid.tsx 142-143; src/components/CardsTab.tsx 506-511; src/components/StrategyTab.tsx 409]`. So the companion row is saved with category `["Sideboard"]` (A-2, checked): every existing count, analysis and grid already ignores it with no code change. A new category name like `Companion` would have been **counted** as a main-deck card and shown as its own group in those places. The role column stays the source of truth (`isCompanion(row)` = `command_zone_role = 'companion'`); new code checks the role, and the `Sideboard` category is the safety net. Commanders still count, as today. Shown as "100/100 + Companion". Maybeboard rules unchanged (D-018).
- **Colour identity.** Deck identity = union of `is_commander` rows only. A companion's colours are ignored. Its own identity is not checked against the commander, because the companion rule has none.
- **Legality.** Legality route (`/api/decks/[id]/legality`) treats the companion as outside the deck: not checked for the colour-identity rule, not counted for singleton/size. It still must be Commander-legal as a card. Companion eligibility (the Companion keyword) is checked in the picker only; the rule-specific deck restrictions of each companion are out of scope (show nothing, claim nothing).
- **Exports/versions.** Export lists the companion under a `Companion` heading. `deck_versions` snapshots and restore carry `command_zone_role` (snapshot JSON gains the key; old snapshots without it read as NULL).
- **Dead-weight, bulk actions, Cards tab** that currently skip `is_commander` rows (CardsTab lines 482, 1512) also skip the companion `[Confirmed: src/components/CardsTab.tsx]`.

## 3. Deck page
The commander area shows the commander (and partner/background) as today, with the Companion card beside them under
a small "Companion" label. It is visibly separate from the 100 and has an "×" to remove. **Owner decision
(2026-10-23): removing a companion just removes it from the deck, after a confirmation; it does not go back to the main
deck.** The removal uses the existing remove-card path (so any linked physical copy is released as for any removed card);
`set_deck_command_zone` never deletes (it raises `companion_must_be_removed_first`). Layout and wording belong to Designer; this contract fixes only the data rules above.

## 4. Import (S-7 of import-formats.md)
- `board='companion'` rows (Companion heading, `SB:` line the parser sees as a companion, E-22 retag) save with `command_zone_role='companion'`, `is_commander=false`, quantity 1; the saved category is `["Sideboard"]` (A-2), set by the wrapper RPC below.
- Rows from a Commander heading: first = `is_commander=true`, NULL role; second = `is_commander=true` with `partner` or `background` (background if the card has type Background, else partner).
- The picker pre-ticks them; the save only writes what the owner left ticked. More than one companion in a file: first is ticked, rest go to maybeboard with a note.
- Rows carry a new optional key `command_zone_role`. The live `import_deck_with_intent` is **left unchanged**; a thin wrapper `import_deck_with_intent_roles(p_deck_id, p_user_id, p_rows)` calls it and then sets the role on the rows it just inserted `[Draft: supabase/migrations/20261023170200_import_deck_with_intent_roles.sql]`. The import route calls the wrapper. Reason: the live function has eight INSERT sites; copying it would drift. Atomic: one transaction; a violated constraint ("two companions") or a row not found raises and rolls back the whole import, including the inner function's work. The route surfaces it as a plain error.

## 5. Commander picker changes
- Import review and deck page pickers become: Commander tick, optional second tick (Partner/Background), optional Companion tick.
- Second tick is refused with a plain reason unless the pair is legal: two Partner cards (or the same Partner variant), or one "Choose a Background" + one Background.
- New eligibility list: `/api/commanders/eligible` gains `?role=companion` returning cards with the Companion keyword; picker filters on it. Existing response unchanged when `role` is absent.
- Picking the commander never writes `companion`; picking a companion never sets `is_commander`.
- Changing roles is one atomic RPC (§6), not several client writes.

## 6. RPC and permissions
- New RPC `set_deck_command_zone(p_deck_id integer, p_user_id uuid, p_primary_card_id integer, p_second_card_id integer, p_second_role text, p_companion_card_id integer)` `[Draft: supabase/migrations/20261023170100_set_deck_command_zone.sql]`. It takes `deck_cards.id` values (the card must already be in the deck; the route adds it first with the existing add-card path), so no card identifier is passed (D-003 not engaged). One transaction: resets old commander/partner/background roles (never deletes rows), sets the new roles, moves the companion's category to `Sideboard`, rewrites `decks.commander_name/commander_scryfall_id`. Errors: `deck_not_found, card_not_in_deck, duplicate_card, invalid_second_role, second_without_primary, companion_must_be_removed_first`; on any failure nothing changes. Partner/Background pair legality needs card text, so the route checks it before calling; the table constraints are the backstop.
- `SECURITY DEFINER`, `SET search_path = public`, verifies the deck belongs to `p_user_id`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;` — **no anon EXECUTE**, same as `import_deck_with_intent` `[Confirmed: supabase/migrations/20261023160000_import_deck_with_intent.sql lines 403-404]`. Called only from the server route.
- No new table, policy or grant; the column inherits `deck_cards` RLS (user_id). Multi-user safe.
- Apply order: 170000 (column) → 170100 (set RPC) → 170200 (import wrapper). All three are drafts until the owner approves.

## 7. Developer slices (in order)
1. **Apply migration** (after owner approval) and regenerate `src/types/supabase.ts`. Test: companion + commander on one deck rejected; two companions rejected; companion with `is_commander=true` rejected; existing rows unaffected.
2. **Counting/identity/legality** — shared helper `isCompanion(row)`; update legality route, deck count, CardsTab skips, export, versions snapshot/restore, `deck-cards-diff` (carry the field so re-import does not wipe it). Unit tests per rule in §2.
3. **Apply `set_deck_command_zone`** (after approval) + route `PUT /api/decks/[id]/command-zone`; anon call denied test.
4. **Eligibility** `?role=companion` + companion/partner pair-legality helper (pure, unit-tested).
5. **Picker UI** on deck page and import review (with Designer spec) — three ticks, plain refusal reasons.
6. **Deck page display** of the companion beside the commander, with "100/100 + Companion".
7. **Import S-7**: parser `board='companion'` → rows with role; apply the `import_deck_with_intent_roles` wrapper and switch the import route to it; Arena fixture test; E-22 retag; remove the interim "companion kept in main list" note.

## 8. Assumptions
- A-1: ordinary commander stays NULL role (no `commander` value) to avoid backfilling and touching existing code.
- A-2 (checked, changed): companion `categories = ["Sideboard"]`, not `Companion`, because the existing count/grid code is category-driven (§2). `Sideboard` is already skipped everywhere; no full sideboard feature exists (owner: Companion slot only), so the name is free to mean "outside the 100". Needs owner/Gene OK because D-018 sends imported Sideboard cards to the maybeboard, not to this category.
- A-3: one partner-or-background per deck is enough (no Doctor's-companion/Friends-forever triples).

## 9. Open questions
- none (removal question answered: remove with confirmation).
