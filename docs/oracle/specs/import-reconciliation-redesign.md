# UX Spec: Import Reconciliation Redesign

## 1. Purpose

This spec defines the redesigned reconciliation screen users see after importing decks from Archidekt (and, eventually, other sources). It replaces the previous action model (`sleeve` / `release` / `proxy`) with a state model and reorganises the UI into three tabs so users can reconcile by deck, by owned card, or by unowned card.

## 2. Design principles

- **State should be visible at a glance.** Every card row clearly shows whether it is Planned, Sleeved, Proxy, or Resolved.
- **Prevent impossible states.** The UI disables options that would sleeve more copies than the user owns.
- **Quiet default, loud exception.** Planned is visually quiet; Proxy and conflicts carry more weight, per D-014.
- **Colour + label, never colour alone.** All status indicators include both a colour cue and text/icon, per D-012.
- **Status hues stay outside the WUBRG mana palette,** per D-013.
- **Controls sit inside the scope they act on,** per D-015.

## 3. Tabbed layout

The reconciliation screen has three tabs at the top of the section. Each tab shows a count badge of unresolved items.

| Tab | Contents | Count meaning |
|-----|----------|---------------|
| **Decks** | Expandable deck lists. Each deck shows its imported cards so users can reconcile in deck context. | Number of deck-card instances in this tab that are unresolved. |
| **Owned card allocations** | One row per owned card instance that appears in an imported deck. | Number of unresolved owned card instances. |
| **Unowned card allocations** | One row per unowned card instance. | Number of unresolved unowned card instances. |

**Count rule:** counts are per *deck-card instance* (one card appearing in three decks counts three times) because each instance needs its own state decision. Resolved items do not contribute to the count. On a full page reload, resolved items are gone, so their counts disappear.

**Persistence across tabs:** choices made on one tab are immediately reflected on the others. Switching tabs never loses state.

## 4. Decks tab

- Decks are listed as collapsible cards/rows.
- Clicking a deck header expands it to show every imported card in that deck.
- Each card row inside a deck uses the same row component as the other tabs, so behaviour is consistent.
- Deck headers show:
  - Deck name
  - Lifecycle badge (Brew / Active)
  - Progress summary: e.g. "87 resolved · 13 unresolved"
  - A conflict indicator if any card in the deck is over-allocated or unowned.
- Expanded decks keep their scroll position when the user switches tabs and returns.

## 5. Owned cards: state model

For each owned card instance, the user selects one of three states:

| State | What it means | Visual treatment |
|-------|---------------|------------------|
| **Planned** (default) | The slot stays planned. No physical copy is assigned. | Quiet grey outline dot + label "Planned". |
| **Sleeved** | The slot is assigned to a real physical copy from the collection. | Teal filled dot/check + label "Sleeved". |
| **Proxy** | The slot uses a proxy copy. Reuses an existing proxy if one is free; otherwise adds a new proxy copy. | Blue proxy-mask icon + label "Proxy". |

### 5.1 Planned sub-state: copy already claimed

When one deck sleeves a card and another deck also wants that same card, the other instances cannot be Sleeved (all owned copies are gone). Those instances remain **Planned** but show an additional descriptor:

- **Label:** `Planned (used elsewhere)`
- This is a variant of Planned, not a separate state. It tells the user the copy is already assigned to another deck.
- The row still allows the user to switch to **Proxy**.

### 5.2 Over-allocation protection

- The **Sleeved** option becomes disabled once all owned copies of that printing are allocated.
- If a user tries to sleeve an instance that would exceed ownership, the control shows a tooltip: "All owned copies are already sleeved. Choose Proxy or use an alternate printing."
- Disabled controls keep visible focus styles and readable labels for accessibility.

## 6. Unowned cards

For each unowned card instance, the user selects one of two states:

| State | What it means |
|-------|---------------|
| **Planned** (default) | The slot stays planned. |
| **Proxy** | Uses an existing proxy copy if available; otherwise adds a new proxy copy to the collection. |

Each unowned card row also has a **Wishlist** checkbox, checked by default.

- Checked: the card is added to the user's wishlist.
- Unchecked: the card is not added to the wishlist.
- Removing a card from a deck does **not** remove it from the wishlist, and vice versa.
- Wishlisted cards show small deck tags underneath the card name so the user can see which imported decks the wishlist entry came from (e.g. "mURZAnary tactics", "Big Butt").

## 7. Card row anatomy

Every row in all three tabs uses the same structure:

```
[thumb]  Card name
         Set code · collector number · finish
         [deck tags if wishlist / multi-deck view]
         [state selector]
         [alternate-printing control]
         [wishlist checkbox on unowned rows]
```

- **Thumb:** small Scryfall small image, 32 px tall.
- **Printing identifier:** set code, collector number, finish, e.g. `MH3 · 123 · foil`.
- **State selector:** a segmented control or select with the available states for that row.
- **Alternate-printing control:** appears only for owned cards when an alternate printing is available.
- **Wishlist checkbox:** appears only for unowned cards.

## 8. Printing information and hover preview

Each row shows the printing identifier on a second line under the card name.

Hovering over the printing identifier shows the full card image, identical to the existing deck-view hover preview [Confirmed: src/components/CardHoverPreview.tsx].

- Hover target: the printing text and the card thumbnail.
- Preview image: Scryfall `large` front image for the row's `scryfall_id`.
- Positioning follows the existing 45° cursor-relative logic and viewport clamping.

## 9. Alternate-printing selector

Only owned cards can use alternate printings. Unowned cards can only select an existing proxy.

### When it appears

- If the user owns a different printing of the same card (same `oracle_id`, different `scryfall_id`) that is available, show a secondary control labelled **"Use alternate printing"**.

### Interaction

- Default state: the imported printing is selected.
- Clicking the control opens an inline dropdown (not a modal) listing available owned printings.
- Each option shows: set name, set code, collector number, finish, condition, and a tiny thumbnail.
- Selecting an alternate printing applies to that **deck-card instance only**.

### Conflict behaviour

- Switching to an alternate printing removes the instance from any conflict involving the original printing.
- If the selected alternate printing is already sleeved in another deck, the UI shows a warning inline: **"This card is already sleeved in another deck."**
- The user can still choose to sleeve it; the warning simply informs them they will be moving/copying contention to that printing.

## 10. State colours and iconography

All states use a colour plus an icon/label, never colour alone.

| State | Colour | Icon | Notes |
|-------|--------|------|-------|
| Planned | `--text-secondary` (#9C9CA3) | Hollow circle | Quiet default. |
| Planned (used elsewhere) | `--text-secondary` | Hollow circle + link/chain icon | Same hue as Planned, with an icon indicating the copy is claimed elsewhere. |
| Sleeved | `--signal-success` (#1D9E75) | Filled circle or check | Owned physical copy in use. |
| Proxy | `--status-proxy` (#489ADE) | Comedy-mask / proxy icon | Distinct from mana blue (D-013). |
| Resolved | `--signal-success` at lower saturation / subtle green tint | Checkmark | Row background gains a faint green tint; text remains readable. |
| Unowned | `--status-unowned` (#F0339E) | Cross or empty diamond | Used for the unowned tab header and wishlist indicators, not as a state selector option. |
| Warning / conflict | `--signal-warning` (#EF9F27) | Alert triangle | Over-allocation and alternate-printing conflicts. |

## 11. Persistence and resolved items

- Reconciliation state persists locally and on the server so users can leave and return.
- A card marked **Resolved** does not move in the list. It stays in place and changes colour/icon to indicate it is resolved.
- Users can re-edit a resolved card at any time. Re-editing makes it unresolved again.
- On a full page reload, resolved cards are removed from the list because they are considered done.
- The "Go to Decks" / finish action materialises all current states to the database.

## 12. Empty and loading states

- **Loading:** reuse the existing skeleton pattern from `PicklistV2` [Confirmed: src/components/PicklistV2.tsx].
- **All resolved:** show a success message: "All imported cards are reconciled."
- **No imported decks:** show the existing empty state from the onboarding summary.
- **Clear-all-data developer tool:** when clicked, visible decks disappear instantly and the empty state shows without requiring a page refresh.

## 13. Accessibility

- All state selectors are reachable by keyboard.
- Each state option has an `aria-pressed` or `aria-checked` attribute.
- Disabled options expose `aria-disabled="true"` and explain why via `aria-describedby` or a tooltip.
- Hover previews are decorative; the printing identifier text is always readable by screen readers.
- Colour is never the only way to distinguish state; labels and icons are required.

## 14. Responsive behaviour

- Desktop: three-column tab content where it makes sense (e.g. deck list on left, card rows on right).
- Tablet/mobile: tabs stack; card rows remain single-column; alternate-printing selector becomes a bottom-sheet or full-width dropdown.

## 15. Out of scope

- Moxfield import changes (per requirements).
- Core data model changes beyond state support.
- AI advisor features.

## 16. Open questions from the design brief

### Resolved in this spec

1. **"Planned-in-decks" label** → Use `Planned (used elsewhere)`. It is plain language, fits the row, and communicates that the copy is claimed by another deck without naming a specific deck.
2. **Tab count calculation** → Count per unresolved deck-card instance. This honestly reflects the number of decisions remaining, even when one card appears in many decks.
3. **Alternate-printing availability** → Inline dropdown. Keeps the user in context, lets them compare printings side-by-side, and avoids a modal interrupt.
4. **State colours and iconography** → Defined in §10. Uses existing status tokens, stays outside WUBRG, and pairs colour with icons/labels.
5. **Wishlist relationship to decks** → Small deck-name tags under the card name in the Unowned tab, plus the same tags in the wishlist itself.

### Still needing owner input

- Should the tab counts use a different unit (e.g. per unique card) to feel less alarming when one card is in many decks?
- Should Resolved rows be collapsible into a "Resolved" section instead of staying inline?
- Should the wishlist deck tags be clickable to jump to that deck in the Decks tab?
- Should alternate-printing conflicts block the finish action, or only warn?
