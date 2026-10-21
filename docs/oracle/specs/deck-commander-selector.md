# Deck page commander selector — spec (rev 1)

Mockup: `docs/oracle/mockups/deck-commander-selector.html`. Replaces the commander step that used to sit inside the deck import (see `import-review-controls.md`).

## 1. The problem
A deck imported from ManaBox has no commander, so it stays Draft (D-002) until one is set. Today the only way is a "Choose commander" button in the far-right action group of the deck header. It disappears once a commander is set, so the commander can't be changed or cleared from the same place. Partner and Background pairs can't be expressed.

## 2. Principle
- Controls sit beside what they act on (D-015): the commander control goes beside the deck name, not among page actions.
- Constrain, don't validate: only cards that can legally lead are listed.
- Visible status: "No commander" is a plain readable state, not an error (D-014).
- Progressive disclosure: the second slot appears only for Partner / Choose a Background commanders.

## 3. Placement (flag)
Second line under the deck name, right after the format badge, before the stats. The old action-group button is removed. Shown only for commander formats. **Flag:** this changes the name block of the deck header, not the actions slot used today; Developer to confirm wrapping on narrow screens. Also: the deck should open with the selector visible but not auto-opened after an import (needs owner confirmation; supersedes D-052).

## 4. Component inventory
| Component | Props | Built on |
|---|---|---|
| `CommanderSelector` | deckId, cards, commander, partner, onChange | Popover + Command |
| `CommanderSlot` | role (commander/partner/background), card, open | outline Button |
| `CommanderOption` | card, keyword, selected | CommandItem, Badge |

Basis: existing `CommanderPicker` (deck-cards mode, "all cards" mode, eligibility check) [Confirmed: `src/components/manabox-import/CommanderPicker.tsx`]; it should move out of the import folder.

## 5. States
| State | What shows |
|---|---|
| No commander | outline slot "No commander · Choose" |
| Commander set | "Commander · name" |
| Partner / background offered | second slot "Add partner" / "Add background" |
| Two commanders | two slots, second has ✕ |
| Popover list | search, valid commanders from the deck, "No commander", "Search all cards" |
| No search match | "No match in this deck. Try “Search all cards”." |
| No valid commander in deck | "No card in this deck can be a commander." |
| No compatible partner | "No card in this deck can be a partner for {name}." |
| Checking | "Checking which cards can be commander…" |
| Check failed | "Couldn't check commanders. Try again." |
| Saving / save error | spinner on option / toast "Could not set commander" |
| Non-commander format | selector hidden |

## 6. Interactions
- Click the slot to open; pick an option; "No commander" clears both slots (toast with Undo, as today); outside click closes.
- Picking a Partner or Background-capable commander shows the second slot and opens it. It lists only compatible cards: Partner with Partner, "Partner with X" suggests X, Friends forever with Friends forever, Choose a Background with Backgrounds. Changing the first commander removes an incompatible second one. Backgrounds are never offered as first commander.
- Keyboard: Tab to slot; Enter/Space/ArrowDown opens, focus in search; arrows move; Enter picks; Escape closes and returns focus to the slot.
- Screen reader: slot "Commander: {name}. Change.", `aria-haspopup`, `aria-expanded`; listbox with `aria-selected`; live announcements "{name} is commander." / "Commander cleared."

## 7. Data binding
- Single commander: `decks.commander_name`, `commander_scryfall_id`, `/api/commanders/eligible` [Confirmed: deck page, `CommanderPicker.tsx`].
- Partner/Background: schema exists (`deck_leaderships`, `deck_leadership_cards`, `decks.leadership_id`) and commander search accepts `partnerType`. The deck page and picker only use the single commander. **Blocked for Architect:** confirm what is deployed, how a second commander is saved and read, and what eligibility returns for pairing.

## 8. Copy
No commander · Choose · Commander · Partner · Background · Choose commander · Change commander · Add partner · Add background · Search this deck · Search all cards · Only cards that can be a commander are listed. · Checking which cards can be commander… · Couldn't check commanders. Try again. · {name} is commander · Commander cleared.

## 9. Accessibility
Icon + text for the no-commander state (D-012); contrast as earlier specs (secondary ≈ 6.5:1); slot and ✕ targets 26 px high; focus trapped in popover, Escape closes.

## 10. Open questions
1. Open the selector automatically from the import's "Open deck", or leave closed (proposed)?
2. Should the deck show a reason it's Draft ("Needs a commander") elsewhere? Not designed.
3. Partner/Background storage (Architect, blocks build).
4. Should "Search all cards" add a non-deck card to the deck, as today's picker does?
