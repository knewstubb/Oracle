# Card & Deck Management — Complete System Guide

> How Oracle tracks which physical cards back which decks, from onboarding through daily use.

---

## The Core Model (Three Independent Axes)

Oracle tracks three things about every deck, and they're deliberately independent — none implies the others:

| Axis | What it answers | Values | Stored as |
|------|----------------|--------|-----------|
| **Lifecycle** | What stage is this deck in? | Brew → Boxed → Archived | `decks.status` |
| **Allocate** | Do this deck's cards count against the collection? | On / Off | `decks.allocate` (boolean) |
| **Completeness** | Does this deck have all its cards physically resolved? | N/100 | Computed from `deck_cards.physical_copy_id IS NOT NULL` count |

A deck can be Boxed, Allocate off (Sandbox), and Incomplete — all simultaneously. These three facts don't control each other.

---

## What "Resolved" Means

Each card slot in a deck (`deck_cards` row) can be:

- **Resolved** — `physical_copy_id` points to a specific `physical_copies` row. "This deck slot is backed by *this exact* physical card."
- **Unresolved** — `physical_copy_id` is NULL. "This deck needs a Sol Ring, but we haven't said which one yet."

Resolution is the act of linking a deck slot to a specific physical card. It can happen:
- Automatically (during import, via the auto-assign engine — Tiers 1–2 from free storage)
- Manually (via the interactive picklist — all 5 tiers including confirmation-gated reassignment)

---

## Lifecycle States

| State | Meaning | Deletable? | Default Allocate |
|-------|---------|-----------|-----------------|
| **Brew** | Under construction. Cards being chosen, not physically assembled yet. | Yes | Off |
| **Boxed** | Fully built and physically assembled. Considered playable. | No (must archive first) | On |
| **Archived** | Shelved. No longer actively played. | Yes | Forced off, toggle disabled |

Transition to Boxed is always manual — a deliberate declaration, not automatic on hitting 100 cards.

---

## The Allocate Toggle ("Sandbox")

Controls whether this deck's resolved cards are visible to other decks' picklists.

| Allocate = On | Allocate = Off (Sandbox) |
|--------------|--------------------------|
| This deck's cards are "claimed" — other decks see them as unavailable (Tier 3 or 4 in the picklist) | This deck's cards are invisible to other decks — they appear as free in storage |
| Normal state for a Boxed deck | Atypical — means "I have this deck built but don't want it competing for cards right now" |

**What Allocate does NOT control:**
- Whether cards get resolved during import (they always do, if matches exist)
- Whether the deck shows on the grid (it always does)
- Whether you can use the picklist (you always can)

**Confirmation modal:** Only gates the OFF transition (turning allocate off creates a mismatch risk — cards are still physically in the deck but the system treats them as available).

---

## Screens & Where Things Happen

### 1. Onboarding (`/onboarding`)

**Purpose:** One-time bulk import of your Archidekt collection + decks.

**Flow:**
1. Enter Archidekt collection URL → system imports all physical copies to `physical_copies` table
2. Deck picker shows all your Archidekt decks → select which ones to bring in
3. Selected decks are imported sequentially, each resolved against the shared supply pool
4. Summary shows match/short counts per deck

**What happens during resolution:**
- Cards are matched against your imported collection (Tiers 1–3)
- Each match writes `physical_copy_id` to the `deck_cards` row
- Cards with no available match stay unresolved (not a failure — fixable later via picklist)
- All imported decks default to `status: 'boxed'`, `allocate: false` (Sandbox)

**Why everything shows as Sandbox after onboarding:**
- The default is deliberately conservative — your decks are imported but not yet "competing" for cards against each other
- Turn Allocate on per-deck when you're ready for that deck's claims to be visible system-wide

---

### 2. Decks Grid (`/`)

**What it shows:**
- All decks with their status badge (Brew/Boxed/Archived)
- Completeness badge (orange N/100) on Boxed decks that are incomplete
- "Sandbox" badge on Boxed decks with Allocate off
- Card count, commander, colour identity

**Filter tabs:** Brew | Boxed | Archived

---

### 3. Deck Detail Page (`/decks/[id]`)

**Header actions:**
- **Allocate toggle** — switch Sandbox on/off
- **Status control** — Brew / Boxed / Archived segmented buttons
- **Delete button** — only for Brew and Archived decks
- **Push to Archidekt** — for syncing back

**Tabs:** Cards, Analysis, Combos, Upgrade, Strategy

---

### 4. Picklist (`/decks/[id]` — Picklist tab/section)

**Purpose:** Interactively resolve which specific physical card backs each deck slot.

**Shows:** All deck_cards for the deck, grouped by resolution status.

**For each unresolved card, candidates are ranked in 5 tiers:**

| Tier | Source | Control | Auto-selectable? |
|------|--------|---------|-----------------|
| 1 | Free original in storage | Checkbox | Yes |
| 2 | Free proxy in storage | Checkbox | Yes |
| 3 | Reassign from a Brew deck | Checkbox | Yes |
| 4 | Reassign from a Boxed deck | Checkbox → Confirmation modal | **No** — never auto-selected |
| 5 | Print new proxy (creates a new physical_copies row) | Dedicated button | No |

**Key rules:**
- Per-row, atomic commits (never batched)
- No auto-cascade — pulling a card from another deck never triggers backfill of the gap
- Undo is exact restore — if the prior slot was claimed elsewhere since, undo is blocked (not silently redirected)

---

### 5. Single Deck Import (Import Deck modal)

**Purpose:** Import one deck at a time from a URL.

**Flow:**
1. Enter Archidekt/Moxfield URL → fetch deck data
2. Confirmation step: see deck name/card count, choose Boxed or Brew
3. Import creates deck + deck_cards rows
4. Auto-assign (Tier 1–2, fire-and-forget) runs in background

---

### 6. Collection Section (`/collection`)

**Shows:** Your physical card inventory (`physical_copies` table).

**Relationship to decks:** Each `physical_copies` row can be linked to at most one `deck_cards` row (enforced by partial unique index). A physical card is either:
- Free in storage (not linked to any deck)
- Assigned to a specific deck slot

---

### 7. Settings (`/settings`)

- **Clear All Data** — dev tool to wipe everything for testing

---

## Data Flow Summary

```
Archidekt API
    │
    ├── fetchCollection() → card_definitions + physical_copies (one row per card instance)
    │
    └── fetchDeck(id) → normalize → deck + deck_cards (one row per card slot)
                                          │
                                          ▼
                              Batch Resolution (warm-start)
                              OR Auto-Assign (single import)
                              OR Manual Picklist (interactive)
                                          │
                                          ▼
                              deck_cards.physical_copy_id = physical_copies.id
                              (the "resolution" — linking a slot to a specific card)
```

---

## Common Scenarios

### "I just imported everything and every deck shows Sandbox"
Expected. The onboarding defaults all decks to `allocate: false`. Turn Allocate on per-deck when you want that deck's claims to count against the pool.

### "A deck shows 86/100 — what are the missing 14?"
Those 14 card slots have no available physical copy to match. Either:
- You don't own that card at all
- You own it but all copies are already claimed by higher-priority decks
- Open the picklist to see what's short and decide: buy it, proxy it, or steal from another deck (Tier 4)

### "I turned Allocate on and now another deck went from 100/100 to 97/100"
The newly-allocated deck's cards are now "claimed." If another deck was sharing those same physical copies, those shared slots can't both be resolved — one deck keeps the card, the other becomes short. This is the system correctly reflecting that you can't have the same physical card in two places.

### "Can I undo a card assignment?"
Yes — the picklist has per-row undo (toast button + history panel). Undo does exact restore: the card goes back where it was. If that slot was claimed by something else in the meantime, undo is blocked with an explanation.

### "What's the difference between Brew and Boxed?"
- **Brew:** you're still deciding which cards go in this deck. It's a work in progress.
- **Boxed:** the deck is physically assembled. All cards are (ideally) resolved to specific copies. It's considered playable.

The key protection: Boxed decks can't be deleted (must archive first), and stealing a card from a Boxed deck (Tier 4) always shows a confirmation modal.

---

## Database Tables (simplified)

| Table | What it holds | Key columns |
|-------|--------------|-------------|
| `decks` | One row per deck | `status`, `allocate`, `card_count` |
| `deck_cards` | One row per card slot in a deck | `card_name`, `physical_copy_id` (nullable FK), `ownership_status` |
| `physical_copies` | One row per physical card you own | `card_definition_id`, `is_proxy`, `is_foil`, `condition`, `storage_location_id` |
| `card_definitions` | One row per unique card identity (oracle-level) | `oracle_id`, `card_name` |

**The critical link:** `deck_cards.physical_copy_id → physical_copies.id` — this is what "resolution" writes. A partial unique index ensures no physical copy is claimed by two deck slots simultaneously.
