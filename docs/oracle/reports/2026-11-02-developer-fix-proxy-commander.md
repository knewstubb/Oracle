# Report: fix-proxy-commander
Role: Developer
Status: PARTIAL (Bug 1 and Bug 2b/2c fixed; Bug 2a not reproduced, see below; one follow-up needs an owner/Architect decision)
Task as received: Two owner-reported bugs after a real import of rocco.csv (100-card ManaBox CSV, commander 'Rocco, Cabaretti Caterer', 6 Proxy=true rows). BUG 1: with 'I bought it' every card came in as Original although D-055 says the file's Proxy column sets the default; fix effectiveCopyState, preview/summary and save agree, tests incl. rocco.csv. BUG 2: (a) why the commander picker did not appear/open at import, (b) why choosing a commander from the deck view does not save, (c) whether the colour legality issues are only "no commander" or a separate bug. Worktree `../oracle_app-fix-pc`, branch `fix-proxy-commander`, no merge, no migration/data change/new screen/locked-decision change.

## Summary for the owner
**Proxies:** a card your file marks as a proxy now starts as a Proxy when you import with "I bought it" (and "I built it"), and the summary under the list counts them (rocco.csv: "6 proxies"). You can still change any card yourself. With "I'm planning it" cards still start as not-sleeved; a flagged proxy becomes a Proxy only once you tick Add.
**Commander:** choosing a commander on the deck page *was* being saved (your Rocco deck has it), but the page never refreshed, so it looked like nothing happened until a reload. That is fixed. The colour warnings were a separate problem: imported decks never had a colour identity stored, so every coloured card was flagged even after a commander was chosen. Choosing a commander now fills it in. Your existing Rocco deck still has a blank colour identity; re-choosing the commander once (after this is deployed) fixes it.
**Not found:** I could not find a fault in the "picker opens after import" step itself; it needs a live look (see Challenges/untested). Decision for you: the older flow only records the commander's name; the newer partner/companion path also marks the card itself as commander (see New decisions).

## Changed files
- src/lib/import-intent.ts — `effectiveCopyState`: owner edit, then the file's Proxy flag, then the intent start type. Planned stays Unsleeved unless Add is ticked. Plans, summary, review rows and the save all read this one function, so preview = save. [Confirmed: src/lib/import-intent.ts]
- src/lib/import-intent.test.ts — new tests (purchased/built/planned, owner override, rocco.csv = 100 copies, 6 proxies, "(6 proxies)" in the summary text).
- tests/fixtures/rocco.csv — the owner's file, as a fixture (card list only).
- src/lib/import-intent-save.test.ts — save-path test: RPC rows carry `is_proxy` true for the file-proxy copy, false when the owner overrides.
- src/components/manabox-import/CommanderPicker.tsx — after saving, refreshes the deck with the same key the page reads (`deckKeys.detail`, numeric id) and also the legality banner.
- src/components/CommandZoneSlots.tsx — same wrong key fixed for second commander/companion saves.
- src/lib/deck-colour-identity.ts (+ .test.ts) — pure helper plus lookup: "G, R, W" → stored "WRG".
- src/app/api/decks/[id]/route.ts — PATCH with a commander name now also writes `colour_identity`.
- src/app/api/decks/[id]/command-zone/route.ts — after the RPC succeeds, best-effort write of `colour_identity` from commander + second commander (no migration needed).
- src/app/api/decks/[id]/route.patch-commander.test.ts, src/components/manabox-import/CommanderPicker.refresh.test.tsx — new tests (mocks only).

## Findings
**Bug 1 root cause.** `effectiveCopyState` ignored `copy.file.proxy`. The parser does set it (`manabox-import.ts` sets `file.proxy`; rocco.csv has 6 true cells) and `resolveCopy` honours it, but the intent plan overrides the type with the intent start type, and the plan decides what is saved. [Confirmed: src/lib/import-intent.ts, src/lib/manabox-import.ts:595, src/lib/import-copies.ts:265, src/lib/import-intent-save.ts planToIntentRpcRow]. The client sends `file` values with each copy and the server re-plans with the same function, so no other gap in the save path or review UI. [Confirmed: src/components/manabox-import/types.ts buildCommitDeck, src/lib/manabox-deck-import.ts]. Behaviour note: under "built" a file-proxy copy is matched against your free *proxy* copies; if you own none it shows Unowned (same as the owner picking Proxy by hand). Untick/choose Original to change.

**Bug 2b root cause.** The picker saves via PATCH (works; live read-only check: deck 1587385967 has commander_name = Rocco, Cabaretti Caterer) but then invalidated `['decks', String(deckId)]` while the page reads `['decks', <number>]`. TanStack treats "7" and 7 as different keys, so nothing refreshed (page cache lasts 5 min). Known as TD-016. [Confirmed: src/components/manabox-import/CommanderPicker.tsx, src/hooks/useDeckQueryKeys.ts, src/app/decks/[id]/page.tsx:117]. Same mistake exists in BuildSelector.tsx:95, CardGrid.tsx:86 and PicklistV2.tsx:241 (not touched, outside this task).

**Bug 2c.** Both. (1) With no commander the identity is unknown. (2) Separate bug: ManaBox imports store `colour_identity = ''` (`manabox-deck-import.ts` inserts `options.deck.colourIdentity`, empty for ManaBox), nothing ever filled it in when a commander was chosen, and the legality check reads that column. Live read-only: all three ManaBox decks have `colour_identity ''`. [Confirmed: src/lib/manabox-deck-import.ts:299, src/app/api/decks/[id]/legality/route.ts:57, src/lib/deck-legality.ts]. Also the legality banner is cached 5 min and was never refreshed after a commander change; now it is.

**Bug 2a.** Not reproduced in code. The review screen has a Commander dropdown (shows "No commander" when the file marks none; it does not open by itself), and "Open deck" sends the owner to the deck with `pickCommander=true`; the page opens the picker on arrival. A component test shows the picker does open and list Rocco when `openOnMount` is set. [Confirmed: src/components/manabox-import/ManaBoxDeckImportFlow.tsx:500, DeckImportButton.tsx:645, src/app/decks/[id]/page.tsx:273]. Not live: the result screen's "Close" button does not open the deck (so no picker), and the picker opening while the import dialog is closing could lose focus and close at once. I could not test either in a browser. Rocco's commander did end up saved, so the picker was reachable. The `commander_id`/`is_commander` row flag is not set by this picker (see below).

## Verification
- `npm run check`: tests, typecheck and lint pass (0 errors; existing warnings only).
- Everything above is unit/component tests with mocks. Read-only checks against the hosted database: ref_cards (Rocco can_be_commander true), decks, deck_cards. **Untested live:** the import dialog, the picker opening after import, the PATCH writing `colour_identity`, the command-zone route's colour write (its mock test only proves it does not break the route).

## New decisions made (need owner confirmation)
- The deck's colour identity is now filled when a commander is chosen after import. Partner/background pairs are combined only through the command-zone route; PATCH uses the single commander.

## Assumptions
- `decks.colour_identity` is stored as concatenated WUBRG letters ("WBR", per the live fixture deck).

## Challenges to locked decisions
- none. Follow-ups (not done, need Architect/owner): (1) the deck-page picker only writes the commander's name via PATCH; the partner/companion path (`set_deck_command_zone`) also marks the card row. A single path would be cleaner, and writing colour identity inside that database function would need a migration. (2) Existing decks with blank colour identity need either a one-off data update or re-choosing the commander. (3) The three other string-id cache-key sites above.
