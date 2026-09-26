# Design brief: Import reconciliation redesign

## Context

This is the screen users see after importing decks from Archidekt. It lets them reconcile which physical cards go into which decks. The current flow uses an "action" model (sleeve / release / proxy). The owner wants to switch to a "state" model and reorganise the UI.

## Goals

- Make it obvious what state each card is in.
- Prevent impossible states (sleeving more copies than owned).
- Separate owned cards, unowned cards, and deck-level review into clear tabs.
- Let users choose specific printings and see what card they are choosing.
- Keep the reconciliation state persistent so users can return later.

## Requirements

### 1. Clear-all-data developer tool

When the user clicks "Clear all data" in developer tools, any visible decks must disappear instantly without requiring a page refresh. The existing empty state should show.

### 2. Tabbed layout

The reconciliation screen has three tabs at the top of the section:

1. **Decks** — expandable deck lists so users can review cards deck by deck.
2. **Owned card allocations** — cards the user owns that appear in one or more imported decks.
3. **Unowned card allocations** — cards the user does not own that appear in imported decks.

Each tab shows a count of unresolved issues. Choices made on one tab persist when the user switches to another tab.

### 3. Decks tab

- Decks are listed and can be expanded.
- Expanding a deck shows its cards so the user can reconcile them in context rather than jumping card by card across decks.

### 4. Owned cards: state model

For each owned card instance, the user selects a **state**:

- **Planned** (default for every card) — the card stays as a planned slot. It is not assigned to a physical copy.
- **Sleeved** — the card is assigned to a physical copy in the user's collection. This can be an original or an existing proxy.
- **Proxy** — a proxy copy is used. If a free proxy copy already exists, it is used. Otherwise a new proxy copy is added to the collection.

Rules:
- A user cannot sleeve more copies than they own. The option becomes disabled once all owned copies are allocated.
- If one deck sleeves a card, other decks with that same card show as **planned-in-decks** (wording open to refinement) to indicate the copy is already used elsewhere.
- If a card is not manually sleeved, it remains Planned.

### 5. Unowned cards

For each unowned card instance, the user selects:

- **Planned** (default)
- **Proxy** — uses an existing proxy copy if one is available; otherwise adds a new proxy copy to the collection

Each unowned card also has a **Wishlist** checkbox that is checked by default. Wishlisted cards are added to a separate wishlist list. Deleting a card from a deck or from the wishlist does not affect the other. The UI should make it possible to see which decks a wishlist card is related to.

### 6. Printing information and preview

Each card row shows the **printing identifier** (set code, collector number, and finish — e.g. "MH3 · 123 · foil"). Hovering over the printing identifier shows the full card image, the same way the deck view does.

### 7. Alternate printing selector

If the user owns a different printing of the same card that is available, show a "Use alternate printing" option. Selecting an alternate printing:

- Applies per deck-card instance.
- Removes the card from conflicts involving the original printing.
- May create a new conflict if the selected alternate printing is already sleeved in another deck. In that case the UI warns: "This card is already sleeved in another deck."

Only owned cards can use alternate printings. Unowned cards can only select an existing proxy.

### 8. Persistence and resolved items

- The reconciliation page state persists so users can leave and return.
- When a card is resolved, it does **not** move in the list. It stays in place and changes colour to indicate it is resolved.
- Users can re-edit resolved cards if they want.
- On a full page reload, resolved cards no longer appear because they are considered done.

## Open questions for the designer

- What is the best label for "planned-in-decks"? Options: "Planned (used elsewhere)", "Planned — copy claimed", "Planned — in [deck name]", or another variant.
- How should the tab counts be calculated? Per unresolved card instance, per unique card, or per deck?
- How should alternate-printing availability be surfaced? As a dropdown, a modal, or inline?
- What colour and iconography should distinguish Planned / Sleeved / Proxy / Resolved states while meeting accessibility needs (D-012–D-014)?
- How should the wishlist relationship to decks be visualised?

## Out of scope

- Moxfield import changes.
- Changes to the core data model beyond what is needed to support these states.
- AI advisor features.

## References

- `docs/oracle/decisions.md` — D-005, D-012–D-014, D-018–D-024
- `docs/oracle/reports/2026-09-26-architect-m1-exit-test.md` — T-13 findings on copy assignments and printing mismatches
- Existing reconciliation routes under `src/app/api/onboarding/conflicts/`
- Existing components: `DeckImportProgressList.tsx`, `StatusChipPopover.tsx`, `PicklistV2.tsx`
