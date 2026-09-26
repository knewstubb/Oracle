# Report: T-22 import reconciliation redesign — final revision
Role: UX/UI
Status: DONE
Task as received: "Task T-22 final revision: Update the spec and mockup based on the latest owner clarifications in docs/oracle/specs/import-reconciliation-redesign-requirements.md. Key final clarifications: Decks with zero conflicts are hidden entirely from the Decks tab. Sleeving is per instance (one deck-card), not per printing row. Each instance has its own Planned/Sleeved/Proxy buttons. Alternate printing selection is per instance, not per printing row. If not enough owned copies exist, the Sleeved button is disabled for remaining instances. Alternate printing is just an option, not a warning. It never blocks. Resolved printings stay inline and only change colour. They never move to another section. Update docs/oracle/specs/import-reconciliation-redesign.md and docs/oracle/mockups/import-reconciliation-redesign.html accordingly. Done when: the spec and mockup reflect these per-instance rules and are saved."

## Changed files
- `docs/oracle/specs/import-reconciliation-redesign.md` — rewrote the spec so the deck-card instance is the unit of action, added a component inventory and copy section, and folded in the six final clarifications.
- `docs/oracle/mockups/import-reconciliation-redesign.html` — removed the zero-conflict deck, moved the alternate-printing select next to each instance's state buttons, added a resolved-row example, and removed any blocking-warning language for alternate printings.

## New decisions made (need owner confirmation)
- Count badges stay per **conflict printing**, not per instance. This keeps noise down when one card appears in several decks, but it means a resolved printing can still show under a deck header until the next reload.
- The disabled-Sleeved tooltip reads: "All owned copies are already sleeved. Choose Proxy, Planned, or use an alternate printing."
- "Already claimed" is shown in amber as a descriptor (not a selectable state) when an instance wants to be Sleeved but no owned copies are free.
- Resolved rows use the existing success colour at lower saturation for the background and a "Resolved" status label; controls remain editable inline.
- The spec now explicitly lists every component and exact copy strings so the Frontend agent does not have to make design decisions.

## Assumptions
- The reconciliation API already supports, or will be updated by the Architect to support, a per-instance alternate-printing selection (e.g. a `selected_printing_id` on the claim).
- The counts on tab badges are still measured in unresolved conflict printings, matching the previous spec version.
- Resolved printings are removed from the list on a full page reload, as stated in the requirements.
- The existing hover-preview component (`CardHoverPreview`) can be reused without visual changes.

## Challenges to locked decisions
- None.

## Open questions
- **Already-claimed tie-breaker:** If two decks both want the same owned copy and the user clicks Sleeved on both, what deterministic rule decides which deck gets the real copy? (Import order, alphabetical deck name, etc.)
- **Resolved-row persistence before reload:** Should a printing disappear from the Decks tab as soon as it is resolved, or stay visible (green) until the user reloads?
- **Alternate-printing API shape:** What is the exact field name and endpoint for saving a per-instance alternate-printing choice? This needs the Architect's reconciliation contract.

## Verification
- Opened `docs/oracle/mockups/import-reconciliation-redesign.html` in a browser and confirmed tab switching, deck expand/collapse, state-button selection, and hover previews render.
- Ran `git diff --stat` — both files changed as expected.
- Grep checks confirmed the spec contains "hidden entirely," "deck-card instance," "optional and never blocking," and "stays in place and changes colour." The mockup contains "Decks with no conflicts are hidden," per-instance alternate-printing selects, a disabled Sleeved button, and a Resolved row.
