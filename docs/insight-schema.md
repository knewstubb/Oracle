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
| `source_type` | string | Yes | "youtube", "article", "podcast", "curated" |
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

- Schema version: 2.0.0
- Authored: 2026-08-03
- Motivated by: Need for structured, compositional advice that avoids hallucination
