# Roadmap: Deck Management

## Built

- **Multi-Platform Import** — URL: Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox. Text: MTGA + generic. CSV.
- **Deck Lifecycle** — Brewing → In Rotation → Graveyard. Icon badges (flask/check/skull).
- **Views** — Categories masonry, table, status-grouped. Mana curve + color pie.
- **Health Strip** — Category thresholds for Ramp, Removal, Draw, etc.
- **AI Brew** — Interactive deck building with EDHREC + Scryfall + Spellbook tool-use loop.
- **AI Upgrade** — Cut/add pairs with pricing from EDHREC.
- **AI Strategy** — Archetype identification, game plan, win conditions.
- **Post-Game Debrief** — Structured analysis + recommendations.
- **Combo Detection** — Commander Spellbook integration.
- **Goldfish** — Client-side shuffle/draw/mulligan with play zones.
- **Precon Mod Tracker** — Budget + rarity constraints.
- **Export** — Clipboard, MTGA format.

## Planned

### "Can I Build This?" (Pre-Brew Feasibility)
**Priority:** #1 | **Effort:** Medium

Before committing: paste a URL → instantly see "You own 67/99. 12 in other decks. 20 to buy ($85)." Groups: free / steal / buy. Could also work with just a commander name (fetch EDHREC average → check ownership).

### Per-Deck Budget Breakdown
**Priority:** Medium | **Effort:** Low

Total value, by tier ($1/$5/$20/$50+), "without Mana Crypt this is $167." Data already exists.

### Deck Diff / Comparison
**Priority:** Low | **Effort:** Medium

Your deck vs EDHREC average. Side-by-side: shared / yours-only / theirs-only. "Missing 15 staples, running 8 hipster picks."

## Ideas

- **Deck Versioning** — Track changes over time, revert to previous version
- **Deck Cloning** — Try a different direction without losing current build
- **Deck Templates** — Save archetype shells (30 staples), fill the rest per commander
- **Playgroup Metagame** — Log game results, win rates, matchup tracking
- **Bracket Self-Assessment** — Auto-suggest bracket 1-4 from deck contents
- **Format Legality** — Flag banned cards on import/format change
- **AI Deck Primer** — Auto-generate a written "how to pilot this deck" for sharing
- **Deck Tags/Labels** — "Aggro", "Combo", "Casual", "Competitive" — user-defined
