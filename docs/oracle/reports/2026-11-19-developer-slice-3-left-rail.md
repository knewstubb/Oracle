# Report: slice-3-left-rail
Role: Developer
Status: DONE
Task as received: Implement FEAT-002 of slice 3 (deck page left rail, DV-01): mount the rail in the deck page, remove the old header, slot-usage bar and footer health strip, add the phone collapse, verify in a browser and write this report. Plan: .agents/tasks/slice-3-left-rail/plan.md items 5-7.

## Summary for the owner
The deck page now has a summary column on the left showing the commander art, the deck name, the commander, the strategy block, the card counts, deck health, the mana curve and colour needs. The old header across the top, the progress bar above the card list and the health bar at the bottom are gone. Their contents moved into the column or into a new "..." menu at the right end of the tab row, which holds Export, History and Delete deck. On a phone the column folds into one 64px bar ("Yedora the Explorer · 102 / 100 · 2 over") that opens when tapped. The flags below list a few placement choices for you to confirm.

## 5-minute test
1. Open **Yedora the Explorer** on a laptop-width window. On the left you should see the card art, the name, "Commander · Green", the dashed "Target bracket: Not set" box, then "102 / 100" with a warning icon and "2 over", followed by Original / Proxy / In other decks / Unowned / Available, Deck health (Ramp 18 / 15 Met …), Mana curve and Colour needs.
2. Scroll the card list. The left column stays put, and you can scroll it on its own.
3. Click the "Target bracket" box. The Strategy window opens.
4. Click a Deck health row, for example "Draw". The same health details panel the old footer opened appears.
5. Click "..." at the top right. You should see Export, History, a line, then Delete deck in red. Click Delete deck. A confirmation appears and nothing is deleted until you confirm. Press Escape.
6. Open **A rot to process**. It shows "100 / 100" with no "over" text.
7. Narrow the window to phone width (or use a phone). The column becomes one bar at the top. Tap it to open, and tap again to close.

## Where every removed element went
| Old element | What it showed | Where it is now |
|---|---|---|
| Header: small commander avatar | Commander art | Rail, larger card image at the top |
| Header: deck name | Name | Rail heading |
| Header: Precon mod badge | Badge | Chip under the name in the rail |
| Header: commander chip | Commander name(s) | Rail Commander section |
| Header: "n cards + Companion" | Count | Rail Cards section ("102 / 100", "+ Companion") |
| Header: "n proxies" | Proxy count | Rail Cards section, Proxy line |
| Header: "Bracket N" | Imported bracket | Dropped. The Strategy block shows the target bracket instead (flag) |
| Header: estimated value | Deck value | Rail Cards section, Estimated value |
| Header: salt score chip | Salt score | Rail Commander section (same colours and hover text) |
| Header: build picker | Build choice (Commander decks) | Tab row, left of "..." (flag) |
| Header: Export, History, Delete buttons | Actions | "..." menu, Delete last and confirmation kept |
| Slot bar: "n/100 slots · x in deck" | Fill and in-deck count | Rail Cards section bar and "N in deck" line |
| Slot bar: legend counts | Original, Proxy, Available, Claimed, Unowned | Rail Cards section (Claimed is shown as "In other decks") |
| Slot bar: Generic count and "short generics" text | Generic lands | Rail Cards section (Generic shown only when above 0; short-generics line under the bar) |
| Slot bar: "View Picklist" button | Jump to Picklist | Gone. The Picklist tab is one click away (flag) |
| Footer: verdict button and role pills | Deck health | Rail Deck health section (headline plus rows with Met / Short) |
| Footer: loading and error states | "Checking…", Try again | Rail Deck health and Cards sections |
| Footer: details panel | Gap detail, add/buy actions | Opens from any rail health row or the headline |

## Flags for the owner
- **Build picker location:** it now sits in the tab row next to "...", the closest place to where it was. It appears only when the deck has builds to pick from.
- **Health rows open the details panel:** the spec calls the rail read-only. Opening the details panel only shows information, and keeping it means the gap detail and add/buy actions are not lost.
- **Extra lines:** Available, and Generic when above 0, are shown in addition to the spec's four counts, because the old bar showed them.
- **"View Picklist" button gone:** use the Picklist tab instead.
- **Old "Bracket N" text dropped:** the Strategy block's target bracket replaces it.
- **Sources are partial:** the "n of L" sources count includes basic lands and a fixed list of well-known dual, fetch, triome and any-colour lands. Other nonbasic lands are not counted. The rail says so in a note.
- **Curve is partial:** cards with no mana cost on file are not guessed. The rail lists them as "N cards have no cost on file".
- **Partner slot is read-only in the rail:** partners and companions are still edited in the Cards tab.
- **Small difference from the mockup:** the mockup has a "Strategy" heading above the strategy box. The rail shows the box without a separate heading, as slice 1 built it. Everything else follows the mockup's order: Commander, Strategy, Cards, Deck health, Mana curve, Colour needs.

## Changed files
- src/app/decks/[id]/page.tsx — new layout: rail plus workspace, "..." menu and build picker in the tab row, history window opened from the menu, phone single column; old header and footer no longer mounted
- src/components/CardsTab.tsx — removed the progress bar above the card list and the unused "View Picklist" wiring
- src/components/deck-strategy/StrategyBlock.tsx — wrapper classes only, so it fits the 304px rail
- src/app/decks/[id]/page.test.tsx — new page-level tests
- docs/oracle/reports/evidence/slice-3-left-rail/ — screenshots (Yedora and A rot to process at 1280px and 390px, collapsed and expanded, menu open)

PersistentHeader.tsx, HealthStrip.tsx and their tests are still in the repo, unmounted. PicklistV2.tsx is untouched.

## New decisions made (need owner confirmation)
- The flags above (build picker location, health rows open details, extra count lines, View Picklist removed, Bracket text dropped).

## Assumptions
- "A rot to process" was used as the second deck (100 cards, two colours).
- On a narrow page the rail starts collapsed every time the page loads.

## Challenges to locked decisions
- none

## Open questions
- none

## Verification
- `npx vitest run "src/app/decks/[id]/page.test.tsx" src/components/deck-rail src/components/deck-strategy src/components/VersionHistoryPanel.test.tsx` — 6 files, 69 tests passed
- `npm test` — 330 files passed, 6 skipped; 4098 tests passed, 46 skipped; no failures (the ImportIntentFlow env-flag test did not fail in this run)
- `npm run typecheck` — only the 4 known AddToPicklist.test.tsx errors
- `npm run lint` — 1 error, pre-existing (PicklistV2.tsx no-html-link-for-pages); none from changed files; CardsTab warning count unchanged (14 before and after)
- Browser check: dev server on port 3137 in the worktree, headless Chromium through a Playwright script (the Playwright MCP browser kept closing). Yedora (793088939) and A rot to process (792901206) at 1280px and 390px:
  - console errors: 0 in all four runs
  - 1280px: rail 304px wide, sticky, scrolls on its own; no old header, slot bar or footer
  - 390px: rail collapsed to a 64px button, aria-expanded changes to true on click; page is one scrolling column
  - "..." menu: 44×44 trigger; items Export, History, Delete deck, each 44px tall once open; keyboard Enter opens it, arrows move, Escape returns focus to the trigger
  - tab order: site header, then rail (Strategy block, health headline, health rows), then tabs and "..." ; no rail button under 44px tall
