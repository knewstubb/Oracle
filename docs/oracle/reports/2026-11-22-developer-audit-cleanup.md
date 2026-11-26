# Report: audit-cleanup
Role: Developer
Status: DONE
Task as received: Full-app audit clean-up on branch `audit-cleanup` (worktree `oracle_app-audit-cleanup`, base e198a27). Owner answers of 2026-11-22: (1) remove the Workbench and everything related to it; (2) remove the in-app chat, keep the Claude connector; (3) retire the old "Bring your collection over" importer; (4) remove the Upgrade and Strategy tabs, trim Analysis, keep Combos with an old-data label, keep the build picker; (5) keep both collection screens; (6) make the Collection status filter work. Slice 10 (notes) in part; slice 11 (stored data) out of scope. Group D: correct the notes, archive notes about removed features, update the feature inventory, list locked-decision conflicts without editing `decisions.md`, grep for leftover references, run the final counts, build and connector tests, write this report. Nothing pushed, merged or applied to any database.

## Summary for the owner
The Workbench, the in-app chat and AI brew screen, the Upgrade tab, the Strategy tab and the old "Bring your collection over" importer are gone. The deck page now has Cards, Picklist, Analysis and Combos. About 66,000 lines were removed. Your Claude connector was not touched and its tests still pass. The Collection status filter now works and Settings hides Clear All Data on the live site. Nothing is merged yet. You need to click through the list below and answer the questions at the end.

## Owner click-through list
Run the app from branch `audit-cleanup`, signed in as yourself.
1. **Deck page tabs.** Open any deck. Tabs read Cards, Picklist, Analysis, Combos. No Workbench, Upgrade or Strategy tab. The build picker still sits at the right of the tab bar for Commander decks.
2. **Workbench gone.** No Workbench tab, no Curve, Piled or Free-form buttons anywhere on the deck page.
3. **Chat gone.** No chat entry in the top bar or Tools menu, no chat tab or "Chat about this" button on a deck or in Deck health. New Deck no longer offers "Help me find one".
4. **Empty account home.** Easiest to see with a brand-new test account: the home page says "Welcome to The Oracle" with two buttons, Import collection and Import deck, and New deck below. "Bring your collection over" is gone. (Browser check used simulated empty lists, see Verification.)
5. **Collection status filter.** On Collection, choose All in deck, Some in deck, None in deck or Short. The cards shown change. Try a card you only have as a proxy (see question 4).
6. **Settings.** On the live site, Clear All Data and its warning line are hidden. On your own computer they still show.
7. **Analysis and Combos.** Analysis shows Proxies, Attribute ratings, Mana base analysis, Category distribution and Colour coverage gaps. Combos shows a small "Out of date" line under "Combo Lines".
8. **Claude connector.** In Claude, ask for your deck list and make one small change. In Oracle open Settings > Claude connector and Recent changes. Approvals, reasons and Undo should work as before.

## Changed files
- `docs/oracle/backlog.md` — new clean-up section; items for removed features corrected (Workbench audit, Brew Canvas, value banner, footer health strip, in-app advisor, Moxfield wording, status filter).
- `docs/oracle/backlog-details.md` — clean-up section (CLEAN-01 to CLEAN-11); T-08, T-09, T-16, T-17, T-18 cancelled; T-22, T-24, T-35, O-001 marked removed; O-007 filter part built; DV-03 superseded; UX-13 and HC-08 reworded.
- `docs/oracle/feature-inventory.md` — 55 rows updated (REMOVED, BUILT not merged, or notes); state key gained REMOVED.
- `docs/oracle/archive/removed-features-2026-11/` — archived with `git mv`: six Kiro specs (brew-ai-tools, brew-canvas-redesign, brew-mode-v2, brew-model-selector, brew-session-autosave, upgrade-tab-expansion) and six research mockups (brew mode, chat shell, upgrade tab; two copies each).
- `.kiro/specs/product-spec.md`, `.kiro/specs/SPEC-VALIDITY-AUDIT.md` — rows for the archived specs point at the archive and say removed.
- `docs/oracle/specs/vocabulary.md`, `specs/card-management-system-overview.md`, `roadmap.md`, `contracts/placement-source.md`, `docs/card-movement-reference.md` — one-line corrections for removed features.
- Status note on top of `contracts/deck-strategy.md`, `contracts/card-roles-and-deck-jobs.md`, `specs/card-roles-and-deck-jobs.md`, `briefs/card-roles-and-deck-jobs.md` — the Strategy tab they describe was removed; the strategy lives in the left rail and Strategy window.
- `src/components/DeckHealthPanel.tsx`, `src/components/GapDetail.tsx` — removed the unused "Chat about this" prop and button (no screen passed it).
- `README-SETUP.md`, `scripts/backfill-deck-commander-ids.ts` — dropped Brew Canvas and Strategy tab wording.
- Code changes of slices 1 to 9 are in the earlier commits listed below.

## Lines removed per slice versus the audit's estimate
| Slice | Commit | Added / removed | Audit estimate |
|---|---|---|---|
| 1 Workbench, curve view, Piled and Free-form buttons | ac99358 | +14 / -740 | about 400 (200 curve + 200 piled) |
| 2 pages and parts nothing shows | b925c69 | +2 / -4,959 | about 6,000 |
| 3 routes nothing calls | 9f4214b | +2 / -3,579 | about 3,800 |
| 4 import leftovers | 4009dae | +270 / -3,238 | about 2,500 |
| 5 add-ons, old scripts, settings | 5c91130 | +29 / -2,884 | about 7,400 (includes items left for the owner) |
| 6 chat and AI brew | 1e2dbf4 | +24 / -35,672 | up to about 15,000 (the audit undercounted: API routes 7.8k, brew screens 6.6k, tool registry 2k, tests about 4k) |
| 7 old importer | 9c1c41f | +31 / -6,880 | about 6,800 |
| 8a Upgrade tab | e6d09e5 | +2 / -6,411 | not estimated separately |
| 8b Strategy tab | cee534b | +2 / -1,531 | not estimated separately |
| 8c Analysis trim | a925e95 | +3 / -148 | not estimated |
| 8d Combos label | f38e47b | +6 / -0 | none |
| 9 Collection status filter | cef607b | +359 / -365 | small |
| 6 buttons: Clear All Data | cf5f189 | +48 / -4 | small |
| 10 notes and Deck health leftovers (this commit) | see git log | docs moves and edits, small code deletion | partly in scope |
Branch total against base: 366 files, +775 / -66,394 lines (code, tests and docs).

## Counts before and after per slice
Tests with `NEXT_PUBLIC_IMPORT_INTENT_SAVE` empty. Lint errors shown; warnings noted at the end of the table.
| Point | Tests passed / skipped | tsc errors | Lint errors |
|---|---|---|---|
| Baseline (main e198a27) | 4683 / 46 | 0 | 1 (PicklistV2, pre-existing) |
| After 1 | 4683 / 46 | 0 | 1 |
| After 2 | 4569 / 46 | 0 | 1 |
| After 3 | 4504 / 46 | 0 | 1 |
| After 4 | 4477 / 36 | 0 | 1 |
| After 5 | 4477 / 36 | 0 | 1 |
| After 6 | 3972 / 10 | 0 | 1 |
| After 7 | 3898 / 10 | 0 | 1 |
| After 8a | 3778 / 10 | 0 | 1 |
| After 8b | 3777 / 10 | 0 | 1 |
| After 8c and 8d | 3777 / 10 | 0 | 1 |
| After 9 | 3791 / 10 | 0 | 1 |
| After Clear All Data | 3793 / 10 | 0 | 1 |
| Final (this commit) | 3793 / 10 (306 files passed, 3 skipped) | 0 | 1 (PicklistV2) |
Lint warnings went from 280 to 181. Test files deleted in total: 84. Nothing was weakened.

## Removed tests and why
All tests removed tested code that was removed. The full file lists are in each slice's commit message.
- Slice 2: 15 test files of removed parts (old header, status controls, sidebar, draft tiles, value banner, footer health strip, card art preview, status route); 6 files edited to drop removed-code cases.
- Slice 3: 8 route and library test files; upgrade-engine property tests 2 and 3 (they exercised the removed strategy route).
- Slice 4: deck-import-built, CommanderSearch, two obsolete fully-skipped files; cases in 6 files.
- Slice 6: 42 test files of the chat, AI brew screens, tool registry and chat proposal routes; 8 files edited only to drop chat-named lines.
- Slice 7: 9 test files (old finalize and reconciliation routes, 3 reconciliation components, import-reconciliation x2, import-sleeve-claims, import-allocation-state). The empty-account page test was replaced: it now expects Import collection and Import deck.
- Slice 8a: upgrade route, upgrade-candidates, upgrade-changelog, dead-weight-classifier, upgrade-engine property tests.
- Slice 8b: StrategyTab test (1 test).
- Tests added: 14 for the status filter, 2 for Clear All Data.

## Shared code kept, and why
- Claude connector (`lib/connector`, `/mcp`, `/oauth`, Recent changes, approvals): untouched. Connector tests: 490 passed, 4 skipped, 0 failed.
- Left rail, Strategy window, Deck health (`DeckHealthPanel`, `GapDetail`, deck-health-gap, deck-health-buy): live screens and connector tools use them. Only their unused chat button was removed.
- Suggestions and Picklist helpers (`spare-copy-browse`, `owned-copy-lookup`): Deck health, Picklist and connector tools use them. Their chat-wiring test cases were removed, the rest stay.
- `api/ai/search`: despite its name it is a plain Scryfall search used by SmartSearch, CommanderPicker and CommandZoneSlots.
- `chat-proposal-check`, `chat-proposal-types` and `contracts/chat-add-cards.md`: the deck cards route and ManaBox collection import still use them (rename is a later task, so the contract stays unarchived).
- `importDeckTheorycrafted`: the new Import deck calls it. `ReconciliationNav` stays for the Reconcile page. ManaBox and Moxfield readers stay.
- Build picker (`BuildSelector`, its routes and tests): kept and mounted in the deck header.
- Deck-slot Why and Keep ideas, card Tags, strategy-window: not chat; untouched.
- `@anthropic-ai/sdk`: the commander insight script still uses it. Packages `@google/generative-ai` and `openai` were removed.

## What Analysis keeps
Removed because the left rail already shows it: Total cards, Avg. CMC, Bracket, and the Mana curve chart. Kept because the rail does not: Proxies stat, Attribute ratings, Mana base analysis (current against recommended sources per colour, with "low" warnings), Category distribution, Colour coverage gaps. Something remains, so I do not recommend removing the tab. Noted: on the fixture deck, Mana base analysis showed 0/0 sources while the rail's Mana production showed 4 lands with sources. Two different counting methods; this existed before and was not changed.

## What is reachable for the build picker after the change
The picker was never only in the Strategy tab. It sits in the deck header next to the tabs for Commander decks and stays there, so you can still change a deck's build. OPEN: where it should finally live (you said it moves later). Not decided here. The Strategy tab's second picker is gone. Routes with no screen caller now, kept: commanders/[id]/builds, commanders/[id]/insights, decks/[id]/notes, commander-summaries.

## Challenges to locked decisions
`decisions.md` was not edited. Proposed amendment text, for the owner to approve:
- **D-063** (in-app AI chat paused behind one switch). Conflict: no chat code or switch exists now. Proposed: "The in-app AI chat was removed on 2026-11-22 (audit clean-up). Claude outside the app, through the connector, is the advisor. The Strategy window, left rail, reason on every Claude change and live refresh are the deck page direction." Keep the rest as is.
- **DV-03** (backlog item, chat paused, keep list). Resolved by removal. Proposed: "Done: chat removed; the keep list items now live only in the connector path." Already marked superseded in `backlog-details.md`.
- **D-008 to D-011** (Brew Canvas: drag with snap, drag-to-assign with `source` parameter, secondary badge, no phase gates). Conflict: the canvas no longer exists. Proposed: "Superseded 2026-11-22: the Brew canvas was removed with the Workbench and the AI brew screen. The `source` parameter idea (D-009) survives only in the connector's change log." Needs owner wording. T-08 and T-09 are marked cancelled.
- **D-012 to D-014** (ownership colour and label rules): no conflict. Their backlog tasks T-16 and T-18 (advisor chat beside the deck view) are cancelled, but the rules still apply to Deck health and the Picklist.
- **D-020, D-022, D-024** (import allocation, new_cards mode, printing_mismatch conflict reason). Conflict: the new_cards mode and the old reconciliation importer were removed. Proposed: "Superseded by the ManaBox-based Import deck and Import collection (D-044 to D-049); the old reconcile-on-import flow no longer exists."
- **D-036(a)** (a failed Upgrade refresh keeps the previous suggestions). Conflict resolved by removal. Proposed: "(a) Superseded 2026-11-22 (audit clean-up): the Upgrade tab and its refresh were removed; upgrade advice comes from Claude through the connector." Rest of D-036 unchanged.
- **D-062** (Claude may rewrite the deck Strategy text; the Strategy window saves by itself): no conflict; the Strategy window and rail stay. The card-roles brief's own D-066 ("the Strategy tab is one tab in three layers") is a brief-level decision, not in `decisions.md`; it is superseded by the removal of the Strategy tab and carries a status note.
- **D-029** (no retired/archived deck concept): no conflict. The old deck status controls removed in slice 2 fit it.
- **D-030** (explicit loading and error states). No conflict. Gap noted, not changed: the Combos tab shows "No combos documented yet" when its load fails, instead of an error.
- **D-044** (ManaBox CSV is the import route for the initial collection). Consistent with the new empty home page. No amendment.

## Follow-up for a read-only database check (slice 11, not done)
No migrations written, nothing dropped. Confirm each name against `supabase/migrations` and the hosted database before any decision.
- Chat: `oracle_sessions`, `oracle_messages`, `chat_card_proposals`; functions `confirm_chat_card_proposals`, `undo_chat_card_proposals`, `apply_ai_deck_delta`.
- AI brew: `brew_sessions` and any brew conversation tables. The deck list and deck routes still read `brew_sessions` (flags `hasBrew`, `brewSessionId`), and the dev reset route still deletes from it, so the table is still touched by code.
- Old importer: the `get_import_reconciliation` function family, warm-start staging tables if any, functions `reconcile_built_deck` and `replace_deck_with_new_cards`.
- Deck pages: table `deck_overview_content` (overview route gone), health overrides storage, upgrade suggestion storage and dead-weight flag columns (the dismiss route stays).
- Also CC-03d tables noted in TIDY-03.

## Items left and listed (outside the owner's answers, default keep)
- Scripts: seed-scryfall-bulk and seed-oracle-to-printings (the import engine reads their table); sync-card-keywords (cited as a template); one-off fixes, audits and commander insight generators (groups C and D).
- Packages and add-ons: YouTube (RC-40); better-sqlite3 and the commander-context snapshot (RC-43); cron (RC-36); GitHub workflows and old e2e tests (RC-50).
- Routes with no caller: breakdown, folders, import-alerts (RC-20); allocation candidates (RC-17); old collection import modes (RC-28); commanders builds and insights, decks notes, commander-summaries.
- `src/lib/mcp-client.ts` (the third-party mtg-mcp-server client, RC-13): after the chat and the held scripts went, nothing live imports it; only five tests mock it. Removing it means editing those five tests, so it was left.
- Brew leftovers: `brew_sessions` reads in the deck routes and the DeckTile `hasBrew` prop (no screen uses them), `deck-list-generator`, `format-strategy-prompt` (unreferenced before this run).
- `.env.local.example` is git-ignored, so its dead entries (SUPABASE_DEFAULT_USER_ID, YOUTUBE_API_KEY, SUPABASE_EDGE_FUNCTION_URL, a stale CRON_SECRET comment) were not changed. Your copy only.
- Historical notes not archived because they mention the removed features only in passing or are dated records: reports, the 2026-09 contracts (audit-2026-09, ai-audit, ai-recommendations-assessment, jev-research, owner-decision-pack, advisor-tools), plans 01 and 02, other `.kiro/specs` (cards-tab-workshop, ui-overhaul, etc.), research notes, docs/audits, the import reconciliation specs and mockups (the Reconcile page still exists), and the long card-roles brief, spec and contract (only given a status note).
- `docs/oracle/contracts/advisor-tools.md` and related types: not archived because connector tools may reuse the same shapes; the Architect should confirm.
- Migration files that mention chat in comments are left as applied history.

## Final reference grep
Searched for Workbench, curve view, Piled, Free-form, chat, AI brew, old importer, Upgrade tab and Strategy tab outside reports, the archive and the audit files. Fixed: code comments and props in Deck health, README-SETUP, a script comment, vocabulary, card management overview, roadmap, placement-source, card-movement-reference, backlog files and inventory. Remaining hits are in dated contracts, briefs, plans, research and old Kiro specs (listed above), in migration comments, in a test that asserts the old importer link is absent, and in the Strategy window's own "Strategy" tab, which is a different, live screen.

## New decisions made (need owner confirmation)
- Archived only notes that describe nothing but removed features (6 Kiro specs, 6 research mockups). Everything mixed got a status note instead.
- Removed the unused "Chat about this" button and prop from Deck health because the chat is gone.
- Left `chat-add-cards.md` in place because live server checks cite it.

## Assumptions
- "The library" in the owner's click-through was read as the Component Library page.
- Archiving Kiro spec folders (they live under `.kiro/specs`) is acceptable because the owner asked for removed-feature notes to move under `docs/oracle/archive/`.
- The old deck footer health strip and the collection value banner were already gone (slice 2), so the backlog lines about them were corrected, not left as work.

## Open questions (owner questions)
1. **Where should the build picker live?** For example: you want to switch Korvold from the Vampires build to another build. Today it works from the deck header, next to the tabs. Recommendation: leave it there until you design the new home. Other options: in the left rail under Strategy & bracket, or inside the Strategy window.
2. **What should Analysis keep?** Recommendation: keep what it shows now (Proxies, Attribute ratings, Mana base analysis, Category distribution, Colour coverage gaps), because the left rail does not show these. Alternative: remove the tab and move Mana base analysis into Deck health.
3. **Wording for the Combos "old data" label.** Now it says "Out of date" (the vocabulary's word for the last result we had). Recommendation: keep it. Alternatives: "Old data" (plainer, not a vocabulary word); "Out of date · saved July 2026" (needs a saved date the app does not store today). The tab mostly shows "No combos documented yet" today, so the label is rarely seen.
4. **Collection status filter and proxy-only cards.** For example: you own no original Sol Ring, only a proxy. Recommendation: it matches no status but still shows with no filter (built now). Alternatives: count it as "None in deck", or count proxies as owned for the filter. Related: should "Short" (more deck slots than originals) be the filter word? Recommendation: yes, to match Reconcile.
5. **Old one-time scripts that could serve as templates.** Recommendation: keep them and listed (current state). Alternative: remove the ones that touch dropped tables, and keep only the seed and sync scripts.
6. **Piled and Free-form layouts.** They were removed from the deck page with the Workbench. No other screen offers them today, so nothing else needed to change. Please confirm that is what you meant by "everything related to the Workbench goes". Recommendation: yes.
7. **Archived notes and the listed leftovers.** Recommendation: approve the archive as done, and decide later on YouTube, cron, workflows, the SQLite snapshot and the unused routes.

## Verification
- `npx tsc --noEmit` — 0 errors.
- `NEXT_PUBLIC_IMPORT_INTENT_SAVE= npx vitest --run` — 3793 passed, 10 skipped, 306 files passed, 3 skipped.
- `npx eslint` — 1 error (pre-existing, PicklistV2), 181 warnings.
- `npm run build` (dummy Supabase values on the command line) — passes.
- Connector tests (`src/lib/connector`, `src/app/mcp`, `src/app/oauth`, `src/app/api/connector`) — 490 passed, 4 skipped, 0 failed.
- Browser check (groups C, run earlier on port 3100 and a production build on 3101, test identity, reads only): deck page tabs, trimmed Analysis, nav menu, Settings with and without Clear All Data, Component Library PASS. Simulated, not real data: Combos label (one sample combo injected in the browser) and empty-account home (deck lists answered empty in the browser). Partly tested: Collection filter (the test identity has no collection; route tests cover real filtering). Not tested: Claude connector screens in the browser, any save path. Known: the fixture deck has a negative id, so rail panels show errors for it; not caused by this run. Known flaky tests: CardDetails timing ("saved Why", "arrow keys") and the upgrade-engine property run failed once under load and passed alone (the latter test file was removed in 8a).
- Nothing pushed, merged or applied to any database.
