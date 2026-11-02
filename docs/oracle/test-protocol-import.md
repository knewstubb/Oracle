# Import test protocol (dev-live, branch test-t56-local)

Tick each box as you go. If something fails, leave it unticked and add `FAIL:` and a short note after it. Stop at the first Fail in a section and tell me.

## Setup

- [ ] Purge the database.
- [ ] Start the app: `paseo script start dev-live` (port 3000). It uses your REAL database.
- [ ] Run sections in order. Later steps depend on earlier ones.

**The save switch.** Importing a deck as "I built it" or "I'm planning it" has a safety switch, and it is OFF by default. While it is off you can look at those imports on screen, but the Import button is disabled, so nothing is saved. Sections A–C, F and the screen-only steps of G leave it OFF. Before section D it must be ON: tell me when you get there and I'll switch it on and restart the app. (Technical: set `NEXT_PUBLIC_IMPORT_INTENT_SAVE=true` in `.env.local`, then restart the dev server.)

**Test decks used below.**
- Precon: **Eldrazi Unbound** (Commander Masters, commander Zhulodok, Void Gorger, 100 cards).
- Public Archidekt deck: **Upping the Average - Atraxa Infect**, `https://archidekt.com/decks/3949764` (Commander, 100 main-deck cards plus 20 maybeboard cards, commander Atraxa, Praetors' Voice).
- Both were checked on 2026-10-23, and every printing below was checked on Scryfall.

## A. Import cards (collection)

- [ ] **A1. Open the file import.** Import cards → File → drop `docs/oracle/samples/test-protocol/01-collection.csv`.
  - [ ] The file is accepted (no "We couldn't read that file"). If it is rejected for having no Scryfall ID column, tell me.
  - [ ] A note says "1 row not matched" (the "Not A Real Card" row) and it can be dismissed.
  - [ ] Sol Ring (CMM 410) is listed.
  - [ ] Command Tower (CLB 351) is listed.
  - [ ] Lightning Greaves (CMM 398) is listed, foil, lightly played.
  - [ ] Island (FRA 283) is listed with quantity 3.
  - [ ] Heroic Intervention (CMM 295) is listed.
  - [ ] Arcane Signet (C21 234) is listed with quantity 2.
  - [ ] Kodama's Reach (CMM 300) is a Proxy, with no finish or condition shown.
  - [ ] The count reads 7 cards (10 copies).
- [ ] **A2. Per-copy editing.** Expand Arcane Signet (qty 2).
  - [ ] There is one line per copy.
  - [ ] There is no "Add to collection" tick (everything in Import cards is added).
  - [ ] There is no Finish choice (C21 has only non-foil, so the app hides it).
  - [ ] Set copy 2 to Proxy: finish and condition hide for that copy.
- [ ] **A3. Escape guard.** After editing, press Escape or click outside.
  - [ ] A "Discard edits?" dialog appears.
  - [ ] Cancel keeps your edits.
- [ ] **A4. Import.** Click Import.
  - [ ] 7 cards (10 copies) are added: 8 originals and 2 proxies (Arcane Signet copy 2 and Kodama's Reach).
  - [ ] Close only closes the modal; no deck or other page opens.
- [ ] **A5. Collection page.**
  - [ ] 6 cards in total (proxies are not part of the collection).
  - [ ] Sol Ring 1.
  - [ ] Command Tower 1.
  - [ ] Arcane Signet 1 (the proxy copy is not counted).
  - [ ] Lightning Greaves 1 (foil).
  - [ ] Island 3.
  - [ ] Heroic Intervention 1.
  - [ ] Kodama's Reach is not listed (proxy only; not counted).
  - [ ] Hovering a card name shows an image popover.

## B. Import deck, screens only (flag OFF)

- [ ] **B1. First screen.** Open Import deck.
  - [ ] Source tabs are on top (URL, Text list, File upload, Precon).
  - [ ] "What's this deck?" is already there below the input area, with the three choices side by side, greyed out. Each says "Numbers appear once the deck has loaded". Continue is disabled.
  - [ ] Switching tabs never changes the modal size, and the three choices stay in the same place.
  - [ ] Choose a file: "Reading your file…" appears in the file area; the choices stay visible, still greyed out.
  - [ ] When the deck has loaded, the file area shows "✓ name: N cards", the choices turn on with real numbers, and one is pre-selected (no "suggested" wording). The screen does not switch. Continue opens the review.
  - [ ] Back on the review returns to this screen and the choice can be changed.
- [ ] **B2. Precon tab.**
  - [ ] The list shows all ~200 decks (scrolls), and search narrows it.
  - [ ] Pick **Eldrazi Unbound**: "What's this deck?" appears with "I bought it" suggested. "I built it" and "I'm planning it" can still be picked (no greyed-out choices).
  - [ ] The review shows 100 cards.
  - [ ] The commander (Zhulodok, Void Gorger) is preselected.
  - [ ] With "I bought it", every card's Card origin is New copy and its Type is Original.
  - [ ] Once a precon is picked you can't pick a different one; you cancel the import to start again.
  - [ ] The review says "100 cards" (87 printings), the filter chips use the same card counts, and every card has Card origin and Type controls (planned decks show a Status column instead).
- [ ] **B3. URL tab.**
  - [ ] The field is centred.
  - [ ] Supported sites are listed (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox).
  - [ ] Paste `https://archidekt.com/decks/3949764`: it reviews with Atraxa, Praetors' Voice as the commander and 100 main-deck cards.
  - [ ] Note what happens to the 20 maybeboard cards (shown, left out, or put somewhere else): ______
  - [ ] Paste `https://archidekt.com/decks/1`: you get a plain, friendly error, not a crash.
  - [ ] Paste `https://example.com/deck`: you get a plain, friendly error, not a crash.
- [ ] **B3b. Intent choices on a URL deck.** Paste the Archidekt link.
  - [ ] "What's this deck?" appears after it loads, with numbers for each choice and one suggested.
  - [ ] Pick each in turn (Continue, then Back): the heading and the cards' Card origin change to match (C1–C3).
- [ ] **B3c. Maybeboard display.** Paste the Archidekt link again (any choice; don't import).
  - [ ] The chips read All 120, Deck 100, Maybeboard 20 and nothing else (no Proxies, Unsleeved or Basics chips in deck imports). The Deck and Maybeboard chips only appear when the list has maybeboard cards.
  - [ ] The footer (next to Back and Cancel) always reads "120 cards: 100 in deck · 20 in maybeboard" and never changes when you click a chip. No printings, basics or split there.
  - [ ] The line just under the list follows the selected chip. On All and Deck it reads the deck's split, e.g. "17 original · 1 proxy · 82 unowned" (zeros left out, adds up to 100).
  - [ ] On Maybeboard, the list shows the 20 cards, each tagged "Maybeboard", and the line under the list says maybeboard cards are not added or sleeved.
  - [ ] Change the choice (bought / built / planning): the split under the list changes to match.
  - [ ] Search works inside whichever chip is selected.
  - [ ] Pasting `https://example.com/deck` says "We can't read that link. Check it's a link to a deck on one of the supported sites listed below."
  - [ ] Sideboard chip: not built (see log).
- [ ] **B4. File wording.**
  - [ ] No "ManaBox" appears anywhere, including error messages.

## C. Review rules (flag OFF, don't save)

Use Import deck → Text list.

- [ ] **C0.** The paste box fills the modal height.
- [ ] **C1. Built deck.** Paste the list below, then choose "I built it" on "What's this deck?".
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
  - [ ] The heading reads "Import built deck".
  - [ ] The column headers read "Card origin" and "Type". Card origin and Type are quiet dropdowns (plain text with a small ▾; a light outline on hover; click opens a menu with a description under each option). There is no "Add to collection" tick anywhere.
  - [ ] Sol Ring, Arcane Signet, Lightning Greaves and the 3 Island: Card origin From collection, Type Original.
  - [ ] Command Tower: Card origin From collection (your CLB 351 is used; no printing question).
  - [ ] Kodama's Reach: Card origin From collection, Type Proxy (your only copy is a proxy). Original is greyed out.
  - [ ] Cultivate and Atraxa: Card origin Unowned, Type empty. From collection is greyed out in the menu with a reason (you don't own them).
  - [ ] Switch Cultivate to New copy: Type becomes Original. Switch back to Unowned: Type clears.
  - [ ] While Card origin is Unowned, Original and Proxy are greyed out in the Type menu and say why.
  - [ ] The 5 Forest are one generic row with a Card origin dropdown set to Generic land (the other choice is Unowned).
  - [ ] Select several cards: the bulk bar still has segmented Card origin (No copy / From collection / New copy) and Type toggles that change them all.
  - [ ] The summary line is below the list.
  - [ ] Import is disabled with a note while the flag is off.
- [ ] **C2. Planned deck.** Paste the list, then choose "I'm planning it".
    ```
    1 Atraxa, Praetors' Voice
    1 Sol Ring (CMM) 410
    1 Cultivate (CMM) 889
    10 Forest
    ```
  - [ ] The heading reads "Import planned deck".
  - [ ] There are no dropdowns and no Type column. A Status column reads Owned or Unowned for each card; nothing is added and nothing is sleeved. The bulk bar has no Card origin or Type toggles.
  - [ ] The 10 Forest are generic and read "Basic land" in Status.
- [ ] **C3. Purchased deck.** Paste the list, then choose "I bought it".
    ```
    1 Atraxa, Praetors' Voice
    1 Sol Ring (CMM) 410
    1 Heroic Intervention (CMM) 295
    1 Cultivate (CMM) 889
    3 Mountain (FRA) 287
    4 Mountain
    ```
  - [ ] The heading reads "Import purchased deck".
  - [ ] The 7 specific copies (1+1+1+1+3) are New copy · Original.
  - [ ] The 4 plain Mountain are one generic row (Generic land) and are not added.
  - [ ] Change Sol Ring to From collection: with the flag off, Import is disabled and says so.
- [ ] **C4. Plain names.** Paste the contents of `docs/oracle/samples/plain-text/no-set-codes.txt` (any choice).
  - [ ] It reviews with default printings.
  - [ ] `10 Island` is generic.
  - [ ] `Eiganjo Dynastorian // Replenish` resolves.
- [ ] **C5. Generic mixed state.** Paste `6 Mountain` and `4 Mountain` on two lines, then set one row's Card origin to Unowned.
  - [ ] There is one generic Mountain line.
  - [ ] Unowned wins.
  - [ ] The result screen says so.
- [ ] **C6. Printing-named basics are real.** Paste `3 Plains (M21) 262` and `4 Plains`.
  - [ ] The first is a real card row.
  - [ ] The second is generic.
- [ ] **C7. Not enough copies.** Paste `3 Sol Ring (CMM) 410` and choose "I built it".
  - [ ] Copies you can't cover from the collection show From collection with no badge or note on the row; but the footer says "N cards are short".
  - [ ] Import is disabled until each short copy is set to New copy or left out of the deck.

## D. Saving (flag ON, restart the server)

- [ ] Tell me you're at section D so I can switch the flag on and restart the app.
- [ ] The collection page shows 108 cards (8 real copies from stage 2 plus the 100 Eldrazi Unbound cards imported early in stage 3). The page does not count proxies; including the 2 proxies it is 110 copies.  Totals below are the page figure.

Do these in order.

### Main scenario: a built deck that mostly uses cards you already own

The collection (from A) holds: Sol Ring, Command Tower (CLB 351), Arcane Signet (one original, one proxy), Lightning Greaves (foil), Island ×3, Heroic Intervention, Kodama's Reach (proxy only). None of these are in a deck yet except what the Eldrazi precon uses, so they are all **free**. D1 uses most of them; D2 then mixes free, in-another-deck and unowned cards.

- [ ] **D1. Built deck, mostly from the collection.** Import the C1 list as "I built it".
  - [ ] "What's this deck?" suggests "I built it" and says you own most of the cards.
  - [ ] Review before saving (Card origin / Type):
    - Sol Ring, Command Tower, Arcane Signet, Lightning Greaves, 3 Island: **From collection · Original**.
    - Kodama's Reach: **From collection · Proxy** (Original is greyed out in its menu).
    - Cultivate and Atraxa: **Unowned** (no Type shown).
    - 5 Forest: one row, **Generic land**.
  - [ ] Open Cultivate's Card origin menu: "From collection" is greyed with a reason; "New copy" and "Unowned" are available.
  - [ ] Change Cultivate to **New copy**: Type becomes Original. Change it back to **Unowned**: Type clears.
  - [ ] Choose Atraxa as commander (leave it Unowned), then Import.
  - [ ] The collection stays at 108 (nothing new added).
  - [ ] The deck has Sol Ring, Command Tower (CLB), Arcane Signet, Lightning Greaves, Kodama's Reach (proxy) and 3 Island, all sleeved from your collection.
  - [ ] Cultivate and Atraxa are listed as unowned, not sleeved.
  - [ ] The 5 Forest are generic and sleeved.
  - [ ] No alerts on any deck.
- [ ] **D2. Free, in another deck, and unowned together.** Import this as "I built it":
    ```
    1 Heroic Intervention (CMM) 295
    1 Arcane Signet (C21) 234
    1 Sol Ring (CMM) 410
    1 Cultivate (CMM) 889
    ```
  - [ ] Heroic Intervention (still free): From collection · Original.
  - [ ] Arcane Signet (only the free proxy is left): From collection · Proxy; Original is greyed out.
  - [ ] Sol Ring (its only copy is in the D1 deck): From collection is still selected. There is no "Also in" badge on the row.
  - [ ] Import is disabled with a note that cards already in another deck can't be saved yet. (Sharing a copy between decks needs a database change; see the 2026-10-30 report.)
  - [ ] Change Sol Ring to **New copy**: Import turns on.
  - [ ] Import. The collection is up by 1 (the new Sol Ring) and the D1 deck's Sol Ring is untouched.
  - [ ] Heroic Intervention and the Arcane Signet proxy are now sleeved in this deck; Cultivate is unowned.
- [ ] **D3. New copy of a card you own.** Import `1 Lightning Greaves (CMM) 398` as "I built it" and set it to **New copy**.
  - [ ] The collection goes up by 1. No alerts on other decks.
- [ ] **D4. Proxy from New copy.** Import `1 Cultivate (CMM) 889` as "I built it", set it to **New copy**, then Type **Proxy**.
  - [ ] A new proxy is added and sleeved; the collection page total doesn't change (it doesn't count proxies).
- [ ] **D5. Nothing free.** Import `3 Island (FRA) 283` as "I built it" (all 3 are in the D1 deck).
  - [ ] Every copy is From collection but none is free, so Import is disabled with a message that the cards are in other decks / short. No badge on the rows.
  - [ ] Set the three copies to New copy (use the bulk bar: select all, Card origin → New copy): Import turns on.
- [ ] **D6. Planned deck saves.** Import the C2 list as "I'm planning it".
  - [ ] The deck exists.
  - [ ] No collection change.
  - [ ] Nothing is sleeved.
  - [ ] Unowned cards show as unowned.
  - [ ] The 10 Forest are generic and not sleeved.
  - [ ] The status reads like "Short: Forest generics unsleeved".
- [ ] **D7. Purchased deck saves.** Import the C3 list as "I bought it".
  - [ ] The collection is up by 7 originals (Atraxa, Sol Ring, Heroic Intervention, Cultivate, 3 Mountain).
  - [ ] The 4 plain Mountain are generics and are not added.
- [ ] **D8. Double click.** Click Import twice quickly on a small list.
  - [ ] One deck, no duplicates.
  - [ ] No empty leftover deck.
- [ ] **D9. Precon end to end.** ALREADY DONE in stage 3 (imported early). Do not import it again. Confirmed by the owner on 2026-10-29: the deck has 100 cards, Zhulodok, Void Gorger is the commander, and the collection went up by 100.
- [ ] **D10. Public Archidekt deck end to end.** Paste `https://archidekt.com/decks/3949764` into the URL tab and import it as "I'm planning it".
  - [ ] A deck with 100 cards exists.
  - [ ] Atraxa, Praetors' Voice is the commander.
  - [ ] The collection total is unchanged.
  - [ ] Nothing is sleeved except what you already own and is free (note if anything is): ______
  - [ ] Unowned cards show as unowned.
  - [ ] Import the same link again as "I bought it" into a new deck: the collection goes up by the number of cards in that deck, all Original.
  - [ ] Note what happened to the maybeboard cards each time: ______
- [ ] **D11. Totals.**
  - [ ] After each step, the collection total, the deck N/100 and the sleeved counts agree.

## E. Generic basics on the deck page

Use the deck from D7.

- [ ] **E1. Layout.**
  - [ ] The generic Mountain line shows 4, with a Sleeved chip, stepper, "Change art…" and "Remove all".
  - [ ] Mountain FRA 287 ×3 is a separate line.
- [ ] **E2. Stepper.** Click + and − quickly.
  - [ ] The number changes instantly.
  - [ ] The deck total follows.
- [ ] **E3. Unsleeve.** Toggle Unsleeved.
  - [ ] It is all-or-nothing.
  - [ ] The status reads "Short: Mountain generics unsleeved".
  - [ ] Toggling back sleeves them again.
- [ ] **E4. Change art.** Pick a printing you don't own, then reload.
  - [ ] The art stays.
- [ ] **E5. Add and remove.**
  - [ ] "+ Add generic basic" adds one.
  - [ ] "Remove all" removes the line.
  - [ ] Generics never appear in the pick list.

## F. Other sites' formats and section headings (flag OFF, screens only)

Use Import deck → Text list, any intent. Check where each card lands in the review.

- [ ] **F1. Sections.** Paste:
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
  - [ ] Atraxa is pre-ticked as commander, and the picker still opens.
  - [ ] Sol Ring and Cultivate are main-deck cards.
  - [ ] Kodama's Reach shows as a maybeboard card.
  - [ ] Command Tower shows as a maybeboard card (Sideboard goes to the maybeboard).
  - [ ] Nothing is silently put in the main deck.
  - [ ] The blank lines do not end a section.
- [ ] **F2. Line prefixes and tags.** Paste:
    ```
    1 Sol Ring (CMM) 410
    SB: 1 Cultivate (CMM) 889
    1 Atraxa, Praetors' Voice [Commander{top}]
    1 Arcane Signet (C21) 234 # note to self
    ```
  - [ ] Cultivate is a maybeboard card.
  - [ ] Atraxa is the pre-ticked commander.
  - [ ] The "note to self" is ignored.
  - [ ] Sol Ring and Arcane Signet are main.
- [ ] **F3. Headings as comments.** Paste these four lines:
    ```
    // Commander
    1 Atraxa, Praetors' Voice
    // Ramp
    1 Sol Ring (CMM) 410
    ```
  - [ ] Atraxa is the commander candidate.
  - [ ] Sol Ring is main (a type heading like Ramp changes nothing).
- [ ] **F4. Foil markers.** Paste:
    ```
    1 Lightning Greaves (CMM) 398 *F*
    1 Sol Ring (CMM) 410
    ```
  - [ ] Lightning Greaves has its Foil box pre-ticked.
  - [ ] Sol Ring does not.
- [ ] **F5. Tokens skipped.** Paste a `Tokens` heading followed by `1 Treasure` under your normal cards.
  - [ ] The token line is skipped, not listed as unmatched.
- [ ] **F6. Proxy column on a deck CSV.** Import deck → File → the A1 CSV.
  - [ ] Same result as A1.
  - [ ] Kodama's Reach defaults to Proxy.
  - [ ] You can switch it to Original.
- [ ] **F7. Unknown heading.** Paste `Lands (36)` on its own line above a card.
  - [ ] A warning note appears.
  - [ ] The card stays where it was.

## G. Companion, partner and second commander

- [ ] **G1. Partner pair from a list.** Paste (any intent):
    ```
    Commander
    1 Thrasios, Triton Hero
    1 Tymna the Weaver

    Deck
    1 Sol Ring (CMM) 410
    10 Island
    ```
  - [ ] Both are pre-ticked in the picker (Commander and Second commander).
  - [ ] The picker still opens.
- [ ] **G2. Companion from a list.** Paste:
    ```
    Commander
    1 Atraxa, Praetors' Voice

    Companion
    1 Lurrus of the Dream-Den

    Deck
    1 Sol Ring (CMM) 410
    ```
  - [ ] Lurrus is pre-ticked as Companion, not a commander.
  - [ ] Add `1 Zirda, the Dawnwaker` under Companion: the second companion goes to the maybeboard with a note.
- [ ] **G3. Illegal pair.** Paste Atraxa and Sol Ring under Commander.
  - [ ] Only one is accepted as a commander pair.
  - [ ] The second is dropped with a note because they can't be partners.
- [ ] **G4. Save (flag ON).** Import G1 as "I'm planning it", then G2.
  - [ ] On the G1 deck page, the second commander sits beside the commander.
  - [ ] On the G2 deck page, the Companion sits beside the commander.
  - [ ] The G2 header reads "N cards + Companion".
  - [ ] The companion is NOT counted in the 100.
  - [ ] Its colours don't change the deck's colour identity.
  - [ ] Collection and sleeved counts match the intent you picked.
- [ ] **G5. Deck page buttons.** On a deck with a commander:
  - [ ] Two new buttons appear next to the commander button ("second commander" only after a commander is set, and "companion").
  - [ ] Add Lurrus as companion by search.
  - [ ] Replace it with another card: the old one goes away.
  - [ ] Remove it: a "Remove … from this deck?" confirmation appears.
  - [ ] After confirming, it is removed, not moved to the main list.
- [ ] **G6. Known gaps (note, don't fail).**
  - [ ] Restoring an older saved version loses the companion tag.
  - [ ] Changing the commander doesn't clear an old second commander.

## H. After testing

- [ ] Delete throwaway decks in-app.
- [ ] Turn the flag off if you want saving disabled.
- [ ] Send me every Fail or Note, with the screen and what you expected.
