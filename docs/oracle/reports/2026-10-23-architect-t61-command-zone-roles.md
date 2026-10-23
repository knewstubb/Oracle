# Report: t61-command-zone-roles
Role: architect
Status: DONE
Task as received (original): T-61: owner approved N-6 from docs/oracle/contracts/import-formats.md / report 2026-10-23-architect-t59-import-formats.md: a Companion slot only (no full sideboard). Draft (do NOT apply) the migration for a nullable deck_cards.command_zone_role (partner / background / companion), with constraints (at most one companion per deck; companion never is_commander; partner/background rows are commanders), and write a short contract docs/oracle/contracts/command-zone-roles.md covering: how companion is excluded from the 100 count, colour identity and legality; how the deck page shows it beside the commander; how import (S-7 of import-formats.md) sets it; the commander picker changes; RPC/permission notes (no anon EXECUTE); and an ordered Developer slice list. Do not edit source, decisions.md, or apply anything to the DB. Standard report in docs/oracle/reports/. Save in small steps.
Follow-up received: Owner answer: removing a companion just removes it (with a confirmation), it does not go back to the main deck. Record that in the contract. Then draft the two follow-up migrations (set_deck_command_zone RPC; import_deck_with_intent accepting the role), service-role-only, no anon EXECUTE, DRAFT only, not applied. Also check the 'Companion' category assumption against the existing category-driven screens. Update your report.

## Summary for the owner
Removing a companion now simply removes it, after a confirmation, and this is written into the plan. I found that the app's card counts would have counted a companion as a normal deck card if it was labelled "Companion", so it will use the existing "not in the 100" label instead and every count keeps working as is. Nothing is applied yet; there are three small data changes waiting for your approval.

## Changed files
- docs/oracle/contracts/command-zone-roles.md — removal decision, category finding, RPC details, slice list updated
- supabase/migrations/20261023170000_deck_cards_command_zone_role.sql — DRAFT (column + constraints), unchanged
- supabase/migrations/20261023170100_set_deck_command_zone.sql — DRAFT, new; service_role only, no anon EXECUTE
- supabase/migrations/20261023170200_import_deck_with_intent_roles.sql — DRAFT, new; service_role only, no anon EXECUTE
- docs/oracle/reports/2026-10-23-architect-t61-command-zone-roles.md — this report

## New decisions made (need owner confirmation)
- Companion row's category is `["Sideboard"]`, not "Companion" (finding below). The role column is the real marker.
- Ordinary commander keeps a blank role; at most one partner-or-background per deck.
- Import role is added through a thin wrapper function, leaving the live import function untouched (deviation from "accepting the role" wording: lower risk, same effect).
- `set_deck_command_zone` takes deck_cards ids and never deletes; removing a companion goes through the existing remove-card path.

## Assumptions
- See contract §8.
- Wrapper matches the inserted row by deck + card name + role still blank + commander flag; a duplicate-name pair resolves lowest id first.

## Challenges to locked decisions
- D-018 (Sideboard imports go to the maybeboard): wording tension only. The `Sideboard` category stays unused by import and is reused here to mean "outside the 100" for the companion. If Gene prefers, add a distinct `Companion` category plus the exclusion sites listed in contract §2 instead. No change to D-018 itself is asked.

## Open questions
- OK to use the `Sideboard` category for the companion (recommended), or add a new `Companion` category to all the count sites?

## Category check (result)
Counts and grids are category-driven: they exclude only `Maybeboard` and `Sideboard` [Confirmed: src/app/decks/[id]/page.tsx 218-221; src/app/api/decks/route.ts 38-41, 147; src/app/api/decks/[id]/card-statuses/route.ts 90-93; src/components/AnalysisTab.tsx 53; src/components/CardGrid.tsx 142-143; src/components/CardsTab.tsx 506-511; src/components/StrategyTab.tsx 409]. A `Companion` category would be counted in the deck size and appear as its own group. The earlier assumption was wrong and is corrected.

## Verification
- Read the existing import RPC (grants, row keys, insert sites) and category filters in src — results above.
- Migrations only reviewed by reading; not executed or applied anywhere, so SQL syntax is unverified by a database.
