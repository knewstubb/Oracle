# Import test protocol (dev-live, branch test-t56-local)

Environment: `paseo script start dev-live` (port 3000). It uses your REAL database. Purge it first, then run this on the fresh account in order: later steps depend on earlier ones.
**The save switch.** Importing a deck as "I built it" or "I'm planning it" has a safety switch, and it is OFF by default. While it is off you can look at those imports on screen, but the Import button is disabled, so nothing is saved. Sections A–C only look at screens, so leave it OFF. Before you start section D (where we really save decks) it must be turned ON: tell me when you get there and I'll have it switched on and the app restarted. (Technical detail for whoever does it: set `NEXT_PUBLIC_IMPORT_INTENT_SAVE=true` in `.env.local`, then restart the dev server.)
**Test decks used below.** Precon: **Eldrazi Unbound** (Commander Masters, commander Zhulodok, Void Gorger, 100 cards). Public Archidekt deck: **Upping the Average - Atraxa Infect**, `https://archidekt.com/decks/3949764` (public, Commander, 100 main-deck cards plus 20 maybeboard cards, commander Atraxa, Praetors' Voice). Both were checked on 2026-10-23.
Every printing below was checked on Scryfall. Mark each step Pass / Fail / Note. Stop at the first Fail in a section and tell me.

## A. Import cards (collection)

**A1. File with a proxy and an unmatched row.** Import cards → File → drop `docs/oracle/samples/test-protocol/01-collection.csv`.
Expected review (7 matched rows, 1 not matched):
- A note "1 row not matched" (the "Not A Real Card" row); it can be dismissed.
- Sol Ring (CMM 410), Command Tower (CLB 351), Lightning Greaves (CMM 398, foil, lightly played), Island (FRA 283, qty 3), Heroic Intervention (CMM 295), Arcane Signet (C21 234, qty 2).
- Kodama's Reach (CMM 300) is a Proxy, with no finish or condition shown.
- Count: 7 cards (10 copies).
If the file is rejected for having no Scryfall ID column, tell me. It shouldn't be required.

**A2. Per-copy editing.** Expand Arcane Signet (qty 2): one line per copy, and the "Add to collection" tick is shown (more than one copy). Finish should only offer Non-foil (C21 has no foil). Set copy 2 to Proxy: finish and condition hide for it. Single-copy rows (Sol Ring) show no tick.
**A3. Escape guard.** After editing, press Escape or click outside: a "Discard edits?" dialog appears. Cancel keeps your edits.
**A4. Import.** Expected result: 7 cards (10 copies) added: 8 originals and 2 proxies (Arcane Signet copy 2 and Kodama's Reach). Close only closes the modal; no deck or other page opens.
**A5. Collection page.** 7 cards: Sol Ring 1, Command Tower 1, Arcane Signet 2 (1 original, 1 proxy), Lightning Greaves 1 (foil), Island 3, Heroic Intervention 1, Kodama's Reach 1 (proxy). Hover a card name: an image popover appears.

## B. Import deck, screens only (flag OFF)

**B1. First screen.** Import deck: source tabs on top (File, Paste text, URL, Precon), the three choices ("I bought it", "I built it", "I'm planning it") below. Switch tabs: the modal never changes size. On File, Paste and URL nothing is pre-selected and Continue says "Choose one to continue."
**B2. Precon tab.** The list loads (about 200 decks). Find and pick **Eldrazi Unbound**: "I bought it" is selected and looks normal, the other two are greyed out. Review shows 100 cards, commander (Zhulodok, Void Gorger) preselected, all Original, exact printings. Then try one more precon of your choice to check the list isn't stuck on the first.
**B3. URL tab.** Field centred; supported sites listed (Archidekt, Moxfield, MTGGoldfish, TappedOut, Deckbox). Paste `https://archidekt.com/decks/3949764` (the public Atraxa Infect deck). Expected: it reviews with Atraxa, Praetors' Voice as the commander and 100 main-deck cards. Note whether the 20 maybeboard cards are shown, left out, or put somewhere else, and tell me which. Also paste a made-up link such as `https://archidekt.com/decks/1` or `https://example.com/deck`: you should get a plain, friendly error, not a crash.
**B3b. Intent choices on a URL deck.** With the Archidekt deck reviewing, nothing is pre-selected and Continue says "Choose one to continue" until you pick "I bought it", "I built it" or "I'm planning it". Pick each in turn: the heading changes to match, and the card choices change like they do for pasted text (C1–C3).
**B4. File wording.** No "ManaBox" anywhere, including error messages.

## C. Review rules (flag OFF, don't save)

Use Import deck → Paste text. The box fills the modal height.

**C1. Built deck.** Choose "I built it" and paste:
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
Expected (heading "Import built deck"):
- Sol Ring, Arcane Signet, Lightning Greaves and the 3 Island are owned and free: they default to sleeved from your collection; the Add tick is off.
- Command Tower: inline "you own it as CLB 351; this deck lists CMM 420" with "Use my CLB 351" and "Add this printing"; it can't be sleeved until you choose.
- Kodama's Reach: your only copy is a proxy, and it is sleeved.
- Cultivate and Atraxa: not owned. Options are Proxy or Unowned (never "Unsleeved"); default Unowned.
- 5 Forest: a generic basics row.
- The summary line is below the list. Import is disabled with a note while the flag is off.
**C2. Planned deck.** Choose "I'm planning it" and paste:
```
1 Atraxa, Praetors' Voice
1 Sol Ring (CMM) 410
1 Cultivate (CMM) 889
10 Forest
```
Expected: nothing added, nothing sleeved; every card is Unowned or unsleeved; the 10 Forest are generic and UNSLEEVED. Heading "Import planned deck".
**C3. Purchased deck.** Choose "I bought it" and paste:
```
1 Atraxa, Praetors' Voice
1 Sol Ring (CMM) 410
1 Heroic Intervention (CMM) 295
1 Cultivate (CMM) 889
3 Mountain (FRA) 287
4 Mountain
```
Expected: the 7 specific copies (1+1+1+1+3) are Original and added to the collection; the 4 plain Mountain are a generic row (Sleeved), not added. Heading "Import purchased deck".
**C4. Plain names.** Paste the contents of `docs/oracle/samples/plain-text/no-set-codes.txt` (any intent). It reviews with default printings; `10 Island` is generic; `Eiganjo Dynastorian // Replenish` resolves.
**C5. Generic mixed state.** Paste `6 Mountain` and `4 Mountain` on two lines. Set one row to Unsleeved. Expected: one generic Mountain line; Unsleeved wins; the result screen says so.
**C6. Printing-named basics are real.** Paste `3 Plains (M21) 262` and `4 Plains`. The first is a real card row; the second is generic.

## D. Saving (flag ON, restart the server)

Do these in order. The collection starts at 10 copies.

**D1. Built deck, no moves.** Import the C1 list as "I built it". Choose Atraxa as commander, pick "Use my CLB 351" for Command Tower, leave Cultivate and Atraxa Unowned.
Expected: collection stays at 10. The deck has Sol Ring, Command Tower (CLB), Arcane Signet, Lightning Greaves, Kodama's Reach (proxy), 3 Island sleeved from your collection; Cultivate and Atraxa unowned; 5 Forest generic, sleeved. No alerts.
**D2. Move a copy.** Import `1 Sol Ring (CMM) 410` and `1 Heroic Intervention (CMM) 295` as "I built it". Expected: Sol Ring shows "Copy will be moved from (Deck 1 | Skip)" with Deck 1 preselected; Heroic Intervention is free and sleeves. Confirm. After: Sol Ring is sleeved in the new deck; the first deck's Sol Ring slot is unsleeved. Collection still 10.
**D3. Skip, one holder.** Import `1 Lightning Greaves (CMM) 398` as "I built it" and choose Skip. Expected: collection 11 (a new Greaves added and sleeved here); the first deck shows an alert on Lightning Greaves that stays until you press Fixed or Dismiss.
**D4. Skip, two holders.**
1. Import `1 Arcane Signet (C21) 234` as "I built it" into a new deck. It takes your second free copy (the proxy), so no prompt appears.
2. Import `1 Arcane Signet (C21) 234` again into another new deck. There is no free copy, so the card lists BOTH holder decks; choose Skip.
Expected: collection +1; BOTH holder decks show an alert on Arcane Signet.
**D5. Add this printing.** Import `1 Command Tower (CMM) 420` as "I built it" and choose "Add this printing". Expected: collection +1 (a new CMM 420 copy), sleeved in the new deck.
**D6. Planned deck saves.** Import the C2 list as "I'm planning it". Expected: the deck exists; no collection change; nothing sleeved; unowned cards shown as unowned; 10 Forest generic and unsleeved; status like "Short: Forest generics unsleeved".
**D7. Purchased deck saves.** Import the C3 list as "I bought it". Expected: collection +7 originals (Atraxa, Sol Ring, Heroic Intervention, Cultivate, 3 Mountain). The 4 plain Mountain are generics and are not added.
**D8. Double click.** Click Import twice quickly on a small list: one deck, no duplicates, no empty leftover deck.
**D9. Precon end to end.** Import **Eldrazi Unbound** from the Precon tab as "I bought it". Expected: a deck with 100 cards, collection +100 originals, commander (Zhulodok, Void Gorger) set. Write down the collection total before and after.
**D10. Public Archidekt deck end to end.** Paste `https://archidekt.com/decks/3949764` into the URL tab and import it as "I'm planning it". Expected: a deck with 100 cards and Atraxa, Praetors' Voice as commander; collection total unchanged; nothing sleeved except what you already own and is free (note if anything is); unowned cards shown as unowned. Then import the same link again as "I bought it" into a new deck: collection goes up by the number of cards in that deck, all Original. Note what happened to the maybeboard cards each time.
**D11. Totals.** After each step the collection total, the deck N/100 and the sleeved counts agree.

## E. Generic basics on the deck page

Use the deck from D7.
**E1.** The generic Mountain line shows 4, with a Sleeved chip, stepper, "Change art…" and "Remove all". Mountain FRA 287 ×3 is a separate line.
**E2.** Click + and − quickly: the number changes instantly and the deck total follows.
**E3.** Toggle Unsleeved: all-or-nothing; the status reads "Short: Mountain generics unsleeved". Toggle back: sleeved.
**E4.** Change art: pick a printing you don't own; reload; it stays.
**E5.** "+ Add generic basic" adds one; "Remove all" removes the line. Generics never appear in the pick list.

## G. Other sites' formats and section headings (flag OFF, screens only)

Use Import deck → Paste text, any intent. Each list is a whole pasted list; check where each card lands in the review.
**G1. Sections.** Paste:
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
Expected: Atraxa is pre-ticked as commander (the picker still opens). Sol Ring and Cultivate are main-deck cards. Kodama's Reach AND Command Tower both show as maybeboard cards (a Sideboard goes to the maybeboard). Nothing is silently put in the main deck. A blank line does not end a section.
**G2. Line prefixes and tags.** Paste:
```
1 Sol Ring (CMM) 410
SB: 1 Cultivate (CMM) 889
1 Atraxa, Praetors' Voice [Commander{top}]
1 Arcane Signet (C21) 234 # note to self
```
Expected: Cultivate is a maybeboard card; Atraxa is the pre-ticked commander; the "note to self" is ignored; the other two are main.
**G3. Headings as comments.** Paste `// Commander` on one line, `1 Atraxa, Praetors' Voice` on the next, `// Ramp` on the next, `1 Sol Ring (CMM) 410` last. Expected: Atraxa is the commander candidate; Sol Ring is main (a type heading like Ramp changes nothing).
**G4. Foil and etched markers.** Paste:
```
1 Lightning Greaves (CMM) 398 *F*
1 Sol Ring (CMM) 410
```
Expected: Lightning Greaves has its Foil box pre-ticked; Sol Ring does not. (Markers apply to pasted lists from other sites; ManaBox-style text stays non-foil.)
**G5. Tokens skipped.** Paste a `Tokens` heading followed by `1 Treasure` under your normal cards. Expected: the token line is skipped, not listed as unmatched.
**G6. Proxy column.** The A1 file's Kodama's Reach arrives as Proxy by default and you can switch it to Original. Re-check it on a deck CSV: Import deck → File → the same CSV. Expected: same result, Kodama's Reach defaults to Proxy.
**G7. Unknown heading.** Paste `Lands (36)` on its own line above a card. Expected: a warning note, the card stays where it was.

## H. Companion, partner and second commander

**H1. Partner pair from a list.** Paste (any intent):
```
Commander
1 Thrasios, Triton Hero
1 Tymna the Weaver

Deck
1 Sol Ring (CMM) 410
10 Island
```
Expected: both are pre-ticked in the picker (Commander and Second commander); the picker still opens. Confirm and check the review.
**H2. Companion from a list.** Paste:
```
Commander
1 Atraxa, Praetors' Voice

Companion
1 Lurrus of the Dream-Den

Deck
1 Sol Ring (CMM) 410
```
Expected: Lurrus is pre-ticked as Companion, not a commander. A second companion line (add `1 Zirda, the Dawnwaker` under Companion) goes to the maybeboard with a note.
**H3. Illegal pair.** Paste Atraxa and Sol Ring under Commander. Expected: only one is accepted as a commander pair; the second is dropped with a note because they can't be partners.
**H4. Save (flag ON).** Import H1 as "I'm planning it", then H2. Expected on each deck page: the second commander and the Companion sit beside the commander. H2 header reads "N cards + Companion". The companion is NOT counted in the 100 and its colours don't change the deck's colour identity. Collection and sleeved counts as per the intent you picked.
**H5. Deck page buttons.** On a deck with a commander: two new buttons appear next to the commander button, "second commander" (only after a commander is set) and "companion". Add Lurrus as companion by search. Replace it with another card: the old one goes away. Remove it: a "Remove … from this deck?" confirmation appears, and it is removed, not moved to the main list.
**H6. Known gaps (note, don't fail):** restoring an older saved version loses the companion tag; changing the commander doesn't clear an old second commander.

## F. After testing
Delete throwaway decks in-app, turn the flag off if you want saving disabled, then send me every Fail or Note with the screen and what you expected.
