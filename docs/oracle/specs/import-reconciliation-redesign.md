# UX Spec: Import Reconciliation Redesign

## 1. Purpose

This spec defines the redesigned reconciliation screen users see after importing decks from Archidekt (and, eventually, other sources). It replaces the previous action model (`sleeve` / `release` / `proxy`) with a state model and reorganises the UI into three tabs so users can reconcile by deck, by owned card, or by unowned card.

The key unit of attention is a **conflict printing** — a specific card printing (`scryfall_id` + finish) that is requested by one or more imported deck slots and does not cleanly fit the user's collection. Resolution still happens one deck-card claim at a time, but the UI groups those claims under their printing so the user can see the whole picture at once.

## 2. Design principles

- **State should be visible at a glance.** Every card row clearly shows whether it is Planned, Sleeved, Proxy, or Already Claimed.
- **The conflict printing is the headline.** Counts and resolved status are per printing, not per deck-card instance, so a card in three decks does not feel like three separate problems.
- **Prevent impossible states.** The UI disables options that would sleeve more copies than the user owns and explains why.
- **Quiet default, loud exception.** Planned is visually quiet; Proxy and conflicts carry more weight, per D-014.
- **Colour + label, never colour alone.** All status indicators include both a colour cue and text/icon, per D-012.
- **Status hues stay outside the WUBRG mana palette,** per D-013.
- **Controls sit inside the scope they act on,** per D-015.
- **Progressive disclosure.** Decks and printings start collapsed; the user expands only what they need to act on.

## 3. What a conflict printing is

A conflict printing maps to one row returned by the existing `get_import_allocations` RPC [Confirmed: `src/lib/import-sleeve-claims.ts`, `src/app/api/onboarding/conflicts/route.ts`].

Each row contains:

- `cardName` and a specific printing (`scryfall_id` + finish).
- `owned` — how many real copies of that printing the user has.
- `sleeved` — how many deck slots currently demand a real copy.
- `state` — `'over'`, `'unowned'`, or `'resolved'`.
- `decks[]` — the per-deck claims that make up this printing's demand, each with `claimId`, `deckName`, and current `resolution`.

The UI treats this row as a single reconciliation item. A printing is **resolved** when its `state` is `'resolved'`; it is **unresolved** when it is `'over'` or `'unowned'`.

## 4. Tabbed layout

The reconciliation screen has three tabs at the top of the section. Each tab shows a count badge of **unresolved conflict printings**.

| Tab | Contents | Count meaning |
|-----|----------|---------------|
| **Decks** | Expandable deck lists. Only decks with conflicts can expand, and only conflicted cards are shown inside. | Number of unresolved conflict printings across all imported decks. |
| **Owned card allocations** | One row per owned conflict printing, combining every deck claim that references it. | Number of owned conflict printings that are still unresolved. |
| **Unowned card allocations** | One row per unowned conflict printing, combining every deck claim that references it. | Number of unowned conflict printings that are still unresolved. |

**Count rule:** counts are per *conflict printing*, not per deck-card instance. If one card appears in three decks with the same printing, it counts once. If the same card name appears with two different printings in conflict, it counts twice.

**Persistence across tabs:** choices made on one tab are immediately reflected on the others. Switching tabs never loses state.

## 5. Decks tab

- Decks are listed as collapsible rows/cards.
- **Only decks that have at least one conflict printing can expand.** Decks with zero conflicts are shown in a collapsed, non-interactive state (no chevron, or a disabled chevron) so the user knows they are complete.
- Clicking an expandable deck header expands it to show **only the conflicted cards** for that deck.
- Each card row inside a deck uses the same row component as the other tabs, but because the deck context is already known, deck-name tags are omitted inside this tab.
- Deck headers show:
  - Deck name
  - Lifecycle badge (Brew / Active)
  - Conflict summary: e.g. "2 conflict printings"
  - A conflict indicator if any card in the deck is over-allocated or unowned
- Expanded decks keep their scroll position when the user switches tabs and returns.

## 6. Owned cards: state model

The Owned tab lists one row per **owned conflict printing**. Each row combines every deck claim for that printing and shows the deck names so the user knows where the card is wanted.

For each deck claim in the row, the user selects one of three states using a button group:

| State | What it means | Visual treatment |
|-------|---------------|------------------|
| **Planned** (default) | The slot stays planned. No physical copy is assigned. | Quiet grey outline dot + label "Planned". |
| **Sleeved** | The slot is assigned to a real physical copy from the collection. | Teal filled dot/check + label "Sleeved". |
| **Proxy** | The slot uses a proxy copy. Reuses an existing proxy if one is free; otherwise adds a new proxy copy. | Blue proxy-mask icon + label "Proxy". |

### 6.1 Already claimed

When one deck sleeves a card and another deck also wants that same printing, the overflow claims cannot be Sleeved because all owned copies are gone. Those claims remain selectable, but the UI shows an automatic descriptor:

- **Label:** `Already claimed`
- **Colour:** amber (`--signal-warning`)
- **Icon:** small warning triangle or link/chain icon
- This is not a selectable state; it is a warning the system applies when a claim's intent is `sleeve` but the printing is over-allocated.
- The claim still allows the user to switch to **Planned** or **Proxy**.

### 6.2 Over-allocation protection

- The **Sleeved** button for a claim becomes disabled once the printing's owned copies are fully allocated to other claims.
- If a user hovers a disabled Sleeved button, a tooltip explains: "All owned copies are already sleeved. Choose Proxy, Planned, or use an alternate printing."
- Disabled buttons keep visible focus styles and readable labels for accessibility.

### 6.3 Row resolution

The printing row is marked **Resolved** when the backend `state` becomes `'resolved'` — meaning every claim fits within the available supply. The row gains a faint green tint and a checkmark label, but the claim controls remain editable so the user can change their mind.

## 7. Unowned cards

The Unowned tab lists one row per **unowned conflict printing**. Each row combines every deck claim for that printing and shows the deck names.

For each deck claim, the user selects one of two states using a button group:

| State | What it means |
|-------|---------------|
| **Planned** (default) | The slot stays planned. |
| **Proxy** | Uses an existing proxy copy if available; otherwise adds a new proxy copy to the collection. |

Each unowned deck claim also has a **Wishlist** checkbox, checked by default.

- Checked: the card is added to the user's wishlist.
- Unchecked: the card is not added to the wishlist.
- Removing a card from a deck does **not** remove it from the wishlist, and vice versa.
- Deck-name tags appear under the card name in the Unowned tab so the user can see which imported decks the card is related to.
- **Wishlist tags inside the separate wishlist list are deferred** and can be added later.

## 8. Card row anatomy

Every row in all three tabs uses the same structure, with small contextual differences:

```
[thumb]  Card name  [resolved checkmark]
         Set code · collector number · finish
         [deck tags / per-deck claim list]
         [Planned] [Sleeved] [Proxy]   [alternate-printing select]
         [wishlist checkbox on unowned rows]
         [warning messages]
```

- **Thumb:** small Scryfall image, 32 px tall.
- **Printing identifier:** set code, collector number, finish, e.g. `MH3 · 123 · foil`.
- **State selector:** a button group (segmented control) with the available states for that claim.
- **Alternate-printing control:** an inline select, labelled **"Use alternate printing"**, appears only for owned cards when an alternate printing is available.
- **Wishlist checkbox:** appears only for unowned claims.

## 9. Printing information and hover preview

Each row shows the printing identifier on a second line under the card name.

Hovering over the printing identifier shows the full card image, identical to the existing deck-view hover preview [Confirmed: `src/components/CardHoverPreview.tsx`].

- Hover target: the printing text and the card thumbnail.
- Preview image: Scryfall `large` front image for the row's `scryfall_id`.
- Positioning follows the existing 45° cursor-relative logic and viewport clamping.

## 10. Alternate-printing selector

Only owned cards can use alternate printings. Unowned cards can only select an existing proxy.

### When it appears

- If the user owns a different printing of the same card (same `oracle_id`, different `scryfall_id`) that is available, show a select labelled **"Use alternate printing"**.
- It appears in both the **Owned** tab and the **Decks** tab.

### Interaction

- Default option: the imported printing is selected.
- The select lists available owned printings.
- Each option shows: set name, set code, collector number, finish, condition, and a tiny thumbnail.
- In the **Decks** tab, selecting an alternate printing applies to that **deck-card claim only**.
- In the **Owned** tab, selecting an alternate printing switches the entire conflict printing row to that printing (because the row already combines all deck claims).

### Conflict behaviour

- Switching to an alternate printing removes the claim from any conflict involving the original printing.
- If the selected alternate printing is already sleeved in another deck, the UI shows an inline warning: **"This card is already sleeved in another deck."**
- This is a **warning only**; it does not block the user from finishing or from choosing that printing.

## 11. State colours and iconography

All states use a colour plus an icon/label, never colour alone.

| State | Colour | Icon | Notes |
|-------|--------|------|-------|
| Planned | `--text-secondary` (#9C9CA3) | Hollow circle | Quiet default. |
| Already claimed | `--signal-warning` (#EF9F27) | Warning triangle or chain | Overflow on a sleeved printing. |
| Sleeved | `--signal-success` (#1D9E75) | Filled circle or check | Owned physical copy in use. |
| Proxy | `--status-proxy` (#489ADE) | Comedy-mask / proxy icon | Distinct from mana blue (D-013). |
| Resolved printing | `--signal-success` at lower saturation | Checkmark | Row background gains a faint green tint; text remains readable. |
| Unowned | `--status-unowned` (#F0339E) | Cross or empty diamond | Used for the unowned tab header and wishlist indicators, not as a state selector option. |
| Warning / conflict | `--signal-warning` (#EF9F27) | Alert triangle | Over-allocation and alternate-printing conflicts. |

## 12. Persistence and resolved items

- Reconciliation state persists locally and on the server so users can leave and return.
- A printing marked **Resolved** does not move in the list. It stays in place and changes colour/icon to indicate it is resolved.
- Users can re-edit a resolved printing at any time. Re-editing any of its claims makes it unresolved again.
- On a full page reload, resolved printings are removed from the list because they are considered done.
- The "Go to Decks" / finish action materialises all current states to the database.

## 13. Empty and loading states

- **Loading:** reuse the existing skeleton pattern from `PicklistV2` [Confirmed: `src/components/PicklistV2.tsx`].
- **All resolved:** show a success message: "All imported cards are reconciled."
- **No imported decks:** show the existing empty state from the onboarding summary.
- **Clear-all-data developer tool:** when clicked, visible decks disappear instantly and the empty state shows without requiring a page refresh.

## 14. Accessibility

- State button groups are reachable by keyboard and behave as a single tab stop with arrow-key navigation, or as a toolbar of toggle buttons.
- Each selected state button has `aria-pressed="true"`.
- Disabled options expose `aria-disabled="true"` and explain why via `aria-describedby` or a tooltip.
- Hover previews are decorative; the printing identifier text is always readable by screen readers.
- Colour is never the only way to distinguish state; labels and icons are required.

## 15. Responsive behaviour

- Desktop: card rows keep controls on one line where space allows.
- Tablet/mobile: tabs stack; card rows become multi-line; state button groups wrap; alternate-printing select becomes full-width.

## 16. Out of scope

- Moxfield import changes (per requirements).
- Core data model changes beyond state support.
- AI advisor features.
- Wishlist tags inside the separate wishlist list.

## 17. Data binding

The UI reads and writes through the existing reconciliation endpoints:

- **Read:** `GET /api/onboarding/conflicts?batchId=<uuid>` returns `ImportAllocation[]` [Confirmed: `src/app/api/onboarding/conflicts/route.ts`].
- **Write:** `POST /api/onboarding/conflicts/resolve` accepts `{ claimId: number, resolution: 'sleeve' | 'release' | 'proxy' }` [Confirmed: `src/app/api/onboarding/conflicts/resolve/route.ts`].
- **State derivation:** `resolveAllocationState()` in `src/lib/import-allocation-state.ts` turns the payload into `over` / `unowned` / `resolved`.
- **Core concepts:** `docs/oracle/contracts/allocation-suggestion-engine.md` defines `scryfall_id` as a printing, `oracle_id` as the canonical card, and `user_copies.printing_id` / `finish` as the physical-copy identity.
- **Finalization:** `docs/oracle/contracts/placement-source.md` requires that placements created by "Go to Decks" carry `placement_source = 'import'`.

Each row binds to:

| UI element | Data source |
|------------|-------------|
| Card name + thumb | `ImportAllocation.cardName` + `deck_cards.scryfall_id` |
| Printing identifier | `deck_cards.scryfall_id` + `deck_cards.finish` |
| Deck tags / per-deck claim list | `ImportAllocation.decks[].deckName` + `claimId` |
| State buttons | `ImportConflictDeckRef.resolution` (read), updated via `setClaimResolution` (write) |
| Owned copy count | `ImportAllocation.owned` |
| Resolved status | `ImportAllocation.state === 'resolved'` |
| Alternate-printing options | `user_copies` rows matching `oracle_id` and available `finish` |
| Wishlist checkbox | Local UI state (persisted separately) |

## 18. Open questions from the design brief

### Resolved in this spec

1. **"Planned-in-decks" label** → Use `Already claimed` in amber. It clearly signals that the owned copy is taken by another deck.
2. **Tab count calculation** → Count per unresolved conflict printing. This reduces noise when one card appears in many decks.
3. **Alternate-printing availability** → Inline select. Keeps the user in context and matches the rule that only alternate printing uses a dropdown.
4. **State colours and iconography** → Defined in §11. Uses existing status tokens, stays outside WUBRG, and pairs colour with icons/labels.
5. **Wishlist relationship to decks** → Deck-name tags appear in the Unowned tab. Wishlist list tags are deferred.

### Still needing owner input

- **Non-conflict decks:** Should decks with zero conflicts be visible but disabled, or hidden from the Decks tab entirely?
- **Owned-tab alternate printing:** Should selecting an alternate printing in the Owned tab switch the whole conflict printing, or should it apply to a single deck claim chosen by the user?
- **Already-claimed tie-breaker:** When multiple decks compete for the same owned copy and the user chooses Sleeved, what deterministic order should decide which deck gets the real copy? (Deck import order, alphabetical deck name, or something else?)
- **Resolved rows:** Should resolved printings stay inline with a green tint (as specified), or collapse into a separate "Resolved" section?
- **"Go to Decks" with warnings:** Should alternate-printing warnings show a confirmation dialog on finish, or remain silent non-blockers as specified?
