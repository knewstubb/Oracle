# State-Based Actions

## Overview

State-based actions (SBAs) are automatic game actions that happen whenever a player would receive priority. They don't use the stack and can't be responded to.

## When SBAs Are Checked

- Before any player receives priority
- After any spell or ability resolves
- Multiple SBAs can happen simultaneously
- SBAs are checked repeatedly until none apply

## Player State-Based Actions

### Life Total
- **0 or less life**: Player loses the game
- Exception: If an effect says you can't lose, you don't

### Poison Counters
- **10 or more poison counters**: Player loses the game
- Commander often ignores poison or uses different thresholds (house rule)

### Drawing from Empty Library
- If a player tried to draw from an empty library since the last SBA check, they lose
- Note: This is checked as an SBA, not at the moment of the failed draw

### Commander Damage
- **21+ combat damage from a single commander**: Player loses
- Tracked per-commander, persists across zone changes

## Creature State-Based Actions

### Lethal Damage
- Creature with damage marked equal to or greater than toughness is destroyed
- Damage remains marked until cleanup step

### Toughness Zero or Less
- Creature with 0 or less toughness is put into graveyard
- This is NOT destruction — "indestructible" doesn't prevent it

### Deathtouch
- Creature dealt damage by a source with deathtouch since last SBA check is destroyed
- Even 1 damage from deathtouch is lethal for SBA purposes

## Counter State-Based Actions

### +1/+1 and -1/-1 Counters
- If a permanent has both, remove pairs simultaneously until only one type remains
- Net result: A creature with 3 +1/+1 and 2 -1/-1 counters ends up with 1 +1/+1 counter

### Loyalty Counters
- Planeswalker with 0 loyalty is put into graveyard

## Attachment State-Based Actions

### Auras
- Aura not attached to anything: Put into graveyard
- Aura attached to an illegal object: Put into graveyard
- Aura attached to a phased-out permanent: Remains (phases out with it)

### Equipment
- Equipment attached to an illegal permanent: Becomes unattached (stays on battlefield)
- Equipment that's also a creature can't be attached to anything

### Fortifications
- Same as Equipment, but for lands

## Token State-Based Actions

### Tokens in Wrong Zones
- Token in a zone other than the battlefield ceases to exist
- This happens after any triggers from zone changes resolve

### Copy of a Copy
- Not an SBA, but related: If a token is copied, the copy is also a token

## Legendary and World Rule

### Legendary Rule
- If a player controls two+ legendary permanents with the same name, they choose one and put the rest into the graveyard
- This is simultaneous — "dies" triggers see all of them

### World Rule
- If two+ permanents have the "world" supertype, all except the one with the earliest timestamp are put into graveyard

## Planeswalker Uniqueness (Historical)

- **Old rule** (pre-Ixalan): If two+ planeswalkers shared a planeswalker type, all went to graveyard
- **Current rule**: Planeswalkers are legendary; normal legendary rule applies
- Now you can control [[Jace, the Mind Sculptor]] and [[Jace, Vryn's Prodigy]] simultaneously

## Commander-Relevant SBAs

### Multiple SBAs Simultaneously
- If a player takes 21 commander damage AND has 0 life in the same SBA check, both conditions are met
- Player loses from whichever (both are equally valid causes)

### Indestructible Doesn't Stop Everything
- Indestructible prevents destruction (lethal damage, destroy effects)
- Doesn't prevent: 0 toughness, sacrifice, exile, "put into graveyard" (non-destroy)

### Regeneration
- "Regenerate" creates a replacement effect: instead of being destroyed, tap it, remove damage, remove from combat
- Must be set up BEFORE the destruction event
- Can regenerate from lethal damage or destroy effects
- Can't regenerate from sacrifice, exile, or 0 toughness

## Interaction Example

Board state: [[Tarmogoyf]] (*/\*+1) with 3 card types in all graveyards = 3/4
- Opponent casts [[Lightning Bolt]] dealing 3 damage
- Bolt resolves, goes to graveyard (now 4 types, Tarmogoyf is 4/5)
- SBA check: Tarmogoyf has 3 damage marked, toughness is 5
- Tarmogoyf survives!

## Provenance

- Source: Magic: The Gathering Comprehensive Rules, Section 704
- Rules Version: June 19, 2026
- Authored: 2026-08-03
