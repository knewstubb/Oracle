---
inclusion: always
---

# Allocation Terminology Convention

## Status vs Action Distinction

When discussing card allocation, use precise terminology:

### Status Terms (Nouns/Adjectives)
Describe the current state of a card or slot:

- **Original** — A copy is assigned to this slot and physically in this deck
- **Open** — Slot has no assigned copy, but a free copy exists in storage
- **Claimed** — Slot has no assigned copy; all owned copies are held by other decks
- **Proxy** — Slot is filled with a proxy copy
- **Unowned** — No copies exist anywhere in the collection

Example: "This card is **claimed** by Korvold."

### Action Terms (Verbs)
Describe what the user does to change state:

- **Pull** — Move a copy from another deck or storage into this deck's slot
- **Assign** — Assign a free copy from storage to a slot (subset of Pull, but from storage specifically)
- **Release** — Remove a copy from a slot, returning it to storage
- **Reassign** — Move a copy from one slot to a different slot

Example: "**Pull** this card from Korvold into Prosper."

## Why This Matters

- "Claimed" implies the card is held by something specific (another deck) — it's not a dead end
- "Pull" is the action verb that resolves a "Claimed" status
- Keeps UI copy consistent: status chips say "Claimed", action buttons say "Pull"

## Anti-patterns

- "Claim this card" — Use "Pull this card" instead (action)
- "Card is pulled" — Use "Card is claimed" or "Card is in [Deck]" (status)
- "Unclaim" — Use "Release" (action)

## Provenance

- Authored: 2026-07-27
- Motivated by: User request to distinguish between the status ("claimed") and the action ("pull")

