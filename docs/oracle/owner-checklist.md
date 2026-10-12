# Owner checklist (living)

Things Brad can try in the running app, in plain words. Gene keeps this file up to date.

## How this list works
- **One line per thing to try.** Say what to do and what you should see. No code words.
- **Status:** `Untested`, `Pass`, `Fail`, `Blocked` (cannot try yet), or `Retired` (no longer applies).
- **Brad's feedback updates it.** When Brad says something worked, failed or looks odd, Gene changes the line's status and note the same day. A `Fail` becomes a fix task in `status.md` and the line links to it (T-number). When the fix is merged, the line goes back to `Untested`.
- **New work adds lines.** Every task that changes what Brad sees adds its lines when it is merged (Gene does this), tagged with the task and phase.
- **Phase exit.** A phase is not DONE until its lines are `Pass` or Brad has knowingly parked them.
- **Order:** the "Try next" section lists the ten most useful untested lines, so ten minutes is enough. Everything else sits below by phase.
- Newest changes first within each phase. Never delete a line; mark it `Retired`.

## Try next (ten minutes)
Gene refreshes this section after each change. Currently: C-01, C-02, C-03, C-04 once T-51 and T-52 are fixed. Everything else has been tried.

## Phase 2 — Card facts
| ID | Try this | You should see | Task | Status | Date | Notes |
|---|---|---|---|---|---|---|
| C-01 | Open a deck with a card that asks for a particular printing (for example Borderless). Make a proxy for that slot | The proxy shows that same printing, not the newest one | T-49 | Fail | 2026-10-13 | Add proxy button greyed out for a card you do not own. Fix: T-52 |
| C-02 | Make a proxy for a slot and look at its finish (foil or etched slot, if you have one) | The proxy keeps the finish the slot asks for | T-49 | Fail | 2026-10-13 | Same cause as C-01. Fix: T-52 |
| C-03 | On Collection, click Refresh Prices | A message saying how many prices were updated and how many failed. It must not say "updated" if nothing changed | T-50 | Fail | 2026-10-13 | No Refresh Prices button; the whole value strip fails to load. Fix: T-51 |
| C-04 | Look at the collection value banner | A dollar amount; if some cards have no price it says how many ("20 cards have no price yet"). Those cards show "—" | T-50 | Fail | 2026-10-13 | No value banner; same cause as C-03. Fix: T-51 |
| C-05 | Look for Card Kingdom anywhere (collection, brew card tooltip) | No Card Kingdom price, button or text | T-47 | Pass | 2026-10-13 |  |
| C-06 | Hover a card in a deck | The picture is the printing your deck or your copy has | T-48 | Pass | 2026-10-13 |  |
| C-07 | Add a card to a deck by typing its name | It picks a printing you own, if you own one | T-48 | Pass | 2026-10-13 |  |

## Phase 1 leftovers — small fixes to screens (T-42, T-38)
| ID | Try this | You should see | Task | Status | Date | Notes |
|---|---|---|---|---|---|---|
| C-08 | Open a deck and tap a health pill at the bottom | It jumps to that category in the Cards tab | T-42 | Fail | 2026-10-13 | Does not jump. Owner: not a priority. Parked |
| C-09 | Open Version History and start "Restore Version?" then press Cancel (or Escape) | The pop-up closes and nothing is restored | T-42 | Pass | 2026-10-13 |  |
| C-10 | Pick a colour in the commander search colour filter | The selected colour ring is that colour | T-42 | Pass | 2026-10-13 |  |
| C-11 | Look at suggested commanders (Explore and commander suggestions) | Card pictures load instead of "No image" | T-42 | Pass | 2026-10-13 |  |
| C-12 | Open the Tools menu and the account menu | Items are links that go to their pages | T-42 | Pass | 2026-10-13 |  |
| C-13 | Start a new Oracle chat and send a message | The chat gets a name | T-42 | Pass | 2026-10-13 |  |
| C-14 | Search commanders by archetype or tribe | Results appear. Searching by theme words such as "tokens" may find nothing until theme data is loaded (known gap) | T-42 | Pass | 2026-10-13 |  |
| C-15 | Look at the Collection screen and a card's copies | There is no "Missing" or "Graveyard" anywhere | T-38 | Pass | 2026-10-13 |  |

## Earlier checks still not done (Collection screen, from the earlier I-01 review)
| ID | Try this | You should see | Task | Status | Date | Notes |
|---|---|---|---|---|---|---|
| C-16 | Click through the Collection screen: change each filter and sort | Every filter changes what you see (the status filter was reported as not changing results) | I-01 | Fail | 2026-10-13 | Expect a Fail on the status filter; that is Phase 4; Filters do not work. Phase 4 (as expected) |
