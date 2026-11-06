# Deck import intent: spec (rev 4, current)

> **Rev 4 (2026-10-30, owner-approved simplified design):** §15 below replaces §3 "chosen on the first screen", §4–§6 and the 2026-10-29 tag section. Wireframe: `docs/oracle/mockups/import-simplified-wireframe.html`. Where they conflict, §15 wins.

Mockup: `docs/oracle/mockups/import-intent.html`. Applies to **deck imports from every source** (file, pasted list, link, precon). Collection import is unchanged. This is the single current version; earlier revisions are replaced.

## 1. The problem
Every deck import used to start every card as "Original": add a new card and sleeve it. That's right for a deck you just bought. It's wrong for a deck you built from cards you own (it adds duplicates) and for a deck you're only planning (one missed click adds 100 cards you don't have). The owner ends up fixing 100 rows by hand or quietly holding a wrong collection.

## 2. Principle
- **Match the system to the real world (Nielsen #2):** ask in the owner's words ("I bought it").
- **Error prevention (Nielsen #5):** the intent sets safe defaults. A card you don't own can't be sleeved unless it's added.
- **Visibility of status (Nielsen #1):** a result-style summary under the list says what the import will do.
- **Minimalism (Nielsen #8):** labels are short; state is shown by the control, not explained in sentences.
- **Import is the source of truth:** the imported deck wins. A copy that lives in another deck moves.
- **Quiet default, loud exception (D-014):** normal cards look calm; unowned, moves and choices carry the weight.

## 3. Intents
Chosen **once, on the first screen**. The review screen has no switcher; to change it, start again.

| Intent | Heading (first screen once chosen, and review) | Every card starts as |
|---|---|---|
| I bought it | Import purchased deck | Add ticked · Original (new copy, exact printing) |
| I built it | Import built deck | Owned copy sleeved automatically (the proxy if that's the only free copy); only copy in another deck = moves here; other printing owned = needs a choice; not owned = Unsleeved, shown Unowned. Add can be ticked per card, as Original or Proxy |
| I'm planning it | Import planned deck | Unsleeved; shown Owned or Unowned; nothing added or sleeved |

Before an intent is chosen the heading reads **Import deck**. Each choice card has a **one-line description** under its name: I bought it, "Adds every card to your collection and sleeves it."; I built it, "Uses cards you own. Add any new ones as you go."; I'm planning it, "Just a list. Nothing is added or sleeved." Nothing else explains the intent on either screen.
Basics (generic and ordinary lines) default to **unsleeved** under I'm planning it, sleeved otherwise. Generic basics have no Add tick, only Sleeved / Unsleeved for the line.

## 4. Per-card controls
Only two things per copy:
- **Add to collection** tick: a new copy (ticked) or an owned copy (unticked).
- **Original · Proxy · Unsleeved.** When the card is **not owned** the third choice reads **Unowned** (a not-owned slot, nothing added); "Unsleeved" is kept for owned cards left out of the deck. In the saved data both are the same value (`unsleeved`); only the label differs.
- **The Add tick shows on every card** (owner decision 2026-10-29, replacing the earlier "several copies only" rule): per copy, plus a mixed tick on the collapsed row, unticked by default on a built or planned deck. Old rule, no longer used: on a single-copy card the tick was hidden and Add was implied by the choice: Original/Proxy on a card you cannot sleeve from your collection = add it (so those buttons are never disabled); Unowned/Unsleeved = not added; Original on an owned free copy = sleeve it (no add).
- Proxy means a proxy copy is added to the collection and sleeved. Unowned means a not-owned slot in the deck: nothing added, nothing sleeved.

There is no "From collection" choice and no per-card "N free" hint. Owned copies are matched automatically, in order: exact printing, then a free original, then a free proxy (if the only free copy is a proxy, the proxy is sleeved). One owned copy is used once per import.

| Add | Choice | Result |
|---|---|---|
| ✓ | Original / Proxy | New copy added and sleeved |
| ✓ | Unsleeved | New original added, not sleeved |
| ✗ | Original / Proxy, free copy owned | Owned copy sleeved |
| ✗ | Original, only copy in another deck | Moves here (see §5) |
| ✗ | Original, other printing owned | Blocked until chosen (see §6) |
| ✗ | Unsleeved, owned | Owned (list only) |
| ✗ | Unsleeved, not owned | ⊖ Unowned |

Keeping valid (cards with several copies, where the tick is shown): Original and Proxy are **disabled** when Add is unticked and nothing free is owned (title text: "Not owned: tick Add" or "No free copy: tick Add"). Single-copy cards have no tick, so nothing is disabled: choosing Original/Proxy there sets Add, choosing Unowned/Unsleeved clears it. Ticking Add on an Unsleeved copy makes it Original. Unticking Add with no free copy makes it Unsleeved (shown **Unowned** if the card is not owned). Collapsed row: select · qty · name, set · tags · Add tick (several-copy cards only) · caret. Tags: Proxy, Original, Moves here, Alt printing, Unsleeved (owned cards only), ⊖ Unowned (counts when partial).

## 5. Card held in other deck(s): the copy moves
Inline row under the card (never a modal): **{Card}: copy will be moved from [Korvold | Skip]**; with several decks **[Korvold | Yuriko | Skip]**. The UI is the same for one deck or many; the owner picks which deck is missing it. With one deck, that deck is **pre-selected**. With several, none is selected and the card shows as needing a choice until picked.
- **Skip** (tooltip: "Adds a new sleeved copy here; the other deck shows an alert on this card"): a new copy is added and sleeved here, and no copy moves.
- **The alert:** on the other deck's decklist the card shows **⚠ Accounting error** with the line "{Card} was sleeved into {deck} without moving this copy" and two actions, **Fixed** and **Dismiss**. It stays until the owner fixes or dismisses it. The rest of that decklist is unchanged.

## 6. Owned in a different printing
Inline row: **{Card}: you own it as CMM 410; this deck lists CLB 351. It can't be sleeved until you choose.** Buttons **Use my CMM 410** and **Add this printing** (ticks Add; new Original). Until chosen the card shows a **Alt printing** tag and the footer counts it. No other explanation on the card.

## 7. Layout
- **First screen:** heading, source tabs, then the question "What's this deck?" and three radio cards (name plus one-line description) BELOW the tabs (owner's Round 17 order; the first mockup had the cards above the tabs). Error if Continue is pressed with none chosen: "Choose one to continue." A dropped file is held with "Choose one below." and reads when chosen. Nothing is pre-selected except in Precon.
- **Precon tab:** a list of precon decks; selecting one goes straight to review with **I bought it** preset (heading Import purchased deck). On the Precon tab the choice stays visible with **I bought it** selected and locked, with a note. Every card is a new original in its exact printing; nothing to match or move.
- **Review:** heading by intent · Name / Format / Commander · import defaults line ("Non-foil · Near Mint · English · Change") · filter chips · list with header "Add to collection" · **summary below the list** · footer count (or "{n} cards need a choice") and **Import deck**. No intent text, switcher or explainer on review.
- **Summary (result style):** "{n} cards: {n} added to your collection ({n} proxies) · {n} to sleeve from your collection · {n} to move from another deck · {n} added, not sleeved · {n} unsleeved · ⊖ {n} unowned · {n} need a choice · ⚠ {n} alerts on other decks · {n} generic basics". Counts with zero are omitted; "Nothing added to your collection" when none. Result screen: the same counts in a list, past tense, headline "{deck} imported".
- **Bulk bar:** Add tick (mixed), Original / Proxy / Unsleeved, Set finish/condition/language, Clear. Where some copies can't take the change: "Applied to {a} of {b} copies."

## 8. Component inventory
| Component | Built on |
|---|---|
| Intent cards (first screen) | RadioGroup styled as cards |
| Heading (changes by intent) | existing dialog title |
| Add-to-collection column and tick | Checkbox (supports mixed) |
| Copy line: Add · Original/Proxy/Unsleeved · fields | Checkbox, segmented control, Select |
| Move row (Korvold \| … \| Skip) | segmented control (single select) |
| Printing row (Use my … / Add this printing) | segmented control |
| Tags | Badge (outline) |
| Summary (below list) | plain text, role=status |
| Precon list | listbox of rows |
| Decklist alert (Accounting error, Fixed, Dismiss) | existing alert pattern in the decklist |
| Bulk bar, result screen | existing |

## 9. States
Default, hover, focus, open, selected (rows as today) · Add tick on / off / mixed / not applicable (generic) · Original/Proxy disabled (not owned or no free copy) · Owned copy · Owned proxy sleeved · Moves here (deck picked) · Move needs a deck (several decks) · Move skipped · Needs printing choice · Unowned · Unsleeved · Added, not sleeved · Loading ownership ("Checking your collection…", moves and matches disabled) · Ownership failed (one amber line with **Try again**; untouched cards are left unsleeved, nothing sleeved from a guess) · Empty filter ("No cards match.") · Input: no choice / error / file held · Saving where a matched copy is no longer free: saved Unsleeved and listed under "Needs a look" on the result. Over-allocated is not possible at import. Candidate vs committed: not applicable; nothing is saved until Import deck.

## 10. Interactions
- **Pointer:** click an intent card; click a precon row; click the Add tick; click Original / Proxy / Unsleeved; click a deck, Skip, Use my…, Add this printing; bulk bar as today; Fixed / Dismiss on a decklist alert.
- **Keyboard:** intent cards are a radio group (arrows move and select). Precon rows: Tab, Enter or Space. Review order: Name → Format → Commander → defaults → list. Row: select checkbox → Add tick → caret (Space toggles Add). Move and printing rows are button groups: Tab in, arrows move, Enter/Space picks. A disabled segment is skipped and its reason is in its title and read on focus. Escape closes any open picker.
- Choices that correct each other (§4) are announced, e.g. "Sol Ring: left unsleeved." Focus never jumps.

## 11. Edge cases
- **Multiple copies:** each copy is decided on its own. 3 Mountain (ZNR 267) with 2 owned: copies 1–2 owned, copy 3 Unsleeved.
- **Shared copies:** one owned copy is used once; the first line in import order gets it.
- **Same card in two decks:** two copies in Korvold and Breya, one wanted: one move; pick the deck.
- **Partly bought, partly owned:** pick I bought it and untick Add on the owned cards, or pick I built it and tick Add on new ones.

## 12. Copy (exact strings)
Headings: "Import deck" · "Import purchased deck" · "Import built deck" · "Import planned deck". Question: "What's this deck?". Cards: "I bought it" · "I built it" · "I'm planning it". Errors: "Choose one to continue." · "Choose one below.". Column: "Add to collection". Choices: "Original" · "Proxy" · "Unsleeved". Tags: "Proxy" · "Original" · "Moves here" · "Alt printing" · "Unsleeved" · "Unowned". Copy line status: "Owned copy" · "Owned proxy" · "Moves from {deck}" · "Not sleeved" · "Unowned" · "Owned". Move: "{Card}: copy will be moved from" + deck buttons + "Skip". Printing: "{Card}: you own it as {printing}; this deck lists {printing}. It can't be sleeved until you choose." · "Use my {printing}" · "Add this printing". Alert: "Accounting error" · "{Card} was sleeved into {deck} without moving this copy." · "Fixed" · "Dismiss". Disabled titles: "Not owned: tick Add" · "No free copy: tick Add". Footer: "{n} cards" · "{n} cards need a choice before it can be sleeved". Bulk: "Applied to {a} of {b} copies." No-match: "No cards match.".

## 13. Data binding (plain terms)
Needs, per card: how many free originals and free proxies the owner has; which decks hold the owner's other copies; any other printing owned. Import must be able to move a copy from one deck to another, record a skipped move against the card and the other deck, and show and clear an alert on that deck's decklist. Precon needs a list of decks with exact printings. None of these is a contract today: **BLOCKED for the Architect.**

## 14. Accessibility
- Contrast (D-012/013): grey #9C9CA3 6.4:1; proxy blue #4A93A0 4.9:1; green #1D9E75 5.1:1; unowned magenta #F0339E 4.7:1 on surface but 4.3:1 on hover, so magenta is the ⊖ icon and tag border only, with the word in normal text. Amber for moves, choices and alerts is used as border and icon, with the word beside it.
- Every state has a word plus an icon where one exists; mixed tick shows "–". No WUBRG hues for states.
- Names: Add tick "Add Sol Ring to collection" (mixed: "…, 1 of 3 copies"); copy group "Copy 2 of 3"; intent group "What's this deck?"; move and printing rows are labelled groups "{Card}: needs a decision". The footer and summary are status text; changes are announced.
- Targets at least 24 × 24 px. Tab order as §10.


## 9. Tags and open questions (owner decision 2026-10-29; replaces the tag wording in §4–§6)
Tags tell the owner what the import says about each card. Ownership tags: **Unowned** (not in the collection; nothing to decide), **Original** (owned and sleeved, or added; Proxy shows as Proxy), **Alt printing available** (a different printing is free), **Alt printing in use** (a different printing is held by another deck), **Overallocated** (the exact printing is held by another deck).
- A card with an open question shows a warning tag and is **locked**: Original / Proxy / Unsleeved, language, finish and condition are disabled ("Answer the question above first") until it is answered. Add stays usable: ticking it resolves the question by adding a new copy.
- Alt printing asks "Use my {printing}" or "Add this printing". Overallocated asks which deck to pull the copy from, or Skip. Nothing is pre-picked, including when one deck holds the card.
- Alt printing in use asks both, printing first, then the deck. It keeps one tag until both are answered.
- Ticking Add on an Unowned card makes it Original (a new copy record); it can then be changed to Proxy.
- Supersedes: "one deck is pre-selected" (§5) and "Use my printing is the default" (§6). Maybeboard and Generic land are separate badges.

## 15. Simplified model (rev 4, 2026-10-30; supersedes §4–§6 and the tag section)
**When the question is asked.** One screen, no switch (wireframe `docs/oracle/mockups/import-no-switch-wireframe.html`). The source area (File dropzone, Paste box, URL field or Precon list) is on top; **What's this deck?** sits below it as three side-by-side choices, always visible but greyed out until the deck has loaded (the file area shows "Reading your file…" meanwhile). When loaded, the source area shows "✓ name: N cards" (File), the choices turn on with real numbers for this deck, and one is pre-selected (no "suggested" label). Continue opens the review; Back on the review returns here. Precons suggest "I bought it" but all three choices stay available (owner may import a precon list without adding cards).
Suggestion rule: precon → I bought it; the owner owns at least half the cards → I built it; otherwise I'm planning it.

**Per-copy controls (rev 5, owner-approved wireframe `docs/oracle/mockups/import-dropdowns-wireframe.html`).** Two columns: **Card origin** and **Type**, shown as quiet dropdowns on rows and copy lines: the closed value is plain text with a small ▾ and no border, a light outline appears on hover or focus, the control is only as wide as its text, and clicking opens a short menu with a one-line description under each option. Options that can't be used stay in the menu, greyed, with the reason as their description (for example "None left in your collection"). Grid: 24 / 28 / 1fr / 150 / 90 / 28 px.
| Card origin (closed value) | Menu description | Type |
|---|---|---|
| Unowned (card not owned at all) or Planned (owned in any printing, not used) | Just on the list, no copy | empty, can't be set |
| From collection | Uses a copy you own | Original or Proxy ("The real card" / "A stand-in copy"), each only if one is available |
| New copy | Adds one to your collection | Original (default) or Proxy |
Defaults: I bought it → New copy · Original. I built it → From collection if owned, else Unowned. A short copy simply shows From collection (no badge or note on the row; the footer says how many are short and blocks Import).

**Planned decks** have no dropdowns and no Type column. One plain, non-editable **Status** column reads Owned or Unowned (owned in any printing), or Basic land for generic basics. The bulk bar hides the Card origin and Type toggles.

**Generic land.** Only generic basic rows (basics, Wastes, snow basics with no printing named) have a Card origin dropdown: **Generic land** ("Any basic, sleeved, not tracked") or **Unowned** ("No copy"). Generic land is the default (except planned, which shows Basic land status). It is never offered on other cards. Maybeboard rows read "Not added or sleeved".

**Bulk bar** (several rows selected) keeps the segmented toggles, labelled Card origin: No copy / From collection / New copy, and Type: Original / Proxy.

**Which owned copy is used.** Exact printing first, then other printings; originals before proxies (unless a type is picked); matching finish preferred. Free copies are used before copies in other decks.

**Copy already in another deck.** Collection still uses it. The card is tagged "Also in {deck}". Owner rule: it stays allocated to all decks involved and is flagged on each; no new copy is created; resolving happens on the deck page (pull from another deck / send to this deck). **Not saveable yet**: Import is blocked with a note until the database supports one copy in several decks (needs Architect contract and owner-approved migration).

**Not enough copies.** If Collection has nothing left for a copy, it shows as short (no row badge; the footer says how many) and blocks Import until set to New copy or left out of the deck.

**Removed.** Add to collection tick, the printing question ("Use my / Add this printing"), the move question (pick deck / Skip), and row locking.

