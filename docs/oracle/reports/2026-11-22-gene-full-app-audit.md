# Report: full-app-audit
Role: Gene
Status: DONE
Task as received: Could you do a full audit of the app and give me the state of every feature. I feel that i have started a bunch of things that have then just been left. There must be a lot of code that can be removed. Go deep and cross reference everything with the associated notes. For example, the curve view in the workbench was something we started but then i realised it wasn't that useful. Read-only audit; nothing removed.

Audit date: 2026-11-22. Code state: `main`, last commit 2026-11-26.
Companion file: `docs/oracle/feature-inventory.md` (one row per feature and route).

## Owner summary

### The short answer

Your instinct is right. About one line of code in twelve can be removed today with no change to anything you can see, and about one in five if you say yes to the items marked "ask you". The curve view is in that group. Most of what you started and left is hidden or unreachable rather than broken, so removing it is safe in nearly every case.

### Headline numbers

The inventory lists 173 features and capabilities (plus a second list of every page and route).

| State | Count | Example |
|---|---|---|
| Live and used | 103 | Collection, Picklist, the left rail on a deck. 22 of these are single Claude tools |
| Live but hidden behind a switch | 9 | The in-app chat and the "brew a deck with AI" screen |
| Half-built | 14 | Workbench tab, Upgrade tab, Combos tab |
| Abandoned | 14 | The Workbench curve view, "push deck to Archidekt", post-game debrief |
| Superseded (replaced, old code left) | 11 | The old deck header, the old left sidebar, the old importer |
| Dead code (nothing uses it) | 14 | A chat tab that was never put on a screen |
| Not built (planned only) | 8 | "Use proxies" switch, wishlist, Claude managing boxes |

Removable code, estimated:

- **Safe now: about 115 files and 17,600 lines, roughly 8% of the codebase** (221,000 lines counting tests and scripts). Of that, about 10,400 lines are app code, 3,500 are tests that only test unused code, and 3,700 are old one-off scripts.
- **Needs your yes: about 30,000 more lines, roughly 14%.** The biggest pieces are the old importer (6,800), the paused chat and AI brew leftovers (about 11,000 outside the safe group), the Upgrade tab (3,500) and old scripts you may want kept as templates.
- **The paused chat as a whole is about 15,000 lines** and overlaps with the group above. It only goes if you decide chat is not coming back.

These are estimates from file sizes, not from running the app. Treat them as plus or minus 15%.

### The ten biggest findings

1. **The curve view is hidden and has been since 19 August.** You asked for a cleaner Workbench that month and the three layout buttons (Free-form, Piled, Curve) were hidden, not removed. No note records that you found it not useful. It is about 200 lines. Even if the buttons came back, every card would land in the "0" column.
2. **The Workbench tab itself is half-built.** Dragging a card to another category does nothing, and card positions are forgotten when you leave. No design note describes this tab.
3. **Two buttons say they did something when they did not.** On the Strategy tab, "Sync to Archidekt" shows "synced" without sending anything. On the Upgrade tab, "Refresh" erases the suggestions and says "refreshed". The second one breaks a locked decision (a failed refresh must keep the old suggestions).
4. **A whole second importer is still in the app.** "Bring your collection over" shows on the home page only when an account has no decks, so you have never seen it. It is about 6,800 lines. Your own import clean-up plan says to retire it and nobody did.
5. **The paused chat and the AI brew screen are about 15,000 lines of code that cannot be seen.** Roughly 4,000 of those are not reachable even if you switched chat back on (a deck chat tab, draft tiles). The rest comes back with one setting.
6. **The backlog says "not built" for things that are built.** For example: card Tags (you can see them on cards and filter by them), Deck health ranges, the card window on Card Management, bulk actions, the collection value number, and adding a proxy for an unowned card. Anyone planning from the backlog will plan work that already exists.
7. **The app and the locked decisions have drifted apart in five places.** Examples: Missing was retired by decision but exists again as a page; deck tiles say Brewing / Assembling / Playable but the decisions say Draft or Unowned; Reconcile still uses the rule your decision replaced. Section E of the body lists all of them. Nothing was changed.
8. **Approved Claude work has sat untouched since 17 November.** Claude running the Picklist and boxes, importing decks, and the wishlist are "approved, planning underway" but only unapplied database drafts exist. Trade boxes and the card-data backfill are built but wait on a database change or your approval.
9. **Two collection screens do the same job.** "Collection" is where you browse and filter. "Card Management" is where you open a card, add a proxy or select many. Your own roadmap says there should be one place. No note says which one wins, and the card window cannot be opened from Collection.
10. **"Clear All Data" in Settings cannot work on the live site**, and the "Search cards" box shows a ⌘K shortcut that does nothing. Smaller, but both are visible to you today.

### Proposed clean-up order

Each slice is small enough to review on its own. All of them are reversible through git, and none touches your stored data except the last.

| Slice | What you would see | Size | Risk | Needs your approval? |
|---|---|---|---|---|
| 1. Remove the Workbench curve view | Nothing on the deck page. The hidden AI brew screen loses one layout option | 200 lines, 4 files | Very low | No (you already said it is not useful). Say yes or no to removing Piled at the same time (200 more lines) |
| 2. Remove pages and parts of pages nothing shows | Nothing. These are old header, status controls, footer health strip, left sidebar, draft tiles, and a value banner that is no longer shown | about 6,000 lines, 45 files | Low | No. One small question: keep or drop the ⌘K hint on the search box (recommend drop) |
| 3. Remove behind-the-scenes links nothing calls | Nothing. About 35 internal addresses that no screen calls, plus the Archidekt push stubs | about 3,800 lines, 35 files | Low (a hidden outside caller is the only risk) | No |
| 4. Remove import and collection leftovers | Nothing. The old three-choice screen after a link, unused helpers | about 2,500 lines | Low | No |
| 5. Housekeeping | Nothing. Unused add-ons, old one-time scripts, obsolete tests, unused settings | about 7,400 lines, 3 add-ons | Low to medium (the list of add-ons changes) | No |
| 6. Fix the buttons that pretend | "Sync to Archidekt" and the empty "Add category" go (or become honest). "Refresh" on Upgrade stops erasing suggestions. "Clear All Data" is hidden unless you run the app on your own computer | small | Low | **Yes**, because you would see these changes |
| 7. Decide the half-built tabs | Workbench, Analysis, Upgrade, Strategy tab and Combos either stay (and get fixed) or go | up to 7,000 lines | Medium | **Yes** |
| 8. Retire the old importer | A brand-new empty account would see "Import deck" and "Import collection" instead of "Bring your collection over" | about 6,800 lines | Medium | **Yes** |
| 9. Decide whether chat comes back | If not, the paused chat, AI brew screen and the three unused suggestion routes go | up to 15,000 lines | Medium | **Yes** |
| 10. Catch the notes up | Backlog corrected, old design notes archived, decisions amended to match the app | notes only | None to the app | **Yes** for the decisions (only Gene edits them, and only after you approve) |
| 11. Stored data | Empty tables from the dropped "roles and jobs" plan are removed; draft files marked as applied or superseded | tiny | Highest: a database change | **Yes**, after a read-only check of the live database |

**Recommendation:** do slices 1 to 5 first in that order. They are invisible to you. Then ask for your answers to slices 6 to 9 in one sitting. Slice 11 should wait until a read-only check of what is really in the live database.

### What I need from you

1. Remove the curve view? Recommendation: yes. Also remove the Piled view (the sibling you also cannot reach)? Recommendation: yes.
2. Is the in-app chat coming back? Recommendation: no, remove it, because Claude through the connector does that job. Options: (a) remove, you would see no change today, saves about 15,000 lines; (b) keep paused, no change, nothing saved; (c) remove only the parts that cannot be reached even with the switch on, about 4,000 lines.
3. Retire the old "Bring your collection over" importer? Recommendation: yes. You would lose "import my whole Archidekt account in one go".
4. Workbench, Analysis, Upgrade, Strategy tab, Combos: for each, keep and fix, or remove. Recommendation: remove the Workbench and Upgrade tabs, trim Analysis to what the left rail does not show, keep only the build picker from the Strategy tab, keep Combos but mark it as old data.
5. Which should be the one collection screen: Collection, Card Management, or both for now? Recommendation: both for now, and plan to open the card window from Collection.
6. Two items that look like a quick win: make the Collection status filter actually work (recommendation), or remove it from the toolbar.

Everything else in this report is for reviewers and can be skipped.

## Summary for the owner

The inventory covers 173 features and every page and route. About 8% of the code (roughly 17,600 lines) can be removed with no visible change, and about 14% more if you approve the items marked "confirm". The Workbench curve view is hidden since 19 August and is safe to remove. Section "What I need from you" above lists the decisions.

## Changed files

- `docs/oracle/feature-inventory.md` (new): one row per feature, page and route group, with state, evidence and note-versus-code check.
- `docs/oracle/reports/2026-11-22-gene-full-app-audit.md` (new): this report.
- `.agents/tasks/full-app-audit/merge-notes.md` (new): which pieces were used, conflicts, gaps.

Nothing else was changed. Application code, migrations, package files, the hosted database and `decisions.md` were only read. Nothing was pushed. The audit files were committed on main in three docs-only commits.

## New decisions made (need owner confirmation)

- None recorded. Every recommendation above is a proposal. Removals need the approvals listed in section B before any slice starts.

## Assumptions

- "Removable" means nothing in `src` or `scripts` imports or calls it. A caller outside the repo (a bookmark, a hand-typed address) is not visible. [Approximate for routes]
- The audit date is 2026-11-22 as instructed. Some area pieces were produced on 2026-11-26 against the later commit.
- Line counts come from `wc -l` in the area pieces and include blanks and comments. I re-ran caller searches for about 60 items; the rest rely on the area pieces' import graphs (knip run by two agents).
- The share of codebase uses 221,000 lines: 139,100 app, 65,500 test, 16,250 scripts.

## Challenges to locked decisions

Nothing was edited in `decisions.md`. Evidence is [Confirmed: path] unless tagged.

### E. Decisions drift

| ID | Decision | What the code or notes do | Evidence | Suggested change |
|---|---|---|---|---|
| E-01 | D-028 Missing retired | Missing is a page, a tile and tick actions again; approved in the know-where-cards brief | [Confirmed: src/app/storage/missing/page.tsx; contracts/know-where-cards-are.md:235,337]; owner-checklist C-15 now untrue | Amend D-028 (owner approval) |
| E-02 | D-037 / D-027 Reconcile counts originals only, proxy-filled slots count as demand | Code uses the old rule: proxy-filled slots add nothing; cards with no original are left out. Page says "Proxies are not counted" | [Confirmed: src/lib/reconcile-overuse.ts:5-8,65] | Build T-37, or amend D-037 |
| E-03 | D-002 deck states Draft/Assembling/Playable; D-059 Unowned cards/Assembling/Playable and a "Use proxies" switch | Tiles say Brewing/Assembling/Playable, Brewing = nothing sleeved. No Unowned state, no switch | [Confirmed: src/lib/deck-readiness.ts; no `useProxies` in src] | Amend D-002 and D-059 to match, or build D-059 |
| E-04 | D-025/D-031/D-033/D-043 say Sleeved / Unsleeved | App says In deck / Planned (WORDS-01); "Sleeve" remains the action word | backlog-details WORDS-01/02; [Confirmed: src/components/CardSlotBadge.tsx:130] | Record the amendment |
| E-05 | D-035 "Card Kingdom deferred" vs D-040 "removed" | D-035 text not marked as replaced | decisions.md | Add a pointer |
| E-06 | D-053 selected Original uses green `#1D9E75`; D-043 says teal | Primary colour is now purple (brand-600, 2026-11-21) | [Confirmed: src/styles/tokens.css:151] | Amend the colour values |
| E-07 | D-034a card moves and edits over about 10 cards wait for approval; Claude never deletes a deck | CC-13 (approved 2026-11-17): 120 direct, 200 cap, moves go straight through with Undo; CC-15 undo removes an empty deck | tools/index.ts request_card_move text; backlog-details CC-13, CC-15 | Record the amendment (owner approval) |
| E-08 | D-063 chat paused; CC-26 dropped in principle | backlog-details CC-26 still "awaiting owner approval"; DV-03 says keep `OracleChat` and `DeckChatTab`, which were never mounted | [Confirmed: no importer of either] | Update CC-26 row; narrow the DV-03 keep list |
| E-09 | D-036(a) failed Upgrade refresh keeps old suggestions | Refresh always deletes and writes an empty list | [Confirmed: src/app/api/decks/[id]/upgrade/refresh/route.ts] | Fix code (slice 6) |
| E-10 | D-030 honest labels | Strategy tab "synced" message with no sync; Upgrade "Analysis refreshed" after wiping | [Confirmed: src/components/StrategyTab.tsx:412-441] | Fix code (slice 6) |
| E-11 | D-008..D-011 Brew Canvas locked; T-08/T-09 PARKED | About 7,000 lines built and mounted behind the chat switch, and the canvas is the Workbench | [Confirmed: src/components/brew-v2] | Reword the decisions if the owner removes brewing |
| E-12 | D-039 cites `decks/[id]/cards/batch` as confirmed code | Route has no caller since 2026-11-12 | [Confirmed: caller search] | Note when the route is removed |
| E-13 | D-029 no retired or archived deck concept | Comments say "Boxed or Archived"; Reconcile carries an `isActive` field | [Confirmed: src/app/api/allocation/resolve/route.ts:6] | Clean comments with RC-16 |
| E-14 | D-020 import runs no automatic allocation | "I built it" save moves copies between decks (behind a switch) | [Confirmed: src/components/manabox-import/import-copy.ts:62] | Amend D-020 or confirm intent |
| E-15 | D-059 (deck state automatic) | Old importer still asks Brew or Active per deck | [Confirmed: src/app/onboarding/page.tsx:20-24] | Resolved by retiring the importer (RC-26) |
| E-16 | AGENTS.md "Hosted on Vercel" | roadmap: no Vercel for now; connector brief says hosted. Which is true was not verified | roadmap.md; AGENTS.md | Owner to say |
| E-17 | D-017 curve warnings cross-referenced | Not found in deck-health code | [Approximate] | Verify when D-017 is touched |
| E-18 | Process rule: old version deleted in the same task | Not followed for header, footer, status controls, Sidebar, brew v1, deck chat tab, Upgrade generator, old strategy route | process.md | Process note only |

### Backlog versus code

| # | Backlog says | Code and reports say | Evidence |
|---|---|---|---|
| 1 | RQ-12 Tags "not built" | Tags display, Collection Tag filter and Claude search by Tag are merged; Keep flag not found | [Confirmed: src/app/collection/page.tsx:344; reports/2026-11-20-developer-card-tags-display.md] |
| 2 | HC-01, HC-02 Deck health PROPOSED | Built (commits 893d512, 1836005); settings migration in `supabase/migrations`; D-061 locked on the brief | [Confirmed: migrations/20261121100000]. HC-03 to HC-08 not built |
| 3 | UX-04, UX-11, UX-14 header, health beside slot bar, header to sidebar: TODO | Replaced by the left rail (commit 89d2fc0) | [Confirmed: DeckRail.tsx] |
| 4 | UX-02 "click a card opens window", UX-12 | Card window built; not reachable from Collection | [Confirmed: CollectionCardDetails.tsx mounted in CollectionRollupTab.tsx:195] |
| 5 | T-06/T-07 bulk actions PARKED | Implemented and used | [Confirmed: BulkActionBar.tsx, api/decks/[id]/cards/bulk] |
| 6 | T-51 value banner PARKED; checklist C-03/C-04 Fail | Merged 2026-10-20; banner replaced by header number | git 70147fe |
| 7 | T-52 proxy for unowned card PARKED; C-01/C-02 Fail | Merged 2026-10-20 (c1add89); needs one click-through | [Confirmed: api/collection/instances/add-proxy] |
| 8 | T-58 CSV with no Scryfall ID PARKED | Fixed, merged 2026-11-02 (303f4b3) | [Confirmed: src/lib/manabox-import.ts:155] |
| 9 | T-59 to T-63 import formats, intent, precons, links, simplified review | No rows, although merged and in D-054 to D-058 | git; decisions.md |
| 10 | CC-13 bigger edits "awaiting approval" (backlog.md) | Applied and verified live 2026-11-17 | backlog-details CC-13; migration 20261117100000 |
| 11 | CC-14/CC-07 search "build started" | Built, tested; only the card-data backfill script waits for approval | [Confirmed: connector/tools/search-collection.ts] |
| 12 | CC-25 trade binder "PROPOSED" | Claude half built; database half is a draft | [Confirmed: collection-query.ts; supabase/drafts/20261118130000] |
| 13 | CC-26 roles "awaiting owner approval" | Dropped by D-063; code removed (c8a2ad7); empty tables remain | decisions.md D-063 |
| 14 | Mana by turn chart, mana production, live refresh, picklist simplification, automatic deck status | Built; no backlog row | reports 2026-11-18, 2026-11-21 |
| 15 | O-001 Moxfield "needs curl test" | Moxfield import built and used | [Confirmed: src/lib/moxfield-client.ts] |
| 16 | "Phase 3 CURRENT" in backlog-details; roadmap "Use what I own CURRENT" | Roadmap untouched since 2026-11-02; work moved to the connector and left rail | roadmap.md |
| 17 | "Break down deck" parked | Agrees: route exists, no button | [Confirmed: api/decks/[id]/breakdown] |
| 18 | UX-03/05/09/10 merged "2026-11-22" | Commits dated 2026-11-25 | git |
| 19 | CC-16/CC-17 "planning underway" | Nothing changed since 2026-11-17; only unapplied drafts | supabase/drafts |
| 20 | Import-cleanup brief header "DRAFT, nothing deleted" | Slices 1, 2, 4 done 2026-10-23; slice 7 not started | git c980283, 0853af1, 9c42cec |
| 21 | Briefs for the rail, Tags, categories-drive-health still "Draft, nothing built" | Built | briefs headers |
| 22 | backlog-details "pending correction": decisions say `get_collection_rollup` is live | AGENTS.md already corrected | AGENTS.md |

### Branches

All 8 branches are fully merged into `main` (0 unmerged commits). Local `cold-squid`, `fuzzy-quail`, `squalid-fish` are the same commit. Remote `brew-owner-fix`, `build-fix-route-export`, `cc04b-edits`, `cc04d-guide-switch`, `import-destination` are merged. Local `main` is 5 docs-only commits ahead of `origin/main`. 38 hidden checkpoint references from two editor tools are not branches and are not in `main` (see RC-51). No worktrees other than the main one. [Confirmed: area-docs.md section 6; `git branch -a` rerun]

### Open points (marked open; nothing decided here)

- **Hosted migration-history mismatch: OPEN.** Hosted ledger and local folder differ (83 match, 27 local-only, 17 hosted-only). The owner decided on 2026-11-22 to leave it alone. This audit does not repair it and makes no recommendation. A blanket database push stays unsafe.
- **Removals the owner approves:** the RC-xx items marked "confirm" in section B.
- **Parked features to revive or drop:** Reconcile shortage view (D-037), Break down button, Brew Canvas, in-app chat, game logging (CC-08), wishlist, mana curve slider (O-003), sideboard (UX-16), CC-16 and CC-17.
- **Approvals waiting:** RQ-12 Tags brief, Keep flag, HC-03 to HC-08, CC-14 card-data backfill, CC-25 database change, drafts for CC-16/17/18.
- **Database state not verified:** S3, S4, S5 (Strategy window fields, change reason, strategy replace), card-tag tables, trade-location flag. S5 is reported applied by D-062; the others are unverified.

## Open questions

For the owner (also in the Owner summary):

1. Remove the curve view and the Piled view? (RC-01, RC-02)
2. Chat: coming back or not? (RC-14 and linked items)
3. Retire the old importer? (RC-26)
4. Workbench, Analysis, Upgrade, Strategy tab, Combos: keep or remove? (RC-22 to RC-25)
5. One collection screen or two?
6. Collection status filter: make it work or remove it?
7. Is the live site on Vercel in use, and is `NEXT_PUBLIC_IMPORT_INTENT_SAVE` set there? If not in use, remove the "refresh prices" cron (RC-36).
8. Should "Clear All Data" stay, hidden unless local? (RC-37)
9. Should the search box that works without sign-in require sign-in? (see Verification, security note)
10. Is the precon list loaded in the live database? Is the Combos data wanted?
11. Black mana colour, narrow-width layout, site region, POLISH-01 spacing: open since 2026-11-21 and 22.

For Gene and agents: apply S3/S4/S5 state check (read-only), mark DB-6 drafts superseded, fix stale "NOT APPLIED" headers on 9 applied drafts.

## Verification

- Six area pieces (collection, import, decks, Claude, data, docs) were all present and full-length; none was thin. See `.agents/tasks/full-app-audit/merge-notes.md`.
- Resolved conflicts by direct reading: `sed -n 215,245p src/components/WorkbenchTab.tsx` and `grep -rn "<DeckCanvas" src` showed `showToolbar={false}` in the Workbench and the default (toolbar shown) only in the paused brew screen. The Curve view is hidden, not "still on screen".
- Caller searches re-run for about 60 candidates with `grep -rlE <pattern> src scripts tests` (results in section B column "Caller search"). Two area claims were corrected by this: `GET /api/collection/instances/[oracleId]` has no caller (only its `/ids` and `/details` sub-routes do), and `/api/cards/autocomplete` appears only in the public-route list.
- `git branch -a`, `git status --short`: 8 branches; untracked `.agents/tasks/` and two wireframe files.
- Not run: the app, the test suite, type check, lint, `knip` (relied on two area agents' runs), any database query. Test status taken from the last recorded run: 4,675 passing, 0 type errors, 1 lint error (git d49ff8f).
- Security note (not changed): `/api/cards/search` answers without sign-in, uses the all-access key and accepts a `deckId` from the caller. Reported by the import area. [Confirmed: src/middleware.ts:6, src/app/api/cards/search/route.ts:141]

---

# Report body

## A. Feature inventory summary

See `docs/oracle/feature-inventory.md`. 173 feature rows plus 25 page and API-folder rows. State counts for the 173: live and used 103, hidden behind a switch 9, half-built 14, abandoned 14, superseded 11, dead code 14, not built 8, built-not-merged 0. Every top-level page and API folder in `src/app` appears (rows 174 to 198). Features that depend on an unverified switch value: Import "I built it / I'm planning it" (row 50), the in-app chat (rows 162 to 165).

## B. Removal candidates, ranked by confidence and size

Sizes are lines (code and its own tests, from `wc -l` in the area pieces). "Caller search" is the check that backs the claim: **Re-run** means I ran it again for this report; **Area** means taken from an area piece's import graph or search.
"Locked/brief" means a locked decision or approved brief that depends on it.

### B1. High confidence: remove now (owner can still veto)

| ID | What it is | Size | Caller search | Why safe / what could break | Locked/brief | Recommendation |
|---|---|---|---|---|---|---|
| RC-01 | Workbench Curve view: `CurveView`, `CurveColumn`, `CurveCardRow`, `useCurveBuckets`, "curve" branches in `DeckCanvas`, `CanvasToolbar`, `brew-v2-types` | 4 files, 199 lines + ~15 lines in 3 shared files; no tests | **Re-run**: `grep -rlE "CurveView\|useCurveBuckets" src` finds only its own files and `DeckCanvas.tsx`; `WorkbenchTab.tsx:227-236` has `showToolbar={false}` | Hidden since 2026-08-19 (f66a510). Nothing stores `layoutMode`. Rail curve and Analysis curve are separate code. Only effect: the paused brew screen loses one layout option | None. D-008..D-011 and D-017 do not mention it | Remove now |
| RC-03 | Footer Deck health strip: `HealthStrip`, `DeckHealthButton`, `HealthPill`, `deck-health-chat-question`, 3 tests | 4 files + 3 tests, ~450 lines | **Re-run**: `grep -rlE "HealthStrip" src` finds only itself; `HealthPill\|DeckHealthButton` only the strip | Replaced by rail Deck health (DV-01, 89d2fc0). `DeckHealthPanel` and `GapDetail` stay | specs/whats-missing.md describes it (mark superseded). HC-08 plans the same removal | Remove now |
| RC-04 | Old deck header: `PersistentHeader`, `DeckEditor`, `KeyCardsSection`, `PrimerSection`, `WeaknessSection`, `RatingsSection`, `StrategyRow` and tests | 7 files + 6 tests, ~1,320 lines | **Re-run**: each name found only in its own file | Left rail replaced the header (89d2fc0). `StrategyRow` name also appears as a string in a connector tool; no import | UX-04/UX-14 become moot | Remove now |
| RC-05 | Old status controls: `StatusControl`, `StatusFilter` (deck one), `StatusBadge`, `StatusSectionDivider`, `DeckStatusCard`, `lib/deck-status.ts`, route `decks/[id]/status`, 2 tests | 7 files + 2 tests, ~820 lines | **Re-run**: `grep -rlE "lib/deck-status'" src` finds only these files; status route's only caller is `StatusControl` | Status is automatic. The Collection page has a different `StatusFilter` type; do not touch | D-059 and D-002 are about meaning, not this code. `breakdown` route loses its only former caller (RC-20) | Remove now |
| RC-06 | Old left sidebar and phone header: `Sidebar.tsx`, `MobileHeader.tsx`, `Sidebar.test` | 3 files, ~570 lines | **Re-run**: no import of `components/Sidebar`; `MobileHeader` found only in its own file | `TopNav` replaced them. The dead ⌘K handler lives here | None | Remove now, and drop the "⌘K" hint (or move the listener to the top bar first) |
| RC-07 | Eight unmounted brew screen pieces: `CandidateCard`, `CardRow`, `ChatPanel`, `InlineAssessment`, `SuggestionsTab`, `ConceptTile`, `DeckListTab`, `CardTooltip` and 3 tests | 8 files + 3 tests, ~2,215 lines | **Area**: knip (two agents) lists them unreachable. My regex re-check was too loose for `ChatPanel` and `CandidateCard` (similar names elsewhere) so I did not rely on it | Not imported by `BrewCanvas`, `BrewChatView` or the page | D-008..D-011 are about drag and commit, not these | Remove now (if RC-14 goes, these go with it) |
| RC-09 | Unmounted draft and prompt pieces: `DraftSessionTile`, `DraftDeckTile`, `RecommendationCard`, `InlineDeleteConfirmation`, `CardArtPreview`, `format-relative-time`, route `api/brew-sessions/[id]`, 3 tests | ~10 files, ~1,300 lines | **Re-run**: each found only in itself or in the draft tiles; `api/brew-sessions` caller is `DraftSessionTile` only | A user cannot resume a brew from the library today | DV-03 does not list these in "keep" | Remove now |
| RC-10 | Brew v2 routes with no caller: `api/brew/commit`, `api/brew/positions` | 2 files, 299 lines | **Re-run**: `grep -rlE "api/brew/commit"` and `api/brew/positions` over src, scripts, tests: no match | Callers were in unmounted `ChatPanel` | None | Remove now |
| RC-15 | Archidekt push stubs: `PushToArchidekt`, routes `decks/[id]/push`, `archidekt/create-deck`, `archidekt/write-tags` | 4 files, ~270 lines | **Re-run**: `grep -rlE "PushToArchidekt"` only itself; `archidekt/(create-deck\|write-tags)` no match; `/push` only from the component | Routes answer "dormant" (501). Archidekt import stays | None | Remove now |
| RC-16 | Auto-assign entry points: routes `allocation/resolve`, `decks/[id]/allocate`, `autoAssignAllBrewDecks`; `scripts/validate-allocation-resolver.ts` optional | 2 routes (77 lines) + function | **Re-run**: `allocation/resolve` and `/allocate` no match. `lib/auto-assign.ts` stays while `api/ai/brew/save` (RC-12) uses `autoAssignDeck` | D-020 and D-007 support removal | D-020, D-007 | Remove now |
| RC-18 | Orphan collection and card routes: `collection` (GET), `collection/instances/[oracleId]` (GET root only), `collection/allocation`, `collection/stats`, `collection/instances/free-proxies`, `cards/builder-status`, `cards/autocomplete` (+ its public-route entry) | 7 routes, ~880 lines + tests | **Re-run**: no match for `api/collection/allocation`, `api/collection/stats`, `free-proxies`, `builder-status`; `/api/collection/instances/${id}` is called only with `/ids` and `/details`; `cards/autocomplete` appears only in `src/middleware.ts` | Removing `autocomplete` also shrinks what is open without sign-in. `copy-availability.test` lists `collection/allocation`: edit one line | data-separation §5c lists `stats` as hardened | Remove now |
| RC-19 | Superseded deck routes: `decks/[id]/strategy`, `health/overrides` (+ `lib/health-store.ts`), `health/recheck`, `mana`, `overview`, `dead-weight` (GET only) | ~10 files, ~1,020 lines | **Re-run**: `/strategy`, `health/overrides`, `/mana`, `/dead-weight` no caller. `/overview` string matches an unrelated storage page; `health/recheck` matches only comments | Replaced by `strategy-window` and `health-settings`. Keep `dead-weight/dismiss` | contracts/deck-strategy.md and deck-health-phase2 §1.8 describe them (mark superseded). Table `deck_overview_content` becomes unused | Remove now |
| RC-21 | Strategy tab stubs: "Sync to Archidekt" fake success and "Add category" with no action | ~50 lines | **Area**: [Confirmed: StrategyTab.tsx:412-441, 596-603] | Removes a message that is untrue | HC-08 already says remove the stub; D-030 | Remove now (visible, tell owner; see slice 6) |
| RC-27 | Old three-choice import screen and legacy server modes `new_cards`, `built`, `importDeckNewCards`, `importDeckBuilt`, `INTENT_URL_MODE` | ~130 + 45 + ~210 lines, plus ~1,000 test lines partly | **Area**: `previewData` only ever set to null in `DeckImportButton.tsx`; server modes have no other caller | Screen cannot show. `importDeckTheorycrafted` must stay while RC-26 exists | import-cleanup slice 6 names it | Remove now |
| RC-29 | Unused libraries: `csv-deck-parser`, `scryfall-bulk-cache`, `CommanderSearch` (+test), unused part of `card-identity-store` (~800 of 943 lines; keep `ensureCardDefinition`) | ~1,760 lines | **Re-run**: `csv-deck-parser`, `scryfall-bulk-cache`: no non-test importer; `CommanderSearch` found in `NewDeckModal.tsx` only as a different local function | `identity-resolver.test.ts` has a type import to edit | None. D-001 replaced the old naming | Remove now |
| RC-31 | `CollectionValueBanner` and test | 265 lines | **Re-run**: found only in itself and a comment in an e2e spec | Replaced by the header number; the value route stays | T-51; close checklist C-03/C-04 | Remove now |
| RC-39 | Unmounted UI parts `ui/command`, `ui/input-group`, `ui/radio-group` and package `cmdk` | 3 files, ~395 lines | **Re-run**: `ui/command`, `ui/radio-group`: no importer; `ui/input-group` only imported by `command` | None | None | Remove now |
| RC-38 | Unused add-on packages `@phosphor-icons/react`, `@tanstack/react-query-persist-client`, `next-themes` | 3 packages | **Re-run**: no import anywhere (2 test files mock `next-themes`) | Lockfile changes | None | Remove now |
| RC-41 | Old one-time scripts that target dropped tables or the July local database: group A pipeline (`export-sqlite`, `transform-data`, `load-postgres`, `generate-mana-data`, `generate-upgrade-data`, `compute-deck-ratings`, `detect-dead-weight`, and 4 more), group B (seed and keyword scripts), duplicate `generate-coverage-report.ts` | about 17 files, ~3,680 lines | **Area**: knip plus reading; two import a module that does not exist | None run on a schedule. `generate-upgrade-data` also feeds RC-23 | None | Remove now (after RC-23 is decided) |
| RC-46 | Dead settings and flags: `SUPABASE_DEFAULT_USER_ID`, example entries `YOUTUBE_API_KEY`, `SUPABASE_EDGE_FUNCTION_URL`, stale `CRON_SECRET` comment, constant `DECK_DESTINATION_ENABLED`; flag `NEXT_PUBLIC_IMPORT_INTENT_SAVE` | 6 items | **Area**: grep of `process.env` | The intent-save flag must stay until its hosted value is known | None | Remove now, except the intent-save flag (check hosted value first) |
| RC-47 | Obsolete tests and skipped files: `migration-020.test.ts`, `card-identity-v2-checkpoint.test.ts` and others fully skipped | ~3 files, ~210 lines | **Area**: skip markers found by grep | Nothing runs them | None | Remove now |

### B2. Medium confidence: confirm with owner

| ID | What it is | Size | Caller search | Why not automatic | Locked/brief | Recommendation |
|---|---|---|---|---|---|---|
| RC-02 | Workbench Piled view: `PiledColumn` and "piled" branches | 197 + ~15 lines | **Re-run**: `PiledColumn` found in `DeckCanvas` and `CurveCardRow` | You have not said anything about Piled | None | Remove with RC-01 if the owner agrees |
| RC-08 | Deck chat stack: `DeckChatTab`, `useDeckChat`, `useSSEChat` (+test), route `decks/[id]/chat`, `OracleChat`, `OraclePromptCard` | 7 files, ~1,480 lines | **Re-run**: `DeckChatTab\|useDeckChat` found only in itself, its hook and a comment in `DeckCanvas`; `OracleChat` no importer | DV-03 says "keep the code"; nothing can mount them even with the switch on | D-063 (pause, not remove); DV-03 | Remove tab, hook and route; keep the side panel |
| RC-11 | Brew v2 routes `assess`, `extract` + `brew-v2-decisions`, `brew-v2-assessment-cache` | ~900 lines | **Re-run**: no match for `api/brew/assess` or `api/brew/extract` | Only named in the chat-pause test | DV-03 lists them as paused | Confirm together with RC-14 |
| RC-12 | Old AI brew routes `api/ai/brew/*` (7) and `brew-prompts` | ~3,500 lines | **Re-run**: `grep -rlE "api/ai/brew"`: no match | `ai-chat-switch.test.ts` names four of them | process.md ("delete the old version") | Remove after the owner's OK |
| RC-13 | EDHREC helper routes `ai/recommend`, `ai/build-deck`, `ai/mana-analysis` and `mcp-client` (+tests) | ~2,000 lines | **Re-run**: routes no match; `mcp-client` still imported by `tool-registry.ts` and two scripts | Needs `uvx mtg-mcp-server`, not part of the app. Clear the `tool-registry` import first | contracts/ai-recommendations-assessment-2026-09.md (docs) | Remove after OK; or rebuild later as connector tools |
| RC-14 | The whole paused chat and brew stack: side panel, session routes, `/new-deck`, brew canvas, provider layer, prompts, three AI SDK packages | about 15,000 lines (up to 25,000 with tests) | **Area**: all reached only via `NEXT_PUBLIC_AI_CHAT_ENABLED` | Giving up the comeback option | D-063, D-008..D-011, DV-03 | Owner decision. Keep for now |
| RC-17 | HTTP wrappers `allocation/candidates` and `candidates/batch` + test | ~270 lines | **Re-run**: no match for `allocation/candidates` | The lookup library (514 lines) is live; only the wrappers are unused | contracts/allocation-suggestion-engine.md names the batch route | Delete after amending the contract |
| RC-20 | Routes held for features that may come: `folders/[id]`, `import-alerts` (2), `breakdown` | ~280 lines | **Re-run**: `api/folders/` no match; `import-alerts` found only in its library | Owner may want folder rename and Break down | D-029, O-010 | Keep until the owner decides |
| RC-22 | Strategy tab (as a whole), `StrategyGuide`, `CommanderOverview` | ~1,300 lines | **Area** | Owner has not said whether the tab stays | brief deck-page-left-rail "replaces the Strategy tab" never approved | Keep only the build picker |
| RC-23 | Upgrade tab, its routes, `upgrade-pairing`, `dead-weight-classifier`, scripts | ~3,500 lines | **Area** | No way to produce new suggestions; Refresh wipes data | D-036(a), contracts/advisor-tools.md | Remove, or minimum fix the Refresh |
| RC-24 | Workbench tab | 240 lines (canvas shared with brew) | **Re-run**: `<DeckCanvas` mounted in `WorkbenchTab`, `BrewCanvas`, `DeckChatTab` | Drag-to-category broken, positions not saved, no spec | UX-13 audit queued | Remove or fold into UX-13 |
| RC-25 | Combos tab and `deck_combos` data | ~130 lines | **Area** | Data frozen since July | backlog "combo notes" | Keep, mark stale |
| RC-26 | Old onboarding importer: page, 12 `api/onboarding` routes, reconciliation components, `warm-start-*`, `import-sleeve-claims`, `import-allocation-state` | 35 files, ~6,800 lines | **Re-run**: `src/app/page.tsx:207` is the only entry (grep "onboarding" shows page, settings, reconciliation files) | Home page for a new empty account changes; `page.test.tsx` expects it | import-cleanup slice 7; D-018, D-020..D-022 written for it | Confirm; biggest single removal |
| RC-28 | Old collection import modes (add, sync, upsert, replace), `import-engine-v2` (1,368 lines), `csv-normalizer` | ~2,500 lines | **Area**: dialog always sends `mode=manabox` | D-054 made the new screen read other layouts, which was the reason to keep them | brief Q3 said keep | Confirm |
| RC-33 | `generic-count-queue` (+test) | 89 lines | **Re-run**: no importer | It is the unfinished piece of generic-land +/- | D-032; backlog parked item | Use it or delete |
| RC-34 | Shared "vocabulary" building blocks (`CheckNotice`, `DeckStateBadge`, `FinishTag`, `PriceText`, skeletons) | ~780 lines | **Re-run**: `components/vocabulary` imported only by `MovedSlotNote` | T-26 parked | D-043 locks words, not these components | Keep if T-26 resumes, else delete |
| RC-35 | `CardDataStaleNotice` | 67 lines | **Re-run**: found only in itself | You may want a stale-data warning | report 2026-10-20 | Mount or delete |
| RC-36 | Cron `api/cron/refresh-prices` and `vercel.json` entry | 121 lines | **Area**: only `vercel.json` and one e2e line name it | Name says prices, job refreshes card text; Vercel use unclear | D-042 | Remove if Vercel is not in use |
| RC-37 | Settings "Clear All Data" and `api/dev/reset` | ~90 lines | **Re-run**: only caller is `settings/page.tsx` | Returns "not available" on the live site and misses several tables | AGENTS rule 5 | Hide unless local, or remove |
| RC-40 | Packages `youtube-search-without-api-key`, `youtube-transcript`, `youtubei.js` | 3 packages | **Area**: only `research/scripts` import them | Breaks those research scripts | None | Remove with RC-49 |
| RC-42 | Scripts group C (one-off fixes, audits) and D (commander insight generators with missing input folder) | ~4,700 lines | **Area** | May be templates | None | Confirm |
| RC-43 | Commander-context snapshot: 34 MB file, `lib/commander-context` snapshot modes, `export-commander-context`, `better-sqlite3` | ~1,650 lines + 34 MB | **Area**: default is `supabase` | Cuts an offline fallback | vector trial closed 2026-11-10 | Confirm |
| RC-44 | CC-26 empty hosted tables DB-1 to DB-5 and drafts DB-6 | 5 tables, ~2,100 lines of drafts | **Area**: no table name in `src` or `scripts` | Dropping is destructive (AGENTS rule 5) | D-063 says tables stay until a separate approved cleanup | Mark DB-6 superseded now; drop tables only after approval and a read-only check |
| RC-45 | Stale draft duplicates and headers saying "NOT APPLIED" on applied files (9 files) | headers only | **Area** | Documentation only | Gene and Architect own drafts | Fix headers; archive duplicates with Gene |
| RC-48 | Old docs, specs, mockups, contracts (CC-26 set, import-redesign family, whats-missing, old roadmaps, competitor notes, user guide, `.kiro/specs` 2.1 MB) | ~2 MB of notes | **Area** (docs agent) | History value; some still cited | D-063 | Archive, do not delete; add "superseded" banners |
| RC-49 | `research/` (94 files, 211,000 lines of JSON and HTML) and `reports/evidence` (25 MB) | 94 files + 25 MB | **Area** | History | None | Archive or move out of git with owner OK |
| RC-50 | Switched-off GitHub workflows (4) and old browser tests (`tests/e2e`, `tests/db-perf`) | 12 files, ~3,000 lines | **Area** | Only browser safety net, but off and stale | T-43, T-45 | Confirm |
| RC-51 | Branches and hidden checkpoint refs (8 branches merged; 38 hidden refs) | n/a | **Re-run**: `git branch -a` | Owner decides deletion; hidden refs may hold early-November work | none | Delete merged branches with owner OK; leave hidden refs until reviewed |
| RC-52 | Inert "Wishlist" tick on the old import screen: `WishlistCheckbox`, `onboarding/reconciliation/instance/wishlist` | ~100 lines | **Re-run**: `WishlistCheckbox` found in `ConflictCard` only | Saves a flag nothing reads | CC-18 (wishlist unbuilt) | Goes with RC-26 |

### B3. Keep or fix, not remove

- RC-30: `import-deck-placement` (+test, 248 lines) mirrors the applied database function; `ref-card-backfill*` (416 + 508 test lines) feed the unapplied CC-14 script. Keep until CC-14 is decided.
- Collection old client-side filter functions (about 240 lines) can go after the status filter is fixed or dropped. Not given an ID because it depends on question 6.
- `lib/copy-availability.ts` imports a types file from `docs/oracle/contracts/`, so removing the docs folder would break the build. Move the types file before archiving (RC-48).
- `src/types/supabase.ts` (2,670 lines) is stale; regenerate rather than remove.

## C. Started-and-left list

Items are grouped by what to do. Dates are first and last activity found in git or notes.

**Drop (owner agrees):** Workbench curve and Piled layouts (2026-06-30, 2026-08-19); post-game debrief (removed 2026-08-12, tables left); goldfish tab and Precon Mod Tracker (removed 2026-08-12, user guide still teaches them); CC-26 roles and jobs (2026-11-18 to 11-20, dropped by D-063); CC-24 overlap warning (dropped 2026-11-18); in-app AI advisor M2 (2026-09-29 to 2026-11-11, replaced by the connector); Archidekt push (2026-07, last 2026-10-11); auto-assign (2026-07-14); Card Kingdom (removed 2026-10-11); old brew v1 routes (last 2026-11-19, only switch lines); deck chat tab (unmounted since 2026-11-02); sidebar and ⌘K (2026-07-05).

**Finish (small or approved):** Collection status filter (control does nothing); Reconcile shortage view D-037 (spec and mockup 2026-10-10, parked 2026-11-11); CC-14 card-data backfill (needs one approval); CC-25 trade box (apply database change and add one switch); owner click-through of the connector (CC-05, 12 steps); live Claude checks (TEST-02); one click-through for T-52 and T-51; Upgrade Refresh fix; HC-03 to HC-08 (owner to decide); import intent save (owner to confirm the hosted switch).

**Park (waiting on priority):** CC-16 Claude runs Picklist and boxes, CC-17 Claude imports decks, CC-18 wishlist (all 2026-11-17, nothing since); CC-08 game logging; D-059 Unowned state and Use proxies switch; UX-01, UX-12, UX-15 collection controls; Break down button; generic basic land +/-; shared vocabulary building blocks (T-26); mana-curve slider; backups plan (T-44); RQ-02 to RQ-14 proposals; Option B faster deck opening; deck reorder polish.

**Unclear (owner to say):** Combos tab (stale data); Precon list loaded in the live database; scan-wins import mockup (2026-11-03); Black mana colour; narrow-width layout; site region; left-to-right wireframe files (untracked, 2026-11-25).

## D. Stored-data audit

### D1. Migrations applied versus in the repo

[Confirmed: `supabase migration list --linked`, run by the data agent 2026-11-26; read-only]

- 110 local migration files. 83 match the hosted history.
- 27 local files are not in the hosted history (applied another way). Versions run from 20261111120000 to 20261122120000, including the data-separation (CC-03), connector, picklist and deck-order changes.
- 17 hosted entries have no local file. Their timestamps look like the same changes under other version numbers; pairing is [Approximate].
- **Open point (not decided here): the owner decided to leave this mismatch alone.** A blanket database push is unsafe.

### D2. Drafts never applied (or not verified)

| Draft | State | Evidence |
|---|---|---|
| CC-16 picklist and boxes, CC-17 import deck list, CC-18 wishlist | Not applied. Approved work, no code | Nothing in `src` references `ai_picklist`, `ai_import_deck_list`, `wishlist_items` |
| CC-26 DB-6 and DB-6b (969 lines) | Not applied, abandoned | Architect audit 2026-11-19: discard; D-063 |
| CC-25 trade locations | Not verified. App code tolerates absence | `collection-query.ts` ignores an error that mentions `is_trade` |
| S3 strategy-window fields, S4 change reason, S5 strategy replace | Not verified; probably applied (code calls the S4 function; D-062 reports S5 applied) | `write-gateway.ts`, `deck-strategy-window-server.ts` |
| Tags fill (`ref_tag_list`, `ref_card_tags`) | Not verified; probably applied. Fill job may never have run on the hosted database | `fill-card-tags.ts` refuses to run until tables exist |
| CC-14 backfill script and manifest | Not applied; owner approval pending | README |
| 9 drafts whose header says "NOT APPLIED" but are applied or stale duplicates (connector, insert-user-copies, drop-dead-rollup, CC-26 DB-1..5) | Header wrong | Data agent section 1.2 |

### D3. Unused tables, columns, functions

- **Tables nothing in the app reads or writes:** `ref_card_roles`, `user_card_roles`, `deck_card_jobs`, `deck_strategy_points`, `deck_health_targets` (applied, empty); `commander_content`, `commander_strategies`; `debrief_sessions`, `debrief_actions`, `deck_priority`; `precon_cards`, `precon_mod_state`; `ref_edhrec_recommendations`; `sync_runs` (scripts only); `deck_leaderships`, `deck_leadership_cards`; `deck_documentation` (reset route only); `_migrations`; `oracle_to_printings`, `printing_set_info` (likely gone from the hosted database). [Confirmed: grep of `src` and `scripts`; hosted existence and row counts not verified]
- **Tables written only by routes with no caller:** `deck_overview_content` (route `overview`), partly `deck_ratings`, `deck_combos`, `deck_upgrades` (written by scripts, read by live tabs showing stale data).
- **Functions with no app caller:** `get_import_allocations`, `get_import_conflicts`, `resolve_import_conflict_proxy`, `resolve_import_conflict_release`, `set_import_claim_resolution`, `mark_copy_missing`, `unmark_copy_missing`, `delete_user_copies`, `get_next_deck_version_number`, `archive_old_oracle_sessions`. Which still exist on the hosted database was not checked.
- **Column drift:** the generated types file lacks about 25 newer tables and functions and still lists dropped ones (`get_collection_rollup`, `get_shared_cards`, the `collection_rollup` view).

### D4. Could not verify

- Everything in the hosted database: table contents, row counts, which drafts are applied, which functions exist. No query was run.
- Vercel and GitHub settings: whether the chat switch, import intent switch, the daily job and the four workflows are on.
- Whether any "no caller" route is used from outside the repo.
- Application behaviour on screen: nothing was clicked. "Live and used" means reachable in code with a caller.
- Tests were not re-run.
- About 330 of 393 report files were read by title and status only.
