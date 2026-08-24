# Combat Rules

## Overview

The combat phase is where creatures attack and block. Commander games often involve complex combat with multiple opponents.

## Combat Phase Structure

### 1. Beginning of Combat Step
- "At the beginning of combat" triggers go on the stack
- Last chance to tap/remove creatures before attackers are declared
- Active player gets priority

### 2. Declare Attackers Step
- Active player declares all attackers simultaneously
- Choose which opponent (or planeswalker) each creature attacks
- Attacking doesn't use the stack — it just happens
- "Whenever [this creature] attacks" triggers go on the stack
- Players get priority after attackers are declared

### 3. Declare Blockers Step
- Defending player(s) declare blockers simultaneously
- Each blocker can only block one attacker (unless it has special abilities)
- Multiple creatures can block the same attacker
- If multiple blockers, attacking player orders them for damage
- "Whenever [this creature] blocks" triggers go on the stack
- Players get priority after blockers are declared

### 4. Combat Damage Step
- Damage is dealt simultaneously (unless first strike/double strike)
- Attacking player assigns damage from each blocked creature to blockers in order
- Must assign lethal damage to each blocker before moving to next (deathtouch = 1 is lethal)
- Damage doesn't use the stack (since Magic 2010)
- Players get priority after damage

### 5. End of Combat Step
- "At end of combat" triggers go on the stack
- Last chance to do things while creatures are still "attacking" or "blocking"
- Players get priority

## First Strike and Double Strike

### First Strike
- Creates an additional combat damage step before the regular one
- Only creatures with first strike deal damage in this step
- Creatures killed by first strike don't deal damage back

### Double Strike
- Creature deals damage in BOTH the first strike step AND the regular step
- If it gains double strike after first strike damage, it only deals regular damage

## Attacking and Blocking Restrictions

### Attacking Requirements
- Creature must be untapped (unless vigilance)
- Creature must have been under your control since start of turn (unless haste)
- Must attack if "must attack" effects apply
- Can't attack if "can't attack" effects apply

### Blocking Requirements
- Creature must be untapped
- Can't block if "can't block" effects apply
- Must block if "must block" effects apply
- Can only block attackers attacking you (or planeswalkers you control)

### Evasion Abilities
- **Flying**: Can only be blocked by creatures with flying or reach
- **Menace**: Must be blocked by two or more creatures
- **Trample**: Excess damage goes to defending player/planeswalker
- **Unblockable**: Can't be blocked (various conditions exist)
- **Shadow**: Can only block/be blocked by creatures with shadow
- **Horsemanship**: Can only be blocked by creatures with horsemanship

## Multiplayer Combat Considerations

### Attacking Multiple Players
- You can attack different opponents with different creatures
- Each opponent declares blockers only for creatures attacking them
- "Whenever a creature attacks you" triggers for the appropriate player

### Two-Headed Giant
- Team attacks together, defending team blocks together
- Damage to a team goes to that team's shared life total

### Goad
- A goaded creature must attack each combat if able
- Must attack a player other than the one who goaded it, if able

## Combat Damage and Removal

### Damage Timing
- All combat damage happens at once (no more damage on the stack)
- Creatures with lethal damage marked die as a state-based action after damage
- No opportunity to sacrifice a creature "in response to damage"

### Removing Attackers/Blockers
- Removing an attacker after blocks are declared: creature it was blocked by is still "blocking"
- Removing a blocker after blocks: attacker is still "blocked" (no damage to player unless trample)
- Removing a creature before combat: it can't attack/block

## Provenance

- Source: Magic: The Gathering Comprehensive Rules, Section 506-511
- Rules Version: June 19, 2026
- Authored: 2026-08-03
