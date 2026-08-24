# The Stack and Priority

## Overview

The stack is a zone where spells and abilities wait to resolve. Understanding the stack is essential for interactive Magic gameplay.

## How the Stack Works

### Adding to the Stack
- When you cast a spell, it goes on the stack
- When you activate an activated ability, it goes on the stack
- When a triggered ability triggers, it goes on the stack
- Mana abilities do NOT use the stack

### Resolution Order (LIFO)
- Last In, First Out: the most recent spell/ability resolves first
- Each object resolves completely before the next begins resolving
- Players cannot take actions during resolution (except special actions)

## Priority

### What is Priority?
- Priority is permission to take an action
- Only the player with priority can cast spells or activate abilities
- Priority passes between players before anything resolves

### Priority Flow
1. Active player gets priority at the start of most steps/phases
2. After any spell/ability resolves, active player gets priority
3. When a player passes priority, the next player gets priority
4. When all players pass in succession with an empty stack, the phase/step ends
5. When all players pass with something on the stack, the top object resolves

### Special Cases
- Beginning of upkeep: Active player gets priority after upkeep triggers go on stack
- Draw step: Active player draws, then gets priority (triggers can go on stack)
- Combat: Multiple priority passes (beginning of combat, declare attackers, declare blockers, damage, end of combat)

## Responding to Spells and Abilities

### Instant-Speed Interactions
- You can cast instants (or cards with flash) when you have priority
- You can activate abilities when you have priority (unless restricted)
- "In response" means adding something to the stack before the previous object resolves

### Split Second
- While a spell with split second is on the stack, players can't cast other spells or activate non-mana abilities
- Triggered abilities still trigger and go on the stack
- Special actions (like unmorphing) can still be taken

## Triggered Abilities

### When Triggers Happen
- A triggered ability triggers when its condition is met
- It goes on the stack the next time a player would receive priority
- Multiple triggers at the same time: active player's triggers go on stack first (in any order), then next player's

### Trigger Stacking (APNAP)
- Active Player, Non-Active Player order
- The active player puts all their triggers on the stack first (in any order they choose)
- Then each other player in turn order does the same
- Result: non-active player's triggers resolve first

## Common Stack Interactions

### Counterspells
- Counter target spell removes it from the stack
- A countered spell goes to its owner's graveyard (usually)
- You can respond to a counterspell with another spell

### Removal in Response
- Removing a permanent doesn't counter abilities already on the stack
- "Dies" triggers will still trigger if the creature goes to graveyard
- Activated abilities are independent of their source once on the stack

### Copy Effects
- Copying a spell puts the copy on the stack
- The copy can have different targets
- The copy isn't "cast" unless the effect says so

## Provenance

- Source: Magic: The Gathering Comprehensive Rules, Sections 116-117, 405
- Rules Version: June 19, 2026
- Authored: 2026-08-03
