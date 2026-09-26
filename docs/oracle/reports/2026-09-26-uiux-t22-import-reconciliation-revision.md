# Report: T-22 import reconciliation redesign revision

Role: UX/UI
Status: DONE

Task as received: "Revise the import reconciliation spec and mockup based on the updated requirements in docs/oracle/specs/import-reconciliation-redesign-requirements.md. Key corrections from the owner:

- Resolved is a state for a printing, not an individual instance.
- Tab counts are per conflict printing, not per instance.
- Only decks with conflicts can expand; only conflicted cards are shown.
- Owned and unowned tabs combine instances across decks and must show deck-name references.
- Use buttons for Planned/Sleeved/Proxy; dropdown is only for alternate printing selection.
- Alternate printing option must also appear in the Decks view.
- Already claimed is amber.
- Alternate-printing conflicts warn only, do not block.
- Wishlist tags can be added later.

Update docs/oracle/specs/import-reconciliation-redesign.md and docs/oracle/mockups/import-reconciliation-redesign.html accordingly. Report which open questions you resolved and which still need owner input.

Done when: the spec and mockup are updated and saved."

## Changed files

- `docs/oracle/specs/import-reconciliation-redesign.md` — rewritten around the conflict printing as the headline unit; counts, resolved state, and row grouping now reflect the owner's corrections.
- `docs/oracle/mockups/import-reconciliation-redesign.html` — updated interactive mockup with per-printing counts, deck-only expansion, combined Owned/Unowned rows, button groups for states, amber "Already claimed" label, alternate-printing select in both Owned and Decks tabs, and deferred wishlist tags.

## New decisions made (need owner confirmation)

1. **Conflict printing = one `ImportAllocation` row.** The spec treats each backend allocation row as a single reconciliation item. Counts and "resolved" status are per row, while the actual controls still act on the per-deck `claimId` inside that row.
2. **State controls are button groups, not dropdowns.** Planned/Sleeved/Proxy are exposed as a segmented button group per deck claim. Alternate printing remains an inline `<select>`.
3. **"Already claimed" is amber and automatic.** When a deck wants to sleeve a printing but all owned copies are taken, that claim shows an amber `Already claimed` label and the Sleeved button is disabled. It is not a selectable state.
4. **Alternate printing appears in both Owned and Decks tabs.** In the Decks tab it applies to one deck-card claim. In the Owned tab it switches the whole conflict printing row to a different owned printing.
5. **Wishlist tags inside the wishlist list are deferred.** The Unowned tab still shows deck-name references, but tags on wishlist entries are left for a later iteration.
6. **Non-conflict decks stay visible but cannot expand.** They are shown as complete rows with a disabled chevron so the user knows they were imported and have no issues.

## Assumptions

- The existing backend shape from `src/lib/import-sleeve-claims.ts` (`ImportAllocation` + `ImportConflictDeckRef`) is the data source, so per-deck resolution is still possible even though the UI groups by printing.
- "Resolved" is derived from the backend `state === 'resolved'` field, not from any new client-side logic.
- The mockup's static sample data (3 conflict printings across 3 decks) is enough to demonstrate the revised layout; production will use the real allocation payload.

## Challenges to locked decisions

None. The revisions build on the existing `deck_cards` / `user_copies` model and the import-sleeve-claims system without changing any locked decision in `docs/oracle/decisions.md`.

## Open questions

Resolved:

- "Planned-in-decks" label → `Already claimed` in amber.
- Tab count calculation → per unresolved conflict printing.
- Alternate-printing surfacing → inline select.
- State colours and iconography → defined in §11 of the spec.
- Wishlist-to-deck visualization → deck-name tags in the Unowned tab; wishlist-entry tags deferred.

Still needing owner input:

- Should decks with zero conflicts be visible but disabled, or hidden entirely from the Decks tab?
- In the Owned tab, should selecting an alternate printing switch the whole conflict printing, or apply to a single deck claim?
- When multiple decks compete for the same owned copy, what deterministic order decides which deck gets the real copy when the user chooses Sleeved?
- Should resolved printings stay inline with a green tint, or collapse into a separate "Resolved" section?
- Should the "Go to Decks" button show a confirmation when alternate-printing warnings are present, or remain a silent non-blocker?

## Verification

- `git diff --stat` showed only the intended two files changed:
  - `docs/oracle/mockups/import-reconciliation-redesign.html` — 352 lines changed
  - `docs/oracle/specs/import-reconciliation-redesign.md` — 207 lines changed
- The mockup is a single self-contained HTML file with inline CSS/JS and opens without a build step.
