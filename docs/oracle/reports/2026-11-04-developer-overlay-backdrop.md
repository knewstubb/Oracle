# Report: overlay-backdrop
Role: Developer
Status: DONE (branch `build/overlay-backdrop-2026-11-04`, not merged)
Task as received: Make the hand-rolled overlays (PrintingPicker, OracleChat, CardLocator, SmartSearch, CommanderBrowser, CommanderDetailModal, MobileHeader) use the same darker blur backdrop as the shared Dialog, ideally via one shared token/class. New branch off main, run tsc/vitest/eslint, short report, commit, stop. Do not merge.

## Summary for the owner
Those seven overlays now have the same darker, blurrier backdrop as every other dialog, and all of them (plus the shared dialog) take it from one place, so it can be changed once. A few other overlays still have their own backdrop; they are listed below for you to decide on.

## Changed files
- `src/lib/overlay-classes.ts` (new) — the single backdrop class (black 72%, 8px blur).
- `src/components/ui/dialog.tsx` — now uses the shared class.
- `PrintingPicker`, `OracleChat`, `CardLocator`, `SmartSearch`, `MobileHeader`, `brew-v2/CommanderDetailModal`, `explore/CommanderBrowser` — their own black/blur classes replaced by the shared one.
- `src/components/manabox-import/ImportModalLayout.test.tsx` — the #10 check now reads the shared class and confirms all eight places use it.

## New decisions made (need owner confirmation)
- Other overlays outside the list still have their own backdrop and were left alone: `app/decks/new/page.tsx` (two), `MobileCardPreview.tsx`, `TopNav.tsx` (the desktop counterpart of MobileHeader's overlay). Say if they should follow.
- Where an overlay was lighter (e.g. 50%) or already blurred, it is now the standard 72% / 8px. The blur only applies where the browser supports it.

## Assumptions
- None beyond the above.

## Challenges to locked decisions
- none

## Open questions
- Should the four leftover overlays above join the shared backdrop?

## Verification
- `npx tsc --noEmit` — clean.
- `npx vitest run` — all passed after updating the #10 check (previously 1 failure, since it looked for the class text in dialog.tsx).
- `npx eslint src` — 0 errors, 251 warnings (unchanged).
- Not checked visually in a browser.

## Update: "everywhere" (branch `build/overlay-backdrop-everywhere-2026-11-04`)
Owner asked for the shared backdrop on every overlay. Now also using it:
- `app/decks/new/page.tsx` (two overlays), `MobileCardPreview`, `TopNav` (menu backdrop).
- Found by grep: `OracleSidebar` (mobile backdrop, and the "new chat" confirmation scrim) and `collection/CollectionRollupTab` (mobile full-screen detail scrim).
- Deliberately NOT changed (not modal backdrops): hover/selected overlays on tiles (`ConceptTile`, `DraftDeckTile`, `DraftSessionTile`, `BrewCanvas`), `SessionHistoryPanel` (a panel background), sticky headers/toolbars with their own light blur (`decks/new` header, `CanvasToolbar`, `OracleSidebar` panel), small code-chip backgrounds.
- The layout test now also checks `MobileCardPreview`, `TopNav`, `OracleSidebar` and `CollectionRollupTab`.
- Verification: `tsc` clean; `vitest` 219 files passed, 0 failed; `eslint` 0 errors, 251 warnings (unchanged). Not checked in a browser.
