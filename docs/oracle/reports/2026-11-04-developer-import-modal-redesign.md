# Report: import-modal-redesign
Role: Developer
Status: DONE (built and tested locally with mocks; not merged; saving cards from other decks is still switched off)
Task as received: Build the approved import modal redesign (spec `docs/oracle/specs/import-modal-redesign.md`, authoritative; brief `use-what-i-own.md` §9/§10; mockup; Architect scan-wins audit). New worktree/branch off main. Final decisions: moving cards between decks on import is approved (scan wins); spare copy preselected; a single possible source auto-selected, owner picks only when several decks hold the card; sources can be un-set ("Choose source"); Import blocked until every copy has a source; duplicate deck name warns only; ignore-basic-lands (5 basics + Wastes) means basics are not pulled from other decks and the deck gets ordinary basics; import-as defaults apply to new copies only; language on Unowned held back; no purple icon, no top banner; global primary-button dark text; modal height as % of screen above a min breakpoint; darker blur on all dialogs; no undo. Two sliced commits (layout/UI, then planner + save path incl. exact-finish handling and result listing). No migration applied to hosted DB, no writes to live data, local/mocked tests only, report migration and `NEXT_PUBLIC_IMPORT_INTENT_SAVE` state precisely. tsc, vitest, eslint run separately. Report and stop; do not merge.

Branch: `build/import-modal-redesign-2026-11-04` (worktree `../oracle_app-import-build`), from main 25abb3f.
Commits: `37350e4` slice 1 (layout/UI), `a88c362` slice 2 (planner + save path).

## Summary for the owner
The import window now has the new layout: name and format on one line, the commander row below it, an "Ignore basic lands" switch, a warning if you already have a deck with that name, a taller window, a darker blur behind every dialog, and dark text on green buttons. Cards from your collection now pick their own source: a spare copy first, the one deck that holds it if there is only one, or a "Choose source" menu when several decks hold it. Import stays off until every copy has a source, and the result screen lists spare copies used, cards taken from other decks (and how short those decks now are) and new copies added.
**Saving is still switched off in the app.** The save path is built and tested only with pretend data. The database changes it needs have not been applied by me and I could not confirm whether they were applied earlier, so nothing real has been tested. Please decide when the Architect should check the database and when to turn saving on.

## Changed files
Slice 1 (37350e4)
- `src/components/ui/dialog.tsx` — shared overlay darker (72% black) with 8px blur on every dialog.
- `src/components/manabox-import/ImportDiscardDialog.tsx` — dropped its own overlay override.
- `src/components/manabox-import/import-labels.ts` — modal height: full height minus 4rem; 90% of screen height from 1000px tall.
- `src/app/globals.css` — primary-button text colour is dark (`--primary-foreground` `#08150F`, app is dark-only).
- `src/components/manabox-import/DeckImportOptions.tsx` — Name + Format row; commander row below; duplicate-name note under Name.
- `src/components/manabox-import/ImportDefaultsBar.tsx` — "Ignore basic lands" switch with count; "Applies to new copies only".
- `src/components/manabox-import/use-slot-applies.ts` (new) — shows Partner/Background/Companion slot only when it applies.
- `src/components/manabox-import/ManaBoxDeckImportFlow.tsx`, `types.ts`, `import-copy.ts`, `src/lib/basic-lands.ts` (`isIgnorableBasic`), `ImportRowEditor.tsx` (collection copies hide finish/condition/language).
- Tests: `ImportModalLayout.test.tsx` (new), `ImportRound10`, `DeckImportButton`, `ManaBoxCollectionImportDialog`, `ManaBoxDeckImportFlow` updated.

Slice 2 (a88c362)
- `src/lib/import-intent.ts` — planner: two-pass source allocation (explicit picks first, then spare → only holder deck → unset), plan kind `move` (with deck name and exact finish), `share` kind removed, ignored basics never pulled and default to New, type read-only under Collection, `withResolvedPicks`, summary/breakdown wording.
- `src/lib/import-intent-save.ts` — `unconfirmedMoveRowKeys` (server refuses a move the owner was not shown), exact finish put on the save row, `share`/`SharedCopyError` removed, pick validation, result lists (`usedSpare`, `taken`, `newCopies`).
- `src/lib/manabox-deck-import.ts`, `src/app/api/decks/import/route.ts` — pass `ignoreBasics` (absent = on), enforce confirmed moves, drop the shared-copy refusal.
- `src/components/manabox-import/ImportRowEditor.tsx` — per-copy Source menu ("Choose source" / "Spare copy (not in a deck)" / "Take from {deck}"), amber "Needs a source" pill, Type read-only for collection copies.
- `src/components/manabox-import/ManaBoxDeckImportFlow.tsx`, `import-copy.ts` — footer "N cards need a source." (polite live region), Import blocked until none, resolved picks and `ignoreBasics` sent on save, result lists in `intentNotes`.
- `docs/oracle/contracts/import-intent.types.ts` — additive: `SourcePick`, `pick`, `finish`, `fromDeckName`, result list fields; `share` kind removed. **Architect to confirm.**
- Tests: planner (auto-select, spare wins, several decks unset, un-set, explicit-before-auto, unmet pick short, exact finish, keep Original/Proxy, ignore-basics incl. Snow-Covered/Wastes), save path (exact finish, confirmed moves, result lists), UI (Source menu, pill, footer, save body), result notes.

## New decisions made (need owner confirmation)
- Modal height breakpoint: full height minus 4rem below 1000px screen height, 90% above it. The 1000px figure is my choice; spec gave none.
- Ignored basics (switch on): default source New for built decks, still "not in deck" for planned decks; the switch count covers generic and specific basic-land lines (the 5 basics + Wastes only; Snow-Covered excluded).
- Slot hooks (Partner/Background/Companion) hide the slot if the eligibility lookup fails, rather than showing everything.
- A copy pulled from the collection keeps its own Original/Proxy; the Type column is read-only for it. The preferred finish is the file's (or the owner's edit); a different finish is only used if that exact one is not available, and the finish actually used is what is saved.
- "Short" for a source deck means its slot becomes "not in deck"; result screen wording is "Taken from {deck}: … {deck} is now short N."
- The client writes the visible pick for every collection copy into the save request; the server only performs a move that matches an explicit deck pick, otherwise it refuses with "needs a source" (400). No move is ever silent.
- Contract additions listed above (Architect to confirm).
- Hand-rolled overlays were NOT changed (PrintingPicker, OracleChat, CardLocator, SmartSearch, CommanderBrowser, CommanderDetailModal, MobileHeader have their own backdrops). "All dialogs" was applied to the shared Dialog. Say if those should match.

## Assumptions
- The app is dark-only, so a global dark primary-button text is safe.
- "Several decks hold the card" means several distinct decks; two copies in one deck is a single source.
- Language on Unowned was held back as instructed; nothing built.

## Challenges to locked decisions
- D-020 / D-047 — spec now has collection copies keep their own type and finish, and moves between decks are allowed; these earlier decisions (type chosen per copy, never move) are superseded in practice. Gene to reconcile at close-out.
- D-023 / D-032 / D-048 — scope of "basic lands" differs between decisions; I used 5 basics + Wastes. Gene to reconcile.
- Exact finish — the database function (migration `20261023160000`) treats finish as a preference only, not a filter. I send the exact finish of the copy the review chose, so it matches whenever that copy is still there. If the exact-finish copy vanishes between review and save (race), the database may take another finish. Fixing this needs a migration (Architect's lane), so I did not touch it.

## Open questions
- **Migration state is unverified and untouched.** `docs/oracle/status.md` says import migrations `20261020120000`–`20261023170200` are NOT applied to the hosted database; the older contract `import-intent.md` §7 says the intent migration was applied. I applied nothing and wrote nothing to live data. The Architect should confirm against the hosted database before turning saving on.
- **`NEXT_PUBLIC_IMPORT_INTENT_SAVE`:** read as on only when exactly `true`; not set in `vercel.json` or any env file in the repo, so it is OFF by default (built/planned decks stay "coming soon"). I did not change it. The new flow is only reachable end-to-end with it on and migration state confirmed.
- Save path tested only with mocked database/RPC and mocked ownership; there is no test account. The real RPC, moves and donor-deck updates have not been exercised.
- No undo (as decided): a wrong move has to be fixed by hand.
- Should the hand-rolled overlays get the darker blur too?

## Verification
- `npx tsc --noEmit` — clean (0 errors).
- `npx vitest run` — 219 files passed, 5 skipped; 2537 tests passed, 42 skipped, 0 failed.
- `npx eslint src` — 0 errors, 251 warnings (all pre-existing kinds, e.g. unused variables elsewhere).
- Not run: any browser/visual check against the mockup, and any hosted-database test.
