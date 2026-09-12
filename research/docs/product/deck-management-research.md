# Deck Management Research

> Last updated: 2026-07-27
> Purpose: Comprehensive analysis of deck management screens across MTG platforms — views, columns, filters, grouping, sorting, and unique features.

---

## Executive Summary

This document catalogs how the six major MTG platforms handle **deck management** — the screens where users view, edit, organize, and analyze individual deck lists. This is distinct from collection management; it's about individual decks rather than the entire card pool.

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
**Deck model:** Decks (lists) + optional "Registered in Collection" status

#### Available Views

| View | Description |
|------|-------------|
| **Stacked** | Visual card piles grouped by category (default) |
| **Grid** | Card images in responsive grid |
| **List** | Condensed text rows |

#### Columns Displayed (List View)

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Quantity | Number in deck |
| CMC | Converted mana cost |
| Price | Per-card price |
| Set | Set code/icon |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Card Type | Creature, Instant, Sorcery, Artifact, etc. |
| Color | W, U, B, R, G, Colorless, Multi |
| CMC | 0, 1, 2, 3, 4, 5, 6, 7+ |
| Custom Categories | User-defined tags |

#### Sorting Options (Within Groups)

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Mana Value | Low-High, High-Low |
| Price | Low-High, High-Low |
| EDHREC Rank | Most popular first |

#### Deck Boards

| Board | Description |
|-------|-------------|
| Main | The 99 (or 60, etc.) |
| Sideboard | Optional sideboard cards |
| Maybeboard | Cards under consideration |
| Considering | "Maybe I'll add this" |

#### Statistics Panel

| Stat | Description |
|------|-------------|
| Mana Curve | Bar chart by CMC |
| Type Distribution | Pie/bar by card type |
| Color Distribution | Pie chart of color pips |
| Mana Production | What colors the deck produces |
| Tokens Produced | Token types the deck creates |

#### Deck-Collection Integration Features

| Feature | Description |
|---------|-------------|
| "Build from collection" | Find cards in binders/decks, move to new deck, show missing |
| "Add as new cards" | Import deck and add copies to collection simultaneously |
| Missing cards highlight | Cards not in collection visually marked |
| Location tracking | Shows which binder/deck holds each card |

#### Price Panel

| Feature | Description |
|---------|-------------|
| Total Deck Value | Sum of all card prices |
| Price by Provider | TCGPlayer, Cardmarket, Card Kingdom |
| Exclude Boards | Can exclude sideboard/maybeboard from total |
| Exclude Basics | Option to exclude basic lands from price |
| Tag Filtering | Only show price for cards with specific tags |
| Buy Link | Direct link to purchase on provider site |

#### Goldfish Simulator

ManaBox includes a built-in deck testing mode:
- Draw random starting hand
- Mulligan tracking
- Draw cards, play turns
- Goldfish (solitaire playtest)

---

### 2. Moxfield

**Platform:** Web (primary), mobile responsive  
**Deck model:** Decks with boards + tags + collection tracking

#### Available Views

| View | Description |
|------|-------------|
| **Visual** | Stacked card piles by group (default) |
| **Text** | Grouped text list with categories |
| **Spreadsheet** | Full data table |
| **Playtest** | Goldfish simulator |

#### Columns Displayed (Text/Spreadsheet View)

Based on user screenshots showing Moxfield deck text view:

| Column | Description |
|--------|-------------|
| Card Name | Full name (linked to details) |
| Quantity | Number in deck |
| CMC / Mana Cost | Cost in pips |
| Type Line | Full type (on hover/spreadsheet) |
| Price | Market price |
| Set | Set code |
| Tags | User-assigned tags (colored) |
| Collection Status | Owned badge (green/yellow/none) |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Type | Creature, Instant, Sorcery, etc. |
| CMC | Mana value buckets |
| Color | W, U, B, R, G, Colorless, Multi |
| Color Identity | Commander-relevant identity |
| Custom Tags | User-defined categories |
| "Type & Tags" | Combined grouping (shown in user screenshot) |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| Mana Value | Low-High, High-Low |
| EDHREC Rank | Most synergistic first |
| Price | Low-High, High-Low |
| Deck Order | Manual ordering |

#### Deck Boards

| Board | Description |
|-------|-------------|
| Mainboard | Primary deck cards |
| Sideboard | Sideboard cards |
| Maybeboard | Cards under consideration |
| Commanders | Commander(s) zone |
| Companions | Companion slot |
| Considering | "Might add later" |
| Tokens | Token cards this deck creates |
| Attractions | Attractions (Unfinity) |
| Stickers | Sticker sheets (Unfinity) |

#### Highlighter Tool

Moxfield's unique deck filtering system:
- Apply any Scryfall query to highlight matching cards
- Non-matching cards are dimmed in visual view
- Great for visualizing card subsets (e.g., "all creatures", "CMC 3+")

#### Collection Tracker Badges

When viewing a deck with collection tracking enabled:
- **Green checkmark** = You own this exact printing
- **Yellow checkmark** = You own a different printing
- **No checkmark** = You don't own this card

From user screenshot, this is shown inline with card rows in text view.

#### Tag System

| Feature | Description |
|---------|-------------|
| Local Tags | Tags specific to this deck |
| Global Tags | Tags shared across all decks |
| Color Coding | Each tag has a color |
| Bulk Tagging | Multi-select cards, apply tags |
| Tag Grouping | Can group deck by tags |

---

### 3. Archidekt

**Platform:** Web (primary), no mobile app  
**Deck model:** Decks in folders + categories + collection integration

#### Available Views

| View | Description |
|------|-------------|
| **Stacks** | Visual card piles with custom positioning |
| **Grid** | Card images in responsive grid |
| **Text** | Condensed text list |
| **Spreadsheet** | Full data table with 20+ columns |

#### Columns Displayed (Spreadsheet View)

Based on user screenshots showing Archidekt's column menu:

| Column | Shown by Default | Description |
|--------|------------------|-------------|
| Card Name | ✅ | Full name |
| Finish | ✅ | Normal, Foil, Etched |
| Mana Cost | ✅ | Pip symbols |
| Price One | ✅ | TCGPlayer Market |
| Price Two | ✅ | Card Kingdom |
| Collection Status | ✅ | Owned indicator |
| Pinned Status | ✅ | User pinned |
| Color Tag | ✅ | User color labels |
| Rarity | ✅ | C, U, R, M |
| Set Name | ✅ | Full expansion name |
| Categories | ✅ | User categories |
| Companion | ✅ | Companion indicator |
| CMC | Optional | Mana value number |
| Color Identity | Optional | WUBRG identity |
| Type | Optional | Type line |
| Oracle Text | Optional | Rules text |
| Power | Optional | Creature power |
| Toughness | Optional | Creature toughness |
| Artist | Optional | Card artist |
| Collector Number | Optional | Number in set |
| Set Code | Optional | 3-letter code |

#### Grouping Options ("Stacked by")

| Grouping | Notes |
|----------|-------|
| Type | Creature, Instant, Sorcery, etc. |
| CMC | Mana value buckets |
| Color | W, U, B, R, G, Colorless, Multi |
| Color Identity | Commander color identity |
| Custom Categories | User-defined |
| Tags | User-assigned tags |

#### Sorting Options (Within Stacks)

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| CMC | Low-High, High-Low |
| Price | Low-High, High-Low |
| Color | WUBRG order |
| EDHREC Rank | Most synergistic first |
| Rarity | C→M, M→C |
| Collector Number | Ascending |

#### Stack Positioning

Unique to Archidekt: users can **drag and drop stack groups** to custom positions on the deck page. This allows visual layout customization (e.g., put Creatures on left, Spells on right).

#### Category System

| Feature | Description |
|---------|-------------|
| Custom Categories | User-defined groupings |
| Category Templates | Pre-built category sets (e.g., "EDH Standard") |
| Multi-Category | Cards can be in multiple categories |
| Category Colors | Visual color coding |

#### Batch Operations

| Operation | Description |
|-----------|-------------|
| Multi-select | Shift-click to select multiple cards |
| Batch Category | Change category for selection |
| Batch Printing | Change set/printing for selection |
| "Optimize Printings" | Auto-set to cheapest/newest/fanciest |

#### EDH Recs Tab

Integrated EDHREC recommendations:
- Suggestions based on commander + current deck
- Popularity ranking
- Synergy scoring
- Add directly from recommendations

#### Landbase Tab

Commander-specific land helper:
- Land suggestions by popularity
- Complete land cycles
- Color identity filtering

#### Combos Tab (Commander Spellbook)

- Shows complete combos in deck
- Shows partial combos (missing pieces)
- Integration with Commander Spellbook database

#### Playtester

Full goldfish simulator:
- Draw starting hand
- Mulligan logic
- Draw, play cards
- Track mana, life
- Extensive hotkey support

---

### 4. Deckbox

**Platform:** Web  
**Deck model:** Decks with collection cross-reference

#### Available Views

| View | Description |
|------|-------------|
| **List** | Default table view |
| **Visual** | Card images |

#### Columns Displayed

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Quantity | Number in deck |
| CMC | Mana value |
| Price | Market price |
| "Owned" | Indicator if in Inventory |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Type | Card type |
| CMC | Mana value |
| Color | Card color |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| CMC | Low-High, High-Low |
| Price | Low-High, High-Low |

#### Missing Cards View

Dedicated view showing:
- Cards in deck NOT in Inventory
- Total cost to complete deck
- Direct purchase links per card

#### Statistics

| Stat | Description |
|------|-------------|
| Mana Curve | Chart by CMC |
| Hand Draw Simulator | Draw sample hands |

---

### 5. DragonShield Card Manager

**Platform:** Mobile (iOS/Android)  
**Deck model:** Decks with collection integration

#### Available Views

| View | Description |
|------|-------------|
| **Grid** | Card images |
| **List** | Text rows |

#### Columns Displayed (List View)

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Set Code | 3-letter code |
| Quantity | Number in deck |
| Price | Multi-provider |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Type | Card type |
| CMC | Mana value |
| Color | Card color |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z, Z-A |
| CMC | Low-High, High-Low |
| Price | Low-High, High-Low |

#### Deck Statistics

| Stat | Description |
|------|-------------|
| Mana Curve | Bar chart |
| Color Distribution | Pie chart |
| Type Distribution | Bar/pie |
| Total Value | Sum of card prices |

#### Missing Cards List

- Shows cards not in collection folders
- Price to complete

---

### 6. TCGPlayer

**Platform:** Web + Mobile  
**Deck model:** Deck lists with marketplace integration

#### Available Views

| View | Description |
|------|-------------|
| **Grid** | Card images |
| **List** | Table rows |

#### Columns Displayed

| Column | Description |
|--------|-------------|
| Card Name | Full name |
| Quantity | Number in deck |
| Price | TCGPlayer Market |

#### Grouping Options

| Grouping | Notes |
|----------|-------|
| Type | Card type |
| CMC | Mana value |

#### Sorting Options

| Sort | Direction |
|------|-----------|
| Name | A-Z |
| Price | High-Low, Low-High |

#### Marketplace Integration

- Every card has "Add to Cart" button
- Shows cheapest available listing
- Bulk add deck to cart
- Track which cards you already own

---

## Cross-Platform Comparison Matrix

### Views Available

| Platform | Stacked/Piles | Grid/Images | List/Text | Spreadsheet | Playtest |
|----------|---------------|-------------|-----------|-------------|----------|
| ManaBox | ✅ | ✅ | ✅ | - | ✅ |
| Moxfield | ✅ | - | ✅ | ✅ | ✅ |
| Archidekt | ✅ | ✅ | ✅ | ✅ | ✅ |
| Deckbox | - | ✅ | ✅ | - | - |
| DragonShield | - | ✅ | ✅ | - | - |
| TCGPlayer | - | ✅ | ✅ | - | - |

### Grouping Options

| Grouping | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|----------|---------|----------|-----------|---------|--------------|-----------|
| Card Type | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Color | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Color Identity | - | ✅ | ✅ | - | - | - |
| CMC | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tags/Categories | ✅ | ✅ | ✅ | - | - | - |
| Rarity | - | - | ✅ | - | - | - |
| Set | - | - | ✅ | - | - | - |

### Columns Displayed

| Column | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|--------|---------|----------|-----------|---------|--------------|-----------|
| Card Name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Quantity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CMC / Mana Cost | ✅ | ✅ | ✅ | ✅ | - | - |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Price 2 (alt source) | - | - | ✅ | - | - | - |
| Set | ✅ | ✅ | ✅ | - | ✅ | - |
| Foil/Finish | - | - | ✅ | - | - | - |
| Tags | ✅ | ✅ | ✅ | - | - | - |
| Categories | ✅ | - | ✅ | - | - | - |
| Collection Status | ✅ | ✅ | ✅ | ✅ | - | - |
| Rarity | - | - | ✅ | - | - | - |
| Type Line | - | ✅ | ✅ | - | - | - |
| Color Identity | - | - | ✅ | - | - | - |
| Pinned Status | - | - | ✅ | - | - | - |
| Color Tag | - | - | ✅ | - | - | - |

### Sort Options

| Sort | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|------|---------|----------|-----------|---------|--------------|-----------|
| Name | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| CMC | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Price | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| EDHREC Rank | ✅ | ✅ | ✅ | - | - | - |
| Color | - | - | ✅ | - | - | - |
| Rarity | - | - | ✅ | - | - | - |
| Collector Number | - | - | ✅ | - | - | - |

### Deck Boards

| Board | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|-------|---------|----------|-----------|---------|--------------|-----------|
| Mainboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sideboard | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| Maybeboard | ✅ | ✅ | ✅ | - | - | - |
| Commanders | ✅ | ✅ | ✅ | - | - | - |
| Companions | - | ✅ | ✅ | - | - | - |
| Tokens | - | ✅ | - | - | - | - |
| Considering | ✅ | ✅ | - | - | - | - |

### Statistics Features

| Feature | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|---------|---------|----------|-----------|---------|--------------|-----------|
| Mana Curve | ✅ | ✅ | ✅ | ✅ | ✅ | - |
| Type Distribution | ✅ | ✅ | ✅ | - | ✅ | - |
| Color Distribution | ✅ | ✅ | ✅ | - | ✅ | - |
| Total Value | ✅ | ✅ | ✅ | - | ✅ | ✅ |
| EDHREC Suggestions | ✅ | ✅ | ✅ | - | - | - |
| Combo Detection | - | - | ✅ | - | - | - |
| Land Helper | - | - | ✅ | - | - | - |

### Unique Deck Features

| Feature | ManaBox | Moxfield | Archidekt | Deckbox | DragonShield | TCGPlayer |
|---------|---------|----------|-----------|---------|--------------|-----------|
| Goldfish Simulator | ✅ | ✅ | ✅ | partial | - | - |
| Build from Collection | ✅ | ✅ | ✅ | ✅ | - | - |
| Missing Cards Export | ✅ | - | - | ✅ | ✅ | - |
| Batch Printing Change | - | - | ✅ | - | - | - |
| Stack Positioning | - | - | ✅ | - | - | - |
| Category Templates | - | - | ✅ | - | - | - |
| Highlighter Tool | - | ✅ | - | - | - | - |
| Tag System | ✅ | ✅ | ✅ | - | - | - |
| Direct Purchase | ✅ | - | - | - | - | ✅ |

---

## Unique Features Deep Dive

### ManaBox

**Build from Collection Workflow:**
1. Create deck list
2. Click "Register in Collection" → "Build from collection"
3. App searches binders and other decks for needed cards
4. Shows which cards found vs missing
5. "Build" moves found cards to new deck
6. Missing cards clearly listed for purchase

**Goldfish Simulator:**
- Draw starting hands
- Mulligan with tracking
- Draw cards turn-by-turn
- Play cards to battlefield
- Track mana, life

### Moxfield

**Highlighter Tool:**
- Enter any Scryfall query (e.g., `t:creature cmc<=3`)
- Matching cards stay bright
- Non-matching cards dim/fade
- Works in Visual stacked view
- Great for visualizing deck subsets

**Collection Tracker (from user screenshot):**
- Toggle on/off per deck
- Green badge = exact printing owned
- Yellow badge = different printing owned
- Shows inline with card rows
- Works with grouped text view

**Type & Tags Grouping (from user screenshot):**
- Cards grouped by Type first
- Then sub-grouped by tags within type
- Example: "Creatures > Card Draw", "Instants > Removal"

### Archidekt

**Stack Positioning:**
- Default: stacks arranged by system
- User can drag stacks to any position on page
- Persists per deck
- Allows custom visual layouts

**Optimize Printings:**
- Select multiple cards
- Choose optimization strategy:
  - Cheapest versions
  - Newest printings
  - Oldest printings
  - Most expensive ("fanciest")
- Batch applies to selection

**Category Templates:**
- Pre-built category sets
- "EDH Standard Categories" example:
  - Ramp, Card Draw, Removal, Board Wipes, etc.
- Can create and save custom templates

**Dual Price Columns:**
- Shows TCGPlayer AND Card Kingdom (or other combo)
- Compare prices at a glance
- User chooses which providers to display

### Deckbox

**Missing Cards Focus:**
- Dedicated view for cards not in Inventory
- Total cost to complete deck
- Per-card purchase links
- Clear "what do I need to buy?" answer

**Trade Integration:**
- Missing cards can be added to Wishlist
- System finds traders who have those cards
- Direct path from deck → wishlist → trade

### DragonShield

**Social Deck Sharing:**
- Share decks with friends
- Friends can view your deck lists
- Compare decks between friends

### TCGPlayer

**Marketplace-Native:**
- Every card has "Add to Cart"
- Shows cheapest available listing
- "Buy this deck" workflow
- Owned cards excluded from purchase suggestions

---

## Recommendations for The Oracle

Based on this deck management research, The Oracle should prioritize:

### High Priority (competitive parity)

1. **Multiple grouping options:** Type (existing), CMC, Color, Tags/Categories
2. **Sorting options:** Name, Price, CMC, EDHREC Rank
3. **View modes:** List (current), Visual stacks, Grid
4. **Collection status badges:** Show owned/not owned per card
5. **Deck statistics:** Mana curve, Type distribution, Color distribution

### Medium Priority (differentiation)

6. **Deck total value** with board filtering (exclude maybeboard, basics)
7. **Missing cards view** — "What do I need to buy?"
8. **EDHREC integration** in deck view (already have Upgrade tab)
9. **Category/tag system** for custom groupings within deck

### Lower Priority (nice-to-have)

10. **Goldfish simulator** for testing draws
11. **Batch operations** (change category, change printing for multiple)
12. **Highlighter tool** like Moxfield
13. **Stack positioning** for visual layout customization

### The Oracle's Unique Strengths (maintain/expand)

- **Instance-level allocation** — No competitor tracks which specific copy is in which slot
- **Claimed/Open/Proxy status** — Unique shared-card tracking
- **AI-powered analysis** — Strategy, Upgrade, Debrief modes
- **Deck lifecycle** — Brew → Built → Archived with allocation behavior

---

## Provenance

- Authored: 2026-07-27
- Sources: Official documentation, help articles, user screenshots (Archidekt table view with columns, Moxfield text view with collection tracker badges), app store listings, feature request boards
- Related: `research/collection-management-research.md`, `research/competitor-list-views-analysis.md`
