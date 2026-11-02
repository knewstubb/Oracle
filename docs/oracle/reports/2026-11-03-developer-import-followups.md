# Report: import-followups
Role: developer
Status: DONE

Task as received: Two small tasks. TASK A — prove the proxy import default works on the owner's real sample (tests/fixtures/rocco.csv, 6 proxies) through parse -> preview -> save with 'I bought it'; fix and tell if any proxy does not come out as Proxy; no re-import into the real DB. TASK B — after import, show "No commander yet. Open a card's menu and choose 'Add as commander'." on the deck page only when no commander exists, gone instantly after the optimistic add; Commander-style decks only if determinable; component tests; make ?pickCommander=true harmless. Worktree ../oracle_app-import-followups on branch import-followups; do not merge; no writes to the live database.

## Summary for the owner
Task A: your Rocco file imports correctly. With "I bought it", all 6 cards marked Proxy in the file (Windswept Heath, Wild Growth, Delighted Halfling, Elvish Mystic, Eternal Witness, Wooded Foothills) come out as Proxy and the other 94 as Original, so no fix was needed. Note that the three proxies in your saved deck (Molten Gatekeeper, Llanowar Elves, Witty Roastmaster) are marked as NOT proxy in this file, so the saved deck was not made from this exact file as it is now; re-importing it should give the six above.
Task B: a deck with no commander now always shows a short note in the Commander area: "No commander yet. Open a card's menu and choose 'Add as commander'." It disappears the moment you add a commander. It only appears on Commander-style decks.

## Changed files
- src/components/CommandZoneSlots.tsx — the existing "No commander yet" hint now shows whenever there is no commander (it used to appear only if some card was already known to be a legal commander), with the requested wording; removed an unused variable.
- src/components/CommandZoneNote.test.tsx — new: note shown with no commander (also when no legal commander is known), hidden with a commander set (flagged card or name only), hidden straight after the optimistic "Add as commander".
- src/lib/import-rocco-proxies.test.ts — new: rocco.csv through the real parse, preview and save code (only the database faked), asserting the 6 proxies saved as Proxy, 94 Original, all "added and sleeved".

## New decisions made (need owner confirmation)
- none

## Assumptions
- "Commander-style" is determined by the existing showCommandZone setting that already gates the Commander section; the note rides on it, so non-Commander decks never show it. [Confirmed: src/components/CardsTab.tsx]
- The note lives in the existing "Commander" heading block that appears when the list has no commander card, which is exactly the no-commander case. [Confirmed: src/components/CardsTab.tsx standaloneSlots]
- ?pickCommander=true is already ignored: nothing in the app reads it. [Confirmed: grep of src found only the three places that append it to the URL]. I left those three appends in place (harmless); removing them is a trivial follow-up.
- Task A test fakes the database and the card lookup (built from the file itself); it does not exercise the SQL function.

## Challenges to locked decisions
- none (D-055 behaves as designed on this file)

## Open questions
- Remove the now-dead ?pickCommander=true URL appends in DeckImportButton and ManaBoxDeckImportFlow?

## Verification
- npx vitest run (CommandZoneNote, CommandZoneSlots, CommanderCardActions, import-rocco-proxies) — 4 files, 34 tests passed
- npx tsc --noEmit — clean
- npx eslint on the three touched files — clean
- Live database: not touched at all (no reads or writes).
- Outside the edit/create tools: an accidental empty shell heredoc (wrote nothing) and a symlink of node_modules into the worktree so tests could run (not committed); git worktree add and git commit via shell.
