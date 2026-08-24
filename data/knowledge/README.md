# Commander Strategy Knowledge Base

This directory contains structured knowledge for AI-assisted deck building. Each file is designed to be consumed by the Oracle AI when helping users brew, refine, or understand Commander decks.

## Directory Structure

```
knowledge/
├── index.json              # Manifest mapping topics → files for AI retrieval
├── fundamentals/           # Core concepts every deck needs
│   ├── deck-anatomy.md     # Standard deck structure (lands, ramp, draw, etc.)
│   ├── mana-curve.md       # Curve theory for Commander
│   ├── card-advantage.md   # Draw engines, recursion, value
│   └── interaction.md      # Removal, counters, protection
├── archetypes/             # Strategy-based deck patterns
│   ├── aristocrats.md
│   ├── blink.md
│   ├── combo.md
│   ├── control.md
│   ├── group-hug.md
│   ├── lands-matter.md
│   ├── mill.md
│   ├── pillowfort.md
│   ├── reanimator.md
│   ├── spellslinger.md
│   ├── stax.md
│   ├── superfriends.md
│   ├── tokens.md
│   ├── voltron.md
│   └── wheels.md
├── tribes/                 # Creature-type specific strategies
│   ├── angels.md
│   ├── demons.md
│   ├── dinosaurs.md
│   ├── dragons.md
│   ├── eldrazi.md
│   ├── elves.md
│   ├── faeries.md
│   ├── goblins.md
│   ├── humans.md
│   ├── merfolk.md
│   ├── rats.md
│   ├── rogues.md
│   ├── slivers.md
│   ├── spirits.md
│   ├── vampires.md
│   ├── warriors.md
│   ├── wizards.md
│   └── zombies.md
├── mechanics/              # Keyword and trigger-based strategies
│   ├── +1+1-counters.md
│   ├── -1-1-counters.md
│   ├── artifacts-matter.md
│   ├── cascade.md
│   ├── clones.md
│   ├── enchantress.md
│   ├── energy.md
│   ├── equipment.md
│   ├── exile-matters.md
│   ├── graveyard.md
│   ├── landfall.md
│   ├── life-matters.md
│   ├── modified.md
│   ├── morph.md
│   ├── mutate.md
│   ├── ninjutsu.md
│   ├── proliferate.md
│   ├── sacrifice.md
│   ├── storm.md
│   ├── theft.md
│   ├── topdeck.md
│   └── treasure.md
└── colors/                 # Color identity guidance
    ├── white.md
    ├── blue.md
    ├── black.md
    ├── red.md
    ├── green.md
    ├── azorius.md          # WU
    ├── dimir.md            # UB
    ├── rakdos.md           # BR
    ├── gruul.md            # RG
    ├── selesnya.md         # GW
    ├── orzhov.md           # WB
    ├── izzet.md            # UR
    ├── golgari.md          # BG
    ├── boros.md            # RW
    ├── simic.md            # UG
    └── multicolor.md       # 3+ color considerations
```

## File Format

Each markdown file follows a consistent structure:

```markdown
# [Topic Name]

## Overview
Brief description of what this archetype/tribe/mechanic does.

## Core Strategy
How the deck wants to win and what it's trying to accomplish.

## Key Synergies
What cards/effects work well together.

## Essential Cards
Staples that almost every deck of this type should consider.

## Budget Alternatives
Lower-cost options for expensive staples.

## Common Commanders
Popular commanders that lead this strategy.

## Building Tips
Advice for constructing and tuning the deck.

## Common Pitfalls
Mistakes to avoid.

## Synergy Partners
Other archetypes/mechanics that pair well.

## Meta Considerations
Power level, speed, and matchup notes.
```

## Maintenance

When new sets release:
1. Check for new commanders that fit existing archetypes
2. Add new staples to relevant files
3. Create new files for any new mechanics (e.g., Energy in Kaladesh)
4. Update index.json with new entries

## Usage by AI

The Oracle AI should:
1. Consult `index.json` to find relevant knowledge files
2. Load files matching the user's deck concept
3. Use the knowledge to inform card suggestions and strategy advice
4. Cross-reference multiple files when strategies overlap (e.g., Zombie Aristocrats)
