# The Oracle — User Guide

> Last updated: 2026-07-22

## What is The Oracle?

The Oracle is a Commander deck management app that tracks your physical card collection at the individual-copy level. It knows which specific card is in which deck, what's available in storage, and what you're missing — so you can answer "which decks can I play tonight?" at a glance.

---

## Core Concepts

### Physical Copy Tracking

Every card you own is tracked as a unique entity with its own printing, condition, and location. When you assign a card to a deck, that specific copy is reserved — no other deck can use it simultaneously.

### Deck Lifecycle

Decks move through three states:

| Status | Meaning | What happens |
|--------|---------|--------------|
| **Brewing** | Under construction or being reworked | Cards are not allocated. The deck is a plan, not a commitment. |
| **In Rotation** | Committed to your active decks | Allocation completeness is tracked. Red alert if cards are missing. |
| **Graveyard** | Retired/shelved | Can optionally release all allocated cards for other decks to use. |

### Card Slot Statuses

Each card slot in a deck has one of six statuses:

| Status | Icon | Meaning |
|--------|------|---------|
| **Original** | Green filled circle | A physical copy you own is assigned to this slot |
| **Proxy** | Blue mask | A printed proxy is assigned to this slot |
| **Available** | Grey circle outline | The exact printing you want is free in storage |
| **Alternate** | Grey swap arrows | A different printing of the card is free in storage |
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

### Binders
Cards not assigned to decks live in binders (e.g. "Trade Binder", "Unsorted Box"). These show in the Picklist's "In Storage" column.

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

## Card Scanner

Scan physical cards with your phone camera to add them to your collection.

### How to Use

1. Navigate to **Scan** in the sidebar (or hamburger menu on mobile)
2. Choose where scanned cards should go: Collection (unsorted), a specific deck, or a binder
3. Tap **Start Scanning**
4. Point your camera at a card — position it within the guide frame
5. Tap the **shutter button** (big white circle) to capture
6. The app reads the card name via OCR and shows "Is this your card?" with a preview — tap **Yes** to accept or **No** to dismiss
7. Alternatively, type the card name in the text input at the bottom and tap Add (manual fallback)
8. To scan the same card again (multiple copies): confirm the "Add another copy?" prompt
9. Tap **Review & Confirm** when done
10. On the reconciliation page: review all cards, toggle proxy/foil, set condition, remove mistakes
11. Tap **Confirm X Cards** — only then are cards saved to your collection

### Tips
- Hold cards flat against a contrasting surface for best OCR results
- Avoid glare on the card name area (the indicator shows green/yellow/red)
- The manual text input is often faster for single cards — camera is best for bulk scanning
- Nothing is saved until you confirm on the reconciliation page

---

## Printing Picker

Change which printing (set/edition) a card is in your deck.

1. On any card row, tap the **kebab menu** (three dots)
2. Tap **Change printing**
3. A visual grid shows all available printings from Scryfall
4. **Your collection** section at top — printings you own (with their location: "In deck: X" or "Binder: Y")
5. **All printings** section below — every printing ever released
6. Search by set name or code
7. Tap a card to select it — the deck slot updates immediately

---

## Alternate Printing Badge

When a deck slot specifies a particular printing but you only own a different one:

| Badge | Meaning |
|-------|---------|
| **Available** (grey) | The exact printing you want is free in storage |
| **Alternate** (grey, swap icon) | A different printing of the same card is free |

Both are "fillable" — the distinction tells you whether it's the exact version you specified or a substitute.

---

## Price Tracking

### Collection Value
On the Collection page, a banner shows:
- **Collection Value** — total market value of all cards you own
- **Gain/Loss** — difference between current market value and what you paid (when purchase prices are set)
- **Cards** — total physical copies
- **Most Valuable** — your highest-value card

### Per-Deck Value
Each deck's header shows the total value of its cards (e.g. `· $147.30`).

### Refreshing Prices
Prices come from Scryfall and are cached. The collection value banner includes a **Refresh Prices** button (right side) that updates all market prices from Scryfall's current data. The refresh takes 30-60 seconds depending on collection size — the button shows a spinner while working, and a toast confirms when complete.

---

## Installing as an App (PWA)

The Oracle can be installed to your phone's home screen for a native app experience:

**iOS Safari:**
1. Tap the Share button
2. Tap "Add to Home Screen"
3. Tap "Add"

**Android Chrome:**
1. Tap the three-dot menu
2. Tap "Add to Home Screen" or "Install app"

Once installed: full-screen (no browser chrome), persistent camera permissions, and faster load times.

---

## Mobile Navigation

On phones, the sidebar is replaced by a hamburger menu (top-right). Tap it to open a slide-out drawer with all navigation options + sign out.

---

## Binders

Binders (formerly "Storage Locations") are where unallocated cards live. Name them after your physical binders (e.g. "Trade Binder", "Commander Staples", "Bulk Box").

Cards exist in exactly one place: a binder OR a deck. When you claim a card for a deck, it leaves its binder. When a deck is disassembled, cards return to the available pool.

---

## Deck Export

Copy your decklist to clipboard in MTGA format:
1. On the deck page, tap the **Export** button (clipboard icon in the header)
2. The decklist is copied in format: `1 Card Name (SET)`
3. Grouped by: Commander / Deck / Sideboard / Maybeboard

---

## Collection Export

Download your entire collection as a CSV file:
1. On the Collection page, tap the **Export** button (download icon, next to Import)
2. A CSV file downloads with all your physical copies
3. Columns: Name, Quantity, Edition Code, Scryfall ID, Finish, Condition, Proxy, Purchase Price, Date Added
4. Compatible with re-import into The Oracle, or import into other tools

---

## Importing Decks

### Supported Platforms (URL import)

Paste a deck URL from any of these platforms:
- **Archidekt** — `archidekt.com/decks/{id}`
- **Moxfield** — `moxfield.com/decks/{id}`
- **MTGGoldfish** — `mtggoldfish.com/deck/{id}`
- **TappedOut** — `tappedout.net/mtg-decks/{slug}/`
- **Deckbox** — `deckbox.org/sets/{id}`

### Text/Paste Import

Paste a decklist in any common format:
- `1 Sol Ring` (basic)
- `1x Sol Ring` (quantity with x)
- `1 Sol Ring (CMR) 472` (MTGA format with set + collector number)
- Use `Commander:` on its own line to mark the next cards as commanders
- `SB: 1 Card Name` (sideboard prefix)
- Blank lines and `//` comments are ignored

---

## Goldfish / Playtesting

Test-draw your deck without a real game:

1. On any deck page, click the **Goldfish** tab
2. You start with a shuffled library and 7-card hand
3. Controls:
   - **New Game** — reshuffle and redraw
   - **Draw** — draw one card (advances turn counter)
   - **Mulligan** — shuffle hand back, draw 7 again (London mulligan)
   - **Undo** — revert the last action
4. **Double-click** a card in hand to play it to the battlefield
5. **Double-click** a card on the battlefield to send it to the graveyard
6. **Click** any card to see its full image in the bottom-right preview

---

## Known Limitations

- Single-user only (no sharing/collaboration)
- Card scanner requires Google Cloud Vision API key to be configured
- Some double-faced cards (names with `//`) may not resolve images from camera (manual entry works)
- Goldfish mode shows card names only (not full card images in zones) for performance
