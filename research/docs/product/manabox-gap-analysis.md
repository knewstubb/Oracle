# Manabox Gap Analysis

> Last updated: 2026-07-16
> Purpose: Deep comparison of Manabox's feature set vs The Oracle, identifying parity gaps, differentiation opportunities, and areas where Manabox's model informs our design decisions.

## Executive Summary

Manabox is a mobile-first MTG companion app (iOS/Android, planning desktop) focused on physical card management — scanning, tracking, pricing, trading, and deck building. It's format-agnostic (supports Standard, Modern, Commander, etc.) and multi-user.

The Oracle is a web-first, single-user Commander-specific app with deeper AI integration, instance-level allocation tracking, and a focus on the "shared card" problem unique to players who run multiple Commander decks from one collection. Manabox is broader; The Oracle is deeper in its niche.

---

## Feature Comparison

### Collection Management

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| Card scanning (camera) | Yes — artwork-based detection, quick mode, set locking | No | Major gap |
| Binder organization | Yes — named binders mirroring physical locations | Yes — "Storage Locations" | Parity |
| Lists (wishlists/buylists) | Yes — separate from owned cards, not counted for deck building | No — all cards are "owned" or "unowned" | Gap |
| Printing-level tracking | Yes — exact set, foil, condition, language, altered, misprint | Partial — set, foil, condition. No language/altered/misprint | Minor gap |
| Bulk editing | Yes — multi-select, batch property changes | No | Gap |
| Set collector view | Yes — shows completion % per set, missing cards highlighted | No | Gap |
| Purchase price tracking | Yes — records buy price, shows gain/loss over time | No — only current market price | Gap |
| Value change alerts | Yes — tracks % change from purchase price | No | Gap |
| CSV import/export | Yes — comprehensive column support | Yes — import only (Archidekt CSV format) | Partial gap (no export) |
| Text import | Yes — MTGA format, flexible parsing | No (URL and CSV only) | Gap |
| Complete set import | Yes — add entire set to collection | No | Minor gap |

### Deck Management

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| Deck creation | Yes — name + format, card search to add | Yes — import from URL, CSV, or manual add | Parity |
| Deck folders | Yes | No | Gap |
| Deck stats (mana curve, type distribution, color pie) | Yes — built-in | Yes — Analysis tab (AI-powered, deeper) | Oracle ahead |
| Deck pricing (total value) | Yes — shows total by price provider, can filter boards/basics | Partial — per-card prices shown, no deck total | Gap |
| Deck simulator / goldfish | Yes — draw hands, goldfish turns | No | Major gap |
| Card recommendations (EDHREC) | Yes — integrated into deck screen | Yes — Upgrade tab with EDHREC synergy data | Parity |
| Commander format awareness | Yes — partner commanders, color identity validation | Yes — color identity enforcement, commander detection | Parity |
| Deck boards (sideboard, maybeboard) | Yes — multiple boards per deck | Yes — categories include Maybeboard/Sideboard | Parity |
| Tags per card | Yes | Yes — categories + tags | Parity |
| Format legality checking | Yes — warns about not-legal cards | No | Gap |

### Deck-Collection Integration

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| "Build from collection" | Yes — finds cards in binders/decks, moves them, shows missing | Yes — allocation engine (Tiers 1-5), Picklist resolution | Oracle ahead |
| "Add as new cards" | Yes — imports deck and registers cards in collection simultaneously | Yes — `importDeckAddNewCards` (creates physical_copies) | Parity |
| Cross-deck card sharing visibility | Limited — can search "which decks have this card" | Yes — Shared Cards view, Claimed status, Tier 3/4 claim resolution | Oracle significantly ahead |
| Deck disassembly | Yes — moves cards back to a binder | No — archive only, no explicit "return to storage" | Gap |
| Missing cards export | Yes — share/export just the missing cards list | No (Picklist shows missing but no export) | Gap |
| Deck status lifecycle | No — decks are just lists (registered or not) | Yes — Brew → Built → Archived with allocation behavior per status | Oracle ahead |
| Collection filter in search | Yes — when building, search can be limited to owned cards only | No | Gap |

### Import Sources

| Source | Manabox | The Oracle |
|--------|---------|-----------|
| Archidekt URL | Yes | Yes |
| Moxfield URL | Yes | Yes |
| Aetherhub URL | Yes | No |
| Deckstats URL | Yes | No |
| MTGTop8 URL | Yes | No |
| Scryfall URL | Yes | No |
| TappedOut URL | Yes | No |
| TCGplayer URL | Yes | No |
| Untapped.gg URL | Yes | No |
| Text paste (MTGA format) | Yes | No (tab disabled) |
| CSV import | Yes | Yes |
| Precon decklist browser | Yes — official precon library | No |

### Pricing & Trade

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| Multi-provider pricing | Yes — Cardmarket, TCGplayer, Card Kingdom | Partial — Scryfall USD, Card Kingdom (limited) | Gap |
| Trade tool | Yes — fair trade calculator between two parties | No | Major gap |
| Buy links | Yes — direct links to purchase on TCGplayer/CK/Cardmarket | No | Gap |
| Price alerts / notifications | Unknown (not documented) | No | Unknown |

### AI & Analysis

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| AI deck building | No | Yes — Brew Mode V2 with Claude/Gemini/DeepSeek | Oracle significantly ahead |
| Post-game debrief | No | Yes — Debrief Mode with AI analysis | Oracle significantly ahead |
| Deck health monitoring | No | Yes — Monitor Mode with category targets | Oracle ahead |
| Dead weight detection | No | Yes — EDHREC synergy-based card flagging | Oracle ahead |
| Strategy documentation | No | Yes — Strategy tab with auto-generated primer | Oracle ahead |
| Combo detection | No | Yes — Commander Spellbook integration | Oracle ahead |
| Upgrade suggestions | No (only EDHREC recs) | Yes — Upgrade tab with price/synergy comparison | Oracle ahead |
| Mana base analysis | No | Yes — AI-powered mana source/pip analysis | Oracle ahead |

### Platform & Infrastructure

| Capability | Manabox | The Oracle | Gap |
|-----------|---------|-----------|-----|
| Mobile app | Yes — iOS + Android (primary platform) | No (web only, responsive) | Major gap |
| Desktop/web app | Planned (not yet available) | Yes — web app (primary platform) | Oracle ahead (for now) |
| Offline support | Yes — full offline database, cloud sync optional | No — requires internet | Gap |
| Cloud sync | Yes (Pro feature) — multi-device sync | Yes — Supabase (always cloud) | Different approach |
| Multi-user | Yes | No (single-user) | Different scope |
| Subscription model | Yes — $2.49/mo or $22.99/yr for Pro features | No — free (personal tool) | N/A |

---

## Key Differentiators (The Oracle's Unique Strengths)

1. **Instance-level allocation** — Manabox knows "you own 3 Sol Rings" and "Deck A uses Sol Ring." The Oracle knows "physical copy #4782 (MH2, foil, NM) is currently assigned to slot #12 in Deck A." This enables precise shared-card tracking that Manabox can't do.

2. **AI-powered deck building** — Manabox has no AI. The Oracle has conversational brew sessions, strategy generation, post-game analysis, and automated upgrade suggestions.

3. **Deck lifecycle management** — Manabox treats decks as flat lists (registered in collection or not). The Oracle has Brew → Built → Archived with different allocation behaviors at each stage, and the Unplayable badge that tracks completeness.

4. **Cross-deck conflict resolution** — The Oracle's Claimed status + Tier system + Picklist provides a guided resolution workflow when one physical card is needed by multiple decks. Manabox just shows where a card is; it doesn't help you decide where it should go.

5. **Commander-specific depth** — Bracket detection, pod-aware strategy, category health monitoring, and combinatorial analysis are all Commander-focused features that a format-agnostic tool like Manabox doesn't attempt.

---

## Key Gaps (Where Manabox Is Ahead)

### Critical gaps (significant user workflow impact)

1. **Card scanning** — The ability to point a camera at a card and have it recognized instantly is Manabox's killer feature for collection building. Without this, The Oracle requires manual CSV import or third-party scanning tools (Archidekt, etc.).

2. **Deck goldfish simulator** — Draw hands, test consistency, simulate early turns. Valuable during brew phase. The Oracle's Brew Mode is conversational but doesn't offer mechanical simulation.

3. **Offline access** — Manabox works entirely offline with periodic sync. The Oracle requires internet for every interaction.

4. **Mobile experience** — Manabox is mobile-native. The Oracle is responsive-web but not installable/native, meaning it's suboptimal at the LGS or during games.

### Moderate gaps (nice-to-have, not blocking)

5. **Wishlists / buylists** — Separate tracked lists for cards you want but don't own. The Oracle's "unowned" status partially covers this but there's no dedicated buylist workflow.

6. **Trade tool** — Fair-trade calculator showing value difference. Useful but niche.

7. **Deck folders** — Organization at scale. Less relevant for a single-user Commander app with ~10 decks.

8. **Format legality checking** — Warns about banned/not-legal cards. Useful for casual players who might accidentally include non-Commander-legal cards.

9. **Multi-source pricing** — Cardmarket (EU), TCGplayer (US), Card Kingdom. The Oracle currently only has Scryfall/CK pricing.

10. **Deck disassembly** — Formal "return cards to storage" flow vs just archiving.

---

## Manabox's Planned Direction

Based on their FAQ and documentation:
- **Desktop app** planned (Windows/macOS/Linux) — not web. They specifically chose native over web.
- **No lifetime purchase** — committed to subscription model for ongoing development.
- **No other card games** — focusing on MTG core features first.
- **No life counter** — they don't compete with Playgroup/TGS/LifeCounter apps.

---

## Recommendations for The Oracle

### Don't compete (different scope)

- Card scanning (requires native app + ML model investment)
- Multi-format support (The Oracle's Commander depth is the differentiation)
- Trade tool (social feature, needs multi-user)
- Offline support (architectural constraint of web-first + Supabase)

### Adopt Manabox's patterns (proven UX)

- **Import mode picker** ("Add as new cards" vs "Build from collection") — adopt this exact UX pattern for the import flow. It's intuitive and solves a real decision point.
- **Binder/List distinction** — consider separating "owned" (binders/storage) from "want" (lists). Currently everything lives in one flat collection.
- **Collection search filter in deck builder** — when adding cards during brew, option to filter search to "only cards I own."
- **Missing cards export** — from Picklist, generate a text/CSV of cards needed for purchase.
- **Deck total value** — sum of all card prices in a deck, visible in the deck header.

### Build on The Oracle's strengths (widen the moat)

- **AI game analysis** — debrief mode is unique, push it further
- **Allocation intelligence** — auto-suggest which deck to claim from based on play frequency
- **Pod-aware recommendations** — The Oracle knows the playgroup context, Manabox doesn't
- **Proxy print workflow** — integrated proxy generation (PDF export for printing) since The Oracle already tracks proxy status

---

## Provenance

- Authored: 2026-07-16
- Sources: Manabox App Store listing, manabox.app/guides (all sections), Google Play description
- Methodology: Feature-level comparison based on documented functionality and app descriptions. No hands-on testing of Manabox app was performed.
