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
  - [ ] The "Add to collection" tick is shown (more than one copy).
  - [ ] Finish only offers Non-foil (C21 has no foil).
  - [ ] Set copy 2 to Proxy: finish and condition hide for that copy.
  - [ ] Single-copy rows (Sol Ring) show no tick.
- [ ] **A3. Escape guard.** After editing, press Escape or click outside.
  - [ ] A "Discard edits?" dialog appears.
  - [ ] Cancel keeps your edits.
- [ ] **A4. Import.** Click Import.
  - [ ] 7 cards (10 copies) are added: 8 originals and 2 proxies (Arcane Signet copy 2 and Kodama's Reach).
  - [ ] Close only closes the modal; no deck or other page opens.
- [ ] **A5. Collection page.**
  - [ ] 7 cards in total.
  - [ ] Sol Ring 1.
  - [ ] Command Tower 1.
  - [ ] Arcane Signet 2 (1 original, 1 proxy).
  - [ ] Lightning Greaves 1 (foil).
  - [ ] Island 3.
  - [ ] Heroic Intervention 1.
  - [ ] Kodama's Reach 1 (proxy).
  - [ ] Hovering a card name shows an image popover.

## B. Import deck, screens only (flag OFF)

- [ ] **B1. First screen.** Open Import deck.
  - [ ] Source tabs are on top (File, Paste text, URL, Precon).
  - [ ] The three choices ("I bought it", "I built it", "I'm planning it") are below the tabs.
  - [ ] Switching tabs never changes the modal size.
  - [ ] On File, Paste and URL nothing is pre-selected and Continue says "Choose one to continue."
- [ ] **B2. Precon tab.**
  - [ ] The list loads (about 200 decks).
  - [ ] Pick **Eldrazi Unbound**: "I bought it" is selected and looks normal; the other two are greyed out.
  - [ ] The review shows 100 cards.
  - [ ] The commander (Zhulodok, Void Gorger) is preselected.
  - [ ] All cards are Original, with exact printings.
  - [ ] Pick one more precon of your choice: the list isn't stuck on the first.
- [ ] **B3. URL tab.**
  - [ ] The field is centred.
  - [ ] Supported sites are listed (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox).
  - [ ] Paste `https://archidekt.com/decks/3949764`: it reviews with Atraxa, Praetors' Voice as the commander and 100 main-deck cards.
  - [ ] Note what happens to the 20 maybeboard cards (shown, left out, or put somewhere else): ______
  - [ ] Paste `https://archidekt.com/decks/1`: you get a plain, friendly error, not a crash.
  - [ ] Paste `https://example.com/deck`: you get a plain, friendly error, not a crash.
- [ ] **B3b. Intent choices on a URL deck.** With the Archidekt deck reviewing:
  - [ ] Nothing is pre-selected and Continue says "Choose one to continue" until you pick.
  - [ ] "I bought it": the heading changes to match.
  - [ ] "I built it": the heading changes to match.
  - [ ] "I'm planning it": the heading changes to match.
  - [ ] The card choices change like they do for pasted text (C1–C3).
- [ ] **B4. File wording.**
  - [ ] No "ManaBox" appears anywhere, including error messages.

## C. Review rules (flag OFF, don't save)

Use Import deck → Paste text.

- [ ] **C0.** The paste box fills the modal height.
- [ ] **C1. Built deck.** Choose "I built it" and paste:
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
  - [ ] Sol Ring, Arcane Signet, Lightning Greaves and the 3 Island are owned and free: they default to sleeved from your collection, and the Add tick is off.
  - [ ] Command Tower shows "you own it as CLB 351; this deck lists CMM 420" with "Use my CLB 351" and "Add this printing".
  - [ ] Command Tower can't be sleeved until you choose.
  - [ ] Kodama's Reach: your only copy is a proxy, and it is sleeved.
  - [ ] Cultivate and Atraxa are not owned; options are Proxy or Unowned (never "Unsleeved"); default Unowned.
  - [ ] The 5 Forest are one generic basics row.
  - [ ] The summary line is below the list.
  - [ ] Import is disabled with a note while the flag is off.
- [ ] **C2. Planned deck.** Choose "I'm planning it" and paste:
    ```
    1 Atraxa, Praetors' Voice
    1 Sol Ring (CMM) 410
    1 Cultivate (CMM) 889
    10 Forest
    ```
  - [ ] The heading reads "Import planned deck".
  - [ ] Nothing is added and nothing is sleeved.
  - [ ] Every card is Unowned or unsleeved.
  - [ ] The 10 Forest are generic and UNSLEEVED.
- [ ] **C3. Purchased deck.** Choose "I bought it" and paste:
    ```
    1 Atraxa, Praetors' Voice
    1 Sol Ring (CMM) 410
    1 Heroic Intervention (CMM) 295
    1 Cultivate (CMM) 889
    3 Mountain (FRA) 287
    4 Mountain
    ```
  - [ ] The heading reads "Import purchased deck".
  - [ ] The 7 specific copies (1+1+1+1+3) are Original and will be added to the collection.
  - [ ] The 4 plain Mountain are one generic row (Sleeved) and are not added.
- [ ] **C4. Plain names.** Paste the contents of `docs/oracle/samples/plain-text/no-set-codes.txt` (any intent).
  - [ ] It reviews with default printings.
  - [ ] `10 Island` is generic.
  - [ ] `Eiganjo Dynastorian // Replenish` resolves.
- [ ] **C5. Generic mixed state.** Paste `6 Mountain` and `4 Mountain` on two lines, then set one row to Unsleeved.
  - [ ] There is one generic Mountain line.
  - [ ] Unsleeved wins.
  - [ ] The result screen says so.
- [ ] **C6. Printing-named basics are real.** Paste `3 Plains (M21) 262` and `4 Plains`.
  - [ ] The first is a real card row.
  - [ ] The second is generic.

## D. Saving (flag ON, restart the server)

- [ ] Tell me you're at section D so I can switch the flag on and restart the app.
- [ ] The collection starts at 10 copies.

Do these in order.

- [ ] **D1. Built deck, no moves.** Import the C1 list as "I built it". Choose Atraxa as commander, pick "Use my CLB 351" for Command Tower, leave Cultivate and Atraxa Unowned.
  - [ ] The collection stays at 10.
  - [ ] The deck has Sol Ring, Command Tower (CLB), Arcane Signet, Lightning Greaves, Kodama's Reach (proxy) and 3 Island, all sleeved from your collection.
  - [ ] Cultivate and Atraxa are unowned.
  - [ ] The 5 Forest are generic and sleeved.
  - [ ] No alerts.
- [ ] **D2. Move a copy.** Import `1 Sol Ring (CMM) 410` and `1 Heroic Intervention (CMM) 295` as "I built it".
  - [ ] Sol Ring shows "Copy will be moved from (Deck 1 | Skip)" with Deck 1 preselected.
  - [ ] Heroic Intervention is free and sleeves.
  - [ ] After confirming, Sol Ring is sleeved in the new deck.
  - [ ] The first deck's Sol Ring slot is unsleeved.
  - [ ] The collection is still 10.
- [ ] **D3. Skip, one holder.** Import `1 Lightning Greaves (CMM) 398` as "I built it" and choose Skip.
  - [ ] The collection is 11 (a new Greaves added and sleeved here).
  - [ ] The first deck shows an alert on Lightning Greaves.
  - [ ] The alert stays until you press Fixed or Dismiss.
- [ ] **D4. Skip, two holders.**
  - [ ] Import `1 Arcane Signet (C21) 234` as "I built it" into a new deck. It takes your second free copy (the proxy), so no prompt appears.
  - [ ] Import `1 Arcane Signet (C21) 234` again into another new deck. The card lists BOTH holder decks; choose Skip.
  - [ ] The collection is up by 1.
  - [ ] BOTH holder decks show an alert on Arcane Signet.
- [ ] **D5. Add this printing.** Import `1 Command Tower (CMM) 420` as "I built it" and choose "Add this printing".
  - [ ] The collection is up by 1 (a new CMM 420 copy).
  - [ ] It is sleeved in the new deck.
- [ ] **D6. Planned deck saves.** Import the C2 list as "I'm planning it".
  - [ ] The deck exists.
  - [ ] No collection change.
  - [ ] Nothing is sleeved.
  - [ ] Unowned cards show as unowned.
  - [ ] The 10 Forest are generic and unsleeved.
  - [ ] The status reads like "Short: Forest generics unsleeved".
- [ ] **D7. Purchased deck saves.** Import the C3 list as "I bought it".
  - [ ] The collection is up by 7 originals (Atraxa, Sol Ring, Heroic Intervention, Cultivate, 3 Mountain).
  - [ ] The 4 plain Mountain are generics and are not added.
- [ ] **D8. Double click.** Click Import twice quickly on a small list.
  - [ ] One deck, no duplicates.
  - [ ] No empty leftover deck.
- [ ] **D9. Precon end to end.** Write down the collection total before: ______. Import **Eldrazi Unbound** from the Precon tab as "I bought it".
  - [ ] A deck with 100 cards exists.
  - [ ] The collection is up by 100 originals. Total after: ______.
  - [ ] The commander (Zhulodok, Void Gorger) is set.
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

Use Import deck → Paste text, any intent. Check where each card lands in the review.

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
