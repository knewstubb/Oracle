# Collection Management Research

> Last updated: 2026-07-27
> Purpose: Comprehensive analysis of collection management screens across MTG platforms — views, columns, filters, grouping, sorting, and unique features.

---

## Executive Summary

This document catalogs how the six major MTG platforms handle **collection management** — the screens where users view, organize, filter, and understand their owned cards. Collection management is distinct from deck management; it's about the entire pool of cards a player owns, not individual deck lists.

**Platforms analyzed:**
1. ManaBox (mobile-first, scanning focus)
2. Moxfield (web-first, deckbuilding focus)
3. Archidekt (web-first, visual focus)
4. Deckbox (web, trading focus)
5. DragonShield (mobile, scanning focus)
6. TCGPlayer (web/app, marketplace-integrated)

---

## Platform Deep Dives

### 1. ManaBox

**Platform:** Mobile (iOS/Android), web app planned  
**Collection model:** Binders (owned) + Lists (wishlists) + Registered Decks

#### Available Views

| View | Description |
|------|-------------|
| **Grid** | Card images in responsive grid, tap to expand |
| **List** | Condensed text rows with key data columns |
| **Collector Mode** | Special view showing owned vs missing cards for any groupable set/filter |

#### Columns Displayed (List View)

| Column | Description |
|--------|-------------|
| Card Name | Full card name |
| Set Icon | Small set symbol |
| Set Code | 3-letter set abbreviation |
| Quantity | Number owned |
| Price | Configurable: TCGPlayer, Cardmarket, Card Kingdom |
| Foil Indicator | Badge or icon for foil copies |
| Condition | NM, LP, MP, HP, DMG |
| Binder Location | Which binder contains this card |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Set | All cards from a set grouped together |
| Color | W, U, B, R, G, Colorless, Multicolor |
| Card Type | Creature, Instant, Sorcery, Artifact, etc. |
| Rarity | Common, Uncommon, Rare, Mythic |
| **Combinable** | Can group by Set → then by Color within each set |

#### Group Sorting (Sort the groups themselves)

| Sort Option | Description |
|-------------|-------------|
| Total Cards | Groups with most cards first |
| Collected Cards | Groups where you own the most first |
| Completion % | Groups closest to complete first |

#### Sorting Options (Cards within groups)

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Mana Value | Low-High, High-Low |
| Price | Low-High, High-Low |
| Date Added | Newest, Oldest |
| Quantity | Most, Fewest |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| Card Name | Text search |
| Scryfall Syntax | Full support (type, color, CMC, oracle text) |
| Set | Dropdown or code entry |
| Color | W, U, B, R, G picker |
| CMC Range | Min-Max slider |
| Type | Dropdown (Creature, Instant, etc.) |
| Rarity | Common through Mythic |
| Oracle Text | Contains search |
| Foil Only | Toggle |
| Binder | Show only cards in specific binder |
| Format Legality | Standard, Modern, Commander, etc. |

#### Collector Mode (Unique Feature)

ManaBox's Collector Mode is a dedicated completion tracking view:

- Shows **all cards** that could exist in a set/group (not just owned)
- Highlights owned cards vs missing cards
- Displays **completion percentage** per group
- **"Group Printings"** option to ignore variants (just track unique card names)
- Works with any search filter (e.g., "all Dragons I own across all sets")
- Can filter to show only missing cards for shopping lists

#### Binder Organization

- **Named binders** mirror physical storage locations
- Each binder shows: Card count, Total value, Value change (gain/loss)
- Cards can exist in exactly one binder
- When searching collection, results show **which binder** contains each card

---

### 2. Moxfield

**Platform:** Web (primary), mobile responsive  
**Collection model:** Collection (all cards) + Binders (named subsets) + Decks

#### Available Views

| View | Description |
|------|-------------|
| **Images** | Grid of card images, hover for details |
| **Text** | Detailed list with many columns |
| **Checklist** | Condensed checklist-style view |

#### Columns Displayed (Text View)

Based on user screenshots and documentation:

| Column | Description |
|--------|-------------|
| Qty | Quantity owned (regular) |
| Name | Card name with hover preview |
| Set | Set code |
| Collector # | Collector number within set |
| Condition | Card condition (NM, LP, MP, HP, DMG) |
| Language | Card language |
| Foil | "F" indicator for foil copies |
| Binder | Which binder(s) contain this card |
| Notes | User notes field |
| Price | Market price |
| Total | Qty × Price |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| CMC / Mana Value | 0, 1, 2, 3, 4, 5, 6, 7+ |
| Color | W, U, B, R, G, Colorless, Multi |
| Card Type | Creature, Instant, Sorcery, etc. |
| Set | By expansion |
| Tags | User-defined tags |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Mana Value | Low-High, High-Low |
| Price | Low-High, High-Low |
| Collector Number | Ascending, Descending |
| Date Added | Newest, Oldest |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| **Scryfall Syntax** | Full support (the primary filter method) |
| Set | Scryfall `set:` operator |
| Color | `c:` or `color:` operator |
| CMC | `cmc` operator with comparisons |
| Type | `t:` or `type:` operator |
| Rarity | `r:` operator |
| Oracle Text | `o:` operator |
| Power/Toughness | `pow:` and `tou:` operators |
| Format Legality | `f:` or `format:` operator |
| Binder Filter | Show cards in specific binder, or exclude binders |

#### Binder System

- Binders are **subsets** of the collection (a card in a binder is also in the collection)
- Same card can appear in multiple binders
- Collection Tracker shows which binders/decks reference each card
- Can filter collection to "cards NOT in any binder" for organization

#### Collection Tracker Integration

When viewing a deck, the Collection Tracker shows:
- **Green checkmark** = You own this exact printing
- **Yellow checkmark** = You own a different printing
- **No checkmark** = You don't own this card

---

### 3. Archidekt

**Platform:** Web (primary), no mobile app  
**Collection model:** Collection (unified) + Deck Folders + Decks

#### Available Views

| View | Description |
|------|-------------|
| **Stacks** | Visual card piles grouped by category |
| **Grid** | Card images in responsive grid |
| **Text** | Condensed text list |
| **Spreadsheet** | Full data table with all columns |

#### Columns Displayed (Spreadsheet/Text View)

Based on user screenshots showing "Hide/add columns" menu, Archidekt offers 20+ columns:

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Quantity | Number owned |
| Finish | Normal, Foil, Etched |
| Mana Cost | Mana pip symbols |
| Price One | TCGPlayer Market |
| Price Two | Card Kingdom |
| Collection Status | Owned indicator |
| Pinned Status | User pinned cards |
| Color Tag | User-assigned color labels |
| Rarity | C, U, R, M |
| Set Name | Full expansion name |
| Set Code | 3-letter abbreviation |
| Categories | User-defined categories |
| Companion | Companion indicator |
| Type | Type line |
| CMC | Converted mana cost number |
| Color Identity | WUBRG identity |
| Oracle Text | Rules text |
| Power | Creature power |
| Toughness | Creature toughness |
| Artist | Card artist |
| Collector Number | Number in set |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Set | By expansion |
| Color | W, U, B, R, G, Colorless, Multi |
| Color Identity | Commander-relevant color identity |
| Type | Card type |
| Rarity | Common through Mythic |
| CMC | Mana value |
| Custom Categories | User-defined |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Price | Low-High, High-Low |
| CMC | Low-High, High-Low |
| Color | WUBRG order |
| Rarity | C→M, M→C |
| Collector Number | Ascending, Descending |
| Date Added | Newest, Oldest |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| Card Name | Text search |
| **Scryfall Syntax** | Full support via "Syntax filter" mode |
| Local Filter | Quick filter visible cards |
| Set | Dropdown |
| Color | WUBRG picker |
| CMC | Range selector |
| Type | Dropdown |
| Rarity | Checkboxes |
| Collection Status | Show only owned/not owned |

#### Unique Features

- **Multi-platform collections** — Separate Paper, MTGO, MTGA collections
- **"Printings default to collection"** — When adding cards to decks, auto-selects versions you own
- **Full import/export** — CSV, text formats
- **Column customization** — Show/hide any of 20+ columns

---

### 4. Deckbox

**Platform:** Web  
**Collection model:** Inventory (owned) + Tradelist (for trade) + Wishlist (want) + Decks

#### Available Views

| View | Description |
|------|-------------|
| **List** | Default table view with columns |
| **Images** | Grid of card images |

#### Columns Displayed

| Column | Description |
|--------|-------------|
| Card Name | Full name with set icon |
| Set | Set icon + code |
| Quantity | Total owned |
| Tradelist Qty | Subset marked for trade |
| Condition | Card condition |
| Foil | Foil indicator |
| Language | Card language |
| Price | TCGPlayer/CardKingdom/Cardmarket |
| In Decks | Count of decks using this card |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Set | By expansion |
| Color | W, U, B, R, G, Multi, Colorless |
| Type | Card type |
| Rarity | Common through Mythic |
| Condition | By card condition |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Price | Low-High, High-Low |
| Quantity | Most, Fewest |
| Set | Alphabetical |
| Collector Number | Ascending |
| Date Added | Newest, Oldest |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| Card Name | Text search |
| Set | Dropdown |
| Color | Picker |
| Type | Dropdown |
| Rarity | Checkboxes |
| Condition | Dropdown |
| Foil | Toggle |
| Language | Dropdown |
| Price Range | Min-Max inputs |

#### Unique Features

- **Tradelist as first-class concept** — Separate tracking of "qty owned" vs "qty for trade"
- **Trade matching** — Auto-finds users who have your wants and want your trades
- **Multiple condition entries** — Same card, different conditions = separate inventory entries
- **Price history per card** — Track value over time
- **"In Decks" count** — See how many decks reference each card

---

### 5. DragonShield Card Manager

**Platform:** Mobile (iOS/Android)  
**Collection model:** Folders (physical locations) + Decks

#### Available Views

| View | Description |
|------|-------------|
| **Grid** | Card images in grid |
| **List** | Condensed text rows |

#### Columns Displayed (List View)

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Set Code | 3-letter code |
| Quantity | Number owned |
| Price | TCGPlayer, Cardmarket, Card Kingdom, MTGMintCard |
| Foil Indicator | Foil badge |
| Condition | Card condition |
| Language | Any language (supports all) |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Set | By expansion |
| Color | W, U, B, R, G, Multi, Colorless |
| Type | Card type |
| Rarity | Common through Mythic |
| CMC | Mana value |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Price | Low-High, High-Low |
| CMC | Low-High, High-Low |
| Quantity | Most, Fewest |
| Date Added | Newest, Oldest |
| Value Change | Best, Worst performance |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| Card Name | Text search |
| Mana Cost | CMC filter |
| Card Color | Color picker |
| Type | Dropdown |
| Set | Dropdown |
| Rarity | Checkboxes |

#### Unique Features

- **Real-time card scanning** with any-language support and instant translation
- **Price charts** — 30-day history per card
- **Format legality + official rulings** shown on card detail
- **Friends/social** — Add friends, share folders, view others' collections
- **Weekly collection email** — Automated value summary

#### Folder System

- Folders are named physical locations
- Each folder shows:
  - Card count
  - Total value
  - Value change over time (win/loss %)
  - Mana cost distribution
  - Color distribution

---

### 6. TCGPlayer Collection Tracker

**Platform:** Web + Mobile App  
**Collection model:** Collection Lists + Have/Want/Trade lists

#### Available Views

| View | Description |
|------|-------------|
| **Grid** | Card images in grid |
| **List** | Table with columns |

#### Columns Displayed

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Set | Set name/code |
| Quantity | Number owned |
| Price | TCGPlayer Market Price |
| Price Change | $ and % change |
| Foil | Foil indicator |
| Condition | NM, LP, MP, HP, DMG |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Set | By expansion |
| Type | Card type |
| Rarity | Common through Mythic |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Price | Low-High, High-Low |
| Quantity | Most, Fewest |
| Date Added | Newest, Oldest |
| Value Change | Best, Worst |

#### Filter Capabilities

| Filter | Implementation |
|--------|----------------|
| Card Name | Text search |
| Set | Dropdown |
| Rarity | Checkboxes |
| Type | Dropdown |
| Foil | Toggle |
| Price Range | Min-Max inputs |

#### Unique Features

- **Auto-updates on purchase** — Buying from TCGPlayer auto-adds to collection
- **Market integration** — Direct buy links on every card
- **Trading potential indicator** — Highlights cards with high trade value
- **Have/Want/Trade lists** — Pre-built list types for trading workflow
- **Multi-condition tracking** — Mark condition per entry, see condition-specific prices

---

## Cross-Platform Comparison Matrix

### Views Available

| Platform | Grid/Images | List/Text | Spreadsheet | Stacked | Checklist | Collector Mode |
|----------|-------------|-----------|-------------|---------|-----------|----------------|
| ManaBox | ✅ | ✅ | - | - | - | ✅ |
| Moxfield | ✅ | ✅ | - | - | ✅ | - |
| Archidekt | ✅ | ✅ | ✅ | ✅ | - | - |
| Deckbox | ✅ | ✅ | - | - | - | - |
| DragonShield | ✅ | ✅ | - | - | - | - |
| TCGPlayer | ✅ | ✅ | - | - | - | - |

### Grouping Options

| Grouping | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|----------|---------|----------|-----------|---------|--------------|-----------|
| Card Type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Color Identity | - | - | ✅ | - | - | - |
| CMC | ✅ | ✅ | ✅ | - | ✅ | - |
| Set | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Rarity | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| Tags/Categories | - | ✅ | ✅ | - | - | - |
| Condition | - | - | - | ✅ | - | - |
| **Combinable** | ✅ | - | - | - | - | - |

### Columns Available

| Column | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|--------|---------|----------|-----------|---------|--------------|-----------|
| Card Name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quantity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Set | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Collector Number | - | ✅ | ✅ | ✅ | - | - |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Price 2 (alt source) | - | - | ✅ | ✅ | ✅ | - |
| Foil Indicator | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Finish (etched, etc.) | - | - | ✅ | - | - | - |
| Condition | ✅ | ✅ | - | ✅ | ✅ | ✅ |
| Language | - | ✅ | - | ✅ | ✅ | - |
| CMC / Mana Cost | ✅ | ✅ | ✅ | ✅ | - | - |
| Type Line | - | - | ✅ | - | - | - |
| Tags / Categories | - | ✅ | ✅ | - | - | - |
| Location (binder) | ✅ | ✅ | - | - | ✅ | - |
| In Decks | - | ✅ | - | ✅ | - | - |
| Tradelist Qty | - | - | - | ✅ | - | - |
| Value Change | ✅ | - | - | - | ✅ | ✅ |
| Purchase Price | ✅ | - | - | - | - | - |
| Notes | - | ✅ | - | - | - | - |
| Color Identity | - | - | ✅ | - | - | - |

### Filter Features

| Filter | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|--------|---------|----------|-----------|---------|--------------|-----------|
| Card Name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
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
| Language | - | ✅ | - | ✅ | - | - |
| Format Legality | ✅ | ✅ | - | - | ✅ | - |
| Binder/Location | ✅ | ✅ | - | - | ✅ | - |
| In Deck | - | ✅ | - | ✅ | - | - |

---

## Unique Features Summary

### ManaBox
- **Combinable grouping** (Set → Color within set)
- **Collector Mode** with completion tracking
- **Group sorting** (by completion %, total cards, collected cards)
- **Purchase price tracking** with gain/loss

### Moxfield
- **Full Scryfall syntax** as primary filter language
- **"In Binders" / "In Decks" columns** for cross-reference
- **Notes field** per card entry
- **Collection Tracker badges** when viewing decks

### Archidekt
- **20+ customizable columns** in spreadsheet view
- **Multi-platform collections** (Paper, MTGO, MTGA separate)
- **Printings default to owned** when deck building
- **Stacked view** for visual organization

### Deckbox
- **Tradelist as separate tracked quantity**
- **Trade matching** to find trading partners
- **Multiple condition entries** per card
- **Price history** per card

### DragonShield
- **Any-language scanning** with real-time translation
- **30-day price charts** per card
- **Friends/social features** for sharing collections
- **Weekly email summaries**

### TCGPlayer
- **Auto-add on purchase** from marketplace
- **Trading potential indicator**
- **Market-integrated** buy links everywhere
- **Condition-specific pricing**

---

## Recommendations for The Oracle

Based on this research, The Oracle's collection management should prioritize:

### High Priority (competitive parity)

1. **Multiple grouping options:** Type, Color, CMC, Set, Rarity
2. **Sorting by:** Name, Price, CMC, Quantity, Date Added
3. **View modes:** List (current), Grid (images), Groups view
4. **Filter chips:** Color picker, Type dropdown, CMC range, Set selector

### Medium Priority (differentiation)

5. **"Where is this card?" column** — Storage location + deck assignments
6. **Set completion view** — Owned/total per set with completion %
7. **"In Decks" column** — Which decks reference each card

### Lower Priority (nice-to-have)

8. **Combinable grouping** like ManaBox
9. **Scryfall syntax support** for power users
10. **Value tracking** (purchase price, gain/loss)

---

## Provenance

- Authored: 2026-07-27
- Sources: Official documentation, help articles, user screenshots (Moxfield collection list, Archidekt column menu), app store listings, feature request boards
- Related: `research/deck-management-research.md`, `research/competitor-list-views-analysis.md`
