# Brief: Suggested categories when adding a card (Gate 1 DRAFT)
Author: Product, drafted 2026-11-16. Status: **DRAFT, awaiting owner approval. NOT approved. Nothing is built.**
Order: third of three. Needs the Claude "set card category" tool and the category management screen first (`category-management.md`).

## 1. What this is, in plain words
When you add a card to a deck, Oracle offers categories for it, based on how you filed the same card in your other decks and on what EDHREC tags it as. You (or Claude) can accept or change them. Categories stay per deck.

Example: you add Cultivate to Prosper. Your Korvold deck has it under "Ramp", and EDHREC tags it Ramp. Oracle offers "Ramp". Sol Ring might be "Ramp" in one deck and "Good Stuff" in another; both stay as you set them.

## 2. Problem
Every card added today starts with no useful category, so you or Claude file it by hand each time, and the same card gets different names in different decks.

## 3. Goals
1. On add, show suggested categories with where each came from ("from your Korvold deck", "EDHREC tag").
2. Accept, change or ignore the suggestion in one step. Claude can see the suggestions and override them.
3. Suggestions use names you already use in the target deck first, so no new near-duplicates appear.

## 4. Scope
In: suggestions on add (screen and Claude), sources, override.
Out: changing categories of cards already in decks (that is management), a fixed global default list, tagging by Claude's own judgement beyond what the connector already allows, re-filing existing decks automatically.

## 5. Rules
- Categories are per deck. A suggestion never changes another deck.
- No hard global default. If there is nothing to suggest, the card is simply left uncategorised (it stays in the normal ungrouped section) rather than forced into one.
- A suggestion is only a starting point; nothing is saved against your wishes.
- Up to 5 categories per card; the first is the group the card shows under.
- Never suggests "Maybeboard" or "Commander" (reserved).

## 6. Scenarios
| # | When | Wants |
|---|---|---|
| S1 | Add a card you already filed in another deck | That filing offered, with the deck named |
| S2 | Add a card in no other deck | EDHREC tag offered if there is one, otherwise nothing |
| S3 | Your decks disagree (Ramp in one, Good Stuff in another) | Both offered, you pick; the one from the most-used or most similar deck first |
| S4 | Claude adds cards | Claude sees the suggestions, may accept or override; many-card adds still need your yes as today |
| S5 | Adding by import | Not changed in this brief (see question 4) |

## 7. What must never happen
- Suggested names silently overwrite a category you set.
- A card in deck A changes because you filed it in deck B.
- A misspelt duplicate of an existing category appears ("ramp" next to "Ramp").

## 8. Proposed slices
1. Suggestions from your other decks, shown when adding on screen.
2. EDHREC tag as a second source.
3. Claude sees suggestions on add and can override.

## 9. Resolved by the owner (2026-11-16)
- **Offered, not auto-applied:** suggestions are shown and you click to accept; nothing is filed without you.
- **Source priority:** your own decks come before EDHREC when they disagree.

## 9a. Open questions for the owner (behaviour)
3. **Many decks disagree.** If five decks say Ramp and one says Good Stuff, show all, or only the most common? Recommended: show up to two, most common first.
4. **Imports.** Should an import (Archidekt, Moxfield) also get suggestions for cards that arrive without categories? Recommended: not in this version.
5. **Priority.** How important is this compared with other connector work? Recommended: after management, since it relies on tidy names.

## 10. Risks
- EDHREC tags use their own words (for example "Mana Rock"); they must be mapped to your names or they create duplicates. The audit should check what tag data Oracle already stores.
- Suggestions depend on categories being consistent, which is why management comes first.

## 11. Next gates
Owner approves, Architect audit, Designer mockup, Developer slices, Tester, Scribe.

For Brad (plain words): when you add a card, Oracle proposes categories from your other decks and EDHREC, and you keep full control per deck.
