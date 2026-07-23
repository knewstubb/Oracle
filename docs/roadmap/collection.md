# Roadmap: Collection Management

## Built

- **CSV Import** — Archidekt, Moxfield, ManaBox, generic. Auto-detects source. Instance-level (one row per card).
- **Instance-Level Tracking** — Every physical card is a unique row. Not "3 Sol Rings" but three distinct copies with locations.
- **Grid + List Views** — Card images grid (filterable) and table view with set icon, edition, price.
- **Search & Filter** — Name, color identity, status, proxy flag. Persistent view mode.
- **CSV Export** — Full backup with all fields. Compatible with re-import.
- **Purchase Price** — Captured from CSV import and scan. Collection value banner shows total/gain/loss.
- **Market Prices** — Scryfall-sourced, stored in card_metadata. Manual refresh + daily cron.
- **Card Scanner** — Camera with OCR capture. Parked: needs GCV API key.

## Planned

### Card Search → Location ("Where is my card?")
**Priority:** High | **Effort:** Low

Search by name → see every copy with exact location. "Copy #1: Muldrotha deck. Copy #2: Commander Staples binder." Quick-link to deck/binder.

### Wishlist
**Priority:** Medium | **Effort:** Medium

Per-deck or global. Triggers on collection changes: "You just imported Rhystic Study — it's on Muldrotha's wishlist!" New table + notification logic.

### Trade Export
**Priority:** Low | **Effort:** Low

Cards not in any deck + not on wishlist = tradeable. Export for Cardsphere/Deckbox.

## Ideas

- **Set Completion Tracker** — Pick a set, see % owned, missing cards with prices
- **Collection Analytics** — Value over time, gainers/losers, most/least played cards
- **Duplicate Detection** — "You own 4 Counterspells but only 1 is in a deck"
- **Condition Tracking** — Track degradation over time, affect value calculations
- **AI Collection Insights** — "You could build a strong Boros tokens deck with 80% cards you own"
