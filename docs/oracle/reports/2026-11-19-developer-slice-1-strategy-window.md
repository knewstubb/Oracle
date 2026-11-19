# Report: slice-1-strategy-window
Role: Developer
Status: DONE
Task as received: Build slice 1 of the 2026-11-19 plan (deck Strategy window plus Claude reading it) in the Oracle app. Size: large (new modal, a small stored-data change drafted and rehearsed but not applied, connector read and write changes, tests). Source documents: the slice plan, the deck-page brief, the rail/strategy/tags spec and mockup, the designer report, the architect audit and conflict list, and the owner direction (sections 1 and 3 binding). Owner approvals 2026-11-19: (1) brief and design approved; (2) stored-data change approved in principle (one-line summary, "last changed by" with date, bracket 5), written as a DRAFT with a rollback, rehearsed on a throwaway database with the earlier drafts still passing, NOT applied; (3) bracket names 1 Exhibition, 2 Core, 3 Upgraded, 4 Optimized, 5 cEDH, number primary, name only where space allows; (4) one History per deck is the direction but the unified History screen is slice 2, so "See in History" links to wherever History opens today and the report says what it opens; (5) Claude adds a dated paragraph at the end of the Strategy text and never replaces the owner's text; (6) win condition and budget parked, stored values untouched; (7) CC-26 three-layer tab, jobs, strategy points and Claude-set health targets dropped in principle, nothing built or deleted; (8) nothing may block, filter or refuse suggestions because of bracket; the bracket-exceeded warning uses only what can be counted today and shows nothing until Game Changers are stored (RQ-14). Constraints: the app keeps working before the new fields exist on the live database; Save says so plainly; no migration applied, no hosted write; Picklist, in-app chat entry points, decisions.md and status.md untouched; plain words; accessibility per the spec. Report here with a 5-minute Yedora test. Done check: new tests (window states, connector order deck/strategy/health/cards, add-a-dated-paragraph never replaces, bracket-empty asks), full vitest, typecheck and lint with no new failures, draft and rollback pass the throwaway rehearsal with all earlier drafts still passing.

## Summary for the owner
Every deck page now has a Strategy box above the tabs. Click it to open the Strategy window: target bracket (1 to 5, with your names), a one-line summary, the Strategy text and your playgroup. Claude now reads all of this before the deck's health and card list. When you haven't set a bracket, Claude is told to ask you, not to guess. When Claude writes in your Strategy text, it adds a dated paragraph under yours and never changes your words. The bracket warning is built but stays hidden until Oracle stores the Game Changers list (a later step). Until you apply the stored-data update, the window tells you the one-line summary can't be saved yet, and everything else saves normally.

What to test in 5 minutes on Yedora:
1. Open the Yedora deck. Under the deck header you see a dashed box: "Target bracket: Not set" and "Add a one-line summary of how this deck plays".
2. Click the box. The Strategy window opens with focus on bracket 1. Press the right arrow key to move through 1 to 5, Tab through the fields, then press Escape. It closes and focus goes back to the box.
3. Open it again. Pick 3 Upgraded, type a Strategy and a playgroup, and press Save. The box now shows "Target bracket 3 · Upgraded". Before the stored-data update the window stays open and says the summary was not saved. After the update it closes and the summary shows in the box.
4. Open it again. The footer reads "Last changed by you · <today>" (before the update it reads "Last changed · <today>") with a "See in History" link. The link closes the window and opens the deck's Version History window.
5. Type something, then press Cancel. It asks "Discard your changes?". Pick "Keep editing" to stay or "Discard" to close.
6. In Claude, ask about Yedora. It should repeat your bracket, Strategy and playgroup. If you clear the bracket, it should ask you which bracket you're aiming for.

To decide: the old "Deck Intent" form on the Strategy tab still edits the same bracket, Strategy notes and playgroup (see Open questions 1).

## Changed files
- src/lib/deck-bracket.ts: new. The five brackets with their names (number first), and the rule that only 1 to 5 counts as a bracket.
- src/lib/deck-strategy-window.ts: new. The window's limits (summary 120, Strategy 4000, playgroup 500), the bracket warning sentence (shows only when the cards imply a higher bracket), the "Claude adds a dated paragraph" rule, and input checks.
- src/lib/deck-strategy-window-server.ts: new. Reads and saves the window's fields and works without the new columns. A missing column falls back to the older fields, a typed summary is reported back as not saved, and bracket 5 against an old 1-to-4 check gets a plain message. The bracket check (`impliedBracketForDeck`) returns nothing until RQ-14.
- src/app/api/decks/[id]/strategy-window/route.ts (+ route.test.ts): new. GET and PUT for the window, owner-scoped. Saves only the four window fields, so win condition and budget are never touched.
- src/components/deck-strategy/StrategyBlock.tsx (+ test): new. The block in its empty, set, warning, loading, failed and offline states, plus the save call and the "Strategy saved" announcement.
- src/components/deck-strategy/StrategyWindow.tsx (+ test): new. The dialog: bracket radio group with arrow keys and "Clear target", warning area, summary counter, Strategy, playgroup, footer, the discard bar, and the failed-save and offline states.
- src/components/deck-strategy/useOnlineStatus.ts, focus.ts: new. Online state, and the spec's focus ring (2 px white outline with a 4 px black halo).
- src/app/decks/[id]/page.tsx: mounts the Strategy block above the tabs. "See in History" opens the existing Version History window.
- src/components/VersionHistoryPanel.tsx: optional `open` / `onOpenChange` props so the window's link can open it. Its own History button works as before.
- src/components/StrategyTab.tsx: the old Deck Intent bracket list now uses the new names and offers 5. Nothing else changed.
- src/app/api/decks/[id]/strategy/route.ts (+ test): allows bracket 5 and writes "last changed by you" when the database can hold it (falls back when it can't).
- src/lib/connector/tools/deck-strategy-read.ts: new. Claude's view of the strategy (target bracket with name, summary, Strategy, playgroup, last changed) and a short Deck health view. A failed health check is reported as "not the same as healthy", never as a pass.
- src/lib/connector/tools/get-deck.ts: the answer is now ordered deck, strategy, health, cards (mainboard).
- src/lib/connector/tools/bracket.ts: brackets 1 to 5. The "no bracket" text now tells Claude to ask the owner, not to assume, and says a bracket never limits suggestions.
- src/lib/connector/tools/edit-tools.ts: `set_deck_setup` takes `summary`, `playgroup`, `bracket` 1 to 5 and `strategy_add`. `strategy_add` is appended as "Claude, <date>: …" after the owner's text. The old replace-all `strategy_notes` input is gone. Before the stored-data update, a summary, a playgroup or bracket 5 is refused in plain words and nothing changes.
- src/lib/connector/tools/index.ts: tool descriptions for get_deck, set_deck_setup and list_decks, including "the bracket never limits which cards you may suggest".
- src/lib/connector/change-sentences.ts, write-types.ts: wording for the new refusals (notes_changed, notes_replace_refused, bad_summary, bad_playgroup), bracket 1 to 5, and the change sentence.
- src/lib/connector/__tests__/strategy-window-connector.test.ts: new connector tests. Existing tests in bracket, edit-tools, facts-in-tools and registry-and-isolation were updated for bracket 5, `strategy_add`, and the health read that get_deck now makes.
- src/lib/__tests__/deck-strategy-window.test.ts: new rule tests.
- docs/oracle/contracts/connector-card-facts-and-deck-health.types.ts: the `BracketInfo` comment now says 1 to 5, and `whyEmpty` is now plain text, because the old exact sentence is replaced. This is a contract file (Architect lane); see Assumptions.
- supabase/drafts/20261119100000_s3_strategy_window_fields.draft.sql: new DRAFT, NOT APPLIED (S3).
- supabase/drafts/20261119100000_s3_strategy_window_fields.rollback.sql: new rollback.
- docs/oracle/reports/evidence/roles-db/test_s3.sh, test_s3.out, README.md: the rehearsal and its result. The other `.out` files in that folder were re-run on this commit; only the folder path in the error lines changed.

## New decisions made (need owner confirmation)
- Claude's added paragraph reads "Claude, 19 Nov 2026: …", placed after a blank line under your text. The database refuses any Claude write that doesn't keep your text as the start (so Claude can't clear, cut or edit it). It also refuses if you changed the text after Claude read it.
- The Strategy text limit stays at the existing 4000 characters, and Claude's paragraph counts toward it. The designer left this open.
- Playgroup: one line, up to 500 characters (new limit).
- Saving with only the date and no "by" (before the stored-data update) shows "Last changed · 19 Nov".
- When the summary can't be stored yet, Save keeps the window open and says what was saved and what wasn't, so typed text is never lost without a word.
- Claude's Undo of a Strategy change marks it as changed by whoever pressed Undo (you or Claude).

## Assumptions
- Until the rail exists (slice 3), the Strategy block sits above the tabs on the existing deck page, as the plan says.
- RQ-14 is not built, so the cards imply nothing yet. The warning area and the "Based on: …" line are built and tested with sample data, but in the app they show nothing. This follows the plan and approval (8).
- The live `deck_strategy` table may or may not have a 1-to-4 bracket check; the migration files show none. The draft handles both cases: it replaces any bracket check with 1 to 5 and saves the old wording so the rollback can put it back exactly. The app also handles both before the update: bracket 5 saves if there is no check, and gets a plain "can't be saved yet" message if there is one.
- Before the stored-data update, Claude's `strategy_add` still goes through the old database function. It then writes your text plus the new paragraph (still add-only), but without the database's "you changed it meanwhile" check. That check starts once S3 is applied.
- I edited one line of a contract types file (Architect lane). The old exact "why empty" sentence had to change to say "ask the owner", and the type held that exact sentence.
- No separate test account exists, so no save path was run against a real database. Saves are tested with stand-in databases and the throwaway Postgres rehearsal.

## Challenges to locked decisions
- none

## Open questions
1. The old Strategy tab's "Deck Intent" form (bracket, Strategy notes, table context, plus win condition and budget) still exists and edits the same bracket, Strategy and playgroup as the new window. The brief recommends removing the form once the window ships. Recommendation: remove the form in the next slice and keep the build picker, guide and category manager where they are. Until then you have two places to edit the same three things. Alternative: keep both.
2. What "See in History" opens today: the deck page's Version History window. It lists saved versions of the whole deck list ("Save Current State", restore a version). It does not show Claude's changes; those are only on the Claude connector settings page under Recent changes. So today the link can't show you what Claude changed in your Strategy. That arrives with slice 2 (one History per deck).
3. Spec points the code could not follow exactly:
   - Focus trap. Tab order, page-behind-hidden and Escape are tested, but the test browser has no layout, so wrapping from Save back to Close was not checked automatically. It needs a quick check in a real browser (step 2 of the 5-minute test).
   - Phone layout. The window becomes a full-screen sheet below 640 px screen width (the app's existing small breakpoint), not at the spec's 720 px container width. The block simply stacks; the collapsed rail row belongs to slice 3.
   - Colours. Warnings use the app's amber and red text on the dark surface; borders on controls use the spec's #8A8A93 and Save uses #1D9E75 with a #0B0B0D label. The amber and red shades are Tailwind's (amber-300, red-300), not the spec's exact #EF9F27 and #F2766B. Both are lighter, so contrast is at least as high, but it was not re-measured.
   - The "Offline" chip appears when the browser reports no connection. The block uses the copy it already loaded; a deck opened while offline shows the failed-to-load box.

## Verification
- `npx vitest --run` (full suite): 319 files passed, 6 skipped; 3956 tests passed, 46 skipped, 0 failed. The known ImportIntentFlow env-flag test passed in this run.
- New tests, part of the run above:
  - StrategyWindow.test.tsx (26): empty, set, bracket exceeded, loading, failed save, offline, summary not storable yet, counter, closing and discard, focus start, arrow keys, modal and Tab order.
  - StrategyBlock.test.tsx (10): empty, set, exceeded, loading, failed, offline, save round trip with focus return and announcement, failed save, bracket 5 before the update, See in History.
  - strategy-window-connector.test.ts (20): order deck, strategy, health, cards; empty bracket asks and never assumes; dated paragraph never replaces; old replace input refused; limits; the old database told plainly; no tool filters by bracket.
  - deck-strategy-window.test.ts (18) and strategy-window/route.test.ts (8).
- `npx tsc --noEmit`: only the 4 known AddToPicklist.test.tsx errors.
- `npx eslint`: 1 error and 278 warnings, the same totals as main. The error is the existing `<a>` link in PicklistV2.tsx, which I did not touch. The new files have 0 problems. I removed the one new warning my change caused (an unused import in edit-tools.ts).
- Throwaway rehearsal (local Postgres 17 on 127.0.0.1, created and deleted by the script; the hosted project was never touched): `docs/oracle/reports/evidence/roles-db/run.sh test_s3`: 38 PASS, 0 FAIL. It covers: S3 on the bare cc15b base and back; S3 on the live state (DB-1 to DB-5); every field rule; Claude add-only, stale-read and refusal cases; Undo and the blocker; isolation; old and CC-26 change kinds still working; rollback refusals; exact restore (function, grant and constraint fingerprint plus the column list); re-apply; a pre-existing 1-to-4 check replaced and put back exactly; DB-5 to DB-1 still rolling back afterwards.
- Earlier drafts re-run on this commit, all unchanged: test_db1 51/0, test_db2 84/0, test_db3 56/0, test_db4 52/0, test_db5 44/0, test_db6 111/0, test_chain 16/0, cc15-db test_a 33/0, test_b 90/0, test_dep ran as described, cc25-db test_cc25 18/0.
- No migration applied and no hosted write. Picklist components, in-app chat files, decisions.md and status.md are untouched.
