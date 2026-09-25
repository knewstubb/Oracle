# Competitive Audit: MTG Deck-Building Platforms
## Research Phase

This document captures research findings about Archidekt, Moxfield, and Manabox.

### Research Sources
- Official platform documentation and help articles
- User guides and feature announcements
- Community reviews and comparisons
- Platform UI/UX patterns from documentation

---

## ARCHIDEKT

### Core Deck-Building Features
**Building/Editing:**
- Drag-and-drop card placement into category sections
- Search bar with autocomplete
- Quantity spinners (increment/decrement)
- Add cards directly to deck sections (creature, instant, sorcery, artifact, enchantment, planeswalker, land, sideboard)

**Card Search:**
- Text search (card name)
- Format filter (Commander, Standard, etc.)
- Color filter (WUBRG checkboxes)
- Type filter (creature, instant, etc.)
- Mana cost range
- Rarity filter
- Power/toughness range (for creatures)
- Legality filter (legal in selected format)

**Card Display (in search results):**
- Card image thumbnail
- Mana cost icon
- Card name
- Card type line
- Legality badges (format-specific)
- Price (TCGPlayer)
- Availability indicator

**Sorting/Grouping:**
- Built-in sections: creatures, instants, sorceries, artifacts, enchantments, planeswalkers, lands, sideboard
- Manual card organization within deck
- Sort by: mana cost, color, type, name
- Can create custom categories/sections

### Collection Management
**Owned Collection:**
- Users can import collection from CSV or Magic Online
- Visual "collection indicator" on cards showing owned quantity
- Collection can be filtered/searched

**Proxy/Owned Status:**
- Cards can be marked as owned or proxied within a deck
- Visual distinction between owned and proxy cards
- Import from various sources

**Import Sources:**
- CSV upload
- Archidekt export format
- Scryfall lists
- Magic Online collection format

**Collection Features:**
- Search own collection by card name
- Filter by format legality
- View quantity owned

### Card Detail Interactions
**Interaction Trigger:**
- Click card name or image to open detail modal/panel

**Detail View Shows:**
- Full card image (from multiple printings)
- Complete rules text
- Power/toughness and other attributes
- Legality for all formats
- Printing history with set icons and rarity
- Price history (TCGPlayer)
- Link to Scryfall for additional info

**Multiple Printings:**
- All printings displayed with set code, rarity icon
- Click to select different printing for deck
- Visual distinction for which printing is in deck

### Deck Organization & Sharing
**Organization:**
- Can create multiple decks
- Decks stored in user account
- No folder/category system for decks themselves (flat list)
- Tag/label system for decks

**Sharing:**
- Public/private toggle
- Copy direct link to deck
- Embed deck on external sites (WordPress, blogs)
- Export as Archidekt text format
- Export as Moxfield format (for cross-platform sharing)
- Export as TTS (Tabletop Simulator) format

**Public Features:**
- Public decks are searchable/browsable
- Deck can be forked/copied by other users
- Comments section (community feedback)
- View count and fork count displayed

**Collaboration:**
- No real-time shared editing
- Fork/copy workflow for collaboration
- Comments on public decks

### Advanced Features
**Deck Statistics:**
- Mana curve visualization
- Color distribution pie chart
- Avg CMC
- Card type breakdown
- Land count indicators
- Creature/Non-creature split

**Format Validation:**
- Enforces format rules (Commander max 1 of each, 100 card limit)
- Displays legality status
- Warns about illegal cards for selected format

**Playtest/Simulator:**
- No built-in playtest/drawing simulator
- Exports to TTS for simulation

**Integrations:**
- Scryfall link on card details
- Price data from TCGPlayer
- Can embed decks on external websites
- Export to multiple formats

**Pricing/Budget:**
- Shows TCGPlayer price per card
- Total deck cost calculation
- Can filter by price range in search

**Proxy Generation:**
- No built-in proxy generation
- Can mark cards as proxies and export to print

---

## MOXFIELD

### Core Deck-Building Features
**Building/Editing:**
- Search-based "add card" workflow (search box, autocomplete, click to add)
- Card list shows quantity spinners
- Drag-to-reorder cards in list
- Add to specific section (mainboard, sideboard, maybeboard, etc.)
- Quick edit: quantity up/down arrows

**Card Search:**
- Text search (card name, optional rules text search)
- Color filter (WUBRG multiselect)
- Type filter (creature, instant, land, etc.)
- Mana cost range
- Rarity filter
- Power/toughness filter
- Format legality filter
- Creature vs. non-creature filter
- Super-type filter (legendary, basic, snow, etc.)

**Card Display (in search):**
- Card image thumbnail
- Mana cost badge
- Card name
- Type line (condensed)
- Rarity indicator
- Legality status (legal/banned/restricted badges)
- Availability from collection (if owned)

**Sorting/Grouping:**
- Default sections: mainboard, sideboard, maybeboard
- Cards displayed in list format with quantities
- Can sort by: mana cost, color, name, type, rarity, date added
- Collapsible type/color grouping
- No custom sections (fixed format)

### Collection Management
**Owned Collection:**
- Scryfall-powered collection management
- Import from CSV, Arena, Magic Online, Scryfall lists
- Synced collection display across all decks
- "Collection badge" shows quantity owned vs. needed

**Proxy/Owned Status:**
- Visual indicator when card is in collection
- Can mark deck cards as proxied
- Collection count shown per card

**Import Sources:**
- CSV
- Magic: Arena export
- Magic Online format
- Scryfall lists
- Deck lists (plaintext format)

**Collection Features:**
- Search across entire collection
- Filter by format legality
- Track quantity of each card
- View collection stats (total cards, unique cards, total value)

### Card Detail Interactions
**Interaction Trigger:**
- Hover card name or click card image
- Hover shows quick preview card in a small modal
- Click opens full detail modal

**Detail View Shows:**
- Full high-res card image
- All printings with set code, collector number, rarity
- Complete rules text
- Power/toughness, loyalty, etc.
- Flavor text
- Legality for all formats (color-coded badges)
- Price data (multiple sources: TCGPlayer, Cardhoarder, etc.)
- Links to external resources (Scryfall, Gatherer, etc.)

**Multiple Printings:**
- All printings listed with thumbnail previews
- Click to change selected printing in deck
- Visual indication of which printing is selected
- Can filter printings by set, language, etc.

### Deck Organization & Sharing
**Organization:**
- Create multiple decks
- Organize into folders/collections (nested hierarchy)
- Add deck description and tags
- Set format on each deck
- Pinned decks for quick access

**Sharing:**
- Public/private/unlisted toggle
- Copy direct link
- Share via Discord embed (deck preview in Discord)
- Generate shareable image (deck list as image)
- Export to multiple formats: plaintext, Moxfield JSON, Archidekt link, MTGGoldfish link
- Embed deck on external sites

**Public Features:**
- Public decks are searchable by format, archetype, card
- Deck trending page
- User profile page with all public decks
- Fork/clone entire deck
- Comments and discussion section
- Like/upvote system

**Collaboration:**
- Shared deck editing (multiple users can edit simultaneously in real-time)
- Edit history and version tracking
- Comments for discussion

### Advanced Features
**Deck Statistics:**
- Mana curve (visual chart)
- Color distribution (pie chart)
- Type distribution
- Card count by category
- Average CMC
- Land count analysis
- Creature/non-creature split
- Curve analysis (threat density)

**Format Validation:**
- Enforces format rules (Commander 100-card limit, 1-of rule except basic lands)
- Shows legality status per card and deck
- Warns about banned/restricted cards
- Format lock (prevents adding illegal cards)

**Playtest/Simulator:**
- Built-in playtest mode (draw simulator)
- Shuffle deck and draw hands
- Mulligan system
- Statistics tracking (win rate, turns to win)
- No full game simulator

**Integrations:**
- Scryfall sync for card data
- Discord embed rich preview
- MTGGoldfish link integration
- Archidekt compatibility
- Price data feeds

**Pricing/Budget:**
- Shows prices from multiple sources
- Total deck cost calculation
- Price alerts (price changes on cards in deck)
- Can filter search by price

**Proxy Generation:**
- Can export deck list for proxy printing
- Marked proxies are tracked in deck

---

## MANABOX

### Core Deck-Building Features
**Building/Editing:**
- Mobile-first interface (can use on desktop but optimized for mobile)
- Swipe/tap-based card addition
- Search and tap to add cards
- Quantity sliders or +/- buttons
- Cards organized by type automatically

**Card Search:**
- Text search (card name)
- Color filter (tap to select)
- Type filter (creature, spell, land)
- Mana cost range
- Format legality
- Set filter
- Power/toughness filter

**Card Display (in search):**
- Card image thumbnail
- Mana cost
- Card name
- Type line
- Legality status
- Rarity indicator

**Sorting/Grouping:**
- Auto-grouped by card type (creatures, instants, sorceries, etc.)
- Auto-grouped by color within type
- Collapsible groups
- Can manually reorder within groups

### Collection Management
**Owned Collection:**
- Collection tracking via app
- Can import from camera (photograph Archidekt lists)
- Manual entry of owned cards
- Collection synced across devices

**Proxy/Owned Status:**
- Visual indicator on cards in deck showing owned/missing
- Can mark cards as proxied in deck
- Collection count shown

**Import Sources:**
- Camera import (photograph Archidekt or plaintext list)
- Manual entry
- Import from CSV
- Deck list parsing

**Collection Features:**
- Search own collection
- Filter by format
- View owned quantity
- Track cards needed for deck

### Card Detail Interactions
**Interaction Trigger:**
- Tap card image or name to open detail view
- Long-press for quick preview (iOS style)

**Detail View Shows:**
- Full card image
- All printings available
- Rules text
- Power/toughness
- Flavor text
- Legality badges
- Price (from TCGPlayer API)
- Scryfall link

**Multiple Printings:**
- Displays all printings with thumbnail previews
- Tap to select different printing
- Shows set code and rarity

### Deck Organization & Sharing
**Organization:**
- Create multiple decks
- Organize into folders/categories
- Add description and notes
- Tag decks

**Sharing:**
- Generate public link (shareable URL)
- Export as plaintext list
- Export as Archidekt format
- Share via social media (image+link)
- No Discord integration

**Public Features:**
- Public decks can be viewed by link
- Not searchable (public by link only)
- Comments disabled or limited

**Collaboration:**
- Share link for view/edit (depends on permission settings)
- No real-time sync
- Limited collaboration features

### Advanced Features
**Deck Statistics:**
- Mana curve
- Color distribution
- Type breakdown
- Card count summary
- Average CMC
- Basic stats only (less detailed than Archidekt/Moxfield)

**Format Validation:**
- Enforces Commander rules (100 card, 1-of rule)
- Shows legality status
- Basic validation only

**Playtest/Simulator:**
- No built-in playtest mode
- Export to other tools for simulation

**Integrations:**
- Scryfall API for card data
- TCGPlayer API for pricing
- Archidekt format compatibility
- Limited third-party integration

**Pricing/Budget:**
- Shows TCGPlayer prices
- Total deck cost
- No price filtering in search (basic pricing only)

**Proxy Generation:**
- Can export deck list for printing
- No advanced proxy generation

---

## COMPARISON MATRIX

| Feature | Archidekt | Moxfield | Manabox |
|---------|-----------|----------|---------|
| **Deck Building - Drag/Drop** | ✓ Full | ✗ Search-based | ✗ Search+tap (mobile-first) |
| **Deck Building - Categories** | ✓ Fixed + custom | ✓ Fixed (MB/SB/MB) | ✓ Auto-grouped by type |
| **Card Search - Advanced Filters** | ✓✓ (7+ fields) | ✓✓ (9+ fields) | ✓ (5 fields) |
| **Card Display - Metadata** | ✓ Image, mana, name, type, legality, price | ✓ Same + rarity detail | ✓ Basic |
| **Collection Import** | ✓ CSV, MODO, Scryfall | ✓ CSV, Arena, MODO, Scryfall, plaintext | ✓ CSV, camera, manual |
| **Collection Sync** | ✗ Per-deck | ✓ Global (across all decks) | ✓ Global |
| **Card Detail - Printings** | ✓ All with selector | ✓ All with selector + filters | ✓ All with selector |
| **Card Detail - Full Rules Text** | ✓ | ✓ | ✓ |
| **Deck Organization - Folders** | ✗ Flat + tags | ✓ Nested folders | ✓ Folders/tags |
| **Sharing - Public Search** | ✓ Searchable | ✓ Searchable | ✗ Link-only |
| **Sharing - Export Formats** | ✓ Multiple (Moxfield, TTS, text) | ✓ Multiple (Archidekt, MTGGoldfish, text) | ✓ Basic (Archidekt, text) |
| **Sharing - Discord Embed** | ✗ | ✓ Rich embeds | ✗ |
| **Sharing - Real-time Collab** | ✗ | ✓ Yes | ✗ |
| **Deck Stats - Mana Curve** | ✓ | ✓ | ✓ |
| **Deck Stats - Color Distribution** | ✓ | ✓ | ✓ |
| **Deck Stats - Advanced (threat count, density)** | ✗ | ✓ | ✗ |
| **Format Validation** | ✓ Basic | ✓ Full (with legality lock) | ✓ Basic |
| **Playtest Simulator** | ✗ | ✓ (draw sim + mulligan) | ✗ |
| **Price Tracking** | ✓ Single source (TCGPlayer) | ✓ Multi-source + alerts | ✓ TCGPlayer only |
| **Proxy Marking** | ✓ | ✓ | ✓ |
| **Mobile Optimization** | ✗ Desktop-first | ~ Responsive | ✓ Mobile-first app |

---

## KEY INSIGHTS & COMMON PATTERNS

### Features Present in 2+ Platforms (Industry Standard)
1. **Card search with filtering** — all three support color, type, mana cost filters
2. **Deck export/import** — plaintext lists, format-specific exports (Archidekt, Moxfield)
3. **Format enforcement** — Commander rules validation (100 card, 1-of)
4. **Collection tracking** — most allow import; Moxfield syncs globally
5. **Multiple printing display** — all show printings with selector
6. **Mana curve visualization** — all provide basic curve chart
7. **Price display** — all show TCGPlayer (or equivalent) pricing
8. **Public sharing** — Archidekt and Moxfield have searchable public decks
9. **Proxy marking** — all allow users to flag proxied cards

### **Notably Absent Features (The Oracle Lacks)**
1. **Real-time collaborative editing** — only Moxfield offers this
2. **Global collection syncing** — Moxfield syncs across all decks; Archidekt and The Oracle are per-deck
3. **Playtest/draw simulator** — only Moxfield has built-in drawing simulator
4. **Multi-platform folder hierarchy** — Moxfield supports nested folders; Archidekt uses flat + tags
5. **Discord embed integration** — only Moxfield supports rich Discord previews
6. **Advanced threat analysis** — Moxfield offers more sophisticated deck analysis (threat density, etc.)
7. **Mobile-optimized app** — Manabox is mobile-first; others are web-based
8. **Edit history/version tracking** — Moxfield tracks versions; others don't
9. **Real-time price alerts** — only Moxfield tracks price changes on deck cards
10. **Camera-based list import** — only Manabox supports photographing a list to import

### **Competitive Weaknesses Across Platforms**
- **Limited integration ecosystem** — most rely on Scryfall + TCGPlayer only
- **No automated deck suggestions** — none offer AI/algorithm-based card recommendations
- **No cross-platform sync** — decks don't sync between platforms
- **Limited UX polish on mobile** — Manabox leads here with mobile-first design
- **No built-in community features** — beyond comments/likes, no deck matching, leagues, etc.

---

## IMPLICATIONS FOR THE ORACLE

### Must-Have (Present in 2+ competitors)
- [ ] Card search with color, type, mana cost, power/toughness, rarity filters
- [ ] Mana curve + color distribution charts
- [ ] Multiple printing display with selector
- [ ] Collection import (CSV, plaintext, other formats)
- [ ] Format validation (Commander rules)
- [ ] Deck export to standard formats
- [ ] Price display from TCGPlayer
- [ ] Proxy flagging

### Strong Differentiators (1 platform only)
- [ ] Real-time collaborative deck editing (Moxfield)
- [ ] Global collection sync across all decks (Moxfield)
- [ ] Playtest/draw simulator (Moxfield)
- [ ] Mobile app (Manabox)
- [ ] Discord integration (Moxfield)

### Opportunities (Weak across platforms)
- [ ] Commander-specific insights (synergies, budget alternatives, staples by build archetype)
- [ ] Automated card suggestions (fill gaps, add synergies)
- [ ] Deck composition analysis (threat count, interaction density, mana efficiency)
- [ ] Cross-tool integrations (EDHREC, Archidekt, Moxfield sync)
- [ ] Collection optimization (redundancy flagging, budget allocation)
- [ ] Mobile-first design with desktop parity

