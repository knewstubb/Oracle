# Design brief: Import reconciliation redesign

## Context

This is the screen users see after importing decks from Archidekt. It lets them reconcile which physical cards go into which decks. The current flow uses an "action" model (sleeve / release / proxy). The owner wants to switch to a "state" model and reorganise the UI.

## Key terms

- **Printing** — a specific card with a unique name, set code, collector number, and finish. Two Sol Rings from different sets are two different printings.
- **Instance** — a single occurrence of a printing inside a deck. One deck can contain multiple instances of the same printing.
- **Conflict** — a printing that needs a decision because there are not enough free copies to satisfy every instance across all imported decks.
- **Resolved** — a state that applies to a printing, not to an individual instance. When every instance of a printing has been reconciled, the printing is resolved.

## Goals

- Make it obvious what state each printing is in.
- Prevent impossible states (sleeving more copies than owned).
- Separate owned cards, unowned cards, and deck-level review into clear tabs.
- Let users choose specific printings and see what card they are choosing.
- Keep the reconciliation state persistent so users can return later.

## Requirements

### 1. Clear-all-data developer tool

When the user clicks "Clear all data" in developer tools, any visible decks must disappear instantly without requiring a page refresh. The existing empty state should show.

### 2. Tabbed layout

The reconciliation screen has three tabs at the top of the section:

1. **Decks** — expandable deck lists, but only decks with conflicts can expand.
2. **Owned card allocations** — owned printings that appear in one or more imported decks, combined across all decks.
3. **Unowned card allocations** — unowned printings that appear in imported decks, combined across all decks.

Each tab shows a count of unresolved conflicts. A conflict is counted per printing, not per instance — ten Sol Ring instances of the same printing count as one conflict. Choices made on one tab persist when the user switches to another tab.

### 3. Decks tab

- Only decks with conflicts are shown. Decks with zero conflicts are hidden entirely.
- Expanding a deck shows only its conflicted cards.
- Each conflicted card shows the deck it belongs to and supports the same Planned / Sleeved / Proxy buttons and alternate-printing dropdown as the owned/unowned tabs.
- Alternate printing selection applies to that one deck-card instance.

### 4. Owned cards: state model

For each owned printing in conflict, the Owned tab groups all instances of that printing across decks into one row. Within that row, each deck instance has its own controls.

For each **instance**, the user selects a state:

- **Planned** (default for every instance) — the instance stays as a planned slot. It is not assigned to a physical copy.
- **Sleeved** — the instance is assigned to a physical copy in the user's collection. This can be an original or an existing proxy.
- **Proxy** — a proxy copy is used. If a free proxy copy already exists, it is used. Otherwise a new proxy copy is added to the collection.

Controls:
- Use **buttons** for Planned / Sleeved / Proxy per instance, not a dropdown.
- A separate **dropdown** appears only when an alternate printing is available for that instance.
- A user cannot sleeve more copies than they own. The Sleeved option becomes disabled for other instances once all owned copies are allocated.
- If one instance sleeves a printing, other instances of that printing show as **Planned (used elsewhere)**.
- If an instance is not manually sleeved, it remains Planned.
- **Already claimed** state is shown in amber.

### 5. Unowned cards

For each unowned printing in conflict, the user selects:

- **Planned** (default)
- **Proxy** — uses an existing proxy copy if one is available; otherwise adds a new proxy copy to the collection

Each unowned printing also has a **Wishlist** checkbox that is checked by default. Wishlisted cards are added to a separate wishlist list. The relationship to decks can be shown with tags (this can be added later). Deleting a card from a deck or from the wishlist does not affect the other.

### 6. Printing information and preview

Each printing row shows the **printing identifier** (set code, collector number, and finish — e.g. "MH3 · 123 · foil"). Hovering over the printing identifier shows the full card image, the same way the deck view does.

### 7. Alternate printing selector

If the user owns a different printing of the same card that is available, show a "Use alternate printing" dropdown next to the relevant instance. Selecting an alternate printing:

- Applies per instance (one deck-card).
- Removes that instance from conflicts involving the original printing.
- If the selected alternate printing is already sleeved in another deck, the UI shows it as an option, not a warning. The action is not blocked.

Alternate printing is available for owned cards in all three tabs. Unowned cards can only select an existing proxy.

### 8. Persistence and resolved printings

- The reconciliation page state persists so users can leave and return.
- When a printing is resolved, it does **not** move in the list. It stays in place and changes colour to indicate it is resolved.
- Users can re-edit resolved printings if they want.
- On a full page reload, resolved printings no longer appear because they are considered done.

## Resolved design questions

- Sub-state label for a Planned printing whose copies are already sleeved elsewhere: **"Planned (used elsewhere)"**.
- Tab counts: **per conflict printing**, not per instance.
- Alternate-printing selector: **inline dropdown**.
- Wishlist deck relationship: **tags** (can be added later).
- Resolved rows: **stay inline** with a green-tinted background.
- Already-claimed indicator: **amber**.
- Alternate-printing conflict: **not a warning**, just an option. Non-blocking.

## Open questions for the designer

- What iconography should accompany Planned / Sleeved / Proxy / Already claimed / Resolved states while meeting accessibility needs (D-012–D-014)?
- How should the deck-name reference be shown in the Owned and Unowned tabs?
- How should the alternate-printing dropdown be labelled and positioned relative to the state buttons?

## Out of scope

- Moxfield import changes.
- Changes to the core data model beyond what is needed to support these states.
- AI advisor features.
- Full wishlist tagging solution (tags can be added later).

## References

- `docs/oracle/decisions.md` — D-005, D-012–D-014, D-018–D-024
- `docs/oracle/reports/2026-09-26-architect-m1-exit-test.md` — T-13 findings on copy assignments and printing mismatches
- Existing reconciliation routes under `src/app/api/onboarding/conflicts/`
- Existing components: `DeckImportProgressList.tsx`, `StatusChipPopover.tsx`, `PicklistV2.tsx`, `CardHoverPreview.tsx`
