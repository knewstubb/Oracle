# Product Roadmap — The Oracle

> Last updated: 2026-07-23
> Owned by: Product Manager
> Status: Active planning document

---

## Priority 1 — "Can I Build This?" (Pre-Brew Feasibility)

**The problem:** You find a cool commander, brew a full 99, import it, then discover you're missing 30 cards worth $200. The answer should come *before* you commit.

**What it does:**
- Paste a decklist URL or commander name
- Instantly see: "You own 67/99 of these cards"
- "12 are currently in other decks (would need to swap)"
- "20 you don't own (est. $85 to acquire)"
- Cards grouped by: already free / steal from another deck / need to buy

**Why it's #1:** Saves the most time. Prevents the most disappointment. Uses data that already exists in the system.

**Effort:** Medium — needs a new API endpoint that cross-references a decklist against physical_copies + deck_cards allocation.

---

## Priority 2 — Game Night Readiness View

**The problem:** It's Thursday night. Which of my 12 decks can I grab and play right now?

**What it does:**
- Single view: "These 6 decks are 100% ready to sleeve up"
- "These 2 need you to move Sol Ring from deck A to deck B (5 min prep)"
- "This one is missing a $40 card you haven't bought"
- One-tap swap suggestions for shared cards

**Why it's #2:** Answers the most common real-world question before every game session.

**Effort:** Low — mostly a UI view on top of existing completeness data + shared-cards queries.

---

## Priority 3 — Card Search → Location ("Where is my Rhystic Study?")

**The problem:** You own a card but can't remember which deck it's in or which binder.

**What it does:**
- Search by name → see every copy you own
- Each copy shows: "Copy #1 in Muldrotha deck. Copy #2 in Commander Staples binder."
- Quick-link to the deck or binder

**Why it's #3:** Fast utility. Gets asked multiple times per week.

**Effort:** Low — the data exists. Needs a search endpoint that queries physical_copies + deck_cards join + storage_locations.

---

## Priority 4 — Proxy Print Sheet

**The problem:** You print proxies. Oracle knows which slots are proxied. Currently you manually look up each card on Scryfall and arrange them in a word doc.

**What it does:**
- Button on deck page: "Export Proxy Sheet"
- Generates a printable grid of all proxy cards at correct card dimensions (2.5" × 3.5")
- Ready to print, cut, and sleeve

**Why it's #4:** Saves 30 minutes every time you proxy a deck. Tangible utility.

**Effort:** Medium — needs an image layout engine (either server-side PDF or client-side canvas).

---

## Priority 5 — Wishlist / "Cards I Want"

**The problem:** You know you want certain cards. When you eventually acquire one, you want Oracle to tell you which deck gets it.

**What it does:**
- Per-deck or global wishlist
- "You just imported 5 new cards — 2 of them are on your wishlist for Muldrotha"
- Triggers on collection changes (CSV import, scan)

**Why it's #5:** Connects acquisition to allocation. Medium-frequency use but high satisfaction.

**Effort:** Medium — new table (wishlists), trigger logic on collection changes, notification UI.

---

## Priority 6 — Per-Deck Budget Breakdown

**The problem:** "How much does this deck cost? What's the damage if I cut the expensive pieces?"

**What it does:**
- Total deck value (already partially done in header)
- Top 10 most expensive cards with prices
- "Without Mana Crypt ($180), this deck is $167"
- Budget categories: under $1 / $1-5 / $5-20 / $20+ / $50+

**Why it's #6:** Nice to have. Price data exists; just needs a view.

**Effort:** Low — query card_metadata prices for deck's cards, group and sum.

---

## Priority 7 — Deck Comparison / "What's Different?"

**The problem:** You want to compare your build against a popular version, or against another of your own decks.

**What it does:**
- Diff view: "EDHREC's average Muldrotha build vs yours"
- "You're missing these 15 staples, you're running these 8 unusual picks"
- Side-by-side two of your own decks that share a color identity

**Why it's #7:** Cool but less frequently needed. You can eyeball it.

**Effort:** Medium — needs EDHREC data fetch + diff algorithm + UI.

---

## Priority 8 — Trade Export

**The problem:** You want to trade cards you're not using.

**What it does:**
- Auto-generate a "trade binder" list: cards not in any deck, not on any wishlist
- Export in formats compatible with Cardsphere, Deckbox trade systems
- "Want" list export from wishlists

**Why it's #8:** Niche — only matters if you actively trade.

**Effort:** Low — filter physical_copies where not allocated and no wishlist reference, format as text.

---

## Parked (Not Prioritized)

| Feature | Why parked |
|---------|-----------|
| Camera scanner (OCR) | Needs Google Cloud Vision API key configured. Code is ready. |
| Multi-user support | Single-user app for now. IDOR fixes done for future-proofing. |
| Format legality checking | Low priority for casual Commander. |
| Social / deck sharing | Not needed for personal use. |
| Moxfield-style public profiles | Not a goal. |

---

## Recently Shipped (2026-07-22/23)

- Goldfish / playtesting mode
- Collection CSV export
- Multi-platform deck import (5 platforms)
- Daily price refresh cron
- Purchase price tracking on import
- E2E test suite (55 tests) + CI pipeline
- Security audit + fixes
- Proportional color bar on deck tiles
- Deck tile visual redesign (icon badges, dashed brewing, desaturated graveyard)
- Figma design system (variables pushed via API)

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-23 | Priorities set by "how often do I ask this question?" | Frequency of use × time saved = value |
| 2026-07-23 | "Can I Build This?" is #1 | It's the only feature that prevents wasted work (brew then discover you can't afford it) |
| 2026-07-23 | Camera scanner parked | OCR approach works but needs API key. Manual text entry covers the use case for now. |
