# The Oracle — User Guide

> Last updated: 2026-07-19

## What is The Oracle?

The Oracle is a Commander deck management app that tracks your physical card collection at the individual-copy level. It knows which specific card is in which deck, what's available in storage, and what you're missing — so you can answer "which decks can I play tonight?" at a glance.

---

## Core Concepts

### Physical Copy Tracking

Every card you own is tracked as a unique entity with its own printing, condition, and location. When you assign a card to a deck, that specific copy is reserved — no other deck can claim it simultaneously.

### Deck Lifecycle

Decks move through three states:

| Status | Meaning | What happens |
|--------|---------|--------------|
| **Brewing** | Under construction or being reworked | Cards are not allocated. The deck is a plan, not a commitment. |
| **In Rotation** | Committed to your active decks | Claim completeness is tracked. Red alert if cards are missing. |
| **Graveyard** | Retired/shelved | Can optionally release all claimed cards for other decks to use. |

### Card Slot Statuses

Each card slot in a deck has one of five statuses:

| Status | Icon | Meaning |
|--------|------|---------|
| **Original** | Green filled circle | A physical copy you own is assigned to this slot |
| **Proxy** | Blue mask | A printed proxy is assigned to this slot |
| **Available** | Grey circle outline | You own a free copy in storage — ready to claim |
| **Claimed** | Amber lock | A copy exists but it's currently in another deck |
| **Unowned** | Pink do-not-disturb | You don't own any copy of this card |

---

## Importing a Deck

1. Click **Import Deck** from the decks page
2. Choose your input method:
   - **URL** — paste an Archidekt or Moxfield deck link
   - **Paste List** — paste a text decklist (e.g. "1 Sol Ring" per line)
   - **CSV** — upload a CSV file exported from Archidekt
3. After parsing, choose how to handle the cards:
   - **"These are new cards"** — adds cards to your collection AND fills all deck slots. Use when importing a precon or deck you physically own.
   - **"Match against my collection"** — checks what you already own. Shows Available/Claimed/Unowned for each card. No auto-assignment.
4. Every imported deck starts as **Brewing**

---

## Managing Cards in a Deck

### Three View Modes

- **Categories** (3-column masonry) — grouped by category, compact rows
- **Table** (single column) — full detail with set icon, edition name, price, mana cost
- **Gallery** — card images in a grid

### Card Row Features

- **Drag handle** — reorder cards (future)
- **Checkbox** — select for bulk actions (future)
- **Mana cost pips** — colored symbols showing the card's casting cost
- **Set icon** — expansion symbol with rarity coloring
- **Status chip** — clickable, opens the allocation popover
- **Kebab menu** — remove card from deck

### Adding Cards

Use the **+ Add card...** search field in the toolbar. Type 2+ characters to get Scryfall autocomplete suggestions. Select a card to add it to the deck.

---

## The Picklist

The Picklist (its own tab on the deck page) shows all unresolved cards in three columns:

### In Storage (Available)
Cards you own that are free — not assigned to any deck. Grouped by storage location. Click **Claim** to assign to this deck instantly.

### In Decks (Claimed)
Cards that exist in your collection but are currently assigned to another deck. Shows which deck holds each card and its status (Brewing/In Rotation/Graveyard). Click **Claim** to pull the card from that deck into this one. In Rotation decks require confirmation.

### Unowned
Cards you don't have any copy of. Click **Proxy** to create a proxy and assign it.

### Progress Bar
At the top: a stacked color bar showing how many cards are filled (Original + Proxy) vs what's still needed (In Storage + In Decks + Unowned).

---

## Basic Lands

Two types:

### Generic Lands
- Show as "Forest" with a quantity (e.g. "7 Forest")
- Always considered "Original" — no allocation needed
- Use the kebab menu's +/- to adjust quantity

### Specific-Printing Lands
- Show with set code: "Mountain (DSK)"
- Participate in normal allocation (can be Available/Claimed/Unowned)
- Use **Make generic** in the kebab menu to convert back to generic

When importing a deck, lands with set codes become specific-printing. Lands without become generic.

---

## Deck Status Transitions

```
Brewing ──────────► In Rotation
   ▲                     │
   │                     │
   │   ◄─────────────────┘
   │
   ▼                     ▼
Graveyard ◄──── (from either)
   │
   └──► Brewing (Resurrect)
```

- **Brewing → In Rotation**: requires the deck to have the correct number of cards for its format (100 for Commander, 60+ for Standard/Modern/etc.)
- **In Rotation → Brewing**: always allowed (pulling back for rework)
- **Anything → Graveyard**: always allowed. If cards are claimed, you'll be prompted to release them or keep them claimed.
- **Graveyard → Brewing**: always allowed (resurrect)

---

## Collection Management

### Collection View
Browse all physical cards you own. Two view modes:
- **Grid** — card images with owned/used counts
- **List** — table with columns: checkbox, qty, name, mana, set icon + name, finish, price, kebab menu

### Storage Locations
Cards not assigned to decks live in storage locations (e.g. "Trade Binder", "Unsorted Box"). These show in the Picklist's "In Storage" column.

---

## Deck Grid (Home Page)

Each deck tile shows:
- Commander art
- Deck name + commander name
- Card count: `current/required Cards` (amber when under target)
- Status badge (Brewing / In Rotation / Graveyard)
- Claim completeness dot (green/amber/red) for In Rotation decks
- Red alert triangle when In Rotation decks have missing cards

Below the grid: rotation summary ("5 decks in rotation") + "N decks need cards" filter.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` / `Ctrl+K` | Open smart search |

---

## Known Limitations

- Single-user only (no sharing/collaboration)
- No offline support (requires internet)
- No card scanning (use Archidekt/Manabox to scan, then import)
- Paste import grammar: `<qty>[x] <name>` per line, `Commander:` section header
- Some double-faced cards (names with `//`) may not resolve mana costs or images
