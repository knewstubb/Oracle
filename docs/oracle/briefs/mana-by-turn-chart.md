# Brief: Mana by turn chart (owner-approved in conversation)
Status: Approved by the owner in conversation. Built in slices; this brief covers the whole feature.

## What this is, in plain words
A line chart in the deck page's left rail, "Mana by turn". It shows how much mana you can expect to have on each of the first 7 turns, based on the deck's lands, ramp cards and draw cards. For example: with Sol Ring in the deck, the line climbs faster from turn 3.

## Owner decisions (quoted)
- Request: "How would we calculate the amount of mana available on each turn based on the number of lands, draw and ramp spells in the deck? Im thinking a line chart that shows the progress of available mana over the first 7 turns"
- On the play: "Default to play" (agreed).
- Opening hands: "Lets default to hands with 2-5 lands. No toggle required"
- The commander is treated like any other card, except it starts in the command zone and is always available to cast.
- Tapped lands: "Consider tapped lands"
- Build order: "Build a component in figma first", then "add it to the app".

## What the owner sees
- Section "Mana by turn" in the rail, after the production section.
- Average mana per turn as a line, a shaded band for the middle 80% of games, and a dashed line for "if all lands were untapped".
- A readout, "Turn 4: 3.8 mana". Hovering or focusing a turn changes it; leaving returns to turn 4.
- Footnote: 5,000 games, on the play, 2 to 5 land hands.
- Decks with fewer than 8 non-commander cards or no lands show "Add cards to see mana by turn".

## Out of scope
No database change. No toggles. Commander tax is ignored.
