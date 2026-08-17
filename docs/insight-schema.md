# Commander Insight Schema

## Overview

Commander insights are structured data extracted from content sources (videos, articles, podcasts) that enable Oracle to have informed conversations about deck building. Each insight document represents one **build variant** for a commander.

## Taxonomy Model

Every deck is described by three dimensions:

| Dimension | Question | Examples |
|-----------|----------|----------|
| **Theme** | What is this deck *about*? | counters, sacrifice, artifacts, dragons |
| **Archetype** | How does this deck *play*? | aggro, control, combo, midrange |
| **Mechanics** | What rules tools does it *leverage*? | cascade, proliferate, landfall |

A single commander can have multiple build variants with different theme/archetype combinations:

```
Atraxa, Praetors' Voice:
  - Build 1: theme=counters, archetype=midrange, mechanics=[proliferate]
  - Build 2: theme=planeswalkers, archetype=control, mechanics=[proliferate]  
  - Build 3: theme=infect, archetype=aggro, mechanics=[proliferate, infect]
```

## Database Schema

### `ref_commander_insights` table

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | uuid | Yes | Primary key |
| `commander_id` | uuid | Yes | FK to `ref_commanders.id` |
| `build_variant` | string | Yes | Theme slug (e.g., "counters", "dragons") |
| `archetype` | string | No | Archetype slug (e.g., "midrange", "aggro") |
| `insight_type` | string | Yes | Type of insight (see below) |
| `content` | text | Yes | The actual insight content |
| `taxonomy_tags` | string[] | No | All relevant slugs for cross-referencing |
| `card_mentions` | string[] | No | Card names mentioned (for linking) |
| `confidence` | number | No | 0-1 confidence score |
| `source_type` | string | Yes | Source type (see Source Trust Model below) |
| `source_trust` | decimal | No | 0-1 trust score for the source (default 0.50) |
| `source_url` | string | No | Source URL |
| `source_title` | string | No | Source title |
| `source_author` | string | No | Content creator |
| `source_date` | date | No | Publication date |

### Insight Types

| Type | Purpose | Example Content |
|------|---------|-----------------|
| `strategy` | Core strategy, game plan, play patterns | "Early game: deploy mana dorks. Mid game: stick Atraxa. Late game: proliferate to victory." |
| `card_recommendation` | Core cards, specific suggestions with reasoning | "Hardened Scales is core — every counter doubled pays off immediately." |
| `synergy` | How cards work together | "Forgotten Ancient + Kalonian Hydra: redistribute counters before combat, then double." |
| `budget_alternative` | Budget alternatives and considerations | "Doubling Season ($50) → Branching Evolution ($5): creatures only but 90% of the effect." |
| `common_mistake` | Pitfalls to avoid | "Don't overload on doublers without enough creatures to carry counters." |
| `matchup` | How to play against specific strategies | "Against board wipe decks, prioritize undying creatures and Inspiring Call." |
| `meta_consideration` | Power level and meta considerations | "This build is bracket 3-4. For higher power, add Heliod combo." |
| `upgrade_path` | How to improve the deck, flex slots | "Premium upgrades: Ancient Tomb, Chrome Mox for explosive starts." |

## Source Trust Model

The `source_trust` field (0-1) indicates the reliability of the insight's source. Higher values mean more trustworthy data.

### Base Trust Scores by Source Type

| Source Type | Base Trust | Rationale |
|-------------|------------|-----------|
| `edhrec` | 0.85 | Aggregated data from thousands of decks |
| `edhrec-article` | 0.75 | Editorial content from EDHREC staff |
| `mtggoldfish` | 0.80 | Data-driven content with price/meta analysis |
| `mtggoldfish-article` | 0.70 | Editorial content from MTGGoldfish |
| `youtube-tier1` | 0.75 | Top creators: Command Zone, Tolarian, EDHRECast |
| `youtube-tier2` | 0.70 | Established creators: MTGMuddstah, Nitpicking Nerds |
| `youtube-tier3` | 0.55 | Other YouTube content |
| `commanders-herald` | 0.70 | Commander-focused articles |
| `reddit` | 0.55 | Community discussion (varies widely) |
| `discord` | 0.50 | Community discussion (unvetted) |
| `ai-analysis` | 0.60 | AI-generated analysis (needs verification) |
| `user-submitted` | 0.45 | User-contributed insights |
| `curated` | 0.90 | Manually curated by domain experts |
| `unknown` | 0.50 | Default for unclassified sources |

### YouTube Creator Tiers

Tier 1 creators (0.75 base trust):
- The Command Zone / Game Knights
- Tolarian Community College
- EDHRECast
- Playing with Power MTG
- MTG Goldfish (video content)

Tier 2 creators (0.70 base trust):
- MTGMuddstah
- Nitpicking Nerds
- Commander Clash
- I Hate Your Deck
- Commander VS
- The Spike Feeders

### Recency Decay

Some sources become less reliable over time as the meta shifts. The `calculateAdjustedTrust()` function in `src/lib/source-trust-config.ts` applies monthly decay:

| Source Type | Monthly Decay | Min Trust |
|-------------|---------------|-----------|
| `edhrec` | -0.5% | 0.70 |
| `youtube-*` | -2.0% | 0.40 |
| `reddit` | -3.0% | 0.30 |
| `curated` | -0.25% | 0.75 |

Example: A YouTube tier-1 insight from 12 months ago: `0.75 * (1 - 0.02)^12 = 0.59`

### Usage in Oracle

When weighing conflicting insights:
1. Prefer higher `source_trust` values
2. Apply recency decay based on `source_date`
3. Weight by `confidence` × `source_trust` for composite score
4. For critical decisions, surface trust level to user ("According to EDHREC data...")

### Implementation

Trust configuration is defined in `src/lib/source-trust-config.ts`:

```typescript
import { getBaseTrust, calculateAdjustedTrust } from '@/lib/source-trust-config';

// Get base trust for a source type
const trust = getBaseTrust('edhrec'); // 0.85

// Calculate adjusted trust with recency decay
const adjustedTrust = calculateAdjustedTrust('youtube-tier1', new Date('2025-06-01')); // decayed value
```

## Canonical Slugs

All `build_variant`, `archetype`, and `taxonomy_tags` values must use slugs from `index.json`:

### Theme Slugs (build_variant)
```
artifacts, clones, counters, enchantments, energy, equipment, exile,
graveyard, infect, landfall, planeswalkers, sacrifice, spellslinger,
tokens, treasure, vehicles
```

Plus all tribe slugs when the theme is tribal:
```
dragons, zombies, elves, vampires, goblins, angels, etc.
```

### Archetype Slugs
```
aggro, aristocrats, artifacts-matter, blink, cast-from-exile, chaos,
combo, control, enchantress, group-hug, group-slug, lands-matter,
legendary-matters, lifegain, mill, pillowfort, ramp, reanimator,
stax, superfriends, theft, voltron, wheels
```

### Mechanic Slugs (for taxonomy_tags)
```
cascade, flashback, madness, proliferate
```

## Example Insight Document

```json
{
  "commander_id": "189dee6d-5328-4b21-bac3-63e7b932b47c",
  "build_variant": "counters",
  "archetype": "midrange",
  "insight_type": "strategy",
  "content": "Atraxa counters is a value-based midrange deck that wins through accumulated advantage. Early game focuses on deploying counter sources (creatures that enter with counters, Hardened Scales). Mid game establishes Atraxa and begins the proliferate engine. Late game converts counter advantage into wins via Champion of Lambholt (evasion), Walking Ballista (direct damage), or Simic Ascendancy (alt win).",
  "taxonomy_tags": ["counters", "midrange", "proliferate"],
  "card_mentions": ["Atraxa, Praetors' Voice", "Hardened Scales", "Champion of Lambholt", "Walking Ballista", "Simic Ascendancy"],
  "confidence": 0.9,
  "source_type": "curated",
  "source_trust": 0.90,
  "source_title": "Atraxa Counters Primer"
}
```

## Distillation Process

When distilling content into insights:

1. **Identify build variants** — One commander may have multiple distinct builds
2. **Classify each build** — Assign theme, archetype, mechanics
3. **Extract insight types** — Pull strategy, cards, synergies, mistakes, etc.
4. **Normalize names** — Use canonical slugs, exact card names
5. **Tag cards** — Populate `card_mentions` for hover previews
6. **Rate confidence** — Higher for explicit statements, lower for inferences

## Oracle Usage

When a user asks about a commander:

1. Pull all insights for that commander
2. Filter by build variant if specified ("I want to build Atraxa counters")
3. Pull theme knowledge file (e.g., `themes/counters.md`)
4. Pull archetype knowledge file (e.g., `archetypes/midrange.md`)
5. Synthesize response from insights + knowledge + user's collection data

## Provenance

- Schema version: 2.1.0
- Authored: 2026-08-03
- Updated: 2026-08-12 (added source trust model)
- Motivated by: Need for structured, compositional advice that avoids hallucination
