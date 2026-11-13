# Report: know-where-cards-are
Role: Designer
Status: DONE
Task as received: Repo /Users/bradknewstubb/Developer/Personal/oracle_app (main). Read AGENTS.md, docs/oracle/process.md, docs/oracle/vocabulary.md, existing specs/mockups in docs/oracle/specs and docs/oracle/mockups (especially whats-missing and the design system used), and the approved brief docs/oracle/briefs/daily-use-deck-advisor.md (move checklist, In your hand, Missing, Unsorted, scenarios S7/S8 and related owner answers). Owner approved starting Phase 3 'Know where cards are' on 2026-11-12. Task: design (no app code) the owner-facing experience: (1) the combined move checklist (cards to move between decks/boxes grouped sensibly for physically walking around, each with two ticks: Found it, Placed it; Can't find it), (2) how 'In your hand' looks and where it is visible so he always knows what he's carrying, (3) the Missing location and how a deck shows a planned slot that is short because the card is Missing, with a 'where to look next' prompt, (4) Unsorted and how new imports land there, (5) empty/error/loading states, mobile and desktop, using existing design tokens and vocabulary. Also include a small design for the chat 'proposal cards' (Add / Add all / Not now / Undo) that the Developer built without a spec; propose refinements only. Deliver a spec, an HTML mockup and this report. Do not decide data model questions; note assumptions.

## Summary for the owner
I designed the whole Phase 3 experience: a move checklist grouped by where you walk, with Found it and Placed it ticks, a "Can't find it" path, an "In your hand" chip that is visible on every screen, the Missing place with a short slot on the deck, and Unsorted as the landing spot for imports. I also reviewed the chat suggestion cards and propose thirteen small refinements. Please open the mockup, try the checklist on both laptop and phone, and answer the seven questions at the end of the spec; the main ones are what the Move action on a deck should do, and whether a deck with a Missing card should still read Assembling.

## Changed files
- docs/oracle/specs/know-where-cards-are.md — the spec (all nine required sections, plus chat card refinements)
- docs/oracle/mockups/know-where-cards-are.html — single-file mockup, six screens, laptop/phone switch, working checklist demo
- docs/oracle/reports/2026-11-12-designer-know-where-cards-are.md — this report

## New decisions made (need owner confirmation)
- New status colour `--status-in-hand` #9D8DF1 (violet) for In your hand; Missing uses the existing amber with a magnifier icon; Unsorted stays neutral.
- A move appears at two stops (where you find it, where you place it); the second row is disabled until the first is ticked.
- Default stop order: Unsorted, boxes A to Z, decks A to Z (Q4).
- "Can't find it" needs no confirmation; Found and Placed can both be un-ticked.
- In your hand is shown by a global app-bar chip, a pinned panel on the checklist (bottom bar on phone), and a badge on the deck slot.
- A deck with a Missing card stays Assembling, with an amber "short" chip (Q2).
- The deck's Move action becomes "Add to move checklist", with "Move in Oracle only" as the secondary (Q1).
- No automatic return of cards left in your hand; a gentle "still in your hand since yesterday" line after 12 hours (Q3).
- No "give up on it" action for Missing cards in this phase (Q6).
- Chat cards: deck named once in a header with a plain "Add" button (changes the contract's button wording, Q7), plus twelve other refinements listed in the spec section 13.
- Suggested swaps (proxy ranking) are not designed here; reserved for Phase 5.

## Assumptions
- Moves persist so the phone and laptop agree.
- Hand, Missing and Unsorted are places a copy can be in; how that is stored is the Architect's call.
- "Where to look next" uses recorded location history; if none exists the generic fallback wording is used.
- Spare copies exclude Missing and In your hand.
- Import batch grouping depends on a batch marker on new copies; otherwise Unsorted is a flat list by date.
- The location picker already in the app (`LocationPickerModal`) can be reused [Approximate: file exists, not inspected in detail].

## Challenges to locked decisions
- D-028 / D-034 — none new. D-028 is already reversed for Missing by the owner (brief section 17); D-034 amendment is already with Gene. Note for Gene: the chat cards design assumes the per-click rule, not D-034's original wording.
- D-039 — extended in chat on 2026-11-11 (a card removed for a move goes to In your hand); this spec follows that extension. `decisions.md` still needs Gene's update at close-out.

## Open questions
- Q1 to Q7 in the spec section 17 (Move action, Missing deck state, cards left in hand, stop order, poor signal, cards that never turn up, chat Add wording).
- For the Architect: the data listed in the spec section 10 (system places, persisted moves, location history, timestamps, import batch, spare rules).

## Verification
- Opened the mockup in Chrome with Playwright: no console or page errors across all six screens and both devices; clicked Found it, Can't find it, the hand drawer and the phone bottom bar.
- Viewed screenshots of checklist (laptop and phone), deck, Unsorted, chat cards, hand sheet; fixed a cramped hand panel, a missing phone hand bar and a wrong deck badge found this way.
- Contrast computed with a script for the new pairs; results in the spec section 12. The current chat card's grey-on-dark "Goes in" text measures about 3.4:1 (below 4.5).
- Not tested: real devices, screen readers, the app itself (no app code changed).

---

## Amendment 2026-11-13: Move here and wording (owner decisions)

### What changed
- Spec: new section 19 (Move here: placement on deck rows, Undo toast, row afterwards, built or Playable source deck, several copies, phone, states, touchpoints, wording changes, components). Section 4.6, section 16 and Q1 rewritten: Move here is primary, Add to move checklist is a small secondary, the earlier "Move in Oracle only" idea is withdrawn. Q8 to Q10 added.
- Mockup: new screen "3c Move here" (laptop and phone) with four rows (one copy in an Assembling deck, one in a Playable deck, three copies with a copy chooser, a just-added planned slot), Undo toast, inline "Moved from X · Undo", and a side card on what changes elsewhere. Chat card now offers Move here after Add. Tab reads "Move checklist". Labels use the provisional "In deck" / "Planned".
- No reminder list or nagging is designed for physical moves, as the owner asked.

### New decisions needing owner confirmation
- Q8: moving from a Playable deck gets a toast naming the state change, not a confirm dialog. This differs from the existing confirm dialogs in the picklist and status chip popover, which the Architect/Developer would need to replace for this action.
- Q9: default copy when several: non-Playable decks first, originals before proxies, then A to Z, with a chooser.
- Q10: labels replacing Sleeved/Unsleeved are not chosen. Recommendation "In deck" / "Planned". Screens affected are listed in spec 19.7.

### Challenges
- `vocabulary.md` (D-025 Sleeved/Unsleeved) and `decisions.md` need Gene's update; I did not edit them.
- Owner's "Sleeve" removal touches many existing screens; they are listed, not changed.

### Open questions
Q2 to Q10 in the spec. The Architect owns the contract update for atomic move and undo.

### Verification
Playwright with system Chrome: Move here and Undo clicked on the Playable-source row, toast text checked, no page errors. Phone view and screenshots were checked earlier in the session; one apostrophe syntax error in a copy string was found and fixed. Not tested: real devices, screen readers.

---

## Amendment 2026-11-13 (second): Picklist merge

### What changed
- One concept, the **Picklist**. The per-deck "Sleeve List" tab and the move checklist are merged. Tab reads Picklist; the Sleeve button reads Placed it. "Move checklist" is renamed everywhere.
- Spec: top naming note, renamed sections and copy, new section 20 (layout, order, progress, rows per group, relation to the all-decks view, Unowned and wishlist, states, mobile, keyboard, data, components, accessibility, copy, Q11 to Q16).
- Mockup: new screen 1b "Picklist, one deck" with a state switch (Normal, Loading, Couldn't load, Complete), nine new cells in the states gallery, Atraxa added so Move here has a source; deck screen now shows 92/100 in deck.
- Move here kept as designed.

### New decisions needing owner confirmation
- Three stacked groups in the order Available, Needs moving, Unowned (Q11).
- "Ready" means in the deck (Q12). In hand and Missing cards stay in their group.
- One tap Placed it from Available (Q13).
- All-decks view holds only cards on the walk; ticks shared; Unowned never listed there (Q15).
- Wishlist: a tick, price and a link to Buy ideas only. A separate wishlist feature is a later question (Q14).
- In deck / Planned remain provisional (Q10).

### Challenges
- `vocabulary.md` and `decisions.md` need Gene's update (Picklist, Placed it); I did not edit them.
- The current `PicklistV2` three columns, confirm dialogs and "Sleeve" strings are replaced by this design.
- Shared ticks need the Architect's contract to cover a per-deck view, a Placed-without-Found step and a wishlist flag for unowned deck cards (Q16).

### Open questions
Q11 to Q16 in the spec section 20.

### Verification
Playwright with Chrome, laptop and phone: no console or page errors; Move here with Undo, ticks, wishlist and the walk-all action worked; screenshots viewed; a phone tick wrapping issue was fixed. Not tested: real devices, screen readers, the app itself (no app code changed).

---

## Amendment 2026-11-13 (third): choose where imported cards go

### What changed
- Owner decision: one destination for the whole collection import. Default Unsorted; a grouped, searchable picker (Unsorted, Boxes and binders, Decks; never Missing or In your hand).
- Spec: new section 21 (placement under the "Importing as" bar on the collection import review step, default, deck-destination note with a before-import preview, result block "Where they went", how it works with "Add all {n} to the Picklist", states, mobile, accessibility, data, copy, Q17 to Q23). Section 7 (how imports land), the Unowned help line in 20.4, the component and data tables and the copy bank were updated to match.
- Mockup: new screen 4b "Import: where cards go" (working picker with search, laptop popover and phone bottom sheet, deck note with numbers, result screen for Unsorted, binder and deck, state switches for places and deck check). Screen 5 gained eight import states. The deck's Unowned footer now links "Import cards for Korvold".
- Where the choice happens: only the collection import. Deck import ("I bought it / built it / planning it") is unchanged; onboarding gets no picker.

### New decisions needing owner confirmation
- The picker is always visible under the defaults bar, not tucked into "Change".
- Default is Unsorted every time; no memory (Q22).
- No Picklist offer for binder or box destinations; for a deck, only the copies sent to Unsorted are offered (21.7).
- Copies are placed one at a time in file order; later copies of a card the deck lists once go to Unsorted (21.5).
- Any copy that cannot be placed goes to Unsorted, never dropped (21.8).
- Search appears when there are more than 8 places.
- The result block lists counts that always add up, with zero parts left out.

### Challenges
- `decisions.md` and `vocabulary.md` need Gene's update (new rule: imports can choose a destination; Unsorted is the default, no longer the only landing place). I did not edit them.
- D-020 (planned slots are deck cards with no copy) is relied on for "fills a planned slot"; no conflict found.

### Open questions
- Q17 shortcut from a deck; Q18 deck import gets no picker; Q19 basic lands; Q20 deck over its size; Q21 which decks appear; Q22 remembering the choice; Q23 Architect (one destination plus three counts, all-or-nothing save, preview speed). Details and recommendations are in section 21.13 of the spec.

### Verification
Playwright with Chrome: laptop and phone, picker search and no-match, picking a deck, note and numbers, Import cards, result text, phone sheet; no page errors. Screenshots viewed. Not tested: real devices, screen readers, the app itself (no app code changed).
