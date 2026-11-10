# Report: t28-card-state-actions
Role: Architect
Status: DONE
Task as received: Task T-28: Produce the shared card-state/action contract from the owner-approved docs/oracle/plans/01-behaviour-and-actions.md and current decisions, using /Users/bradknewstubb/.copilot/session-state/4b576cd9-ef04-4761-858e-24689c8338ff/files/t28-brief.txt as the complete task scope. Cover the pick-list assembly journey, automatic generic-land coverage and original shortages that remain despite sleeved proxies, without application or database changes.
Done when: docs/oracle/contracts/card-state-actions.md, any justified companion types, and the required Architect completion report exist with source-backed rules, acceptance cases and explicit remaining gates; then stop without committing, merging, deploying or delegating.

## Summary for the owner
The exact rules for Sleeved/Unsleeved, the five availability labels, Draft/Assembling/Playable, the pick list, every card action and the original-shortage list are now written down, together with 22 test cases (including the full Sol Ring journey). Nothing in the app has changed yet. Before building can finish, you will need to answer a few questions:
- what "complete" means for Casual decks;
- whether retired-folder decks count toward shortages;
- what happens to cards previously marked missing.

## Changed files
- docs/oracle/contracts/card-state-actions.md — the shared behaviour contract: predicates, availability, readiness, pick list, actions, errors, refresh, shortages, import, Missing gate, generic-basic proposal, gaps, gates, acceptance matrix and UX hand-off.
- docs/oracle/contracts/card-state-actions.types.ts — shared request/response types and small reference functions for readiness, availability headline and shortage count. It is standalone with no imports, so it can move into `src/types` once approved.
- docs/oracle/reports/2026-09-29-architect-t28-card-state-actions.md — this report.

## New decisions made (need owner confirmation)
- **Proxy printing:** a new Proxy uses the printing the list requests when one is set (contract §7.2, G-M3). Today it always takes the newest printing, which silently switches printing.
- **Proxy is always offered** on an outstanding pick-list card, even when a free or other-deck copy exists. This follows Sol Ring step 4.
- **Cards marked missing before the retirement:**
  - Until G-D1 is decided, a card whose only copies are flagged shows **Unavailable** with a neutral "needs review" reason.
  - It is not shown as Unowned and never uses the word "Missing" (§3.3, §12).
  - Returning such a copy should record "location not recorded" rather than default storage, because default storage invents a location.
- **Casual decks** show no readiness badge until a rule is chosen (§5.3, G-O1). This is not a fourth state.
- **Shortage scope (interim):** every deck counts toward original shortages, whatever its folder or readiness (Q1).
- **"Commander selected"** means a main-list card flagged as commander, not just the deck's commander name field (§5.2).
- **Deck size counts card quantity, not list rows.** For example, one "Island ×36" entry counts as 36 (§2.2).
- **Choosing a printing on a generic basic** turns it into a tracked basic, which becomes Unsleeved (§4). The UI must state this before confirming.

## Assumptions
- Repository migrations reflect the deployed schema [Approximate]. There was no live access (brief).
- Latest RPC definitions are those in `supabase/migrations/20260925220000_placement_source.sql`, plus `20260926120000_import_maybeboard_relation.sql` and `20260926130000_exact_printing_import.sql` for import [Confirmed].
- "Move from" is always an explicit, confirmed owner action, so it uses the force-claim path. The `decks.allocate` flag does not change owner-facing behaviour.
- Existing decks created via `decks/create` or import carry `is_commander` rows [Approximate; not audited].

## Challenges to locked decisions
- none

## Open questions
- **G-O1:** What makes a Casual deck complete? (It has no size target today, so an empty Casual deck would otherwise be Playable.)
- **Q1:** Should decks in a retired folder, or Draft decks, count toward original shortages?
- **G-D1:** What should happen to each copy previously marked missing: keep it hidden, return it with its location marked not recorded, or delete it?
- **G-D2:** Existing basic-land entries that hold a tracked copy: should any be converted to generic? That releases the copy to storage.
- **G-D3:** Should list entries holding several copies of one tracked card (for example "Sol Ring ×2") be split into one entry per card?
- **Q4 (import spec):** should import treat copies with no recorded location as free, like the pick list does?
- **Migration gates G-M1 to G-M8** (contract §14.2) need Backend proposals and approval before deployment:
  - G-M1: expected-state checks; Sleeve must not take a copy from another deck;
  - G-M2: explicit Move-to target slot;
  - G-M3: proxy printing;
  - G-M4: SQL Maybeboard predicate;
  - G-M5: atomic Move to Maybeboard;
  - G-M6: general Change copy;
  - G-M7: Unsleeved + `new_cards` import, and no copies for generic basics;
  - G-M8: optional copy uniqueness index.
- **Visual approval** for the pick-list and shortage screens, and the O-006 milestone markers, remain separate.

### Security observation (S1)
The following routes use the admin client filtered only by deck id or row id, with no `user_id` ownership check [Confirmed]:
- `GET /api/decks/[id]/picklist` and `GET /api/decks/[id]/card-statuses` (reads);
- `PUT /api/decks/[id]/cards/[cardId]/categories` (**writes**).

Any signed-in user who knows ids could read another user's deck, or change its categories. This blocks the multi-user direction. Recommend that Backend fixes it in the implementation slice.

### Other confirmed code gaps (contract §14.1)
- The pick list includes Maybeboard rows, turns lookup failures into Unowned and ignores the requested printing.
- Supply lookups include missing-flagged copies.
- The pick list shows every copy as "Unsorted" because of a field-name mismatch.
- There is no Proxy available status.
- Only the destination deck refreshes after a move, and the transfer confirmation is skipped.
- Choose printing changes sleeved entries.
- The deck list counts rows instead of cards.
- `new_cards` import creates copies for generic basics, which contradicts D-032.

## Verification
- Traced every Plan 1 case to the acceptance matrix (A1–A22):
  - the Sol Ring journey (A1–A7);
  - an existing proxy versus a newly created one (A4–A6, A8);
  - a Playable proxy-heavy deck that still has an original shortfall (A4, A16);
  - 36 generic basics with no inventory (A11);
  - Maybeboard release (A12);
  - 99/101 cards or no commander (A9, A10);
  - failed lookups (A13, A14).
- `tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler docs/oracle/contracts/card-state-actions.types.ts` (TypeScript 5.9.3, installed in a temporary folder in the session workspace, outside the repository; repository config untouched) → exit 0, no errors.
- Compiled a temporary check script against the reference functions and ran it (outside the repository) → 22/22 pass:
  - readiness: A1, A2, A7, A9 ×2, A10, A11 ×2, A12, A20, Standard minimum;
  - availability: Available, Alt available, null-request, Unavailable, Proxy available, Unowned, error, excluded;
  - shortage counts: 1, 2 and 0.
- `git status` shows only the three new files above, plus the pre-existing input docs, which were left untouched. Nothing was committed, pushed, merged or deployed, and nothing was written to a database. No application code, migrations, specs, decisions, roadmap or status files were edited.

## UX hand-off: fields available for the pick-list prototype
- **Deck:** name, format, readiness (Draft / Assembling / Playable, or none for Casual), and progress (required cards, sleeved cards including generic basics, generic basics, outstanding cards). Also a load state (complete or partial) and the time the data was generated.
- **Each outstanding card:** name, commander flag, category, the requested printing (set, set name, collector number), and how many cards are still outstanding. It also has an availability label: Available, Alt available, Proxy available, Unavailable (with reasons and the holding decks), Unowned, or an explicit error.
- **Each option:**
  - whether it is an original or a proxy;
  - printing and finish, and whether it matches the requested printing;
  - where it is:
    - a named storage location;
    - a source deck, with that deck's readiness;
    - a recorded deck location with no deck holding the card;
    - location not recorded;
  - the action, Sleeve or Move from. Move from also shows the donor deck's readiness before and after.
- **Proxy action:** always present on every outstanding card.
- **Group by source:** group options by location type and name. Copies with no recorded location need their own explicit group.
