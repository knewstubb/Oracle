# Report: deck-category
Role: Architect
Status: DONE
Task as received: Owner approved: Claude (Oracle connector) must be able to change the category of cards already in a deck, including inventing NEW category names (owner will use it to categorise cards by deck archetype). Read the Developer's blocked report docs/oracle/reports/2026-11-16-developer-set-card-category.md, AGENTS.md, docs/oracle/process.md, docs/oracle/briefs/claude-connector.md and the existing connector contracts. Produce the contract and a migration DRAFT (follow how supabase/drafts/ is used; do not apply anything to the database) adding a ninth change kind (e.g. deck_category) to the write function and the approval/change-log tables: up to 10 slots apply immediately; more than 10 wait for owner approval; undo restores each card's previous category, refused if the deck changed since; must refuse to set/clear the 'Maybeboard' marker and never touch zones, quantities or copies; category names trimmed, max 60 chars (same as add_cards). Ignore tags. Write the contract to docs/oracle/contracts/ and a report to docs/oracle/reports/.

## Summary for the owner
Claude will be able to sort cards already in a deck into any category names, one name per card, with the same safety as its other edits: up to 10 cards go straight through, more wait for your yes, and everything can be undone for 7 days. It can never move a card to or from the Maybeboard. Nothing has been built or changed in the database yet; the database change is prepared and needs your approval to apply.

## Changed files
- docs/oracle/contracts/claude-connector-deck-category.md — the contract
- docs/oracle/contracts/claude-connector-deck-category.types.ts — reference types and error codes
- supabase/drafts/20261116190000_ai_deck_category.draft.sql — migration DRAFT, NOT applied
- supabase/drafts/20261116190000_ai_deck_category.rollback.sql — rollback, refuses to run once any category history exists
- docs/oracle/reports/2026-11-16-architect-deck-category.md — this report (updated)

## Update 2026-11-16 (owner answers applied)
- A card can hold up to 5 categories, replaced as a list, editable again any time. Max 5 is my proposal (owner to confirm).
- Commanders are allowed. The commander flags are separate columns and are never written. Commanders imported from Archidekt also carry a "Commander" entry inside their categories (a display group), so that entry is preserved automatically; the name "Commander" is refused on cards that are not commanders.
- Maybeboard: names refused in any letter case, Maybeboard cards refused. A separate small Developer note makes the "add cards" tool refuse Maybeboard too (contract section 12).

## Update 2 (owner answers)
- Max 5 categories per card confirmed.
- Names are matched, ignoring capital letters, to categories this deck already uses and stored with the deck's spelling. Where it is built: in the database (inside the plan step), not in the tool. The tool only trims and checks length; it must not match anything. Details and tie rules are in contract section 3a. The result of a dry run lists which names were respelled (`matched`).
- Tie rule I chose (owner to confirm): if a deck already has two spellings, the most used one wins.
- Rollback unchanged (it restores the original functions; no new objects were added).

## New decisions made (need owner confirmation)
- Max 5 categories per card.
- Cards already holding exactly that list are skipped, not an error.
- "Commander" is refused as a category name on cards that are not commanders (protects against making a card look like a commander).
- Undo is refused only when that same card's categories changed since, not for any change elsewhere in the deck.
- The migration wraps the four live functions (renamed `_v1`) rather than copying them.

## Assumptions
- [Approximate] Live database functions equal migrations 20261116150100 to 150300 (no live catalog read done; the draft refuses to run if the functions are missing, or if it was already applied).
- [Approximate] No trigger fires on a categories-only update of deck_cards (triggers found only on copy and identity columns: supabase/migrations/20260912170000..., 20261113100000...).
- CHECK constraint names are not assumed; the draft finds them by their text.
- Tags are out of scope as instructed.

## Challenges to locked decisions
- none

## Open questions
- none (5 confirmed; matching decided).

## Owner action needed
The migration is a DRAFT. The owner (or Gene with the owner's approval) must apply it; nothing is applied. Recommended: throwaway branch first, run the Tester's live checks incl. the regression of all eight existing kinds (four live functions are renamed), then live. Developer work is blocked until it is applied.

## Verification
- Read the live-applied migrations 150000/150100/150200/150300, slice-B contract and types, edit-tools.ts, get-deck.ts. No SQL was executed anywhere: no local Postgres, nothing applied. The draft has NOT been syntax-checked against a database; the throwaway-branch run is the first real test.
