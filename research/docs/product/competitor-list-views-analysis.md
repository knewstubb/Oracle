# Competitor List View Analysis

> Last updated: 2026-07-27
> Purpose: Deep research into how competing MTG platforms display data in list views — columns, sorting, grouping, and filtering at collection, deck, and storage levels.

---

## Executive Summary

This analysis covers the six major MTG collection/deck management platforms: **ManaBox**, **Moxfield**, **Archidekt**, **Deckbox**, **DragonShield**, and **TCGPlayer**. Each platform takes a different approach to list views based on their primary use case (mobile scanning vs web deckbuilding vs trading).

Key patterns that emerge:
1. **Grouping is king** — all platforms offer grouping by type, color, CMC, set, and rarity
2. **Multiple view modes** — grid/image, list/text, and stacked/pile views are standard
3. **Scryfall syntax** — becoming the de facto filter language for advanced users
4. **Collection completeness** — set completion tracking is a common differentiator
5. **Price is everywhere** — total value and per-card pricing are table stakes

---

## Platform-by-Platform Analysis

### 1. ManaBox (Mobile-first collection tracker)

**Primary model:** Binders (owned) + Lists (wishlists) + Registered Decks

#### Collection View

| Feature | Details |
|---------|---------|
| **View modes** | Grid (card images), List (condensed text) |
| **Grouping options** | Set, Color, Card Type, Rarity — **combinable** (e.g., group by Set → then by Color within set) |
| **Sort options** | Name (A-Z), Mana Value, Price, Date Added, Quantity |
| **Group sorting** | Total cards, Collected cards, Completion % |
| **Filters** | Full Scryfall-style advanced search (type, color, CMC, oracle text, etc.) |

**Columns in list view:**
- Card name
- Set icon/code
- Quantity owned
- Price (configurable: TCGPlayer, Cardmarket, Card Kingdom)
- Foil indicator
- Condition badge

**Collector Mode (unique feature):**
- Shows all cards in a set/group, highlighting owned vs missing
- Completion percentage per group
- "Group printings" option to ignore variants (just track unique card names)
- Can apply any search filter (e.g., "all Dragons I own")

#### Deck View

| Feature | Details |
|---------|---------|
| **View modes** | Stacked (by category), Grid, List |
| **Grouping options** | Card Type, Color, CMC, Custom Categories |
| **Sort options** | Name, Mana Value, Price, EDHREC Rank |
| **Columns** | Name, Qty, CMC, Price, Set |

**Deck-specific features:**
- Stats panel: Mana curve, Type distribution, Color pie
- Missing cards highlighted (not in collection)
- "Build from collection" mode — shows where cards are located physically

#### Storage/Binder View

| Feature | Details |
|---------|---------|
| **View modes** | Grid, List |
| **Grouping** | Same as collection (Set, Color, Type, Rarity) |
| **Sorting** | Same as collection |
| **Unique features** | Binder names mirror physical storage for card location |

**Data shown per binder:**
- Binder name + custom image
- Card count
- Total value
- Value change (gain/loss since purchase)

---

### 2. Moxfield (Web-first deckbuilder)

**Primary model:** Collection + Binders (subsets) + Decks

#### Collection View

| Feature | Details |
|---------|---------|
| **View modes** | Images (grid), Text (list), Checklist |
| **Grouping options** | CMC, Color, Card Type, Set, Tags |
| **Sort options** | Name, Mana Value, Price, Collector Number, Date Added |
| **Filters** | Full Scryfall query syntax support |

**Columns in text view:**
- Card name
- Set code
- Collector number
- Quantity (regular)
- Quantity (foil)
- Condition
- Language
- Price
- Foil indicator ("F")
- "In Binders" column (shows which binders contain the card)
- "In Decks" column (which decks reference the card)

**Notable features:**
- Scryfall syntax in search bar (e.g., `t:creature cmc<=3 c:green`)
- Binder filtering (show cards in specific binder, or exclude binders)
- Collection Tracker integration — when viewing a deck, shows which cards you own

#### Deck View

| Feature | Details |
|---------|---------|
| **View modes** | Visual (stacked), Text, Spreadsheet, Playtest |
| **Grouping options** | Type, CMC, Color, Color Identity, Custom Tags |
| **Sort options** | Name, Mana Value, EDHREC Rank, Price, Deck Order |
| **Filters** | Highlighter tool with Scryfall syntax |

**Columns in text/spreadsheet view:**
- Card name
- Quantity
- CMC / Mana cost (pips)
- Type line
- Price
- Set
- Tags (color-coded)

**Unique deck features:**
- "Highlighter" tool — apply Scryfall filter to highlight matching cards in visual view
- Tag categories with custom colors
- Board separation (Main, Side, Maybe, Considering)
- Collection Tracker badge (green checkmark = owned, yellow = partially owned)

#### Binder View

| Feature | Details |
|---------|---------|
| **View modes** | Same as collection (Images, Text, Checklist) |
| **Sorting** | Alphabetical only (user feedback requests MV, price sorting) |
| **Grouping** | Same as collection |
| **Unique features** | Binders are subsets of collection, cards exist in collection + 0+ binders |

---

### 3. Archidekt (Web-first deckbuilder, visual focus)

**Primary model:** Collection (unified) + Deck Folders + Decks

#### Collection View

| Feature | Details |
|---------|---------|
| **View modes** | Stacks, Grid, Text, Spreadsheet |
| **Grouping options** | Set, Color, Type, Rarity, CMC, Custom |
| **Sort options** | Name, Price, CMC, Color, Rarity, Collector Number, Date Added |
| **Filters** | Archidekt Search (card name) + Syntax Search (Scryfall-style) |

**Columns (spreadsheet view):**
- Card name
- Set
- Quantity
- Price
- Foil
- Condition
- Tags
- Location (which folder/deck)

**Unique collection features:**
- **Multi-platform tracking** — separate Paper, MTGO, MTGA collections
- Printings default to collection when adding cards to decks
- Full collection import/export (CSV, text)

#### Deck View

| Feature | Details |
|---------|---------|
| **View modes** | Stacks (visual, tactile feel), Text, Spreadsheet, Grid |
| **Grouping ("Stacked by")** | Type, CMC, Color, Color Identity, Custom Categories, Tags |
| **Sort within stacks** | Name, CMC, Price, Color, EDHREC Rank |
| **Stack positioning** | User can drag stack groups to custom positions on page |

**Columns (text/spreadsheet):**
- Card name
- Quantity
- Category (user-defined)
- CMC
- Price
- Set
- Tags
- Foil indicator

**Unique deck features:**
- **Category Templates** — predefined category sets (e.g., "EDH Standard Categories")
- **Multiselect editing** — select multiple cards, batch change categories/printings
- **"Optimize Printings"** — batch set selected cards to cheapest/newest/fanciest version
- **EDH Recs tab** — EDHREC suggestions integrated into search

#### Storage

Archidekt doesn't have a separate "storage" concept — cards are in the Collection and optionally in Decks. No binder/folder system for physical location tracking.

---

### 4. Deckbox (Web-first, trading focus)

**Primary model:** Inventory + Tradelist + Wishlist + Decks

#### Collection (Inventory) View

| Feature | Details |
|---------|---------|
| **View modes** | List (default), Images |
| **Grouping options** | Set, Color, Type, Rarity, Condition |
| **Sort options** | Name, Price, Quantity, Set, Collector Number, Date Added |
| **Filters** | Set, Color, Type, Rarity, Condition, Foil, Language, Min/Max Price |

**Columns:**
- Card name
- Set (with icon)
- Quantity
- Tradelist quantity (subset marked for trade)
- Condition
- Foil indicator
- Language
- Price (TCGPlayer/CardKingdom/Cardmarket)
- "In Decks" count

**Unique features:**
- **Trade matching** — automatically finds users who have cards you want and want cards you have
- **Tradelist/Wishlist** as first-class concepts (not just tags)
- Price history per card
- Multiple condition tracking (same card, different conditions = separate entries)

#### Deck View

| Feature | Details |
|---------|---------|
| **View modes** | List, Visual |
| **Grouping** | Type, CMC, Color |
| **Sorting** | Name, CMC, Price |
| **Filters** | Basic type/color/CMC |

**Columns:**
- Card name
- Quantity
- CMC
- Price
- "Owned" indicator (cross-references Inventory)

**Missing cards view:**
- Lists cards in deck not in Inventory
- Total cost to complete deck
- Direct purchase links

---

### 5. DragonShield Card Manager (Mobile-first, scanning focus)

**Primary model:** Folders (physical locations) + Decks

#### Collection (Folder) View

| Feature | Details |
|---------|---------|
| **View modes** | Grid (card images), List |
| **Grouping options** | Set, Color, Type, Rarity, CMC |
| **Sort options** | Name, Price, CMC, Quantity, Date Added, Value Change |
| **Filters** | Mana Cost, Card Color, Type, Set, Rarity |

**Columns in list view:**
- Card name
- Set code
- Quantity
- Price (TCGPlayer, Cardmarket, Card Kingdom, MTGMintCard)
- Foil indicator
- Condition
- Language

**Folder stats (per folder):**
- Card count
- Total value
- Value change over time (win/loss %)
- Mana cost distribution
- Color distribution

**Unique features:**
- **Real-time card scanning** with any-language support
- **Price charts** (30-day history per card)
- **Format legality** and official rulings shown on card detail
- **Friends/social** — share folders, see friends' collections

#### Deck View

| Feature | Details |
|---------|---------|
| **View modes** | Grid, List |
| **Grouping** | Type, CMC, Color |
| **Sorting** | Name, CMC, Price |

**Deck-specific:**
- Deck statistics (curve, colors, types)
- Missing cards list
- Total deck value

---

### 6. TCGPlayer Collection Tracker (Web/app, marketplace-integrated)

**Primary model:** Collection Lists + Decks

#### Collection View

| Feature | Details |
|---------|---------|
| **View modes** | Grid, List |
| **Grouping options** | Set, Type, Rarity |
| **Sort options** | Name, Price, Quantity, Date Added, Value Change |
| **Filters** | Set, Rarity, Type, Foil, Price Range |

**Columns:**
- Card name
- Set
- Quantity
- Price (TCGPlayer Market)
- Price change ($ and %)
- Foil indicator
- Condition

**Unique features:**
- **Auto-updates on purchase** — cards bought on TCGPlayer automatically added
- **Market price integration** — direct buy links
- **Trading potential** indicator (cards with high trade value)
- **Have/Want/Trade** lists

---

## Cross-Platform Comparison Matrix

### Grouping Options

| Grouping | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|----------|---------|----------|-----------|---------|--------------|-----------|
| Card Type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Color Identity | - | ✅ | ✅ | - | - | - |
| CMC / Mana Value | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Set | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rarity | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| Custom Categories | - | ✅ (tags) | ✅ | - | - | - |
| Supertypes/Subtypes | - | ❌ (requested) | - | - | - | - |

### Sorting Options

| Sort | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|------|---------|----------|-----------|---------|--------------|-----------|
| Name (A-Z) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CMC / Mana Value | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Quantity | ✅ | - | - | ✅ | ✅ | ✅ |
| Date Added | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Collector Number | - | ✅ | ✅ | ✅ | - | - |
| EDHREC Rank | - | ✅ | ✅ | - | - | - |
| Value Change | ✅ | - | - | - | ✅ | ✅ |
| Color | - | - | ✅ | - | - | - |
| Rarity | - | - | ✅ | - | - | - |

### Columns Displayed

| Column | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|--------|---------|----------|-----------|---------|--------------|-----------|
| Card Name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quantity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Set | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Collector Number | - | ✅ | ✅ | ✅ | - | - |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Foil Indicator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Condition | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Language | - | ✅ | - | ✅ | ✅ | - |
| CMC / Mana Cost | ✅ | ✅ | ✅ | ✅ | - | - |
| Type Line | - | ✅ | - | - | - | - |
| Tags / Categories | - | ✅ | ✅ | - | - | - |
| Location (binder/deck) | ✅ | ✅ | - | ✅ | ✅ | - |
| Tradelist Qty | - | - | - | ✅ | - | - |
| Value Change | ✅ | - | - | - | ✅ | ✅ |
| Purchase Price | ✅ | - | - | - | - | - |

### Filter Capabilities

| Filter | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|--------|---------|----------|-----------|---------|--------------|-----------|
| Card Name (text) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scryfall Syntax | ✅ | ✅ | ✅ | - | - | - |
| Set | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| CMC Range | ✅ | ✅ | ✅ | - | ✅ | - |
| Type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rarity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Oracle Text | ✅ | ✅ | ✅ | - | - | - |
| Price Range | - | - | - | ✅ | - | ✅ |
| Foil Only | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| Condition | - | - | - | ✅ | - | - |
| Format Legality | ✅ | ✅ | - | - | ✅ | - |
| "In Binder" | ✅ | ✅ | - | - | ✅ | - |
| "In Deck" | - | ✅ | - | ✅ | - | - |
| "Own" vs "Need" | ✅ | ✅ | - | ✅ | - | - |

---

## View Modes Comparison

### Collection Level

| Platform | Grid/Images | List/Text | Spreadsheet | Stacked/Piles | Checklist |
|----------|-------------|-----------|-------------|---------------|-----------|
| ManaBox | ✅ | ✅ | - | - | - |
| Moxfield | ✅ | ✅ | - | - | ✅ |
| Archidekt | ✅ | ✅ | ✅ | ✅ | - |
| Deckbox | ✅ | ✅ | - | - | - |
| DragonShield | ✅ | ✅ | - | - | - |
| TCGPlayer | ✅ | ✅ | - | - | - |

### Deck Level

| Platform | Grid/Images | List/Text | Spreadsheet | Stacked/Piles | Playtest |
|----------|-------------|-----------|-------------|---------------|----------|
| ManaBox | ✅ | ✅ | - | ✅ | ✅ |
| Moxfield | ✅ | ✅ | ✅ | ✅ | ✅ |
| Archidekt | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deckbox | ✅ | ✅ | - | - | - |
| DragonShield | ✅ | ✅ | - | - | - |
| TCGPlayer | ✅ | ✅ | - | - | - |

---

## Storage/Binder Level (Physical Location Tracking)

| Platform | Storage Concept | Features |
|----------|-----------------|----------|
| **ManaBox** | Binders (named, mirror physical) | Per-binder stats, value tracking, location shown in search results |
| **Moxfield** | Binders (subsets of collection) | Filter by binder, exclude binders from collection tracker |
| **Archidekt** | None (no physical location) | Multi-platform (Paper/MTGO/MTGA) but no location within paper |
| **Deckbox** | Inventory/Tradelist/Wishlist | Tradelist is "subset available for trade" |
| **DragonShield** | Folders (named, custom images) | Per-folder stats, mirrored physical organization |
| **TCGPlayer** | Lists (custom named) | Have/Want/Trade lists, but not physical location |

---

## Unique/Standout Features

### ManaBox
- **Combinable grouping** — group by Set, then group again by Color within each set
- **Collector Mode** — shows owned vs missing cards in any groupable set
- **Group sorting** — sort groups by completion %, total cards, or collected cards
- **Purchase price tracking** — records what you paid, shows gain/loss

### Moxfield
- **Scryfall syntax everywhere** — full query language in all search contexts
- **"In Binders" / "In Decks" columns** — see where each card is used
- **Highlighter tool** — apply filter overlay to visual deck view
- **Collection Tracker toggle** — green/yellow/red ownership badges on deck cards

### Archidekt
- **Stack positioning** — drag category stacks to custom positions on deck page
- **"Optimize Printings"** — batch change selected cards to cheapest/oldest/fanciest
- **Category Templates** — predefined category sets for quick deck setup
- **Multi-platform collections** — separate Paper, MTGO, MTGA tracking

### Deckbox
- **Trade matching** — automatic partner finder based on tradelist/wishlist overlap
- **Multiple condition tracking** — same card, different conditions = separate entries
- **Tradelist quantity** — separately track "qty owned" vs "qty for trade"

### DragonShield
- **Any-language scanning** — real-time translation of foreign cards
- **Price charts** — 30-day history per card
- **Social features** — friends, share folders, view others' collections

### TCGPlayer
- **Auto-add on purchase** — buying from TCGPlayer updates collection
- **Market integration** — direct buy/sell links
- **Trading potential** indicator — highlights cards with high trade value

---

## Gap Analysis: The Oracle vs Competitors

### What The Oracle Does Well (unique strengths)

| Feature | The Oracle Approach | Competitor Equivalent |
|---------|---------------------|----------------------|
| **Instance-level allocation** | Track which specific physical copy is in which deck slot | None — all track "qty in deck" |
| **Shared card conflict resolution** | Claimed status + Tier system + Picklist workflow | Moxfield shows "in decks" but no resolution |
| **Deck lifecycle** | Brew → Built → Archived with allocation behavior | None — decks are static lists |
| **AI analysis** | Strategy, Upgrade, Debrief, Brew modes | None |
| **Status-based card state** | Open/Claimed/Proxied/Original per copy | Foil/condition only |

### Missing From The Oracle (based on competitors)

| Feature | Competitor | Priority | Notes |
|---------|------------|----------|-------|
| **Grouping options** | All | High | Only have Type grouping; need Color, CMC, Set, Rarity |
| **Sorting options** | All | High | Need Price, CMC, Date Added, Collector Number sorting |
| **Collection completion %** | ManaBox | Medium | "You have 45/264 cards from MH2" |
| **Scryfall filter syntax** | Moxfield/ManaBox | Medium | Full query language for advanced users |
| **Binder/deck location column** | Moxfield/ManaBox | Medium | "Where is this card?" in collection view |
| **Multiple view modes** | All | Medium | Need Grid, List, Spreadsheet options |
| **Deck total value** | All | Medium | Sum of all card prices in deck |
| **Price provider selection** | All | Low | TCGPlayer, Cardmarket, Card Kingdom options |
| **Value change tracking** | ManaBox/DragonShield | Low | Track gain/loss from purchase price |
| **Collector Number sorting** | Moxfield/Deckbox | Low | For set collectors |
| **Missing cards export** | ManaBox | Low | Export Picklist as text/CSV for shopping |

---

## Recommendations for The Oracle

### High Priority (table stakes for modern MTG app)

1. **Add grouping options:**
   - Type (existing) ✅
   - Color / Color Identity
   - CMC / Mana Value
   - Set
   - Rarity
   - Custom categories (existing tags)

2. **Add sorting options:**
   - Name (A-Z) ✅
   - Price (high-low, low-high)
   - CMC (ascending, descending)
   - Quantity
   - Date Added

3. **Add view modes:**
   - List (current) ✅
   - Grid (card images in responsive grid)
   - Groups (Grouped List, which we have)

### Medium Priority (competitive parity)

4. **Collection-wide search** with filter chips:
   - Color picker (WUBRG + colorless)
   - Type dropdown (Creature, Instant, Sorcery, etc.)
   - CMC range slider
   - Set dropdown
   - Rarity selector

5. **"Where is this card?" column** — show storage location + deck assignments

6. **Deck value total** — sum of all card prices, shown in deck header

7. **Set completion view** — for each set in collection, show owned/total and completion %

### Lower Priority (differentiation, not table stakes)

8. **Combinable grouping** (ManaBox style) — group by Set, then by Color within

9. **Scryfall syntax support** — parse `t:creature cmc<=3 c:green` in search bar

10. **Missing cards export** — generate Picklist as CSV/text for shopping

---

## Appendix: Data Sources

- ManaBox: manabox.app/guides, App Store listing, Google Play description
- Moxfield: moxfield.nolt.io (user feedback), GitHub primer gist, direct observation
- Archidekt: archidekt.com/faq, archidekt.com/landing, EDHREC how-to articles
- Deckbox: deckbox.org homepage, feature descriptions
- DragonShield: App Store listing (apps.apple.com)
- TCGPlayer: help.tcgplayer.com, shop.tcgplayer.com/collection
- Draftsim: draftsim.com/mtg-collection-tracker (comparison article)
- Gitnux: gitnux.org/best/trading-card-inventory-software (2026 comparison)

---

## Provenance

- Authored: 2026-07-27
- Methodology: Web research of official documentation, help articles, feature request boards, and third-party comparison articles. No hands-on testing performed.
- Related: `research/manabox-gap-analysis.md` (deeper ManaBox-specific comparison)
