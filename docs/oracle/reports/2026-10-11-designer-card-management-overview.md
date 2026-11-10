# Report: card-management-overview
Role: Designer
Status: DONE
Task as received: "COuld you produce an accompanying document that describes the entire card management system of that app at this stage. Start at import"

## Summary for the owner
There is now a plain-language guide to how Oracle handles your cards today. It starts at import, then follows a card through your collection, binders and decks to Reconcile, and ends with a Sol Ring example. It also lists every place where today's app still differs from what you have agreed. You don't need to decide anything, but one item needs checking: what "Replace collection" does to cards that are sleeved in decks.

## Changed files
- docs/oracle/specs/card-management-system-overview.md — new current-state overview, owner-facing, with an agent sources appendix
- docs/oracle/specs/reconcile-original-shortages.md — added a context link to the overview

## New decisions made (need owner confirmation)
- None. The document describes what exists; it does not propose changes.

## Assumptions
- "Card management system" covers import, collection, storage, deck allocation, pick list, break down and Reconcile. Brewing/AI, ratings and debrief are out of scope.
- Claims tagged [Approximate] come from research summaries of the code and were not re-read line by line.

## Challenges to locked decisions
- none

## Open questions
- Developer/Architect: what does collection import in "replace" mode do to copies that are currently sleeved in a deck_cards slot (copy_id)? Not verified; the overview flags it as unchecked.
- docs/card-movement-reference.md (July) is outdated. Should Gene archive it or point it at the new overview?

## Verification
- Spot-checked these claims in code:
  - nav labels (Sidebar.tsx)
  - onboarding Brew/Active text
  - deck import option labels
  - CardSlotBadge labels
  - the "Sleeve from Active deck?" confirmation (StatusChipPopover.tsx)
  - reimport warning text
  - apply_deck_cards_diff raising assigned_row_in_diff for sleeved slots
  - Archidekt push 501
  - add-proxy taking the first printing
  - no UI caller for allocation/resolve
  - Graveyard still in StatusFilter/StatusBadge
  - the "Reconcile imported decks" heading
  - storage Unsorted tile
- Documentation only; no tests run.
