# Commander selector — spec (rev 2: import review screen)

Mockup: `docs/oracle/mockups/deck-commander-selector.html`. **Owner correction (rev 2):** the selector lives on the **import review screen** (where cards are marked Original/Proxy, before importing), next to the deck name. The same control can be reused on the deck page later. Replaces the commander step that used to sit inside the deck import (see `import-review-controls.md`).

## 1. The problem
A deck imported from ManaBox has no commander, so it stays Draft (D-002) until one is set. The import no longer asks, and the only existing control is a "Choose commander" button on the deck page that disappears once a commander is set. Partner and Background pairs can't be expressed.

## 2. Principle
- Controls sit beside what they act on (D-015): the commander control goes beside the deck name, not among page actions.
- Constrain, don't validate: only cards that can legally lead are listed.
- Visible status: "No commander" is a plain readable state, not an error (D-014).
- Progressive disclosure: the second slot appears only for Partner / Choose a Background commanders.

## 3. Placement
Import review header, **beside the deck name** (name · selector). Commander formats only. Because it is chosen before importing, the commander is saved with the import and the result screen no longer shows "No commander yet" when one was chosen; if none is chosen it still shows the hint (and the deck stays Draft, D-002). **Later reuse:** the same component can sit under the name on the deck page, replacing its "Choose commander" button; not designed here. Supersedes D-052 and the "Choose on the deck page" wording. **Flag:** the cards come from the file, so the list is drawn from the import's matched cards, not saved deck cards; Developer to confirm the eligibility check can run before the deck exists.

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
1. Should the import be blocked until a commander is chosen? Proposed: no, optional.
2. Should the deck show a reason it's Draft ("Needs a commander") elsewhere? Not designed.
3. Partner/Background storage (Architect, blocks build).
4. Should "Search all cards" add a non-deck card to the deck, as today's picker does?
