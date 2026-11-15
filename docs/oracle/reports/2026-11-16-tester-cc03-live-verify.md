# Report: cc03-live-verify
Role: Tester
Status: PARTIAL
Task as received: Verify the real app still works against the locked-down live Supabase DB (build, Playwright smoke, click-through of collection, deck, status change, import preview, chat add + Undo; watch console/server log; counts decks 9, deck_cards 795, user_cards 2650, user_copies 4259; do not delete or wipe anything).

## Summary for the owner
The running app works normally against the locked-down database: the collection, decks, the status switch, import preview and chat add with Undo all behaved correctly, and your data is byte-for-byte the same afterwards. Two things did not pass: the production build stops on an unrelated type error in a documentation file, and the packaged Playwright smoke tests cannot be run against a local app by design. Neither is caused by the lockdown.

## Results
| # | Step | Result | Evidence |
|---|---|---|---|
| 1a | `npm run build` | FAIL (not lockdown related) | Compiles, then type check fails: `docs/oracle/contracts/card-state-actions.examples.ts:9` imports `./card-state-actions.types.ts` ("import path can only end with .ts when allowImportingTsExtensions is enabled"). File is untouched in git; a docs example is being picked up by the app type check. Also a warning about `next.config.ts` tracing via `src/lib/card-data-sync.ts`. |
| 1b | Playwright smoke | NOT RUN | `playwright.config.ts` rejects localhost and requires an HTTPS non-production deployment plus a fixture login (`E2E_BASE_URL`, shared-readonly auth). None available; running the mutating suite against the live DB is forbidden by `tests/e2e/README.md`. Replaced by the manual browser click-through below (same Playwright library, own scripts in /tmp). |
| 2a | Collection page | PASS | `/collection` shows "2,650 owned", 4,247 cards, value $466.45, card rows (e.g. A.I.M. Scientists, Abrade Owned: 7). No 4xx/5xx, no console errors. |
| 2b | Deck list and open a deck | PASS | `/` lists 8 decks (the 9th belongs to another account, as Gene noted). "Tymna and Tana" opens with 61 cards grouped by type, prices, legality banner. |
| 2c | Change deck status and back | PASS | Active toggle on Tymna and Tana: Inactive to Active (PATCH `/api/decks/1599593569/active` 200), persisted after reload, toggled back (200), Inactive after reload. DB check: `is_active` false again. |
| 2d | Import preview | PASS (preview only) | Text list of 4 cards: `POST /api/decks/import/preview` 200, `POST /api/decks/import/ownership` 200, review screen "Import planned deck", all four cards show "Owned". Commit routes were blocked in the browser as a safeguard and never called; clicked Cancel. |
| 2e | Chat add a card then Undo | PASS | Asked chat for "Swiftfoot Boots" (a planned slot, no copy moved). `POST /api/oracle/chat` 200, `.../chat-proposals/confirm` 200 ("Added"), `.../chat-proposals/undo` 200 ("Removed again"). |
| 3 | Data unchanged | PASS | Before and after (read-only SQL): decks 9, deck_cards 795, user_cards 2650, user_copies 4259. Row-content fingerprints of user_copies, deck_cards and user_cards identical before and after. |
| 4 | Console and server log | PASS with one note | No permission denied, 401, 403 or empty-data errors in the browser or the dev log. Only 200 responses on every API call. Local auto-login signed in as the owner normally. |

## Note (not a lockdown fault)
- Server log shows `[user-preferences] Error fetching preferences: {}` on each chat message. Cause: the table `user_preferences` does not exist in the live database (checked: relation does not exist). Code falls back to defaults, so chat works. Route: `src/lib/user-preferences.ts` (`getUserPreferences`). Pre-existing, unrelated to row-level security.
- Chat also writes a chat session record each time it is used (new session id seen); this is a side effect outside the four counted tables and was not cleaned up.

## Failures, likely cause
- Build: a `.ts` import extension in a docs example file included by `tsconfig.json`; fix is to exclude `docs/` from type checking or drop the extension. Gene or Developer to decide; I did not edit anything.
- No route showed "anon client where admin is needed" behaviour in the paths I exercised. Paths not exercised: cron routes, card-data refresh, allocation, reconcile, brew, precons, collection import/replace, deck delete (wipe-style, forbidden here). Those remain untested against the lockdown.

## Changed files
- docs/oracle/reports/2026-11-16-tester-cc03-live-verify.md: this report (no product code touched)

## New decisions made (need owner confirmation)
- none

## Assumptions
- A dev server was already running on port 3000 from this working directory (not mine); I used it and left it running. My own attempted start on port 3111 refused to start and exited.
- The existing dev server runs the current branch (import-destination).

## Challenges to locked decisions
- none

## Open questions
- Should `docs/` be excluded from the app type check so the build passes?
- Does the owner want a dedicated HTTPS test deployment so the Playwright smoke suite can run?

## Verification
- `npm run build` — compiled, failed type check (above)
- Playwright scripts (/tmp/pw) against http://localhost:3000 — all steps above, screenshots in /tmp/pw
- Supabase read-only SQL: counts and md5 fingerprints before/after — identical
- `.next/dev/logs/next-development.log` — only the user_preferences error noted above
