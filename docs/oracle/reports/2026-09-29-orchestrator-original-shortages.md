# Report: original-shortages
Role: Orchestrator
Status: DONE
Task as received: The shortage list is focused on owned cards. I want to see if I'm playing with a large number of proxies and should look to buy a new original copy

## Summary for the owner
The plans now treat the shortage list as a way to identify originals worth obtaining, not a measure of whether decks can be played. Proxies do not remove an original shortfall, and proxy-filled slots remain visible even in Playable decks. The previous shortage-counting question is resolved; no application behaviour changed.

## Changed files
- `docs/oracle/decisions.md` - clarified D-027's original-only supply and inclusion of proxy-filled requirements; made D-032's generic-land demand exclusion explicit.
- `docs/oracle/plans/01-behaviour-and-actions.md` - replaced the unresolved question with the agreed distinction between assembly and original-copy purchasing needs.
- `docs/oracle/plans/02-components-and-screens.md` - replaced the free-copy-only demand example with original ownership, proxy usage and additional-original shortfall examples.
- `docs/oracle/status.md` - resolved O-009 and returned T-29 to TODO, still dependent on the shared contract.
- `docs/oracle/reports/2026-09-29-orchestrator-original-shortages.md` - this report.

## Clarification recorded

The list answers "Which additional originals would reduce my reliance on proxies?" The pick list answers "Where are the physical cards I need to assemble this deck?"

Consequences:
- An owned proxy is still a Proxy, not original supply.
- A Sleeved proxy can make a deck Playable while leaving an original-copy shortfall.
- A free proxy likewise does not cancel an original shortfall.
- Count requirements currently filled by proxies, rather than only Unsleeved slots.
- Distinguish proxies actually being played from spare proxies in storage.
- Account for suitable originals already owned before suggesting additional copies. Do not assume every proxy in use requires a new purchase.
- No automatic purchase, transfer, unsleeve or proxy replacement follows from appearing in the list.
- Generic basics remain automatically covered and excluded from original-shortage demand. Maybeboard remains outside required deck demand.

Examples now in the plans:

| Deck requirements | Owned originals | Proxies sleeved | Additional originals needed |
|---|---|---|---|
| Two copies | One, sleeved in one deck | One, sleeved in the other | One; both decks may already be Playable. |
| Two copies | None | Two | Two. |
| Two copies | One usable original free in storage | Two | One, not two; an existing original can already replace one proxy. |

When enough suitable originals are owned, the purchase shortfall clears without silently replacing any proxy. Detailed printing/finish matching still needs the Architect's contract so alternate owned originals are identified without silently changing assigned copies.

## New decisions made (need owner confirmation)
- No independent product decisions enacted: D-027 records the owner's answer to the previously blocking original/proxy question.
- "Original shortages" is a proposed screen title, and the display columns/sort remain for the UX mockup.

## Assumptions
- "Owned cards" in this clarification refers to original ownership versus proxy usage, not a prohibition on showing a proxy-used card when zero originals are owned.
- The clarification changes what the list measures, not deck readiness or the meaning of the Proxy action.
- The existing deck-demand scope is retained; this does not add unrelated catalogue cards, generic basics or optional Maybeboard ideas to a shopping list.

## Challenges to locked decisions
- D-027 - resolved the explicitly open proxy-offset interpretation with the owner's clarification. The original Unsleeved-only wording is intentionally superseded because it would hide proxy-heavy Playable decks.
- No change to physical-copy uniqueness, exact-copy placement, or the accepted readiness/availability vocabulary.

## Open questions
- No further proxy-offset question remains.
- Existing contract/spec, mockup approval, Missing-record transition and safe performance measurement gates remain; no implementation or agent dispatch has started.

## Verification
- Read current shortage references in both affected plans, the decisions register and task ledger before updating them.
- Checked that the plans include already Sleeved proxies and do not confuse original shortfall with assembly readiness.
- Verified local documentation links and saved changes; no application files or live data changed.
- Documentation-only clarification; no runtime tests, performance measurements, migrations or deployments.
