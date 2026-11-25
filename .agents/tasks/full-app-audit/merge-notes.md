# Merge notes: full app audit

Date: 2026-11-22 (audit date). Merge done after the six area pieces were complete.

## Pieces used

All six were present and full length. None needed gap-filling by a full re-read.

| Piece | Lines | Used for |
|---|---|---|
| area-collection.md | 271 | Collection, boxes, Picklist, search, buying list, proxies, pricing, history rows; removal candidates for orphan collection routes, old components, value banner |
| area-import.md | 201 | Import paths, auth, settings, outside integrations; old onboarding importer, three-choice screen, legacy modes |
| area-decks.md | 317 | Deck library, deck page and tabs, Workbench and curve view, rail, strategy, categories, upgrade, brewing, debrief; most removal candidates |
| area-claude.md | 220 | Connector tools (22), in-app chat, AI routes; removal candidates for the paused stack |
| area-data.md | 595 | Hosted migration list, drafts, tables, functions, scripts, cron, env flags, packages, tests, route table, size totals |
| area-docs.md | 324 | Initiative history, backlog contradictions, stale docs, branches, open points |

Each piece numbered its removal candidates R-01 upward. These were merged and renumbered RC-01 to RC-52 in the report.

## Duplicates merged

- Curve and Piled layouts: found by decks, claude, data, docs. One candidate each (RC-01, RC-02).
- Archidekt push stubs: import, decks, collection (as "outside my area"), data. One candidate (RC-15).
- Orphan routes (about 36 with no caller): split by area and merged into RC-10, RC-16, RC-17, RC-18, RC-19, RC-20, RC-11 and RC-12 by theme.
- `cards/autocomplete`: collection and import each listed it. One entry in RC-18.
- Unmounted brew and chat components: decks R-04/R-07/R-08, claude 5/6/7, data R-02 overlapped. Split into RC-07, RC-08, RC-09.
- Old header, status controls, Sidebar, MobileHeader, footer health strip: found by decks, collection, data. RC-03 to RC-06.
- Auto-assign: collection and decks. RC-16.
- mtg-mcp-server client and three AI routes: import, claude, decks, data. RC-13.
- Scripts: data only (RC-41, RC-42).
- Commander-context snapshot, packages, flags: data only.

## Conflicts resolved

1. **Is the Workbench curve view reachable?** area-claude (row 39, item 12) and area-data (R-05) implied the Curve button is still on screen. area-decks and area-docs say the toolbar is hidden since commit f66a510. Checked directly: `src/components/WorkbenchTab.tsx` passes `showToolbar={false}`; `BrewCanvas` uses the default (toolbar shown) but sits behind the paused `/new-deck`. Decks and docs are right. The state is ABANDONED (hidden, not removed).
2. **Does `GET /api/collection/instances/[oracleId]` have a caller?** area-data lists callers in `CollectionCopiesTab` and `BulkActionBar`; area-collection says none. Re-ran the search: callers use only `/ids` and `/details` sub-paths and other `instances/*` routes. Collection is right; the root GET is a candidate (RC-18).
3. **Size of the paused chat and brew stack.** claude says about 25,000 lines, data says about 15,300 app lines, decks says about 14,000 for brew alone. Used about 15,000 app lines, with up to 25,000 including tests.
4. **Whether DV-03 "keep" list is reachable.** DV-03 says keep `OracleChat` and `DeckChatTab`; claude and decks show neither is mounted. Recorded as a drift item (E-08) and RC-08 asks the owner.
5. **Cron job.** collection says "HALF / misnamed", data says "dead or unknown, mislabelled", import lists it as live price refresh. Read the route description in two pieces: it refreshes card text, not prices. State HALF-BUILT.
6. **Collection value banner state.** import said it could not tell whether the banner loads; collection showed it was replaced by a header number (merge 70147fe). Used collection's finding.
7. **Strategy window database state (S3, S4, S5).** docs says S5 applied (D-062); data says all three unverified. Reported as unverified, with docs's note.
8. **Audit dates.** area-claude is dated 2026-11-22, the others 2026-11-26. The audit date in the deliverables is 2026-11-22 as instructed; the code is the 2026-11-26 `main`.
9. **Counting HealthStrip.** data says the health route has a caller in `HealthStrip.tsx`; decks says the route stays live through `hooks/useDeckHealth.ts`. Both true. The route is live, the strip is not.
10. **`/api/cards/search` public route.** import raised it as a security question; kept in the report's Verification as a note and not as a removal candidate.

## Checks I re-ran myself

About 60 caller searches (`grep -rlE` over `src`, `scripts`, `tests`) covering the "remove now" candidates and most "confirm" ones, plus `git branch -a`, `git status --short`, and a read of `WorkbenchTab.tsx` and `DeckCanvas.tsx` for the curve view. Results are marked **Re-run** in the report. Items marked **Area** rely on an area piece's import graph (knip run by two agents) and were not repeated.
Two of my regex checks were too loose (`ChatPanel`, `CandidateCard`, `StrategyRow` match similar names elsewhere); those are marked as relying on knip.

## Gaps

- No run of the app, tests, type check, lint or knip by me.
- No hosted database query. Applied state of S3, S4, S5, card-tag tables, trade-location flag, and CC-26 empty tables is unverified. Row counts unknown.
- Vercel and GitHub settings unverified (chat switch, import intent switch, daily job, four workflows).
- Reports: about 330 of 393 read by title and status only (docs agent).
- Line counts are `wc -l` from area pieces and include blanks. Removable-code totals in the report are my sums and are plus or minus 15%.
- The owner's "curve view not useful" remark exists only in the request; no note records it.
- Items an outside caller might use (bookmarks, typed addresses) cannot be seen from the repo.
- Hidden checkpoint refs (38) were counted by the docs agent, not diffed.

## Not touched

Application code, migrations, package files, `decisions.md`, hosted data. Nothing was committed.
