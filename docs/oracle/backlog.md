# Oracle backlog
Updated 22 November 2026 (deck rename, reorder and faster deck opening are finished and no longer listed).
Updated 19 November 2026 (planning round: briefs and designs drafted for the deck page, Strategy window, card Tags and Claude change reason; all awaiting owner approval).

Unfinished work only, grouped by what you would see in the app. This is a summary, not a priority order or approval to start work. Finished work and history are left out.

## Next priority: open question
Decided so far: clean-up, then rename and reorder decks, then faster deck opening (all done). You then said Deck health is not the biggest blocker, so the next item is open. Candidates: collection and storage tools; Claude doing deck work; the deck page itself (strategy block, sideboard); trusting what is already built by walking through it in the app. Deck health work stays proposed, neither approved nor cancelled.

## Polish waiting for your choice
- Spacing differences from the Figma design, found by the 2026-11-22 check: the rail titles "Strategy & bracket" and "Deck health" sit 5 px too low (recommended first); the tab underline in the Deck settings window is 5 px too far; spacing and width of the line above Mana production differ; card group headings have less space than the design (that design frame is older, so confirm it first). You have not yet chosen which to fix.

## Approved work being progressed

- **Bigger Claude edits:** build or change a whole deck, move cards and undo the whole request in one click. Partly built; the stored-data change is still awaiting approval.
- **Create decks through Claude:** choose a name, commander, format, strategy and bracket. Built and live 2026-11-18; real-chat check still to do.
- **Import decks through Claude:** paste a decklist or give it a Moxfield/Archidekt link. Approved; planning underway.
- **Manage storage and Picklists through Claude:** create boxes, move copies and tick off cards. Approved; planning underway.
- **Buying list and wishlist:** see what a deck needs and estimated prices, and keep a wishlist. Buying list built but not tried through Claude; wishlist not built.

## Test and finish recent work

- Try the recent Picklist, storage, import, collection and Claude changes in the app.
- Check card printing, finish, proxy and price details on real cards.
- Try Claude's search, Deck health and card-category editing.

## Collection

- Switch between locations using a row above the list, with fixed **All cards** and **Proxies** options.
- Show where each card's copies are located.
- Click a card to open an editing window for its key details.
- Edit card quantities; decide whether this applies to the collection, decks or both.

## Deck library and deck pages

- Review the icons on deck tiles.
- Start Deck health and the other side panels loading together with the deck (the second step of faster opening; not built, a later choice).
- Small polish on reordering decks: tiles sliding into place, respecting reduced-motion settings, a tilted copy while dragging.
- Audit and refine the deck header.
- Move the deck header into a sidebar.
- Put Deck health beside the slot-usage bar and remove the footer it replaces.
- Audit Workbench, Analysis and the other deck pages.
- Add sideboard support; agree how it differs from Maybeboard.

The header, sidebar, Deck health and deck-page reviews should be considered together rather than redesigned separately.

## Consistency across the app

- Standardise buttons.
- Audit the Tools menu.
- Finish consistent labels, badges, filters and loading/error displays.

## Better advice and card information

- **RQ-12** Card Tags (was "card roles"): ramp, card draw, removal and mechanic tags such as sacrifice outlet, shown read-only on cards and usable as a search filter. Folds in RQ-01 and RQ-10; modifiers (RQ-03) stay later. Brief and design drafted, awaiting your approval. Not built.
- Distinguish one-use effects from repeatable effects and account for their cost.
- Let a card in a deck carry a one-line Why and a "Keep" flag (a job per card is dropped). Part of the RQ-12 brief, awaiting your approval.
- Account for commanders changing a card's role; for example, Urza makes artifacts into mana sources.
- Allow a reference or "secret" commander; for example, use Norin's suggestions for a Rocco deck built around Norin.
- Finish each deck's strategy, win conditions and bracket, and check that advice uses them.
- Load EDHREC suggestions for the owner's commanders and deck styles.
- Improve matching between what cards produce and what a deck needs.
- Compare suggestions using three real decks and the actual collection.
- Add Commander Spellbook combo notes and fix the known combo-lookup issues.
- Add mana base maths to Deck health: land count including double-faced lands, colour balance, and the chance of too few or too many lands. (New 2026-11-19.)
- Compare the bracket a deck's cards imply (Game Changers and known combos) with the bracket you set, and flag a mismatch. (New 2026-11-19.)

## More Claude improvements

- Improve search by card text, Legendary status, subtype and mana value. (Approved 2026-11-18; build started.)
- Show commander colours consistently (done), improve sorting and allow locations to be excluded (now a separate item: a trade binder type).
- Fill in missing card information, including checks for two-faced cards. (Approved 2026-11-18; build started.)
- Check decks with unexpected card counts and missing brackets.
- Add a trade binder location type that Claude leaves out of suggestions by default (new 2026-11-18).
- Add category management, including renaming, merging and suggested categories.
- Add per-deck notes and a decision log.
- Add strategy advice using EDHREC and combo information.
- Log games and playgroups. Approved, but scheduled after the earlier card-information and category work.

- Dropped 2026-11-18: warning when two decks plan the same single-copy card (a card on a list is only a plan).

## Parked or needing a fresh check

These are retained from older plans, not a claim that the problems still occur.

- Finish the broader collection/loading review and check that filters really change results.
- Check the collection value banner and adding a proxy for an unowned card.
- Recheck collection imports that have no Scryfall ID column.
- Finish the original-copy shortage view, including shortages currently covered by proxies.
- Make "Break down deck" available on screen and finish the remaining card-movement work.
- Finish controls for generic basic lands and the remaining deck-state work.
- Revisit the older in-app advisor design, suggestions and Undo work alongside what now exists.
- Check standalone Moxfield importing.
- Brew Canvas and other later conveniences, including a mana-curve slider.
- Prepare for other users only when sharing becomes a priority.
- Revisit backups and recovery when the core app is working.

Vector-based recommendations remain parked; the trial is closed.

## About this view

Based on the detailed backlog as recorded on 22 November 2026, not a fresh audit of the app. Older entries sometimes conflict with newer updates; those are kept as "needing a fresh check" rather than marked as current bugs. No priorities or locked decisions have changed.

Full task table and history:

`docs/oracle/backlog-details.md`
