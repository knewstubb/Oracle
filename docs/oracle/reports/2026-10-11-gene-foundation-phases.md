# Report: foundation-first phases
Role: Gene
Status: DONE
Task as received: "Thank you for that work. What i have realised is that I have gotten too far ahead of myself with features without building a solid foundation. Looking at what we have at the moment can you break this down into the phases in the order that I should have worked on them so i can start fixion things from the ground up."

## Summary for the owner
Below are ten phases, from the ground up, with an honest note on where today's app stands in each. The base layer is sound: each card you own is in exactly one place, and moves can't lose a card halfway. The layers above it are shaky. The safety checks are broken, the same thing is worded differently on different screens, and several features were built before the things they rely on. Recommendation: pause the AI advisor and extras, then fix from Phase 1 upwards. Nothing is deleted. Changing the roadmap needs your approval.

## The phases, in build order

Each phase depends on the ones above it. "Today" describes the current main build.

### Phase 1 — Safety net
**What it is:** automatic checks that catch problems before you see them, plus a way to get your data back if something goes wrong.
**Done when:** every check passes and runs on every change. Hidden errors are no longer ignored. Tests never touch your real data. There is a backup you could restore from.
**Today: shaky.** 134 of about 1,560 automatic checks fail. Many test older versions of screens, so a real break can hide among them. The build also hides 141 errors on purpose. A collection export exists, but it is not a full backup: it does not record which card is in which deck or box.

### Phase 2 — Card facts
**What it is:** the card library: every card, its printings, finishes (nonfoil, foil, etched) and prices.
**Done when:** every card on every screen is the right printing and finish. Prices are clearly labelled estimates, and an unknown price never shows as zero.
**Today: mostly solid.** The rules are agreed and mostly followed. Gaps: prices are moving to Scryfall estimates and the old Card Kingdom feed is half-removed. Making a proxy picks the first printing found instead of the one the deck asks for.

### Phase 3 — Shared words and building blocks
**What it is:** one agreed word, colour and badge for each fact, used everywhere. It also covers shared loading, empty and error states.
**Done when:** the same fact looks and reads the same on every screen. A failed lookup never pretends to be an answer.
**Today: shaky.** You agreed the words, but the screens don't use them yet. One example: an empty deck slot shows "Planned · In decks" on one screen and "Planned · Claimed" on another. Proxy appears in three different colours. If a lookup fails, the screen can show the card as "Unowned".

### Phase 4 — Your collection and storage
**What it is:** each physical card you own, and the box or binder it is stored in. You can add, edit, remove, search and filter them.
**Done when:** one screen shows your cards, and every filter changes what you see. Adding or removing cards is simple, and loading is quick.
**Today: works, with cracks.** Two screens, Collection and Card Management, do the same job in different ways. The status filter on Collection looks active but doesn't change the results. Missing is still visible; its removal is done and waiting for my review. Loading was partly sped up earlier this month.

### Phase 5 — Getting cards in (import)
**What it is:** bringing your collection and decks in from Archidekt, CSV and Moxfield, and re-importing later.
**Done when:** every import route behaves the same way and keeps finishes. Each route shows conflicts before saving and is safe to repeat.
**Today: works, but routes differ.** First-time setup has the full conflict screen, but adding a deck later has none. An older conflict screen still exists alongside the newer one. Importing from Archidekt during setup loses etched finishes. Nobody has checked what "Replace collection" does to cards that are sleeved in decks. Sending decks back to Archidekt is switched off.

### Phase 6 — Deck lists
**What it is:** the deck itself: its cards, commander, format, Maybeboard, folders and whether it is a complete list.
**Done when:** each deck clearly shows Draft, Assembling or Playable under the rules you agreed, including Casual. Card legality is honest about what it doesn't know.
**Today: lists work; status doesn't match the agreed rules.** Decks still show active/inactive, "Brewing" and green/amber/red health colours instead of Draft, Assembling and Playable.

### Phase 7 — Putting real cards into decks
**What it is:** the physical side of decks: sleeving cards from storage, moving them between decks and making proxies. It also covers the pick list (where to find each card), breaking a deck down and the Reconcile shortage view.
**Done when:** the pick list says exactly where each card is, and Sleeve, Move and Proxy mean the same thing everywhere. Reconcile shows where you are short of originals.
**Today: the core is solid; the screens are not finished.** The one-card-one-place rule holds. The pick list doesn't show storage locations properly. Several deck tools are hidden on phones. Reconcile still uses the old rule; the new design is ready for your review.

### Phase 8 — AI advisor
**What it is:** asking "how do I improve this deck?" and getting real, correctly identified cards. They are split into owned and free, in another deck, and to buy. Changes it makes can be undone.
**Done when:** for three real decks, every suggestion is a real card in the right printing, the labels are right, and every change can be undone.
**Today: built ahead of its foundations.** Chat, upgrade suggestions and brewing exist. Suggestions are not checked against real cards, and changes apply with no undo. It relies on Phases 2–7 being right: if the collection data is wrong, the advice is wrong too.

### Phase 9 — Extras
**What it is:** the Brew Canvas (drag-and-drop deck building), bulk actions, deck ratings, explore, game-night views, buy lists and similar.
**Done when:** each one is chosen because of real friction you hit, and built on the finished phases below it.
**Today: partly built early.** Canvas, ratings and brewing pieces exist, and a good share of the failing checks are in them. These are not to be deleted, just left alone until their turn.

### Phase 10 — Sharing with other players
**What it is:** letting other people sign up and use Oracle.
**Today: not started, which is correct.** Each person's data is already kept separate, so this isn't blocked later.

## Recommendation
1. **Pause Phases 8–9.** Leave them as they are; don't delete them. The AI advisor stops being the current focus.
2. **Start Phase 1.** Make the checks trustworthy, stop hiding errors and confirm a backup. Without this, every later fix risks breaking something unseen.
3. **Then work down the list.** Phases 2 and 3 can overlap. Each later phase starts when the one before it is approved.

How yesterday's four returned jobs fit:
| Job | Phase | Suggested next step |
|---|---|---|
| Fix the random test | 1 | Review now |
| Remove Missing and Graveyard | 4 | Review now; bring in when Phase 4 starts or straight away |
| Reconcile design | 7 | Keep for your review when Phase 7 starts |
| Advisor plan update | 8 | Keep; park with Phase 8 |

The designer's new "How Oracle manages cards today" guide is also waiting with the Reconcile design. It is a good map for Phases 4–7.

## Changed files
- docs/oracle/reports/2026-10-11-gene-foundation-phases.md — this proposal

## New decisions made (need owner confirmation)
- Proposed replacement of the M1–M5 roadmap with the ten phases above. M2 (AI advisor) would no longer be current, and Phase 1 would be. This is a milestone change and needs owner sign-off; roadmap.md is unchanged until then.

## Assumptions
- Phases reuse existing work. Each phase ends with a clear "done when" exit test, in the same way as the old milestones.
- Locked decisions D-001 to D-039 stay as they are. Only the order of work changes.

## Challenges to locked decisions
- none. The roadmap's "Why Oracle exists" still holds; the advisor remains the goal, built last on solid data.

## Open questions
- Approve the ten-phase order as the new roadmap?
- Should the four returned jobs be reviewed now (recommended for the random-test fix and Missing removal) or held?

## Evidence (for agents)
- `npx vitest --run` on main at d4e4b2b: 34 failed / 97 passed files; 134 failed / 1424 passed tests. The common causes are stale Supabase mocks (`.eq(...).eq is not a function`, `supabase.rpc is not a function`, `.range is not a function`), a missing `importDeckAddNewCards`, and a missing `db/migrations` folder in migration-020.test.ts. The largest failing files are PersistentHeader, DraftDeckTile, migration-020, new-deck page, csv-import, deck-import-integration and brew/commit.
- `npx tsc --noEmit`: 141 errors. The top files are deck-normalizer.test.ts (16), mana-analysis.ts (12), new-deck/page.tsx (10) and StatusChipPopover.tsx (9). `next.config.ts` sets `ignoreBuildErrors: true`.
- `npx eslint .`: 588 problems (270 errors, 318 warnings).
- E2E specs exist in tests/e2e (card-management, card-movement, smoke); they were not run here.
- Current-state gaps: designer overview `docs/oracle/specs/card-management-system-overview.md` §9–10 (in worktree task-t29-reconcile-shortage-spec, not yet in main).
- Capability groupings: `docs/oracle/reports/2026-09-29-orchestrator-feature-portfolio-audit.md` §3 (F01–F21 foundation, F22–F30 advisor).
- Returned agents (all report DONE, not yet reviewed): T-39 aee61e96, T-38 e43f82dd, T-29 37d94a68, T-36 bed535bb.

## Verification
- Test, type and lint commands above were run on main at d4e4b2b; results are as quoted.
