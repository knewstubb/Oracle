# Import test protocol (dev-live, branch test-t56-local)

> **Paused 2026-11-11 — this is not the current test plan.** The import work it tests is parked (T-56 and T-57 were closed; T-58 is parked). Some steps describe an older build and the save switch. For current testing use `docs/oracle/test-plan-2026-11-17.md`. Keep this file, with `docs/oracle/test-log-import.md`, as the record of the October import test run.

Tick each box as you go. If something fails, leave it unticked and add `FAIL:` plus a short note. Stop at the first fail in a section and report it.

## Setup

1. Purge the database.
2. Start the app: `paseo script start dev-live` (port 3000). Uses your real database.
3. Run sections in order. Later steps depend on earlier ones.

**Save switch.** Importing as "I built it" or "I'm planning it" has a safety switch, OFF by default. While OFF you can review imports on screen, but Import is disabled. Sections A–C, F and the screen-only steps of G keep it OFF. Before section D it must be ON: tell me when you reach D and I'll switch it on and restart. (Set `NEXT_PUBLIC_IMPORT_INTENT_SAVE=true` in `.env.local`, then restart the dev server.)

**Test decks.**
- Precon: **Eldrazi Unbound** (Commander Masters, commander Zhulodok, Void Gorger, 100 cards).
- Public Archidekt deck: **Upping the Average - Atraxa Infect**, `https://archidekt.com/decks/3949764` (Commander, 100 main-deck cards plus 20 maybeboard cards, commander Atraxa, Praetors' Voice).
- Both were checked on 2026-10-23, and every printing below was checked on Scryfall.

## A. Import cards (collection)

1. Open Import cards → File, then drop `docs/oracle/samples/test-protocol/01-collection.csv`.
   - [ ] File is accepted (no "We couldn't read that file"). If rejected for missing Scryfall ID column, report it.
   - [ ] "1 row not matched" appears for "Not A Real Card" and can be dismissed.
   - [ ] Sol Ring (CMM 410), Command Tower (CLB 351), Lightning Greaves (CMM 398, foil, lightly played), Island (FRA 283, qty 3), Heroic Intervention (CMM 295), Arcane Signet (C21 234, qty 2) are listed.
   - [ ] Kodama's Reach (CMM 300) is a proxy with no finish or condition.
   - [ ] Count reads 7 cards (10 copies).
2. Expand Arcane Signet (qty 2).
   - [ ] One line per copy.
   - [ ] No "Add to collection" tick.
   - [ ] No Finish choice (C21 is non-foil only).
   - [ ] Set copy 2 to Proxy: finish and condition hide for that copy.
3. Press Escape or click outside after editing.
   - [ ] "Discard edits?" dialog appears.
   - [ ] Cancel keeps edits.
4. Click Import.
   - [ ] 7 cards (10 copies) are added: 8 originals and 2 proxies.
   - [ ] Close only closes the modal; no deck or other page opens.
5. Go to the Collection page.
   - [ ] 6 cards total (proxies are not counted).
   - [ ] Sol Ring 1, Command Tower 1, Arcane Signet 1 (proxy not counted), Lightning Greaves 1 (foil), Island 3, Heroic Intervention 1.
   - [ ] Kodama's Reach is not listed (proxy only).
   - [ ] Hovering a card name shows an image popover.

## B. Import deck, screens only (flag OFF)

1. Open Import deck.
   - [ ] Source tabs are on top: URL, Text list, File upload, Precon.
   - [ ] "What's this deck?" is below the input, greyed out, with three choices side by side. Each says "Numbers appear once the deck has loaded". Continue is disabled.
   - [ ] Switching tabs does not change modal size or move the choices.
   - [ ] Choose a file: "Reading your file…" appears in the file area; choices stay visible and greyed out.
   - [ ] When loaded, file area shows "✓ name: N cards", choices turn on with real numbers, and one is pre-selected. Screen does not switch. Continue opens review.
   - [ ] Back returns to this screen and the choice can be changed.
2. Open the Precon tab.
   - [ ] List shows all ~200 decks and scrolls; search narrows it.
   - [ ] Pick **Eldrazi Unbound**: "What's this deck?" appears with "I bought it" suggested. Other choices remain selectable.
   - [ ] Review shows 100 cards.
   - [ ] Commander (Zhulodok, Void Gorger) is preselected.
   - [ ] With "I bought it", every card shows Card origin = New copy and Type = Original.
   - [ ] Once a precon is picked, you cannot pick a different one; cancel the import to restart.
   - [ ] Review says "100 cards" (87 printings). Filter chips use the same counts. Every card has Card origin and Type controls.
3. Open the URL tab.
   - [ ] Field is centred.
   - [ ] Supported sites are listed (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox).
   - [ ] Paste `https://archidekt.com/decks/3949764`: review shows Atraxa, Praetors' Voice as commander and 100 main-deck cards.
   - [ ] Note what happens to the 20 maybeboard cards: ______
   - [ ] Paste `https://archidekt.com/decks/1`: plain, friendly error (not a crash).
   - [ ] Paste `https://example.com/deck`: plain, friendly error (not a crash).
4. Paste the Archidekt link and check intent choices.
   - [ ] "What's this deck?" appears after loading, with numbers for each choice and one suggested.
   - [ ] Pick each choice in turn (Continue, then Back): heading and Card origin change to match.
5. Paste the Archidekt link again and check maybeboard display.
   - [ ] Chips read All 120, Deck 100, Maybeboard 20. No Proxies, Unsleeved or Basics chips.
   - [ ] Footer next to Back/Cancel always reads "120 cards: 100 in deck · 20 in maybeboard". Never changes when clicking chips.
   - [ ] Line under the list follows the selected chip. On All and Deck it shows the deck split, e.g. "17 original · 1 proxy · 82 unowned" (zeros omitted, adds to 100).
   - [ ] On Maybeboard, 20 cards are shown, each tagged "Maybeboard", and the line says maybeboard cards are not added or sleeved.
   - [ ] Changing choice (bought / built / planning) updates the split under the list.
   - [ ] Search works inside whichever chip is selected.
   - [ ] Pasting `https://example.com/deck` shows: "We can't read that link. Check it's a link to a deck on one of the supported sites listed below."
   - [ ] Sideboard chip is not built (see log).
6. Check file wording.
   - [ ] "ManaBox" does not appear anywhere, including error messages.

## C. Review rules (flag OFF, do not save)

Use Import deck → Text list.

### C1. Built deck

Paste:
```
1 Atraxa, Praetors' Voice
1 Sol Ring (CMM) 410
1 Command Tower (CMM) 420
1 Arcane Signet (C21) 234
1 Lightning Greaves (CMM) 398
1 Kodama's Reach (CMM) 300
1 Cultivate (CMM) 889
3 Island (FRA) 283
5 Forest
```
Then choose "I built it".

- [ ] Heading reads "Import built deck".
- [ ] Columns are "Card origin" and "Type". Both are quiet dropdowns (plain text with small ▾, light outline on hover, menu with description under each option). No "Add to collection" tick.
- [ ] Sol Ring, Arcane Signet, Lightning Greaves and 3 Island: Card origin = From collection, Type = Original.
- [ ] Command Tower: Card origin = From collection (CLB 351 is used; no printing question).
- [ ] Kodama's Reach: Card origin = From collection, Type = Proxy. Original is greyed out.
- [ ] Cultivate and Atraxa: Card origin = Unowned, Type empty. From collection is greyed out with a reason.
- [ ] Switch Cultivate to New copy: Type becomes Original. Switch back to Unowned: Type clears.
- [ ] While Card origin is Unowned, Original and Proxy are greyed out in the Type menu with a reason.
- [ ] 5 Forest are one generic row with Card origin set to Generic land (other choice is Unowned).
- [ ] Select several cards: bulk bar still has segmented Card origin (No copy / From collection / New copy) and Type toggles that change them all.
- [ ] Summary line is below the list.
- [ ] Import is disabled with a note while the flag is off.

### C2. Planned deck

Paste:
```
1 Atraxa, Praetors' Voice
1 Sol Ring (CMM) 410
1 Cultivate (CMM) 889
10 Forest
```
Then choose "I'm planning it".

- [ ] Heading reads "Import planned deck".
- [ ] No dropdowns, no Type column. Status column reads Owned or Unowned for each card. Nothing is added or sleeved. Bulk bar has no Card origin or Type toggles.
- [ ] 10 Forest are generic and read "Basic land" in Status.

### C3. Purchased deck

Paste:
```
1 Atraxa, Praetors' Voice
1 Sol Ring (CMM) 410
1 Heroic Intervention (CMM) 295
1 Cultivate (CMM) 889
3 Mountain (FRA) 287
4 Mountain
```
Then choose "I bought it".

- [ ] Heading reads "Import purchased deck".
- [ ] 7 specific copies (1+1+1+1+3) are New copy · Original.
- [ ] 4 plain Mountain are one generic row (Generic land) and are not added.
- [ ] Change Sol Ring to From collection: with the flag off, Import is disabled and says so.

### C4. Plain names

Paste the contents of `docs/oracle/samples/plain-text/no-set-codes.txt` (any choice).

- [ ] Reviews with default printings.
- [ ] `10 Island` is generic.
- [ ] `Eiganjo Dynastorian // Replenish` resolves.

### C5. Generic mixed state

Paste `6 Mountain` and `4 Mountain` on two lines, then set one row's Card origin to Unowned.

- [ ] One generic Mountain line.
- [ ] Unowned wins.
- [ ] Result screen says so.

### C6. Printing-named basics

Paste `3 Plains (M21) 262` and `4 Plains`.

- [ ] First is a real card row.
- [ ] Second is generic.

### C7. Not enough copies

Paste `3 Sol Ring (CMM) 410` and choose "I built it".

- [ ] Copies you cannot cover from collection show From collection with no badge or note on the row; footer says "N cards are short".
- [ ] Import is disabled until each short copy is set to New copy or left out of the deck.

## D. Saving (flag ON, restart server)

1. Tell me you're at section D so I can switch the flag on and restart the app.
2. Collection page should show 108 cards (8 real copies from A plus 100 Eldrazi Unbound cards imported early in stage 3). Page does not count proxies; including proxies it is 110 copies. Totals below use the page figure.

### D1. Built deck, mostly from collection

The collection from A holds: Sol Ring, Command Tower (CLB 351), Arcane Signet (one original, one proxy), Lightning Greaves (foil), Island ×3, Heroic Intervention, Kodama's Reach (proxy only). None are in a deck yet except what the Eldrazi precon uses, so they are all **free**.

Import the C1 list as "I built it".

- [ ] "What's this deck?" suggests "I built it" and says you own most cards.
- [ ] Review before saving:
  - Sol Ring, Command Tower, Arcane Signet, Lightning Greaves, 3 Island: From collection · Original.
  - Kodama's Reach: From collection · Proxy (Original greyed out).
  - Cultivate and Atraxa: Unowned (no Type).
  - 5 Forest: one generic row.
- [ ] Open Cultivate's Card origin menu: From collection is greyed with a reason; New copy and Unowned are available.
- [ ] Change Cultivate to New copy: Type becomes Original. Change back to Unowned: Type clears.
- [ ] Choose Atraxa as commander (leave Unowned), then Import.
- [ ] Collection stays at 108 (nothing new added).
- [ ] Deck has Sol Ring, Command Tower (CLB), Arcane Signet, Lightning Greaves, Kodama's Reach (proxy) and 3 Island, all sleeved from collection.
- [ ] Cultivate and Atraxa are listed as unowned, not sleeved.
- [ ] 5 Forest are generic and sleeved.
- [ ] No alerts on any deck.

### D2. Free, in another deck and unowned together

Import as "I built it":
```
1 Heroic Intervention (CMM) 295
1 Arcane Signet (C21) 234
1 Sol Ring (CMM) 410
1 Cultivate (CMM) 889
```

- [ ] Heroic Intervention (free): From collection · Original.
- [ ] Arcane Signet (only free proxy left): From collection · Proxy; Original greyed out.
- [ ] Sol Ring (only copy is in D1 deck): From collection still selected. No "Also in" badge.
- [ ] Import is disabled with a note that cards already in another deck can't be saved yet.
- [ ] Change Sol Ring to New copy: Import turns on.
- [ ] Import. Collection up by 1 (new Sol Ring); D1 deck's Sol Ring untouched.
- [ ] Heroic Intervention and Arcane Signet proxy are now sleeved in this deck; Cultivate is unowned.

### D3. New copy of a card you own

Import `1 Lightning Greaves (CMM) 398` as "I built it" and set it to New copy.

- [ ] Collection goes up by 1. No alerts on other decks.

### D4. Proxy from New copy

Import `1 Cultivate (CMM) 889` as "I built it", set it to New copy, then Type Proxy.

- [ ] A new proxy is added and sleeved; collection page total doesn't change.

### D5. Nothing free

Import `3 Island (FRA) 283` as "I built it" (all 3 are in D1 deck).

- [ ] Every copy is From collection but none is free, so Import is disabled with a message about cards in other decks / short. No badge on rows.
- [ ] Set all three to New copy via bulk bar (select all, Card origin → New copy): Import turns on.

### D6. Planned deck saves

Import the C2 list as "I'm planning it".

- [ ] Deck exists.
- [ ] No collection change.
- [ ] Nothing sleeved.
- [ ] Unowned cards show as unowned.
- [ ] 10 Forest are generic and not sleeved.
- [ ] Status reads like "Short: Forest generics unsleeved".

### D7. Purchased deck saves

Import the C3 list as "I bought it".

- [ ] Collection up by 7 originals (Atraxa, Sol Ring, Heroic Intervention, Cultivate, 3 Mountain).
- [ ] 4 plain Mountain are generics and not added.

### D8. Double click

Click Import twice quickly on a small list.

- [ ] One deck, no duplicates.
- [ ] No empty leftover deck.

### D9. Precon end to end

Already done in stage 3. Do not import again. Confirmed by owner on 2026-10-29: deck has 100 cards, Zhulodok, Void Gorger is commander, collection went up by 100.

### D10. Public Archidekt deck end to end

1. Paste `https://archidekt.com/decks/3949764` into the URL tab and import as "I'm planning it".
   - [ ] A 100-card deck exists.
   - [ ] Atraxa, Praetors' Voice is commander.
   - [ ] Collection total unchanged.
   - [ ] Nothing sleeved except what you already own and is free (note if anything is): ______
   - [ ] Unowned cards show as unowned.
2. Import the same link again as "I bought it" into a new deck.
   - [ ] Collection goes up by the number of cards in that deck, all Original.
3. Note what happened to maybeboard cards each time: ______

### D11. Totals

- [ ] After each step, collection total, deck N/100 and sleeved counts agree.

## E. Generic basics on the deck page

Use the deck from D7.

1. Layout.
   - [ ] Generic Mountain line shows 4, with Sleeved chip, stepper, "Change art…" and "Remove all".
   - [ ] Mountain FRA 287 ×3 is a separate line.
2. Stepper. Click + and − quickly.
   - [ ] Number changes instantly.
   - [ ] Deck total follows.
3. Unsleeve. Toggle Unsleeved.
   - [ ] All-or-nothing.
   - [ ] Status reads "Short: Mountain generics unsleeved".
   - [ ] Toggling back sleeves them again.
4. Change art. Pick a printing you don't own, then reload.
   - [ ] Art stays.
5. Add and remove.
   - [ ] "+ Add generic basic" adds one.
   - [ ] "Remove all" removes the line.
   - [ ] Generics never appear in the pick list.

## F. Other sites' formats and section headings (flag OFF, screens only)

Use Import deck → Text list, any intent. Check where each card lands in review.

### F1. Sections

Paste:
```
Commander
1 Atraxa, Praetors' Voice

Deck
1 Sol Ring (CMM) 410
1 Cultivate (CMM) 889

Maybeboard
1 Kodama's Reach (CMM) 300

Sideboard
1 Command Tower (CLB) 351
```

- [ ] Atraxa is pre-ticked as commander; picker still opens.
- [ ] Sol Ring and Cultivate are main-deck cards.
- [ ] Kodama's Reach shows as maybeboard.
- [ ] Command Tower shows as maybeboard (Sideboard goes to maybeboard).
- [ ] Nothing is silently put in main deck.
- [ ] Blank lines do not end a section.

### F2. Line prefixes and tags

Paste:
```
1 Sol Ring (CMM) 410
SB: 1 Cultivate (CMM) 889
1 Atraxa, Praetors' Voice [Commander{top}]
1 Arcane Signet (C21) 234 # note to self
```

- [ ] Cultivate is maybeboard.
- [ ] Atraxa is pre-ticked commander.
- [ ] "note to self" is ignored.
- [ ] Sol Ring and Arcane Signet are main.

### F3. Headings as comments

Paste:
```
// Commander
1 Atraxa, Praetors' Voice
// Ramp
1 Sol Ring (CMM) 410
```

- [ ] Atraxa is commander candidate.
- [ ] Sol Ring is main (type headings like Ramp change nothing).

### F4. Foil markers

Paste:
```
1 Lightning Greaves (CMM) 398 *F*
1 Sol Ring (CMM) 410
```

- [ ] Lightning Greaves has Foil box pre-ticked.
- [ ] Sol Ring does not.

### F5. Tokens skipped

Paste a `Tokens` heading followed by `1 Treasure` under your normal cards.

- [ ] Token line is skipped, not listed as unmatched.

### F6. Proxy column on a deck CSV

Import deck → File → the A1 CSV.

- [ ] Same result as A1.
- [ ] Kodama's Reach defaults to Proxy.
- [ ] Can switch it to Original.

### F7. Unknown heading

Paste `Lands (36)` on its own line above a card.

- [ ] Warning note appears.
- [ ] Card stays where it was.

## G. Companion, partner and second commander

### G1. Partner pair from a list

Paste (any intent):
```
Commander
1 Thrasios, Triton Hero
1 Tymna the Weaver

Deck
1 Sol Ring (CMM) 410
10 Island
```

- [ ] Both are pre-ticked in picker (Commander and Second commander).
- [ ] Picker still opens.

### G2. Companion from a list

Paste:
```
Commander
1 Atraxa, Praetors' Voice

Companion
1 Lurrus of the Dream-Den

Deck
1 Sol Ring (CMM) 410
```

- [ ] Lurrus is pre-ticked as Companion, not a commander.
- [ ] Add `1 Zirda, the Dawnwaker` under Companion: second companion goes to maybeboard with a note.

### G3. Illegal pair

Paste Atraxa and Sol Ring under Commander.

- [ ] Only one is accepted as commander pair.
- [ ] Second is dropped with a note because they can't be partners.

### G4. Save (flag ON)

Import G1 as "I'm planning it", then G2.

- [ ] On G1 deck page, second commander sits beside commander.
- [ ] On G2 deck page, Companion sits beside commander.
- [ ] G2 header reads "N cards + Companion".
- [ ] Companion is NOT counted in the 100.
- [ ] Companion colours don't change deck colour identity.
- [ ] Collection and sleeved counts match the intent picked.

### G5. Deck page buttons

On a deck with a commander:

- [ ] Two new buttons appear next to commander button ("second commander" only after commander is set, and "companion").
- [ ] Add Lurrus as companion by search.
- [ ] Replace it with another card: old one goes away.
- [ ] Remove it: "Remove … from this deck?" confirmation appears.
- [ ] After confirming, it is removed, not moved to main list.

### G6. Known gaps (note, don't fail)

- [ ] Restoring an older saved version loses the companion tag.
- [ ] Changing commander doesn't clear an old second commander.

## H. After testing

1. Delete throwaway decks in-app.
2. Turn the flag off if you want saving disabled.
3. Send me every Fail or Note, with the screen and what you expected.
