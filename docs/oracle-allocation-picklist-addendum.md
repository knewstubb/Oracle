# Oracle — Allocation/Picklist Addendum

> Amends `oracle-allocation-picklist-kiro-handoff.md` — does **not** replace it.
> Two kinds of content: corrections to chunks already in that doc, and new chunks (11–12).
>
> **Trigger:** A full schema/architecture summary revealed existing infrastructure
> (`collection_rollup`, `shared_cards` views, `card_fuzzy_lookup` tool, the Scryfall/EDHREC/Spellbook
> integration layer) that changes the right implementation path for several chunks, plus two new
> pieces of scope (basic lands, add/remove-cards) from follow-up discussion.

---

## Corrections

### Correction to Chunk 3 (Four-State Card Status Taxonomy)

**Original guidance:** Compute Unallocated vs. Unowned via batched app-level queries (2–3 round trips, client-side classification), specifically to avoid a naive 40-query-per-list-render approach.

**Supersede with:** A `collection_rollup` view already exists (`owned_count`, `proxy_count`, `allocated_count`, `shortfall`) and looks like it already computes most of what this derivation needs, server-side, in one query. Use or extend that view instead of building new app-level batching logic.

**Condition (confirmed):** `collection_rollup` is a plain SQL view (`CREATE OR REPLACE VIEW` in migrations 012 and 014) — it recomputes on every read. No staleness concern. The original app-level batching approach can be fully replaced with this view.

---

### Correction to Chunk 7 (Allocation Panel) and Chunk 9 (Deck Builder Add-Card Status)

Both need to detect and name contention — which deck(s) are short a card, and for Over-allocated, which deck currently holds it.

A `shared_cards` view already exists ("cards appearing in 2+ decks with owned copy count") that's close to this. **Use or extend it** rather than computing contention from scratch across `deck_cards` and `physical_copies` directly.

---

### New Risk Flag (Cross-Cutting — Not Tied to One Chunk)

`card_name` is used as a lookup or join key in at least four places, sourced from at least three different origins:

- `card_metadata` (primary key)
- `collection` (raw Archidekt CSV import)
- `deck_cards`
- `mtg_cards`

Name-string matching across independently-sourced data is a real place for silent mismatches:
- Curly vs. straight apostrophes
- Accented characters
- Double-faced card naming conventions (`"Front // Back"` vs. just `"Front"`)

A mismatch here doesn't error — it just fails to resolve, which is harder to diagnose than a crash.

`card_definitions` and `oracle_to_printings` already key on `oracle_id` — **confirm that's the join key everywhere correctness matters** (especially anything feeding the status taxonomy in Chunk 3), and that `card_name` matching isn't load-bearing anywhere it shouldn't be.

**Finding (confirmed):** The allocation candidate resolution (`src/lib/allocation-candidates.ts`) uses a two-step lookup: `card_name` → `card_definitions.id` → `physical_copies.card_definition_id`. Step 1 is a plain string equality match on `card_name`. This means the name-mismatch risk is **real and load-bearing** in the allocation pipeline. If a deck_cards row has `card_name = "Lim-Dûl's Vault"` but card_definitions stores `"Lim-Dul's Vault"`, the candidate lookup silently returns zero results and the card appears permanently unresolvable.

**Mitigation options:**
1. Add `card_definition_id` to `deck_cards` during import (alongside `card_name`), then use the FK for candidate resolution instead of string matching.
2. Normalize card names on write (strip accents, normalize apostrophes, use Scryfall's canonical name).
3. Use `oracle_id` as the resolution key (requires storing oracle_id on deck_cards).

---

## New Chunks

### Chunk 11: Tracked vs. Generic Basic Lands

**Problem:** Every card slot in the system assumes individual resolution (a specific `physical_copy_id`), which is right for finite/contested cards and wrong for basic lands. Basic lands are bulk-owned, uncatalogued, and not something the user wants to track 1:1.

**Scope (explicitly decided):** Basic lands only — Plains, Island, Swamp, Mountain, Forest — plus Wastes and snow-covered variants if in the collection. Not a general-purpose "bulk card" flag. All non-land cards continue to be individually managed exactly as designed elsewhere in this doc set.

---

#### Behavior: Generic (Default)

- A basic land slot defaults to **generic**: no `physical_copy_id` resolution attempted or required.
- Exempt entirely from the Allocated/Allocated·proxy/Unallocated/Unowned taxonomy (Chunk 3).
- A null `physical_copy_id` on a generic land slot is the **expected, correct state** — not an error, never shown with a status badge.
- **No quantity verification against owned supply.** Generic land slots assume sufficient supply always. Do not check a stored count, do not flag shortage, do not require the land to exist in `physical_copies` at all.

#### Behavior: Tracked (Opt-In via Action)

- **Tracked emerges from action, not a mode toggle.** The moment a specific physical copy is deliberately assigned to a land slot (e.g. via the Picklist, same mechanism as any other card), that slot becomes tracked and behaves exactly like a normal card — real resolution, real status, its own row.
- The rest of that deck's requirement for the same land stays generic.
- Unassigning a tracked land slot reverts it to generic.

#### Display

- Generic slots with the same card name **collapse into a single row** in the deck Cards list — e.g. "Forest ×12" — with no status pill.
- If some of that count is individually tracked, the row shows a note ("2 tracked") and **expands** to show which specific printings (with Tracked badge), with the remainder noted as "+ N generic — not individually tracked."
- Fully generic rows (no tracked copies) show "Generic" label in the status slot area, muted.

![Collapsed view](../docs/images/chunk11-collapsed.png)
![Expanded view with tracked copies](../docs/images/chunk11-expanded.png)

#### Quantity Editing

- Generic lands are edited via a **quantity stepper** (+/− or direct numeric entry) on that row, not by repeated add/remove actions.
- The stepper control lives inside the add/remove interface (see Chunk 12).
- Decrement below 0 is blocked. Incrementing adds generic (unresolved) `deck_cards` rows.

![Quantity stepper in add/remove search](../docs/images/chunk11-stepper.png)

#### Detection Logic

A card slot is classified as a basic land eligible for generic treatment when:
```
card_name IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
              'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp',
              'Snow-Covered Mountain', 'Snow-Covered Forest')
```

Or more robustly: `type_line` from `card_definitions` contains `"Basic Land"` (catches any future basic land printings).

#### Dependencies

- **Chunk 3:** Must exempt generic land slots from its derivation logic. A generic land with `physical_copy_id IS NULL` should not count toward the "unallocated" total.
- **Chunk 12:** The quantity stepper control lives in the add/remove UI. Basic lands detected in search results render the stepper instead of an "Add" button.

### Chunk 12: Add/Remove Cards with Search

**Problem:** The add-card status treatment (Owned/Proxy/Over-allocated/Unowned, Chunk 9 of the base doc) was designed for search results, but the underlying add/remove interface itself — search, add, remove, applicable to both Brew and Boxed decks — hasn't been specified.

---

#### Search Interface

- A card search input for editing a deck's contents.
- Search results show the **Chunk 9 status treatment** (colored border: green = Owned, green-dashed = Proxy, amber = Over-allocated, red = Unowned) so the user knows before adding what allocation cost a card carries.
- Search covers the **full card pool**, not just cards already in `card_definitions` from prior imports.
- Wired to the existing `card_fuzzy_lookup` tool (`mtg_cards` table → Scryfall autocomplete fallback) — this already exists in `tool-registry.ts`, not new integration work.
- Results appear as they're found (debounced keystroke search, ~300ms).

#### Add Action (Normal Cards)

- Standard **Add** button per search result row.
- Creates a single `deck_cards` row for that card in the target deck.
- The existing resolution/allocation path fires automatically based on the deck's lifecycle state:
  - **Boxed deck (allocate=on):** auto-assign triggers (same as import path)
  - **Brew deck (allocate=off):** row created with `physical_copy_id = NULL`, no allocation attempted
- No Brew/Boxed branching logic in this interface — it just creates the row and lets existing rules apply.

#### Add Action (Basic Lands)

- When a search result is detected as a basic land (Chunk 11 detection logic), the row renders a **quantity stepper** (+/− buttons + direct numeric input) instead of an Add button.
- The stepper reflects the current count of that land already in the deck (0 if not present).
- Incrementing adds generic (unresolved) `deck_cards` rows. Decrementing removes them.
- Stepper is bounded: minimum 0, no upper bound enforced (user decides their land count).

#### Remove Action

- Cards already in the deck appear in an "Already in this deck" section below search results.
- Each row has a **Remove** button.
- Removing deletes the `deck_cards` row. If that row had a `physical_copy_id` (was resolved), the physical copy is simply unlinked — it's automatically back in storage. No orphan state, no cleanup logic required (same principle as Chunk 2 of the base doc: unassigned = storage by construction).
- For basic lands shown via stepper: decrementing the count to remove is the remove action — no separate Remove button needed.

#### Layout

Two sections in the panel:

1. **Search Results** — cards matching the query, each with status border + Add/stepper control
2. **Already in this Deck** — cards in the current deck matching the query (or all, if no query), each with Remove control

#### Acceptance Criteria

- Works identically whether the deck is Brew or Boxed — the interface itself doesn't change, only the downstream allocation consequence does (inherited from existing allocate logic, not new).
- Land rows in search results use the quantity stepper; all other rows use Add/Remove.
- Search covers cards not yet in the user's `card_definitions` (uses `mtg_cards` table / Scryfall fallback).
- Status borders on search results accurately reflect current collection state (Chunk 9 taxonomy).
- Removing a resolved card does not leave orphan state — physical copy returns to "free in storage" automatically.

#### Dependencies

- **Chunk 9:** Status treatment (colored borders on search result rows)
- **Chunk 11:** Basic land detection + quantity stepper behavior
- **Existing infrastructure:** `card_fuzzy_lookup` tool, auto-assign pipeline, deck lifecycle allocate rules
