# Area report: notes and history (docs audit)

Role: Developer (read-only audit). Status: DONE (with the limits in section 8).
Scope: every note under `docs/`, `.kiro/specs/`, `.agents/tasks/` (except `full-app-audit/`), and git history on every branch. No code, migration, decision, package or database was changed. Nothing was committed, pushed or deleted. This file is the only thing written.
Base: `main` at 127e472 (5 docs-only commits ahead of `origin/main` = 89430e0).
Tags: `[Confirmed: path]` means I read it. `[Approximate]` means inferred from titles, filenames, summaries or a grep, not read in full.

Headline numbers: 1,121 commits on main; 393 report files (about 34 MB, of which 25 MB is `reports/evidence` screenshots); 58 contract files (1.3 MB); 27 mockup files (1.2 MB); 19 specs (0.5 MB); 18 briefs; 48 `.kiro/specs` folders (2.1 MB, last touched 2026-09-26); 8 branches, every one fully merged into main (0 unmerged commits); 38 hidden checkpoint refs from two AI tools.

---

## 0. The owner's example: the curve view in the Workbench

**What the notes say: nothing.** No file under `docs/oracle/` mentions a "curve view", a Workbench layout mode, or a decision to drop it. The backlog, reports, briefs and decisions are silent on it.

**What the history says.**
- 2026-06-30: the Brew Canvas shipped with three layout modes: free-form, piled by category, mana curve [Confirmed: `.kiro/specs/brew-canvas-redesign/delivery-log.md`].
- 2026-07-05: first full-app commit contains the canvas (91bc9a2).
- 2026-08-12: `SPEC-VALIDITY-AUDIT.md` still calls `brew-canvas-redesign` "Valid" [Confirmed: `.kiro/specs/SPEC-VALIDITY-AUDIT.md`].
- 2026-08-19: commit f66a510 "refactor(workbench): hide toolbar for minimal freeform canvas". Its message: "User requested a clean canvas with just cards that can be moved around. Removing toolbar hides layout modes (piled/curve), view density toggles, and group-by-category button." The Workbench has passed `showToolbar={false}` and `initialLayoutMode="free-form"` since [Confirmed: git show f66a510; `src/components/WorkbenchTab.tsx` lines 234-235].
- So the curve view was switched off by hiding its button, 2026-08-19, and never removed. The code still exists: `CurveView.tsx`, `CurveColumn.tsx`, `CurveCardRow.tsx`, `useCurveBuckets.ts` (about 5 KB), plus `PiledColumn.tsx` (6 KB, the piled mode, also unreachable the same way) and the mode switch in `CanvasToolbar.tsx`. `DeckCanvas` is also used by `BrewCanvas.tsx` (passes a no-op layout-mode handler, so also free-form only) and `DeckChatTab.tsx` (the in-app chat, paused by DV-03). [Confirmed: grep of `src/`; whether the toolbar is hidden in those two callers is [Approximate].]

**Do not confuse with the other curves.** (a) The deck page left rail has its own, newer, clickable Mana curve (commit a4b1568, 2026-11-21; tallest bar fixed at 50 px in 98feacf). It is live and in the Figma design [Confirmed: `reports/2026-11-22-developer-mana-curve-50px.md`]. (b) `AnalysisTab.tsx` has a separate mana curve chart [Confirmed: `src/components/AnalysisTab.tsx` line 645]. (c) O-003 "Mana curve slider" is a never-specced idea, listed as Open in decisions.md, as a candidate in backlog-details, and as "parked" in backlog.md.

**Recommendation (not a decision):** removal candidate; see section 7 for owner approval. Dropping the curve and piled modes also makes `CanvasToolbar` mostly dead for Workbench; the code agents should confirm what else `DeckCanvas` needs.

---

## 1. Initiative table

Dates are the earliest and latest dates I saw in the notes (filenames, status lines, commit dates), not guaranteed first or last. "BL" = backlog.md (short), "BD" = backlog-details.md (full). Outcome words: FINISHED, DROPPED, PARKED, SUPERSEDED, UNDECIDED, PARTIAL.

### 1a. Deck page, rail and Claude-in-deck

| Initiative | First | Last | What the notes claim | Outcome | Evidence |
|---|---|---|---|---|---|
| Workbench curve and piled layouts | 2026-06-30 | 2026-08-19 | No note claims anything. Commit message says owner asked for a clean canvas. | DROPPED in practice (hidden, not removed; never recorded) | `.kiro/specs/brew-canvas-redesign/delivery-log.md`; git f66a510 |
| Deck page left rail (DV-01) | 2026-11-19 | 2026-11-22 | BD: BUILT and on main. BL: still lists "audit deck header", "move header into sidebar", "Deck health beside slot bar / remove footer" as unfinished. | FINISHED (BL stale; see section 2) | `backlog-details.md` DV-01; commit 89d2fc0 |
| Rail redo to Figma (steps 1-3, FEAT-001..003) | 2026-11-20 | 2026-11-22 | Reports DONE/PARTIAL. Not a row in either backlog. | FINISHED; polish open (POLISH-01) | `reports/2026-11-21-developer-deck-rail-figma-redesign.md`; `-deck-health-settings.md` (PARTIAL) |
| Strategy block and window (DV-02) | 2026-11-19 | 2026-11-20 | BD: BUILT. Autosave and Claude rewrite 11-20 (D-062). BL silent. | FINISHED | `reports/2026-11-19-developer-slice-1-strategy-window.md`; D-062 |
| Deck Intent form removal | 2026-11-19 | 2026-11-19 | Report DONE. Not in either backlog. Side effect: win condition and budget have no edit form anywhere (values kept, Claude still reads them). | FINISHED, side effect unowned | `reports/2026-11-19-developer-deck-intent-removal.md` |
| Pause in-app AI chat (DV-03) | 2026-11-19 | 2026-11-19 | BD: BUILT. D-063 locks it. BL: "Revisit the older in-app advisor design" under Parked. | PARKED by decision (code kept, entry points hidden) | D-063; `reports/2026-11-19-developer-dv03-chat-pause.md` |
| Reason on every Claude change (DV-04) | 2026-11-19 | 2026-11-19 | BD: BUILT; "whether S4 applied NOT verified". | FINISHED in code; DB state unverified in BD | `backlog-details.md` DV-04; `supabase/drafts/20261119110000_s4_claude_change_reason.draft.sql` still in drafts |
| Live refresh when Claude edits | 2026-11-19 | 2026-11-19 | Report DONE. Not in either backlog. | FINISHED | `reports/2026-11-19-developer-live-refresh.md` |
| Card details modal (replaces old card window) | 2026-11-18 | 2026-11-20 | Slices 1 and 2 DONE (deck context, collection context, speed). Not in either backlog. BL/BD still list UX-02 "click a collection card opens editing window" and UX-12 "show locations" as TODO. | FINISHED (backlog stale) | `reports/2026-11-20-developer-card-details-modal-slice-1.md`, `-slice-2.md`, `-card-details-speed.md`; commit c8a2ad7 |
| Card roles and deck jobs (CC-26) | 2026-11-18 | 2026-11-20 | BD: "PARTLY BUILT; proposed to be partly superseded, awaiting owner approval". D-063 (2026-11-19) already says dropped in principle. Roles UI and route removed in c8a2ad7. | SUPERSEDED (by D-063, RQ-12 Tags, DV-02); BD row not updated | `decisions.md` D-063; `reports/2026-11-19-architect-conflict-list.md`; `briefs/card-roles-and-deck-jobs.md` (62 KB) |
| Card Tags (RQ-12; folds RQ-01, RQ-10) | 2026-11-16 | 2026-11-20 | BL/BD: "Brief and design drafted, awaiting approval. Not built." Reports: tags fill DONE, tag display DONE, Why/rarity DONE. | PARTIAL: read-only Tags shown and filled from Scryfall tags; AI pass and 40-tag list approval open. Backlog says "not built". | `reports/2026-11-20-developer-tags-fill.md`, `-card-tags-display.md`, `-card-tags-why-rarity.md`; commit 79ac34d |
| Why and Keep on a deck card | 2026-11-19 | 2026-11-20 | BL: "awaiting your approval". Migrations `20261120110000_why_here_deck_cards.sql` and `20261120120000_card_why_claude_write.sql` are in `supabase/migrations/`. | Why: BUILT (Keep flag: not found in notes) | migrations folder; report `-card-tags-why-rarity.md` |
| Categories drive Deck health (HC-01..HC-08) | 2026-11-20 | 2026-11-21 | BD and BL: all PROPOSED, "neither approved nor cancelled". Reports: HC-01 DONE, HC-02 DONE (2026-11-20), D-061 locked 2026-11-20 on this brief, deck health settings migration applied 2026-11-21. | PARTIAL: HC-01, HC-02 built; HC-03..HC-08 not seen. Backlog wrong. | `reports/2026-11-20-developer-hc-01-default-ranges.md`, `-hc-02-category-plumbing.md`; D-061; `reports/2026-11-21-developer-custom-categories-from-deck.md` |
| Deck health (older design, "What's missing" Phase 2, S1-S5) | 2026-11-11 | 2026-11-12 | BD: S1, S3, S4, S5 merged; S2 on branch `deck-health-s2`; polish branch `deck-health-polish` "pushed, not merged". | SUPERSEDED by the rail's health tiles and HC-01 (branches since merged or gone). | `reports/2026-11-11-developer-deck-health-s1..s4.md`; `specs/whats-missing.md`; `mockups/whats-missing.html` |
| Mana by turn chart / mana production | 2026-11-21 | 2026-11-22 | Reports DONE. Brief `briefs/mana-by-turn-chart.md`. Not in either backlog. | FINISHED | `reports/2026-11-21-developer-mana-by-turn-chart.md` |
| Mana base maths (RQ-13) | 2026-11-19 | 2026-11-20 | PROPOSED. Partly overlapped by HC-06/HC-07 and the rail's mana production with opening-hand odds. | UNDECIDED, partly absorbed | BD RQ-13; `reports/2026-11-21-developer-deck-rail-figma-redesign.md` |
| Bracket check (RQ-14) | 2026-11-19 | 2026-11-19 | PROPOSED; BL "New 2026-11-19". Bracket 5 allowed, warning "built but hidden until Oracle..." | UNDECIDED | BD RQ-14; `reports/2026-11-19-developer-slice-1-strategy-window.md` |
| Deck rename and reorder (UX-03, UX-05) | 2026-11-17 | 2026-11-25 | BD/BL: finished. Tester report PARTIAL (no browser run); reorder slice report PARTIAL; polish items (slide animation, reduced motion, tilted drag) not built. | FINISHED; polish open | `reports/2026-11-25-tester-deck-rename-reorder.md`; `-deck-reorder-slice2.md` |
| Faster deck open (UX-09) and icon font (UX-10) | 2026-11-17 | 2026-11-25 | Finished. Option B (start Deck health with the deck) not built, "later choice". | FINISHED; Option B UNDECIDED | `reports/2026-11-22-developer-deck-open-speed-and-icon-font.md` |
| Figma spacing polish (POLISH-01) | 2026-11-22 | 2026-11-22 | PROPOSED; owner has not chosen. | UNDECIDED | `.agents/tasks/2026-11-22-figma-text-line-gap-check.md` |
| Deck header audit (UX-04), header to sidebar (UX-14), Deck health beside slot bar (UX-11), audit Workbench/Analysis (UX-13) | 2026-11-17 | 2026-11-22 | BD: TODO queued. DV-01 says it "replaces the deck header, slot-usage bar and Deck health footer", and commit 89d2fc0 removed them. | SUPERSEDED by DV-01 (UX-04, UX-11, UX-14); UX-13 still open | `backlog-details.md` UX rows vs DV-01 |
| Deck status Draft/Assembling/Playable then "Brewing" | 2026-09-29 | 2026-11-18 | D-002 = Draft/Assembling/Playable. D-059 = Unowned/Assembling/Playable (not started). Built 2026-11-18 = Brewing/Assembling/Playable, active flag removed. | FINISHED differently from both decisions (drift, section 5) | `reports/2026-11-18-developer-deck-automatic-status.md`, `-rename-draft-to-brewing.md`; commits 3881ac7, b637d79 |
| Sideboard support (UX-16) | 2026-11-17 | 2026-11-17 | TODO queued. D-058 "Companion slot only for now". | UNDECIDED | BD UX-16; D-058 |
| Salt score in deck header | 2026-08-12 | 2026-08-12 | No notes. Header removed with DV-01. | DROPPED silently (not recorded) | git 7073e63; commit 89d2fc0 [Approximate] |

### 1b. Claude connector

| Initiative | First | Last | Claim | Outcome | Evidence |
|---|---|---|---|---|---|
| Connector core (CC-01..CC-05, D-034a) | 2026-11-16 | 2026-11-17 | DONE; one owner step left: 12-step click-through. | FINISHED, click-through unconfirmed | `reports/2026-11-17-gene-cc05-close.md`; `drafts-gate5-claude-connector.md` |
| Data separation (CC-03a/b/c/d) | 2026-11-16 | 2026-11-25 | DONE and applied live. Migration history on hosted DB does not list CC-03c, CC-03d, sign-in migrations. Owner decided 2026-11-22 to leave it. | FINISHED; mismatch accepted | BD TIDY-03 |
| Card facts and deck health for Claude (CC-06), collection search (CC-07) | 2026-11-16 | 2026-11-17 | DONE; second-account isolation test deferred (accepted risk); live Claude scenarios never run (TEST-02). | FINISHED, unverified live | BD CC-06, CC-07, TEST-02 |
| Bigger Claude edits (CC-13) | 2026-11-17 | 2026-11-17 | BD: DONE and applied and verified live 2026-11-17. BL: "Partly built; the stored-data change is still awaiting approval." | FINISHED (BL wrong) | BD CC-13; migration `20261117100000_cc13_loosen_limits.sql` |
| Create decks through Claude (CC-15) | 2026-11-17 | 2026-11-18 | Built; real-chat check not done. | FINISHED, unverified live | BD CC-15 |
| Storage and Picklist through Claude (CC-16) | 2026-11-17 | 2026-11-17 | APPROVED; BL: "planning underway". Draft `20261117200200_cc16_picklist_and_boxes.draft.sql` unapplied in drafts. | STARTED-AND-LEFT (section 4) | BD CC-16; `supabase/drafts` |
| Import decks through Claude (CC-17) | 2026-11-17 | 2026-11-17 | Same as CC-16. Draft `...cc17_import_deck_list.draft.sql`. | STARTED-AND-LEFT | BD CC-17 |
| Buying list (CC-18, CC-19) / wishlist | 2026-11-17 | 2026-11-17 | Buying list built, live-checked; wishlist not built. Draft `...cc18_wishlist.draft.sql`. | PARTIAL | BD CC-18, CC-19 |
| Search improvements (CC-14), search by text etc. | 2026-11-17 | 2026-11-18 | BL: "build started". Report DONE; card-data backfill script not run, awaiting approval. | PARTIAL | `reports/2026-11-18-developer-cc14-search.md`; `supabase/drafts/cc14-backfill-ref-cards.*` |
| Trade binder location type (CC-25) | 2026-11-18 | 2026-11-18 | BL: new item. Report DONE but DB change "only a draft"; stop-gap rename to Black Binder applied. | STARTED-AND-LEFT | `reports/2026-11-18-developer-cc25.md`; `20261118130000_cc25_trade_locations.draft.sql` |
| Overlap warning between decks (CC-24) | 2026-11-18 | 2026-11-18 | DROPPED by owner (a deck list is a plan, not a claim). | DROPPED | BD CC-24; commit 085e7bd |
| Colour check on add (CC-21), category on add (CC-22), stale deck list (CC-23), empty-list wording (CC-19) | 2026-11-17 | 2026-11-17 | DONE; real-chat checks pending. | FINISHED | BD CC-21..23 |
| Loophole: "In your hand" refusal wording (CC-20) | 2026-11-17 | 2026-11-17 | PROPOSED, "take it when CC-13 applied". CC-13 applied same day. | UNDECIDED, probably forgotten | BD CC-20 |
| Set-card-category tool (CAT-01) | 2026-11-16 | 2026-11-17 | Built, DB applied, never tried live. | FINISHED, untested live | BD CAT-01 |
| Category management, suggested categories (briefs) | 2026-11-16 | 2026-11-16 | DRAFT, not approved. Superseded in practice by HC-02 and custom-categories-from-deck. | UNDECIDED / superseded | `briefs/category-management.md`, `briefs/suggested-categories.md` (both still "NOT approved") |
| Game logging and playgroup (CC-08) | 2026-11-16 | 2026-11-17 | Approved, scheduled last. Pulled forward from O-004. | PARKED (scheduled, not started) | BD CC-08; `briefs/game-logging-and-playgroup.md` |
| CC-10 (facts for ~100 cards) and CC-11 (categories for connector) | 2026-11-17 | 2026-11-18 | BACKLOG. CC-14 item 5 "folds in CC-10". BL lists "fill in missing card information... build started". | PARTIAL / overlapping | BD CC-10, CC-11, CC-14 |
| Per-deck notes and decision log; strategy advice with EDHREC; category rename/merge | 2026-11-17 | 2026-11-19 | "Later (owner chose, not yet scheduled)". The first was largely replaced by the Strategy window. | UNDECIDED | BD "Later" paragraph; BL More Claude improvements |

### 1c. Collection, storage, Picklist, import

| Initiative | First | Last | Claim | Outcome | Evidence |
|---|---|---|---|---|---|
| Picklist (all-decks, ticks, In your hand, Missing, Unsorted) | 2026-11-12 | 2026-11-18 | Built; click-through not done (TEST-01). "Missing" pages built even though D-028 retired Missing. | FINISHED; contradicts D-028 (section 5) | BD "Daily-use deck workbench" updates; `reports/2026-11-16-developer-picklist-*.md`; `specs/know-where-cards-are.md` |
| Picklist simplification (derive from deck cards) | 2026-11-18 | 2026-11-18 | Report DONE. Not in backlog. | FINISHED | `reports/2026-11-18-developer-picklist-simplification.md` |
| Import destination (boxes, decks) | 2026-11-13 | 2026-11-17 | LIVE; deck destination switch on; browser click-through not done. | FINISHED | BD; `reports/2026-11-16-developer-import-destination-i2*.md` |
| ManaBox import (T-53..T-57) | 2026-10-13 | 2026-11-11 | T-55, T-56, T-57 DONE (T-57 migration "never applied, dropped"). | FINISHED; foil on deck-imported copies in doubt | BD T-55..T-57; `contracts/manabox-import.md` |
| Collection import with no Scryfall ID (T-58) | 2026-10-23 | 2026-11-11 | PARKED; BL "Recheck... fresh check". | PARKED | BD T-58 |
| Import redesign family (reconciliation T-22/T-24/O-005, import-intent, row editing, stage screens, review controls, simplified, scan-wins, modal redesign) | 2026-09-26 | 2026-11-04 | Rebuilt at least six times (stated in process.md). The 2026-11-04 modal redesign says "Saving is still switched off". Scan-wins mockup "ready for owner approval; no code started" (BD, 2026-11-03). | Several SUPERSEDED; scan-wins UNDECIDED; deck import save path with other-deck sources unverified | `process.md`; `reports/2026-11-04-developer-import-modal-redesign.md`; `reports/2026-11-03-designer-scan-wins-review.md` |
| Import cleanup (brief) | 2026-10-23 | 2026-10-23 | Slices 1, 2, 4 done (c980283, 0853af1, 9c42cec). Slices 6, 7 (retire onboarding) not seen. Brief header still says "DRAFT, nothing deleted". `src/app/onboarding` still exists. | PARTIAL; brief stale | `briefs/import-cleanup.md`; git |
| Precon tab (P1) | 2026-10-23 | 2026-10-23 | Brief: "FIX not delete". Backend and API built (768bb0d, 212ca56). No later note. | UNDECIDED / unknown | commits above [Approximate] |
| Commander section, co-commanders, command zone, companion (T-61/T-62) | 2026-10-23 | 2026-11-02 | DONE per reports; no backlog row. | FINISHED | `reports/2026-11-02-developer-co-commanders.md`; D-058 |
| Generic basic lands | 2026-10-21 | 2026-10-21 | Built. BL: "Finish controls for generic basic lands and remaining deck-state work" under Parked. | FINISHED / BL parked line stale [Approximate] | `contracts/generic-basic-lands.md`; commits 5383e8d..fba0969 |
| Collection value banner and Add proxy for unowned (T-51, T-52; checklist C-01..C-04) | 2026-10-13 | 2026-11-11 | PARKED; checklist lines Fail since 2026-10-13. BL: "Check the collection value banner and adding a proxy for an unowned card". | PARKED, never rechecked | `owner-checklist.md`; BD T-51, T-52 |
| Original-copy shortage view / Reconcile (D-027, D-037, T-29, T-37) | 2026-09-29 | 2026-11-11 | D-037 locked; T-37 build PARKED; spec T-29 PARKED. | PARKED (decision locked, never built) | BD T-29, T-37; `specs/reconcile-original-shortages.md` |
| Break down button (O-010) | 2026-09-29 | 2026-09-29 | "No on-screen button; Phase 7." | PARKED | BD O-010 |
| Collection UX queue: location switcher (UX-01), edit counts (UX-15), buttons (UX-07), Tools menu (UX-08), icons (UX-06) | 2026-11-17 | 2026-11-17 | TODO queued. | UNDECIDED | BD UX rows |
| Wording: In deck / Planned (WORDS-01), action word Sleeve (WORDS-02) | 2026-11-17 | 2026-11-25 | DONE; owner keeps "Sleeve". Gene still to record amendment (needs approval). | FINISHED; decisions.md not updated | BD WORDS-01, WORDS-02 |
| Vocabulary and shared building blocks (T-25, T-26) | 2026-10-12 | 2026-11-11 | T-25 DONE (D-043). T-26 PARKED. Phase 3 "CURRENT" in BD but PARKED in roadmap. | PARTIAL / PARKED | BD Phase 3; roadmap Phase 3 |
| Type line alignment, DFC front face | 2026-11-18 | 2026-11-18 | Reports DONE. Not in backlog. | FINISHED | `reports/2026-11-18-developer-type-line-alignment.md`, `-dfc-front-face.md` |
| Purple primary colour, mana colours | 2026-11-21 | 2026-11-21 | Reports DONE; Black mana colour reverted and left as owner question. | FINISHED; owner question open | `reports/2026-11-21-developer-purple-primary.md`, `-mana-colours.md`; commit e214ee3 |

### 1d. Foundations, advisor, older plans

| Initiative | First | Last | Claim | Outcome | Evidence |
|---|---|---|---|---|---|
| Phase 1 safety net | 2026-10-11 | 2026-10-11 | DONE; backups deferred. | FINISHED; backups UNDECIDED | `roadmap.md`; T-44 |
| Phases 3-10 of the roadmap | 2026-10-11 | 2026-11-02 | Parked by owner 2026-11-02 until "Use what I own" works on three real decks. | PARKED (roadmap itself stale; see section 2) | `roadmap.md` |
| Use what I own (interim slice) | 2026-11-02 | 2026-11-02 | CURRENT per roadmap. Slices a-c built; chat that carried it paused 2026-11-19 (D-063). Exit test (three real decks) never recorded. | SUPERSEDED by Claude connector | `briefs/use-what-i-own.md`; `reports/2026-11-02-developer-uwio-slice-*.md`; D-063 |
| AI advisor contracts (T-14..T-19, T-36, advisor-tools) | 2026-09-25 | 2026-11-11 | All PARKED 2026-11-11. D-034 (direct apply with undo) later realised through the connector, not the in-app advisor. | SUPERSEDED / PARKED | BD T-15..T-19, T-36; `contracts/advisor-tools.md` (56 KB) |
| Daily-use deck workbench brief (approved 2026-11-11) | 2026-11-11 | 2026-11-16 | Phase 1 skipped; Phase 2 Deck health built; Phases 3-6 "not started (brief section 18)". | PARTIAL; phases 3-6 reshaped by Picklist and connector | `briefs/daily-use-deck-advisor.md`; BD |
| Chat adds cards (confirm per card, Undo 24 h) | 2026-11-12 | 2026-11-12 | Merged; chat since paused (D-063). Migration `20261112120000_chat_card_proposals` applied. | FINISHED then PARKED with chat | BD 2026-11-12 update; `contracts/chat-add-cards.md` |
| Vector recommendation trial (V-01..V-22, BR-1) | 2026-11-04 | 2026-11-10 | NOT A GO 2026-11-09; closed and archived; hosted objects removed. | DROPPED, archived properly | `archive/vector-trial-2026-11/README.md`; BD |
| Card Kingdom pricing | 2026-09 | 2026-10-11 | D-040 removed. | DROPPED (D-035 text stale) | decisions.md D-035, D-040 |
| Missing and Graveyard concepts | 2026-09-29 | 2026-10-11 | Removed (T-38, D-028, D-029). | DROPPED, then partly reintroduced (Picklist Missing page) | BD T-38 |
| Brew Canvas (T-08, T-09, D-008..D-011) | 2026-06-30 | 2026-11-11 | PARKED, "Phase 9". Code already exists and is live in Workbench (free-form). | PARKED on paper, built in code | roadmap Phase 9; BD T-08, T-09 |
| Bulk actions (T-06, T-07) | 2026-09-25 | 2026-11-11 | PARKED. | PARKED | BD |
| Moxfield import (O-001) | 2026-09 | 2026-11-11 | O-001 "needs direct curl test"; D-054 already accepts Moxfield lists; BL "Check standalone Moxfield importing". | UNDECIDED, stale | decisions.md O-001, D-054 |
| Debrief / game log (O-004) | 2026-09 | 2026-11-16 | Open. CC-08 pulled part forward. `debrief-mode` code deleted earlier. | UNDECIDED | `.kiro/specs/SPEC-VALIDITY-AUDIT.md`; CC-08 |
| Backups and recovery | 2026-10-11 | 2026-11-22 | T-44 plan written, not approved; BL "revisit when core app works". | UNDECIDED | `contracts/recovery-plan.md` |
| Multi-user / sharing (O-002, Phase 10) | 2026-09 | 2026-11-17 | Parked. Second-account isolation test deferred as accepted risk. | PARKED | roadmap Phase 10; CC-06 |
| Sleeve/Unsleeved vs In deck/Planned | 2026-09-29 | 2026-11-17 | Renamed in app 2026-11-17. | FINISHED in app; decisions text not amended | WORDS-01 |
| Mobile, PWA, goldfish playtesting, card scanning, precon mod tracker | 2026-07 | 2026-08-12 | `.kiro` audit: goldfish never built; scanning, precon-mod-tracker, debrief cut. | DROPPED (old) | `.kiro/specs/SPEC-VALIDITY-AUDIT.md` |

---

## 2. Backlog contradictions

Short file = BL (`backlog.md`, updated line says 2026-11-22, committed 2026-11-26). Full file = BD (`backlog-details.md`).

1. **Deck health.** BL and BD: "Deck health work stays proposed, neither approved nor cancelled"; HC-01..HC-08 all PROPOSED. But HC-01 and HC-02 reports are DONE (2026-11-20), D-061 (locked 2026-11-20) is the approval of this very brief, the rail shows the six default ranges, and a deck health settings migration was applied 2026-11-21. [Confirmed: `reports/2026-11-20-developer-hc-01-default-ranges.md`, `-hc-02-category-plumbing.md`; D-061; BD HC rows]. HC-01 in BD says Game Plan "25 to 30"; D-061 says "no range, no verdict".
2. **Bigger Claude edits.** BL: "Partly built; the stored-data change is still awaiting approval." BD CC-13: applied and verified live 2026-11-17, code merged `cbc3753`. [Confirmed: BD CC-13].
3. **Card Tags (RQ-12).** BL and BD: "Not built", brief awaiting approval. Reports: Tags filled for every card, read-only Tags shown, collection Tag filter built, Claude can search by tag; commit 79ac34d "card-tags-display merged to main". [Confirmed: `reports/2026-11-20-developer-tags-fill.md`, `-card-tags-display.md`].
4. **Why and Keep.** BL: "awaiting your approval". Migrations for Why are in `supabase/migrations/` and a report is DONE. Keep: no build found. [Confirmed: migrations folder; `reports/2026-11-20-developer-card-tags-why-rarity.md`].
5. **CC-26 card roles and jobs.** BD: "PARTLY BUILT; proposed to be partly superseded, awaiting owner approval". D-063 (2026-11-19, "Owner-approved in chat") says dropped in principle; roles UI removed 2026-11-20 (c8a2ad7). BL: "a job per card is dropped" (consistent with D-063, not with BD).
6. **Collection screens.** BL "Click a card to open an editing window" (UX-02) and "Show where each card's copies are located" (UX-12) are listed as unfinished. The card details modal with a Collection context and a Copies tab shipped 2026-11-20 and is in neither backlog.
7. **Deck header, sidebar, Deck health footer.** BL and BD list UX-04, UX-11, UX-14 as open. DV-01 (BUILT) replaced the header, slot bar and footer.
8. **CC-16 and CC-17.** BL: "Approved; planning underway". No notes after 2026-11-17; drafts are unapplied. Reads as active; it is dormant (see section 4).
9. **"Dropped 2026-11-18" for CC-24** appears under "More Claude improvements" in BL but as a dropped item, mixed in with active ones.
10. **Statuses with no row at all** (built, in reports, in neither backlog): mana by turn chart, mana production, live refresh, card details modal, picklist simplification, type-line alignment, DFC front face, purple primary, mana colours, deck automatic status, Strategy autosave, Deck Intent removal. The BL says it is "unfinished work only", so absence is by design, but BD claims to be the full table.
11. **Dates.** BD says UX-03, 05, 09, 10 merged "2026-11-22". The commits are dated 2026-11-25 (0b471b1, 89430e0, 80a62fc, 57cd016); reports are dated 11-22 and 11-25. `0b471b1` is also described as "docs only" in the log but the BD row calls it the merge. Minor.
12. **BD phase headers.** "Phase 3 — Shared words (CURRENT, started 2026-10-12)" vs roadmap "PARKED 2026-11-02". "Only tasks in the current milestone may be started" is the file's second line and no longer holds. Two near-identical "Owner decision 2026-11-02" paragraphs repeat at the top.
13. **Pending correction in BD** says "decisions.md and AGENTS.md say get_collection_rollup is live; it is not". AGENTS.md was corrected (CC-03b removed it 2026-11-16). The BD note is stale. [Confirmed: AGENTS.md "Core data model"].
14. **TIDY-04.** BD: "DONE... local branches deleted". Local branches `cold-squid`, `fuzzy-quail`, `squalid-fish` exist (different ones); the five remote branches (`origin/brew-owner-fix`, `build-fix-route-export`, `cc04b-edits`, `cc04d-guide-switch`, `import-destination`) still exist on origin. BD says the remote copies were "not checked or touched". Consistent, but "stale branches deleted" overstates it.
15. **BL "Based on... 22 November"** while the BD header still carries 2026-11-02 and 2026-11-22 owner notes; and BL top has two "Updated" lines (22 Nov, 19 Nov).
16. **CC-13 text in BD** repeats "Code is NOT committed yet" after "DONE 2026-11-17 committed"; internal contradiction inside one row.
17. **CC-10 / CC-14 item 5.** BL: "Fill in missing card information... build started". BD CC-10: BACKLOG, "comes later". `cc14-backfill-ref-cards` script is prepared, not run.
18. **BD "Phase 2 — Card facts" says BUILT, waiting on checklist C-01..C-07**, while T-51 and T-52 (which block C-01..C-04) were PARKED 2026-11-11 and the owner checklist still shows four Fail lines (2026-10-13).
19. **BD "Open items" O-004 "Debrief / deck health — after M3".** M3 no longer exists (phases replaced milestones 2026-10-11), and deck health has been built.

---

## 3. Stale docs and mockups

Totals: sizes from `ls -l` / `du`. "Recommendation" is advice for the owner and Gene, not an action I took. Moving to `docs/oracle/archive/` keeps history in git either way.

### 3a. Describe things that no longer exist or never shipped

| Path | Size | What it describes | Recommendation |
|---|---|---|---|
| `contracts/card-roles-and-deck-jobs.md` + `.types.ts`, `specs/card-roles-and-deck-jobs.md`, `briefs/card-roles-and-deck-jobs.md`, `mockups/card-roles-and-deck-jobs.html` | 78+18+98+62+111 = ~370 KB | CC-26 jobs, strategy points, proposals bar. Dropped in principle by D-063. | Archive after owner approves CC-26 drop. Largest single block of dead design. |
| `contracts/deck-strategy.md` + `.types.ts` | 66+6 KB | Three-layer Strategy tab, D-060 Claude-set targets. Superseded by D-061/D-062/D-063. | Archive. |
| `supabase/drafts/20261118120*_roles_db*`, `..140*_roles_db6*` | 12 files | DB-1..DB-6 roles drafts. BD says DB-1..5 applied live and empty; draft headers say NOT APPLIED. | Do not delete until owner approves a separate cleanup (D-063 says the empty tables stay until then). Record applied state. |
| `.kiro/specs/*` (48 folders, 2.1 MB) | 2.1 MB | Pre-October feature specs. 5 marked superseded by an audit on 2026-08-12 that was never acted on (debrief-mode, goldfish-playtesting, precon-mod-tracker, card-scanning, card-allocation-workflow). `deck-lifecycle-overhaul` described Brewing/In Rotation/Graveyard; Graveyard was removed in T-38. | Archive whole folder or at least the five superseded; the docs README still points readers there for "earlier intent". |
| `.kiro/specs/CODE-CLEANUP-AUDIT.md`, `tech-debt-register.md` | small | Dated 2026-08-12 and 2026-09-14 (132 uncommitted deletions, 39 debt items). | Archive; tech-debt register may hold items still true (TD-037 RLS). Re-read before deleting. |
| `docs/oracle/plans/01-behaviour-and-actions.md`, `02-components-and-screens.md`, `03-loading-performance.md` | 11+12+10 KB | 2026-09-29 owner-review plans: "No mockups or app changes have been made yet". Content later locked as D-025..D-033 and T-27 loading work. README still lists them as "current". | Archive; README link fix. |
| `plans/2026-11-19-deck-page-tags-slice-plan.md` | 10 KB | Slice plan "awaiting owner approval". Most slices then built. | Archive after close-out. |
| `handoffs/t22-architect.md`, `t22-frontend.md` | 4+4 KB | T-22 reconciliation handoffs (2026-09-26), work done. | Archive or delete. Only 2 files in folder. |
| `mockups/import-dropdowns-wireframe.html`, `import-no-switch-wireframe.html`, `import-simplified-wireframe.html`, `import-scenarios.html`, `import-intent.html`, `import-row-editing.html`, `import-stage-screens.html`, `import-review-controls.html`, `import-reconciliation-redesign.html`, `import-modal-redesign.html` | ~250 KB total | Ten iterations of the import screen between 2026-09-26 and 2026-11-04; the notes say import was rebuilt six-plus times. Only `manabox-import.html` and the latest modal redesign reflect the live design, and I could not confirm which. | Keep the one the app matches; archive the rest. Needs a code-side check. |
| matching `specs/import-*.md` (intent, modal-redesign, reconciliation-redesign(+requirements), review-controls, row-editing, stage-screens) | ~120 KB | Same family. | Same. |
| matching `contracts/import-intent.md`, `import-row-editing.md`, `import-reconciliation-redesign.md` (+ `.types.ts`) | ~210 KB | Same family; intent contract needed two DB changes "behind a flag". | Same. `import-reconciliation-states.md` (7 KB) is cited as the owner-approved table, check before archiving. |
| `mockups/scan-wins-review.html`, report 2026-11-03 | 22 KB | Mockup "ready for owner approval", no code. | Park (see section 4). |
| `mockups/left-to-right-layout-wireframe.html`, `-v1.png` | 5 + 74 KB | **Untracked** (created 2026-11-25 15:01, not in git). Only reference: a mention in `specs/know-where-cards-are.md`. | Owner decides: commit, keep outside repo, or delete. |
| `mockups/deck-rail-cards-health-options.html` + `.png` | 13 + 395 KB | Option board for the rail; the Figma design replaced it. | Archive; the 395 KB png is the single biggest mockup file. |
| `mockups/whats-missing.html`, `specs/whats-missing.md`, `contracts/deck-health-phase2.md` | 31+16+31 KB | Deck health Phase 2 design; replaced by rail tiles (FEAT-003, HC-01). | Archive after owner agrees. |
| `contracts/advisor-tools.md`/`.types.ts`/`.examples.ts`, `chat-add-cards.md`, `ai-audit-2026-09.md`, `ai-recommendations-assessment-2026-09.md`, `jev-research-2026-09.md`, `allocation-resolver-validation-2026-09.md`, `owner-decision-pack-2026-09.md`, `audit-2026-09.md` | ~350 KB | In-app advisor, Jev vendor, resolver validation: all PARKED or historical (T-15..T-19 PARKED 2026-11-11; chat paused D-063). | Archive as a group; keep the decision pack if D-001..D-007 provenance matters. |
| `contracts/collection-loading-solutions.md` | 45 KB | T-27 loading solutions, only F1/F2/B1 built. | Keep until T-27 decision; otherwise archive. |
| `contracts/card-tagging-pipeline.md` | 43 KB | Proposed; part built (tags fill). AI pass unapproved. | Keep (still live). |
| `specs/know-where-cards-are.md`, `contracts/know-where-cards-are.md`+types, `mockups/know-where-cards-are.html` | 59+83+14+88 KB | Picklist design; mostly built, some slices (Turned up on Missing etc.) built later. "Draft for owner review" headers never updated. | Keep; update status headers. |
| `specs/reconcile-original-shortages.md`, `mockups/reconcile-original-shortages.html` | 23+32 KB | T-29 design, PARKED. | Keep as parked or archive; owner decides whether to revive. |
| `specs/vocabulary.md`, `mockups/vocabulary.html` | 46+32 KB | Locked vocabulary (D-043) but uses Sleeved/Unsleeved, since renamed In deck/Planned. | Keep; update words. |
| `specs/card-management-system-overview.md` | 22 KB | 2026-10-11 current-state overview; section 5.4 says Break down is available (it is not, O-010). | Keep, fix. |
| `specs/deck-commander-selector.md`, `deck-basics-and-printings.md` + mockups | 5+6+16+13 KB | 2026-10-21 designs; commander section built 2026-11-02. | Keep or archive; low value either way. |
| `docs/COMPETITIVE-AUDIT-FINDINGS.md`, `competitive-audit-research.md`, `competitive-positioning.md`, `feature-matrix.md` | 16+20+16+12 KB | 2026-09-15 competitor material; each file already carries a "historical, do not use" banner. | Archive (they say so themselves). |
| `docs/roadmap.md`, `docs/roadmap-foundations-first.md`, `docs/roadmap/*` (8 files) | 8+16+~28 KB | Historical idea inventories; `roadmap.md` last updated 2026-07-27. | Archive. |
| `docs/user-guide.md` | 16 KB | Last updated 2026-07-26; old terminology. | Archive or rewrite. |
| `docs/card-movement-reference.md` | 16 KB | Code reading of 2026-07-16. | Archive. |
| `docs/audits/collection-migration-readiness-2026-09-03.md`, `docs/sessions/2026-09-28-summary.md`, `docs/design/*` (2 files) | 24+4+20 KB | Old audits, summaries and design notes. | Archive. `docs/design/hybrid-category-system.md` is superseded by HC-01..HC-02 [Approximate]. |
| `docs/category-taxonomy.md`, `deck-taxonomy.md`, `edhrec-sync.md`, `insight-schema.md` | 32+12+8+12 KB | Domain references; taxonomy is still referenced by RQ-02 and the tags pipeline. | Keep. Taxonomy needs the RQ-02 clean-up. |
| `oracle/test-protocol-import.md`, `test-log-import.md` | 18+5 KB | Marked "Paused 2026-11-11, not the current test plan". Log stops at stage 4, "Deck import: links" failed. | Archive. |
| `oracle/test-burst-1-2026-11-18.md`, `test-plan-2026-11-17.md` | 3+22 KB | Owner test lists; test plan is TEST-01, still TODO. | Keep the plan; archive the burst. |
| `oracle/owner-checklist.md` | 4.5 KB | Four Fail lines since 2026-10-13, "Try next" list stale. | Keep; Gene to refresh or retire. |
| `oracle/parity-log.md` | 0.3 KB | Empty. Nothing was ever logged. | Keep or drop (roadmap says "no parity target" and says the owner would log from Phase 8). |
| `oracle/drafts-gate5-claude-connector.md` | 6 KB | Marked APPLIED 2026-11-17; one open step (click-through). | Keep until click-through; then archive. |
| `oracle/archive/vector-trial-2026-11/` | 744 KB | Properly archived trial. | Keep as is. |
| `oracle/reports/evidence/` | **25 MB** | Screenshots and JSON: card-details-modal, deck-rail-redesign, `2026-11-21-developer-purple-primary` (5 MB), etc. 75% of the reports folder. | Candidate to trim or move out of git; owner approval. |
| `oracle/reports/2026-09-29-feature-document-inventory.csv`, 2026-10-02 card tagging CSV | ~100 KB | One-off inventories. | Archive. |
| Duplicate report filename `2026-11-21-developer-purple-primary` (a file and a folder) | n/a | Name collision. | Tidy. |
| Report folder in general | 393 files | Task-level history; no `Status` lines for some orchestrator-era files. | Do not delete. Consider yearly archive folders. |
| `.agents/tasks/*` (about 40 folders, 4+ MB; `figma-gap-check` 2.6 MB, `card-details-speed` 1.1 MB) | ~5 MB | Per-task plans, reviews, JSON. **Untracked** in git (only `.agents/project` is tracked). | Owner decides whether to track or clear. Some hold the only copy of owner direction text (e.g. `categories-health/owner-direction.md`, `planning-round-2026-11-19/owner-direction.md`); do not delete before the owner confirms they are copied. |

### 3b. Docs that conflict with each other (not obsolete, but need a fix)

- `docs/README.md` says "Why a feature was designed this way: ... `.kiro/specs/<feature>/`" and lists `plans/` as "current owner-review plans". Both are out of date [Confirmed: `docs/README.md`].
- AGENTS.md role names (Gene, Designer, Developer, Tester, Scribe) vs older reports (Orchestrator, UX/UI, Backend, Frontend). AGENTS.md says so itself.
- AGENTS.md "Hosted on Vercel" vs roadmap "No Vercel for now (2026-10-11)". The connector brief (2026-11-16) says "hosted and login-protected", and BD shows `.vercel/` and a connector re-enable; roadmap rule not updated.

---

## 4. Started and left

Dated by the notes. "Last activity" is the last dated mention I found.

| Item | Started | Last activity | Where it stands | Recommendation |
|---|---|---|---|---|
| Workbench curve and piled layouts | 2026-06-30 | 2026-08-19 | Hidden by commit, code still shipped (about 17 KB across 6 files) | **Drop** (remove the code) if owner confirms |
| CC-26 card roles and deck jobs | 2026-11-18 | 2026-11-20 | Slices 1 and 2 built then removed; DB-1..DB-5 tables exist empty (per BD); DB-6 draft not applied; 5 large docs | **Drop**; archive docs; DB cleanup a separate approval (D-063) |
| CC-16 Claude runs Picklist and storage | 2026-11-17 | 2026-11-17 | Approved; draft SQL unapplied; no brief, report or code since | Finish or park; owner decides priority (BL says "planning underway") |
| CC-17 Claude imports a deck | 2026-11-17 | 2026-11-17 | Same | Same |
| Wishlist (CC-18 part 2) | 2026-11-17 | 2026-11-17 | Draft `...cc18_wishlist.draft.sql`, not built | Park |
| CC-25 Trade binder type | 2026-11-18 | 2026-11-18 | Code done, DB draft unapplied | Finish (small) or drop; owner |
| CC-14 card data backfill | 2026-11-18 | 2026-11-18 | Script and rollback prepared; needs approval; 100 cards still without facts | Finish (needs one approval) |
| CC-20 "In your hand" refusal wording | 2026-11-17 | 2026-11-17 | Proposed; CC-13 applied same day | Drop or fold into next SQL change |
| CC-08 game logging | 2026-11-16 | 2026-11-17 | Approved, last in order | Park |
| Health HC-03..HC-08 (stored categories, ranges, Claude side, dead code removal) | 2026-11-20 | 2026-11-21 | HC-01/02 built, rest "PROPOSED"; a "settings" migration applied | Owner decides; BD must be corrected first |
| RQ-02, RQ-03, RQ-04, RQ-05, RQ-06, RQ-07, RQ-08, RQ-09, RQ-11 | 2026-11-16 | 2026-11-19 | PROPOSED, no briefs. RQ-07 (fill in strategy and bracket for 18 decks) needs the owner's own content; RQ-04 largely replaced by Why/Keep. | Park all; drop RQ-04 |
| Tag list approval, Scryfall tag refresh, AI pass (RQ-12) | 2026-11-19 | 2026-11-20 | Brief awaiting approval; a rough $30-60 AI cost estimate recorded | Owner decides |
| Keep flag on cards | 2026-11-19 | 2026-11-20 | Not found built | Owner decides with Tags approval |
| Strategy window "S3/S4/S5" drafts | 2026-11-19 | 2026-11-20 | S5 applied live 2026-11-20 per D-062; S3 and S4 BD says not verified; files remain in `supabase/drafts` | Record applied state (read-only DB check; owner-approved) |
| Import deck with sources ("scan wins") | 2026-11-03 | 2026-11-04 | Mockup "ready for approval"; later modal redesign says "Saving is still switched off" | Owner decides; verify whether save path exists in code |
| Import cleanup slices 6, 7 and Precon P1 | 2026-10-23 | 2026-10-23 | `src/app/onboarding` and precon API still present | Finish or drop; code agents confirm |
| T-58 CSV with no Scryfall ID | 2026-10-23 | 2026-11-11 | Parked | Fresh check or drop |
| T-51, T-52 value banner, Add proxy unowned (C-01..C-04) | 2026-10-13 | 2026-11-11 | Parked; owner checklist shows Fail | Recheck once; BL says "fresh check" |
| T-37, T-29, T-30 Reconcile as original-copy shortage view | 2026-10-10 | 2026-11-11 | D-037 locked, spec/mockup exist, build parked | Owner decides revive or lock-release |
| O-010 Break down button | 2026-09-29 | 2026-09-29 | Route exists; nothing mounted | Owner decides |
| T-26 shared badges and states (V0..V12) | 2026-10-12 | 2026-10-12 | V0 and V3 built; rest parked | Park |
| Category management and Suggested categories (briefs) | 2026-11-16 | 2026-11-16 | Two DRAFT briefs; HC-02 and custom categories partly cover | Drop or fold into HC |
| Bracket check (RQ-14) and bracket warning "built but hidden" | 2026-11-19 | 2026-11-19 | Warning hidden until Oracle... [truncated in my read] | Owner decides |
| Option B faster deck opening | 2026-11-22 | 2026-11-25 | Not built, "later choice" | Park |
| Deck reorder polish | 2026-11-22 | 2026-11-25 | Not built | Park |
| Card details modal: region/speed decision | 2026-11-20 | 2026-11-20 | Report asks owner whether to move the site region (Washington DC vs Singapore DB); no answer found | Owner decides |
| Mana colours: Black colour question and narrow width question | 2026-11-21 | 2026-11-21 | Open owner questions in commit messages e214ee3 | Owner decides |
| TEST-01, TEST-02 click-throughs | 2026-11-17 | 2026-11-17 | Never recorded | Owner; BL has "Test and finish recent work" |
| `docs/oracle/parity-log.md` | 2026-10-11 | 2026-10-11 | Empty | Drop or keep |
| `docs/oracle/specs/deck-commander-selector.md`, `deck-basics-and-printings.md` (Gate 3 designs, 2026-10-21) | 2026-10-21 | 2026-10-21 | Status headers missing; commander picker built 2026-11-02 | Mark done |
| Backups | 2026-10-11 | 2026-10-11 | Plan unapproved | Owner decides |
| Left-to-right layout wireframe | 2026-11-25 | 2026-11-25 | Untracked, no note | Owner decides |

---

## 5. Decisions drift (report only; decisions.md not edited)

1. **D-002 vs D-059 vs what shipped.** D-002 = Draft/Assembling/Playable. D-059 (2026-11-02) replaces it with Unowned cards/Assembling/Playable plus a global "Use proxies" toggle; BD says "not started". The app shipped Brewing/Assembling/Playable with an automatic status and no Active flag (3881ac7, b637d79, 2026-11-18). CC-12 notes "the app does not yet show Unowned cards as a deck status". D-002 and D-059 both stale. [Confirmed: BD CC-12; reports 2026-11-18].
2. **D-025, D-031, D-033, D-043 use "Sleeved/Unsleeved".** The app says In deck/Planned since 2026-11-17 (WORDS-01). Amendment needs owner approval (WORDS-02); not recorded.
3. **D-028 (retire Missing) vs Picklist.** T-38 removed Missing 2026-10-11. Then 2026-11-12 to 11-16 the Picklist work added In your hand and Missing pages, a Missing supply rule, and CC-15..CC-18 owner answers mention clearing a card's Missing flag. Either D-028 is out of date or the Picklist reintroduced it [Confirmed: BD "Picklist slices 2 to 4"; D-028].
4. **D-034a numbers.** Says big edits (more than about 10 cards) and card moves wait for owner approval. CC-13 (owner approved 2026-11-17) set 120 direct, 200 hard cap, 500/hour, and moves go straight through with Undo. BD says "Gene records an amendment after owner approval". decisions.md still has the 10-card rule. Also CC-15 narrow delete (undo of a deck Claude created removes an empty deck) contradicts "Claude can never delete a deck"; Gene "to record". Not recorded.
5. **D-035 vs D-040.** D-035 says Card Kingdom "deferred"; D-040 says removed. D-035 not marked amended.
6. **D-060.** Marked "replaced in part by D-061" in text. Per the conflict list it should be fully superseded; D-061 keeps "Claude proposes, owner confirms". Wording is loose but consistent with the list; the Strategy "Notes add dated paragraphs" rule is also replaced by D-062 [Confirmed: D-060..D-063].
7. **D-063** says the CC-26 plan is dropped "in principle" and its empty tables stay until a separate cleanup. Nothing was scheduled to do that cleanup, and BD still shows CC-26 as undecided.
8. **D-008..D-011 Brew Canvas** (locked) and D-017 (category vs curve warnings, never verified: audit says "Can't tell"). The in-app brew/chat is paused (D-063). The Canvas exists only as the Workbench free-form canvas. The curve/piled modes in D-008 era code are dormant.
9. **Open items out of date:** O-001 (Moxfield "needs curl test") while D-054 accepts Moxfield lists; O-003 and O-004 appear in both decisions.md and BD with different "after M3" wording and M3 no longer exists; O-004 partly pulled forward as CC-08.
10. **Roadmap vs decisions.** Roadmap scope rule "Local app, no Vercel; do not use Vercel through Phase 7" vs D-034a (connector is hosted and login-protected, approved 2026-11-16) and AGENTS.md "Hosted on Vercel". Roadmap also names Phase 2 "BUILT awaiting C-01..C-07" and "Use what I own" as CURRENT; neither is where the work has been for three weeks. Roadmap file untouched since 2026-11-02 [Confirmed: roadmap.md].
11. **D-043** locks the vocabulary spec; spec still says Sleeved. And D-053 says "Proxy is blue"; D-043 says teal; both locked.
12. **D-057, D-058** fine; D-055 amends D-045/D-019 but D-019 still reads "not automatically honoured" in the register without a pointer on D-019 itself [Approximate].
13. **AGENTS.md** says decisions.md edit is Orchestrator-only; role renamed to Gene in October; fine. It also says the old `get_collection_rollup` was removed 2026-11-16 (CC-03b); the BD "pending correction" line is stale.

---

## 6. Branches and stale worktrees

All of these are **fully merged into main** (0 commits ahead). Deletion is the owner's call; I recommend, I did not touch them.

| Branch | Tip | Last activity | Holds | Safe to delete? |
|---|---|---|---|---|
| local `cold-squid` | e6cc699 | 2026-11-17 | Same commit as the other two: "Wording: Sleeved -> In deck, Unsleeved -> Planned". Already in main. 177 commits behind. | Yes (recommend) |
| local `fuzzy-quail` | e6cc699 | 2026-11-17 | Same | Yes |
| local `squalid-fish` | e6cc699 | 2026-11-17 | Same | Yes |
| `origin/brew-owner-fix` | 78b4c84 | 2026-11-16 | "Brew sessions: filter every read/update/delete by signed-in user". In main. 240 behind. | Yes (remote delete needs owner approval) |
| `origin/build-fix-route-export` | da057bb | 2026-11-16 | "Move refresh-prices helpers out of route file". In main. | Yes |
| `origin/cc04b-edits` | 5b16520 | 2026-11-16 | CC-04b reports. In main. | Yes |
| `origin/cc04d-guide-switch` | 652265b | 2026-11-16 | "Batch Scryfall id lookups". In main. | Yes |
| `origin/import-destination` | 6236b9f | 2026-11-16 | "Data separation: record CC-03 live apply... undo scripts". In main. | Yes |
| `origin/main` | 89430e0 | 2026-11-25 | 5 docs commits behind local main | Keep; owner decides when to push |
| local `main` | 127e472 | 2026-11-26 | 5 docs-only commits unpushed (c3531b8, b7164ec, 6031b50, ab1dd54, 127e472) | Keep |

Also found:
- **38 hidden refs** that `git branch -a` does not list: 17 under `refs/cline/checkpoints/*` (4 sessions, 2026-09-18 to 09-23) and 21 under `refs/copilot/checkpoints/*` (3 sessions, 2026-11-10), plus `refs/original/refs`. None is an ancestor of main (all 38 "not in main"). They are snapshots by editor/AI tools. Not owned by the app. Safe to delete if the owner no longer wants those snapshots; they may hold uncommitted work from Sept and early Nov [Approximate: I did not diff them].
- `.git` is 204 MB.
- **Worktrees:** only the main one is registered. `.worktrees/` is empty. BD mentions many deleted worktrees (T-55, T-56, T-57, vector trial); all gone. [Confirmed: `git worktree list`].
- `import/review-polish`, `trial/*`, `cc04a-connector`, `t55..t57` branches named in BD are not present anywhere. BD says T-57's migration lived on `t57-deck-import-foil`; no such branch exists now, and the migration was "never applied, dropped".
- **Commit messages with remove/revert/park/drop** (full list is in `git log --all -i --grep=...`): the main ones are 631cfc5 (T-38 remove Missing and Graveyard), c980283, 0853af1, 9c42cec (import cleanup slices 1, 2, 4), 42cf497 (July: 34 dead files), 5d3563a (2026-11-11 unused import helpers), c8a2ad7 (card window replaced, roles UI removed), 89d2fc0 (old header/slot bar/footer removed), d1aa5d4 (Deck Intent removed), aff8ac3 and e214ee3 (reverts of unrequested palette changes), 085e7bd (drop CC-24), 33aae5a (mark slice A superseded), ee2108a (broken sync cron removed). Only two commits are real reverts: aff8ac3 and e214ee3 (the same palette change). Two other "revert" hits (7d0fce9, c179086) are not reverts. The main-line list was cut at 80 lines when I first ran it, so smaller remove/drop commits may be missing.

---

## 7. Open points (marked open, not decided)

1. **Removals the owner must approve:** the Workbench curve and piled modes and their code; CC-26 docs and the empty roles tables; the import-iteration mockups/specs/contracts; `.kiro/specs`; competitor and old roadmap docs; `reports/evidence` (25 MB); stale branches and hidden checkpoint refs; the untracked wireframe files; whether `.agents/tasks` should be tracked.
2. **Parked features: revive or drop?** Reconcile as original-copy shortage view (D-037); Break down button; bulk actions; Brew Canvas; in-app chat; Phase 9 extras; game logging (CC-08); wishlist; mana curve slider (O-003); sideboard (UX-16); CC-16 and CC-17.
3. **Approvals still waiting:** RQ-12 brief (Tags list, Scryfall refresh, AI pass cost), Keep flag, HC-03..HC-08, CC-14 data backfill script, CC-25 trade binder DB change, the DB drafts for CC-16/17/18, record the applied state of S3/S4/S5 and the roles DB-1..5 files.
4. **Decisions.md updates the owner may want** (Gene records only after approval): the items in section 5.
5. **Hosted migration-history mismatch:** CC-03c, CC-03d and the connector sign-in migrations are not listed on the hosted database although applied. Owner decided 2026-11-22 to leave this alone. Do not repair. [Confirmed: BD TIDY-03].
6. **Owner questions already open in notes:** Black mana colour (app-wide token), narrow-width layout, whether the site region should move (card details speed), which POLISH-01 spacing items to fix, what to build next (BL "Next priority: open question").
7. **Backlog files:** whether BD should be corrected by Gene to match the reports (section 2) before any removal decisions are based on it.

---

## 8. Could not verify

- I did not read all 393 reports in full. I read titles, "Status" and "Summary for the owner" blocks for about 60 of them, and filenames for all. Items marked `[Approximate]` rest on that.
- Large specs, contracts and mockups (card-roles, know-where-cards-are, import family) were checked by header and size, not line by line.
- I did not run the app, a browser, or any database query. Whether S3/S4/S5, roles DB-1..5, tags fill, CC-16/17/18 and CC-25 drafts are applied on the hosted database is **not verified** by me; statements about them are from the notes only. `supabase/migrations/` holds applied files; `supabase/drafts/` holds files whose real state the notes disagree about.
- Whether the Workbench toolbar is also hidden when `DeckCanvas` is used by `BrewCanvas` and `DeckChatTab` was not checked.
- Whether the import deck save path (other-deck sources, "Saving is still switched off" 2026-11-04) is on or off today. The notes after 2026-11-13 only describe import destination.
- Whether `src/app/onboarding`, the Precon API and the Explore page are used; code areas cover that.
- The hidden checkpoint refs (cline, copilot) were counted but not diffed.
- `.kiro/specs` contents were audited from the 2026-08-12 audit file, not re-verified against code.
- Bracket warning wording in the Strategy window report was cut in my read; the "hidden until Oracle..." phrase is quoted from a truncated line.
- Dates for "first mention" come from filenames and status text; some features were discussed in chat earlier than any note.
- The owner's chat statement that the curve view was "not that useful" appears in no note; the only record is the 2026-08-19 commit message about a clean canvas. Whether the cause was usefulness or a general simplification is the owner's to say.
