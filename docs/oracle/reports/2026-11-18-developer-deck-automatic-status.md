# Report: deck automatic status
Role: Developer
Status: DONE
Task as received: replace the manual "active / not active" concept on decks with an automatic three-state deck status (Draft, Assembling, Playable), across the Oracle app (full handoff in `.agents/tasks/oracle_app-deck-status-2026-11-18/plan.md` and the task message).

## Summary for the owner
Every deck now shows Draft (purple flask), Assembling (amber construction icon) or Playable (green tick) on its Decks page tile, worked out automatically from how many of its cards are sleeved. The Active/Inactive switch is gone from the deck page, and Claude now reports the same status and the same sleeved count as the tile. Nothing needs to change in the database. Several choices that change what you see are listed under "Open questions" and need your answer.

## Changed files
- `src/lib/deck-readiness.ts`: one status rule (none sleeved = Draft; all sleeved and right size = Playable; else Assembling), using the same "sleeved" check as the tile count and deck header.
- `src/lib/format-config.ts`: `deckTargetFor(format)` gives the target size and rule per format.
- `src/lib/deck-list-data.ts`: `computeDeckStatuses` and `fetchDeckStatuses` (for screens that show a status word).
- `src/lib/deck-status-label.ts` (new): status words and colours.
- `src/app/api/decks/route.ts`: returns the computed `status` with the first response (same rows already read, no extra query); no longer reads or orders by `is_active`.
- `src/components/DeckTile.tsx`, `src/app/page.tsx`: three badges with label and tooltip; one list (A to Z); the "N Active decks" subtitle is gone; green border only on Playable; the old amber/red completeness tiers are removed.
- `src/app/settings/components/page.tsx`: component gallery updated to the new `status` prop.
- `src/components/ActiveToggle.tsx`, `src/app/api/decks/[id]/active/route.ts`: deleted. `src/app/decks/[id]/page.tsx` no longer shows or types the toggle.
- Stopped writing `is_active`: `api/decks/create`, `api/brew/save` (both save modes still work), `api/brew/session`, `api/ai/brew/save`, `lib/deck-import.ts`, `lib/manabox-deck-import.ts`.
- `src/app/api/decks/[id]/move-here/route.ts`, `src/lib/import-destinations-list.ts`: use the new rule and the deck's own format, and leave out Maybeboard and Sideboard.
- Label sites: `CardLocator.tsx` and `api/cards/locate` ("Inactive" tag and active-first sort removed); `supply-pool.ts`, `api/collection/instances`, `api/allocation/valid-decks` (now return the computed status word); `PicklistV2.tsx`, `DeckPickerPopover.tsx`, `InstanceDetailPanel.tsx`, `StatusChipPopover.tsx` (a copy moves at once for every deck); `api/cards/builder-status`, `api/decks/[id]/card-actions`, `api/collection/printings` (stopped selecting or returning `is_active`); reconcile screens (`reconcile/page.tsx`, `ReconciliationNav.tsx`, `OverusedCardRow.tsx`: the "Active/Brew" line is removed).
- `src/lib/tool-registry.ts`: in-app chat `list_user_decks` lists every deck with its status (no more "You don't have any active decks").
- Connector: `tools/list-decks.ts`, `tools/get-deck.ts`, `tools/index.ts`, `tools/list-deck-cards-by-ownership.ts`. `status` is the computed word; `sleevedCount` uses the shared rule (maybeboard and sideboard excluded, generic basics counted); `isActive`, `activeNote` and `readiness` are removed; descriptions are rewritten (including `create_deck`: "starts as a Draft"). `include_inactive` is still accepted and ignored.
- `docs/oracle/contracts/claude-connector-slice-a.types.ts`: `DeckSummary` matches. This type file is imported by the connector and is Architect-owned; the edit was needed to keep the code compiling.
- `docs/oracle/specs/vocabulary.md`: new section 3.4 Deck status, updated rows, questions 2 and 3 marked answered.
- `docs/oracle/test-plan-2026-11-17.md`: data summary line, Part G step 4, new Part A0 (status badges, no toggle). This file is untracked in the main checkout. It was edited there and a copy is committed here so the review can see it. If you commit your own copy later, expect a duplicate-add conflict; keep either.
- `scripts/check-deck-status-readonly.ts` (new): read-only check (select only).
- Tests: new `src/lib/deck-readiness.test.ts`, `src/lib/no-active-control.test.ts`, `src/lib/connector/__tests__/deck-status-wording.test.ts`; updated `generic-basics.test.ts`, `DeckTile.test.tsx`, `api/decks/route.test.ts`, `connector/__tests__/tools.test.ts`, `ownership.test.ts`, `bracket.test.ts`, `__tests__/deck-import-integration.test.ts`.

## New decisions made (need owner confirmation)
- Other formats are Playable when every counted card is sleeved and the list meets the format size: exactly the target (Commander), at least the target where the format has a minimum (60 for Standard, Modern and the like), any non-empty list for Casual. Your wording was "equals the target"; the difference is a 61-card Standard deck.
- Decks page order is A to Z (it was effectively A to Z because nothing was active).
- A tile border is green only when Playable; Draft and Assembling tiles stay slightly dimmed.
- Status is computed when read, not stored.

## Assumptions
- A Commander companion sits in the list as a card, so a deck with a companion has 101 counted cards and cannot be Playable (the tile count already works this way).
- `decks.is_active` and `decks.status` stay in the database, unused by the app apart from the readers named in Open questions 2.

## Challenges to locked decisions
- D-002: its rule changes. Draft and Assembling now depend on how many cards are sleeved (not on list length), and more than 100 cards is never Playable. The Casual and generic-basics (D-032) clauses are kept. Evidence: owner decision 2026-11-18. Suggested change: restate D-002 with the rule in vocabulary.md section 3.4.
- D-059: "Unowned cards / Assembling / Playable" and the "Use proxies" plan are replaced by Draft / Assembling / Playable.
- D-043: "all three states stay calm grey" and the sort order Playable, Assembling, Draft are replaced by three coloured icons; the order is A to Z for now.
- D-031: its sentence "a complete unsleeved list is Assembling" no longer holds (it is Draft). The Sleeved/Unsleeved import choice is untouched.
- D-012 / D-013: still satisfied (icon plus word on every badge; hues outside WUBRG). D-029, D-032, D-037: unchanged.

## Open questions
Behaviour that changes or stays odd for you. Recommendation first.
1. **Most decks now show Playable.** The read-only check shows 12 of 22 decks as Playable (exactly 100 cards, all sleeved), 6 Assembling and 4 Draft. Before, every tile showed the flask. This follows from the rule. Is that what you expect?
2. **Collection "Allocation" numbers.** `allocation-rollup.ts` still counts demand only from decks with `is_active = true`. No deck has that, so demand and shortfall are zero for every card. Recommend counting every deck (D-029 says all decks count equally), which would show real numbers for the first time. Left unchanged until you answer. This file and the reconciliation database functions (which still return an unused `isActive`) are the only remaining readers of the old flag.
3. **Taking a card from another deck.** The app never asks for confirmation today (no deck is active), so a copy moves at once. I kept that for every deck. Alternative: ask only when the donor deck is Playable.
4. **Onboarding "Brew / Active" choice per imported deck** (`src/app/onboarding/page.tsx`). It looks like a control that marks a deck active, but it decides whether the import sleeves a copy for every card. Left as is, because removing it would change import behaviour. Recommend renaming it "Sleeved / Not sleeved yet" (the D-031 wording). Needs your decision.
5. **Reconcile screens** no longer show "Active" or "Brew" under each deck. Alternative: show the new status word (needs a small lookup).
6. **Wording that changes because the rule changed.** The Import destination picker and the "now Assembling" notice use the same rule. A 100-card deck with nothing sleeved now reads Draft (was Assembling). A deck with 40 sleeved of 60 listed reads Assembling (was Draft).
7. **Companion cards** (see Assumptions). Recommend a separate fix to exclude the companion everywhere if you use companions.
8. **Playable first?** Should Playable decks sort first on the Decks page?
9. **Deck page header** shows no status word now. Do you want one?
10. **Assembling colour** is amber (the existing warning colour), the same hue as the unresolved-conflicts badge at the top-left of the tile. Prefer another colour?
- Left for later, not edited: dead legacy components (`StatusControl`, `StatusBadge`, `/api/decks/[id]/status`); the now-unreachable "Sleeve from Active deck?" dialog code in `StatusChipPopover` and the reassign dialog in `InstanceDetailPanel`; docs that mention the flag (`specs/know-where-cards-are.md`, `contracts/*.md`, `roadmap.md`, `status.md`, `decisions.md`).

## Database
No database change, so there is no draft in `supabase/drafts/`, no rollback and no throwaway-database test. The owner must run nothing. The app can be deployed before or after anything else, because the old and new app both work with the current database. An optional later cleanup (drop `decks.is_active` and `decks.status`) would need its own approval, after `allocation-rollup.ts` and the reconciliation functions stop reading them. Not drafted.

## Verification
- `npm ci`, then `npm test` before changes: 2 failures (ImportIntentFlow env flag, connector description test), both known.
- `npm run check` after changes: 297 test files passed, 2 failed (the same two known tests); 3573 tests passed.
- `npm run typecheck`: only the known AddToPicklist.test.tsx errors (TIDY). `npm run lint`: only the 2 existing errors (storage page link, `prefer-const` in `list-decks.ts`); no new errors.
- New tests: deck-readiness (Commander 0 = Draft, 14/100 = Assembling, 100/100 = Playable, 101 and 99 = Assembling, maybeboard excluded, generic basics, Standard 59/60/61, Casual), tile badges and labels (`DeckTile.test.tsx`), `no-active-control.test.ts`, connector wording and data tests, `api/decks/route.test.ts` status tests.
- Read-only check on the real database: `ENV_FILE=/Users/bradknewstubb/Developer/Personal/oracle_app/.env.local npx tsx scripts/check-deck-status-readonly.ts` checked 22 decks (the 19 locked decks plus TEST A, TEST C and the fixture): 0 disagreements between status and "(N sleeved)". Only `select` calls were made; nothing was written.
