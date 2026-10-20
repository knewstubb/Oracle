# Report: import-row-editing tester check
Role: Tester
Status: PARTIAL
Task as received: "Test the per-copy import editing feature on branch test-t56-local (repo /Users/bradknewstubb/Developer/Personal/oracle_app; dev server may already be on http://localhost:3000; the owner has click-tested and likes it). Do not change app code; report defects. Read: docs/oracle/contracts/import-row-editing.md (+ .types.ts), docs/oracle/specs/import-row-editing.md, docs/oracle/specs/import-stage-screens.md, the architect, designer and developer reports dated 2026-10-20 (developer report has Rounds 1-5), and docs/oracle/decisions.md. Scope: (a) collection CSV import (ManaBox) and deck/text import: upload, processing, review list, per-copy edit (Original/Proxy/Unsleeved, language, finish, condition), file-value dots, defaults bar, bulk bar, "Mixed", apply-to-all, import progress, result screen counts, toast, fixed modal size, outside-click and Escape guards, discard confirm. (b) Rules: finish options only those Scryfall lists for the printing; single finish hides control; unlisted file finish kept and marked; defaults bar Foil on non-foil-only card stays non-foil with notice; bulk finish "Applies to N of M copies"; proxies hide finish and condition but foil proxy remembers finish; Unsleeved shows finish only; language lookup route /api/printing-languages (loading, single language hidden, failure fallback, auth required); unrecognised condition/language fallback notice; row stays together on language edit. (c) Counts consistency: header "71 cards (81 copies)", footer, button, result, toast. (d) Data correctness: what is actually written to user_cards/user_copies for mixed copies (finish, condition, language, is_proxy), proxies stored with condition none and finish remembered, no duplicate imports on re-run, deck import slot data. (e) Contract test 15 (deck read-back) is unwritten: write it only if safe and non-destructive against a test setup; otherwise flag. Use sample files in the repo (e.g. Strixhaven CSV samples) and run npm run check. Be careful with real data: prefer a test user or dry-run; do not run destructive DB operations. Write the report to docs/oracle/reports/ in the standard format with defects ranked by severity, reproduction steps in plain language, and a clear pass/fail table."

## Summary for the owner
Collection import works well and the editing rules behave as designed, but I found two serious problems. First, "Cancel import" (and closing the window during an import) does not actually stop the import: your cards are still added, and the screen then lets you add them again. Second, in the **Import Deck → File** window (the screen deck and text imports really use), a long list makes the window taller than the screen, so the Import button cannot be reached, and it can be closed by clicking outside or pressing Escape with no warning. Nothing was added to your real collection during testing; the deck write has never been run against your database, so it is still unproven.

## How I tested (and what I avoided)
- The dev server on :3000 uses your **real hosted database** and signs in automatically as you. So I **never pressed Add/Import for real**. I ran previews (they write nothing), sent deliberately invalid import requests (they are refused before anything is written), and in the browser I replaced the import server reply with a fake one to see the progress, result and toast screens. Read-only database queries only.
- Samples used: `Strix draft.csv`, `manabox-scan-2026-06-05.csv`, `manabox-scan-2026-10-13.csv`, `Strixhaven.txt`, `Armageddon.txt`, plus my own edge-case CSV (mixed conditions, a Japanese copy, a bad condition, a bad language, foil on a card with no foil, etched on a card without etched) and two tiny text decks.
- Browser: headless Chromium driven by scripts kept in `/tmp` (not in the repo). Git tree is unchanged by me.

## Results: pass / fail

| # | Area | Result | Note |
|---|---|---|---|
| 1 | `npm run check` | **PASS** | Run as separate steps (see "Check results"). |
| 2 | Upload screen: wrong file type, empty file, unreadable file messages | PASS | Exact copy from the stage spec. |
| 3 | Escape on upload closes; Cancel with no edits closes | PASS | |
| 4 | Outside click does not close (collection) | PASS | |
| 5 | Outside click does not close (deck/text, real entry) | **FAIL** | Defect D2. |
| 6 | Escape/outside ignored while importing (collection) | PASS | Browser-tested with a faked server. |
| 7 | Escape/outside ignored while importing (deck/text) | **FAIL** | Defect D2. |
| 8 | Discard confirm on edits (collection) | PASS | Shown for Cancel, X and Escape. It is the browser's plain confirm box, not an app-styled one (note N2). |
| 9 | Discard confirm on edits (deck/text) | **FAIL** | Closes silently. D2. |
| 10 | Fixed modal size, collection | PASS | Identical box (768 × 736) on upload, review, importing, result. |
| 11 | Fixed modal size, deck/text | **FAIL** | Upload 516 px tall, review 581 px; and see D2 for long lists. |
| 12 | Processing screen | PASS (not seen live) | "Reading your file…" is in the code and unit tests; preview was too fast to catch. |
| 13 | Review list, defaults bar, Change/Done | PASS | |
| 14 | Per-copy edit: Original/Proxy, language, finish, condition | PASS | Edited copy 2's condition; its dot cleared and others kept theirs. |
| 15 | File-value dots; clear on edit; names end "(from your file)" | PASS | |
| 16 | Defaults bar never shows a dot | PASS | |
| 17 | Apply to all (copy 1 only, 2+ copies) | PASS | |
| 18 | Bulk bar and "Mixed" | PASS | Collection and deck. |
| 19 | Finish options limited to what Scryfall lists | PASS | A normal card offered Non-foil/Foil; the non-foil-only card offered Non-foil only. |
| 20 | Single finish hides the control | PASS | Hall of Heliod's Generosity (non-foil only) shows no finish choice when its file value is Non-foil. |
| 21 | File finish Scryfall doesn't list: kept and marked | PASS | Shown as "Foil — not listed by Scryfall" plus an amber note, plus one counted notice and a result-screen line. |
| 22 | Defaults bar Foil on a non-foil-only card | PASS | Stays non-foil; notice "1 card doesn't come in your default finish, so its own finish will be used." (text import). |
| 23 | Bulk finish "Applies to N of M copies" | PASS with note | Shows "Applies to 2 of 3 copies in 3 rows." It does not say why (no "1 card doesn't come in foil" part the contract described). N1. |
| 24 | Proxy hides finish and condition, keeps language | PASS | |
| 25 | Foil proxy remembers its finish | PASS by code | Writes `finish` as foil and condition as none (see 34). No foil proxy exists in your data yet to confirm in the database. |
| 26 | Unsleeved shows Finish only (deck) | PASS | Language and condition hidden. |
| 27 | Unsleeved not offered on collection import | PASS | |
| 28 | `/api/printing-languages`: loading, single language hidden, failure fallback | PASS | "Loading…" shown disabled for ~2.5 s with a slowed reply; one language hides the control; a failed lookup falls back to the file's languages. |
| 29 | `/api/printing-languages`: bad input | PASS | Missing set or number → 400. A made-up set → empty list. A search-injection attempt in the number is quoted away. |
| 30 | `/api/printing-languages`: sign-in required | PASS by code only | The dev server signs in automatically, so I could not make a signed-out request. No route test exists for it (N3). |
| 31 | Unrecognised condition/language fallback notice | PASS | `mint` condition and `xx-yy` language → "2 values in your file were not recognised, so your defaults were used." |
| 32 | Row stays together on language edit | PASS | Changed copy 2 to Japanese; no row split or move. |
| 33 | Counts consistent (header, footer, button, result, toast) | PASS | Test file: header "7 cards (9 copies)", footer "9 copies · 4 foil", button "Add 9 copies", result "9 copies added", toast "Added 9 copies to your collection". See N4 for the deck wording. |
| 34 | Written data, collection (finish, condition, language, is_proxy) | PASS by code + existing data | See "Data correctness". Not run live. |
| 35 | Server refuses bad requests and writes nothing | PASS | 7 invalid requests all → 400 with a plain reason (bad finish, bad language, bad defaults, copy number past the count, unknown row, Unsleeved on a collection import, bad condition). |
| 36 | No duplicate imports on re-run | **FAIL (by a different route)** | Re-running adds again by design (D-050). But Cancel import also leaves the import running, so a duplicate can happen by accident. D1. |
| 37 | Deck import slot data | NOT PROVEN | Code and database function read and look right; never run against your database. See "Data correctness" and test 15. |
| 38 | Import progress (collection) | PASS with note | Bar and "0 of 9 copies" shown. The faked server sent everything at once, so I did not see it advance. |
| 39 | Result screen and toast (collection) | PASS | Breakdown, foil line, three "Needs a look" notices, Close / View collection. |
| 40 | Contract test 15 (deck read-back) | **NOT WRITTEN: flagged** | See below. |

## Defects, worst first

### D1 — HIGH: "Cancel import" does not cancel, and it invites a duplicate import
**What you'd see:** During "Adding to your collection…", click **Cancel import** (or the X). The screen goes back to the review list as if nothing was added. The cards are still added a moment later. If you then click **Add** again, you get them twice.
**Why:** The cancel only stops the browser listening. The server carries on and writes regardless [Confirmed: `src/lib/manabox-collection-import.ts` has no stop check; `src/components/manabox-import/ManaBoxCollectionImportDialog.tsx` `handleCancel` only aborts the request]. The long part is the card lookup, so a cancel there is the common case.
**Reproduce (plain words):** Open Collection → Import CSV → choose any ManaBox file → Add. While the bar is moving, click Cancel import. Wait a few seconds and look at the collection: the cards are in. Not run live by me, because it would add real cards; confirmed by reading the code and by the faked-server run showing the dialog returns to review.
**Suggested direction (Gene/Architect to decide):** either remove Cancel during the save, or make the server stop before it writes when the browser has gone, and say "Cancelled, nothing was added" only when that is true. Same for the X while importing.

### D2 — HIGH: the Import Deck → File window (the real deck/text import screen) lost its size limit and all its guards
This is the window you reach from **Import Deck** on the home page. The separate "ManaBoxDeckImportDialog" that Rounds 2 and 4 fixed is not used by any screen [Confirmed: grep, only tests import it], so those fixes never reach it.
- **Long lists cannot be imported by mouse.** With `Strixhaven.txt` (87 cards) the window grows to about 3,560 px tall, centred on the page, so the title, defaults bar and the **Cancel / Import** buttons (about 1,250 px below the screen edge) are off-screen and the window does not scroll. Cause: Round 4 removed the old height limit from the list, and this window never got the new fixed size [Confirmed: commit `c19f571`, `ImportCardList.tsx`]. **Regression from the click-tested version.** Short files (3 cards) are fine.
- **Clicking outside closes it** with edits made and even while "Creating your deck…" is showing; the deck is still created in the background.
- **Escape closes it silently** with edits made. No "Close the import?" question.
- Size changes between stages (516 px tall on upload, 581 px on review for a tiny file).
**Reproduce:** Home → Import Deck → File → choose `docs/oracle/samples/manabox/Strixhaven.txt`. The list fills far past the screen. Separately, with a 3-line text file: change the defaults, then click outside the window.

### D3 — MEDIUM: language-lookup failures are remembered for a day
When Scryfall is briefly down or rate-limiting, the route answers "no data" and tells the browser to keep that answer for 24 hours [Confirmed: `src/app/api/printing-languages/route.ts`, the cache header is set whatever `languages` is]. Until then, that printing's Language control falls back to the file's languages (often one language, so the control is hidden), even after Scryfall recovers. Suggest: only cache successful answers.

### D4 — LOW: generic basic lands get a "non-foil" request stored
In a deck import, a basic land turned into a generic slot is written with finish non-foil, so the slot records a requested finish of non-foil [Confirmed: `src/lib/manabox-deck-import.ts` generic-basic branch + migration `20261020120000`, which stores `requested_finish` for every row]. The contract (§6) says generic basics carry no attributes. Likely harmless but not what was specified.

### D5 — LOW (existing behaviour, worth noting): deck id can collide
The new deck's id is a time-plus-random number, written with "upsert" [Confirmed: `generateDeckId`, `decks.upsert onConflict id`]. A collision with an existing deck would overwrite it, and the write then clears that deck's cards. Very unlikely, but it is the only place an import could touch an existing deck.

## Notes (not defects)
- N1: Bulk finish note is shorter than the contract's wording (no "N cards don't come in foil" reason).
- N2: The discard confirm is the browser's plain confirm box. Fine, but it does not match the rest of the app.
- N3: `/api/printing-languages` has no route test, so "sign-in required" is unproven by any test.
- N4: Header says "7 cards (9 copies)" while the deck footer says "4 cards · …" for the same 3-card/4-copy file. The word "cards" means rows in one and copies in the other. Collection footer says "copies" and is consistent. Also "cards" in the header counts rows, so one card in two languages counts as two (follows D-051).
- N5: Deck preview of `Strix draft.csv` took over a minute on the first call; text decks were quick. Worth a look if it repeats.
- N6: A red "1 Issue" badge from the Next.js dev tools appeared after my faked-server run. I could not tie it to the app (my fake reply was incomplete); it did not recur on later runs.
- N7: The number "232 printings with no finish list" from the Developer report is confirmed (read-only count).

## Check results (`npm run check`)
- `npm test`: 168 files passed, 4 skipped; **1,845 tests passed**, 40 skipped. (One earlier run appeared to hang with no output while another test process from an hour earlier was still open; a clean rerun passed in 15 s.)
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors, 266 warnings (same as the Developer's report).
- No unit test covers the problems above: the tests use the unused deck dialog (D2) and never check that a cancelled import stops (D1).

## Data correctness (d)
- **Read from code** [Confirmed: `src/lib/import-copies.ts` `resolveCopy`, `toCollectionRpcRow`, `toDeckRpcRow`]: each copy becomes one `user_copies` row with its own finish, language and `is_proxy`. A proxy stores condition **none** and keeps its finish. Purchase price and date come from the copy's own file line. `user_cards` gets one row per card. Server re-reads the file itself and recomputes the allowed finishes, so a forged request is refused.
- **Read from your database (read-only, 272 existing ManaBox copies):** 249 non-foil near mint English; 1 foil heavily-played original; Japanese and Russian originals; proxies in English, German and Portuguese with condition none. So mixed finish, condition and language are being stored correctly. Five older proxies still say near mint (from before this change). No foil proxy exists yet, so "foil proxy remembers" is proven by code only.
- **Deck import:** your database has **no ManaBox decks and no copies tagged "deck-import"**, so the new deck write has never run for real. The migration is applied (`supabase migration list` shows both new files on local and remote) and I read the function body: it stores finish, language, condition (none for proxies) and the slot's requested finish; Unsleeved creates a slot with no copy and no link to your existing copies. All matches the contract. It is unproven in practice.
- **Re-run:** importing the same file again adds the cards again (D-050). Not a bug by itself; see D1 for the accidental route.

## Test 15 (deck read-back): not written
Not safe to write now. The only database available is your live one (no local database, no Docker), and the deck write creates a deck, creates copies and clears the new deck's slots; a test would add real rows to your account, and cleaning them up needs deletes, which need your approval (AGENTS rule 5). Recommended: an opt-in test that is skipped unless a separate test account and test project are configured, which imports a three-card deck (one Original foil, one Proxy foil, one Unsleeved) and reads back finish, language, condition, `is_proxy` and the slot's requested finish. Needs the owner to say whether a test account may be created.

## Changed files
- `docs/oracle/reports/2026-10-20-tester-import-row-editing.md` — this report. No app code changed. Temporary scripts and sample files were left in `/tmp` only.

## New decisions made (need owner confirmation)
- None.

## Assumptions
- "Fixed modal size" for deck/text means the window you reach from Import Deck → File, since that is the only deck import screen in use. [Confirmed: grep]
- "71 cards (81 copies)" was from a file I do not have; I checked the same rules on my own file instead.

## Challenges to locked decisions
- None. D-003 (printing vs card identity), D-012 (colour plus label: Proxy/Foil/Unsleeved shown with text and icons) and D-050 (add-only re-run) are respected.

## Open questions
1. Should Cancel import exist at all during the save (D1), or should it truly stop the import?
2. Should the deck/text import window be brought up to the same size and guards as the collection one (D2), or should the unused deck dialog be used instead?
3. May a separate test account be created so test 15 can be written safely?
