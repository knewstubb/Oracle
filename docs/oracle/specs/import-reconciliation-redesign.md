# UX Spec: Import Reconciliation Redesign

## 1. Problem

After importing decks from Archidekt, users are left with a list of card slots that may not match their physical collection. The previous screen forced users to think in terms of actions (`sleeve` / `release` / `proxy`) applied to whole printings. It was hard to see which deck was claiming which copy, easy to accidentally over-allocate a single owned card across multiple decks, and unclear whether a card was resolved or still needed attention.

## 2. Purpose

This spec defines the redesigned reconciliation screen users see after importing decks from Archidekt (and, eventually, other sources). It replaces the previous action model with a state model and reorganises the UI into three tabs. The smallest unit of user action is a single **deck-card instance** — one card slot in one deck. The UI groups those instances by printing so the user can see the whole picture at once, but every decision — sleeve, proxy, alternate printing — applies to one instance only.

## 3. Design principles

- **State should be visible at a glance.** Every card instance clearly shows whether it is Planned, Sleeved, Proxy, or Already Claimed.
- **The deck-card instance is the unit of action.** Sleeve / proxy / alternate-printing choices apply to one slot, not to every deck that wants the same printing.
- **The conflict printing is the grouping.** Counts and row headers are per printing so a card in three decks does not feel like three separate problems.
- **Prevent impossible states.** The UI disables options that would sleeve more copies than the user owns and explains why.
- **Quiet default, loud exception.** Planned is visually quiet; Proxy and conflicts carry more weight, per D-014.
- **Colour + label, never colour alone.** All status indicators include both a colour cue and text/icon, per D-012.
- **Status hues stay outside the WUBRG mana palette,** per D-013.
- **Controls sit inside the scope they act on,** per D-015.
- **Progressive disclosure.** Decks and printings start collapsed; the user expands only what they need to act on.

## 4. Component inventory

| Component | Builds on | Props / notes |
|-----------|-----------|---------------|
| `ReconciliationTabs` | shadcn `Tabs` | Three tab triggers with count badges. |
| `DeckList` | Custom layout | Expandable deck cards. Hidden entirely when a deck has zero conflicts. |
| `DeckHeader` | Custom layout | Deck name, lifecycle badge, conflict summary, expand chevron. |
| `ConflictCardRow` | Custom layout | Thumb, card name, printing identifier, per-instance claim list, optional status label. |
| `StateButtonGroup` | shadcn `ToggleGroup` (or `role="group"` buttons) | One group per deck-card instance. |
| `AlternatePrintingSelect` | shadcn `Select` | One per owned deck-card instance. Lists owned printings of the same card. |
| `WishlistCheckbox` | shadcn `Checkbox` | One per unowned deck-card instance. |
| `CardHoverPreview` | Existing component | Reuses `CardHoverPreview` positioning logic. |
| `FinishBar` | Custom layout | Summary text and primary CTA. |

## 5. What a conflict printing is

A conflict printing maps to one row returned by the existing `get_import_allocations` RPC [Confirmed: `src/lib/import-sleeve-claims.ts`, `src/app/api/onboarding/conflicts/route.ts`].

Each row contains:

- `cardName` and a specific printing (`scryfall_id` + finish).
- `owned` — how many real copies of that printing the user has.
- `sleeved` — how many deck slots currently demand a real copy.
- `state` — `'over'`, `'unowned'`, or `'resolved'`.
- `decks[]` — the per-deck claims that make up this printing's demand, each with `claimId`, `deckName`, and current `resolution`.

The UI renders one card row per conflict printing. Inside that row, each deck-card claim is a separate instance with its own state controls and, for owned cards, its own alternate-printing selector. A printing is **resolved** when its `state` is `'resolved'`; it is **unresolved** when it is `'over'` or `'unowned'`.

## 6. Tabbed layout

The reconciliation screen has three tabs at the top of the section. Each tab shows a count badge of **unresolved conflict printings**.

| Tab | Contents | Count meaning |
|-----|----------|---------------|
| **Decks** | Expandable deck lists. Only decks with conflicts are shown, and only conflicted cards are shown inside. | Number of unresolved conflict printings across all imported decks. |
| **Owned card allocations** | One row per owned conflict printing, combining every deck claim that references it. | Number of owned conflict printings that are still unresolved. |
| **Unowned card allocations** | One row per unowned conflict printing, combining every deck claim that references it. | Number of unowned conflict printings that are still unresolved. |

**Count rule:** counts are per *conflict printing*, not per deck-card instance. If one card appears in three decks with the same printing, it counts once. If the same card name appears with two different printings in conflict, it counts twice.

**Persistence across tabs:** choices made on one tab are immediately reflected on the others. Switching tabs never loses state.

## 7. Decks tab

- Decks are listed as collapsible rows/cards.
- **Decks with zero conflicts are hidden entirely.** They do not appear in the list, do not take up space, and do not show a disabled state.
- Only decks that have at least one conflict printing are shown, and they are expandable.
- Clicking a deck header expands it to show **only the conflicted cards** for that deck.
- Each card row inside a deck uses the same row component as the other tabs. Deck-name tags are omitted inside this tab, **except** when a card is "Already claimed" — then the row shows the name(s) of the deck(s) that own the real copy so the user knows where the conflict is.
- Deck headers show:
  - Deck name
  - Lifecycle badge (Brew / Active)
  - Conflict summary: e.g. "2 conflict printings"
  - A conflict indicator if any card in the deck is over-allocated or unowned
- Expanded decks keep their scroll position when the user switches tabs and returns.

## 8. Owned cards: state model

The Owned tab lists one row per **owned conflict printing**. Each row combines every deck claim for that printing and shows the deck names so the user knows where the card is wanted.

For each **deck-card instance** (one claim inside the row), the user selects one of three states using a button group:

| State | What it means | Visual treatment |
|-------|---------------|------------------|
| **Planned** (default) | The slot stays planned. No physical copy is assigned. | Quiet grey outline dot + label "Planned". |
| **Sleeved** | The slot is assigned to a real physical copy from the collection. | Teal filled dot/check + label "Sleeved". |
| **Proxy** | The slot uses a proxy copy. Reuses an existing proxy if one is free; otherwise adds a new proxy copy. | Blue proxy-mask icon + label "Proxy". |

### 8.1 Already claimed

When one deck sleeves a card and another deck also wants that same printing, the overflow instances cannot be Sleeved because all owned copies are gone. Those instances remain selectable, but the UI shows an automatic descriptor:

- **Label:** `Already claimed`
- **Colour:** amber (`--signal-warning`)
- **Icon:** small warning triangle or link/chain icon
- This is not a selectable state; it is a system descriptor applied when a claim's intent is `sleeve` but the printing is over-allocated.
- The instance still allows the user to switch to **Planned** or **Proxy**.

### 8.2 Over-allocation protection

- The **Sleeved** button for an instance becomes disabled once the printing's owned copies are fully allocated to other instances.
- If a user hovers a disabled Sleeved button, a tooltip explains: "All owned copies are already sleeved. Choose Proxy, Planned, or use an alternate printing."
- There is no tie-breaker: the UI simply prevents more instances from being Sleeved than owned copies exist.
- Disabled buttons keep visible focus styles and readable labels for accessibility.

### 8.3 Row resolution

The printing row is marked **Resolved** when the backend `state` becomes `'resolved'` — meaning every instance fits within the available supply. The row gains a faint green tint and a checkmark label, but the instance controls remain editable so the user can change their mind.

## 9. Unowned cards

The Unowned tab lists one row per **unowned conflict printing**. Each row combines every deck claim for that printing and shows the deck names.

For each **deck-card instance**, the user selects one of two states using a button group:

| State | What it means |
|-------|---------------|
| **Planned** (default) | The slot stays planned. |
| **Proxy** | Uses an existing proxy copy if available; otherwise adds a new proxy copy to the collection. |

Each unowned deck-card instance also has a **Wishlist** checkbox, checked by default.

- Checked: the card is added to the user's wishlist.
- Unchecked: the card is not added to the wishlist.
- Removing a card from a deck does **not** remove it from the wishlist, and vice versa.
- Deck-name tags appear under the card name in the Unowned tab so the user can see which imported decks the card is related to.
- **Wishlist tags inside the separate wishlist list are deferred** and can be added later.

## 10. Card row anatomy

Every row in all three tabs uses the same card-shaped container, with one inner row per deck-card instance:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [thumb]  Card name                                          [Resolved]      │
│          Set code · collector number · finish                               │
│                                                                             │
│  [deck tag] ──────────────────────────────────  [Planned][Sleeved][Proxy] [printing ▾] [☑ Wishlist] │
│  [deck tag] ──────────────────────────────────  [Planned][Sleeved][Proxy] [printing ▾]             │
│                                                                             │
│  ⚠ All owned copies are already sleeved in other decks.                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Thumb:** small Scryfall image, 32 px tall.
- **Printing identifier:** set code, collector number, finish, e.g. `MH3 · 123 · foil`.
- **Per-instance row:** one row per deck claim. Each row is a flex layout with the deck tag on the left and all controls pushed to the right.
- **State selector:** a button group (segmented control) with the available states for that instance.
- **Alternate-printing control:** an inline select showing the current printing, appears only for owned instances when an alternate printing is available. It belongs to the instance, not to the whole printing row.
- **Wishlist checkbox:** appears only for unowned instances.
- **Alignment:** the deck tag sits on the left of each instance row; the state buttons, printing select, and wishlist checkbox are pushed to the right edge of the card, matching the deck view layout.

## 11. Printing information and hover preview

Each row shows the printing identifier on a second line under the card name.

Hovering over the printing identifier shows the full card image, identical to the existing deck-view hover preview [Confirmed: `src/components/CardHoverPreview.tsx`].

- Hover target: the printing text and the card thumbnail.
- Preview image: Scryfall `large` front image for the row's `scryfall_id`.
- Positioning follows the existing 45° cursor-relative logic and viewport clamping.

## 12. Alternate-printing selector

Only owned cards can use alternate printings. Unowned cards can only select an existing proxy.

### When it appears

- If the user owns a different printing of the same card (same `oracle_id`, different `scryfall_id`) that is available, show a select labelled **"Use alternate printing"**.
- It appears in both the **Owned** tab and the **Decks** tab.
- The select belongs to a single deck-card instance.

### Interaction

- Default option: the imported printing is selected.
- The select lists available owned printings.
- Each option shows: set name, set code, collector number, finish, condition, and a tiny thumbnail.
- Selecting an alternate printing applies to that **deck-card instance only**.

### Conflict behaviour

- Switching to an alternate printing removes the instance from any conflict involving the original printing.
- If the selected alternate printing is already fully allocated elsewhere, the **Sleeved** option for this instance is disabled, just like any other over-allocated printing.
- Alternate printing is **optional and never blocking**. The user can finish with alternate-printing over-allocation, choose a different printing, or leave the instance Planned / Proxy.

## 13. State colours and iconography

All states use a colour plus an icon/label, never colour alone.

| State | Colour | Icon | Notes |
|-------|--------|------|-------|
| Planned | `--text-secondary` (#9C9CA3) | Hollow circle | Quiet default. |
| Already claimed | `--signal-warning` (#EF9F27) | Warning triangle or chain | Overflow on a sleeved printing. |
| Sleeved | `--signal-success` (#1D9E75) | Filled circle or check | Owned physical copy in use. |
| Proxy | `--status-proxy` (#489ADE) | Comedy-mask / proxy icon | Distinct from mana blue (D-013). |
| Resolved printing | `--signal-success` at lower saturation | Checkmark | Row background gains a faint green tint; text remains readable. |
| Unowned | `--status-unowned` (#F0339E) | Cross or empty diamond | Used for the unowned tab header and wishlist indicators, not as a state selector option. |
| Warning / conflict | `--signal-warning` (#EF9F27) | Alert triangle | Over-allocation helper and alternate-printing availability indicator. |

## 14. Persistence and resolved items

- Reconciliation state persists locally and on the server so users can leave and return.
- A printing marked **Resolved** does not move in the list. It stays in place and changes colour/icon to indicate it is resolved.
- Users can re-edit a resolved printing at any time. Re-editing any of its instances makes it unresolved again.
- On a full page reload, resolved printings are removed from the list because they are considered done.
- The "Go to Decks" / finish action materialises all current states to the database.

## 15. Empty and loading states

- **Loading:** reuse the existing skeleton pattern from `PicklistV2` [Confirmed: `src/components/PicklistV2.tsx`].
- **All resolved:** show a success message: "All imported cards are reconciled."
- **No imported decks:** show the existing empty state from the onboarding summary.
- **Clear-all-data developer tool:** when clicked, visible decks disappear instantly and the empty state shows without requiring a page refresh.

## 16. Accessibility

- State button groups are reachable by keyboard and behave as a single tab stop with arrow-key navigation, or as a toolbar of toggle buttons.
- Each selected state button has `aria-pressed="true"`.
- Disabled options expose `aria-disabled="true"` and explain why via `aria-describedby` or a tooltip.
- Each per-instance control has an accessible name that includes the card name and deck name, e.g. "Sol Ring state for mURZAnary tactics".
- Hover previews are decorative; the printing identifier text is always readable by screen readers.
- Colour is never the only way to distinguish state; labels and icons are required.

## 17. Responsive behaviour

- Desktop: card rows keep controls on one line where space allows.
- Tablet/mobile: tabs stack; card rows become multi-line; state button groups wrap; alternate-printing select becomes full-width.

## 18. Out of scope

- Moxfield import changes (per requirements).
- Core data model changes beyond state support.
- AI advisor features.
- Wishlist tags inside the separate wishlist list.

## 19. Data binding

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
| Deck tags / per-instance claim list | `ImportAllocation.decks[].deckName` + `claimId` |
| State buttons | `ImportConflictDeckRef.resolution` (read), updated via `setClaimResolution` (write) |
| Owned copy count | `ImportAllocation.owned` |
| Resolved status | `ImportAllocation.state === 'resolved'` |
| Alternate-printing options | `user_copies` rows matching `oracle_id` and available `finish`, filtered to copies not already selected by another instance when determining free supply |
| Alternate-printing selected value | Per-instance `deck_cards` printing override (assumed to be supplied by the Architect's reconciliation contract) |
| Wishlist checkbox | Local UI state (persisted separately) |

## 20. Copy

Exact strings used in the UI:

| Location | String |
|----------|--------|
| Tab labels | "Decks", "Owned", "Unowned" |
| Deck summary | "{n} conflict printings" / "1 conflict printing" |
| Deck conflict badge | "Conflict" |
| Deck lifecycle badges | "Brew", "Active" |
| Empty state (all resolved) | "All imported cards are reconciled." |
| Empty state (no decks) | existing onboarding empty state |
| State buttons | "Planned", "Sleeved", "Proxy" |
| Already claimed label | "Already claimed" |
| Disabled Sleeved tooltip | "All owned copies are already sleeved. Choose Proxy, Planned, or use an alternate printing." |
| Alternate printing select | Displays the currently selected printing as "{set code} · {collector number} · {finish}". Opening it lists available owned printings. |
| Wishlist checkbox label | "Wishlist" |
| Finish bar summary | "{n} unresolved conflict printings across all tabs" |
| Finish bar CTA | "Go to Decks ({n} unresolved)" / "Go to Decks" when zero |
| Resolved row label | "Resolved" |

## 21. Open questions resolved by owner feedback

- **Count unit:** Counts are per conflict printing, not per deck-card instance. (Confirmed.)
- **Resolved rows:** Resolved printings stay in place; there is no separate "Resolved" section. (Confirmed.)
- **Wishlist deck tags:** Deck tags under wishlist cards are not clickable. (Confirmed.)
- **Alternate-printing conflicts:** They warn only; they do not block finishing. (Confirmed.)
- **Deck-view conflict source:** When a card is "Already claimed" in the Decks tab, the row shows the deck(s) that own the real copy. (Confirmed and added to §7.)
- **Owned / Unowned layout:** Controls are right-aligned per instance row, and rows live inside card containers matching the Decks tab. (Confirmed and updated in §10.)

## 22. Open questions resolved by owner feedback

- **Already-claimed tie-breaker:** There is no tie-breaker. The UI prevents more instances from being Sleeved than owned copies allow, so a tie never occurs.
- **Resolved-row persistence before reload:** Resolved printings remain visible in the Decks tab until the screen is refreshed or reloaded.

## 23. Notes for implementation

- **Alternate-printing API shape:** The write endpoint will need to accept a per-instance alternate-printing selection. The exact field name and contract are for the Architect to define in the reconciliation API contract; the UX only requires that the choice applies to one deck-card instance and is reflected immediately in the UI.
